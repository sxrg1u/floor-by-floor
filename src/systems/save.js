// Save and load: an autosave every morning plus three manual slots in localStorage.
import { clock } from '../sim/time.js';
import { SAVE_VERSION } from '../state.js';
import { fmtMoney } from './economy.js';

const TRANSIENT = new Set(['toasts', 'windows', 'tool', 'selected', 'cam', 'tmp', 'panDrag', 'drag', 'winDrag', 'frontReq', 'ding', 'modal']);
export const SLOTS = ['auto', '1', '2', '3'];
const keyOf = (slot) => `fbf-save-${slot}`;

export function saveGame(g, slot) {
  const json = JSON.stringify(g, (k, v) => (TRANSIENT.has(k) ? undefined : v));
  const meta = { company: g.company, day: clock(g.time).day, money: g.money, staff: g.agents.length - 1, savedAt: Date.now() };
  try {
    localStorage.setItem(keyOf(slot), JSON.stringify({ meta, game: json }));
    return true;
  } catch (e) {
    return false;
  }
}

export function slotMeta(slot) {
  try {
    const raw = localStorage.getItem(keyOf(slot));
    return raw ? JSON.parse(raw).meta : null;
  } catch (e) {
    return null;
  }
}

export function slotLabel(slot) {
  const m = slotMeta(slot);
  if (!m) return 'Empty';
  return `${m.company} · day ${m.day + 1} · ${fmtMoney(m.money)} · ${m.staff} staff`;
}

export function loadGame(slot) {
  try {
    const raw = localStorage.getItem(keyOf(slot));
    if (!raw) return null;
    const g = JSON.parse(JSON.parse(raw).game);
    if (g.version !== SAVE_VERSION) return null;
    g.furnById = {};
    for (const f of g.furniture) { f.users = []; g.furnById[f.id] = f; }
    g.toasts = []; g.windows = []; g.tool = null; g.selected = null; g.cam = null; g.tmp = null;
    g.decoDirty = true; g.paused = true;
    // agents mid-action restart cleanly
    for (const a of g.agents) {
      if (a.state === 'using' || a.state === 'walking' || a.state === 'elevator' || a.state === 'chatting' || a.state === 'meeting') { a.state = 'idle'; a.target = null; a.path = []; }
    }
    if (g.meeting) g.meeting = null;
    g.modal = g.event ? 'event' : null;
    return g;
  } catch (e) {
    console.error(e);
    return null;
  }
}

export const hasSave = (slot) => !!slotMeta(slot);
