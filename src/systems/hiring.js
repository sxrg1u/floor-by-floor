// Applicants, hiring and firing.
import { DATA } from '../data.js';
import { HAIRS, SKINS, OUTFITS, HAIR_STYLES } from '../config.js';
import { clock, WORK_START, WORK_END } from '../sim/time.js';
import { makeAgent, spawnAgent, removeAgent, firstName } from '../sim/agents.js';
import { assignDesks } from './building.js';
import { genPersonality, initRelations, onFired } from '../sim/personality.js';
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
  const base = 2 + Math.floor(g.rep / 20);
  const main = clamp(base + rint(3) - 1, 1, 10);
  const skills = {};
  for (const s of ind.skills) skills[s] = s === role.skill ? main : clamp(1 + rint(Math.max(1, main - 1)), 1, 10);
  const salary = Math.round((1300 + main * 450 + rint(400) - 150) / 50) * 50;
  // avoid two people with the same first name in one office
  const taken = new Set([...g.agents, ...g.applicants].map((p) => p.name.split(' ')[0]));
  let name = randomName();
  for (let i = 0; i < 20 && taken.has(name.split(' ')[0]); i++) name = randomName();
  return { id: g.nextId++, name, role: role.name, mainSkill: role.skill, skills, salary, look: randomLook(), ...genPersonality() };
}

export function refreshApplicants(g) {
  const n = 3 + Math.floor(g.rep / 25);
  g.applicants = Array.from({ length: n }, () => genApplicant(g));
}

export function hire(g, ap) {
  const a = makeAgent(g, ap);
  g.agents.push(a);
  initRelations(g, a);
  g.applicants = g.applicants.filter((x) => x !== ap);
  assignDesks(g);
  const c = clock(g.time);
  if (c.minute >= WORK_START - 60 && c.minute < WORK_END - 30) { a.lastDay = c.day; spawnAgent(a, g); }
  else a.activity = 'Starts tomorrow';
  toast(g, `${firstName(a)} joined as ${ap.role}.`, 'green');
  sfx('hire');
  return a;
}

export function fire(g, a) {
  if (a.isPlayer) return;
  onFired(g, a);
  removeAgent(g, a);
  for (const j of g.jobs) if (j.team) j.team = j.team.filter((id) => id !== a.id);
  if (g.selected === a.id) g.selected = null;
  assignDesks(g);
  toast(g, `${firstName(a)} cleared their desk. They took the stapler.`, 'neutral');
  sfx('bad');
}
