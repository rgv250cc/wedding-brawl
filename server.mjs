// Self-hosted relay for the online brawl: serves the game page over HTTP and runs the "room" protocol on a WebSocket at /room (client: roomshim.js),
// so friends can play without claude.ai.  node server.mjs   env: PORT=8780  HOST=127.0.0.1  BRAWL_CODE=<access code, 8+ chars>  PING_MS=15000
// Wire (JSON text frames). client -> server: hello{peer,key} join{room,rid} leave{room} pres{room,presence} (whole state) emit{room,topic,data,rid}
// server -> client: welcome{peer,peers:[[id,presence]..]} (lobby) snap{room,rid,peers} up{room,peer,presence} (joined or changed) left{room,peer}
// emit{room,peer,topic,data} ack{rid} err{rid,code,message} hb. The lobby is room "". A hello key lets the same page take its id back from a stale socket.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

// the only files served (what the game page loads); everything else is 404. To publish another file, add its path here.
const PAGE = new Set(['/', '/index.html', '/sfx.js', '/sounds.js', '/layers.js', '/fighters.js', '/ballroom.js', '/rigs.js', '/puppet.js', '/photog.js',
  '/brawl.js', '/roomshim.js', '/lobby.js']);

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 8780, HOST = process.env.HOST || '127.0.0.1', CODE = process.env.BRAWL_CODE || '', PING = +process.env.PING_MS || 15000;
if (CODE && CODE.length < 8) { console.error('BRAWL_CODE must be at least 8 characters: it is all that keeps strangers out of the game and the photos'); process.exit(1); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.ico': 'image/x-icon' };

const sha = s => crypto.createHash('sha256').update(s).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));  // equal-length digests: constant time whatever the input
const sessions = new Map();  // random cookie token -> expiry ms, oldest first; lost on restart, then players enter the code again
const issue = () => {
  const now = Date.now(), t = crypto.randomBytes(32).toString('hex');
  for (const [k, exp] of sessions) if (exp > now) break; else sessions.delete(k);
  sessions.set(t, now + 30 * 864e5);
  return t;
};
const authed = req => !CODE || (sessions.get(/(?:^|;\s*)brawl=([^;]*)/.exec(req.headers.cookie || '')?.[1]) ?? 0) > Date.now();

const SEC = { 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const reply = (res, code, type, body, extra) => { res.writeHead(code, { ...SEC, 'Content-Type': type, 'Cache-Control': 'no-store', ...extra }); res.end(body); };
const loginPage = (res, code, msg = '', extra) => reply(res, code, 'text/html; charset=utf-8', `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Wedding Brawl</title>
<link href="https://fonts.googleapis.com/css2?family=Bungee&family=Press+Start+2P&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; height: 100%; background: #120d08; color: #fff; font-family: "Press Start 2P", ui-monospace, monospace; }
  body { display: grid; place-items: center; }
  form { width: min(86vw, 420px); display: grid; gap: 18px; text-align: center; }
  h1 { margin: 0; font: 400 clamp(30px, 9vw, 54px)/1 Bungee, Impact, sans-serif; letter-spacing: 1px; background: linear-gradient(#fffbd0, #ffd23f 55%, #ff7b00);
    -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 3px 0 #1d0d00); }
  label { font-size: 11px; color: #ffd23f; text-shadow: 2px 2px 0 #1d0d00; }
  input, button { font: inherit; font-size: 13px; padding: 14px; border: 3px solid #1d0d00; border-radius: 6px; box-sizing: border-box; width: 100%; }
  input { background: #241a10; color: #fff; text-align: center; }
  input:focus { outline: 3px solid #ffd23f; }
  button { background: #ffd23f; color: #1d0d00; cursor: pointer; box-shadow: 0 5px 0 #b8860b; }
  button:active { transform: translateY(4px); box-shadow: 0 1px 0 #b8860b; }
  .err { min-height: 1.4em; font-size: 11px; color: #ff4d3a; text-shadow: 2px 2px 0 #1d0d00; }
</style></head><body>
<form method="post" action="/login"><h1>WEDDING<br>BRAWL</h1>
<label for="code">Access code</label><input id="code" name="code" type="password" autocomplete="off" autofocus required>
<div class="err">${msg}</div><button type="submit">ENTER</button></form></body></html>`, extra);

// wrong codes per client in the current minute (client = CF-Connecting-IP, else first X-Forwarded-For hop, else the socket); oldest first, so pruning stops at the first live one
const fails = new Map();
const who = req => (req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '?').trim().slice(0, 64);
function login(req, res) {
  const now = Date.now(), key = who(req);
  for (const [k, f] of fails) if (now - f.t > 60000 || fails.size > 5000) fails.delete(k); else break;
  if ((fails.get(key)?.n ?? 0) >= 10) return loginPage(res, 429, 'TOO MANY TRIES. WAIT A MINUTE.', { 'Retry-After': '60' });
  if (!/^application\/x-www-form-urlencoded\b/i.test(req.headers['content-type'] || '')) return reply(res, 415, 'text/plain', 'form post expected');
  let body = '', big = false;
  req.setEncoding('utf8').on('data', d => {
    if (big) return;
    if ((body += d).length > 2048) { big = true; reply(res, 413, 'text/plain', 'too big', { Connection: 'close' }); }
  }).on('end', () => {
    if (big) return;
    if (!same(new URLSearchParams(body).get('code') || '', CODE)) {
      const f = fails.get(key);
      if (f) f.n++; else fails.set(key, { n: 1, t: Date.now() });
      return loginPage(res, 401, 'WRONG CODE');
    }
    fails.delete(key);
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    reply(res, 302, 'text/plain', '', { Location: '/', 'Set-Cookie': `brawl=${issue()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}` });
  });
}

const server = http.createServer((req, res) => {
  const q = req.url.indexOf('?'), params = new URLSearchParams(q < 0 ? '' : req.url.slice(q + 1));
  let p;
  try { p = decodeURIComponent(q < 0 ? req.url : req.url.slice(0, q)); } catch { return reply(res, 400, 'text/plain', 'bad request'); }
  if (p[0] !== '/' || /[\\\0]/.test(p)) return reply(res, 400, 'text/plain', 'bad request');
  const read = req.method === 'GET' || req.method === 'HEAD';
  if (p === '/login') {
    if (!CODE) return reply(res, 302, 'text/plain', '', { Location: '/' });
    if (req.method === 'POST') return login(req, res);
    if (!read) return reply(res, 405, 'text/plain', 'method not allowed', { Allow: 'GET, HEAD, POST' });
    return params.has('code') ? reply(res, 400, 'text/plain', 'the code is sent from the form, never in the URL') : loginPage(res, 200);
  }
  if (!read) return reply(res, 405, 'text/plain', 'method not allowed', { Allow: 'GET, HEAD' });
  if (!authed(req)) {
    const page = p === '/' || p.endsWith('.html') || (req.headers.accept || '').includes('text/html');
    return page ? loginPage(res, 200) : reply(res, 401, 'text/plain', 'access code needed');
  }
  if (p === '/room') return reply(res, 426, 'text/plain', 'websocket only', { Upgrade: 'websocket' });
  if (!PAGE.has(p)) return reply(res, 404, 'text/plain', 'not found');
  const file = path.join(ROOT, p === '/' ? 'index.html' : p), ext = path.extname(file);
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) return reply(res, 404, 'text/plain', 'not found');
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const head = { ...SEC, 'Content-Type': MIME[ext], 'Cache-Control': 'no-cache', ETag: etag };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); return res.end(); }
    res.writeHead(200, { ...head, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    pipeline(fs.createReadStream(file), res, () => {});  // destroys the file stream if the client goes away
  });
});

// ---- rooms ----
const NAME = /^[a-z0-9][a-z0-9_.-]{0,47}$/, TOPIC = /^[a-z][a-z0-9_.-]{0,47}$/, ID = /^[a-z0-9]{16}$/, KEY = /^[A-Za-z0-9]{8,64}$/, PKEY = /^[A-Za-z_$][\w$]*$/;
const MAX_ROOMS = 16, MAX_CONNS = 200, MAX_BUF = 1 << 20, RATE = 100, BURST = 200, A = 'abcdefghijklmnopqrstuvwxyz0123456789';  // named rooms per connection, sockets, bytes queued per socket, msg/s refill, msg burst
const rooms = new Map([['', new Map()]]);  // name -> Map(peer -> { c, pr, js })
const conns = new Map();                  // peer -> connection
const fresh = () => Array.from(crypto.randomBytes(16), b => A[b % 36]).join('');
const send = (ws, o) => {
  if (ws.readyState !== 1) return;
  if (ws.bufferedAmount > MAX_BUF) return ws.terminate();  // can't keep up: drop it, the page reconnects and re-syncs
  ws.send(typeof o === 'string' ? o : JSON.stringify(o));
};
const shut = (ws, code, why) => { ws.close(code, why); setTimeout(() => ws.terminate(), 2000).unref(); };
const list = name => [...rooms.get(name)].map(([id, m]) => [id, m.pr]);
const cast = (name, o, except) => { const s = JSON.stringify(o); for (const m of rooms.get(name).values()) if (m.c !== except) send(m.c.ws, s); };

function enter(c, name) {
  let r = rooms.get(name);
  if (!r) rooms.set(name, r = new Map());
  if (r.has(c.id)) return;
  r.set(c.id, { c, pr: {}, js: '{}' });
  c.rooms.add(name);
  cast(name, { t: 'up', room: name, peer: c.id, presence: {} }, c);
}
function exit(c, name) {
  const r = rooms.get(name);
  if (!r || !r.delete(c.id)) return;
  c.rooms.delete(name);
  if (!r.size && name) rooms.delete(name); else cast(name, { t: 'left', room: name, peer: c.id });
}
function drop(c) {
  for (const n of [...c.rooms]) exit(c, n);
  if (conns.get(c.id) === c) conns.delete(c.id);
}

function hello(c, m) {
  let id = typeof m.peer === 'string' && ID.test(m.peer) ? m.peer : '';
  const key = typeof m.key === 'string' && KEY.test(m.key) ? m.key : '', old = conns.get(id);
  if (old && key && old.key === key) { drop(old); old.ws.terminate(); }  // same page back before we noticed its old socket died
  while (!id || conns.has(id)) id = fresh();
  Object.assign(c, { id, key });
  conns.set(id, c);
  enter(c, '');
  send(c.ws, { t: 'welcome', peer: id, peers: list('') });
}

function handle(c, m) {
  const rid = typeof m.rid === 'string' && m.rid.length <= 32 ? m.rid : undefined;
  const bad = message => send(c.ws, { t: 'err', rid, code: 'invalid_argument', message });
  const name = typeof m.room === 'string' ? m.room : null, mine = name !== null && rooms.get(name)?.get(c.id);
  switch (m.t) {
    case 'join':
      if (name === null || !NAME.test(name)) return bad('bad room name');
      if (!c.rooms.has(name) && c.rooms.size > MAX_ROOMS) return bad('too many rooms');  // the lobby is not counted
      enter(c, name);
      return send(c.ws, { t: 'snap', room: name, rid, peers: list(name) });
    case 'leave':
      return name ? exit(c, name) : bad(name === '' ? 'cannot leave the lobby' : 'bad room name');
    case 'pres': {
      const pr = m.presence;
      if (!mine) return bad('not in room');
      if (!pr || typeof pr !== 'object' || Array.isArray(pr) || Object.keys(pr).some(k => !PKEY.test(k))) {
        return bad('presence must be an object with identifier keys');
      }
      const js = JSON.stringify(pr);
      if (Buffer.byteLength(js) > 4096) return bad('presence is over 4096 bytes');
      if (js !== mine.js) { mine.pr = pr; mine.js = js; cast(name, { t: 'up', room: name, peer: c.id, presence: pr }, c); }
      return;
    }
    case 'emit': {
      if (!mine) return bad('not in room');
      if (typeof m.topic !== 'string' || !TOPIC.test(m.topic)) return bad('bad topic');
      if (m.data !== undefined && Buffer.byteLength(JSON.stringify(m.data)) > 4096) return bad('data is over 4096 bytes');
      cast(name, { t: 'emit', room: name, peer: c.id, topic: m.topic, data: m.data });
      return send(c.ws, { t: 'ack', rid });
    }
    default: return bad('unknown message type');
  }
}

const wss = new WebSocketServer({ noServer: true, maxPayload: 16384 });
server.on('upgrade', (req, sock, head) => {
  sock.on('error', () => {});
  if (req.url.split('?')[0] !== '/room') return sock.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  if (!authed(req)) return sock.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  if (wss.clients.size >= MAX_CONNS) return sock.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  wss.handleUpgrade(req, sock, head, ws => wss.emit('connection', ws, req));
});
wss.on('connection', ws => {
  const c = { ws, id: '', key: '', rooms: new Set(), tokens: BURST, at: Date.now() };
  ws.seen = c.at;
  const timer = setTimeout(() => c.id || shut(ws, 1008, 'hello expected'), 5000);
  ws.on('pong', () => { ws.seen = Date.now(); });
  ws.on('error', () => {});
  ws.on('close', () => { clearTimeout(timer); drop(c); });
  ws.on('message', (raw, binary) => {
    try {
      if (ws.readyState !== 1) return;  // closing: ignore whatever is still arriving
      const now = ws.seen = Date.now();
      c.tokens = Math.min(BURST, c.tokens + (now - c.at) * RATE / 1000); c.at = now;
      if (--c.tokens < 0) return shut(ws, 1008, 'rate limit');
      let m;
      try { if (binary) throw 0; m = JSON.parse(raw); if (!m || typeof m !== 'object') throw 0; } catch { return shut(ws, 1003, 'JSON text frames only'); }
      if (c.id) handle(c, m); else if (m.t === 'hello') hello(c, m); else shut(ws, 1008, 'hello expected');
    } catch (e) { console.error('message handler:', e?.message || e); shut(ws, 1011, 'server error'); }
  });
});
setInterval(() => {
  for (const ws of wss.clients) {
    if (Date.now() - ws.seen > 2 * PING) ws.terminate();
    else { ws.ping(); send(ws, '{"t":"hb"}'); }  // the page can't see ping frames, so the hb text frame is its liveness signal
  }
}, PING).unref();

process.on('uncaughtException', e => console.error('uncaught exception (still serving):', e));
process.on('unhandledRejection', e => console.error('unhandled rejection (still serving):', e));
server.on('error', e => { console.error(`cannot listen on ${HOST}:${PORT}: ${e.message}`); process.exit(1); });
server.listen(PORT, HOST, () => {
  console.log(`wedding-brawl relay: http://localhost:${PORT}/  ${CODE ? '(access code required)' : '(NO access code: set BRAWL_CODE=... before sharing it)'}`);
  console.log(`friends can reach it through any tunnel or port-forward, e.g.  cloudflared tunnel --url http://localhost:${PORT}`);
  console.log('it listens on this machine only; HOST=0.0.0.0 opens it to the LAN');
});
