// Boot, input, adaptive resolution, fixed-step game loop and scene switching.
import { W, H, C, SIM_HZ, SIZES, setResolution } from './config.js';
import { loadData } from './data.js';
import * as D from './render/draw.js';
import { input, ui, beginFrame, endFrame, drawTooltip, key } from './ui/ui.js';
import { drawMenu } from './ui/menu.js';
import { drawWizard } from './ui/wizard.js';
import { drawGame } from './ui/hud.js';
import { tick, nightMultiplier } from './sim/tick.js';
import { clampCam } from './render/camera.js';
import { sfx, unlockAudio } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
D.setCtx(ctx);

const app = { scene: 'loading', game: null, wiz: null, frame: 0, alpha: 0, overlay: null, error: null, size: 'M' };
window.app = app; // handy for debugging in the console

try { const s = localStorage.getItem('fbf-size'); if (s && SIZES[s]) app.size = s; } catch (e) { /* storage unavailable */ }

canvas.width = W;
canvas.height = H;
let lastSize = '';

// Pick a logical resolution so the UI has a comfortable size, then scale it up to fill the window.
function resize() {
  const iw = window.innerWidth, ih = window.innerHeight;
  if (!(iw > 0 && ih > 0)) return; // hidden tab or iframe: keep the last resolution
  lastSize = iw + 'x' + ih;
  let s = ih / SIZES[app.size];
  const si = Math.round(s);
  if (si >= 1 && Math.abs(s - si) / s < 0.15) s = si; // prefer crisp integer scaling when close
  let w = Math.floor(iw / s), h = Math.floor(ih / s);
  if (w < 480 || h < 270) { s = Math.min(iw / 480, ih / 270); w = Math.floor(iw / s); h = Math.floor(ih / s); }
  setResolution(Math.max(480, w), Math.max(270, h));
  canvas.width = W;
  canvas.height = H;
  ctx.imageSmoothingEnabled = false;
  canvas.style.width = Math.round(W * s) + 'px';
  canvas.style.height = Math.round(H * s) + 'px';
  if (app.game) clampCam(app.game);
}
const ORDER = ['S', 'M', 'L']; // L = biggest UI
function setSize(i) {
  app.size = ORDER[(i + ORDER.length) % ORDER.length];
  try { localStorage.setItem('fbf-size', app.size); } catch (e) { /* ignore */ }
  resize();
}
app.cycleSize = () => setSize(ORDER.indexOf(app.size) + 1);
const bigger = () => setSize(Math.min(2, ORDER.indexOf(app.size) + 1));
const smaller = () => setSize(Math.max(0, ORDER.indexOf(app.size) - 1));
window.addEventListener('resize', resize);
resize();

function toLocal(e) {
  const r = canvas.getBoundingClientRect();
  input.x = ((e.clientX - r.left) / r.width) * W;
  input.y = ((e.clientY - r.top) / r.height) * H;
}
canvas.addEventListener('mousemove', toLocal);
canvas.addEventListener('mousedown', (e) => {
  toLocal(e);
  canvas.focus();
  unlockAudio();
  if (e.button === 0) { input.down = true; input.pressed = true; }
  if (e.button === 2) input.rpressed = true;
  if (e.button === 1 || e.button === 2) { input.panDown = true; input.panPressed = true; e.preventDefault(); }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) { input.down = false; input.released = true; }
  if (e.button === 1 || e.button === 2) input.panDown = false;
});
canvas.addEventListener('mouseleave', () => { if (!input.down && !input.panDown) { input.x = -100; input.y = -100; } });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { input.wheel += Math.max(-5, Math.min(5, e.deltaMode === 1 ? e.deltaY / 3 : e.deltaY / 100)); e.preventDefault(); }, { passive: false });
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  input.keys.push(e.key);
  input.held.add(e.key);
  if (e.key.length === 1) input.typed.push(e.key);
  if ([' ', 'Backspace', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
});
window.addEventListener('keyup', (e) => input.held.delete(e.key));
window.addEventListener('blur', () => input.held.clear());

let last = performance.now();
let acc = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  app.frame++;
  if (lastSize !== window.innerWidth + 'x' + window.innerHeight) resize();

  const g = app.game;
  if (app.scene === 'game' && g && !g.paused && !g.modal) {
    acc += dt * SIM_HZ * g.speed * nightMultiplier(g);
    let n = 0;
    while (acc >= 1 && n < 400) { tick(g); acc -= 1; n++; }
    if (n >= 400) acc = 0;
    if (g.ding) { g.ding = false; sfx('ding'); }
  }
  app.alpha = Math.max(0, Math.min(1, acc));

  beginFrame();
  if (!ui.focus) {
    if (key('+') || key('=')) bigger();
    if (key('-')) smaller();
  }
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  try {
    if (app.scene === 'loading') D.textC(app.error || 'Loading', W / 2, H / 2, app.error ? C.red : C.muted);
    else if (app.scene === 'menu') drawMenu(app);
    else if (app.scene === 'wizard') drawWizard(app);
    else if (app.scene === 'game' && app.game) drawGame(app);
  } catch (err) {
    console.error(err);
    app.scene = 'loading';
    app.error = 'Error: ' + err.message;
  }
  drawTooltip();
  canvas.style.cursor = ui.pointer ? 'pointer' : app.game && app.game.panDrag && app.game.panDrag.moved ? 'grabbing' : 'default';
  endFrame();
  requestAnimationFrame(frame);
}

loadData()
  .then(() => { app.scene = 'menu'; })
  .catch((err) => { app.error = err.message + '. Start a local server, see README.'; });
requestAnimationFrame(frame);
