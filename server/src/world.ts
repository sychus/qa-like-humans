import { randomUUID } from 'node:crypto';
import type {
  AgentSnapshot,
  Bug,
  ChatKind,
  ChatLine,
  Decision,
  Mission,
  ServerEvent,
  Task,
  World,
} from '../../shared/events.ts';

type Listener = (event: ServerEvent) => void;

const CHAT_LIMIT = 400;

/** Single source of truth for the office. Every mutation is broadcast as an event. */
export class WorldStore {
  private world: World = WorldStore.empty();
  private listeners = new Set<Listener>();

  static empty(): World {
    return { mission: null, agents: [], tasks: [], bugs: [], decisions: [], chat: [] };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): World {
    return structuredClone(this.world);
  }

  reset(): void {
    this.world = WorldStore.empty();
    this.emit({ type: 'reset' });
  }

  setMission(mission: Mission | null): void {
    this.world.mission = mission;
    this.emit({ type: 'mission', mission });
  }

  patchMission(patch: Partial<Mission>): void {
    if (!this.world.mission) return;
    this.setMission({ ...this.world.mission, ...patch });
  }

  getAgent(id: string): AgentSnapshot | undefined {
    return this.world.agents.find((a) => a.id === id);
  }

  agents(): AgentSnapshot[] {
    return this.world.agents;
  }

  upsertAgent(agent: AgentSnapshot): void {
    const idx = this.world.agents.findIndex((a) => a.id === agent.id);
    if (idx === -1) this.world.agents.push(agent);
    else this.world.agents[idx] = agent;
    this.emit({ type: 'agent', agent });
  }

  patchAgent(id: string, patch: Partial<AgentSnapshot>): AgentSnapshot | undefined {
    const current = this.getAgent(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    this.upsertAgent(next);
    return next;
  }

  setTasks(tasks: Task[]): void {
    this.world.tasks = tasks;
    this.emit({ type: 'tasks', tasks });
  }

  tasks(): Task[] {
    return this.world.tasks;
  }

  patchTask(id: string, patch: Partial<Task>): void {
    this.setTasks(this.world.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  addBug(bug: Bug): void {
    this.world.bugs.push(bug);
    this.emit({ type: 'bug', bug });
  }

  bugs(): Bug[] {
    return this.world.bugs;
  }

  upsertDecision(decision: Decision): void {
    const idx = this.world.decisions.findIndex((d) => d.id === decision.id);
    if (idx === -1) this.world.decisions.push(decision);
    else this.world.decisions[idx] = decision;
    this.emit({ type: 'decision', decision });
  }

  /** Speech bubble in the office + line in the chat feed. */
  say(agentId: string, text: string, kind: ChatKind, to?: string): void {
    const line: ChatLine = { id: randomUUID(), from: agentId, to, text, kind, at: Date.now() };
    this.world.chat.push(line);
    if (this.world.chat.length > CHAT_LIMIT) this.world.chat.splice(0, this.world.chat.length - CHAT_LIMIT);
    this.emit({ type: 'say', agentId, text, kind, to });
    this.emit({ type: 'chat', line });
  }

  private emit(event: ServerEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

export const world = new WorldStore();
