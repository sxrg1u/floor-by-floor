// New company wizard: Industry -> Company -> Founder -> Start.
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

function steps(wz) {
  const names = ['Industry', 'Company', 'Founder'];
  let x = W - 24;
  for (let i = names.length - 1; i >= 0; i--) {
    const s = `${i + 1}  ${names[i]}`;
    const w = D.tw(s) + 14;
    x -= w;
    const act = i === wz.step, done = i < wz.step;
    D.card(x, 22, w, 16, act ? C.ink : C.surface, act ? C.ink : C.border);
    D.text(s, x + 7, 26, act ? '#FFFFFF' : done ? C.ink : C.muted);
    x -= 6;
  }
}

function industryStep(app) {
  const wz = app.wiz;
  const cw = 114, gap = 7, x0 = Math.floor((W - (cw * 5 + gap * 4)) / 2), y = 66, ch = 238;
  DATA.industries.forEach((ind, i) => {
    const x = x0 + i * (cw + gap);
    const sel = wz.industry === i;
    const hv = hover(x, y, cw, ch);
    if (hv) ui.pointer = true;
    D.card(x, y, cw, ch, sel ? C.surface : hv ? C.surface2 : C.surface, sel ? C.ink : hv ? C.borderStrong : C.border);
    D.card(x + 8, y + 8, cw - 16, 70, C.bg, null);
    const def = DATA.furnById[ind.icon];
    const spr = furnSprite(def.id, def.w, def.h, COMPANY_COLORS[wz.color]);
    D.getCtx().drawImage(spr, x + cw / 2 - 16, y + 18, 32, 48);
    if (sel) D.icon('check', x + cw - 16, y + 12, C.ink);
    D.text(ind.name, x + 10, y + 88, C.ink);
    D.paragraph(ind.blurb, x + 10, y + 103, cw - 20, C.muted);
    label('Skills', x + 10, y + 150);
    ind.skills.forEach((s, k) => tag(x + 10, y + 164 + k * 15, s, SKILL_KINDS[k]));
    D.text(`${ind.roles.length} roles`, x + 10, y + ch - 18, C.faint);
    if (click(x, y, cw, ch)) {
      if (wz.industry !== i) { wz.industry = i; wz.company = DATA.industries[i].companyNames[0]; }
      sfx('click');
    }
  });
}

function companyStep(app) {
  const wz = app.wiz;
  const ind = DATA.industries[wz.industry];
  const x = 48;
  label('Company name', x, 74);
  wz.company = textField('company', x, 88, 220, wz.company, 24);
  if (button(x + 226, 88, 60, 18, 'Shuffle')) { wz.company = pick(ind.companyNames.filter((n) => n !== wz.company)); }
  label('Company color', x, 124);
  const s = swatches(x, 138, COMPANY_COLORS, wz.color);
  if (s != null) wz.color = s;
  D.paragraph('The color shows up on your logo, sofas, rugs and the arcade cabinet.', x, 166, 260, C.muted);

  // preview: the lobby directory sign
  const px = 370, py = 70, pw = 222, ph = 214;
  D.card(px, py, pw, ph, C.surface, C.border);
  label('Lobby directory', px + 16, py + 16);
  const col = COMPANY_COLORS[wz.color];
  D.card(px + 16, py + 34, 48, 48, col, col);
  const initial = (wz.company.trim()[0] || '?').toUpperCase();
  D.textC(initial, px + 40, py + 47, '#FFFFFF', 3);
  D.text(D.fit(wz.company || 'Untitled', pw - 90), px + 74, py + 42, C.ink);
  tag(px + 74, py + 56, ind.name, 'neutral');
  D.rect(px + 16, py + 96, pw - 32, 1, C.border);
  const rows = [['1F', wz.company || 'Untitled', true], ['2F', 'Available', false], ['3F', 'Available', false], ['PH', 'Penthouse', false]];
  rows.forEach(([fl, nm, own], i) => {
    const ry = py + 108 + i * 22;
    D.text(fl, px + 16, ry, own ? C.ink : C.faint);
    D.text(D.fit(nm, pw - 70), px + 46, ry, own ? C.ink : C.faint);
    if (own) D.rect(px + pw - 26, ry, 8, 7, col);
  });
}

function founderStep(app) {
  const wz = app.wiz;
  const x = 48;
  label('Your name', x, 74);
  wz.name = textField('name', x, 88, 220, wz.name, 22);
  label('Hair', x, 122);
  if (button(x, 134, 18, 18, '‹')) wz.look.hair = (wz.look.hair + HAIR_STYLES.length - 1) % HAIR_STYLES.length;
  D.textC(HAIR_STYLES[wz.look.hair], x + 54, 140, C.ink);
  if (button(x + 90, 134, 18, 18, '›')) wz.look.hair = (wz.look.hair + 1) % HAIR_STYLES.length;
  let r = swatches(x + 124, 135, HAIRS, wz.look.hairColor); if (r != null) wz.look.hairColor = r;
  label('Skin', x, 168);
  r = swatches(x, 180, SKINS, wz.look.skin); if (r != null) wz.look.skin = r;
  label('Outfit', x, 212);
  r = swatches(x, 224, OUTFITS, wz.look.outfit); if (r != null) wz.look.outfit = r;
  D.paragraph('You start with skill 3 in every area. Hire specialists later.', x, 258, 260, C.muted);

  const px = 370, py = 70, pw = 222, ph = 214;
  D.card(px, py, pw, ph, C.surface, C.border);
  D.card(px + 16, py + 16, pw - 32, 140, C.bg, null);
  const spr = charSprites(wz.look);
  const dirs = ['down', 'right', 'up', 'left'];
  const t = Math.floor(performance.now() / 1400) % 4;
  const fr = 1 + (Math.floor(performance.now() / 180) % 2);
  D.rect(px + pw / 2 - 26, py + 140, 52, 6, '#E6E3DD');
  D.getCtx().drawImage(spr[dirs[t]][fr], px + pw / 2 - 48, py + 48, 96, 96);
  D.textC(D.fit(wz.name || 'Nameless founder', pw - 32), px + pw / 2, py + 168, C.ink);
  D.textC(`Founder · ${D.fit(wz.company, pw - 80)}`, px + pw / 2, py + 184, C.muted);
}

export function drawWizard(app) {
  const wz = app.wiz;
  setLayer(0);
  D.text('New company', 24, 20, C.ink, 2);
  steps(wz);
  D.rect(24, 48, W - 48, 1, C.border);
  if (wz.step === 0) industryStep(app);
  else if (wz.step === 1) companyStep(app);
  else founderStep(app);

  D.rect(24, H - 44, W - 48, 1, C.border);
  if (button(24, H - 32, 90, 20, wz.step === 0 ? 'Main menu' : 'Back', { variant: 'ghost' }) || (key('Escape') && !ui.focus)) {
    if (wz.step === 0) app.scene = 'menu'; else wz.step--;
    ui.focus = null;
  }
  const valid = wz.step === 1 ? wz.company.trim().length > 0 : wz.step === 2 ? wz.name.trim().length > 0 : true;
  const nextLabel = wz.step === 2 ? 'Found company' : 'Next';
  if (button(W - 24 - 120, H - 32, 120, 20, nextLabel, { variant: 'primary', disabled: !valid, kbd: 'Enter' }) || (valid && key('Enter'))) {
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
