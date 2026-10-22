/** Office floor plan, in 16px tiles. Everything the renderer and pathfinder need. */

export const TILE = 16;
export const COLS = 32;
export const ROWS = 22;
export const WIDTH = COLS * TILE;
export const HEIGHT = ROWS * TILE;

export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  w: number;
  h: number;
}

export const BOSS_ROOM: Rect = { x: 1, y: 2, w: 10, h: 7 };
export const BOSS_DESK: Rect = { x: 3, y: 4, w: 4, h: 2 };
export const BOSS_SEAT: Point = { x: 5, y: 3 };
export const BOSS_DOOR: Point = { x: 9, y: 9 };
export const LOUNGE: Rect = { x: 1, y: 10, w: 10, h: 6 };

export const VISITOR_SLOTS: Point[] = [
  { x: 3, y: 6 },
  { x: 5, y: 6 },
  { x: 7, y: 6 },
  { x: 4, y: 7 },
  { x: 6, y: 7 },
  { x: 8, y: 7 },
];

export const DESKS: Rect[] = [
  { x: 14, y: 5, w: 3, h: 2 },
  { x: 20, y: 5, w: 3, h: 2 },
  { x: 26, y: 5, w: 3, h: 2 },
  { x: 14, y: 11, w: 3, h: 2 },
  { x: 20, y: 11, w: 3, h: 2 },
  { x: 26, y: 11, w: 3, h: 2 },
];

export const deskSeat = (i: number): Point => ({ x: DESKS[i].x + 1, y: DESKS[i].y - 1 });
/** Standing spot right next to a colleague's chair. */
export const deskSide = (i: number, side: -1 | 1): Point => ({ x: DESKS[i].x + 1 + side, y: DESKS[i].y - 1 });

export const DOOR: Rect = { x: 15, y: 16, w: 2, h: 1 };
export const SIDEWALK_Y = 18;
export const EXITS: Point[] = [
  { x: 0, y: SIDEWALK_Y },
  { x: COLS - 1, y: SIDEWALK_Y },
];

/** Wall decorations (on the 2-tile-tall top wall). */
export const WHITEBOARD: Rect = { x: 6, y: 0, w: 4, h: 2 };
export const BUG_BOARD: Rect = { x: 17, y: 0, w: 7, h: 2 };
export const BOSS_PANEL: Rect = { x: 1, y: 0, w: 5, h: 2 };

export interface Prop {
  kind: 'plant' | 'bookshelf' | 'coffee' | 'cooler' | 'sofa' | 'coffeeTable' | 'printer' | 'server' | 'vending' | 'tallPlant';
  rect: Rect;
}

export const PROPS: Prop[] = [
  { kind: 'bookshelf', rect: { x: 1, y: 2, w: 2, h: 1 } },
  { kind: 'tallPlant', rect: { x: 10, y: 2, w: 1, h: 1 } },
  { kind: 'coffee', rect: { x: 1, y: 10, w: 1, h: 1 } },
  { kind: 'cooler', rect: { x: 2, y: 10, w: 1, h: 1 } },
  { kind: 'vending', rect: { x: 3, y: 10, w: 1, h: 1 } },
  { kind: 'sofa', rect: { x: 2, y: 14, w: 4, h: 1 } },
  { kind: 'coffeeTable', rect: { x: 3, y: 12, w: 2, h: 1 } },
  { kind: 'plant', rect: { x: 10, y: 15, w: 1, h: 1 } },
  { kind: 'plant', rect: { x: 12, y: 15, w: 1, h: 1 } },
  { kind: 'tallPlant', rect: { x: 30, y: 15, w: 1, h: 1 } },
  { kind: 'printer', rect: { x: 29, y: 8, w: 2, h: 1 } },
  { kind: 'server', rect: { x: 30, y: 2, w: 1, h: 1 } },
  { kind: 'plant', rect: { x: 12, y: 2, w: 1, h: 1 } },
];

const key = (x: number, y: number) => y * COLS + x;

function buildWalkable(): boolean[] {
  const grid = new Array<boolean>(COLS * ROWS).fill(false);
  const set = (x: number, y: number, v: boolean) => {
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS) grid[key(x, y)] = v;
  };
  const fill = (r: Rect, v: boolean) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y, v);
  };

  fill({ x: 1, y: 2, w: COLS - 2, h: 14 }, true); // interior
  fill({ x: 0, y: 17, w: COLS, h: 2 }, true); // sidewalk
  fill(DOOR, true);

  // Boss office glass walls with a door.
  fill({ x: 11, y: 2, w: 1, h: 8 }, false);
  fill({ x: 1, y: 9, w: 11, h: 1 }, false);
  set(BOSS_DOOR.x, BOSS_DOOR.y, true);

  fill(BOSS_DESK, false);
  for (const d of DESKS) fill(d, false);
  for (const p of PROPS) fill(p.rect, false);
  return grid;
}

export const WALKABLE = buildWalkable();
export const isWalkable = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS && WALKABLE[key(x, y)];

/** A* on a 4-connected grid. Returns tiles from (excluding) start to (including) goal. */
export function findPath(start: Point, goal: Point): Point[] {
  if (start.x === goal.x && start.y === goal.y) return [];
  const open: Array<{ p: Point; f: number }> = [{ p: start, f: 0 }];
  const came = new Map<number, number>();
  const g = new Map<number, number>([[key(start.x, start.y), 0]]);
  const goalKey = key(goal.x, goal.y);
  const passable = (x: number, y: number) => isWalkable(x, y) || key(x, y) === goalKey;

  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const { p } = open.shift()!;
    const pk = key(p.x, p.y);
    if (pk === goalKey) {
      const path: Point[] = [];
      let k: number | undefined = pk;
      while (k !== undefined && k !== key(start.x, start.y)) {
        path.unshift({ x: k % COLS, y: Math.floor(k / COLS) });
        k = came.get(k);
      }
      return path;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (!passable(nx, ny)) continue;
      const nk = key(nx, ny);
      const ng = (g.get(pk) ?? 0) + 1;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        came.set(nk, pk);
        open.push({ p: { x: nx, y: ny }, f: ng + Math.abs(goal.x - nx) + Math.abs(goal.y - ny) });
      }
    }
  }
  return [goal];
}
