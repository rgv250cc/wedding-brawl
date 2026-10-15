// End-to-end online test: starts server.mjs, two separate headless Chrome players log in, both press FIND A MATCH, get
// matched and fight. Checks the guest's keys move and attack with its fighter on the host's screen, both screens agree on
// where everyone is, then a duel invite round, and finally the guest walks out and the host is told and sent back to the
// lobby. Serves real files, so layers.js/fighters.js must be here. node nettest.mjs   (exit code 1 on any failure)
// NETTEST_URL=https://host/ node nettest.mjs tests a site that is already running (wrangler dev, the deployed Worker) instead of starting server.mjs.
import { chromium } from 'playwright-core';
import { spawn } from 'child_process';

const PORT = 8790 + Math.floor(Math.random() * 100), URL = process.env.NETTEST_URL || `http://127.0.0.1:${PORT}/`;
const srv = process.env.NETTEST_URL ? null : spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT), BRAWL_CODE: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
if (srv) await new Promise((res, rej) => { srv.stdout.on('data', d => /http:/.test(d) && res()); srv.on('exit', c => rej(new Error('server exited ' + c))); });
console.log('testing ' + URL);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const until = async (page, fn, arg, ms = 20000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

async function player(name, k) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } }), page = await ctx.newPage();
  page.on('pageerror', e => console.log(`  [${name}] PAGE ERROR ${e.message}`));
  await page.goto(URL);
  await page.waitForFunction(() => window.LAYERS && window.FIGHTERS && window.Brawl && window.Lobby && window.RoomShim && window.Puppet, null, { timeout: 30000 });
  await page.evaluate(k => window.Lobby.open({ k }), k);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'ENTER LOBBY' }).click();
  return { name, ctx, page };
}
const S = (p, fn) => p.page.evaluate(fn);
const role = p => S(p, () => window.Brawl.state ? (window.Brawl.state.byId ? 'guest' : 'host') : null);

try {
  const a = await player('Gabi', 60), b = await player('Steph', 10);
  check(await until(a.page, () => document.querySelectorAll('#lobby .lb-list [data-key]').length >= 2), 'both players listed in the lobby');
  await a.page.getByRole('button', { name: /FIND A MATCH/ }).click();
  await b.page.getByRole('button', { name: /FIND A MATCH/ }).click();
  const fighting = () => window.Brawl.state && window.Brawl.state.players.length === 2 && window.Brawl.state.phase === 'fight';
  check(await until(a.page, fighting, null, 30000) && await until(b.page, fighting, null, 30000), 'queue matched them and the fight started on both screens');
  const ra = await role(a), rb = await role(b);
  check(new Set([ra, rb]).size === 2, 'one host and one guest', `${a.name}=${ra}, ${b.name}=${rb}`);
  const [host, guest] = ra === 'host' ? [a, b] : [b, a];
  const names = await S(guest, () => window.Brawl.state.players.map(p => p.name));
  check(names[0] === host.name && names[1] === guest.name, 'guest shows host as P1 and itself as P2', names.join(' vs '));

  // the guest moves: its fighter must move on the host's screen too
  const p2x = () => S(host, () => { const s = window.Brawl.state, p = s.players[1]; p.hp = 112; s.photog && (s.photog.think = 99, s.photog.target = null); return p.x; });
  await S(host, () => { const p = window.Brawl.state.players[1]; window.Brawl.state.players[0].x = .2; });
  const x0 = await p2x(), side = x0 < .5 ? 'KeyD' : 'KeyA';
  await guest.page.keyboard.down(side === 'KeyD' ? 'd' : 'a'); await guest.page.waitForTimeout(700); await guest.page.keyboard.up(side === 'KeyD' ? 'd' : 'a');
  await guest.page.waitForTimeout(500);
  const x1 = await p2x();
  check(Math.abs(x1 - x0) > .05, "guest's keys move its fighter on the host's screen", `${x0.toFixed(3)} -> ${x1.toFixed(3)}`);
  const seen = await S(guest, () => window.Brawl.state.players.map(p => p.x)), truth = await S(host, () => window.Brawl.state.players.map(p => p.x));
  check(Math.abs(seen[0] - truth[0]) < .06 && Math.abs(seen[1] - truth[1]) < .06, 'both screens agree where the fighters are',
        `host ${truth.map(v => v.toFixed(3))} guest ${seen.map(v => v.toFixed(3))}`);
  // the guest punches: the host must see P2 attack
  const attacked = host.page.waitForFunction(() => { const p = window.Brawl.state.players[1]; return p.state === 'attack' && !!p.move; }, null, { timeout: 4000 }).then(() => true, () => false);
  await guest.page.keyboard.press('j');
  check(await attacked, "guest's J punches on the host's screen");
  const guestSees = await until(guest.page, () => window.Brawl.state.players[1].state === 'attack' || window.Brawl.state.players[1].move, null, 3000);
  check(guestSees, 'the guest sees its own punch come back');
  const people = await S(host, () => window.Brawl.state.people.filter(e => !e.gone).length), people2 = await S(guest, () => window.Brawl.state.people.length);
  check(Math.abs(people - people2) <= 1, 'the guest draws the same crowd as the host', `${people} vs ${people2}`);

  // the guest walks out: the host gets "OPPONENT LEFT" and is back in the lobby
  await guest.page.close();
  check(await until(host.page, () => !window.Brawl.state && !document.getElementById('lobby').hidden, null, 15000), 'host is told and returned to the lobby after the guest leaves');
  check(await until(host.page, () => /left/i.test(document.querySelector('#lobby .lb-banner')?.textContent || ''), null, 3000), 'host sees why the match ended',
        await S(host, () => document.querySelector('#lobby .lb-banner')?.textContent || ''));

  // a duel: a third player challenges the host by name, the host accepts
  const c = await player('Moshik', 5);
  check(await until(host.page, () => [...document.querySelectorAll('#lobby .lb-list [data-key]')].some(n => /MOSHIK/i.test(n.textContent)), null, 15000), 'a new player shows up in the list');
  const duel = c.page.locator('#lobby .lb-list [data-key]').filter({ hasText: new RegExp(host.name, 'i') }).getByRole('button', { name: 'DUEL' });
  await duel.click();
  check(await until(host.page, () => /challenges you/i.test(document.getElementById('lobby').textContent), null, 10000), 'the host gets the challenge');
  await host.page.getByRole('button', { name: 'ACCEPT' }).click();
  check(await until(host.page, fighting, null, 30000) && await until(c.page, fighting, null, 30000), 'accepted duel starts a fight on both screens');
  check((await role(c)) === 'host', 'the challenger hosts the duel');
} catch (e) { check(false, 'test crashed', e.message); }
await browser.close(); srv?.kill();
console.log(fails ? `${fails} check(s) failed` : 'online play ok');
process.exit(fails ? 1 : 0);
