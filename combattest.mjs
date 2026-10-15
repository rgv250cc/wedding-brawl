// Combat check in headless Chrome: chains, the launcher and a juggle, blocking, the throw, the running dropkick, air attacks,
// hit-stop and the combo counter, driven by real key presses (one-player keys). node combattest.mjs [url]   (exit 1 on failure)
import { chromium } from 'playwright-core';
const URL = process.argv[2] || 'http://localhost:8765/';
const b = await chromium.launch({ channel: 'chrome', headless: true }), p = await b.newPage({ viewport: { width: 1200, height: 820 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(URL);
await p.waitForFunction(() => window.Brawl && window.LAYERS && window.FIGHTERS && window.Puppet);
await p.evaluate(() => Brawl.start([69, 10], { mode: 'cpu' }));
await p.waitForFunction(() => Brawl.state && Brawl.state.phase === 'fight', null, { timeout: 20000 });
let fails = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const setup = (gap = .045, extra = {}) => p.evaluate(([gap, extra]) => {  // P2 parked in front of P1, the CPU switched off, the room calm
  const S = Brawl.state, [a, c] = S.players; S.photog && (S.photog.think = 99, S.photog.target = null); S.freeze = 0; S.clock = 60;
  c.lv = { ...c.lv, think: 99, rate: 0, speed: 0, block: 0, combo: 0, grab: 0, dodge: 0 }; c.think = 99; c.goal = c;
  for (const f of [a, c]) Object.assign(f, { hp: 112, state: 'idle', st: 0, y: 0, vy: 0, vx: 0, vz: 0, z: .5, item: null, comboN: 0, buf: null, runT: 0, running: false });
  a.x = .45; a.face = 1; c.x = .45 + gap; c.face = -1; Object.assign(c, extra);
}, [gap, extra]);
const st = () => p.evaluate(() => { const [a, c] = Brawl.state.players; return { a: a.state, move: a.move && a.move.key, c: c.state, hp: c.hp, cy: c.y, combo: a.comboN, freeze: Brawl.state.freeze }; });
const tap = async (k, gap = 60) => { await p.keyboard.press(k); await p.waitForTimeout(gap); };

await setup(); const moves = [];
for (let i = 0; i < 3; i++) { await tap('j', 0); for (let w = 0; w < 25; w++) { const s = await st(); if (s.move && !moves.includes(s.move)) { moves.push(s.move); break; } await p.waitForTimeout(20); } await p.waitForTimeout(120); }
check(moves.join(' > ') === 'jab > cross > upper', 'J J J chains jab > cross > uppercut', moves.join(' > '));
let s = await st(); await p.waitForTimeout(150); s = await st();
check(s.c === 'launched' || s.cy > .1, 'the uppercut launches the rival', `state ${s.c}, y ${s.cy.toFixed(2)}`);
check((await p.evaluate(() => Brawl.state.players[0].comboN)) >= 3, 'three landed hits count as a combo', `combo ${await p.evaluate(() => Brawl.state.players[0].comboN)}`);
await p.waitForTimeout(900); await setup(.3); await tap('Space', 150); await tap('j', 0); await p.waitForTimeout(60); s = await st();
check(s.move === 'airp' || s.move === 'airk', 'jumping and punching is an air attack', s.move);

await p.waitForTimeout(900); await setup(); const hp0 = 112; let froze = false; await tap('j', 0);
for (let w = 0; w < 20 && !froze; w++) { froze = (await p.evaluate(() => Brawl.state.freeze)) > 0; await p.waitForTimeout(10); }
check(froze && (await st()).hp < hp0, 'a landed jab causes hit-stop and damage', `hit-stop seen ${froze}`);
await p.waitForTimeout(400);
await setup(.045, { lv: undefined }); await p.evaluate(() => { const c = Brawl.state.players[1]; c.lv = { ...Brawl.state.players[0].lv, block: 1, think: 99, rate: 0, speed: 0, combo: 0, grab: 0 }; });
await tap('j', 0); await p.waitForTimeout(150); s = await st();
check(s.c === 'block' && s.hp > 110, 'a blocking rival takes only chip damage', `state ${s.c}, hp ${s.hp.toFixed(1)}`);
await p.waitForTimeout(400);

await setup(.04); await tap('l', 0); await p.waitForTimeout(80); s = await st();
check(s.a === 'throw' && s.c === 'grabbed', 'L next to the rival grabs them', `${s.a} / ${s.c}`);
await p.waitForTimeout(700); s = await st();
check(s.hp < 105 && s.c !== 'grabbed', 'and suplexes them', `hp ${s.hp.toFixed(1)}, state ${s.c}`);
await p.waitForTimeout(1500);

await setup(.25); await p.keyboard.down('d'); await p.waitForTimeout(520); const run = await p.evaluate(() => Brawl.state.players[0].running);
await tap('k', 0); await p.keyboard.up('d'); await p.waitForTimeout(80); s = await st();
check(run && s.move === 'dropkick', 'running then kicking is a dropkick', `running ${run}, move ${s.move}`);
await p.waitForTimeout(800);

await setup(.045); await tap('k', 0); await p.waitForTimeout(160); await tap('k', 0); await p.waitForTimeout(250); s = await st();
check(s.move === 'spin' || s.c === 'down', 'K K chains low kick > spin kick', `${s.move} / ${s.c}`);

await p.waitForTimeout(500); await p.screenshot({ path: process.argv[3] || '/tmp/combat.png' });
check(!errs.length, 'no page errors', errs.join(' | '));
console.log(fails ? `${fails} check(s) failed` : 'combat ok');
await b.close(); process.exit(fails ? 1 : 0);
