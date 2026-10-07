// Job board, active jobs split into skill parts, team and task assignment, completion and deadlines.
import { DATA } from '../data.js';
import { clock } from '../sim/time.js';
import { earn, fmtMoney } from './economy.js';
import { toast } from './notify.js';
import { sfx } from '../audio.js';
import { is } from './policies.js';
import { teamById } from './teams.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fname = (a) => a.name.split(' ')[0];

export const DAY_RATE = 350; // rough work points per day for one average person

function splitParts(ind, main, total) {
  if (total < 260) return [{ skill: main, work: total }];
  const others = ind.skills.filter((s) => s !== main).sort(() => Math.random() - 0.5);
  const n = total > 700 ? 2 : 1;
  const mainShare = rnd(0.5, 0.7);
  const parts = [{ skill: main, work: Math.round((total * mainShare) / 10) * 10 }];
  let rest = total - parts[0].work;
  for (let i = 0; i < n; i++) {
    const w = i === n - 1 ? rest : Math.round((rest * rnd(0.4, 0.6)) / 10) * 10;
    parts.push({ skill: others[i], work: w });
    rest -= w;
  }
  return parts;
}

export function makeOffer(g) {
  const ind = DATA.indById[g.industry];
  const tpl = pick(ind.jobs);
  let workload = Math.round((260 * tpl.size * (1 + g.rep / 35) * rnd(0.8, 1.2)) / 10) * 10;
  let payF = rnd(0.7, 0.82) * (1 + g.rep / 250);
  let extraDays = 1 + (Math.random() < 0.35 ? 1 : 0);
  if (is(g, 'risk', 'bold')) { workload = Math.round(workload * 1.4 / 10) * 10; payF *= 1.6; extraDays -= 1; }
  if (is(g, 'risk', 'safe')) { payF *= 0.85; extraDays += 1; }
  if (is(g, 'dress', 'suits')) payF *= 1.05;
  if (is(g, 'dress', 'hoodies')) payF *= 0.97;
  const staff = Math.max(1, g.agents.filter((a) => !a.isPlayer).length);
  const days = Math.max(1, Math.ceil(workload / (DAY_RATE * Math.max(1, staff * 0.6))) + extraDays);
  return {
    id: g.nextId++, name: tpl.name, client: pick(ind.clients), skill: tpl.skill, workload,
    parts: splitParts(ind, tpl.skill, workload), pay: Math.round((workload * payF) / 10) * 10, days, expires: clock(g.time).day + 3,
  };
}

export function refreshOffers(g, initial = false) {
  const day = clock(g.time).day;
  g.offers = g.offers.filter((o) => o.expires >= day);
  const staff = g.agents.filter((a) => !a.isPlayer).length;
  const cap = 4 + Math.ceil(staff / 2);
  const target = initial ? 4 : Math.min(cap, g.offers.length + 1 + Math.floor(staff / 3) + (Math.random() < 0.6 ? 1 : 0));
  while (g.offers.length < target) g.offers.push(makeOffer(g));
}

export const maxActive = (g) => 2 + g.teams.length * 2;

export function acceptOffer(g, o) {
  if (g.jobs.length >= maxActive(g)) return false;
  const day = clock(g.time).day;
  g.offers = g.offers.filter((x) => x !== o);
  g.jobs.push({
    id: o.id, name: o.name, client: o.client, pay: o.pay, workload: o.workload,
    parts: o.parts.map((p) => ({ skill: p.skill, work: p.work, done: 0, qsum: 0 })),
    deadlineDay: day + o.days, team: null, late: false,
  });
  toast(g, `Accepted ${o.name}. Give it to a team and put people on its tasks.`, 'blue');
  return true;
}

export function dropJob(g, j) {
  for (const a of g.agents) if (a.task && a.task.job === j.id) a.task = null;
  g.jobs = g.jobs.filter((x) => x !== j);
  g.rep = Math.max(0, g.rep - 3);
  toast(g, `Dropped ${j.name}. ${j.client} is not thrilled. Rep -3.`, 'red');
  sfx('bad');
}

export function setJobTeam(g, j, teamId) {
  j.team = teamId;
  for (const a of g.agents) if (a.task && a.task.job === j.id) a.task = null;
}

// Put a person on one part of a job. Only members of the job's team can work on it.
export function assignTask(g, a, j, idx) {
  const t = teamById(g, j.team);
  if (!t || !t.members.includes(a.id)) return false;
  if (a.task && a.task.job === j.id && a.task.part === idx) { a.task = null; return true; }
  a.task = { job: j.id, part: idx };
  return true;
}

export function taskOf(g, a) {
  if (!a.task) return null;
  const job = g.jobs.find((j) => j.id === a.task.job);
  const part = job && job.parts[a.task.part];
  if (!job || !part || part.done >= part.work) { a.task = null; return null; }
  const t = teamById(g, job.team);
  if (!t || !t.members.includes(a.id)) { a.task = null; return null; }
  return { job, part, idx: a.task.part };
}

export const workersOn = (g, j, idx) => g.agents.filter((a) => a.task && a.task.job === j.id && a.task.part === idx);

export function addWork(g, job, part, units, q) {
  part.done += units;
  part.qsum += q * units;
  if (part.done >= part.work) {
    part.done = part.work;
    const freed = workersOn(g, job, job.parts.indexOf(part));
    for (const a of freed) a.task = null;
    if (job.parts.some((p) => p.done < p.work) && freed.length) {
      toast(g, `${part.skill} part of ${job.name} is done. ${freed.map(fname).join(', ')} ${freed.length > 1 ? 'need' : 'needs'} a new task.`, 'yellow');
    }
  }
}

export function jobQuality(j) {
  let d = 0, q = 0;
  for (const p of j.parts) { d += p.done; q += p.qsum; }
  return d > 0 ? Math.round(clamp((q / d - 0.4) * 100, 0, 100)) : 0;
}
export const jobProgress = (j) => j.parts.reduce((s, p) => s + p.done, 0) / j.parts.reduce((s, p) => s + p.work, 0);

// Rough points per day for one part with the people currently on it.
export function partRate(g, j, idx) {
  let r = 0;
  for (const a of workersOn(g, j, idx)) r += (a.skills[j.parts[idx].skill] || 1) * 0.25 * (0.5 + a.mood / 100) * 450;
  return r;
}

export function etaDays(g, j) {
  let worst = 0;
  for (let i = 0; i < j.parts.length; i++) {
    const p = j.parts[i];
    if (p.done >= p.work) continue;
    const r = partRate(g, j, i);
    if (!r) return Infinity;
    worst = Math.max(worst, (p.work - p.done) / r);
  }
  return worst;
}

function complete(g, j) {
  const day = clock(g.time).day;
  const quality = jobQuality(j);
  const onTime = day <= j.deadlineDay;
  const pay = Math.round(j.pay * (0.6 + 0.8 * quality / 100) * (onTime ? 1 : 0.7));
  // Rep gains shrink as Rep grows, so the climb to 100 takes a long time.
  const rep = onTime ? Math.round(Math.sqrt(j.workload / 400) * ((quality - 20) / 100) * 1.2 * (1 - g.rep / 110) * 10) / 10 : -2;
  earn(g, pay);
  g.rep = clamp(g.rep + rep, 0, 100);
  g.jobs = g.jobs.filter((x) => x !== j);
  for (const a of g.agents) if (a.task && a.task.job === j.id) a.task = null;
  g.doneJobs.unshift({ name: j.name, client: j.client, pay, quality, onTime, day });
  if (g.doneJobs.length > 12) g.doneJobs.pop();
  g.stats.jobsDone++;
  toast(g, `${j.name} delivered. Quality ${quality}%. +${fmtMoney(pay)}, Rep ${rep >= 0 ? '+' : ''}${rep}.`, onTime && quality >= 50 ? 'green' : 'yellow');
  sfx('money');
}

export function checkJobs(g) {
  for (const j of [...g.jobs]) if (j.parts.every((p) => p.done >= p.work)) complete(g, j);
}

export function checkDeadlines(g, day) {
  for (const j of g.jobs) {
    if (!j.late && day > j.deadlineDay) {
      j.late = true;
      g.rep = Math.max(0, g.rep - 2);
      toast(g, `Missed the deadline for ${j.name}. ${j.client} is drafting an email.`, 'red');
    }
  }
}
