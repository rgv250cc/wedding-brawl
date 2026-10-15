// Sound for the pop-up page and the brawl. Real recordings come from sounds.js (free CC0 / CC BY packs, see
// make_sounds.py); anything without a recording is synthesised from oscillators and noise.
// window.SFX.play(name, { pan, vol, pitch, dur }); SFX.mute(true|false). Audio starts on the first click, tap or key.
// For video capture: SFX.capture(true) logs sounds against the page clock instead of playing them, and
// SFX.renderWav(seconds) renders that log offline into a WAV (base64 chunks).
(() => {
'use strict';
let ac = null, out = null, noise = null, muted = false, log = null;
const R = Math.random, last = {}, BANK = {};
const GAP = { cry: .35, puke: .3, gasp: .6, cheer: 1.2, cheerSoft: .9, ufo: 2.3, tick: .025, paper: .03, splat: .12, thud: .06, flap: .5, boing: .2, faint: .3,
  clatter: .05, hic: .3, clop: .2, daze: 1, shutter: .3, beep: .2, blip: .045 };
const GAIN = { cheer: .5, cheerSoft: .45, ufo: .45, beam: .6, paper: .22, swing: .45, swingHeavy: .5, splat: .65, clatter: .45, metal: .6, bell: .7, boom: .85, thud: .75, pop: .9 };
const VOICE = /^(round\d|finalround|fight|winner|flawless|choose|p[12]|prepare|time|combo|youwin|youlose|arcademode|battlemode|ready|gameover)$/;
function ensure() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!ac && AC && !log) {
    ac = new AC();
    out = ac.createDynamicsCompressor();  // pile-ups of hits stay loud without clipping
    out.connect(ac.destination);
    noise = makeNoise(ac);
  }
  if (ac && ac.state === 'suspended') ac.resume();
  return ac;
}
function makeNoise(c) {
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1;
  return b;
}
['pointerdown', 'keydown', 'touchstart'].forEach(e => addEventListener(e, ensure, { capture: true, passive: true }));

async function load(map) {  // decode the recordings; works before any click (an offline context needs no permission)
  const dc = new OfflineAudioContext(1, 1, 44100);
  await Promise.all(Object.entries(map).map(async ([name, uris]) => {
    BANK[name] = (await Promise.all(uris.map(u => {
      const bin = atob(u.slice(u.indexOf(',') + 1)), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return dc.decodeAudioData(bytes.buffer).catch(() => null);
    }))).filter(Boolean);
  }));
}

// building blocks: b = destination bus, t = start time (s), d = duration (s)
function bus(pan, vol) {
  const g = ac.createGain(), p = ac.createStereoPanner();
  g.gain.value = vol; p.pan.value = Math.max(-1, Math.min(1, pan));
  g.connect(p).connect(out);
  return g;
}
function env(param, t, a, d, peak) {
  param.setValueAtTime(.0001, t);
  param.exponentialRampToValueAtTime(peak, t + a);
  param.exponentialRampToValueAtTime(.0001, t + a + d);
}
function osc(b, type, f0, f1, t, d, vol, a = .004) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + a + d);
  env(g.gain, t, a, d, vol); o.connect(g).connect(b); o.start(t); o.stop(t + a + d + .05);
  return o;
}
function hiss(b, type, f0, f1, t, d, vol, q = 1, a = .002) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noise; s.loop = true; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + a + d);
  env(g.gain, t, a, d, vol); s.connect(f).connect(g).connect(b); s.start(t, R()); s.stop(t + a + d + .05);
}
function wobble(o, t, d, rate, depth) {  // vibrato
  const l = ac.createOscillator(), g = ac.createGain();
  l.frequency.value = rate; g.gain.value = depth; l.connect(g).connect(o.frequency); l.start(t); l.stop(t + d + .1);
}
function clip(b, buf, t, rate) { const s = ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate; s.connect(b); s.start(t); }

const S = {  // synthesised fallbacks and the sounds no free recording covered
  punch: (b, t, p) => { osc(b, 'sine', 170 * p, 55, t, .13, .9); hiss(b, 'bandpass', 1800, 900, t, .06, .7, 1.2); },
  kick: (b, t, p) => { osc(b, 'sine', 120 * p, 40, t, .2, 1); hiss(b, 'lowpass', 1200, 300, t, .12, .6); },
  swing: (b, t, p) => hiss(b, 'bandpass', 500 * p, 2600 * p, t, .12, .22, 2, .04),
  poke: (b, t, p) => { osc(b, 'triangle', 1900 * p, 1750, t, .14, .35); osc(b, 'sine', 2900 * p, 2900 * p, t, .09, .2); },
  clonk: (b, t, p) => { osc(b, 'sine', 950 * p, 720, t, .09, .6); osc(b, 'triangle', 1400 * p, 1300, t, .14, .3); },
  smash: (b, t, p) => { hiss(b, 'highpass', 2500, 5000, t, .4, .75, .7); for (let i = 0; i < 7; i++) osc(b, 'sine', (3000 + R() * 3500) * p, 2500, t + .02 + R() * .3, .08, .15); },
  thwack: (b, t, p) => { osc(b, 'sine', 240 * p, 90, t, .1, .7); hiss(b, 'lowpass', 2600, 800, t, .07, .7); },
  pop: (b, t, p) => { hiss(b, 'bandpass', 1500, 1500, t, .03, 1, 1.5); osc(b, 'sine', 380 * p, 1300, t, .07, .5); },
  zap: (b, t, p) => { osc(b, 'square', 1600 * p, 180, t, .22, .22); osc(b, 'sawtooth', 2400 * p, 300, t, .18, .12); },
  whoops: (b, t, p) => { osc(b, 'sine', 1300 * p, 280, t, .38, .32, .02); },  // slide whistle; the thud is played separately
  whistle: (b, t, p) => osc(b, 'sine', 1800 * p, 500, t, 1.1, .2, .05),  // something falling from the sky
  thud: (b, t, p) => { osc(b, 'sine', 95 * p, 38, t, .22, 1); hiss(b, 'lowpass', 500, 150, t, .16, .7); },
  cry: (b, t, p) => { const f = 500 * p, o = osc(b, 'sawtooth', f, f * .78, t, .85, .14, .08); wobble(o, t, .9, 6.5, f * .05); hiss(b, 'bandpass', 1100, 900, t, .8, .04, 3, .1); },
  puke: (b, t, p) => { const o = osc(b, 'sawtooth', 150 * p, 70, t, .75, .3, .05); wobble(o, t, .8, 17, 30); hiss(b, 'lowpass', 900, 300, t + .1, .7, .45, 2, .05); },
  faint: (b, t, p) => osc(b, 'sine', 420 * p, 150, t, .65, .22, .05),
  boing: (b, t, p) => { const o = osc(b, 'sine', 260 * p, 820, t, .32, .35); wobble(o, t, .35, 22, 60); },
  gasp: (b, t, p) => hiss(b, 'bandpass', 650 * p, 900 * p, t, .55, .2, 5, .2),
  tick: (b, t, p) => hiss(b, 'bandpass', 2400 * p, 1800 * p, t, .025, .18, 4),
  pickup: (b, t) => { osc(b, 'square', 660, 660, t, .05, .1); osc(b, 'square', 990, 990, t + .06, .08, .1); },
  dash: (b, t) => hiss(b, 'bandpass', 400, 3000, t, .3, .35, 1.5, .05),
  flap: (b, t) => { for (let i = 0; i < 5; i++) hiss(b, 'bandpass', 900, 700, t + i * .11, .05, .18, 2); },
  disco: (b, t, p, o) => {  // four-on-the-floor with a little bass line, for o.dur seconds
    for (let s = 0, n = 0; s < (o.dur || 6); s += .25, n++) {
      if (n % 2 === 0) { osc(b, 'sine', 140, 45, t + s, .16, .8); const f = [55, 55, 82, 73][(n >> 1) % 4] * 2; osc(b, 'sawtooth', f, f, t + s, .2, .1, .01); }
      hiss(b, 'highpass', 8000, 8000, t + s + .125, .03, .16);
      if (n % 8 === 4) hiss(b, 'bandpass', 1800, 1800, t + s, .12, .3, 1);  // clap
    }
  },
  shutter: (b, t, p) => {  // camera: two mechanical clicks, then the flash recharging
    for (const d of [0, .07]) { hiss(b, 'bandpass', 3200 * p, 1600 * p, t + d, .016, .6, 3, .001); osc(b, 'triangle', 1500 * p, 800 * p, t + d, .012, .25, .001); }
    osc(b, 'sine', 900 * p, 2200 * p, t + .16, .2, .05, .5);
  },
  daze: (b, t, p) => {  // seeing stars: a run of quick high chirps with vibrato
    for (let i = 0; i < 6; i++) {
      const f = (1900 + 300 * (i % 3)) * p, s = t + i * .16, o = osc(b, 'sine', f, f * 1.5, s, .11, .18, .01);
      wobble(o, s, .12, 32, f * .04);
    }
  },
  hic: (b, t, p) => { hiss(b, 'bandpass', 1200 * p, 2200 * p, t, .05, .12, 1.5, .01); osc(b, 'sawtooth', 300 * p, 680 * p, t + .02, .1, .24, .01); },
  clop: (b, t, p) => {  // two hollow coconut-shell hoof beats
    for (const d of [0, .12]) {
      osc(b, 'sine', 560 * p, 380 * p, t + d, .09, .55, .002); osc(b, 'sine', 900 * p, 600 * p, t + d, .04, .15, .001);
      hiss(b, 'bandpass', 1900 * p, 1200 * p, t + d, .02, .35, 3, .001);
    }
  },
  blip: (b, t, p) => { osc(b, 'triangle', 520 * p, 600 * p, t, .045, .2, .004); osc(b, 'square', 1040 * p, 1150 * p, t, .025, .04, .003); },  // cartoon gibberish, one per syllable
  beep: (b, t, p) => { for (const d of [0, .1]) osc(b, 'sine', 2700 * p, 2700 * p, t + d, .05, .12, .003); },  // camera autofocus, quiet
};

function sound(name, t, o) {  // schedule one sound at time t on the current context
  const bank = BANK[name], b = bus(o.pan || 0, (o.vol ?? 1) * (GAIN[name] ?? 1));
  if (bank && bank.length) clip(b, bank[Math.floor(R() * bank.length)], t, VOICE.test(name) ? 1 : (o.pitch || 1) * (.94 + R() * .12));
  else if (S[name]) S[name](b, t, o.pitch || 1, o);
}
function play(name, o = {}) {
  if (muted || (!S[name] && !BANK[name])) return;
  const now = log ? performance.now() / 1000 : ensure() && ac.state === 'running' ? ac.currentTime : null;
  if (now === null || now - (last[name] ?? -9) < (GAP[name] ?? .035)) return;  // the crowd can't all sob in the same millisecond
  last[name] = now;
  if (log) log.push([now, name, o]); else sound(name, now + .005, o);
}
async function renderWav(seconds, rate = 44100) {
  const real = [ac, out, noise];
  ac = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
  out = ac.createDynamicsCompressor(); out.connect(ac.destination); noise = makeNoise(ac);
  for (const [t, name, o] of log) if (t < seconds) sound(name, t + .005, o);
  const buf = await ac.startRendering();
  [ac, out, noise] = real;
  const n = buf.length, dv = new DataView(new ArrayBuffer(44 + n * 4)), L = buf.getChannelData(0), Rt = buf.getChannelData(1);
  const tag = (o, s) => { for (let i = 0; i < 4; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  tag(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); tag(8, 'WAVE'); tag(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, 2, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
  tag(36, 'data'); dv.setUint32(40, n * 4, true);
  for (let i = 0, p = 44; i < n; i++, p += 4) { dv.setInt16(p, Math.max(-1, Math.min(1, L[i])) * 32767, true); dv.setInt16(p + 2, Math.max(-1, Math.min(1, Rt[i])) * 32767, true); }
  const bytes = new Uint8Array(dv.buffer), chunks = [];
  for (let i = 0; i < bytes.length; i += 3 << 20) { let s = ''; const c = bytes.subarray(i, i + (3 << 20)); for (let j = 0; j < c.length; j += 0x8000) s += String.fromCharCode.apply(null, c.subarray(j, j + 0x8000)); chunks.push(btoa(s)); }
  return chunks;
}
window.SFX = { play, ensure, load, renderWav, capture(on) { log = on ? [] : null; }, mute(m) { muted = m; }, get muted() { return muted; } };
if (window.SOUNDS) load(window.SOUNDS);
})();
