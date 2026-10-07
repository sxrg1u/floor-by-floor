// Decision events. Queued as plain data ({type, ...ids}) so a save file can hold them;
// the text and options are built when the popup is shown.
import { clock } from '../sim/time.js';
import { toast } from './notify.js';
import { sfx } from '../audio.js';
import { rel, addRel, byId, boss } from '../sim/personality.js';
import { giveRaise, promote, canPromote, marketValue } from './careers.js';
import { departure } from './hiring.js';
import { spend, fmtMoney } from './economy.js';
import { callMeeting } from './meetings.js';

const fname = (a) => a.name.split(' ')[0];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const staffOf = (g) => g.agents.filter((a) => !a.isPlayer);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function pushEvent(g, type, data = {}) {
  g.events.push({ type, ...data });
}

function allStaff(g, fn) { for (const a of staffOf(g)) fn(a); }

const EVENTS = {
  rumor: (g, e) => {
    const G = byId(g, e.g), V = byId(g, e.v), bo = boss(g);
    if (!G || !V) return null;
    const vName = V.isPlayer ? 'the boss' : fname(V);
    return {
      title: 'Rumor mill', text: `${fname(G)} has been telling everyone that ${vName} ${e.rumor}`,
      options: [
        { label: 'Clear the air at the cooler', tip: `Takes the sting out. ${fname(G)} likes you less.`, run: () => { allStaff(g, (x) => { if (x !== V) addRel(g, x, V, 4); }); addRel(g, G, bo, -5); } },
        { label: `Ask ${fname(G)} to stop`, tip: `No gossip for a week. ${fname(G)} is not happy about it.`, run: () => { G.gossipCool = clock(g.time).day + 5; addRel(g, G, bo, -10); G.loyalty = clamp(G.loyalty - 6, 0, 100); } },
        { label: 'Ignore it', tip: `Everyone thinks a little less of ${vName}.`, run: () => allStaff(g, (x) => { if (x !== V && x !== G) addRel(g, x, V, -3); }) },
      ],
    };
  },
  thermostat: (g, e) => {
    const a = byId(g, e.a), b = byId(g, e.b), bo = boss(g);
    if (!a || !b) return null;
    return {
      title: 'Thermostat war', text: `${fname(a)} and ${fname(b)} are arguing about the thermostat. Loudly. In front of a client.`,
      options: [
        { label: `Side with ${fname(a)}`, tip: `${fname(a)} likes you more, ${fname(b)} less.`, run: () => { addRel(g, a, bo, 10); addRel(g, b, bo, -10); addRel(g, a, b, -5); } },
        { label: `Side with ${fname(b)}`, tip: `${fname(b)} likes you more, ${fname(a)} less.`, run: () => { addRel(g, b, bo, 10); addRel(g, a, bo, -10); addRel(g, a, b, -5); } },
        { label: 'Buy a second thermostat ($200)', tip: 'Peace through hardware.', run: () => { spend(g, 200, 'building'); addRel(g, a, b, 15); } },
      ],
    };
  },
  romance: (g, e) => {
    const a = byId(g, e.a), b = byId(g, e.b), bo = boss(g);
    if (!a || !b) return null;
    return {
      title: 'Office romance', text: `${fname(a)} and ${fname(b)} are officially dating. They told everyone at the water cooler. Twice.`,
      options: [
        { label: 'Congratulate them', tip: 'Both like you a bit more.', run: () => { addRel(g, a, bo, 8); addRel(g, b, bo, 8); } },
        { label: 'Remind them about "professional conduct"', tip: 'Both like you a bit less.', run: () => { addRel(g, a, bo, -6); addRel(g, b, bo, -6); } },
        { label: 'Say nothing', tip: 'Love is in the air. And in the group chat.', run: () => {} },
      ],
    };
  },
  breakup: (g, e) => {
    const a = byId(g, e.a), b = byId(g, e.b);
    if (!a || !b) return null;
    const day = clock(g.time).day;
    return {
      title: 'The breakup', text: `${fname(a)} and ${fname(b)} broke up. Next to the coffee machine. During lunch. The whole floor felt it.`,
      options: [
        { label: 'Put them in different teams', tip: 'Moves one of them out of the shared team. The drama fades faster.', run: () => { if (b.task) b.task = null; for (const t of g.teams) t.members = t.members.filter((id) => id !== b.id || !t.members.includes(a.id)); g.dramaUntil = day + 1; } },
        { label: 'Give them both a day off', tip: 'They stay home tomorrow and heal faster.', run: () => { a.dayOff = day + 1; b.dayOff = day + 1; a.heartbreak = day + 2; b.heartbreak = day + 2; } },
        { label: 'Business as usual', tip: 'Everybody is sad for a few days.', run: () => {} },
      ],
    };
  },
  raise: (g, e) => {
    const a = byId(g, e.a);
    if (!a) return null;
    const want = Math.max(e.want, a.salary + 100);
    const pct = (want - a.salary) / a.salary;
    return {
      title: 'Raise request', text: `${fname(a)} wants to talk about money. They earn ${fmtMoney(a.salary)} and say the market pays ${fmtMoney(want)}. They brought a spreadsheet.`,
      options: [
        { label: `Pay the full ${fmtMoney(want)}`, tip: 'Loyalty goes up a lot.', run: () => giveRaise(g, a, pct) },
        { label: 'Meet halfway', tip: 'Half the raise. They might accept it.', run: () => { giveRaise(g, a, pct / 2); if (Math.random() < 0.4) { a.loyalty = clamp(a.loyalty - 8, 0, 100); toast(g, `${fname(a)} took it, grudgingly.`, 'yellow'); } } },
        { label: 'Not now', tip: 'Loyalty drops. Underpaid people eventually leave.', run: () => { a.loyalty = clamp(a.loyalty - 15, 0, 100); addRel(g, a, boss(g), -8); } },
      ],
    };
  },
  quit: (g, e) => {
    const a = byId(g, e.a);
    if (!a) return null;
    const opts = [
      { label: 'Counter-offer: +20% salary', tip: 'They might stay. Might.', run: () => {
        if (Math.random() < 0.6) { giveRaise(g, a, 0.2); a.loyalty = 45; toast(g, `${fname(a)} stays. For now.`, 'green'); }
        else { toast(g, `${fname(a)} already signed elsewhere.`, 'red'); departure(g, a, false); }
      } },
    ];
    if (canPromote(a)) opts.push({ label: 'Promote them on the spot', tip: 'A new title fixes a lot.', run: () => { promote(g, a); a.loyalty = 55; } });
    opts.push({ label: 'Let them go', tip: 'Their friends will be sad.', run: () => departure(g, a, false) });
    return { title: 'Resignation', text: `${fname(a)} walks into your office with a box and a speech. "I've decided to pursue other opportunities." Loyalty: ${Math.round(a.loyalty)}.`, options: opts };
  },
  printer: (g) => ({
    title: 'The printer is on fire', text: 'Again. Somebody printed a 400-page PDF of a single spreadsheet.',
    options: [
      { label: 'Buy a new printer ($400)', tip: 'Problem solved. This time.', run: () => spend(g, 400, 'building') },
      { label: 'Put it out with coffee', tip: 'Free, but the whole floor smells like burnt espresso.', run: () => allStaff(g, (x) => { x.needs.stress = clamp(x.needs.stress + 10, 0, 100); }) },
      { label: 'Ignore it', tip: 'A client visit is today. Rep -2.', run: () => { g.rep = Math.max(0, g.rep - 2); } },
    ],
  }),
  union: (g) => ({
    title: 'An intern started a union', text: 'There are flyers in the kitchen. There is a chant. It rhymes "salary" with "gallery". It does not work, but people are into it.',
    options: [
      { label: 'Hold a meeting about it', tip: 'Everyone votes. You can try to persuade them.', run: () => { if (!callMeeting(g, 'union', staffOf(g).filter((a) => a.present).map((a) => a.id))) toast(g, 'You need a Meeting Table for that. The union waits.', 'yellow'); } },
      { label: 'Recognize the union', tip: 'All salaries +5%, loyalty up for everyone.', run: () => { allStaff(g, (x) => { x.salary = Math.round(x.salary * 1.05 / 50) * 50; x.loyalty = clamp(x.loyalty + 15, 0, 100); }); g.milestoneFlags.union = true; } },
      { label: 'Threaten them', tip: 'The union dissolves. So does trust.', run: () => { allStaff(g, (x) => { x.loyalty = clamp(x.loyalty - 15, 0, 100); addRel(g, x, boss(g), -10); }); g.milestoneFlags.union = true; } },
    ],
  }),
  yogurt: (g, e) => {
    const sus = e.sus.map((id) => byId(g, id)).filter(Boolean);
    if (sus.length < 2) return null;
    const thief = byId(g, e.thief);
    const accuse = (s) => () => {
      if (s === thief) {
        s.loyalty = clamp(s.loyalty - 10, 0, 100);
        allStaff(g, (x) => { if (x !== s) addRel(g, x, boss(g), 5); });
        toast(g, `Case closed. ${fname(s)} confessed. There were 14 empty cups in their drawer.`, 'green');
      } else {
        s.loyalty = clamp(s.loyalty - 15, 0, 100); addRel(g, s, boss(g), -15);
        toast(g, `${fname(s)} is innocent and furious. The real thief is still out there.`, 'red');
      }
    };
    return {
      title: 'The yogurt thief', text: `Someone keeps stealing yogurt from the fridge. Suspects: ${sus.map(fname).join(', ')}. Clues: ${e.clue}`,
      options: [...sus.map((s) => ({ label: `Accuse ${fname(s)}`, tip: 'Get it right and everyone respects you.', run: accuse(s) })),
        { label: 'Buy more yogurt ($50)', tip: 'The coward\'s solution. It works.', run: () => spend(g, 50, 'utilities') }],
    };
  },
  consultant: (g) => ({
    title: 'A consultant appears', text: 'A man in a quarter-zip offers to "synergize your workflow" for $20,000. He has a lanyard.',
    options: [
      { label: 'Hire him ($20,000)', tip: 'Maybe output +10% for 10 days. Maybe a slide deck.', disabled: g.money < 20000, run: () => {
        spend(g, 20000, 'building');
        if (Math.random() < 0.5) { g.buffUntil = g.time + 10 * 1440; toast(g, 'Weirdly, it worked. Output +10% for 10 days.', 'green'); }
        else toast(g, 'He delivered a slide deck. It has four slides. One says "Synergy".', 'red');
      } },
      { label: 'Pay $2,000 for one buzzword', tip: 'Morale boost from pure absurdity.', run: () => { spend(g, 2000, 'building'); allStaff(g, (x) => { x.needs.fun = clamp(x.needs.fun + 20, 0, 100); }); toast(g, 'The buzzword is "flywheel". Everyone uses it ironically. Morale is up.', 'green'); } },
      { label: 'Show him the door', tip: 'Nothing happens.', run: () => {} },
    ],
  }),
  dog: (g, e) => {
    const a = byId(g, e.a);
    if (!a) return null;
    return {
      title: 'Bring your dog to work?', text: `${fname(a)} asks if Biscuit can come to the office. Biscuit is a 40 kg "puppy".`,
      options: [
        { label: 'Yes', tip: 'Everyone gets fun and social. Biscuit may eat a cable.', run: () => { allStaff(g, (x) => { x.needs.fun = clamp(x.needs.fun + 25, 0, 100); x.needs.social = clamp(x.needs.social + 15, 0, 100); }); a.loyalty = clamp(a.loyalty + 10, 0, 100); if (Math.random() < 0.3) { spend(g, 200, 'building'); toast(g, 'Biscuit ate a power cable. $200.', 'yellow'); } } },
        { label: 'No', tip: `${fname(a)} is disappointed.`, run: () => { a.loyalty = clamp(a.loyalty - 10, 0, 100); } },
      ],
    };
  },
  linkedin: (g) => ({
    title: 'Your LinkedIn post went viral', text: 'For the wrong reasons. It was a 900-word post about what a broken stapler taught you about leadership.',
    options: [
      { label: 'Apologize', tip: 'Rep -1.', run: () => { g.rep = Math.max(0, g.rep - 1); } },
      { label: 'Double down', tip: '50/50: Rep +4 or Rep -5.', run: () => { const w = Math.random() < 0.5; g.rep = clamp(g.rep + (w ? 4 : -5), 0, 100); toast(g, w ? 'It became a meme. A good one. Rep +4.' : 'It became a meme. A bad one. Rep -5.', w ? 'green' : 'red'); } },
      { label: 'Delete your account', tip: 'Nothing happens. Peace.', run: () => {} },
    ],
  }),
  industry: (g) => {
    const t = {
      game: ['Review-bombed', 'Your last game got review-bombed because the cat in level 3 cannot be petted.', 'Patch in a pettable cat', 'Ignore it'],
      ad: ['Make the logo bigger', 'A client wants the logo bigger. On a business card. That already is the logo.', 'Make it bigger', 'Push back'],
      tech: ['Investors ask about AI', 'Your investors ask how AI fits into your roadmap. You make booking software.', 'Add "AI" to the website', 'Explain the product'],
      law: ['Counter-suit', 'A former client is suing you for "emotional damages" caused by a semicolon.', 'Settle quietly', 'Fight it'],
      bakery: ['Gluten scandal', 'A food blogger claims your gluten-free bread contains gluten. It does not. Probably.', 'Run a lab test', 'Issue a statement'],
    }[g.industry];
    if (!t) return null;
    return {
      title: t[0], text: t[1],
      options: [
        { label: `${t[2]} ($600)`, tip: 'Costs money, protects your Rep.', run: () => { spend(g, 600, 'building'); g.rep = Math.min(100, g.rep + 1); } },
        { label: t[3], tip: '50/50: Rep +2 or Rep -4.', run: () => { const w = Math.random() < 0.5; g.rep = clamp(g.rep + (w ? 2 : -4), 0, 100); toast(g, w ? 'It worked out. Rep +2.' : 'It did not work out. Rep -4.', w ? 'green' : 'red'); } },
      ],
    };
  },
  ipo: (g) => ({
    title: 'The IPO', text: `Bankers in very expensive shoes say ${g.company} is worth over a million dollars. They would like to ring a bell.`,
    options: [
      { label: 'Ring the bell', tip: 'You win. The game keeps going.', run: () => { g.milestoneFlags.ipo = true; g.money += 250000; toast(g, `${g.company} is public. Everyone got a fleece vest.`, 'green'); sfx('hire'); } },
      { label: 'Stay private', tip: 'Maybe later.', run: () => {} },
    ],
  }),
};

export function eventView(g, ev) {
  const fn = EVENTS[ev.type];
  return fn ? fn(g, ev) : null;
}

// Daily random office events.
export function randomEvents(g) {
  const day = clock(g.time).day;
  const staff = staffOf(g);
  if (staff.length < 2 || day < 3 || g.events.length || Math.random() > 0.3) return;
  const pool = ['printer', 'consultant', 'linkedin', 'industry', 'dog'];
  if (staff.length >= 3 && g.furniture.some((f) => f.type === 'fridge')) pool.push('yogurt');
  const avgLoyalty = staff.reduce((s, a) => s + a.loyalty, 0) / staff.length;
  if (staff.length >= 6 && !g.milestoneFlags.union && (avgLoyalty < 55 || Math.random() < 0.15)) pool.push('union', 'union');
  const type = pick(pool);
  if (type === 'dog') { pushEvent(g, 'dog', { a: pick(staff).id }); return; }
  if (type === 'yogurt') {
    const sus = [...staff].sort(() => Math.random() - 0.5).slice(0, 3);
    const thief = sus.find((s) => s.traits.includes('party_animal') || s.traits.includes('lazy') || s.traits.includes('gossip')) || pick(sus);
    const clueTrait = thief.traits.includes('party_animal') ? 'the thief left confetti behind' : thief.traits.includes('lazy') ? 'the lid was never put back in the trash' : thief.traits.includes('gossip') ? 'someone was heard whispering near the fridge' : 'none. Trust your gut.';
    pushEvent(g, 'yogurt', { sus: sus.map((s) => s.id), thief: thief.id, clue: clueTrait });
    return;
  }
  pushEvent(g, type);
}

export function bossMood(g, a) { return rel(g, a, boss(g)); }
export { marketValue };
