// Global constants: resolution, map, palette.
// Logical resolution adapts to the window (see main.js resize). ES live bindings keep importers in sync.
export let W = 640;
export let H = 360;
export function setResolution(w, h) { W = w; H = h; }

export const TILE = 16;
export const MAP_W = 36;
export const MAP_H = 18;
export const SIM_HZ = 10; // sim ticks per real second at 1x; one tick = one game minute

export const TOP_H = 18;
export const BOTTOM_H = 24;
export const LEFT_W = 30;
export const WORLD_PAD = 24; // empty pixels above row 0 in the world canvas (tall sprites, bubbles)

// Screen rect the office map is shown in.
export const VIEW = () => ({ x: LEFT_W, y: TOP_H, w: W - LEFT_W, h: H - TOP_H - BOTTOM_H });

// UI size presets: target logical height in pixels (smaller = bigger UI).
export const SIZES = { S: 400, M: 320, L: 270 };

export const SPAWN = { x: 1, y: 8 }; // tile in front of the elevator

export const START_MONEY = 2500;
export const RENT_SMALL = 900;
export const RENT_FULL = 2400;
export const EXPAND_COST = 3000;
export const EXPAND_REP = 10;

// Warm monochrome + muted pastels
export const C = {
  bg: '#F7F6F3',
  surface: '#FFFFFF',
  surface2: '#F9F9F8',
  surfaceHover: '#F3F2EE',
  hoverSoft: '#EFEDE8',
  border: '#E3E1DC',
  borderStrong: '#C9C6BF',
  ink: '#2F3437',
  inkSoft: '#4A4F52',
  muted: '#787774',
  faint: '#B3B1AC',
  black: '#111111',
  hover: '#333333',

  redBg: '#FDEBEC', red: '#9F2F2D',
  blueBg: '#E1F3FE', blue: '#1F6C9F',
  greenBg: '#EDF3EC', green: '#346538',
  yellowBg: '#FBF3DB', yellow: '#956400',

  floorA: '#EFECE6',
  floorB: '#EBE8E1',
  wallTop: '#3A3F42',
  wallFace: '#D6D2CA',
  wallEdge: '#C4C0B7',
  wallLine: '#B5B1A8',
  locked: '#E6E3DD',
  lockedLine: '#DAD6CE',
  night: '#1D2733',
};

export const KIND = {
  red: [C.redBg, C.red],
  blue: [C.blueBg, C.blue],
  green: [C.greenBg, C.green],
  yellow: [C.yellowBg, C.yellow],
  pink: ['#F8E8EF', '#9C4A6B'],
  neutral: ['#EFEDE8', C.inkSoft],
};

export const COMPANY_COLORS = ['#B5654A', '#4F7A6B', '#4C6A92', '#8A6A9E', '#C29A3D', '#3F4A54', '#B76E86', '#5E8C9C'];
export const SKINS = ['#F2D3B8', '#E2B48F', '#C68C64', '#9A6243', '#6B432E'];
export const HAIRS = ['#2B2522', '#5A3A28', '#9C6B3E', '#D7B46A', '#A84B32', '#9A9894'];
export const OUTFITS = ['#4C6A92', '#4F7A6B', '#B5654A', '#8A6A9E', '#3F4A54', '#C29A3D', '#D9D6CF'];
export const HAIR_STYLES = ['Short', 'Long', 'Buzz', 'Bun'];
