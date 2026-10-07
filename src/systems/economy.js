// Money in, money out. Payday (salaries, rent, loan interest) every 20 working days. Loans from the bank.
import { DATA } from '../data.js';
import { clock, DAYS_PER_MONTH } from '../sim/time.js';
import { toast } from './notify.js';
import { refreshOffers, checkDeadlines } from './jobs.js';
import { refreshApplicants } from './hiring.js';
import { totalRent } from './building.js';
import { is } from './policies.js';
import { sfx } from '../audio.js';

export const freshMonth = () => ({ income: 0, salaries: 0, rent: 0, utilities: 0, furniture: 0, building: 0, interest: 0, perks: 0 });
export const LOAN_RATE = 0.03; // per month

export function fmtMoney(n) {
  const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n < 0 ? '-$' : '$') + s;
}

export function earn(g, amt) { g.money += amt; g.month.income += amt; g.stats.earned += amt; }
export function spend(g, amt, cat) { g.money -= amt; g.month[cat] = (g.month[cat] || 0) + amt; }

const staff = (g) => g.agents.filter((a) => !a.isPlayer);
export const payroll = (g) => staff(g).reduce((s, a) => s + a.salary, 0);
export const debt = (g) => g.loans.reduce((s, l) => s + l.amount, 0);

export function utilitiesPerDay(g) {
  let p = 0;
  for (const f of g.furniture) if (DATA.furnById[f.type].power) p += 3;
  const n = staff(g).length;
  return p + n * 5 + (is(g, 'snacks', 'yes') ? n * 4 : 0) + (is(g, 'ai', 'yes') ? 15 : 0);
}

export function daysToPayday(g) {
  return DAYS_PER_MONTH - clock(g.time).dayOfMonth;
}

export function loanLimit(g) {
  return Math.max(0, Math.round((10000 + g.rep * 1500) / 1000) * 1000 - debt(g));
}

export function borrow(g, amount) {
  if (amount > loanLimit(g)) return false;
  g.loans.push({ amount });
  g.money += amount;
  toast(g, `The bank lends you ${fmtMoney(amount)} at ${LOAN_RATE * 100}% per month.`, 'blue');
  return true;
}

export function repay(g, loan) {
  if (g.money < loan.amount) return false;
  g.money -= loan.amount;
  g.loans = g.loans.filter((l) => l !== loan);
  toast(g, `Loan of ${fmtMoney(loan.amount)} repaid.`, 'green');
  return true;
}

export function companyValue(g) {
  let furn = 0;
  for (const f of g.furniture) furn += DATA.furnById[f.type].price / 2;
  return Math.round(g.money - debt(g) + furn + g.rep * 3000 + staff(g).length * 4000 + g.floors.length * 10000);
}

function payday(g) {
  const sal = payroll(g);
  spend(g, sal, 'salaries');
  spend(g, totalRent(g), 'rent');
  const interest = Math.round(debt(g) * LOAN_RATE);
  if (interest) spend(g, interest, 'interest');
  if (is(g, 'party', 'bonus')) spend(g, staff(g).length * 200, 'perks');
  g.lastMonth = { ...g.month };
  g.month = freshMonth();
  toast(g, `Payday. Salaries ${fmtMoney(sal)}, rent ${fmtMoney(totalRent(g))}${interest ? `, interest ${fmtMoney(interest)}` : ''}.`, 'yellow');
  sfx('sell');
  if (g.money < 0) g.modal = g.investorUsed ? 'gameover' : 'investor';
}

export function fridayParty(g) {
  const people = staff(g).filter((a) => a.present);
  if (!people.length) return;
  spend(g, people.length * 40, 'perks');
  for (const a of people) { a.needs.fun = Math.min(100, a.needs.fun + 40); a.needs.social = Math.min(100, a.needs.social + 30); a.needs.stress = Math.max(0, a.needs.stress - 20); }
  toast(g, `Friday party. Someone brought a karaoke machine. ${fmtMoney(people.length * 40)}.`, 'green');
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
  let prestige = 0;
  for (const f of g.furniture) prestige += DATA.furnById[f.type].prestige || 0;
  if (prestige) g.rep = Math.min(100, g.rep + 0.2 * prestige);
  if (c.day > 0 && c.day % DAYS_PER_MONTH === 0) payday(g);
  g.history.push(g.money);
  if (g.history.length > 20) g.history.shift();
}
