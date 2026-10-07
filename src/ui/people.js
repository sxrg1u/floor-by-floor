// Window contents: Staff (team list, applicants with salary negotiation, relationship web), Profile, Teams.
import { C, KIND, LEVELS } from '../config.js';
import { DATA } from '../data.js';
import * as D from '../render/draw.js';
import { button, tag, bar, label, scrollArea, hover, click, ui, setTooltip, highlight, textField } from './ui.js';
import { charSprites } from '../render/sprites.js';
import { freeDeskCount } from '../systems/building.js';
import { fmtMoney, payroll } from '../systems/economy.js';
import { negotiate, fire } from '../systems/hiring.js';
import { offerChance, marketValue, canPromote, promote, giveRaise, levelName, mainSkillOf } from '../systems/careers.js';
import { createTeam, deleteTeam, teamOf, setTeam, teamMembers, teamLead, teamById, renameTeam } from '../systems/teams.js';
import { taskOf } from '../systems/jobs.js';
import { NEED_KEYS, NEED_LABEL, NEED_ICON, firstName, sendBreak, sendHome } from '../sim/agents.js';
import { rel, relationsOf, boss, FRIEND, RIVAL } from '../sim/personality.js';
import { isHl } from '../systems/tutorial.js';
import { openWin } from './windows.js';
import { tabs, skillKind, tagW, divBar, traitTags, moodInfo, chip, needColor } from './common.js';

const taskLabel = (g, a) => {
  const t = taskOf(g, a);
  return t ? `${t.part.skill} on ${t.job.name}` : null;
};

// ---------------- Staff ----------------
export function staffWin(app, win, x, y, w, h) {
  const g = app.game;
  const staff = g.agents.filter((a) => !a.isPlayer);
  const t = tabs(x + 10, y + 6, w - 20, [
    { id: 'team', label: `People ${staff.length}` },
    { id: 'applicants', label: `Applicants ${g.applicants.length}`, hl: isHl(g, 'tab-applicants') },
    { id: 'web', label: 'Web' },
  ], g.staffTab);
  if (t) g.staffTab = t;
  const top = y + 28;
  const ix = x + 10, cw = w - 20;
  const ind = DATA.indById[g.industry];

  scrollArea('staff-' + g.staffTab, x + 4, top, w - 8, y + h - top - 4, (sy) => {
    let yy = sy;
    if (g.staffTab === 'web') return relWeb(app, ix, sy, cw);
    if (g.staffTab === 'team') {
      D.text(`Payroll ${fmtMoney(payroll(g))}/mo · free desks ${freeDeskCount(g)}`, ix, yy + 2, C.muted);
      yy += 14;
      if (!staff.length) return yy - sy + D.paragraph('Nobody works here yet. Build desks, then hire from the Applicants tab.', ix, yy + 6, cw, C.muted) + 10;
      for (const a of staff) {
        const hv = hover(ix, yy, cw, 32);
        if (hv) { ui.pointer = true; D.card(ix, yy, cw, 32, C.surface2, null); }
        D.getCtx().drawImage(charSprites(a.look).down[0], ix + 4, yy + 8);
        const tm = teamOf(g, a);
        D.text(D.fit(a.name, cw - 100), ix + 26, yy + 5, C.ink);
        if (tm) D.rect(ix + 22, yy + 6, 2, 7, tm.color);
        const tl = !a.present ? a.activity : taskLabel(g, a) || (tm ? 'No task' : 'No team');
        D.text(D.fit(`${LEVELS[a.level]} · ${tl}`, cw - 34), ix + 26, yy + 18, !tm || !a.task ? C.yellow : C.muted);
        const [mi, mc] = moodInfo(a.mood);
        D.icon(mi, ix + cw - 12, yy + 5, mc);
        if (a.loyalty < 30) D.icon('stress', ix + cw - 12, yy + 18, C.red);
        D.textR(fmtMoney(a.salary), ix + cw - 18, yy + 5, C.inkSoft);
        D.rect(ix, yy + 32, cw, 1, C.border);
        if (click(ix, yy, cw, 32)) openWin(g, 'profile', a.id);
        yy += 33;
      }
      return yy - sy + 4;
    }
    const free = freeDeskCount(g);
    if (!g.applicants.length) yy += D.paragraph('No applicants left this week. New ones arrive every Monday.', ix, yy + 4, cw, C.muted) + 8;
    g.applicants.slice().forEach((ap, i) => {
      const th = 14 * Math.ceil(ap.traits.length / 3);
      const ch = 84 + th;
      D.card(ix, yy, cw, ch, C.surface, C.border);
      D.getCtx().drawImage(charSprites(ap.look).down[0], ix + 8, yy + 8);
      D.text(D.fit(ap.name, cw - 100), ix + 30, yy + 7, C.ink);
      tag(ix + 30, yy + 19, `${LEVELS[ap.level]} ${ap.role}`, skillKind(g, ap.mainSkill));
      D.textR(`asks ${fmtMoney(ap.salary)}`, ix + cw - 8, yy + 7, C.muted);
      D.text(D.fit(ind.skills.map((s) => `${s} ${ap.skills[s]}`).join(' · '), cw - 16), ix + 8, yy + 36, C.inkSoft);
      traitTags(ix + 8, yy + 48, cw - 16, ap.traits, ap.known);
      const by = yy + 50 + th;
      // negotiation row
      if (button(ix + 8, by, 16, 15, '-', { tip: '-$50' })) ap.offer = Math.max(Math.round(ap.salary * 0.7 / 50) * 50, ap.offer - 50);
      D.textC(fmtMoney(ap.offer), ix + 56, by + 4, C.ink);
      if (button(ix + 88, by, 16, 15, '+', { tip: '+$50' })) ap.offer = Math.min(Math.round(ap.salary * 1.3 / 50) * 50, ap.offer + 50);
      const p = offerChance(ap, ap.offer);
      D.text(p >= 0.95 ? 'sure yes' : p >= 0.6 ? 'likely' : p >= 0.3 ? 'maybe' : 'unlikely', ix + 110, by + 4, p >= 0.6 ? C.green : p >= 0.3 ? C.yellow : C.red);
      if (button(ix + cw - 58, by, 50, 15, 'Offer', { variant: 'primary', disabled: free === 0, hl: i === 0 && isHl(g, 'offer'), tip: free === 0 ? 'Build a free desk first (Build, Work).' : `Two tries, then they walk. Lower offers save money but start with lower loyalty.` })) negotiate(g, ap, ap.offer);
      yy += ch + 6;
    });
    yy += D.paragraph('New applicants every Monday. Higher Rep and prestige furniture attract better people.', ix, yy + 2, cw, C.faint);
    return yy - sy + 8;
  });
}

// ---------------- Profile ----------------
export function profileWin(app, win, x, y, w, h) {
  const g = app.game;
  const a = g.agents.find((b) => b.id === win.data);
  if (!a) { g.windows = g.windows.filter((ww) => ww !== win); return; }
  win.title = a.name;
  const ind = DATA.indById[g.industry];
  const ix = x + 12, iw = w - 24;
  const actionsH = a.isPlayer ? 0 : 42;
  scrollArea('profile-' + a.id, x + 4, y + 4, w - 8, h - 8 - actionsH, (top) => {
    let cy = top + 4;
    D.card(ix, cy, 40, 40, C.bg, null);
    D.getCtx().drawImage(charSprites(a.look).down[0], ix + 4, cy + 4, 32, 32);
    D.text(D.fit(a.isPlayer ? 'Founder & CEO' : `${LEVELS[a.level]} ${a.role}`, iw - 50), ix + 48, cy + 2, C.ink);
    if (!a.isPlayer) {
      D.text(`${fmtMoney(a.salary)}/mo · market ${fmtMoney(marketValue(a))}`, ix + 48, cy + 14, a.salary < marketValue(a) * 0.9 ? C.red : C.muted);
      label('Loyalty', ix + 48, cy + 27);
      bar(ix + 100, cy + 29, iw - 126, 3, a.loyalty / 100, a.loyalty < 30 ? C.red : a.loyalty < 55 ? C.yellow : C.green);
      D.textR(Math.round(a.loyalty), ix + iw, cy + 27, C.muted);
      if (hover(ix + 48, cy + 25, iw - 48, 11)) setTooltip('Below 10 they quit. Fair pay, promotions, good mood and kept promises raise it.');
    } else D.paragraph('You run the company. You never work on jobs yourself.', ix + 48, cy + 14, iw - 48, C.muted);
    cy += 48;
    if (!a.isPlayer) {
      const tm = teamOf(g, a);
      label('Team', ix, cy + 2);
      const tl = tm ? tm.name : 'No team';
      if (button(ix + 40, cy, Math.min(iw - 40, D.tw(tl) + 26), 13, tl + ' ›', { align: 'left', tip: 'Cycle through teams' })) {
        const ids = [null, ...g.teams.map((t) => t.id)];
        setTeam(g, a, ids[(ids.indexOf(tm ? tm.id : null) + 1) % ids.length]);
      }
      cy += 17;
      label('Task', ix, cy);
      D.text(D.fit(taskLabel(g, a) || 'none. Assign one in Jobs.', iw - 40), ix + 40, cy, a.task ? C.inkSoft : C.yellow);
      cy += 14;
      if (a.traits.length) { label('Traits', ix, cy); cy += 12; cy += traitTags(ix, cy, iw, a.traits, a.known) + 2; }
    }
    const [mi, mc] = moodInfo(a.mood);
    label('Mood', ix, cy);
    D.icon(mi, ix + 36, cy - 1, mc);
    bar(ix + 48, cy + 2, iw - 70, 3, a.mood / 100, mc);
    D.textR(Math.round(a.mood), ix + iw, cy, C.ink);
    cy += 12;
    D.text(D.fit(a.activity, iw), ix, cy, C.inkSoft); cy += 11;
    if (a.thought && a.thoughtT > 0) { D.text(D.fit('"' + a.thought + '"', iw), ix, cy, C.muted); cy += 11; }
    cy += 5;
    label('Needs', ix, cy); cy += 12;
    for (const k of NEED_KEYS) {
      const v = a.needs[k];
      D.icon(NEED_ICON[k], ix, cy, C.muted);
      D.text(NEED_LABEL[k], ix + 12, cy, C.inkSoft);
      bar(ix + 66, cy + 2, iw - 90, 3, v / 100, needColor(k, v));
      D.textR(Math.round(v), ix + iw, cy, C.muted);
      cy += 11;
    }
    if (a.isPlayer) return cy - top + 8;
    cy += 5;
    label('Skills', ix, cy); cy += 12;
    for (const s of ind.skills) {
      D.text(s + (s === a.mainSkill ? '*' : ''), ix, cy, C.inkSoft);
      const lvl = a.skills[s] || 1;
      const pw = Math.floor((iw - 90) / 10);
      for (let i = 0; i < 10; i++) D.rect(ix + 66 + i * pw, cy + 1, pw - 2, 5, i < lvl ? C.ink : '#E6E3DD');
      D.textR(lvl, ix + iw, cy, C.muted);
      cy += 11;
    }
    if (canPromote(a)) { D.text(`Ready for ${LEVELS[a.level + 1]}. Promote before they get bitter.`, ix, cy + 1, C.green); cy += 12; }
    cy += 5;
    const bo = boss(g);
    label('Thinks of you', ix, cy);
    divBar(ix + 80, cy + 2, iw - 104, rel(g, a, bo));
    D.textR(Math.round(rel(g, a, bo)), ix + iw, cy, C.muted);
    cy += 14;
    label('Relationships', ix, cy); cy += 12;
    const rs = relationsOf(g, a).slice(0, 5);
    if (!rs.length) { D.text('Nobody else to have feelings about.', ix, cy, C.faint); cy += 11; }
    for (const r of rs) {
      D.text(D.fit(firstName(r.b), 56), ix, cy, C.inkSoft);
      const tw2 = tag(ix + 60, cy - 2, r.label[0], r.label[1]);
      divBar(ix + 66 + tw2, cy + 2, iw - 90 - tw2, r.r);
      D.textR(Math.round(r.r), ix + iw, cy, C.muted);
      if (hover(ix, cy - 2, iw, 11)) { ui.pointer = true; setTooltip(`Open ${r.b.name}`); }
      if (click(ix, cy - 2, iw, 11)) openWin(g, 'profile', r.b.id);
      cy += 13;
    }
    cy += 5;
    label('Opinions', ix, cy); cy += 12;
    for (const tp of DATA.topics) {
      const v = a.opinions ? a.opinions[tp.id] : 0;
      D.text(tp.name, ix, cy, C.inkSoft);
      const sx = ix + iw - 5 * 9;
      for (let i = -2; i <= 2; i++) D.rect(sx + (i + 2) * 9, cy + 1, 7, 5, i === v ? (v > 0 ? C.green : v < 0 ? C.red : C.ink) : '#E6E3DD');
      if (hover(ix, cy - 1, iw, 11)) setTooltip(v > 0 ? `"${tp.pro}"` : v < 0 ? `"${tp.con}"` : `No strong feelings about ${tp.name}.`);
      cy += 11;
    }
    cy += 4;
    label('Desk', ix, cy);
    const desk = a.desk != null && g.furnById[a.desk];
    D.text(desk ? DATA.furnById[desk.type].name : 'No desk. Build one.', ix + 36, cy, desk ? C.inkSoft : C.red);
    return cy - top + 14;
  });
  if (a.isPlayer) return;
  const by = y + h - actionsH + 4;
  D.rect(x + 8, by - 4, w - 16, 1, C.border);
  const bw = Math.floor((w - 24 - 6) / 3);
  if (button(x + 12, by, bw, 15, 'Break 30m', { disabled: !a.present, tip: 'Sends them to recover energy, fun and stress for 30 minutes.' })) sendBreak(g, a, 30);
  if (button(x + 12 + bw + 3, by, bw, 15, 'Send home', { disabled: !a.present, tip: 'Leaves now. Back tomorrow, rested.' })) sendHome(g, a);
  if (button(x + 12 + (bw + 3) * 2, by, bw, 15, 'Fire', { variant: 'danger', tip: 'Their friends will remember.' })) { fire(g, a); return; }
  const by2 = by + 18;
  const add = Math.round(a.salary * 0.1 / 50) * 50;
  if (button(x + 12, by2, bw, 15, `Raise +${fmtMoney(add)}`, { tip: '+10% salary. Loyalty up.' })) giveRaise(g, a, 0.1);
  if (button(x + 12 + bw + 3, by2, bw * 2 + 3, 15, a.level < 4 ? `Promote to ${LEVELS[a.level + 1]}` : 'Top level', { variant: canPromote(a) ? 'primary' : 'secondary', disabled: !canPromote(a), tip: canPromote(a) ? 'Salary +15%, loyalty up. Leads boost their team.' : `Needs ${a.mainSkill} skill ${[0, 3, 5, 7, 9][Math.min(4, a.level + 1)]}.` })) promote(g, a);
}

// ---------------- Teams ----------------
export function teamsWin(app, win, x, y, w, h) {
  const g = app.game;
  if (g.selectedTeam != null && !teamById(g, g.selectedTeam)) g.selectedTeam = null;
  if (g.selectedTeam == null && g.teams.length) g.selectedTeam = g.teams[0].id;
  const ix = x + 10, cw = w - 20;
  scrollArea('teams', x + 4, y + 4, w - 8, h - 8, (top) => {
    let yy = top + 2;
    if (button(ix, yy, 76, 15, '+ New team', { variant: 'primary', hl: isHl(g, 'new-team'), tip: 'Jobs go to teams. Teams of 2 to 5 work well.' })) { const t = createTeam(g); g.selectedTeam = t.id; }
    yy += 22;
    if (!g.teams.length) yy += D.paragraph('No teams yet. Create one, add people, then give it jobs.', ix, yy, cw, C.muted) + 6;
    for (const t of g.teams) {
      const sel = g.selectedTeam === t.id;
      const mem = teamMembers(g, t);
      const lead = teamLead(g, t);
      const jobs = g.jobs.filter((j) => j.team === t.id);
      const hv = hover(ix, yy, cw, 28);
      if (hv && !sel) ui.pointer = true;
      D.card(ix, yy, cw, 28, sel ? C.surface2 : C.surface, sel ? C.ink : hv ? C.borderStrong : C.border);
      D.rect(ix + 4, yy + 5, 3, 18, t.color);
      D.text(D.fit(t.name, cw - 80), ix + 12, yy + 5, C.ink);
      D.text(D.fit(`${mem.length} people · ${jobs.length} job${jobs.length === 1 ? '' : 's'}${lead ? ' · lead ' + firstName(lead) : ''}`, cw - 20), ix + 12, yy + 16, C.muted);
      if (!sel && click(ix, yy, cw, 28)) g.selectedTeam = t.id;
      yy += 32;
    }
    const t = teamById(g, g.selectedTeam);
    if (t) {
      yy += 4;
      D.rect(ix, yy, cw, 1, C.border); yy += 8;
      label('Selected team', ix, yy); yy += 12;
      const nv = textField('team-name-' + t.id, ix, yy, cw - 60, t.name, 18);
      if (nv !== t.name) renameTeam(g, t, nv);
      if (button(ix + cw - 54, yy + 2, 54, 14, 'Delete', { variant: 'danger', tip: 'Members become teamless, jobs lose their team.' })) { deleteTeam(g, t); g.selectedTeam = null; return yy - top + 30; }
      yy += 24;
      label('Members (click to remove)', ix, yy); yy += 12;
      const mem = teamMembers(g, t);
      if (!mem.length) { D.text('Nobody yet.', ix, yy, C.faint); yy += 14; }
      let lx = ix;
      for (const a of mem) {
        const lab = `${firstName(a)} ${a.mainSkill ? a.mainSkill[0] + mainSkillOf(a) : ''}`;
        const cwid = D.tw(lab) + 8;
        if (lx + cwid > ix + cw) { lx = ix; yy += 15; }
        const r = chip(lx, yy, lab, { on: true, tip: `${a.name}: remove from ${t.name}` }, ui, click);
        if (r.clicked) setTeam(g, a, null);
        lx += r.w + 3;
      }
      if (mem.length) yy += 18;
      const bw = Math.floor((cw - 3) / 2);
      if (button(ix, yy, bw, 15, 'Team break 30m', { disabled: !mem.some((a) => a.present), tip: 'Everyone in the team takes a 30 minute break.' })) for (const a of mem) sendBreak(g, a, 30);
      if (button(ix + bw + 3, yy, bw, 15, 'Send team home', { disabled: !mem.some((a) => a.present), tip: 'Everyone in the team goes home now.' })) for (const a of mem) sendHome(g, a);
      yy += 22;
    }
    const loose = g.agents.filter((a) => !a.isPlayer && !teamOf(g, a));
    label(t ? `Not in a team (click to add to ${t.name})` : 'Not in a team', ix, yy); yy += 12;
    if (!loose.length) { D.text('Everyone has a team.', ix, yy, C.faint); yy += 14; }
    let lx = ix, first = true;
    for (const a of loose) {
      const lab = `${firstName(a)} ${a.mainSkill ? a.mainSkill[0] + mainSkillOf(a) : ''}`;
      const cwid = D.tw(lab) + 8;
      if (lx + cwid > ix + cw) { lx = ix; yy += 15; }
      const r = chip(lx, yy, lab, { tip: t ? `Add ${a.name} to ${t.name}` : 'Create a team first' }, ui, click);
      if (first && isHl(g, 'add-member')) highlight(lx, yy, r.w, 12);
      first = false;
      if (r.clicked && t) setTeam(g, a, t.id);
      lx += r.w + 3;
    }
    if (loose.length) yy += 18;
    yy += D.paragraph('Friends in a team work faster, rivals sabotage each other. A Lead or Head in the team adds +5% or +10%.', ix, yy + 4, cw, C.faint);
    return yy - top + 10;
  });
}

// ---------------- Relationship web ----------------
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
    const tm = teamOf(g, a);
    D.card(p.x - 9, p.y - 9, 18, 18, C.surface, hot === a ? C.ink : tm ? tm.color : C.border);
    ctx.drawImage(charSprites(a.look).down[0], 0, 0, 16, 12, p.x - 8, p.y - 7, 16, 12);
    D.textC(D.fit(firstName(a), 44), p.x, p.y + 11, hot === a ? C.ink : C.muted);
    if (hot === a) ui.pointer = true;
    if (click(p.x - 9, p.y - 9, 18, 18)) openWin(g, 'profile', a.id);
  }
  let yy = top + size + 16;
  let tx = ix;
  for (const [lab, kind] of [['Friend', 'green'], ['Rival', 'red'], ['Dating', 'pink']]) tx += tag(tx, yy, lab, kind) + 4;
  yy += 18;
  if (hot) {
    const rs = relationsOf(g, hot);
    const fr = rs.filter((x) => x.label[0] === 'Friend').length, rv = rs.filter((x) => x.label[0] === 'Rival').length;
    D.text(D.fit(`${hot.name}: ${fr} friend${fr === 1 ? '' : 's'}, ${rv} rival${rv === 1 ? '' : 's'}`, cw), ix, yy, C.ink);
  } else D.text('Hover a person to highlight their ties. Frames show team color.', ix, yy, C.faint);
  yy += 14;
  label('Cliques', ix, yy); yy += 12;
  if (!g.cliques || !g.cliques.length) yy += D.paragraph('None yet. Three friends who all like each other form a clique. Cliques vote together in meetings.', ix, yy, cw, C.faint);
  for (const c of g.cliques || []) {
    D.text(c.name, ix, yy, C.ink); yy += 11;
    yy += D.paragraph(c.members.map((id) => { const m = g.agents.find((x) => x.id === id); return m ? firstName(m) : '?'; }).join(', '), ix, yy, cw, C.muted) + 4;
  }
  return yy - top + 8;
}

export { levelName };
