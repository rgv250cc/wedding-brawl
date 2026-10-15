// Ballroom brawl: two guests fight among the rest of the wedding. The CPU plays both sides until a keyboard
// (P1) or a gamepad (P1/P2) joins in. The guests are their own disaster: they get flattened, cry, puke in chain
// reactions, faint, try backflips, wander into puddles, dance when the disco kicks in and get abducted by a UFO
// that drops ray guns. Sounds come from sfx.js. Exposes window.Brawl.start([k1, k2]?), Brawl.stop(), Brawl.state.
(() => {
'use strict';
const R = Math.random, TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, pick = a => a[Math.floor(R() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const FLOOR = [0.37, 0.97];  // walkable band of the ballroom picture: back and front edge, as fractions of its height
const HP = 140, ROUND_SECONDS = 60;
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
const DOWN = new Set(['down', 'cry', 'ko', 'slip', 'getup', 'faint', 'flip', 'beam', 'fall']);  // can't be hit or act
const SHAPES = {  // item art in item units (~80 tall), grip at 0,0; drawn with a white paper rim like the cut-outs
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

let root, cv, ctx, W = 1, H = 1, S = null, raf = 0, lastT = 0, bg = null;
const keys = new Set(), tapped = new Set();  // physical keys (KeyboardEvent.code), so any keyboard language works; tapped = pressed since last frame
const KEYMAP = [  // P1 on the left of the keyboard, P2 on the right
  { up: 'KeyW', left: 'KeyA', down: 'KeyS', right: 'KeyD', punch: 'KeyX', kick: 'KeyC', grab: 'KeyV', jump: 'KeyZ' },
  { up: 'KeyI', left: 'KeyJ', down: 'KeyK', right: 'KeyL', punch: 'Comma', kick: 'Period', grab: 'Slash', jump: 'KeyM' },
];
const ctrl = ['cpu', 'cpu'];  // who drives P1 / P2; survives between rounds

const feetY = z => H * (FLOOR[0] + z * (FLOOR[1] - FLOOR[0]));
const tall = z => H * .42 * (.55 + .45 * z);  // a person's height on screen at depth z (0 = back of the floor)
const snd = (name, x = .5, o = {}) => window.SFX && window.SFX.play(name, Object.assign({ pan: (x - .5) * 1.4 }, o));
const art = k => {  // big portrait when fighters.js has arrived, the small cut-out otherwise
  const i = new Image();
  i.src = (window.FIGHTERS && window.FIGHTERS[k]) || window.LAYERS.cards[k].img;
  return i.decode().then(() => i, () => i);
};

function solid(img) {  // a standing figure: enough of it is opaque, and there is a head at the top
  const c = Object.assign(document.createElement('canvas'), { width: 30, height: 90 }), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, 30, 90);
  const a = g.getImageData(0, 0, 30, 90).data;
  let all = 0, top = 0;
  for (let i = 3; i < a.length; i += 4) if (a[i] > 128) { all++; if (i < 30 * 14 * 4) top++; }
  return all / 2700 > .2 && top / 420 > .12;
}
function person(k, img, role, x, z) {
  const name = (window.guestName ? window.guestName(k) : `Guest ${k + 1}`);
  return { k, img, role, name, x, z, y: 0, vx: 0, vz: 0, vy: 0, face: x < .5 ? 1 : -1, hp: HP, state: 'idle', st: 0,
           item: null, cd: 0, rot: 0, flash: 0, think: 0, goal: null, seed: R() * 9, say: null, inp: {}, prev: {}, move: null, h: 1, X: 0, Y: 0 };
}
function set(e, s) {
  e.state = s; e.st = 0; e.done = false;
  if (s === 'cry') { e.cryFor = 2.5 + R() * 3; snd('cry', e.x, { pitch: .8 + (e.seed % 1) * .6 }); }
}
const voice = e => .8 + (e.seed % 1) * .6;  // everyone sobs in their own key

// ---- effects (screen pixels)
const fx = o => S.fx.push(o);
function at(e, up, fwd = 0) {  // a point on the sprite, as fractions of its height above the feet / forward
  const c = Math.cos(e.rot), s = Math.sin(e.rot), lx = fwd * e.h, ly = -up * e.h;
  return [e.X + e.face * (lx * c - ly * s), e.Y + lx * s + ly * c];
}
function text(t, x, y, color = '#ffd23f', size = 1) { fx({ k: 'text', text: t, x, y, vy: -H * .1, life: .9, max: .9, color, size }); }
function pop(t, e, color, size) { const [x, y] = at(e, 1.05); text(t, x, y, color, size); }
function say(e, t) { e.say = { text: t, t: 1.8 }; }
function spray(x, y, n, color, vx, vy, r, life = .8) {
  for (let i = 0; i < n; i++) fx({ k: 'drop', x, y, vx: vx * (.4 + R() * .8) + (R() - .5) * H * .15, vy: -vy * (.3 + R() * .9), color, r: r * (.6 + R() * .7), life, max: life });
}
function puddle(x, z, kind, size = 1) {
  S.puddles.push({ x: clamp(x, .04, .96), z: clamp(z, .01, .99), r: 0, max: (.03 + R() * .025) * size, kind, life: 30,
                   dots: Array.from({ length: 5 }, () => [R() * 2 - 1, R() * 2 - 1]) });
}
const onPuddle = e => S.puddles.some(p => {
  const sc = .55 + .45 * p.z, dx = (e.x - p.x) / (p.r * sc + 1e-6), dz = (e.z - p.z) / (p.r * .9 * sc + 1e-6);
  return p.r > .01 && dx * dx + dz * dz < 1;
});
const near = (e, list, r) => list.filter(o => o !== e && Math.hypot(o.x - e.x, (o.z - e.z) * 1.5) < r);

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
  const m = e.move;
  const [x, y] = at(e, m.low ? .35 : .62, .18);
  fx({ k: 'swoosh', x, y, face: e.face, r: e.h * .16, life: .12, max: .12 });
  let n = 0;
  for (const v of S.people) {
    if (v === e || v.gone || DOWN.has(v.state)) continue;
    const dx = (v.x - e.x) * e.face;
    if (dx > -.01 && dx < m.reach && Math.abs(v.z - e.z) < .05 && Math.abs(v.y - e.y) < .45) { hurt(v, m.dmg, e.face, m.word, m.snd); if (++n === 2) break; }
  }
  if (n) combo(e);
  const it = e.item;
  if (n && it && (it.type === 'plate' || (it.type === 'bottle' && ++it.hits >= 2))) breakHeld(e);
}
function combo(e) {  // three hits in quick succession
  e.combo = S.t - (e.lastHit ?? -9) < 1.4 ? (e.combo || 0) + 1 : 1; e.lastHit = S.t;
  if (e.role === 'fighter' && e.combo === 3) { snd('combo'); pop('COMBO!', e, '#ff6ad5', 1.3); }
}
function breakHeld(e) {
  const it = e.item; e.item = null; S.items.splice(S.items.indexOf(it), 1);
  const [x, y] = at(e, .55, .3); spray(x, y, 14, '#dff6ff', e.face * H * .4, H * .4, e.h * .012);
  if (it.type === 'bottle') puddle(e.x + e.face * .06, e.z + .01, 'booze');
  pop('SMASH!', e, '#bff3ff'); snd('smash', e.x);
}
function hurt(v, dmg, dir, word, sound) {
  v.flash = .12; v.face = -dir; v.vx = dir * (.25 + dmg * .025);
  const [x, y] = at(v, .6); fx({ k: 'spark', x, y, life: .22, max: .22, r: v.h * .16 });
  pop(word, v); S.shake = Math.max(S.shake, dmg * .7 * H / 600);
  snd(sound, v.x, { pitch: .9 + R() * .25 });
  if (sound === 'zap') spray(x, y, 12, '#b8ff9e', 0, H * .3, v.h * .012, .5);
  if (v.role === 'guest') {
    set(v, 'down'); say(v, pick(CRIES)); snd('thud', v.x, { vol: .6 });
    if (R() < .3) snd('gasp', v.x);
    if (R() < .45) S.items.push({ type: pick(DROPS), x: v.x, z: clamp(v.z + .02, 0, 1), y: .5, vy: 1.8, vx: (R() - .5) * .25, ammo: 1, hits: 0, held: null });
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
  set(e, 'attack'); e.move = MOVES.fist; e.done = true; e.cd = .35;  // throwing pose, no melee hit
  snd('swingHeavy', e.x);
}
function fireCork(e) {
  e.item.ammo = 0;
  S.shots.push({ type: 'cork', x: e.x + e.face * .04, z: e.z, y: e.y + .62, vx: e.face * 1.8, vy: 0, owner: e, spin: 0 });
  const [x, y] = at(e, .62, .35); spray(x, y, 18, '#fffbe6', e.face * H * .6, H * .35, e.h * .013, .7);
  pop('POP!', e, '#fff2a8'); e.vx = -e.face * .25; e.cd = .45; snd('pop', e.x);
  puddle(e.x + e.face * .03, e.z + .01, 'booze');
}
function fireLaser(e) {
  e.item.ammo--; e.cd = .35;
  S.shots.push({ type: 'laser', x: e.x + e.face * .05, z: e.z, y: e.y + .6, vx: e.face * 2.4, vy: 0, owner: e, spin: 0 });
  const [x, y] = at(e, .6, .4); spray(x, y, 10, '#b8ff9e', e.face * H * .4, H * .2, e.h * .01, .4);
  snd('zap', e.x);
}
function ko(v) {
  set(v, 'ko'); S.phase = 'ko'; S.phaseT = 0; S.slowT = 1.3; S.banner = 'K.O.';
  S.winner = S.players.find(p => p !== v);
  snd('boom', v.x); snd('cheer', .5, { vol: 1.2 });
}

// ---- CPU player: chase the rival, grab loot, sometimes flatten a bystander
function cpu(p, dt) {
  const n = p.inp; n.punch = n.kick = n.grab = n.jump = false;
  const foe = S.players[0] === p ? S.players[1] : S.players[0];
  p.think -= dt;
  if (p.think <= 0 || !p.goal || (p.goal.held && p.goal !== foe) || p.goal.gone) {
    p.think = .5 + R() * .8;
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
  n.mx = Math.abs(dx) > want + .015 ? Math.sign(dx) : Math.abs(dx) < want - .03 ? -Math.sign(dx) * .6 : 0;
  n.mz = Math.abs(dz) > .02 ? Math.sign(dz) * .9 : 0;
  if (p.x < .18 || p.x > .82) n.mx = clamp(n.mx + (p.x < .5 ? .7 : -.7), -1, 1);  // drift back toward the middle of the floor
  if (p.z > .85) n.mz = Math.min(n.mz, -.5);
  if (loot && Math.abs(dx) < .04 && Math.abs(dz) < .04) { n.grab = true; p.goal = null; return; }
  if (loot || g.spot || Math.abs(dz) > .04 || p.cd > 0 || R() > dt * 5) { if (R() < dt * .3) n.jump = true; return; }
  if (ranged && Math.abs(dx) < .5) { p.face = Math.sign(dx) || p.face; n[shoots ? 'punch' : 'grab'] = true; }
  else if (Math.abs(dx) < want + .03) { p.face = Math.sign(dx) || p.face; n[R() < .6 ? 'punch' : 'kick'] = true; }
}

// ---- humans: each player has a side of the keyboard (KEYMAP); gamepad n drives player n once any of its buttons is pressed
function human(p, i) {
  const n = p.inp, b = { punch: false, kick: false, grab: false, jump: false };
  n.mx = n.mz = 0;
  const gp = navigator.getGamepads && navigator.getGamepads()[i];
  if (gp && gp.buttons.some(x => x.pressed)) ctrl[i] = 'pad';
  if (ctrl[i] === 'pad' && gp) {
    const on = j => !!(gp.buttons[j] && gp.buttons[j].pressed);
    n.mx = Math.abs(gp.axes[0]) > .25 ? gp.axes[0] : on(15) - on(14);
    n.mz = Math.abs(gp.axes[1]) > .25 ? gp.axes[1] : on(13) - on(12);
    Object.assign(b, { jump: on(0), grab: on(1), punch: on(2), kick: on(3) });  // A jump, B grab/throw, X punch, Y kick
  } else if (ctrl[i] === 'keys') {
    const on = k => keys.has(KEYMAP[i][k]) || tapped.has(KEYMAP[i][k]);  // a tap shorter than a frame still counts
    n.mx = on('right') - on('left'); n.mz = on('down') - on('up');
    Object.assign(b, { punch: on('punch'), kick: on('kick'), grab: on('grab'), jump: on('jump') });
  }
  for (const key in b) { n[key] = b[key] && !p.prev[key]; p.prev[key] = b[key]; }  // buttons fire on press
}

// ---- the guests' own chaos
function chaos(dt) {
  const idle = () => S.guests.filter(g => !g.gone && (g.state === 'idle' || g.state === 'walk'));
  if ((S.pukeIn -= dt) <= 0) {  // somebody had too much
    S.pukeIn = 1.2 + R() * 2.2;
    const g = pick(idle());
    if (g) startPuke(g);
  }
  if ((S.faintIn -= dt) <= 0) {
    S.faintIn = 3 + R() * 4;
    const g = pick(idle());
    if (g) { set(g, 'faint'); say(g, pick(['*faints*', 'TOO MUCH!', 'I NEED AIR'])); snd('faint', g.x, { pitch: voice(g) }); }
  }
  if ((S.flipIn -= dt) <= 0) {  // nobody asked for a backflip
    S.flipIn = 3.5 + R() * 4;
    const g = pick(idle());
    if (g) { set(g, 'flip'); g.vy = 2.9; g.fail = R() < .35; g.spin = g.face; say(g, pick(['WATCH THIS!', 'HOLD MY DRINK', 'YOLO!'])); snd('boing', g.x); }
  }
  if ((S.gaspIn -= dt) <= 0) {
    S.gaspIn = 1.5 + R() * 3;
    const g = pick(idle().filter(g => !g.say));
    if (g) say(g, pick(GASPS));
  }
  if ((S.dovesIn -= dt) <= 0) {  // the doves for the send-off, released early
    S.dovesIn = 9 + R() * 9;
    const dir = R() < .5 ? 1 : -1;
    for (let i = 0; i < 7; i++) S.doves.push({ x: dir > 0 ? -.04 - i * .05 : 1.04 + i * .05, y: .06 + R() * .16, dir, ph: R() * 6, sp: .2 + R() * .07 });
    snd('flap');
  }
  for (const d of S.doves) d.x += d.dir * d.sp * dt;
  S.doves = S.doves.filter(d => d.x > -.4 && d.x < 1.4);
  if (S.phase === 'fight' && (S.discoIn -= dt) <= 0) {
    S.discoIn = 26; S.disco = 7;
    text('DISCO!', W / 2, H * .3, '#ff6ad5', 1.6); snd('disco', .5, { dur: 7 });
  }
  if (S.disco > 0) S.disco -= dt;

  // the UFO: drifts over a guest, beams them up, sometimes leaves a ray gun; the guest comes back later, from above
  if (S.phase === 'fight' && !S.ufo && (S.ufoIn -= dt) <= 0) {
    S.ufoIn = 10 + R() * 7;
    const target = pick(idle());
    if (target) { const dir = R() < .5 ? 1 : -1; S.ufo = { x: dir > 0 ? -.15 : 1.15, y: .13, dir, state: 'in', t: 0, target, gun: S.ufos++ === 0 || R() < .5 }; }
  }
  const u = S.ufo;
  if (u) {
    u.t += dt; snd('ufo', u.x);
    if (u.state === 'in') {
      u.x += u.dir * .32 * dt;
      if ((u.x - u.target.x) * u.dir >= 0) {
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

// ---- simulation
function update(dt) {
  S.t += dt; S.phaseT += dt; S.bannerT -= dt;
  if (S.phase === 'intro' && !S.called && S.phaseT > .7) { S.called = true; snd(S.round < 6 ? `round${S.round}` : 'finalround'); }
  if (S.phase === 'intro' && S.phaseT > 2) { S.phase = 'fight'; S.banner = 'FIGHT!'; S.bannerT = .9; snd('fight'); }
  if (S.phase === 'fight') {
    S.clock -= dt;
    if (S.clock <= 0) {
      const [a, b] = S.players, loser = a.hp < b.hp ? a : b;
      S.phase = 'ko'; S.phaseT = 0; S.banner = 'TIME!'; S.winner = S.players.find(p => p !== loser); snd('time');
    }
  } else if (S.phase === 'intro') S.banner = `ROUND ${S.round}`;
  if (S.phase === 'ko') {
    const w = S.winner;
    if (S.phaseT > 1.4 && w.state !== 'win' && !DOWN.has(w.state)) { set(w, 'win'); S.banner = `${w.name} WINS`; S.bannerT = 9; snd(w.hp >= HP ? 'flawless' : 'winner'); snd('cheer', w.x); }
    if (S.phaseT > 5) return newMatch();
  }
  if (S.phase === 'fight') S.players.forEach((p, i) => ctrl[i] === 'cpu' ? cpu(p, dt) : human(p, i));
  tapped.clear();
  chaos(dt);

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
    if (v) { const [dmg, word, sound] = THROWN[s.type]; hurt(v, dmg, Math.sign(s.vx), word, sound); if (v.role === 'fighter') combo(s.owner); land(s, true); }
    else if (s.y <= 0) land(s);
    else if (s.x < -.05 || s.x > 1.05) s.dead = true;
  }
  S.shots = S.shots.filter(s => !s.dead);
  for (const p of S.puddles) { p.r += (p.max - p.r) * Math.min(1, dt * 3); p.life -= dt; }
  S.puddles = S.puddles.filter(p => p.life > 0);
  for (const f of S.fx) {
    f.life -= dt;
    if (f.k === 'drop') {
      f.vy += H * 1.6 * dt; f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.splat && f.y > f.floor) { f.life = 0; f.splat(f); }  // vomit that reaches the floor
    }
    if (f.k === 'text') f.y += f.vy * dt;
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
    if ((e.awayT -= dt) <= 0) {
      Object.assign(e, { gone: false, x: .12 + R() * .76, z: R() * .9, y: 3.4, vy: 0, vx: 0, vz: 0 });
      set(e, 'fall'); say(e, 'AAAAH!'); snd('whistle', e.x);
    }
    return;
  }
  e.st += dt; e.cd -= dt; e.flash -= dt;
  if (e.say && (e.say.t -= dt) <= 0) e.say = null;
  const free = e.state === 'idle' || e.state === 'walk';
  if (e.role === 'fighter') {
    const n = e.inp;
    if (free && S.phase === 'fight') {
      e.vx = (n.mx || 0) * .3; e.vz = (n.mz || 0) * .18;
      if (n.mx) e.face = Math.sign(n.mx);
      e.state = n.mx || n.mz ? 'walk' : 'idle';
      if (n.jump && !e.y) { e.vy = 2.3; snd('swing', e.x, { pitch: .6 }); }
      if (n.grab) grab(e); else if (n.punch || n.kick) attack(e, n.kick ? 'kick' : 'punch');
    } else if (free) { e.vx = e.vz = 0; e.state = 'idle'; }
  } else if (free && e.wander && !(S.disco > 0)) {  // a few guests mill about, which is how they find the puddles
    if (!e.goal || Math.hypot(e.goal.x - e.x, e.goal.z - e.z) < .02) e.goal = { x: .06 + R() * .88, z: R() * .95 };
    const dx = e.goal.x - e.x, dz = e.goal.z - e.z, d = Math.hypot(dx, dz) || 1;
    e.vx = dx / d * .06; e.vz = dz / d * .05; e.state = 'walk';
    if (Math.abs(dx) > .01) e.face = Math.sign(dx);
  } else if (free && e.role === 'guest') { e.vx = e.vz = 0; e.state = 'idle'; }
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
      if (R() < dt * 6) { const [x, y] = at(e, .9); spray(x, y, 2, '#7fd3ff', 0, H * .25, e.h * .012, .6); }
      if (!e.say && R() < dt * .7) { say(e, pick(CRIES)); snd('cry', e.x, { pitch: voice(e) }); }
      break;
    case 'slip': if (!e.done && e.st > .38) { e.done = true; snd('thud', e.x); }
      if (e.st > 1.1) set(e, e.role === 'guest' && R() < .55 ? 'cry' : 'getup'); break;
    case 'faint': if (!e.done && e.st > .55) { e.done = true; snd('thud', e.x, { vol: .8 }); } if (e.st > 3.2) set(e, 'getup'); break;
    case 'getup': if (e.st > .45) set(e, 'idle'); break;
    case 'flip':
      if (e.st > .25 && !e.y) {
        e.rot = 0;
        if (e.fail) { set(e, 'down'); pop('OOF!', e, '#ffb0b0'); snd('thud', e.x); } else { set(e, 'idle'); say(e, 'TA-DA!'); snd('cheerSoft', e.x); }
      }
      break;
    case 'beam': e.y += dt * 1.3; if (S.ufo ? e.Y < S.ufo.y * H + H * .03 : e.st > 4) { e.gone = true; e.awayT = 3 + R() * 3; } break;
    case 'fall': if (!e.y && e.st > .1) { set(e, 'down'); S.shake = Math.max(S.shake, H * .012); snd('thud', e.x, { vol: 1.2 }); pop('THUD!', e, '#ffd23f'); } break;
    case 'puke':
      if (e.st >= 0 && e.st < 1.4) {
        if (e.st < dt + .001) snd('puke', e.x, { pitch: voice(e) });
        if (R() < dt * 50) {  // projectile style; some of it lands as more puddle
          const [x, y] = at(e, .86, .06), floor = feetY(e.z);
          fx({ k: 'drop', x, y, vx: e.face * H * (.45 + R() * .45), vy: -H * (.05 + R() * .2), color: pick(['#9ccc35', '#7fae22', '#c8e05a']),
               r: e.h * .016 * (.7 + R() * .7), life: 1.2, max: 1.2, floor, splat: f => R() < .03 && puddle(f.x / W, e.z + .012, 'puke', .45) });
        }
      } else if (e.st >= 1.4) {
        puddle(e.x + e.face * .07, e.z + .015, 'puke', 1.4); snd('splat', e.x); set(e, 'idle');
        for (const o of near(e, S.guests, .14)) if ((o.state === 'idle' || o.state === 'walk') && R() < .45) startPuke(o, .3 + R() * .6);  // sympathetic pukers
      }
      break;
    case 'win': if (!e.y && R() < dt * 3) e.vy = 1.7; break;
  }
  const lying = ['down', 'cry', 'ko', 'slip'].includes(e.state) || (e.state === 'faint' && e.st > .4);
  if (e.state === 'flip') e.rot = -TAU * clamp(e.st / .8, 0, 1) * e.spin;
  else if (e.state === 'beam' || e.state === 'fall') e.rot += dt * 6;
  else {
    const dance = S.disco > 0 && e.role === 'guest' && free ? Math.sin(S.t * 8 + e.seed) * .2 : 0;
    const target = lying ? -Math.PI / 2 : e.state === 'faint' ? Math.sin(e.st * 18) * .15 : e.state === 'puke' ? .45 : e.state === 'hit' ? -.25
      : e.state === 'attack' ? (e.move.low ? -.22 : .14) * Math.sin(Math.PI * clamp(e.st / e.move.t, 0, 1)) : dance;
    e.rot += (target - e.rot) * Math.min(1, dt * (e.state === 'slip' ? 24 : e.state === 'getup' ? 7 : e.state === 'faint' ? 5 : 14));
  }
  e.x = clamp(e.x + e.vx * dt, .04, .96); e.z = clamp(e.z + e.vz * dt, 0, 1);
  if (!free) { const f = Math.exp(-5 * dt); e.vx *= f; e.vz *= f; }  // knockbacks die down; walking speeds are set fresh each frame
  if (e.state !== 'beam' && (e.y > 0 || e.vy > 0)) { e.vy -= 7 * dt; e.y = Math.max(0, e.y + e.vy * dt); if (!e.y) e.vy = 0; }
  e.h = tall(e.z); e.X = e.x * W; e.Y = feetY(e.z) - e.y * e.h;
}

// ---- drawing
function drawItem(type, h, ang, ammo) {
  const s = h / 330, parts = type === 'champagne' && ammo ? SHAPES.champagne.concat([['r', -4, -72, 8, 13, '#c8a165']]) : SHAPES[type];
  ctx.save(); ctx.rotate(ang); ctx.scale(s, s); ctx.lineJoin = 'round';
  for (const pass of [0, 1]) for (const [k, ...a] of parts) {  // pass 0: white paper rim, pass 1: colour
    const fill = a[a.length - 1];
    let path = null;
    if (k === 'p') path = a[0];
    else { ctx.beginPath(); k === 'r' ? ctx.roundRect(a[0], a[1], a[2], a[3], 4) : ctx.ellipse(a[0], a[1], a[2], a[3], 0, 0, TAU); }
    if (pass) { ctx.fillStyle = fill; path ? ctx.fill(path) : ctx.fill(); }
    else { ctx.lineWidth = 8; ctx.strokeStyle = '#fff'; path ? ctx.stroke(path) : ctx.stroke(); }
  }
  ctx.restore();
}
function star(x, y, r, fill) {
  ctx.fillStyle = fill; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const q = i * TAU / 10 - Math.PI / 2, rr = i % 2 ? r * .45 : r; ctx.lineTo(x + Math.cos(q) * rr, y + Math.sin(q) * rr); }
  ctx.closePath(); ctx.fill();
}
const TEAM = ['#ff4d3a', '#3aa0ff'];
function drawPerson(e) {
  const h = e.h, w = h * e.img.width / e.img.height, p = S.players.indexOf(e);
  ctx.fillStyle = 'rgba(25, 12, 0, .3)';
  ctx.beginPath(); ctx.ellipse(e.X, feetY(e.z), Math.max(2, w * .4 * (1 - Math.min(e.y, .8)) + (e.rot < -1 && e.state !== 'flip' ? h * .25 : 0)), h * .04, 0, 0, TAU); ctx.fill();
  if (p >= 0) {  // fighter: team ring on the floor and a tag overhead, so they stand out from the crowd
    ctx.strokeStyle = TEAM[p]; ctx.lineWidth = h * .012;
    ctx.beginPath(); ctx.ellipse(e.X, feetY(e.z), h * .16, h * .045, 0, 0, TAU); ctx.stroke();
    if (!DOWN.has(e.state)) { const [x, y] = at(e, 1.1); label(`P${p + 1}`, x, y, h * .07, 'center', TEAM[p], 'pixel'); }
  }
  const dancing = S.disco > 0 && e.role === 'guest' && (e.state === 'idle' || e.state === 'walk');
  const bob = e.state === 'walk' ? Math.abs(Math.sin(S.t * 13 + e.seed)) * h * .025 : dancing ? Math.abs(Math.sin(S.t * 8 + e.seed)) * h * .05
    : DOWN.has(e.state) ? 0 : (Math.sin(S.t * 2.2 + e.seed) * .5 + .5) * h * .006;
  ctx.save(); ctx.translate(e.X, e.Y - bob); ctx.scale(e.face, 1); ctx.rotate(e.rot);
  if (e.flash > 0) ctx.filter = 'brightness(2.6)';
  ctx.drawImage(e.img, -w / 2, -h, w, h);
  ctx.filter = 'none';
  if (e.item) { ctx.translate(w * .3, -h * .5); drawItem(e.item.type, h, e.state === 'attack' ? -1.6 + 2.4 * clamp(e.st / e.move.t, 0, 1) : -.35, e.item.ammo); }
  ctx.restore();
  if (e.state === 'faint' || e.state === 'ko' || (e.role === 'fighter' && e.state === 'down')) {  // seeing stars
    const [x, y] = at(e, .95);
    for (let i = 0; i < 3; i++) { const q = S.t * 4 + i * TAU / 3; star(x + Math.cos(q) * h * .08, y - h * .06 + Math.sin(q) * h * .025, h * .022, '#ffe14d'); }
  }
}
function drawLoose(it) {
  const h = tall(it.z);
  ctx.save(); ctx.translate(it.x * W, feetY(it.z) - it.y * h - h * .02);
  if (it.type === 'raygun' && !it.y) { ctx.globalAlpha = .5 + .5 * Math.sin(S.t * 8); star(0, -h * .12, h * .03, '#b8ff9e'); ctx.globalAlpha = 1; }  // alien loot glints
  drawItem(it.type, h * .8, it.y ? S.t * 9 : it.type === 'raygun' ? 0 : Math.PI / 2, it.ammo);
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
  drawItem(s.type, h * (s.type === 'cork' ? 1.4 : .9), s.type === 'cork' ? Math.sign(s.vx) * Math.PI / 2 : s.spin, 0);
  ctx.restore();
}
function drawPuddle(p) {
  const sc = .55 + .45 * p.z, rx = p.r * sc * W, ry = rx * .3, X = p.x * W, Y = feetY(p.z);
  ctx.globalAlpha = Math.min(1, p.life / 3);
  ctx.fillStyle = p.kind === 'puke' ? 'rgba(140, 186, 40, .8)' : 'rgba(246, 190, 72, .5)';
  ctx.beginPath(); ctx.ellipse(X, Y, rx, ry, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = p.kind === 'puke' ? 'rgba(96, 128, 20, .9)' : 'rgba(255, 250, 225, .55)';
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
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx, by); ctx.arc(bx, by, H * 1.1, Math.PI / 2 + ang - .13, Math.PI / 2 + ang + .13); ctx.closePath(); ctx.fill();
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
  if (f.k === 'text') { ctx.globalAlpha = Math.min(1, a * 2); label(f.text, f.x, f.y, H * .05 * f.size * (1.25 - .25 * a), 'center', f.color); }
  else if (f.k === 'drop') { ctx.globalAlpha = Math.min(1, a * 2); ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill(); }
  else if (f.k === 'spark') {
    const r = f.r * (1.4 - a * .4); ctx.globalAlpha = a; ctx.fillStyle = '#fff6a0'; ctx.strokeStyle = '#ff8a00'; ctx.lineWidth = r * .08;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) { const q = i * TAU / 16, rr = i % 2 ? r * .4 : r; ctx.lineTo(f.x + Math.cos(q) * rr, f.y + Math.sin(q) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (f.k === 'swoosh') {
    ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = f.r * .18; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(f.x - f.face * f.r * .6, f.y, f.r, f.face > 0 ? -1 : Math.PI - 1, f.face > 0 ? 1 : Math.PI + 1); ctx.stroke();
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
    label(ctrl[i] === 'cpu' ? 'CPU' : ctrl[i] === 'pad' ? 'PAD' : 'KEYS', i ? x + bw : x, y - H * .012, H * .018, i ? 'right' : 'left', '#ffe066', 'pixel');
  });
  label(String(Math.max(0, Math.ceil(S.clock))), W / 2, y + bh, H * .045, 'center', '#fff', 'pixel');
  if (S.banner && (S.phase !== 'fight' || S.bannerT > 0)) {
    const size = H * (S.banner.length > 10 ? .085 : .14), g = ctx.createLinearGradient(0, H * .42 - size, 0, H * .42);
    g.addColorStop(0, '#fffbd0'); g.addColorStop(.5, '#ffd23f'); g.addColorStop(1, '#ff7b00');
    label(S.banner, W / 2, H * .42, size, 'center', g);
  }
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
  hud();
}

// ---- matches
async function newMatch(pair) {
  const L = window.LAYERS, n = L.cards.length;
  const androids = L.cards.map((c, k) => c.cy ? k : -1).filter(k => k >= 0);
  pair = pair && pair.length === 2 ? pair : shuffle(androids.length >= 2 ? androids : [...Array(n).keys()]).slice(0, 2);
  const whole = L.cards.some(c => c.full);  // older layer files lack the flag: then everyone may stand
  const others = shuffle([...Array(n).keys()].filter(k => !pair.includes(k) && (!whole || L.cards[k].full))).slice(0, 24);
  const [a, b, ...rest] = await Promise.all([...pair, ...others].map(art));
  const crowd = others.map((k, i) => [k, rest[i]]).filter(([, im]) => solid(im)).slice(0, 18);
  const spots = [];
  for (let tries = 0; spots.length < crowd.length && tries < 600; tries++) {
    const x = .06 + R() * .88, z = R() * .95;
    if (Math.abs(x - .5) < .3 && z > .35) continue;  // keep the middle of the dance floor and the view onto it clear
    if (!spots.some(([u, v]) => Math.hypot(u - x, (v - z) * 1.2) < .085)) spots.push([x, z]);
  }
  const guests = spots.map(([x, z], i) => { const g = person(crowd[i][0], crowd[i][1], 'guest', x, z); g.face = R() < .5 ? 1 : -1; g.wander = R() < .4; return g; });
  const players = [person(pair[0], a, 'fighter', .3, .55), person(pair[1], b, 'fighter', .7, .55)];
  S = { t: 0, phase: 'intro', phaseT: 0, round: S ? S.round + 1 : 1, clock: ROUND_SECONDS, banner: '', bannerT: 0, shake: 0, slowT: 0,
        players, guests, people: [...players, ...guests], items: [], shots: [], puddles: [], fx: [], doves: [], winner: null,
        pukeIn: 2.5, gaspIn: 1, faintIn: 5, flipIn: 4, dovesIn: 3, discoIn: 16, disco: 0, ufoIn: 4, ufo: null, ufos: 0 };
  snd('bell');
}
function frame(t) {
  raf = requestAnimationFrame(frame);
  let dt = Math.min(.05, (t - lastT) / 1000 || 0); lastT = t;
  if (!S) return;
  if (S.slowT > 0) { S.slowT -= dt; dt *= .35; }
  update(dt);
  if (S) draw();
}
function fit() {
  const r = root.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  W = cv.width = Math.max(1, Math.round(r.width * d)); H = cv.height = Math.max(1, Math.round(r.height * d));
}
async function start(pair) {
  root = document.getElementById('brawl'); cv = root.querySelector('canvas'); ctx = cv.getContext('2d');
  root.hidden = false; window.brawling = true; fit();
  if (!start.ro) { start.ro = new ResizeObserver(fit); start.ro.observe(root); }
  S = null;
  const im = new Image(); im.src = window.BALLROOM || window.LAYERS.bg;  // fall back to the venue's own empty courtyard
  bg = await im.decode().then(() => im, () => null);
  await Promise.race([Promise.all(['40px Bungee', '20px "Press Start 2P"'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 1500))]).catch(() => {});
  await newMatch(pair);
  cancelAnimationFrame(raf); lastT = performance.now(); raf = requestAnimationFrame(frame);
}
function stop() {
  cancelAnimationFrame(raf); S = null; window.brawling = false;
  if (root) root.hidden = true;
}
addEventListener('keydown', e => {
  if (!window.brawling) return;
  if (e.code === 'Escape') return stop();
  const p = KEYMAP.findIndex(m => Object.values(m).includes(e.code));  // a player's first key press takes over from the CPU
  if (p >= 0) { keys.add(e.code); tapped.add(e.code); ctrl[p] = 'keys'; e.preventDefault(); }
});
addEventListener('keyup', e => keys.delete(e.code));
window.Brawl = { start, stop, get state() { return S; } };  // state: for poking at a running match from the console
})();
