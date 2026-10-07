// M5: traits, opinions, relationships, chats, cliques, crushes, dating, gossip and drama events.
import { DATA } from '../data.js';
import { clock } from './time.js';
import { pickJob } from '../systems/jobs.js';
import { toast } from '../systems/notify.js';
import { sfx } from '../audio.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rint(arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fname = (a) => a.name.split(' ')[0];
const article = (w) => (/^[AEIOU]/.test(w) ? 'an' : 'a');

export const FRIEND = 60;
export const RIVAL = -40;

// ---------- generation ----------
export function genPersonality() {
  const pool = [...DATA.traits];
  const n = Math.random() < 0.4 ? 3 : 2;
  const traits = [];
  while (traits.length < n && pool.length) {
    const t = pool.splice(rint(pool.length), 1)[0];
    const clash = traits.some((id) => (t.conflicts || []).includes(id) || (DATA.traitById[id].conflicts || []).includes(t.id));
    if (!clash) traits.push(t.id);
  }
  const opinions = {};
  for (const tp of DATA.topics) {
    let v = rint(5) - 2;
    for (const id of traits) v += (DATA.traitById[id].opinions || {})[tp.id] || 0;
    opinions[tp.id] = clamp(Math.round(v), -2, 2);
  }
  return { traits, known: traits.map((_, i) => i === 0), opinions };
}

export function buildMods(traitIds = []) {
  const m = { output: 1, quality: 0, xp: 1, stress: 1, decay: {}, restore: {}, rel: 1, relBias: 0, boss: 0, arrive: 0, gossip: 0 };
  for (const id of traitIds) {
    const t = DATA.traitById[id];
    if (!t) continue;
    for (const [k, v] of Object.entries(t.mods)) {
      if (k === 'decay' || k === 'restore') for (const [n, f] of Object.entries(v)) m[k][n] = (m[k][n] || 1) * f;
      else if (k === 'output' || k === 'xp' || k === 'stress' || k === 'rel') m[k] *= v;
      else m[k] += v;
    }
  }
  return m;
}

// ---------- relationships ----------
const key = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
export const rel = (g, a, b) => g.rel[key(a.id, b.id)] || 0;
export function addRel(g, a, b, d) { const k = key(a.id, b.id); g.rel[k] = clamp((g.rel[k] || 0) + d, -100, 100); }
export function setRel(g, a, b, v) { g.rel[key(a.id, b.id)] = clamp(v, -100, 100); }

// Opinion similarity, -2 (opposites) .. +2 (identical).
export function compat(a, b) {
  if (!a.opinions || !b.opinions) return 0;
  let s = 0;
  for (const tp of DATA.topics) s += 2 - Math.abs(a.opinions[tp.id] - b.opinions[tp.id]);
  return s / DATA.topics.length;
}

export function relLabel(g, a, b) {
  if (a.partner === b.id) return ['Dating', 'pink'];
  if (a.crush === b.id) return ['Crush', 'pink'];
  if (b.crush === a.id) return ['Admirer', 'pink'];
  const r = rel(g, a, b);
  if (r >= FRIEND) return ['Friend', 'green'];
  if (r <= RIVAL) return ['Rival', 'red'];
  if (r >= 25) return ['Friendly', 'green'];
  if (r <= -15) return ['Tense', 'yellow'];
  return ['Coworker', 'neutral'];
}

export function relationsOf(g, a) {
  return g.agents.filter((b) => b !== a && !b.isPlayer)
    .map((b) => ({ b, r: rel(g, a, b), label: relLabel(g, a, b) }))
    .sort((p, q) => Math.abs(q.r) - Math.abs(p.r));
}

export const boss = (g) => g.agents.find((a) => a.isPlayer);

export function initRelations(g, a) {
  for (const b of g.agents) {
    if (b === a) continue;
    if (b.isPlayer) setRel(g, a, b, 10 + a.mods.boss);
    else setRel(g, a, b, Math.round(compat(a, b) * 5 + rnd(-6, 6)));
  }
}

export function interact(g, a, b, base = 1.5) {
  if (a.isPlayer || b.isPlayer) {
    const e = a.isPlayer ? b : a;
    addRel(g, a, b, (1 + rnd(-1, 1.5)) * e.mods.rel);
    return;
  }
  const d = (base + compat(a, b) * 1.2 + rnd(-1.5, 1.5)) * a.mods.rel * b.mods.rel + a.mods.relBias + b.mods.relBias;
  addRel(g, a, b, d);
}

// ---------- small talk ----------
function faceDir(p, q) {
  const dx = q.x - p.x, dy = q.y - p.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}

export function tryChat(a, g) {
  if (a.needs.social > 75 || Math.random() > 0.2) return false;
  const free = (b) => b.state === 'idle' || (b.state === 'walking' && b.target && b.target.type === 'wander');
  const cands = g.agents.filter((b) => b !== a && b.present && free(b) && Math.abs(b.x - a.x) + Math.abs(b.y - a.y) <= 4);
  if (!cands.length) return false;
  const b = pick(cands);
  const r = rel(g, a, b);
  const kind = a.partner === b.id ? 'pink' : r >= 25 ? 'green' : r <= -15 ? 'red' : 'blue';
  for (const [p, q] of [[a, b], [b, a]]) {
    p.state = 'chatting'; p.path = []; p.target = null; p.timer = 12; p.chatWith = q.id;
    p.dir = faceDir(p, q);
    p.activity = (q.isPlayer ? 'Talking to the boss' : 'Chatting with ' + fname(q));
    p.bubble = { icon: 'chat', kind, t: 12 };
  }
  return true;
}

export function chatting(a, g) {
  const b = g.agents.find((x) => x.id === a.chatWith);
  a.needs.social = clamp(a.needs.social + 2.2, 0, 100);
  if (!b || !b.present || b.state !== 'chatting' || b.chatWith !== a.id) { a.state = 'idle'; a.chatWith = null; return; }
  if (--a.timer <= 0) {
    if (a.id < b.id) interact(g, a, b);
    a.state = 'idle'; a.chatWith = null; a.wait = 2;
  }
}

export function flavorThought(a) {
  if (a.traits && a.traits.length && Math.random() < 0.5) {
    const t = DATA.traitById[pick(a.traits)];
    return t ? pick(t.thoughts) : null;
  }
  if (a.opinions) {
    const strong = DATA.topics.filter((tp) => Math.abs(a.opinions[tp.id]) === 2);
    if (strong.length) { const tp = pick(strong); return a.opinions[tp.id] > 0 ? tp.pro : tp.con; }
  }
  return null;
}

// ---------- hourly: mood from people, team chemistry, desk neighbors ----------
export function socialHour(g) {
  const day = clock(g.time).day;
  const present = g.agents.filter((a) => a.present);
  const b0 = boss(g);
  for (const a of g.agents) {
    let m = 0;
    if (!a.isPlayer) {
      for (const b of present) {
        if (b === a || b.isPlayer) continue;
        if (a.partner === b.id) m += 8;
        else { const r = rel(g, a, b); if (r >= FRIEND) m += 3; else if (r <= RIVAL) m -= 4; }
      }
      m = clamp(m, -10, 12);
      if (b0) m += clamp(rel(g, a, b0) / 25, -4, 4);
      const cl = (g.cliques || []).find((c) => c.members.includes(a.id));
      if (cl && present.filter((b) => b !== a && cl.members.includes(b.id)).length >= 2) m += 3;
    }
    if ((a.heartbreak || 0) > day) m -= 15;
    if ((g.dramaUntil || 0) > day) m -= 4;
    a.socialMood = m;
  }
  // chemistry on shared jobs
  const workers = present.filter((a) => a.state === 'working');
  const jobOf = new Map(workers.map((a) => [a, pickJob(a, g)]));
  for (const a of workers) {
    let c = 1;
    const j = jobOf.get(a);
    if (j && !a.isPlayer) {
      let fr = 0, rv = 0;
      for (const b of workers) {
        if (b === a || b.isPlayer || jobOf.get(b) !== j) continue;
        const r = rel(g, a, b);
        if (r >= FRIEND || a.partner === b.id) fr++; else if (r <= RIVAL) rv++;
      }
      c = clamp(1 + 0.05 * Math.min(3, fr) - 0.08 * rv, 0.75, 1.15);
    }
    a.chem = c;
  }
  // neighbors at desks slowly bond (or annoy each other)
  for (let i = 0; i < workers.length; i++) for (let k = i + 1; k < workers.length; k++) {
    const a = workers[i], b = workers[k];
    if (a.isPlayer || b.isPlayer) continue;
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 3) addRel(g, a, b, (0.3 + compat(a, b) * 0.4) * a.mods.rel * b.mods.rel);
  }
}

// ---------- events ----------
export function pushEvent(g, ev) { g.events.push(ev); }

const RUMORS = ['is interviewing at a competitor.', 'microwaves fish on purpose.', 'wrote a poem about synergy.', 'earns twice as much as everyone.',
  'has a secret second career as a DJ.', 'took the last yogurt. Again.', 'uses Comic Sans in client decks.', 'reply-alls on purpose.'];
const BOSS_RUMORS = ['is planning layoffs.', 'has never read a single report.', 'takes three-hour lunches.', 'still uses Internet Explorer.'];
const CLIQUE_NAMES = ['The Fridge Council', 'Team Espresso', 'The Lunch Table', 'Spreadsheet Society', 'The Back Row', 'Club Synergy', 'The Cooler Crew', 'Friday Committee'];

function staffOf(g) { return g.agents.filter((a) => !a.isPlayer); }

function moveDesksApart(g, a, b) {
  const da = g.furnById[a.desk], db = g.furnById[b.desk];
  if (!da || !db) return;
  let best = null, bd = -1;
  for (const c of staffOf(g)) {
    if (c === a || c === b || c.desk == null) continue;
    const dc = g.furnById[c.desk];
    const d = Math.abs(dc.x - da.x) + Math.abs(dc.y - da.y);
    if (d > bd) { bd = d; best = c; }
  }
  if (best && bd > Math.abs(db.x - da.x) + Math.abs(db.y - da.y)) {
    const t = best.desk; best.desk = b.desk; b.desk = t;
    for (const p of [b, best]) if (p.state === 'working') p.state = 'idle';
  }
}

function startDating(g, a, b) {
  a.partner = b.id; b.partner = a.id; a.crush = null; b.crush = null;
  const bo = boss(g);
  pushEvent(g, {
    title: 'Office romance',
    text: `${fname(a)} and ${fname(b)} are officially dating. They told everyone at the water cooler. Twice.`,
    options: [
      { label: 'Congratulate them', tip: 'Both like you a bit more.', run: () => { addRel(g, a, bo, 8); addRel(g, b, bo, 8); } },
      { label: 'Remind them about "professional conduct"', tip: 'Both like you a bit less.', run: () => { addRel(g, a, bo, -6); addRel(g, b, bo, -6); } },
      { label: 'Say nothing', tip: 'Love is in the air. And in the Slack channel.', run: () => {} },
    ],
  });
  sfx('hire');
}

function breakup(g, a, b, day) {
  a.partner = null; b.partner = null;
  setRel(g, a, b, -40);
  a.heartbreak = day + 4; b.heartbreak = day + 4;
  g.dramaUntil = day + 3;
  pushEvent(g, {
    title: 'The breakup',
    text: `${fname(a)} and ${fname(b)} broke up. Next to the coffee machine. During lunch. The whole floor felt it.`,
    options: [
      { label: 'Move their desks apart', tip: 'Swaps desks so they sit far from each other. The drama fades faster.', run: () => { moveDesksApart(g, a, b); g.dramaUntil = day + 1; } },
      { label: 'Give them both a day off', tip: 'They stay home tomorrow and heal faster.', run: () => { a.dayOff = day; b.dayOff = day; a.heartbreak = day + 2; b.heartbreak = day + 2; } },
      { label: 'Business as usual', tip: 'Everybody is sad for a few days.', run: () => {} },
    ],
  });
  sfx('bad');
}

function romance(g, day) {
  const staff = staffOf(g);
  for (let i = 0; i < staff.length; i++) for (let k = i + 1; k < staff.length; k++) {
    const a = staff[i], b = staff[k];
    const r = rel(g, a, b);
    if (a.partner === b.id) {
      const stress = (a.needs.stress + b.needs.stress) / 2;
      const chance = r < 50 ? 1 : 0.04 + (stress > 60 ? 0.08 : 0);
      if (Math.random() < chance) breakup(g, a, b, day); else addRel(g, a, b, 1);
      continue;
    }
    if (a.partner || b.partner) continue;
    if ((a.crush === b.id || b.crush === a.id) && r >= 80 && Math.random() < 0.3) { startDating(g, a, b); continue; }
    if (r >= 65 && !a.crush && !b.crush && Math.random() < 0.12) {
      const [p, q] = Math.random() < 0.5 ? [a, b] : [b, a];
      p.crush = q.id;
      p.thought = `${fname(q)} laughed at my joke. ${fname(q).toUpperCase()} LAUGHED AT MY JOKE.`;
      p.thoughtT = 600;
      toast(g, `${fname(p)} keeps "accidentally" walking past ${fname(q)}'s desk.`, 'pink');
    }
  }
}

function rivals(g, day) {
  const staff = staffOf(g);
  const bo = boss(g);
  let argued = false;
  for (let i = 0; i < staff.length; i++) for (let k = i + 1; k < staff.length; k++) {
    const a = staff[i], b = staff[k];
    if (rel(g, a, b) > RIVAL) continue;
    const job = g.jobs.find((j) => !j.team || (j.team.includes(a.id) && j.team.includes(b.id)));
    if (job && Math.random() < 0.15) {
      const [p, q] = Math.random() < 0.5 ? [a, b] : [b, a];
      job.done = Math.max(0, job.done - job.workload * 0.05);
      toast(g, `${fname(p)} "accidentally" deleted ${fname(q)}'s files. ${job.name} lost 5%.`, 'red');
    }
    if (!argued && Math.random() < 0.12) {
      argued = true;
      pushEvent(g, {
        title: 'Thermostat war',
        text: `${fname(a)} and ${fname(b)} are arguing about the thermostat. Loudly. In front of a client.`,
        options: [
          { label: `Side with ${fname(a)}`, tip: `${fname(a)} likes you more, ${fname(b)} less.`, run: () => { addRel(g, a, bo, 10); addRel(g, b, bo, -10); addRel(g, a, b, -5); } },
          { label: `Side with ${fname(b)}`, tip: `${fname(b)} likes you more, ${fname(a)} less.`, run: () => { addRel(g, b, bo, 10); addRel(g, a, bo, -10); addRel(g, a, b, -5); } },
          { label: 'Buy a second thermostat ($200)', tip: 'Peace through hardware. They warm up to each other.', run: () => { g.money -= 200; g.month.building += 200; addRel(g, a, b, 15); } },
        ],
      });
    }
  }
}

function gossip(g, day) {
  const staff = staffOf(g);
  const bo = boss(g);
  for (const G of staff) {
    if (!G.mods.gossip || (G.gossipCool || 0) > day || Math.random() > 0.25) continue;
    const others = staff.filter((x) => x !== G);
    if (others.length < 2) continue;
    const aboutBoss = Math.random() < 0.2;
    const victim = aboutBoss ? bo : pick(others);
    const listener = pick(others.filter((x) => x !== victim));
    const rumor = pick(aboutBoss ? BOSS_RUMORS : RUMORS);
    const vName = aboutBoss ? 'the boss' : fname(victim);
    addRel(g, listener, victim, -6 * listener.mods.rel);
    addRel(g, G, listener, 3);
    if (!aboutBoss) addRel(g, G, victim, -3);
    if (Math.random() < 0.2 && !g.events.length && day - (g.lastRumorEvent || -99) >= 5) {
      g.lastRumorEvent = day;
      pushEvent(g, {
        title: 'Rumor mill',
        text: `${fname(G)} has been telling everyone that ${vName} ${rumor}`,
        options: [
          { label: 'Clear the air at the cooler', tip: `Takes the sting out. ${fname(G)} likes you less.`, run: () => { for (const x of staff) if (x !== victim) addRel(g, x, victim, 4); addRel(g, G, bo, -5); } },
          { label: `Ask ${fname(G)} to stop`, tip: `No gossip for a week. ${fname(G)} is not happy about it.`, run: () => { G.gossipCool = day + 5; addRel(g, G, bo, -10); G.needs.stress = Math.min(100, G.needs.stress + 20); } },
          { label: 'Ignore it', tip: `Everyone thinks a little less of ${vName}.`, run: () => { for (const x of staff) if (x !== victim && x !== G) addRel(g, x, victim, -3); } },
        ],
      });
    } else {
      toast(g, `${fname(G)} told ${fname(listener)} that ${vName} ${rumor}`, 'yellow');
    }
  }
}

function updateCliques(g) {
  const staff = staffOf(g);
  const seen = new Set();
  const comps = [];
  for (const a of staff) {
    if (seen.has(a.id)) continue;
    const comp = [];
    const stack = [a];
    seen.add(a.id);
    while (stack.length) {
      const p = stack.pop();
      comp.push(p.id);
      for (const q of staff) if (!seen.has(q.id) && rel(g, p, q) >= FRIEND) { seen.add(q.id); stack.push(q); }
    }
    if (comp.length >= 3) comps.push(comp);
  }
  const old = g.cliques || [];
  const next = [];
  for (const members of comps) {
    const prev = old.find((c) => c.members.filter((id) => members.includes(id)).length >= 2);
    if (prev) next.push({ name: prev.name, members });
    else {
      const used = new Set([...old, ...next].map((c) => c.name));
      const name = CLIQUE_NAMES.find((n) => !used.has(n)) || 'The Other Clique';
      next.push({ name, members });
      const names = members.map((id) => fname(g.agents.find((x) => x.id === id)));
      toast(g, `${names.slice(0, -1).join(', ')} and ${names.at(-1)} now eat lunch together. They call themselves "${name}".`, 'green');
    }
  }
  g.cliques = next;
}

function reveals(g) {
  for (const a of staffOf(g)) {
    if (!a.known || a.daysWorked < 2 || a.daysWorked % 2 || a.lastReveal === a.daysWorked) continue;
    const i = a.known.indexOf(false);
    if (i < 0) continue;
    a.known[i] = true;
    a.lastReveal = a.daysWorked;
    const t = DATA.traitById[a.traits[i]];
    toast(g, `Turns out ${fname(a)} is ${article(t.name)} ${t.name}. ${t.desc}`, 'blue');
  }
}

export function socialDay(g) {
  const day = clock(g.time).day;
  reveals(g);
  updateCliques(g);
  romance(g, day);
  rivals(g, day);
  gossip(g, day);
}

export function onFired(g, a) {
  const bo = boss(g);
  const upset = [];
  for (const b of staffOf(g)) {
    if (b === a) continue;
    if (b.partner === a.id) { b.partner = null; b.heartbreak = clock(g.time).day + 4; upset.push(b); addRel(g, b, bo, -30); }
    else if (rel(g, a, b) >= FRIEND) { upset.push(b); addRel(g, b, bo, -12); }
    if (b.crush === a.id) b.crush = null;
  }
  if (upset.length) toast(g, `${upset.map(fname).join(' and ')} ${upset.length > 1 ? 'are' : 'is'} upset that you fired ${fname(a)}.`, 'red');
}
