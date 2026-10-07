// Window contents: Jobs, Build, Finance.
import { C, FLOORS } from '../config.js';
import { DATA } from '../data.js';
import * as D from '../render/draw.js';
import { button, tag, bar, label, scrollArea, hover, click, ui, setTooltip, highlight } from './ui.js';
import { furnSprite } from '../render/sprites.js';
import {
  acceptOffer, dropJob, maxActive, jobQuality, jobProgress, setJobTeam, assignTask, workersOn, etaDays, DAY_RATE,
} from '../systems/jobs.js';
import { teamById, teamMembers } from '../systems/teams.js';
import { WALL_COST, DOOR_COST, totalRent, rentStatus, lockReason } from '../systems/building.js';
import { isUnlocked } from '../systems/milestones.js';
import {
  fmtMoney, payroll, utilitiesPerDay, daysToPayday, loanLimit, borrow, repay, debt, companyValue, LOAN_RATE,
} from '../systems/economy.js';
import { clock, dayName } from '../sim/time.js';
import { NEED_LABEL, firstName } from '../sim/agents.js';
import { isHl } from '../systems/tutorial.js';
import { tabs, row, skillKind, tagW, chip } from './common.js';

// ---------------- Jobs ----------------
export function jobsWin(app, win, x, y, w, h) {
  const g = app.game;
  const t = tabs(x + 10, y + 6, w - 20, [
    { id: 'offers', label: `Offers ${g.offers.length}`, hl: isHl(g, 'tab-offers') },
    { id: 'active', label: `Active ${g.jobs.length}/${maxActive(g)}`, hl: isHl(g, 'tab-active') },
    { id: 'done', label: 'Done' },
  ], g.jobsTab);
  if (t) g.jobsTab = t;
  const top = y + 28;
  const ix = x + 10, cw = w - 20;
  const day = clock(g.time).day;

  scrollArea('jobs-' + g.jobsTab, x + 4, top, w - 8, y + h - top - 4, (sy) => {
    let yy = sy;
    if (g.jobsTab === 'offers') {
      if (!g.offers.length) return D.paragraph('No offers right now. New ones arrive every morning.', ix, yy + 4, cw, C.muted) + 8;
      const full = g.jobs.length >= maxActive(g);
      g.offers.slice().forEach((o, i) => {
        D.card(ix, yy, cw, 56, C.surface, C.border);
        D.text(D.fit(o.name, cw - 70), ix + 8, yy + 7, C.ink);
        D.textR(fmtMoney(o.pay), ix + cw - 8, yy + 7, C.ink);
        D.text(D.fit(`${o.client} · due in ${o.days}d`, cw - 16), ix + 8, yy + 19, C.muted);
        let tx = ix + 8;
        for (const p of o.parts) { const lab = `${p.skill} ${p.work}`; if (tx + tagW(lab) > ix + cw - 58) break; tx += tag(tx, yy + 36, lab, skillKind(g, p.skill)) + 3; }
        if (hover(ix + 8, yy + 34, tx - ix - 8, 13)) setTooltip(`Work points per skill. An average person makes about ${DAY_RATE} per day in their best skill.`);
        if (button(ix + cw - 54, yy + 34, 46, 15, 'Accept', { variant: 'primary', disabled: full, hl: i === 0 && isHl(g, 'accept'), tip: full ? `At most ${maxActive(g)} active jobs. More teams, more jobs.` : null })) acceptOffer(g, o);
        yy += 62;
      });
      return yy - sy + D.paragraph('Offers expire after 3 days. Higher Rep brings bigger jobs. Rules, Contracts changes their size.', ix, yy + 2, cw, C.faint) + 8;
    }
    if (g.jobsTab === 'active') {
      if (!g.jobs.length) return D.paragraph('Nothing in progress. Accept an offer, give it to a team, then put people on its parts.', ix, yy + 4, cw, C.muted) + 8;
      let firstNoTeam = true, firstChip = true;
      for (const j of [...g.jobs]) {
        const team = teamById(g, j.team);
        const members = team ? teamMembers(g, team) : [];
        // layout pass for height
        const partRows = j.parts.map((p) => {
          let lx = ix + 8, ly = 0;
          const chips = members.map((a) => {
            const lab = `${D.fit(firstName(a), 46)} ${a.skills[p.skill] || 1}`;
            const cw2 = D.tw(lab) + 8;
            if (lx + cw2 > ix + cw - 8) { lx = ix + 8; ly += 14; }
            const c = { a, lab, x: lx, dy: ly };
            lx += cw2 + 3;
            return c;
          });
          return { chips, h: 14 + (members.length ? ly + 14 : 12) + 4 };
        });
        const ch = 64 + partRows.reduce((s, r) => s + r.h, 0);
        D.card(ix, yy, cw, ch, C.surface, j.late ? '#E8C4C2' : C.border);
        const left = j.deadlineDay - day;
        if (j.late) tag(ix + cw - 8 - tagW('Late'), yy + 6, 'Late', 'red');
        else D.textR(left <= 0 ? 'Due today' : `Due ${dayName(j.deadlineDay)} · ${left}d`, ix + cw - 8, yy + 7, left <= 0 ? C.red : C.muted);
        D.text(D.fit(j.name, cw - 96), ix + 8, yy + 7, C.ink);
        D.text(D.fit(`${j.client} · ${fmtMoney(j.pay)}`, cw - 16), ix + 8, yy + 19, C.muted);
        bar(ix + 8, yy + 31, cw - 16, 3, jobProgress(j), C.ink);
        const eta = etaDays(g, j);
        const etaTxt = eta === Infinity ? 'nobody on it' : `ETA ${eta < 1 ? Math.max(1, Math.round(eta * 9)) + 'h' : eta.toFixed(1) + 'd'}`;
        D.text(`${Math.floor(jobProgress(j) * 100)}% · Q ${jobQuality(j)}% · ${etaTxt}`, ix + 8, yy + 38, eta > left + 1 ? C.red : C.inkSoft);
        if (button(ix + cw - 40, yy + 36, 32, 12, 'Drop', { variant: 'ghost', tip: 'Abandon this job. Rep -3.' })) dropJob(g, j);
        // team selector
        const hlTeam = !team && firstNoTeam && isHl(g, 'job-team');
        if (!team) firstNoTeam = false;
        const tl = team ? `Team: ${team.name}` : 'Team: none';
        if (button(ix + 8, yy + 48, Math.min(cw - 16, D.tw(tl) + 24), 13, tl + ' ›', { align: 'left', hl: hlTeam, tip: g.teams.length ? 'Click to cycle through your teams.' : 'Create a team in the Teams window first.' })) {
          const ids = [null, ...g.teams.map((t2) => t2.id)];
          setJobTeam(g, j, ids[(ids.indexOf(j.team) + 1) % ids.length]);
        }
        let py = yy + 64;
        j.parts.forEach((p, idx) => {
          const r = partRows[idx];
          const done = p.done >= p.work;
          tag(ix + 8, py, p.skill, done ? 'neutral' : skillKind(g, p.skill));
          D.text(done ? 'done' : `${Math.floor(p.done)}/${p.work}`, ix + 12 + tagW(p.skill), py + 2, done ? C.faint : C.inkSoft);
          bar(ix + cw - 58, py + 4, 50, 3, p.done / p.work, done ? C.faint : C.ink);
          if (!team) D.text('Pick a team first.', ix + 8, py + 14, C.faint);
          else if (!members.length) D.text(`${team.name} has no members.`, ix + 8, py + 14, C.faint);
          for (const c of r.chips) {
            const on = c.a.task && c.a.task.job === j.id && c.a.task.part === idx;
            const busy = c.a.task && !on;
            const hlChip = !done && firstChip && isHl(g, 'task-chip') && !workersOn(g, j, idx).length;
            const res = chip(c.x, py + 14 + c.dy, c.lab, { on, dim: busy || done, tip: done ? 'This part is done.' : on ? 'Take them off this part' : busy ? 'Busy elsewhere. Click to move them here.' : `Put ${firstName(c.a)} on ${p.skill}` }, ui, click);
            if (hlChip) { highlight(c.x, py + 14 + c.dy, res.w, 12); firstChip = false; }
            if (res.clicked && !done) assignTask(g, c.a, j, idx);
          }
          py += r.h;
        });
        yy += ch + 6;
      }
      return yy - sy + D.paragraph('The number on a chip is that person\'s skill for the part. Low skill means slow work and poor quality.', ix, yy, cw, C.faint) + 6;
    }
    if (!g.doneJobs.length) return D.paragraph('Delivered jobs show up here.', ix, yy + 4, cw, C.muted) + 8;
    for (const d of g.doneJobs) {
      D.text(D.fit(d.name, cw - 70), ix, yy + 4, C.ink);
      D.textR(fmtMoney(d.pay), ix + cw, yy + 4, C.ink);
      D.text(`${d.client} · Quality ${d.quality}%`, ix, yy + 16, C.muted);
      if (!d.onTime) tag(ix + cw - tagW('Late'), yy + 14, 'Late', 'red');
      D.rect(ix, yy + 30, cw, 1, C.border);
      yy += 34;
    }
    return yy - sy;
  });
}

// ---------------- Build ----------------
const WALL_ITEMS = [
  { kind: 'wall', name: 'Wall', price: `${fmtMoney(WALL_COST)} / tile`, icon: 'wall', desc: 'Click and drag to draw a straight wall.' },
  { kind: 'door', name: 'Door', price: fmtMoney(DOOR_COST), icon: 'door', desc: 'Click an inner wall to turn it into a door.' },
  { kind: 'sell', name: 'Sell / remove', price: '50% refund', icon: 'trash', desc: 'Click furniture to sell it, or an inner wall to tear it down.' },
];

function effects(def) {
  const out = [];
  if (def.desk) out.push([`Output x${def.desk.quality}`, 'blue']);
  if (def.desk && def.desk.stress < 1) out.push(['Low stress', 'green']);
  if (def.use) for (const k in def.use.restore) if (Math.abs(def.use.restore[k]) > 1) out.push([NEED_LABEL[k], k === 'stress' ? 'green' : 'yellow']);
  if (def.deco) out.push([`Mood +${def.deco}`, 'green']);
  if (def.prestige) out.push(['Rep', 'yellow']);
  if (def.meeting) out.push(['Meeting +1', 'blue']);
  if (def.server) out.push(['Output +3%', 'blue']);
  return out;
}

export function buildWin(app, win, x, y, w, h) {
  const g = app.game;
  const cats = [['work', 'Work'], ['needs', 'Needs'], ['fun', 'Fun'], ['meeting', 'Meeting'], ['decor', 'Decor'], ['walls', 'Walls']];
  let cx = x + 10, ry = y + 6;
  for (const [id, lab] of cats) {
    const tw = D.tw(lab) + 10;
    if (cx + tw > x + w - 10) { cx = x + 10; ry += 17; }
    if (button(cx, ry, tw, 14, lab, { active: g.buildTab === id, hl: isHl(g, 'tab-' + id) })) g.buildTab = id;
    cx += tw + 3;
  }
  const cy = ry + 20;
  D.text(`Building on ${FLOORS[g.view].label}`, x + 10, cy, C.muted);
  const top = cy + 12;
  const ix = x + 8, cw = w - 16;
  const descH = h > 250 ? 70 : 36;
  const items = g.buildTab === 'walls' ? WALL_ITEMS : DATA.furniture.filter((f) => f.cat === g.buildTab);
  const isSel = (it) => g.tool && (it.kind ? g.tool.kind === it.kind : g.tool.kind === 'furn' && g.tool.id === it.id);
  let selected = null;

  scrollArea('build-' + g.buildTab, x + 4, top, w - 8, y + h - top - descH, (sy) => {
    let yy = sy;
    for (const it of items) {
      const sel = isSel(it);
      if (sel) selected = it;
      const locked = !it.kind && !isUnlocked(g, it);
      const hv = hover(ix, yy, cw, 30);
      if (hv) { ui.pointer = true; if (locked) setTooltip(lockReason(it)); }
      D.card(ix, yy, cw, 30, sel || hv ? C.surface2 : C.surface, sel ? C.ink : hv ? C.borderStrong : C.border);
      D.card(ix + 3, yy + 3, 26, 24, C.bg, null);
      if (it.kind) D.icon(it.icon, ix + 12, yy + 11, C.ink);
      else {
        const spr = furnSprite(it.id, it.w, it.h, g.color);
        const ctx = D.getCtx();
        ctx.save(); ctx.beginPath(); ctx.rect(ix + 3, yy + 3, 26, 24); ctx.clip();
        if (locked) ctx.globalAlpha = 0.35;
        const s = it.w > 1 || it.h > 1 ? 0.5 : 1;
        ctx.drawImage(spr, Math.round(ix + 16 - (spr.width * s) / 2), Math.round(yy + 15 - (spr.height * s) / 2), spr.width * s, spr.height * s);
        ctx.restore();
        if (locked) D.icon('lock', ix + 12, yy + 11, C.ink);
      }
      D.text(D.fit(it.name, cw - 42), ix + 36, yy + 6, locked ? C.faint : C.ink);
      D.text(locked ? 'Locked' : it.kind ? it.price : fmtMoney(it.price), ix + 36, yy + 18, !it.kind && !locked && g.money < it.price ? C.red : C.muted);
      if (!it.kind && isHl(g, 'item-' + it.id)) highlight(ix, yy, cw, 30);
      if (click(ix, yy, cw, 30) && !locked) g.tool = sel ? null : it.kind ? { kind: it.kind } : { kind: 'furn', id: it.id };
      yy += 33;
    }
    return yy - sy;
  });

  const dy = y + h - descH + 2;
  D.rect(x + 10, dy, w - 20, 1, C.border);
  if (selected) {
    const ph = descH > 50 ? D.paragraph(selected.desc, x + 10, dy + 6, w - 20, C.inkSoft, 10) : 0;
    if (!selected.kind) {
      let tx = x + 10;
      const ty = descH > 50 ? Math.min(dy + 8 + ph, y + h - 14) : dy + 7;
      for (const [lab, kind] of effects(selected)) { const tw2 = tagW(lab); if (tx + tw2 > x + w - 10) break; tag(tx, ty, lab, kind); tx += tw2 + 3; }
    }
  } else D.paragraph('Pick an item, then click the floor. Right-click or Esc stops building.', x + 10, dy + 6, w - 20, C.muted);
}

// ---------------- Finance ----------------
export function financeWin(app, win, x, y, w, h) {
  const g = app.game;
  const ix = x + 12, iw = w - 24;
  scrollArea('finance', x + 4, y + 4, w - 8, h - 8, (top) => {
    let cy = top + 4;
    label('Balance', ix, cy); D.textR(`Payday in ${daysToPayday(g)}d`, ix + iw, cy, C.muted); cy += 12;
    D.text(fmtMoney(g.money), ix, cy, g.money < 0 ? C.red : C.ink, 2); cy += 22;
    row(ix, cy, iw, 'Company value', fmtMoney(companyValue(g)), C.ink); cy += 11;
    row(ix, cy, iw, 'Reputation', `${Math.floor(g.rep)} / 100`); cy += 11;
    bar(ix, cy, iw, 3, g.rep / 100, C.ink); cy += 12;

    label('Balance, last 20 days', ix, cy); cy += 12;
    const ch = 36;
    const hist = g.history;
    const max = Math.max(1, ...hist.map((v) => Math.abs(v)));
    const bw = Math.floor(iw / 20);
    hist.forEach((v, i) => {
      const bh = Math.max(1, Math.round((Math.abs(v) / max) * ch));
      const bx = ix + i * bw;
      if (v >= 0) D.rect(bx, cy + ch - bh, bw - 2, bh, i === hist.length - 1 ? C.ink : C.borderStrong);
      else D.rect(bx, cy + ch + 1, bw - 2, Math.min(8, bh), C.red);
    });
    D.rect(ix, cy + ch, iw, 1, C.border);
    cy += ch + 14;

    label('Next payday', ix, cy); cy += 13;
    row(ix, cy, iw, 'Salaries', '-' + fmtMoney(payroll(g))); cy += 11;
    row(ix, cy, iw, `Rent (${g.floors.length} floor${g.floors.length > 1 ? 's' : ''})`, '-' + fmtMoney(totalRent(g))); cy += 11;
    if (debt(g)) { row(ix, cy, iw, 'Loan interest', '-' + fmtMoney(Math.round(debt(g) * LOAN_RATE))); cy += 11; }
    row(ix, cy, iw, 'Running costs, daily', '-' + fmtMoney(utilitiesPerDay(g)), C.muted); cy += 16;

    label('This month', ix, cy); cy += 13;
    const m = g.month;
    row(ix, cy, iw, 'Income', '+' + fmtMoney(m.income), C.green); cy += 11;
    row(ix, cy, iw, 'Furniture', '-' + fmtMoney(m.furniture)); cy += 11;
    row(ix, cy, iw, 'Building & events', '-' + fmtMoney(m.building)); cy += 11;
    row(ix, cy, iw, 'Running costs', '-' + fmtMoney(m.utilities)); cy += 11;
    if (m.perks) { row(ix, cy, iw, 'Parties & bonuses', '-' + fmtMoney(m.perks)); cy += 11; }
    if (g.lastMonth) {
      const lm = g.lastMonth;
      const net = lm.income - lm.salaries - lm.rent - lm.utilities - lm.furniture - lm.building - (lm.interest || 0) - (lm.perks || 0);
      cy += 4; row(ix, cy, iw, 'Last month, net', fmtMoney(net), net >= 0 ? C.green : C.red); cy += 11;
    }
    cy += 8;

    label('Bank', ix, cy); D.textR(`${LOAN_RATE * 100}% interest / month`, ix + iw, cy, C.muted); cy += 13;
    const lim = loanLimit(g);
    let bx = ix;
    for (const amt of [5000, 10000, 25000]) {
      const lab = `+${fmtMoney(amt)}`;
      const bw2 = D.tw(lab) + 14;
      if (button(bx, cy, bw2, 15, lab, { disabled: amt > lim, tip: amt > lim ? `The bank only lends you ${fmtMoney(lim)} more. Rep raises the limit.` : `Borrow ${fmtMoney(amt)}` })) borrow(g, amt);
      bx += bw2 + 4;
    }
    cy += 20;
    for (const l of g.loans.slice()) {
      row(ix, cy + 2, iw - 56, 'Loan', fmtMoney(l.amount));
      if (button(ix + iw - 50, cy, 50, 14, 'Repay', { disabled: g.money < l.amount })) repay(g, l);
      cy += 17;
    }
    cy += 6;
    label('Floors', ix, cy); cy += 13;
    const st = rentStatus(g);
    D.text(`${g.floors.length} of ${FLOORS.length} floors rented.`, ix, cy, C.inkSoft); cy += 13;
    if (st.def) {
      D.paragraph(st.ok ? `${st.def.label} is available: ${fmtMoney(st.def.rent)} per month, ${fmtMoney(st.deposit)} deposit. Use + in the floor bar.` : st.reason, ix, cy, iw, st.ok ? C.green : C.muted);
      cy += 24;
    }
    return cy - top;
  });
}
