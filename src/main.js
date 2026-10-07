// Boot, input, fixed-step game loop and scene switching.
import { W, H, C, SIM_HZ } from './config.js';
import { loadData } from './data.js';
import { setCtx } from './render/draw.js';
import * as D from './render/draw.js';
import { input, ui, beginFrame, endFrame, drawTooltip } from './ui/ui.js';
import { drawMenu } from './ui/menu.js';
import { drawWizard } from './ui/wizard.js';
import { drawGame } from './ui/hud.js';
import { tick, nightMultiplier } from './sim/tick.js';
import { sfx } from './audio.js';

const canvas = document.getElementById('game');
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
setCtx(ctx);

function resize() {
  const fit = Math.min(window.innerWidth / W, window.innerHeight / H);
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  canvas.style.width = W * scale + 'px';
  canvas.style.height = H * scale + 'px';
}
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
  if (e.button === 0) { input.down = true; input.pressed = true; }
  if (e.button === 2) input.rpressed = true;
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) { input.down = false; input.released = true; } });
canvas.addEventListener('mouseleave', () => { input.x = -100; input.y = -100; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { input.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  input.keys.push(e.key);
  if (e.key.length === 1) input.typed.push(e.key);
  if (e.key === ' ' || e.key === 'Backspace' || e.key === 'Tab') e.preventDefault();
});

const app = { scene: 'loading', game: null, wiz: null, frame: 0, alpha: 0, overlay: null, error: null };
window.app = app; // handy for debugging in the console

let last = performance.now();
let acc = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  app.frame++;

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
  canvas.style.cursor = ui.pointer ? 'pointer' : 'default';
  endFrame();
  requestAnimationFrame(frame);
}

loadData()
  .then(() => { app.scene = 'menu'; })
  .catch((err) => { app.error = err.message + '. Start a local server, see README.'; });
requestAnimationFrame(frame);
