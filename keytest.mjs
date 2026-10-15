// Presses every control in headless Chrome and reports what each did: the one-player layout (VS CPU) and both players'
// keys in 2 PLAYERS mode. Serve the folder first (npm run serve), then: node keytest.mjs   (exit code 1 if anything failed)
import { chromium } from 'playwright-core';
const URL = process.argv[2] || 'http://localhost:8765/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto(URL);
await page.waitForFunction(() => window.Brawl && window.LAYERS && window.FIGHTERS);
const LAYOUTS = {
  cpu: [{ up: 'w', left: 'a', down: 's', right: 'd', punch: 'j', kick: 'k', grab: 'l', jump: ' ' }],
  arrows: [{ up: 'ArrowUp', left: 'ArrowLeft', down: 'ArrowDown', right: 'ArrowRight' }],
  '2p': [{ up: 'w', left: 'a', down: 's', right: 'd', punch: 'x', kick: 'c', grab: 'v', jump: 'z' },
         { up: 'i', left: 'j', down: 'k', right: 'l', punch: ',', kick: '.', grab: '/', jump: 'm' }],
};
const st = i => page.evaluate(i => { const p = window.Brawl.state.players[i]; return { x: p.x, z: p.z, y: p.y, state: p.state, word: p.move && p.move.word, item: p.item && p.item.type }; }, i);
const calm = () => page.evaluate(() => {  // keep the bystanders, the photographer and the CPU from interfering
  const S = window.Brawl.state; S.photog && (S.photog.think = 99, S.photog.target = null);
  for (const p of S.players) { p.hp = 112; if (!['idle', 'walk'].includes(p.state)) { p.state = 'idle'; p.st = 0; } p.x = p === S.players[0] ? .35 : .65; p.z = .5; p.vx = p.vz = 0; }
  S.puddles.length = 0;
});
const out = {}, fails = [];
for (const [name, lay] of Object.entries(LAYOUTS)) {
  await page.evaluate(m => window.Brawl.start([60, 10], { mode: m }), name === 'arrows' ? 'cpu' : name);
  await page.waitForFunction(() => window.Brawl.state && window.Brawl.state.phase === 'fight', null, { timeout: 15000 });
  await page.evaluate(() => { const p = window.Brawl.state.players[1]; p.lv = { ...p.lv, think: 99, rate: 0, speed: 0, dodge: 0 }; p.think = 99; p.goal = p; });
  for (let i = lay.length - 1; i >= 0; i--) {
    const m = lay[i], r = out[`${name} P${i + 1}`] = {};
    for (const dir of ['left', 'right', 'up', 'down']) {
      await calm();
      const a = await st(i); await page.keyboard.down(m[dir]); await page.waitForTimeout(250); await page.keyboard.up(m[dir]); const b = await st(i);
      r[dir] = ({ up: b.z < a.z, down: b.z > a.z, left: b.x < a.x, right: b.x > a.x })[dir] ? 'ok' : 'NO';
      await page.waitForTimeout(200);
    }
    if (!m.punch) continue;
    await calm(); await page.keyboard.press(m.jump); await page.waitForTimeout(80); r.jump = (await st(i)).y > 0 ? 'ok' : 'NO'; await page.waitForTimeout(900);
    await calm(); await page.keyboard.press(m.punch); await page.waitForTimeout(40); r.punch = (await st(i)).word || 'NO'; await page.waitForTimeout(500);
    await calm(); await page.keyboard.press(m.kick); await page.waitForTimeout(40); r.kick = (await st(i)).word || 'NO'; await page.waitForTimeout(700);
    await calm();
    await page.evaluate(i => { const S = window.Brawl.state, p = S.players[i]; p.item = null; S.items.push({ type: 'fork', x: p.x, z: p.z, y: 0, vy: 0, vx: 0, ammo: 1, hits: 0, held: null }); }, i);
    await page.keyboard.press(m.grab); await page.waitForTimeout(80); r.grab = (await st(i)).item ? 'ok' : 'NO'; await page.waitForTimeout(400);
    await page.keyboard.press(m.grab); await page.waitForTimeout(80); r.throw = (await st(i)).item ? 'NO' : 'ok';
  }
  if (name === 'cpu') {  // in VS CPU the computer's side ignores the keyboard
    await page.waitForTimeout(800); await calm(); await page.waitForTimeout(100);
    const a = await st(1); await page.keyboard.down('ArrowLeft'); await page.keyboard.down('i'); await page.waitForTimeout(250);
    await page.keyboard.up('ArrowLeft'); await page.keyboard.up('i'); const b = await st(1);
    out['cpu P2 locked'] = Math.abs(b.x - a.x) < .001 && Math.abs(b.z - a.z) < .001 ? 'ok' : 'NO';
  }
  await page.evaluate(() => window.Brawl.stop());
}
for (const [who, r] of Object.entries(out)) for (const [k, v] of Object.entries(typeof r === 'string' ? { ok: r } : r)) if (v === 'NO') fails.push(`${who} ${k}`);
console.log(JSON.stringify(out, null, 1));
console.log(fails.length ? 'FAILED: ' + fails.join(', ') : 'all keys ok');
await browser.close();
process.exit(fails.length ? 1 : 0);
