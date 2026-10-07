// Milestones (endless mode goals). They unlock furniture, floors and the IPO.
import { clock } from '../sim/time.js';
import { toast } from './notify.js';
import { sfx } from '../audio.js';
import { pushEvent } from './events.js';
import { companyValue } from './economy.js';

const staff = (g) => g.agents.filter((a) => !a.isPlayer).length;

export const MILESTONES = [
  { id: 'first_hire', name: 'First Hire', desc: 'Hire your first employee.', check: (g) => g.stats.hires >= 1 },
  { id: 'first_10k', name: 'First $10k', desc: 'Earn $10,000 from jobs.', unlocks: 'Arcade Cabinet, Aquarium', check: (g) => g.stats.earned >= 10000 },
  { id: 'five_staff', name: '5 Employees', desc: 'Have five people on the payroll.', unlocks: 'Dual-Screen Rig, Trophy Case', check: (g) => staff(g) >= 5 },
  { id: 'second_floor', name: 'Second Floor', desc: 'Rent a second floor.', unlocks: 'Server Rack, Treadmill', check: (g) => g.floors.length >= 2 },
  { id: 'union', name: 'Survive a Union Vote', desc: 'Deal with a union, one way or another.', unlocks: 'Ball Pit', check: (g) => !!g.milestoneFlags.union },
  { id: 'zero_resign', name: 'Zero Resignations for a Year', desc: '240 working days in a row without anyone quitting, with at least 3 staff.', check: (g) => staff(g) >= 3 && clock(g.time).day - (g.stats.lastResignDay ?? 0) >= 240 },
  { id: 'fifty_staff', name: '50 Employees', desc: 'Fifty people. Fifty opinions about the thermostat.', unlocks: 'Office Slide', check: (g) => staff(g) >= 50 },
  { id: 'whole_building', name: 'Own the Whole Building', desc: 'Rent floors 1F to 6F.', unlocks: 'The penthouse', check: (g) => g.floors.length >= 6 },
  { id: 'penthouse', name: 'Penthouse', desc: 'Move into the penthouse.', unlocks: 'CEO Desk', check: (g) => g.floors.length >= 7 },
  { id: 'ipo', name: 'IPO', desc: 'Company value of $1,000,000 and Rep 90, then ring the bell.', check: (g) => !!g.milestoneFlags.ipo },
];

export const unlockName = (id) => (MILESTONES.find((m) => m.id === id) || { name: id }).name;
export const isUnlocked = (g, def) => !def.unlock || g.milestones[def.unlock] != null;

export function checkMilestones(g) {
  const day = clock(g.time).day;
  for (const m of MILESTONES) {
    if (g.milestones[m.id] != null || !m.check(g)) continue;
    g.milestones[m.id] = day;
    g.rep = Math.min(100, g.rep + 2);
    toast(g, `Milestone: ${m.name}.${m.unlocks ? ' Unlocked: ' + m.unlocks + '.' : ''} Rep +2`, 'green');
    sfx('hire');
  }
  if (!g.milestoneFlags.ipoOffered && g.rep >= 90 && companyValue(g) >= 1000000) {
    g.milestoneFlags.ipoOffered = true;
    pushEvent(g, 'ipo');
  }
}
