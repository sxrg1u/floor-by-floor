// Levels, salaries, loyalty, raises, promotions, promises and resignations.
import { LEVELS, LEVEL_SKILL } from '../config.js';
import { clock } from '../sim/time.js';
import { toast } from './notify.js';
import { sfx } from '../audio.js';
import { pushEvent } from './events.js';
import { is } from './policies.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fname = (a) => a.name.split(' ')[0];

export const levelName = (a) => LEVELS[a.level || 0];
export const mainSkillOf = (a) => (a.mainSkill ? a.skills[a.mainSkill] || 1 : 1);

export function levelForSkill(s) {
  let l = 0;
  for (let i = 1; i < LEVEL_SKILL.length - 1; i++) if (s >= LEVEL_SKILL[i]) l = i;
  return Math.min(l, 2); // new hires start at Senior at most
}

// What this person could earn elsewhere.
export function marketValue(a) {
  return Math.round((800 + 600 * mainSkillOf(a) + 300 * (a.level || 0)) / 50) * 50;
}

export function canPromote(a) {
  return !a.isPlayer && a.level < LEVELS.length - 1 && mainSkillOf(a) >= LEVEL_SKILL[a.level + 1];
}

export function promote(g, a) {
  if (!canPromote(a)) return false;
  a.level++;
  a.salary = Math.round((a.salary * 1.15) / 50) * 50;
  a.loyalty = clamp(a.loyalty + 20, 0, 100);
  a.eligibleSince = null;
  a.lastPromoDay = clock(g.time).day;
  a.needs.stress = Math.max(0, a.needs.stress - 20);
  toast(g, `${fname(a)} is now ${LEVELS[a.level]}. Salary ${a.salary}/mo.`, 'green');
  sfx('hire');
  return true;
}

export function giveRaise(g, a, pct) {
  const add = Math.round((a.salary * pct) / 50) * 50;
  a.salary += add;
  a.loyalty = clamp(a.loyalty + pct * 120, 0, 100);
  a.lastRaiseDay = clock(g.time).day;
  g.promises = g.promises.filter((p) => !(p.agent === a.id && p.kind === 'raise'));
  toast(g, `${fname(a)} got a raise to $${a.salary}/mo.`, 'green');
  return add;
}

// Chance an applicant accepts an offer (0..1).
export function offerChance(ap, offer) {
  const r = offer / ap.salary;
  let p = 0.55 + (r - 1) * 4.5;
  if (ap.traits.includes('ambitious')) p -= 0.15;
  if (ap.traits.includes('lazy')) p += 0.1;
  if (r >= 1) p = Math.max(p, 0.95);
  return clamp(p, 0.02, 1);
}

export function promise(g, a, kind, days = 10) {
  g.promises.push({ agent: a.id, kind, due: clock(g.time).day + days });
}

// Daily: loyalty drifts with mood and pay, people ask for raises, broken promises, resignations.
export function careerDay(g) {
  const day = clock(g.time).day;
  let asked = false, quitting = false;
  for (const a of g.agents) {
    if (a.isPlayer) continue;
    const mv = marketValue(a);
    let d = (a.mood - 50) / 25;
    if (a.salary < mv * 0.9) d -= 2;
    else if (a.salary > mv * 1.05) d += 0.5;
    if (canPromote(a)) {
      if (a.eligibleSince == null) a.eligibleSince = day;
      if (day - a.eligibleSince > 10) d -= 1.5;
    } else a.eligibleSince = null;
    if (is(g, 'party', 'bonus')) d += 0.2;
    a.loyalty = clamp(a.loyalty + d, 0, 100);

    if (!asked && a.salary < mv * 0.95 && day - (a.lastRaiseDay ?? a.hiredDay ?? 0) > 15 && day - (a.askedDay || -99) > 12 && Math.random() < 0.15) {
      asked = true; a.askedDay = day;
      pushEvent(g, 'raise', { a: a.id, want: mv });
    }
    if (!quitting && a.loyalty < 10 && Math.random() < 0.5) {
      quitting = true;
      pushEvent(g, 'quit', { a: a.id });
    }
  }
  for (const p of [...g.promises]) {
    if (p.due > day) continue;
    g.promises = g.promises.filter((x) => x !== p);
    const a = g.agents.find((x) => x.id === p.agent);
    if (!a) continue;
    a.loyalty = clamp(a.loyalty - 25, 0, 100);
    toast(g, `You promised ${fname(a)} a raise and never delivered. They noticed.`, 'red');
  }
}
