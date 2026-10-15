// Ballroom brawl: two guests fight among the rest of the wedding, as jointed paper puppets (puppet.js) with chrome parts
// wherever the photo has none. Modes: 'demo' (the CPU plays both until a keyboard or gamepad joins), 'cpu' (P1 climbs a
// three-level CPU ladder), '2p' (two players on one keyboard or two gamepads, best of 3) and 'online' (best of 3 against
// someone from the lobby: the host runs the game, the guest sends its inputs and draws the host's snapshots).
// The guests are their own disaster: at most 8 bystanders at a time walk in and out, drink, ride each other like horses,
// puke, pee in the corner, faint, flip, get abducted by a UFO, and dodge (or pose for) Moshik the photographer, whose
// flash blinds a fighter it catches from the front for 2 seconds. Sounds come from sfx.js.
// window.Brawl.start(pair?, { mode, link, onEnd }), Brawl.stop(), Brawl.state; Brawl.POSE and Brawl.drawItem feed puppets.html.
(() => {
'use strict';
const R = Math.random, TAU = Math.PI * 2, D = Math.PI / 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, pick = a => a[Math.floor(R() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const q2 = v => Math.round(v * 100) / 100, q3 = v => Math.round(v * 1000) / 1000;
const FLOOR = [0.37, 0.97];  // walkable band of the ballroom picture: back and front edge, as fractions of its height
const HP = 140, ROUND_SECONDS = 60, CROWD = 7;  // guests on the floor at once; with the photographer, 8 bystanders
const LEVELS = [  // CPU ladder: seconds between decisions, attacks per second in reach, speed, damage, odds it jumps a flash
  { name: 'EASY', think: 1, rate: 2.2, speed: .72, dmg: .75, dodge: 0 },
  { name: 'MEDIUM', think: .55, rate: 4.5, speed: .92, dmg: 1, dodge: .45 },
  { name: 'HARD', think: .3, rate: 8, speed: 1.12, dmg: 1.3, dodge: .9 },
];
const DROPS = ['fork', 'fork', 'bottle', 'bottle', 'champagne', 'champagne', 'shoe', 'shoe', 'plate'];
const MOVES = {  // reach in floor widths; t = whole move, hit = moment the blow lands (seconds)
  fist: { dmg: 6, reach: .055, t: .28, hit: .1, word: 'POW!', snd: 'punch' },
  kick: { dmg: 9, reach: .07, t: .42, hit: .18, word: 'WHAM!', snd: 'kick', low: true },
  fork: { dmg: 9, reach: .075, t: .3, hit: .12, word: 'POKE!', snd: 'poke' },
  bottle: { dmg: 13, reach: .075, t: .38, hit: .16, word: 'CLONK!', snd: 'clonk' },
  champagne: { dmg: 10, reach: .075, t: .38, hit: .16, word: 'BONK!', snd: 'bonk' },
  shoe: { dmg: 7, reach: .065, t: .3, hit: .12, word: 'THWACK!', snd: 'thwack' },
  plate: { dmg: 8, reach: .065, t: .3, hit: .12, word: 'CRASH!', snd: 'crash' },
  raygun: { dmg: 8, reach: .07, t: .3, hit: .12, word: 'BONK!', snd: 'bonk' },
};
const THROWN = { cork: [10, 'POP!', 'thwack'], laser: [12, 'ZAP!', 'zap'], fork: [9, 'POKE!', 'poke'], bottle: [12, 'SMASH!', 'smash'],
                 champagne: [11, 'BONK!', 'bonk'], shoe: [8, 'THWACK!', 'thwack'], plate: [9, 'CRASH!', 'crash'], raygun: [9, 'BONK!', 'bonk'] };
const CRIES = ['WAAAH!', 'MY DRESS!', 'NOT AT A WEDDING!', 'MOMMY!', 'OW OW OW', 'WHY ME?!', 'MY HAIR!'];
const GASPS = ['OMG!', 'WOOO!', 'FIGHT! FIGHT!', 'CALL SECURITY!', 'NOT THE CAKE!', 'GET HIM!'];
const EWW = ['EWW!', 'GROSS!', 'MY SHOES!', 'NOT AGAIN!', 'BLEUGH'];
const NOPE = ['NO!', 'NOOO!', 'NO PHOTOS!', 'NOT MY BAD SIDE!', 'I LOOK AWFUL!'];
const SMILE = ['SMILE!', 'SAY CHEESE!', 'LOOK HERE!', 'GORGEOUS!', 'ONE MORE!', 'FOR THE ALBUM!'];
const DOWN = new Set(['down', 'cry', 'ko', 'slip', 'getup', 'faint', 'flip', 'beam', 'fall']);  // can't be hit or act
const SHAPES = {  // item art in item units (~80 tall), grip at 0,0, pointing up; drawn with a white paper rim like the cut-outs
  fork: [['r', -3, -48, 6, 60, '#cfd5dd'], ['r', -11, -58, 22, 10, '#cfd5dd'], ['r', -11, -84, 4, 28, '#cfd5dd'],
         ['r', -4.5, -84, 4, 28, '#cfd5dd'], ['r', 2, -84, 4, 28, '#cfd5dd'], ['r', 7, -84, 4, 28, '#cfd5dd']],
  bottle: [['r', -13, -22, 26, 56, '#2f7d4f'], ['r', -5, -50, 10, 30, '#2f7d4f'], ['r', -13, -2, 26, 18, '#f1e2b3']],
  champagne: [['r', -14, -22, 28, 58, '#1d4a32'], ['r', -5, -52, 10, 32, '#1d4a32'], ['r', -7, -60, 14, 18, '#d8b445'], ['r', -14, 0, 28, 14, '#d8b445']],
  cork: [['r', -5, -6, 10, 12, '#c8a165']],
  shoe: [['p', new Path2D('M-34 -2C-34-20-10-24 6-14L30-4C37-1 37 5 30 7L-34 7Z'), '#d0213b'], ['r', -34, 7, 7, 22, '#8c1026']],
  plate: [['e', 0, 0, 34, 12, '#fbfbfb'], ['e', 0, 0, 21, 7, '#e3e3e3']],
  raygun: [['r', -6, -4, 12, 26, '#8d1d26'], ['r', -12, -18, 40, 18, '#c62f3a'], ['r', 0, -24, 4, 30, '#c9d1d9'], ['r', 10, -24, 4, 30, '#c9d1d9'],
           ['r', 26, -14, 18, 10, '#c9d1d9'], ['e', 47, -9, 6, 6, '#7dff6a']],
};
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- keys: physical KeyboardEvent.code, so any keyboard language works. One player: WASD + J/K/L + Space.
// Two players on one keyboard: P1 on the left (WASD, X C V, Z), P2 on the right (IJKL, , . /, M).
const LAYOUT = {
  solo: [{ up: ['KeyW', 'ArrowUp'], left: ['KeyA', 'ArrowLeft'], down: ['KeyS', 'ArrowDown'], right: ['KeyD', 'ArrowRight'],
           punch: ['KeyJ'], kick: ['KeyK'], grab: ['KeyL'], jump: ['Space'] }],
  duo: [{ up: ['KeyW'], left: ['KeyA'], down: ['KeyS'], right: ['KeyD'], punch: ['KeyX'], kick: ['KeyC'], grab: ['KeyV'], jump: ['KeyZ'] },
        { up: ['KeyI'], left: ['KeyJ'], down: ['KeyK'], right: ['KeyL'], punch: ['Comma'], kick: ['Period'], grab: ['Slash'], jump: ['KeyM'] }],
};
const HELP = {
  solo: 'WASD / arrows move · J punch · K kick · L grab/throw · Space jump',
  duo: 'P1: WASD move · X punch · C kick · V grab/throw · Z jump — P2: IJKL move · , punch · . kick · / grab/throw · M jump',
};
const CREDITS = 'Sounds: Kenney & OpenGameArt (CC0), crowd by Gregor Quendel (CC BY 4.0)';

// ---- poses for the puppets. A limb is [direction, weight] in the figure's own frame: 0 = forward, D = down, -D = up;
// weight < 1 keeps some of the photo's pose. torso/head/skirt: lean in radians (+ = forward). t = a clock in seconds,
// p = 0..1 through a move, hit = the fraction where the blow lands.
const legs = (f, b, fs = f, bs = b) => ({ fTh: [f], fSh: [fs], bTh: [b], bSh: [bs] });
function stride(t, amp = .45, lift = .7) {  // one step cycle per 2π of t; a leg bends at the knee while it swings forward
  const s = Math.sin(t), c = Math.cos(t);
  return { skirt: .12 * s, fTh: [D - amp * s], bTh: [D + amp * s], fSh: [D - amp * s + lift * Math.max(0, c)], bSh: [D + amp * s + lift * Math.max(0, -c)] };
}
const GUARD = { fUA: [D + .35], fFA: [-1], bUA: [D + .55], bFA: [-1.25] };  // fists up
const STANCE = legs(D - .22, D + .25, D + .05, D + .35), LUNGE = legs(D - .35, D + .35, D - .1, D + .45);
const POSE = {
  stand: t => ({ torso: Math.sin(t * 1.7) * .03, head: Math.sin(t * 1.1) * .05 }),
  guard: t => ({ torso: .08 + Math.sin(t * 6) * .03, ...GUARD, ...STANCE }),
  walk: t => { const s = Math.sin(t); return { ...stride(t), fUA: [D + .35 * s], bUA: [D - .35 * s], fFA: [D + .35 * s - .35], bFA: [D - .35 * s - .35] }; },
  march: t => ({ ...stride(t, .38, .55), ...GUARD, torso: .12 }),
  run: t => ({ ...stride(t, .7, 1.1), torso: .25, fUA: [-D + .5 * Math.sin(t)], fFA: [-D], bUA: [-D - .5 * Math.sin(t)], bFA: [-D] }),
  punch: (t, p, hit) => p < hit ? { torso: -.05, fUA: [D + .7], fFA: [-.5], bUA: [D + .5], bFA: [-1.2], ...STANCE }
                                : { torso: .2, fUA: [-.05], fFA: [-.05], bUA: [D + .7], bFA: [-1.3], ...LUNGE },
  kick: (t, p, hit) => p < hit ? { torso: -.1, fUA: [D - .6], fFA: [-.6], bUA: [D + .9], bFA: [D], ...legs(D - 1.1, D + .1, D + .3, D + .1) }
                               : { torso: -.3, fUA: [D - .9], fFA: [-.5], bUA: [D + 1.2], bFA: [D + .5], ...legs(-.15, D + .15, -.1, D + .15) },
  swing: (t, p, hit) => p < hit ? { torso: -.15, fUA: [-D - .5], fFA: [-D - .9], bUA: [D + .3], bFA: [-.6], ...STANCE }  // overhead, with what's in hand
                                : { torso: .25, fUA: [.5], fFA: [.75], bUA: [D + .6], bFA: [-.8], ...LUNGE },
  aim: () => ({ torso: -.05, fUA: [-.05], fFA: [-.05], bUA: [.35], bFA: [-.1], ...LUNGE }),
  throw: () => ({ torso: .25, fUA: [-.35], fFA: [-.1], bUA: [D + .7], bFA: [D], ...LUNGE }),
  jump: () => ({ torso: .1, fUA: [-.9], fFA: [-1.5], bUA: [-1.3], bFA: [-1.9], ...legs(D - 1.1, D - .5, D + .2, D + .6) }),
  hit: () => ({ torso: -.35, head: -.3, fUA: [D - 1.1], fFA: [D - 1.6], bUA: [D - .7], bFA: [D - 1.3], ...legs(D - .3, D + .2, D + .1, D + .4) }),
  lie: () => ({ head: .1, fUA: [-D + .15], fFA: [-D + .3], bUA: [-D - .1], bFA: [-D + .2], ...legs(D - .5, D + .05, D + .5, D + .1) }),
  cry: t => { const k = Math.sin(t * 11); return { head: Math.sin(t * 9) * .12, fUA: [D - .5], fFA: [-D - .5], bUA: [D - .35], bFA: [-D - .3],
    ...legs(D - .2 - .5 * Math.max(0, k), D - .2 - .5 * Math.max(0, -k), D + .1, D + .1) }; },  // a toddler tantrum, flat on the floor
  slip: t => ({ head: -.3, fUA: [-D - .4 + .3 * Math.sin(t * 20)], fFA: [-D], bUA: [-D + .5], bFA: [-D + .3], ...legs(-.3, .1, -.2, .2) }),
  swoon: () => ({ head: -.4, torso: -.1, fUA: [-D + .4], fFA: [-D + .2], bUA: [-D - .3], bFA: [-D - .5], ...legs(D - .1, D + .1) }),
  crouch: () => ({ torso: .6, head: -.4, fUA: [D - .3], fFA: [D], bUA: [D], bFA: [D + .2], ...legs(D - .9, D - .3, D + .5, D + .9) }),
  tuck: () => ({ torso: .2, fUA: [-D], fFA: [-D], bUA: [-D], bFA: [-D], ...legs(-.2, 0, D + .4, D + .6) }),
  flail: t => ({ ...stride(t * 14, .6, .9), head: Math.sin(t * 7) * .2, fUA: [-D + .5 * Math.sin(t * 14)], fFA: [-D], bUA: [-D - .5 * Math.sin(t * 14)], bFA: [-D] }),
  puke: t => ({ torso: .85 + Math.sin(t * 20) * .04, head: .15, fUA: [D - .25], fFA: [D + .25], bUA: [D - .15], bFA: [D + .3], ...legs(D - .15, D + .2, D + .05, D + .25) }),
  drink: t => { const sway = Math.sin(t * 2) * .06; return t % 2.4 < 1.4  // sip, then lower the bottle, then sip again
    ? { torso: -.1 + sway, head: -.45, fUA: [-.35], fFA: [-2.75], bUA: [D + .1], bFA: [D - .2] }
    : { torso: sway, head: 0, fUA: [D - .5], fFA: [-.4], bUA: [D + .1], bFA: [D - .2] }; },
  dance: t => { const s = Math.sin(t * 8), up = s > 0; return { torso: .15 * s, head: -.1 * s, fUA: [up ? -1.1 : D + .5], fFA: [up ? -1.2 : D + .4],
    bUA: [D - .3 + .2 * s], bFA: [-.6], ...legs(D - .35 * Math.max(0, s), D + .1, D + .25 * Math.max(0, s), D + .1) }; },
  cheer: t => { const w = .25 * Math.sin(t * 9); return { fUA: [-D + .35 + w], fFA: [-D + .1], bUA: [-D - .35 - w], bFA: [-D - .1] }; },
  pee: () => ({ torso: -.12, head: -.35, fUA: [D - .35], fFA: [D - 1.2], bUA: [D - .3], bFA: [D - 1.1], ...legs(D - .12, D + .12) }),
  horse: t => ({ torso: 1.15, head: -.8, fUA: [D - .1], fFA: [D + .15], bUA: [D], bFA: [D + .2],
    ...legs(D - .25 + .15 * Math.sin(t * 10), D + .2 - .15 * Math.sin(t * 10), D + .1, D + .25) }),
  rider: t => ({ torso: -.15 + .05 * Math.sin(t * 10), head: -.1, fUA: [.55], fFA: [.05], bUA: [-D - .25], bFA: [-D + .7 * Math.sin(t * 12)],
    ...legs(.25, .55, D + .15, D + .35) }),
  smile: () => ({ head: .12, fUA: [-.2], fFA: [-2.2], bUA: [D + .55], bFA: [D - 1.9] }),  // a peace sign for the album
  shield: () => ({ torso: -.15, head: .25, fUA: [D - .5], fFA: [-1.6], bUA: [D - .3], bFA: [-1.4] }),
  dazed: t => ({ torso: .1 * Math.sin(t * 4), head: .2 * Math.sin(t * 3), fUA: [D - .6], fFA: [-2.2], bUA: [D - .5], bFA: [-2],
    ...legs(D - .2 + .1 * Math.sin(t * 4), D + .2) }),
  camWalk: t => ({ ...stride(t, .4, .6), torso: .03 * Math.sin(t * 2) }),  // the photographer's arms never move: the camera stays in one piece
  camAim: () => ({ torso: .08, head: .15, ...legs(D - .3, D + .35, D + .05, D + .45) }),
  camShoot: () => ({ torso: -.1, head: -.12, ...legs(D - .3, D + .35, D + .05, D + .45) }),
};

let root, cv, ctx, W = 1, H = 1, S = null, raf = 0, lastT = 0, bg = null, mode = 'demo', net = null, opts0 = {}, pool = null, photogImg = null;
let nextId = 1, sentAt = 0, inSeq = 0, startSeq = 0;
const keys = new Set(), tapped = new Set();  // keys held, and keys pressed since the last frame (a tap shorter than a frame still counts)
const ctrl = ['cpu', 'cpu'];  // who drives P1 / P2: 'cpu' | 'keys' | 'pad' | 'net' (the online guest)
const ladder = { beaten: [] }, match = { wins: [0, 0] };
const rigs = new Map(), imgs = new Map(), evs = [];
let evSeq = 0;
const layout = () => mode === '2p' ? LAYOUT.duo : LAYOUT.solo;
const mySlot = () => net ? (net.role === 'host' ? 0 : 1) : 0;

const feetY = z => H * (FLOOR[0] + z * (FLOOR[1] - FLOOR[0]));
const tall = z => H * .42 * (.55 + .45 * z);  // a person's height on screen at depth z (0 = back of the floor)
const logEv = (...a) => { if (net && net.role === 'host') evs.push([++evSeq, performance.now(), ...a]); };  // replayed by the online guest
const snd = (name, x = .5, o = {}) => {
  logEv('s', name, q2(x), q2(o.pitch || 1), q2(o.vol ?? 1), o.dur || 0);
  window.SFX && window.SFX.play(name, Object.assign({ pan: (x - .5) * 1.4 }, o));
};
function art(k) {  // portrait for guest k (or 'photog'), decoded once per page
  const key = k + (window.FIGHTERS ? '' : '-small');
  if (!imgs.has(key)) {
    const i = new Image();
    i.src = k === 'photog' ? window.PHOTOG : (window.FIGHTERS && window.FIGHTERS[k]) || window.LAYERS.cards[k].img;
    imgs.set(key, i.decode().then(() => i, () => null));
  }
  return imgs.get(key);
}
function solid(img) {  // a standing figure: enough of it is opaque, and there is a head at the top
  const c = Object.assign(document.createElement('canvas'), { width: 30, height: 90 }), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, 30, 90);
  const a = g.getImageData(0, 0, 30, 90).data;
  let all = 0, top = 0;
  for (let i = 3; i < a.length; i += 4) if (a[i] > 128) { all++; if (i < 30 * 14 * 4) top++; }
  return all / 2700 > .2 && top / 420 > .12;
}
function rigFor(k, img) {  // the jointed puppet for a portrait, built once (null: draw the flat cut-out)
  if (!window.Puppet || !window.RIGS || !img || !img.naturalWidth) return null;
  const key = k + ':' + img.naturalWidth;
  if (!rigs.has(key)) {
    let r = null;
    try {
      r = Puppet.rig(img, k === 'photog' ? window.PHOTOG_RIG : window.RIGS[k], { skirt: k !== 'photog' && !window.LAYERS.cards[k].cy });
      if (k === 'photog') r.lens = lensOf(img, r);
    } catch (err) { console.warn('flat cut-out for', k, err); }
    rigs.set(key, r);
  }
  return rigs.get(key);
}
function lensOf(img, r) {  // where the flash goes off: the forward-most opaque point in the top half of the photo, as [up, forward]
  const w = img.naturalWidth, rows = Math.round(img.naturalHeight * .45), c = Object.assign(document.createElement('canvas'), { width: w, height: rows });
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const a = g.getImageData(0, 0, w, rows).data, tall0 = r.foot - r.top;
  let bx = r.cx, by = r.J.fw[1];
  for (let y = 0; y < rows; y += 2) for (let x = w - 1; x > bx; x--) if (a[(y * w + x) * 4 + 3] > 128) { bx = x; by = y; break; }
  return [(r.foot - by) / tall0, (bx - r.cx) / tall0];
}
function person(k, img, role, x, z) {
  const name = k === 'photog' ? 'Moshik' : window.guestName ? window.guestName(k) : `Guest ${k + 1}`;
  return { id: nextId++, k, img, rig: rigFor(k, img), ang: {}, sink: 0, role, name, x, z, y: 0, vx: 0, vz: 0, vy: 0, face: x < .5 ? 1 : -1,
           hp: HP, state: 'idle', st: 0, item: null, prop: null, cd: 0, rot: 0, flash: 0, think: 0, goal: null, dest: null, task: null,
           transit: null, run: false, cheer: 0, aimT: 0, walkPh: R() * TAU, seed: R() * 9, say: null, inp: {}, prev: {}, move: null, h: 1, X: 0, Y: 0 };
}
function set(e, s) {
  if (e.state === 'drink' && s !== 'drink' && e.prop) {  // the bottle goes down with them: a new weapon on the floor
    S.items.push({ type: e.prop, x: clamp(e.x + e.face * .03, .03, .97), z: e.z, y: .5, vy: 1.2, vx: e.face * .15, ammo: 0, hits: 0, held: null });
    e.prop = null;
  }
  if (e.mount && s !== 'rider') { if (e.mount.rider === e) e.mount.rider = null; e.mount = null; }
  if (e.rider && s !== 'horse') { const r = e.rider; e.rider = null; if (r.mount === e) { r.mount = null; set(r, 'fall'); r.vy = .8; say(r, 'WHOA!'); } }
  e.state = s; e.st = 0; e.done = false; e.threw = false;
  if (s === 'cry') { e.cryFor = 2.5 + R() * 3; snd('cry', e.x, { pitch: voice(e) }); }
}
const voice = e => .8 + (e.seed % 1) * .6;  // everyone sobs in their own key
const isCpu = e => e.role === 'fighter' && ctrl[S.players.indexOf(e)] === 'cpu';

// ---- effects (screen pixels; logged in screen fractions for the online guest)
const fx = o => S.fx.length < 600 && S.fx.push(o);
function at(e, up, fwd = 0) {  // a point on the figure, as fractions of its height above the feet / forward
  const c = Math.cos(e.rot), s = Math.sin(e.rot), lx = fwd * e.h, ly = -up * e.h;
  return [e.X + e.face * (lx * c - ly * s), e.Y + lx * s + ly * c];
}
function text(t, x, y, color = '#ffd23f', size = 1) {
  logEv('t', t, q3(x / W), q3(y / H), color, size);
  fx({ k: 'text', text: t, x, y, vy: -H * .1, life: .9, max: .9, color, size });
}
function pop(t, e, color, size) { const [x, y] = at(e, 1.05); text(t, x, y, color, size); }
function say(e, t) { e.say = { text: t, t: 1.8 }; }
function spray(x, y, n, color, vx, vy, r, life = .8, local) {
  if (!local) logEv('y', q3(x / W), q3(y / H), n, color, q3(vx / H), q3(vy / H), q3(r / H), life);
  for (let i = 0; i < n; i++) fx({ k: 'drop', x, y, vx: vx * (.4 + R() * .8) + (R() - .5) * H * .15, vy: -vy * (.3 + R() * .9), color, r: r * (.6 + R() * .7), life, max: life });
}
function spark(x, y, r) { logEv('k', q3(x / W), q3(y / H), q3(r / H)); fx({ k: 'spark', x, y, life: .22, max: .22, r }); }
function swoosh(x, y, face, r) { logEv('w', q3(x / W), q3(y / H), face, q3(r / H)); fx({ k: 'swoosh', x, y, face, r, life: .12, max: .12 }); }
function flashFx(x, y, face, r) { logEv('f', q3(x / W), q3(y / H), face, q3(r / H)); fx({ k: 'flash', x, y, face, r, life: .35, max: .35 }); }
function puddle(x, z, kind, size = 1, rate = 3) {
  S.puddles.push({ x: clamp(x, .04, .96), z: clamp(z, .01, .99), r: 0, max: (.03 + R() * .025) * size, kind, life: 30, rate,
                   dots: Array.from({ length: 5 }, () => [R() * 2 - 1, R() * 2 - 1]) });
}
const onPuddle = e => S.puddles.some(p => {
  const sc = .55 + .45 * p.z, dx = (e.x - p.x) / (p.r * sc + 1e-6), dz = (e.z - p.z) / (p.r * .9 * sc + 1e-6);
  return p.r > .01 && dx * dx + dz * dz < 1;
});
const near = (e, list, r) => list.filter(o => o !== e && !o.gone && Math.hypot(o.x - e.x, (o.z - e.z) * 1.5) < r);
function pukeStream(e, dt, splat) {  // projectile style; some of it lands as more puddle
  if (R() >= dt * 50) return;
  const [x, y] = at(e, .86, .06), floor = feetY(e.z);
  fx({ k: 'drop', x, y, vx: e.face * H * (.45 + R() * .45), vy: -H * (.05 + R() * .2), color: pick(['#9ccc35', '#7fae22', '#c8e05a']),
       r: e.h * .016 * (.7 + R() * .7), life: 1.2, max: 1.2, floor, splat: splat ? f => R() < .03 && puddle(f.x / W, e.z + .012, 'puke', .45) : null });
}
function tears(e, dt) { if (R() < dt * 6) { const [x, y] = at(e, .9); spray(x, y, 2, '#7fd3ff', 0, H * .25, e.h * .012, .6, true); } }

// ---- fighting
function attack(e, kind) {
  if (e.cd > 0) return;
  const it = e.item;
  if (it && it.ammo > 0 && kind === 'punch' && it.type === 'champagne') return fireCork(e);
  if (it && it.ammo > 0 && kind === 'punch' && it.type === 'raygun') return fireLaser(e);
  e.move = MOVES[it ? it.type : kind === 'kick' ? 'kick' : 'fist'];
  set(e, 'attack'); e.cd = e.move.t + .06; e.vx += e.face * .1;
  snd(kind === 'kick' ? 'swingHeavy' : 'swing', e.x);
}
function strike(e) {
  const m = e.move, [x, y] = at(e, m.low ? .35 : .62, .18);
  swoosh(x, y, e.face, e.h * .16);
  let n = 0;
  for (const v of S.people) {
    if (v === e || v.gone || DOWN.has(v.state)) continue;
    const dx = (v.x - e.x) * e.face;
    if (dx > -.01 && dx < m.reach && Math.abs(v.z - e.z) < .05 && Math.abs(v.y - e.y) < .45) {
      hurt(v, m.dmg * (isCpu(e) ? e.lv.dmg : 1), e.face, m.word, m.snd);
      if (++n === 2) break;
    }
  }
  if (n) combo(e);
  const it = e.item;
  if (n && it && (it.type === 'plate' || (it.type === 'bottle' && ++it.hits >= 2))) breakHeld(e);
}
function combo(e) {  // three hits in quick succession
  e.combo = S.t - (e.lastHit ?? -9) < 1.4 ? (e.combo || 0) + 1 : 1; e.lastHit = S.t;
  if (e.role === 'fighter' && e.combo === 3) { snd('combo'); pop('COMBO!', e, '#ff6ad5', 1.3); near(e, S.guests, .35).forEach(g => g.cheer = 1.5); }
}
function breakHeld(e) {
  const it = e.item; e.item = null; S.items.splice(S.items.indexOf(it), 1);
  const [x, y] = at(e, .55, .3); spray(x, y, 14, '#dff6ff', e.face * H * .4, H * .4, e.h * .012);
  if (it.type === 'bottle') puddle(e.x + e.face * .06, e.z + .01, 'booze');
  pop('SMASH!', e, '#bff3ff'); snd('smash', e.x);
}
function hurt(v, dmg, dir, word, sound) {
  if (v.role === 'fighter' && S.phase !== 'fight') return;  // a shot still in the air after the K.O. can't decide it again
  v.flash = .12; v.face = -dir; v.vx = dir * (.25 + dmg * .025);
  const [x, y] = at(v, .6); spark(x, y, v.h * .16);
  pop(word, v); S.shake = Math.max(S.shake, dmg * .7 * H / 600);
  snd(sound, v.x, { pitch: .9 + R() * .25 });
  if (sound === 'zap') spray(x, y, 12, '#b8ff9e', 0, H * .3, v.h * .012, .5);
  if (v.role !== 'fighter') {
    set(v, 'down'); say(v, v.role === 'photog' ? pick(['MY CAMERA!', 'NOT THE LENS!', 'I\'M WORKING!']) : pick(CRIES)); snd('thud', v.x, { vol: .6 });
    if (R() < .3) snd('gasp', v.x);
    if (v.role === 'guest' && R() < .45) S.items.push({ type: pick(DROPS), x: v.x, z: clamp(v.z + .02, 0, 1), y: .5, vy: 1.8, vx: (R() - .5) * .25, ammo: 1, hits: 0, held: null });
    if (R() < .25) puddle(v.x, v.z + .01, 'booze');  // there goes their drink
    return;
  }
  v.hp = Math.max(0, v.hp - dmg);
  if (dmg >= 12 && R() < .4) snd('cheerSoft', v.x);
  if (v.item && R() < .3) { const it = v.item; v.item = null; Object.assign(it, { held: null, x: v.x, z: v.z, y: .5, vy: 1.5, vx: -dir * .2 }); }
  if (!v.hp) return ko(v);
  if (dmg >= 12 || R() < .12) { set(v, 'down'); snd('thud', v.x); } else set(v, 'hit');
}
function grab(e) {
  if (e.item) return throwHeld(e);
  const it = S.items.find(i => !i.held && i.y === 0 && Math.abs(i.x - e.x) < .05 && Math.abs(i.z - e.z) < .05);
  if (it) { it.held = e; e.item = it; e.cd = .15; snd('pickup', e.x); }
}
function throwHeld(e) {
  const it = e.item; e.item = null; S.items.splice(S.items.indexOf(it), 1);
  S.shots.push({ type: it.type, it, x: e.x + e.face * .03, z: e.z, y: e.y + .55, vx: e.face * 1.15, vy: .7, owner: e, spin: 0 });
  set(e, 'attack'); e.move = MOVES.fist; e.done = true; e.threw = true; e.cd = .35;  // throwing pose, no melee hit
  snd('swingHeavy', e.x);
}
function fireCork(e) {
  e.item.ammo = 0; e.aimT = .4;
  S.shots.push({ type: 'cork', x: e.x + e.face * .04, z: e.z, y: e.y + .62, vx: e.face * 1.8, vy: 0, owner: e, spin: 0 });
  const [x, y] = at(e, .62, .35); spray(x, y, 18, '#fffbe6', e.face * H * .6, H * .35, e.h * .013, .7);
  pop('POP!', e, '#fff2a8'); e.vx = -e.face * .25; e.cd = .45; snd('pop', e.x);
  puddle(e.x + e.face * .03, e.z + .01, 'booze');
}
function fireLaser(e) {
  e.item.ammo--; e.cd = .35; e.aimT = .35;
  S.shots.push({ type: 'laser', x: e.x + e.face * .05, z: e.z, y: e.y + .6, vx: e.face * 2.4, vy: 0, owner: e, spin: 0 });
  const [x, y] = at(e, .6, .4); spray(x, y, 10, '#b8ff9e', e.face * H * .4, H * .2, e.h * .01, .4);
  snd('zap', e.x);
}
function ko(v) {
  if (S.phase !== 'fight') return;
  set(v, 'ko'); S.phase = 'ko'; S.phaseT = 0; S.slowT = 1.3; S.banner = 'K.O.';
  S.winner = S.players.find(p => p !== v);
  snd('boom', v.x); snd('cheer', .5, { vol: 1.2 });
}

// ---- the photographer: picks someone, walks into their lane, "SMILE!", flash. A fighter caught from the front is blinded.
function photog(e, dt, free) {
  if (e.state === 'aim') {
    if (e.target && !e.target.gone) e.face = Math.sign(e.target.x - e.x) || e.face;
    if (e.st > .9) { flash(e); set(e, 'shoot'); }
    return;
  }
  if (e.state === 'shoot') { if (e.st > .6) { set(e, 'idle'); e.target = null; e.think = 1.5 + R() * 2.5; } return; }
  if (!free) return;
  if (e.transit) return stroll(e);
  e.think -= dt;
  let t = e.target;
  if (!t || t.gone || t.transit || DOWN.has(t.state) || e.think < -7) {  // somebody new (or give up on a dodger)
    e.target = t = null;
    if (e.think > 0) { if (!e.dest && R() < dt * .5) e.dest = spot(); return stroll(e); }
    const guests = S.guests.filter(g => g.state === 'idle' && !g.transit && !g.task && !g.gone);
    t = S.phase === 'ko' && S.winner ? S.winner : S.phase === 'fight' && (R() < .55 || !guests.length) ? pick(S.players) : pick(guests);
    if (!t) return stroll(e);
    e.target = t; e.think = 0; e.dest = null;
  }
  const side = Math.sign(e.x - t.x) || 1, x = clamp(t.x + side * .2, .05, .95);
  const want = { x: Math.abs(x - t.x) < .12 ? clamp(t.x - side * .2, .05, .95) : x, z: t.z };
  if (Math.hypot(want.x - e.x, want.z - e.z) < .03) {
    e.dest = null; e.vx = e.vz = 0; e.face = Math.sign(t.x - e.x) || e.face; e.shots = (e.shots || 0) + 1;
    set(e, 'aim'); say(e, pick(SMILE)); snd('beep', e.x);
    if (t.role === 'guest' && t.state === 'idle' && !t.task) react(t);
  } else { e.dest = want; stroll(e); }
}
function react(g) {  // a guest in the viewfinder
  const r = R();
  if (r < .4) { leave(g, true); say(g, pick(NOPE)); snd('gasp', g.x); }
  else if (r < .75) { set(g, 'smile'); say(g, 'CHEESE!'); }
  else { set(g, 'shield'); say(g, pick(['NO NO NO!', 'NOT NOW!', 'MY MAKEUP!'])); }
}
function flash(e) {
  const [lu, lf] = (e.rig && e.rig.lens) || [.62, .12], [x, y] = at(e, lu, lf);
  flashFx(x, y, e.face, e.h); snd('shutter', e.x);
  for (const v of S.people) {
    if (v === e || v.gone || DOWN.has(v.state) || v.y > .2) continue;
    const dx = (v.x - e.x) * e.face;
    if (dx < .02 || dx > .5 || Math.abs(v.z - e.z) > .07 || v.face !== -e.face) continue;  // only a picture from the front blinds
    if (v.role === 'fighter' && S.phase === 'fight') {
      set(v, 'dazed'); v.dazeFor = 2; v.vx = v.vz = 0; pop('BLINDED!', v, '#ffffff'); snd('daze', v.x);
      S.white[S.players.indexOf(v)] = .6;
    } else if (v.role === 'fighter' || v.state === 'smile') pop('CLICK!', v, '#ffffff', .7);
    else if (v.role === 'guest' && ['idle', 'walk', 'shield', 'drink'].includes(v.state) && !v.transit) { set(v, 'dazed'); v.dazeFor = 1.3; }
  }
}

// ---- CPU player: chase the rival, grab loot, sometimes flatten a bystander, jump the flash if it's good enough
function cpu(p, dt) {
  const n = p.inp, lv = p.lv; n.punch = n.kick = n.grab = n.jump = false;
  const foe = S.players[0] === p ? S.players[1] : S.players[0], ph = S.photog;
  if (ph && ph.state === 'aim' && ph.st > .55 && p.sawShot !== ph.shots) {  // the flash is coming
    p.sawShot = ph.shots;
    if (R() < lv.dodge && Math.abs(ph.z - p.z) < .1) n.jump = true;
  }
  p.think -= dt;
  if (p.think <= 0 || !p.goal || (p.goal.held && p.goal !== foe) || p.goal.gone) {
    p.think = lv.think * (.7 + R() * .6);
    const closest = (list, r) => near(p, list, r).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    const loot = !p.item && closest(S.items.filter(i => !i.held && i.y === 0), .35);
    const bystander = closest(S.guests.filter(g => !g.gone && !DOWN.has(g.state)), .15);
    p.goal = loot && R() < .7 ? loot : bystander && R() < .3 ? bystander : foe;
    if (p.hp < HP * .2 && R() < .3) p.goal = { x: clamp(p.x - Math.sign(foe.x - p.x) * .3, .05, .95), z: R(), spot: true };  // catch a breath
  }
  const g = p.goal, dx = g.x - p.x, dz = g.z - p.z, loot = S.items.includes(g);
  const it = p.item, shoots = it && it.ammo > 0 && (it.type === 'champagne' || it.type === 'raygun');
  const ranged = it && (shoots || it.type === 'shoe' || it.type === 'plate');
  const want = loot || g.spot ? 0 : ranged ? .22 : .05;
  n.mx = (Math.abs(dx) > want + .015 ? Math.sign(dx) : Math.abs(dx) < want - .03 ? -Math.sign(dx) * .6 : 0) * lv.speed;
  n.mz = (Math.abs(dz) > .02 ? Math.sign(dz) * .9 : 0) * lv.speed;
  if (p.x < .18 || p.x > .82) n.mx = clamp(n.mx + (p.x < .5 ? .7 : -.7), -1.2, 1.2);  // drift back toward the middle of the floor
  if (p.z > .85) n.mz = Math.min(n.mz, -.5);
  if (loot && Math.abs(dx) < .04 && Math.abs(dz) < .04) { n.grab = true; p.goal = null; return; }
  if (loot || g.spot || Math.abs(dz) > .04 || p.cd > 0 || R() > dt * lv.rate) { if (R() < dt * .3) n.jump = true; return; }
  if (ranged && Math.abs(dx) < .5) { p.face = Math.sign(dx) || p.face; n[shoots ? 'punch' : 'grab'] = true; }
  else if (Math.abs(dx) < want + .03) { p.face = Math.sign(dx) || p.face; n[R() < .6 ? 'punch' : 'kick'] = true; }
}

// ---- humans: keys (LAYOUT), or gamepad n once any of its buttons is pressed. Buttons fire on press.
function pad(i) { const gp = navigator.getGamepads && navigator.getGamepads()[i]; return gp && gp.connected ? gp : null; }
function readControls(i) {  // { mx, mz, punch, kick, grab, jump } held right now for local player slot i
  const b = { mx: 0, mz: 0, punch: false, kick: false, grab: false, jump: false }, gp = pad(net ? 0 : i);
  if (gp && gp.buttons.some(x => x.pressed)) ctrl[i] = 'pad';
  if (ctrl[i] === 'pad' && gp) {
    const on = j => !!(gp.buttons[j] && gp.buttons[j].pressed);
    b.mx = Math.abs(gp.axes[0]) > .25 ? gp.axes[0] : on(15) - on(14);
    b.mz = Math.abs(gp.axes[1]) > .25 ? gp.axes[1] : on(13) - on(12);
    Object.assign(b, { jump: on(0), grab: on(1), punch: on(2), kick: on(3) });  // A jump, B grab/throw, X punch, Y kick
  } else {
    const lay = layout(), m = lay[net ? 0 : i] || lay[0], on = a => m[a].some(c => keys.has(c) || tapped.has(c));
    b.mx = on('right') - on('left'); b.mz = on('down') - on('up');
    Object.assign(b, { punch: on('punch'), kick: on('kick'), grab: on('grab'), jump: on('jump') });
  }
  return b;
}
function human(p, i) {
  const n = p.inp, b = readControls(i);
  n.mx = b.mx; n.mz = b.mz;
  for (const key of ['punch', 'kick', 'grab', 'jump']) { n[key] = b[key] && !p.prev[key]; p.prev[key] = b[key]; }
}
function netIn(p) {  // host: the online guest's latest controls (presses are counters, so a short tap is never lost)
  const d = net.link.latest(), n = p.inp;
  n.punch = n.kick = n.grab = n.jump = false; n.mx = n.mz = 0; p.remote = null;
  if (!d || !d.in) return;
  n.mx = clamp(+d.in.mx || 0, -1, 1); n.mz = clamp(+d.in.mz || 0, -1, 1);
  const c = Array.isArray(d.in.p) ? d.in.p : [];
  ['punch', 'kick', 'grab', 'jump'].forEach((b, i) => { const v = +c[i] || 0; if (v > (net.seen[i] ?? v)) n[b] = true; net.seen[i] = v; });
  if (Array.isArray(d.me) && d.me.length >= 5 && d.me.slice(0, 4).every(Number.isFinite)) p.remote = d.me;
  net.ack = +d.n || 0;
}

// ---- the guests' own chaos
function chaos(dt) {
  const idle = () => S.guests.filter(g => !g.gone && !g.transit && !g.task && (g.state === 'idle' || g.state === 'walk'));
  if ((S.pukeIn -= dt) <= 0) {  // somebody had too much
    S.pukeIn = 3.5 + R() * 4;
    const g = pick(idle());
    if (g) startPuke(g);
  }
  if ((S.faintIn -= dt) <= 0) {
    S.faintIn = 7 + R() * 5;
    const g = pick(idle());
    if (g) { set(g, 'faint'); say(g, pick(['*faints*', 'TOO MUCH!', 'I NEED AIR'])); snd('faint', g.x, { pitch: voice(g) }); }
  }
  if ((S.flipIn -= dt) <= 0) {  // nobody asked for a backflip
    S.flipIn = 6 + R() * 6;
    const g = pick(idle());
    if (g) { set(g, 'flip'); g.vy = 2.9; g.fail = R() < .35; g.spin = g.face; say(g, pick(['WATCH THIS!', 'HOLD MY DRINK', 'YOLO!'])); snd('boing', g.x); }
  }
  if ((S.gaspIn -= dt) <= 0) {
    S.gaspIn = 1.5 + R() * 3;
    const g = pick(idle().filter(g => !g.say));
    if (g) { say(g, pick(GASPS)); g.cheer = 1.2; }
  }
  if ((S.dovesIn -= dt) <= 0) {  // the doves for the send-off, released early
    S.dovesIn = 9 + R() * 9;
    const dir = R() < .5 ? 1 : -1;
    for (let i = 0; i < 7; i++) S.doves.push({ x: dir > 0 ? -.04 - i * .05 : 1.04 + i * .05, y: .06 + R() * .16, dir, ph: R() * 6, sp: .2 + R() * .07 });
    snd('flap');
  }
  if (S.phase === 'fight' && (S.discoIn -= dt) <= 0) {
    S.discoIn = 26; S.disco = 7;
    text('DISCO!', W / 2, H * .3, '#ff6ad5', 1.6); snd('disco', .5, { dur: 7 });
  }
  // the UFO: drifts over a guest, beams them up, sometimes leaves a ray gun; the guest comes back later, from above
  if (S.phase === 'fight' && !S.ufo && (S.ufoIn -= dt) <= 0) {
    S.ufoIn = 11 + R() * 8;
    const target = pick(idle());
    if (target) { const dir = R() < .5 ? 1 : -1; S.ufo = { x: dir > 0 ? -.15 : 1.15, y: .13, dir, state: 'in', t: 0, target, gun: S.ufos++ === 0 || R() < .5 }; }
  }
  const u = S.ufo;
  if (u) {
    u.t += dt; snd('ufo', u.x);
    if (u.state === 'in') {
      u.x += u.dir * .32 * dt;
      if (u.target.gone || u.target.transit) u.state = 'out';
      else if ((u.x - u.target.x) * u.dir >= 0) {
        u.x = u.target.x; u.state = 'beam'; u.t = 0;
        set(u.target, 'beam'); u.target.vy = 0; say(u.target, 'HELP!'); snd('beam', u.x);
        near(u.target, S.guests, .2).forEach(g => !g.say && say(g, pick(['ALIENS?!', 'TAKE HIM!', 'NOT AGAIN!'])));
      }
    } else if (u.state === 'beam') {
      if (u.target.gone || u.t > 3.5) {
        u.state = 'out';
        if (u.gun) { S.items.push({ type: 'raygun', x: clamp(u.x, .1, .9), z: .4 + R() * .3, y: 3.2, vy: 0, vx: 0, ammo: 3, hits: 0, held: null }); snd('whistle', u.x); }
      }
    } else { u.x += u.dir * .5 * dt; if (u.x < -.25 || u.x > 1.25) S.ufo = null; }
  }
}
function startPuke(g, delay = 0) {
  set(g, 'puke'); g.st = -delay; say(g, 'BLEUGH');
  near(g, S.guests, .16).forEach(o => !o.say && say(o, pick(EWW)));
}

// ---- the crowd: at most CROWD guests; they walk in from the sides, stay a while, walk off; scenes happen among them
function spot(avoid = S ? S.guests : []) {  // somewhere to stand, away from others and off the middle of the dance floor
  for (let i = 0; i < 40; i++) {
    const x = .06 + R() * .88, z = R() * .95;
    if (Math.abs(x - .5) < .3 && z > .35) continue;
    if (!avoid.some(o => Math.hypot(o.x - x, (o.z - z) * 1.2) < .09)) return { x, z };
  }
  return { x: .06 + R() * .88, z: R() * .3 };
}
function enter() {
  const here = new Set(S.guests.map(g => g.k)), c = pick(S.cast.filter(c => !here.has(c.k)));
  if (!c) return;
  const to = spot(), g = person(c.k, c.img, 'guest', R() < .5 ? -.07 : 1.07, to.z);
  g.transit = 'in'; g.dest = to; g.stay = 14 + R() * 16; g.wander = R() < .3;
  S.guests.push(g); S.people.push(g);
}
function leave(g, run) {
  g.transit = 'out'; g.task = null; g.run = !!run; g.dest = { x: g.x < .5 ? -.14 : 1.14, z: g.z };
  if (g.rider) g.rider.transit = 'out';  // a horse takes its rider along
}
function director(dt) {
  if ((S.enterIn -= dt) <= 0) { S.enterIn = 2 + R() * 3.5; if (S.guests.length < CROWD) enter(); }
  for (const g of S.guests) {
    if (!g.transit && !g.task && g.state === 'idle' && (g.stay -= dt) <= 0) leave(g);
    if (g.task === 'horse' && g.state === 'idle' && (g.waitT = (g.waitT || 0) + dt) > 10) g.task = null;  // the rider never came
    if (g.task === 'pee' && g.state === 'idle' && !g.dest) { g.task = null; leave(g); }  // interrupted at the wall: off they go
  }
  if ((S.sceneIn -= dt) <= 0) {
    S.sceneIn = 3.5 + R() * 3.5;
    if (!S.deck.length) S.deck = shuffle(['drink', 'horse', 'pee', 'drink', 'horse']);
    scene(S.deck.shift());
  }
  const out = S.guests.filter(g => g.transit === 'out' && (g.x < -.1 || g.x > 1.1));
  if (out.length) {
    for (const g of out) g.gone = g.left = true;
    S.guests = S.guests.filter(g => !g.left); S.people = S.people.filter(p => !p.left);
  }
}
function scene(kind) {
  const idle = shuffle(S.guests.filter(g => g.state === 'idle' && !g.transit && !g.task && !g.gone)), g = idle[0];
  if (!g) return;
  if (kind === 'drink') {
    set(g, 'drink'); g.prop = pick(['bottle', 'champagne']); g.drinkFor = 4 + R() * 3;
    say(g, pick(['CHEERS!', 'BOTTOMS UP!', 'ONE MORE!', 'OPEN BAR!']));
  } else if (kind === 'pee') {  // off to a back corner, facing the wall
    g.task = 'pee'; g.dest = { x: R() < .5 ? .045 : .955, z: .015 + R() * .05 };
    say(g, pick(['BRB', 'WHERE\'S THE LOO?', 'CAN\'T WAIT']));
  } else if (kind === 'horse' && idle[1]) {  // one bends over, the other climbs on
    const h = idle[1]; g.task = 'mount'; g.dest = h; h.task = 'horse'; h.waitT = 0; say(g, 'GIDDY UP!');
  }
}
function stroll(e) {  // non-fighters walk to e.dest when they have one
  if (!e.dest && e.transit === 'out') e.dest = { x: e.x < .5 ? -.14 : 1.14, z: e.z };
  if (e.dest && e.dest.id && (e.dest.gone || e.dest.left || e.dest.transit === 'out')) { e.dest = null; if (e.task === 'mount') e.task = null; }  // the horse left
  const g = e.dest;
  if (!g) { e.vx = e.vz = 0; e.state = 'idle'; return; }
  const dx = g.x - e.x, dz = g.z - e.z, d = Math.hypot(dx, dz), sp = e.run ? .3 : e.role === 'photog' ? .12 : .075;
  if (d < .015) { e.dest = null; e.vx = e.vz = 0; e.state = 'idle'; arrive(e, g); return; }
  e.vx = dx / d * sp; e.vz = dz / d * sp * .7; e.state = 'walk';
  if (Math.abs(dx) > .004) e.face = Math.sign(dx);
}
function arrive(e, g) {
  if (e.transit === 'in') e.transit = null;
  if (e.task === 'pee') { e.face = e.x < .5 ? -1 : 1; set(e, 'pee'); }
  else if (e.task === 'mount') {
    e.task = null;
    const h = g;
    if (h.task === 'horse' && h.state === 'idle' && !h.gone && !h.transit) {
      set(h, 'horse'); h.rider = e; h.rideFor = 6 + R() * 4; h.dest = spot();
      set(e, 'rider'); e.mount = h; say(e, 'YEEHAW!'); say(h, 'NEIGH!'); snd('boing', e.x);
    } else if (h.task === 'horse') h.task = null;
  }
}
const hipAt = e => e.rig ? (e.rig.foot - e.rig.J.hip[1]) / (e.rig.foot - e.rig.top) : .5;

// ---- simulation
function update(dt) {
  S.t += dt; S.phaseT += dt; S.bannerT -= dt;
  if (S.phase === 'intro' && !S.called && S.phaseT > .7) {
    S.called = true;
    snd(mode === 'cpu' ? (S.level === 3 ? 'finalround' : `round${S.level}`) : S.round < 6 ? `round${S.round}` : 'finalround');
  }
  if (S.phase === 'intro' && S.phaseT > 2) { S.phase = 'fight'; S.banner = 'FIGHT!'; S.sub = ''; S.bannerT = .9; snd('fight'); }
  if (S.phase === 'fight') {
    S.clock -= dt;
    if (S.clock <= 0) {
      const [a, b] = S.players;
      S.phase = 'ko'; S.phaseT = 0; S.banner = 'TIME!'; S.winner = a.hp === b.hp ? null : a.hp > b.hp ? a : b; snd('time');
    }
  } else if (S.phase === 'intro') { S.banner = mode === 'cpu' ? `LEVEL ${S.level}` : `ROUND ${S.round}`; S.sub = mode === 'cpu' ? LEVELS[S.level - 1].name : ''; }
  if (S.phase === 'ko') {
    const w = S.winner, wi = S.players.indexOf(w);
    if (S.phaseT > 1.4 && !S.crowned && (!w || !DOWN.has(w.state) || S.phaseT > 4)) {
      S.crowned = true; S.bannerT = 9; S.sub = '';
      if (!w) { S.banner = 'DRAW'; snd('gasp'); }  // same fighters again
      else if (mode === 'cpu') {
        set(w, 'win'); snd('cheer', w.x); S.guests.forEach(g => g.cheer = 3);
        const won = wi === 0; S.final = won && S.level === 3;
        S.banner = S.final ? 'CHAMPION!' : won ? 'YOU WIN!' : 'YOU LOSE'; snd(won ? 'youwin' : 'youlose');
        if (S.final) S.confetti = 7;
      } else {
        set(w, 'win'); snd('cheer', w.x); S.guests.forEach(g => g.cheer = 3);
        if (mode !== 'demo') match.wins[wi]++;
        S.final = mode !== 'demo' && match.wins[wi] >= 2;
        S.banner = S.final ? `${w.name} WINS THE MATCH` : `${w.name} WINS`; snd(w.hp >= HP ? 'flawless' : 'winner');
        if (S.final) S.confetti = 5;
      }
    }
    if (S.crowned && !S.next && S.phaseT > (S.final ? 8 : 5.5)) { S.next = true; next(); if (!S) return; }
  }
  if (S.phase === 'fight') S.players.forEach((p, i) => ctrl[i] === 'cpu' ? cpu(p, dt) : ctrl[i] === 'net' ? netIn(p) : human(p, i));
  else S.players.forEach(p => { p.inp.punch = p.inp.kick = p.inp.grab = p.inp.jump = false; });
  for (let i = 0; i < 2; i++) if (ctrl[i] === 'cpu' && mode === 'demo') { const gp = pad(i); if (gp && gp.buttons.some(b => b.pressed)) ctrl[i] = 'pad'; }
  tapped.clear();
  chaos(dt);
  director(dt);
  for (const e of S.people) person_(e, dt);
  for (const it of S.items) if (!it.held && (it.y > 0 || it.vy)) {
    it.vy -= 6 * dt; it.y = Math.max(0, it.y + it.vy * dt); it.x = clamp(it.x + it.vx * dt, .03, .97);
    if (!it.y) { it.vy = it.vx = 0; snd(it.type === 'raygun' ? 'metal' : 'clatter', it.x); }
  }
  const loose = S.items.filter(i => !i.held);
  if (loose.length > 12) S.items.splice(S.items.indexOf(loose.find(i => i.type !== 'raygun') || loose[0]), 1);  // tidy the oldest leftovers away
  for (const s of S.shots) {
    s.x += s.vx * dt; s.spin += dt * 16;
    if (s.type !== 'cork' && s.type !== 'laser') { s.vy -= 2.6 * dt; s.y += s.vy * dt; }
    const v = S.people.find(v => v !== s.owner && !v.gone && !DOWN.has(v.state) && Math.abs(v.z - s.z) < .05 && Math.abs(v.x - s.x) < .03 && v.y < s.y);
    if (v) {
      const [dmg, word, sound] = THROWN[s.type];
      hurt(v, dmg * (isCpu(s.owner) ? s.owner.lv.dmg : 1), Math.sign(s.vx), word, sound);
      if (v.role === 'fighter') combo(s.owner);
      land(s, true);
    } else if (s.y <= 0) land(s);
    else if (s.x < -.05 || s.x > 1.05) s.dead = true;
  }
  S.shots = S.shots.filter(s => !s.dead);
  for (const p of S.puddles) { p.r += (p.max - p.r) * Math.min(1, dt * p.rate); p.life -= dt; }
  S.puddles = S.puddles.filter(p => p.life > 0);
  ambient(dt);
}
function ambient(dt) {  // the purely visual part, run by host and online guest alike
  for (const d of S.doves) d.x += d.dir * d.sp * dt;
  S.doves = S.doves.filter(d => d.x > -.4 && d.x < 1.4);
  if (S.disco > 0) S.disco -= dt;
  S.white = S.white.map(w => Math.max(0, w - dt * 1.6));
  if (S.confetti > 0) {
    S.confetti -= dt;
    for (let i = 0; i < 2; i++) fx({ k: 'conf', x: R() * W, y: -H * .02, vy: H * (.12 + R() * .1), ph: R() * 6, spin: R() * 6, r: H * .007,
                                      color: pick(['#ff4d6d', '#ffd23f', '#4dd2ff', '#7dff6a', '#ffffff', '#c77dff']), life: 7, max: 7 });
  }
  for (const f of S.fx) {
    f.life -= dt;
    if (f.k === 'drop') {
      f.vy += H * 1.6 * dt; f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.floor && f.y > f.floor) { f.life = 0; f.splat && f.splat(f); }  // vomit that reaches the floor
    } else if (f.k === 'text') f.y += f.vy * dt;
    else if (f.k === 'conf') { f.y += f.vy * dt; f.x += Math.sin(S.t * 3 + f.ph) * H * .06 * dt; f.spin += dt * 5; if (f.y > H) f.life = 0; }
  }
  S.fx = S.fx.filter(f => f.life > 0);
}
function land(s, hit) {
  s.dead = true;
  if (s.type === 'cork' || s.type === 'laser') return;
  if (s.type === 'plate' || s.type === 'bottle') {
    const h = tall(s.z); spray(s.x * W, feetY(s.z) - Math.max(s.y, 0) * h, 14, '#e8f7ff', 0, H * .35, h * .012);
    if (s.type === 'bottle') puddle(s.x, s.z + .01, 'booze');
    if (!hit) snd(s.type === 'bottle' ? 'smash' : 'crash', s.x);
    return;
  }
  if (!hit) snd('clatter', s.x);
  S.items.push(Object.assign(s.it, { x: clamp(s.x, .03, .97), z: s.z, y: Math.max(s.y, 0), vy: .8, vx: -Math.sign(s.vx) * .15, held: null }));
}
function person_(e, dt) {
  if (e.gone) {  // up in the saucer; drops back in from the sky
    if (!e.left && (e.awayT -= dt) <= 0) {
      Object.assign(e, { gone: false, x: .12 + R() * .76, z: R() * .9, y: 3.4, vy: 0, vx: 0, vz: 0 });
      set(e, 'fall'); say(e, 'AAAAH!'); snd('whistle', e.x);
    }
    return;
  }
  e.st += dt; e.cd -= dt; e.flash -= dt; e.aimT -= dt; e.cheer -= dt;
  if (e.say && (e.say.t -= dt) <= 0) e.say = null;
  const free = e.state === 'idle' || e.state === 'walk', pinned = !!e.remote && free && S.phase === 'fight';
  if (e.role === 'fighter') {
    const n = e.inp;
    if (pinned) {  // the online guest moves its own fighter; the host takes its word for where it is while it's free
      const [x, z, y, f, walking] = e.remote, nx = clamp(x, .04, .96);
      if (!e.y && y > .05) snd('swing', e.x, { pitch: .6 });
      e.vx = clamp(n.mx || 0, -1, 1) * .3; e.vz = clamp(n.mz || 0, -1, 1) * .18; e.x = nx; e.z = clamp(z, 0, 1); e.y = clamp(y, 0, 3); e.vy = 0; e.face = f < 0 ? -1 : 1;
      e.state = walking ? 'walk' : 'idle';
      if (n.grab) grab(e); else if (n.punch || n.kick) attack(e, n.kick ? 'kick' : 'punch');
    } else if (free && S.phase === 'fight') {
      e.vx = (n.mx || 0) * .3; e.vz = (n.mz || 0) * .18;
      if (n.mx) e.face = Math.sign(n.mx);
      e.state = n.mx || n.mz ? 'walk' : 'idle';
      if (n.jump && !e.y) { e.vy = 2.3; snd('swing', e.x, { pitch: .6 }); }
      if (n.grab) grab(e); else if (n.punch || n.kick) attack(e, n.kick ? 'kick' : 'punch');
    } else if (free) { e.vx = e.vz = 0; e.state = 'idle'; }
  } else if (e.role === 'photog') photog(e, dt, free);
  else if (free) {
    if (!e.dest && e.wander && !e.transit && !e.task && !(S.disco > 0) && R() < dt * .4) e.dest = spot();
    stroll(e);
  }
  if (free && !e.y && Math.abs(e.vx) + Math.abs(e.vz) > .03 && onPuddle(e) && R() < dt * (e.role === 'fighter' ? 2.2 : 1.6)) {  // whoops
    set(e, 'slip'); pop('WHOOPS!', e, '#8fdcff'); snd('whoops', e.x);
    if (e.role === 'fighter') e.hp = Math.max(1, e.hp - 3);
  }
  switch (e.state) {
    case 'attack': if (!e.done && e.st >= e.move.hit) { e.done = true; strike(e); } if (e.st >= e.move.t) set(e, 'idle'); break;
    case 'hit': if (e.st > .28) set(e, 'idle'); break;
    case 'down': if (e.st > (e.role === 'guest' ? .6 : 1.1)) set(e, e.role === 'guest' ? 'cry' : 'getup'); break;
    case 'cry':
      if (e.st > e.cryFor) set(e, 'getup');
      tears(e, dt);
      if (!e.say && R() < dt * .7) { say(e, pick(CRIES)); snd('cry', e.x, { pitch: voice(e) }); }
      break;
    case 'slip': if (!e.done && e.st > .38) { e.done = true; snd('thud', e.x); }
      if (e.st > 1.1) set(e, e.role === 'guest' && R() < .55 ? 'cry' : 'getup'); break;
    case 'faint': if (!e.done && e.st > .55) { e.done = true; snd('thud', e.x, { vol: .8 }); } if (e.st > 3.2) set(e, 'getup'); break;
    case 'getup': if (e.st > .45) set(e, 'idle'); break;
    case 'dazed': if (e.st > (e.dazeFor || 2)) set(e, 'idle'); break;
    case 'smile': case 'shield': if (e.st > 1.6) set(e, 'idle'); break;
    case 'flip':
      if (e.st > .25 && !e.y) {
        e.rot = 0;
        if (e.fail) { set(e, 'down'); pop('OOF!', e, '#ffb0b0'); snd('thud', e.x); } else { set(e, 'idle'); say(e, 'TA-DA!'); snd('cheerSoft', e.x); }
      }
      break;
    case 'beam': e.y += dt * 1.3; if (S.ufo ? e.Y < S.ufo.y * H + H * .03 : e.st > 4) { e.gone = true; e.awayT = 3 + R() * 3; } break;
    case 'fall': if (!e.y && e.st > .1) { set(e, 'down'); S.shake = Math.max(S.shake, H * .012); snd('thud', e.x, { vol: 1.2 }); pop('THUD!', e, '#ffd23f'); } break;
    case 'puke':
      if (e.st >= 0 && e.st < 1.4) { if (e.st < dt + .001) snd('puke', e.x, { pitch: voice(e) }); pukeStream(e, dt, true); }
      else if (e.st >= 1.4) {
        puddle(e.x + e.face * .07, e.z + .015, 'puke', 1.4); snd('splat', e.x); set(e, 'idle');
        for (const o of near(e, S.guests, .14)) if ((o.state === 'idle' || o.state === 'walk') && !o.transit && R() < .45) startPuke(o, .3 + R() * .6);  // sympathetic pukers
      }
      break;
    case 'drink':
      if (R() < dt * .7) { pop('HIC!', e, '#ffe9a8', .6); snd('hic', e.x, { pitch: voice(e) }); }
      if (e.st > e.drinkFor) {
        set(e, 'idle');
        if (R() < .4) startPuke(e, .6); else say(e, pick(['ANOTHER ONE!', 'I LOVE YOU GUYS', 'WHO MOVED THE FLOOR?']));
      }
      break;
    case 'pee':  // discreet: facing the wall in a back corner; all anyone sees is the puddle
      if (!e.done && e.st > .5) {
        e.done = true; say(e, pick(['AHHH...', 'SO MUCH BETTER', '*whistles*']));
        puddle(e.x + e.face * .02, e.z + .006, 'pee', .9, .35);
        for (const o of near(e, S.guests, .3)) if (!o.say) say(o, pick(['EWW!', 'DUDE!', 'NOT THE CORNER!', 'REALLY?!', 'GROSS!']));
      }
      if (e.st > 4) { e.task = null; set(e, 'idle'); leave(e); }
      break;
    case 'horse': {
      if (!e.rider || e.rider.mount !== e) { e.task = null; e.rider = null; set(e, 'idle'); say(e, 'HEY!'); break; }
      if (e.st > e.rideFor && e.transit !== 'out') { e.transit = e.rider.transit = 'out'; e.dest = { x: e.x < .5 ? -.2 : 1.2, z: e.z }; }  // gallop off together
      if (!e.dest || Math.hypot(e.dest.x - e.x, e.dest.z - e.z) < .02) e.dest = spot();
      const dx = e.dest.x - e.x, dz = e.dest.z - e.z, d = Math.hypot(dx, dz) || 1;
      e.vx = dx / d * .11; e.vz = dz / d * .07; if (Math.abs(dx) > .004) e.face = Math.sign(dx);
      if (R() < dt * 5) snd('clop', e.x);
      if (!e.rider.say && R() < dt * .5) say(e.rider, pick(['YEEHAW!', 'GIDDY UP!', 'FASTER!', 'WHEEE!']));
      break;
    }
    case 'rider': {
      const h = e.mount;
      if (!h || h.gone || h.left || h.rider !== e || h.state !== 'horse') { e.mount = null; set(e, 'fall'); e.vy = .5; break; }
      e.x = h.x + h.face * .02; e.z = h.z + .002; e.face = h.face; e.vx = e.vz = 0; e.vy = 0;
      e.y = Math.max(0, hipAt(h) - (h.sink || 0) - hipAt(e) + .08) + Math.abs(Math.sin(h.walkPh)) * .03;
      break;
    }
    case 'win': if (!e.y && R() < dt * 3) e.vy = 1.7; break;
  }
  const lying = ['down', 'cry', 'ko', 'slip'].includes(e.state) || (e.state === 'faint' && e.st > .4);
  if (e.state === 'flip') e.rot = -TAU * clamp(e.st / .8, 0, 1) * e.spin;
  else if (e.state === 'beam' || e.state === 'fall') e.rot += dt * 6;
  else {
    e.rot = ((e.rot + Math.PI) % TAU + TAU) % TAU - Math.PI;  // unwind a spin before settling
    const target = lying ? -D : e.state === 'faint' ? Math.sin(e.st * 18) * .15 : 0;
    e.rot += (target - e.rot) * Math.min(1, dt * (e.state === 'slip' ? 24 : e.state === 'getup' ? 7 : e.state === 'faint' ? 5 : 14));
  }
  const wide = e.transit || e.state === 'horse' || e.state === 'rider';
  if (!pinned) { e.x = clamp(e.x + e.vx * dt, wide ? -.25 : .04, wide ? 1.25 : .96); e.z = clamp(e.z + e.vz * dt, 0, 1); }
  if (!free && e.state !== 'horse') { const f = Math.exp(-5 * dt); e.vx *= f; e.vz *= f; }  // knockbacks die down; walking speeds are set fresh each frame
  if (!pinned && e.state !== 'beam' && e.state !== 'rider' && (e.y > 0 || e.vy > 0)) { e.vy -= 7 * dt; e.y = Math.max(0, e.y + e.vy * dt); if (!e.y) e.vy = 0; }
  if (e.state === 'walk' || e.state === 'horse') e.walkPh += dt * (5 + Math.hypot(e.vx, e.vz) * 30);
  place(e); animate(e, dt);
}
function place(e) { e.h = tall(e.z); e.X = e.x * W; e.Y = feetY(e.z) - e.y * e.h; }

// ---- puppet animation: every frame each joint eases toward the pose for what the person is doing
function poseFor(e) {
  const t = S.t + e.seed, st = e.st;
  switch (e.state) {
    case 'attack': {
      if (e.threw) return POSE.throw();
      const m = e.move || MOVES.fist, f = m === MOVES.kick ? POSE.kick : m === MOVES.fist || m === MOVES.fork ? POSE.punch : POSE.swing;
      return f(t, st / m.t, m.hit / m.t);
    }
    case 'hit': return POSE.hit();
    case 'down': case 'ko': return POSE.lie();
    case 'cry': return POSE.cry(t);
    case 'slip': return st < .6 ? POSE.slip(t) : POSE.lie();
    case 'faint': return st < .45 ? POSE.swoon() : POSE.lie();
    case 'getup': return POSE.crouch();
    case 'flip': return POSE.tuck();
    case 'beam': case 'fall': return POSE.flail(t);
    case 'puke': return POSE.puke(t);
    case 'win': return POSE.cheer(t);
    case 'dazed': return POSE.dazed(t);
    case 'drink': return POSE.drink(st);
    case 'horse': return POSE.horse(t);
    case 'rider': return POSE.rider(t);
    case 'pee': return POSE.pee();
    case 'smile': return POSE.smile();
    case 'shield': return POSE.shield();
    case 'aim': return POSE.camAim();
    case 'shoot': return POSE.camShoot();
  }
  const walking = e.state === 'walk';
  if (e.aimT > 0) return POSE.aim();
  if (e.role === 'fighter') return e.y > .02 ? POSE.jump() : walking ? POSE.march(e.walkPh) : POSE.guard(t);
  if (e.role === 'photog') return walking ? POSE.camWalk(e.walkPh) : POSE.stand(t);
  if (walking) return e.run ? POSE.run(e.walkPh) : POSE.walk(e.walkPh);
  if (S.disco > 0) return POSE.dance(t);
  if (e.cheer > 0) return POSE.cheer(t);
  return POSE.stand(t);
}
function animate(e, dt) {
  if (!e.rig) return;
  const tgt = Puppet.solve(e.rig, poseFor(e)), k = Math.min(1, dt * (e.state === 'attack' ? 30 : DOWN.has(e.state) ? 9 : 15));
  for (const n in tgt) e.ang[n] = (e.ang[n] || 0) + (tgt[n] - (e.ang[n] || 0)) * k;
  const upright = !['down', 'cry', 'ko', 'slip', 'faint', 'flip', 'beam', 'fall', 'rider'].includes(e.state) && e.y < .02;
  e.sink += ((upright ? Puppet.sink(e.rig, e.ang) : 0) - e.sink) * k;  // bent knees lower the body instead of lifting the feet
}

// ---- drawing
function drawItem(type, h, ang, ammo, g = ctx) {
  const s = h / 330, parts = type === 'champagne' && ammo ? SHAPES.champagne.concat([['r', -4, -72, 8, 13, '#c8a165']]) : SHAPES[type];
  if (!parts) return;
  g.save(); g.rotate(ang); g.scale(s, s); g.lineJoin = 'round';
  for (const pass of [0, 1]) for (const [k, ...a] of parts) {  // pass 0: white paper rim, pass 1: colour
    const fill = a[a.length - 1];
    let path = null;
    if (k === 'p') path = a[0];
    else { g.beginPath(); k === 'r' ? g.roundRect(a[0], a[1], a[2], a[3], 4) : g.ellipse(a[0], a[1], a[2], a[3], 0, 0, TAU); }
    if (pass) { g.fillStyle = fill; path ? g.fill(path) : g.fill(); }
    else { g.lineWidth = 8; g.strokeStyle = '#fff'; path ? g.stroke(path) : g.stroke(); }
  }
  g.restore();
}
function holding(e) {  // in the front hand: +x runs along the forearm, so 0 = held like a hammer, D = pointing where the arm points
  const type = e.item ? e.item.type : e.prop;
  const ang = type === 'raygun' ? 0 : e.aimT > 0 || (e.state === 'attack' && e.move === MOVES.fork) ? D : e.state === 'drink' ? D + .5 : 0;
  drawItem(type, e.h, ang, e.item ? e.item.ammo : 0);
}
function star(x, y, r, fill) {
  ctx.fillStyle = fill; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const q = i * TAU / 10 - Math.PI / 2, rr = i % 2 ? r * .45 : r; ctx.lineTo(x + Math.cos(q) * rr, y + Math.sin(q) * rr); }
  ctx.closePath(); ctx.fill();
}
const TEAM = ['#ff4d3a', '#3aa0ff'];
function drawPerson(e) {
  if (!e.img) return;
  const h = e.h, p = S.players.indexOf(e);
  ctx.fillStyle = 'rgba(25, 12, 0, .3)';
  ctx.beginPath(); ctx.ellipse(e.X, feetY(e.z), Math.max(2, h * .14 * (1 - Math.min(e.y, .8)) + (e.rot < -1 && e.state !== 'flip' ? h * .25 : 0)), h * .04, 0, 0, TAU); ctx.fill();
  if (p >= 0) {  // fighter: team ring on the floor and a tag overhead, so they stand out from the crowd
    ctx.strokeStyle = TEAM[p]; ctx.lineWidth = h * .012;
    ctx.beginPath(); ctx.ellipse(e.X, feetY(e.z), h * .16, h * .045, 0, 0, TAU); ctx.stroke();
    if (!DOWN.has(e.state)) { const [x, y] = at(e, 1.1); label(net ? (p === mySlot() ? 'YOU' : 'P' + (p + 1)) : `P${p + 1}`, x, y, h * .07, 'center', TEAM[p], 'pixel'); }
  }
  const dancing = S.disco > 0 && e.role === 'guest' && (e.state === 'idle' || e.state === 'walk');
  const bob = e.state === 'walk' || e.state === 'horse' ? Math.abs(Math.sin(e.walkPh)) * h * .02 : dancing ? Math.abs(Math.sin(S.t * 8 + e.seed)) * h * .03
    : DOWN.has(e.state) ? 0 : (Math.sin(S.t * 2.2 + e.seed) * .5 + .5) * h * .005;
  ctx.save(); ctx.translate(e.X, e.Y - bob); ctx.scale(e.face, 1); ctx.rotate(e.rot);
  if (e.flash > 0) ctx.filter = 'brightness(2.6)';
  if (e.rig) Puppet.draw(ctx, e.rig, e.ang, h, { sink: e.sink, hand: e.item || e.prop ? () => holding(e) : null });
  else {
    const w = h * e.img.width / e.img.height;
    ctx.drawImage(e.img, -w / 2, -h, w, h);
    if (e.item) { ctx.translate(w * .3, -h * .5); drawItem(e.item.type, h, -.35, e.item.ammo); }
  }
  ctx.filter = 'none';
  ctx.restore();
  if (e.state === 'faint' || e.state === 'ko' || e.state === 'dazed' || (e.role === 'fighter' && e.state === 'down')) {  // seeing stars
    const [x, y] = at(e, e.state === 'dazed' ? 1.02 : .95);
    for (let i = 0; i < 3; i++) { const q = S.t * 4 + i * TAU / 3; star(x + Math.cos(q) * h * .08, y - h * .06 + Math.sin(q) * h * .025, h * .022, '#ffe14d'); }
  }
}
function drawLoose(it) {
  const h = tall(it.z);
  ctx.save(); ctx.translate(it.x * W, feetY(it.z) - it.y * h - h * .02);
  if (it.type === 'raygun' && !it.y) { ctx.globalAlpha = .5 + .5 * Math.sin(S.t * 8); star(0, -h * .12, h * .03, '#b8ff9e'); ctx.globalAlpha = 1; }  // alien loot glints
  drawItem(it.type, h * .8, it.y ? S.t * 9 : it.type === 'raygun' ? 0 : D, it.ammo);
  ctx.restore();
}
function drawShot(s) {
  const h = tall(s.z), X = s.x * W, Y = feetY(s.z) - s.y * h;
  if (s.type === 'laser') {
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(125, 255, 106, .35)'; ctx.lineWidth = h * .05; ctx.beginPath(); ctx.moveTo(X - Math.sign(s.vx) * W * .06, Y); ctx.lineTo(X, Y); ctx.stroke();
    ctx.strokeStyle = '#eaffdf'; ctx.lineWidth = h * .015; ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(25, 12, 0, .22)';
  ctx.beginPath(); ctx.ellipse(X, feetY(s.z), h * .05, h * .015, 0, 0, TAU); ctx.fill();
  ctx.save(); ctx.translate(X, Y);
  drawItem(s.type, h * (s.type === 'cork' ? 1.4 : .9), s.type === 'cork' ? Math.sign(s.vx) * D : s.spin, 0);
  ctx.restore();
}
const WET_COLOR = { puke: ['rgba(140, 186, 40, .8)', 'rgba(96, 128, 20, .9)'], booze: ['rgba(246, 190, 72, .5)', 'rgba(255, 250, 225, .55)'],
                    pee: ['rgba(238, 214, 52, .62)', 'rgba(255, 252, 200, .6)'] };
function drawPuddle(p) {
  const sc = .55 + .45 * p.z, rx = p.r * sc * W, ry = rx * .3, X = p.x * W, Y = feetY(p.z), [c0, c1] = WET_COLOR[p.kind] || WET_COLOR.booze;
  ctx.globalAlpha = Math.min(1, p.life / 3);
  ctx.fillStyle = c0; ctx.beginPath(); ctx.ellipse(X, Y, rx, ry, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = c1;
  if (p.kind === 'puke') for (const [u, v] of p.dots) { ctx.beginPath(); ctx.arc(X + u * rx * .6, Y + v * ry * .5, rx * .07, 0, TAU); ctx.fill(); }
  else { ctx.beginPath(); ctx.ellipse(X - rx * .3, Y - ry * .3, rx * .25, ry * .2, 0, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
}
function drawBeam(u) {
  if (u.state !== 'beam' || !u.target) return;
  const X = u.x * W, Y = u.y * H, fy = feetY(u.target.z), half = tall(u.target.z) * .32, g = ctx.createLinearGradient(0, Y, 0, fy);
  g.addColorStop(0, 'rgba(170, 255, 170, .6)'); g.addColorStop(1, 'rgba(170, 255, 170, .08)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(X - H * .03, Y); ctx.lineTo(X + H * .03, Y); ctx.lineTo(X + half, fy); ctx.lineTo(X - half, fy); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 6; i++) { const t = (S.t * .8 + i / 6) % 1; star(X + Math.sin(i * 7 + S.t * 3) * half * .6 * t, fy - (fy - Y) * t, H * .006, 'rgba(230, 255, 230, .9)'); }
}
function drawUfo(u) {
  const X = u.x * W, Y = u.y * H + Math.sin(S.t * 3) * H * .006, s = H / 700;
  ctx.save(); ctx.translate(X, Y); ctx.scale(s, s); ctx.rotate(Math.sin(S.t * 2) * .06);
  ctx.fillStyle = 'rgba(160, 230, 255, .55)'; ctx.beginPath(); ctx.ellipse(0, -14, 36, 32, 0, Math.PI, 0); ctx.fill();  // dome
  ctx.fillStyle = '#7ddb4f'; ctx.beginPath(); ctx.ellipse(0, -24, 13, 15, 0, 0, TAU); ctx.fill();  // the pilot
  ctx.fillStyle = '#111'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * 5.5, -25, 4.5, 7, sx * .5, 0, TAU); ctx.fill(); }
  const gr = ctx.createLinearGradient(0, -14, 0, 18); gr.addColorStop(0, '#eef2f6'); gr.addColorStop(1, '#6b7684');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, 0, 88, 20, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.stroke();
  for (let i = 0; i < 7; i++) { ctx.fillStyle = ['#ff5a5a', '#ffe14d', '#5ad1ff'][(i + Math.floor(S.t * 6)) % 3]; ctx.beginPath(); ctx.arc(-60 + i * 20, 7, 5, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function drawDove(d) {
  const X = d.x * W, Y = d.y * H + Math.sin(S.t * 3 + d.ph) * H * .01, s = H * .018, f = Math.sin(S.t * 14 + d.ph);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = s * .4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(X - s * 1.4, Y - f * s); ctx.quadraticCurveTo(X - s * .5, Y - s * .2 - f * s * .5, X, Y);
  ctx.quadraticCurveTo(X + s * .5, Y - s * .2 - f * s * .5, X + s * 1.4, Y - f * s); ctx.stroke();
}
function drawDisco() {
  const a = Math.min(1, S.disco, 7 - S.disco), cols = ['255, 60, 200', '60, 200, 255', '255, 220, 60', '120, 255, 120'];
  const bx = W * .5, by = H * .07, r = H * .045;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  cols.forEach((c, i) => {
    const ang = Math.sin(S.t * (1.1 + i * .3) + i * 2) * .75, g = ctx.createRadialGradient(bx, by, 0, bx, by, H * 1.1);
    g.addColorStop(0, `rgba(${c}, ${.4 * a})`); g.addColorStop(1, `rgba(${c}, 0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx, by); ctx.arc(bx, by, H * 1.1, D + ang - .13, D + ang + .13); ctx.closePath(); ctx.fill();
  });
  ctx.restore();
  ctx.strokeStyle = '#9aa1a8'; ctx.lineWidth = H * .003; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, by - r); ctx.stroke();
  ctx.fillStyle = '#c9d0d8'; ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.fill();
  for (let i = 0; i < 16; i++) {
    const q = i * 2.4 + S.t * 3, d = r * .62 * Math.cos(i * 1.3);
    ctx.fillStyle = `hsl(${(i * 47 + S.t * 220) % 360} 90% 78%)`; ctx.fillRect(bx + Math.cos(q) * d - r * .1, by + Math.sin(i * 1.7) * r * .6 - r * .1, r * .2, r * .2);
  }
}
function label(str, x, y, size, align = 'center', fill = '#fff', font = 'Bungee') {
  ctx.font = `${size}px ${font === 'Bungee' ? '"Bungee", Impact, sans-serif' : '"Press Start 2P", monospace'}`;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  ctx.lineWidth = size * .18; ctx.strokeStyle = '#1d0d00'; ctx.strokeText(str, x, y);
  ctx.fillStyle = fill; ctx.fillText(str, x, y);
}
function drawSay(e) {
  const [x, y0] = at(e, DOWN.has(e.state) && e.state !== 'flip' ? .5 : 1.08), size = H * .021, y = y0 - H * .03;
  ctx.font = `${size}px "Bungee", Impact, sans-serif`;
  const w = ctx.measureText(e.say.text).width + size, h = size * 1.6;
  ctx.globalAlpha = Math.min(1, e.say.t * 3);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1d0d00'; ctx.lineWidth = Math.max(1.5, size * .1);
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h, w, h, h / 2); ctx.moveTo(x - size * .3, y); ctx.lineTo(x, y + size * .6); ctx.lineTo(x + size * .3, y);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1d0d00'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(e.say.text, x, y - h / 2);
  ctx.globalAlpha = 1;
}
function drawFx(f) {
  const a = f.life / f.max;
  if (f.k === 'text') {  // kept on screen, even for someone at the edge of the floor
    const size = H * .05 * f.size * (1.25 - .25 * a);
    ctx.font = `${size}px "Bungee", Impact, sans-serif`;
    const half = ctx.measureText(f.text).width / 2 + size * .2;
    ctx.globalAlpha = Math.min(1, a * 2); label(f.text, clamp(f.x, half, W - half), f.y, size, 'center', f.color);
  }
  else if (f.k === 'drop') { ctx.globalAlpha = Math.min(1, a * 2); ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill(); }
  else if (f.k === 'spark') {
    const r = f.r * (1.4 - a * .4); ctx.globalAlpha = a; ctx.fillStyle = '#fff6a0'; ctx.strokeStyle = '#ff8a00'; ctx.lineWidth = r * .08;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) { const q = i * TAU / 16, rr = i % 2 ? r * .4 : r; ctx.lineTo(f.x + Math.cos(q) * rr, f.y + Math.sin(q) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (f.k === 'swoosh') {
    ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = f.r * .18; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(f.x - f.face * f.r * .6, f.y, f.r, f.face > 0 ? -1 : Math.PI - 1, f.face > 0 ? 1 : Math.PI + 1); ctx.stroke();
  } else if (f.k === 'flash') {  // camera flash: a white burst at the lens and a cone of light the way it points
    const b = a * a, g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * .5), L = W * .4;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    g.addColorStop(0, `rgba(255, 255, 255, ${b})`); g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * .5, 0, TAU); ctx.fill();
    const c = ctx.createLinearGradient(f.x, f.y, f.x + f.face * L, f.y);
    c.addColorStop(0, `rgba(255, 255, 240, ${.55 * b})`); c.addColorStop(1, 'rgba(255, 255, 240, 0)');
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + f.face * L, f.y - f.r * .45); ctx.lineTo(f.x + f.face * L, f.y + f.r * .45); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else if (f.k === 'conf') {
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.spin); ctx.fillStyle = f.color; ctx.fillRect(-f.r, -f.r * .5, f.r * 2, f.r); ctx.restore();
  }
  ctx.globalAlpha = 1;
}
function hud() {
  const m = W * .03, bw = W * .38, bh = H * .032, y = H * .05;
  S.players.forEach((p, i) => {
    const x = i ? W - m - bw : m, f = p.hp / HP, fw = bw * f;
    ctx.fillStyle = 'rgba(0, 0, 0, .55)'; ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = f > .5 ? '#ffd23f' : f > .25 ? '#ff9d1a' : '#ff3b2f'; ctx.fillRect(i ? x + bw - fw : x, y, fw, bh);
    ctx.lineWidth = Math.max(2, H * .004); ctx.strokeStyle = '#fff'; ctx.strokeRect(x, y, bw, bh);
    label(p.name.toUpperCase(), i ? x + bw : x, y + bh + H * .048, H * .038, i ? 'right' : 'left');
    const who = net ? (i === mySlot() ? 'YOU' : 'ONLINE') : ctrl[i] === 'cpu' ? (mode === 'cpu' ? `CPU · LV${S.level} ${LEVELS[S.level - 1].name}` : 'CPU') : ctrl[i] === 'pad' ? 'PAD' : 'KEYS';
    label(who, i ? x + bw : x, y - H * .012, H * .018, i ? 'right' : 'left', '#ffe066', 'pixel');
    if (mode === '2p' || mode === 'online') for (let w = 0; w < 2; w++) {  // round wins, best of 3
      const cx = i ? x + bw - H * .02 - w * H * .03 : x + H * .02 + w * H * .03, cy = y + bh + H * .07;
      ctx.beginPath(); ctx.arc(cx, cy, H * .01, 0, TAU); ctx.fillStyle = match.wins[i] > w ? '#ffd23f' : 'rgba(0, 0, 0, .5)'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, H * .002); ctx.stroke();
    }
  });
  label(String(Math.max(0, Math.ceil(S.clock))), W / 2, y + bh, H * .045, 'center', '#fff', 'pixel');
  if (mode === 'cpu') label(`LEVEL ${S.level}/3`, W / 2, y + bh + H * .035, H * .016, 'center', '#ffe066', 'pixel');
  if (S.banner && (S.phase !== 'fight' || S.bannerT > 0)) {
    const size = H * (S.banner.length > 10 ? .085 : .14), g = ctx.createLinearGradient(0, H * .42 - size, 0, H * .42);
    g.addColorStop(0, '#fffbd0'); g.addColorStop(.5, '#ffd23f'); g.addColorStop(1, '#ff7b00');
    label(S.banner, W / 2, H * .42, size, 'center', g);
    if (S.sub) label(S.sub, W / 2, H * .42 + H * .07, H * .035, 'center', '#fff', 'pixel');
  }
  if (S.waiting) label(S.waiting, W / 2, H * .55, H * .03, 'center', '#fff', 'pixel');
}
function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#120d08'; ctx.fillRect(0, 0, W, H);
  const sh = reduce ? 0 : S.shake; S.shake *= .85;
  ctx.translate((R() - .5) * sh, (R() - .5) * sh);
  if (bg) { const s = Math.max(W / bg.width, H / bg.height); ctx.drawImage(bg, (W - bg.width * s) / 2, (H - bg.height * s) / 2, bg.width * s, bg.height * s); }
  S.puddles.forEach(drawPuddle);
  if (S.ufo) drawBeam(S.ufo);
  const order = [...S.people.filter(o => !o.gone).map(o => [o.z, 0, o]), ...S.items.filter(i => !i.held).map(o => [o.z - .001, 1, o]), ...S.shots.map(o => [o.z + .002, 2, o])];
  for (const [, k, o] of order.sort((a, b) => a[0] - b[0])) (k === 0 ? drawPerson : k === 1 ? drawLoose : drawShot)(o);
  if (S.disco > 0) drawDisco();
  S.doves.forEach(drawDove);
  if (S.ufo) drawUfo(S.ufo);
  S.people.forEach(e => e.say && !e.gone && drawSay(e));
  S.fx.forEach(drawFx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const white = net ? S.white[mySlot()] : Math.max(...S.white.map((w, i) => ctrl[i] === 'cpu' ? 0 : w));  // the blinded human sees white
  if (white > 0 && !reduce) { ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(.85, white)})`; ctx.fillRect(0, 0, W, H); }
  hud();
}

// ---- matches
async function castPool() {  // who may wander in: a shuffled mix of everyone at the wedding, decoded once per page
  if (pool) return pool;
  const ks = shuffle([...window.LAYERS.cards.keys()]).slice(0, 30), ims = await Promise.all(ks.map(art));
  return pool = ks.map((k, i) => ({ k, img: ims[i] })).filter(c => c.img && solid(c.img)).slice(0, 20);
}
function freshState(extra) {
  return Object.assign({ t: 0, phase: 'intro', phaseT: 0, round: S ? S.round + 1 : 1, level: 1, clock: ROUND_SECONDS, banner: '', sub: '', bannerT: 0,
    shake: 0, slowT: 0, players: [], guests: [], photog: null, people: [], cast: [], items: [], shots: [], puddles: [], fx: [], doves: [], winner: null,
    white: [0, 0], confetti: 0, pukeIn: 3, gaspIn: 1, faintIn: 6, flipIn: 5, dovesIn: 3, discoIn: 16, disco: 0, ufoIn: 6, ufo: null, ufos: 0,
    enterIn: 2, sceneIn: 2.5, deck: [] }, extra);
}
async function newMatch(pair, level = 1, round = 0) {
  const run = startSeq, L = window.LAYERS, n = L.cards.length;
  const androids = L.cards.map((c, k) => c.cy ? k : -1).filter(k => k >= 0);
  pair = pair && pair.length === 2 ? pair : shuffle(androids.length >= 2 ? androids : [...Array(n).keys()]).slice(0, 2);
  const [a, b] = await Promise.all(pair.map(art)), cast = (await castPool()).filter(c => !pair.includes(c.k));
  if (run !== startSeq) return;  // the game was stopped while the cut-outs loaded
  const players = [person(pair[0], a, 'fighter', .3, .55), person(pair[1], b, 'fighter', .7, .55)];
  players.forEach((p, i) => { p.lv = LEVELS[mode === 'cpu' && i === 1 ? level - 1 : 1]; });
  if (net) { players[0].name = net.link.me.name; players[1].name = net.link.them.name; }
  const guests = [];
  for (const c of shuffle(cast.slice()).slice(0, 4)) {  // a few are already here; the rest drift in and out
    const at = spot(guests), g = person(c.k, c.img, 'guest', at.x, at.z);
    g.face = R() < .5 ? 1 : -1; g.stay = 5 + R() * 15; g.wander = R() < .3; guests.push(g);
  }
  const ph = photogImg ? person('photog', photogImg, 'photog', R() < .5 ? -.08 : 1.08, .25 + R() * .45) : null;
  if (ph) { ph.transit = 'in'; ph.dest = { x: ph.x < 0 ? .12 : .88, z: ph.z }; ph.think = 3; }
  S = freshState({ level, pair, players, guests, photog: ph, people: [...players, ...guests, ...(ph ? [ph] : [])], cast, ...(round ? { round } : {}) });
  snd('bell');
}
function next() {
  if (!S.winner) return mode === 'demo' ? newMatch() : newMatch(S.pair, S.level);  // a draw: the same fighters again
  if (mode === 'online') return S.final ? finish(S.players.indexOf(S.winner), 'done') : newMatch(S.pair);
  if (mode === 'cpu') {
    const won = S.winner === S.players[0];
    if (won && S.level === 3) return stop();  // champion: back to the photo
    if (won) ladder.beaten.push(S.pair[1]);
    return newMatch(won ? [S.pair[0], rival()] : S.pair, won ? S.level + 1 : S.level);
  }
  if (mode === '2p') { if (S.final) match.wins = [0, 0]; return newMatch(S.pair, 1, S.final ? 1 : 0); }
  newMatch();
}
function rival() {  // the next rung of the ladder: an android nobody has beaten yet
  const L = window.LAYERS, used = [S.pair[0], ...ladder.beaten], ok = k => !used.includes(k);
  return pick(L.cards.map((c, k) => c.cy && ok(k) ? k : -1).filter(k => k >= 0)) ?? pick([...L.cards.keys()].filter(k => ok(k) && L.cards[k].full)) ?? S.pair[1];
}

// ---- online. The host packs everything the guest draws into its match-room presence (~30 times a second, < 4 KB); the
// guest unpacks it, eases toward it, replays the sounds and effects, and moves its own fighter itself while it's free.
const STATES = ['idle', 'walk', 'attack', 'hit', 'down', 'cry', 'getup', 'slip', 'ko', 'faint', 'flip', 'beam', 'fall', 'puke', 'win', 'dazed',
                'drink', 'horse', 'rider', 'pee', 'smile', 'shield', 'aim', 'shoot'];
const THINGS = ['fork', 'bottle', 'champagne', 'shoe', 'plate', 'raygun', 'cork', 'laser'], MOVE_KEYS = Object.keys(MOVES);
const ROLES = ['fighter', 'guest', 'photog'], WET = ['booze', 'puke', 'pee'], PHASES = ['intro', 'fight', 'ko'], UFO = ['in', 'beam', 'out'];
const bytes = s => new TextEncoder().encode(s).length;
function pack() {
  const now = performance.now();
  while (evs.length && now - evs[0][1] > 700) evs.shift();
  const d = {
    v: 1, ph: PHASES.indexOf(S.phase), pt: q2(S.phaseT), cl: q2(S.clock), rd: S.round, w: match.wins, bn: S.banner, bt: q2(S.bannerT), sb: S.sub,
    dc: q2(S.disco), wh: q2(S.white[1]), cf: S.confetti > 0 ? 1 : 0, ack: net.ack || 0,
    P: S.people.filter(e => !e.gone).map(e => [e.id, e.k === 'photog' ? -1 : e.k, ROLES.indexOf(e.role), q3(e.x), q3(e.z), q2(e.y), e.face,
      STATES.indexOf(e.state), q2(e.st), Math.round(e.hp), q2(e.rot), e.item ? THINGS.indexOf(e.item.type) : e.prop ? 20 + THINGS.indexOf(e.prop) : -1,
      e.item ? e.item.ammo : 0, MOVE_KEYS.findIndex(k => MOVES[k] === e.move),
      (e.flash > 0) | (e.run << 1) | ((e.cheer > 0) << 2) | ((e.aimT > 0) << 3) | (e.threw << 4) | ((e.state === 'walk' || e.state === 'horse') << 5),
      e.say ? e.say.text : 0]),
    I: S.items.filter(i => !i.held).map(i => [THINGS.indexOf(i.type), q3(i.x), q3(i.z), q2(i.y), i.ammo]),
    X: S.shots.map(s => [THINGS.indexOf(s.type), q3(s.x), q3(s.z), q2(s.y), Math.sign(s.vx), q2(s.spin % TAU)]),
    U: S.puddles.slice(-14).map(p => [q3(p.x), q3(p.z), q3(p.r), WET.indexOf(p.kind), q2(p.life)]),
    O: S.ufo ? [q3(S.ufo.x), q3(S.ufo.y), UFO.indexOf(S.ufo.state), S.ufo.target ? S.ufo.target.id : 0] : 0,
    V: S.doves.map(d => [q3(d.x), q3(d.y), d.dir, q2(d.ph), q2(d.sp)]),
    E: evs.map(e => [e[0], ...e.slice(2)]),
  };
  if (S.ending) d.end = S.ending;
  let s = JSON.stringify(d);
  for (const k of ['E', 'U', 'V', 'I']) while (bytes(s) > 3700 && d[k].length) { d[k].shift(); s = JSON.stringify(d); }  // stay inside one presence update
  return d;
}
function unpack(d) {
  if (!d || d.v !== 1 || !Array.isArray(d.P)) return;
  const was = S.phase;
  S.phase = PHASES[d.ph] || 'fight'; S.phaseT = +d.pt || 0; S.clock = +d.cl || 0; S.round = d.rd; match.wins = Array.isArray(d.w) ? d.w : [0, 0];
  S.banner = String(d.bn || ''); S.bannerT = +d.bt || 0; S.sub = String(d.sb || ''); S.disco = +d.dc || 0; S.white[1] = Math.max(S.white[1], +d.wh || 0);
  if (d.cf && !S.confetti) S.confetti = 5;
  if (was !== S.phase && S.phase === 'intro') S.fx = [];
  const seen = new Set(), fighters = [];
  for (const a of d.P.slice(0, 40)) {
    if (!Array.isArray(a) || a.length < 16) continue;
    const [id, k, role, x, z, y, face, st, stt, hp, rot, thing, ammo, mv, flags, said] = a;
    seen.add(id);
    let e = S.byId.get(id);
    if (!e) { spawn(a); continue; }
    if (role === 0) fighters.push(e);
    const mine = e === S.players[1], state = STATES[st] || 'idle', free = state === 'idle' || state === 'walk', local = mine && free && S.phase === 'fight';
    e.hostFree = free;
    if (local && e.state !== 'idle' && e.state !== 'walk') { e.state = state; e.st = stt; }  // back on my feet: mine to move again
    if (!local) {  // my own fighter, while free, is moved here and reported to the host
      e.tx = x; e.tz = z; e.ty = y; e.face = face < 0 ? -1 : 1;
      if (Math.abs(x - e.x) > .15 || Math.abs(z - e.z) > .2) { e.x = x; e.z = z; }
      if (state !== e.state) { e.state = state; e.st = stt; } else if (Math.abs(e.st - stt) > .2) e.st = stt;
    }
    e.hp = hp; e.trot = rot;
    e.item = thing >= 0 && thing < 20 ? { type: THINGS[thing], ammo } : null; e.prop = thing >= 20 ? THINGS[thing - 20] : null;
    e.move = MOVES[MOVE_KEYS[mv]] || null;
    e.flash = flags & 1 ? .05 : 0; e.run = !!(flags & 2); e.cheer = flags & 4 ? .1 : 0; e.aimT = flags & 8 ? .05 : 0; e.threw = !!(flags & 16); e.moving = !!(flags & 32);
    if (said && (!e.say || e.say.text !== said)) say(e, String(said).slice(0, 40)); else if (!said) e.say = null;
  }
  for (const e of S.people) if (!seen.has(e.id) && !S.pending.has(e.id)) e.left = true;
  if (S.people.some(e => e.left)) { S.people = S.people.filter(e => !e.left); for (const [id, e] of S.byId) if (e.left) S.byId.delete(id); }
  if (fighters.length === 2) S.players = fighters;
  S.guests = S.people.filter(e => e.role === 'guest');
  S.items = (d.I || []).map(([t, x, z, y, ammo]) => ({ type: THINGS[t], x, z, y, ammo, held: null }));
  S.shots = (d.X || []).map(([t, x, z, y, dir, spin]) => ({ type: THINGS[t], x, z, y, vx: dir, spin }));
  S.puddles = (d.U || []).map(([x, z, r, kind, life], i) => Object.assign(S.puddles[i] && S.puddles[i].x === x ? S.puddles[i] : { dots: Array.from({ length: 5 }, () => [R() * 2 - 1, R() * 2 - 1]) },
                                                                             { x, z, r, kind: WET[kind], life }));
  S.ufo = d.O ? { x: d.O[0], y: d.O[1], state: UFO[d.O[2]], target: S.byId.get(d.O[3]) || null } : null;
  S.doves = (Array.isArray(d.V) ? d.V.slice(0, 20) : []).map(([x, y, dir, ph, sp]) => ({ x, y, dir, ph, sp }));
  for (const ev of (Array.isArray(d.E) ? d.E : []).slice(-60)) if (Array.isArray(ev) && ev[0] > S.evSeen) { S.evSeen = ev[0]; replay(ev); }
  if (Array.isArray(d.end)) finish(d.end[0], d.end[1]);
}
async function spawn(a) {  // a person the host has and we don't yet: load their cut-out first
  const [id, k, role] = a;
  if (S.pending.has(id)) return;
  S.pending.add(id);
  const s0 = S, img = k === -1 ? photogImg : await art(k);
  if (S !== s0) return;
  S.pending.delete(id);
  const e = person(k === -1 ? 'photog' : k, img, ROLES[role] || 'guest', a[3], a[4]);
  e.id = id; e.tx = a[3]; e.tz = a[4]; e.ty = a[5]; e.face = a[6] < 0 ? -1 : 1; e.state = STATES[a[7]] || 'idle'; e.st = a[8];
  if (role === 0) e.lv = LEVELS[1];
  S.byId.set(id, e); S.people.push(e);
  const fs = S.people.filter(p => p.role === 'fighter');
  if (fs.length === 2) {
    S.players = fs.sort((p, q) => p.id - q.id);  // the host makes its fighters first: P1 (host) then P2 (us)
    S.players[0].name = net.link.them.name; S.players[1].name = net.link.me.name;
  }
}
function replay(ev) {
  const [, kind, ...a] = ev;
  const n = (v, lo, hi, d) => Number.isFinite(+v) ? clamp(+v, lo, hi) : d;  // everything from the host is untrusted
  if (kind === 's') window.SFX && window.SFX.play(String(a[0]), { pan: (n(a[1], 0, 1, .5) - .5) * 1.4, pitch: n(a[2], .3, 3, 1), vol: n(a[3], 0, 2, 1), dur: n(a[4], 0, 8, 0) || undefined });
  else if (kind === 't') fx({ k: 'text', text: String(a[0]).slice(0, 30), x: a[1] * W, y: a[2] * H, vy: -H * .1, life: .9, max: .9, color: a[3], size: a[4] });
  else if (kind === 'y') spray(n(a[0], -1, 2, 0) * W, n(a[1], -1, 2, 0) * H, n(a[2], 0, 30, 0), String(a[3]), n(a[4], -3, 3, 0) * H, n(a[5], -3, 3, 0) * H, n(a[6], 0, .05, .01) * H, n(a[7], 0, 2, .8), true);
  else if (kind === 'k') fx({ k: 'spark', x: a[0] * W, y: a[1] * H, r: a[2] * H, life: .22, max: .22 });
  else if (kind === 'w') fx({ k: 'swoosh', x: a[0] * W, y: a[1] * H, face: a[2], r: a[3] * H, life: .12, max: .12 });
  else if (kind === 'f') fx({ k: 'flash', x: a[0] * W, y: a[1] * H, face: a[2], r: a[3] * H, life: .35, max: .35 });
}
function replica(dt) {  // the online guest's frame: no game logic, just easing toward the host's picture and moving my own fighter
  S.t += dt; S.phaseT += dt; S.bannerT -= dt;
  if (S.phase === 'fight') S.clock -= dt;
  const me = S.players[1], b = readControls(1), k = Math.min(1, dt * 14);
  for (const key of ['punch', 'kick', 'grab', 'jump']) { if (b[key] && !S.held[key]) S.presses[key]++; S.held[key] = b[key]; }
  tapped.clear();
  for (const e of S.people) {
    e.st += dt; e.flash -= dt; e.aimT -= dt; e.cheer -= dt;
    if (e.say && (e.say.t -= dt) <= 0) e.say = null;
    if (e === me && e.hostFree && S.phase === 'fight') {
      e.vx = b.mx * .3; e.vz = b.mz * .18;
      if (b.mx) e.face = Math.sign(b.mx);
      e.state = b.mx || b.mz ? 'walk' : 'idle';
      if (b.jump && !S.jumpHeld && !e.y) e.vy = 2.3;
      S.jumpHeld = b.jump;
      e.x = clamp(e.x + e.vx * dt, .04, .96); e.z = clamp(e.z + e.vz * dt, 0, 1);
      if (e.y > 0 || e.vy > 0) { e.vy -= 7 * dt; e.y = Math.max(0, e.y + e.vy * dt); if (!e.y) e.vy = 0; }
      e.tx = e.x; e.tz = e.z; e.ty = e.y;
    } else if (e.tx !== undefined) {
      e.x += (e.tx - e.x) * k; e.z += (e.tz - e.z) * k; e.y += (e.ty - e.y) * k;
      if (e === me) e.vy = 0;
    }
    if (e.trot !== undefined) { const dr = ((e.trot - e.rot + Math.PI) % TAU + TAU) % TAU - Math.PI; e.rot += dr * k; }
    if (e.moving || e.state === 'walk') e.walkPh += dt * (e.role === 'fighter' ? 13 : e.run ? 16 : e.state === 'horse' ? 10 : 7.5);
    if (e.state === 'cry') tears(e, dt);
    if (e.state === 'puke' && e.st >= 0 && e.st < 1.4) pukeStream(e, dt, false);
    place(e); animate(e, dt);
  }
  ambient(dt);
  if (performance.now() - sentAt > 30 && me) {
    sentAt = performance.now();
    net.link.send({ n: ++inSeq, in: { mx: b.mx, mz: b.mz, p: ['punch', 'kick', 'grab', 'jump'].map(x => S.presses[x]) },
                    me: [q3(me.x), q3(me.z), q2(me.y), me.face, me.state === 'walk' ? 1 : 0] });
  }
  if (!S.people.length) S.waiting = 'CONNECTING…';
  else S.waiting = '';
}
function finish(winnerSlot, reason) {  // online match over: the host tells the guest first, then both go back to the lobby
  if (!net) return;
  if (!S) { net.early = [winnerSlot, reason]; return; }  // the opponent left while we were still loading
  if (S.ending) return;
  S.ending = [winnerSlot, reason];
  const result = { winner: winnerSlot == null || winnerSlot < 0 ? null : winnerSlot === mySlot() ? 'me' : 'them', reason }, cb = opts0.onEnd, s0 = S;
  if (reason === 'left') { S.banner = 'OPPONENT LEFT'; S.bannerT = 9; S.sub = ''; }
  setTimeout(() => { if (S === s0) stop(true); cb && cb(result); }, net.role === 'host' && reason !== 'left' ? 1500 : reason === 'left' ? 2000 : 0);
}

// ---- loop
function frame(t) {
  raf = requestAnimationFrame(frame);
  let dt = Math.min(.05, (t - lastT) / 1000 || 0); lastT = t;
  if (!S) return;
  if (net && net.role === 'guest') { replica(dt); draw(); return; }
  if (S.slowT > 0) { S.slowT -= dt; dt *= .35; }
  update(dt);
  if (!S) return;
  if (net && performance.now() - sentAt > 33) { sentAt = performance.now(); net.link.send(pack()); }
  draw();
}
function fit() {
  const r = root.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  W = cv.width = Math.max(1, Math.round(r.width * d)); H = cv.height = Math.max(1, Math.round(r.height * d));
}
async function start(pair, opts = {}) {
  if (window.brawling) stop();  // a new game ends the running one (an online match counts as walking out of it)
  const run = ++startSeq, live = () => run === startSeq;
  root = document.getElementById('brawl'); cv = root.querySelector('canvas'); ctx = cv.getContext('2d');
  root.hidden = false; window.brawling = true; fit();
  if (!start.ro) { start.ro = new ResizeObserver(fit); start.ro.observe(root); }
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();  // Space must not press the button that started us
  opts0 = opts; mode = opts.mode || (pair && pair.length === 2 ? 'cpu' : 'demo');
  net = mode === 'online' && opts.link ? { role: opts.link.role, link: opts.link, seen: [], ack: 0, offs: [] } : null;
  if (mode === 'online' && !net) mode = '2p';
  if (net) {  // listen before loading anything: an opponent who leaves meanwhile must still end the match
    net.offs.push(net.link.onGone(() => finish(mySlot(), 'left')));
    if (net.role === 'guest') net.offs.push(net.link.onData(d => S && net && unpack(d)));
  }
  ctrl[0] = mode === 'demo' ? 'cpu' : 'keys'; ctrl[1] = mode === '2p' ? 'keys' : mode === 'online' ? 'net' : 'cpu';
  ladder.beaten = []; match.wins = [0, 0]; evs.length = 0; keys.clear(); tapped.clear();
  const help = root.querySelector('.brawl-bar span');
  if (help) help.textContent = `${mode === '2p' ? HELP.duo : HELP.solo}${mode === 'demo' ? ' · press any of them to take over P1' : ''} · Controllers: press any button to join · ${CREDITS}`;
  S = null;
  const im = new Image(); im.src = window.BALLROOM || window.LAYERS.bg;  // fall back to the venue's own empty courtyard
  const ph = new Image(); if (window.PHOTOG) ph.src = window.PHOTOG;
  [bg, photogImg] = await Promise.all([im.decode().then(() => im, () => null), window.PHOTOG ? ph.decode().then(() => ph, () => null) : null]);
  await Promise.race([Promise.all(['40px Bungee', '20px "Press Start 2P"'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 1500))]).catch(() => {});
  if (!live()) return;  // stopped (Esc, Leave, another start) while loading
  if (net && net.role === 'guest') {
    S = freshState({ byId: new Map(), pending: new Set(), evSeen: 0, presses: { punch: 0, kick: 0, grab: 0, jump: 0 }, held: {}, waiting: 'CONNECTING…' });
    const d0 = net.link.latest(); if (d0) unpack(d0);
  } else {
    await newMatch(pair, 1);
    if (!live()) return;
  }
  if (net && net.early) finish(...net.early);
  cancelAnimationFrame(raf); lastT = performance.now(); raf = requestAnimationFrame(frame);
}
function stop(quiet) {
  startSeq++; cancelAnimationFrame(raf);
  const quit = net && !(S && S.ending), cb = opts0.onEnd;
  if (net) net.offs.forEach(off => { try { off(); } catch {} });
  S = null; window.brawling = false; net = null; opts0 = {};
  if (root) root.hidden = true;
  if (quit && !quiet && cb) cb({ winner: 'them', reason: 'quit' });  // walking out of an online match forfeits it
}
addEventListener('keydown', e => {
  if (!window.brawling) return;
  if (e.code === 'Escape') return stop();
  const lay = layout(), li = lay.findIndex(m => Object.values(m).some(c => c.includes(e.code)));
  if (li < 0) return;
  e.preventDefault();
  keys.add(e.code); tapped.add(e.code);
  const p = net ? mySlot() : li;
  if (!net && !(mode === 'cpu' && p === 1)) ctrl[p] = ctrl[p] === 'pad' ? 'pad' : 'keys';  // a player's first key press takes over from the CPU
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
window.Brawl = { start, stop, get state() { return S; }, POSE, drawItem };  // state: for poking at a running match from the console
})();
