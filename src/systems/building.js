// Placement, selling, walls, doors, desk assignment, decoration score, renting the full floor.
import { DATA } from '../data.js';
import { MAP_W, MAP_H, SPAWN, RENT_FULL, EXPAND_COST, EXPAND_REP } from '../config.js';
import { spend, fmtMoney } from './economy.js';
import { toast } from './notify.js';
import { repathAll, releaseFurniture } from '../sim/agents.js';

export const WALL_COST = 20;
export const DOOR_COST = 60;

export function rebuildOcc(g) {
  g.occ = new Int32Array(MAP_W * MAP_H);
  g.seatOcc = new Int32Array(MAP_W * MAP_H);
  for (const f of g.furniture) {
    const d = DATA.furnById[f.type];
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) g.occ[(f.y + y) * MAP_W + f.x + x] = f.id;
    if (d.seat) g.seatOcc[(f.y + d.seat[1]) * MAP_W + f.x + d.seat[0]] = f.id;
  }
}

const reserved = (x, y) => x === SPAWN.x && (y === SPAWN.y || y === SPAWN.y + 1);
const inMap = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
const isBorder = (x, y) => x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;

function freeTile(g, x, y) {
  return inMap(x, y) && g.tiles[y][x] === '.' && !g.occ[y * MAP_W + x] && !g.seatOcc[y * MAP_W + x] && !reserved(x, y);
}

export function canPlace(g, def, tx, ty) {
  for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) if (!freeTile(g, tx + x, ty + y)) return false;
  if (def.seat && !freeTile(g, tx + def.seat[0], ty + def.seat[1])) return false;
  return true;
}

export function layoutChanged(g) {
  rebuildOcc(g);
  g.staticDirty = true;
  g.decoDirty = true;
  repathAll(g);
}

export function addFurniture(g, type, x, y) {
  const f = { id: g.nextId++, type, x, y, users: [] };
  g.furniture.push(f);
  g.furnById[f.id] = f;
  return f;
}

export function placeFurniture(g, type, tx, ty) {
  const def = DATA.furnById[type];
  if (!canPlace(g, def, tx, ty)) return 'blocked';
  if (g.money < def.price) return 'money';
  spend(g, def.price, 'furniture');
  addFurniture(g, type, tx, ty);
  layoutChanged(g);
  if (def.desk) assignDesks(g);
  return 'ok';
}

export function furnitureAt(g, x, y) {
  if (!inMap(x, y)) return null;
  const id = g.occ[y * MAP_W + x] || g.seatOcc[y * MAP_W + x];
  return id ? g.furnById[id] : null;
}

export function sellFurniture(g, f) {
  const def = DATA.furnById[f.type];
  const refund = Math.floor(def.price / 2);
  g.money += refund;
  g.month.furniture -= refund;
  g.furniture = g.furniture.filter((x) => x !== f);
  delete g.furnById[f.id];
  releaseFurniture(g, f);
  for (const a of g.agents) if (a.desk === f.id) a.desk = null;
  layoutChanged(g);
  assignDesks(g);
  return refund;
}

export function wallLine(sx, sy, ex, ey) {
  const out = [];
  if (Math.abs(ex - sx) >= Math.abs(ey - sy)) {
    const a = Math.min(sx, ex), b = Math.max(sx, ex);
    for (let x = a; x <= b; x++) out.push({ x, y: sy });
  } else {
    const a = Math.min(sy, ey), b = Math.max(sy, ey);
    for (let y = a; y <= b; y++) out.push({ x: sx, y });
  }
  return out;
}

export const canWall = (g, x, y) => freeTile(g, x, y);

export function buildWalls(g, tiles) {
  let n = 0;
  for (const t of tiles) {
    if (!canWall(g, t.x, t.y) || g.money < WALL_COST) continue;
    g.tiles[t.y][t.x] = 'W';
    spend(g, WALL_COST, 'building');
    n++;
  }
  if (n) layoutChanged(g);
  return n;
}

export const canDoor = (g, x, y) => inMap(x, y) && !isBorder(x, y) && g.tiles[y][x] === 'W';

export function makeDoor(g, x, y) {
  if (!canDoor(g, x, y) || g.money < DOOR_COST) return false;
  g.tiles[y][x] = 'D';
  spend(g, DOOR_COST, 'building');
  layoutChanged(g);
  return true;
}

export const canRemoveWall = (g, x, y) => inMap(x, y) && !isBorder(x, y) && (g.tiles[y][x] === 'W' || g.tiles[y][x] === 'D');

export function removeWall(g, x, y) {
  if (!canRemoveWall(g, x, y)) return false;
  g.tiles[y][x] = '.';
  layoutChanged(g);
  return true;
}

export const desks = (g) => g.furniture.filter((f) => DATA.furnById[f.type].desk);

export function freeDeskCount(g) {
  const taken = new Set(g.agents.map((a) => a.desk).filter((d) => d != null));
  return desks(g).filter((f) => !taken.has(f.id)).length;
}

export function assignDesks(g) {
  const taken = new Set(g.agents.map((a) => a.desk).filter((d) => d != null));
  const free = desks(g).filter((f) => !taken.has(f.id));
  for (const a of g.agents) if (a.desk == null && free.length) a.desk = free.shift().id;
}

// Mood bonus per desk from decoration within 5 tiles (max +15).
export function computeDeco(g) {
  const decos = g.furniture.filter((f) => DATA.furnById[f.type].deco);
  for (const d of desks(g)) {
    let s = 0;
    for (const f of decos) {
      const def = DATA.furnById[f.type];
      const dist = Math.abs(f.x + (def.w - 1) / 2 - d.x) + Math.abs(f.y + (def.h - 1) / 2 - d.y);
      if (dist <= 5) s += def.deco;
    }
    d.deco = Math.min(15, s * 2);
  }
  g.decoDirty = false;
}

export function expandStatus(g) {
  if (g.expanded) return { ok: false, reason: 'Already rented.' };
  if (g.rep < EXPAND_REP) return { ok: false, reason: `Needs Rep ${EXPAND_REP}. The landlord checks references.` };
  if (g.money < EXPAND_COST) return { ok: false, reason: `Needs ${fmtMoney(EXPAND_COST)} for the deposit.` };
  return { ok: true };
}

export function expandFloor(g) {
  if (!expandStatus(g).ok) return false;
  spend(g, EXPAND_COST, 'building');
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (g.tiles[y][x] === 'L') g.tiles[y][x] = '.';
  if (g.tiles[5][12] === 'W') g.tiles[5][12] = 'D';
  if (g.tiles[10][6] === 'W') g.tiles[10][6] = 'D';
  g.expanded = true;
  g.rent = RENT_FULL;
  layoutChanged(g);
  toast(g, `The whole floor is yours. Rent is now ${fmtMoney(RENT_FULL)} per month.`, 'green');
  return true;
}
