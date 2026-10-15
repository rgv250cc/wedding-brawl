// Frame-by-frame recorder. The page clock is frozen and stepped 1/30 s at a time; every step is screenshotted and
// the sound is rendered offline from the same clock, so the video is smooth and in sync however slow the machine is.
// Run: npm i playwright-core@1.49.1, serve the page folder on :8765, then: node record.mjs take.mp4   (needs ffmpeg)
// Session: the pop-up intro, pick the groom, pick an older guest, FIGHT, then the groom played from the keyboard.
import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
import fs from 'fs';
const OUT = process.argv[2] || 'take.mp4', FPS = 30, DT = 1000 / FPS, VW = 1280, VH = 860;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: VW, height: VH }, colorScheme: 'dark' });
await page.addInitScript(() => {  // virtual clock: time moves only when the recorder calls __step
  let now = 0, id = 0;
  const raf = new Map(), timers = new Map(), t0 = Date.now();
  performance.now = () => now; Date.now = () => t0 + now;
  window.requestAnimationFrame = cb => (raf.set(++id, cb), id);
  window.cancelAnimationFrame = i => raf.delete(i);
  window.setTimeout = (fn, ms = 0, ...a) => (timers.set(++id, [now + ms, fn, a]), id);
  window.clearTimeout = i => timers.delete(i);
  window.__step = ms => {
    now += ms;
    for (const [i, [at, fn, a]] of [...timers].sort((x, y) => x[1][0] - y[1][0])) if (at <= now) { timers.delete(i); fn(...a); }
    const cbs = [...raf.values()]; raf.clear(); cbs.forEach(cb => cb(now));
    for (const an of document.getAnimations()) {  // CSS animations and transitions follow the same clock
      if (an.__t0 === undefined) an.__t0 = now - (an.currentTime || 0);
      an.pause(); an.currentTime = now - an.__t0;
    }
  };
});
const t0 = Date.now(), log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(0).padStart(4) + 's', ...a);
await page.goto('http://localhost:8765/');
for (let i = 0; !(await page.evaluate(() => !!(window.LAYERS && window.FIGHTERS && window.Brawl && window.SFX && window.SOUNDS && window.BALLROOM))); i++) {
  if (i > 300) throw new Error('page never finished loading');
  await new Promise(r => setTimeout(r, 100));
}
await page.evaluate(() => window.SFX.capture(true));
const cdp = await page.context().newCDPSession(page);
const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
                            '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', 'frames.mp4']);
let frame = 0;
const vt = () => frame / FPS;  // seconds of video so far
let pendingUp = [];
async function step(n = 1) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(ms => window.__step(ms), DT);
    for (const k of pendingUp) await page.keyboard.up(k);  // a tap is held for exactly one game step
    pendingUp = [];
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
    if (!ff.stdin.write(Buffer.from(data, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    frame++;
  }
}
const r = await page.evaluate(() => document.querySelector('.stage canvas').getBoundingClientRect().toJSON());
const at = (fx, fy) => [r.left + ((fx - .5) * 2.28 + 1) / 2 * r.width, r.top + ((fy - .5) * 2.28 + 1) / 2 * r.height];  // photo fraction -> screen
let mouse = [r.left + r.width / 2, r.top + r.height / 2];
async function glide(to, seconds) {  // move the pointer smoothly, one step per frame
  const from = mouse, n = Math.round(seconds * FPS);
  for (let i = 1; i <= n; i++) {
    const e = .5 - Math.cos(Math.PI * i / n) / 2;
    mouse = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e];
    await page.mouse.move(...mouse); await step();
  }
}

// --- the pop-up intro plays once, then character select
await page.mouse.move(...mouse);
await step(Math.round(3.2 * FPS));
await glide(at(.617, .652), .9); await page.mouse.click(...mouse); log('picked', await page.textContent('.p1 .name'));   // the groom
await step(Math.round(2.2 * FPS));
await glide(at(.754, .59), .9); await page.mouse.click(...mouse); log('rival', await page.textContent('.p2 .name'));  // an older guest
await step(Math.round(2.3 * FPS));
const b = await page.evaluate(() => document.querySelector('#fightbtn').getBoundingClientRect().toJSON());
await glide([b.left + b.width / 2, b.top + b.height / 2], .5); await page.mouse.click(...mouse);
await step(Math.round(.5 * FPS));
await page.mouse.move(VW - 4, VH - 4);  // pointer out of the way

// --- the fight: the groom (P1) on the keyboard. Flatten a few bystanders for weapons, grab the alien ray gun, then finish the job
const held = new Set(), DOWN = ['down', 'cry', 'ko', 'slip', 'getup', 'faint', 'flip', 'beam', 'fall'];
const key = async (k, on) => { if (on === held.has(k)) return; await (on ? page.keyboard.down(k) : page.keyboard.up(k)); on ? held.add(k) : held.delete(k); };
const tap = async k => { await page.keyboard.down(k); pendingUp.push(k); };  // released on the next frame
let koAt = 0, chaos = 3, fightStart = 0;
for (;;) {
  const s = await page.evaluate(() => {
    const S = window.Brawl.state; if (!S) return null;
    const pk = o => ({ x: o.x, z: o.z, st: o.state, hp: o.hp, item: o.item && o.item.type, ammo: o.item ? o.item.ammo : 0, cd: o.cd, face: o.face, name: o.name });
    return { phase: S.phase, round: S.round, a: pk(S.players[0]), b: pk(S.players[1]),
             items: S.items.filter(i => !i.held && i.y === 0).map(i => ({ x: i.x, z: i.z, type: i.type })),
             guests: S.guests.filter(g => !g.gone && (g.state === 'idle' || g.state === 'walk')).map(g => ({ x: g.x, z: g.z })) };
  });
  if (!s) { await step(); continue; }
  if (!fightStart && s.phase === 'fight') fightStart = vt();
  if (s.round > 1 || (koAt && vt() - koAt > 5.5) || (fightStart && vt() - fightStart > 75)) break;
  if (s.phase === 'ko' && !koAt) { koAt = vt(); log('round over at', vt().toFixed(1) + 's of video:', s.a.name, Math.round(s.a.hp), 'vs', s.b.name, Math.round(s.b.hp)); }
  if (s.phase !== 'fight') { for (const k of [...held]) await key(k, false); await step(); continue; }
  const me = s.a, foe = s.b, d = o => Math.hypot(o.x - me.x, (o.z - me.z) * 1.5);
  const loot = !me.item && s.items.sort((p, q) => (q.type === 'raygun') - (p.type === 'raygun') || d(p) - d(q))[0];  // ray guns first
  const victim = s.guests.sort((p, q) => d(p) - d(q))[0];
  const ranged = me.item && (me.item === 'shoe' || me.item === 'plate' || ((me.item === 'champagne' || me.item === 'raygun') && me.ammo > 0));
  const mode = loot && d(loot) < (loot.type === 'raygun' ? .9 : .45) ? 'loot' : chaos > 0 && victim && d(victim) < .5 ? 'guest' : 'foe';
  const tgt = mode === 'loot' ? loot : mode === 'guest' ? victim : foe;
  const want = mode === 'loot' ? 0 : mode === 'foe' && ranged ? .2 : .045, dx = tgt.x - me.x, dz = tgt.z - me.z;
  const far = Math.abs(dx) > want + .015, close = mode !== 'loot' && Math.abs(dx) < want - .04;
  await key('d', (far && dx > 0) || (close && dx < 0)); await key('a', (far && dx < 0) || (close && dx > 0));
  await key('s', dz > .02); await key('w', dz < -.02);
  if ((me.st === 'idle' || me.st === 'walk') && me.cd <= 0) {  // only when free to act
    if (mode === 'loot' && Math.abs(dx) < .035 && Math.abs(dz) < .035) { await tap('v'); log('grabs a', tgt.type); }
    else if (mode !== 'loot' && Math.abs(dz) < .04 && Math.abs(dx) < (mode === 'foe' && ranged ? .5 : want + .03)) {
      if (Math.sign(dx) !== me.face) { await key('d', false); await key('a', false); await tap(dx > 0 ? 'd' : 'a'); await step(); }  // turn round first
      if (mode === 'guest') { await tap('x'); chaos--; log('flattens a bystander'); }
      else if (ranged) { await tap(me.item === 'champagne' || me.item === 'raygun' ? 'x' : 'v'); log('lets fly with the', me.item); }
      else if (DOWN.includes(foe.st)) { if (Math.random() < .03) await tap('z'); }  // no hitting a man when he's down
      else if (Math.random() < (me.hp < 50 ? .18 : .12)) await tap(Math.random() < .6 ? 'x' : 'c');
    } else if (Math.random() < .01) await tap('z');
  }
  await step();
}
for (const k of [...held]) await key(k, false);
const seconds = vt();
ff.stdin.end(); await new Promise(res => ff.on('close', res));
const chunks = await page.evaluate(sec => window.SFX.renderWav(sec), seconds);
fs.writeFileSync('audio.wav', Buffer.concat(chunks.map(c => Buffer.from(c, 'base64'))));
await browser.close();
await new Promise((res, rej) => spawn('ffmpeg', ['-v', 'error', '-y', '-i', 'frames.mp4', '-i', 'audio.wav', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
  '-movflags', '+faststart', OUT], { stdio: 'inherit' }).on('close', c => c ? rej(new Error('mux failed')) : res()));
log(`done: ${OUT}, ${frame} frames, ${seconds.toFixed(1)} s`);
