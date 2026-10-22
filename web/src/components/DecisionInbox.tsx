import { useState } from 'react';
import type { Decision } from '../../../shared/events.ts';
import { api } from '../state/api.ts';
import { useWorld } from '../state/store.ts';

/** Your desk: the AI boss escalates important decisions and the asking tester waits for you. */
export function DecisionInbox() {
  const world = useWorld();
  const pending = world.decisions.filter((d) => d.status === 'pending');
  if (!pending.length) return null;

  return (
    <div className="inbox">
      {pending.map((d) => (
        <DecisionCard key={d.id} decision={d} askedBy={world.agents.find((a) => a.id === d.fromAgentId)?.name ?? 'A tester'} />
      ))}
    </div>
  );
}

function DecisionCard({ decision, askedBy }: { decision: Decision; askedBy: string }) {
  const [custom, setCustom] = useState('');
  const [sending, setSending] = useState(false);

  const send = async (answer: string) => {
    if (!answer.trim()) return;
    setSending(true);
    try {
      await api.answerDecision(decision.id, answer.trim());
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="decision">
      <div className="decision-head">
        <span className="ring">📞</span>
        <div>
          <small>The AI boss escalated a decision · asked by {askedBy}</small>
          <h3>{decision.question}</h3>
        </div>
      </div>
      <p className="context">{decision.context}</p>
      <div className="options">
        {decision.options.map((opt) => (
          <button key={opt} disabled={sending} onClick={() => void send(opt)}>
            {opt}
          </button>
        ))}
      </div>
      <form
        className="custom"
        onSubmit={(e) => {
          e.preventDefault();
          void send(custom);
        }}
      >
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Or type your own decision…" disabled={sending} />
        <button type="submit" disabled={sending || !custom.trim()}>
          Decide
        </button>
      </form>
    </div>
  );
}
