import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { CaseResult, Severity, Task, Verdict } from '../../../shared/events.ts';
import { config } from '../config.ts';
import { playwrightServer } from './playwright.ts';
import { qaPrompt } from './prompts.ts';
import { salesforceServer } from './salesforce.ts';
import { sheetsAccess, type SheetLink } from './sheets.ts';
import { runAgent } from './runAgent.ts';

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

export interface BugReport {
  title: string;
  severity: Severity;
  steps: string[];
  expected: string;
  actual: string;
  url?: string;
}

/** What a tester can do in the office besides using the browser. Implemented by the mission. */
export interface OfficeHooks {
  askColleague(colleagueName: string, question: string): Promise<string>;
  askBoss(question: string, context: string): Promise<string>;
  reportBug(bug: BugReport): void;
  onActivity(activity: string): void;
}

export interface QaResult {
  summary: string;
  verdict: Verdict;
  caseResults: CaseResult[];
}

export async function runQaTask(input: {
  agentId: string;
  name: string;
  trait: string;
  rules: string;
  task: Task;
  sheet: SheetLink;
  colleagues: Array<{ name: string; task?: string }>;
  workDir: string;
  hooks: OfficeHooks;
  abortController: AbortController;
}): Promise<QaResult> {
  let result: QaResult | undefined;

  const office = createSdkMcpServer({
    name: 'office',
    alwaysLoad: true,
    tools: [
      tool(
        'report_bug',
        'Report one confirmed defect to the team bug board.',
        {
          title: z.string(),
          severity: z.enum(['critical', 'high', 'medium', 'low']),
          steps: z.array(z.string()).min(1).describe('Steps to reproduce'),
          expected: z.string(),
          actual: z.string(),
          url: z.string().optional(),
        },
        async (bug) => {
          input.hooks.reportBug(bug);
          return text('Bug filed on the board.');
        },
      ),
      tool(
        'ask_colleague',
        'Walk to a colleague and ask a question. Returns their answer.',
        { colleague: z.string().describe('Colleague first name'), question: z.string() },
        async ({ colleague, question }) => text(await input.hooks.askColleague(colleague, question)),
      ),
      tool(
        'ask_boss',
        'Go to the lead\'s office for a decision or clarification. Required for anything risky or destructive.',
        { question: z.string(), context: z.string().describe('What you found and why you are asking') },
        async ({ question, context }) => text(await input.hooks.askBoss(question, context)),
      ),
      tool(
        'complete_task',
        'Finish your task with one result per test case. Must be your last action.',
        {
          summary: z.string().describe('2-3 sentences of what you tested and found'),
          verdict: z.enum(['pass', 'fail', 'blocked']).describe('fail if any case failed, blocked if any could not run, else pass'),
          case_results: z
            .array(z.object({ case_id: z.string(), result: z.enum(['pass', 'fail', 'blocked']), notes: z.string().describe('What you observed, short') }))
            .describe('One entry per test case you were given'),
        },
        async (args) => {
          result = {
            summary: args.summary,
            verdict: args.verdict,
            caseResults: args.case_results.map((r) => ({ caseId: r.case_id, result: r.result, notes: r.notes })),
          };
          const missing = input.task.cases.filter((c) => !result!.caseResults.some((r) => r.caseId === c.id)).map((c) => c.id);
          return text(missing.length ? `Task closed, but you skipped: ${missing.join(', ')}. Stop now.` : 'Task closed. Stop now.');
        },
      ),
    ],
  });

  const run = await runAgent({
    agentId: input.agentId,
    model: config.qaModel,
    systemPrompt: qaPrompt(input),
    prompt: `Start your task now: ${input.task.title}`,
    mcpServers: { playwright: playwrightServer(input.workDir), salesforce: salesforceServer(), office },
    ...sheetsAccess,
    maxTurns: config.qaMaxTurns,
    effort: 'medium',
    cwd: input.workDir,
    abortController: input.abortController,
    onActivity: input.hooks.onActivity,
  });

  // No complete_task call means we can't claim anything passed.
  return (
    result ?? {
      summary: run.text || 'Finished without reporting results.',
      verdict: 'blocked',
      caseResults: input.task.cases.map((c) => ({ caseId: c.id, result: 'blocked', notes: 'Not reported by the tester.' })),
    }
  );
}
