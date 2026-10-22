import { execFile } from 'node:child_process';
import { createSdkMcpServer, tool, type McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

/**
 * Salesforce access the way Claude Code does it: the `sf` CLI with an org alias the user
 * already authenticated. Deliberately NOT the built-in Bash tool: Claude Code auto-approves
 * read-only shell commands (cat, ls, echo...), which would let an agent read local files
 * such as the sf auth store. This tool runs only the `sf` binary, without a shell.
 */

/**
 * Allowlist, not denylist: guessing how `sf` parses flags is a losing game (a flag value placed
 * between the command words slips past any denylist). Deliberately absent: `apex run` (anonymous
 * Apex can run any DML), `org display` (prints tokens), and anything that deletes or deploys.
 */
const ALLOWED_COMMANDS = new Set([
  'data query',
  'data get',
  'data search',
  'data create',
  'data update',
  'org open',
  'org list',
  'sobject describe',
  'sobject list',
  'apex list',
  'apex get',
]);

const MAX_OUTPUT = 20_000;

/** The command is always the first two arguments; flags come after. */
const commandOf = (args: string[]) => `${args[0] ?? ''} ${args[1] ?? ''}`;

export function validate(args: string[]): string | null {
  const command = commandOf(args);
  if (args.slice(0, 2).some((a) => !a || a.startsWith('-')) || !ALLOWED_COMMANDS.has(command)) {
    return `Not allowed. The command must come first and be one of: ${[...ALLOWED_COMMANDS].map((c) => `"sf ${c}"`).join(', ')}. Ask the boss if you need something else.`;
  }
  return null;
}

function runSf(args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile('sf', args, { timeout: 120_000, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, SF_HIDE_RELEASE_NOTES: 'true' } }, (error, stdout, stderr) => {
      const err = stderr.split('\n').filter((l) => l.trim() && !l.includes('update available')).join('\n');
      const out = [stdout.trim(), err && `STDERR:\n${err}`, error && !stdout ? `EXIT: ${error.message}` : ''].filter(Boolean).join('\n');
      resolve(out.length > MAX_OUTPUT ? `${out.slice(0, MAX_OUTPUT)}\n…[truncated]` : out || '(no output)');
    });
  });
}

/** One instance per query: the SDK binds an in-process MCP server to a single session. */
export function salesforceServer(): McpServerConfig {
  return createSdkMcpServer({
    name: 'salesforce',
    alwaysLoad: true,
    tools: [
      tool(
        'salesforce_cli',
        'Run a Salesforce CLI (sf) command against an org alias the owner already authenticated. Pass the arguments after "sf" as a list, e.g. ["data","query","-o","my-org","-q","SELECT Id FROM Account LIMIT 5","--json"].',
        { args: z.array(z.string()).min(1).describe('Arguments after "sf", one item per argument (no shell quoting needed)') },
        async ({ args }) => {
          const problem = validate(args);
          if (problem) return { content: [{ type: 'text', text: problem }], isError: true };
          // `org open` must never launch the owner's real browser.
          const isOpen = commandOf(args) === 'org open';
          const finalArgs = isOpen && !args.includes('--url-only') && !args.includes('-r') ? [...args, '--url-only'] : args;
          return { content: [{ type: 'text', text: await runSf(finalArgs) }] };
        },
      ),
    ],
  });
}

export const SALESFORCE_GUIDE = `SALESFORCE (only if the mission instructions name an org alias):
- Use the salesforce_cli tool (arguments after "sf", as a list). Always pass "-o", "<alias>".
- Query data: ["data","query","-o","<alias>","-q","SELECT Id, Name FROM ...","--json"]
- Log into the Salesforce UI in YOUR browser: ["org","open","-o","<alias>","--url-only","--json"] (add "--path","<path>" for a specific page), then browser_navigate to the returned url.
- That URL carries a live session: never write it in chat, questions, bug reports or summaries.
- Never delete data, deploy, or change org configuration unless the mission instructions ask for it; anything destructive goes to the boss first.`;
