// Money in, money out. Payday (salaries + rent) every 20 working days.
import { DATA } from '../data.js';
import { clock, DAYS_PER_MONTH } from '../sim/time.js';
import { toast } from './notify.js';
import { refreshOffers, checkDeadlines } from './jobs.js';
import { refreshApplicants } from './hiring.js';
import { sfx } from '../audio.js';

export const freshMonth = () => ({ income: 0, salaries: 0, rent: 0, utilities: 0, furniture: 0, building: 0 });

export function fmtMoney(n) {
  const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n < 0 ? '-$' : '$') + s;
}

export function earn(g, amt) { g.money += amt; g.month.income += amt; g.stats.earned += amt; }
export function spend(g, amt, cat) { g.money -= amt; g.month[cat] = (g.month[cat] || 0) + amt; }

export const payroll = (g) => g.agents.reduce((s, a) => s + (a.isPlayer ? 0 : a.salary), 0);

export function utilitiesPerDay(g) {
  let p = 0;
  for (const f of g.furniture) if (DATA.furnById[f.type].power) p += 3;
  return p + (g.agents.length - 1) * 5;
}

export function daysToPayday(g) {
  const c = clock(g.time);
  return DAYS_PER_MONTH - c.dayOfMonth;
}

function payday(g) {
  const sal = payroll(g);
  spend(g, sal, 'salaries');
  spend(g, g.rent, 'rent');
  g.lastMonth = { ...g.month };
  g.month = freshMonth();
  toast(g, `Payday. Salaries ${fmtMoney(sal)}, rent ${fmtMoney(g.rent)}.`, 'yellow');
  sfx('sell');
  if (g.money < 0) g.modal = g.investorUsed ? 'gameover' : 'investor';
}

export function onNewDay(g) {
  const c = clock(g.time);
  spend(g, utilitiesPerDay(g), 'utilities');
  checkDeadlines(g, c.day);
  refreshOffers(g, false);
  if (c.weekday === 0) {
    refreshApplicants(g);
    toast(g, 'Monday. New applicants are waiting in Staff.', 'blue');
  }
  const trophies = g.furniture.filter((f) => DATA.furnById[f.type].prestige).length;
  if (trophies) g.rep = Math.min(100, g.rep + 0.2 * trophies);
  if (c.day > 0 && c.day % DAYS_PER_MONTH === 0) payday(g);
  g.history.push(g.money);
  if (g.history.length > 20) g.history.shift();
}
