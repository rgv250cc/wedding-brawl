// Test for server.mjs + roomshim.js: starts the relay on a free port with a BRAWL_CODE, checks login (POST, session tokens, per-client limiter), the static
// allowlist, abuse limits (malformed frames, rate limit, backpressure, caps) and the room protocol through the real shim.
// Prints one line per check and exits 0 only if all pass.  node relaytest.mjs
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import './roomshim.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const { RoomShim } = globalThis;
let pass = 0, fail = 0;
const check = async (name, fn) => {
  try { await fn(); pass++; console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + ' - ' + (e?.message || JSON.stringify(e))); }
};
const must = (c, m = 'assertion failed') => { if (!c) throw new Error(m); };
const eq = (a, b, m = '') => must(a === b, `${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, ms = 3000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (fn()) return; await sleep(10); }
  throw new Error('timed out waiting for ' + (typeof what === 'function' ? what() : what));
};
const rejects = async (p, code) => { try { await p; } catch (e) { return eq(e.code, code, 'error code'); } throw new Error('did not reject'); };

const free = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)); }); });
const PORT = await free(), CODE = 'test-code-2026';
const env = { ...process.env, PORT: String(PORT), BRAWL_CODE: CODE, PING_MS: '300' };
const srv = spawn(process.execPath, ['server.mjs'], { cwd: here, env, stdio: ['ignore', 'pipe', 'inherit'] });
const done = code => { srv.kill(); process.exit(code); };
await new Promise((ok, bad) => {
  srv.stdout.on('data', d => /http:\/\/localhost:\d+/.test(String(d)) && ok());
  srv.on('exit', c => bad(new Error('server exited early: ' + c)));
  setTimeout(() => bad(new Error('server did not start')), 5000);
}).catch(e => { console.log('FAIL start - ' + e.message); done(1); });
let exited = null;
srv.on('exit', c => { exited = c; });

// the http client sends the path exactly as given, so "/../" really reaches the server
const get = (p, headers = {}, method = 'GET', body) => new Promise((res, rej) => {
  http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers }, r => {
    let text = '';
    r.setEncoding('utf8').on('data', d => { text += d; }).on('end', () => res({ status: r.statusCode, headers: r.headers, body: text }));
  }).on('error', rej).end(body);
});
const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };
const login = (code, headers = {}) => get('/login', { ...FORM, ...headers }, 'POST', 'code=' + encodeURIComponent(code));
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const first = await login(CODE), COOKIE = String(first.headers['set-cookie']).split(';')[0];
const page = { Accept: 'text/html' }, authed = { Cookie: COOKIE };

// ---- http ----
await check('a BRAWL_CODE under 8 characters stops the server at start with a clear error; exactly 8 starts', async () => {
  const boot = async code => {
    const p = spawn(process.execPath, ['server.mjs'], { cwd: here, env: { ...env, PORT: String(await free()), BRAWL_CODE: code }, stdio: ['ignore', 'pipe', 'pipe'] });
    return new Promise(res => { let err = ''; p.stderr.on('data', d => { err += d; }); p.stdout.once('data', () => { p.kill(); res({ started: true }); }); p.on('exit', c => res({ started: false, code: c, err })); });
  };
  const short = await boot('1234567'), ok = await boot('12345678');
  eq(short.started, false); eq(short.code, 1); must(/at least 8 characters/.test(short.err), 'error text: ' + short.err); eq(ok.started, true);
});
await check('"/" without the cookie shows the login page, a POST form', async () => {
  const r = await get('/', page);
  eq(r.status, 200); must(r.body.includes('Access code') && r.body.includes('action="/login"'), 'no login form');
  must(r.body.includes('method="post"') && !r.body.includes('method="get"'), 'form is not a POST form'); must(!r.body.includes('sfx.js'), 'served the game');
});
await check('the code never travels in the URL: GET /login?code=... is refused with no cookie, right code or wrong', async () => {
  for (const code of [CODE, 'wrong']) {
    const r = await get('/login?code=' + code); eq(r.status, 400); must(!r.headers['set-cookie'], 'cookie set'); must(!r.body.includes('Access code'), 'showed the form');
  }
  const r = await get('/login'); eq(r.status, 200); must(r.body.includes('method="post"'), 'plain GET /login shows the form');
  eq((await get('/login', authed, 'PUT')).status, 405);
});
await check('POST /login with a wrong code: 401, no cookie, error text', async () => {
  const r = await login('wrong');
  eq(r.status, 401); must(!r.headers['set-cookie'], 'cookie set'); must(r.body.includes('WRONG CODE'), 'no error text');
});
await check('POST /login with the right code: 302 to "/", cookie is a random 32-byte hex session token, not derived from the code', async () => {
  const c = String(first.headers['set-cookie']);
  eq(first.status, 302); eq(first.headers.location, '/'); must(/^brawl=[0-9a-f]{64};/.test(c), 'cookie shape: ' + c);
  for (const f of ['HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=2592000']) must(c.includes(f), 'missing ' + f);
  must(COOKIE !== 'brawl=' + sha256(CODE), 'cookie is sha256(code)');
  const again = String((await login(CODE)).headers['set-cookie']).split(';')[0]; must(again !== COOKIE, 'two logins gave the same token');
  must(String((await login(CODE, { 'X-Forwarded-Proto': 'https' })).headers['set-cookie']).includes('; Secure'), 'no Secure flag behind https'); must(!c.includes('Secure'), 'Secure over plain http');
});
await check('forged cookies are refused: sha256(code) (the old scheme), zeros, empty, object keys', async () => {
  for (const v of [sha256(CODE), '0'.repeat(64), '', '__proto__', 'constructor', 'hasOwnProperty']) eq((await get('/sfx.js', { Cookie: 'brawl=' + v })).status, 401, v);
});
await check('login body: over 2 KB is 413 (even if it starts with the right code), not a form is 415, other methods 405', async () => {
  for (const body of ['code=' + 'x'.repeat(3000), 'code=' + encodeURIComponent(CODE) + '&pad=' + 'y'.repeat(2100)]) {
    const r = await get('/login', FORM, 'POST', body); eq(r.status, 413); must(!r.headers['set-cookie'], 'cookie set');
  }
  eq((await get('/login', { 'Content-Type': 'application/json' }, 'POST', JSON.stringify({ code: CODE }))).status, 415);
  eq((await get('/login', FORM, 'POST', 'code=' + encodeURIComponent(CODE) + '&pad=' + 'y'.repeat(1900))).status, 302, 'a body under 2 KB is fine');
});
await check('login limiter is per client: 10 failures lock only that client (key: CF-Connecting-IP, else first X-Forwarded-For hop, else the socket)', async () => {
  const cf = ip => ({ 'CF-Connecting-IP': ip }), xf = h => ({ 'X-Forwarded-For': h });
  for (let i = 0; i < 10; i++) eq((await login('nope' + i, cf('198.51.100.1'))).status, 401, 'failure ' + i);
  const locked = await login('nope', cf('198.51.100.1'));
  eq(locked.status, 429); eq(locked.headers['retry-after'], '60'); must(locked.body.includes('TOO MANY'), 'no message');
  const right = await login(CODE, cf('198.51.100.1')); eq(right.status, 429, 'right code while locked'); must(!right.headers['set-cookie'], 'cookie set while locked');
  eq((await login(CODE, cf('198.51.100.2'))).status, 302, 'another client is not locked out');
  eq((await login('nope')).status, 401, 'the socket-address client is not locked out');
  for (let i = 0; i < 10; i++) eq((await login('nope', xf('198.51.100.3, 10.0.0.' + i))).status, 401, 'xff failure ' + i);
  eq((await login('nope', xf('198.51.100.3, 10.9.9.9'))).status, 429, 'same first hop is the same client');
  eq((await login('nope', xf('198.51.100.4, 10.0.0.1'))).status, 401, 'another first hop is another client');
  eq((await login('nope', { ...cf('198.51.100.6'), ...xf('198.51.100.3') })).status, 401, 'CF-Connecting-IP wins over X-Forwarded-For');
  eq((await login('nope', { ...cf('198.51.100.1'), ...xf('198.51.100.7') })).status, 429, 'CF-Connecting-IP is the key when both are sent');
  eq((await get('/sfx.js', { Cookie: COOKIE, ...cf('198.51.100.1') })).status, 200, 'a locked client keeps its session');
});
await check('a static .js file needs the cookie (none or a wrong one gives 401)', async () => {
  eq((await get('/sfx.js')).status, 401); eq((await get('/sfx.js', { Cookie: 'brawl=' + '0'.repeat(64) })).status, 401);
  const r = await get('/sfx.js', authed);
  eq(r.status, 200); must(r.headers['content-type'].startsWith('text/javascript'), 'mime ' + r.headers['content-type']);
  eq(r.headers['cache-control'], 'no-cache');
});
await check('"/" with the cookie serves index.html, HEAD has no body, a matching ETag gives 304', async () => {
  const r = await get('/', { ...authed, ...page });
  eq(r.status, 200); must(r.headers['content-type'].startsWith('text/html') && !r.body.includes('Access code'), 'not index.html');
  const h = await get('/sfx.js', authed, 'HEAD'); eq(h.status, 200); eq(h.body, '');
  eq((await get('/sfx.js', { ...authed, 'If-None-Match': h.headers.etag })).status, 304);
});
const SERVED = ['/', '/index.html', '/sfx.js', '/sounds.js', '/layers.js', '/fighters.js', '/ballroom.js', '/rigs.js', '/puppet.js', '/photog.js', '/brawl.js', '/roomshim.js', '/lobby.js'];
await check('the allowlist serves the game: every listed file, and every <script src> index.html loads (HEAD, nothing big is downloaded)', async () => {
  for (const p of SERVED) { const r = await get(p, authed, 'HEAD'); eq(r.status, 200, p); must(/^text\/(html|javascript)/.test(r.headers['content-type']), p + ' mime'); }
  const html = (await get('/', authed)).body, srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]);
  must(srcs.length >= 10, 'found only ' + srcs.length + ' scripts');
  for (const s of srcs) { must(!/^(https?:)?\/\//.test(s), 'external script ' + s); eq((await get('/' + s, authed, 'HEAD')).status, 200, '/' + s); }
});
const GONE = ['/wedding.webp', '/puppets.html', '/moshik.jpg', '/MOSHIK.JPG', '/audio.wav', '/frames.mp4', '/keytest.mjs', '/lobbytest.mjs', '/nettest.mjs', '/server.mjs', '/relaytest.mjs',
  '/.git/config', '/.gitignore', '/package.json', '/package-lock.json', '/node_modules/ws/package.json', '/make_layers.py', '/build.sh', '/README.md', '/takes/', '/sound-packs/',
  '/brawl-take4.mp4', '/out/x.png', '/favicon.ico', '/SFX.JS', '/Index.html', '/sfx.js/', '/index.html/', '/./sfx.js', '/%2e/sfx.js', '/a/../sfx.js', '/wedding.webp?/sfx.js',
  '/../server.mjs', '/%2e%2e/server.mjs', '/..%2fserver.mjs', '/a/../../server.mjs'];
for (const p of GONE) await check(`refuses ${JSON.stringify(p)} with 404, even with the cookie`, async () => eq((await get(p, authed)).status, 404));
for (const p of ['/%00.js', '/..\\server.mjs', '/%zz']) await check(`rejects the malformed ${JSON.stringify(p)} with 400`, async () => eq((await get(p, authed)).status, 400));
await check('without the cookie the private photo and dev pages give 401 / the login page, never content', async () => {
  eq((await get('/wedding.webp')).status, 401); must((await get('/wedding.webp', page)).body.includes('Access code'), 'html clients get the login page');
  must((await get('/puppets.html')).body.includes('Access code'), 'puppets.html without a cookie');
});
await check('POST is refused (405)', async () => eq((await get('/', authed, 'POST')).status, 405));
await check('aborted downloads do not leak file descriptors', async () => {
  const fds = () => execFileSync('lsof', ['-p', String(srv.pid), '-Fn'], { encoding: 'utf8' }).split('\n').length;
  const abort = () => new Promise(res => { const q = http.get({ host: '127.0.0.1', port: PORT, path: '/fighters.js', headers: authed }, r => { r.pause(); setTimeout(() => { q.destroy(); res(); }, 40); }); q.on('error', () => {}); });
  await abort(); await sleep(200);
  let before; try { before = fds(); } catch { return console.log('     (lsof not available, descriptor count not checked)'); }
  await Promise.all(Array.from({ length: 40 }, abort)); await sleep(500);
  const grew = fds() - before; must(grew < 8, `${grew} descriptors still open after 40 aborted downloads`);
});

// ---- rooms through the shim ----
const WS_URL = `ws://127.0.0.1:${PORT}/room`;
const client = async (cookie = COOKIE) => {
  const socks = [];
  class W extends WebSocket { constructor(...a) { super(...a); socks.push(this); } }
  const room = await RoomShim.connect(WS_URL, { WebSocket: W, headers: cookie ? { Cookie: cookie } : {} });
  return { room, socks, conn: [], log: [] };
};
const me = r => r.peers().find(p => p.isMe);
const find = (r, id) => r.peers().find(p => p.peer === id);
let A, B, C, roomA, roomB;

await check('two shim clients connect with the cookie and see each other', async () => {
  A = await client(); B = await client();
  eq(A.room.connected(), true); eq(B.room.connected(), true);
  must(/^[a-z0-9]{16}$/.test(me(A.room).peer), 'peer id shape'); must(me(A.room).peer !== me(B.room).peer, 'same id');
  await until(() => A.room.peers().length === 2 && B.room.peers().length === 2, 'both peers listed');
  const p = me(A.room); eq(p.by, null); eq(p.kind, 'viewer'); eq(p.guest, false); eq(p.sameTab, true); must(Object.isFrozen(p) && Object.isFrozen(p.presence), 'not frozen');
  eq(A.room.peers().filter(x => x.isMe).length, 1); must(Date.now() - p.updatedAt < 5000, 'updatedAt');
});
await check('onPeers: first delivery is async and lists everyone as joined', async () => {
  const got = [];
  A.room.onPeers(d => got.push(d)); A.room.onPeers(d => A.log.push(d));
  eq(got.length, 0, 'delivered synchronously');
  await Promise.resolve();
  eq(got.length, 1); eq(got[0].joined.length, 2); eq(got[0].left.length, 0); eq(got[0].peers, A.room.peers());
  B.room.onPeers(d => B.log.push(d));
});
await check('lobby presence: my own entry shows at once, the other client sees it', async () => {
  const pr = A.room.presence({ name: 'ann', x: 1 });
  eq(me(A.room).presence.x, 1, 'own entry');
  await pr;
  await until(() => find(B.room, me(A.room).peer)?.presence.x === 1, 'B sees A');
  eq(find(B.room, me(A.room).peer).presence.name, 'ann');
  await until(() => B.log.some(d => d.updated.some(p => p.peer === me(A.room).peer && p.presence.x === 1)), 'an updated delta for A');
});
await check('peers() is the same array until a change; untouched peers keep their identity', async () => {
  const s1 = B.room.peers(); eq(B.room.peers(), s1); must(Object.isFrozen(s1), 'not frozen');
  const bSelf = me(B.room);
  await A.room.presence({ y: 2 });
  await until(() => B.room.peers() !== s1, 'new snapshot');
  eq(me(B.room), bSelf, 'B entry identity'); must(find(B.room, me(A.room).peer) !== s1.find(p => p.peer === me(A.room).peer), 'A entry should be new');
});
await check('presence is a shallow merge and null deletes a key', async () => {
  await A.room.presence({ x: null });
  await until(() => !('x' in find(B.room, me(A.room).peer).presence), 'x gone');
  eq(find(B.room, me(A.room).peer).presence.y, 2); eq(find(B.room, me(A.room).peer).presence.name, 'ann');
});
await check('presence over 4096 bytes is rejected, exactly 4096 is fine, nothing changes on reject', async () => {
  await A.room.presence({ name: null, y: null });
  await A.room.presence({ p: 'x'.repeat(4088) });
  await rejects(A.room.presence({ p: 'x'.repeat(4089) }), 'invalid_argument');
  eq(me(A.room).presence.p.length, 4088); await rejects(A.room.presence({ q: 1 }), 'invalid_argument');
  await A.room.presence({ p: null, name: 'ann' });
  await rejects(A.room.presence({ 'bad key': 1 }), 'invalid_argument'); await rejects(A.room.presence('x'), 'invalid_argument');
});
await check('the server enforces the limits itself (oversize presence -> err, oversize frame -> close)', async () => {
  const ws = new WebSocket(WS_URL, { headers: { Cookie: COOKIE } }), got = [];
  ws.on('message', d => got.push(JSON.parse(d)));
  await new Promise(r => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'hello', peer: 'r' + 'a'.repeat(15), key: 'rawkeyrawkey' }));
  await until(() => got.some(m => m.t === 'welcome'), 'welcome');
  ws.send(JSON.stringify({ t: 'pres', room: '', presence: { p: 'x'.repeat(5000) }, rid: '9' }));
  await until(() => got.some(m => m.t === 'err' && m.code === 'invalid_argument'), 'err reply');
  ws.send(JSON.stringify({ t: 'emit', room: 'no-such', topic: 'hit', rid: '10' }));
  await until(() => got.some(m => m.t === 'err' && m.rid === '10'), 'err for a room we are not in');
  const closed = new Promise(r => ws.on('close', c => r(c)));
  ws.send(JSON.stringify({ t: 'emit', room: '', topic: 'hit', data: 'x'.repeat(17000) }));
  eq(await closed, 1009);
});
await check('both join "m-test1"; joining twice gives the same object; presence is per room', async () => {
  roomA = await A.room.join('m-test1'); roomB = await B.room.join('m-test1');
  eq(await A.room.join('m-test1'), roomA); eq(roomA.name, 'm-test1'); eq(typeof roomA.leave, 'function');
  await until(() => roomA.peers().length === 2 && roomB.peers().length === 2, 'both in room');
  await roomA.presence({ score: 5 });
  await until(() => find(roomB, me(A.room).peer)?.presence.score === 5, 'B sees room presence');
  eq(Object.keys(find(roomB, me(A.room).peer).presence).join(), 'score', 'room presence only has score');
  must(!('score' in find(B.room, me(A.room).peer).presence), 'room presence leaked into the lobby');
  must(!('name' in me(roomA).presence), 'lobby presence leaked into the room');
});
await check('a client outside the room does not see the room; both see the lobby', async () => {
  C = await client();
  await until(() => C.room.peers().length === 3 && A.room.peers().length === 3, 'three in lobby');
  eq(roomA.peers().length, 2);
});
await check('emit is echoed to everyone in the room and only there', async () => {
  const a = [], b = [], lob = [];
  roomA.on('hit', m => a.push(m)); roomB.on('hit', m => b.push(m)); C.room.on('hit', m => lob.push(m)); A.room.on('hit', m => lob.push(m));
  await roomA.emit('hit', { n: 1 });
  await until(() => a.length === 1 && b.length === 1, 'both got it');
  eq(a[0].isMe, true); eq(b[0].isMe, false); eq(b[0].peer, me(A.room).peer); eq(b[0].topic, 'hit'); eq(b[0].data.n, 1);
  eq(b[0].kind, 'viewer'); eq(b[0].by, null);
  await sleep(100); eq(lob.length, 0, 'leaked to the lobby');
  const off = roomB.on('hit', () => b.push('x')); off();
  await roomA.emit('hit', { n: 2 }); await until(() => a.length === 2, 'second'); await sleep(50); eq(b.length, 2, 'off() handler still called');
});
await check('bad names, topics and handlers are refused', async () => {
  await rejects(A.room.join('Bad Name'), 'invalid_argument'); await rejects(A.room.join(''), 'invalid_argument');
  await rejects(roomA.emit('Bad Topic', 1), 'invalid_argument'); await rejects(roomA.emit('hit', 'x'.repeat(5000)), 'invalid_argument');
  let t = null; try { roomA.on('hit', 5); } catch (e) { t = e; } must(t instanceof TypeError, 'on(non-function) should throw TypeError');
  t = null; try { A.room.onPeers(); } catch (e) { t = e; } must(t instanceof TypeError, 'onPeers(non-function) should throw TypeError');
});
await check('leave(): the others see the peer go, later calls reject, the lobby stays', async () => {
  const rc = await C.room.join('m-test1');
  await until(() => roomA.peers().length === 3, 'C in room');
  const gone = []; roomA.onPeers(d => d.left.forEach(p => gone.push(p.peer)));
  await rc.leave();
  await until(() => gone.includes(me(C.room).peer), 'left delta'); eq(roomA.peers().length, 2);
  for (const p of [rc.presence({ a: 1 }), rc.emit('hit', 1), rc.leave()]) await rejects(p, 'invalid_argument');
  eq(C.room.connected(), true); eq(find(A.room, me(C.room).peer)?.peer, me(C.room).peer);
});
await check('a client that disconnects shows up in the others\' onPeers().left (lobby and room)', async () => {
  const id = me(B.room).peer, lobbyLeft = [], roomLeft = [];
  A.room.onPeers(d => d.left.forEach(p => lobbyLeft.push(p.peer))); roomA.onPeers(d => d.left.forEach(p => roomLeft.push(p.peer)));
  B.room.close();
  await until(() => lobbyLeft.includes(id) && roomLeft.includes(id), 'left deltas');
  must(!find(A.room, id) && !find(roomA, id), 'still listed'); eq(B.room.connected(), false);
  must(A.log.some(d => d.left.some(p => p.peer === id)), 'logging handler missed it');
});
await check('reconnect: same peer id, connected() false meanwhile, presence and rooms re-asserted', async () => {
  const D = await client(), id = me(D.room).peer, rd = await D.room.join('m-test2'), ra = await A.room.join('m-test2');
  D.room.onConnection(v => D.conn.push(v));
  await D.room.presence({ keep: 1 }); await rd.presence({ lvl: 3 });
  await until(() => find(A.room, id)?.presence.keep === 1 && find(ra, id)?.presence.lvl === 3, 'A sees D');
  const seen = [];  // starts with 'joined': the initial delivery lists D
  A.room.onPeers(d => d.left.concat(d.joined).forEach(p => p.peer === id && seen.push(d.left.includes(p) ? 'left' : 'joined')));
  D.socks.at(-1).terminate();
  await until(() => D.conn.join() === 'true,false,true', 'onConnection true,false,true', 6000);
  eq(me(D.room).peer, id, 'peer id changed'); eq(D.room.connected(), true);
  await until(() => seen.join() === 'joined,left,joined', () => 'A saw D leave and come back (' + seen + ')');
  await until(() => find(A.room, id)?.presence.keep === 1 && find(ra, id)?.presence.lvl === 3, 'presence re-asserted');
  await roomA.emit('hit', 1); await rd.emit('hit', 2);
  D.room.close();
});
await check('hello: an unused proposed id is kept, a same-key hello takes it over, another key gets a fresh id', async () => {
  const hello = async (peer, key) => {
    const ws = new WebSocket(WS_URL, { headers: { Cookie: COOKIE } }); let w;
    ws.on('message', d => { const m = JSON.parse(d); if (m.t === 'welcome') w = m; });
    ws.closed = new Promise(r => ws.on('close', r));
    await new Promise(r => ws.on('open', r)); ws.send(JSON.stringify({ t: 'hello', peer, key }));
    await until(() => w, 'welcome'); ws.peer = w.peer; return ws;
  };
  const id = 'takeover' + 'x'.repeat(8), one = await hello(id, 'samekey1234');
  eq(one.peer, id); const two = await hello(id, 'samekey1234');
  eq(two.peer, id, 'takeover keeps id'); await one.closed;
  const three = await hello(id, 'otherkey1234'); must(three.peer !== id && /^[a-z0-9]{16}$/.test(three.peer), 'should get a fresh id');
  const four = await hello('NOT VALID', 'abcdefgh'); must(/^[a-z0-9]{16}$/.test(four.peer), 'invalid id replaced');
  [two, three, four].forEach(w => w.close());
});
await check('heartbeat: a socket that never answers pings is dropped, answering clients stay', async () => {
  const ws = new WebSocket(WS_URL, { headers: { Cookie: COOKIE }, autoPong: false }); let hb = 0;
  ws.on('message', d => { if (JSON.parse(d).t === 'hb') hb++; });
  const closed = new Promise(r => ws.on('close', r));
  await new Promise(r => ws.on('open', r)); ws.send(JSON.stringify({ t: 'hello', peer: 'silent' + 'x'.repeat(10), key: 'silentkey123' }));
  await Promise.race([closed, sleep(3000).then(() => { throw new Error('not dropped within 3 s'); })]);
  must(hb >= 1, 'no hb frames'); eq(A.room.connected(), true); eq(C.room.connected(), true);
});
// raw sockets for the abuse checks
const raw = async (cookie = COOKIE) => {
  const ws = new WebSocket(WS_URL, { headers: { Cookie: cookie } });
  ws.got = []; ws.on('message', d => ws.got.push(JSON.parse(d))); ws.on('error', () => {});
  ws.closed = new Promise(r => ws.on('close', (code, why) => r({ code, why: String(why) })));
  ws.json = o => ws.send(JSON.stringify(o));
  await new Promise(r => ws.on('open', r));
  return ws;
};
const rawHello = async (peerJs = '""', keyJs = '""') => {  // peer and key are JSON text, so a 7000-deep value is sent as is (JSON.stringify in the test would overflow too)
  const ws = await raw(); ws.send(`{"t":"hello","peer":${peerJs},"key":${keyJs}}`);
  await until(() => ws.got.some(m => m.t === 'welcome'), 'welcome'); ws.peer = ws.got.find(m => m.t === 'welcome').peer;
  return ws;
};
const D = '['.repeat(7000) + ']'.repeat(7000);  // 14 KB, inside the 16 KB frame limit; as a "peer" it overflows the stack in RegExp.test

await check('malformed hello fields (deeply nested arrays, numbers, objects, null) do not crash the server: the peer just gets a fresh id', async () => {
  const mine = 'z'.repeat(16);
  for (const [peer, key] of [[D, '"abcdefgh"'], [`"${mine}"`, D], [D, '5'], ['5', '{}'], ['null', 'true'], ['{"toString":1}', '[1]'], [`["${mine}"]`, `["${mine}"]`], [`"${mine}"`, '"abcdefgh"']]) {
    const ws = await rawHello(peer, key);
    must(/^[a-z0-9]{16}$/.test(ws.peer), 'peer id shape ' + ws.peer); if (peer === `"${mine}"`) eq(ws.peer, mine, 'a valid id is kept'); else must(ws.peer !== mine, 'array taken for an id');
    eq(ws.readyState, 1); ws.close();
  }
  eq(exited, null, 'server exited'); eq((await get('/sfx.js', authed, 'HEAD')).status, 200, 'still serving');
});
await check('malformed fields after hello get an err and the socket stays open; rid is echoed only when it is a short string', async () => {
  const ws = await rawHello();
  const bad = [`"t":"join","room":${D}`, '"t":"join","room":5', '"t":"join","room":null', '"t":"join","room":[]', '"t":"leave","room":{}', '"t":"leave","room":""',
    '"t":"pres","room":[],"presence":{}', `"t":"pres","room":"","presence":${D}`, `"t":"emit","room":"","topic":${D}`, '"t":"emit","room":"","topic":["hit"]',
    `"t":"emit","room":${D},"topic":"hit"`, `"t":${D}`, '"t":["hello"]', '"t":"hello","peer":"x"', '"room":""'];
  bad.forEach((b, i) => ws.send(`{"rid":"r${i}",${b}}`));
  await until(() => ws.got.filter(m => m.t === 'err').length === bad.length, () => `only ${ws.got.filter(m => m.t === 'err').length} err replies`);
  ws.got.filter(m => m.t === 'err').forEach((m, i) => { eq(m.code, 'invalid_argument'); eq(m.rid, 'r' + i, 'rid'); });
  ws.got.length = 0;
  for (const rid of [{ a: 1 }, ['x'], 7, 'x'.repeat(5000), null]) ws.json({ t: 'nop', rid });
  await until(() => ws.got.length === 5, 'five err replies'); must(ws.got.every(m => m.t === 'err' && !('rid' in m)), 'rid echoed: ' + JSON.stringify(ws.got[0]));
  ws.json({ t: 'emit', room: '', topic: 'hit', rid: 'ok' }); await until(() => ws.got.some(m => m.t === 'ack' && m.rid === 'ok'), 'ack');
  eq(ws.readyState, 1); eq(exited, null, 'server exited'); ws.close();
});
await check('non-JSON, non-object and binary frames close with 1003, and the others are not disturbed', async () => {
  for (const frame of ['not json', '5', 'null', Buffer.from('{"t":"hello"}')]) {
    const ws = await raw(); ws.send(frame); const c = await Promise.race([ws.closed, sleep(2000).then(() => ({ code: 'timeout' }))]); eq(c.code, 1003, JSON.stringify(String(frame)));
  }
  eq(A.room.connected(), true);
});
await check('rate limit: a burst of 150 is fine, tokens refill, a flood is closed with 1008 and other clients are unaffected', async () => {
  const ws = await rawHello(), burst = n => { for (let i = 0; i < n; i++) ws.json({ t: 'nop', rid: 'b' + i }); };
  burst(150); await until(() => ws.got.filter(m => m.t === 'err').length === 150, 'burst answered');
  await sleep(1200); burst(150);  // 50 left + 1.2 s x 100/s refill: 150 more is fine though the total is over the burst size
  await until(() => ws.got.filter(m => m.t === 'err').length === 300, 'second burst answered'); eq(ws.readyState, 1); ws.close();
  const flood = await rawHello();
  for (let i = 0; i < 600; i++) flood.json({ t: 'nop', rid: 'f' + i });
  const c = await Promise.race([flood.closed, sleep(5000).then(() => ({ code: 'timeout' }))]);
  eq(c.code, 1008); eq(c.why, 'rate limit'); eq(A.room.connected(), true); eq(exited, null, 'server exited');
  must(flood.got.filter(m => m.t === 'err').length < 400, 'answered the whole flood');
});
await check('a connection can join 16 named rooms; the 17th is refused with "too many rooms", leaving makes room, the lobby is not counted', async () => {
  const X = await client(), rooms = [];
  for (let i = 0; i < 16; i++) rooms.push(await X.room.join('cap' + i));
  let e; try { await X.room.join('cap16'); } catch (x) { e = x; }
  eq(e?.code, 'invalid_argument'); eq(e?.message, 'too many rooms'); eq(await X.room.join('cap3'), rooms[3], 'rejoining a held room still works');
  await rooms[0].leave(); await X.room.join('cap16'); X.room.close();
});
await check('backpressure: a peer that stops reading is dropped once 1 MB is queued for it; the others keep working', async () => {
  const slow = await rawHello(); slow.json({ t: 'join', room: 'm-slow', rid: 's' });
  await until(() => slow.got.some(m => m.t === 'snap'), 'slow joined');
  slow._socket.pause();  // stops reading; it keeps sending, so the heartbeat timer does not drop it, only the queue can
  const nap = setInterval(() => slow.json({ t: 'nop' }), 100);
  const fast = [];
  for (let i = 0; i < 8; i++) { const w = await rawHello(); w.json({ t: 'join', room: 'm-slow', rid: 'j' }); fast.push(w); }
  await until(() => fast.every(w => w.got.some(m => m.t === 'snap')), 'senders joined');
  const data = 'x'.repeat(3900), t0 = Date.now(), gone = () => fast[0].got.some(m => m.t === 'left' && m.peer === slow.peer);
  try {
    while (!gone() && Date.now() - t0 < 25000) { for (const w of fast) for (let i = 0; i < 60; i++) w.json({ t: 'emit', room: 'm-slow', topic: 'hit', data }); await sleep(700); }
    must(gone(), 'not dropped within 25 s');
  } finally { clearInterval(nap); }
  eq(exited, null, 'server exited'); eq(fast[0].readyState, 1);
  fast[1].json({ t: 'emit', room: 'm-slow', topic: 'hit', rid: 'after' }); await until(() => fast[1].got.some(m => m.t === 'ack' && m.rid === 'after'), 'others still served');
  slow._socket.resume(); const c = await Promise.race([slow.closed, sleep(3000).then(() => ({ code: 'timeout' }))]); must(c.code !== 'timeout', 'slow socket still open');
  fast.forEach(w => w.close());
});
await check('connection cap: sockets beyond 200 are refused with 503, and the room frees up when they close', async () => {
  const open = () => new Promise(res => {
    const ws = new WebSocket(WS_URL, { headers: { Cookie: COOKIE } });
    ws.on('error', () => {}); ws.on('open', () => res({ ws })); ws.on('unexpected-response', (_, r) => { r.resume(); res({ status: r.statusCode }); });
  });
  await sleep(500);  // let the sockets of the earlier checks finish closing: only the two shim clients are left
  const tries = await Promise.all(Array.from({ length: 230 }, open)), ok = tries.filter(t => t.ws), no = tries.filter(t => t.status);
  must(no.length >= 30 && no.every(t => t.status === 503), `refused ${no.length}: ${[...new Set(no.map(t => t.status))]}`); must(ok.length <= 200 && ok.length >= 195, 'accepted ' + ok.length);
  ok.forEach(t => t.ws.close());
  for (let i = 0; ; i++) { const t = await open(); if (t.ws) { t.ws.close(); break; } must(i < 100, 'still full 5 s after they closed'); await sleep(50); }
});
await check('the server process survived all of the above and still serves', async () => {
  eq(exited, null, 'server exited'); eq((await get('/', { ...authed, ...page })).status, 200); eq(A.room.connected(), true);
});
await check('no cookie, or a wrong one, gives not_granted', async () => {
  await rejects(client(null), 'not_granted'); await rejects(client('brawl=' + '1'.repeat(64)), 'not_granted'); await rejects(client('brawl=' + sha256(CODE)), 'not_granted');
});
await check('nothing listening gives upstream_error', async () => rejects(RoomShim.connect(`ws://127.0.0.1:${await free()}/room`, { WebSocket }), 'upstream_error'));
await check('a server that never answers gives upstream_error after about 5 s', async () => {
  const mute = net.createServer(s => s.on('error', () => {})).listen(0, '127.0.0.1'); await new Promise(r => mute.on('listening', r));
  const t = Date.now();
  await rejects(RoomShim.connect(`ws://127.0.0.1:${mute.address().port}/room`, { WebSocket }), 'upstream_error');
  const ms = Date.now() - t; must(ms > 4500 && ms < 6500, `took ${ms} ms`); mute.close(); mute.closeAllConnections?.();
});

console.log(`${pass} passed, ${fail} failed`);
done(fail ? 1 : 0);
