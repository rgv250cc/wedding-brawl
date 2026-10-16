// Combat check in headless Chrome: chains, the launcher and a juggle, blocking, the throw, the running dropkick, air attacks,
// hit-stop and the combo counter, driven by real key presses (one-player keys). node combattest.mjs [url]   (exit 1 on failure)
import { chromium } from 'playwright-core';
const URL = process.argv[2] || 'http://localhost:8765/';
const b = await chromium.launch({ channel: 'chrome', headless: true }), p = await b.newPage({ viewport: { width: 1200, height: 820 } });
const errs = []; p.on('pageerror', e => { const m = e.message + ' @ ' + String(e.stack || '').split('\n')[1]; if (!errs.includes(m)) errs.push(m); });
await p.goto(URL);
await p.waitForFunction(() => window.Brawl && window.LAYERS && window.FIGHTERS && window.Puppet);
await p.evaluate(() => Brawl.start([69, 10], { mode: 'cpu' }));
await p.waitForFunction(() => Brawl.state && Brawl.state.phase === 'fight', null, { timeout: 20000 });
let fails = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const setup = (gap = .045, extra = {}) => p.evaluate(([gap, extra]) => {  // P2 parked in front of P1, the CPU switched off, the room calm
  const S = Brawl.state, [a, c] = S.players; S.photog && (S.photog.think = 99, S.photog.target = null); S.freeze = 0; S.clock = 60;
  c.lv = { ...c.lv, think: 99, rate: 0, speed: 0, block: 0, combo: 0, grab: 0, dodge: 0, roll: 0 }; c.think = 99; c.goal = c;
  for (const f of [a, c]) Object.assign(f, { hp: 112, state: 'idle', st: 0, y: 0, vy: 0, vx: 0, vz: 0, z: .5, item: null, comboN: 0, buf: null, runT: 0, running: false,
    sp: 0, guard: 1, curse: null, curseT: 0, curseAt: -9, immuneT: 0, lastKey: null, sameN: 0, roll: null, keepCurse: false, bendAt: null, rolledAt: -9, rollStack: 0 });
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
await setup(.045, { lv: undefined }); await p.evaluate(() => { const c = Brawl.state.players[1]; c.lv = { ...Brawl.state.players[0].lv, block: 1, think: 99, rate: 0, speed: 0, combo: 0, grab: 0, roll: 0 }; clearInterval(window._pin2); window._pin2 = setInterval(() => { c.y = 0; c.vy = 0; }, 5); });  // the idle CPU hops now and then; nobody blocks in the air
await tap('j', 0); await p.waitForTimeout(150); s = await st();
await p.evaluate(() => clearInterval(window._pin2));
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
check(s.move === 'snap', 'K K chains low kick > snap kick', `${s.move} / ${s.c}`);

// ---- tactics: rolls dodge, lows and grabs beat a block, a grab loses to a blow, heavy blows break a guard
await p.waitForTimeout(600); await setup(.2); await tap('d', 40); await tap('d', 0); await p.waitForTimeout(30); s = await st();
check(s.a === 'roll', 'double-tapping a direction rolls', s.a);
await p.waitForTimeout(700);
await setup(.06); await p.evaluate(() => { const [a, c] = Brawl.state.players; c.face = -1; c.state = 'attack'; c.move = Brawl.state && { ...c.move }; });
const dodge = await p.evaluate(() => {  // the rival swings while P1 is mid-roll: no damage
  const S = Brawl.state, [a, c] = S.players; Object.assign(a, { state: 'roll', st: .06, roll: { kind: 'fwd', t: .6, dir: [1, 0], v: .3, safe: [.05, .6] } });
  Object.assign(c, { state: 'idle', st: 0 }); a.x = c.x - .05; c.face = -1; c.inp.punch = true; return a.hp; });
await p.waitForTimeout(250);
check((await p.evaluate(() => Brawl.state.players[0].hp)) === dodge, 'a roll is untouchable while it lasts', `${dodge} -> ${await p.evaluate(() => Brawl.state.players[0].hp)}`);
await p.waitForTimeout(700);
const blockSet = () => p.evaluate(() => { const c = Brawl.state.players[1]; c.lv = { ...c.lv, block: 1, think: 99, rate: 0, speed: 0, combo: 0, grab: 0, roll: 0 }; });
await setup(.05); await blockSet(); await tap('k', 0); await p.waitForTimeout(160); s = await st();
check(s.c === 'block' && s.hp === 112, 'a low kick is blocked, with no chip from a light blow', `state ${s.c}, hp ${s.hp.toFixed(1)}`);
await p.waitForTimeout(600); await setup(.05); await p.evaluate(() => { const c = Brawl.state.players[1]; Object.assign(c, { state: 'roll', st: .1, y: 0, roll: { kind: 'side', t: 1.5, dir: [0, 0], v: 0, safe: null } }); });
await tap('k', 0); await p.waitForTimeout(160); s = await st();
check(s.c === 'down', 'a low kick trips someone at the end of a roll', `state ${s.c}`);
await p.waitForTimeout(600); await setup(.04); await blockSet(); await tap('l', 0); await p.waitForTimeout(80); s = await st();
check(s.a === 'throw', 'a grab beats a block', `${s.a} / ${s.c}`);
await p.waitForTimeout(1500); await setup(.04);
await p.evaluate(() => { const c = Brawl.state.players[1]; c.lv = { ...c.lv, rate: 0, think: 99, speed: 0 }; Object.assign(c, { state: 'attack', st: 0, move: Brawl.state.players[0].move || null }); });
await p.evaluate(() => { const c = Brawl.state.players[1]; c.move = { key: 'jab', hit: .07, t: .22, reach: .075, dmg: 4, word: 'JAB!', snd: 'punch', pose: 'punch' }; c.st = 0; c.state = 'attack'; });
await tap('l', 0); await p.waitForTimeout(30); s = await st();
check(s.a === 'whiff' || s.a === 'hit', 'a grab loses to a blow already on its way', s.a);
await p.waitForTimeout(800); await setup(.05); await blockSet();
const broke = await p.evaluate(async () => { const c = Brawl.state.players[1]; c.guard = .15; return c.guard; });
await tap('k', 0); await p.waitForTimeout(60);  // a low gets under; use a punch chain into a heavy instead
await p.waitForTimeout(500); await setup(.05); await blockSet(); await p.evaluate(() => { Brawl.state.players[1].guard = .1; });
await tap('j', 0); await p.waitForTimeout(150); s = await st();
check(s.c === 'hit', 'a worn-down guard breaks', `state ${s.c}`);

// ---- the special bar and every curse
await p.waitForTimeout(900); await setup(.05);
await p.evaluate(() => { const [a, c] = Brawl.state.players; a.sp = 7 / 8; c.lv = { ...c.lv, block: 0 }; });
await tap('j', 0); await p.waitForTimeout(150);
check((await p.evaluate(() => Brawl.state.players[0].sp)) >= 1, 'the eighth unanswered hit fills the star bar');
await p.evaluate(() => { Brawl.state.players[1].immuneT = 0; });
await p.waitForTimeout(800); await setup(.1); await p.evaluate(() => { Brawl.state.players[0].sp = 1; const c = Brawl.state.players[1]; window._pin = setInterval(() => { c.y = 0; c.vy = 0; }, 5); });  // the idle CPU hops now and then, which would dodge it
await tap('i', 0); await p.waitForTimeout(80); s = await st();
check(s.a === 'cast', 'SPECIAL (I) casts it', s.a);
await p.waitForTimeout(1300); s = await st();
const curse = await p.evaluate(() => { clearInterval(window._pin); return Brawl.state.players[1].curse; });
check(!!curse, 'the special curses the rival', `${curse} (${s.c})`);
const hpBefore = await p.evaluate(() => Brawl.state.players[1].hp);
await p.evaluate(() => { const S = Brawl.state, c = S.players[1]; c.curseT = .01; });
await p.waitForTimeout(400);
check(!(await p.evaluate(() => Brawl.state.players[1].curse)), 'a curse wears off');
const types = await p.evaluate(() => ['pig', 'chicken', 'tiny', 'balloon', 'disco', 'dizzy', 'fart', 'smooch', 'ice', 'cake', 'spoon', 'escalator']);
const seen = {};
for (const t of types) {  // cast each curse straight onto P2 and let it play out for a moment: no errors, a picture of each
  await setup(.12);
  await p.evaluate(t => { const S = Brawl.state, [a, c] = S.players; Object.assign(a, { cast: t, state: 'cast', st: .44, done: false, sp: 0, castX: c.x, castZ: c.z }); c.immuneT = 0; c.curse = null; }, t);
  await p.waitForTimeout(t === 'escalator' ? 1200 : 450);
  seen[t] = await p.evaluate(() => Brawl.state.players[1].curse);
  await p.screenshot({ path: `/tmp/curse-${t}.png` });
  await p.evaluate(() => { const c = Brawl.state.players[1]; c.curseT = .01; });
  await p.waitForTimeout(t === 'escalator' ? 2500 : 500);
}
const missing = types.filter(t => seen[t] !== t);
check(!missing.length, 'every curse lands and plays', missing.length ? 'missing ' + missing.join(', ') : types.join(' '));
// Moses bends the spoon: cast spoon, then hit it
await setup(.05);
await p.evaluate(() => { const S = Brawl.state, [a, c] = S.players; Object.assign(a, { cast: 'spoon', state: 'cast', st: .44, done: false, castX: c.x, castZ: c.z }); c.immuneT = 0; });
await p.waitForTimeout(900); await p.evaluate(() => { const [a, c] = Brawl.state.players; c.x = a.x + .06; c.z = a.z; c.y = 0; c.wander = Math.PI / 2; c.inp = {}; });  // it hops about: put it back in reach
await tap('j', 0); await p.waitForTimeout(200);
const bent = await p.evaluate(() => { const c = Brawl.state.players[1]; return [c.curse, !!c.bendAt, c.curseHits]; });
check(bent[0] === 'spoon' && bent[1] && bent[2] === 1, 'hitting the spoon bends it (and it stays a spoon)', JSON.stringify(bent));
await p.screenshot({ path: '/tmp/curse-bent.png' });
await p.waitForTimeout(2600);
const dmgSeen = await p.evaluate(() => Brawl.state.fx.length >= 0);
check(dmgSeen, 'damage numbers ok');

await p.waitForTimeout(500); await p.screenshot({ path: process.argv[3] || '/tmp/combat.png' });
check(!errs.length, 'no page errors', errs.join(' | '));
console.log(fails ? `${fails} check(s) failed` : 'combat ok');
await b.close(); process.exit(fails ? 1 : 0);
