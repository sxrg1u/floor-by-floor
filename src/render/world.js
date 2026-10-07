// Draws the office floor into an offscreen world canvas (tiles, furniture, people, day/night),
// then blits it through the camera. Also handles map input: select, pan, zoom, build tools.
import { C, KIND, TILE, MAP_W, MAP_H, SPAWN, WORLD_PAD, VIEW } from '../config.js';
import { DATA } from '../data.js';
import * as D from './draw.js';
import { furnSprite, chairSprite, charSprites, SCREENS, SPRITE_OY } from './sprites.js';
import { cam, camPos, clampCam, tileAt, toScreen, zoomAt, WORLD_PX_W, WORLD_PX_H } from './camera.js';
import { clock, darkness } from '../sim/time.js';
import { input, worldFree, takeClick, setTooltip, ui } from '../ui/ui.js';
import {
  canPlace, placeFurniture, furnitureAt, sellFurniture, wallLine, canWall, buildWalls, canDoor, makeDoor,
  canRemoveWall, removeWall, WALL_COST,
} from '../systems/building.js';
import { fmtMoney } from '../systems/economy.js';
import { toast } from '../systems/notify.js';
import { sfx } from '../audio.js';
import { isHl } from '../systems/tutorial.js';

const PX = (tx) => tx * TILE;
const PY = (ty) => ty * TILE + WORLD_PAD;
const isWallish = (g, x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && (g.tiles[y][x] === 'W' || g.tiles[y][x] === 'E');

let worldCanvas = null;
function getWorldCanvas() {
  if (!worldCanvas) {
    worldCanvas = document.createElement('canvas');
    worldCanvas.width = WORLD_PX_W;
    worldCanvas.height = WORLD_PX_H;
  }
  return worldCanvas;
}

function buildStatic(g) {
  const c = g.staticCanvas || (g.staticCanvas = document.createElement('canvas'));
  c.width = MAP_W * TILE; c.height = MAP_H * TILE;
  const x2 = c.getContext('2d');
  const r = (x, y, w, h, col) => { x2.fillStyle = col; x2.fillRect(x, y, w, h); };
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const t = g.tiles[ty][tx];
      const X = tx * TILE, Y = ty * TILE;
      if (t === '.' || t === 'D') r(X, Y, 16, 16, (tx + ty) & 1 ? C.floorB : C.floorA);
      if (t === 'L') {
        r(X, Y, 16, 16, C.locked);
        for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) if ((X + i + Y + j) % 6 === 0) r(X + i, Y + j, 1, 1, C.lockedLine);
      }
      if (t === 'W') {
        const below = ty + 1 < MAP_H ? g.tiles[ty + 1][tx] : 'W';
        const face = below !== 'W' && below !== 'E';
        const fh = ty === 0 ? 10 : 6;
        r(X, Y, 16, 16, C.wallTop);
        if (face) { r(X, Y + 16 - fh, 16, fh, C.wallFace); r(X, Y + 16 - fh, 16, 1, C.wallEdge); r(X, Y + 15, 16, 1, C.wallLine); }
      }
      if (t === 'D') {
        const horiz = isWallish(g, tx - 1, ty) || isWallish(g, tx + 1, ty);
        if (horiz) { r(X, Y, 2, 16, C.wallTop); r(X + 14, Y, 2, 16, C.wallTop); r(X + 2, Y + 7, 12, 2, C.wallFace); }
        else { r(X, Y, 16, 2, C.wallTop); r(X, Y + 14, 16, 2, C.wallTop); r(X + 7, Y + 2, 2, 12, C.wallFace); }
      }
      if (t === 'E') {
        r(X, Y, 16, 16, C.wallTop);
        if (ty === SPAWN.y) { r(X + 4, Y + 1, 12, 15, '#C4C1BA'); r(X + 4, Y + 1, 12, 1, '#D9D6CF'); r(X + 1, Y + 3, 2, 2, '#E3C068'); }
        else { r(X + 4, Y, 12, 15, '#C4C1BA'); r(X + 4, Y, 12, 1, '#A9A7A2'); }
      }
    }
  }
  g.staticDirty = false;
}

function lockedCenter(g) {
  let minx = 99, miny = 99, maxx = -1, maxy = -1;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (g.tiles[y][x] === 'L') {
    if (x < minx) minx = x; if (y < miny) miny = y; if (x > maxx) maxx = x; if (y > maxy) maxy = y;
  }
  return maxx < 0 ? null : { x: (minx + maxx + 1) / 2, y: (miny + maxy + 1) / 2 };
}

const overView = () => { const v = VIEW(); return input.x >= v.x && input.y >= v.y && input.x < v.x + v.w && input.y < v.y + v.h; };
const inMap = (t) => t.x >= 0 && t.y >= 0 && t.x < MAP_W && t.y < MAP_H;

// World-canvas position of an agent sprite (top-left).
export function agentWorld(a, alpha) {
  const ix = a.px + (a.x - a.px) * alpha, iy = a.py + (a.y - a.py) * alpha;
  const seated = a.state === 'working';
  return { x: Math.round(PX(ix)), y: Math.round(PY(iy) - (seated ? 9 : 6)), iy, seated };
}

export function agentScreen(g, a, alpha) {
  const w = agentWorld(a, alpha);
  const s = toScreen(g, w.x, w.y);
  return { x: s.x, y: s.y, z: cam(g).z };
}

function agentAt(g, alpha) {
  const t = toWorldPoint(g);
  let best = null, by = -1;
  for (const a of g.agents) {
    if (!a.present) continue;
    const s = agentWorld(a, alpha);
    if (t.x >= s.x + 3 && t.x < s.x + 13 && t.y >= s.y && t.y < s.y + 16 && s.iy > by) { best = a; by = s.iy; }
  }
  return best;
}
function toWorldPoint(g) {
  const c = camPos(g), v = VIEW();
  return { x: c.x + (input.x - v.x) / c.z, y: c.y + (input.y - v.y) / c.z };
}

function startPan(g, left) {
  const c = cam(g);
  g.panDrag = { sx: input.x, sy: input.y, cx: c.x, cy: c.y, moved: false, left };
}

export function handleWorld(app) {
  const g = app.game;
  cam(g);
  // ongoing camera drag
  if (g.panDrag) {
    const p = g.panDrag;
    if (input.down || input.panDown) {
      const dx = input.x - p.sx, dy = input.y - p.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) p.moved = true;
      if (p.moved) { const c = cam(g); c.x = p.cx - dx / c.z; c.y = p.cy - dy / c.z; clampCam(g); }
      return;
    }
    if (!p.moved && p.left) {
      const a = agentAt(g, app.alpha);
      g.selected = a ? a.id : null;
      if (a) sfx('blip');
    }
    g.panDrag = null;
    return;
  }
  if (!overView() || !worldFree()) { if (input.released) g.drag = null; return; }
  if (input.wheel) { zoomAt(g, input.x, input.y, input.wheel < 0 ? 1 : -1); input.wheel = 0; }
  const tool = g.tool;
  if (input.rpressed && tool) { g.tool = null; g.drag = null; return; }
  if (input.panPressed) { startPan(g, false); return; }
  const t = tileAt(g, input.x, input.y);
  if (!tool) {
    const a = agentAt(g, app.alpha);
    if (a) { ui.pointer = true; setTooltip(a.name + (a.isPlayer ? ' (you)' : '') + ' · click for details'); }
    if (takeClick()) startPan(g, true);
    return;
  }
  if (tool.kind === 'furn') {
    const def = DATA.furnById[tool.id];
    if (takeClick()) {
      const r = placeFurniture(g, tool.id, t.x, t.y);
      if (r === 'ok') sfx('place');
      else { sfx('error'); if (r === 'money') toast(g, `Not enough money for ${def.name}.`, 'red'); }
    }
  } else if (tool.kind === 'wall') {
    if (takeClick()) g.drag = { x: t.x, y: t.y };
    if (input.released && g.drag) {
      const n = buildWalls(g, wallLine(g.drag.x, g.drag.y, t.x, t.y));
      g.drag = null;
      sfx(n ? 'place' : 'error');
    }
  } else if (tool.kind === 'door') {
    if (takeClick()) sfx(makeDoor(g, t.x, t.y) ? 'place' : 'error');
  } else if (tool.kind === 'sell') {
    const f = furnitureAt(g, t.x, t.y);
    if (f) setTooltip(`Sell ${DATA.furnById[f.type].name} for ${fmtMoney(Math.floor(DATA.furnById[f.type].price / 2))}`);
    else if (canRemoveWall(g, t.x, t.y)) setTooltip('Remove wall');
    if (takeClick()) {
      if (f) { sellFurniture(g, f); sfx('sell'); }
      else if (removeWall(g, t.x, t.y)) sfx('sell');
      else sfx('error');
    }
  }
}

function drawGhost(app, ctx) {
  const g = app.game;
  const tool = g.tool;
  if (!tool || !overView() || !worldFree() || g.panDrag) return;
  const t = tileAt(g, input.x, input.y);
  if (!inMap(t) && tool.kind !== 'wall') return;
  const mark = (x, y, ok) => {
    ctx.globalAlpha = 0.55; D.rect(PX(x), PY(y), 16, 16, ok ? '#CFE3CC' : '#F3C9CB'); ctx.globalAlpha = 1;
    D.outline(PX(x), PY(y), 16, 16, ok ? C.green : C.red);
  };
  if (tool.kind === 'furn') {
    const def = DATA.furnById[tool.id];
    const ok = canPlace(g, def, t.x, t.y) && g.money >= def.price;
    for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) mark(t.x + x, t.y + y, ok);
    if (def.seat) mark(t.x + def.seat[0], t.y + def.seat[1], ok);
    ctx.globalAlpha = 0.75;
    ctx.drawImage(furnSprite(def.id, def.w, def.h, g.color), PX(t.x), PY(t.y) - SPRITE_OY);
    if (def.seat) ctx.drawImage(chairSprite(), PX(t.x + def.seat[0]), PY(t.y + def.seat[1]) - SPRITE_OY);
    ctx.globalAlpha = 1;
    if (!ok) setTooltip(g.money < def.price ? 'Not enough money' : 'Does not fit here. Needs free floor, desks also need room for the chair below.');
  } else if (tool.kind === 'wall') {
    const line = g.drag ? wallLine(g.drag.x, g.drag.y, t.x, t.y) : [t];
    for (const p of line) mark(p.x, p.y, canWall(g, p.x, p.y));
    if (g.drag) {
      const n = line.filter((p) => canWall(g, p.x, p.y)).length;
      setTooltip(`${n} wall tiles · ${fmtMoney(n * WALL_COST)}`);
    }
  } else if (tool.kind === 'door') {
    mark(t.x, t.y, canDoor(g, t.x, t.y));
  } else if (tool.kind === 'sell') {
    const f = furnitureAt(g, t.x, t.y);
    if (f) {
      const d = DATA.furnById[f.type];
      for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) mark(f.x + x, f.y + y, false);
    } else mark(t.x, t.y, false);
  }
}

function drawScene(app, ctx) {
  const g = app.game;
  const alpha = app.alpha;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, WORLD_PX_W, WORLD_PX_H);
  if (g.staticDirty || !g.staticCanvas) buildStatic(g);
  ctx.drawImage(g.staticCanvas, 0, WORLD_PAD);
  const c = clock(g.time);
  const dark = darkness(c.hour);

  for (let tx = 1; tx < MAP_W - 1; tx++) {
    if (tx % 3 !== 1 || g.tiles[1][tx] === 'W') continue;
    const X = PX(tx), Y = PY(0);
    D.rect(X + 3, Y + 8, 10, 6, dark > 0.25 ? '#33404E' : '#E1F3FE');
    D.rect(X + 3, Y + 8, 10, 1, dark > 0.25 ? '#2A3542' : '#F2FAFF');
    D.rect(X + 7, Y + 8, 1, 6, C.wallFace);
  }

  if (g.tool) {
    ctx.globalAlpha = 0.06;
    for (let x = 0; x <= MAP_W; x++) D.rect(PX(x), PY(0), 1, MAP_H * TILE, C.ink);
    for (let y = 0; y <= MAP_H; y++) D.rect(0, PY(y), MAP_W * TILE, 1, C.ink);
    ctx.globalAlpha = 1;
  }

  const lc = lockedCenter(g);
  if (lc) {
    const s = 'FOR RENT';
    const w = D.tw(s) + 12;
    const x = Math.round(PX(lc.x) - w / 2), y = Math.round(PY(lc.y) - 8);
    D.card(x, y, w, 15, C.surface, C.border);
    D.text(s, x + 6, y + 4, C.muted);
  }

  for (const f of g.furniture) {
    const d = DATA.furnById[f.type];
    if (d.walkable) ctx.drawImage(furnSprite(d.id, d.w, d.h, g.color), PX(f.x), PY(f.y) - SPRITE_OY);
  }

  const ents = [];
  for (const f of g.furniture) {
    const d = DATA.furnById[f.type];
    if (d.walkable) continue;
    ents.push({ z: f.y + d.h - 1, k: 0, f, d });
    if (d.seat) ents.push({ z: f.y + d.seat[1], k: 0, chair: true, x: f.x + d.seat[0], y: f.y + d.seat[1] });
  }
  for (const a of g.agents) {
    if (!a.present) continue;
    const s = agentWorld(a, alpha);
    ents.push({ z: s.iy + (s.seated ? 0.3 : 0.1), k: 1, a, s });
  }
  ents.sort((p, q) => p.z - q.z || p.k - q.k);
  const walkFrame = 1 + (Math.floor(app.frame / 8) % 2);
  for (const e of ents) {
    if (e.f) ctx.drawImage(furnSprite(e.d.id, e.d.w, e.d.h, g.color), PX(e.f.x), PY(e.f.y) - SPRITE_OY);
    else if (e.chair) ctx.drawImage(chairSprite(), PX(e.x), PY(e.y) - SPRITE_OY);
    else {
      const a = e.a, s = e.s;
      const spr = charSprites(a.look);
      if (s.seated) ctx.drawImage(spr.up[0], 0, 0, 16, 12, s.x, s.y, 16, 12);
      else {
        D.rect(s.x + 4, s.y + 15, 8, 2, 'rgba(47,52,55,0.10)');
        const fr = a.moving && !g.paused ? walkFrame : 0;
        ctx.drawImage(spr[a.dir][fr], s.x, s.y);
      }
    }
  }

  if (dark > 0.01) {
    ctx.globalAlpha = dark;
    D.rect(0, PY(0), MAP_W * TILE, MAP_H * TILE, C.night);
    ctx.globalAlpha = 1;
    for (const f of g.furniture) {
      const d = DATA.furnById[f.type];
      if (!d.light) continue;
      ctx.globalAlpha = dark * 0.5;
      D.rect(PX(f.x) - 16, PY(f.y) - 16, 48, 48, '#FBF3DB');
      D.rect(PX(f.x) - 8, PY(f.y) - 8, 32, 32, '#FBF3DB');
      ctx.globalAlpha = 1;
      D.rect(PX(f.x) + 4, PY(f.y) - 8, 8, 6, '#FBF3DB');
    }
    for (const a of g.agents) {
      if (!a.present || a.state !== 'working' || a.desk == null) continue;
      const f = g.furnById[a.desk];
      for (const r of SCREENS[f.type] || []) D.rect(PX(f.x) + r[0], PY(f.y) + r[1], r[2], r[3], '#BFDDEE');
    }
  }

  for (const a of g.agents) {
    if (!a.present) continue;
    const s = agentWorld(a, alpha);
    let top = s.y - 2;
    if (a.bubble) {
      const [bg, fg] = KIND[a.bubble.kind] || KIND.blue;
      D.card(s.x + 2, s.y - 12, 11, 11, bg, fg);
      D.rect(s.x + 7, s.y - 1, 1, 1, fg);
      D.icon(a.bubble.icon, s.x + 4, s.y - 10, fg);
      top = s.y - 14;
    }
    if (g.selected === a.id) {
      D.rect(s.x + 5, top - 4, 7, 1, C.ink); D.rect(s.x + 6, top - 3, 5, 1, C.ink); D.rect(s.x + 7, top - 2, 3, 1, C.ink); D.rect(s.x + 8, top - 1, 1, 1, C.ink);
    } else if (a.isPlayer) {
      D.rect(s.x + 7, top - 3, 3, 3, g.color);
    }
  }

  // tutorial: point at the room when the player should place something
  if (isHl(g, 'map')) {
    const on = Math.floor(performance.now() / 350) % 2 === 0;
    D.outline(PX(1) - 1, PY(1) - 1, 11 * TILE + 2, 9 * TILE + 2, on ? '#D9A400' : '#F2D27A');
  }

  drawGhost(app, ctx);
}

export function drawWorld(app) {
  const g = app.game;
  const main = D.getCtx();
  const wc = getWorldCanvas();
  const wctx = wc.getContext('2d');
  wctx.imageSmoothingEnabled = false;
  D.setCtx(wctx);
  try { drawScene(app, wctx); } finally { D.setCtx(main); }
  const c = camPos(g), v = VIEW();
  main.save();
  main.beginPath(); main.rect(v.x, v.y, v.w, v.h); main.clip();
  main.drawImage(wc, Math.round(v.x - c.x * c.z), Math.round(v.y - c.y * c.z), WORLD_PX_W * c.z, WORLD_PX_H * c.z);
  main.restore();
}
