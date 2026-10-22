import type { StartMissionRequest } from '../../../shared/events.ts';

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res;
}

const reported = new Set<string>();

/** Sends a client crash to the engine so it shows up in the terminal. Each distinct error once. */
export function reportClientError(source: string, error: unknown, componentStack?: string): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const key = `${source}|${err.message}`;
  // A broken entity throws on every frame (60/s): log and report each distinct error once.
  if (reported.has(key)) return;
  reported.add(key);
  console.error(`[${source}]`, err);
  void fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({ source, message: err.message, stack: err.stack, componentStack }),
  }).catch(() => {});
}

export const api = {
  defaultRules: async () => (await request('/api/rules/default')).text(),
  startMission: (body: StartMissionRequest) => request('/api/missions', { method: 'POST', body: JSON.stringify(body) }),
  stopMission: () => request('/api/missions/stop', { method: 'POST' }),
  answerDecision: (id: string, answer: string) =>
    request(`/api/decisions/${id}`, { method: 'POST', body: JSON.stringify({ answer }) }),
};
