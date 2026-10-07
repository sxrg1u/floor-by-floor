// Tiny WebAudio synth for pixel sound effects. No files needed.
let ac = null;
let enabled = true;
const last = {};

export function setSound(v) { enabled = v; }
export function soundOn() { return enabled; }

// ---------- chiptune music: a tiny step sequencer ----------
// Notes are MIDI numbers, one per eighth note; null = rest.
const SONGS = {
  office: {
    bpm: 96,
    lead: [72, null, 76, null, 79, null, 76, null, 74, null, 77, null, 81, null, 77, null, 72, null, 76, null, 79, null, 84, null, 83, null, 79, null, 77, 76, 74, null],
    bass: [48, null, null, null, 55, null, null, null, 50, null, null, null, 53, null, null, null, 48, null, null, null, 55, null, null, null, 55, null, null, null, 43, null, null, null],
  },
  tense: {
    bpm: 120,
    lead: [69, null, 72, 69, 76, null, 74, 72, 71, null, 74, 71, 77, null, 76, 74, 69, null, 72, 69, 76, null, 79, 77, 76, 74, 72, 71, 69, null, null, null],
    bass: [45, null, 45, null, 45, null, 45, null, 43, null, 43, null, 43, null, 43, null, 41, null, 41, null, 41, null, 41, null, 40, null, 40, null, 44, null, 44, null],
  },
};
let musicOn = true;
let song = null;
let stepIdx = 0;
let nextTime = 0;
let timer = null;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function scheduler() {
  if (!ac || !song || !musicOn) return;
  const s = SONGS[song];
  const stepLen = 60 / s.bpm / 2;
  while (nextTime < ac.currentTime + 0.12) {
    const i = stepIdx % s.lead.length;
    const delay = Math.max(0, nextTime - ac.currentTime);
    if (s.lead[i] != null) tone(hz(s.lead[i]), stepLen * 0.9, 'square', 0.012, 0, delay);
    if (s.bass[i] != null) tone(hz(s.bass[i]), stepLen * 3.5, 'triangle', 0.035, 0, delay);
    stepIdx++;
    nextTime += stepLen;
  }
}

export function setMusic(name) {
  if (name === song) return;
  song = name;
  stepIdx = 0;
  if (!ac) return;
  nextTime = ac.currentTime + 0.05;
}
export function setMusicOn(v) { musicOn = v; }
export function musicEnabled() { return musicOn; }

// Browsers only allow audio after a user gesture: call this from the first click.
export function unlockAudio() {
  actx();
  if (!timer) { nextTime = ac.currentTime + 0.1; timer = setInterval(scheduler, 30); }
}

function actx() {
  if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

function tone(freq, dur, type = 'square', vol = 0.04, slide = 0, delay = 0) {
  const a = actx();
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.linearRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const THROTTLE = { type: 70, ding: 400, blip: 60 };

export function sfx(name) {
  if (!enabled) return;
  const now = performance.now();
  if (THROTTLE[name] && now - (last[name] || 0) < THROTTLE[name]) return;
  last[name] = now;
  try {
    switch (name) {
      case 'click': tone(740, 0.035, 'square', 0.025); break;
      case 'place': tone(196, 0.06, 'square', 0.04); tone(294, 0.08, 'square', 0.035, 0, 0.05); break;
      case 'sell': tone(294, 0.06, 'square', 0.035); tone(196, 0.09, 'square', 0.035, 0, 0.05); break;
      case 'money': tone(988, 0.06, 'square', 0.035); tone(1319, 0.14, 'square', 0.035, 0, 0.06); break;
      case 'error': tone(150, 0.14, 'sawtooth', 0.03, -40); break;
      case 'ding': tone(1046, 0.25, 'triangle', 0.05); tone(1318, 0.35, 'triangle', 0.045, 0, 0.12); break;
      case 'hire': tone(523, 0.07, 'square', 0.03); tone(659, 0.07, 'square', 0.03, 0, 0.07); tone(784, 0.12, 'square', 0.03, 0, 0.14); break;
      case 'type': tone(1600 + Math.random() * 600, 0.012, 'square', 0.006); break;
      case 'blip': tone(520 + Math.random() * 200, 0.04, 'square', 0.02); break;
      case 'bad': tone(330, 0.1, 'triangle', 0.04); tone(247, 0.18, 'triangle', 0.04, 0, 0.1); break;
    }
  } catch (e) { /* audio unavailable */ }
}
