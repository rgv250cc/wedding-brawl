// Presses every key of both players on a real (headless) Chrome and reports what each did.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto('http://localhost:8765/');
await page.waitForFunction(() => window.Brawl && window.LAYERS && window.FIGHTERS);
await page.evaluate(() => window.Brawl.start());
await page.waitForFunction(() => window.Brawl.state && window.Brawl.state.phase === 'fight', null, { timeout: 15000 });
const maps = [{ up: 'w', left: 'a', down: 's', right: 'd', punch: 'x', kick: 'c', grab: 'v', jump: 'z' },
              { up: 'i', left: 'j', down: 'k', right: 'l', punch: ',', kick: '.', grab: '/', jump: 'm' }];
const st = i => page.evaluate(i => { const p = window.Brawl.state.players[i]; return { x: p.x, z: p.z, y: p.y, state: p.state, word: p.move && p.move.word, item: p.item && p.item.type }; }, i);
const out = {};
for (const i of [1, 0]) {
  const m = maps[i], r = out['P' + (i + 1)] = {};
  for (const dir of ['left', 'right', 'up', 'down']) {
    const a = await st(i); await page.keyboard.down(m[dir]); await page.waitForTimeout(250); await page.keyboard.up(m[dir]); const b = await st(i);
    r[dir] = ({ up: b.z < a.z, down: b.z > a.z, left: b.x < a.x, right: b.x > a.x })[dir] ? 'ok' : 'NO';
    await page.waitForTimeout(300);
  }
  await page.keyboard.press(m.jump); await page.waitForTimeout(80); r.jump = (await st(i)).y > 0 ? 'ok' : 'NO'; await page.waitForTimeout(900);
  await page.keyboard.press(m.punch); await page.waitForTimeout(40); r.punch = (await st(i)).word || 'NO'; await page.waitForTimeout(500);
  await page.keyboard.press(m.kick); await page.waitForTimeout(40); r.kick = (await st(i)).word || 'NO'; await page.waitForTimeout(700);
  await page.evaluate(i => { const p = window.Brawl.state.players[i]; p.item = null; window.Brawl.state.items.push({ type: 'fork', x: p.x, z: p.z, y: 0, vy: 0, vx: 0, ammo: 1, hits: 0, held: null }); }, i);
  await page.keyboard.press(m.grab); await page.waitForTimeout(80); r.grab = (await st(i)).item ? 'ok' : 'NO'; await page.waitForTimeout(400);
  await page.keyboard.press(m.grab); await page.waitForTimeout(80); r.throw = (await st(i)).item ? 'NO' : 'ok';
}
out.hud = await page.evaluate(() => document.querySelector('.brawl-bar span').textContent);
console.log(JSON.stringify(out, null, 1));
await browser.close();
