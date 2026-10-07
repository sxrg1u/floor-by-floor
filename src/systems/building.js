// Floors, placement, selling, walls, doors, desk assignment, decoration score, renting floors.
import { DATA } from '../data.js';
import { MAP_W, MAP_H, SPAWN, FLOORS } from '../config.js';
import { spend, fmtMoney } from './economy.js';
import { toast } from './notify.js';
import { repathAll, releaseFurniture } from '../sim/agents.js';
import { isUnlocked, unlockName } from './milestones.js';

export const WALL_COST = 20;
export const DOOR_COST = 60;

// A rented, empty floor: outer walls and the elevator on the left.
export function makeFloorTiles() {
  const t = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) row.push(x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 'W' : '.');
    t.push(row);
  }
  t[SPAWN.y][0] = 'E';
  t[SPAWN.y + 1][0] = 'E';
  return t;
}

// Per-floor cache (not saved): occupancy grids and the pre-rendered static layer.
export function flc(g, i) {
  if (!g.tmp) g.tmp = { fl: [] };
  let c = g.tmp.fl[i];
  if (!c) { c = g.tmp.fl[i] = { occ: null, seatOcc: null, staticCanvas: null, staticDirty: true }; rebuildOcc(g, i); }
  return c;
}

export function rebuildOcc(g, i) {
  const c = g.tmp.fl[i];
  c.occ = new Int32Array(MAP_W * MAP_H);
  c.seatOcc = new Int32Array(MAP_W * MAP_H);
  for (const f of g.furniture) {
    if (f.floor !== i) continue;
    const d = DATA.furnById[f.type];
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) c.occ[(f.y + y) * MAP_W + f.x + x] = f.id;
    if (d.seat) c.seatOcc[(f.y + d.seat[1]) * MAP_W + f.x + d.seat[0]] = f.id;
  }
}

const reserved = (x, y) => x === SPAWN.x && (y === SPAWN.y || y === SPAWN.y + 1);
const inMap = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
const isBorder = (x, y) => x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;

function freeTile(g, i, x, y) {
  if (!inMap(x, y) || !g.floors[i] || g.floors[i].tiles[y][x] !== '.' || reserved(x, y)) return false;
  const c = flc(g, i);
  return !c.occ[y * MAP_W + x] && !c.seatOcc[y * MAP_W + x];
}

export function canPlace(g, i, def, tx, ty) {
  for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) if (!freeTile(g, i, tx + x, ty + y)) return false;
  if (def.seat && !freeTile(g, i, tx + def.seat[0], ty + def.seat[1])) return false;
  return true;
}

export function layoutChanged(g, i) {
  rebuildOcc(g, i);
  flc(g, i).staticDirty = true;
  g.decoDirty = true;
  repathAll(g);
}

export function addFurniture(g, type, x, y, floor) {
  const f = { id: g.nextId++, type, x, y, floor, users: [] };
  g.furniture.push(f);
  g.furnById[f.id] = f;
  return f;
}

export function placeFurniture(g, i, type, tx, ty) {
  const def = DATA.furnById[type];
  if (!isUnlocked(g, def)) return 'locked';
  if (!canPlace(g, i, def, tx, ty)) return 'blocked';
  if (g.money < def.price) return 'money';
  spend(g, def.price, 'furniture');
  addFurniture(g, type, tx, ty, i);
  layoutChanged(g, i);
  if (def.desk) assignDesks(g);
  return 'ok';
}

export function furnitureAt(g, i, x, y) {
  if (!inMap(x, y)) return null;
  const c = flc(g, i);
  const id = c.occ[y * MAP_W + x] || c.seatOcc[y * MAP_W + x];
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
  layoutChanged(g, f.floor);
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

export const canWall = (g, i, x, y) => freeTile(g, i, x, y);

export function buildWalls(g, i, tiles) {
  let n = 0;
  for (const t of tiles) {
    if (!canWall(g, i, t.x, t.y) || g.money < WALL_COST) continue;
    g.floors[i].tiles[t.y][t.x] = 'W';
    spend(g, WALL_COST, 'building');
    n++;
  }
  if (n) layoutChanged(g, i);
  return n;
}

export const canDoor = (g, i, x, y) => inMap(x, y) && !isBorder(x, y) && g.floors[i].tiles[y][x] === 'W';

export function makeDoor(g, i, x, y) {
  if (!canDoor(g, i, x, y) || g.money < DOOR_COST) return false;
  g.floors[i].tiles[y][x] = 'D';
  spend(g, DOOR_COST, 'building');
  layoutChanged(g, i);
  return true;
}

export const canRemoveWall = (g, i, x, y) => inMap(x, y) && !isBorder(x, y) && (g.floors[i].tiles[y][x] === 'W' || g.floors[i].tiles[y][x] === 'D');

export function removeWall(g, i, x, y) {
  if (!canRemoveWall(g, i, x, y)) return false;
  g.floors[i].tiles[y][x] = '.';
  layoutChanged(g, i);
  return true;
}

export const desks = (g) => g.furniture.filter((f) => DATA.furnById[f.type].desk);

export function freeDeskCount(g) {
  const taken = new Set(g.agents.map((a) => a.desk).filter((d) => d != null));
  return desks(g).filter((f) => !taken.has(f.id)).length;
}

// The founder never works, so only employees get desks.
export function assignDesks(g) {
  const taken = new Set(g.agents.map((a) => a.desk).filter((d) => d != null));
  const free = desks(g).filter((f) => !taken.has(f.id));
  for (const a of g.agents) if (!a.isPlayer && a.desk == null && free.length) a.desk = free.shift().id;
}

// Mood bonus per desk from decoration within 5 tiles on the same floor (max +15).
export function computeDeco(g) {
  const decos = g.furniture.filter((f) => DATA.furnById[f.type].deco);
  for (const d of desks(g)) {
    let s = 0;
    for (const f of decos) {
      if (f.floor !== d.floor) continue;
      const def = DATA.furnById[f.type];
      const dist = Math.abs(f.x + (def.w - 1) / 2 - d.x) + Math.abs(f.y + (def.h - 1) / 2 - d.y);
      if (dist <= 5) s += def.deco;
    }
    d.deco = Math.min(15, s * 2);
  }
  g.decoDirty = false;
}

export const totalRent = (g) => g.floors.reduce((s, _, i) => s + FLOORS[i].rent, 0);

export function rentStatus(g) {
  const i = g.floors.length;
  const def = FLOORS[i];
  if (!def) return { ok: false, reason: 'You own the whole building.' };
  if (def.penthouse && !g.milestones.whole_building) return { ok: false, def, reason: 'The penthouse opens once you rent every other floor.' };
  if (g.rep < def.rep) return { ok: false, def, reason: `${def.label} needs Rep ${def.rep}. The landlord checks references.` };
  const deposit = def.rent * 2;
  if (g.money < deposit) return { ok: false, def, reason: `Needs ${fmtMoney(deposit)} for the deposit.` };
  return { ok: true, def, deposit };
}

export function rentFloor(g) {
  const st = rentStatus(g);
  if (!st.ok) return false;
  spend(g, st.deposit, 'building');
  g.floors.push({ tiles: makeFloorTiles() });
  toast(g, `${st.def.label} is yours. Rent goes up by ${fmtMoney(st.def.rent)} per month.`, 'green');
  return true;
}

export function lockReason(def) {
  return def.unlock ? `Unlocks with the milestone "${unlockName(def.unlock)}".` : '';
}
