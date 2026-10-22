import { randomUUID } from 'node:crypto';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Mission, Task } from '../../../shared/events.ts';
import { config } from '../config.ts';
import { humanDesk } from '../humanDesk.ts';
import { world } from '../world.ts';
import { playwrightServer } from './playwright.ts';
import { salesforceServer } from './salesforce.ts';
import { parseSheetLink, sheetsAccess } from './sheets.ts';
import { bossAdvisorPrompt, bossPlannerPrompt, summaryPrompt } from './prompts.ts';
import { BOSS_ID } from './roster.ts';
import { runAgent } from './runAgent.ts';

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

/** The boss's line to you: blocks until you answer from the web. */
function escalateTool(fromAgentId: string) {
  return tool(
    'escalate_to_human',
    'Escalate an IMPORTANT decision to the human owner and wait for their answer.',
    {
      question: z.string().describe('The decision the human must make, in one sentence'),
      context: z.string().describe('Why it matters and what was found'),
      options: z.array(z.string()).min(2).max(4).describe('Concrete choices for the human'),
    },
    async (args) => {
      world.say(BOSS_ID, `📞 The owner has to decide this: ${args.question}`, 'escalation', fromAgentId);
      const pending = humanDesk.ask({ fromAgentId, ...args });
      refreshBossStatus();
      const answer = await pending;
      refreshBossStatus();
      world.say(BOSS_ID, `👑 Decision: ${answer}`, 'answer', fromAgentId);
      return text(`The human owner decided: ${answer}`);
    },
  );
}

let busy = 0;

/** The boss sprite reflects what the boss is doing: idle, thinking, or on the phone with you. */
export function refreshBossStatus(): void {
  const status = humanDesk.hasPending() ? 'waiting_human' : busy > 0 ? 'thinking' : 'idle';
  world.patchAgent(BOSS_ID, { status });
}

export async function planMission(mission: Mission, workDir: string, abortController: AbortController): Promise<Task[]> {
  let tasks: Task[] = [];

  const office = createSdkMcpServer({
    name: 'office',
    alwaysLoad: true,
    tools: [
      tool(
        'publish_test_plan',
        'Publish the QA test plan: the spreadsheet test cases grouped into tasks. Each task is assigned to one tester.',
        {
          tasks: z
            .array(
              z.object({
                title: z.string().describe('Short task title, e.g. the feature or flow'),
                description: z.string().describe('What this group covers and any setup the tester needs'),
                cases: z
                  .array(
                    z.object({
                      id: z.string().describe('Test case id exactly as in the spreadsheet (e.g. TC-680-01)'),
                      title: z.string().describe('Short title; testers read the full steps from the sheet themselves'),
                    }),
                  )
                  .min(1),
              }),
            )
            .min(1)
            .max(8),
        },
        async (args) => {
          tasks = args.tasks.map((t) => ({ id: randomUUID(), title: t.title, description: t.description, cases: t.cases, status: 'pending' }));
          const total = tasks.reduce((n, t) => n + t.cases.length, 0);
          return text(`Plan published: ${tasks.length} tasks, ${total} test cases. You are done.`);
        },
      ),
      escalateTool(BOSS_ID),
    ],
  });

  const result = await runAgent({
    agentId: BOSS_ID,
    model: config.bossModel,
    systemPrompt: bossPlannerPrompt({ rules: mission.rules, sheet: parseSheetLink(mission.testCasesUrl) }),
    prompt: 'Read the test cases from the spreadsheet and publish the plan.',
    mcpServers: { playwright: playwrightServer(workDir), salesforce: salesforceServer(), office },
    ...sheetsAccess,
    maxTurns: 30,
    effort: 'high',
    cwd: workDir,
    abortController,
    onActivity: (activity) => world.patchAgent(BOSS_ID, { activity }),
  });

  world.patchAgent(BOSS_ID, { activity: undefined });
  if (!tasks.length) throw new Error(`The boss could not produce a test plan. ${result.text}`.trim());
  return tasks;
}

export async function adviseTester(input: {
  fromAgentId: string;
  fromName: string;
  question: string;
  context: string;
  rules: string;
  abortController: AbortController;
}): Promise<string> {
  const office = createSdkMcpServer({ name: 'office', alwaysLoad: true, tools: [escalateTool(input.fromAgentId)] });

  busy++;
  refreshBossStatus();
  try {
    const result = await runAgent({
      agentId: BOSS_ID,
      model: config.bossModel,
      systemPrompt: bossAdvisorPrompt(input.rules, world.tasks()),
      prompt: `${input.fromName} asks: ${input.question}\n\nContext from ${input.fromName}: ${input.context}`,
      mcpServers: { office },
      maxTurns: 4,
      effort: 'low',
      abortController: input.abortController,
    });
    return result.text || 'Use your judgment and follow the team rules.';
  } finally {
    busy--;
    refreshBossStatus();
  }
}

export async function summarizeMission(abortController: AbortController): Promise<string> {
  const snapshot = world.snapshot();
  const report = [
    `Tasks:`,
    ...snapshot.tasks.map((t) => {
      const results = (t.caseResults ?? []).map((r) => `${r.caseId}=${r.result}`).join(', ');
      return `- ${t.title}: ${t.verdict ?? 'n/a'} — ${t.summary ?? ''}${results ? ` [${results}]` : ''}`;
    }),
    `Bugs (${snapshot.bugs.length}):`,
    ...snapshot.bugs.map((b) => `- [${b.severity}] ${b.title}`),
  ].join('\n');

  busy++;
  refreshBossStatus();
  try {
    const result = await runAgent({
      agentId: BOSS_ID,
      model: config.bossModel,
      systemPrompt: summaryPrompt(),
      prompt: report,
      effort: 'low',
      abortController,
    });
    return result.text;
  } finally {
    busy--;
    refreshBossStatus();
  }
}
