import { useEffect, useState } from 'react';
import type { MissionStatus } from '../../../shared/events.ts';
import { formatTokens } from '../game/OfficeGame.ts';
import { api } from '../state/api.ts';
import { store, useConnected, useLightMode, useWorld, type LightMode } from '../state/store.ts';

const STATUS: Record<MissionStatus, { label: string; tone: string }> = {
  idle: { label: 'No mission', tone: 'muted' },
  planning: { label: 'Planning', tone: 'warn' },
  running: { label: 'Running', tone: 'ok' },
  wrapping_up: { label: 'Wrapping up', tone: 'warn' },
  done: { label: 'Done', tone: 'info' },
  stopped: { label: 'Stopped', tone: 'muted' },
  error: { label: 'Error', tone: 'bad' },
};

const LIGHT_NEXT: Record<LightMode, LightMode> = { auto: 'day', day: 'night', night: 'auto' };
const LIGHT_ICON: Record<LightMode, string> = { auto: '🕒 Auto', day: '☀️ Day', night: '🌙 Night' };

function useElapsed(from?: number, to?: number): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!from || to) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [from, to]);
  if (!from) return '00:00';
  const s = Math.floor(((to ?? now) - from) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function TopBar({ onNewMission }: { onNewMission: () => void }) {
  const world = useWorld();
  const connected = useConnected();
  const light = useLightMode();
  const mission = world.mission;
  const elapsed = useElapsed(mission?.startedAt, mission?.finishedAt);
  const active = mission && ['planning', 'running', 'wrapping_up'].includes(mission.status);

  const totals = world.agents.reduce(
    (acc, a) => ({
      tokens: acc.tokens + a.tokens.input + a.tokens.output + a.tokens.cacheRead + a.tokens.cacheWrite,
      cost: acc.cost + a.tokens.costUsd,
    }),
    { tokens: 0, cost: 0 },
  );
  const onSite = world.agents.filter((a) => a.role === 'qa' && a.status !== 'gone').length;
  const status = STATUS[mission?.status ?? 'idle'];

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">🌿</span>
        <div>
          <h1>Blackthorn.io</h1>
          <span className="tagline">QA Office</span>
          <span className={`conn ${connected ? 'on' : 'off'}`}>{connected ? 'engine connected' : 'reconnecting…'}</span>
        </div>
      </div>

      <div className="mission-info">
        <span className={`pill ${status.tone}`}>{status.label}</span>
        {mission && (
          <a href={mission.testCasesUrl} target="_blank" rel="noreferrer" className="url" title={mission.testCasesUrl}>
            📊 Test cases spreadsheet
          </a>
        )}
      </div>

      <div className="stats">
        <Stat label="Time" value={elapsed} />
        <Stat label="On site" value={`${onSite} QA`} />
        <Stat label="Tokens" value={formatTokens(totals.tokens)} accent="green" />
        <Stat label="Cost" value={`$${totals.cost.toFixed(3)}`} accent="gold" />
      </div>

      <div className="actions">
        <button className="ghost" onClick={() => store.setLightMode(LIGHT_NEXT[light])}>
          {LIGHT_ICON[light]}
        </button>
        {active ? (
          <button className="danger" onClick={() => void api.stopMission()}>
            ⏹ Stop
          </button>
        ) : (
          <button className="primary" onClick={onNewMission}>
            ＋ New mission
          </button>
        )}
      </div>
    </header>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'green' | 'gold' }) {
  return (
    <div className={`stat ${accent ?? ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
