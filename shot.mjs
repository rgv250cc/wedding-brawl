import { chromium } from 'playwright-core';
const [url, out, w = 1300, h = 1000] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: +w, height: +h }, colorScheme: 'dark' });
p.on('pageerror', e => console.log('PAGE ERROR', e.message));
await p.goto(url); await p.waitForFunction(() => document.title.includes('ready'), null, { timeout: 30000 });
await p.screenshot({ path: out, fullPage: true }); await b.close(); console.log('saved', out);
