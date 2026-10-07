// M6 meetings: gather people at a table, see where they stand, persuade, promise, bribe or pull rank, then decide.
import { DATA } from '../data.js';
import { MAP_W } from '../config.js';
import { clock } from '../sim/time.js';
import { toast } from './notify.js';
import { sfx } from '../audio.js';
import { rel, addRel, byId, boss } from '../sim/personality.js';
import { walkable } from '../sim/pathfinding.js';
import { flc } from './building.js';
import { endMeetingFor } from '../sim/agents.js';
import { POLICY_DEFS, favoriteOption, setPolicy } from './policies.js';
import { spend } from './economy.js';
import { teamLead, teamMembers, teamById } from './teams.js';
import { promise } from './careers.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fname = (a) => a.name.split(' ')[0];

export const UNION = {
  name: 'Union vote', desc: 'Recognizing the union raises all salaries by 5% and makes people more loyal.',
  options: [{ id: 'recognize', label: 'Recognize the union' }, { id: 'reject', label: 'No union' }],
};
export const topicDef = (key) => (key === 'union' ? UNION : POLICY_DEFS[key]);
export const tables = (g) => g.furniture.filter((f) => f.type === 'table');

export function canMeet(g) {
  if (g.meeting) return 'A meeting is already running.';
  if (!tables(g).length) return 'Build a Meeting Table first (Build, Meeting tab).';
  return null;
}

function spotsAround(g, t) {
  const d = DATA.furnById[t.type];
  const out = [];
  const so = flc(g, t.floor).seatOcc;
  const cx = t.x + (d.w - 1) / 2, cy = t.y + (d.h - 1) / 2;
  for (let y = t.y - 1; y <= t.y + d.h; y++) for (let x = t.x - 1; x <= t.x + d.w; x++) {
    if (x >= t.x && x < t.x + d.w && y >= t.y && y < t.y + d.h) continue;
    if (!walkable(g, t.floor, x, y) || so[y * MAP_W + x]) continue;
    const dx = cx - x, dy = cy - y;
    out.push({ floor: t.floor, x, y, dir: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up' });
  }
  return out;
}

export function callMeeting(g, key, ids) {
  if (canMeet(g)) return false;
  const t = tables(g).find((x) => x.floor === g.view) || tables(g)[0];
  const spots = spotsAround(g, t);
  const bo = boss(g);
  let people = ids.map((id) => byId(g, id)).filter((a) => a && a.present && !a.isPlayer).slice(0, Math.max(0, spots.length - 1));
  if (!people.length) return false;
  if (bo && bo.present) people = [bo, ...people];
  const m = { key, participants: people.map((a) => a.id), spots: {}, stage: 'gathering', start: g.time, table: t.id, stances: {}, convinced: {}, overruled: {}, actions: 0, proposal: 0, current: -1 };
  people.forEach((a, i) => { m.spots[a.id] = spots[i]; });
  for (const a of people) if (['working', 'idle', 'chatting'].includes(a.state)) { a.state = 'idle'; a.path = []; a.target = null; a.wait = 0; }
  g.meeting = m;
  toast(g, `Meeting called: ${topicDef(key).name}. Everyone is heading to the table.`, 'blue');
  return true;
}

export function cancelMeeting(g) {
  const m = g.meeting;
  if (!m) return;
  for (const id of m.participants) { const a = byId(g, id); if (a) endMeetingFor(a); }
  g.meeting = null;
  if (g.modal === 'meeting') g.modal = null;
}

const staffIn = (g, m) => m.participants.map((id) => byId(g, id)).filter((a) => a && !a.isPlayer);

export function updateMeeting(g) {
  const m = g.meeting;
  if (!m || m.stage !== 'gathering') return;
  const arrived = m.participants.filter((id) => { const a = byId(g, id); return a && a.state === 'meeting'; });
  if (arrived.length === m.participants.length || g.time - m.start > 120) {
    const others = m.participants.filter((id) => !arrived.includes(id));
    for (const id of others) { const a = byId(g, id); if (a) endMeetingFor(a); }
    m.participants = arrived;
    if (!staffIn(g, m).length) { toast(g, 'Nobody showed up to the meeting.', 'yellow'); cancelMeeting(g); return; }
    startTalk(g);
  }
}

function startTalk(g) {
  const m = g.meeting;
  const def = topicDef(m.key);
  m.stage = 'talk';
  m.current = m.key === 'union' ? -1 : def.options.findIndex((o) => o.id === g.policies[m.key]);
  m.proposal = m.current === 0 ? 1 : 0;
  const t = g.furnById[m.table];
  const bonus = g.furniture.filter((f) => f.floor === (t ? t.floor : 0) && DATA.furnById[f.type].meeting).length;
  m.actions = 3 + Math.min(2, bonus);
  computeStances(g);
  g.modal = 'meeting';
  sfx('blip');
}

function favorite(g, a, key) {
  if (key === 'union') return a.loyalty < 55 || a.traits.includes('rebel') ? 0 : 1;
  return favoriteOption(a, key);
}

export function computeStances(g) {
  const m = g.meeting;
  const def = topicDef(m.key);
  const staff = staffIn(g, m);
  for (const a of staff) {
    if (m.convinced[a.id] || m.overruled[a.id]) { m.stances[a.id] = m.proposal; continue; }
    let s = favorite(g, a, m.key);
    if (a.traits.includes('yes_man')) s = m.proposal;
    else if (a.traits.includes('rebel')) s = m.proposal === 0 ? def.options.length - 1 : 0;
    m.stances[a.id] = s;
  }
  // cliques vote together
  for (const c of g.cliques || []) {
    const inRoom = staff.filter((a) => c.members.includes(a.id) && !m.convinced[a.id] && !m.overruled[a.id] && !a.traits.includes('yes_man'));
    if (inRoom.length < 2) continue;
    const votes = {};
    for (const a of inRoom) votes[m.stances[a.id]] = (votes[m.stances[a.id]] || 0) + 1;
    const top = +Object.entries(votes).sort((p, q) => q[1] - p[1])[0][0];
    for (const a of inRoom) m.stances[a.id] = top;
  }
}

export function setProposal(g, idx) {
  g.meeting.proposal = idx;
  computeStances(g);
}

export function supportCounts(g) {
  const m = g.meeting;
  const counts = topicDef(m.key).options.map(() => 0);
  for (const a of staffIn(g, m)) counts[m.stances[a.id]]++;
  return counts;
}

export function statement(g, a) {
  const m = g.meeting;
  const def = topicDef(m.key);
  const s = m.stances[a.id];
  if (m.overruled[a.id]) return 'Fine. You are the boss.';
  if (m.convinced[a.id]) return 'Okay, you convinced me.';
  if (a.traits.includes('yes_man')) return 'Whatever you think is best, boss.';
  if (a.traits.includes('rebel') && s !== m.proposal) return 'Absolutely not. On principle.';
  if (m.key === 'union') return s === 0 ? 'We deserve a voice.' : 'I don\'t need a union.';
  const tp = DATA.topics.find((t) => t.id === def.topic);
  const o = a.opinions ? a.opinions[def.topic] : 0;
  if (o > 0) return tp.pro;
  if (o < 0) return tp.con;
  return `${def.options[s].label} sounds fine to me.`;
}

export function act(g, kind, id) {
  const m = g.meeting;
  if (!m || m.actions <= 0) return;
  const a = byId(g, id);
  const bo = boss(g);
  if (kind === 'rank') {
    for (const p of staffIn(g, m)) if (m.stances[p.id] !== m.proposal) { m.overruled[p.id] = true; m.stances[p.id] = m.proposal; }
    m.actions = 0;
    toast(g, 'You pulled rank. The room goes quiet. Nobody looks happy.', 'yellow');
    return;
  }
  if (!a || m.stances[a.id] === m.proposal) return;
  m.actions--;
  if (kind === 'persuade') {
    const chance = clamp(0.35 + rel(g, a, bo) / 200 + (a.traits.includes('drama_queen') ? -0.1 : 0), 0.1, 0.9);
    if (Math.random() < chance) { m.convinced[a.id] = true; m.stances[a.id] = m.proposal; toast(g, `${fname(a)} came around.`, 'green'); }
    else { addRel(g, a, bo, -2); toast(g, `${fname(a)} is not convinced.`, 'red'); }
  } else if (kind === 'promise') {
    m.convinced[a.id] = true; m.stances[a.id] = m.proposal;
    promise(g, a, 'raise', 10);
    toast(g, `You promised ${fname(a)} a raise within 10 days. Better keep it.`, 'yellow');
  } else if (kind === 'snacks') {
    spend(g, 50, 'utilities');
    const likes = (a.opinions && a.opinions.snacks >= 1) || a.traits.includes('coffee_addict') || a.traits.includes('party_animal');
    if (likes) { m.convinced[a.id] = true; m.stances[a.id] = m.proposal; toast(g, `${fname(a)} accepts the croissant and your argument.`, 'green'); }
    else { addRel(g, a, bo, -4); toast(g, `${fname(a)} is insulted by the muffin.`, 'red'); }
  }
}

function applyResult(g, key, idx, voters) {
  if (key === 'union') {
    if (idx === 0) {
      for (const a of g.agents) if (!a.isPlayer) { a.salary = Math.round(a.salary * 1.05 / 50) * 50; a.loyalty = clamp(a.loyalty + 10, 0, 100); }
    } else {
      for (const a of voters) if (favorite(g, a, 'union') === 0) a.loyalty = clamp(a.loyalty - 10, 0, 100);
    }
    g.milestoneFlags.union = true;
  } else setPolicy(g, key, topicDef(key).options[idx].id);
}

export function decide(g, idx) {
  const m = g.meeting;
  const def = topicDef(m.key);
  const bo = boss(g);
  const staff = staffIn(g, m);
  let pro = 0, con = 0;
  for (const a of staff) {
    if (m.overruled[a.id]) { addRel(g, a, bo, -6); a.loyalty = clamp(a.loyalty - 4, 0, 100); a.needs.stress = clamp(a.needs.stress + 10, 0, 100); con++; }
    else if (m.stances[a.id] !== idx) { addRel(g, a, bo, -5); a.loyalty = clamp(a.loyalty - 4, 0, 100); a.needs.stress = clamp(a.needs.stress + 12, 0, 100); con++; }
    else { addRel(g, a, bo, 2); a.loyalty = clamp(a.loyalty + 2, 0, 100); pro++; }
  }
  applyResult(g, m.key, idx, staff);
  g.meetingLog.unshift({ day: clock(g.time).day, key: m.key, label: def.options[idx].label, pro, con });
  if (g.meetingLog.length > 10) g.meetingLog.pop();
  toast(g, `Decided: ${def.name}, ${def.options[idx].label}. ${pro} happy, ${con} unhappy.`, con > pro ? 'yellow' : 'green');
  for (const id of m.participants) { const a = byId(g, id); if (a) endMeetingFor(a); }
  g.meeting = null;
  g.modal = null;
}

// Change a topic policy without a meeting. Everyone who wanted something else resents it.
export function decree(g, key, idx) {
  const def = topicDef(key);
  const bo = boss(g);
  let upset = 0;
  for (const a of g.agents) {
    if (a.isPlayer) continue;
    if (favoriteOption(a, key) !== idx) { addRel(g, a, bo, -6); a.loyalty = clamp(a.loyalty - 4, 0, 100); upset++; }
  }
  setPolicy(g, key, def.options[idx].id);
  g.meetingLog.unshift({ day: clock(g.time).day, key, label: def.options[idx].label, pro: g.agents.length - 1 - upset, con: upset, decree: true });
  if (g.meetingLog.length > 10) g.meetingLog.pop();
  toast(g, `Decree: ${def.name} is now ${def.options[idx].label}. ${upset} people are annoyed you skipped the meeting.`, upset ? 'yellow' : 'green');
}

// How many staff prefer each option of a topic.
export function preferences(g, key) {
  const def = topicDef(key);
  const counts = def.options.map(() => 0);
  for (const a of g.agents) if (!a.isPlayer) counts[favorite(g, a, key)]++;
  return counts;
}

// Leads can decide for their team. You get the protocol and can veto within two days.
export function delegate(g, teamId, key) {
  const t = teamById(g, teamId);
  const lead = t && teamLead(g, t);
  if (!lead) return false;
  const def = topicDef(key);
  const counts = def.options.map(() => 0);
  for (const a of teamMembers(g, t)) counts[favoriteOption(a, key)]++;
  const idx = counts.indexOf(Math.max(...counts));
  const prev = g.policies[key];
  setPolicy(g, key, def.options[idx].id);
  g.meetingLog.unshift({ day: clock(g.time).day, key, label: def.options[idx].label, pro: counts[idx], con: counts.reduce((s, v) => s + v, 0) - counts[idx], lead: lead.id, prev, vetoUntil: clock(g.time).day + 2 });
  toast(g, `Protocol from ${fname(lead)}: ${t.name} chose "${def.options[idx].label}" for ${def.name}.`, 'blue');
  return true;
}

export function veto(g, rec) {
  const lead = byId(g, rec.lead);
  setPolicy(g, rec.key, rec.prev);
  rec.vetoUntil = -1;
  rec.vetoed = true;
  if (lead) { lead.loyalty = clamp(lead.loyalty - 10, 0, 100); addRel(g, lead, boss(g), -10); }
  toast(g, 'Vetoed. Your lead pretends not to mind.', 'yellow');
}
