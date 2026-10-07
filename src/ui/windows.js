// Floating windows: several can be open at once, dragged by the title bar, clicked to the front.
import { C, W, H, TOP_H, BOTTOM_H, LEFT_W } from '../config.js';
import * as D from '../render/draw.js';
import { input, block, hover, setLayer, button, takeClick } from './ui.js';

export const WIN_DEFS = {
  jobs: { title: 'Jobs', w: 286, h: 360 },
  staff: { title: 'Staff', w: 270, h: 360 },
  teams: { title: 'Teams', w: 280, h: 340 },
  build: { title: 'Build', w: 176, h: 360 },
  finance: { title: 'Finance', w: 262, h: 360 },
  policies: { title: 'Rules & policies', w: 286, h: 360 },
  meetings: { title: 'Meetings', w: 276, h: 340 },
  goals: { title: 'Milestones', w: 262, h: 340 },
  profile: { title: 'Profile', w: 252, h: 360 },
};
export const TITLE_H = 20;

export const winId = (kind, data) => (kind === 'profile' ? 'profile-' + data : kind);
export const isOpen = (g, kind) => (g.windows || []).some((w) => w.kind === kind);

export function openWin(g, kind, data) {
  if (!g.windows) g.windows = [];
  const id = winId(kind, data);
  const ex = g.windows.find((w) => w.id === id);
  if (ex) { toFront(g, ex); return ex; }
  const def = WIN_DEFS[kind];
  const n = g.windows.length;
  const w = Math.min(def.w, W - LEFT_W - 8);
  const win = { id, kind, data, w, h: def.h, x: W - w - 6 - (n % 5) * 16, y: TOP_H + 4 + (n % 5) * 14 };
  g.windows.push(win);
  return win;
}

export function closeWin(g, id) {
  g.windows = g.windows.filter((w) => w.id !== id);
  if (id === 'build') g.tool = null;
}

export function toggleWin(g, kind) {
  const ex = (g.windows || []).find((w) => w.id === kind);
  if (ex && g.windows[g.windows.length - 1] === ex) closeWin(g, kind);
  else openWin(g, kind);
}

export function toFront(g, win) {
  g.windows = g.windows.filter((w) => w !== win);
  g.windows.push(win);
}

export const topWin = (g) => (g.windows && g.windows.length ? g.windows[g.windows.length - 1] : null);

// Draws every window; draw(win, x, y, w, h) fills the content area below the title bar.
export function drawWindows(app, draw) {
  const g = app.game;
  if (!g.windows) g.windows = [];
  // drag in progress
  if (g.winDrag) {
    const win = g.windows.find((w) => w.id === g.winDrag.id);
    if (!win || !input.down) g.winDrag = null;
    else { win.x = Math.round(input.x - g.winDrag.dx); win.y = Math.round(input.y - g.winDrag.dy); }
  }
  let front = null;
  const list = [...g.windows];
  list.forEach((win, i) => {
    setLayer(10 + i);
    if (!Number.isFinite(win.x) || !Number.isFinite(win.y) || !Number.isFinite(win.w)) { win.w = WIN_DEFS[win.kind].w; win.x = W - win.w - 6; win.y = TOP_H + 4; }
    const w = Math.min(win.w, W - LEFT_W - 4);
    win.x = Math.max(LEFT_W + 2 - w + 60, Math.min(W - 60, win.x));
    win.y = Math.max(TOP_H + 2, Math.min(H - BOTTOM_H - TITLE_H - 40, win.y));
    const { x, y } = win;
    // never cover the bottom bar
    const h = Math.max(TITLE_H + 40, Math.min(WIN_DEFS[win.kind].h, H - BOTTOM_H - 2 - y));
    block(x, y, w, h);
    if (input.pressed && hover(x, y, w, h)) front = win;
    D.card(x, y, w, h, C.surface, i === list.length - 1 ? C.borderStrong : C.border);
    D.rect(x + 1, y + 1, w - 2, TITLE_H - 1, C.surface2);
    D.rect(x + 1, y + TITLE_H, w - 2, 1, C.border);
    const title = typeof win.title === 'string' ? win.title : WIN_DEFS[win.kind].title;
    D.text(D.fit(title, w - 40), x + 8, y + 7, C.ink);
    if (button(x + w - 18, y + 3, 14, 14, '', { icon: 'cross', variant: 'ghost', sound: false })) { closeWin(g, win.id); return; }
    if (hover(x, y, w - 20, TITLE_H) && takeClick()) g.winDrag = { id: win.id, dx: input.x - x, dy: input.y - y };
    draw(win, x, y + TITLE_H + 1, w, h - TITLE_H - 1);
  });
  if (front && g.windows[g.windows.length - 1] !== front && g.windows.includes(front)) toFront(g, front);
}
