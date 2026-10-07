// Job board, active jobs, completion and deadlines.
import { DATA } from '../data.js';
import { clock } from '../sim/time.js';
import { earn, fmtMoney } from './economy.js';
import { toast } from './notify.js';
import { sfx } from '../audio.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const SOLO_RATE = 400; // rough work points per day for one person

export function makeOffer(g) {
  const ind = DATA.indById[g.industry];
  const tpl = pick(ind.jobs);
  const repF = 1 + g.rep / 40;
  const workload = Math.round((220 * tpl.size * repF * rnd(0.8, 1.2)) / 10) * 10;
  const pay = Math.round((workload * rnd(0.65, 0.8) * (1 + g.rep / 150)) / 10) * 10;
  const rate = SOLO_RATE * Math.max(1, g.agents.length * 0.75);
  const days = Math.max(1, Math.ceil(workload / rate)) + 1 + (Math.random() < 0.3 ? 1 : 0);
  return { id: g.nextId++, name: tpl.name, client: pick(ind.clients), skill: tpl.skill, workload, pay, days, expires: clock(g.time).day + 3 };
}

export function refreshOffers(g, initial = false) {
  const day = clock(g.time).day;
  g.offers = g.offers.filter((o) => o.expires >= day);
  const target = initial ? 3 : Math.min(5, g.offers.length + 1 + (Math.random() < 0.5 ? 1 : 0));
  while (g.offers.length < target) g.offers.push(makeOffer(g));
}

export const maxActive = (g) => Math.max(2, g.agents.length + 1);

export function acceptOffer(g, o) {
  if (g.jobs.length >= maxActive(g)) return false;
  const day = clock(g.time).day;
  g.offers = g.offers.filter((x) => x !== o);
  g.jobs.push({ ...o, done: 0, qsum: 0, deadlineDay: day + o.days, team: null, late: false });
  toast(g, `Accepted: ${o.name} for ${o.client}.`, 'blue');
  return true;
}

export function dropJob(g, j) {
  g.jobs = g.jobs.filter((x) => x !== j);
  g.rep = Math.max(0, g.rep - 3);
  toast(g, `Dropped ${j.name}. ${j.client} is not thrilled. Rep -3.`, 'red');
  sfx('bad');
}

export function pickJob(a, g) {
  let best = null;
  for (const j of g.jobs) {
    if (j.done >= j.workload) continue;
    if (j.team && !j.team.includes(a.id)) continue;
    if (!best || j.deadlineDay < best.deadlineDay) best = j;
  }
  return best;
}

export function addWork(g, job, a, units, q) {
  job.done += units;
  job.qsum += q * units;
}

export const jobQuality = (j) => (j.done > 0 ? Math.round(clamp((j.qsum / j.done - 0.5) * 100, 0, 100)) : 0);

function complete(g, j) {
  const day = clock(g.time).day;
  const quality = jobQuality(j);
  const onTime = day <= j.deadlineDay;
  const pay = Math.round(j.pay * (0.75 + 0.5 * quality / 100) * (onTime ? 1 : 0.75));
  // Rep gains shrink as Rep grows, so the climb to 100 takes a while.
  const rep = onTime ? Math.max(quality >= 40 ? 1 : 0, Math.round(Math.sqrt(j.workload / 250) * (quality / 100) * 2.5 * (1 - g.rep / 110))) : -2;
  earn(g, pay);
  g.rep = clamp(g.rep + rep, 0, 100);
  g.jobs = g.jobs.filter((x) => x !== j);
  g.doneJobs.unshift({ name: j.name, client: j.client, pay, quality, onTime, day });
  if (g.doneJobs.length > 12) g.doneJobs.pop();
  g.stats.jobsDone++;
  toast(g, `${j.name} delivered. +${fmtMoney(pay)}, Rep ${rep >= 0 ? '+' : ''}${rep}.`, onTime ? 'green' : 'yellow');
  sfx('money');
}

export function checkJobs(g) {
  for (const j of [...g.jobs]) if (j.done >= j.workload) complete(g, j);
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
