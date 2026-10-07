// In-game screen: top bar, floor bar, bottom bar, windows, toasts, tutorial card, popup, modals (incl. meetings).
import { C, W, H, TOP_H, BOTTOM_H, LEFT_W, KIND, VIEW, FLOORS, LEVELS } from '../config.js';
import * as D from '../render/draw.js';
import { button, setLayer, block, key, setTooltip, hover, input, tag, label, bar, scrollArea, ui } from './ui.js';
import { drawWorld, handleWorld, agentScreen } from '../render/world.js';
import { pan, clampCam, centerOnTile, cam } from '../render/camera.js';
import { charSprites } from '../render/sprites.js';
import { clock, WEEKDAYS, hhmm, dateLabel } from '../sim/time.js';
import { nightMultiplier } from '../sim/tick.js';
import { fmtMoney } from '../systems/economy.js';
import { soundOn, setSound, sfx, setMusic, musicEnabled, setMusicOn } from '../audio.js';
import { STEPS, isHl, startTutorial, updateTutorial } from '../systems/tutorial.js';
import { eventView } from '../systems/events.js';
import { topicDef, supportCounts, statement, act, decide, setProposal } from '../systems/meetings.js';
import { rentStatus, rentFloor } from '../systems/building.js';
import { taskOf } from '../systems/jobs.js';
import { teamOf } from '../systems/teams.js';
import { firstName, sendBreak, sendHome } from '../sim/agents.js';
import { byId } from '../sim/personality.js';
import { saveGame, slotLabel } from '../systems/save.js';
import { drawWindows, toggleWin, openWin, closeWin, topWin } from './windows.js';
import { jobsWin, buildWin, financeWin } from './panels.js';
import { staffWin, profileWin, teamsWin } from './people.js';
import { policiesWin, meetingsWin, goalsWin } from './office.js';
import { moodInfo, needColor } from './common.js';

const NAV = [
  ['jobs', 'Jobs', 'case', 'J'], ['staff', 'Staff', 'people', 'S'], ['teams', 'Teams', 'team', 'T'], ['build', 'Build', 'hammer', 'B'],
  ['meetings', 'Meet', 'chat', 'M'], ['policies', 'Rules', 'rule', 'P'], ['finance', 'Money', 'chart', 'F'], ['goals', 'Goals', 'goal', 'G'],
];

function stat(x, iconName, text, color, tip) {
  D.icon(iconName, x, 6, C.muted);
  D.text(text, x + 11, 6, color);
  const w = 11 + D.tw(text);
  if (hover(x - 2, 0, w + 4, TOP_H)) setTooltip(tip);
  return x + w + 12;
}

const idleStaff = (g) => g.agents.filter((a) => !a.isPlayer && a.present && !a.task && a.state !== 'meeting');

function topBar(app) {
  const g = app.game;
  block(0, 0, W, TOP_H);
  D.rect(0, 0, W, TOP_H, C.surface);
  D.rect(0, TOP_H - 1, W, 1, C.border);
  let x = 6;
  D.card(x, 3, 12, 12, g.color, g.color);
  D.textC((g.company[0] || '?').toUpperCase(), x + 6, 5, '#FFFFFF');
  x += 18;
  if (W >= 640) {
    const name = D.fit(g.company, W >= 760 ? 120 : 80);
    D.text(name, x, 6, C.ink);
    x += D.tw(name) + 10;
    D.rect(x, 4, 1, 10, C.border); x += 10;
  }
  const c = clock(g.time);
  const date = W >= 600 ? dateLabel(g.time) : `${WEEKDAYS[c.weekday]} W${c.week} ${hhmm(c.minute)}`;
  x = stat(x, 'coin', fmtMoney(g.money), g.money < 0 ? C.red : C.ink, 'Balance. Salaries, rent and loan interest are due every 4 weeks.');
  x = stat(x, 'star', `Rep ${Math.floor(g.rep)}`, C.ink, 'Reputation 0 to 100. Bigger jobs, better applicants, more floors.');
  x = stat(x, 'people', String(g.agents.length - 1), C.ink, 'Employees.');
  x = stat(x, 'cal', date, C.ink, 'Nights fast-forward when the office is empty.');
  const right = W - 6 - 16 - 6 - 80;
  const idle = idleStaff(g).length;
  if (idle && x < right - 50) {
    const lab = `${idle} idle`;
    const tw = D.tw(lab.toUpperCase()) + 8;
    tag(x - 4, 4, lab, 'yellow');
    if (hover(x - 4, 2, tw, 14)) { ui.pointer = true; setTooltip('People without a task. Open Jobs and put them on a part.'); }
    if (hover(x - 4, 2, tw, 14) && input.pressed) { openWin(g, 'jobs'); g.jobsTab = 'active'; }
    x += tw + 4;
  }
  if (x < right - 40) {
    if (g.paused) tag(x - 4, 4, 'Paused', 'yellow');
    else if (nightMultiplier(g) > 1) tag(x - 4, 4, 'Night', 'blue');
  }
  let rx = W - 6 - 16;
  if (button(rx, 2, 16, 14, '', { variant: 'ghost', icon: soundOn() ? 'sound' : 'mute', tip: 'Sound on/off' })) setSound(!soundOn());
  rx -= 6;
  const speedHl = isHl(g, 'speed');
  for (const [s, lab] of [[4, '4x'], [2, '2x'], [1, '1x']]) {
    rx -= 20;
    if (button(rx, 2, 20, 14, lab, { variant: 'ghost', active: !g.paused && g.speed === s, tip: `Speed ${lab}`, hl: speedHl && s > 1 && g.speed < s })) { g.speed = s; g.paused = false; }
  }
  rx -= 20;
  if (button(rx, 2, 20, 14, '', { variant: 'ghost', icon: 'pause', active: g.paused, tip: 'Pause (Space)' })) g.paused = !g.paused;
}

function setView(g, i) {
  if (i < 0 || i >= g.floors.length || i === g.view) return;
  g.view = i; g.tool = null; g.selected = null;
  clampCam(g);
}

function floorBar(app) {
  const g = app.game;
  const h = H - TOP_H - BOTTOM_H;
  block(0, TOP_H, LEFT_W, h);
  D.rect(0, TOP_H, LEFT_W, h, C.surface);
  D.rect(LEFT_W - 1, TOP_H, 1, h, C.border);
  let y = TOP_H + 6;
  const st = rentStatus(g);
  if (st.def) {
    const tip = st.ok ? `Rent ${st.def.label}: ${fmtMoney(st.deposit)} deposit, +${fmtMoney(st.def.rent)}/month.` : st.reason;
    if (button(3, y, 24, 18, '', { variant: 'ghost', icon: 'plus', tip, disabled: !st.ok })) g.modal = 'rent';
    y += 22;
  }
  for (let i = g.floors.length - 1; i >= 0; i--) {
    const people = g.agents.filter((a) => a.present && a.floor === i).length;
    if (button(3, y, 24, 18, FLOORS[i].label, { variant: 'ghost', active: g.view === i, tip: `${FLOORS[i].label} · ${people} here · key ${i + 1}` })) setView(g, i);
    y += 20;
  }
  const zy = TOP_H + h - 46;
  if (zy > y + 4) {
    if (button(3, zy, 24, 18, '', { variant: 'ghost', icon: 'plus', tip: 'Zoom in (mouse wheel)' })) zoomBy(g, 1);
    if (button(3, zy + 22, 24, 18, '–', { variant: 'ghost', tip: 'Zoom out (mouse wheel)' })) zoomBy(g, -1);
  }
}

function zoomBy(g, dir) {
  const c = cam(g), v = VIEW();
  const z = Math.max(1, Math.min(3, c.z + dir));
  if (z === c.z) return;
  const cx = c.x + v.w / c.z / 2, cy = c.y + v.h / c.z / 2;
  c.z = z; c.x = cx - v.w / z / 2; c.y = cy - v.h / z / 2;
  clampCam(g);
}

function bottomBar(app) {
  const g = app.game;
  const y = H - BOTTOM_H;
  block(0, y, W, BOTTOM_H);
  D.rect(0, y, W, BOTTOM_H, C.surface);
  D.rect(0, y, W, 1, C.border);
  const full = NAV.reduce((s, n) => s + 18 + D.tw(n[1]) + 8 + 3, 0) + 70;
  const compact = full > W;
  let x = 6;
  for (const [id, lab, ic, k] of NAV) {
    const w = compact ? 22 : 18 + D.tw(lab) + 8;
    const open = (g.windows || []).some((ww) => ww.id === id);
    if (button(x, y + 4, w, 16, compact ? '' : lab, { variant: 'ghost', icon: ic, active: open, hl: isHl(g, 'nav-' + id), tip: `${lab} (${k})` })) toggleWin(g, id);
    x += w + 3;
  }
  if (button(W - 64, y + 4, 58, 16, 'Menu', { variant: 'ghost', icon: 'menu', tip: 'Pause menu (Esc)' })) g.modal = 'pause';
}

export function toasts(app) {
  const g = app.game;
  const ctx = D.getCtx();
  const now = performance.now();
  g.toasts = g.toasts.filter((t) => now - t.born < 8000);
  const v = VIEW();
  const w = Math.min(196, v.w - 20);
  const x = v.x + 6;
  let y = TOP_H + 4;
  for (const t of g.toasts) {
    const age = now - t.born;
    const a = age > 7000 ? 1 - (age - 7000) / 1000 : Math.min(1, age / 150);
    const lines = D.wrap(t.text, w - 22);
    const h = lines.length * 11 + 9;
    ctx.globalAlpha = Math.max(0, a);
    D.card(x, y, w, h, C.surface, C.border);
    D.rect(x + 5, y + 5, 3, h - 10, (KIND[t.kind] || KIND.neutral)[1]);
    lines.forEach((l, i) => D.text(l, x + 13, y + 5 + i * 11, C.ink));
    ctx.globalAlpha = 1;
    y += h + 3;
  }
}

function tutorialCard(app) {
  const g = app.game;
  const t = g.tut;
  if (!t || !t.on || g.modal) return;
  const s = STEPS[t.step];
  if (!s) return;
  const v = VIEW();
  const w = Math.min(200, v.w - 20);
  const lines = D.wrap(s.text, w - 18);
  const extra = isHl(g, 'map') ? D.wrap('Now click a free floor tile. Green means it fits.', w - 18) : [];
  const h = 46 + (lines.length + extra.length) * 11 + 12;
  const x = v.x + 6, y = v.y + v.h - h - 6;
  block(x, y, w, h);
  D.card(x, y, w, h, C.surface, C.ink);
  label(`Getting started ${t.step + 1}/${STEPS.length}`, x + 9, y + 8);
  if (button(x + w - 36, y + 5, 30, 13, 'Skip', { variant: 'ghost', tip: 'Turn the tutorial off.' })) t.on = false;
  D.text(D.fit(s.title, w - 18), x + 9, y + 24, C.ink);
  lines.forEach((l, i) => D.text(l, x + 9, y + 38 + i * 11, C.inkSoft));
  extra.forEach((l, i) => D.text(l, x + 9, y + 38 + (lines.length + i) * 11, C.yellow));
  const seg = (w - 18) / STEPS.length;
  for (let i = 0; i < STEPS.length; i++) D.rect(x + 9 + i * seg, y + h - 9, seg - 2, 3, i < t.step ? C.ink : i === t.step ? '#D9A400' : '#E6E3DD');
}

function popup(app) {
  const g = app.game;
  if (g.selected == null) return;
  const a = g.agents.find((b) => b.id === g.selected);
  if (!a) { g.selected = null; return; }
  if (!a.present || a.floor !== g.view) return;
  const s = agentScreen(g, a, app.alpha);
  const v = VIEW();
  const w = 150;
  const h = a.isPlayer ? 54 : 84;
  let x = Math.round(s.x + 8 * s.z - w / 2);
  x = Math.max(v.x + 2, Math.min(v.x + v.w - w - 2, x));
  let y = Math.round(s.y - h - 6);
  if (y < v.y + 2) y = Math.round(s.y + 18 * s.z);
  block(x, y, w, h);
  D.card(x, y, w, h, C.surface, C.border);
  const [mi, mc] = moodInfo(a.mood);
  D.icon(mi, x + w - 15, y + 7, mc);
  D.text(D.fit(a.name + (a.isPlayer ? ' (you)' : ''), w - 30), x + 8, y + 7, C.ink);
  const tm = teamOf(g, a);
  D.text(D.fit(a.isPlayer ? 'Founder & CEO' : `${LEVELS[a.level]} · ${tm ? tm.name : 'no team'}`, w - 16), x + 8, y + 18, C.muted);
  const t = taskOf(g, a);
  D.text(D.fit(a.isPlayer ? a.activity : t ? `${t.part.skill} on ${t.job.name}` : a.activity, w - 16), x + 8, y + 30, !a.isPlayer && !t ? C.yellow : C.inkSoft);
  if (a.isPlayer) {
    if (button(x + 8, y + h - 18, w - 16, 12, 'Hide')) g.selected = null;
    return;
  }
  const bw = (w - 16 - 4) / 2;
  for (const [k, lx] of [['energy', x + 8], ['stress', x + 8 + bw + 4]]) {
    D.text(k === 'energy' ? 'Energy' : 'Stress', lx, y + 42, C.muted);
    bar(lx, y + 52, bw, 3, a.needs[k] / 100, needColor(k, a.needs[k]));
  }
  const b3 = Math.floor((w - 16 - 6) / 3);
  if (button(x + 8, y + h - 20, b3, 13, 'Profile')) openWin(g, 'profile', a.id);
  if (button(x + 8 + b3 + 3, y + h - 20, b3, 13, 'Break', { tip: '30 minute break' })) sendBreak(g, a, 30);
  if (button(x + 8 + (b3 + 3) * 2, y + h - 20, b3, 13, 'Home', { tip: 'Send home for today' })) sendHome(g, a);
}

function dim() {
  const ctx = D.getCtx();
  block(0, 0, W, H);
  ctx.globalAlpha = 0.28; D.rect(0, 0, W, H, C.ink); ctx.globalAlpha = 1;
}

function modalCard(title, body, w, extraH) {
  w = Math.min(w, W - 24);
  const lines = D.wrap(body, w - 32);
  const h = Math.min(H - 16, 44 + lines.length * 11 + extraH);
  const x = Math.round((W - w) / 2), y = Math.round((H - h) / 2);
  D.card(x, y, w, h, C.surface, C.border);
  D.text(title, x + 16, y + 14, C.ink, 2);
  lines.forEach((l, i) => D.text(l, x + 16, y + 38 + i * 11, C.inkSoft));
  return { x, y, w, h, by: y + 44 + lines.length * 11 };
}

function meetingModal(app) {
  const g = app.game;
  const m = g.meeting;
  if (!m) { g.modal = null; return; }
  const def = topicDef(m.key);
  const w = Math.min(420, W - 16), h = Math.min(H - 12, 330);
  const x = Math.round((W - w) / 2), y = Math.round((H - h) / 2);
  D.card(x, y, w, h, C.surface, C.border);
  D.text(`Meeting: ${def.name}`, x + 14, y + 12, C.ink, 2);
  tag(x + w - 14 - D.tw(`ACTIONS ${m.actions}`) - 8, y + 14, `Actions ${m.actions}`, m.actions ? 'blue' : 'neutral');
  const cur = m.current >= 0 ? def.options[m.current].label : 'none';
  D.text(D.fit(`Now: ${cur}. ${def.desc}`, w - 28), x + 14, y + 34, C.muted);
  // options: propose + support
  const counts = supportCounts(g);
  const total = counts.reduce((s, v) => s + v, 0) || 1;
  const ow = Math.floor((w - 28 - (def.options.length - 1) * 4) / def.options.length);
  def.options.forEach((o, i) => {
    const ox = x + 14 + i * (ow + 4);
    if (button(ox, y + 48, ow, 15, D.fit(o.label, ow - 8), { active: m.proposal === i, tip: 'Your proposal. Persuasion pulls people toward it.' })) setProposal(g, i);
    bar(ox, y + 66, ow, 3, counts[i] / total, m.proposal === i ? C.green : C.borderStrong);
    D.textC(`${counts[i]} for`, ox + ow / 2, y + 72, C.muted);
  });
  const staff = m.participants.map((id) => byId(g, id)).filter((a) => a && !a.isPlayer);
  const listTop = y + 86, listH = h - 86 - 44;
  scrollArea('meeting', x + 6, listTop, w - 12, listH, (top) => {
    let yy = top;
    for (const a of staff) {
      const s = m.stances[a.id];
      const agrees = s === m.proposal;
      D.getCtx().drawImage(charSprites(a.look).down[0], x + 10, yy + 2);
      D.text(D.fit(firstName(a), 60), x + 30, yy + 2, C.ink);
      const st = def.options[s].label;
      tag(x + 30, yy + 13, D.fit(st, 70), agrees ? 'green' : 'red');
      const bx = x + w - 14 - 3 * 50;
      D.text(D.fit(`"${statement(g, a)}"`, bx - x - 120), x + 112, yy + 7, C.muted);
      if (!agrees && m.actions > 0) {
        if (button(bx, yy + 4, 47, 14, 'Persuade', { tip: 'Chance depends on how much they like you.' })) act(g, 'persuade', a.id);
        if (button(bx + 50, yy + 4, 47, 14, 'Promise', { tip: 'Always works. You owe them a raise within 10 days.' })) act(g, 'promise', a.id);
        if (button(bx + 100, yy + 4, 47, 14, 'Snacks', { tip: '$50. Works on snack lovers. Insults everyone else.' })) act(g, 'snacks', a.id);
      } else if (agrees) D.textR(m.convinced[a.id] ? 'convinced' : m.overruled[a.id] ? 'overruled' : 'agrees', x + w - 14, yy + 7, m.overruled[a.id] ? C.red : C.green);
      yy += 26;
    }
    return yy - top;
  });
  const by = y + h - 36;
  D.rect(x + 10, by - 6, w - 20, 1, C.border);
  if (button(x + 14, by, 74, 16, 'Pull rank', { variant: 'danger', disabled: m.actions <= 0, tip: 'Everyone falls in line. Everyone who disagreed resents it.' })) act(g, 'rank');
  let dx = x + 94;
  const dw = Math.floor((w - 94 - 14 - (def.options.length - 1) * 4) / def.options.length);
  def.options.forEach((o, i) => {
    if (button(dx, by, dw, 16, D.fit(`Decide: ${o.label}`, dw - 8), { variant: i === m.proposal ? 'primary' : 'secondary', tip: 'Ends the meeting. People who wanted something else lose mood and loyalty.' })) decide(g, i);
    dx += dw + 4;
  });
}

function modal(app) {
  const g = app.game;
  if (!g.modal) return;
  dim();
  if (g.modal === 'welcome') {
    const p = g.agents.find((a) => a.isPlayer);
    const m = modalCard(`Welcome, ${p.name.split(' ')[0]}`,
      `You just founded ${g.company} and rented a whole empty floor. You are the boss: you never work yourself. Build desks, hire people, form teams, hand out tasks, set the rules and keep everyone from quitting.`, 320, 58);
    if (button(m.x + 16, m.by, m.w - 32, 18, 'Show me how (recommended)', { variant: 'primary', kbd: 'Enter' }) || key('Enter')) { startTutorial(g, true); g.modal = null; }
    if (button(m.x + 16, m.by + 22, m.w - 32, 18, "I'll figure it out")) { startTutorial(g, false); g.modal = null; }
  } else if (g.modal === 'meeting') {
    meetingModal(app);
  } else if (g.modal === 'event') {
    const view = g.event && eventView(g, g.event);
    if (!view) { g.event = null; g.modal = null; return; }
    const m = modalCard(view.title, view.text, 330, view.options.length * 22 + 10);
    tag(m.x + m.w - 16 - D.tw('DECISION') - 8, m.y + 16, 'Decision', 'yellow');
    view.options.forEach((o, i) => {
      if (button(m.x + 16, m.by + 4 + i * 22, m.w - 32, 18, D.fit(o.label, m.w - 48), { variant: i === 0 ? 'primary' : 'secondary', tip: o.tip, disabled: o.disabled })) {
        g.event = null; g.modal = null; o.run(g);
      }
    });
  } else if (g.modal === 'rent') {
    const st = rentStatus(g);
    if (!st.ok) { g.modal = null; return; }
    const m = modalCard(`Rent ${st.def.label}?`, `A fresh, empty floor. Deposit ${fmtMoney(st.deposit)} now, then ${fmtMoney(st.def.rent)} more rent every month. People take the elevator between floors.`, 290, 30);
    if (button(m.x + 16, m.by, 120, 18, 'Rent it', { variant: 'primary' })) { rentFloor(g); g.modal = null; setView(g, g.floors.length - 1); }
    if (button(m.x + 142, m.by, m.w - 158, 18, 'Not yet')) g.modal = null;
  } else if (g.modal === 'pause') {
    const m = modalCard('Paused', 'Saves stay in this browser. The game also autosaves every morning.', 280, 186);
    let by = m.by;
    if (button(m.x + 16, by, m.w - 32, 18, 'Resume', { variant: 'primary', kbd: 'Esc' })) g.modal = null;
    by += 24;
    for (const s of ['1', '2', '3']) {
      if (button(m.x + 16, by, m.w - 32, 16, D.fit(`Save to slot ${s}: ${slotLabel(s)}`, m.w - 48), { align: 'left' })) { if (saveGame(g, s)) { g.modal = null; sfx('money'); g.toasts.push({ text: `Saved to slot ${s}.`, kind: 'green', born: performance.now() }); } }
      by += 19;
    }
    by += 5;
    const bw = Math.floor((m.w - 32 - 6) / 3);
    if (button(m.x + 16, by, bw, 16, `Size ${app.size}`, { tip: 'UI size S, M, L (keys + and -)' })) app.cycleSize();
    if (button(m.x + 16 + bw + 3, by, bw, 16, soundOn() ? 'Sound on' : 'Sound off')) setSound(!soundOn());
    if (button(m.x + 16 + (bw + 3) * 2, by, bw, 16, musicEnabled() ? 'Music on' : 'Music off')) setMusicOn(!musicEnabled());
    by += 24;
    if (button(m.x + 16, by, m.w - 32, 18, 'Quit to main menu', { variant: 'danger', tip: 'Unsaved progress since this morning is lost.' })) { app.scene = 'menu'; app.game = null; }
  } else if (g.modal === 'investor') {
    const m = modalCard('Out of money', `A man in a fleece vest offers $8,000 for "a modest 40% stake" in ${g.company}. He would like to be called Visionary.`, 300, 30);
    if (button(m.x + 16, m.by, 130, 18, 'Take the money', { variant: 'primary' })) { g.money += 8000; g.investorUsed = true; g.modal = null; sfx('money'); }
    if (button(m.x + 152, m.by, m.w - 168, 18, 'Refuse', { variant: 'danger', tip: 'Game over.' })) g.modal = 'gameover';
  } else if (g.modal === 'gameover') {
    const m = modalCard('Bankrupt', `The bank took the furniture. ${g.company} delivered ${g.stats.jobsDone} jobs and earned ${fmtMoney(g.stats.earned)} along the way.`, 300, 30);
    if (button(m.x + 16, m.by, m.w - 32, 18, 'Back to main menu', { variant: 'primary' })) { app.scene = 'menu'; app.game = null; }
  }
}

const WIN_DRAW = { jobs: jobsWin, build: buildWin, finance: financeWin, staff: staffWin, profile: profileWin, teams: teamsWin, policies: policiesWin, meetings: meetingsWin, goals: goalsWin };

export function drawGame(app) {
  const g = app.game;
  if (!g.cam) {
    const v = VIEW();
    cam(g).z = v.h >= 340 && v.w >= 420 ? 2 : 1;
    centerOnTile(g, 8, 6);
  }
  if (!g.modal && g.event) g.modal = 'event';
  if (!g.modal && g.events.length) { g.event = g.events.shift(); g.modal = 'event'; sfx('blip'); }
  updateTutorial(g);
  setMusic(g.modal === 'meeting' || g.modal === 'event' ? 'tense' : 'office');
  if (!g.modal && !ui.focus) {
    if (key(' ')) g.paused = !g.paused;
    for (const [id, , , k] of NAV) if (key(k.toLowerCase())) toggleWin(g, id);
    for (let i = 0; i < 7; i++) if (key(String(i + 1))) setView(g, i);
    if (key('Escape')) {
      const tw = topWin(g);
      if (g.tool) g.tool = null;
      else if (g.selected != null) g.selected = null;
      else if (tw) closeWin(g, tw.id);
      else g.modal = 'pause';
    }
    const sp = 5;
    if (input.held.has('ArrowLeft')) pan(g, -sp, 0);
    if (input.held.has('ArrowRight')) pan(g, sp, 0);
    if (input.held.has('ArrowUp')) pan(g, 0, -sp);
    if (input.held.has('ArrowDown')) pan(g, 0, sp);
  } else if (g.modal === 'pause' && key('Escape')) g.modal = null;

  setLayer(0);
  handleWorld(app);
  drawWorld(app);
  setLayer(1);
  tutorialCard(app);
  topBar(app);
  floorBar(app);
  bottomBar(app);
  if (!app.game) return;
  drawWindows(app, (win, x, y, w, h) => WIN_DRAW[win.kind](app, win, x, y, w, h));
  setLayer(60);
  toasts(app);
  popup(app);
  setLayer(100);
  modal(app);
}
