// Draws the office floor (tiles, furniture, people, day/night) and handles clicks on the map.
import { C, TILE, MAP_W, MAP_H, WORLD_X, WORLD_Y, SPAWN } from '../config.js';
import { DATA } from '../data.js';
import * as D from './draw.js';
import { furnSprite, chairSprite, charSprites, SCREENS, SPRITE_OY } from './sprites.js';
import { clock, darkness } from '../sim/time.js';
import { input, worldFree, takeClick, setTooltip, ui } from '../ui/ui.js';
import {
  canPlace, placeFurniture, furnitureAt, sellFurniture, wallLine, canWall, buildWalls, canDoor, makeDoor,
  canRemoveWall, removeWall, WALL_COST,
} from '../systems/building.js';
import { NEED_ICON } from '../sim/agents.js';
import { fmtMoney } from '../systems/economy.js';
import { toast } from '../systems/notify.js';
import { sfx } from '../audio.js';

const isWallish = (g, x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && (g.tiles[y][x] === 'W' || g.tiles[y][x] === 'E');

function buildStatic(g) {
  const c = g.staticCanvas || (g.staticCanvas = document.createElement('canvas'));
  c.width = MAP_W * TILE; c.height = MAP_H * TILE;
  const x2 = c.getContext('2d');
  const r = (x, y, w, h, col) => { x2.fillStyle = col; x2.fillRect(x, y, w, h); };
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const t = g.tiles[ty][tx];
      const X = tx * TILE, Y = ty * TILE;
      if (t === '.' || t === 'D') {
        r(X, Y, 16, 16, (tx + ty) & 1 ? C.floorB : C.floorA);
      }
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

export function mouseTile() {
  return { x: Math.floor((input.x - WORLD_X) / TILE), y: Math.floor((input.y - WORLD_Y) / TILE) };
}
const overMap = () => input.x >= WORLD_X && input.y >= WORLD_Y && input.x < WORLD_X + MAP_W * TILE && input.y < WORLD_Y + MAP_H * TILE;

export function agentScreen(a, alpha) {
  const ix = a.px + (a.x - a.px) * alpha, iy = a.py + (a.y - a.py) * alpha;
  const seated = a.state === 'working';
  return { x: Math.round(WORLD_X + ix * TILE), y: Math.round(WORLD_Y + iy * TILE - (seated ? 9 : 6)), ix, iy, seated };
}

function agentAt(g, alpha) {
  let best = null, by = -1;
  for (const a of g.agents) {
    if (!a.present) continue;
    const s = agentScreen(a, alpha);
    if (input.x >= s.x + 3 && input.x < s.x + 13 && input.y >= s.y && input.y < s.y + 16 && s.iy > by) { best = a; by = s.iy; }
  }
  return best;
}

export function handleWorld(app) {
  const g = app.game;
  if (!overMap() || !worldFree()) { if (input.released) g.drag = null; return; }
  const t = mouseTile();
  const tool = g.tool;
  if (input.rpressed && tool) { g.tool = null; g.drag = null; return; }
  if (!tool) {
    const a = agentAt(g, app.alpha);
    if (a) { ui.pointer = true; setTooltip(a.name + (a.isPlayer ? ' (you)' : '')); }
    if (takeClick()) { g.selected = a ? a.id : null; if (a) sfx('blip'); }
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

function drawGhost(app) {
  const g = app.game;
  const tool = g.tool;
  if (!tool || !overMap() || !worldFree()) return;
  const t = mouseTile();
  const X = (x) => WORLD_X + x * TILE, Y = (y) => WORLD_Y + y * TILE;
  const ctx = D.getCtx();
  const mark = (x, y, ok) => {
    ctx.globalAlpha = 0.55; D.rect(X(x), Y(y), 16, 16, ok ? '#CFE3CC' : '#F3C9CB'); ctx.globalAlpha = 1;
    D.outline(X(x), Y(y), 16, 16, ok ? C.green : C.red);
  };
  if (tool.kind === 'furn') {
    const def = DATA.furnById[tool.id];
    const ok = canPlace(g, def, t.x, t.y) && g.money >= def.price;
    for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) mark(t.x + x, t.y + y, ok);
    if (def.seat) mark(t.x + def.seat[0], t.y + def.seat[1], ok);
    ctx.globalAlpha = 0.75;
    ctx.drawImage(furnSprite(def.id, def.w, def.h, g.color), X(t.x), Y(t.y) - SPRITE_OY);
    if (def.seat) ctx.drawImage(chairSprite(), X(t.x + def.seat[0]), Y(t.y + def.seat[1]) - SPRITE_OY);
    ctx.globalAlpha = 1;
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

export function drawWorld(app) {
  const g = app.game;
  const alpha = app.alpha;
  const ctx = D.getCtx();
  if (g.staticDirty || !g.staticCanvas) buildStatic(g);
  ctx.drawImage(g.staticCanvas, WORLD_X, WORLD_Y);
  const c = clock(g.time);
  const dark = darkness(c.hour);

  // windows on the outer top wall
  for (let tx = 1; tx < MAP_W - 1; tx++) {
    if (tx % 3 !== 1 || g.tiles[1][tx] === 'W') continue;
    const X = WORLD_X + tx * TILE, Y = WORLD_Y;
    D.rect(X + 3, Y + 8, 10, 6, dark > 0.25 ? '#33404E' : '#E1F3FE');
    D.rect(X + 3, Y + 8, 10, 1, dark > 0.25 ? '#2A3542' : '#F2FAFF');
    D.rect(X + 7, Y + 8, 1, 6, C.wallFace);
  }

  // build grid
  if (g.tool) {
    ctx.globalAlpha = 0.06;
    for (let x = 0; x <= MAP_W; x++) D.rect(WORLD_X + x * TILE, WORLD_Y, 1, MAP_H * TILE, C.ink);
    for (let y = 0; y <= MAP_H; y++) D.rect(WORLD_X, WORLD_Y + y * TILE, MAP_W * TILE, 1, C.ink);
    ctx.globalAlpha = 1;
  }

  const lc = lockedCenter(g);
  if (lc) {
    const s = 'FOR RENT';
    const w = D.tw(s) + 12;
    const x = Math.round(WORLD_X + lc.x * TILE - w / 2), y = Math.round(WORLD_Y + lc.y * TILE - 8);
    D.card(x, y, w, 15, C.surface, C.border);
    D.text(s, x + 6, y + 4, C.muted);
  }

  // floor-level furniture (rugs)
  for (const f of g.furniture) {
    const d = DATA.furnById[f.type];
    if (d.walkable) ctx.drawImage(furnSprite(d.id, d.w, d.h, g.color), WORLD_X + f.x * TILE, WORLD_Y + f.y * TILE - SPRITE_OY);
  }

  // depth-sorted entities
  const ents = [];
  for (const f of g.furniture) {
    const d = DATA.furnById[f.type];
    if (d.walkable) continue;
    ents.push({ z: f.y + d.h - 1, k: 0, f, d });
    if (d.seat) ents.push({ z: f.y + d.seat[1], k: 0, chair: true, x: f.x + d.seat[0], y: f.y + d.seat[1] });
  }
  for (const a of g.agents) {
    if (!a.present) continue;
    const s = agentScreen(a, alpha);
    ents.push({ z: s.iy + (s.seated ? 0.3 : 0.1), k: 1, a, s });
  }
  ents.sort((p, q) => p.z - q.z || p.k - q.k);
  const walkFrame = 1 + (Math.floor(app.frame / 8) % 2);
  for (const e of ents) {
    if (e.f) ctx.drawImage(furnSprite(e.d.id, e.d.w, e.d.h, g.color), WORLD_X + e.f.x * TILE, WORLD_Y + e.f.y * TILE - SPRITE_OY);
    else if (e.chair) ctx.drawImage(chairSprite(), WORLD_X + e.x * TILE, WORLD_Y + e.y * TILE - SPRITE_OY);
    else {
      const a = e.a, s = e.s;
      const spr = charSprites(a.look);
      if (s.seated) {
        ctx.drawImage(spr.up[0], 0, 0, 16, 12, s.x, s.y, 16, 12);
      } else {
        D.rect(s.x + 4, s.y + 15, 8, 2, 'rgba(47,52,55,0.10)');
        const fr = a.moving && !g.paused ? walkFrame : 0;
        ctx.drawImage(spr[a.dir][fr], s.x, s.y);
      }
    }
  }

  // night
  if (dark > 0.01) {
    ctx.globalAlpha = dark;
    D.rect(WORLD_X, WORLD_Y, MAP_W * TILE, MAP_H * TILE, C.night);
    ctx.globalAlpha = 1;
    for (const f of g.furniture) {
      const d = DATA.furnById[f.type];
      if (d.light) {
        ctx.globalAlpha = dark * 0.5;
        D.rect(WORLD_X + f.x * TILE - 16, WORLD_Y + f.y * TILE - 16, 48, 48, '#FBF3DB');
        D.rect(WORLD_X + f.x * TILE - 8, WORLD_Y + f.y * TILE - 8, 32, 32, '#FBF3DB');
        ctx.globalAlpha = 1;
        D.rect(WORLD_X + f.x * TILE + 4, WORLD_Y + f.y * TILE - 8, 8, 6, '#FBF3DB');
      }
    }
    for (const a of g.agents) {
      if (!a.present || a.state !== 'working' || a.desk == null) continue;
      const f = g.furnById[a.desk];
      for (const r of SCREENS[f.type] || []) D.rect(WORLD_X + f.x * TILE + r[0], WORLD_Y + f.y * TILE + r[1], r[2], r[3], '#BFDDEE');
    }
  }

  // bubbles and markers
  for (const a of g.agents) {
    if (!a.present) continue;
    const s = agentScreen(a, alpha);
    let top = s.y - 2;
    if (a.bubble) {
      const [bg, fg] = a.bubble.kind === 'red' ? [C.redBg, C.red] : [C.blueBg, C.blue];
      D.card(s.x + 2, s.y - 12, 11, 11, bg, fg);
      D.rect(s.x + 7, s.y - 1, 1, 1, fg);
      D.icon(NEED_ICON[a.bubble.need] || a.bubble.icon, s.x + 4, s.y - 10, fg);
      top = s.y - 14;
    }
    if (g.selected === a.id) {
      D.rect(s.x + 5, top - 4, 7, 1, C.ink); D.rect(s.x + 6, top - 3, 5, 1, C.ink); D.rect(s.x + 7, top - 2, 3, 1, C.ink); D.rect(s.x + 8, top - 1, 1, 1, C.ink);
    } else if (a.isPlayer) {
      D.rect(s.x + 7, top - 3, 3, 3, g.color);
    }
  }

  drawGhost(app);
}
