// Comic finishers: when a fighter wins, the game freezes and plays the winner's finishing move as a four-panel comic strip
// over the canvas, then a K.O. card. Everything is a pure function of (scene, t), so both screens of an online match agree.
// fin = { name, panels: [{ act, word, say, cap }] x3, end: { act, word, cap }, quip }; {A} / {V} = attacker / victim name.
// window.Comic: ACTS, ENDS, length(fin), cues(fin) -> [[seconds, sfx]], draw(ctx, W, H, { a, v, fin }, t) with a/v = { rig, img, name },
// and panel(ctx, w, h, scene, spec, lt): one panel on its own (comics.html).
(() => {
'use strict';
const TAU = Math.PI * 2, PI = Math.PI, D = PI / 2, PANEL = 1.15, KO = 2.6;
const ACTS = ['charge', 'uppercut', 'kick', 'slap', 'cake', 'champagne', 'bouquet', 'dance', 'hug', 'stomp', 'selfie', 'toast', 'laser', 'rocket',
  'doves', 'chair', 'tie', 'ufo'];
const ENDS = ['pancake', 'moon', 'confetti', 'xray', 'topper', 'chandelier', 'punchbowl', 'pretzel', 'bones', 'framed'];
const ALL = ACTS.concat(ENDS);
const BUNGEE = '"Bungee", Impact, sans-serif', PIXEL = '"Press Start 2P", monospace', INK = '#140b08';
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v, lerp = (a, b, k) => a + (b - a) * k;
const hash = (i, j = 0) => { const x = Math.sin(i * 127.1 + j * 311.7 + 74.7) * 43758.5453; return x - Math.floor(x); };
const out3 = k => 1 - (1 - k) ** 3, back = k => { const m = k - 1; return 1 + 2.9 * m ** 3 + 1.9 * m ** 2; };
const rotP = (p, c, a) => { if (!a) return p; const s = Math.sin(a), co = Math.cos(a), x = p[0] - c[0], y = p[1] - c[1];
  return [c[0] + x * co - y * s, c[1] + x * s + y * co]; };
const turn = sx => Math.sign(sx || 1) * Math.max(.2, Math.abs(sx));  // a figure spinning like a top, never edge-on
const mix = (p, q, s) => [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s];

const WORDS = { charge: 'VROOOM!', uppercut: 'KA-POW!', kick: 'WHAM!', slap: 'SMACK!', cake: 'SPLORCH!', champagne: 'POP!', bouquet: 'FWOOMP!',
  dance: 'BOOGIE!', hug: 'CRUNCH!', stomp: 'STOMP!', selfie: 'FLASH!', toast: 'ZZZ...', laser: 'ZZZAP!', rocket: 'KA-BOOM!', doves: 'COO-COO!',
  chair: 'CLANG!', tie: 'WHIP!', ufo: 'BZZZT!', pancake: 'SPLAT!', moon: 'PING!', confetti: 'POOF!', xray: 'CRACK!', topper: 'SHRINK!',
  chandelier: 'CLINK!', punchbowl: 'SPLOOSH!', pretzel: 'TWIST!', bones: 'CLATTER!', framed: 'SQUISH!' };
const SFX = { charge: [[.02, 'swingHeavy'], [.3, 'gasp']], uppercut: [[.1, 'punch'], [.3, 'clatter']], kick: [[.1, 'kick'], [.32, 'whoops']],
  slap: [[.1, 'thwack'], [.35, 'daze']], cake: [[.12, 'splat'], [.4, 'gasp']], champagne: [[.05, 'pop'], [.22, 'splat']],
  bouquet: [[.02, 'swing'], [.28, 'pop']], dance: [[0, 'disco'], [.45, 'daze']], hug: [[.1, 'smash'], [.35, 'cry']],
  stomp: [[.02, 'boing'], [.24, 'thud']], selfie: [[.1, 'shutter'], [.28, 'boing']], toast: [[.05, 'bell'], [.5, 'hic']],
  laser: [[.06, 'zap'], [.3, 'beam']], rocket: [[.04, 'swingHeavy'], [.3, 'crash']], doves: [[.02, 'whistle'], [.2, 'flap']],
  chair: [[.1, 'metal'], [.32, 'clatter']], tie: [[.04, 'swing'], [.3, 'whoops']], ufo: [[.02, 'whistle'], [.25, 'ufo']],
  pancake: [[.1, 'smash'], [.3, 'splat']], moon: [[.05, 'boing'], [.5, 'bell']], confetti: [[.1, 'pop'], [.3, 'cheerSoft']],
  xray: [[.08, 'smash'], [.3, 'crash']], topper: [[.1, 'boing'], [.4, 'cheerSoft']], chandelier: [[.1, 'crash'], [.35, 'clatter']],
  punchbowl: [[.1, 'splat'], [.4, 'hic']], pretzel: [[.08, 'whoops'], [.35, 'cry']], bones: [[.1, 'clatter'], [.4, 'bonk']],
  framed: [[.1, 'crash'], [.4, 'shutter']] };
// backdrop: [style, base colour, ray colour, ray centre x, y (fractions of the panel), white sound word]
const BG = { charge: ['speed', '#ff8a1f', '#ffd23f'], uppercut: ['rays', '#ff3b30', '#ffcc00', .66, .3], kick: ['rays', '#1e7bff', '#7fe3ff', .5, .5],
  slap: ['rays', '#ff2d8f', '#ffb3d9', .68, .3], cake: ['rays', '#ff8cc0', '#ffe3f0', .68, .3, 1], champagne: ['rays', '#ffae00', '#fff09a', .75, .45, 1],
  bouquet: ['rays', '#8a2be2', '#ff79d6', .7, .45], dance: ['disco'], hug: ['rays', '#e3122d', '#ff8a3d', .5, .5],
  stomp: ['focus', '#ffd400', '#ff7a00', .56, .55, 1], selfie: ['rays', '#ffe94d', '#ffffff', .27, .25, 1], toast: ['rays', '#4b5bc8', '#7d8cff', .74, .4],
  laser: ['rays', '#2a0010', '#b3001e', .72, .45], rocket: ['speed', '#ff4d1f', '#ffc08a'], doves: ['rays', '#38b6ff', '#cfefff', .7, .3],
  chair: ['rays', '#14b36f', '#c4ff5c', .68, .3], tie: ['swirl', '#6a1fe0', '#ff4fd8', .7, .5], ufo: ['night'],
  pancake: ['rays', '#ffc400', '#fff27a', .55, .45, 1], moon: ['night'], confetti: ['party', '#ff2d6f', '#ffd400', .66, .55], xray: ['xray'],
  topper: ['rays', '#ff8cc6', '#fff0f8', .62, .35], chandelier: ['rays', '#6b0f2a', '#c8962e', .55, .15], punchbowl: ['rays', '#ff6a00', '#ffd27a', .62, .5],
  pretzel: ['rays', '#a24c0c', '#ffb347', .64, .5], bones: ['rays', '#28093f', '#5f22b8', .64, .7], framed: ['wall'] };

// ---- poses (Puppet format, figure frame: 0 = forward, D = down, -D = up); the game's own are in Brawl.POSE
const bp = (n, ...a) => { const P = window.Brawl && window.Brawl.POSE; return P && P[n] ? P[n](...a) : {}; };
const legs = (f, b, fs = f, bs = b) => ({ fTh: [f], fSh: [fs], bTh: [b], bSh: [bs] });
const STANCE = legs(D - .22, D + .25, D + .05, D + .35), LUNGE = legs(D - .35, D + .35, D - .1, D + .45);
const POSE = {
  uppercut: { torso: -.2, head: -.3, fUA: [-1.4], fFA: [-1.65], bUA: [D + .6], bFA: [-.6], ...legs(D - .9, D + .55, D + .25, D + 1) },
  flykick: { torso: -.45, head: .25, fUA: [-.5], fFA: [-1.1], bUA: [D + 1.5], bFA: [D + 1.1], ...legs(-.05, D + .7, -.05, D + 1.7) },
  fold: { torso: 1.2, head: .5, fUA: [D + .6], fFA: [D + .9], bUA: [D + .4], bFA: [D + .7], ...legs(D - .55, D - .25, D + .35, D + .55) },
  slap: { torso: .35, head: .15, fUA: [.35], fFA: [.75], bUA: [D + .9], bFA: [D + .1], ...LUNGE },
  spun: { torso: -.25, head: -.45, fUA: [-.5], fFA: [-.1], bUA: [PI - .2], bFA: [PI + .2], ...legs(D - .35, D + .3, D, D + .5) },
  hug: { torso: .22, head: .15, fUA: [-.1], fFA: [2.7], bUA: [.05], bFA: [2.9], ...STANCE },
  squeezed: { torso: -.2, head: -.55, fUA: [D - .15], fFA: [D + .15], bUA: [D - .1], bFA: [D + .1], ...legs(D - .05, D + .05, D + .4, D - .2) },
  stomp: { torso: .1, head: .35, fUA: [-1.8], fFA: [-2.4], bUA: [-1.25], bFA: [-.7], ...legs(D - .05, D - 1.3, D, D + .1) },
  squashed: { torso: .25, head: -.15, fUA: [-.25], fFA: [-.1], bUA: [PI + .25], bFA: [PI + .1], ...legs(.5, PI - .5, D, D) },
  selfie: { torso: -.12, head: .25, fUA: [-.8], fFA: [-1.2], bUA: [D - .4], bFA: [-1.9], ...STANCE },
  shock: { torso: -.3, head: -.35, fUA: [-D - .7], fFA: [-D - .4], bUA: [-D + .7], bFA: [-D + .4], ...legs(D - .35, D + .35, D + .15, D + .55) },
  toast: { torso: -.1, head: -.2, fUA: [-.95], fFA: [-1.75], bUA: [D - .35], bFA: [-.2], ...legs(D - .1, D + .1) },
  asleep: { torso: .3, head: .75, fUA: [D + .12], fFA: [D + .15], bUA: [D + .05], bFA: [D + .1], ...legs(D - .12, D + .15, D + .2, D + .1) },
  whistle: { torso: -.08, head: -.25, fUA: [D + .35], fFA: [-2.5], bUA: [-1.1], bFA: [-1.45], ...STANCE },
  lasso: { torso: -.1, head: -.2, fUA: [-1.45], fFA: [-1.75], bUA: [D + .5], bFA: [-.5], ...STANCE },
  power: { torso: -.12, head: -.1, fUA: [D + .45], fFA: [D + 1.1], bUA: [D - .45], bFA: [D - 1.1], ...legs(D - .3, D + .3) },
  fever: { torso: -.1, head: -.15, fUA: [-1.2], fFA: [-1.3], bUA: [D + .5], bFA: [D + .3], ...legs(D - .35, D + .15, D + .1, D + .3) },
  flex: { head: -.1, fUA: [-.1], fFA: [-D - .3], bUA: [PI + .1], bFA: [-D + .3], ...legs(D - .3, D + .3) },
  star: { head: -.1, fUA: [-.55], fFA: [-.65], bUA: [PI + .55], bFA: [PI + .65], ...legs(D - .6, D + .6) },
  laugh: { torso: .25, head: -.3, fUA: [-.15], fFA: [-.2], bUA: [D + .3], bFA: [.4], ...legs(D - .2, D + .2) },
  stiff: { fUA: [D + .05], fFA: [D], bUA: [D - .05], bFA: [D], ...legs(D, D) },
  pretzel: { torso: .9, head: -1.1, fUA: [PI + .9], fFA: [-.7], bUA: [.8], bFA: [PI - .2], ...legs(-1.8, -2.4, 2.5, .3) },
  dust: { torso: .05, head: .25, fUA: [D - .25], fFA: [-.25], bUA: [D - .15], bFA: [-.05], ...STANCE },
  lookout: { torso: -.15, head: -.3, fUA: [-.6], fFA: [-2.7], bUA: [D + .2], bFA: [D + .3], ...legs(D - .1, D + .1) },
  dangle: t => ({ head: .2, fUA: [-D + .3 * Math.sin(t * 5)], fFA: [-D], bUA: [-D - .3 * Math.sin(t * 5 + 1)], bFA: [-D],
    ...legs(D - .5 * Math.sin(t * 9), D + .5 * Math.sin(t * 9), D + .3, D - .3) }),
  kicking: t => ({ torso: 0, fUA: [-D + .2], fFA: [-D + .4], bUA: [-D - .2], bFA: [-D - .4],
    ...legs(D - .7 * Math.sin(t * 15), D + .7 * Math.sin(t * 15), D + .6 + .5 * Math.sin(t * 15 + 1), D + .6 - .5 * Math.sin(t * 15 + 1)) }),
};

// ---- puppets: body() solves a pose once; paint() draws it; at() says where a joint landed in panel coordinates
function body(P, pose, x, y, h, o = {}) {
  const r = P && P.rig, a = r ? Puppet.solve(r, pose || {}) : null;
  return { P: P || {}, r, a, x, y, h, o, sink: r && !o.air ? Puppet.sink(r, a) : 0 };
}
function paint(g, b) {
  const { P, r, o, h } = b, img = P.img;
  if (!r && !(img && (img.naturalWidth || img.width))) return;
  g.save(); g.translate(b.x, b.y);
  if (o.rot) { const py = -h * (o.piv ?? .5); g.translate(0, py); g.rotate(o.rot); g.translate(0, -py); }
  g.scale((o.face || 1) * (o.sx || 1), o.sy || 1);
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  if (r) Puppet.draw(g, r, b.a, h, { sink: b.sink, hand: o.hand ? () => o.hand(g) : null });
  else {
    const iw = h * (img.naturalWidth || img.width) / (img.naturalHeight || img.height);
    g.drawImage(img, -iw / 2, -h, iw, h);
    if (o.hand) { g.translate(h * .2, -h * .55); o.hand(g); }
  }
  g.restore();
}
function loc(b, lx, ly) {  // a point in the figure's own frame (px from its feet, facing +x) -> panel coordinates
  const o = b.o, q = rotP([lx * (o.face || 1) * (o.sx || 1), ly * (o.sy || 1)], [0, -b.h * (o.piv ?? .5)], o.rot || 0);
  return [b.x + q[0], b.y + q[1]];
}
const FLAT = { hip: [0, -.48], neck: [0, -.8], crown: [0, -1], fs: [.1, -.78], bs: [-.1, -.78], fe: [.13, -.62], be: [-.13, -.62], fw: [.14, -.47],
  bw: [-.14, -.47], fhand: [.14, -.43], bhand: [-.14, -.43], fh: [.06, -.48], bh: [-.06, -.48], fk: [.07, -.25], bk: [-.07, -.25], fa: [.07, -.03],
  ba: [-.07, -.03] };
function joints(b) {
  if (b.j) return b.j;
  const out = b.j = {}, r = b.r;
  if (!r) { for (const n in FLAT) out[n] = loc(b, FLAT[n][0] * b.h, FLAT[n][1] * b.h); return out; }
  const J = r.J, a = b.a, kk = b.h / (r.foot - r.top), sk = b.sink * (r.foot - r.top), TOR = ['hip', a.torso];
  const put = (n, ...ch) => { const p = ch.reduce((q, [c, ang]) => rotP(q, J[c], ang || 0), J[n]);
    out[n] = loc(b, (p[0] - r.cx) * kk, (p[1] - r.foot + sk) * kk); };
  put('hip'); put('neck', TOR); put('crown', ['neck', a.head], TOR);
  for (const s of 'fb') {
    const UA = [s + 's', a[s + 'UA']], FA = [s + 'e', a[s + 'FA']], top = r.skirt ? ['hip', a.skirt] : [s + 'h', a[s + 'Th']];
    put(s + 's', TOR); put(s + 'e', UA, TOR); put(s + 'w', FA, UA, TOR); put(s + 'hand', FA, UA, TOR);
    put(s + 'h'); put(s + 'k', top); put(s + 'a', [s + 'k', a[s + 'Sh']], top);
  }
  return out;
}
function at(b, n) {
  const j = joints(b);
  switch (n) {
    case 'hr': return Math.hypot(j.crown[0] - j.neck[0], j.crown[1] - j.neck[1]) * .5;
    case 'head': return mix(j.neck, j.crown, .55);
    case 'mouth': return mix(j.neck, j.crown, .3);
    case 'chest': return mix(j.neck, j.hip, .3);
    case 'belly': return mix(j.neck, j.hip, .7);
    case 'hand': return mix(j.fw, j.fhand, .5);
    case 'bhand': return mix(j.bw, j.bhand, .5);
    case 'foot': return j.fa;
    case 'bfoot': return j.ba;
  }
  return j[n];
}
function eyes(b) {  // the portraits face the camera: two eyes side by side across the head
  const j = joints(b), hr = at(b, 'hr') || 1, c = at(b, 'head'), ux = (j.crown[0] - j.neck[0]) / (2 * hr), uy = (j.crown[1] - j.neck[1]) / (2 * hr);
  const e = [c[0] + ux * hr * .18, c[1] + uy * hr * .18];
  return [-1, 1].map(s => [e[0] - uy * s * hr * .34, e[1] + ux * s * hr * .34]);
}

// ---- ink and paper
const ink = (g, fill, lw) => { if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); } };
const outline = (g, fill, lw) => { g.lineWidth = lw * 2; g.strokeStyle = INK; g.stroke(); g.fillStyle = fill; g.fill(); };
 // a union of shapes, outside edge only
function burst(g, x, y, r, n, seed, fill, lw, inner = .55) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = i * PI / n + seed, rr = i % 2 ? r * inner : r * (.75 + .5 * hash(seed, i));
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); ink(g, fill, lw);
}
function star(g, x, y, r, rot, fill, lw) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = rot + i * PI / 5 - D, rr = i % 2 ? r * .45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); ink(g, fill, lw);
}
function twinkle(g, x, y, r, fill) {
  g.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * PI / 4, rr = i % 2 ? r * .2 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fillStyle = fill; g.fill();
}
function puff(g, x, y, r, fill, seed = 0, lw = r * .1) {
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = i * TAU / 5 + seed, rr = r * (.5 + .2 * hash(seed, i)), cx = x + Math.cos(a) * r * .45, cy = y + Math.sin(a) * r * .3;
    g.moveTo(cx + rr, cy); g.arc(cx, cy, rr, 0, TAU);
  }
  if (lw) outline(g, fill, lw); else { g.fillStyle = fill; g.fill(); }
}
function spiral(g, x, y, r, rot, color, lw) {
  g.beginPath();
  for (let i = 0; i <= 40; i++) { const q = i / 40, a = rot + q * TAU * 2.3; g.lineTo(x + Math.cos(a) * r * q, y + Math.sin(a) * r * q * .55); }
  g.strokeStyle = color; g.lineWidth = lw; g.stroke();
}
function tooth(g, x, y, s, rot) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s); g.beginPath();
  g.moveTo(-.45, -.3); g.quadraticCurveTo(-.5, -.75, -.2, -.65); g.quadraticCurveTo(0, -.55, .2, -.65); g.quadraticCurveTo(.5, -.75, .45, -.3);
  g.lineTo(.35, .45); g.quadraticCurveTo(.25, .65, .13, .4); g.lineTo(0, .08); g.lineTo(-.13, .4); g.quadraticCurveTo(-.25, .65, -.35, .45);
  g.closePath();
  g.restore(); ink(g, '#fffdf2', s * .1);
}
function drop(g, x, y, s, rot, fill = '#8fe3ff') {
  g.save(); g.translate(x, y); g.rotate(rot); g.beginPath();
  g.moveTo(0, -s); g.bezierCurveTo(s * .7, -s * .1, s * .65, s * .65, 0, s * .65); g.bezierCurveTo(-s * .65, s * .65, -s * .7, -s * .1, 0, -s);
  g.restore(); ink(g, fill, s * .16);
}
function heart(g, x, y, s, fill) {
  g.beginPath(); g.moveTo(x, y + s * .4);
  g.bezierCurveTo(x - s * 1.1, y - s * .3, x - s * .5, y - s * 1.05, x, y - s * .45);
  g.bezierCurveTo(x + s * .5, y - s * 1.05, x + s * 1.1, y - s * .3, x, y + s * .4);
  ink(g, fill, s * .14);
}
function note(g, x, y, s, fill = INK) {
  g.save(); g.translate(x, y); g.lineWidth = s * .14;
  g.beginPath(); g.ellipse(0, 0, s * .32, s * .23, -.4, 0, TAU); g.moveTo(s * .27, -s * .05); g.lineTo(s * .27, -s);
  g.quadraticCurveTo(s * .45, -s * .6, s * .7, -s * .55);
  g.strokeStyle = '#fff'; g.lineWidth = s * .3; g.stroke(); g.lineWidth = s * .13; g.strokeStyle = fill; g.stroke(); g.fillStyle = fill;
  g.beginPath(); g.ellipse(0, 0, s * .32, s * .23, -.4, 0, TAU); g.fill();
  g.restore();
}
function zzz(g, x, y, s, lt) {
  g.font = `${s}px ${BUNGEE}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  for (let j = 0; j < 3; j++) {
    const q = (lt * .7 + j / 3) % 1, sz = .6 + q * .9;
    g.save(); g.translate(x + q * s * 1.6 + Math.sin(q * 6 + j) * s * .2, y - q * s * 2.4); g.rotate(-.25); g.scale(sz, sz);
    g.globalAlpha *= clamp((1 - q) * 3);
    g.lineWidth = s * .22; g.strokeStyle = INK; g.strokeText('Z', 0, 0); g.fillStyle = '#fff'; g.fillText('Z', 0, 0);
    g.restore();
  }
}
function stars(g, x, y, rx, ry, lt, n, s) {  // dizzy stars circling a head
  for (let j = 0; j < n; j++) { const a = lt * 4 + j * TAU / n;
    star(g, x + Math.cos(a) * rx, y + Math.sin(a) * ry, s * (.8 + .25 * Math.sin(a)), a, '#ffe14d', s * .14); }
}
function cake(g, x, y, s) {  // three tiers, bottom centre at (x, y), s = width of the bottom tier
  g.save(); g.translate(x, y); let yy = 0;
  [[1, .34], [.74, .3], [.5, .27]].forEach(([tw, th], i) => {
    const hw = s * tw / 2, ht = s * th;
    g.beginPath(); g.roundRect(-hw, yy - ht, hw * 2, ht, s * .03); ink(g, '#fff6ea', s * .022);
    g.beginPath(); g.moveTo(-hw, yy - ht + s * .02);
    for (let j = 0; j < 6; j++) { const x0 = -hw + j * hw / 3, d = s * (.06 + .05 * hash(i, j));
      g.quadraticCurveTo(x0 + hw / 6, yy - ht + d * 1.6, x0 + hw / 3, yy - ht + s * .02); }
    g.lineTo(hw, yy - ht + s * .01); g.quadraticCurveTo(hw, yy - ht - s * .02, hw - s * .03, yy - ht - s * .02);
    g.lineTo(-hw + s * .03, yy - ht - s * .02);
    g.quadraticCurveTo(-hw, yy - ht - s * .02, -hw, yy - ht + s * .02); ink(g, '#ff8fc4', s * .02);
    g.fillStyle = '#ffd6ea'; for (let j = 1; j < 6; j++) { g.beginPath(); g.arc(-hw + j * hw / 3, yy - ht * .3, s * .018, 0, TAU); g.fill(); }
    yy -= ht;
  });
  heart(g, 0, yy - s * .1, s * .09, '#ff2d5b');
  g.restore();
}
function flower(g, x, y, r, col) {
  g.beginPath();
  for (let i = 0; i < 5; i++) { const a = i * TAU / 5, px = x + Math.cos(a) * r * .5, py = y + Math.sin(a) * r * .5; g.moveTo(px + r * .5, py);
    g.arc(px, py, r * .5, 0, TAU); }
  outline(g, col, r * .08);
  g.beginPath(); g.arc(x, y, r * .3, 0, TAU); ink(g, '#ffd23f', r * .1);
}
function bouquet(g, x, y, s, rot) {  // the stems' end at (x, y), flowers toward -y
  g.save(); g.translate(x, y); g.rotate(rot);
  for (const a of [-1, 1]) { g.beginPath(); g.ellipse(a * s * .3, -s * .58, s * .18, s * .07, a * .7, 0, TAU); ink(g, '#3fae4a', s * .025); }
  g.beginPath(); g.moveTo(-s * .1, 0); g.lineTo(s * .1, 0); g.lineTo(s * .3, -s * .5); g.lineTo(-s * .3, -s * .5); g.closePath();
  ink(g, '#fffaf0', s * .03);
  for (const [fx, fy, col] of [[-.22, -.62, '#fff'], [.22, -.62, '#ffd1e3'], [0, -.8, '#ff4f8b'],
    [-.18, -.88, '#ffd1e3'], [.18, -.86, '#fff'], [0, -.6, '#ff7aa8']])
    flower(g, fx * s, fy * s, s * .17, col);
  g.beginPath(); g.ellipse(-s * .1, -s * .25, s * .1, s * .05, -.5, 0, TAU); g.ellipse(s * .1, -s * .25, s * .1, s * .05, .5, 0, TAU);
  ink(g, '#ff2d6f', s * .02);
  g.restore();
}
function petal(g, x, y, s, rot, col) { g.beginPath(); g.ellipse(x, y, s, s * .55, rot, 0, TAU); ink(g, col, s * .18); }
function dove(g, x, y, s, face, flap) {
  g.save(); g.translate(x, y); g.scale(face, 1); const lw = s * .09;
  g.beginPath(); g.moveTo(-s * .45, 0); g.lineTo(-s * 1.05, -s * .3); g.lineTo(-s * 1.05, s * .22); g.closePath(); ink(g, '#fff', lw);
  g.beginPath(); g.ellipse(0, 0, s * .62, s * .32, -.1, 0, TAU); ink(g, '#fff', lw);
  g.beginPath(); g.arc(s * .55, -s * .24, s * .23, 0, TAU); ink(g, '#fff', lw);
  g.beginPath(); g.moveTo(s * .74, -s * .29); g.lineTo(s * 1.02, -s * .2); g.lineTo(s * .74, -s * .13); g.closePath(); ink(g, '#ff9d1c', lw * .7);
  g.fillStyle = INK; g.beginPath(); g.arc(s * .6, -s * .3, s * .055, 0, TAU); g.fill();
  const ty = -s * (.25 + .85 * flap);
  g.beginPath(); g.moveTo(-s * .3, -s * .05); g.quadraticCurveTo(-s * .25, ty * .9, s * .25, ty);
  g.quadraticCurveTo(s * .2, ty * .35, s * .22, -s * .05); g.closePath(); ink(g, '#f4f7ff', lw);
  g.restore();
}
function feather(g, x, y, s, rot) {
  g.save(); g.translate(x, y); g.rotate(rot); g.beginPath(); g.ellipse(0, 0, s, s * .32, 0, 0, TAU); ink(g, '#fff', s * .12);
  g.beginPath(); g.moveTo(-s * 1.2, 0); g.lineTo(s * .9, 0); g.lineWidth = s * .08; g.strokeStyle = '#9aa4b5'; g.stroke(); g.restore();
}
function ufoShip(g, x, y, s, lt) {  // s = half-width of the saucer
  g.save(); g.translate(x, y); g.rotate(Math.sin(lt * 2) * .07); const lw = s * .05;
  g.beginPath(); g.ellipse(0, -s * .16, s * .42, s * .4, 0, PI, 0); g.closePath(); ink(g, 'rgba(170, 235, 255, .9)', lw);
  g.beginPath(); g.ellipse(0, -s * .3, s * .15, s * .17, 0, 0, TAU); ink(g, '#7ddb4f', lw * .7);
  g.fillStyle = INK; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * s * .065, -s * .31, s * .05, s * .08, sx * .5, 0, TAU); g.fill(); }
  const gr = g.createLinearGradient(0, -s * .2, 0, s * .2); gr.addColorStop(0, '#f2f5f8'); gr.addColorStop(1, '#69737f');
  g.beginPath(); g.ellipse(0, 0, s, s * .24, 0, 0, TAU); ink(g, gr, lw);
  for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(-s * .66 + i * s * .22, s * .07, s * .055, 0, TAU);
    ink(g, ['#ff5a5a', '#ffe14d', '#5ad1ff'][(i + Math.floor(lt * 7)) % 3], lw * .5); }
  g.restore();
}
function handprint(g, x, y, s, rot) {
  g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = 'rgba(232, 16, 40, .85)';
  g.beginPath(); g.ellipse(0, s * .2, s * .36, s * .4, 0, 0, TAU); g.fill();
  [[-.27, -.55, -.25], [-.09, -.68, -.08], [.1, -.66, .08], [.27, -.5, .25]].forEach(([fx, fy, a]) => {
    g.save(); g.translate(fx * s, fy * s); g.rotate(a); g.beginPath(); g.roundRect(-s * .08, -s * .28, s * .16, s * .6, s * .08); g.fill();
    g.restore();
  });
  g.save(); g.translate(s * .42, s * .1); g.rotate(1.1); g.beginPath(); g.roundRect(-s * .08, -s * .25, s * .16, s * .45, s * .08); g.fill();
  g.restore();
  g.restore();
}
function phone(g, s) {  // in the hand frame: held up along the forearm
  g.save(); g.rotate(-D); g.beginPath(); g.roundRect(-s * .3, -s * 1.05, s * .6, s * 1.05, s * .1); ink(g, '#22252e', s * .06);
  g.beginPath(); g.roundRect(-s * .22, -s * .95, s * .44, s * .82, s * .05); ink(g, '#58d4ff');
  g.restore();
}
function flute(g, s) {  // champagne glass along the forearm
  g.save(); g.lineWidth = s * .05;
  g.beginPath(); g.moveTo(s * .05, 0); g.lineTo(s * .45, 0); g.strokeStyle = INK; g.lineWidth = s * .09; g.stroke(); g.strokeStyle = '#e8f6ff';
  g.lineWidth = s * .04; g.stroke();
  g.beginPath(); g.moveTo(s * .45, -s * .03); g.lineTo(s * 1.05, -s * .12); g.lineTo(s * 1.05, s * .12); g.lineTo(s * .45, s * .03); g.closePath();
  ink(g, 'rgba(255, 214, 90, .95)', s * .05);
  g.fillStyle = '#fff'; for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(s * (.65 + j * .13), s * .02 * (j - 1), s * .025, 0, TAU); g.fill(); }
  g.restore();
}
function chairArt(g, x, y, s, rot) {  // folding chair, seat centre at (x, y)
  g.save(); g.translate(x, y); g.rotate(rot); g.lineCap = 'round';
  const bar = (pts, w) => { for (const [col, lw] of [[INK, w * 1.7], ['#aab3bd', w]]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
      pts.forEach(([px, py], i) => i ? g.lineTo(px * s, py * s) : g.moveTo(px * s, py * s)); g.stroke(); } };
  bar([[-.32, -.95], [-.38, .6]], s * .07); bar([[.32, -.95], [.38, .6]], s * .07); bar([[-.36, .02], [.3, .6]], s * .06);
  bar([[.36, .02], [-.3, .6]], s * .06);
  g.beginPath(); g.roundRect(-.4 * s, -1.02 * s, .8 * s, .32 * s, s * .06); ink(g, '#8d97a3', s * .05);
  g.beginPath(); g.moveTo(-.44 * s, -.08 * s); g.lineTo(.44 * s, -.08 * s); g.lineTo(.38 * s, .08 * s); g.lineTo(-.38 * s, .08 * s); g.closePath();
  ink(g, '#9aa4ae', s * .05);
  g.restore();
}
function rocketFist(g, x, y, s, ang, lt) {
  g.save(); g.translate(x, y); g.rotate(ang);
  const fl = s * (2 + .3 * Math.sin(lt * 50)), gr = g.createLinearGradient(-fl, 0, -s * .4, 0);
  gr.addColorStop(0, 'rgba(255, 60, 0, 0)'); gr.addColorStop(.4, '#ff5a00'); gr.addColorStop(1, '#ffe14d');
  g.beginPath(); g.moveTo(-s * .45, -s * .38); g.quadraticCurveTo(-fl * .6, -s * .3, -fl, 0);
  g.quadraticCurveTo(-fl * .6, s * .3, -s * .45, s * .38); g.closePath(); g.fillStyle = gr; g.fill();
  const ch = g.createLinearGradient(0, -s * .5, 0, s * .5); ch.addColorStop(0, '#f2f6fa'); ch.addColorStop(.5, '#a9b4bf');
  ch.addColorStop(1, '#4b5560');
  g.beginPath(); g.roundRect(-s * .6, -s * .3, s * .5, s * .6, s * .08); ink(g, ch, s * .07);
  g.beginPath(); g.roundRect(-s * .2, -s * .5, s * .8, s, s * .25); ink(g, ch, s * .08);
  g.strokeStyle = INK; g.lineWidth = s * .06; for (let j = -1; j <= 1; j++) { g.beginPath(); g.moveTo(s * .35, j * s * .25);
    g.lineTo(s * .58, j * s * .25); g.stroke(); }
  g.beginPath(); g.arc(-s * .35, 0, s * .1, 0, TAU); ink(g, '#4fd3ff', s * .04);
  g.restore();
}
function tieLine(g, pts, lw, k = 1) {  // a burgundy necktie, striped, along a path
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  const path = () => { g.beginPath(); g.moveTo(...pts[0]); for (let i = 1; i < pts.length; i++) g.lineTo(...pts[i]); };
  path(); g.strokeStyle = INK; g.lineWidth = lw * 1.6; g.stroke(); g.strokeStyle = '#8e1b2b'; g.lineWidth = lw; g.stroke();
  g.setLineDash([lw * .5, lw * .9]); g.lineDashOffset = -k * lw * 4; g.strokeStyle = '#e8b04a'; g.lineWidth = lw * .45; g.stroke(); g.setLineDash([]);
  g.restore();
}
function shoe(g, x, y, s, face) {
  g.save(); g.translate(x, y); g.scale(face, 1); g.beginPath();
  g.moveTo(-s * .5, 0); g.lineTo(-s * .5, -s * .32); g.quadraticCurveTo(-s * .22, -s * .44, -s * .02, -s * .3);
  g.quadraticCurveTo(s * .45, -s * .28, s * .62, -s * .1);
  g.quadraticCurveTo(s * .66, 0, s * .55, 0); g.closePath(); ink(g, '#1b1b24', s * .07);
  g.fillStyle = 'rgba(255, 255, 255, .55)'; g.beginPath(); g.ellipse(s * .3, -s * .18, s * .12, s * .035, -.3, 0, TAU); g.fill();
  g.restore();
}
function boneArt(g, a, b, lw, pass) {  // pass 0: ink, pass 1: bone white
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * lw * .45, ny = dx / L * lw * .45, w = pass ? lw : lw * 1.7,
    r = pass ? lw * .55 : lw * .55 + lw * .35;
  g.strokeStyle = g.fillStyle = pass ? '#f6f1e2' : INK; g.lineWidth = w; g.lineCap = 'round';
  g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
  g.beginPath(); for (const p of [a, b]) for (const s of [-1, 1]) { g.moveTo(p[0] + nx * s + r, p[1] + ny * s);
    g.arc(p[0] + nx * s, p[1] + ny * s, r, 0, TAU); } g.fill();
}
function skull(g, x, y, r, rot, wink, crack) {
  g.save(); g.translate(x, y); g.rotate(rot); const lw = r * .1;
  g.beginPath(); g.arc(0, -r * .1, r, 0, TAU); g.moveTo(-r * .55, r * .45); g.roundRect(-r * .55, r * .4, r * 1.1, r * .55, r * .2);
  outline(g, '#f6f1e2', lw);
  g.fillStyle = INK;
  g.beginPath(); g.ellipse(-r * .38, 0, r * .25, r * .3, 0, 0, TAU); g.fill();
  if (wink) { g.beginPath(); g.moveTo(r * .14, r * .02); g.quadraticCurveTo(r * .38, -r * .22, r * .62, r * .02); g.lineWidth = lw * 1.3;
    g.strokeStyle = INK; g.stroke(); }
  else { g.beginPath(); g.ellipse(r * .38, 0, r * .25, r * .3, 0, 0, TAU); g.fill(); }
  g.beginPath(); g.moveTo(0, r * .2); g.lineTo(-r * .1, r * .4); g.lineTo(r * .1, r * .4); g.closePath(); g.fill();
  g.strokeStyle = INK; g.lineWidth = lw * .7; g.beginPath();
  for (let i = -2; i <= 2; i++) { g.moveTo(i * r * .2, r * .55); g.lineTo(i * r * .2, r * .9); } g.stroke();
  if (crack) { g.lineWidth = lw; g.beginPath(); g.moveTo(-r * .1, -r * 1.08); g.lineTo(r * .05, -r * .75); g.lineTo(-r * .12, -r * .55);
    g.lineTo(r * .1, -r * .3); g.stroke(); }
  g.restore();
}
function skeleton(g, b, lt, crack) {  // the bones of a posed puppet, on top of it (an x-ray)
  const j = joints(b), hr = at(b, 'hr'), lw = hr * .32;
  const segs = [['neck', 'hip'], ['fs', 'fe'], ['fe', 'fw'], ['bs', 'be'], ['be', 'bw'], ['fh', 'fk'], ['fk', 'fa'], ['bh', 'bk'], ['bk', 'ba'],
    ['fs', 'bs'], ['fh', 'bh']];
  for (const pass of [0, 1]) for (const [p, q] of segs) boneArt(g, j[p], j[q], lw, pass);
  const n = j.neck, hp = j.hip, ux = (n[0] - hp[0]), uy = (n[1] - hp[1]), L = Math.hypot(ux, uy) || 1, px = -uy / L, py = ux / L,
    sw = Math.hypot(j.fs[0] - j.bs[0], j.fs[1] - j.bs[1]) * .55 + hr * .3;
  for (const pass of [0, 1]) for (let i = 0; i < 5; i++) {
    const c = mix(n, hp, .14 + i * .1), wd = sw * (1 - i * .08);
    g.beginPath(); g.moveTo(c[0] - px * wd, c[1] - py * wd);
    g.quadraticCurveTo(c[0] - ux / L * hr * .4, c[1] - uy / L * hr * .4, c[0] + px * wd, c[1] + py * wd);
    g.strokeStyle = pass ? '#f6f1e2' : INK; g.lineWidth = pass ? lw * .6 : lw; g.stroke();
  }
  if (crack) {
    g.strokeStyle = '#ff2d3a'; g.lineWidth = lw * .35;
    for (const s of [.25, .45]) { const c = mix(n, hp, s); g.beginPath(); g.moveTo(c[0] - hr * .4, c[1] - hr * .3);
      g.lineTo(c[0] - hr * .1, c[1] + hr * .05); g.lineTo(c[0] + hr * .15, c[1] - hr * .15); g.lineTo(c[0] + hr * .45, c[1] + hr * .2); g.stroke(); }
  }
  const hd = at(b, 'head'), tilt = Math.atan2(j.crown[0] - j.neck[0], -(j.crown[1] - j.neck[1]));
  skull(g, hd[0], hd[1], hr * .85, tilt, false, crack);
}

// ---- backdrops
const pats = new WeakMap();
function halftone(g, w, h, color, s, alpha) {
  let m = pats.get(g); if (!m) pats.set(g, m = new Map());
  const n = Math.max(4, Math.round(s)), key = color + n;
  let p = m.get(key);
  if (!p) {
    const c = Object.assign(document.createElement('canvas'), { width: n, height: n }), q = c.getContext('2d');
    q.fillStyle = color; for (const [x, y] of [[0, 0], [n, 0], [0, n], [n, n], [n / 2, n / 2]]) { q.beginPath(); q.arc(x, y, n * .2, 0, TAU);
      q.fill(); }
    m.set(key, p = g.createPattern(c, 'repeat'));
  }
  g.save(); g.globalAlpha *= alpha; g.fillStyle = p; g.fillRect(0, 0, w, h); g.restore();
}
function rays(g, w, h, cx, cy, c1, c2, n, spin) {
  g.fillStyle = c1; g.fillRect(0, 0, w, h);
  const R = Math.hypot(w, h) * 1.2; g.fillStyle = c2; g.beginPath();
  for (let i = 0; i < n; i++) { const a = spin + i * TAU / n; g.moveTo(cx, cy); g.arc(cx, cy, R, a, a + TAU / n / 2); g.closePath(); }
  g.fill();
}
function glow(g, w, h, cx, cy, r, col) {
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(255, 255, 255, 0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}
function nightSky(g, w, h, seed, lt) {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#050a2c'); gr.addColorStop(1, '#30207a');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let j = 0; j < 46; j++) {
    const x = hash(seed, j) * w, y = hash(seed, j + 60) * h * .85, r = h * (.004 + .006 * hash(seed, j + 120));
    g.globalAlpha = .45 + .55 * Math.abs(Math.sin(lt * 2 + j * 1.7));
    if (j % 7) { g.fillStyle = '#fffbe0'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); } else twinkle(g, x, y, r * 3.2, '#fffbe0');
  }
  g.globalAlpha = 1;
}
function floorTiles(g, w, h, y0, c1, c2, lt, lit) {  // a checkered dance floor in perspective
  g.fillStyle = c1; g.fillRect(0, y0, w, h - y0);
  const hy = y0 - (h - y0) * 1.4, T = w * .14, cx = w / 2, rows = 5;
  for (let r = 0; r < rows; r++) {
    const ya = y0 + (h - y0) * (r / rows) ** 1.3, yb = y0 + (h - y0) * ((r + 1) / rows) ** 1.3, sa = (ya - hy) / (h - hy), sb = (yb - hy) / (h - hy);
    for (let i = -8; i < 8; i++) {
      if ((i + r) & 1) continue;
      g.fillStyle = lit ? `hsl(${(i * 47 + r * 90 + Math.floor(lt * 4) * 60) % 360} 90% 62%)` : c2;
      g.beginPath(); g.moveTo(cx + i * T * sa, ya); g.lineTo(cx + (i + 1) * T * sa, ya); g.lineTo(cx + (i + 1) * T * sb, yb);
      g.lineTo(cx + i * T * sb, yb); g.closePath(); g.fill();
    }
  }
  g.fillStyle = 'rgba(0, 0, 0, .25)'; g.fillRect(0, y0, w, h * .012);
}
const LIVE = new Set(['night', 'disco']), bgs = new Map();
function backdrop(c, bg) {  // the still ones are painted once per size and reused
  const { g, w, h, lt, seed } = c;
  if (LIVE.has(bg[0])) return paintBg(g, w, h, seed, lt, bg);
  const m = g.getTransform(), s = Math.hypot(m.a, m.b) || 1, key = bg.join() + '|' + seed + '|' + Math.round(w * s) + 'x' + Math.round(h * s);
  let cv = bgs.get(key);
  if (!cv) {
    cv = Object.assign(document.createElement('canvas'), { width: Math.ceil(w * s), height: Math.ceil(h * s) });
    const q = cv.getContext('2d'); q.scale(s, s); paintBg(q, w, h, seed, 0, bg);
    if (bgs.size > 48) bgs.clear(); bgs.set(key, cv);
  }
  g.drawImage(cv, 0, 0, w, h);
}
function paintBg(g, w, h, seed, lt, bg) {
  const [style, c1, c2, fx = .5, fy = .5] = bg, cx = fx * w, cy = fy * h;
  if (style === 'rays' || style === 'focus' || style === 'swirl' || style === 'party') {
    rays(g, w, h, cx, cy, c1, c2, style === 'swirl' ? 24 : style === 'party' ? 14 : 18, seed);
    if (style === 'swirl') for (let i = 0; i < 3; i++) spiral(g, cx, cy, h * (.35 + i * .25), i * 2, 'rgba(255, 255, 255, .35)', h * .012);
    if (style === 'party') { const cols = ['#2dd4ff', '#7dff6a', '#ff8a00', '#b04dff']; const R = w * 1.5;
      for (let i = 0; i < 14; i += 2) { g.fillStyle = cols[i / 2 % 4]; g.beginPath(); g.moveTo(cx, cy); const a = seed + i * TAU / 14 + TAU / 28;
        g.arc(cx, cy, R, a, a + TAU / 28); g.closePath(); g.fill(); } }
    glow(g, w, h, cx, cy, h * .55, 'rgba(255, 255, 240, .6)');
    if (style === 'focus') {  // manga focus lines closing in on the impact
      g.fillStyle = 'rgba(20, 11, 8, .75)'; g.beginPath();
      for (let j = 0; j < 40; j++) { const a = j * TAU / 40 + hash(seed, j) * .1, r0 = h * (.42 + .2 * hash(seed, j + 40)), R = h * 1.4, da = .012;
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a - da) * R, cy + Math.sin(a - da) * R);
        g.lineTo(cx + Math.cos(a + da) * R, cy + Math.sin(a + da) * R); g.closePath(); }
      g.fill();
    }
    halftone(g, w, h, 'rgba(20, 11, 8, .9)', h * .028, .14);
  } else if (style === 'speed') {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255, 255, 255, .55)';
    for (let i = 0; i < 26; i++) {
      const y = hash(seed, i) * h, L = w * (.25 + hash(seed, i + 50) * .5), x = (hash(seed, i + 99) * 1.4 - .3) * w, th = h * (.004 + hash(seed, i + 7) * .012);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + L, y - th); g.lineTo(x + L, y + th); g.closePath(); g.fill();
    }
    halftone(g, w, h, 'rgba(20, 11, 8, .9)', h * .028, .12);
  } else if (style === 'night') nightSky(g, w, h, seed, lt);
  else if (style === 'disco') {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#16052e'); gr.addColorStop(1, '#4a0b63'); g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    floorTiles(g, w, h, h * .72, '#2a0b3e', '#fff', lt, true);
    const bx = w * .5, by = h * .1, r = h * .07;
    g.save(); g.globalCompositeOperation = 'lighter';
    ['255, 60, 200', '60, 200, 255', '255, 220, 60', '120, 255, 120', '255, 120, 60'].forEach((col, i) => {
      const ang = D + Math.sin(lt * (1.3 + i * .37) + i * 2) * .9, gl = g.createRadialGradient(bx, by, 0, bx, by, h * 1.2);
      gl.addColorStop(0, `rgba(${col}, .55)`); gl.addColorStop(1, `rgba(${col}, 0)`);
      g.fillStyle = gl; g.beginPath(); g.moveTo(bx, by); g.arc(bx, by, h * 1.2, ang - .12, ang + .12); g.closePath(); g.fill();
    });
    g.restore();
    g.strokeStyle = '#9aa1a8'; g.lineWidth = h * .006; g.beginPath(); g.moveTo(bx, 0); g.lineTo(bx, by); g.stroke();
    g.beginPath(); g.arc(bx, by, r, 0, TAU); ink(g, '#c9d0d8', h * .006);
    for (let i = 0; i < 18; i++) { const q = i * 2.4 + lt * 3, d = r * .62 * Math.cos(i * 1.3);
      g.fillStyle = `hsl(${(i * 47 + lt * 220) % 360} 90% 78%)`;
      g.fillRect(bx + Math.cos(q) * d - r * .12, by + Math.sin(i * 1.7) * r * .6 - r * .12, r * .24, r * .24); }
  } else if (style === 'xray') {
    const gr = g.createRadialGradient(w * .6, h * .45, 0, w * .6, h * .45, w * .7); gr.addColorStop(0, '#0d3d7a'); gr.addColorStop(1, '#020a1c');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120, 220, 255, .14)'; g.lineWidth = h * .003; g.beginPath();
    for (let x = 0; x < w; x += h * .08) { g.moveTo(x, 0); g.lineTo(x, h); } for (let y = 0; y < h; y += h * .08) { g.moveTo(0, y); g.lineTo(w, y);
      } g.stroke();
  } else if (style === 'wall') {
    g.fillStyle = '#1f6b66'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += h * .14) { g.fillStyle = '#257a74'; g.fillRect(x, 0, h * .07, h); }
    g.fillStyle = 'rgba(232, 196, 110, .55)';
    for (let x = 0, i = 0; x < w + h * .14; x += h * .14, i++) for (let y = (i % 2) * h * .09; y < h; y += h * .18) {
      g.beginPath(); g.moveTo(x + h * .035, y - h * .03); g.lineTo(x + h * .06, y); g.lineTo(x + h * .035, y + h * .03); g.lineTo(x + h * .01, y);
      g.closePath(); g.fill();
    }
    g.fillStyle = '#4a2a16'; g.fillRect(0, h * .86, w, h * .14); g.fillStyle = '#6b3f22'; g.fillRect(0, h * .86, w, h * .02);
  }
}

// ---- the acts (panels 1-3) and the finales (panel 4). c: { g, w, h, lt, k, fh, gy, A, V, seed, shake }; each sets c.word / c.mouth
const ACT = {
  charge(c) {
    const { g, w, h, k, fh, gy, lt, seed } = c, ax = lerp(-.1, .34, k) * w;
    g.fillStyle = '#fff';
    for (let j = 0; j < 9; j++) {
      const y = gy - fh * (.1 + .8 * hash(seed, j)), L = w * (.2 + .3 * hash(seed, j + 9)), x = ax - fh * .2 - w * .05 * hash(seed, j + 3),
        th = h * (.006 + .008 * hash(seed, j + 4));
      g.beginPath(); g.moveTo(x, y - th); g.lineTo(x, y + th); g.lineTo(x - L, y); g.closePath(); g.fill();
    }
    for (let j = 0; j < 4; j++) puff(g, ax - fh * (.22 + j * .17), gy - fh * (.06 + j * .03), fh * (.11 - j * .018), '#f6e7c8', seed + j, h * .004);
    const v = body(c.V, bp('flail', lt * .9), w * .75 + c.shake * 2, gy, fh, { face: -1, rot: -.06 });
    paint(g, v);
    const a = body(c.A, bp('run', lt * 14 + 1), ax, gy, fh, { rot: .12 }); paint(g, a);
    const hd = at(v, 'head'), hr = at(v, 'hr');
    for (let j = 0; j < 5; j++) { const q = -2.6 + j * .55, d = hr * (1.45 + .3 * ((lt * 2 + j * .37) % 1));
      drop(g, hd[0] + Math.cos(q) * d, hd[1] + Math.sin(q) * d, hr * .26, q + D); }
    g.strokeStyle = INK; g.lineWidth = h * .009;
    for (const s of [-1, 1]) for (let j = 0; j < 3; j++) { const q = -D + s * (.75 + j * .35), r0 = hr * 1.5, r1 = hr * 2.05; g.beginPath();
      g.moveTo(hd[0] + Math.cos(q) * r0, hd[1] + Math.sin(q) * r0); g.lineTo(hd[0] + Math.cos(q) * r1, hd[1] + Math.sin(q) * r1); g.stroke(); }
    g.font = `${hr * 2}px ${BUNGEE}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = hr * .35; g.strokeStyle = INK;
    g.lineJoin = 'round';
    g.strokeText('!!', hd[0] + hr * 2.2, hd[1] - hr * 1.6); g.fillStyle = '#ff2d3a'; g.fillText('!!', hd[0] + hr * 2.2, hd[1] - hr * 1.6);
    c.mouth = at(a, 'mouth'); c.word = [w * .5, h * .56, -.14];
  },
  uppercut(c) {
    const { g, w, h, k, fh, gy, lt, seed } = c;
    const a = body(c.A, POSE.uppercut, w * .38, gy - k * fh * .06, fh, { air: 1, rot: -.06 });
    const v = body(c.V, bp('hit'), w * (.6 + .07 * k) + c.shake, gy - k * fh * .16, fh, { face: -1, rot: .15 + .45 * k, air: 1 });
    const f = at(a, 'hand');
    burst(g, f[0], f[1], fh * .22, 11, seed, '#fff36b', h * .008);
    g.strokeStyle = '#fff'; g.lineWidth = h * .012;
    for (let j = 0; j < 4; j++) { const x = f[0] - fh * (.12 - j * .07); g.beginPath(); g.moveTo(x, f[1] + fh * .2);
      g.lineTo(x, f[1] + fh * (.5 + .1 * hash(seed, j))); g.stroke(); }
    paint(g, v); paint(g, a);
    const m = at(v, 'mouth'), hr = at(v, 'hr');
    for (let j = 0; j < 6; j++) {
      const q = -2 + j * .38 + hash(seed, j) * .2, d = hr * (.8 + 2.8 * k * (.55 + .45 * hash(seed, j + 5))) + lt * hr * .5;
      tooth(g, m[0] + Math.cos(q) * d, m[1] + Math.sin(q) * d, hr * .5, lt * (4 + j) + j);
    }
    c.mouth = at(a, 'mouth'); c.word = [w * .72, h * .62, .16];
  },
  kick(c) {
    const { g, w, h, k, fh, gy, seed } = c;
    const a = body(c.A, POSE.flykick, w * (.18 + .08 * k), gy - fh * .2, fh, { air: 1, rot: -.2 });
    const v = body(c.V, POSE.fold, w * (.64 + .05 * k) + c.shake, gy - k * fh * .08, fh, { face: -1, rot: .3 * k, air: 1 });
    const f = at(a, 'foot');
    burst(g, f[0] + fh * .06, f[1], fh * .26, 12, seed, '#ffffff', h * .008);
    g.strokeStyle = '#fff'; g.lineWidth = h * .014;
    for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(f[0] - fh * .2, f[1] + fh * .15, fh * (.2 + j * .07), -1.5, -.4); g.stroke(); }
    paint(g, v); paint(g, a);
    c.mouth = at(a, 'mouth'); c.word = [w * .3, h * .8, -.12];
  },
  slap(c) {
    const { g, w, h, fh, gy, lt, seed } = c, vx = w * .68, wob = Math.sin(lt * 9) * .12 * (1 - clamp(lt / 1.2) * .5);
    for (let j = 2; j > 0; j--) paint(g, body(c.V, POSE.spun, vx + j * fh * .1, gy, fh, { face: j === 2 ? 1 : -1, alpha: .2, rot: .12 * j }));
    const v = body(c.V, POSE.spun, vx + c.shake, gy, fh, { face: -1, rot: .1 + wob }); paint(g, v);
    const a = body(c.A, POSE.slap, w * .34, gy, fh); paint(g, a);
    const s = at(a, 'fs'), hd = at(v, 'head'), hr = at(v, 'hr');
    g.strokeStyle = '#fff'; g.lineWidth = h * .014;
    for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(s[0], s[1], fh * (.36 + j * .06), -1.4, .1); g.stroke(); }
    handprint(g, hd[0] - hr * .05, hd[1] + hr * .15, hr * 1.2, -.5);
    g.strokeStyle = INK; g.lineWidth = h * .008;
    for (let j = 0; j < 3; j++) { g.beginPath();
      g.ellipse(hd[0], hd[1], hr * (1.6 + j * .35), hr * (.5 + j * .12), -.2, PI * (.1 + j * .2), PI * (.9 + j * .2)); g.stroke(); }
    stars(g, hd[0], hd[1] - hr * 1.1, hr * 1.5, hr * .4, lt, 3, hr * .35);
    c.mouth = at(a, 'mouth'); c.word = [w * .52, h * .62, -.18];
  },
  cake(c) {
    const { g, w, h, k, fh, gy, lt, seed } = c, s = fh * .62;
    const a = body(c.A, bp('swing', lt, .9, .3), w * .28, gy, fh);
    const v = body(c.V, bp('hit'), w * .7 + c.shake, gy, fh * (1 - .08 * k), { face: -1, rot: .06 });
    paint(g, a); paint(g, v);
    const hd = at(v, 'head'), hn = at(a, 'hand'), kc = clamp(lt / .26), p = mix(hn, hd, kc);
    p[1] -= Math.sin(kc * PI) * fh * .25;
    if (kc >= 1) for (let j = 0; j < 14; j++) {
      const q = -PI + j * PI / 13 + hash(seed, j) * .2, d = fh * (.16 + .26 * hash(seed, j + 20)) * out3(clamp((lt - .26) / .3));
      g.beginPath(); g.ellipse(hd[0] + Math.cos(q) * d, hd[1] + Math.sin(q) * d * .8 + lt * fh * .03, fh * .035, fh * .025, q, 0, TAU);
      ink(g, j % 3 ? '#fff6ea' : '#ff8fc4', h * .005);
    }
    g.save(); g.translate(p[0], p[1]); g.rotate(lerp(-.4, PI + .2, kc)); g.scale(1 + .08 * kc, 1 - .14 * kc); cake(g, 0, s * .775, s); g.restore();
    if (kc >= 1) {  // frosting oozing down from the rim
      const y0 = hd[1] + s * .1, x0 = hd[0] - s * .26, x1 = hd[0] + s * .26, dk = clamp((lt - .26) * 2);
      g.beginPath(); g.moveTo(x0, y0 - s * .05);
      for (let j = 0; j < 6; j++) { const xa = lerp(x0, x1, j / 6), xb = lerp(x0, x1, (j + 1) / 6), L = s * (.04 + .16 * hash(seed, j + 9)) * dk;
        g.lineTo(xa, y0); g.lineTo(xa + s * .01, y0 + L); g.arc((xa + xb) / 2, y0 + L, (xb - xa) / 2 - s * .01, PI, 0, true); g.lineTo(xb, y0); }
      g.lineTo(x1, y0 - s * .05); g.closePath(); ink(g, '#fff6ea', h * .005);
    }
    c.mouth = at(a, 'mouth'); c.word = [w * .4, h * .62, -.16];
  },
  champagne(c) {
    const { g, w, h, k, fh, gy, lt, seed } = c;
    const v = body(c.V, bp('flail', lt), w * (.72 + .08 * k) + c.shake, gy - k * fh * .16, fh, { face: -1, rot: .5 * k, air: 1 });
    paint(g, v);
    const tg = at(v, 'chest'), hd = at(v, 'head'), a = body(c.A, bp('aim'), w * .2, gy, fh), hn = at(a, 'hand'),
      L = Math.max(fh * .3, tg[0] - hn[0]) * clamp(lt / .22);
    a.o.hand = q => {
      if (window.Brawl) Brawl.drawItem('champagne', fh, D, 0, q);
      const x0 = fh * .19, n = 12; if (L <= x0) return;
      q.beginPath();
      for (let i = 0; i <= n; i++) { const x = lerp(x0, L, i / n), wd = fh * (.02 + .12 * (i / n) ** 1.3) * (1 + .18 * Math.sin(lt * 30 + i * 2));
        q.lineTo(x, -wd); }
      for (let i = n; i >= 0; i--) { const x = lerp(x0, L, i / n), wd = fh * (.02 + .12 * (i / n) ** 1.3) * (1 + .18 * Math.cos(lt * 26 + i * 2.3));
        q.lineTo(x, wd); }
      q.closePath(); ink(q, '#fff6d2', h * .006);
      q.fillStyle = '#fff'; for (let i = 0; i < 9; i++) { q.beginPath();
        q.arc(lerp(x0, L, hash(seed, i)), fh * .06 * (hash(seed, i + 9) - .5), fh * .012, 0, TAU); q.fill(); }
    };
    paint(g, a);
    if (lt > .15) { const cp = [hd[0] + fh * .02, hd[1] - fh * .14 - lt * fh * .05]; burst(g, cp[0], cp[1], fh * .07, 8, seed, '#fff36b', h * .004);
      g.beginPath(); g.roundRect(cp[0] - fh * .025, cp[1] - fh * .03, fh * .05, fh * .06, fh * .01); ink(g, '#c8a165', h * .004); }
    for (let j = 0; j < 8; j++) { const q = hash(seed, j + 30) * TAU, d = fh * (.12 + .12 * hash(seed, j + 40)) * k;
      puff(g, tg[0] + Math.cos(q) * d, tg[1] + Math.sin(q) * d, fh * .05, '#fff6d2', j, h * .003); }
    c.mouth = at(a, 'mouth'); c.word = [w * .42, h * .3, -.2];
  },
  bouquet(c) {
    const { g, w, h, fh, gy, lt, seed } = c, kb = clamp(lt / .3), e = out3(clamp((lt - .28) / .5));
    const v = body(c.V, bp('hit'), w * .7 + c.shake, gy, fh, { face: -1, rot: .12 * e });
    const a = body(c.A, bp('throw'), w * .27, gy, fh);
    paint(g, a); paint(g, v);
    const hn = at(a, 'hand'), ch = at(v, 'chest'), mid = [(hn[0] + ch[0]) / 2, Math.min(hn[1], ch[1]) - fh * .3];
    g.setLineDash([h * .015, h * .02]); g.strokeStyle = '#fff'; g.lineWidth = h * .008;
    g.beginPath(); g.moveTo(...hn); g.quadraticCurveTo(...mid, ...ch); g.stroke(); g.setLineDash([]);
    if (kb < 1) { const q = mix(mix(hn, mid, kb), mix(mid, ch, kb), kb); bouquet(g, q[0], q[1], fh * .32, kb * 5); }
    else {
      burst(g, ch[0], ch[1], fh * (.14 + .14 * e), 12, seed, '#fff7a8', h * .008);
      const cols = ['#ff4f8b', '#ffffff', '#ffd1e3', '#ff7aa8', '#ffe066'];
      for (let j = 0; j < 30; j++) {
        const q = j * TAU / 30 + hash(seed, j), d = fh * (.1 + .38 * hash(seed, j + 40)) * e;
        petal(g, ch[0] + Math.cos(q) * d, ch[1] + Math.sin(q) * d + lt * fh * .06 * hash(seed, j + 7), fh * .03, q + lt * 3, cols[j % 5]);
      }
      bouquet(g, ch[0] + fh * .3 * e, ch[1] - fh * .35 * e, fh * .26, 1.5 + lt * 4);
    }
    c.mouth = at(a, 'mouth'); c.word = [w * .47, h * .66, -.1];
  },
  dance(c) {
    const { g, w, h, fh, gy, lt } = c, beat = Math.floor(lt / .3) % 2;
    const a = body(c.A, beat ? POSE.fever : bp('dance', lt + 1), w * .28, gy, fh);
    const v = body(c.V, bp('dazed', lt), w * .7, gy, fh, { face: -1, rot: Math.sin(lt * 4) * .08 });
    paint(g, v); paint(g, a);
    const ah = at(a, 'head'), hd = at(v, 'head'), hr = at(v, 'hr');
    for (let j = 0; j < 3; j++) { const q = (lt * .8 + j / 3) % 1;
      note(g, ah[0] + fh * (.15 + q * .25), ah[1] - q * fh * .3 + Math.sin(q * 9 + j) * fh * .03, fh * .07, ['#ff4fd8', '#4fd3ff', '#ffe14d'][j]); }
    spiral(g, hd[0], hd[1] - hr * 1.5, hr * 1.1, lt * 8, INK, h * .009);
    stars(g, hd[0], hd[1] - hr * .9, hr * 1.6, hr * .45, lt, 4, hr * .32);
    c.mouth = at(a, 'mouth'); c.word = [w * .5, h * .6, -.08]; c.bubX = .82;
  },
  hug(c) {
    const { g, w, h, k, fh, gy, lt, seed } = c, sq = 1 - .16 * k + Math.sin(lt * 30) * .015 * (1 - clamp(lt / .8));
    const v = body(c.V, POSE.squeezed, w * .5, gy - fh * .03 * k, fh, { face: -1, sx: sq, air: 1 });
    const a = body(c.A, POSE.hug, w * .38, gy, fh);
    paint(g, v); paint(g, a);
    const hd = at(a, 'head'), ch = at(v, 'chest'), vh = at(v, 'head');
    for (let j = 0; j < 3; j++) { const q = (lt * .6 + j / 3) % 1;
      heart(g, hd[0] - fh * .1 + j * fh * .1, hd[1] - fh * .12 - q * fh * .2, fh * .045 * (1 - q * .3), '#ff2d5b'); }
    g.strokeStyle = INK; g.lineWidth = h * .009;
    for (const s of [-1, 1]) for (let j = 0; j < 3; j++) { const x = ch[0] + s * fh * (.2 + j * .03), y = ch[1] + (j - 1) * fh * .08; g.beginPath();
      g.moveTo(x, y); g.lineTo(x + s * fh * .07, y); g.stroke(); }
    const ix = w * .82, iy = h * .6, ir = h * .2;  // x-ray inset of the ribs
    const ang = Math.atan2(ch[1] - iy, ch[0] - ix);
    g.beginPath(); g.moveTo(...ch); g.lineTo(ix + Math.cos(ang - .5) * ir, iy + Math.sin(ang - .5) * ir);
    g.lineTo(ix + Math.cos(ang + .5) * ir, iy + Math.sin(ang + .5) * ir); g.closePath(); ink(g, 'rgba(255, 255, 255, .85)', h * .006);
    g.save(); g.beginPath(); g.arc(ix, iy, ir, 0, TAU); ink(g, '#06204a'); g.clip();
    const sp = (lt * 25 % 2 < 1 ? 1 : -1) * h * .003 * (1 - clamp(lt));
    for (const pass of [0, 1]) {
      boneArt(g, [ix + sp, iy - ir * 1.1], [ix + sp, iy + ir * 1.1], ir * .14, pass);
      for (let i = 0; i < 5; i++) {
        const y = iy - ir * .75 + i * ir * .34;
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(ix + sp, y);
          g.quadraticCurveTo(ix + s * ir * .9, y - ir * .2, ix + s * ir * .75 * sq, y + ir * .25); g.strokeStyle = pass ? '#f6f1e2' : INK;
          g.lineWidth = pass ? ir * .07 : ir * .12; g.stroke(); }
      }
    }
    g.strokeStyle = '#ff2d3a'; g.lineWidth = ir * .04;
    for (let i = 0; i < 3; i++) { const x = ix + (i - 1) * ir * .5, y = iy - ir * .3 + i * ir * .3; g.beginPath();
      g.moveTo(x - ir * .12, y - ir * .12); g.lineTo(x, y); g.lineTo(x - ir * .05, y + ir * .1); g.lineTo(x + ir * .1, y + ir * .2); g.stroke(); }
    g.restore();
    g.beginPath(); g.arc(ix, iy, ir, 0, TAU); g.lineWidth = h * .022; g.strokeStyle = INK; g.stroke(); g.lineWidth = h * .01; g.strokeStyle = '#fff';
    g.stroke();
    c.mouth = at(a, 'mouth'); c.word = [ix, iy + ir * .95, .1]; c.wsize = .13; void vh; void seed;
  },
  stomp(c) {
    const { g, w, h, k, fh, gy, lt, seed } = c, F = h * .54, sy = lerp(1, .58, k), vx = w * .58;
    const v = body(c.V, POSE.squashed, vx + c.shake, gy, fh, { face: -1, sy, sx: lerp(1, 1.3, k) });
    const cr = at(v, 'crown'), top = cr[1] + fh * .03, a = body(c.A, POSE.stomp, cr[0] + fh * .1, top - (1 - k) * h * .5, F, { air: 1 });
    g.strokeStyle = INK; g.lineWidth = h * .008;
    for (let j = 0; j < 6; j++) { const s = j % 2 ? 1 : -1, x0 = vx + s * F * (.15 + .05 * j); g.beginPath(); g.moveTo(x0, gy - h * .01);
      g.lineTo(x0 + s * F * .1, gy - h * .03); g.lineTo(x0 + s * F * .17, gy - h * .005); g.lineTo(x0 + s * F * .3, gy - h * .025); g.stroke(); }
    burst(g, cr[0] + fh * .1, top, F * .3 * k, 12, seed, '#ffffff', h * .008);
    g.fillStyle = '#fff';
    for (let j = 0; j < 6; j++) { const x = cr[0] + fh * .1 + (j - 2.5) * F * .1, y0 = top - F * 1.05 - hash(seed, j) * h * .08;
      g.fillRect(x, y0 - h * .25, h * .008, h * .2); }
    paint(g, v); paint(g, a);
    for (const s of [-1, 1]) puff(g, vx + s * F * .38, gy - h * .04, F * .1 * k, '#fff4dc', seed + s, h * .004);
    const hd = at(v, 'head'), hr = at(v, 'hr');
    stars(g, hd[0], hd[1], hr * 1.9, hr * .5, lt, 4, hr * .35);
    c.mouth = at(a, 'mouth'); c.word = [w * .22, h * .6, -.2]; c.bubX = .86;
  },
  selfie(c) {
    const { g, w, h, k, fh, gy, lt, seed } = c;
    const a = body(c.A, POSE.selfie, w * .26, gy, fh, { hand: q => phone(q, fh * .17) });
    const v = body(c.V, POSE.shock, w * .7, gy, fh, { face: -1, rot: -.05 });
    paint(g, a); paint(g, v);
    const p = at(a, 'hand'), fl = clamp(1 - lt * 1.2) * .5 + .25;
    g.fillStyle = `rgba(255, 255, 235, ${fl})`; g.beginPath(); g.moveTo(...p); g.lineTo(w * 1.1, gy - fh * 1.1); g.lineTo(w * 1.1, gy - fh * .2);
    g.closePath(); g.fill();
    burst(g, p[0], p[1], fh * (.22 + .03 * Math.sin(lt * 20)), 14, seed, '#ffffff', h * .006, .35);
    burst(g, p[0], p[1], fh * .1, 10, seed + 1, '#fff36b', 0, .5);
    const E = eyes(v), hr = at(v, 'hr'), ks = back(clamp(lt / .35)), wob = Math.sin(lt * 22) * (1 - clamp(lt / 1.4)) * fh * .025;
    E.forEach((e, j) => {
      const end = [e[0] - fh * (.13 + .05 * j) * ks + wob, e[1] - fh * (.12 + .06 * (1 - j)) * ks - wob * .5], n = 9, dx = end[0] - e[0], dy = end[1] - e[1],
        L = Math.hypot(dx, dy) || 1, amp = hr * .2;
      g.beginPath(); g.moveTo(...e);
      for (let i = 1; i < n; i++) g.lineTo(e[0] + dx * i / n - dy / L * amp * (i % 2 ? 1 : -1), e[1] + dy * i / n + dx / L * amp * (i % 2 ? 1 : -1));
      g.lineTo(...end);
      g.strokeStyle = INK; g.lineWidth = hr * .16; g.stroke(); g.strokeStyle = '#c9d0d8'; g.lineWidth = hr * .07; g.stroke();
      g.beginPath(); g.arc(end[0], end[1], hr * .62, 0, TAU); ink(g, '#fff', hr * .12);
      g.strokeStyle = '#ff5a6a'; g.lineWidth = hr * .03; for (let i = 0; i < 3; i++) { const q = i * 2 + j; g.beginPath();
        g.moveTo(end[0] + Math.cos(q) * hr * .48, end[1] + Math.sin(q) * hr * .48);
        g.lineTo(end[0] + Math.cos(q + .3) * hr * .25, end[1] + Math.sin(q + .3) * hr * .25); g.stroke(); }
      g.fillStyle = INK; g.beginPath(); g.arc(end[0] - hr * .2, end[1] + hr * .08 * Math.sin(lt * 9 + j), hr * .26, 0, TAU); g.fill();
    });
    c.mouth = at(a, 'mouth'); c.word = [w * .52, h * .66, .1]; void k;
  },
  toast(c) {
    const { g, w, h, fh, gy, lt, seed } = c;
    const a = body(c.A, POSE.toast, w * .23, gy, fh, { hand: q => flute(q, fh * .2) });
    const v = body(c.V, POSE.asleep, w * .76, gy, fh, { face: -1, rot: Math.sin(lt * 1.5) * .04 + .04 });
    paint(g, a); paint(g, v);
    const bh = at(a, 'bhand'), pw = fh * .17, x1 = w * .64;  // the speech, on a scroll that reaches the floor and keeps going
    g.beginPath(); g.moveTo(bh[0] - pw / 2, bh[1]); g.lineTo(bh[0] + pw / 2, bh[1]); g.lineTo(bh[0] + pw / 2, gy - fh * .05);
    g.lineTo(x1, gy - fh * .03); g.lineTo(x1, gy + h); g.lineTo(bh[0] - pw / 2, gy + h); g.closePath(); ink(g, '#fbf3dc', h * .006);
    g.strokeStyle = 'rgba(20, 11, 8, .45)'; g.lineWidth = h * .005;
    for (let y = bh[1] + pw * .3; y < gy - fh * .08; y += pw * .22) { g.beginPath(); g.moveTo(bh[0] - pw * .35, y);
      g.lineTo(bh[0] + pw * (.1 + .25 * hash(seed, y)), y); g.stroke(); }
    for (let x = bh[0] + pw; x < x1 - pw * .3; x += pw * .5) { g.beginPath(); g.moveTo(x, gy - fh * .025); g.lineTo(x + pw * .3, gy - fh * .02);
      g.stroke(); }
    g.beginPath(); g.ellipse(bh[0], bh[1], pw * .6, pw * .16, 0, 0, TAU); ink(g, '#efe2bd', h * .006);
    g.beginPath(); g.ellipse(x1, gy - fh * .06, pw * .2, pw * .35, 0, 0, TAU); ink(g, '#efe2bd', h * .006);
    const hd = at(v, 'head'), hr = at(v, 'hr');
    zzz(g, hd[0] - hr, hd[1] - hr * 1.6, hr * 1.1, lt);
    for (const s of [-1, 1]) for (let j = 0; j < 3; j++) { const q = (lt * 1.3 + j / 3) % 1;
      puff(g, hd[0] + s * hr * (1.1 + q * .5), hd[1] - q * hr * 2.2, hr * (.3 + q * .4), `rgba(235, 235, 240, ${.9 * (1 - q)})`, j, 0); }
    c.mouth = at(a, 'mouth'); c.word = [w * .47, h * .52, -.08];
  },
  laser(c) {
    const { g, w, h, fh, gy, lt, seed } = c;
    const a = body(c.A, POSE.power, w * .22, gy, fh);
    const v = body(c.V, bp('hit'), w * .72 + c.shake, gy, fh, { face: -1, rot: .1 });
    paint(g, v); paint(g, a);
    const E = eyes(a), tg = at(v, 'chest'), kk = clamp(lt / .18);
    E.forEach((e, j) => {
      const t2 = [tg[0] + (j - .5) * fh * .06, tg[1] + (j - .5) * fh * .06 + Math.sin(lt * 40 + j) * h * .004], end = mix(e, t2, kk);
      for (const [col, lw] of [['rgba(255, 0, 40, .35)', h * .05], ['#ff1a3c', h * .022], ['#fff', h * .008]]) { g.strokeStyle = col;
        g.lineWidth = lw; g.beginPath(); g.moveTo(...e); g.lineTo(...end); g.stroke(); }
      g.fillStyle = '#ff1a3c'; g.beginPath(); g.arc(e[0], e[1], h * .018, 0, TAU); g.fill();
    });
    if (kk >= 1) {
      burst(g, tg[0], tg[1], fh * (.12 + .02 * Math.sin(lt * 30)), 10, seed, '#ffe14d', h * .006);
      for (let j = 0; j < 3; j++) { const q = (lt * .9 + j / 3) % 1;
        puff(g, tg[0] + fh * (.05 + q * .1), tg[1] - q * fh * .4, fh * (.05 + q * .07), `rgba(60, 60, 70, ${.8 * (1 - q)})`, j, 0); }
    }
    c.mouth = at(a, 'mouth'); c.word = [w * .48, h * .68, -.1];
  },
  rocket(c) {
    const { g, w, h, fh, gy, lt, seed } = c, kk = clamp(lt / .3);
    const a = body(c.A, bp('aim'), w * .18, gy, fh);
    const v = body(c.V, bp('hit'), w * (.74 + .04 * kk) + c.shake, gy, fh, { face: -1, rot: .35 * kk });
    paint(g, v); paint(g, a);
    const s0 = at(a, 'hand'), tg = at(v, 'head'), p = mix(s0, tg, kk), ang = Math.atan2(tg[1] - s0[1], tg[0] - s0[0]);
    for (let j = 0; j < 7; j++) { const q = j / 7 * kk, pp = mix(s0, tg, q);
      puff(g, pp[0], pp[1] + Math.sin(j * 2 + lt * 3) * fh * .02, fh * (.035 + .03 * q), '#e9edf2', seed + j, h * .003); }
    puff(g, s0[0], s0[1], fh * .07, '#ffffff', seed, h * .004);
    if (kk >= 1) burst(g, tg[0], tg[1], fh * .2, 12, seed, '#fff36b', h * .007);
    rocketFist(g, p[0], p[1], fh * .085, ang, lt);
    c.mouth = at(a, 'mouth'); c.word = [w * .5, h * .66, -.12];
  },
  doves(c) {
    const { g, w, h, fh, gy, lt, seed } = c;
    const a = body(c.A, bp('cheer', lt), w * .23, gy, fh);
    const v = body(c.V, bp('shield'), w * .7 + Math.sin(lt * 30) * h * .004, gy, fh, { face: -1 });
    paint(g, a);
    const hd = at(v, 'head'), hr = at(v, 'hr'), n = 7, birds = [];
    for (let j = 0; j < n; j++) { const q = j * TAU / n + lt * 2.4;
      birds.push([hd[0] + Math.cos(q) * fh * .25, hd[1] + fh * .06 + Math.sin(q) * fh * .12, Math.sin(q) < 0 ? 1 : -1,
        Math.sin(lt * 26 + j * 1.7), Math.sin(q)]); }
    for (const [x, y, f, fl, d] of birds) if (d < 0) dove(g, x, y, fh * .075, f, fl);
    paint(g, v);
    for (let j = 0; j < 8; j++) {
      feather(g, hd[0] + (hash(seed, j) - .5) * fh * .7, hd[1] + ((lt * .25 + hash(seed, j + 9)) % 1) * fh * .8, fh * .03, Math.sin(lt * 3 + j));
    }
    for (const [x, y, f, fl, d] of birds) if (d >= 0) dove(g, x, y, fh * .075, f, fl);
    for (const s of [-1, 1]) { const pk = Math.sin(lt * 22 + s) * hr * .15;
      dove(g, hd[0] + s * (hr * 1.35 + pk), hd[1] - hr * .7, fh * .07, -s, .3 * Math.sin(lt * 30)); }
    for (let j = 0; j < 2; j++) { const q = (lt * .7 + j * .5) % 1;
      dove(g, lerp(w * .3, hd[0], q), hd[1] - fh * .35 + Math.sin(q * PI) * -fh * .1, fh * .06, 1, Math.sin(lt * 26 + j)); }
    c.mouth = at(a, 'mouth'); c.word = [w * .46, h * .62, -.1];
  },
  chair(c) {
    const { g, w, h, k, fh, gy, lt, seed } = c;
    const a = body(c.A, bp('swing', lt, .9, .3), w * .3, gy, fh);
    const v = body(c.V, bp('crouch'), w * .66 + c.shake, gy, fh, { face: -1 });
    const hd = at(v, 'head'), hr = at(v, 'hr');
    burst(g, hd[0], hd[1] - hr * 1.2, fh * .24 * k, 12, seed, '#ffffff', h * .008);
    paint(g, v); paint(g, a);
    const cr = at(v, 'crown').map((q, i) => q - (i ? hr * .5 : 0)), hn = at(a, 'hand'),
      r = Math.atan2(cr[1] - hn[1], cr[0] - hn[0]) + D + .1 * Math.sin(lt * 25) * (1 - clamp(lt * 2)), cs = fh * .3;
    chairArt(g, cr[0] - Math.sin(r) * cs * .9, cr[1] + Math.cos(r) * cs * .9, cs, r);
    stars(g, hd[0], hd[1] - hr * .3, hr * 2, hr * .55, lt, 5, hr * .33);
    c.mouth = at(a, 'mouth'); c.word = [w * .78, h * .62, .14];
  },
  tie(c) {
    const { g, w, h, k, fh, gy, lt } = c, vx = w * .7, spin = lt * 22;
    for (let j = 2; j > 0; j--) { const sx = Math.cos(spin - j * .9);
      paint(g, body(c.V, bp('flail', lt), vx + j * fh * .03, gy - fh * .04, fh, { face: -1, sx: turn(sx), alpha: .18, air: 1 })); }
    const sx = Math.cos(spin),
      v = body(c.V, bp('flail', lt), vx, gy - fh * .04, fh, { face: -1, sx: turn(sx), rot: Math.sin(lt * 7) * .06, air: 1 });
    const a = body(c.A, POSE.lasso, w * .25, gy, fh); paint(g, a);
    const hn = at(a, 'hand'), bl = at(v, 'belly'), lc = [hn[0], hn[1] - fh * .06], rx = fh * .2, ry = fh * .055, q = lt * 14;
    const loop = []; for (let i = 0; i <= 24; i++) { const t2 = i / 24 * TAU + q; loop.push([lc[0] + Math.cos(t2) * rx, lc[1] + Math.sin(t2) * ry]); }
    tieLine(g, loop, fh * .03, lt);
    const st = [lc[0] + Math.cos(q) * rx, lc[1] + Math.sin(q) * ry], rope = [];
    for (let i = 0; i <= 12; i++) { const t2 = i / 12;
      rope.push([lerp(st[0], bl[0], t2), lerp(st[1], bl[1], t2) + Math.sin(t2 * PI) * fh * .12 * (1 - k * .6)]); }
    tieLine(g, rope, fh * .03, lt);
    paint(g, v);
    const wl = []; for (let i = 0; i <= 24; i++) { const t2 = i / 24 * TAU;
      wl.push([bl[0] + Math.cos(t2) * fh * .13, bl[1] + Math.sin(t2) * fh * .035]); }
    tieLine(g, wl.slice(0, 14), fh * .03, lt);
    g.strokeStyle = INK; g.lineWidth = h * .008;
    for (let j = 0; j < 3; j++) { const y = gy - fh * (.2 + j * .25); g.beginPath();
      g.ellipse(vx, y, fh * (.3 - j * .04), fh * .05, 0, .2 + j, PI - .2 + j); g.stroke(); }
    c.mouth = at(a, 'mouth'); c.word = [w * .47, h * .66, -.12];
  },
  ufo(c) {
    const { g, w, h, k, fh, gy, lt, seed } = c, ux = w * .76, uy = h * .36 + Math.sin(lt * 3) * h * .012, us = fh * .32;
    const gr = g.createLinearGradient(0, uy, 0, gy); gr.addColorStop(0, 'rgba(170, 255, 150, .75)'); gr.addColorStop(1, 'rgba(170, 255, 150, .12)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(ux - us * .3, uy + us * .1); g.lineTo(ux + us * .3, uy + us * .1); g.lineTo(ux + fh * .34, gy);
    g.lineTo(ux - fh * .34, gy); g.closePath(); g.fill();
    const v = body(c.V, bp('flail', lt), ux + Math.sin(lt * 2) * h * .01, gy - fh * (.02 + .1 * k), fh * .75,
      { face: -1, rot: Math.sin(lt * 2.3) * .4, air: 1 });
    paint(g, v);
    for (let j = 0; j < 8; j++) { const q = (lt * .7 + hash(seed, j)) % 1;
      twinkle(g, ux + (hash(seed, j + 9) - .5) * fh * .5 * (1 - q * .6), gy - q * (gy - uy), h * .016, '#eaffea'); }
    ufoShip(g, ux, uy, us, lt);
    const a = body(c.A, POSE.whistle, w * .23, gy, fh); paint(g, a);
    const m = at(a, 'mouth'); g.strokeStyle = '#fff'; g.lineWidth = h * .01;
    for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(m[0], m[1], fh * (.08 + j * .05), -.9, .2); g.stroke(); }
    note(g, m[0] + fh * .22, m[1] - fh * .12 - (lt * .2 % .1) * fh, fh * .07, '#ffe14d');
    c.mouth = m; c.word = [w * .42, h * .7, -.1]; c.bubX = .55;
  },
};

const END = {
  pancake(c) {
    const { g, w, h, k, fh, lt, seed } = c, fy = h * .62, vx = w * .58, floorY = h * .86, th = lerp(1.6, 1, k), len = 1.12;
    floorTiles(g, w, h, fy, '#1d1230', '#f2e9ff', lt, false);
    g.beginPath(); g.ellipse(vx, floorY + fh * .02, fh * .66, fh * .14, 0, 0, TAU); ink(g, '#e3a54c', h * .008);
    g.beginPath(); g.ellipse(vx, floorY, fh * .58, fh * .1, 0, 0, TAU); g.fillStyle = 'rgba(160, 84, 20, .3)'; g.fill();
    const v = body(c.V, POSE.star, vx - fh * .02 + c.shake, floorY + fh * len / 2, fh, { rot: -D, piv: len / 2, sx: th * .62, sy: len }); paint(g, v);
    const dk = clamp((lt - .3) * 2), bl = at(v, 'belly'), kn = at(v, 'fk'), y0 = floorY - fh * .05;
    g.beginPath(); g.moveTo(vx + fh * .05, y0);
    for (let j = 0; j < 5; j++) { const x = vx + fh * .1 + j * fh * .08, L = fh * (.04 + .07 * hash(seed, j)) * dk; g.lineTo(x, y0);
      g.arc(x + fh * .03, y0 + L, fh * .03, PI, 0, true); }
    g.lineTo(vx + fh * .55, y0 - fh * .01); g.quadraticCurveTo(vx + fh * .3, y0 - fh * .1, vx + fh * .05, y0);
    ink(g, 'rgba(120, 52, 8, .9)', h * .005);
    g.fillStyle = 'rgba(255, 255, 255, .5)'; g.beginPath(); g.ellipse(vx + fh * .32, y0 - fh * .04, fh * .06, fh * .01, -.1, 0, TAU); g.fill();
    g.save(); g.translate(bl[0], bl[1] - fh * .03); g.rotate(-.2); g.beginPath(); g.roundRect(-fh * .07, -fh * .045, fh * .14, fh * .08, fh * .015);
    ink(g, '#ffe680', h * .005); g.restore();
    paint(g, body(c.A, POSE.flex, kn[0] + fh * .05, kn[1] - fh * .02 - (1 - k) * h * .4, fh * .82));
    for (const sd of [-1, 1]) puff(g, vx + sd * fh * .72, floorY + fh * .03, fh * .08 * k, '#fff4dc', seed + sd, h * .004);
    c.word = [w * .2, h * .52, -.18];
  },
  moon(c) {
    const { g, w, h, fh, gy, lt, seed } = c, mx = w * .76, my = h * .3, mr = h * .19;
    glow(g, w, h, mx, my, mr * 2.4, 'rgba(255, 245, 190, .35)');
    g.beginPath(); g.arc(mx, my, mr, 0, TAU); ink(g, '#fff3b0', h * .008);
    g.fillStyle = 'rgba(200, 180, 110, .55)'; for (let j = 0; j < 5; j++) { g.beginPath();
      g.arc(mx + (hash(seed, j) - .5) * mr * 1.2, my + (hash(seed, j + 5) - .5) * mr * 1.2, mr * (.08 + .12 * hash(seed, j + 9)), 0, TAU); g.fill(); }
    const kk = out3(clamp(lt / .45)), tx = w * .54, ty = h * .2, p = [lerp(w * .3, tx, kk), lerp(gy - fh * .5, ty, kk) - Math.sin(kk * PI) * h * .15];
    g.setLineDash([h * .014, h * .018]); g.strokeStyle = 'rgba(255, 255, 255, .8)'; g.lineWidth = h * .007;
    g.beginPath(); g.moveTo(w * .3, gy - fh * .5); g.quadraticCurveTo(w * .42, h * .05, p[0], p[1]); g.stroke(); g.setLineDash([]);
    paint(g, body(c.V, bp('flail', lt), p[0], p[1] + fh * .14 * (1 - kk * .5) / 2, fh * lerp(.3, .15, kk), { face: -1, rot: lt * 5, air: 1 }));
    if (kk >= 1) { const tw = .6 + .4 * Math.abs(Math.sin(lt * 6)); twinkle(g, p[0] + h * .05, p[1] - h * .04, h * .07 * tw, '#ffffff');
      twinkle(g, p[0] + h * .05, p[1] - h * .04, h * .03 * tw, '#ffe14d'); }
    g.fillStyle = '#0a0620'; g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * .86); g.quadraticCurveTo(w * .3, h * .76, w * .55, h * .88);
    g.quadraticCurveTo(w * .8, h * .8, w, h * .9); g.lineTo(w, h); g.closePath(); g.fill();
    paint(g, body(c.A, POSE.lookout, w * .2, h * 1.06, fh * 1.05));
    c.word = [w * .52, h * .52, -.1];
  },
  confetti(c) {
    const { g, w, h, fh, lt, seed } = c, gy = h * .9, vx = w * .66, o = [vx, gy - fh * .45], tau = 1 - Math.exp(-lt * 3);
    g.fillStyle = 'rgba(20, 11, 8, .35)'; g.beginPath(); g.ellipse(vx, gy, fh * .45, fh * .06, 0, 0, TAU); g.fill();
    if (lt < .4) paint(g, body(c.V, bp('hit'), vx, gy, fh, { face: -1, alpha: 1 - lt / .4 }));
    puff(g, o[0], o[1], fh * .35 * clamp(lt * 3) * (1 - clamp((lt - .5) * 1.4)), 'rgba(255, 255, 255, .9)', seed, h * .004);
    for (let j = 0; j < 4; j++) { const q = (lt * .8 + j / 4) % 1;
      puff(g, vx + (j - 1.5) * fh * .07, gy - fh * .1 - q * fh * .3, fh * .05 * (1 + q), `rgba(120, 120, 130, ${.75 * (1 - q)})`, j, 0); }
    shoe(g, vx - fh * .12, gy - fh * .01, fh * .26, -1); shoe(g, vx + fh * .14, gy - fh * .01, fh * .26, -1);
    const cols = ['#ff2d6f', '#ffe14d', '#2dd4ff', '#7dff6a', '#b04dff', '#ff8a00', '#ffffff'];
    for (let j = 0; j < 110; j++) {
      const q = hash(seed, j) * TAU, sp = fh * (.12 + .7 * hash(seed, j + 70)) ** .8, x = o[0] + Math.cos(q) * sp * tau + Math.sin(lt * 3 + j) * fh * .02,
        y = o[1] + Math.sin(q) * sp * tau * .8 + lt * lt * fh * .12;
      g.save(); g.translate(x, y); g.rotate(lt * (3 + 6 * hash(seed, j + 9)) + j); g.scale(1, Math.cos(lt * 8 + j)); g.fillStyle = cols[j % 7];
      g.fillRect(-fh * .03, -fh * .015, fh * .06, fh * .03); g.restore();
    }
    paint(g, body(c.A, bp('cheer', lt), w * .24, c.gy, fh));
    c.word = [w * .68, h * .26, .12];
  },
  xray(c) {
    const { g, w, h, k, fh, gy, lt, seed } = c, F = fh * 1.25;
    const v = body(c.V, bp('hit'), w * .72 + c.shake, gy + F * .2, F, { face: -1, rot: .08 + .08 * k });
    const hd = at(v, 'head'), hr = at(v, 'hr'), pose = bp('aim'), a0 = body(c.A, pose, 0, 0, F * .9), f = at(a0, 'hand');
    paint(g, body(c.A, pose, hd[0] - f[0] - hr * (1.6 - .9 * k), hd[1] + hr * .5 - f[1], F * .9));
    paint(g, Object.assign({}, v, { o: Object.assign({}, v.o, { alpha: .3 }) }));
    skeleton(g, v, lt, true);
    burst(g, hd[0] - hr * 1.1, hd[1] + hr * .4, hr * 1.1, 9, seed, '#ffffff', h * .006);
    for (let j = 0; j < 5; j++) { const q = -.6 + j * .3, d = hr * (1.3 + 2.2 * k * hash(seed, j)) + lt * hr;
      tooth(g, hd[0] + Math.cos(q) * d, hd[1] + hr * .5 + Math.sin(q) * d, hr * .38, lt * 6 + j); }
    c.word = [w * .5, h * .7, -.12];
  },
  topper(c) {
    const { g, w, h, fh, gy, lt, seed } = c, cx = w * .64, s = h * .46, kk = clamp(lt / .35), top = gy + h * .02 - s * .91;
    cake(g, cx, gy + h * .02, s);
    const sh = fh * lerp(.8, .46, out3(kk));
    g.beginPath(); g.arc(cx, top - sh * .45, sh * .55, PI, 0); g.lineWidth = h * .012; g.strokeStyle = INK; g.stroke(); g.lineWidth = h * .006;
    g.strokeStyle = '#fff'; g.stroke();
    for (let j = 0; j < 7; j++) { const q = PI + j * PI / 6;
      flower(g, cx + Math.cos(q) * sh * .55, top - sh * .45 + Math.sin(q) * sh * .55, h * .022, j % 2 ? '#fff' : '#ff8fc4'); }
    paint(g, body(c.V, POSE.stiff, cx, top, sh, { face: -1 }));
    for (let j = 0; j < 4; j++) { const q = lt * 2 + j * TAU / 4;
      twinkle(g, cx + Math.cos(q) * sh * .7, top - sh * .5 + Math.sin(q) * sh * .5, h * .025 * (.6 + .4 * Math.sin(lt * 5 + j)), '#ffffff'); }
    paint(g, body(c.A, POSE.laugh, w * .2, gy, fh));
    c.word = [w * .3, h * .3, -.12]; void seed;
  },
  chandelier(c) {
    const { g, w, h, fh, lt } = c, cx = w * .58, cy = h * .2, s = h * .36, sw = Math.sin(lt * 2.6) * .1;
    g.strokeStyle = INK; g.lineWidth = h * .012; g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx, cy - s * .2); g.stroke();
    g.strokeStyle = '#d4a53a'; g.lineWidth = h * .006; g.stroke();
    const ring = (from, to) => { g.beginPath(); g.ellipse(cx, cy, s * .62, s * .14, 0, from, to); g.strokeStyle = INK; g.lineWidth = s * .09;
      g.stroke(); g.strokeStyle = '#e2b23e'; g.lineWidth = s * .05; g.stroke(); };
    const candle = q => { const x = cx + Math.cos(q) * s * .62, y = cy + Math.sin(q) * s * .14; g.beginPath();
      g.rect(x - s * .035, y - s * .2, s * .07, s * .2); ink(g, '#fffaf0', h * .004); drop(g, x, y - s * .26, s * .05, 0, '#ffb31a'); };
    ring(PI, TAU); for (let i = 0; i < 3; i++) candle(PI + (i + .5) * PI / 3);
    g.beginPath(); g.roundRect(cx - s * .06, cy - s * .25, s * .12, s * .4, s * .04); ink(g, '#e2b23e', h * .005);
    paint(g, body(c.V, POSE.dangle(lt), cx + Math.sin(sw) * s * .05, cy + s * .02, fh * .72, { face: -1, rot: PI + sw, piv: 0, air: 1 }));
    ring(0, PI); for (let i = 0; i < 4; i++) candle((i + .5) * PI / 4);
    for (let i = 0; i < 9; i++) {
      const q = i / 8 * PI, x = cx + Math.cos(q) * s * .62, y = cy + Math.sin(q) * s * .14, a = Math.sin(lt * 6 + i) * .25, L = s * (.18 + .1 * (i % 2));
      const e = [x + Math.sin(a) * L, y + Math.cos(a) * L]; g.strokeStyle = '#d9f2ff'; g.lineWidth = h * .003; g.beginPath(); g.moveTo(x, y);
      g.lineTo(...e); g.stroke();
      g.beginPath(); g.moveTo(e[0], e[1] - s * .04); g.lineTo(e[0] + s * .03, e[1]); g.lineTo(e[0], e[1] + s * .06); g.lineTo(e[0] - s * .03, e[1]);
      g.closePath(); ink(g, '#c8f0ff', h * .003);
    }
    paint(g, body(c.A, bp('cheer', lt), w * .18, h * 1.04, fh * .82));
    c.word = [w * .26, h * .3, -.14];
  },
  punchbowl(c) {
    const { g, w, h, k, fh, lt, seed } = c, bx = w * .6, by = h * .62, s = h * .3;
    g.fillStyle = '#fbfbff'; g.fillRect(0, h * .8, w, h * .2);
    g.beginPath(); g.moveTo(0, h * .8); for (let x = 0; x <= w; x += h * .06) g.quadraticCurveTo(x + h * .03, h * .85, x + h * .06, h * .8);
    g.lineTo(w, h); g.lineTo(0, h); g.closePath(); ink(g, '#ffffff', h * .005);
    g.beginPath(); g.ellipse(bx, by, s, s * .22, 0, 0, TAU); ink(g, 'rgba(210, 240, 255, .6)', h * .007);
    g.beginPath(); g.ellipse(bx, by + s * .05, s * .93, s * .18, 0, 0, TAU); g.fillStyle = '#d3123e'; g.fill();
    paint(g, body(c.V, POSE.kicking(lt), bx, h * .1 + (1 - k) * -h * .3, fh * .7, { face: -1, rot: PI, piv: 0, air: 1 }));
    g.beginPath(); g.moveTo(bx + s, by); g.ellipse(bx, by, s, s * .22, 0, 0, PI);
    g.bezierCurveTo(bx - s, by + s * .95, bx + s, by + s * .95, bx + s, by); g.closePath();
    ink(g, 'rgba(214, 20, 62, .93)', h * .008);
    g.fillStyle = 'rgba(255, 255, 255, .45)'; g.beginPath(); g.ellipse(bx - s * .55, by + s * .3, s * .08, s * .2, .5, 0, TAU); g.fill();
    for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(bx + (j - 1) * s * .45, by + s * .45, s * .09, 0, TAU); ink(g, '#ffb02e', h * .004); }
    g.beginPath(); g.moveTo(bx - s * .15, by + s * .7); g.lineTo(bx + s * .15, by + s * .7); g.lineTo(bx + s * .3, by + s * .9);
    g.lineTo(bx - s * .3, by + s * .9); g.closePath(); ink(g, 'rgba(210, 240, 255, .9)', h * .006);
    for (let j = 0; j < 12; j++) { const q = (lt * 1.6 + hash(seed, j)) % 1, sx = (hash(seed, j + 7) - .5) * 2;
      drop(g, bx + sx * s * (.3 + .9 * q), by - s * .1 - Math.sin(q * PI) * s * .7, h * .016, sx * q, '#ff3355'); }
    g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = h * .022; g.beginPath(); g.moveTo(bx + s * .5, by); g.lineTo(bx + s * 1.1, by - s * .55);
    g.stroke();
    g.strokeStyle = '#c9d0d8'; g.lineWidth = h * .01; g.stroke();
    paint(g, body(c.A, bp('drink', 0), w * .2, h * 1.02, fh * .9, { hand: q => flute(q, fh * .18) }));
    c.word = [w * .3, h * .3, -.14];
  },
  pretzel(c) {
    const { g, w, h, k, fh, gy, lt, seed } = c, px = w * .64, py = h * .58, r = h * .3;
    g.save(); g.translate(px, py); g.rotate(-.1 + Math.sin(lt * 3) * .03); g.lineCap = 'round';
    const knot = () => { g.beginPath(); g.moveTo(-r * .9, r * .5); g.bezierCurveTo(-r * 1.4, -r * .6, -r * .2, -r * 1.1, 0, -r * .1);
      g.bezierCurveTo(r * .2, -r * 1.1, r * 1.4, -r * .6, r * .9, r * .5); g.moveTo(-r * .7, r * .6); g.lineTo(r * .4, -r * .1);
      g.moveTo(r * .7, r * .6); g.lineTo(-r * .4, -r * .1); };
    knot(); g.strokeStyle = INK; g.lineWidth = r * .32; g.stroke(); g.strokeStyle = '#b5651d'; g.lineWidth = r * .24; g.stroke();
    g.strokeStyle = 'rgba(255, 220, 160, .45)'; g.lineWidth = r * .07; g.stroke();
    g.fillStyle = '#fff'; for (let j = 0; j < 14; j++) g.fillRect((hash(seed, j) - .5) * r * 1.8, (hash(seed, j + 14) - .7) * r * 1.2, r * .05, r * .035);
    g.restore();
    const v = body(c.V, POSE.pretzel, px + c.shake, gy - fh * .02, fh * 1.05, { face: -1, rot: .35 * k, air: 1 }), hd = at(v, 'head'), hr = at(v, 'hr');
    paint(g, v);
    spiral(g, hd[0], hd[1] - hr * 1.3, hr, lt * 8, INK, h * .008);
    paint(g, body(c.A, POSE.dust, w * .2, gy, fh));
    c.word = [w * .38, h * .3, -.12];
  },
  bones(c) {
    const { g, w, h, fh, gy, lt, seed } = c, cx = w * .64, kk = clamp(lt / .35), fall = out3(kk);
    glow(g, w, h, cx, gy - fh * .2, h * .6, 'rgba(130, 255, 120, .35)');
    if (kk < 1) paint(g, body(c.V, bp('hit'), cx, gy, fh, { face: -1, sy: 1 - .7 * kk, alpha: 1 - kk }));
    const pile = (n, s0) => { for (let j = 0; j < n; j++) {
      const u = hash(seed, j + s0) - .5, hgt = (1 - Math.abs(u) * 2) * fh * .3 * hash(seed, j + s0 + 50), x = cx + u * fh,
        y = gy - hgt * fall - fh * .02 - (1 - fall) * fh * .4 * hash(seed, j + 9);
      const a = hash(seed, j + s0 + 90) * PI, L = fh * (.1 + .08 * hash(seed, j + s0 + 30)), p = [x - Math.cos(a) * L, y - Math.sin(a) * L * .4],
        q = [x + Math.cos(a) * L, y + Math.sin(a) * L * .4];
      boneArt(g, p, q, fh * .036, 0); boneArt(g, p, q, fh * .036, 1);
    } };
    pile(20, 0);
    for (let j = 0; j < 7; j++) tooth(g, cx + (hash(seed, j + 200) - .5) * fh * .9, gy - fh * .03 - hash(seed, j + 210) * fh * .06, fh * .04, j);
    pile(6, 300);
    const wink = lt > .45 && (lt % 1.6) > .4;
    skull(g, cx + fh * .02, gy - fh * .4 * fall - fh * .04, fh * .14, -.15 + Math.sin(lt * 2) * .05, wink, false);
    if (wink) twinkle(g, cx + fh * .24, gy - fh * .55, fh * .07, '#ffffff');
    puff(g, cx - fh * .4, gy - fh * .05, fh * .1 * kk, 'rgba(230, 220, 255, .8)', seed, h * .003);
    paint(g, body(c.A, POSE.flex, w * .2, gy, fh));
    c.word = [w * .62, h * .26, .12];
  },
  framed(c) {
    const { g, w, h, k, fh, lt, seed } = c, cx = w * .63, cy = h * .45, fw = h * .52, fhh = h * .7, tilt = .06 + Math.sin(lt * 6) * .08 * (1 - clamp(lt));
    g.strokeStyle = INK; g.lineWidth = h * .006; g.beginPath(); g.moveTo(cx - fw * .3, cy - fhh * .5); g.lineTo(cx, cy - fhh * .72);
    g.lineTo(cx + fw * .3, cy - fhh * .5); g.stroke();
    g.beginPath(); g.arc(cx, cy - fhh * .72, h * .012, 0, TAU); ink(g, '#c9d0d8', h * .004);
    g.save(); g.translate(cx, cy); g.rotate(tilt);
    g.fillStyle = 'rgba(0, 0, 0, .35)'; g.fillRect(-fw / 2 + h * .02, -fhh / 2 + h * .025, fw, fhh);
    const gr = g.createLinearGradient(-fw / 2, -fhh / 2, fw / 2, fhh / 2); gr.addColorStop(0, '#ffe08a'); gr.addColorStop(.5, '#c8902a');
    gr.addColorStop(1, '#ffe08a');
    g.beginPath(); g.rect(-fw / 2, -fhh / 2, fw, fhh); ink(g, gr, h * .008);
    const iw = fw * .76, ih = fhh * .8;
    const bgr = g.createRadialGradient(0, -ih * .1, 0, 0, 0, ih * .7); bgr.addColorStop(0, '#f6e7c4'); bgr.addColorStop(1, '#a7865a');
    g.beginPath(); g.rect(-iw / 2, -ih / 2, iw, ih); ink(g, bgr, h * .006);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.arc(sx * fw * .44, sy * fhh * .45, h * .025, 0, TAU);
      ink(g, '#ffe08a', h * .004); }
    g.save(); g.beginPath(); g.rect(-iw / 2, -ih / 2, iw, ih); g.clip();
    paint(g, body(c.V, POSE.star, 0, ih * .5, ih * .95, { face: -1, sx: lerp(1, 1.35, k), sy: lerp(1.1, .95, k) }));
    g.strokeStyle = 'rgba(255, 255, 255, .85)'; g.lineWidth = h * .005; const o = [iw * .12, -ih * .15];
    for (let j = 0; j < 7; j++) { const q = j * TAU / 7 + hash(seed, j), L = ih * (.25 + .3 * hash(seed, j + 7)); g.beginPath(); g.moveTo(...o);
      g.lineTo(o[0] + Math.cos(q) * L * .5 + h * .01, o[1] + Math.sin(q) * L * .5); g.lineTo(o[0] + Math.cos(q) * L, o[1] + Math.sin(q) * L);
      g.stroke(); }
    g.fillStyle = 'rgba(255, 255, 255, .18)'; g.beginPath(); g.moveTo(-iw / 2, -ih / 2); g.lineTo(-iw * .1, -ih / 2); g.lineTo(-iw / 2, ih * .1);
    g.closePath(); g.fill();
    g.restore();
    const name = (c.V.name || 'GUEST').toUpperCase(), pw = fw * .7, fs = h * .032;
    g.beginPath(); g.rect(-pw / 2, fhh / 2 - h * .005, pw, h * .055); ink(g, '#d9b25a', h * .005);
    g.font = `${fs}px ${BUNGEE}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#3a2408';
    const tw = g.measureText(name).width; g.save(); g.translate(0, fhh / 2 + h * .023); if (tw > pw * .9) g.scale(pw * .9 / tw, 1);
    g.fillText(name, 0, 0); g.restore();
    g.restore();
    paint(g, body(c.A, bp('smile'), w * .2, h * 1.02, fh * .95));
    c.word = [w * .3, h * .28, -.14];
  },
};

// ---- lettering
const wraps = new Map();
function wrap(g, text, maxW) {
  const key = g.font + '|' + Math.round(maxW) + '|' + text, hit = wraps.get(key);
  if (hit) return hit;
  const lines = []; let cur = '';
  for (const wd of String(text).split(/\s+/).filter(Boolean)) { const t = cur ? cur + ' ' + wd : wd;
    if (cur && g.measureText(t).width > maxW) { lines.push(cur); cur = wd; } else cur = t; }
  if (cur) lines.push(cur);
  if (document.fonts && document.fonts.status === 'loaded') { if (wraps.size > 500) wraps.clear(); wraps.set(key, lines); }
  return lines;
}
function boom(g, text, x, y, size, ang, k, maxW, white, w = 1e9, h = 1e9) {  // the sound word, kept inside the panel
  if (!text || k <= 0) return;
  g.font = `${size}px ${BUNGEE}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const tw = g.measureText(text).width, f = Math.min(1, maxW / tw), hw = tw * f / 2 + size * .2, hh = size * f * .6 + hw * Math.abs(Math.sin(ang));
  x = clamp(x, Math.min(hw, w / 2), Math.max(w - hw, w / 2)); y = clamp(y, Math.min(hh, h / 2), Math.max(h - hh, h / 2));
  g.save(); g.translate(x, y); g.rotate(ang); const s = back(clamp(k)); g.scale(s * f, s * f);
  g.lineWidth = size * .3; g.strokeStyle = INK; g.fillStyle = INK; g.strokeText(text, size * .07, size * .09);
  g.fillText(text, size * .07, size * .09);
  g.lineWidth = size * .2; g.strokeText(text, 0, 0);
  const gr = g.createLinearGradient(0, -size * .45, 0, size * .45);
  if (white) { gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#bfe9ff'); } else { gr.addColorStop(0, '#fffbe0'); gr.addColorStop(.45, '#ffe14d');
    gr.addColorStop(1, '#ff8a00'); }
  g.fillStyle = gr; g.fillText(text, 0, 0);
  g.restore();
}
function caption(c, text, k) {
  const { g, w, h } = c; if (!text || k <= 0) return;
  let fs = h * .032, lines;
  for (;;) { g.font = `${fs}px ${PIXEL}`; lines = wrap(g, text, w * .44 - fs * 1.2); if (lines.length <= 3 || fs < h * .024) break; fs *= .88; }
  const pad = fs * .6, lh = fs * 1.5, bw = Math.max(...lines.map(l => g.measureText(l).width)) + pad * 2, bh = lines.length * lh - (lh - fs) + pad * 2;
  const x = lerp(-bw, h * .025, out3(k)), y = h * .025;
  g.fillStyle = INK; g.fillRect(x + h * .01, y + h * .01, bw, bh);
  g.fillStyle = '#ffe14d'; g.fillRect(x, y, bw, bh); g.lineWidth = h * .008; g.strokeStyle = INK; g.strokeRect(x, y, bw, bh);
  g.fillStyle = INK; g.textAlign = 'left'; g.textBaseline = 'top';
  lines.forEach((l, i) => g.fillText(l, x + pad, y + pad + i * lh));
  c.capW = x + bw;
}
function bubble(g, text, cx, top, maxW, fs, mouth, k, minX, maxX) {  // a speech bubble whose tail points at the speaker's mouth
  if (!text || k <= 0) return;
  g.font = `${fs}px ${BUNGEE}`; text = String(text).toUpperCase();
  let lines = wrap(g, text, maxW);
  while (lines.length > 3 && fs > maxW * .06) { fs *= .9; g.font = `${fs}px ${BUNGEE}`; lines = wrap(g, text, maxW); }
  const lh = fs * 1.1, tw = Math.max(...lines.map(l => g.measureText(l).width)), th = lines.length * lh;
  const rx = tw / 2 * 1.2 + fs * .7, ry = th / 2 * 1.25 + fs * .55, x = clamp(cx, minX + rx, maxX - rx), y = top + ry;
  g.save(); g.translate(x, y); g.scale(back(clamp(k)), back(clamp(k)));
  g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU);
  if (mouth) {
    const mx = mouth[0] - x, my = mouth[1] - y, d = Math.hypot(mx, my), a = Math.atan2(my, mx), reach = Math.max(ry * 1.2, d - fs * 1.4);
    const b1 = a - .32, b2 = a + .32, tip = [Math.cos(a) * reach, Math.sin(a) * reach];
    g.moveTo(Math.cos(b1) * rx * .8, Math.sin(b1) * ry * .8); g.quadraticCurveTo(tip[0] * .6, tip[1] * .6 - fs * .4, ...tip);
    g.lineTo(Math.cos(b2) * rx * .8, Math.sin(b2) * ry * .8); g.closePath();
  }
  outline(g, '#ffffff', fs * .12);
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, 0, (i - (lines.length - 1) / 2) * lh + fs * .05));
  g.restore();
}

// ---- panels and the strip
function content(g, w, h, sc, spec, lt, idx) {
  const kind = spec.act, fn = ACT[kind] || END[kind];
  const c = { g, w, h, lt, A: sc.a || {}, V: sc.v || {}, seed: idx * 37 + ALL.indexOf(kind) * 5 + 1, k: out3(clamp(lt / .3)), fh: h * .7, gy: h * .995,
    shake: Math.sin(lt * 70) * h * .007 * (1 - clamp(lt / .5)), word: [w * .6, h * .5, -.12], mouth: null, capW: 0, wsize: .15, bubX: .74 };
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  backdrop(c, BG[kind]);
  g.save(); fn(c); g.restore();
  g.lineJoin = 'round'; g.lineCap = 'round';
  boom(g, spec.word, c.word[0], c.word[1], h * c.wsize, c.word[2], clamp((lt - .08) / .22), w * .5, BG[kind][5], w, h);
  caption(c, spec.cap, clamp(lt / .18));
  if (spec.say) bubble(g, spec.say, w * c.bubX, h * .025, w * .33, h * .048, c.mouth, clamp((lt - .22) / .2), Math.max(c.capW + h * .02, w * .3), w - h * .02);
  g.restore();
}
const known = (spec, list, dflt) => { const act = spec && list.includes(spec.act) ? spec.act : dflt;
  return { ...(spec || {}), act, word: spec && spec.word || WORDS[act] }; };
const cache = new WeakMap();
const NONE = {};
function norm(fin) {
  if (!fin || typeof fin !== 'object') fin = NONE;
  if (cache.has(fin)) return cache.get(fin);
  const f = fin, P = Array.isArray(f.panels) ? f.panels : [];
  const out = { name: f.name || 'KNOCKOUT', quip: f.quip || 'NEXT!', panels: [0, 1, 2].map(i => known(P[i], ACTS, 'uppercut')),
    end: known(f.end, ENDS, 'pancake') };
  cache.set(fin, out);
  return out;
}
const names = (sc, s) => s && String(s).replace(/\{A\}/g, (sc.a && sc.a.name) || 'THE WINNER').replace(/\{V\}/g, (sc.v && sc.v.name) || 'THE LOSER');
const fill = (sc, spec) => ({ ...spec, cap: names(sc, spec.cap), say: names(sc, spec.say), word: names(sc, spec.word) });
const TILT = [-.022, .018, .02, -.016];

function panel(g, w, h, sc, spec, lt = 1) {  // one panel at the origin, clipped and bordered
  sc = sc || {}; spec = known(spec, ALL, 'uppercut');
  g.save(); g.beginPath(); g.rect(0, 0, w, h); g.clip();
  content(g, w, h, sc, fill(sc, spec), lt, 0);
  g.restore(); g.lineWidth = h * .02; g.strokeStyle = INK; g.strokeRect(0, 0, w, h);
}
const ids = new WeakMap(); let nid = 0;
const id = o => { if (!o || typeof o !== 'object') return 0; if (!ids.has(o)) ids.set(o, ++nid); return ids.get(o); };
const ready = P => !P || !P.img || P.rig || (P.img.complete && P.img.naturalWidth > 0);
const shots = new WeakMap();
function settled(g, sc, fin, spec, i, pw, ph) {  // a finished panel never changes again: paint it once, then blit it
  if (!document.fonts || !document.fonts.check(`12px ${BUNGEE}`) || !document.fonts.check(`12px ${PIXEL}`) || !ready(sc.a) || !ready(sc.v)) return null;
  const m = g.getTransform(), s = Math.hypot(m.a, m.b) || 1, a = sc.a || {}, v = sc.v || {};
  const key = [i, Math.round(pw * s), Math.round(ph * s), id(a.rig || a.img), id(v.rig || v.img), a.name, v.name].join('|');
  let box = shots.get(fin); if (!box) shots.set(fin, box = new Map());
  let cv = box.get(key);
  if (!cv) {
    cv = Object.assign(document.createElement('canvas'), { width: Math.ceil(pw * s), height: Math.ceil(ph * s) });
    const q = cv.getContext('2d'); q.scale(cv.width / pw, cv.height / ph); content(q, pw, ph, sc, spec, PANEL, i);
    if (box.size > 16) box.clear(); box.set(key, cv);
  }
  return cv;
}
function slot(g, sc, fin, spec, i, cx, cy, pw, ph, lt, u) {
  lt = Math.min(lt, PANEL);
  const k = clamp(lt / .18), e = out3(k), s = 1 + .25 * (1 - e), fr = u * 1.4;
  g.save(); g.translate(cx, cy); g.rotate(TILT[i] + (1 - e) * (i % 2 ? .08 : -.08)); g.scale(s, s);
  g.fillStyle = 'rgba(0, 0, 0, .5)'; g.fillRect(-pw / 2 - fr + u * .9, -ph / 2 - fr + u * 1.1, pw + fr * 2, ph + fr * 2);
  g.fillStyle = '#fff'; g.fillRect(-pw / 2 - fr, -ph / 2 - fr, pw + fr * 2, ph + fr * 2);
  const shot = lt >= PANEL ? settled(g, sc, fin, spec, i, pw, ph) : null;
  if (shot) g.drawImage(shot, -pw / 2, -ph / 2, pw, ph);
  else { g.save(); g.beginPath(); g.rect(-pw / 2, -ph / 2, pw, ph); g.clip(); g.translate(-pw / 2, -ph / 2); content(g, pw, ph, sc, spec, lt, i);
    g.restore(); }
  g.lineWidth = u * .9; g.strokeStyle = INK; g.strokeRect(-pw / 2, -ph / 2, pw, ph);
  if (k < 1) { g.fillStyle = `rgba(255, 255, 255, ${(1 - k) ** 1.4})`; g.fillRect(-pw / 2 - fr, -ph / 2 - fr, pw + fr * 2, ph + fr * 2); }
  g.restore();
}
function koCard(g, W, H, sc, fin, kt, u) {
  g.fillStyle = `rgba(8, 3, 16, ${.6 * clamp(kt / .15)})`; g.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H * .3;
  g.save(); g.globalAlpha *= .3 * clamp(kt / .25); g.fillStyle = '#ffcf3a'; g.beginPath();
  for (let i = 0; i < 20; i++) { const a = kt * .4 + i * TAU / 20; g.moveTo(cx, cy); g.arc(cx, cy, W, a, a + TAU / 40); g.closePath(); }
  g.fill(); g.restore();
  const cols = ['#ff2d6f', '#ffe14d', '#2dd4ff', '#7dff6a', '#b04dff', '#ffffff'];
  g.save(); g.globalAlpha *= clamp((kt - .15) / .3);
  for (let j = 0; j < 60; j++) {
    const x = hash(j, 3) * W + Math.sin(kt * 2 + j) * u * 2, y = (hash(j, 4) * H * 1.2 + kt * H * (.25 + .25 * hash(j, 5))) % (H * 1.2) - H * .1;
    g.save(); g.translate(x, y); g.rotate(kt * 4 + j); g.scale(1, Math.cos(kt * 7 + j)); g.fillStyle = cols[j % 6];
    g.fillRect(-u * .7, -u * .35, u * 1.4, u * .7); g.restore();
  }
  g.restore();
  // the winner pops up from the bottom with the last word
  const wk = out3(clamp((kt - .45) / .3)), A = sc.a || {};
  if (wk > 0) {
    const wb = body(A, bp('cheer', kt), W * .15, H * 1.02 + (1 - wk) * H * .6, H * .58);
    paint(g, wb);
    const m = A.rig || A.img ? at(wb, 'mouth') : [W * .15, H * .6];
    bubble(g, names(sc, fin.quip), W * .45, H * .64, W * .4, H * .052, m, clamp((kt - .6) / .2), W * .24, W * .8);
  }
  // K.O.
  const k = clamp(kt / .2), s = k < 1 ? lerp(3, 1, k * k) : 1, shake = (kt > .2 ? Math.exp(-(kt - .2) * 7) * u * 1.8 : 0) + u * .22;
  g.save(); g.translate(cx + Math.sin(kt * 61) * shake, cy + Math.cos(kt * 53) * shake); g.rotate(-.06); g.scale(s, s);
  g.globalAlpha *= clamp(kt / .06);
  const fs = Math.min(H * .3, W * .26); g.font = `${fs}px ${BUNGEE}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = fs * .3; g.strokeStyle = INK; g.fillStyle = INK; g.strokeText('K.O.', fs * .05, fs * .06); g.fillText('K.O.', fs * .05, fs * .06);
  g.lineWidth = fs * .24; g.strokeStyle = '#fff'; g.strokeText('K.O.', 0, 0);
  g.lineWidth = fs * .12; g.strokeStyle = INK; g.strokeText('K.O.', 0, 0);
  const gr = g.createLinearGradient(0, -fs * .4, 0, fs * .4); gr.addColorStop(0, '#ff1f3d'); gr.addColorStop(.55, '#ff7a1a');
  gr.addColorStop(1, '#ffd84a');
  g.fillStyle = gr; g.fillText('K.O.', 0, 0);
  g.restore();
  // the finisher's name on a ribbon
  const bk = out3(clamp((kt - .25) / .25));
  if (bk > 0) {
    const name = String(fin.name).toUpperCase(); let bf = H * .06; g.font = `${bf}px ${BUNGEE}`;
    let tw = g.measureText(name).width; if (tw > W * .62) { bf *= W * .62 / tw; g.font = `${bf}px ${BUNGEE}`; tw = W * .62; }
    const bw = tw + bf * 1.6, bh = bf * 1.7, by = H * .52;
    g.save(); g.translate(cx, by); g.rotate(-.02); g.scale(bk, 1);
    for (const sd of [-1, 1]) {
      const x0 = sd * (bw / 2 - bf * .4), x1 = sd * (bw / 2 + bf * 1.1);
      g.beginPath(); g.moveTo(x0, -bh * .25); g.lineTo(x1, -bh * .25); g.lineTo(x1 - sd * bf * .55, bh * .25); g.lineTo(x1, bh * .75);
      g.lineTo(x0, bh * .75); g.closePath(); ink(g, '#8e0f25', bf * .1);
    }
    g.beginPath(); g.rect(-bw / 2, -bh / 2, bw, bh); ink(g, '#e3173d', bf * .12);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = bf * .22; g.strokeStyle = INK;
    g.strokeText(name, 0, bf * .05);
    g.fillStyle = '#ffe14d'; g.fillText(name, 0, bf * .05);
    g.restore();
  }
}
function draw(g, W, H, sc, t) {
  sc = sc || {}; const fin = norm(sc.fin), u = H / 100, T4 = 4 * PANEL, end = T4 + KO;
  if (!(t >= 0) || t > end) return;
  g.save(); g.globalAlpha = clamp((end - t) / .35);
  g.fillStyle = `rgba(10, 4, 20, ${.7 * clamp(t / .25)})`; g.fillRect(0, 0, W, H);
  const gut = 2.6 * u, ph = Math.min((H - 8 * u - gut) / 2, (W - 4 * u - gut) / 2 / 1.25), pw = Math.min(ph * 1.62, (W - 5 * u - gut) / 2);
  let sx = 0, sy = 0;
  for (let i = 0; i < 5; i++) { const lt = t - i * PANEL, a = lt >= 0 && lt < .3 ? (1 - lt / .3) * u * (i === 4 ? 1.6 : .9) : 0;
    sx += Math.sin(lt * 97 + i) * a; sy += Math.cos(lt * 83 + i) * a; }
  const specs = fin.panels.concat([fin.end]);
  for (let i = 0; i < 4; i++) {
    const lt = t - i * PANEL; if (lt < 0) break;
    const cx = W / 2 + sx + (i % 2 ? 1 : -1) * (pw + gut) / 2, cy = H / 2 + sy + (i < 2 ? -1 : 1) * (ph + gut) / 2;
    slot(g, sc, fin, fill(sc, specs[i]), i, cx, cy, pw, ph, lt, u);
  }
  if (t >= T4) koCard(g, W, H, sc, fin, t - T4, u);
  g.restore();
}
const length = () => 4 * PANEL + KO;
function cues(fin) {
  const f = norm(fin), out = [];
  f.panels.concat([f.end]).forEach((p, i) => { for (const [s, n] of SFX[p.act] || []) out.push([+(i * PANEL + s).toFixed(3), n]); });
  out.push([4 * PANEL, 'boom'], [+(4 * PANEL + .35).toFixed(3), 'cheer']);
  return out.sort((a, b) => a[0] - b[0]);
}

window.Comic = { ACTS, ENDS, length, cues, draw, panel };
})();
