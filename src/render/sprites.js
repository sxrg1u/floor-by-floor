// Code-generated placeholder sprites (characters + furniture), cached as offscreen canvases.
import { SKINS, HAIRS, OUTFITS } from '../config.js';
import { mix } from './draw.js';

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ---------- Characters (16x16, top-down 3/4) ----------
const BODY = {
  down: [
    '................',
    '......HHHH......',
    '.....HHHHHH.....',
    '....HHHHHHHH....',
    '....HSSSSSSH....',
    '....SSESSESS....',
    '....SSSSSSSS....',
    '.....SSSSSS.....',
    '....OOOOOOOO....',
    '...OOOOOOOOOO...',
    '...SOOOOOOOOS...',
    '...SOOOOOOOOS...',
    '....oooooooo....',
  ],
  up: [
    '................',
    '......HHHH......',
    '.....HHHHHH.....',
    '....HHHHHHHH....',
    '....HHHHHHHH....',
    '....HHHHHHHH....',
    '....SHHHHHHS....',
    '.....SSSSSS.....',
    '....OOOOOOOO....',
    '...OOOOOOOOOO...',
    '...SOOOOOOOOS...',
    '...SOOOOOOOOS...',
    '....oooooooo....',
  ],
  side: [
    '................',
    '......HHHH......',
    '.....HHHHHH.....',
    '....HHHHHHHH....',
    '....HHHSSSSS....',
    '....HHSSSSES....',
    '....HHSSSSSS....',
    '.....SSSSSS.....',
    '.....OOOOOO.....',
    '....OOOOOOOO....',
    '....OOOSSOOO....',
    '....OOOSSOOO....',
    '.....oooooo.....',
  ],
};
const LEGS = {
  down: [
    ['....PPP..PPP....', '....PPP..PPP....', '....DDD..DDD....'],
    ['....PPP..PPP....', '....DDD..PPP....', '.........DDD....'],
    ['....PPP..PPP....', '....PPP..DDD....', '....DDD.........'],
  ],
  side: [
    ['.....PPPPP......', '.....PPPPP......', '.....DDDDD......'],
    ['.....PP.PP......', '....PP...PP.....', '....DD...DD.....'],
    ['.....PPPP.......', '.....PPPP.......', '.....DDDD.......'],
  ],
};

function applyHair(grid, style, view) {
  const set = (x, y) => { if (grid[y]) grid[y][x] = 'H'; };
  if (style === 1) { // long
    if (view === 'down') for (let y = 4; y <= 9; y++) { set(4, y); set(11, y); }
    if (view === 'up') { for (let y = 6; y <= 8; y++) for (let x = 4; x <= 11; x++) set(x, y); for (let x = 5; x <= 10; x++) set(x, 9); }
    if (view === 'side') for (let y = 6; y <= 9; y++) for (let x = 4; x <= 6; x++) set(x, y);
  } else if (style === 2) { // buzz
    for (let x = 0; x < 16; x++) grid[1][x] = '.';
    if (view === 'down') { grid[4][4] = 'S'; grid[4][11] = 'S'; }
  } else if (style === 3) { // bun
    grid[0][7] = 'H'; grid[0][8] = 'H';
    if (view === 'side') { grid[1][4] = 'H'; grid[1][5] = 'H'; }
  }
}

function paintGrid(c, grid, colors, mirror) {
  const g = c.getContext('2d');
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < 16; x++) {
      const ch = grid[y][x];
      const col = colors[ch];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(mirror ? 15 - x : x, y, 1, 1);
    }
  }
}

const charCache = new Map();
export function charSprites(look) {
  const key = `${look.hair}|${look.hairColor}|${look.skin}|${look.outfit}`;
  if (charCache.has(key)) return charCache.get(key);
  const outfit = OUTFITS[look.outfit] || OUTFITS[0];
  const colors = {
    H: HAIRS[look.hairColor] || HAIRS[0],
    S: SKINS[look.skin] || SKINS[0],
    E: '#2F3437',
    O: outfit,
    o: mix(outfit, '#2F3437', 0.2),
    P: '#3F4A54',
    D: '#2F3437',
  };
  const res = { down: [], up: [], right: [], left: [] };
  for (const view of ['down', 'up', 'side']) {
    for (let f = 0; f < 3; f++) {
      const legs = view === 'side' ? LEGS.side[f] : LEGS.down[f];
      const grid = [...BODY[view], ...legs].map((r) => r.split(''));
      applyHair(grid, look.hair, view);
      if (view === 'side') {
        const r = cv(16, 16); paintGrid(r, grid, colors, false); res.right.push(r);
        const l = cv(16, 16); paintGrid(l, grid, colors, true); res.left.push(l);
      } else {
        const c = cv(16, 16); paintGrid(c, grid, colors, false); res[view].push(c);
      }
    }
  }
  charCache.set(key, res);
  return res;
}

// ---------- Furniture (w*16 x h*16+8, drawn 8px above its tile for height) ----------
const OY = 8;
const K = '#2F3437', K2 = '#3A3F42', K3 = '#4A4F52', G1 = '#A9A7A2', G2 = '#CFCCC5', G3 = '#D9D6CF', WH = '#FFFFFF';
const WOOD = '#C9A27A', WOODD = '#A67F58', SCR = '#9CC3DC', SCRD = '#5E8C9C';

function deskBase(p, top, edge) {
  p(0, 2, 16, 8, top); p(0, 10, 16, 2, edge); p(1, 12, 2, 3, edge); p(13, 12, 2, 3, edge);
}
function laptop(p) {
  p(4, -1, 8, 7, K2); p(5, 0, 6, 4, SCR); p(5, 0, 6, 1, '#BFDDEE');
  p(3, 6, 10, 3, G2); p(4, 7, 8, 1, G1);
}

const DRAW = {
  desk_basic(p) { deskBase(p, WOOD, WOODD); laptop(p); p(13, 3, 2, 3, WH); p(13, 3, 2, 1, '#B5654A'); },
  desk_pc(p) {
    deskBase(p, WOOD, WOODD);
    p(2, -5, 10, 9, K2); p(3, -4, 8, 6, SCR); p(3, -4, 8, 1, '#BFDDEE'); p(6, 4, 2, 2, K2);
    p(3, 7, 9, 2, G3); p(4, 7, 7, 1, G2);
    p(13, -1, 3, 9, K3); p(14, 1, 1, 1, '#7FBF7A');
  },
  desk_pro(p) {
    deskBase(p, '#5B6064', K2);
    p(0, -5, 8, 9, K); p(1, -4, 6, 6, SCR); p(8, -5, 8, 9, K); p(9, -4, 6, 6, SCRD);
    p(7, 4, 2, 2, K); p(4, 7, 8, 2, G2); p(5, 7, 6, 1, G1);
  },
  desk_standing(p) {
    deskBase(p, WH, G2); p(0, 2, 16, 1, G3); p(1, 12, 2, 3, G1); p(13, 12, 2, 3, G1); laptop(p);
  },
  chair(p) {
    p(4, 0, 8, 6, '#5E6367'); p(3, 6, 10, 3, K3); p(7, 9, 2, 3, K);
    p(4, 11, 1, 1, K); p(11, 11, 1, 1, K); p(7, 12, 2, 1, K);
  },
  coffee(p) {
    p(1, 3, 14, 11, G3); p(1, 13, 14, 1, G1); p(1, 3, 1, 11, G2); p(14, 3, 1, 11, G2);
    p(3, -6, 10, 12, K); p(4, -5, 8, 3, K3); p(11, -4, 1, 1, '#7FBF7A'); p(5, 0, 6, 5, K3); p(6, 2, 4, 3, WH);
  },
  fridge(p) {
    p(2, -8, 12, 22, G2); p(3, -7, 10, 20, WH); p(3, -1, 10, 1, G2);
    p(10, -6, 1, 4, G1); p(10, 1, 1, 6, G1); p(5, 3, 2, 2, '#C29A3D'); p(7, -5, 2, 2, '#4F7A6B');
    p(3, 14, 2, 1, G1); p(11, 14, 2, 1, G1);
  },
  toilet(p) {
    p(4, -3, 8, 5, G1); p(5, -2, 6, 3, WH);
    p(3, 2, 10, 10, G1); p(4, 3, 8, 8, WH); p(5, 4, 6, 6, '#E1F3FE'); p(5, 4, 6, 1, G2);
  },
  cooler(p) {
    p(4, 4, 8, 10, G1); p(5, 5, 6, 8, G3); p(5, -6, 6, 10, '#BFDDEE'); p(5, -6, 6, 1, SCR);
    p(6, -7, 4, 1, SCRD); p(7, 6, 2, 2, '#4C6A92');
  },
  sofa(p, col) {
    const X = mix(col, K, 0.25);
    p(1, -3, 30, 6, X); p(1, 3, 30, 8, col); p(0, -1, 3, 13, X); p(29, -1, 3, 13, X);
    p(16, 3, 1, 8, X); p(3, 10, 26, 1, X); p(2, 12, 2, 2, K); p(28, 12, 2, 2, K);
  },
  arcade(p, col) {
    p(2, -8, 12, 22, K2); p(3, -8, 10, 3, col); p(4, -4, 8, 7, SCRD); p(6, -2, 2, 2, '#FBF3DB'); p(9, 0, 2, 2, '#FBF3DB');
    p(3, 4, 10, 4, K3); p(5, 5, 1, 1, '#C9574B'); p(8, 5, 1, 1, '#E3C068'); p(10, 5, 1, 1, '#7FBF7A'); p(2, 13, 12, 1, K);
  },
  plant(p) {
    p(4, -3, 8, 9, '#6E9B6A'); p(2, 0, 4, 4, '#6E9B6A'); p(10, -1, 4, 4, '#6E9B6A'); p(6, -1, 3, 5, '#4D7449'); p(11, 0, 2, 2, '#4D7449');
    p(5, 6, 6, 8, '#B5654A'); p(4, 6, 8, 2, '#C47A5E');
  },
  plant_big(p) {
    p(7, 0, 2, 6, '#8A6A4A');
    p(2, -8, 12, 9, '#6E9B6A'); p(0, -5, 4, 6, '#6E9B6A'); p(12, -6, 4, 6, '#6E9B6A');
    p(4, -6, 3, 3, '#4D7449'); p(9, -3, 3, 3, '#4D7449'); p(1, -3, 2, 2, '#4D7449');
    p(4, 6, 8, 8, K2); p(3, 6, 10, 2, K3);
  },
  lamp(p) {
    p(5, 12, 6, 2, K3); p(7, -3, 2, 15, K3); p(4, -8, 8, 6, '#FBF3DB'); p(4, -8, 8, 1, '#E3C068'); p(4, -3, 8, 1, '#E3C068');
  },
  rug(p, col) {
    const a = mix(col, '#FFFFFF', 0.78), b = mix(col, '#FFFFFF', 0.5);
    p(1, 1, 30, 30, b); p(2, 2, 28, 28, a); p(5, 5, 22, 1, b); p(5, 26, 22, 1, b); p(5, 5, 1, 22, b); p(26, 5, 1, 22, b);
    p(14, 14, 4, 4, b);
  },
  whiteboard(p) {
    p(1, -8, 14, 12, G1); p(2, -7, 12, 10, WH);
    p(3, -6, 6, 1, '#1F6C9F'); p(3, -4, 8, 1, '#9F2F2D'); p(3, -2, 5, 1, '#346538'); p(10, -6, 3, 3, '#E1F3FE');
    p(2, 4, 1, 10, G1); p(13, 4, 1, 10, G1); p(1, 13, 4, 1, G1); p(11, 13, 4, 1, G1);
  },
  table(p) {
    p(0, 0, 32, 10, WOOD); p(0, 10, 32, 2, WOODD); p(1, 12, 2, 3, WOODD); p(29, 12, 2, 3, WOODD);
    p(13, 3, 6, 4, WH); p(14, 4, 4, 1, G2); p(5, 2, 4, 3, G3); p(24, 3, 3, 3, WH);
  },
  aquarium(p) {
    p(1, 6, 30, 8, K3); p(1, -7, 30, 13, K2); p(2, -6, 28, 11, '#BFDDEE'); p(2, -3, 28, 8, SCR);
    p(2, 3, 28, 2, '#D9C9A8'); p(8, -1, 3, 2, '#E39A4C'); p(11, -1, 1, 1, '#E39A4C'); p(20, 1, 3, 2, '#E3C068');
    p(25, -2, 1, 5, '#6E9B6A'); p(27, 0, 1, 3, '#4D7449');
  },
  trophy(p) {
    p(1, -8, 14, 22, WOODD); p(2, -7, 12, 20, WOOD); p(3, -6, 10, 17, '#EEF5F8');
    p(3, -1, 10, 1, WOOD); p(3, 5, 10, 1, WOOD);
    p(5, -5, 3, 3, '#E3C068'); p(6, -2, 1, 1, '#E3C068'); p(9, -4, 2, 3, '#B8B8B8');
    p(5, 1, 2, 4, '#C47A5E'); p(9, 1, 3, 2, '#E3C068'); p(10, 3, 1, 2, '#E3C068');
  },
  server(p) {
    p(2, -8, 12, 22, K); p(3, -7, 10, 20, K2);
    for (let i = 0; i < 5; i++) { p(4, -6 + i * 4, 8, 2, K3); p(10, -6 + i * 4, 1, 1, i % 2 ? '#7FBF7A' : '#E3C068'); }
    p(2, 14, 12, 1, K);
  },
  gym(p) {
    p(1, 4, 14, 9, K3); p(2, 5, 12, 7, '#5E6367'); p(3, 6, 10, 1, K2); p(3, 9, 10, 1, K2);
    p(2, -6, 2, 10, G1); p(12, -6, 2, 10, G1); p(2, -7, 12, 3, K2); p(6, -6, 4, 1, '#7FBF7A');
  },
  projector(p) {
    p(7, -2, 2, 14, K3); p(4, 12, 8, 2, K3);
    p(3, -6, 10, 5, G2); p(4, -5, 8, 3, WH); p(10, -4, 2, 2, SCRD); p(5, -4, 3, 1, G1);
  },
  ballpit(p, col) {
    const rim = mix(col, K, 0.2);
    p(1, 1, 30, 30, rim); p(3, 3, 26, 26, '#F3F2EE');
    const balls = ['#C9574B', '#E3C068', '#4C6A92', '#6E9B6A', '#B76E86'];
    for (let y = 4; y < 28; y += 3) for (let x = 4 + (y % 2); x < 28; x += 3) p(x, y, 2, 2, balls[(x * 3 + y) % 5]);
  },
  slide(p, col) {
    p(0, -8, 4, 40, G1); p(12, -8, 4, 40, G1);
    p(3, -6, 10, 34, col); p(4, -6, 8, 34, mix(col, '#FFFFFF', 0.25));
    for (let y = -6; y < 28; y += 6) p(4, y, 8, 1, mix(col, K, 0.2));
  },
  ceo_desk(p) {
    p(0, 0, 32, 11, '#7A4E34'); p(0, 11, 32, 2, '#5C3A26'); p(1, 13, 3, 2, '#5C3A26'); p(28, 13, 3, 2, '#5C3A26');
    p(2, 1, 28, 1, '#8E5E40'); p(12, -4, 9, 7, K); p(13, -3, 7, 4, SCR);
    p(4, 4, 5, 3, '#E3C068'); p(24, 3, 4, 5, '#4F7A6B'); p(25, 2, 2, 1, '#6E9B6A');
  },
};

const furnCache = new Map();
export function furnSprite(id, w, h, color) {
  const key = id + '|' + color;
  if (furnCache.has(key)) return furnCache.get(key);
  const c = cv(w * 16, h * 16 + OY);
  const g = c.getContext('2d');
  const p = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y + OY, ww, hh); };
  (DRAW[id] || ((pp) => pp(2, 2, 12, 12, '#C9574B')))(p, color);
  furnCache.set(key, c);
  return c;
}
export const chairSprite = () => furnSprite('chair', 1, 1, '');
export const SPRITE_OY = OY;

// Screen rects (tile-local, relative to the tile top) to re-light at night.
export const SCREENS = {
  desk_basic: [[5, 0, 6, 4]],
  desk_standing: [[5, 0, 6, 4]],
  desk_pc: [[3, -4, 8, 6]],
  desk_pro: [[1, -4, 6, 6], [9, -4, 6, 6]],
};
