// In-game screen: top bar, floor bar, bottom bar, toasts, tutorial card, popup, modals.
import { C, W, H, TOP_H, BOTTOM_H, LEFT_W, KIND, EXPAND_REP, VIEW } from '../config.js';
import { DATA } from '../data.js';
import * as D from '../render/draw.js';
import { button, setLayer, block, key, setTooltip, hover, input, tag, label } from './ui.js';
import { drawWorld, handleWorld, agentScreen } from '../render/world.js';
import { pan, clampCam, centerOnTile, cam } from '../render/camera.js';
import { clock, WEEKDAYS, hhmm, dateLabel } from '../sim/time.js';
import { nightMultiplier } from '../sim/tick.js';
import { fmtMoney } from '../systems/economy.js';
import { soundOn, setSound, sfx } from '../audio.js';
import { drawPanel, PANEL_W, moodInfo } from './panels.js';
import { STEPS, isHl, startTutorial, updateTutorial } from '../systems/tutorial.js';

function togglePanel(g, id) {
  g.panel = g.panel === id ? null : id;
  if (g.panel !== 'build') g.tool = null;
  if (id === 'staff') g.staffView = null;
}

function stat(x, iconName, text, color, tip) {
  D.icon(iconName, x, 6, C.muted);
  D.text(text, x + 11, 6, color);
  const w = 11 + D.tw(text);
  if (hover(x - 2, 0, w + 4, TOP_H)) setTooltip(tip);
  return x + w + 12;
}

function topBar(app) {
  const g = app.game;
  block(0, 0, W, TOP_H);
  D.rect(0, 0, W, TOP_H, C.surface);
  D.rect(0, TOP_H - 1, W, 1, C.border);
  let x = 6;
  D.card(x, 3, 12, 12, g.color, g.color);
  D.textC((g.company[0] || '?').toUpperCase(), x + 6, 5, '#FFFFFF');
  x += 18;
  if (W >= 600) {
    const name = D.fit(g.company, W >= 720 ? 120 : 80);
    D.text(name, x, 6, C.ink);
    x += D.tw(name) + 10;
    D.rect(x, 4, 1, 10, C.border); x += 10;
  }
  const c = clock(g.time);
  const date = W >= 560 ? dateLabel(g.time) : `${WEEKDAYS[c.weekday]} W${c.week} ${hhmm(c.minute)}`;
  x = stat(x, 'coin', fmtMoney(g.money), g.money < 0 ? C.red : C.ink, 'Balance. Salaries and rent are due every 4 weeks.');
  x = stat(x, 'star', `Rep ${Math.floor(g.rep)}`, C.ink, 'Reputation 0 to 100. Brings bigger jobs and better applicants.');
  x = stat(x, 'people', String(g.agents.length), C.ink, 'Headcount, including you.');
  x = stat(x, 'cal', date, C.ink, 'The workday runs 9:00 to 18:00. Nights fast-forward when the office is empty.');
  const right = W - 6 - 16 - 6 - 80;
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

function floorBar(app) {
  const g = app.game;
  const h = H - TOP_H - BOTTOM_H;
  block(0, TOP_H, LEFT_W, h);
  D.rect(0, TOP_H, LEFT_W, h, C.surface);
  D.rect(LEFT_W - 1, TOP_H, 1, h, C.border);
  let y = TOP_H + 8;
  button(3, y, 24, 20, '2F', { variant: 'ghost', disabled: true, tip: 'More floors arrive in M7 (needs Rep 30).' });
  y += 24;
  if (button(3, y, 24, 20, '1F', { variant: 'ghost', active: true, tip: `Floor 1 · ${g.company}. Click to center the view.` })) centerOnTile(g, 6, 5);
  y += 24;
  D.rect(6, y, 18, 1, C.border);
  y += 6;
  const tip = g.expanded ? 'More floors arrive in M7.' : `Rent the rest of this floor (needs Rep ${EXPAND_REP}). Opens Finance.`;
  if (button(3, y, 24, 20, '', { variant: 'ghost', icon: 'plus', tip, disabled: g.expanded })) togglePanel(g, 'finance');
  // zoom
  const zy = TOP_H + h - 50;
  if (button(3, zy, 24, 20, '', { variant: 'ghost', icon: 'plus', tip: 'Zoom in (mouse wheel)' })) { const v = VIEW(); zoomBy(g, 1, v); }
  if (button(3, zy + 24, 24, 20, '–', { variant: 'ghost', tip: 'Zoom out (mouse wheel)' })) { const v = VIEW(); zoomBy(g, -1, v); }
}

function zoomBy(g, dir, v) {
  const c = cam(g);
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
  const compact = W < 560;
  const items = [
    ['jobs', 'Jobs', 'case', 'J'], ['staff', 'Staff', 'people', 'S'], ['build', 'Build', 'hammer', 'B'],
    ['meetings', 'Meetings', 'chat', null], ['finance', 'Finance', 'chart', 'F'],
  ];
  let x = 6;
  for (const [id, lab, ic, k] of items) {
    const kk = compact ? null : k;
    const w = 18 + D.tw(lab) + (kk ? D.tw(kk) + 10 : 0) + 8;
    const dis = id === 'meetings';
    if (button(x, y + 4, w, 16, lab, { variant: 'ghost', icon: ic, kbd: kk, active: g.panel === id, disabled: dis, hl: isHl(g, 'nav-' + id), tip: dis ? 'Meetings are the next milestone (M6).' : null })) togglePanel(g, id);
    x += w + 3;
  }
  if (button(W - 64, y + 4, 58, 16, 'Menu', { variant: 'ghost', icon: 'menu', tip: 'Pause menu (Esc)' })) g.modal = 'pause';
  let hint = null;
  if (g.tool) {
    if (g.tool.kind === 'furn') { const d = DATA.furnById[g.tool.id]; hint = `Placing ${d.name} · ${fmtMoney(d.price)}`; }
    else hint = { wall: 'Drag to draw walls', door: 'Click an inner wall', sell: 'Click to sell or remove' }[g.tool.kind];
  }
  if (hint && W - 72 - D.tw(hint) > x + 8) D.textR(hint, W - 72, y + 9, C.muted);
}

function toasts(app) {
  const g = app.game;
  const ctx = D.getCtx();
  const now = performance.now();
  g.toasts = g.toasts.filter((t) => now - t.born < 8000);
  const right = g.panel ? W - panelWidth(g) - 12 : W - 6;
  const w = Math.min(200, right - LEFT_W - 12);
  let y = TOP_H + 6;
  for (const t of g.toasts) {
    const age = now - t.born;
    const a = age > 7000 ? 1 - (age - 7000) / 1000 : Math.min(1, age / 150);
    const lines = D.wrap(t.text, w - 22);
    const h = lines.length * 11 + 9;
    const x = right - w;
    ctx.globalAlpha = Math.max(0, a);
    D.card(x, y, w, h, C.surface, C.border);
    D.rect(x + 5, y + 5, 3, h - 10, (KIND[t.kind] || KIND.neutral)[1]);
    lines.forEach((l, i) => D.text(l, x + 13, y + 5 + i * 11, C.ink));
    ctx.globalAlpha = 1;
    y += h + 4;
  }
}

function tutorialCard(app) {
  const g = app.game;
  const t = g.tut;
  if (!t || !t.on || g.modal) return;
  const s = STEPS[t.step];
  if (!s) return;
  const v = VIEW();
  const w = Math.min(196, v.w - 20);
  const x = v.x + 6;
  let y = v.y + 6;
  const lines = D.wrap(s.text, w - 18);
  const extra = isHl(g, 'map') ? D.wrap('Now click a free floor tile in your room. Green means it fits.', w - 18) : [];
  const h = 46 + (lines.length + extra.length) * 11 + 12;
  y = v.y + v.h - h - 6; // bottom-left keeps the starting room visible
  block(x, y, w, h);
  D.card(x, y, w, h, C.surface, C.ink);
  label(`Getting started ${t.step + 1}/${STEPS.length}`, x + 9, y + 8);
  if (button(x + w - 36, y + 5, 30, 13, 'Skip', { variant: 'ghost', tip: 'Turn the tutorial off.' })) t.on = false;
  D.text(D.fit(s.title, w - 18), x + 9, y + 24, C.ink);
  lines.forEach((l, i) => D.text(l, x + 9, y + 38 + i * 11, C.inkSoft));
  extra.forEach((l, i) => D.text(l, x + 9, y + 38 + (lines.length + i) * 11, C.yellow));
  const py = y + h - 9;
  const seg = (w - 18) / STEPS.length;
  for (let i = 0; i < STEPS.length; i++) D.rect(x + 9 + i * seg, py, seg - 2, 3, i < t.step ? C.ink : i === t.step ? '#D9A400' : '#E6E3DD');
}

function popup(app) {
  const g = app.game;
  if (g.selected == null) return;
  const a = g.agents.find((b) => b.id === g.selected);
  if (!a) { g.selected = null; return; }
  if (!a.present) return;
  const s = agentScreen(g, a, app.alpha);
  const v = VIEW();
  const w = 140;
  const thought = a.thought && a.thoughtT > 0 ? D.wrap('"' + a.thought + '"', w - 16).slice(0, 2) : [];
  const h = 62 + thought.length * 11;
  let x = Math.round(s.x + 8 * s.z - w / 2);
  x = Math.max(v.x + 2, Math.min(v.x + v.w - w - 2, x));
  let y = Math.round(s.y - h - 6);
  if (y < v.y + 2) y = Math.round(s.y + 18 * s.z);
  block(x, y, w, h);
  D.card(x, y, w, h, C.surface, C.border);
  const [mi, mc] = moodInfo(a.mood);
  D.icon(mi, x + w - 15, y + 7, mc);
  D.text(D.fit(a.name + (a.isPlayer ? ' (you)' : ''), w - 30), x + 8, y + 7, C.ink);
  D.text(D.fit(a.role, w - 16), x + 8, y + 18, C.muted);
  D.text(D.fit(a.activity, w - 16), x + 8, y + 30, C.inkSoft);
  thought.forEach((l, i) => D.text(l, x + 8, y + 41 + i * 11, C.muted));
  if (button(x + 8, y + h - 18, w - 16, 12, 'Open profile')) { g.panel = 'staff'; g.staffView = a.id; g.tool = null; }
}

function dim() {
  const ctx = D.getCtx();
  block(0, 0, W, H);
  ctx.globalAlpha = 0.28; D.rect(0, 0, W, H, C.ink); ctx.globalAlpha = 1;
}

function modalCard(title, body, w, extraH) {
  w = Math.min(w, W - 24);
  const lines = D.wrap(body, w - 32);
  const h = 44 + lines.length * 11 + extraH;
  const x = Math.round((W - w) / 2), y = Math.round((H - h) / 2);
  D.card(x, y, w, h, C.surface, C.border);
  D.text(title, x + 16, y + 14, C.ink, 2);
  lines.forEach((l, i) => D.text(l, x + 16, y + 38 + i * 11, C.inkSoft));
  return { x, y, w, h, by: y + 44 + lines.length * 11 };
}

function modal(app) {
  const g = app.game;
  if (!g.modal) return;
  dim();
  if (g.modal === 'welcome') {
    const p = g.agents.find((a) => a.isPlayer);
    const m = modalCard(`Welcome, ${p.name.split(' ')[0]}`,
      `You just founded ${g.company}. Right now it's you, one desk and a small rented room. Take jobs, earn money, hire people and grow the company floor by floor. Your staff will have opinions. Lots of them.`, 300, 58);
    if (button(m.x + 16, m.by, m.w - 32, 18, 'Show me how (recommended)', { variant: 'primary', kbd: 'Enter' }) || key('Enter')) { startTutorial(g, true); g.modal = null; }
    if (button(m.x + 16, m.by + 22, m.w - 32, 18, "I'll figure it out")) { startTutorial(g, false); g.modal = null; }
  } else if (g.modal === 'event' && g.event) {
    const ev = g.event;
    const m = modalCard(ev.title, ev.text, 320, ev.options.length * 22 + 10);
    tag(m.x + m.w - 16 - D.tw('DECISION') - 8, m.y + 16, 'Decision', 'yellow');
    ev.options.forEach((o, i) => {
      if (button(m.x + 16, m.by + 4 + i * 22, m.w - 32, 18, o.label, { variant: i === 0 ? 'primary' : 'secondary', tip: o.tip })) {
        o.run(g); g.event = null; g.modal = null;
      }
    });
  } else if (g.modal === 'pause') {
    const m = modalCard('Paused', `UI size: ${app.size}. Press + or - to change it at any time.`, 230, 100);
    if (button(m.x + 16, m.by, m.w - 32, 18, 'Resume', { variant: 'primary', kbd: 'Esc' })) g.modal = null;
    if (button(m.x + 16, m.by + 22, m.w - 32, 18, `UI size: ${app.size}`, { tip: 'Cycles S, M, L.' })) app.cycleSize();
    if (button(m.x + 16, m.by + 44, m.w - 32, 18, soundOn() ? 'Sound: on' : 'Sound: off', { icon: soundOn() ? 'sound' : 'mute' })) setSound(!soundOn());
    if (button(m.x + 16, m.by + 66, m.w - 32, 18, 'Quit to main menu', { variant: 'danger', tip: 'There is no saving yet. The company is lost.' })) { app.scene = 'menu'; app.game = null; }
  } else if (g.modal === 'investor') {
    const m = modalCard('Out of money', `A man in a fleece vest offers $8,000 for "a modest 40% stake" in ${g.company}. He would like to be called Visionary.`, 300, 30);
    if (button(m.x + 16, m.by, 130, 18, 'Take the money', { variant: 'primary' })) { g.money += 8000; g.investorUsed = true; g.modal = null; sfx('money'); }
    if (button(m.x + 152, m.by, m.w - 168, 18, 'Refuse', { variant: 'danger', tip: 'Game over.' })) g.modal = 'gameover';
  } else if (g.modal === 'gameover') {
    const m = modalCard('Bankrupt', `The bank took the furniture. ${g.company} delivered ${g.stats.jobsDone} jobs and earned ${fmtMoney(g.stats.earned)} along the way.`, 300, 30);
    if (button(m.x + 16, m.by, m.w - 32, 18, 'Back to main menu', { variant: 'primary' })) { app.scene = 'menu'; app.game = null; }
  }
}

export const panelWidth = (g) => Math.min(PANEL_W[g.panel] || 250, W - LEFT_W - 50);

export function drawGame(app) {
  const g = app.game;
  if (!g.cam) {
    const v = VIEW();
    cam(g).z = v.h >= 340 && v.w >= 420 ? 2 : 1; // start zoomed in on the small room when there is space
    centerOnTile(g, 6, 5);
  }
  if (!g.modal && g.events.length) { g.event = g.events.shift(); g.modal = 'event'; sfx('blip'); }
  updateTutorial(g);
  if (!g.modal) {
    if (key(' ')) g.paused = !g.paused;
    if (key('j')) togglePanel(g, 'jobs');
    if (key('s')) togglePanel(g, 'staff');
    if (key('b')) togglePanel(g, 'build');
    if (key('f')) togglePanel(g, 'finance');
    if (key('Escape')) {
      if (g.tool) g.tool = null;
      else if (g.panel) g.panel = null;
      else if (g.selected != null) g.selected = null;
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
  topBar(app);
  floorBar(app);
  bottomBar(app);
  toasts(app);
  tutorialCard(app);
  if (!app.game) return;
  setLayer(2);
  if (g.panel) {
    const w = panelWidth(g);
    drawPanel(app, W - w - 4, TOP_H + 4, w, H - TOP_H - BOTTOM_H - 8);
  }
  setLayer(3);
  popup(app);
  setLayer(5);
  modal(app);
}
