import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { AgentSnapshot, Mission, StartMissionRequest, Task } from '../../shared/events.ts';
import { EMPTY_USAGE } from '../../shared/events.ts';
import { adviseTester, planMission, refreshBossStatus, summarizeMission } from './agents/boss.ts';
import { colleaguePrompt } from './agents/prompts.ts';
import { runQaTask, type BugReport, type OfficeHooks, type QaResult } from './agents/qa.ts';
import { parseSheetLink } from './agents/sheets.ts';
import { BOSS_APPEARANCE, BOSS_ID, QA_ROSTER } from './agents/roster.ts';
import { runAgent } from './agents/runAgent.ts';
import { config, RUNS_DIR } from './config.ts';
import { humanDesk } from './humanDesk.ts';
import { world } from './world.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NOTES_LIMIT = 8;

class MissionRunner {
  private abort = new AbortController();
  private queue: Task[] = [];
  private notes = new Map<string, string[]>();
  private running = false;
  private mission!: Mission;
  private workDir = '';

  isRunning(): boolean {
    return this.running;
  }

  async start(req: StartMissionRequest): Promise<Mission> {
    if (this.running) throw new Error('A mission is already running.');
    this.running = true;
    this.abort = new AbortController();
    this.notes.clear();
    world.reset();

    this.mission = {
      id: randomUUID(),
      testCasesUrl: req.testCasesUrl,
      rules: req.rules,
      maxAgents: Math.max(1, Math.min(config.maxAgentsCap, req.maxAgents)),
      status: 'planning',
      startedAt: Date.now(),
    };
    this.workDir = path.join(RUNS_DIR, this.mission.id);
    await mkdir(this.workDir, { recursive: true });

    world.setMission(this.mission);
    world.upsertAgent({
      id: BOSS_ID,
      name: 'Boss (you)',
      role: 'boss',
      appearance: BOSS_APPEARANCE,
      deskIndex: -1,
      status: 'planning',
      place: { kind: 'boss' },
      tokens: { ...EMPTY_USAGE },
      tasksDone: 0,
    });

    void this.run().finally(() => {
      this.running = false;
    });
    return this.mission;
  }

  stop(): void {
    if (!this.running) return;
    this.abort.abort();
    humanDesk.cancelAll();
    world.patchMission({ status: 'stopped', finishedAt: Date.now() });
    for (const agent of world.agents()) {
      if (agent.role === 'qa' && agent.status !== 'gone') {
        world.patchAgent(agent.id, { status: 'leaving', place: { kind: 'outside' }, activity: undefined });
      }
    }
  }

  private get aborted(): boolean {
    return this.abort.signal.aborted;
  }

  private async run(): Promise<void> {
    try {
      world.say(BOSS_ID, `New mission! Reading the test cases from the spreadsheet...`, 'system');
      const tasks = await planMission(this.mission, path.join(this.workDir, 'boss'), this.abort);
      this.queue = [...tasks];
      world.setTasks(tasks);
      world.patchMission({ status: 'running' });
      refreshBossStatus();

      const crew = Math.min(this.mission.maxAgents, tasks.length);
      world.say(BOSS_ID, `Plan ready: ${tasks.length} tasks. Call in ${crew} testers!`, 'system');

      await Promise.all(
        Array.from({ length: crew }, (_, i) => sleep(i * 2500).then(() => this.workerLoop(i))),
      );
      if (this.aborted) return;

      world.patchMission({ status: 'wrapping_up' });
      world.say(BOSS_ID, 'Everyone is done. Writing the final summary...', 'system');
      const summary = await summarizeMission(this.abort);
      world.patchMission({ status: 'done', summary, finishedAt: Date.now() });
      world.say(BOSS_ID, '📋 Summary ready. Mission accomplished!', 'system');
    } catch (error) {
      if (this.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      world.patchMission({ status: 'error', error: message, finishedAt: Date.now() });
      world.say(BOSS_ID, `💥 Something went wrong: ${message}`, 'system');
    } finally {
      refreshBossStatus();
    }
  }

  private async workerLoop(index: number): Promise<void> {
    if (this.aborted) return;
    const persona = QA_ROSTER[index];
    const id = `qa-${index}`;
    const agent: AgentSnapshot = {
      id,
      name: persona.name,
      role: 'qa',
      appearance: persona.appearance,
      deskIndex: index,
      status: 'arriving',
      place: { kind: 'outside' },
      tokens: { ...EMPTY_USAGE },
      tasksDone: 0,
    };
    world.upsertAgent(agent);
    await sleep(200);
    world.patchAgent(id, { place: { kind: 'boss' } });
    await sleep(config.pace.walk * 1.6);

    while (!this.aborted) {
      world.patchAgent(id, { status: 'at_boss' });
      const task = this.queue.shift();

      if (!task) {
        world.say(id, 'Anything else for me?', 'question', BOSS_ID);
        await sleep(config.pace.talk);
        world.say(BOSS_ID, `That's all for today, ${persona.name}. Thanks!`, 'answer', id);
        await sleep(config.pace.talk);
        break;
      }

      world.patchTask(task.id, { status: 'in_progress', assignee: id });
      world.patchAgent(id, { taskId: task.id });
      world.say(BOSS_ID, `${persona.name}, you are on: ${task.title}`, 'briefing', id);
      await sleep(config.pace.talk);
      world.say(id, 'On it!', 'answer', BOSS_ID);
      world.patchAgent(id, { status: 'to_desk', place: { kind: 'desk' } });
      await sleep(config.pace.walk);
      world.patchAgent(id, { status: 'working' });

      let outcome: QaResult;
      try {
        outcome = await runQaTask({
          agentId: id,
          name: persona.name,
          trait: persona.trait,
          rules: this.mission.rules,
          task,
          sheet: parseSheetLink(this.mission.testCasesUrl),
          colleagues: this.colleaguesOf(id),
          workDir: path.join(this.workDir, id),
          hooks: this.hooksFor(id, persona.name),
          abortController: this.abort,
        });
      } catch (error) {
        if (this.aborted) return;
        const message = `Crashed: ${error instanceof Error ? error.message : String(error)}`;
        outcome = { summary: message, verdict: 'blocked', caseResults: task.cases.map((c) => ({ caseId: c.id, result: 'blocked', notes: message })) };
      }
      if (this.aborted) return;

      const current = world.getAgent(id);
      world.patchTask(task.id, { status: 'done', summary: outcome.summary, verdict: outcome.verdict, caseResults: outcome.caseResults });
      world.patchAgent(id, { status: 'reporting', place: { kind: 'boss' }, activity: undefined, tasksDone: (current?.tasksDone ?? 0) + 1 });
      await sleep(config.pace.walk);
      const icon = outcome.verdict === 'pass' ? '✅' : outcome.verdict === 'fail' ? '❌' : '⛔';
      const passed = outcome.caseResults.filter((r) => r.result === 'pass').length;
      world.say(id, `${icon} Done with "${task.title}": ${passed}/${task.cases.length} cases passed. ${outcome.summary}`, 'answer', BOSS_ID);
      await sleep(config.pace.talk * 1.5);
      world.say(BOSS_ID, 'Great job! Let me see what else we have...', 'answer', id);
      await sleep(config.pace.talk);
    }

    world.patchAgent(id, { status: 'leaving', place: { kind: 'outside' }, taskId: undefined });
    await sleep(config.pace.walk * 1.8);
    world.patchAgent(id, { status: 'gone' });
  }

  private colleaguesOf(id: string): Array<{ name: string; task?: string }> {
    const tasks = world.tasks();
    return world
      .agents()
      .filter((a) => a.role === 'qa' && a.id !== id && a.status !== 'gone')
      .map((a) => ({ name: a.name, task: tasks.find((t) => t.id === a.taskId)?.title }));
  }

  private note(id: string, text: string): void {
    const list = this.notes.get(id) ?? [];
    list.push(text);
    this.notes.set(id, list.slice(-NOTES_LIMIT));
  }

  private hooksFor(id: string, name: string): OfficeHooks {
    return {
      onActivity: (activity) => {
        world.patchAgent(id, { activity });
        this.note(id, activity);
      },

      reportBug: (bug: BugReport) => {
        world.addBug({ ...bug, id: randomUUID(), reporter: id, taskId: world.getAgent(id)?.taskId, createdAt: Date.now() });
        world.say(id, `🐞 Bug! ${bug.title}`, 'thought');
        this.note(id, `Filed bug: ${bug.title}`);
      },

      askColleague: async (colleagueName, question) => {
        const target = world
          .agents()
          .find((a) => a.role === 'qa' && a.name.toLowerCase() === colleagueName.toLowerCase() && a.status !== 'gone' && a.status !== 'leaving');
        if (!target || target.id === id) return `${colleagueName} is not in the office. Decide yourself or ask the boss.`;

        world.patchAgent(id, { status: 'asking', place: { kind: 'colleague', agentId: target.id }, activity: `💬 Asking ${target.name}` });
        await sleep(config.pace.walk);
        world.say(id, question, 'question', target.id);

        const persona = QA_ROSTER[target.deskIndex];
        const reply = await runAgent({
          agentId: target.id,
          model: config.qaModel,
          systemPrompt: colleaguePrompt({
            name: target.name,
            trait: persona.trait,
            task: world.tasks().find((t) => t.id === target.taskId)?.title,
            recentNotes: this.notes.get(target.id) ?? [],
          }),
          prompt: `${name} asks: ${question}`,
          effort: 'low',
          abortController: this.abort,
        });
        const answer = reply.text || 'No idea, honestly. Ask the boss.';
        world.say(target.id, answer, 'answer', id);
        await sleep(config.pace.talk);
        world.patchAgent(id, { status: 'working', place: { kind: 'desk' }, activity: '🚶 Back to my desk' });
        return `${target.name} says: ${answer}`;
      },

      askBoss: async (question, context) => {
        world.patchAgent(id, { status: 'waiting_boss', place: { kind: 'boss' }, activity: '🙋 Asking the boss' });
        await sleep(config.pace.walk);
        world.say(id, question, 'question', BOSS_ID);
        const answer = await adviseTester({ fromAgentId: id, fromName: name, question, context, rules: this.mission.rules, abortController: this.abort });
        world.say(BOSS_ID, answer, 'answer', id);
        await sleep(config.pace.talk);
        world.patchAgent(id, { status: 'working', place: { kind: 'desk' }, activity: '🚶 Back to my desk' });
        return answer;
      },
    };
  }
}

export const missions = new MissionRunner();
