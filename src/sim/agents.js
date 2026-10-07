// Agent AI. Employees only work on tasks you give them and only rest when the rules allow it
// or when you send them on a break. Handles floors, the elevator, meetings, burnout and remote days.
import { DATA } from '../data.js';
import { SPAWN, MAP_W } from '../config.js';
import { clock } from './time.js';
import { bfs, pathFrom, walkable } from './pathfinding.js';
import { taskOf, addWork } from '../systems/jobs.js';
import { toast } from '../systems/notify.js';
import { sfx } from '../audio.js';
import { buildMods, tryChat, chatting, flavorThought } from './personality.js';
import { workHours, is, policyMood } from '../systems/policies.js';
import { leadBonus } from '../systems/teams.js';
import { flc } from '../systems/building.js';

export const NEED_KEYS = ['energy', 'hunger', 'bladder', 'social', 'fun', 'stress'];
export const NEED_LABEL = { energy: 'Energy', hunger: 'Hunger', bladder: 'Bladder', social: 'Social', fun: 'Fun', stress: 'Stress' };
export const NEED_ICON = { energy: 'coffee', hunger: 'food', bladder: 'drop', social: 'chat', fun: 'fun', stress: 'stress' };

const DECAY = { energy: 0.05, hunger: 0.08, bladder: 0.12, social: 0.045, fun: 0.05 };
const SPEED = 0.34; // tiles per tick

const GOING = { energy: 'Coffee. Now.', hunger: 'Lunch time.', bladder: 'Be right back.', social: 'Anyone around?', fun: 'Quick break.', stress: 'I need to sit down for a second.' };
const MISSING = { energy: 'No coffee machine? Really?', social: 'Nobody to talk to in here.', fun: 'This office is so boring.', stress: 'Nowhere to unwind.' };
const IDLE = ['Is there anything for me to do?', 'Waiting for a task. Again.', 'Refreshing my inbox.', 'Pretending to type.'];
const WORK_OK = ['In the zone.', 'This is going well.', 'Almost done. Probably.'];
const WORK_BAD = ['Who set this deadline?', 'I am so tired.', 'Do I get paid enough for this?'];

const clamp = (v, a = 0, b = 100) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const firstName = (a) => a.name.split(' ')[0];

export function makeAgent(g, o) {
  const mods = buildMods(o.traits || []);
  return {
    id: g.nextId++, name: o.name, isPlayer: !!o.isPlayer, look: o.look, role: o.role,
    traits: o.traits ? [...o.traits] : [], known: o.known ? [...o.known] : [], opinions: o.opinions ? { ...o.opinions } : null,
    mods, socialMood: 0, chem: 1, partner: null, crush: null, chatWith: null, daysWorked: 0, heartbreak: 0, dayOff: -1,
    mainSkill: o.mainSkill || null, skills: { ...o.skills }, xp: {}, salary: o.salary || 0,
    level: o.level || 0, loyalty: o.loyalty ?? 60, hiredDay: o.hiredDay ?? 0, lastRaiseDay: null, eligibleSince: null,
    task: null, breakUntil: 0, sickUntil: -1, roamUntil: 0, lunchDay: -1,
    desk: null, floor: 0, x: SPAWN.x, y: SPAWN.y, px: SPAWN.x, py: SPAWN.y, path: [], dir: 'down', moving: false,
    state: 'away', target: null, timer: 0, wait: 0,
    needs: { energy: 88, hunger: 80, bladder: 85, social: 70, fun: 70, stress: 10 },
    present: false, mood: 70, thought: '', thoughtT: 0, bubble: null, activity: 'Not in yet',
    jitter: Math.floor(Math.random() * 45), lastDay: -1, outUntil: 0, outNeed: null, cool: {}, forced: null,
  };
}

function think(a, text, t = 220) { a.thought = text; a.thoughtT = t; }

export function moodOf(a, g) {
  const n = a.needs;
  let m = (n.energy + n.hunger + n.bladder + n.social + n.fun + (100 - n.stress)) / 6 + (a.socialMood || 0) + policyMood(a, g);
  const desk = a.desk != null ? g.furnById[a.desk] : null;
  if (desk) m += desk.deco || 0; else if (!a.isPlayer) m -= 10;
  return clamp(m);
}

export function shiftFor(g, a) {
  const h = workHours(g);
  let end = h.end;
  if (!a.isPlayer) {
    if (is(g, 'overtime', 'mandatory')) end += 120;
    else if (is(g, 'overtime', 'optional') && ((a.opinions && a.opinions.overtime >= 1) || a.traits.includes('ambitious'))) end += 60;
  }
  return { start: h.start, end };
}

const remoteToday = (g, a, c) => !a.isPlayer && is(g, 'remote', 'yes') && c.weekday === 4 && (!a.opinions || a.opinions.remote >= 0);

export const seatOf = (f) => {
  const d = DATA.furnById[f.type];
  return d.seat ? { x: f.x + d.seat[0], y: f.y + d.seat[1] } : null;
};

export function accessTiles(g, f) {
  const d = DATA.furnById[f.type];
  if (d.seat) return [seatOf(f)];
  const out = [];
  for (let x = f.x; x < f.x + d.w; x++) out.push({ x, y: f.y - 1 }, { x, y: f.y + d.h });
  for (let y = f.y; y < f.y + d.h; y++) out.push({ x: f.x - 1, y }, { x: f.x + d.w, y });
  const so = flc(g, f.floor).seatOcc;
  return out.filter((t) => walkable(g, f.floor, t.x, t.y) && !so[t.y * MAP_W + t.x]);
}

function release(a, g) {
  const t = a.target;
  const fid = t && (t.type === 'use' ? t.fid : t.type === 'elevator' && t.next.target.type === 'use' ? t.next.target.fid : null);
  if (fid != null) { const f = g.furnById[fid]; if (f) f.users = f.users.filter((id) => id !== a.id); }
}

export function spawnAgent(a, g) {
  const desk = a.desk != null ? g.furnById[a.desk] : null;
  a.floor = desk ? desk.floor : a.isPlayer ? Math.min(g.view || 0, g.floors.length - 1) : 0;
  a.x = a.px = SPAWN.x; a.y = a.py = SPAWN.y;
  a.present = true; a.state = 'idle'; a.wait = 2; a.path = []; a.target = null;
  a.activity = 'Arriving';
  if (a.floor === g.view) g.ding = true;
}

function morning(a) {
  a.daysWorked++;
  const n = a.needs;
  n.energy = rnd(80, 95); n.hunger = rnd(70, 88); n.bladder = rnd(75, 95);
  n.social = Math.max(n.social, 55); n.fun = Math.max(n.fun, 50); n.stress = Math.max(0, n.stress - 30);
  a.cool = {}; a.breakUntil = 0; a.roamUntil = 0;
}

// Walk to a tile on any floor; other floors go through the elevator first.
export function goTo(a, g, floor, tx, ty, target) {
  const res = bfs(g, a.floor, Math.round(a.x), Math.round(a.y));
  if (floor === a.floor) {
    const path = pathFrom(res, tx, ty);
    if (!path) return false;
    a.path = path;
    a.target = { ...target, floor, tx, ty };
    a.state = target.type === 'leave' ? 'leaving' : 'walking';
    if (!path.length) arrive(a, g);
    return true;
  }
  const path = pathFrom(res, SPAWN.x, SPAWN.y);
  if (!path) return false;
  if (bfs(g, floor, SPAWN.x, SPAWN.y).dist[ty * MAP_W + tx] < 0) return false;
  a.path = path;
  a.target = { type: 'elevator', floor: a.floor, tx: SPAWN.x, ty: SPAWN.y, next: { floor, tx, ty, target } };
  a.state = 'walking';
  if (!path.length) arrive(a, g);
  return true;
}

export function leave(a, g, reason, mins = 0) {
  release(a, g);
  a.path = [];
  a.activity = reason === 'home' ? 'Going home' : 'Stepping out';
  if (!goTo(a, g, a.floor, SPAWN.x, SPAWN.y, { type: 'leave', reason, mins })) {
    a.target = { type: 'leave', reason, mins };
    arrive(a, g);
  }
}

function arrive(a, g) {
  const t = a.target;
  if (!t) { a.state = 'idle'; return; }
  if (t.type === 'elevator') {
    a.state = 'elevator'; a.timer = 4; a.activity = 'In the elevator';
  } else if (t.type === 'use') {
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
  } else if (t.type === 'meeting') {
    a.state = 'meeting'; a.activity = 'In a meeting'; a.target = null;
    const m = g.meeting;
    if (m && m.spots[a.id]) a.dir = m.spots[a.id].dir;
  } else if (t.type === 'leave') {
    a.present = false; a.state = 'away'; a.target = null; a.path = [];
    if (t.reason === 'out') { a.outUntil = g.time + t.mins; a.activity = 'Out of the office'; }
    else a.activity = 'At home';
    if (a.floor === g.view) g.ding = true;
  } else {
    a.state = 'idle'; a.target = null; a.wait = 10 + Math.floor(Math.random() * 20);
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

function elevatorRide(a, g) {
  if (--a.timer > 0) return;
  const n = a.target.next;
  a.floor = n.floor;
  a.x = a.px = SPAWN.x; a.y = a.py = SPAWN.y;
  if (a.floor === g.view) g.ding = true;
  if (!goTo(a, g, n.floor, n.tx, n.ty, n.target)) { release(a, g); a.state = 'idle'; a.target = null; }
}

// Needs people take care of by themselves (depends on the rules).
function autoNeed(a, g, c) {
  const n = a.needs;
  const ok = (k) => !(a.cool[k] > g.time);
  if (n.bladder < 28 && ok('bladder')) return 'bladder';
  if (is(g, 'lunch', 'fixed')) {
    if (c.minute >= 720 && c.minute < 800 && a.lunchDay !== c.day && n.hunger < 85) { a.lunchDay = c.day; return 'hunger'; }
    if (n.hunger < 10 && ok('hunger')) return 'hunger';
  } else if (n.hunger < 30 && ok('hunger')) return 'hunger';
  if (is(g, 'coffee', 'auto')) {
    if (n.energy < 28 && ok('energy')) return 'energy';
    if (n.stress > 80 && ok('stress')) return 'stress';
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
  const own = bfs(g, a.floor, Math.round(a.x), Math.round(a.y));
  const toElev = own.dist[SPAWN.y * MAP_W + SPAWN.x];
  const other = {};
  let best = null, bd = 1e9, bt = null;
  for (const f of cands) {
    for (const t of accessTiles(g, f)) {
      const idx = t.y * MAP_W + t.x;
      let d;
      if (f.floor === a.floor) d = own.dist[idx];
      else {
        if (toElev < 0) continue;
        const r = other[f.floor] || (other[f.floor] = bfs(g, f.floor, SPAWN.x, SPAWN.y));
        if (r.dist[idx] < 0) continue;
        d = toElev + 12 + r.dist[idx];
      }
      if (d >= 0 && d < bd) { bd = d; best = f; bt = t; }
    }
  }
  if (!best) return false;
  if (!goTo(a, g, best.floor, bt.x, bt.y, { type: 'use', fid: best.id, need })) return false;
  best.users.push(a.id);
  a.activity = DATA.furnById[best.type].use.verb;
  a.bubble = { icon: NEED_ICON[need], kind: 'blue', t: 90 };
  think(a, GOING[need], 120);
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
      toast(g, need === 'bladder' ? `${name} left to use the cafe toilet downstairs. Build a Toilet.` : `${name} went out for lunch. A Fridge keeps people in the office.`, 'yellow');
    }
    leave(a, g, 'out', need === 'bladder' ? 40 : 75);
  } else {
    a.cool[need] = g.time + 90;
    a.bubble = { icon: NEED_ICON[need], kind: 'red', t: 120 };
    think(a, MISSING[need]);
  }
}

function wander(a, g, radius = 6) {
  const res = bfs(g, a.floor, Math.round(a.x), Math.round(a.y));
  const opts = [];
  for (let i = 0; i < res.dist.length; i++) { const d = res.dist[i]; if (d >= 2 && d <= radius) opts.push(i); }
  if (!opts.length) { a.wait = 20; return; }
  const i = pick(opts);
  goTo(a, g, a.floor, i % MAP_W, (i / MAP_W) | 0, { type: 'wander' });
}

function founderWalk(a, g) {
  a.activity = 'Walking the floor';
  if (g.view !== a.floor && g.view < g.floors.length && Math.random() < 0.4) {
    const res = bfs(g, g.view, SPAWN.x, SPAWN.y);
    const opts = [];
    for (let i = 0; i < res.dist.length; i++) if (res.dist[i] >= 3 && res.dist[i] <= 10) opts.push(i);
    if (opts.length) { const i = pick(opts); if (goTo(a, g, g.view, i % MAP_W, (i / MAP_W) | 0, { type: 'wander' })) return; }
  }
  const staff = g.agents.filter((b) => !b.isPlayer && b.present && b.floor === a.floor && b.state === 'working');
  if (staff.length && Math.random() < 0.6) {
    const b = pick(staff);
    const res = bfs(g, a.floor, Math.round(a.x), Math.round(a.y));
    const spots = [[1, 0], [-1, 0], [0, 1]].map(([dx, dy]) => ({ x: Math.round(b.x) + dx, y: Math.round(b.y) + dy })).filter((t) => res.dist[t.y * MAP_W + t.x] > 0);
    if (spots.length) { const t = pick(spots); goTo(a, g, a.floor, t.x, t.y, { type: 'wander' }); return; }
  }
  wander(a, g);
}

function breakNeeds(a) {
  const n = a.needs;
  return [['energy', n.energy], ['fun', n.fun], ['social', n.social], ['stress', 100 - n.stress]].sort((p, q) => p[1] - q[1]).map((x) => x[0]);
}

function decide(a, g) {
  if (a.wait > 0) { a.wait--; return; }
  const c = clock(g.time);
  const m = g.meeting;
  if (m && m.stage === 'gathering' && m.participants.includes(a.id) && m.spots[a.id]) {
    const s = m.spots[a.id];
    if (goTo(a, g, s.floor, s.x, s.y, { type: 'meeting' })) { a.activity = 'Walking to a meeting'; return; }
  }
  if (a.breakUntil > g.time) {
    for (const need of breakNeeds(a)) if (tryUse(a, g, need)) return;
    a.activity = 'On a break';
    a.needs.stress = clamp(a.needs.stress - 1);
    if (tryChat(a, g, true)) return;
    a.wait = 10;
    return;
  }
  const u = autoNeed(a, g, c);
  if (u) {
    if (tryUse(a, g, u)) return;
    fallback(a, g, u);
    if (a.state !== 'idle') return;
  }
  if (a.isPlayer) { founderWalk(a, g); return; }
  if (a.roamUntil > g.time) {
    if (tryChat(a, g)) return;
    a.activity = 'Stretching their legs';
    wander(a, g, 4);
    return;
  }
  if (a.desk != null) {
    const f = g.furnById[a.desk];
    if (f) {
      const s = seatOf(f);
      if (goTo(a, g, f.floor, s.x, s.y, { type: 'desk', fid: f.id })) { a.activity = 'Heading to desk'; return; }
      if (!a.thoughtT) think(a, "I can't reach my desk!");
    }
  } else if (!a.thoughtT) think(a, 'Where am I supposed to sit?');
  a.activity = a.desk != null ? 'Wandering around' : 'Looking for a desk';
  if (tryChat(a, g)) return;
  wander(a, g);
}

function using(a, g) {
  const f = g.furnById[a.target && a.target.fid];
  if (!f) { a.state = 'idle'; a.target = null; return; }
  const d = DATA.furnById[f.type];
  const n = a.needs;
  for (const k in d.use.restore) n[k] = clamp(n[k] + d.use.restore[k] * (a.mods.restore[k] || 1));
  if (f.users.length > 1) n.social = clamp(n.social + 1.2);
  if (--a.timer <= 0) { release(a, g); a.state = 'idle'; a.target = null; a.wait = 2; }
}

function gainXp(a, g, skill, units) {
  a.xp[skill] = (a.xp[skill] || 0) + units * a.mods.xp;
  const lvl = a.skills[skill] || 1;
  if (lvl < 10 && a.xp[skill] >= 1600 * lvl) {
    a.skills[skill] = lvl + 1; a.xp[skill] = 0;
    toast(g, `${firstName(a)} is now ${skill} ${lvl + 1}.`, 'green');
  }
}

// One minute of work on a task.
function produce(a, g, t, deskQ, deskStress, remote = false) {
  const n = a.needs;
  const sk = a.skills[t.part.skill] || 1;
  const units = sk * (0.5 + a.mood / 100) * deskQ * 0.25 * a.mods.output * (a.chem || 1) * leadBonus(g, a)
    * (g.serverBonus || 1) * (is(g, 'ai', 'yes') ? 1.1 : 1) * ((g.buffUntil || 0) > g.time ? 1.1 : 1);
  const q = 0.3 + a.mood / 250 + sk / 12 + a.mods.quality;
  addWork(g, t.job, t.part, units, q);
  gainXp(a, g, t.part.skill, units);
  const late = clock(g.time).minute >= workHours(g).end ? 1.5 : 1;
  const layout = is(g, 'layout', 'open') ? 1.1 : is(g, 'layout', 'quiet') ? 0.85 : 1;
  n.stress = clamp(n.stress + 0.09 * deskStress * a.mods.stress * late * layout * (remote ? 0.6 : 1));
  n.energy = clamp(n.energy - 0.04);
  a.activity = (remote ? 'From home: ' : '') + `${t.part.skill} on ${t.job.name}`;
  a.workingNow = !remote;
}

function burnout(a, g) {
  const day = clock(g.time).day;
  a.sickUntil = day + 2;
  a.loyalty = clamp(a.loyalty - 12);
  a.needs.stress = 60;
  a.task = null;
  toast(g, `${firstName(a)} burned out and is off sick for two days. Breaks exist for a reason.`, 'red');
  sfx('bad');
  leave(a, g, 'home');
}

function working(a, g) {
  const f = g.furnById[a.desk];
  const s = f && seatOf(f);
  if (!f || a.floor !== f.floor || Math.round(a.x) !== s.x || Math.round(a.y) !== s.y) { a.state = 'idle'; return; }
  a.dir = 'up';
  const n = a.needs;
  const m = g.meeting;
  if ((m && m.stage === 'gathering' && m.participants.includes(a.id)) || a.breakUntil > g.time) { a.state = 'idle'; return; }
  if (++a.timer % 15 === 0 && autoNeed(a, g, clock(g.time))) { a.state = 'idle'; return; }
  if (n.stress >= 100) { burnout(a, g); return; }
  const t = taskOf(g, a);
  if (n.energy < 8) {
    a.activity = 'Dozing off at the desk';
    if (!a.bubble) a.bubble = { icon: 'zz', kind: 'neutral', t: 40 };
    return;
  }
  if (t) {
    produce(a, g, t, DATA.furnById[f.type].desk.quality, DATA.furnById[f.type].desk.stress);
    if (!a.thoughtT && Math.random() < 0.004) think(a, flavorThought(a) || (a.mood > 55 ? pick(WORK_OK) : pick(WORK_BAD)));
  } else {
    a.activity = 'Waiting for a task';
    n.fun = clamp(n.fun - 0.02);
    n.stress = clamp(n.stress - 0.04);
    if (a.timer % 45 === 0) a.bubble = { icon: 'question', kind: 'yellow', t: 35 };
    if (!a.thoughtT && Math.random() < 0.004) think(a, flavorThought(a) || pick(IDLE));
    const chat = is(g, 'layout', 'open') ? 0.5 : is(g, 'layout', 'quiet') ? 0.1 : 0.25;
    if (a.timer % 60 === 0 && Math.random() < chat) { a.roamUntil = g.time + 25; a.state = 'idle'; }
  }
}

export function updateAgent(a, g) {
  a.px = a.x; a.py = a.y; a.moving = false; a.workingNow = false;
  if (a.bubble && --a.bubble.t <= 0) a.bubble = null;
  const c = clock(g.time);
  const sh = shiftFor(g, a);
  if (!a.present) {
    if (a.outUntil) {
      if (g.time >= a.outUntil) {
        a.outUntil = 0;
        if (a.outNeed === 'bladder') a.needs.bladder = 100;
        if (a.outNeed === 'hunger') { a.needs.hunger = 95; a.needs.social = clamp(a.needs.social + 10); }
        a.outNeed = null;
        if (c.minute < sh.end) spawnAgent(a, g); else a.activity = 'At home';
      }
      return;
    }
    if (remoteToday(g, a, c) && c.minute >= sh.start && c.minute < sh.end) {
      if (a.lastDay !== c.day) { a.lastDay = c.day; morning(a); }
      const t = taskOf(g, a);
      if (t) produce(a, g, t, 0.8, 0.6, true); else a.activity = 'Home office, no task';
      return;
    }
    const arriveAt = a.isPlayer ? sh.start - 20 : sh.start - 25 + a.jitter + a.mods.arrive;
    if (c.day !== a.lastDay && c.minute >= arriveAt && c.minute < sh.end - 60) {
      a.lastDay = c.day;
      if (a.dayOff === c.day) { a.activity = 'Day off'; return; }
      if (a.sickUntil >= c.day) { a.activity = 'Off sick'; return; }
      morning(a); spawnAgent(a, g);
    }
    return;
  }
  const n = a.needs;
  const mult = {
    hunger: is(g, 'snacks', 'yes') ? 0.6 : 1,
    social: is(g, 'layout', 'open') ? 0.7 : is(g, 'layout', 'quiet') ? 1.2 : 1,
  };
  for (const k in DECAY) n[k] = clamp(n[k] - DECAY[k] * (a.mods.decay[k] || 1) * (mult[k] || 1));
  if (a.state !== 'working') n.stress = clamp(n.stress - 0.03);
  a.mood = moodOf(a, g);
  if (a.state !== 'leaving' && a.state !== 'elevator' && (c.minute >= sh.end || c.minute < 6 * 60 || a.forced === 'home')) {
    if (!(g.meeting && g.meeting.participants.includes(a.id) && g.meeting.stage !== 'gathering')) {
      a.forced = null;
      leave(a, g, 'home');
      return;
    }
  }
  switch (a.state) {
    case 'walking': case 'leaving': step(a, g); break;
    case 'elevator': elevatorRide(a, g); break;
    case 'using': using(a, g); break;
    case 'working': working(a, g); break;
    case 'chatting': chatting(a, g); break;
    case 'meeting': a.activity = 'In a meeting'; break;
    default: decide(a, g);
  }
  if (a.thoughtT > 0) a.thoughtT--;
}

export function sendBreak(g, a, mins = 30) {
  if (!a.present) return;
  a.breakUntil = g.time + mins;
  if (a.state === 'working') a.state = 'idle';
  a.activity = 'On a break';
}

export function sendHome(g, a) {
  if (a.present) a.forced = 'home';
}

// After the layout changes, re-route everyone who is on the move.
export function repathAll(g) {
  for (const a of g.agents) {
    if (!a.present || !a.target || (a.state !== 'walking' && a.state !== 'leaving')) continue;
    const t = a.target;
    if (t.type === 'use' && !g.furnById[t.fid]) { a.state = 'idle'; a.target = null; a.path = []; continue; }
    const res = bfs(g, a.floor, Math.round(a.x), Math.round(a.y));
    const p = pathFrom(res, t.tx, t.ty);
    if (p) a.path = p;
    else if (t.type === 'leave') arrive(a, g);
    else { release(a, g); a.state = 'idle'; a.target = null; a.path = []; }
  }
}

export function releaseFurniture(g, f) {
  for (const a of g.agents) {
    const t = a.target;
    if (!t) continue;
    const fid = t.type === 'use' ? t.fid : t.type === 'elevator' && t.next.target.type === 'use' ? t.next.target.fid : null;
    if (fid === f.id) { a.state = 'idle'; a.target = null; a.path = []; }
  }
}

export function endMeetingFor(a) {
  if (a.state === 'meeting' || (a.target && a.target.type === 'meeting')) { a.state = 'idle'; a.target = null; a.path = []; a.wait = 2; }
}

export function removeAgent(g, a) {
  release(a, g);
  g.agents = g.agents.filter((b) => b !== a);
}

export function playSounds(g) {
  if (g.agents.some((a) => a.workingNow && a.floor === g.view) && Math.random() < 0.25) sfx('type');
}
