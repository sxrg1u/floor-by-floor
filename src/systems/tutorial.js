// Guided first steps. Each step has a goal check and the UI element(s) to highlight right now.
import { DATA } from '../data.js';
import { toast } from './notify.js';
import { sfx } from '../audio.js';

export const REWARD = 200;
const has = (g, t) => g.furniture.some((f) => f.type === t);
const deskCount = (g) => g.furniture.filter((f) => DATA.furnById[f.type].desk).length;
const open = (g, kind) => (g.windows || []).some((w) => w.kind === kind);

function buildPath(g, tab, item) {
  if (!open(g, 'build')) return ['nav-build'];
  if (g.buildTab !== tab) return ['tab-' + tab];
  if (g.tool && g.tool.id === item) return ['map'];
  return ['item-' + item];
}
function jobsPath(g, tab, target) {
  if (!open(g, 'jobs')) return ['nav-jobs'];
  if (g.jobsTab !== tab) return ['tab-' + tab];
  return [target];
}

export const STEPS = [
  {
    title: 'Build two desks',
    text: 'Your floor is empty. Open Build, pick Work and place two desks. Every employee needs one. You never work yourself.',
    done: (g) => deskCount(g) >= 2,
    targets: (g) => buildPath(g, 'work', 'desk_basic'),
  },
  {
    title: 'Hire your first employee',
    text: 'Open Staff, go to Applicants and make an offer. Offer less than they ask and they may say no.',
    done: (g) => g.stats.hires >= 1,
    targets: (g) => (!open(g, 'staff') ? ['nav-staff'] : g.staffTab !== 'applicants' ? ['tab-applicants'] : ['offer']),
  },
  {
    title: 'Create a team',
    text: 'Nobody works without a team. Open Teams and click New team.',
    done: (g) => g.teams.length >= 1,
    targets: (g) => (!open(g, 'teams') ? ['nav-teams'] : ['new-team']),
  },
  {
    title: 'Put your employee in the team',
    text: 'In the Teams window, click a name under "Not in a team" to add them to the selected team.',
    done: (g) => g.teams.some((t) => t.members.length),
    targets: (g) => (!open(g, 'teams') ? ['nav-teams'] : ['add-member']),
  },
  {
    title: 'Accept a job',
    text: 'Open Jobs and accept an offer. Check which skills it needs and who in your team has them.',
    done: (g) => g.jobs.length > 0 || g.doneJobs.length > 0,
    targets: (g) => jobsPath(g, 'offers', 'accept'),
  },
  {
    title: 'Give the job to your team',
    text: 'In Jobs, Active, click the Team button on the job until your team shows up.',
    done: (g) => g.jobs.some((j) => j.team != null) || g.doneJobs.length > 0,
    targets: (g) => jobsPath(g, 'active', 'job-team'),
  },
  {
    title: 'Put someone on a task',
    text: 'Each job has parts per skill. Click a name chip under a part to put that person on it. The number is their skill.',
    done: (g) => g.agents.some((a) => a.task) || g.doneJobs.length > 0,
    targets: (g) => jobsPath(g, 'active', 'task-chip'),
  },
  {
    title: 'Coffee machine and toilet',
    text: 'Build, Needs. Without them people leave for the cafe downstairs and nothing gets done.',
    done: (g) => has(g, 'coffee') && has(g, 'toilet'),
    targets: (g) => buildPath(g, 'needs', has(g, 'coffee') ? 'toilet' : 'coffee'),
  },
  {
    title: 'Deliver your first job',
    text: 'Speed up with 2x or 4x. When a part is done, give people a new task. Tired or stressed people: open their profile and send them on a break.',
    done: (g) => g.doneJobs.length > 0,
    targets: () => ['speed'],
  },
];

export function startTutorial(g, on) {
  g.tut = { on, step: 0 };
}

export function updateTutorial(g) {
  const t = g.tut;
  if (!t || !t.on) return;
  while (t.step < STEPS.length && STEPS[t.step].done(g)) {
    g.money += REWARD;
    toast(g, `Done: ${STEPS[t.step].title}. +$${REWARD}`, 'green');
    sfx('money');
    t.step++;
  }
  if (t.step >= STEPS.length) {
    t.on = false;
    toast(g, 'Tutorial complete. Next: hire more people, hold meetings, rent more floors.', 'green');
  }
}

export function tutTargets(g) {
  const t = g.tut;
  if (!t || !t.on || g.modal) return [];
  const s = STEPS[t.step];
  return s ? s.targets(g) : [];
}

export const isHl = (g, id) => tutTargets(g).includes(id);
