// Wedding Brawl on Cloudflare Workers. The game files come from the static assets (deploy/build.sh); /room is server.mjs's relay, the same JSON
// protocol (client: roomshim.js), run by ONE Durable Object that holds every room in memory. Public: no access code.
// Plain accept() rather than hibernation: a socket's presence can be 4 KB, over the 2 KB hibernation attachment limit.
import { DurableObject } from 'cloudflare:workers';

const SEC = { 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const text = (status, body, extra) => new Response(body, { status, headers: { ...SEC, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });

export default {
  async fetch(req, env) {
    if (new URL(req.url).pathname === '/room') {
      if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return text(426, 'websocket only', { Upgrade: 'websocket' });
      return env.RELAY.get(env.RELAY.idFromName('relay')).fetch(req);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return text(405, 'method not allowed', { Allow: 'GET, HEAD' });
    const res = await env.ASSETS.fetch(req), out = new Response(res.body, res);  // static files get SEC from public/_headers; this covers the rest
    for (const [k, v] of Object.entries(SEC)) out.headers.set(k, v);
    return out;
  },
};

const NAME = /^[a-z0-9][a-z0-9_.-]{0,47}$/, TOPIC = /^[a-z][a-z0-9_.-]{0,47}$/, ID = /^[a-z0-9]{16}$/, KEY = /^[A-Za-z0-9]{8,64}$/, PKEY = /^[A-Za-z_$][\w$]*$/;
const MAX_ROOMS = 16, MAX_CONNS = 300, MAX_MSG = 16384, RATE = 100, BURST = 200, PING = 15000, A = 'abcdefghijklmnopqrstuvwxyz0123456789';
const enc = new TextEncoder(), bytes = s => enc.encode(s).length;
const fresh = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => A[b % 36]).join('');
const send = (c, o) => { if (!c.dead) try { c.ws.send(typeof o === 'string' ? o : JSON.stringify(o)); } catch { /* closing: its close event cleans up */ } };

export class Relay extends DurableObject {
  rooms = new Map([['', new Map()]]);  // name -> Map(peer -> { c, pr, js }); the lobby is ""
  conns = new Map();                   // peer -> connection
  socks = new Set();                   // every open connection, welcomed or not
  timer = 0;

  fetch() {
    if (this.socks.size >= MAX_CONNS) return text(503, 'the game is full, try again in a minute');
    const [client, ws] = Object.values(new WebSocketPair());
    ws.accept();
    const c = { ws, id: '', key: '', rooms: new Set(), tokens: BURST, at: Date.now(), dead: false };
    c.wait = setTimeout(() => c.id || this.drop(c, 1008, 'hello expected'), 5000);
    this.socks.add(c);
    ws.addEventListener('message', e => this.message(c, e.data));
    ws.addEventListener('close', () => this.drop(c));
    ws.addEventListener('error', () => this.drop(c));
    this.timer ||= setInterval(() => { for (const s of this.socks) send(s, '{"t":"hb"}'); }, PING);  // the page's liveness signal
    return new Response(null, { status: 101, webSocket: client });
  }

  drop(c, code = 1000, why = '') {
    if (c.dead) return;
    c.dead = true;
    clearTimeout(c.wait);
    this.socks.delete(c);
    for (const n of [...c.rooms]) this.exit(c, n);
    if (this.conns.get(c.id) === c) this.conns.delete(c.id);
    try { c.ws.close(code, why); } catch { /* already closed */ }
    if (!this.socks.size) { clearInterval(this.timer); this.timer = 0; }
  }

  list(name) { return [...this.rooms.get(name)].map(([id, m]) => [id, m.pr]); }
  cast(name, o, except) { const s = JSON.stringify(o); for (const m of this.rooms.get(name).values()) if (m.c !== except) send(m.c, s); }

  enter(c, name) {
    let r = this.rooms.get(name);
    if (!r) this.rooms.set(name, r = new Map());
    if (r.has(c.id)) return;
    r.set(c.id, { c, pr: {}, js: '{}' });
    c.rooms.add(name);
    this.cast(name, { t: 'up', room: name, peer: c.id, presence: {} }, c);
  }
  exit(c, name) {
    const r = this.rooms.get(name);
    if (!r || !r.delete(c.id)) return;
    c.rooms.delete(name);
    if (!r.size && name) this.rooms.delete(name); else this.cast(name, { t: 'left', room: name, peer: c.id });
  }

  hello(c, m) {
    let id = typeof m.peer === 'string' && ID.test(m.peer) ? m.peer : '';
    const key = typeof m.key === 'string' && KEY.test(m.key) ? m.key : '', old = this.conns.get(id);
    if (old && key && old.key === key) this.drop(old, 1000, 'replaced');  // same page back before we noticed its old socket died
    while (!id || this.conns.has(id)) id = fresh();
    Object.assign(c, { id, key });
    this.conns.set(id, c);
    this.enter(c, '');
    send(c, { t: 'welcome', peer: id, peers: this.list('') });
  }

  handle(c, m) {
    const rid = typeof m.rid === 'string' && m.rid.length <= 32 ? m.rid : undefined;
    const bad = message => send(c, { t: 'err', rid, code: 'invalid_argument', message });
    const name = typeof m.room === 'string' ? m.room : null, mine = name !== null && this.rooms.get(name)?.get(c.id);
    switch (m.t) {
      case 'join':
        if (name === null || !NAME.test(name)) return bad('bad room name');
        if (!c.rooms.has(name) && c.rooms.size > MAX_ROOMS) return bad('too many rooms');  // the lobby is not counted
        this.enter(c, name);
        return send(c, { t: 'snap', room: name, rid, peers: this.list(name) });
      case 'leave':
        return name ? this.exit(c, name) : bad(name === '' ? 'cannot leave the lobby' : 'bad room name');
      case 'pres': {
        const pr = m.presence;
        if (!mine) return bad('not in room');
        if (!pr || typeof pr !== 'object' || Array.isArray(pr) || Object.keys(pr).some(k => !PKEY.test(k))) return bad('presence must be an object with identifier keys');
        const js = JSON.stringify(pr);
        if (bytes(js) > 4096) return bad('presence is over 4096 bytes');
        if (js !== mine.js) { mine.pr = pr; mine.js = js; this.cast(name, { t: 'up', room: name, peer: c.id, presence: pr }, c); }
        return;
      }
      case 'emit': {
        if (!mine) return bad('not in room');
        if (typeof m.topic !== 'string' || !TOPIC.test(m.topic)) return bad('bad topic');
        if (m.data !== undefined && bytes(JSON.stringify(m.data)) > 4096) return bad('data is over 4096 bytes');
        this.cast(name, { t: 'emit', room: name, peer: c.id, topic: m.topic, data: m.data });
        return send(c, { t: 'ack', rid });
      }
      default: return bad('unknown message type');
    }
  }

  message(c, data) {
    try {
      if (c.dead) return;
      const now = Date.now();
      c.tokens = Math.min(BURST, c.tokens + (now - c.at) * RATE / 1000); c.at = now;
      if (--c.tokens < 0) return this.drop(c, 1008, 'rate limit');
      if (typeof data !== 'string') return this.drop(c, 1003, 'JSON text frames only');
      if (data.length > MAX_MSG / 3 && bytes(data) > MAX_MSG) return this.drop(c, 1009, 'message over 16 KB');
      let m;
      try { m = JSON.parse(data); } catch { /* checked below */ }
      if (!m || typeof m !== 'object') return this.drop(c, 1003, 'JSON text frames only');
      if (c.id) this.handle(c, m); else if (m.t === 'hello') this.hello(c, m); else this.drop(c, 1008, 'hello expected');
    } catch (e) { console.error('message handler:', e?.message || e); this.drop(c, 1011, 'server error'); }
  }
}
