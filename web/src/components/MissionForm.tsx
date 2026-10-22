import { useEffect, useState } from 'react';
import { api } from '../state/api.ts';

export function MissionForm({ onClose }: { onClose: () => void }) {
  const [testCasesUrl, setTestCasesUrl] = useState('');
  const [rules, setRules] = useState('');
  const [maxAgents, setMaxAgents] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.defaultRules().then(setRules).catch(() => setRules(''));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      await api.startMission({ testCasesUrl, rules, maxAgents });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>📋 New QA mission</h2>
        <p className="hint">The boss reads the test cases from the spreadsheet, groups them into tasks and calls in the team. Write the scope, app URL and Salesforce org alias in the instructions below.</p>

        <label>
          Test cases (Google Sheets link)
          <input type="url" required placeholder="https://docs.google.com/spreadsheets/d/…" value={testCasesUrl} onChange={(e) => setTestCasesUrl(e.target.value)} autoFocus />
        </label>

        <label>
          Testers: <strong>{maxAgents}</strong>
          <input type="range" min={1} max={6} value={maxAgents} onChange={(e) => setMaxAgents(Number(e.target.value))} />
        </label>

        <label>
          Mission instructions &amp; team rules
          <textarea rows={12} required value={rules} onChange={(e) => setRules(e.target.value)} />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={sending}>
            {sending ? 'Opening the office…' : '🚀 Start'}
          </button>
        </div>
      </form>
    </div>
  );
}
