import type { Bug, Task } from '../../../shared/events.ts';
import { BOSS_DESK, BOSS_DOOR, BOSS_PANEL, BUG_BOARD, COLS, DOOR, HEIGHT, TILE, WHITEBOARD, WIDTH, type Prop, type Rect } from './map.ts';

type Ctx = CanvasRenderingContext2D;

const px = (ctx: Ctx, x: number, y: number, w: number, h: number, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
};

/** Deterministic noise so the static floor never "shimmers". */
const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ───────────────────────── static background ─────────────────────────

export function renderBackground(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d')!;

  drawOutside(ctx);
  drawFloors(ctx);
  drawWalls(ctx);
  return canvas;
}

function drawOutside(ctx: Ctx) {
  const T = TILE;
  // sidewalk
  px(ctx, 0, 17 * T, WIDTH, 2 * T, '#bdb6ab');
  for (let x = 0; x < WIDTH; x += 16) px(ctx, x, 17 * T, 1, 2 * T, '#aca497');
  px(ctx, 0, 18 * T, WIDTH, 1, '#aca497');
  px(ctx, 0, 19 * T - 2, WIDTH, 2, '#8d867b');
  // road
  px(ctx, 0, 19 * T, WIDTH, 2 * T, '#3b3f47');
  px(ctx, 0, 19 * T, WIDTH, 1, '#2c2f35');
  for (let x = 4; x < WIDTH; x += 20) px(ctx, x, 20 * T - 1, 10, 2, '#e9cf5a');
  for (let i = 0; i < 90; i++) px(ctx, hash(i, 1) * WIDTH, 19 * T + hash(i, 2) * 2 * T, 1, 1, '#454a53');
  // grass
  px(ctx, 0, 21 * T, WIDTH, T, '#5c9e57');
  for (let i = 0; i < 140; i++) {
    const x = hash(i, 7) * WIDTH;
    const y = 21 * T + hash(i, 9) * T;
    px(ctx, x, y, 1, 2, '#4f8c4c');
    if (i % 9 === 0) px(ctx, x, y, 2, 2, ['#ffd166', '#ef476f', '#f8f9fa'][i % 3]);
  }
  for (let x = 6; x < WIDTH; x += 64) bush(ctx, x, 21 * T + 2);
}

function bush(ctx: Ctx, x: number, y: number) {
  px(ctx, x, y + 4, 14, 8, '#3d7a3f');
  px(ctx, x + 2, y + 1, 10, 6, '#4f9a4f');
  px(ctx, x + 4, y + 2, 3, 2, '#6cbf6a');
}

function drawFloors(ctx: Ctx) {
  const T = TILE;
  // open office carpet
  px(ctx, 11 * T, 2 * T, 20 * T, 14 * T, '#56688c');
  for (let y = 2 * T; y < 16 * T; y += 4)
    for (let x = 11 * T + ((y / 4) % 2) * 2; x < 31 * T; x += 4) px(ctx, x, y, 1, 1, '#5f7296');
  // desk zone rugs
  px(ctx, 13 * T, 3 * T + 8, 17 * T, 5 * T, '#4d5e80');
  px(ctx, 13 * T, 9 * T + 8, 17 * T, 5 * T, '#4d5e80');

  // boss office wood planks
  const bx = 1 * T;
  const by = 2 * T;
  px(ctx, bx, by, 10 * T, 8 * T, '#b98b5e');
  for (let row = 0; row < (7 * T) / 6; row++) {
    const y = by + row * 6;
    px(ctx, bx, y, 10 * T, 1, '#a57a51');
    for (let x = bx + ((row * 13) % 24); x < bx + 10 * T; x += 24) px(ctx, x, y, 1, 6, '#a57a51');
  }
  // boss rug
  px(ctx, 2 * T, 3 * T + 4, 7 * T, 5 * T - 4, '#7a2e3b');
  px(ctx, 2 * T + 3, 3 * T + 7, 7 * T - 6, 5 * T - 10, '#8c3645');
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 1;
  ctx.strokeRect(2 * T + 2.5, 3 * T + 6.5, 7 * T - 5, 5 * T - 9);

  // lounge tiles
  for (let y = 10; y < 16; y++)
    for (let x = 1; x < 11; x++) px(ctx, x * T, y * T, T, T, (x + y) % 2 ? '#e9e2d4' : '#ddd4c3');
  px(ctx, 1 * T, 10 * T, 10 * T, 1, '#c8bfae');

  // entrance mat
  px(ctx, DOOR.x * T - 4, 15 * T + 2, DOOR.w * T + 8, 13, '#3a2f2a');
  for (let x = DOOR.x * T - 2; x < (DOOR.x + DOOR.w) * T + 4; x += 3) px(ctx, x, 15 * T + 4, 1, 9, '#4a3d36');
}

function drawWalls(ctx: Ctx) {
  const T = TILE;
  // top wall: cap + face + baseboard
  px(ctx, 0, 0, WIDTH, 6, '#3d3550');
  px(ctx, 0, 6, WIDTH, 23, '#e8e0d2');
  for (let x = 0; x < WIDTH; x += 32) px(ctx, x, 6, 1, 23, '#ddd3c2');
  px(ctx, 0, 6, WIDTH, 1, '#f6f1e8');
  px(ctx, 0, 28, WIDTH, 4, '#8d7b66');
  px(ctx, 0, 28, WIDTH, 1, '#a8957d');
  // boss office wallpaper (darker, classy)
  px(ctx, T, 6, 10 * T, 22, '#5b4a6b');
  for (let x = T + 4; x < 11 * T; x += 8) px(ctx, x, 8, 1, 18, '#65537a');

  // side walls
  px(ctx, 0, 0, T, 17 * T, '#3d3550');
  px(ctx, (COLS - 1) * T, 0, T, 17 * T, '#3d3550');
  px(ctx, T - 2, 2 * T, 2, 14 * T, '#2c2640');
  px(ctx, (COLS - 1) * T, 2 * T, 2, 14 * T, '#2c2640');

  // bottom (facade) wall with brick face
  const y = 16 * T;
  px(ctx, 0, y, WIDTH, 6, '#3d3550');
  px(ctx, 0, y + 6, WIDTH, 10, '#8a5a44');
  for (let row = 0; row < 2; row++)
    for (let x = (row % 2) * 6; x < WIDTH; x += 12) {
      px(ctx, x, y + 6 + row * 5, 11, 4, '#9a6650');
      px(ctx, x, y + 6 + row * 5, 11, 1, '#a8735b');
    }
  // door opening
  px(ctx, DOOR.x * T, y, DOOR.w * T, T, '#56688c');
  px(ctx, DOOR.x * T - 3, y, 3, T, '#2c2640');
  px(ctx, (DOOR.x + DOOR.w) * T, y, 3, T, '#2c2640');

  // boss office glass walls
  glassWall(ctx, { x: 11 * T + 5, y: 2 * T, w: 6, h: 8 * T });
  glassWall(ctx, { x: T, y: 9 * T + 5, w: 10 * T + 11, h: 6 });
  // door gap on the bottom glass wall
  px(ctx, BOSS_DOOR.x * T, 9 * T + 4, T, 8, '#b98b5e');
  px(ctx, BOSS_DOOR.x * T - 1, 9 * T + 2, 2, 10, '#5a6b7a');
  px(ctx, BOSS_DOOR.x * T + T - 1, 9 * T + 2, 2, 10, '#5a6b7a');
}

function glassWall(ctx: Ctx, r: Rect) {
  ctx.fillStyle = 'rgba(160, 214, 236, 0.55)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  px(ctx, r.x, r.y, r.w, 1, '#5a6b7a');
  px(ctx, r.x, r.y + r.h - 1, r.w, 1, '#5a6b7a');
  if (r.h > r.w) {
    px(ctx, r.x, r.y, 1, r.h, '#5a6b7a');
    px(ctx, r.x + r.w - 1, r.y, 1, r.h, '#5a6b7a');
    for (let y = r.y + 8; y < r.y + r.h; y += 22) px(ctx, r.x + 2, y, 1, 8, 'rgba(255,255,255,0.8)');
  } else {
    for (let x = r.x + 8; x < r.x + r.w; x += 22) px(ctx, x, r.y + 2, 8, 1, 'rgba(255,255,255,0.8)');
  }
}

// ───────────────────────── dynamic wall stuff ─────────────────────────

/** Sky color by local hour, for windows and night lighting. */
export function daylight(mode: 'auto' | 'day' | 'night', now = new Date()): number {
  if (mode === 'day') return 1;
  if (mode === 'night') return 0;
  const h = now.getHours() + now.getMinutes() / 60;
  if (h >= 8 && h <= 18) return 1;
  if (h >= 6 && h < 8) return (h - 6) / 2;
  if (h > 18 && h <= 20) return 1 - (h - 18) / 2;
  return 0;
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

export function drawWindows(ctx: Ctx, day: number, t: number) {
  for (const wx of [12, 25]) {
    const x = wx * TILE + 2;
    const w = 4 * TILE - 4;
    px(ctx, x - 2, 7, w + 4, 20, '#6f6a7d');
    const g = ctx.createLinearGradient(0, 9, 0, 25);
    g.addColorStop(0, mix('#0b1030', '#79c7ff', day));
    g.addColorStop(1, mix('#28204a', '#cdeeff', day));
    ctx.fillStyle = g;
    ctx.fillRect(x, 9, w, 16);
    if (day > 0.4) {
      // drifting cloud
      const cx = x + ((t * 3 + wx * 17) % (w + 20)) - 10;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, 9, w, 16);
      ctx.clip();
      px(ctx, cx, 13, 10, 3, 'rgba(255,255,255,0.9)');
      px(ctx, cx + 3, 11, 5, 2, 'rgba(255,255,255,0.9)');
      ctx.restore();
    } else {
      for (let i = 0; i < 6; i++) {
        const tw = Math.sin(t * 2 + i * 3) > 0.3;
        if (tw) px(ctx, x + hash(i, wx) * w, 10 + hash(wx, i) * 12, 1, 1, '#fff7c2');
      }
    }
    px(ctx, x + w / 2 - 1, 9, 2, 16, '#6f6a7d');
    px(ctx, x, 16, w, 1, '#6f6a7d');
    px(ctx, x - 3, 26, w + 6, 2, '#a8957d');
  }
}

export function drawClock(ctx: Ctx, now: Date) {
  const cx = 11 * TILE + 8;
  const cy = 16;
  ctx.fillStyle = '#2c2640';
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fffaf0';
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();
  const hand = (angle: number, len: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 0.5, cy + 0.5);
    ctx.lineTo(cx + 0.5 + Math.sin(angle) * len, cy + 0.5 - Math.cos(angle) * len);
    ctx.stroke();
  };
  hand(((now.getHours() % 12) + now.getMinutes() / 60) * (Math.PI / 6), 3, '#2c2640');
  hand(now.getMinutes() * (Math.PI / 30), 5, '#2c2640');
  hand(now.getSeconds() * (Math.PI / 30), 5, '#e63946');
}

const TASK_COLORS: Record<string, string> = { pending: '#ffd166', in_progress: '#4cc9f0', pass: '#80ed99', fail: '#ff6b6b', blocked: '#b8b8b8' };

export function drawWhiteboard(ctx: Ctx, tasks: Task[]) {
  const x = WHITEBOARD.x * TILE;
  px(ctx, x - 1, 7, WHITEBOARD.w * TILE + 2, 21, '#9aa1ad');
  px(ctx, x + 1, 9, WHITEBOARD.w * TILE - 2, 17, '#f7f7f2');
  px(ctx, x + 3, 11, 18, 1, '#3a86ff');
  px(ctx, x + 3, 13, 12, 1, '#3a86ff');
  tasks.slice(0, 8).forEach((task, i) => {
    const col = task.status === 'done' ? (TASK_COLORS[task.verdict ?? 'pass'] ?? TASK_COLORS.pass) : TASK_COLORS[task.status];
    const nx = x + 26 + (i % 4) * 9;
    const ny = 11 + Math.floor(i / 4) * 8;
    px(ctx, nx + 1, ny + 1, 7, 6, 'rgba(0,0,0,0.15)');
    px(ctx, nx, ny, 7, 6, col);
    px(ctx, nx + 1, ny + 2, 5, 1, 'rgba(0,0,0,0.25)');
    if (task.status === 'done') px(ctx, nx + 2, ny + 4, 3, 1, 'rgba(0,0,0,0.35)');
  });
  px(ctx, x + 4, 26, WHITEBOARD.w * TILE - 8, 2, '#9aa1ad');
}

const SEVERITY_COLORS: Record<string, string> = { critical: '#ff4d6d', high: '#ff9f1c', medium: '#ffd166', low: '#a0c4ff' };

/** Slot of the n-th bug card on the cork board, used for the flying card target too. */
export function bugCardSlot(i: number): { x: number; y: number } {
  const perRow = 14;
  return { x: BUG_BOARD.x * TILE + 4 + (i % perRow) * 7.6, y: 10 + Math.floor(i / perRow) * 7 };
}

export function drawBugBoard(ctx: Ctx, bugs: Bug[], visible: number) {
  const x = BUG_BOARD.x * TILE;
  const w = BUG_BOARD.w * TILE;
  px(ctx, x - 2, 7, w + 4, 21, '#7a5434');
  px(ctx, x, 9, w, 17, '#c49a62');
  for (let i = 0; i < 40; i++) px(ctx, x + hash(i, 3) * w, 9 + hash(3, i) * 17, 1, 1, '#b3874f');
  bugs.slice(0, Math.min(visible, 28)).forEach((bug, i) => {
    const s = bugCardSlot(i);
    px(ctx, s.x + 1, s.y + 1, 6, 6, 'rgba(0,0,0,0.2)');
    px(ctx, s.x, s.y, 6, 6, '#fdfcf7');
    px(ctx, s.x, s.y, 6, 2, SEVERITY_COLORS[bug.severity]);
    px(ctx, s.x + 1, s.y + 3, 4, 1, '#c9c4b5');
    px(ctx, s.x + 2, s.y - 1, 2, 2, '#e63946');
  });
}

export function drawBossPanel(ctx: Ctx, alarm: boolean, t: number) {
  const x = BOSS_PANEL.x * TILE + 2;
  px(ctx, x - 1, 8, BOSS_PANEL.w * TILE - 2, 19, '#0d0b14');
  px(ctx, x, 9, BOSS_PANEL.w * TILE - 4, 17, alarm && Math.sin(t * 8) > 0 ? '#3a0d16' : '#16131f');
  // beacon on the glass wall corner
  const on = alarm && Math.sin(t * 10) > 0;
  px(ctx, 11 * TILE + 4, 2 * TILE - 3, 8, 4, '#2c2640');
  px(ctx, 11 * TILE + 5, 2 * TILE - 6, 6, 4, on ? '#ff3b3b' : alarm ? '#8a1f2a' : '#4a3f5c');
}

// ───────────────────────── furniture (y-sorted) ─────────────────────────

export function drawDesk(ctx: Ctx, r: Rect, index: number, occupied: boolean, working: boolean, t: number) {
  const x = r.x * TILE;
  const y = r.y * TILE;
  const w = r.w * TILE;
  px(ctx, x + 2, y + 4, w, 30, 'rgba(0,0,0,0.22)');
  px(ctx, x, y, w, 20, '#c49a6c');
  px(ctx, x, y, w, 1, '#dcb588');
  px(ctx, x, y + 19, w, 1, '#a87f55');
  px(ctx, x, y + 20, w, 11, '#8f6a45');
  px(ctx, x + 3, y + 22, 18, 8, '#7d5c3b');
  px(ctx, x + w - 21, y + 22, 18, 8, '#7d5c3b');
  px(ctx, x + 10, y + 25, 4, 1, '#d9c08a');
  px(ctx, x + w - 14, y + 25, 4, 1, '#d9c08a');
  px(ctx, x, y + 31, w, 1, '#5e4530');

  // mug + papers vary per desk
  const mugX = index % 2 ? x + 38 : x + 5;
  px(ctx, mugX, y + 6, 5, 6, '#f2f2f2');
  px(ctx, mugX, y + 6, 5, 1, ['#e85d75', '#3fa7d6', '#59cd90'][index % 3]);
  px(ctx, mugX + 5, y + 8, 1, 2, '#f2f2f2');
  if (occupied && working && Math.sin(t * 2 + index) > 0.6) px(ctx, mugX + 2, y + 3 - ((t * 6) % 3), 1, 2, 'rgba(255,255,255,0.6)');
  const paperX = index % 2 ? x + 4 : x + 36;
  px(ctx, paperX, y + 5, 8, 10, '#fdfcf7');
  px(ctx, paperX + 1, y + 7, 6, 1, '#c9c4b5');
  px(ctx, paperX + 1, y + 9, 5, 1, '#c9c4b5');

  // laptop: back of the lid faces the camera
  const lx = x + 17;
  px(ctx, lx - 1, y + 13, 16, 3, '#9aa1ad');
  px(ctx, lx, y + 2, 14, 12, '#c9ced8');
  px(ctx, lx, y + 2, 14, 1, '#e6e9ef');
  px(ctx, lx + 13, y + 2, 1, 12, '#aab0bc');
  const glow = working ? (Math.sin(t * 6 + index) > 0 ? '#7df9ff' : '#4cc9f0') : occupied ? '#9aa7ff' : '#b7bcc7';
  px(ctx, lx + 6, y + 6, 2, 3, glow);
}

export function drawChair(ctx: Ctx, seatX: number, seatY: number) {
  const x = seatX * TILE;
  const y = seatY * TILE;
  px(ctx, x + 2, y - 2, 12, 13, '#2f3542');
  px(ctx, x + 3, y - 1, 10, 1, '#4a5263');
  px(ctx, x + 1, y + 9, 14, 4, '#262b36');
  px(ctx, x + 7, y + 13, 2, 2, '#1b1f27');
}

export function drawBossDesk(ctx: Ctx, phoneRinging: boolean, thinking: boolean, t: number) {
  const x = BOSS_DESK.x * TILE;
  const y = BOSS_DESK.y * TILE;
  const w = BOSS_DESK.w * TILE;
  px(ctx, x + 3, y + 5, w, 30, 'rgba(0,0,0,0.28)');
  px(ctx, x, y, w, 20, '#7d4632');
  px(ctx, x, y, w, 1, '#9a5a40');
  px(ctx, x, y + 19, w, 1, '#5e3324');
  px(ctx, x, y + 20, w, 12, '#5a2f20');
  px(ctx, x + 4, y + 22, w - 8, 8, '#4c271b');
  px(ctx, x + w / 2 - 8, y + 24, 16, 4, '#c9a227'); // gold nameplate
  px(ctx, x + w / 2 - 7, y + 25, 14, 2, '#e9c46a');

  // big monitor back
  px(ctx, x + 22, y + 1, 20, 13, '#22252e');
  px(ctx, x + 22, y + 1, 20, 1, '#3a3f4b');
  px(ctx, x + 30, y + 14, 4, 3, '#22252e');
  px(ctx, x + 31, y + 6, 2, 2, thinking ? (Math.sin(t * 8) > 0 ? '#ffd166' : '#f4a261') : '#6c757d');
  // lamp
  px(ctx, x + 4, y + 10, 6, 2, '#2c2640');
  px(ctx, x + 6, y + 3, 2, 8, '#2c2640');
  px(ctx, x + 3, y + 1, 8, 3, '#e9c46a');
  // phone
  const shake = phoneRinging ? Math.round(Math.sin(t * 40)) : 0;
  px(ctx, x + w - 14 + shake, y + 6, 10, 7, phoneRinging ? '#e63946' : '#2c2640');
  px(ctx, x + w - 13 + shake, y + 5, 8, 2, phoneRinging ? '#ff6b6b' : '#3d3550');
}

export function drawBossChair(ctx: Ctx, seatX: number, seatY: number) {
  const x = seatX * TILE;
  const y = seatY * TILE;
  px(ctx, x, y - 6, 16, 17, '#22262f');
  px(ctx, x + 2, y - 5, 12, 2, '#3a3f4b');
  px(ctx, x - 1, y + 9, 18, 5, '#1b1f27');
}

export function drawProp(ctx: Ctx, prop: Prop, t: number) {
  const x = prop.rect.x * TILE;
  const y = prop.rect.y * TILE;
  switch (prop.kind) {
    case 'plant':
    case 'tallPlant': {
      const tall = prop.kind === 'tallPlant';
      const sway = Math.round(Math.sin(t * 1.5 + x) * 0.6);
      px(ctx, x + 3, y + 14, 12, 3, 'rgba(0,0,0,0.2)');
      px(ctx, x + 4, y + 8, 8, 7, '#b5603c');
      px(ctx, x + 4, y + 8, 8, 1, '#cf7a52');
      const top = tall ? y - 12 : y - 2;
      px(ctx, x + 2 + sway, top + 4, 12, tall ? 16 : 8, '#3f8f4e');
      px(ctx, x + 4 + sway, top, 8, 6, '#4fa95f');
      px(ctx, x + 1 + sway, top + 7, 4, 4, '#5fb86a');
      px(ctx, x + 11 + sway, top + 5, 4, 4, '#5fb86a');
      px(ctx, x + 6 + sway, top + 1, 2, 2, '#7fd18a');
      break;
    }
    case 'bookshelf': {
      px(ctx, x, y - 12, 32, 26, '#6b4a2f');
      px(ctx, x + 1, y - 11, 30, 1, '#87603e');
      const books = ['#e85d75', '#3fa7d6', '#59cd90', '#fac05e', '#9b5de5', '#f15bb5'];
      for (let shelf = 0; shelf < 2; shelf++)
        for (let i = 0; i < 7; i++) px(ctx, x + 2 + i * 4, y - 9 + shelf * 11, 3, 9, books[(i + shelf * 2) % books.length]);
      break;
    }
    case 'coffee':
      px(ctx, x + 2, y - 8, 12, 20, '#3a3a44');
      px(ctx, x + 4, y - 6, 8, 5, '#23232b');
      px(ctx, x + 5, y + 4, 6, 5, '#fdfcf7');
      px(ctx, x + 11, y - 5, 2, 2, Math.sin(t * 3) > 0 ? '#ff3b3b' : '#8a1f2a');
      if (Math.sin(t * 2) > 0) px(ctx, x + 7, y + 1 - ((t * 5) % 3), 1, 2, 'rgba(255,255,255,0.7)');
      break;
    case 'cooler':
      px(ctx, x + 3, y + 2, 10, 12, '#f2f2f2');
      px(ctx, x + 4, y - 8, 8, 10, '#8fd3ff');
      px(ctx, x + 5, y - 7, 2, 7, '#c7ecff');
      px(ctx, x + 6, y + 6, 4, 2, '#3fa7d6');
      break;
    case 'vending':
      px(ctx, x + 1, y - 12, 14, 26, '#d64545');
      px(ctx, x + 3, y - 10, 8, 14, '#1d1d28');
      for (let i = 0; i < 3; i++) px(ctx, x + 4, y - 8 + i * 4, 6, 2, ['#ffd166', '#80ed99', '#4cc9f0'][i]);
      px(ctx, x + 12, y - 6, 2, 6, '#f2f2f2');
      break;
    case 'sofa':
      px(ctx, x, y - 4, 64, 6, '#3d5c8c');
      px(ctx, x, y + 1, 64, 12, '#4a6fa5');
      for (let i = 0; i < 3; i++) px(ctx, x + 4 + i * 20, y + 2, 17, 7, '#5b82bd');
      px(ctx, x - 2, y - 2, 4, 15, '#3d5c8c');
      px(ctx, x + 62, y - 2, 4, 15, '#3d5c8c');
      break;
    case 'coffeeTable':
      px(ctx, x + 2, y + 4, 30, 10, 'rgba(0,0,0,0.18)');
      px(ctx, x, y + 2, 30, 9, '#a87f55');
      px(ctx, x, y + 2, 30, 1, '#c49a6c');
      px(ctx, x + 6, y + 4, 8, 5, '#e85d75');
      px(ctx, x + 18, y + 4, 4, 4, '#fdfcf7');
      break;
    case 'printer':
      px(ctx, x + 2, y + 2, 28, 12, '#c9ced8');
      px(ctx, x + 2, y + 2, 28, 2, '#e6e9ef');
      px(ctx, x + 8, y - 2, 16, 5, '#fdfcf7');
      px(ctx, x + 24, y + 7, 2, 2, Math.sin(t * 4) > 0 ? '#80ed99' : '#3a7d44');
      break;
    case 'server':
      px(ctx, x + 1, y - 14, 14, 28, '#1d1d28');
      for (let i = 0; i < 6; i++) {
        px(ctx, x + 3, y - 12 + i * 4, 10, 3, '#2c2c3a');
        px(ctx, x + 4, y - 11 + i * 4, 1, 1, Math.sin(t * 7 + i * 1.7) > 0 ? '#80ed99' : '#2c5e3a');
        px(ctx, x + 6, y - 11 + i * 4, 1, 1, Math.sin(t * 11 + i) > 0.5 ? '#4cc9f0' : '#1d3a4a');
      }
      break;
  }
}

/** Sliding glass entrance door. `open` goes 0..1. */
export function drawDoor(ctx: Ctx, open: number) {
  const x = DOOR.x * TILE;
  const y = DOOR.y * TILE;
  const half = TILE;
  const slide = Math.round(open * (half - 2));
  ctx.fillStyle = 'rgba(160, 214, 236, 0.6)';
  ctx.fillRect(x - slide, y + 2, half, 12);
  ctx.fillRect(x + half + slide, y + 2, half, 12);
  px(ctx, x - slide, y + 2, half, 1, '#5a6b7a');
  px(ctx, x + half + slide, y + 2, half, 1, '#5a6b7a');
  px(ctx, x + half - 1 - slide, y + 2, 1, 12, '#5a6b7a');
  px(ctx, x + half + slide, y + 2, 1, 12, '#5a6b7a');
}

export interface Car {
  x: number;
  lane: 0 | 1;
  speed: number;
  color: string;
}

export function drawCar(ctx: Ctx, car: Car) {
  const y = car.lane === 0 ? 19 * TILE + 3 : 20 * TILE + 2;
  const x = Math.round(car.x);
  const dir = car.speed > 0 ? 1 : -1;
  px(ctx, x + 1, y + 10, 26, 2, 'rgba(0,0,0,0.3)');
  px(ctx, x, y + 2, 28, 9, car.color);
  px(ctx, x + 6, y - 2, 15, 5, shadeCar(car.color));
  px(ctx, x + 8, y - 1, 5, 3, '#bfe6ff');
  px(ctx, x + 14, y - 1, 5, 3, '#bfe6ff');
  px(ctx, x + 3, y + 9, 5, 4, '#15151c');
  px(ctx, x + 20, y + 9, 5, 4, '#15151c');
  px(ctx, dir > 0 ? x + 27 : x, y + 4, 1, 2, '#fff3b0');
}

function shadeCar(c: string) {
  return mix(c, '#000000', 0.25);
}
