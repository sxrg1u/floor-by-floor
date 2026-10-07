// One fixed simulation step (= one game minute).
import { DATA } from '../data.js';
import { clock } from './time.js';
import { updateAgent, playSounds } from './agents.js';
import { socialHour, socialDay } from './personality.js';
import { onNewDay, fridayParty } from '../systems/economy.js';
import { checkJobs } from '../systems/jobs.js';
import { computeDeco } from '../systems/building.js';
import { careerDay } from '../systems/careers.js';
import { randomEvents } from '../systems/events.js';
import { updateMeeting } from '../systems/meetings.js';
import { checkMilestones } from '../systems/milestones.js';
import { is } from '../systems/policies.js';
import { saveGame } from '../systems/save.js';

export function tick(g) {
  const before = clock(g.time).day;
  g.time++;
  const c = clock(g.time);
  if (c.day !== before) {
    onNewDay(g);
    socialDay(g);
    careerDay(g);
    randomEvents(g);
    saveGame(g, 'auto');
  }
  if (g.time % 60 === 0) { socialHour(g); checkMilestones(g); }
  if (c.weekday === 4 && c.minute === 16 * 60 && is(g, 'party', 'party')) fridayParty(g);
  if (g.decoDirty) {
    computeDeco(g);
    const racks = g.furniture.filter((f) => DATA.furnById[f.type].server).length;
    g.serverBonus = 1 + Math.min(5, racks) * 0.03;
  }
  for (const a of g.agents) updateAgent(a, g);
  updateMeeting(g);
  checkJobs(g);
  playSounds(g);
}

// Nights and early mornings skip by fast when the office is empty.
export function nightMultiplier(g) {
  if (g.agents.some((a) => a.present)) return 1;
  const c = clock(g.time);
  return c.minute >= 17 * 60 || c.minute < 7 * 60 + 30 ? 12 : 1;
}
