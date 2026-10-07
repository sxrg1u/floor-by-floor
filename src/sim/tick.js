// One fixed simulation step (= one game minute).
import { clock } from './time.js';
import { updateAgent, playSounds } from './agents.js';
import { onNewDay } from '../systems/economy.js';
import { checkJobs } from '../systems/jobs.js';
import { computeDeco } from '../systems/building.js';

export function tick(g) {
  const before = clock(g.time).day;
  g.time++;
  if (clock(g.time).day !== before) onNewDay(g);
  if (g.decoDirty) computeDeco(g);
  const p = g.agents.find((a) => a.isPlayer);
  g.manageBonus = p && p.present && p.mode === 'manage' ? 1.15 : 1;
  for (const a of g.agents) updateAgent(a, g);
  checkJobs(g);
  playSounds(g);
}

// Nights and early mornings skip by fast when the office is empty.
export function nightMultiplier(g) {
  const c = clock(g.time);
  const anyone = g.agents.some((a) => a.present);
  if (anyone) return 1;
  return c.minute >= 18 * 60 || c.minute < 8 * 60 + 15 ? 12 : 1;
}
