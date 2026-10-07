// Right-docked panels: Jobs, Staff (team, applicants, relationship web, profile), Build, Finance.
import { C, KIND, RENT_FULL } from '../config.js';
import { DATA } from '../data.js';
import * as D from '../render/draw.js';
import { button, tag, bar, label, block, scrollArea, hover, click, ui, setTooltip, highlight } from './ui.js';
import { furnSprite, charSprites } from '../render/sprites.js';
import { acceptOffer, dropJob, maxActive, jobQuality, SOLO_RATE } from '../systems/jobs.js';
import { hire, fire } from '../systems/hiring.js';
import { freeDeskCount, expandStatus, expandFloor, WALL_COST, DOOR_COST } from '../systems/building.js';
import { fmtMoney, payroll, utilitiesPerDay, daysToPayday } from '../systems/economy.js';
import { clock, dayName } from '../sim/time.js';
import { NEED_KEYS, NEED_LABEL, NEED_ICON, firstName } from '../sim/agents.js';
import { rel, relLabel, relationsOf, boss, FRIEND, RIVAL } from '../sim/personality.js';
import { isHl } from '../systems/tutorial.js';

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
    if (button(cx, y, tw, 15, it.label, { variant: 'ghost', active: act, hl: it.hl })) res = it.id;
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

// Bar centered at zero for values -100..100.
function divBar(x, y, w, v) {
  D.rect(x, y, w, 3, '#ECEAE5');
  const half = Math.floor(w / 2);
  const len = Math.round((Math.abs(v) / 100) * half);
  if (v >= 0) D.rect(x + half, y, len, 3, C.green); else D.rect(x + half - len, y, len, 3, C.red);
  D.rect(x + half, y - 1, 1, 5, C.borderStrong);
}

function traitTags(x, y, maxW, traits, known) {
  let tx = x, ty = y;
  traits.forEach((id, i) => {
    const t = DATA.traitById[id];
    const isKnown = known[i];
    const lab = isKnown ? t.name : '???';
    const w = tagW(lab);
    if (tx + w > x + maxW) { tx = x; ty += 14; }
    tag(tx, ty, lab, isKnown ? 'blue' : 'neutral');
    if (hover(tx, ty, w, 11)) setTooltip(isKnown ? `${t.name}: ${t.desc}` : 'Unknown trait. It shows itself after a few days on the job.');
    tx += w + 3;
  });
  return ty - y + 14;
}

// ---------------- Jobs ----------------
function jobsPanel(app, x, y, w, h) {
  const g = app.game;
  let cy = frame(app, 'Jobs', 'Take contracts, ship them, get paid.', x, y, w, h);
  const t = tabs(x + 12, cy, w - 24, [
    { id: 'offers', label: `Offers ${g.offers.length}`, hl: isHl(g, 'tab-offers') },
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
      g.offers.slice().forEach((o, i) => {
        D.card(ix, yy, cw, 52, C.surface, C.border);
        D.text(D.fit(o.name, cw - 70), ix + 8, yy + 8, C.ink);
        D.textR(fmtMoney(o.pay), ix + cw - 8, yy + 8, C.ink);
        D.text(D.fit(o.client, cw - 16), ix + 8, yy + 20, C.muted);
        const tw = tag(ix + 8, yy + 34, o.skill, skillKind(g, o.skill));
        const info = `${o.workload} pts · ${o.days}d`;
        D.text(info, ix + 14 + tw, yy + 36, C.muted);
        if (hover(ix + 14 + tw, yy + 33, D.tw(info), 11)) setTooltip(`Work points. One person makes roughly ${SOLO_RATE} per day. Due ${o.days} working days after you accept.`);
        if (button(ix + cw - 54, yy + 32, 46, 15, 'Accept', { variant: 'primary', disabled: full, hl: i === 0 && isHl(g, 'accept'), tip: full ? 'Too many active jobs. Finish one or hire more people.' : null })) acceptOffer(g, o);
        yy += 58;
      });
      return yy - top + D.paragraph('Offers expire after 3 days. Higher Rep brings bigger, better-paid jobs.', ix, yy + 4, cw, C.faint) + 8;
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
        D.text(`${Math.floor((j.done / j.workload) * 100)}%  ·  Quality ${jobQuality(j)}%`, ix + 8, yy + 42, C.inkSoft);
        if (hover(ix + 8, yy + 40, 120, 11)) setTooltip('Quality follows the mood of the people working on it. Happy people, better pay.');
        if (button(ix + cw - 40, yy + 40, 32, 12, 'Drop', { variant: 'ghost', tip: 'Abandon this job. Rep -3.' })) dropJob(g, j);
        D.text('Team', ix + 8, yy + 57, C.muted);
        for (const c of chips) {
          const inTeam = !j.team || j.team.includes(c.a.id);
          const cyy = yy + 55 + c.dy;
          const hv = hover(c.x, cyy, c.w, 12);
          if (hv) { ui.pointer = true; setTooltip(inTeam ? `Take ${c.a.isPlayer ? 'yourself' : firstName(c.a)} off this job` : `Put ${c.a.isPlayer ? 'yourself' : firstName(c.a)} on this job`); }
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
      return yy - top + D.paragraph('Friends on the same job work faster. Rivals slow each other down, or worse.', ix, yy + 2, cw, C.faint) + 6;
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

// ---------------- Staff: profile ----------------
function profile(app, a, x, y, w, h) {
  const g = app.game;
  const ind = DATA.indById[g.industry];
  block(x, y, w, h);
  D.card(x, y, w, h, C.surface, C.border);
  if (button(x + 8, y + 9, 54, 15, '‹ Staff', { variant: 'ghost', hl: isHl(g, 'back') })) g.staffView = null;
  if (button(x + w - 24, y + 10, 14, 14, '', { icon: 'cross', variant: 'ghost' })) { g.panel = null; g.staffView = null; }
  const ix = x + 14, iw = w - 28;
  scrollArea('profile', x + 6, y + 30, w - 10, h - 64, (top) => {
    let cy = top;
    D.card(ix, cy, 44, 44, C.bg, null);
    D.getCtx().drawImage(charSprites(a.look).down[0], ix + 6, cy + 6, 32, 32);
    D.text(D.fit(a.name, iw - 54), ix + 54, cy + 4, C.ink);
    tag(ix + 54, cy + 16, a.role, a.isPlayer ? 'yellow' : skillKind(g, a.mainSkill));
    D.text(a.isPlayer ? 'Owner · no salary' : `${fmtMoney(a.salary)} / month`, ix + 54, cy + 32, C.muted);
    cy += 52;
    if (a.traits.length) { label('Traits', ix, cy); cy += 12; cy += traitTags(ix, cy, iw, a.traits, a.known) + 4; }
    const [mi, mc] = moodInfo(a.mood);
    label('Mood', ix, cy);
    D.icon(mi, ix + 36, cy - 1, mc);
    bar(ix + 48, cy + 2, iw - 70, 3, a.mood / 100, mc);
    D.textR(Math.round(a.mood), ix + iw, cy, C.ink);
    if (hover(ix, cy - 2, iw, 11)) setTooltip(`Needs, desk decoration and the people around them. Social: ${a.socialMood >= 0 ? '+' : ''}${Math.round(a.socialMood || 0)}`);
    cy += 14;
    D.text(D.fit(a.activity, iw), ix, cy, C.inkSoft); cy += 11;
    if (a.thought && a.thoughtT > 0) { D.text(D.fit('"' + a.thought + '"', iw), ix, cy, C.muted); cy += 11; }
    cy += 6;
    label('Needs', ix, cy); cy += 12;
    for (const k of NEED_KEYS) {
      const v = a.needs[k];
      const good = k === 'stress' ? 100 - v : v;
      const col = good >= 60 ? C.green : good >= 30 ? C.yellow : C.red;
      D.icon(NEED_ICON[k], ix, cy, C.muted);
      D.text(NEED_LABEL[k], ix + 12, cy, C.inkSoft);
      bar(ix + 66, cy + 2, iw - 90, 3, v / 100, col);
      D.textR(Math.round(v), ix + iw, cy, C.muted);
      cy += 11;
    }
    cy += 6;
    label('Skills', ix, cy); cy += 12;
    for (const s of ind.skills) {
      D.text(s, ix, cy, C.inkSoft);
      const lvl = a.skills[s] || 1;
      const pw = Math.floor((iw - 90) / 10);
      for (let i = 0; i < 10; i++) D.rect(ix + 66 + i * pw, cy + 1, pw - 2, 5, i < lvl ? C.ink : '#E6E3DD');
      D.textR(lvl, ix + iw, cy, C.muted);
      cy += 11;
    }
    if (!a.isPlayer) {
      cy += 6;
      const bo = boss(g);
      const br = bo ? rel(g, a, bo) : 0;
      label('Thinks of you', ix, cy);
      divBar(ix + 80, cy + 2, iw - 104, br);
      D.textR(Math.round(br), ix + iw, cy, C.muted);
      cy += 16;
      label('Relationships', ix, cy); cy += 12;
      const rs = relationsOf(g, a).slice(0, 5);
      if (!rs.length) { D.text('Nobody else to have feelings about.', ix, cy, C.faint); cy += 11; }
      for (const r of rs) {
        D.text(D.fit(firstName(r.b), 56), ix, cy, C.inkSoft);
        const tw2 = tag(ix + 60, cy - 2, r.label[0], r.label[1]);
        divBar(ix + 66 + tw2, cy + 2, iw - 90 - tw2, r.r);
        D.textR(Math.round(r.r), ix + iw, cy, C.muted);
        if (hover(ix, cy - 2, iw, 11)) { ui.pointer = true; setTooltip(`Open ${r.b.name}`); }
        if (click(ix, cy - 2, iw, 11)) g.staffView = r.b.id;
        cy += 13;
      }
      cy += 6;
      label('Opinions', ix, cy); cy += 12;
      for (const tp of DATA.topics) {
        const v = a.opinions ? a.opinions[tp.id] : 0;
        D.text(tp.name, ix, cy, C.inkSoft);
        const sx = ix + iw - 5 * 9;
        for (let i = -2; i <= 2; i++) {
          const px = sx + (i + 2) * 9;
          D.rect(px, cy + 1, 7, 5, i === v ? (v > 0 ? C.green : v < 0 ? C.red : C.ink) : '#E6E3DD');
        }
        if (hover(ix, cy - 1, iw, 11)) setTooltip(v > 0 ? `"${tp.pro}"` : v < 0 ? `"${tp.con}"` : `No strong feelings about ${tp.name}.`);
        cy += 11;
      }
      cy += D.paragraph('Shared opinions make friends. They decide votes in meetings later.', ix, cy + 2, iw, C.faint) + 4;
    }
    cy += 6;
    label('Desk', ix, cy);
    const desk = a.desk != null && g.furnById[a.desk];
    D.text(desk ? DATA.furnById[desk.type].name : 'No desk. Build one.', ix + 36, cy, desk ? C.inkSoft : C.red);
    return cy - top + 16;
  });

  const by = y + h - 26;
  if (a.isPlayer) {
    const bw = Math.floor((w - 28 - 9) / 4);
    if (button(x + 14, by, bw, 16, 'Work', { active: a.mode === 'work', tip: 'Sit at your desk and work on jobs yourself.' })) a.mode = 'work';
    if (button(x + 14 + (bw + 3), by, bw, 16, 'Manage', { active: a.mode === 'manage', tip: 'Stop working. Walk the floor instead: team output +15%.' })) { a.mode = 'manage'; if (a.state === 'working') a.state = 'idle'; }
    if (button(x + 14 + (bw + 3) * 2, by, bw, 16, 'Break', { disabled: !a.present, tip: 'Grab a coffee or flop onto the sofa.' })) { a.forced = 'break'; if (a.state === 'working') a.state = 'idle'; }
    if (button(x + 14 + (bw + 3) * 3, by, bw, 16, 'Home', { disabled: !a.present, tip: 'Leave early and recharge for tomorrow.' })) a.forced = 'home';
  } else if (button(x + 14, by, 60, 16, 'Fire', { variant: 'danger', tip: 'Let them go. Their friends will remember.' })) {
    fire(g, a);
    g.staffView = null;
  }
}

// ---------------- Staff: relationship web ----------------
function relWeb(app, ix, top, cw) {
  const g = app.game;
  const staff = g.agents.filter((a) => !a.isPlayer);
  if (staff.length < 2) return D.paragraph('Hire at least two people to see who likes whom.', ix, top + 4, cw, C.muted) + 8;
  const size = Math.min(cw, 220);
  const cx = ix + cw / 2, cy = top + size / 2 + 2;
  const r = size / 2 - 16;
  const pos = new Map();
  staff.forEach((a, i) => {
    const ang = (i / staff.length) * Math.PI * 2 - Math.PI / 2;
    pos.set(a.id, { x: Math.round(cx + Math.cos(ang) * r), y: Math.round(cy + Math.sin(ang) * r) });
  });
  let hot = null;
  for (const a of staff) { const p = pos.get(a.id); if (hover(p.x - 9, p.y - 9, 18, 18)) hot = a; }
  const ctx = D.getCtx();
  for (let i = 0; i < staff.length; i++) for (let k = i + 1; k < staff.length; k++) {
    const a = staff[i], b = staff[k];
    const v = rel(g, a, b);
    let col = null, th = 1;
    if (a.partner === b.id) { col = KIND.pink[1]; th = 2; }
    else if (a.crush === b.id || b.crush === a.id) col = '#D9A3BC';
    else if (v >= FRIEND) { col = C.green; th = 2; }
    else if (v >= 25) col = '#A9C9A4';
    else if (v <= RIVAL) { col = C.red; th = 2; }
    else if (v <= -15) col = '#E3A9A7';
    if (!col) continue;
    if (hot && hot !== a && hot !== b) ctx.globalAlpha = 0.15;
    const p = pos.get(a.id), q = pos.get(b.id);
    D.line(p.x, p.y, q.x, q.y, col, th);
    ctx.globalAlpha = 1;
  }
  for (const a of staff) {
    const p = pos.get(a.id);
    const cl = (g.cliques || []).findIndex((c) => c.members.includes(a.id));
    D.card(p.x - 9, p.y - 9, 18, 18, C.surface, hot === a ? C.ink : cl >= 0 ? C.yellow : C.border);
    ctx.drawImage(charSprites(a.look).down[0], 0, 0, 16, 12, p.x - 8, p.y - 7, 16, 12);
    D.textC(D.fit(firstName(a), 44), p.x, p.y + 11, hot === a ? C.ink : C.muted);
    if (hot === a) ui.pointer = true;
    if (click(p.x - 9, p.y - 9, 18, 18)) g.staffView = a.id;
  }
  let yy = top + size + 16;
  let tx = ix;
  for (const [lab, kind] of [['Friend', 'green'], ['Rival', 'red'], ['Dating', 'pink']]) { tx += tag(tx, yy, lab, kind) + 4; }
  yy += 18;
  if (hot) {
    const rs = relationsOf(g, hot);
    const fr = rs.filter((x) => x.label[0] === 'Friend').length, rv = rs.filter((x) => x.label[0] === 'Rival').length;
    D.text(D.fit(`${hot.name}: ${fr} friend${fr === 1 ? '' : 's'}, ${rv} rival${rv === 1 ? '' : 's'}`, cw), ix, yy, C.ink);
    yy += 14;
  } else { D.text('Hover a person to highlight their ties.', ix, yy, C.faint); yy += 14; }
  label('Cliques', ix, yy); yy += 12;
  if (!g.cliques || !g.cliques.length) { yy += D.paragraph('None yet. Three friends who all like each other form a clique.', ix, yy, cw, C.faint); }
  for (const c of g.cliques || []) {
    D.text(c.name, ix, yy, C.ink); yy += 11;
    yy += D.paragraph(c.members.map((id) => { const m = g.agents.find((x) => x.id === id); return m ? firstName(m) : '?'; }).join(', '), ix, yy, cw, C.muted) + 4;
  }
  return yy - top + 8;
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
    { id: 'applicants', label: `Applicants ${g.applicants.length}`, hl: isHl(g, 'tab-applicants') },
    { id: 'web', label: 'People' },
  ], g.staffTab);
  if (t) g.staffTab = t;
  cy += 24;
  const ix = x + 12, cw = w - 24;
  const ind = DATA.indById[g.industry];

  scrollArea('staff-' + g.staffTab, x + 6, cy, w - 10, y + h - cy - 8, (top) => {
    let yy = top;
    if (g.staffTab === 'web') return relWeb(app, ix, top, cw);
    if (g.staffTab === 'team') {
      for (const a of g.agents) {
        const hv = hover(ix, yy, cw, 30);
        if (hv) { ui.pointer = true; D.card(ix, yy, cw, 30, C.surface2, null); }
        D.getCtx().drawImage(charSprites(a.look).down[0], ix + 4, yy + 7);
        D.text(D.fit(a.name + (a.isPlayer ? ' (you)' : ''), cw - 90), ix + 26, yy + 6, C.ink);
        D.text(D.fit(`${a.role} · ${a.activity}`, cw - 34), ix + 26, yy + 18, C.muted);
        const [mi, mc] = moodInfo(a.mood);
        D.icon(mi, ix + cw - 12, yy + 5, mc);
        if (a.partner != null) D.icon('star', ix + cw - 12, yy + 18, KIND.pink[1]);
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
    g.applicants.slice().forEach((ap, i) => {
      const th = 14 * Math.ceil(ap.traits.length / 3);
      const ch = 56 + th;
      D.card(ix, yy, cw, ch, C.surface, C.border);
      D.getCtx().drawImage(charSprites(ap.look).down[0], ix + 8, yy + 8);
      D.text(D.fit(ap.name, cw - 100), ix + 30, yy + 8, C.ink);
      tag(ix + 30, yy + 20, ap.role, skillKind(g, ap.mainSkill));
      D.textR(`${fmtMoney(ap.salary)}/mo`, ix + cw - 8, yy + 8, C.ink);
      D.text(D.fit(ind.skills.map((s) => `${s} ${ap.skills[s]}`).join(' · '), cw - 16), ix + 8, yy + 38, C.muted);
      traitTags(ix + 8, yy + 50, cw - 16, ap.traits, ap.known);
      if (button(ix + cw - 50, yy + 20, 42, 14, 'Hire', { variant: 'primary', disabled: free === 0, hl: i === 0 && isHl(g, 'hire'), tip: free === 0 ? 'Build a free desk first (Build, Work tab).' : 'Salary is paid every 4 weeks.' })) hire(g, ap);
      yy += ch + 6;
    });
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
  if (def.use) for (const k in def.use.restore) if (Math.abs(def.use.restore[k]) > 1) out.push([NEED_LABEL[k], k === 'stress' ? 'green' : 'yellow']);
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
    if (cx + tw > x + w - 12) { cx = x + 12; ry += 18; }
    if (button(cx, ry, tw, 14, lab, { active: g.buildTab === id, hl: isHl(g, 'tab-' + id) })) g.buildTab = id;
    cx += tw + 3;
  }
  cy = ry + 22;
  const ix = x + 10, cw = w - 20;
  const descH = h > 260 ? 74 : 40;
  const listH = y + h - cy - descH;
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
      D.card(ix, yy, cw, 30, sel || hv ? C.surface2 : C.surface, sel ? C.ink : hv ? C.borderStrong : C.border);
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
      D.text(it.kind ? it.price : fmtMoney(it.price), ix + 36, yy + 18, !it.kind && g.money < it.price ? C.red : C.muted);
      if (!it.kind && isHl(g, 'item-' + it.id)) highlight(ix, yy, cw, 30);
      if (click(ix, yy, cw, 30)) g.tool = sel ? null : it.kind ? { kind: it.kind } : { kind: 'furn', id: it.id };
      yy += 33;
    }
    return yy - top;
  });

  const dy = y + h - descH + 4;
  D.rect(x + 12, dy, w - 24, 1, C.border);
  if (selected) {
    const ph = descH > 50 ? D.paragraph(selected.desc, x + 12, dy + 7, w - 24, C.inkSoft, 10) : 0;
    if (!selected.kind) {
      let tx = x + 12;
      const ty = descH > 50 ? Math.min(dy + 9 + ph, y + h - 30) : dy + 8;
      for (const [lab, kind] of effects(selected)) { const tw2 = tagW(lab); if (tx + tw2 > x + w - 12) break; tag(tx, ty, lab, kind); tx += tw2 + 3; }
    }
  } else D.paragraph('Pick an item, then click the floor. Green means it fits.', x + 12, dy + 7, w - 24, C.muted);
  if (descH > 50) D.text('Right-click or Esc to stop', x + 12, y + h - 16, C.faint);
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
    row(ix, cy, iw, 'Salaries', '-' + fmtMoney(payroll(g))); cy += 11;
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
      cy += D.paragraph('All of 1F is yours. More floors open up in M7.', ix, cy, iw, C.muted) + 8;
    }
    return cy - top;
  });
}

export function drawPanel(app, x, y, w, h) {
  const g = app.game;
  if (g.panel === 'jobs') jobsPanel(app, x, y, w, h);
  else if (g.panel === 'staff') staffPanel(app, x, y, w, h);
  else if (g.panel === 'build') buildPanel(app, x, y, w, h);
  else if (g.panel === 'finance') financePanel(app, x, y, w, h);
}
