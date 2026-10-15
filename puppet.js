// Paper puppets: cuts a guest's portrait into head, torso, upper arms, forearms, thighs and shins at the joints found by
// make_rigs.py, and draws it posed. A limb the photo doesn't show (hidden behind someone, or below the frame) is drawn
// as a chrome cyborg part on the same joints, so everybody has a full set of arms and legs that move.
// Puppet.rig(img, keypoints, {skirt}) -> rig; Puppet.solve(rig, pose) -> joint angles; Puppet.sink(rig, angles) -> how far
// bent legs lower the body; Puppet.draw(ctx, rig, angles, height, {sink, hand}).
// opts.hand() draws a held item in the front hand: origin at the grip, +x along the forearm, units = screen pixels.
(() => {
'use strict';
const TAU = Math.PI * 2, wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
// bone: [from joint, to joint]; f = the figure's front side (toward +x, the way it faces), b = back side
const BONES = {
  torso: ['hip', 'neck'], head: ['neck', 'crown'],
  fUA: ['fs', 'fe'], fFA: ['fe', 'fw'], bUA: ['bs', 'be'], bFA: ['be', 'bw'],
  fTh: ['fh', 'fk'], fSh: ['fk', 'fa'], bTh: ['bh', 'bk'], bSh: ['bk', 'ba'],
};
const LIMBS = ['fUA', 'fFA', 'bUA', 'bFA', 'fTh', 'fSh', 'bTh', 'bSh'];
const WIDTH = { fUA: .26, bUA: .26, fFA: .21, bFA: .21, fTh: .34, bTh: .34, fSh: .27, bSh: .27 };  // cyborg limb thickness, in shoulder widths
const BIAS = { torso: .3, head: .12, fTh: .04, bTh: .04, skirt: .35 };
const REACH = { fUA: .34, bUA: .34, fFA: .28, bFA: .28 };  // an arm piece is never wider than an arm, so it can't take a strip of dress  // central pixels lean toward the torso
const ORDER = ['bTh', 'bSh', 'bUA', 'bFA', 'torso', 'head', 'fTh', 'fSh', 'fUA', 'fFA'];  // painter's order: far limbs first

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  const ex = ax + dx * t - px, ey = ay + dy * t - py;
  return Math.sqrt(ex * ex + ey * ey);
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
const len = a => Math.hypot(a[0], a[1]), unit = a => mul(a, 1 / (len(a) || 1)), dir = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);

// the full skeleton in portrait pixels: joints the pose model saw, the rest filled in as a relaxed standing pose
function skeleton(kp, w, h, alpha) {
  const seen = i => kp && kp[i] && kp[i][2] > (i < 7 ? .35 : .12) ? [kp[i][0] * w, kp[i][1] * h] : null;  // the model's guesses for hidden limbs beat a generic pose
  let top = 0;
  for (; top < h - 1; top++) { let any = false; for (let x = 0; x < w; x += 2) if (alpha[(top * w + x) * 4 + 3] > 128) { any = true; break; } if (any) break; }
  let ls = seen(5), rs = seen(6);
  if (!ls || !rs) {  // no shoulders found: assume a head-and-shoulders crop
    const sw = w * .5, y = Math.min(h * .85, top + sw * 1.05);
    ls = [w * .5 + sw / 2, y]; rs = [w * .5 - sw / 2, y]; kp = null;
  }
  const lFront = ls[0] >= rs[0], side = (l, r) => lFront ? [l, r] : [r, l];  // front = the side toward +x
  const [fs, bs] = side(ls, rs), sw = Math.max(len(sub(fs, bs)), w * .25);
  const across = unit(sub(fs, bs)), down0 = [-across[1], across[0]], down = down0[1] > 0 ? down0 : mul(down0, -1);
  const g = (l, r, guessF, guessB) => { const [f, b] = side(seen(l), seen(r)); return [f || guessF, b || guessB]; };
  const mid = mul(add(fs, bs), .5), hipC = add(mid, mul(down, 1.55 * sw));
  const [fh, bh] = g(11, 12, add(hipC, mul(across, .4 * sw)), add(hipC, mul(across, -.4 * sw)));
  const [fk, bk] = g(13, 14, add(fh, mul(down, 1.2 * sw)), add(bh, mul(down, 1.2 * sw)));
  const [fa, ba] = g(15, 16, add(fk, mul(down, 1.2 * sw)), add(bk, mul(down, 1.2 * sw)));
  const J0 = {};
  const [fe, be] = g(7, 8, add(fs, add(mul(down, .9 * sw), mul(across, .12 * sw))), add(bs, add(mul(down, .9 * sw), mul(across, -.12 * sw))));
  const [fw, bw] = g(9, 10, add(fe, mul(unit(sub(fe, fs)), .8 * sw)), add(be, mul(unit(sub(be, bs)), .8 * sw)));
  const runs = y => {  // opaque stretches of row y: [from, to]
    const out = [], yy = Math.round(y); if (yy < 0 || yy >= h) return out;
    for (let x = 0, s = -1; x <= w; x++) { const on = x < w && alpha[(yy * w + x) * 4 + 3] > 128; if (on && s < 0) s = x; if (!on && s >= 0) { out.push([s, x - 1]); s = -1; } }
    return out;
  };
  const snap = (f, b, fi, bi) => {  // only joints the model didn't report
    if (seen(fi) && seen(bi)) return [f, b];
    const y = (f[1] + b[1]) / 2, c = (f[0] + b[0]) / 2, r = runs(y).filter(([a, z]) => z - a > 2).sort((p, q) => Math.abs((p[0] + p[1]) / 2 - c) - Math.abs((q[0] + q[1]) / 2 - c));
    if (!r.length || Math.abs((r[0][0] + r[0][1]) / 2 - c) > sw) return [f, b];
    if (r.length > 1 && Math.abs((r[1][0] + r[1][1]) / 2 - c) < sw) { const two = [r[0], r[1]].map(([a, z]) => (a + z) / 2).sort((p, q) => q - p); return [[two[0], y], [two[1], y]]; }
    const [a, z] = r[0], m = (a + z) / 2, q = Math.min((z - a) / 4, sw * .3); return [[m + q, y], [m - q, y]];
  };
  [J0.fh, J0.bh] = snap(fh, bh, 11, 12); [J0.fk, J0.bk] = snap(fk, bk, 13, 14); [J0.fa, J0.ba] = snap(fa, ba, 15, 16);
  const neck = add(mid, mul(down, -.12 * sw));
  const crown = [mid[0], Math.min(top, neck[1] - .9 * sw)];
  const nose = seen(0), eyes = [seen(1), seen(2)].filter(Boolean), eyeMid = eyes.length ? mul(eyes.reduce(add, [0, 0]), 1 / eyes.length) : null;
  let faceDown = nose && eyeMid && nose[1] > eyeMid[1] ? sub(nose, eyeMid) : [0, (neck[1] - crown[1]) * .18];  // eyes -> nose: "down" for this face
  const tilt = eyes.length === 2 ? Math.max(-.44, Math.min(.44, Math.atan2(faceDown[0], faceDown[1]))) : 0;  // one eye can't tell a tilt; cap it at 25°
  faceDown = mul([Math.sin(tilt), Math.cos(tilt)], Math.abs(faceDown[1]) / Math.cos(tilt));
  const mouth = nose && eyeMid && nose[1] > eyeMid[1] ? add(nose, mul(faceDown, .55)) : [crown[0], crown[1] + (neck[1] - crown[1]) * .62];
  const J = { fs, bs, fe, be, fw, bw, ...J0, neck, crown, mouth, faceUp: mul(unit(faceDown), -1), hip: mul(add(J0.fh, J0.bh), .5) };
  // hands and feet hang past the wrist and ankle; the bones used for cutting run to their tips
  J.fhand = add(fw, mul(unit(sub(fw, fe)), .32 * sw)); J.bhand = add(bw, mul(unit(sub(bw, be)), .32 * sw));
  J.ffoot = add(J.fa, mul(down, .12 * sw)); J.bfoot = add(J.ba, mul(down, .12 * sw));
  const knees = mul(add(J.fk, J.bk), .5), kr = runs(knees[1]).find(([a, z]) => a <= knees[0] && knees[0] <= z);
  const skirt = !!kr && kr[1] - kr[0] >= .85 * sw;  // a dress: the lower body stays in one piece
  return { J, sw, skirt };
}

function rig(img, kp, opts = {}) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h }), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const A = g.getImageData(0, 0, w, h).data, { J, sw, skirt: sk } = skeleton(kp, w, h, A);
  const opaque = (p) => { const x = Math.round(p[0]), y = Math.round(p[1]); return x >= 0 && y >= 0 && x < w && y < h && A[(y * w + x) * 4 + 3] > 128; };
  const look = name => {  // [most of the limb is in the photo, the photo stops before the limb's end]
    const [a, b] = BONES[name]; let n = 0;
    for (let i = 0; i < 7; i++) n += opaque(add(J[a], mul(sub(J[b], J[a]), .15 + i * .7 / 6)));
    return [n >= 3, J[b][1] >= h - 2];
  };
  const shown = name => { const [vis, cutOff] = look(name); return vis && !cutOff; };
  const skirt = sk && opts.skirt !== false;
  // the photo stops above the hips (a head-and-shoulders crop, or someone in front): the belly and pelvis are chrome
  const cyTorso = ![-.3, -.15, 0, .15, .3].some(t => opaque(add(J.hip, mul(sub(J.fh, J.bh), t))));
  const legs = ['fTh', 'fSh', 'bTh', 'bSh'], bones = skirt ? { ...BONES, skirt: ['hip', 'skirtEnd'] } : BONES;
  if (skirt) {  // dress: thighs belong to it; shins too, unless the photo stops above them (then they're chrome)
    J.skirtEnd = [J.hip[0], Math.max(J.fk[1], J.bk[1])];
    ['fTh', 'bTh'].forEach(n => delete bones[n]); ['fSh', 'bSh'].forEach(n => shown(n) && delete bones[n]);
  }
  const cyber = new Set(LIMBS.filter(n => bones[n] && !shown(n)));
  const stub = new Set([...cyber].filter(n => look(n)[0]));  // cut off by the frame: the visible part rides on its chrome limb
  const tip = { fFA: 'fhand', bFA: 'bhand', fSh: 'ffoot', bSh: 'bfoot' };
  const cut = Object.keys(bones).filter(n => !cyber.has(n) || stub.has(n)), segs = cut.map(n => { const [a, b] = bones[n]; return [...J[a], ...J[tip[n] || b]]; });
  const bias = cut.map(n => (BIAS[n] || 0) * sw), reach = cut.map(n => (REACH[n] || 99) * sw), N = cut.length, headK = cut.indexOf('head');
  const best = new Uint8Array(w * h).fill(255), second = new Uint8Array(w * h).fill(255), box = cut.map(() => [w, h, -1, -1]);
  const grow = (k, x, y) => { const b = box[k]; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {  // every opaque pixel goes to its nearest bone; seams overlap a little
    const i = y * w + x;
    if (A[i * 4 + 3] < 8) continue;
    let k1 = 0, d1 = 1e9, k2 = 255, d2 = 1e9;
    for (let k = 0; k < N; k++) {
      const s = segs[k], raw = segDist(x, y, s[0], s[1], s[2], s[3]);
      if (raw > reach[k]) continue;
      const d = raw - bias[k] - (k === headK && y < J.neck[1] && Math.abs(x - J.mouth[0]) < .3 * sw ? .12 * sw : 0);  // above the neck the head wins, so the chin (and mouth) stay on it
      if (d < d1) { k2 = k1; d2 = d1; k1 = k; d1 = d; } else if (d < d2) { k2 = k; d2 = d; }
    }
    best[i] = k1; grow(k1, x, y);
    if (d2 - d1 < 3 && k2 !== 255) { second[i] = k2; grow(k2, x, y); }
  }
  const parts = {};
  cut.forEach((name, k) => {
    const [x0, y0, x1, y1] = box[k];
    if (x1 < 0) return;
    const pw = x1 - x0 + 1, ph = y1 - y0 + 1, pc = Object.assign(document.createElement('canvas'), { width: pw, height: ph });
    const pg = pc.getContext('2d'), out = pg.createImageData(pw, ph);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (best[i] !== k && second[i] !== k) continue;
      const o = ((y - y0) * pw + (x - x0)) * 4;
      out.data[o] = A[i * 4]; out.data[o + 1] = A[i * 4 + 1]; out.data[o + 2] = A[i * 4 + 2]; out.data[o + 3] = A[i * 4 + 3];
    }
    pg.putImageData(out, 0, 0);
    parts[name] = { canvas: pc, x: x0, y: y0 };
  });
  let talks = false;  // South Park style talking: the face is cut along the mouth line and the top half bobs up and down
  const hp = parts.head, cutY = J.mouth[1] - (hp ? hp.y : 0);
  if (hp && cutY > hp.canvas.height * .3 && cutY < hp.canvas.height - 4) {
    const up = J.faceUp, along = [-up[1], up[0]], m = sub(J.mouth, [hp.x, hp.y]);  // in head-piece pixels
    const quad = [add(m, mul(along, .45 * sw)), add(m, mul(along, -.45 * sw))];
    quad.push(add(quad[1], mul(up, 3 * sw)), add(quad[0], mul(up, 3 * sw)));  // only the face lifts: a fist or a camera beside it stays
    const copy = keep => { const c = Object.assign(document.createElement('canvas'), { width: hp.canvas.width, height: hp.canvas.height }), g = c.getContext('2d');
      g.drawImage(hp.canvas, 0, 0); g.globalCompositeOperation = keep ? 'destination-in' : 'destination-out';
      g.beginPath(); quad.forEach(([x, y]) => g.lineTo(x, y)); g.closePath(); g.fill(); return c; };
    parts.jaw = { canvas: copy(false), x: hp.x, y: hp.y };
    parts.head = { canvas: copy(true), x: hp.x, y: hp.y };
    talks = true;
  }
  const rest = {};
  for (const n in bones) { const [a, b] = bones[n]; rest[n] = dir(J[a], J[b]); }
  const foot = Math.max(J.ffoot[1], J.bfoot[1], ...Object.values(parts).map(p => p.y + p.canvas.height));
  return { J, sw, parts, cyber, cyTorso, rest, skirt, talks, w, h, top: J.crown[1], foot, cx: J.hip[0], feetY: Math.max(J.ffoot[1], J.bfoot[1]) };
}

// pose: { torso, head: lean offsets (rad); limb: [absolute direction, weight] }; directions in the figure's frame:
// 0 = forward, PI/2 = straight down, -PI/2 = straight up. Children inherit their parent's turn.
function solve(r, pose) {
  const o = { torso: pose.torso || 0, head: pose.head || 0, skirt: pose.skirt || 0, mouth: pose.mouth || 0 };  // mouth: 0 shut .. 1 wide open
  const rel = (n, inherited) => { const p = pose[n]; return p && r.rest[n] !== undefined ? (p[1] ?? 1) * wrap(p[0] - r.rest[n] - inherited) : 0; };
  o.fUA = rel('fUA', o.torso); o.fFA = rel('fFA', o.torso + o.fUA);
  o.bUA = rel('bUA', o.torso); o.bFA = rel('bFA', o.torso + o.bUA);
  o.fTh = rel('fTh', 0); o.fSh = rel('fSh', r.skirt ? o.skirt : o.fTh);
  o.bTh = rel('bTh', 0); o.bSh = rel('bSh', r.skirt ? o.skirt : o.bTh);
  return o;
}

// bending the knees lifts the feet; this is how far (fraction of the figure's height) to lower it so a foot stays down
function sink(r, o) {
  const J = r.J, rot = (p, c, a) => { const s = Math.sin(a), co = Math.cos(a), x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * co - y * s, c[1] + x * s + y * co]; };
  const foot = (f, hp, kn, th, sh) => rot(rot(J[f], J[kn], o[sh] || 0), r.skirt ? J.hip : J[hp], (r.skirt ? o.skirt : o[th]) || 0)[1];
  return (r.feetY - Math.max(foot('ffoot', 'fh', 'fk', 'fTh', 'fSh'), foot('bfoot', 'bh', 'bk', 'bTh', 'bSh'))) / (r.foot - r.top);
}

function cyborg(ctx, a, b, wd, end) {  // a chrome limb from joint a to joint b, with a hand or a boot at the end
  const L = len(sub(b, a)), ang = dir(a, b);
  ctx.save(); ctx.translate(a[0], a[1]); ctx.rotate(ang);
  const gr = ctx.createLinearGradient(0, -wd / 2, 0, wd / 2);
  gr.addColorStop(0, '#f2f6fa'); gr.addColorStop(.45, '#a9b4bf'); gr.addColorStop(1, '#4b5560');
  ctx.fillStyle = gr; ctx.strokeStyle = '#1d232a'; ctx.lineWidth = wd * .12;
  ctx.beginPath(); ctx.roundRect(-wd * .15, -wd / 2, L + wd * .3, wd, wd / 2); ctx.fill(); ctx.stroke();
  ctx.lineWidth = wd * .07; ctx.beginPath(); ctx.moveTo(L * .35, -wd * .38); ctx.lineTo(L * .35, wd * .38); ctx.moveTo(L * .7, -wd * .38); ctx.lineTo(L * .7, wd * .38); ctx.stroke();
  ctx.fillStyle = '#4fd3ff'; ctx.beginPath(); ctx.arc(0, 0, wd * .3, 0, TAU); ctx.fill(); ctx.stroke();
  if (end === 'hand') {  // three-fingered claw
    ctx.translate(L, 0); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, wd * .55, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.lineCap = 'round'; ctx.lineWidth = wd * .28;
    for (const s of [-1, 0, 1]) { ctx.strokeStyle = '#1d232a'; ctx.beginPath(); ctx.moveTo(wd * .3, s * wd * .3); ctx.lineTo(wd * 1.05, s * wd * .45); ctx.stroke(); }
  } else if (end === 'foot') {  // boot pointing forward, whatever angle the shin is at
    ctx.translate(L, 0); ctx.rotate(-ang);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.roundRect(-wd * .55, -wd * .3, wd * 1.9, wd * .75, wd * .3); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// draws the posed figure; the caller has put the origin at the figure's feet. height = on-screen height in px
function draw(ctx, r, o, height, opts = {}) {
  const J = r.J, k = height / (r.foot - r.top);
  ctx.save(); ctx.scale(k, k); ctx.translate(-r.cx, -r.foot + (opts.sink || 0) * (r.foot - r.top));
  const turn = (p, a) => { ctx.translate(p[0], p[1]); ctx.rotate(a); ctx.translate(-p[0], -p[1]); };
  const piece = n => {
    const p = r.parts[n];
    if (r.cyber.has(n)) { const [a, b] = BONES[n]; cyborg(ctx, J[a], J[b], WIDTH[n] * r.sw, n.endsWith('FA') ? 'hand' : n.endsWith('Sh') ? 'foot' : ''); }
    if (p) ctx.drawImage(p.canvas, p.x, p.y);  // a photo stub of a cut-off limb sits over its chrome
  };
  const chain = (first, second, extra) => {
    ctx.save(); turn(J[BONES[first][0]], o[first]); piece(first);
    turn(J[BONES[second][0]], o[second]); piece(second); if (extra) extra();
    ctx.restore();
  };
  for (const n of ORDER) {
    if (n === 'torso' || n === 'head') {
      ctx.save(); turn(J.hip, o.torso);
      if (n === 'head') {
        turn(J.neck, o.head);
        if (r.talks && r.parts.jaw) {  // the gap that opens stays see-through
          piece('jaw');
          const lift = (o.mouth || 0) * .09 * r.sw; ctx.translate(J.faceUp[0] * lift, J.faceUp[1] * lift);
        }
        piece('head');
      }
      else {
        if (r.cyTorso) { cyborg(ctx, add(J.neck, mul(sub(J.hip, J.neck), .3)), J.hip, .66 * r.sw, ''); cyborg(ctx, J.bh, J.fh, .42 * r.sw, ''); }
        piece('torso');
      }
      ctx.restore();
    } else if (n.endsWith('UA')) {
      ctx.save(); turn(J.hip, o.torso);
      chain(n, n[0] + 'FA', n[0] === 'f' && opts.hand ? () => {
        ctx.translate(...(r.cyber.has('fFA') ? J.fw : mul(add(J.fw, J.fhand), .5))); ctx.rotate(r.rest.fFA); ctx.scale(1 / k, 1 / k); opts.hand();
      } : null);
      ctx.restore();
    } else if (n.endsWith('Th')) {
      if (!r.skirt) chain(n, n[0] + 'Sh');
      else if (n === 'bTh') {  // a dress sways from the hips; chrome shins, if any, swing under its hem
        for (const sh of ['bSh', 'fSh']) if (r.cyber.has(sh)) { ctx.save(); turn(J.hip, o.skirt); turn(J[BONES[sh][0]], o[sh]); piece(sh); ctx.restore(); }
        ctx.save(); turn(J.hip, o.skirt); piece('skirt'); ctx.restore();
      }
    }
  }
  ctx.restore();
}

window.Puppet = { rig, solve, sink, draw };
})();
