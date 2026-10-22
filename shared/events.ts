/**
 * Event contract between the agent engine (server) and the office visualizer (web).
 * The visualizer knows nothing about QA: it only renders this state and these events.
 */

export type AgentRole = 'boss' | 'qa';

export type AgentStatus =
  | 'arriving'
  | 'at_boss'
  | 'to_desk'
  | 'working'
  | 'asking'
  | 'waiting_boss'
  | 'reporting'
  | 'leaving'
  | 'gone'
  // boss-only
  | 'idle'
  | 'planning'
  | 'thinking'
  | 'waiting_human';

/** Where an agent should be. The client resolves it to tile coordinates and walks there. */
export type Place =
  | { kind: 'outside' }
  | { kind: 'door' }
  | { kind: 'boss' }
  | { kind: 'desk' }
  | { kind: 'colleague'; agentId: string };

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
}

export interface Appearance {
  skin: string;
  hair: string;
  hairStyle: 'short' | 'long' | 'bun' | 'bald' | 'curly';
  shirt: string;
  pants: string;
  accessory?: 'glasses' | 'headphones' | 'tie';
}

export interface AgentSnapshot {
  id: string;
  name: string;
  role: AgentRole;
  appearance: Appearance;
  deskIndex: number;
  status: AgentStatus;
  place: Place;
  taskId?: string;
  activity?: string;
  tokens: TokenUsage;
  tasksDone: number;
}

export type TaskStatus = 'pending' | 'in_progress' | 'done';
export type Verdict = 'pass' | 'fail' | 'blocked';

/** A reference to one spreadsheet test case. Testers read its full steps from the sheet. */
export interface TestCase {
  id: string;
  title: string;
}

export interface CaseResult {
  caseId: string;
  result: Verdict;
  notes: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  cases: TestCase[];
  status: TaskStatus;
  assignee?: string;
  summary?: string;
  verdict?: Verdict;
  caseResults?: CaseResult[];
}

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface Bug {
  id: string;
  title: string;
  severity: Severity;
  steps: string[];
  expected: string;
  actual: string;
  url?: string;
  reporter: string;
  taskId?: string;
  createdAt: number;
}

export interface Decision {
  id: string;
  fromAgentId: string;
  question: string;
  context: string;
  options: string[];
  status: 'pending' | 'answered';
  answer?: string;
  createdAt: number;
}

export type ChatKind = 'question' | 'answer' | 'briefing' | 'thought' | 'system' | 'escalation';

export interface ChatLine {
  id: string;
  from: string;
  to?: string;
  text: string;
  kind: ChatKind;
  at: number;
}

export type MissionStatus = 'idle' | 'planning' | 'running' | 'wrapping_up' | 'done' | 'stopped' | 'error';

export interface Mission {
  id: string;
  /** Spreadsheet with the test cases. The app under test is defined in the rules. */
  testCasesUrl: string;
  rules: string;
  maxAgents: number;
  status: MissionStatus;
  startedAt?: number;
  finishedAt?: number;
  summary?: string;
  error?: string;
}

export interface World {
  mission: Mission | null;
  agents: AgentSnapshot[];
  tasks: Task[];
  bugs: Bug[];
  decisions: Decision[];
  chat: ChatLine[];
}

export type ServerEvent =
  | { type: 'snapshot'; world: World }
  | { type: 'mission'; mission: Mission | null }
  | { type: 'agent'; agent: AgentSnapshot }
  | { type: 'say'; agentId: string; text: string; kind: ChatKind; to?: string }
  | { type: 'tasks'; tasks: Task[] }
  | { type: 'bug'; bug: Bug }
  | { type: 'decision'; decision: Decision }
  | { type: 'chat'; line: ChatLine }
  | { type: 'reset' };

export interface StartMissionRequest {
  testCasesUrl: string;
  rules: string;
  maxAgents: number;
}

export interface AnswerDecisionRequest {
  answer: string;
}

export const EMPTY_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 };
