// Small UI building blocks shared by the windows.
import { C } from '../config.js';
import { DATA } from '../data.js';
import * as D from '../render/draw.js';
import { button, tag, hover, setTooltip } from './ui.js';

export const SKILL_KINDS = ['blue', 'green', 'yellow'];
export const skillKind = (g, s) => SKILL_KINDS[DATA.indById[g.industry].skills.indexOf(s)] || 'neutral';
export const tagW = (s) => D.tw(String(s).toUpperCase()) + 8;

export function moodInfo(m) {
  return m >= 65 ? ['happy', C.green, C.greenBg] : m >= 40 ? ['neutral', C.yellow, C.yellowBg] : ['sad', C.red, C.redBg];
}

export function tabs(x, y, w, items, active) {
  let cx = x, res = null;
  for (const it of items) {
    const tw = D.tw(it.label) + 12;
    const act = it.id === active;
    if (button(cx, y, tw, 15, it.label, { variant: 'ghost', active: act, hl: it.hl })) res = it.id;
    if (act) D.rect(cx + 2, y + 15, tw - 4, 1, C.ink);
    cx += tw + 2;
  }
  D.rect(x, y + 16, w, 1, C.border);
  return res;
}

export function row(x, y, w, labelText, value, color = C.ink) {
  D.text(labelText, x, y, C.inkSoft);
  D.textR(value, x + w, y, color);
}

// Bar centered at zero for values -100..100.
export function divBar(x, y, w, v) {
  D.rect(x, y, w, 3, '#ECEAE5');
  const half = Math.floor(w / 2);
  const len = Math.round((Math.abs(v) / 100) * half);
  if (v >= 0) D.rect(x + half, y, len, 3, C.green); else D.rect(x + half - len, y, len, 3, C.red);
  D.rect(x + half, y - 1, 1, 5, C.borderStrong);
}

export function traitTags(x, y, maxW, traits, known) {
  let tx = x, ty = y;
  traits.forEach((id, i) => {
    const t = DATA.traitById[id];
    const isKnown = known[i];
    const lab = isKnown ? t.name : '???';
    const w = tagW(lab);
    if (tx + w > x + maxW) { tx = x; ty += 14; }
    tag(tx, ty, lab, isKnown ? 'blue' : 'neutral');
    if (hover(tx, ty, w, 11)) setTooltip(isKnown ? `${t.name}: ${t.desc}` : 'Unknown trait. It shows itself after a few days on the job.');
    tx += w + 3;
  });
  return ty - y + 14;
}

// Small selectable chip. Returns true when clicked.
export function chip(x, y, label, { on = false, dim = false, color = null, tip = null } = {}, ui, clickFn) {
  const w = D.tw(label) + 8 + (color ? 5 : 0);
  const hv = hover(x, y, w, 12);
  if (hv) { ui.pointer = true; if (tip) setTooltip(tip); }
  D.card(x, y, w, 12, on ? C.ink : hv ? C.surfaceHover : C.surface, on ? C.ink : C.border);
  let tx = x + 4;
  if (color) { D.rect(x + 3, y + 4, 3, 4, color); tx += 5; }
  D.text(label, tx, y + 2, on ? '#FFFFFF' : dim ? C.faint : C.inkSoft);
  return { w, clicked: clickFn(x, y, w, 12) };
}

export function needColor(k, v) {
  const good = k === 'stress' ? 100 - v : v;
  return good >= 60 ? C.green : good >= 30 ? C.yellow : C.red;
}
