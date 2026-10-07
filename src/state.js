// Creates the game state for a new company.
import { DATA } from './data.js';
import { MAP_W, MAP_H, START_MONEY, RENT_SMALL } from './config.js';
import { makeAgent } from './sim/agents.js';
import { addFurniture, rebuildOcc, assignDesks, computeDeco } from './systems/building.js';
import { refreshOffers } from './systems/jobs.js';
import { refreshApplicants } from './systems/hiring.js';
import { freshMonth } from './systems/economy.js';
import { startTutorial } from './systems/tutorial.js';

function buildTiles() {
  // W wall, . floor, D door, L locked (not rented yet), E elevator
  const t = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) {
      let c = 'L';
      if (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) c = 'W';
      else if (x <= 11 && y <= 9) c = '.';
      if ((x === 12 && y <= 10) || (y === 10 && x <= 12)) c = 'W';
      row.push(c);
    }
    t.push(row);
  }
  t[8][0] = 'E';
  t[9][0] = 'E';
  return t;
}

export function newGame(setup) {
  const ind = DATA.indById[setup.industry];
  const g = {
    industry: setup.industry, company: setup.company, color: setup.color,
    time: 8 * 60 + 30, speed: 1, paused: false,
    money: START_MONEY, rep: 5, rent: RENT_SMALL, expanded: false,
    tiles: buildTiles(), occ: null, seatOcc: null,
    furniture: [], furnById: {}, agents: [], nextId: 1,
    offers: [], jobs: [], doneJobs: [], applicants: [],
    month: freshMonth(), lastMonth: null, history: [START_MONEY],
    toasts: [], hints: {}, stats: { jobsDone: 0, earned: 0 },
    panel: null, tool: null, selected: null, modal: null, investorUsed: false,
    staticDirty: true, decoDirty: true, manageBonus: 1, ding: false,
    jobsTab: 'offers', staffTab: 'team', staffView: null, buildTab: 'work',
    rel: {}, cliques: [], events: [], event: null, dramaUntil: 0, tut: null, cam: null,
  };
  const skills = Object.fromEntries(ind.skills.map((s) => [s, 3]));
  const player = makeAgent(g, { name: setup.name, isPlayer: true, look: setup.look, role: 'Founder', skills, salary: 0, arriveAt: 8 * 60 + 40 });
  g.agents.push(player);
  addFurniture(g, 'desk_basic', 5, 3);
  addFurniture(g, 'plant', 1, 1);
  rebuildOcc(g);
  assignDesks(g);
  computeDeco(g);
  refreshOffers(g, true);
  refreshApplicants(g);
  startTutorial(g, false);
  g.modal = 'welcome';
  return g;
}
