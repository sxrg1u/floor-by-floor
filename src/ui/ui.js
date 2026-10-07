// Immediate-mode UI on the pixel canvas. Layers decide who receives a click:
// a widget only reacts if no higher layer covered the pointer in the previous frame.
import { C, KIND, W, H } from '../config.js';
import * as D from '../render/draw.js';
import { hasGlyph } from '../render/font.js';
import { sfx } from '../audio.js';

export const input = {
  x: -100, y: -100, down: false, pressed: false, released: false, rpressed: false,
  panDown: false, panPressed: false, wheel: 0, keys: [], typed: [], held: new Set(),
};

// Pulsing yellow outline used by the tutorial to point at things.
export function highlight(x, y, w, h) {
  const on = Math.floor(performance.now() / 350) % 2 === 0;
  D.outline(x - 2, y - 2, w + 4, h + 4, on ? '#D9A400' : '#F2D27A');
  D.outline(x - 3, y - 3, w + 6, h + 6, on ? '#F2D27A' : '#FBF3DB');
}
export const ui = { focus: null, pointer: false, scroll: {}, scrollH: {} };

let regions = [], prev = [], layer = 0, hot = 0, consumed = false, tip = null, clip = null;
const inside = (x, y, r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

export function beginFrame() {
  prev = regions; regions = []; hot = 0;
  for (const r of prev) if (r.l > hot && inside(input.x, input.y, r)) hot = r.l;
  layer = 0; tip = null; ui.pointer = false; clip = null;
  if (input.pressed) ui.focus = null; // a text field clicked this frame grabs focus again
}
export function endFrame() {
  input.pressed = input.released = input.rpressed = input.panPressed = false;
  input.wheel = 0; input.keys.length = 0; input.typed.length = 0; consumed = false;
}
export function setLayer(l) { layer = l; }
export function block(x, y, w, h) { regions.push({ x, y, w, h, l: layer }); }
export function setClip(r) { clip = r; }
export function hover(x, y, w, h) {
  if (layer < hot) return false;
  if (clip && !inside(input.x, input.y, clip)) return false;
  return input.x >= x && input.y >= y && input.x < x + w && input.y < y + h;
}
export function click(x, y, w, h) {
  if (!input.pressed || consumed || !hover(x, y, w, h)) return false;
  consumed = true;
  return true;
}
export const worldFree = () => hot === 0;
export function takeClick() { if (!input.pressed || consumed) return false; consumed = true; return true; }
export function key(k) {
  const i = input.keys.findIndex((x) => x.toLowerCase() === k.toLowerCase());
  if (i < 0) return false;
  input.keys.splice(i, 1);
  return true;
}
export function wheelIn(x, y, w, h) {
  if (!input.wheel || !hover(x, y, w, h)) return 0;
  const v = input.wheel; input.wheel = 0; return v;
}
export function setTooltip(t) { tip = t; }

export function drawTooltip() {
  if (!tip) return;
  const lines = D.wrap(tip, 160);
  const w = Math.max(...lines.map((l) => D.tw(l))) + 12;
  const h = lines.length * 11 + 8;
  let x = input.x + 10, y = input.y + 12;
  if (x + w > W - 2) x = input.x - w - 4;
  if (y + h > H - 2) y = input.y - h - 4;
  D.card(x, y, w, h, C.ink, C.ink);
  lines.forEach((l, i) => D.text(l, x + 6, y + 5 + i * 11, '#FFFFFF'));
}

// ---------- widgets ----------
export function kbd(x, y, label) {
  const w = D.tw(label) + 6;
  D.card(x, y, w, 11, C.bg, C.border);
  D.text(label, x + 3, y + 2, C.muted);
  return w;
}

export function button(x, y, w, h, label, o = {}) {
  const v = o.variant || 'secondary';
  const dis = !!o.disabled;
  const hv = hover(x, y, w, h);
  if (hv && o.tip) tip = o.tip;
  if (hv && !dis) ui.pointer = true;
  const pressed = hv && !dis && input.down;
  let fill, border, fg;
  if (dis) {
    fill = v === 'ghost' ? null : C.surface2; border = v === 'ghost' ? null : C.border; fg = C.faint;
  } else if (v === 'primary') {
    fill = hv ? C.hover : C.black; border = fill; fg = '#FFFFFF';
  } else if (v === 'ghost') {
    fill = hv || o.active ? C.hoverSoft : null; border = null; fg = hv || o.active ? C.ink : C.inkSoft;
  } else if (v === 'danger') {
    fill = hv ? C.redBg : C.surface; border = hv ? '#E8C4C2' : C.border; fg = C.red;
  } else {
    fill = o.active ? C.ink : hv ? C.surfaceHover : C.surface;
    border = o.active ? C.ink : hv ? C.borderStrong : C.border;
    fg = o.active ? '#FFFFFF' : C.ink;
  }
  const oy = pressed ? 1 : 0;
  if (fill || border) D.card(x, y + oy, w, h, fill, border);
  const lw = label ? D.tw(label) : 0;
  const iw = o.icon ? 7 : 0;
  const gap = o.icon && label ? 4 : 0;
  const kw = o.kbd ? D.tw(o.kbd) + 6 + 4 : 0;
  let cx = o.align === 'left' ? x + 6 : x + Math.floor((w - (iw + gap + lw + kw)) / 2);
  const ty = y + oy + Math.floor((h - 7) / 2);
  if (o.icon) { D.icon(o.icon, cx, ty, o.iconColor && !dis ? o.iconColor : fg); cx += iw + gap; }
  if (label) { D.text(label, cx, ty, fg); cx += lw; }
  if (o.kbd) kbd(cx + 4, ty - 2, o.kbd);
  if (o.hl) highlight(x, y, w, h);
  const c = !dis && click(x, y, w, h);
  if (c && o.sound !== false) sfx('click');
  return c;
}

export function tag(x, y, label, kind = 'neutral') {
  const [bg, fg] = KIND[kind] || KIND.neutral;
  const s = String(label).toUpperCase();
  const w = D.tw(s) + 8;
  D.rect(x + 2, y, w - 4, 11, bg);
  D.rect(x + 1, y + 1, 1, 9, bg); D.rect(x + w - 2, y + 1, 1, 9, bg);
  D.rect(x, y + 2, 1, 7, bg); D.rect(x + w - 1, y + 2, 1, 7, bg);
  D.text(s, x + 4, y + 2, fg);
  return w;
}

export function bar(x, y, w, h, v, color = C.ink, bg = '#ECEAE5') {
  D.rect(x, y, w, h, bg);
  D.rect(x, y, Math.max(0, Math.min(1, v)) * w, h, color);
}

export function textField(id, x, y, w, value, max = 22) {
  const focused = ui.focus === id;
  const hv = hover(x, y, w, 18);
  if (hv) ui.pointer = true;
  if (click(x, y, w, 18)) ui.focus = id;
  if (focused) {
    for (const ch of input.typed) if (value.length < max && hasGlyph(ch)) value += ch;
    for (const k of input.keys) if (k === 'Backspace') value = value.slice(0, -1);
  }
  D.card(x, y, w, 18, C.surface, focused ? C.ink : hv ? C.borderStrong : C.border);
  D.text(value, x + 6, y + 5, C.ink);
  if (focused && Math.floor(performance.now() / 500) % 2) D.rect(x + 7 + D.tw(value), y + 4, 1, 10, C.ink);
  return value;
}

export function swatches(x, y, colors, selected, size = 16) {
  let res = null;
  colors.forEach((col, i) => {
    const sx = x + i * (size + 4);
    const hv = hover(sx, y, size, size);
    if (hv) ui.pointer = true;
    if (i === selected) D.card(sx - 2, y - 2, size + 4, size + 4, null, C.ink);
    else if (hv) D.card(sx - 2, y - 2, size + 4, size + 4, null, C.borderStrong);
    D.card(sx, y, size, size, col, col);
    if (click(sx, y, size, size)) { res = i; sfx('click'); }
  });
  return res;
}

export function label(s, x, y) { D.text(String(s).toUpperCase(), x, y, C.muted); }

// Scrollable area. draw(top) draws content starting at y=top and returns its height.
export function scrollArea(id, x, y, w, h, draw) {
  const maxS = Math.max(0, (ui.scrollH[id] || 0) - h);
  const wv = wheelIn(x, y, w, h);
  let s = Math.max(0, Math.min(maxS, (ui.scroll[id] || 0) + Math.round(wv * 30)));
  ui.scroll[id] = s;
  const ctx = D.getCtx();
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  setClip({ x, y, w, h });
  const ch = draw(y - s);
  setClip(null);
  ctx.restore();
  ui.scrollH[id] = ch;
  if (ch > h) {
    const th = Math.max(16, (h * h) / ch);
    const ty = y + (s / Math.max(1, ch - h)) * (h - th);
    D.rect(x + w - 2, ty, 2, th, C.borderStrong);
  }
}
