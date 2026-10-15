// Dev probe: start a brawl headless, let it run, screenshot it and report page errors. node probe.mjs [mode] [seconds] [out.png]
import { chromium } from 'playwright-core';
const [mode = 'cpu', secs = 8, out = 'probe.png'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
p.on('pageerror', e => console.log('PAGE ERROR', e.message));
p.on('console', m => m.type() === 'error' && console.log('console', m.text()));
await p.goto('http://localhost:8766/');
await p.waitForFunction(() => window.LAYERS && window.FIGHTERS && window.Brawl && window.Puppet && window.PHOTOG, null, { timeout: 30000 });
await p.evaluate(m => window.Brawl.start([60, 10], { mode: m }), mode);
for (let t = 0; t < +secs; t += 2) {
  await p.waitForTimeout(2000);
  console.log(await p.evaluate(() => { const S = window.Brawl.state; return S && `t=${S.t.toFixed(1)} ${S.phase} people=${S.people.length} guests=${S.guests.map(g => g.state + (g.transit ? '/' + g.transit : '') + (g.task ? ':' + g.task : '')).join(',')} photog=${S.photog && S.photog.state} P=${S.players.map(p => p.state + ':' + p.hp).join(' ')}`; }));
}
await p.screenshot({ path: out }); console.log('saved', out);
await b.close();
