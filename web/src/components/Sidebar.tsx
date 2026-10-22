import { useEffect, useRef, useState } from 'react';
import type { AgentSnapshot, Bug, Severity, World } from '../../../shared/events.ts';
import { STATUS_LABELS, formatTokens } from '../game/OfficeGame.ts';
import { useWorld } from '../state/store.ts';

type Tab = 'bugs' | 'tasks' | 'chat' | 'team';

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

const nameOf = (world: World, id?: string) =>
  !id ? '' : id === 'boss' ? '👑 Boss' : (world.agents.find((a) => a.id === id)?.name ?? id);

export function Sidebar() {
  const world = useWorld();
  const [tab, setTab] = useState<Tab>('chat');

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'chat', label: '💬 Chat' },
    { id: 'bugs', label: `🐞 Bugs ${world.bugs.length}` },
    { id: 'tasks', label: `📌 Cases ${world.tasks.flatMap((t) => t.caseResults ?? []).filter((r) => r.result === 'pass').length}/${world.tasks.reduce((n, t) => n + t.cases.length, 0)}` },
    { id: 'team', label: '👥 Team' },
  ];

  return (
    <aside className="sidebar">
      {world.mission?.summary && (
        <div className="summary">
          <h3>📋 Boss summary</h3>
          <p>{world.mission.summary}</p>
        </div>
      )}
      {world.mission?.error && <div className="summary error">💥 {world.mission.error}</div>}

      <nav className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="panel">
        {tab === 'chat' && <ChatFeed world={world} />}
        {tab === 'bugs' && <BugList world={world} />}
        {tab === 'tasks' && <TaskList world={world} />}
        {tab === 'team' && <Team world={world} />}
      </div>
    </aside>
  );
}

function ChatFeed({ world }: { world: World }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [world.chat.length]);

  if (!world.chat.length) return <Empty text="The office is quiet. Start a mission." />;
  return (
    <div className="chat">
      {world.chat.map((line) => (
        <div key={line.id} className={`line ${line.kind}`}>
          <div className="who">
            <strong>{nameOf(world, line.from)}</strong>
            {line.to && <span> → {nameOf(world, line.to)}</span>}
            <time>{new Date(line.at).toLocaleTimeString('en-US')}</time>
          </div>
          <p>{line.text}</p>
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}

function BugList({ world }: { world: World }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!world.bugs.length) return <Empty text="No bugs yet. Patience, they will show up 😈" />;
  const sorted = [...world.bugs].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  return (
    <div className="bugs">
      {sorted.map((bug) => (
        <BugCard key={bug.id} bug={bug} reporter={nameOf(world, bug.reporter)} open={open === bug.id} onToggle={() => setOpen(open === bug.id ? null : bug.id)} />
      ))}
    </div>
  );
}

function BugCard({ bug, reporter, open, onToggle }: { bug: Bug; reporter: string; open: boolean; onToggle: () => void }) {
  return (
    <article className={`bug ${bug.severity}`} onClick={onToggle}>
      <header>
        <span className="sev">{bug.severity}</span>
        <h4>{bug.title}</h4>
      </header>
      <small>
        by {reporter} · {new Date(bug.createdAt).toLocaleTimeString('en-US')}
      </small>
      {open && (
        <div className="details">
          <ol>
            {bug.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <p>
            <b>Expected:</b> {bug.expected}
          </p>
          <p>
            <b>Actual:</b> {bug.actual}
          </p>
          {bug.url && (
            <a href={bug.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              {bug.url}
            </a>
          )}
        </div>
      )}
    </article>
  );
}

function TaskList({ world }: { world: World }) {
  if (!world.tasks.length) return <Empty text="The boss has not built the plan yet." />;
  return (
    <div className="tasks">
      {world.tasks.map((task) => (
        <article key={task.id} className={`task ${task.status} ${task.verdict ?? ''}`}>
          <header>
            <span className="state">{task.status === 'done' ? (task.verdict === 'pass' ? '✅' : task.verdict === 'fail' ? '❌' : '⛔') : task.status === 'in_progress' ? '🔄' : '🕓'}</span>
            <h4>{task.title}</h4>
          </header>
          <p>{task.description}</p>
          {task.assignee && <small>Assigned to {nameOf(world, task.assignee)}</small>}
          {task.summary && <p className="result">{task.summary}</p>}
          <ul className="cases">
            {task.cases.map((c) => {
              const r = task.caseResults?.find((x) => x.caseId === c.id);
              return (
                <li key={c.id} className={r?.result ?? 'pending'} title={r?.notes ?? c.title}>
                  <span className="case-id">{c.id}</span>
                  <span className="case-title">{c.title}</span>
                  <span className="case-result">{r ? r.result : '…'}</span>
                </li>
              );
            })}
          </ul>
        </article>
      ))}
    </div>
  );
}

function Team({ world }: { world: World }) {
  if (!world.agents.length) return <Empty text="Nobody in the building." />;
  return (
    <div className="team">
      {world.agents.map((a) => (
        <AgentRow key={a.id} agent={a} />
      ))}
    </div>
  );
}

function AgentRow({ agent }: { agent: AgentSnapshot }) {
  const t = agent.tokens;
  return (
    <article className={`member ${agent.status}`}>
      <span className="swatch" style={{ background: agent.role === 'boss' ? '#c9a227' : agent.appearance.shirt }} />
      <div className="body">
        <header>
          <strong>{agent.role === 'boss' ? '👑 Boss (you)' : agent.name}</strong>
          <span className="status">{STATUS_LABELS[agent.status]}</span>
        </header>
        {agent.activity && <p className="activity">{agent.activity}</p>}
        <div className="tokens">
          <span>in {formatTokens(t.input)}</span>
          <span>out {formatTokens(t.output)}</span>
          <span>cache {formatTokens(t.cacheRead + t.cacheWrite)}</span>
          <span className="cost">${t.costUsd.toFixed(4)}</span>
        </div>
      </div>
    </article>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="empty">{text}</p>;
}
