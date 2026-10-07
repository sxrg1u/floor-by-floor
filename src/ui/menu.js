// Main menu: editorial title on the left, a pixel tower on the right whose windows flick on and off.
import { C, W, H } from '../config.js';
import * as D from '../render/draw.js';
import { button, setLayer, block, key } from './ui.js';
import { soundOn, setSound } from '../audio.js';
import { startWizard } from './wizard.js';

const TOWER = { x: 404, y: 46, cols: 9, rows: 15 };
let lit = null;
let lastFlip = 0;

function tower(app) {
  const ctx = D.getCtx();
  const { x, y, cols, rows } = TOWER;
  const bw = cols * 14 + 10, bh = H - 34 - y;
  if (!lit) lit = Array.from({ length: cols * rows }, () => Math.random() < 0.45);
  const now = performance.now();
  if (now - lastFlip > 260) { lastFlip = now; const i = Math.floor(Math.random() * lit.length); lit[i] = !lit[i]; }
  // back building
  D.rect(x + bw - 30, y + 70, 110, bh - 70, '#E4E1DA');
  for (let r = 0; r < 12; r++) for (let c2 = 0; c2 < 5; c2++) D.rect(x + bw - 18 + c2 * 18, y + 82 + r * 16, 8, 6, '#D6D2CA');
  // main tower
  D.rect(x, y, bw, bh, C.ink);
  D.rect(x + bw / 2 - 1, y - 18, 2, 18, C.ink);
  D.rect(x + bw / 2 - 2, y - 20, 4, 2, '#C9574B');
  D.rect(x - 4, y, bw + 8, 4, '#24282A');
  for (let r = 0; r < rows; r++) {
    for (let c2 = 0; c2 < cols; c2++) {
      const on = lit[r * cols + c2];
      D.rect(x + 7 + c2 * 14, y + 10 + r * 16, 8, 9, on ? '#FBF3DB' : '#454B4F');
    }
  }
  // lobby
  D.rect(x + bw / 2 - 14, y + bh - 20, 28, 20, '#FBF3DB');
  D.rect(x + bw / 2 - 1, y + bh - 20, 2, 20, C.ink);
  // ground
  D.rect(0, H - 34, W, 1, C.borderStrong);
  for (let i = 0; i < 6; i++) {
    const tx = 290 + i * 54;
    if (tx > x - 16 && tx < x + bw + 6) continue;
    D.rect(tx, H - 50, 10, 12, '#6E9B6A'); D.rect(tx + 4, H - 38, 2, 4, '#8A6A4A');
  }
  ctx.globalAlpha = 1;
}

export function drawMenu(app) {
  setLayer(0);
  tower(app);
  const x = 48;
  D.text('PROTOTYPE · M1 TO M4', x, 70, C.muted);
  D.text('Floor', x, 92, C.ink, 5);
  D.text('by Floor', x, 136, C.ink, 5);
  D.paragraph('Start alone in a rented room. Grow it, storey by storey, into a tower full of people with opinions.', x, 190, 250, C.inkSoft);

  if (app.overlay === 'credits') return drawCredits(app);
  if (button(x, 232, 150, 22, 'New company', { variant: 'primary', kbd: 'Enter' }) || key('Enter')) startWizard(app);
  if (button(x, 260, 150, 20, soundOn() ? 'Sound: on' : 'Sound: off', { icon: soundOn() ? 'sound' : 'mute' })) setSound(!soundOn());
  if (button(x, 284, 150, 20, 'Credits')) app.overlay = 'credits';
  D.text('Continue and save slots arrive with M9.', x, 312, C.faint);
}

function drawCredits(app) {
  setLayer(5);
  block(0, 0, W, H);
  const ctx = D.getCtx();
  ctx.globalAlpha = 0.35; D.rect(0, 0, W, H, C.ink); ctx.globalAlpha = 1;
  const w = 280, h = 150, x = (W - w) / 2, y = (H - h) / 2;
  D.card(x, y, w, h, C.surface, C.border);
  D.text('Credits', x + 16, y + 16, C.ink, 2);
  D.paragraph('Floor by Floor, game design document v0.1. Prototype built in vanilla JavaScript on a 640x360 canvas. Every sprite, sound and the 5x7 font is generated in code.', x + 16, y + 42, w - 32, C.inkSoft);
  if (button(x + w - 86, y + h - 30, 70, 18, 'Close', { variant: 'primary' }) || key('Escape')) app.overlay = null;
}
