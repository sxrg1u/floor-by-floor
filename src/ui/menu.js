// Main menu: editorial title on the left, a pixel tower on the right whose windows flick on and off.
import { C, W, H } from '../config.js';
import * as D from '../render/draw.js';
import { button, setLayer, block, key } from './ui.js';
import { soundOn, setSound, musicEnabled, setMusicOn, setMusic } from '../audio.js';
import { startWizard } from './wizard.js';
import { hasSave, loadGame, slotLabel, SLOTS } from '../systems/save.js';

let lit = [];
let lastFlip = 0;

function tower(x0) {
  const cols = 9;
  const bw = cols * 14 + 10;
  const ground = H - 34;
  const y = Math.max(40, ground - 300);
  const rows = Math.max(4, Math.floor((ground - y - 30) / 16));
  const x = Math.max(x0, W - bw - 70);
  if (lit.length !== cols * rows) lit = Array.from({ length: cols * rows }, () => Math.random() < 0.45);
  const now = performance.now();
  if (now - lastFlip > 260) { lastFlip = now; const i = Math.floor(Math.random() * lit.length); lit[i] = !lit[i]; }
  const bh = ground - y;
  D.rect(x + bw - 30, y + 70, 110, bh - 70, '#E4E1DA');
  for (let r = 0; r < Math.floor((bh - 90) / 16); r++) for (let c = 0; c < 5; c++) D.rect(x + bw - 18 + c * 18, y + 82 + r * 16, 8, 6, '#D6D2CA');
  D.rect(x, y, bw, bh, C.ink);
  D.rect(x + bw / 2 - 1, y - 18, 2, 18, C.ink);
  D.rect(x + bw / 2 - 2, y - 20, 4, 2, '#C9574B');
  D.rect(x - 4, y, bw + 8, 4, '#24282A');
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) D.rect(x + 7 + c * 14, y + 10 + r * 16, 8, 9, lit[r * cols + c] ? '#FBF3DB' : '#454B4F');
  D.rect(x + bw / 2 - 14, ground - 20, 28, 20, '#FBF3DB');
  D.rect(x + bw / 2 - 1, ground - 20, 2, 20, C.ink);
  D.rect(0, ground, W, 1, C.borderStrong);
  for (let i = 0; i < 8; i++) {
    const tx = x - 120 + i * 54;
    if (tx > x - 16 && tx < x + bw + 6) continue;
    D.rect(tx, ground - 16, 10, 12, '#6E9B6A'); D.rect(tx + 4, ground - 4, 2, 4, '#8A6A4A');
  }
}

function startLoaded(app, slot) {
  const g = loadGame(slot);
  if (!g) return false;
  app.game = g;
  app.scene = 'game';
  app.overlay = null;
  return true;
}

export function drawMenu(app) {
  setLayer(0);
  setMusic('office');
  const s = W < 600 ? 4 : 5;
  const x = W < 600 ? 24 : 48;
  const blockH = 14 + 18 * s + 14 + 26 + 14 + 22 + 24 * 4;
  const top = Math.max(10, Math.floor((H - 34 - blockH) / 2));
  tower(x + 250);
  let y = top;
  D.text('PROTOTYPE · M1 TO M9', x, y, C.muted); y += 16;
  D.text('Floor', x, y, C.ink, s); y += 9 * s;
  D.text('by Floor', x, y, C.ink, s); y += 9 * s + 8;
  y += D.paragraph('Start with an empty floor. Grow it, storey by storey, into a tower full of people with opinions.', x, y, 240, C.inkSoft) + 10;

  if (app.overlay === 'credits') return drawCredits(app);
  if (app.overlay === 'load') return drawLoad(app);
  if (app.overlay === 'settings') return drawSettings(app);
  const cont = hasSave('auto');
  if (cont) {
    if (button(x, y, 160, 22, 'Continue', { variant: 'primary', kbd: 'Enter', tip: slotLabel('auto') }) || key('Enter')) startLoaded(app, 'auto');
    y += 26;
    if (button(x, y, 160, 20, 'New company')) startWizard(app);
  } else {
    if (button(x, y, 160, 22, 'New company', { variant: 'primary', kbd: 'Enter' }) || key('Enter')) startWizard(app);
  }
  y += 24;
  if (button(x, y, 160, 20, 'Load game', { disabled: !SLOTS.some(hasSave) })) app.overlay = 'load';
  y += 24;
  if (button(x, y, 78, 20, 'Settings')) app.overlay = 'settings';
  if (button(x + 82, y, 78, 20, 'Credits')) app.overlay = 'credits';
}

function overlayCard(app, title, h) {
  setLayer(5);
  block(0, 0, W, H);
  const ctx = D.getCtx();
  ctx.globalAlpha = 0.35; D.rect(0, 0, W, H, C.ink); ctx.globalAlpha = 1;
  const w = Math.min(300, W - 24), x = Math.round((W - w) / 2), y = Math.round((H - h) / 2);
  D.card(x, y, w, h, C.surface, C.border);
  D.text(title, x + 16, y + 14, C.ink, 2);
  if (key('Escape')) app.overlay = null;
  return { x, y, w, h };
}

function drawLoad(app) {
  const m = overlayCard(app, 'Load game', 166);
  let y = m.y + 42;
  for (const s of SLOTS) {
    const lab = `${s === 'auto' ? 'Autosave' : 'Slot ' + s}: ${slotLabel(s)}`;
    if (button(m.x + 16, y, m.w - 32, 18, D.fit(lab, m.w - 48), { align: 'left', disabled: !hasSave(s) })) startLoaded(app, s);
    y += 22;
  }
  if (button(m.x + m.w - 86, m.y + m.h - 28, 70, 18, 'Back')) app.overlay = null;
}

function drawSettings(app) {
  const m = overlayCard(app, 'Settings', 150);
  let y = m.y + 42;
  if (button(m.x + 16, y, m.w - 32, 18, `UI size: ${app.size}`, { tip: 'S, M or L. Keys + and - work everywhere.' })) app.cycleSize();
  y += 22;
  if (button(m.x + 16, y, m.w - 32, 18, soundOn() ? 'Sound effects: on' : 'Sound effects: off', { icon: soundOn() ? 'sound' : 'mute' })) setSound(!soundOn());
  y += 22;
  if (button(m.x + 16, y, m.w - 32, 18, musicEnabled() ? 'Music: on' : 'Music: off')) setMusicOn(!musicEnabled());
  if (button(m.x + m.w - 86, m.y + m.h - 28, 70, 18, 'Done', { variant: 'primary' })) app.overlay = null;
}

function drawCredits(app) {
  const m = overlayCard(app, 'Credits', 150);
  D.paragraph('Floor by Floor, game design document v0.1. Built in vanilla JavaScript on a pixel canvas. Every sprite, sound, song and the 5x7 font is generated in code.', m.x + 16, m.y + 42, m.w - 32, C.inkSoft);
  if (button(m.x + m.w - 86, m.y + m.h - 28, 70, 18, 'Close', { variant: 'primary' })) app.overlay = null;
}
