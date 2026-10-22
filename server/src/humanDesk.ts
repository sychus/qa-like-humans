import { randomUUID } from 'node:crypto';
import type { Decision } from '../../shared/events.ts';
import { world } from './world.ts';

/**
 * The human's desk: important decisions the AI boss escalates land here
 * and the asking agent blocks until the human answers from the web.
 */
class HumanDesk {
  private pending = new Map<string, (answer: string) => void>();

  ask(input: { fromAgentId: string; question: string; context: string; options: string[] }): Promise<string> {
    const decision: Decision = {
      id: randomUUID(),
      fromAgentId: input.fromAgentId,
      question: input.question,
      context: input.context,
      options: input.options,
      status: 'pending',
      createdAt: Date.now(),
    };
    world.upsertDecision(decision);
    return new Promise((resolve) => this.pending.set(decision.id, resolve));
  }

  answer(decisionId: string, answer: string): boolean {
    const resolve = this.pending.get(decisionId);
    if (!resolve) return false;
    this.pending.delete(decisionId);
    const decision = world.snapshot().decisions.find((d) => d.id === decisionId);
    if (decision) world.upsertDecision({ ...decision, status: 'answered', answer });
    resolve(answer);
    return true;
  }

  hasPending(): boolean {
    return this.pending.size > 0;
  }

  /** Mission stopped: unblock everyone so their queries can exit. */
  cancelAll(): void {
    for (const [id] of this.pending) this.answer(id, 'Mission stopped by the human. Wrap up immediately.');
  }
}

export const humanDesk = new HumanDesk();
