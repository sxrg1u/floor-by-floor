// New company wizard: Industry -> Company -> Founder -> Start. Layout adapts to the logical resolution.
import { C, W, H, COMPANY_COLORS, SKINS, HAIRS, OUTFITS, HAIR_STYLES } from '../config.js';
import { DATA } from '../data.js';
import * as D from '../render/draw.js';
import { furnSprite, charSprites } from '../render/sprites.js';
import { button, tag, textField, swatches, label, hover, click, key, ui, setLayer } from './ui.js';
import { newGame } from '../state.js';
import { sfx } from '../audio.js';

const SKILL_KINDS = ['blue', 'green', 'yellow'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function startWizard(app) {
  const ind = DATA.industries[0];
  app.wiz = { step: 0, industry: 0, company: ind.companyNames[0], color: 0, name: 'Sam Okafor', look: { hair: 0, hairColor: 1, skin: 1, outfit: 0 } };
  app.scene = 'wizard';
  ui.focus = null;
}

const TOP = 58;
const bottom = () => H - 50;
const margin = () => (W >= 600 ? 40 : 20);

function steps(wz) {
  const names = ['Industry', 'Company', 'Founder'];
  let x = W - margin();
  for (let i = names.length - 1; i >= 0; i--) {
    const s = W >= 560 ? `${i + 1}  ${names[i]}` : String(i + 1);
    const w = D.tw(s) + 14;
    x -= w;
    const act = i === wz.step, done = i < wz.step;
    D.card(x, 18, w, 16, act ? C.ink : C.surface, act ? C.ink : C.border);
    D.text(s, x + 7, 22, act ? '#FFFFFF' : done ? C.ink : C.muted);
    x -= 6;
  }
}

function industryStep(app) {
  const wz = app.wiz;
  const n = DATA.industries.length, gap = 6;
  const cw = Math.min(124, Math.floor((W - margin() * 2 - gap * (n - 1)) / n));
  const x0 = Math.floor((W - (cw * n + gap * (n - 1))) / 2);
  const y = TOP, ch = bottom() - TOP - 6;
  const illus = ch >= 220 ? 70 : ch >= 185 ? 44 : 0;
  DATA.industries.forEach((ind, i) => {
    const x = x0 + i * (cw + gap);
    const sel = wz.industry === i;
    const hv = hover(x, y, cw, ch);
    if (hv) ui.pointer = true;
    D.card(x, y, cw, ch, sel || hv ? (sel ? C.surface : C.surface2) : C.surface, sel ? C.ink : hv ? C.borderStrong : C.border);
    let cy = y + 8;
    if (illus) {
      D.card(x + 6, cy, cw - 12, illus, C.bg, null);
      const def = DATA.furnById[ind.icon];
      const spr = furnSprite(def.id, def.w, def.h, COMPANY_COLORS[wz.color]);
      const s = illus >= 60 ? 2 : 1;
      D.getCtx().drawImage(spr, Math.round(x + cw / 2 - 8 * s), Math.round(cy + illus / 2 - 12 * s), 16 * s, 24 * s);
      cy += illus + 10;
    }
    if (sel) D.icon('check', x + cw - 14, y + 10, C.ink);
    D.text(D.fit(ind.name, cw - 16), x + 8, cy, C.ink);
    cy += 14;
    cy += D.paragraph(ind.blurb, x + 8, cy, cw - 16, C.muted) + 6;
    label('Skills', x + 8, cy);
    cy += 12;
    ind.skills.forEach((s, k) => tag(x + 8, cy + k * 14, s, SKILL_KINDS[k]));
    if (click(x, y, cw, ch)) {
      if (wz.industry !== i) { wz.industry = i; wz.company = DATA.industries[i].companyNames[0]; }
      sfx('click');
    }
  });
}

function columns() {
  const lx = margin();
  const px = Math.floor(W / 2) + 12;
  const pw = Math.min(240, W - margin() - px);
  const ph = Math.min(214, bottom() - TOP - 8);
  return { lx, lw: px - lx - 24, px, pw, ph };
}

function companyStep(app) {
  const wz = app.wiz;
  const ind = DATA.industries[wz.industry];
  const { lx, lw, px, pw, ph } = columns();
  const fw = Math.min(220, lw - 66);
  let y = TOP + 8;
  label('Company name', lx, y);
  wz.company = textField('company', lx, y + 14, fw, wz.company, 24);
  if (button(lx + fw + 6, y + 14, 60, 18, 'Shuffle')) wz.company = pick(ind.companyNames.filter((n) => n !== wz.company));
  y += 46;
  label('Company color', lx, y);
  const s = swatches(lx, y + 14, COMPANY_COLORS, wz.color, lw >= 190 ? 16 : 12);
  if (s != null) wz.color = s;
  y += 44;
  if (y + 24 < bottom()) D.paragraph('The color shows up on your logo, sofas, rugs and the arcade cabinet.', lx, y, lw, C.muted);

  const py = TOP + 4;
  D.card(px, py, pw, ph, C.surface, C.border);
  label('Lobby directory', px + 14, py + 14);
  const col = COMPANY_COLORS[wz.color];
  D.card(px + 14, py + 30, 44, 44, col, col);
  D.textC((wz.company.trim()[0] || '?').toUpperCase(), px + 36, py + 42, '#FFFFFF', 3);
  D.text(D.fit(wz.company || 'Untitled', pw - 80), px + 66, py + 38, C.ink);
  tag(px + 66, py + 52, D.fit(ind.name, pw - 90), 'neutral');
  D.rect(px + 14, py + 88, pw - 28, 1, C.border);
  const rows = [['1F', wz.company || 'Untitled', true], ['2F', 'Available', false], ['3F', 'Available', false], ['PH', 'Penthouse', false]];
  rows.forEach(([fl, nm, own], i) => {
    const ry = py + 100 + i * 20;
    if (ry > py + ph - 14) return;
    D.text(fl, px + 14, ry, own ? C.ink : C.faint);
    D.text(D.fit(nm, pw - 70), px + 42, ry, own ? C.ink : C.faint);
    if (own) D.rect(px + pw - 24, ry, 8, 7, col);
  });
}

function founderStep(app) {
  const wz = app.wiz;
  const { lx, lw, px, pw, ph } = columns();
  const sp = Math.max(32, Math.min(44, Math.floor((bottom() - TOP - 10) / 4)));
  const sw = lw >= 230 ? 16 : 12;
  let y = TOP + 8;
  label('Your name', lx, y);
  wz.name = textField('name', lx, y + 14, Math.min(220, lw), wz.name, 22);
  y += sp;
  label('Hair', lx, y);
  if (button(lx, y + 12, 16, 16, '‹')) wz.look.hair = (wz.look.hair + HAIR_STYLES.length - 1) % HAIR_STYLES.length;
  D.textC(HAIR_STYLES[wz.look.hair], lx + 42, y + 17, C.ink);
  if (button(lx + 68, y + 12, 16, 16, '›')) wz.look.hair = (wz.look.hair + 1) % HAIR_STYLES.length;
  let r = swatches(lx + 94, y + 13, HAIRS, wz.look.hairColor, sw); if (r != null) wz.look.hairColor = r;
  y += sp;
  label('Skin', lx, y);
  r = swatches(lx, y + 13, SKINS, wz.look.skin, sw); if (r != null) wz.look.skin = r;
  y += sp;
  label('Outfit', lx, y);
  r = swatches(lx, y + 13, OUTFITS, wz.look.outfit, sw); if (r != null) wz.look.outfit = r;

  const py = TOP + 4;
  D.card(px, py, pw, ph, C.surface, C.border);
  const s = ph >= 190 ? 6 : 4;
  const boxH = 16 * s + 30;
  D.card(px + 12, py + 12, pw - 24, boxH, C.bg, null);
  const spr = charSprites(wz.look);
  const dirs = ['down', 'right', 'up', 'left'];
  const t = Math.floor(performance.now() / 1400) % 4;
  const fr = 1 + (Math.floor(performance.now() / 180) % 2);
  D.rect(px + pw / 2 - 4 * s, py + 12 + boxH - 16, 8 * s, 5, '#E6E3DD');
  D.getCtx().drawImage(spr[dirs[t]][fr], Math.round(px + pw / 2 - 8 * s), py + 16, 16 * s, 16 * s);
  const ty = py + 12 + boxH + 10;
  D.textC(D.fit(wz.name || 'Nameless founder', pw - 24), px + pw / 2, ty, C.ink);
  if (ty + 16 < py + ph) D.textC(D.fit(`Founder · ${wz.company}`, pw - 24), px + pw / 2, ty + 14, C.muted);
}

export function drawWizard(app) {
  const wz = app.wiz;
  setLayer(0);
  D.text('New company', margin(), 16, C.ink, 2);
  steps(wz);
  D.rect(margin(), 42, W - margin() * 2, 1, C.border);
  if (wz.step === 0) industryStep(app);
  else if (wz.step === 1) companyStep(app);
  else founderStep(app);

  D.rect(margin(), H - 42, W - margin() * 2, 1, C.border);
  if (button(margin(), H - 32, 90, 20, wz.step === 0 ? 'Main menu' : 'Back', { variant: 'ghost' }) || (key('Escape') && !ui.focus)) {
    if (wz.step === 0) app.scene = 'menu'; else wz.step--;
    ui.focus = null;
  }
  const valid = wz.step === 1 ? wz.company.trim().length > 0 : wz.step === 2 ? wz.name.trim().length > 0 : true;
  const nextLabel = wz.step === 2 ? 'Found company' : 'Next';
  const nw = Math.max(120, D.tw(nextLabel) + D.tw('Enter') + 34);
  if (button(W - margin() - nw, H - 32, nw, 20, nextLabel, { variant: 'primary', disabled: !valid, kbd: 'Enter' }) || (valid && key('Enter'))) {
    ui.focus = null;
    if (wz.step < 2) wz.step++;
    else {
      const ind = DATA.industries[wz.industry];
      app.game = newGame({ industry: ind.id, company: wz.company.trim(), color: COMPANY_COLORS[wz.color], name: wz.name.trim(), look: { ...wz.look } });
      app.scene = 'game';
      sfx('ding');
    }
  }
}
