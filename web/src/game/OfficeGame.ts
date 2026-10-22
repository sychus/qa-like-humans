import type { AgentSnapshot, AgentStatus, ChatKind, ServerEvent, TaskStatus, World } from '../../../shared/events.ts';
import { reportClientError } from '../state/api.ts';
import { store } from '../state/store.ts';
import { Actor, tileFeet } from './actor.ts';
import {
  BOSS_DESK,
  BOSS_PANEL,
  BOSS_ROOM,
  BOSS_SEAT,
  BUG_BOARD,
  DESKS,
  DOOR,
  EXITS,
  HEIGHT,
  LOUNGE,
  PROPS,
  TILE,
  VISITOR_SLOTS,
  WHITEBOARD,
  WIDTH,
  deskSeat,
  deskSide,
  type Point,
} from './map.ts';
import {
  bugCardSlot,
  daylight,
  drawBossChair,
  drawBossDesk,
  drawBossPanel,
  drawBugBoard,
  drawCar,
  drawChair,
  drawClock,
  drawDesk,
  drawDoor,
  drawProp,
  drawWhiteboard,
  drawWindows,
  renderBackground,
  type Car,
} from './scenery.ts';
import { getSprite, shade, type Dir } from './sprites.ts';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  gravity: number;
}

interface FlyingCard {
  from: { x: number; y: number };
  to: { x: number; y: number };
  t: number;
  color: string;
}

interface Pop {
  actorId: string;
  icon: string;
  born: number;
}

const SEATED_OFFSET = 10;
const FONT = '"Pixelify Sans", ui-monospace, monospace';

const BUBBLE_COLORS: Record<ChatKind, string> = {
  question: '#4cc9f0',
  answer: '#80ed99',
  briefing: '#ffd166',
  thought: '#c8b6ff',
  system: '#f7a8ff',
  escalation: '#ff4d6d',
};

const SEVERITY_COLORS: Record<string, string> = { critical: '#ff4d6d', high: '#ff9f1c', medium: '#ffd166', low: '#a0c4ff' };

export const STATUS_LABELS: Record<AgentStatus, string> = {
  arriving: 'Arriving',
  at_boss: 'With the boss',
  to_desk: 'Heading to desk',
  working: 'Working',
  asking: 'Asking a colleague',
  waiting_boss: 'Waiting for the boss',
  reporting: 'Reporting',
  leaving: 'Leaving',
  gone: 'Left the building',
  idle: 'Available',
  planning: 'Planning',
  thinking: 'Thinking',
  waiting_human: 'Waiting for your decision',
};

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

const totalTokens = (a: AgentSnapshot) => a.tokens.input + a.tokens.output + a.tokens.cacheRead + a.tokens.cacheWrite;

export class OfficeGame {
  private ctx: CanvasRenderingContext2D;
  private low = document.createElement('canvas');
  private lowCtx: CanvasRenderingContext2D;
  private bg = renderBackground();
  private actors = new Map<string, Actor>();
  private departed = new Set<string>();
  private particles: Particle[] = [];
  private cards: FlyingCard[] = [];
  private pops: Pop[] = [];
  private cars: Car[] = [];
  private carClock = 2;
  private visibleBugs = 0;
  private doorOpen = 0;
  private shownTokens = new Map<string, number>();
  private taskStatus = new Map<string, TaskStatus>();
  private mouse: { x: number; y: number } | null = null;

  private scale = 1;
  private ox = 0;
  private oy = 0;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;
  private raf = 0;
  private last = 0;
  private unsubscribe: Array<() => void> = [];
  private resizeObserver: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.low.width = WIDTH;
    this.low.height = HEIGHT;
    this.lowCtx = this.low.getContext('2d')!;
    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  start() {
    this.resizeObserver.observe(this.canvas.parentElement!);
    this.resize();
    this.unsubscribe.push(store.onEvent((e) => this.onEvent(e)));
    this.unsubscribe.push(store.subscribe(() => this.sync(store.world)));
    this.sync(store.world);
    this.visibleBugs = store.world.bugs.length;

    const move = (e: MouseEvent) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const leave = () => (this.mouse = null);
    this.canvas.addEventListener('mousemove', move);
    this.canvas.addEventListener('mouseleave', leave);
    this.unsubscribe.push(() => {
      this.canvas.removeEventListener('mousemove', move);
      this.canvas.removeEventListener('mouseleave', leave);
    });

    const loop = (ts: number) => {
      // Schedule first: an exception in one frame must never stop the office for good.
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (ts - (this.last || ts)) / 1000);
      this.last = ts;
      try {
        this.frame(dt, ts / 1000);
      } catch (error) {
        // Last line of defense; entities are already isolated inside frame().
        reportClientError('canvas', error);
        unwind(this.ctx);
        unwind(this.lowCtx);
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    for (const u of this.unsubscribe) u();
  }

  // ───────────────────────── state reconciliation ─────────────────────────

  private resize() {
    const parent = this.canvas.parentElement!;
    this.cssW = parent.clientWidth;
    this.cssH = parent.clientHeight;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.scale = Math.min(this.cssW / WIDTH, this.cssH / HEIGHT);
    this.ox = (this.cssW - WIDTH * this.scale) / 2;
    this.oy = (this.cssH - HEIGHT * this.scale) / 2;
  }

  private sync(world: World) {
    const ids = new Set(world.agents.map((a) => a.id));
    for (const id of this.actors.keys()) if (!ids.has(id)) this.actors.delete(id);

    for (const agent of world.agents) {
      let actor = this.actors.get(agent.id);
      if (!actor) {
        // Already walked off-screen: don't respawn while the server catches up.
        if (agent.status === 'gone' || (this.departed.has(agent.id) && agent.place.kind === 'outside')) continue;
        this.departed.delete(agent.id);
        actor = this.spawn(agent);
        this.actors.set(agent.id, actor);
      }
      actor.agent = agent;

      const key = JSON.stringify(agent.place);
      if (key !== actor.targetKey) {
        actor.targetKey = key;
        const target = this.resolvePlace(agent, world);
        actor.goTo(target.tile, target);
      }
      if (agent.place.kind === 'outside' && (agent.status === 'leaving' || agent.status === 'gone')) actor.removeOnArrive = true;
    }

    for (const task of world.tasks) {
      const prev = this.taskStatus.get(task.id);
      if (prev && prev !== 'done' && task.status === 'done' && task.assignee) this.confetti(task.assignee, task.verdict === 'pass');
      this.taskStatus.set(task.id, task.status);
    }
  }

  private spawn(agent: AgentSnapshot): Actor {
    if (agent.role === 'boss') {
      const a = new Actor(agent, tileFeet(BOSS_SEAT));
      a.targetKey = JSON.stringify(agent.place);
      a.seated = a.wantsSeat = true;
      return a;
    }
    const left = agent.deskIndex % 2 === 0;
    const a = new Actor(agent, { x: left ? -20 : WIDTH + 20, y: tileFeet(EXITS[0]).y });
    if (agent.place.kind === 'outside') a.targetKey = JSON.stringify(agent.place);
    return a;
  }

  private resolvePlace(agent: AgentSnapshot, world: World): { tile: Point; dir: Dir; seat: boolean; offscreenX?: number } {
    if (agent.role === 'boss') return { tile: BOSS_SEAT, dir: 'down', seat: true };
    const idx = agent.deskIndex;
    switch (agent.place.kind) {
      case 'outside': {
        const left = idx % 2 === 0;
        return { tile: EXITS[left ? 0 : 1], dir: left ? 'left' : 'right', seat: false, offscreenX: left ? -24 : WIDTH + 24 };
      }
      case 'door':
        return { tile: { x: DOOR.x, y: DOOR.y - 1 }, dir: 'up', seat: false };
      case 'boss':
        return { tile: VISITOR_SLOTS[idx % VISITOR_SLOTS.length], dir: 'up', seat: false };
      case 'desk':
        return { tile: deskSeat(idx), dir: 'down', seat: true };
      case 'colleague': {
        const targetId = agent.place.agentId;
        const target = world.agents.find((a) => a.id === targetId);
        const tIdx = target?.deskIndex ?? 0;
        const side = idx < tIdx ? -1 : 1;
        return { tile: deskSide(tIdx, side), dir: side < 0 ? 'right' : 'left', seat: false };
      }
    }
  }

  private onEvent(e: ServerEvent) {
    const now = performance.now();
    switch (e.type) {
      case 'say':
        this.actors.get(e.agentId)?.say(e.text, e.kind, now);
        break;
      case 'bug': {
        const actor = this.actors.get(e.bug.reporter);
        const slot = bugCardSlot(store.world.bugs.length - 1);
        if (actor) {
          this.pops.push({ actorId: actor.agent.id, icon: '❗', born: now });
          this.cards.push({ from: { x: actor.x, y: actor.y - 18 }, to: slot, t: 0, color: SEVERITY_COLORS[e.bug.severity] });
        } else this.visibleBugs++;
        break;
      }
      case 'decision':
        if (e.decision.status === 'pending') this.pops.push({ actorId: 'boss', icon: '📞', born: now });
        break;
      case 'reset':
        this.actors.clear();
        this.departed.clear();
        this.particles = [];
        this.cards = [];
        this.visibleBugs = 0;
        this.taskStatus.clear();
        this.shownTokens.clear();
        break;
      case 'snapshot':
        this.visibleBugs = e.world.bugs.length;
        break;
    }
  }

  private confetti(agentId: string, success: boolean) {
    const a = this.actors.get(agentId);
    if (!a) return;
    const colors = success ? ['#80ed99', '#ffd166', '#4cc9f0', '#f72585'] : ['#ff6b6b', '#ffd166', '#b8b8b8'];
    for (let i = 0; i < 28; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 50;
      this.particles.push({
        x: a.x,
        y: a.y - 20,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 40,
        life: 0,
        max: 1.1 + Math.random() * 0.6,
        color: colors[i % colors.length],
        size: 1 + (i % 2),
        gravity: 90,
      });
    }
  }

  // ───────────────────────── frame ─────────────────────────

  private frame(dt: number, t: number) {
    const ctx = this.lowCtx;
    const world = store.world;
    const now = performance.now();
    const day = daylight(store.lightMode);
    const boss = world.agents.find((a) => a.role === 'boss');
    const alarm = boss?.status === 'waiting_human';

    // actors
    for (const [id, actor] of this.actors) {
      isolate(`update:${id}`, ctx, () => {
        if (actor.update(dt, (x, y) => this.dust(x, y))) {
          this.actors.delete(id);
          this.departed.add(id);
        }
      });
    }

    ctx.drawImage(this.bg, 0, 0);
    drawWindows(ctx, day, t);
    drawClock(ctx, new Date());
    drawWhiteboard(ctx, world.tasks);
    drawBugBoard(ctx, world.bugs, this.visibleBugs);
    drawBossPanel(ctx, alarm, t);
    this.updateCars(ctx, dt);

    const nearDoor = [...this.actors.values()].some((a) => Math.hypot(a.x - (DOOR.x * TILE + TILE), a.y - (DOOR.y * TILE + 8)) < 30);
    this.doorOpen += ((nearDoor ? 1 : 0) - this.doorOpen) * Math.min(1, dt * 8);
    drawDoor(ctx, this.doorOpen);

    // y-sorted scene
    const occupied = new Map<number, AgentSnapshot>();
    for (const a of world.agents) if (a.role === 'qa' && a.status !== 'gone') occupied.set(a.deskIndex, a);

    const drawables: Array<{ y: number; label?: string; draw: () => void }> = [];
    DESKS.forEach((d, i) => {
      const seat = deskSeat(i);
      const seatedActor = [...this.actors.values()].find((a) => a.agent.deskIndex === i && a.agent.role === 'qa' && a.seated);
      drawables.push({ y: tileFeet(seat).y - 0.5, draw: () => drawChair(ctx, seat.x, seat.y) });
      drawables.push({ y: (d.y + d.h) * TILE, draw: () => drawDesk(ctx, d, i, occupied.has(i), seatedActor?.agent.status === 'working', t) });
    });
    drawables.push({ y: tileFeet(BOSS_SEAT).y - 0.5, draw: () => drawBossChair(ctx, BOSS_SEAT.x, BOSS_SEAT.y) });
    drawables.push({
      y: (BOSS_DESK.y + BOSS_DESK.h) * TILE,
      draw: () => drawBossDesk(ctx, alarm, boss?.status === 'thinking' || boss?.status === 'planning', t),
    });
    for (const prop of PROPS) drawables.push({ y: (prop.rect.y + prop.rect.h) * TILE, draw: () => drawProp(ctx, prop, t) });
    for (const actor of this.actors.values()) drawables.push({ y: actor.y, label: `actor:${actor.agent.id}`, draw: () => this.drawActor(ctx, actor, t) });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) isolate(d.label ?? 'scenery', ctx, d.draw);

    this.updateParticles(ctx, dt);
    this.updateCards(ctx, dt);

    // blit pixel world, then hi-res overlay
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#0d0b14';
    c.fillRect(0, 0, this.cssW, this.cssH);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.low, this.ox, this.oy, WIDTH * this.scale, HEIGHT * this.scale);

    this.drawLighting(c, day, t, world);
    this.drawLabels(c, world, alarm, t);
    this.drawPlaques(c, world, dt);
    c.save();
    c.beginPath();
    c.rect(this.ox, 0, WIDTH * this.scale, this.cssH);
    c.clip();
    this.drawActorOverlays(c, now, t);
    this.drawPops(c, now);
    c.restore();
    this.drawTooltip(c);
  }

  private updateCars(ctx: CanvasRenderingContext2D, dt: number) {
    this.carClock -= dt;
    if (this.carClock <= 0) {
      this.carClock = 3 + Math.random() * 6;
      const lane = Math.random() > 0.5 ? 0 : 1;
      const speed = (lane === 0 ? 1 : -1) * (60 + Math.random() * 50);
      const colors = ['#e63946', '#457b9d', '#f4a261', '#2a9d8f', '#e9c46a', '#f1faee', '#6d597a'];
      this.cars.push({ x: speed > 0 ? -40 : WIDTH + 10, lane, speed, color: colors[Math.floor(Math.random() * colors.length)] });
    }
    this.cars = this.cars.filter((car) => car.x > -50 && car.x < WIDTH + 50);
    for (const car of this.cars) {
      car.x += car.speed * dt;
      drawCar(ctx, car);
    }
  }

  private dust(x: number, y: number) {
    this.particles.push({ x: x + (Math.random() - 0.5) * 4, y: y - 1, vx: (Math.random() - 0.5) * 8, vy: -6, life: 0, max: 0.45, color: 'rgba(255,255,255,0.5)', size: 1, gravity: 0 });
  }

  private updateParticles(ctx: CanvasRenderingContext2D, dt: number) {
    this.particles = this.particles.filter((p) => (p.life += dt) < p.max);
    for (const p of this.particles) {
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  private updateCards(ctx: CanvasRenderingContext2D, dt: number) {
    const landed: FlyingCard[] = [];
    for (const card of this.cards) {
      card.t += dt / 1.1;
      if (card.t >= 1) {
        landed.push(card);
        continue;
      }
      const e = 1 - Math.pow(1 - card.t, 3);
      const x = card.from.x + (card.to.x - card.from.x) * e;
      const y = card.from.y + (card.to.y - card.from.y) * e - Math.sin(card.t * Math.PI) * 40;
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(Math.sin(card.t * 12) * 0.4);
      ctx.fillStyle = '#fdfcf7';
      ctx.fillRect(-3, -3, 7, 7);
      ctx.fillStyle = card.color;
      ctx.fillRect(-3, -3, 7, 2);
      ctx.restore();
    }
    for (const card of landed) {
      this.visibleBugs++;
      for (let i = 0; i < 10; i++)
        this.particles.push({ x: card.to.x + 3, y: card.to.y + 3, vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 50, life: 0, max: 0.5, color: card.color, size: 1, gravity: 0 });
    }
    this.cards = this.cards.filter((c) => c.t < 1);
  }

  private drawActor(ctx: CanvasRenderingContext2D, actor: Actor, t: number) {
    const pose = actor.pose(t);
    const sprite = getSprite(actor.agent.appearance, actor.dir, pose);
    const offset = actor.seated ? SEATED_OFFSET : 0;
    if (!actor.seated) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(Math.round(actor.x), Math.round(actor.y), 5, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.drawImage(sprite, Math.round(actor.x - 8), Math.round(actor.y - 22 + offset));
  }

  // ───────────────────────── hi-res overlay ─────────────────────────

  private toScreen(x: number, y: number) {
    return { x: this.ox + x * this.scale, y: this.oy + y * this.scale };
  }

  private fontSize(base: number) {
    return Math.max(9, Math.min(base * 1.6, base * (this.scale / 2.4)));
  }

  private drawLighting(c: CanvasRenderingContext2D, day: number, t: number, world: World) {
    const s = this.scale;
    const glow = (x: number, y: number, r: number, color: string) => {
      const p = this.toScreen(x, y);
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * s);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(p.x - r * s, p.y - r * s, r * 2 * s, r * 2 * s);
    };

    c.save();
    if (day < 1) {
      c.fillStyle = `rgba(8, 10, 40, ${(1 - day) * 0.58})`;
      c.fillRect(this.ox, this.oy, WIDTH * s, HEIGHT * s);
    }
    c.globalCompositeOperation = 'lighter';
    const night = 1 - day;
    // window light shafts during the day
    if (day > 0) {
      for (const wx of [12, 25]) {
        const a = this.toScreen(wx * TILE, 28);
        const b = this.toScreen((wx + 4) * TILE, 28);
        const grad = c.createLinearGradient(0, a.y, 0, a.y + 90 * s);
        grad.addColorStop(0, `rgba(255, 236, 190, ${0.1 * day})`);
        grad.addColorStop(1, 'rgba(255, 236, 190, 0)');
        c.fillStyle = grad;
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.lineTo(b.x + 30 * s, a.y + 90 * s);
        c.lineTo(a.x + 30 * s, a.y + 90 * s);
        c.closePath();
        c.fill();
      }
    }
    // laptops of working testers
    for (const agent of world.agents) {
      if (agent.role !== 'qa' || agent.status !== 'working') continue;
      const d = DESKS[agent.deskIndex];
      const flicker = 0.85 + Math.sin(t * 9 + agent.deskIndex) * 0.15;
      glow(d.x * TILE + 24, d.y * TILE + 6, 26, `rgba(76, 201, 240, ${(0.16 + night * 0.3) * flicker})`);
    }
    // boss lamp & alarm
    glow(BOSS_DESK.x * TILE + 7, BOSS_DESK.y * TILE + 4, 34, `rgba(255, 200, 120, ${0.08 + night * 0.35})`);
    if (world.agents.find((a) => a.role === 'boss')?.status === 'waiting_human') {
      const pulse = (Math.sin(t * 8) + 1) / 2;
      glow(BOSS_ROOM.x * TILE + 80, BOSS_ROOM.y * TILE + 56, 90, `rgba(255, 40, 60, ${0.12 + pulse * 0.18})`);
    }
    // ceiling lights at night
    if (night > 0) {
      for (const [x, y] of [
        [6, 5],
        [18, 8],
        [26, 8],
        [6, 12],
        [18, 14],
        [26, 14],
      ])
        glow(x * TILE, y * TILE, 60, `rgba(255, 230, 180, ${night * 0.14})`);
    }
    c.restore();

    // vignette
    const v = c.createRadialGradient(this.cssW / 2, this.cssH / 2, Math.min(this.cssW, this.cssH) * 0.35, this.cssW / 2, this.cssH / 2, Math.max(this.cssW, this.cssH) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = v;
    c.fillRect(0, 0, this.cssW, this.cssH);
  }

  private text(c: CanvasRenderingContext2D, str: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', weight = 600) {
    c.font = `${weight} ${size}px ${FONT}`;
    c.textAlign = align;
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillText(str, x + 1, y + 1);
    c.fillStyle = color;
    c.fillText(str, x, y);
  }

  private drawLabels(c: CanvasRenderingContext2D, world: World, alarm: boolean, t: number) {
    const fs = this.fontSize(7);
    const label = (str: string, tx: number, ty: number, color = 'rgba(255,255,255,0.55)') => {
      const p = this.toScreen(tx, ty);
      this.text(c, str, p.x, p.y, fs, color, 'center', 700);
    };
    if (!alarm) label("BOSS'S OFFICE", (BOSS_ROOM.x + BOSS_ROOM.w / 2) * TILE, (BOSS_ROOM.y + BOSS_ROOM.h) * TILE - 5, 'rgba(255,220,150,0.6)');
    label('LOUNGE', (LOUNGE.x + LOUNGE.w / 2) * TILE + 20, (LOUNGE.y + 2) * TILE + 6, 'rgba(60,50,70,0.5)');
    this.drawBranding(c, t);

    const done = world.tasks.filter((x) => x.status === 'done').length;
    const wb = this.toScreen((WHITEBOARD.x + WHITEBOARD.w / 2) * TILE, 3);
    this.text(c, world.tasks.length ? `TASKS ${done}/${world.tasks.length}` : 'TASKS', wb.x, wb.y, this.fontSize(5.5), '#fff', 'center', 700);
    const bb = this.toScreen((BUG_BOARD.x + BUG_BOARD.w / 2) * TILE, 3);
    this.text(c, `🐞 BUGS ${world.bugs.length}`, bb.x, bb.y, this.fontSize(5.5), '#fff', 'center', 700);

    // boss LED panel
    const boss = world.agents.find((a) => a.role === 'boss');
    const panel = this.toScreen(BOSS_PANEL.x * TILE + 4, 13);
    const led = alarm && Math.sin(t * 8) > 0 ? '#ff6b6b' : '#7dffb2';
    this.text(c, '👑 BOSS', panel.x, panel.y, this.fontSize(5), '#ffd166', 'left', 700);
    this.text(c, boss ? `${formatTokens(this.animatedTokens(boss, 0))} tok · $${boss.tokens.costUsd.toFixed(3)}` : '— empty —', panel.x, panel.y + 9 * this.scale, this.fontSize(4.6), led, 'left', 600);

    if (alarm) {
      const p = this.toScreen((BOSS_ROOM.x + BOSS_ROOM.w / 2) * TILE, (BOSS_ROOM.y + BOSS_ROOM.h) * TILE - 6);
      const pulse = 1 + Math.sin(t * 6) * 0.06;
      c.save();
      c.translate(p.x, p.y);
      c.scale(pulse, pulse);
      const w = 190 * Math.min(1.3, this.scale / 2.4);
      const h = 24 * Math.min(1.3, this.scale / 2.4);
      c.fillStyle = 'rgba(180, 20, 40, 0.92)';
      roundRect(c, -w / 2, -h / 2, w, h, 8);
      c.fill();
      this.text(c, '📞 BOSS, YOU ARE NEEDED!', 0, 0, this.fontSize(7), '#fff', 'center', 700);
      c.restore();
    }
  }

  /** Blackthorn.io: a neon sign on the facade and the logo woven into the QA floor carpet. */
  private drawBranding(c: CanvasRenderingContext2D, t: number) {
    const s = this.scale;
    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';

    // carpet logo in the aisle between desk rows
    const floor = this.toScreen(21.5 * TILE, 8.6 * TILE);
    c.font = `700 ${15 * s}px ${FONT}`;
    c.letterSpacing = `${2 * s}px`;
    c.fillStyle = 'rgba(0, 0, 0, 0.18)';
    c.fillText('BLACKTHORN.IO', floor.x + s, floor.y + s);
    c.fillStyle = 'rgba(255, 255, 255, 0.13)';
    c.fillText('BLACKTHORN.IO', floor.x, floor.y);

    // neon sign on the facade, left of the entrance
    const x0 = this.ox + 2 * TILE * s;
    const x1 = this.ox + (DOOR.x - 1) * TILE * s;
    const y0 = this.oy + (DOOR.y * TILE + 1) * s;
    const h = 14 * s;
    c.fillStyle = '#120f1c';
    c.beginPath();
    c.roundRect(x0, y0, x1 - x0, h, 3 * s);
    c.fill();
    c.strokeStyle = '#3a3150';
    c.lineWidth = Math.max(1, s * 0.6);
    c.stroke();

    const flicker = Math.sin(t * 23) > 0.97 ? 0.55 : 1;
    const pulse = 0.75 + Math.sin(t * 2) * 0.25;
    c.font = `700 ${10.5 * s}px ${FONT}`;
    c.letterSpacing = `${1.5 * s}px`;
    c.shadowColor = `rgba(125, 249, 255, ${pulse})`;
    c.shadowBlur = 14 * pulse;
    c.fillStyle = `rgba(190, 252, 255, ${flicker})`;
    c.fillText('BLACKTHORN.IO', (x0 + x1) / 2, y0 + h / 2 + s * 0.5);
    c.restore();

    // small plate over the door
    const door = this.toScreen((DOOR.x + DOOR.w / 2) * TILE, DOOR.y * TILE + 11);
    this.text(c, 'QA HQ', door.x, door.y, this.fontSize(5.5), '#ffe8a3', 'center', 700);
  }

  /** Token counters roll up smoothly instead of jumping. */
  private animatedTokens(agent: AgentSnapshot, dt: number): number {
    const target = totalTokens(agent);
    const shown = this.shownTokens.get(agent.id) ?? 0;
    const next = dt === 0 ? shown || target : shown + (target - shown) * Math.min(1, dt * 4);
    this.shownTokens.set(agent.id, Math.abs(target - next) < 1 ? target : next);
    return next;
  }

  private drawPlaques(c: CanvasRenderingContext2D, world: World, dt: number) {
    const fs = this.fontSize(5.2);
    const boss = world.agents.find((a) => a.role === 'boss');
    if (boss) this.animatedTokens(boss, dt);

    DESKS.forEach((d, i) => isolate(`plaque:${i}`, c, () => {
      const agent = world.agents.find((a) => a.role === 'qa' && a.deskIndex === i && a.status !== 'gone');
      const p = this.toScreen((d.x + d.w / 2) * TILE, (d.y + d.h) * TILE + 6);
      const w = (d.w * TILE + 6) * this.scale;
      const h = fs * 2.6;
      c.fillStyle = agent ? 'rgba(13, 11, 20, 0.82)' : 'rgba(13, 11, 20, 0.45)';
      roundRect(c, p.x - w / 2, p.y - 2, w, h, 5);
      c.fill();
      if (!agent) {
        this.text(c, '— free —', p.x, p.y + h / 2 - 2, fs, 'rgba(255,255,255,0.35)', 'center', 400);
        return;
      }
      c.strokeStyle = agent.appearance.shirt;
      c.lineWidth = 1.5;
      roundRect(c, p.x - w / 2, p.y - 2, w, h, 5);
      c.stroke();
      const dotColor = agent.status === 'working' ? '#80ed99' : agent.status === 'waiting_boss' || agent.status === 'asking' ? '#ffd166' : '#a0a0b0';
      c.fillStyle = dotColor;
      c.beginPath();
      c.arc(p.x - w / 2 + 7, p.y + fs * 0.6, 2.5, 0, Math.PI * 2);
      c.fill();
      this.text(c, agent.name, p.x - w / 2 + 13, p.y + fs * 0.6, fs, shade(agent.appearance.shirt, 0.35), 'left', 700);
      this.text(c, `$${agent.tokens.costUsd.toFixed(3)}`, p.x + w / 2 - 6, p.y + fs * 0.6, fs * 0.9, '#ffd166', 'right', 600);
      this.text(c, `⚡ ${formatTokens(this.animatedTokens(agent, dt))} tokens`, p.x - w / 2 + 7, p.y + fs * 1.75, fs * 0.9, '#7dffb2', 'left', 500);
    }));
  }

  private drawActorOverlays(c: CanvasRenderingContext2D, now: number, t: number) {
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
    const items = [...this.actors.values()].sort((a, b) => a.x - b.x);

    for (const actor of items) isolate(`overlay:${actor.agent.id}`, c, () => {
      const offset = actor.seated ? SEATED_OFFSET : 0;
      const head = this.toScreen(actor.x, actor.y - 24 + offset);
      const bubble = actor.currentBubble(now);
      const agent = actor.agent;

      if (bubble) {
        this.drawBubble(c, actor, bubble.text, bubble.kind, head, now - bubble.born, bubble.duration, placed);
        return;
      }

      // name tag
      const fs = this.fontSize(5);
      const isBoss = agent.role === 'boss';
      const name = isBoss ? '👑 You' : agent.name;
      c.font = `700 ${fs}px ${FONT}`;
      const tw = c.measureText(name).width + 10;
      c.fillStyle = isBoss ? 'rgba(201, 162, 39, 0.9)' : 'rgba(13, 11, 20, 0.75)';
      roundRect(c, head.x - tw / 2, head.y - fs - 4, tw, fs + 5, 4);
      c.fill();
      this.text(c, name, head.x, head.y - fs / 2 - 1.5, fs, '#fff');

      // activity chip / status icon
      let chip: string | undefined;
      if (agent.status === 'working' && agent.activity && actor.seated) chip = agent.activity;
      if (isBoss && (agent.status === 'thinking' || agent.status === 'planning')) chip = agent.activity ?? `💭 Thinking${'.'.repeat(1 + (Math.floor(t * 3) % 3))}`;
      if (agent.status === 'waiting_boss') chip = '⏳ Waiting for an answer';
      if (chip) {
        const cs = this.fontSize(4.6);
        const text = chip.length > 34 ? `${chip.slice(0, 33)}…` : chip;
        c.font = `600 ${cs}px ${FONT}`;
        const cw = c.measureText(text).width + 10;
        const cy = head.y - fs - 8 - cs;
        c.fillStyle = 'rgba(255,255,255,0.92)';
        roundRect(c, head.x - cw / 2, cy - cs / 2 - 2, cw, cs + 4, 4);
        c.fill();
        c.fillStyle = '#1b1625';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(text, head.x, cy);
      }
    });
  }

  private drawBubble(
    c: CanvasRenderingContext2D,
    actor: Actor,
    text: string,
    kind: ChatKind,
    head: { x: number; y: number },
    age: number,
    duration: number,
    placed: Array<{ x: number; y: number; w: number; h: number }>,
  ) {
    const fs = this.fontSize(5.6);
    const maxW = Math.max(150, Math.min(260, 110 * (this.scale / 2.4) * 1.6));
    c.font = `500 ${fs}px ${FONT}`;
    const lines = wrap(c, text, maxW - 16).slice(0, 5);
    if (wrap(c, text, maxW - 16).length > 5) lines[4] = `${lines[4].slice(0, -2)}…`;
    const lineH = fs * 1.25;
    const w = Math.min(maxW, Math.max(...lines.map((l) => c.measureText(l).width)) + 16);
    const nameH = fs * 1.1;
    const h = lines.length * lineH + nameH + 12;

    let x = Math.max(4, Math.min(this.cssW - w - 4, head.x - w / 2));
    let y = head.y - h - 10;
    // avoid overlapping other bubbles
    for (let guard = 0; guard < 8; guard++) {
      const hit = placed.find((r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y);
      if (!hit) break;
      y = hit.y - h - 6;
    }
    y = Math.max(4, y);
    placed.push({ x, y, w, h });

    const appear = Math.min(1, age / 180);
    const fade = Math.min(1, Math.max(0, (duration - age) / 300));
    const pop = 0.7 + 0.3 * easeOutBack(appear);
    c.save();
    c.globalAlpha = Math.min(appear * 1.5, fade, 1);
    c.translate(head.x, head.y - 6);
    c.scale(pop, pop);
    c.translate(-head.x, -(head.y - 6));

    const color = BUBBLE_COLORS[kind];
    c.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(c, x + 2, y + 3, w, h, 8);
    c.fill();
    c.fillStyle = '#fffdf7';
    roundRect(c, x, y, w, h, 8);
    c.fill();
    c.strokeStyle = color;
    c.lineWidth = 2;
    roundRect(c, x, y, w, h, 8);
    c.stroke();
    // tail
    const tx = Math.max(x + 10, Math.min(x + w - 10, head.x));
    c.fillStyle = '#fffdf7';
    c.beginPath();
    c.moveTo(tx - 5, y + h - 1);
    c.lineTo(head.x, head.y - 4);
    c.lineTo(tx + 5, y + h - 1);
    c.closePath();
    c.fill();
    c.strokeStyle = color;
    c.beginPath();
    c.moveTo(tx - 5, y + h);
    c.lineTo(head.x, head.y - 4);
    c.lineTo(tx + 5, y + h);
    c.stroke();

    const isBoss = actor.agent.role === 'boss';
    this.text(c, isBoss ? '👑 Boss' : actor.agent.name, x + 8, y + 6 + nameH / 2, fs * 0.85, shade(isBoss ? '#c9a227' : actor.agent.appearance.shirt, -0.2), 'left', 700);
    c.fillStyle = '#1b1625';
    c.font = `500 ${fs}px ${FONT}`;
    c.textAlign = 'left';
    c.textBaseline = 'top';
    lines.forEach((line, i) => c.fillText(line, x + 8, y + 8 + nameH + i * lineH));
    c.restore();
  }

  private drawPops(c: CanvasRenderingContext2D, now: number) {
    this.pops = this.pops.filter((p) => now - p.born < 1400);
    for (const pop of this.pops) {
      const actor = this.actors.get(pop.actorId);
      if (!actor) continue;
      const age = (now - pop.born) / 1400;
      const offset = actor.seated ? SEATED_OFFSET : 0;
      const p = this.toScreen(actor.x + 9, actor.y - 26 + offset);
      c.save();
      c.globalAlpha = 1 - age;
      c.font = `${this.fontSize(10) * (1 + easeOutBack(Math.min(1, age * 4)) * 0.3)}px ${FONT}`;
      c.textAlign = 'center';
      c.fillText(pop.icon, p.x, p.y - age * 20);
      c.restore();
    }
  }

  private drawTooltip(c: CanvasRenderingContext2D) {
    if (!this.mouse) return;
    const wx = (this.mouse.x - this.ox) / this.scale;
    const wy = (this.mouse.y - this.oy) / this.scale;
    const actor = [...this.actors.values()].find((a) => {
      const off = a.seated ? SEATED_OFFSET : 0;
      return Math.abs(a.x - wx) < 8 && wy > a.y - 22 + off && wy < a.y + off;
    });
    if (!actor) {
      this.canvas.style.cursor = 'default';
      return;
    }
    this.canvas.style.cursor = 'pointer';
    const a = actor.agent;
    const lines = [
      a.role === 'boss' ? '👑 Boss (you)' : `🧪 ${a.name}`,
      `Status: ${STATUS_LABELS[a.status]}`,
      a.activity ? `Doing: ${a.activity.slice(0, 40)}` : '',
      `Input: ${formatTokens(a.tokens.input)} · Output: ${formatTokens(a.tokens.output)}`,
      `Cache: ${formatTokens(a.tokens.cacheRead)} read · ${formatTokens(a.tokens.cacheWrite)} written`,
      `Cost: $${a.tokens.costUsd.toFixed(4)}`,
      a.role === 'qa' ? `Tasks completed: ${a.tasksDone}` : '',
    ].filter(Boolean);
    const fs = 12;
    c.font = `500 ${fs}px Inter, sans-serif`;
    const w = Math.max(...lines.map((l) => c.measureText(l).width)) + 20;
    const h = lines.length * 17 + 12;
    const x = Math.min(this.cssW - w - 8, this.mouse.x + 14);
    const y = Math.min(this.cssH - h - 8, this.mouse.y + 14);
    c.fillStyle = 'rgba(13, 11, 20, 0.94)';
    roundRect(c, x, y, w, h, 8);
    c.fill();
    c.strokeStyle = a.role === 'boss' ? '#c9a227' : a.appearance.shirt;
    c.lineWidth = 1.5;
    roundRect(c, x, y, w, h, 8);
    c.stroke();
    c.textAlign = 'left';
    c.textBaseline = 'top';
    lines.forEach((l, i) => {
      c.fillStyle = i === 0 ? '#fff' : '#cfcbe0';
      c.font = `${i === 0 ? 700 : 500} ${fs}px Inter, sans-serif`;
      c.fillText(l, x + 10, y + 8 + i * 17);
    });
  }
}

/**
 * Runs one entity's update/draw in isolation. A single malformed agent used to throw on every
 * frame and leave the whole office black; now that entity is skipped and reported, the rest renders.
 * A throw between someone's save() and restore() leaves alpha/clip/transform dirty, so on failure
 * the context is unwound back to a clean state (restore() on an empty stack is a no-op).
 */
function isolate(label: string, c: CanvasRenderingContext2D, fn: () => void): void {
  c.save();
  try {
    fn();
    c.restore();
  } catch (error) {
    reportClientError(`canvas:${label}`, error);
    unwind(c);
  }
}

function unwind(c: CanvasRenderingContext2D): void {
  for (let i = 0; i < 16; i++) c.restore();
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.shadowBlur = 0;
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

function wrap(c: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.replace(/\s+/g, ' ').split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (c.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function easeOutBack(x: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
