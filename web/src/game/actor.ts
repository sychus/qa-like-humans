import type { AgentSnapshot, ChatKind } from '../../../shared/events.ts';
import { findPath, TILE, type Point } from './map.ts';
import type { Dir, Pose } from './sprites.ts';

export interface Bubble {
  text: string;
  kind: ChatKind;
  born: number;
  duration: number;
}

const WALK_SPEED = 58; // px per second
const MAX_QUEUED_BUBBLES = 3;

/** Feet position in world pixels for a tile. */
export const tileFeet = (p: Point) => ({ x: p.x * TILE + 8, y: p.y * TILE + 14 });

export class Actor {
  x: number;
  y: number;
  dir: Dir = 'down';
  path: Point[] = [];
  /** Extra off-grid waypoint (walk off-screen when leaving). */
  tailWaypoint: { x: number; y: number } | null = null;
  finalDir: Dir = 'down';
  seated = false;
  wantsSeat = false;
  walking = false;
  walkClock = 0;
  dustClock = 0;
  removeOnArrive = false;
  bubbles: Bubble[] = [];
  popClock = 0;
  targetKey = '';

  constructor(
    public agent: AgentSnapshot,
    start: { x: number; y: number },
  ) {
    this.x = start.x;
    this.y = start.y;
  }

  get tile(): Point {
    return { x: Math.max(0, Math.min(31, Math.floor(this.x / TILE))), y: Math.floor((this.y - 6) / TILE) };
  }

  goTo(goal: Point, opts: { dir: Dir; seat: boolean; offscreenX?: number }) {
    const from = this.tile;
    this.path = findPath(from, goal);
    this.finalDir = opts.dir;
    this.wantsSeat = opts.seat;
    this.seated = false;
    this.tailWaypoint = opts.offscreenX !== undefined ? { x: opts.offscreenX, y: tileFeet(goal).y } : null;
  }

  say(text: string, kind: ChatKind, now: number) {
    const duration = Math.min(7500, Math.max(2600, 1400 + text.length * 45));
    this.bubbles.push({ text, kind, born: 0, duration });
    if (this.bubbles.length > MAX_QUEUED_BUBBLES) this.bubbles.splice(0, this.bubbles.length - MAX_QUEUED_BUBBLES);
    if (this.bubbles.length === 1) this.bubbles[0].born = now;
  }

  currentBubble(now: number): Bubble | undefined {
    const b = this.bubbles[0];
    if (!b) return undefined;
    // Speed through the queue when it backs up.
    const factor = this.bubbles.length > 1 ? 0.6 : 1;
    if (now - b.born > b.duration * factor) {
      this.bubbles.shift();
      if (this.bubbles[0]) this.bubbles[0].born = now;
      return this.bubbles[0];
    }
    return b;
  }

  /** Returns true when the actor finished its route this frame. */
  update(dt: number, onDust: (x: number, y: number) => void): boolean {
    const target = this.path[0] ? tileFeet(this.path[0]) : this.tailWaypoint;
    if (!target) {
      this.walking = false;
      this.dir = this.finalDir;
      this.seated = this.wantsSeat;
      return this.removeOnArrive;
    }

    this.walking = true;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const boost = this.path.length > 12 ? 1.6 : 1;
    const step = WALK_SPEED * boost * dt;

    if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
    else if (dy !== 0) this.dir = dy > 0 ? 'down' : 'up';

    if (dist <= step) {
      this.x = target.x;
      this.y = target.y;
      if (this.path.length) this.path.shift();
      else this.tailWaypoint = null;
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }

    this.walkClock += dt * 9 * boost;
    this.dustClock += dt;
    if (this.dustClock > 0.28) {
      this.dustClock = 0;
      onDust(this.x, this.y);
    }
    return false;
  }

  pose(t: number): Pose {
    if (this.walking) return (['walk0', 'walk1', 'walk2', 'walk3'] as const)[Math.floor(this.walkClock) % 4];
    if (this.seated) {
      const typing = this.agent.status === 'working' || this.agent.status === 'planning' || this.agent.status === 'thinking';
      if (typing) return Math.floor(t * 7) % 2 ? 'type0' : 'type1';
      return 'sit';
    }
    return 'stand';
  }
}
