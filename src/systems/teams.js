// Teams: you create them, fill them and hand them jobs. Nobody works without a team.
import { TEAM_COLORS } from '../config.js';
import { toast } from './notify.js';

const NAMES = ['Team Alpha', 'Team Bravo', 'Skunkworks', 'Night Shift', 'Rocket Crew', 'Blue Squad', 'Plan B', 'The A-Team', 'Task Force', 'Moonshot'];

export function createTeam(g) {
  const used = new Set(g.teams.map((t) => t.name));
  const name = NAMES.find((n) => !used.has(n)) || `Team ${g.teams.length + 1}`;
  const colorsUsed = new Set(g.teams.map((t) => t.color));
  const color = TEAM_COLORS.find((c) => !colorsUsed.has(c)) || TEAM_COLORS[g.teams.length % TEAM_COLORS.length];
  const t = { id: g.nextId++, name, color, members: [] };
  g.teams.push(t);
  return t;
}

export function deleteTeam(g, t) {
  for (const id of t.members) { const a = g.agents.find((x) => x.id === id); if (a) a.task = null; }
  for (const j of g.jobs) if (j.team === t.id) j.team = null;
  g.teams = g.teams.filter((x) => x !== t);
}

export const teamById = (g, id) => g.teams.find((t) => t.id === id) || null;
export const teamOf = (g, a) => g.teams.find((t) => t.members.includes(a.id)) || null;

export function setTeam(g, a, teamId) {
  if (a.isPlayer) return;
  for (const t of g.teams) t.members = t.members.filter((id) => id !== a.id);
  const t = teamId != null ? teamById(g, teamId) : null;
  if (t) t.members.push(a.id);
  // a task only stays valid if the job still belongs to the new team
  if (a.task) { const j = g.jobs.find((x) => x.id === a.task.job); if (!j || !t || j.team !== t.id) a.task = null; }
}

export function teamMembers(g, t) {
  return t.members.map((id) => g.agents.find((a) => a.id === id)).filter(Boolean);
}

// Highest-ranked member at Lead level or above.
export function teamLead(g, t) {
  let best = null;
  for (const a of teamMembers(g, t)) if (a.level >= 3 && (!best || a.level > best.level)) best = a;
  return best;
}

// Leads push their team: +5% (Lead) or +10% (Head).
export function leadBonus(g, a) {
  const t = teamOf(g, a);
  if (!t) return 1;
  const l = teamLead(g, t);
  return l ? 1 + (l.level - 2) * 0.05 : 1;
}

export function renameTeam(g, t, name) {
  t.name = name.trim().slice(0, 18) || t.name;
}

export function removeFromTeams(g, a) {
  for (const t of g.teams) t.members = t.members.filter((id) => id !== a.id);
}

export function teamNote(g, t) {
  const jobs = g.jobs.filter((j) => j.team === t.id);
  if (!t.members.length) toast(g, `${t.name} has no members yet.`, 'yellow');
  return jobs;
}
