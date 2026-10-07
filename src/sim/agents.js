// Need-driven agent AI (Sims-style): pick the most urgent need or work -> find object -> walk -> use.
import { DATA } from '../data.js';
import { SPAWN, MAP_W } from '../config.js';
import { clock, WORK_START, WORK_END } from './time.js';
import { bfs, pathFrom, walkable } from './pathfinding.js';
import { pickJob, addWork } from '../systems/jobs.js';
import { toast } from '../systems/notify.js';
import { sfx } from '../audio.js';

export const NEED_KEYS = ['energy', 'hunger', 'bladder', 'social', 'fun', 'stress'];
export const NEED_LABEL = { energy: 'Energy', hunger: 'Hunger', bladder: 'Bladder', social: 'Social', fun: 'Fun', stress: 'Stress' };
export const NEED_ICON = { energy: 'coffee', hunger: 'food', bladder: 'drop', social: 'chat', fun: 'fun', stress: 'stress' };

const DECAY = { energy: 0.05, hunger: 0.08, bladder: 0.12, social: 0.045, fun: 0.05 };
const URGENT = { bladder: 28, hunger: 30, energy: 28, stress: 72, social: 22, fun: 22 };
const ORDER = ['bladder', 'hunger', 'energy', 'stress', 'social', 'fun'];
const SPEED = 0.34; // tiles per tick

const GOING = { energy: 'Coffee. Now.', hunger: 'Snack time.', bladder: 'Be right back.', social: 'Anyone around?', fun: 'Quick break.', stress: 'I need to sit down for a second.' };
const MISSING = { energy: 'No coffee machine? Really?', social: 'Nobody to talk to in here.', fun: 'This office is so boring.', stress: 'Nowhere to unwind.' };
const IDLE = ['Is it Friday yet?', 'Pretending to type.', 'Refreshing my inbox.', 'Any work coming in?', 'Reorganizing my desktop icons.'];
const WORK_OK = ['In the zone.', 'This is going well.', 'Almost done. Probably.', 'Coffee was a good idea.'];
const WORK_BAD = ['Who set this deadline?', 'I am so tired.', 'Do I get paid enough for this?'];

const clamp = (v, a = 0, b = 100) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const firstName = (a) => a.name.split(' ')[0];

export function makeAgent(g, o) {
  return {
    id: g.nextId++, name: o.name, isPlayer: !!o.isPlayer, look: o.look, role: o.role,
    mainSkill: o.mainSkill || null, skills: { ...o.skills }, xp: {}, salary: o.salary || 0,
    desk: null, x: SPAWN.x, y: SPAWN.y, px: SPAWN.x, py: SPAWN.y, path: [], dir: 'down', moving: false,
    state: 'away', target: null, timer: 0, wait: 0,
    needs: { energy: 88, hunger: 80, bladder: 85, social: 70, fun: 70, stress: 10 },
    present: false, mood: 70, thought: '', thoughtT: 0, bubble: null, activity: 'Not in yet', mode: 'work',
    arriveAt: o.arriveAt ?? (WORK_START - 25 + Math.floor(Math.random() * 45)),
    lastDay: -1, outUntil: 0, outNeed: null, cool: {}, forced: null,
  };
}

function think(a, text, t = 220) { a.thought = text; a.thoughtT = t; }

export function moodOf(a, g) {
  const n = a.needs;
  let m = (n.energy + n.hunger + n.bladder + n.social + n.fun + (100 - n.stress)) / 6;
  const desk = a.desk != null ? g.furnById[a.desk] : null;
  if (desk) m += desk.deco || 0; else if (!a.isPlayer) m -= 10;
  return clamp(m);
}

export const seatOf = (f) => {
  const d = DATA.furnById[f.type];
  return d.seat ? { x: f.x + d.seat[0], y: f.y + d.seat[1] } : null;
};

export function accessTiles(g, f) {
  const d = DATA.furnById[f.type];
  if (d.seat) return [seatOf(f)];
  const out = [];
  for (let x = f.x; x < f.x + d.w; x++) { out.push({ x, y: f.y - 1 }, { x, y: f.y + d.h }); }
  for (let y = f.y; y < f.y + d.h; y++) { out.push({ x: f.x - 1, y }, { x: f.x + d.w, y }); }
  return out.filter((t) => walkable(g, t.x, t.y) && !g.seatOcc[t.y * MAP_W + t.x]);
}

function release(a, g) {
  const t = a.target;
  if (t && t.type === 'use') {
    const f = g.furnById[t.fid];
    if (f) f.users = f.users.filter((id) => id !== a.id);
  }
}

export function spawnAgent(a, g) {
  a.x = a.px = SPAWN.x; a.y = a.py = SPAWN.y;
  a.present = true; a.state = 'idle'; a.wait = 2; a.path = []; a.target = null;
  a.activity = 'Arriving';
  g.ding = true;
}

function morning(a) {
  const n = a.needs;
  n.energy = rnd(80, 95); n.hunger = rnd(70, 88); n.bladder = rnd(75, 95);
  n.social = Math.max(n.social, 55); n.fun = Math.max(n.fun, 55); n.stress = Math.max(0, n.stress - 45);
  a.cool = {};
}

function goTo(a, g, tx, ty, target) {
  const res = bfs(g, Math.round(a.x), Math.round(a.y));
  const path = pathFrom(res, tx, ty);
  if (!path) return false;
  a.path = path;
  a.target = { ...target, tx, ty };
  a.state = target.type === 'leave' ? 'leaving' : 'walking';
  if (!path.length) arrive(a, g);
  return true;
}

export function leave(a, g, reason, mins = 0) {
  release(a, g);
  a.path = [];
  a.activity = reason === 'home' ? 'Going home' : 'Stepping out';
  if (!goTo(a, g, SPAWN.x, SPAWN.y, { type: 'leave', reason, mins })) {
    a.target = { type: 'leave', reason, mins };
    arrive(a, g);
  }
}

function arrive(a, g) {
  const t = a.target;
  if (!t) { a.state = 'idle'; return; }
  if (t.type === 'use') {
    const f = g.furnById[t.fid];
    if (!f) { a.state = 'idle'; a.target = null; return; }
    const d = DATA.furnById[f.type];
    a.state = 'using'; a.timer = d.use.duration; a.activity = d.use.verb;
    const cx = f.x + d.w / 2 - 0.5, cy = f.y + d.h / 2 - 0.5;
    const dx = cx - a.x, dy = cy - a.y;
    a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  } else if (t.type === 'desk') {
    if (!g.furnById[t.fid] || a.desk !== t.fid) { a.state = 'idle'; a.target = null; return; }
    a.state = 'working'; a.dir = 'up'; a.timer = 0;
  } else if (t.type === 'leave') {
    a.present = false; a.state = 'away'; a.target = null; a.path = [];
    if (t.reason === 'out') { a.outUntil = g.time + t.mins; a.activity = 'Out of the office'; }
    else a.activity = 'At home';
    g.ding = true;
  } else {
    a.state = 'idle'; a.target = null; a.wait = 15 + Math.floor(Math.random() * 25);
  }
}

function step(a, g) {
  if (!a.path.length) { arrive(a, g); return; }
  const n = a.path[0];
  const dx = n.x - a.x, dy = n.y - a.y;
  a.moving = true;
  if (Math.abs(dx) > Math.abs(dy)) a.dir = dx > 0 ? 'right' : 'left';
  else if (dy !== 0) a.dir = dy > 0 ? 'down' : 'up';
  if (Math.abs(dx) + Math.abs(dy) <= SPEED) {
    a.x = n.x; a.y = n.y; a.path.shift();
    if (!a.path.length) arrive(a, g);
  } else {
    a.x += Math.sign(dx) * Math.min(SPEED, Math.abs(dx));
    a.y += Math.sign(dy) * Math.min(SPEED, Math.abs(dy));
  }
}

function urgentNeed(a, g) {
  const n = a.needs;
  for (const k of ORDER) {
    if (a.cool[k] > g.time) continue;
    if (k === 'stress' ? n.stress > URGENT.stress : n[k] < URGENT[k]) return k;
  }
  return null;
}

function tryUse(a, g, need) {
  const cands = g.furniture.filter((f) => {
    const d = DATA.furnById[f.type];
    if (!d.use) return false;
    const r = d.use.restore[need] || 0;
    if (need === 'stress' ? r >= 0 : r <= 0) return false;
    return f.users.length < d.use.cap;
  });
  if (!cands.length) return false;
  const res = bfs(g, Math.round(a.x), Math.round(a.y));
  let best = null, bd = 1e9, bt = null;
  for (const f of cands) {
    for (const t of accessTiles(g, f)) {
      const d = res.dist[t.y * MAP_W + t.x];
      if (d >= 0 && d < bd) { bd = d; best = f; bt = t; }
    }
  }
  if (!best) return false;
  const d = DATA.furnById[best.type];
  a.path = pathFrom(res, bt.x, bt.y);
  a.target = { type: 'use', fid: best.id, need, tx: bt.x, ty: bt.y };
  best.users.push(a.id);
  a.state = 'walking';
  a.activity = d.use.verb;
  a.bubble = { icon: NEED_ICON[need], kind: 'blue', t: 90 };
  think(a, GOING[need], 120);
  if (!a.path.length) arrive(a, g);
  return true;
}

function fallback(a, g, need) {
  const name = firstName(a);
  const day = clock(g.time).day;
  if (need === 'bladder' || need === 'hunger') {
    a.outNeed = need;
    a.bubble = { icon: NEED_ICON[need], kind: 'red', t: 120 };
    think(a, need === 'bladder' ? 'No toilet here. Using the cafe downstairs.' : 'No kitchen. Lunch out it is.');
    if (g.hints[need] !== day) {
      g.hints[need] = day;
      toast(g, need === 'bladder'
        ? `${name} left to use the cafe toilet downstairs. Build a Toilet.`
        : `${name} went out for lunch. A Fridge keeps people in the office.`, 'yellow');
    }
    leave(a, g, 'out', need === 'bladder' ? 40 : 75);
  } else {
    a.cool[need] = g.time + 90;
    a.bubble = { icon: NEED_ICON[need], kind: 'red', t: 120 };
    think(a, MISSING[need]);
  }
}

function wander(a, g, radius = 6) {
  const res = bfs(g, Math.round(a.x), Math.round(a.y));
  const opts = [];
  for (let i = 0; i < res.dist.length; i++) {
    const d = res.dist[i];
    if (d >= 2 && d <= radius) opts.push(i);
  }
  if (!opts.length) { a.wait = 20; return; }
  const i = pick(opts);
  const tx = i % MAP_W, ty = (i / MAP_W) | 0;
  a.path = pathFrom(res, tx, ty);
  a.target = { type: 'wander', tx, ty };
  a.state = 'walking';
}

function managerWalk(a, g) {
  const team = g.agents.filter((b) => !b.isPlayer && b.present && b.state === 'working');
  a.activity = 'Checking on the team';
  if (team.length) {
    const b = pick(team);
    const res = bfs(g, Math.round(a.x), Math.round(a.y));
    const spots = [[1, 0], [-1, 0], [0, 1]].map(([dx, dy]) => ({ x: Math.round(b.x) + dx, y: Math.round(b.y) + dy }))
      .filter((t) => res.dist[t.y * MAP_W + t.x] > 0);
    if (spots.length) {
      const t = pick(spots);
      a.path = pathFrom(res, t.x, t.y);
      a.target = { type: 'wander', tx: t.x, ty: t.y };
      a.state = 'walking';
      return;
    }
  }
  wander(a, g);
}

function decide(a, g) {
  if (a.wait > 0) { a.wait--; return; }
  if (a.forced === 'break') {
    a.forced = null;
    const need = a.needs.energy < a.needs.fun ? 'energy' : 'fun';
    if (tryUse(a, g, need) || tryUse(a, g, 'stress') || tryUse(a, g, need === 'energy' ? 'fun' : 'energy')) return;
    think(a, 'There is nowhere to take a break.');
  }
  const u = urgentNeed(a, g);
  if (u) {
    if (tryUse(a, g, u)) return;
    fallback(a, g, u);
    if (a.state !== 'idle') return;
  }
  if (a.isPlayer && a.mode === 'manage') { managerWalk(a, g); return; }
  if (a.desk != null) {
    const f = g.furnById[a.desk];
    if (f) {
      const s = seatOf(f);
      if (goTo(a, g, s.x, s.y, { type: 'desk', fid: f.id })) { a.activity = 'Heading to desk'; return; }
      if (!a.thoughtT) think(a, "I can't reach my desk!");
    }
  } else if (!a.thoughtT) think(a, 'Where am I supposed to sit?');
  a.activity = a.desk != null ? 'Wandering around' : 'Looking for a desk';
  wander(a, g);
}

function using(a, g) {
  const f = g.furnById[a.target && a.target.fid];
  if (!f) { a.state = 'idle'; a.target = null; return; }
  const d = DATA.furnById[f.type];
  const n = a.needs;
  for (const k in d.use.restore) n[k] = clamp(n[k] + d.use.restore[k]);
  if (f.users.length > 1) n.social = clamp(n.social + 1.2);
  if (--a.timer <= 0) { release(a, g); a.state = 'idle'; a.target = null; a.wait = 2; }
}

function gainXp(a, g, skill, units) {
  a.xp[skill] = (a.xp[skill] || 0) + units;
  const lvl = a.skills[skill] || 1;
  if (lvl < 10 && a.xp[skill] >= 700 * lvl) {
    a.skills[skill] = lvl + 1; a.xp[skill] = 0;
    toast(g, `${firstName(a)} is now ${skill} ${lvl + 1}.`, 'green');
  }
}

function working(a, g) {
  const f = g.furnById[a.desk];
  const s = f && seatOf(f);
  if (!f || Math.round(a.x) !== s.x || Math.round(a.y) !== s.y) { a.state = 'idle'; return; }
  if (a.isPlayer && a.mode === 'manage') { a.state = 'idle'; return; }
  a.dir = 'up';
  const n = a.needs;
  const desk = DATA.furnById[f.type].desk;
  const job = pickJob(a, g);
  if (job) {
    const q = 0.5 + a.mood / 100;
    const sk = a.skills[job.skill] || 1;
    const bonus = a.isPlayer ? 1 : g.manageBonus;
    const units = sk * q * desk.quality * 0.25 * bonus;
    addWork(g, job, a, units, q);
    gainXp(a, g, job.skill, units);
    n.stress = clamp(n.stress + 0.05 * desk.stress);
    n.energy = clamp(n.energy - 0.02);
    a.activity = 'Working on ' + job.name;
    a.workingNow = true;
    if (!a.thoughtT && Math.random() < 0.004) think(a, a.mood > 55 ? pick(WORK_OK) : pick(WORK_BAD));
  } else {
    a.activity = 'Waiting for work';
    n.fun = clamp(n.fun + 0.03);
    n.stress = clamp(n.stress - 0.03);
    if (!a.thoughtT && Math.random() < 0.004) think(a, pick(IDLE));
  }
  if (++a.timer % 15 === 0 && urgentNeed(a, g)) a.state = 'idle';
}

export function updateAgent(a, g) {
  a.px = a.x; a.py = a.y; a.moving = false; a.workingNow = false;
  if (a.bubble && --a.bubble.t <= 0) a.bubble = null;
  const c = clock(g.time);
  if (!a.present) {
    if (a.outUntil) {
      if (g.time >= a.outUntil) {
        a.outUntil = 0;
        if (a.outNeed === 'bladder') a.needs.bladder = 100;
        if (a.outNeed === 'hunger') { a.needs.hunger = 95; a.needs.social = clamp(a.needs.social + 10); }
        a.outNeed = null;
        if (c.minute < WORK_END) spawnAgent(a, g); else a.activity = 'At home';
      }
      return;
    }
    if (c.day !== a.lastDay && c.minute >= a.arriveAt && c.minute < WORK_END - 60) {
      a.lastDay = c.day; morning(a); spawnAgent(a, g);
    }
    return;
  }
  const n = a.needs;
  for (const k in DECAY) n[k] = clamp(n[k] - DECAY[k]);
  if (a.state !== 'working') n.stress = clamp(n.stress - 0.03);
  a.mood = moodOf(a, g);
  if (a.state !== 'leaving' && (c.minute >= WORK_END || c.minute < 6 * 60 || a.forced === 'home')) {
    a.forced = null;
    leave(a, g, 'home');
    return;
  }
  switch (a.state) {
    case 'walking': case 'leaving': step(a, g); break;
    case 'using': using(a, g); break;
    case 'working': working(a, g); break;
    default: decide(a, g);
  }
  if (a.thoughtT > 0) a.thoughtT--;
}

// After the layout changes, re-route everyone who is on the move.
export function repathAll(g) {
  for (const a of g.agents) {
    if (!a.present || !a.target || (a.state !== 'walking' && a.state !== 'leaving')) continue;
    const t = a.target;
    if (t.type === 'use' && !g.furnById[t.fid]) { a.state = 'idle'; a.target = null; a.path = []; continue; }
    const res = bfs(g, Math.round(a.x), Math.round(a.y));
    const p = pathFrom(res, t.tx, t.ty);
    if (p) a.path = p;
    else if (t.type === 'leave') arrive(a, g);
    else { release(a, g); a.state = 'idle'; a.target = null; a.path = []; }
  }
}

// Called when furniture is removed: anybody using it stops.
export function releaseFurniture(g, f) {
  for (const a of g.agents) {
    if (a.target && a.target.fid === f.id && a.target.type === 'use') { a.state = 'idle'; a.target = null; a.path = []; }
  }
}

export function removeAgent(g, a) {
  release(a, g);
  g.agents = g.agents.filter((b) => b !== a);
}

export function playSounds(g) {
  if (g.agents.some((a) => a.workingNow) && Math.random() < 0.25) sfx('type');
}
