// Guided first steps. Each step has a goal check and the UI element(s) to highlight right now.
import { DATA } from '../data.js';
import { toast } from './notify.js';
import { sfx } from '../audio.js';

export const REWARD = 100;
const has = (g, t) => g.furniture.some((f) => f.type === t);
const deskCount = (g) => g.furniture.filter((f) => DATA.furnById[f.type].desk).length;

function buildPath(g, tab, item) {
  if (g.panel !== 'build') return ['nav-build'];
  if (g.buildTab !== tab) return ['tab-' + tab];
  if (g.tool && g.tool.id === item) return ['map'];
  return ['item-' + item];
}

export const STEPS = [
  {
    title: 'Open the Jobs board',
    text: 'Clients post work here. Click Jobs at the bottom, or press J.',
    done: (g) => g.panel === 'jobs' || g.jobs.length > 0 || g.doneJobs.length > 0,
    targets: () => ['nav-jobs'],
  },
  {
    title: 'Accept a job',
    text: 'Pick any offer and click Accept. Smaller jobs (fewer pts) finish faster.',
    done: (g) => g.jobs.length > 0 || g.doneJobs.length > 0,
    targets: (g) => (g.panel !== 'jobs' ? ['nav-jobs'] : g.jobsTab !== 'offers' ? ['tab-offers'] : ['accept']),
  },
  {
    title: 'Deliver your first job',
    text: 'You walk to your desk and work by yourself. Speed up time with 2x or 4x at the top right.',
    done: (g) => g.doneJobs.length > 0,
    targets: () => ['speed'],
  },
  {
    title: 'Buy a Coffee Machine',
    text: 'Open Build, choose Needs, pick the Coffee Machine and click a free floor tile. Tired people work slowly.',
    done: (g) => has(g, 'coffee'),
    targets: (g) => buildPath(g, 'needs', 'coffee'),
  },
  {
    title: 'Build a Toilet',
    text: 'Same place: Build, Needs. Without one, everybody runs to the cafe downstairs.',
    done: (g) => has(g, 'toilet'),
    targets: (g) => buildPath(g, 'needs', 'toilet'),
  },
  {
    title: 'Add a second desk',
    text: 'Build, Work, then place a Desk. Every new person needs a desk of their own.',
    done: (g) => deskCount(g) >= 2,
    targets: (g) => buildPath(g, 'work', 'desk_basic'),
  },
  {
    title: 'Hire your first employee',
    text: 'Open Staff, switch to Applicants and click Hire. Traits marked ??? reveal themselves after a few days.',
    done: (g) => g.agents.length >= 2,
    targets: (g) => (g.panel !== 'staff' ? ['nav-staff'] : g.staffView != null ? ['back'] : g.staffTab !== 'applicants' ? ['tab-applicants'] : ['hire']),
  },
  {
    title: 'Deliver 3 jobs in total',
    text: 'Keep accepting jobs. Click people to see what they think. Happy people do better work.',
    done: (g) => g.stats.jobsDone >= 3,
    targets: () => [],
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
    toast(g, 'Tutorial complete. Grow the company, keep people happy, survive the drama.', 'green');
  }
}

export function tutTargets(g) {
  const t = g.tut;
  if (!t || !t.on || g.modal) return [];
  const s = STEPS[t.step];
  return s ? s.targets(g) : [];
}

export const isHl = (g, id) => tutTargets(g).includes(id);
