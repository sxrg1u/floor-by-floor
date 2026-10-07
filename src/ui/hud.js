// In-game screen: top bar, floor bar, bottom bar, toasts, character popup, modals.
import { C, W, H, TOP_H, BOTTOM_H, LEFT_W, WORLD_X, WORLD_Y, MAP_W, TILE, KIND, EXPAND_REP } from '../config.js';
import { DATA } from '../data.js';
import * as D from '../render/draw.js';
import { button, tag, setLayer, block, key, setTooltip, hover, ui } from './ui.js';
import { drawWorld, handleWorld, agentScreen } from '../render/world.js';
import { dateLabel } from '../sim/time.js';
import { nightMultiplier } from '../sim/tick.js';
import { fmtMoney } from '../systems/economy.js';
import { soundOn, setSound, sfx } from '../audio.js';
import { drawPanel, PANEL_W, moodInfo } from './panels.js';
import { firstName } from '../sim/agents.js';

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
  return x + w + 14;
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
  const name = D.fit(g.company, 96);
  D.text(name, x, 6, C.ink);
  x += D.tw(name) + 10;
  D.rect(x, 4, 1, 10, C.border); x += 10;
  x = stat(x, 'coin', fmtMoney(g.money), g.money < 0 ? C.red : C.ink, 'Balance. Salaries and rent are due every 4 weeks.');
  x = stat(x, 'star', `Rep ${Math.floor(g.rep)}`, C.ink, 'Reputation 0 to 100. Brings bigger jobs and better applicants.');
  x = stat(x, 'people', String(g.agents.length), C.ink, 'Headcount, including you.');
  x = stat(x, 'cal', dateLabel(g.time), C.ink, 'The workday runs 9:00 to 18:00. Nights fast-forward when the office is empty.');
  if (g.paused) tag(x - 4, 4, 'Paused', 'yellow');
  else if (nightMultiplier(g) > 1) tag(x - 4, 4, 'Night', 'blue');

  let rx = W - 6 - 16;
  if (button(rx, 2, 16, 14, '', { variant: 'ghost', icon: soundOn() ? 'sound' : 'mute', tip: 'Sound on/off' })) setSound(!soundOn());
  rx -= 6;
  const speeds = [[4, '4x'], [2, '2x'], [1, '1x']];
  for (const [s, lab] of speeds) {
    rx -= 20;
    if (button(rx, 2, 20, 14, lab, { variant: 'ghost', active: !g.paused && g.speed === s, tip: `Speed ${lab}` })) { g.speed = s; g.paused = false; }
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
  button(3, y, 24, 20, '1F', { variant: 'ghost', active: true, tip: `Floor 1 · ${g.company}` });
  y += 24;
  D.rect(6, y, 18, 1, C.border);
  y += 6;
  const tip = g.expanded ? 'More floors arrive in M7.' : `Rent the rest of this floor (needs Rep ${EXPAND_REP}). Opens Finance.`;
  if (button(3, y, 24, 20, '', { variant: 'ghost', icon: 'plus', tip, disabled: g.expanded })) togglePanel(g, 'finance');
}

function bottomBar(app) {
  const g = app.game;
  const y = H - BOTTOM_H;
  block(0, y, W, BOTTOM_H);
  D.rect(0, y, W, BOTTOM_H, C.surface);
  D.rect(0, y, W, 1, C.border);
  const items = [
    ['jobs', 'Jobs', 'case', 'J'], ['staff', 'Staff', 'people', 'S'], ['build', 'Build', 'hammer', 'B'],
    ['meetings', 'Meetings', 'chat', null], ['finance', 'Finance', 'chart', 'F'],
  ];
  let x = 6;
  for (const [id, lab, ic, k] of items) {
    const w = 18 + D.tw(lab) + (k ? D.tw(k) + 10 : 0) + 8;
    const dis = id === 'meetings';
    if (button(x, y + 4, w, 16, lab, { variant: 'ghost', icon: ic, kbd: k, active: g.panel === id, disabled: dis, tip: dis ? 'Meetings are the next milestone (M6).' : null })) togglePanel(g, id);
    x += w + 4;
  }
  if (button(W - 70, y + 4, 64, 16, 'Menu', { variant: 'ghost', icon: 'menu', tip: 'Pause menu (Esc)' })) g.modal = 'pause';

  // context hint
  let hint = null;
  if (g.tool) {
    if (g.tool.kind === 'furn') { const d = DATA.furnById[g.tool.id]; hint = `Placing ${d.name} · ${fmtMoney(d.price)}`; }
    else hint = { wall: 'Drag to draw walls', door: 'Click an inner wall', sell: 'Click to sell or remove' }[g.tool.kind];
  }
  if (hint) { D.textR(hint, W - 80, y + 9, C.muted); }
}

function toasts(app) {
  const g = app.game;
  const ctx = D.getCtx();
  const now = performance.now();
  g.toasts = g.toasts.filter((t) => now - t.born < 7000);
  const right = g.panel ? W - PANEL_W[g.panel] - 12 : W - 6;
  let y = TOP_H + 6;
  for (const t of g.toasts) {
    const age = now - t.born;
    const a = age > 6000 ? 1 - (age - 6000) / 1000 : Math.min(1, age / 150);
    const w = 192;
    const lines = D.wrap(t.text, w - 22);
    const h = lines.length * 11 + 9;
    const x = right - w;
    ctx.globalAlpha = Math.max(0, a);
    D.card(x, y, w, h, C.surface, C.border);
    const fg = (KIND[t.kind] || KIND.neutral)[1];
    D.rect(x + 5, y + 5, 3, h - 10, fg);
    lines.forEach((l, i) => D.text(l, x + 13, y + 5 + i * 11, C.ink));
    ctx.globalAlpha = 1;
    y += h + 4;
  }
}

function popup(app) {
  const g = app.game;
  if (g.selected == null) return;
  const a = g.agents.find((b) => b.id === g.selected);
  if (!a) { g.selected = null; return; }
  if (!a.present) return;
  const s = agentScreen(a, app.alpha);
  const w = 140;
  const thought = a.thought && a.thoughtT > 0 ? D.wrap('"' + a.thought + '"', w - 16).slice(0, 2) : [];
  const h = 62 + thought.length * 11;
  let x = Math.round(s.x + 8 - w / 2);
  x = Math.max(WORLD_X, Math.min(WORLD_X + MAP_W * TILE - w, x));
  let y = s.y - h - 8;
  if (y < TOP_H + 2) y = s.y + 22;
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

function modal(app) {
  const g = app.game;
  if (!g.modal) return;
  dim();
  if (g.modal === 'pause') {
    const w = 210, h = 128, x = (W - w) / 2, y = (H - h) / 2;
    D.card(x, y, w, h, C.surface, C.border);
    D.text('Paused', x + 16, y + 16, C.ink, 2);
    if (button(x + 16, y + 44, w - 32, 18, 'Resume', { variant: 'primary', kbd: 'Esc' })) g.modal = null;
    if (button(x + 16, y + 66, w - 32, 18, soundOn() ? 'Sound: on' : 'Sound: off', { icon: soundOn() ? 'sound' : 'mute' })) setSound(!soundOn());
    if (button(x + 16, y + 88, w - 32, 18, 'Quit to main menu', { variant: 'danger', tip: 'There is no saving yet. The company is lost.' })) { app.scene = 'menu'; app.game = null; }
  } else if (g.modal === 'investor') {
    const w = 300, h = 150, x = (W - w) / 2, y = (H - h) / 2;
    D.card(x, y, w, h, C.surface, C.border);
    D.text('Out of money', x + 16, y + 16, C.ink, 2);
    D.paragraph(`A man in a fleece vest offers $8,000 for "a modest 40% stake" in ${g.company}. He would like to be called Visionary.`, x + 16, y + 42, w - 32, C.inkSoft);
    if (button(x + 16, y + h - 30, 130, 18, 'Take the money', { variant: 'primary' })) {
      g.money += 8000; g.investorUsed = true; g.modal = null; sfx('money');
    }
    if (button(x + 152, y + h - 30, w - 168, 18, 'Refuse', { variant: 'danger', tip: 'Game over.' })) g.modal = 'gameover';
  } else if (g.modal === 'gameover') {
    const w = 300, h = 140, x = (W - w) / 2, y = (H - h) / 2;
    D.card(x, y, w, h, C.surface, C.border);
    D.text('Bankrupt', x + 16, y + 16, C.ink, 2);
    D.paragraph(`The bank took the furniture. ${g.company} delivered ${g.stats.jobsDone} jobs and earned ${fmtMoney(g.stats.earned)} along the way.`, x + 16, y + 42, w - 32, C.inkSoft);
    if (button(x + 16, y + h - 30, w - 32, 18, 'Back to main menu', { variant: 'primary' })) { app.scene = 'menu'; app.game = null; }
  }
}

export function drawGame(app) {
  const g = app.game;
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
  } else if (g.modal === 'pause' && key('Escape')) g.modal = null;

  setLayer(0);
  handleWorld(app);
  drawWorld(app);
  setLayer(1);
  topBar(app);
  floorBar(app);
  bottomBar(app);
  toasts(app);
  if (!app.game) return;
  setLayer(2);
  if (g.panel) {
    const w = PANEL_W[g.panel];
    drawPanel(app, W - w - 4, TOP_H + 4, H - TOP_H - BOTTOM_H - 8);
  }
  setLayer(3);
  popup(app);
  setLayer(5);
  modal(app);
}
