// Window contents: Rules & policies, Meetings, Milestones.
import { C } from '../config.js';
import * as D from '../render/draw.js';
import { button, tag, bar, label, scrollArea, hover, setTooltip } from './ui.js';
import { POLICY_DEFS, RULE_KEYS, TOPIC_KEYS, policyOpt, ruleChange } from '../systems/policies.js';
import { canMeet, callMeeting, cancelMeeting, delegate, veto, decree, preferences, topicDef } from '../systems/meetings.js';
import { teamLead, teamById, teamMembers } from '../systems/teams.js';
import { MILESTONES } from '../systems/milestones.js';
import { companyValue, fmtMoney } from '../systems/economy.js';
import { clock } from '../sim/time.js';
import { firstName } from '../sim/agents.js';
import { openWin } from './windows.js';

// ---------------- Rules & policies ----------------
export function policiesWin(app, win, x, y, w, h) {
  const g = app.game;
  const ix = x + 10, cw = w - 20;
  scrollArea('policies', x + 4, y + 4, w - 8, h - 8, (top) => {
    let yy = top + 2;
    label('House rules · change any time', ix, yy); yy += 13;
    for (const k of RULE_KEYS) {
      const def = POLICY_DEFS[k];
      const o = policyOpt(g, k);
      D.text(def.name, ix, yy + 3, C.inkSoft);
      if (hover(ix, yy, 80, 14)) setTooltip(def.desc);
      const lab = o.label + ' ›';
      const bw = Math.min(cw - 86, D.tw(lab) + 14);
      if (button(ix + cw - bw, yy, bw, 14, lab, { tip: def.desc })) {
        const i = def.options.indexOf(o);
        ruleChange(g, k, def.options[(i + 1) % def.options.length].id);
      }
      yy += 18;
    }
    yy += 6;
    label('Topics · staff have opinions on these', ix, yy); yy += 13;
    yy += D.paragraph('Change them in a meeting to keep people on board, or decree a change and annoy everyone who disagrees.', ix, yy, cw, C.faint) + 4;
    for (const k of TOPIC_KEYS) {
      const def = POLICY_DEFS[k];
      const o = policyOpt(g, k);
      const prefs = preferences(g, k);
      const idx = def.options.indexOf(o);
      D.card(ix, yy, cw, 44, C.surface, C.border);
      D.text(def.name, ix + 8, yy + 6, C.ink);
      D.textR(o.label, ix + cw - 8, yy + 6, C.inkSoft);
      if (hover(ix, yy, cw, 16)) setTooltip(def.desc);
      const total = prefs.reduce((s, v) => s + v, 0);
      const likes = prefs[idx];
      D.text(total ? `${likes} of ${total} like the current rule` : 'No staff yet', ix + 8, yy + 17, total && likes < total / 2 ? C.yellow : C.muted);
      if (button(ix + 8, yy + 28, 64, 12, 'Meeting', { tip: 'Open Meetings with this topic selected.' })) { g.meetingTopic = k; openWin(g, 'meetings'); }
      const next = def.options[(idx + 1) % def.options.length];
      if (button(ix + 76, yy + 28, cw - 84, 12, `Decree: ${next.label}`, { variant: 'ghost', tip: 'Instant, but everyone who prefers something else likes you less.' })) decree(g, k, (idx + 1) % def.options.length);
      yy += 48;
    }
    return yy - top + 4;
  });
}

// ---------------- Meetings ----------------
export function meetingsWin(app, win, x, y, w, h) {
  const g = app.game;
  const ix = x + 10, cw = w - 20;
  if (!g.meetingTopic || !POLICY_DEFS[g.meetingTopic]) g.meetingTopic = TOPIC_KEYS[0];
  scrollArea('meetings', x + 4, y + 4, w - 8, h - 8, (top) => {
    let yy = top + 2;
    if (g.meeting) {
      tag(ix, yy, 'In progress', 'blue'); yy += 16;
      D.text(`${topicDef(g.meeting.key).name}: people are walking to the table.`, ix, yy, C.inkSoft); yy += 14;
      if (button(ix, yy, 90, 15, 'Cancel meeting', { variant: 'danger' })) cancelMeeting(g);
      return yy - top + 24;
    }
    const why = canMeet(g);
    if (why) { yy += D.paragraph(why, ix, yy, cw, C.red) + 6; }
    label('Topic', ix, yy); yy += 12;
    for (const k of TOPIC_KEYS) {
      const def = POLICY_DEFS[k];
      const sel = g.meetingTopic === k;
      if (button(ix, yy, cw, 14, `${def.name}: ${policyOpt(g, k).label}`, { align: 'left', active: sel })) g.meetingTopic = k;
      yy += 16;
    }
    yy += 4;
    label('Who attends', ix, yy); yy += 12;
    const whoTeam = g.meetingWho != null ? teamById(g, g.meetingWho) : null;
    const wl = whoTeam ? whoTeam.name : 'Everyone in the office';
    if (button(ix, yy, cw, 14, wl + ' ›', { align: 'left', tip: 'Cycle: everyone or one team.' })) {
      const ids = [null, ...g.teams.map((t) => t.id)];
      g.meetingWho = ids[(ids.indexOf(g.meetingWho ?? null) + 1) % ids.length];
    }
    yy += 20;
    const ids = (whoTeam ? teamMembers(g, whoTeam) : g.agents.filter((a) => !a.isPlayer)).filter((a) => a.present).map((a) => a.id);
    if (button(ix, yy, cw, 17, `Call meeting (${ids.length} people)`, { variant: 'primary', disabled: !!why || !ids.length, tip: ids.length ? 'They stop working and walk to the table. The meeting starts when everyone is there.' : 'Nobody is in the office.' })) callMeeting(g, g.meetingTopic, ids);
    yy += 24;
    const leads = g.teams.map((t) => ({ t, l: teamLead(g, t) })).filter((x2) => x2.l);
    label('Delegate to a lead', ix, yy); yy += 12;
    if (!leads.length) { yy += D.paragraph('Promote someone to Lead and put them in a team. Leads can decide topics for you.', ix, yy, cw, C.faint) + 4; }
    for (const { t, l } of leads) {
      if (button(ix, yy, cw, 14, `Let ${firstName(l)} (${t.name}) decide`, { align: 'left', tip: `${t.name} votes on "${POLICY_DEFS[g.meetingTopic].name}". You get the protocol and can veto for 2 days.` })) delegate(g, t.id, g.meetingTopic);
      yy += 16;
    }
    yy += 6;
    label('Protocols', ix, yy); yy += 12;
    if (!g.meetingLog.length) { D.text('No decisions yet.', ix, yy, C.faint); yy += 12; }
    const day = clock(g.time).day;
    for (const r of g.meetingLog) {
      const def = topicDef(r.key);
      D.text(D.fit(`Day ${r.day + 1}: ${def.name} → ${r.label}`, cw - 50), ix, yy, C.inkSoft);
      D.text(`${r.pro} for, ${r.con} against${r.decree ? ' · decree' : r.lead ? ' · delegated' : ''}${r.vetoed ? ' · vetoed' : ''}`, ix, yy + 10, C.muted);
      if (r.lead && r.vetoUntil >= day && button(ix + cw - 44, yy, 44, 13, 'Veto', { variant: 'danger', tip: 'Undo the decision. The lead will not like it.' })) veto(g, r);
      yy += 24;
    }
    return yy - top + 4;
  });
}

// ---------------- Milestones ----------------
export function goalsWin(app, win, x, y, w, h) {
  const g = app.game;
  const ix = x + 10, cw = w - 20;
  scrollArea('goals', x + 4, y + 4, w - 8, h - 8, (top) => {
    let yy = top + 2;
    const v = companyValue(g);
    label('Company value', ix, yy); D.textR(fmtMoney(v), ix + cw, yy, C.ink); yy += 12;
    bar(ix, yy, cw, 3, Math.min(1, v / 1000000), C.ink); yy += 8;
    D.text('IPO needs $1,000,000 and Rep 90.', ix, yy, C.faint); yy += 16;
    for (const m of MILESTONES) {
      const done = g.milestones[m.id] != null;
      const lines = D.wrap(m.desc, cw - 30);
      const ch = 20 + lines.length * 10 + (m.unlocks ? 12 : 0);
      D.card(ix, yy, cw, ch, done ? C.greenBg : C.surface, done ? '#CFE3CC' : C.border);
      D.icon(done ? 'check' : 'goal', ix + 7, yy + 7, done ? C.green : C.faint);
      D.text(m.name, ix + 20, yy + 6, done ? C.green : C.ink);
      if (done) D.textR(`day ${g.milestones[m.id] + 1}`, ix + cw - 8, yy + 6, C.green);
      lines.forEach((l, i) => D.text(l, ix + 20, yy + 18 + i * 10, C.muted));
      if (m.unlocks) D.text(D.fit('Unlocks: ' + m.unlocks, cw - 28), ix + 20, yy + 18 + lines.length * 10 + 1, done ? C.green : C.inkSoft);
      yy += ch + 4;
    }
    return yy - top + 4;
  });
}
