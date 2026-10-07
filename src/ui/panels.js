// Right-docked panels: Jobs, Staff (+ profile), Build, Finance.
import { C } from '../config.js';
import { DATA } from '../data.js';
import * as D from '../render/draw.js';
import { button, tag, bar, label, block, scrollArea, hover, click, ui, setTooltip } from './ui.js';
import { furnSprite, charSprites } from '../render/sprites.js';
import { acceptOffer, dropJob, maxActive, jobQuality, SOLO_RATE } from '../systems/jobs.js';
import { hire, fire } from '../systems/hiring.js';
import { freeDeskCount, expandStatus, expandFloor, WALL_COST, DOOR_COST } from '../systems/building.js';
import { fmtMoney, payroll, utilitiesPerDay, daysToPayday } from '../systems/economy.js';
import { clock, dayName } from '../sim/time.js';
import { NEED_KEYS, NEED_LABEL, NEED_ICON, firstName } from '../sim/agents.js';
import { RENT_FULL } from '../config.js';

export const PANEL_W = { jobs: 252, staff: 262, build: 160, finance: 252 };
const SKILL_KINDS = ['blue', 'green', 'yellow'];
const skillKind = (g, s) => SKILL_KINDS[DATA.indById[g.industry].skills.indexOf(s)] || 'neutral';
const tagW = (s) => D.tw(String(s).toUpperCase()) + 8;

export function moodInfo(m) {
  return m >= 65 ? ['happy', C.green, C.greenBg] : m >= 40 ? ['neutral', C.yellow, C.yellowBg] : ['sad', C.red, C.redBg];
}

function frame(app, title, sub, x, y, w, h) {
  block(x, y, w, h);
  D.card(x, y, w, h, C.surface, C.border);
  D.text(title, x + 14, y + 14, C.ink, 2);
  if (sub) D.text(D.fit(sub, w - 28), x + 14, y + 34, C.muted);
  if (button(x + w - 24, y + 10, 14, 14, '', { icon: 'cross', variant: 'ghost', tip: 'Close (Esc)' })) { app.game.panel = null; app.game.tool = null; }
  return y + 50;
}

function tabs(x, y, w, items, active) {
  let cx = x, res = null;
  for (const it of items) {
    const tw = D.tw(it.label) + 12;
    const act = it.id === active;
    if (button(cx, y, tw, 15, it.label, { variant: 'ghost', active: act })) res = it.id;
    if (act) D.rect(cx + 2, y + 15, tw - 4, 1, C.ink);
    cx += tw + 2;
  }
  D.rect(x, y + 16, w, 1, C.border);
  return res;
}

function row(x, y, w, labelText, value, color = C.ink) {
  D.text(labelText, x, y, C.inkSoft);
  D.textR(value, x + w, y, color);
}

// ---------------- Jobs ----------------
function jobsPanel(app, x, y, w, h) {
  const g = app.game;
  let cy = frame(app, 'Jobs', 'Take contracts, ship them, get paid.', x, y, w, h);
  const t = tabs(x + 12, cy, w - 24, [
    { id: 'offers', label: `Offers ${g.offers.length}` },
    { id: 'active', label: `Active ${g.jobs.length}/${maxActive(g)}` },
    { id: 'done', label: 'Done' },
  ], g.jobsTab);
  if (t) g.jobsTab = t;
  cy += 24;
  const ix = x + 12, cw = w - 24;
  const day = clock(g.time).day;

  scrollArea('jobs-' + g.jobsTab, x + 6, cy, w - 10, y + h - cy - 8, (top) => {
    let yy = top;
    if (g.jobsTab === 'offers') {
      if (!g.offers.length) return D.paragraph('No offers right now. New ones arrive every morning.', ix, yy + 4, cw, C.muted) + 8;
      const full = g.jobs.length >= maxActive(g);
      for (const o of [...g.offers]) {
        D.card(ix, yy, cw, 52, C.surface, C.border);
        D.text(D.fit(o.name, cw - 70), ix + 8, yy + 8, C.ink);
        D.textR(fmtMoney(o.pay), ix + cw - 8, yy + 8, C.ink);
        D.text(D.fit(o.client, cw - 16), ix + 8, yy + 20, C.muted);
        const tw = tag(ix + 8, yy + 34, o.skill, skillKind(g, o.skill));
        const info = `${o.workload} pts · ${o.days}d`;
        D.text(info, ix + 14 + tw, yy + 36, C.muted);
        if (hover(ix + 14 + tw, yy + 33, D.tw(info), 11)) setTooltip(`Work points. One person makes about ${SOLO_RATE} per day. Due ${o.days} working days after you accept.`);
        if (button(ix + cw - 54, yy + 32, 46, 15, 'Accept', { variant: 'primary', disabled: full, tip: full ? 'Too many active jobs. Finish one or hire more people.' : null })) acceptOffer(g, o);
        yy += 58;
      }
      D.paragraph('Offers expire after 3 days. Higher Rep brings bigger, better-paid jobs.', ix, yy + 4, cw, C.faint);
      return yy - top + 30;
    }
    if (g.jobsTab === 'active') {
      if (!g.jobs.length) return D.paragraph('Nothing in progress. Accept an offer and somebody will sit down and start working.', ix, yy + 4, cw, C.muted) + 8;
      for (const j of [...g.jobs]) {
        const chips = [];
        let lx = ix + 8 + D.tw('Team') + 6, ly = 0;
        for (const a of g.agents) {
          const nm = a.isPlayer ? 'You' : D.fit(firstName(a), 50);
          const cw2 = D.tw(nm) + 8;
          if (lx + cw2 > ix + cw - 8) { lx = ix + 8; ly += 14; }
          chips.push({ a, nm, x: lx, dy: ly, w: cw2 });
          lx += cw2 + 3;
        }
        const ch = 70 + ly;
        D.card(ix, yy, cw, ch, C.surface, C.border);
        const left = j.deadlineDay - day;
        if (j.late) tag(ix + cw - 8 - tagW('Late'), yy + 6, 'Late', 'red');
        else D.textR(left <= 0 ? 'Due today' : `Due ${dayName(j.deadlineDay)} · ${left}d`, ix + cw - 8, yy + 8, left <= 0 ? C.red : C.muted);
        D.text(D.fit(j.name, cw - 90), ix + 8, yy + 8, C.ink);
        D.text(D.fit(`${j.client} · ${fmtMoney(j.pay)}`, cw - 16), ix + 8, yy + 20, C.muted);
        bar(ix + 8, yy + 34, cw - 16, 3, j.done / j.workload, C.ink);
        const pct = Math.floor((j.done / j.workload) * 100);
        D.text(`${pct}%  ·  Quality ${jobQuality(j)}%`, ix + 8, yy + 42, C.inkSoft);
        if (hover(ix + 8, yy + 40, 120, 11)) setTooltip('Quality follows the mood of the people working on it. Happy people, better pay.');
        if (button(ix + cw - 40, yy + 40, 32, 12, 'Drop', { variant: 'ghost', tip: 'Abandon this job. Rep -3.' })) dropJob(g, j);
        D.text('Team', ix + 8, yy + 57, C.muted);
        for (const c of chips) {
          const inTeam = !j.team || j.team.includes(c.a.id);
          const cyy = yy + 55 + c.dy;
          const hv = hover(c.x, cyy, c.w, 12);
          if (hv) { ui.pointer = true; setTooltip(inTeam ? `Remove ${c.a.isPlayer ? 'yourself' : firstName(c.a)} from this job` : `Assign ${c.a.isPlayer ? 'yourself' : firstName(c.a)}`); }
          D.card(c.x, cyy, c.w, 12, inTeam ? C.ink : hv ? C.surfaceHover : C.surface, inTeam ? C.ink : C.border);
          D.text(c.nm, c.x + 4, cyy + 2, inTeam ? '#FFFFFF' : C.muted);
          if (click(c.x, cyy, c.w, 12)) {
            const ids = g.agents.map((a) => a.id);
            let team = j.team ? [...j.team] : [...ids];
            team = inTeam ? team.filter((id) => id !== c.a.id) : [...team, c.a.id];
            j.team = team.length === ids.length ? null : team;
          }
        }
        yy += ch + 6;
      }
      return yy - top;
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
    return yy - top;
  });
}

// ---------------- Staff ----------------
function profile(app, a, x, y, w, h) {
  const g = app.game;
  const ind = DATA.indById[g.industry];
  block(x, y, w, h);
  D.card(x, y, w, h, C.surface, C.border);
  if (button(x + 8, y + 9, 54, 15, '‹ Staff', { variant: 'ghost' })) g.staffView = null;
  if (button(x + w - 24, y + 10, 14, 14, '', { icon: 'cross', variant: 'ghost' })) { g.panel = null; g.staffView = null; }
  let cy = y + 32;
  D.card(x + 14, cy, 44, 44, C.bg, null);
  D.getCtx().drawImage(charSprites(a.look).down[0], x + 20, cy + 6, 32, 32);
  D.text(D.fit(a.name, w - 86), x + 68, cy + 4, C.ink);
  tag(x + 68, cy + 16, a.role, a.isPlayer ? 'yellow' : skillKind(g, a.mainSkill));
  D.text(a.isPlayer ? 'Owner · no salary' : `${fmtMoney(a.salary)} / month`, x + 68, cy + 32, C.muted);
  cy += 54;
  const [mi, mc] = moodInfo(a.mood);
  label('Mood', x + 14, cy);
  D.icon(mi, x + 50, cy - 1, mc);
  bar(x + 62, cy + 2, w - 100, 3, a.mood / 100, mc);
  D.textR(Math.round(a.mood), x + w - 14, cy, C.ink);
  cy += 14;
  D.text(D.fit(a.activity, w - 28), x + 14, cy, C.inkSoft);
  cy += 11;
  if (a.thought && a.thoughtT > 0) D.text(D.fit('"' + a.thought + '"', w - 28), x + 14, cy, C.muted);
  cy += 15;
  label('Needs', x + 14, cy); cy += 12;
  for (const k of NEED_KEYS) {
    const v = a.needs[k];
    const good = k === 'stress' ? 100 - v : v;
    const col = good >= 60 ? C.green : good >= 30 ? C.yellow : C.red;
    D.icon(NEED_ICON[k], x + 14, cy, C.muted);
    D.text(NEED_LABEL[k], x + 26, cy, C.inkSoft);
    bar(x + 80, cy + 2, w - 118, 3, v / 100, col);
    D.textR(Math.round(v), x + w - 14, cy, C.muted);
    cy += 11;
  }
  cy += 5;
  label('Skills', x + 14, cy); cy += 12;
  for (const s of ind.skills) {
    D.text(s, x + 14, cy, C.inkSoft);
    const lvl = a.skills[s] || 1;
    for (let i = 0; i < 10; i++) D.rect(x + 80 + i * 13, cy + 1, 11, 5, i < lvl ? C.ink : '#E6E3DD');
    D.textR(lvl, x + w - 14, cy, C.muted);
    cy += 11;
  }
  cy += 5;
  label('Desk', x + 14, cy);
  const desk = a.desk != null && g.furnById[a.desk];
  D.text(desk ? DATA.furnById[desk.type].name : 'No desk. Build one.', x + 50, cy, desk ? C.inkSoft : C.red);

  const by = y + h - 26;
  if (a.isPlayer) {
    if (button(x + 14, by, 52, 16, 'Work', { active: a.mode === 'work', tip: 'Sit at your desk and work on jobs yourself.' })) a.mode = 'work';
    if (button(x + 68, by, 60, 16, 'Manage', { active: a.mode === 'manage', tip: 'Stop working. Walk the floor instead: team output +15%.' })) { a.mode = 'manage'; if (a.state === 'working') a.state = 'idle'; }
    if (button(x + 136, by, 50, 16, 'Break', { disabled: !a.present, tip: 'Grab a coffee or flop onto the sofa.' })) { a.forced = 'break'; if (a.state === 'working') a.state = 'idle'; }
    if (button(x + 190, by, 58, 16, 'Go home', { disabled: !a.present, tip: 'Leave early and recharge for tomorrow.' })) a.forced = 'home';
  } else if (button(x + 14, by, 60, 16, 'Fire', { variant: 'danger', tip: 'Let them go. Immediately. With a cardboard box.' })) {
    fire(g, a);
    g.staffView = null;
  }
}

function staffPanel(app, x, y, w, h) {
  const g = app.game;
  if (g.staffView != null) {
    const a = g.agents.find((b) => b.id === g.staffView);
    if (a) return profile(app, a, x, y, w, h);
    g.staffView = null;
  }
  let cy = frame(app, 'Staff', `${g.agents.length} people · payroll ${fmtMoney(payroll(g))}/mo`, x, y, w, h);
  const t = tabs(x + 12, cy, w - 24, [
    { id: 'team', label: `Team ${g.agents.length}` },
    { id: 'applicants', label: `Applicants ${g.applicants.length}` },
  ], g.staffTab);
  if (t) g.staffTab = t;
  cy += 24;
  const ix = x + 12, cw = w - 24;
  const ind = DATA.indById[g.industry];

  scrollArea('staff-' + g.staffTab, x + 6, cy, w - 10, y + h - cy - 8, (top) => {
    let yy = top;
    if (g.staffTab === 'team') {
      for (const a of g.agents) {
        const hv = hover(ix, yy, cw, 30);
        if (hv) { ui.pointer = true; D.card(ix, yy, cw, 30, C.surface2, null); }
        D.getCtx().drawImage(charSprites(a.look).down[0], ix + 4, yy + 7);
        D.text(D.fit(a.name + (a.isPlayer ? ' (you)' : ''), cw - 90), ix + 26, yy + 6, C.ink);
        D.text(D.fit(`${a.role} · ${a.present ? a.activity : a.activity}`, cw - 34), ix + 26, yy + 18, C.muted);
        const [mi, mc] = moodInfo(a.mood);
        D.icon(mi, ix + cw - 12, yy + 5, mc);
        if (!a.isPlayer) D.textR(fmtMoney(a.salary), ix + cw - 18, yy + 6, C.inkSoft);
        D.rect(ix, yy + 30, cw, 1, C.border);
        if (click(ix, yy, cw, 30)) g.staffView = a.id;
        yy += 31;
      }
      if (g.agents.length === 1) yy += D.paragraph('Just you for now. Applicants are waiting in the next tab.', ix, yy + 8, cw, C.muted) + 8;
      return yy - top + 4;
    }
    const free = freeDeskCount(g);
    if (!g.applicants.length) yy += D.paragraph('No applicants left this week. New ones arrive every Monday.', ix, yy + 4, cw, C.muted) + 8;
    for (const ap of [...g.applicants]) {
      D.card(ix, yy, cw, 54, C.surface, C.border);
      D.getCtx().drawImage(charSprites(ap.look).down[0], ix + 8, yy + 8);
      D.text(D.fit(ap.name, cw - 100), ix + 30, yy + 8, C.ink);
      tag(ix + 30, yy + 20, ap.role, skillKind(g, ap.mainSkill));
      D.textR(`${fmtMoney(ap.salary)}/mo`, ix + cw - 8, yy + 8, C.ink);
      D.text(D.fit(ind.skills.map((s) => `${s} ${ap.skills[s]}`).join(' · '), cw - 16), ix + 8, yy + 38, C.muted);
      if (button(ix + cw - 50, yy + 20, 42, 14, 'Hire', { variant: 'primary', disabled: free === 0, tip: free === 0 ? 'Build a free desk first (Build, Work tab).' : `Salary is paid every 4 weeks.` })) hire(g, ap);
      yy += 60;
    }
    yy += D.paragraph(`Free desks: ${free}. New applicants every Monday. Higher Rep attracts better people.`, ix, yy + 2, cw, C.faint);
    return yy - top + 8;
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
  if (def.use) for (const k in def.use.restore) if (def.use.restore[k] > 1 || def.use.restore[k] < -1) out.push([NEED_LABEL[k], k === 'stress' ? 'green' : 'yellow']);
  if (def.deco) out.push([`Mood +${def.deco}`, 'green']);
  if (def.prestige) out.push(['Rep', 'yellow']);
  if (def.walkable) out.push(['Walkable', 'neutral']);
  return out;
}

function buildPanel(app, x, y, w, h) {
  const g = app.game;
  let cy = frame(app, 'Build', `Balance ${fmtMoney(g.money)}`, x, y, w, h);
  const cats = [['work', 'Work'], ['needs', 'Needs'], ['fun', 'Fun'], ['decor', 'Decor'], ['walls', 'Walls']];
  let cx = x + 12, ry = cy;
  for (const [id, lab] of cats) {
    const tw = D.tw(lab) + 10;
    if (cx + tw > x + w - 12) { cx = x + 12; ry += 17; }
    if (button(cx, ry, tw, 14, lab, { active: g.buildTab === id })) g.buildTab = id;
    cx += tw + 3;
  }
  cy = ry + 22;
  const ix = x + 10, cw = w - 20;
  const listH = y + h - cy - 74;
  const items = g.buildTab === 'walls' ? WALL_ITEMS : DATA.furniture.filter((f) => f.cat === g.buildTab);
  const isSel = (it) => g.tool && (it.kind ? g.tool.kind === it.kind : g.tool.kind === 'furn' && g.tool.id === it.id);
  let selected = null;

  scrollArea('build-' + g.buildTab, x + 6, cy, w - 10, listH, (top) => {
    let yy = top;
    for (const it of items) {
      const sel = isSel(it);
      if (sel) selected = it;
      const hv = hover(ix, yy, cw, 30);
      if (hv) ui.pointer = true;
      D.card(ix, yy, cw, 30, sel ? C.surface2 : hv ? C.surface2 : C.surface, sel ? C.ink : hv ? C.borderStrong : C.border);
      D.card(ix + 3, yy + 3, 26, 24, C.bg, null);
      if (it.kind) D.icon(it.icon, ix + 12, yy + 11, C.ink);
      else {
        const spr = furnSprite(it.id, it.w, it.h, g.color);
        const ctx = D.getCtx();
        ctx.save(); ctx.beginPath(); ctx.rect(ix + 3, yy + 3, 26, 24); ctx.clip();
        const s = it.w > 1 || it.h > 1 ? 0.5 : 1;
        ctx.drawImage(spr, Math.round(ix + 16 - (spr.width * s) / 2), Math.round(yy + 15 - (spr.height * s) / 2), spr.width * s, spr.height * s);
        ctx.restore();
      }
      D.text(D.fit(it.name, cw - 42), ix + 36, yy + 6, C.ink);
      const price = it.kind ? it.price : fmtMoney(it.price);
      D.text(price, ix + 36, yy + 18, !it.kind && g.money < it.price ? C.red : C.muted);
      if (click(ix, yy, cw, 30)) g.tool = sel ? null : it.kind ? { kind: it.kind } : { kind: 'furn', id: it.id };
      yy += 33;
    }
    return yy - top;
  });

  const dy = y + h - 68;
  D.rect(x + 12, dy, w - 24, 1, C.border);
  if (selected) {
    D.paragraph(selected.desc, x + 12, dy + 7, w - 24, C.inkSoft);
    if (!selected.kind) {
      let tx = x + 12;
      for (const [lab, kind] of effects(selected)) { const tw2 = tagW(lab); if (tx + tw2 > x + w - 12) break; tag(tx, dy + 32, lab, kind); tx += tw2 + 3; }
    }
  } else D.paragraph('Pick an item, then click the floor. Green means it fits.', x + 12, dy + 7, w - 24, C.muted);
  D.text('Right-click or Esc to stop', x + 12, y + h - 16, C.faint);
}

// ---------------- Finance ----------------
function financePanel(app, x, y, w, h) {
  const g = app.game;
  const cy0 = frame(app, 'Finance', `Payday in ${daysToPayday(g)} working days`, x, y, w, h);
  const ix = x + 14, iw = w - 28;
  scrollArea('finance', x + 6, cy0, w - 10, y + h - cy0 - 8, (top) => {
    let cy = top;
    label('Balance', ix, cy); cy += 12;
    D.text(fmtMoney(g.money), ix, cy, g.money < 0 ? C.red : C.ink, 2); cy += 24;
    label('Reputation', ix, cy); D.textR(`${Math.floor(g.rep)} / 100`, ix + iw, cy, C.ink); cy += 11;
    bar(ix, cy, iw, 3, g.rep / 100, C.ink); cy += 8;
    D.text('Bigger jobs, better applicants, more floors.', ix, cy, C.faint); cy += 18;

    label('Balance, last 20 days', ix, cy); cy += 12;
    const ch = 40;
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
    cy += ch + 16;

    label('Next payday', ix, cy); cy += 13;
    row(ix, cy, iw, 'Salaries', '-' + fmtMoney(payroll(g)).slice(0)); cy += 11;
    row(ix, cy, iw, 'Rent', '-' + fmtMoney(g.rent)); cy += 11;
    row(ix, cy, iw, 'Utilities, daily', '-' + fmtMoney(utilitiesPerDay(g)), C.muted); cy += 18;

    label('This month', ix, cy); cy += 13;
    const m = g.month;
    row(ix, cy, iw, 'Income', '+' + fmtMoney(m.income), C.green); cy += 11;
    row(ix, cy, iw, 'Furniture', '-' + fmtMoney(m.furniture)); cy += 11;
    row(ix, cy, iw, 'Walls & building', '-' + fmtMoney(m.building)); cy += 11;
    row(ix, cy, iw, 'Utilities', '-' + fmtMoney(m.utilities)); cy += 18;
    if (g.lastMonth) {
      const lm = g.lastMonth;
      const net = lm.income - lm.salaries - lm.rent - lm.utilities - lm.furniture - lm.building;
      row(ix, cy, iw, 'Last month, net', fmtMoney(net), net >= 0 ? C.green : C.red); cy += 18;
    }

    if (!g.expanded) {
      const st = expandStatus(g);
      D.card(ix, cy, iw, 74, C.surface2, C.border);
      D.text('Rent the whole floor', ix + 8, cy + 8, C.ink);
      D.paragraph(`Unlocks the rest of 1F. Rent rises to ${fmtMoney(RENT_FULL)} per month.`, ix + 8, cy + 21, iw - 16, C.muted);
      if (button(ix + 8, cy + 50, 120, 16, 'Rent for $3,000', { variant: 'primary', disabled: !st.ok, tip: st.ok ? null : st.reason })) expandFloor(g);
      cy += 82;
    } else {
      D.paragraph('All of 1F is yours. More floors open up in M7.', ix, cy, iw, C.muted); cy += 24;
    }
    return cy - top;
  });
}

export function drawPanel(app, x, y, h) {
  const g = app.game;
  const w = PANEL_W[g.panel];
  if (g.panel === 'jobs') jobsPanel(app, x, y, w, h);
  else if (g.panel === 'staff') staffPanel(app, x, y, w, h);
  else if (g.panel === 'build') buildPanel(app, x, y, w, h);
  else if (g.panel === 'finance') financePanel(app, x, y, w, h);
}
