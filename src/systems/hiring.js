// Applicants, salary negotiation, hiring, firing and people leaving.
import { DATA } from '../data.js';
import { HAIRS, SKINS, OUTFITS, HAIR_STYLES, LEVELS } from '../config.js';
import { clock } from '../sim/time.js';
import { makeAgent, spawnAgent, removeAgent, firstName, shiftFor } from '../sim/agents.js';
import { assignDesks } from './building.js';
import { genPersonality, initRelations, onLeaving } from '../sim/personality.js';
import { removeFromTeams } from './teams.js';
import { levelForSkill, offerChance } from './careers.js';
import { toast } from './notify.js';
import { sfx } from '../audio.js';

const rint = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rint(arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const randomLook = () => ({ hair: rint(HAIR_STYLES.length), hairColor: rint(HAIRS.length), skin: rint(SKINS.length), outfit: rint(OUTFITS.length) });
export const randomName = () => pick(DATA.names.first) + ' ' + pick(DATA.names.last);

export function genApplicant(g) {
  const ind = DATA.indById[g.industry];
  const role = pick(ind.roles);
  const prestige = g.furniture.filter((f) => DATA.furnById[f.type].prestige).length;
  const base = 2 + Math.floor(g.rep / 18) + Math.min(2, prestige);
  const main = clamp(base + rint(3) - 1, 1, 10);
  const skills = {};
  for (const s of ind.skills) skills[s] = s === role.skill ? main : clamp(1 + rint(Math.max(1, main - 1)), 1, 10);
  const level = levelForSkill(main);
  const salary = Math.round((800 + main * 600 + level * 300 + rint(400) - 150) / 50) * 50;
  const taken = new Set([...g.agents, ...g.applicants].map((p) => p.name.split(' ')[0]));
  let name = randomName();
  for (let i = 0; i < 20 && taken.has(name.split(' ')[0]); i++) name = randomName();
  return { id: g.nextId++, name, role: role.name, mainSkill: role.skill, skills, salary, level, look: randomLook(), tries: 0, offer: salary, ...genPersonality() };
}

export function refreshApplicants(g) {
  const n = 5 + Math.floor(g.rep / 15);
  g.applicants = [];
  for (let i = 0; i < n; i++) g.applicants.push(genApplicant(g));
}

export function hire(g, ap, salary) {
  const day = clock(g.time).day;
  const a = makeAgent(g, { ...ap, salary, hiredDay: day, loyalty: clamp(55 + (salary / ap.salary - 1) * 200, 20, 90) });
  g.agents.push(a);
  g.applicants = g.applicants.filter((x) => x !== ap);
  initRelations(g, a);
  assignDesks(g);
  g.stats.hires++;
  const c = clock(g.time);
  const sh = shiftFor(g, a);
  if (c.minute >= sh.start - 60 && c.minute < sh.end - 30) { a.lastDay = c.day; spawnAgent(a, g); }
  else a.activity = 'Starts tomorrow';
  toast(g, `${firstName(a)} joined for $${salary}/mo. Put them in a team.`, 'green');
  sfx('hire');
  return a;
}

// Make an offer. Returns 'yes', 'no' or 'gone'.
export function negotiate(g, ap, offer) {
  if (Math.random() < offerChance(ap, offer)) { hire(g, ap, offer); return 'yes'; }
  ap.tries++;
  if (ap.tries >= 2) {
    g.applicants = g.applicants.filter((x) => x !== ap);
    toast(g, `${ap.name.split(' ')[0]} took another offer.`, 'red');
    return 'gone';
  }
  toast(g, `${ap.name.split(' ')[0]} declined. One more try.`, 'yellow');
  return 'no';
}

export function departure(g, a, fired) {
  if (a.isPlayer) return;
  onLeaving(g, a, fired);
  removeFromTeams(g, a);
  removeAgent(g, a);
  if (g.selected === a.id) g.selected = null;
  if (g.windows) g.windows = g.windows.filter((w) => w.id !== 'profile-' + a.id);
  assignDesks(g);
  if (!fired) {
    g.stats.resignations++;
    g.stats.lastResignDay = clock(g.time).day;
    toast(g, `${firstName(a)} left the company. They took the stapler and a plant.`, 'red');
  } else toast(g, `${firstName(a)} cleared their desk.`, 'neutral');
  sfx('bad');
}

export const fire = (g, a) => departure(g, a, true);
