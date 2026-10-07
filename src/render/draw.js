// Pixel drawing primitives on the low-res main canvas.
import { drawText, textWidth, drawIcon, wrapText, fitText } from './font.js';

let ctx = null;
export function setCtx(c) { ctx = c; }
export function getCtx() { return ctx; }

export function rect(x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function outline(x, y, w, h, c) {
  rect(x, y, w, 1, c); rect(x, y + h - 1, w, 1, c);
  rect(x, y + 1, 1, h - 2, c); rect(x + w - 1, y + 1, 1, h - 2, c);
}

// Card with 1px notched corners: the pixel equivalent of a small border-radius.
export function card(x, y, w, h, fill, border) {
  if (fill) rect(x + 1, y + 1, w - 2, h - 2, fill);
  const b = border || fill;
  if (!b) return;
  rect(x + 1, y, w - 2, 1, b); rect(x + 1, y + h - 1, w - 2, 1, b);
  rect(x, y + 1, 1, h - 2, b); rect(x + w - 1, y + 1, 1, h - 2, b);
}

export const tw = (s, scale = 1) => textWidth(String(s), scale);
export const wrap = (s, maxW, scale = 1) => wrapText(s, maxW, scale);
export const fit = (s, maxW, scale = 1) => fitText(String(s), maxW, scale);
export function text(s, x, y, c, scale = 1) { return drawText(ctx, String(s), x, y, c, scale); }
export function textR(s, xr, y, c, scale = 1) { return text(s, xr - tw(s, scale), y, c, scale); }
export function textC(s, cx, y, c, scale = 1) { return text(s, cx - Math.floor(tw(s, scale) / 2), y, c, scale); }
export function icon(name, x, y, c, scale = 1) { drawIcon(ctx, name, x, y, c, scale); }

export function paragraph(s, x, y, maxW, c, lh = 11) {
  const lines = wrap(s, maxW);
  lines.forEach((l, i) => text(l, x, y + i * lh, c));
  return lines.length * lh;
}

// Pixel line (Bresenham), optionally 2px thick.
export function line(x0, y0, x1, y1, c, thick = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = c;
  for (;;) {
    ctx.fillRect(x0, y0, thick, thick);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function parse(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export function mix(a, b, t) {
  const A = parse(a), B = parse(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
