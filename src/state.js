// Creates the game state for a new company: one empty, fully rented floor and no staff.
import { DATA } from './data.js';
import { START_MONEY } from './config.js';
import { makeAgent } from './sim/agents.js';
import { makeFloorTiles, computeDeco } from './systems/building.js';
import { refreshOffers } from './systems/jobs.js';
import { refreshApplicants } from './systems/hiring.js';
import { freshMonth } from './systems/economy.js';
import { startTutorial } from './systems/tutorial.js';
import { DEFAULT_POLICIES } from './systems/policies.js';

export const SAVE_VERSION = 2;

export function newGame(setup) {
  const ind = DATA.indById[setup.industry];
  const g = {
    version: SAVE_VERSION,
    industry: setup.industry, company: setup.company, color: setup.color,
    time: 8 * 60 + 30, speed: 1, paused: false,
    money: START_MONEY, rep: 5,
    floors: [{ tiles: makeFloorTiles() }], view: 0,
    furniture: [], furnById: {}, agents: [], nextId: 1,
    teams: [], offers: [], jobs: [], doneJobs: [], applicants: [],
    rel: {}, cliques: [], events: [], event: null, dramaUntil: 0,
    policies: { ...DEFAULT_POLICIES }, meeting: null, meetingLog: [],
    loans: [], promises: [], milestones: {}, milestoneFlags: {},
    month: freshMonth(), lastMonth: null, history: [START_MONEY],
    stats: { jobsDone: 0, earned: 0, hires: 0, resignations: 0, lastResignDay: 0 },
    hints: {}, tut: null,
    jobsTab: 'offers', staffTab: 'team', buildTab: 'work', selectedTeam: null,
    // transient (not saved)
    toasts: [], windows: [], tool: null, selected: null, modal: null, investorUsed: false,
    decoDirty: true, manageBonus: 1, ding: false, cam: null, tmp: null,
  };
  const skills = Object.fromEntries(ind.skills.map((s) => [s, 3]));
  g.agents.push(makeAgent(g, { name: setup.name, isPlayer: true, look: setup.look, role: 'Founder & CEO', skills, salary: 0 }));
  computeDeco(g);
  refreshOffers(g, true);
  refreshApplicants(g);
  startTutorial(g, false);
  g.modal = 'welcome';
  return g;
}
