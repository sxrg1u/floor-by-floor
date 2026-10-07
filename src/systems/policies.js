// Company rules. "Rules" can be set any time. "Topics" match staff opinions and should go through a meeting;
// decreeing them directly works but annoys everyone who disagrees.
import { toast } from './notify.js';

export const POLICY_DEFS = {
  hours: {
    name: 'Work hours', rule: true, desc: 'When people arrive and leave.',
    options: [
      { id: '8-16', label: '08:00 to 16:00', start: 480, end: 960 },
      { id: '9-17', label: '09:00 to 17:00', start: 540, end: 1020 },
      { id: '9-18', label: '09:00 to 18:00', start: 540, end: 1080 },
      { id: '10-19', label: '10:00 to 19:00', start: 600, end: 1140 },
    ],
  },
  lunch: {
    name: 'Lunch', rule: true, desc: 'Fixed lunch keeps the afternoon calm. Whenever hungry means random trips to the fridge.',
    options: [{ id: 'auto', label: 'Whenever hungry' }, { id: 'fixed', label: 'Fixed at 12:00' }],
  },
  coffee: {
    name: 'Breaks', rule: true, desc: 'Allowed: people grab coffee by themselves. Only when I say: no breaks unless you send them.',
    options: [{ id: 'auto', label: 'Coffee allowed' }, { id: 'manual', label: 'Only when I say' }],
  },
  overtime: {
    name: 'Overtime', topic: 'overtime', desc: 'Mandatory: everyone stays 2 hours longer. Optional: the keen ones stay 1 hour.',
    options: [{ id: 'mandatory', label: 'Mandatory', v: 1 }, { id: 'optional', label: 'Optional', v: 0 }, { id: 'none', label: 'None', v: -1 }],
  },
  remote: {
    name: 'Remote Fridays', topic: 'remote', desc: 'Fans of remote work stay home on Fridays and work at 80% speed.',
    options: [{ id: 'yes', label: 'Yes', v: 1 }, { id: 'no', label: 'No', v: 0 }],
  },
  risk: {
    name: 'Contracts', topic: 'risk', desc: 'Big and risky: larger, better-paid jobs with tight deadlines.',
    options: [{ id: 'bold', label: 'Big and risky', v: 1 }, { id: 'balanced', label: 'Balanced', v: 0 }, { id: 'safe', label: 'Play it safe', v: -1 }],
  },
  party: {
    name: 'Friday party', topic: 'moneyfun', desc: 'Party: $40 per head every Friday, fun and social for all. Bonus pool: $200 per head on payday, loyalty up.',
    options: [{ id: 'party', label: 'Party every Friday', v: 1 }, { id: 'nothing', label: 'Nothing', v: 0 }, { id: 'bonus', label: 'Bonus pool', v: -1 }],
  },
  layout: {
    name: 'Office style', topic: 'openoffice', desc: 'Open: more chatting, more stress. Quiet: less chatting, less stress.',
    options: [{ id: 'open', label: 'Open office', v: 1 }, { id: 'mixed', label: 'Mixed', v: 0 }, { id: 'quiet', label: 'Quiet zones', v: -1 }],
  },
  snacks: {
    name: 'Free snacks', topic: 'snacks', desc: '$4 per person per day. Hunger drops much slower.',
    options: [{ id: 'yes', label: 'Free snacks', v: 1 }, { id: 'no', label: 'No snacks', v: 0 }],
  },
  dress: {
    name: 'Dress code', topic: 'dresscode', desc: 'Suits impress clients (+5% pay). Hoodies cost you 3%.',
    options: [{ id: 'suits', label: 'Suits', v: 1 }, { id: 'casual', label: 'Business casual', v: 0 }, { id: 'hoodies', label: 'Hoodies', v: -1 }],
  },
  ai: {
    name: 'AI tools', topic: 'ai', desc: '$15 per day. Output +10%.',
    options: [{ id: 'yes', label: 'Use AI tools', v: 1 }, { id: 'no', label: 'No AI tools', v: 0 }],
  },
};

export const DEFAULT_POLICIES = {
  hours: '9-17', lunch: 'auto', coffee: 'auto', overtime: 'none', remote: 'no', risk: 'balanced',
  party: 'nothing', layout: 'mixed', snacks: 'no', dress: 'casual', ai: 'no',
};

export const TOPIC_KEYS = Object.keys(POLICY_DEFS).filter((k) => POLICY_DEFS[k].topic);
export const RULE_KEYS = Object.keys(POLICY_DEFS).filter((k) => POLICY_DEFS[k].rule);

export const policyOpt = (g, key) => POLICY_DEFS[key].options.find((o) => o.id === g.policies[key]) || POLICY_DEFS[key].options[0];
export const is = (g, key, id) => g.policies[key] === id;

export function workHours(g) {
  const o = policyOpt(g, 'hours');
  return { start: o.start, end: o.end };
}

// How a person feels about the current rules, from their opinions.
export function policyMood(a, g) {
  if (!a.opinions) return 0;
  let m = 0;
  for (const k of TOPIC_KEYS) m += (a.opinions[POLICY_DEFS[k].topic] || 0) * (policyOpt(g, k).v || 0) * 1.2;
  return Math.max(-10, Math.min(10, m));
}

// Who would vote for which option (index), from opinions and traits.
export function favoriteOption(a, key) {
  const def = POLICY_DEFS[key];
  const o = a.opinions ? a.opinions[def.topic] || 0 : 0;
  let best = 0, bs = -1e9;
  def.options.forEach((opt, i) => {
    const s = -Math.abs(o - opt.v * 2) + (o !== 0 && Math.sign(o) === Math.sign(opt.v) ? 0.5 : 0);
    if (s > bs) { bs = s; best = i; }
  });
  return best;
}

export function setPolicy(g, key, id) {
  g.policies[key] = id;
}

export function ruleChange(g, key, id) {
  setPolicy(g, key, id);
  toast(g, `${POLICY_DEFS[key].name}: ${policyOpt(g, key).label}.`, 'blue');
}
