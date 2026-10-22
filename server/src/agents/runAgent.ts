import { mkdir } from 'node:fs/promises';
import { query, type McpServerConfig, type Query, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { TokenUsage } from '../../../shared/events.ts';
import { PRICES } from '../config.ts';
import { world } from '../world.ts';

export interface RunAgentOptions {
  agentId: string;
  model: string;
  systemPrompt: string;
  prompt: string;
  mcpServers?: Record<string, McpServerConfig>;
  /** Built-in tools to enable. Default none. `ToolSearch` is needed to reach deferred claude.ai connectors. */
  builtinTools?: string[];
  /**
   * Exact tool names allowed beyond our own MCP servers (e.g. read-only claude.ai connector tools).
   * Everything else is denied: claude.ai connectors (Gmail, Slack, Drive...) reach every SDK session.
   */
  extraAllowedTools?: string[];
  /** Tool patterns denied even if an allow rule matches, e.g. `Bash(sf org delete:*)`. */
  disallowedTools?: string[];
  /**
   * claude.ai connectors connect asynchronously. If the first turn starts before they do, the model gets
   * no deferred tools and not even ToolSearch. Hold the prompt until these servers report `connected`.
   */
  waitForMcpServers?: string[];
  maxTurns?: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  cwd?: string;
  abortController?: AbortController;
  /** Called with short human-readable descriptions of what the agent is doing. */
  onActivity?: (activity: string) => void;
}

export interface RunAgentResult {
  text: string;
  isError: boolean;
}

interface MessageUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

const ACTIVITY_LABELS: Record<string, string> = {
  browser_navigate: '🌐 Navigating',
  browser_navigate_back: '↩️ Going back',
  browser_click: '🖱️ Clicking',
  browser_type: '⌨️ Typing',
  browser_fill_form: '📝 Filling a form',
  browser_snapshot: '👀 Reading the page',
  browser_take_screenshot: '📸 Screenshot',
  browser_select_option: '🔽 Selecting',
  browser_hover: '🫳 Hovering',
  browser_press_key: '⌨️ Key press',
  browser_wait_for: '⏳ Waiting',
  browser_console_messages: '🧾 Reading console',
  browser_network_requests: '📡 Checking network',
  browser_resize: '📱 Resizing viewport',
  browser_evaluate: '🧪 Evaluating JS',
  browser_tabs: '🗂️ Tabs',
};

/** `mcp__playwright__browser_click` -> `🖱️ Click`. */
export function describeTool(name: string): string {
  if (name === 'mcp__salesforce__salesforce_cli') return '☁️ Salesforce CLI';
  if (name === 'ToolSearch') return '🔎 Looking for a tool';
  if (name.startsWith('mcp__claude_ai_Google_Sheets__')) return '📊 Reading the spreadsheet';
  const short = name.split('__').pop() ?? name;
  return ACTIVITY_LABELS[short] ?? `🔧 ${short.replaceAll('_', ' ')}`;
}

const CONNECT_TIMEOUT_MS = 20_000;

/** Resolves once every named MCP server is connected, or after the timeout (the agent then reports what it lacks). */
async function waitForConnectors(q: Query, names: string[]): Promise<void> {
  const deadline = Date.now() + CONNECT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await q.mcpServerStatus().catch(() => []);
    if (names.every((n) => status.some((s) => s.name === n && s.status === 'connected'))) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  console.warn(`[runAgent] MCP servers not connected after ${CONNECT_TIMEOUT_MS}ms: ${names.join(', ')}`);
}

function estimateCost(model: string, u: Omit<TokenUsage, 'costUsd'>): number {
  const p = PRICES[model] ?? PRICES['claude-opus-5-5'];
  return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) / 1_000_000;
}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    costUsd: a.costUsd + b.costUsd,
  };
}

function subUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input: a.input - b.input,
    output: a.output - b.output,
    cacheRead: a.cacheRead - b.cacheRead,
    cacheWrite: a.cacheWrite - b.cacheWrite,
    costUsd: a.costUsd - b.costUsd,
  };
}

/**
 * Runs one Agent SDK query and streams its token usage into the agent's counter.
 * Live numbers come from each assistant message; the final `result` (modelUsage + total_cost_usd)
 * replaces the estimate with the SDK's own accounting.
 */
export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  const perMessage = new Map<string, MessageUsage>();
  let reported: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 };
  let finalText = '';
  let isError = false;

  // Publish deltas, never totals: the same agent (e.g. the boss) can run several queries concurrently.
  const publish = (live: TokenUsage) => {
    const current = world.getAgent(opts.agentId)?.tokens;
    if (!current) return;
    world.patchAgent(opts.agentId, { tokens: addUsage(current, subUsage(live, reported)) });
    reported = live;
  };

  const liveUsage = (): TokenUsage => {
    const sum = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    for (const u of perMessage.values()) {
      sum.input += u.input_tokens;
      sum.output += u.output_tokens;
      sum.cacheRead += u.cache_read_input_tokens ?? 0;
      sum.cacheWrite += u.cache_creation_input_tokens ?? 0;
    }
    return { ...sum, costUsd: estimateCost(opts.model, sum) };
  };

  // spawn() with a missing cwd fails with ENOENT, which the SDK misreports as "binary failed to launch".
  if (opts.cwd) await mkdir(opts.cwd, { recursive: true });

  const waitFor = opts.waitForMcpServers ?? [];
  let markReady!: () => void;
  const ready = new Promise<void>((resolve) => (markReady = resolve));
  async function* heldPrompt(): AsyncGenerator<SDKUserMessage> {
    await ready;
    yield { type: 'user', parent_tool_use_id: null, message: { role: 'user', content: opts.prompt } };
  }

  const stream = query({
    prompt: waitFor.length ? heldPrompt() : opts.prompt,
    options: {
      model: opts.model,
      systemPrompt: opts.systemPrompt,
      tools: opts.builtinTools ?? [],
      mcpServers: opts.mcpServers ?? {},
      allowedTools: [...Object.keys(opts.mcpServers ?? {}).map((name) => `mcp__${name}`), ...(opts.builtinTools ?? []), ...(opts.extraAllowedTools ?? [])],
      disallowedTools: opts.disallowedTools,
      permissionMode: 'dontAsk',
      settingSources: [],
      persistSession: false,
      maxTurns: opts.maxTurns ?? 1,
      effort: opts.effort,
      cwd: opts.cwd,
      abortController: opts.abortController,
    },
  });

  // Must poll from outside the prompt generator: with streaming input the SDK emits nothing
  // (not even init) until the first message is yielded, so waiting on init would deadlock.
  if (waitFor.length) void waitForConnectors(stream, waitFor).finally(markReady);

  for await (const message of stream as AsyncIterable<SDKMessage>) {
    if (message.type === 'assistant' && message.parent_tool_use_id === null) {
      const msg = message.message;
      if (msg.usage) {
        perMessage.set(msg.id, msg.usage as MessageUsage);
        publish(liveUsage());
      }
      for (const block of msg.content) {
        if (block.type === 'tool_use') opts.onActivity?.(describeTool(block.name));
        if (block.type === 'text' && block.text.trim()) {
          finalText = block.text;
          opts.onActivity?.(`💭 ${block.text.trim().slice(0, 90)}`);
        }
      }
    }

    if (message.type === 'result') {
      isError = message.is_error;
      if (message.subtype === 'success') finalText = message.result || finalText;
      const total = Object.values(message.modelUsage).reduce<TokenUsage>(
        (acc, m) => ({
          input: acc.input + m.inputTokens,
          output: acc.output + m.outputTokens,
          cacheRead: acc.cacheRead + m.cacheReadInputTokens,
          cacheWrite: acc.cacheWrite + m.cacheCreationInputTokens,
          costUsd: acc.costUsd,
        }),
        { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: message.total_cost_usd },
      );
      // Startup failures can report zeroed usage; keep the live estimate then.
      publish(total.input + total.output > 0 ? total : liveUsage());
    }
  }

  return { text: finalText.trim(), isError };
}
