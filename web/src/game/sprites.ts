import type { Appearance } from '../../../shared/events.ts';

export type Dir = 'down' | 'up' | 'left' | 'right';
export type Pose = 'stand' | 'walk0' | 'walk1' | 'walk2' | 'walk3' | 'sit' | 'type0' | 'type1';

export const SPRITE_W = 16;
export const SPRITE_H = 24;

const OUTLINE = '#1b1625';
const SHOES = '#2a2230';
const EYES = '#241b2f';

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

class Grid {
  cells: (string | null)[] = new Array(SPRITE_W * SPRITE_H).fill(null);
  set(x: number, y: number, c: string) {
    if (x >= 0 && y >= 0 && x < SPRITE_W && y < SPRITE_H) this.cells[y * SPRITE_W + x] = c;
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
  }
  get(x: number, y: number) {
    return x >= 0 && y >= 0 && x < SPRITE_W && y < SPRITE_H ? this.cells[y * SPRITE_W + x] : null;
  }
  outline() {
    const out: Array<[number, number]> = [];
    for (let y = 0; y < SPRITE_H; y++)
      for (let x = 0; x < SPRITE_W; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x + 1, y) || this.get(x - 1, y) || this.get(x, y + 1) || this.get(x, y - 1)) out.push([x, y]);
      }
    for (const [x, y] of out) this.set(x, y, OUTLINE);
  }
  toCanvas(mirror = false): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = SPRITE_W;
    c.height = SPRITE_H;
    const ctx = c.getContext('2d')!;
    for (let y = 0; y < SPRITE_H; y++)
      for (let x = 0; x < SPRITE_W; x++) {
        const col = this.get(x, y);
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(mirror ? SPRITE_W - 1 - x : x, y, 1, 1);
      }
    return c;
  }
}

interface Palette {
  skin: string;
  skinD: string;
  hair: string;
  hairL: string;
  shirt: string;
  shirtD: string;
  pants: string;
  pantsD: string;
}

function palette(a: Appearance): Palette {
  return {
    skin: a.skin,
    skinD: shade(a.skin, -0.18),
    hair: a.hair,
    hairL: shade(a.hair, 0.25),
    shirt: a.shirt,
    shirtD: shade(a.shirt, -0.25),
    pants: a.pants,
    pantsD: shade(a.pants, -0.3),
  };
}

function legs(g: Grid, p: Palette, pose: Pose, dir: Dir) {
  if (pose === 'sit' || pose === 'type0' || pose === 'type1') return;
  const side = dir === 'left' || dir === 'right';
  g.rect(5, 16, 6, 1, p.pantsD); // belt line
  if (side) {
    if (pose === 'walk0' || pose === 'walk2') {
      g.rect(5, 17, 2, 3, p.pants);
      g.rect(9, 17, 2, 3, p.pantsD);
      g.rect(4, 20, 3, 1, SHOES);
      g.rect(9, 20, 3, 1, SHOES);
    } else {
      g.rect(6, 17, 4, 4, p.pants);
      g.rect(8, 17, 1, 4, p.pantsD);
      g.rect(6, 21, 5, 1, SHOES);
    }
    return;
  }
  const leftUp = pose === 'walk0';
  const rightUp = pose === 'walk2';
  g.rect(5, 17, 3, leftUp ? 3 : 4, p.pants);
  g.rect(8, 17, 3, rightUp ? 3 : 4, p.pantsD);
  g.rect(5, leftUp ? 20 : 21, 3, 1, SHOES);
  g.rect(8, rightUp ? 20 : 21, 3, 1, SHOES);
}

function torso(g: Grid, p: Palette, a: Appearance, pose: Pose, dir: Dir, by: number) {
  const side = dir === 'left' || dir === 'right';
  if (side) {
    g.rect(5, 10 + by, 6, 6, p.shirt);
    g.rect(5, 15 + by, 6, 1, p.shirtD);
    const swing = pose === 'walk0' ? -1 : pose === 'walk2' ? 1 : 0;
    g.rect(7 + swing, 11 + by, 2, 4, p.shirtD);
    g.set(7 + swing, 15 + by, p.skin);
    g.set(8 + swing, 15 + by, p.skin);
    return;
  }
  g.rect(4, 10 + by, 8, 6, p.shirt);
  g.rect(4, 15 + by, 8, 1, p.shirtD);
  g.rect(11, 10 + by, 1, 6, p.shirtD);

  const seated = pose === 'sit' || pose === 'type0' || pose === 'type1';
  if (seated) {
    // Arms reaching forward to the keyboard.
    const lUp = pose === 'type0' ? -1 : 0;
    const rUp = pose === 'type1' ? -1 : 0;
    g.rect(3, 11 + by, 1, 3, p.shirtD);
    g.rect(12, 11 + by, 1, 3, p.shirtD);
    g.set(4, 14 + by + lUp, p.skin);
    g.set(11, 14 + by + rUp, p.skin);
  } else {
    const l = pose === 'walk0' ? -1 : pose === 'walk2' ? 1 : 0;
    const r = -l;
    g.rect(3, 11 + by, 1, 4 + l, p.shirtD);
    g.rect(12, 11 + by, 1, 4 + r, p.shirtD);
    g.set(3, 15 + by + l, p.skin);
    g.set(12, 15 + by + r, p.skin);
  }

  if (dir === 'down' && a.accessory === 'tie') {
    g.rect(6, 10 + by, 4, 1, '#f2f2f2');
    g.rect(7, 10 + by, 2, 1, '#b8892a');
    g.rect(7, 11 + by, 2, 4, '#e2b13c');
  }
}

function head(g: Grid, p: Palette, a: Appearance, dir: Dir, by: number) {
  const y0 = 3 + by;
  g.rect(5, y0, 6, 6, p.skin);
  g.rect(5, y0 + 5, 6, 1, p.skinD);
  g.rect(7, y0 + 6, 2, 1, p.skinD); // neck

  if (dir === 'down') {
    g.set(4, y0 + 3, p.skin);
    g.set(11, y0 + 3, p.skin);
    g.set(6, y0 + 3, EYES);
    g.set(9, y0 + 3, EYES);
    g.set(5, y0 + 4, shade(p.skin, -0.05));
    g.set(10, y0 + 4, shade(p.skin, -0.05));
  } else if (dir === 'left') {
    g.set(5, y0 + 3, EYES);
    g.set(4, y0 + 3, p.skin); // nose
  }

  hair(g, p, a, dir, y0);
  accessory(g, a, dir, y0);
}

function hair(g: Grid, p: Palette, a: Appearance, dir: Dir, y0: number) {
  const H = p.hair;
  if (dir === 'up') {
    if (a.hairStyle === 'bald') {
      g.rect(5, y0 + 3, 6, 2, H);
      return;
    }
    g.rect(4, y0 - 1, 8, 6, H);
    g.rect(5, y0 - 1, 3, 1, p.hairL);
    if (a.hairStyle === 'long') g.rect(4, y0 + 5, 8, 4, H);
    if (a.hairStyle === 'bun') g.rect(7, y0 - 3, 2, 2, H);
    return;
  }

  const side = dir === 'left';
  switch (a.hairStyle) {
    case 'bald':
      if (side) g.rect(9, y0 + 2, 2, 2, H);
      else {
        g.rect(4, y0 + 2, 1, 2, H);
        g.rect(11, y0 + 2, 1, 2, H);
      }
      g.set(7, y0, shade(p.skin, 0.3));
      return;
    case 'curly':
      g.rect(4, y0 - 2, 8, 3, H);
      for (let x = 4; x < 12; x += 2) g.set(x, y0 - 2, p.hairL);
      if (side) g.rect(8, y0 + 1, 3, 3, H);
      else {
        g.rect(4, y0 + 1, 1, 3, H);
        g.rect(11, y0 + 1, 1, 3, H);
      }
      return;
    default: {
      g.rect(5, y0 - 1, 6, 2, H);
      g.rect(5, y0 - 1, 2, 1, p.hairL);
      if (side) {
        g.rect(8, y0, 3, 3, H);
        g.set(5, y0 + 1, H);
      } else {
        g.rect(4, y0, 1, 3, H);
        g.rect(11, y0, 1, 3, H);
        g.rect(5, y0 + 1, 2, 1, H);
      }
      if (a.hairStyle === 'long') {
        if (side) g.rect(9, y0 + 3, 2, 6, H);
        else {
          g.rect(4, y0 + 3, 1, 6, H);
          g.rect(11, y0 + 3, 1, 6, H);
        }
      }
      if (a.hairStyle === 'bun') {
        g.rect(7, y0 - 3, 2, 2, H);
        g.set(7, y0 - 3, p.hairL);
      }
    }
  }
}

function accessory(g: Grid, a: Appearance, dir: Dir, y0: number) {
  if (a.accessory === 'glasses' && dir !== 'up') {
    if (dir === 'down') {
      g.rect(5, y0 + 3, 6, 1, '#2d2d3d');
      g.set(6, y0 + 3, '#9ad1ff');
      g.set(9, y0 + 3, '#9ad1ff');
    } else {
      g.rect(4, y0 + 3, 3, 1, '#2d2d3d');
      g.set(5, y0 + 3, '#9ad1ff');
    }
  }
  if (a.accessory === 'headphones') {
    g.rect(4, y0 - 2, 8, 1, '#3a3a48');
    if (dir === 'down' || dir === 'up') {
      g.rect(3, y0 + 1, 2, 3, '#4a4a5c');
      g.rect(11, y0 + 1, 2, 3, '#4a4a5c');
      g.set(3, y0 + 1, '#ff5d8f');
      g.set(12, y0 + 1, '#ff5d8f');
    } else {
      g.rect(8, y0 + 1, 2, 3, '#4a4a5c');
      g.set(8, y0 + 1, '#ff5d8f');
    }
  }
}

const cache = new Map<string, HTMLCanvasElement>();

export function getSprite(a: Appearance, dir: Dir, pose: Pose): HTMLCanvasElement {
  const id = `${JSON.stringify(a)}|${dir}|${pose}`;
  const hit = cache.get(id);
  if (hit) return hit;

  const p = palette(a);
  const g = new Grid();
  const drawDir: Dir = dir === 'right' ? 'left' : dir;
  const bob = pose === 'walk1' || pose === 'walk3' ? -1 : 0;
  const seated = pose === 'sit' || pose === 'type0' || pose === 'type1';
  const by = seated ? 1 : bob;

  legs(g, p, pose, drawDir);
  torso(g, p, a, pose, drawDir, by);
  head(g, p, a, drawDir, by);
  g.outline();

  const canvas = g.toCanvas(dir === 'right');
  cache.set(id, canvas);
  return canvas;
}
