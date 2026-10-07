// Camera over the office map: pan (drag / arrow keys) and zoom (mouse wheel).
import { TILE, MAP_W, MAP_H, WORLD_PAD, VIEW } from '../config.js';

export const WORLD_PX_W = MAP_W * TILE;
export const WORLD_PX_H = MAP_H * TILE + WORLD_PAD;
export const ZOOMS = [1, 2, 3];

export function cam(g) {
  if (!g.cam) g.cam = { x: 0, y: 0, z: 1 };
  return g.cam;
}

export function clampCam(g) {
  const c = cam(g), v = VIEW();
  const vw = v.w / c.z, vh = v.h / c.z;
  c.x = vw >= WORLD_PX_W ? -(vw - WORLD_PX_W) / 2 : Math.max(0, Math.min(WORLD_PX_W - vw, c.x));
  c.y = vh >= WORLD_PX_H ? -(vh - WORLD_PX_H) / 2 : Math.max(0, Math.min(WORLD_PX_H - vh, c.y));
}

// Camera offset snapped to whole screen pixels so sprites stay crisp.
export function camPos(g) {
  const c = cam(g);
  return { x: Math.round(c.x * c.z) / c.z, y: Math.round(c.y * c.z) / c.z, z: c.z };
}

export function toScreen(g, wx, wy) {
  const c = camPos(g), v = VIEW();
  return { x: v.x + (wx - c.x) * c.z, y: v.y + (wy - c.y) * c.z };
}

export function toWorld(g, sx, sy) {
  const c = camPos(g), v = VIEW();
  return { x: c.x + (sx - v.x) / c.z, y: c.y + (sy - v.y) / c.z };
}

export function tileAt(g, sx, sy) {
  const w = toWorld(g, sx, sy);
  return { x: Math.floor(w.x / TILE), y: Math.floor((w.y - WORLD_PAD) / TILE) };
}

export function zoomAt(g, sx, sy, dir) {
  const c = cam(g);
  const i = Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS.indexOf(c.z) + dir));
  if (ZOOMS[i] === c.z) return;
  const before = toWorld(g, sx, sy);
  const v = VIEW();
  c.z = ZOOMS[i];
  c.x = before.x - (sx - v.x) / c.z;
  c.y = before.y - (sy - v.y) / c.z;
  clampCam(g);
}

export function centerOnTile(g, tx, ty) {
  const c = cam(g), v = VIEW();
  c.x = tx * TILE - v.w / c.z / 2;
  c.y = ty * TILE + WORLD_PAD - v.h / c.z / 2;
  clampCam(g);
}

export function pan(g, dx, dy) {
  const c = cam(g);
  c.x += dx / c.z;
  c.y += dy / c.z;
  clampCam(g);
}
