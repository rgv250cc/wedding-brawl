// Client for the self-hosted room relay (server.mjs). It has the same shape as the claude.ai artifact "room" capability, so game code can use either:
// RoomShim.connect(url?, { WebSocket?, headers? }?) -> Promise<room> with presence(patch) peers() onPeers(fn) emit(topic, data) on(topic, fn) join(name)
// connected() onConnection(fn); join() gives a NamedRoom (name, leave(), the same members). Extra: room.close() disconnects for good.
// url defaults to ws(s)://<page host>/room. Rejects {code:'not_granted'} if the access cookie is missing or wrong, {code:'upstream_error'} if nothing
// answers within 5 s. Reconnects by itself (1, 2, 4, 8 s) and then re-joins named rooms and re-asserts presence. Runs in Node 22+ too (pass opts.WebSocket).
(() => {
'use strict';
const G = globalThis;
const GAP = 33, LIMIT = 4096, SILENT = 45000;  // min ms between presence sends, bytes of presence/data, ms without any server frame before we reconnect
const NAME = /^[a-z0-9][a-z0-9_.-]{0,47}$/, TOPIC = /^[a-z][a-z0-9_.-]{0,47}$/, KEY = /^[A-Za-z_$][\w$]*$/;
const err = (code, message) => ({ code, message });
const no = (code, message) => Promise.reject(err(code, message));
const bytes = s => new TextEncoder().encode(s).length;
const rnd = n => Array.from(G.crypto.getRandomValues(new Uint8Array(n)), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
const freeze = o => { if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o); } return o; };
const frame = f => G.requestAnimationFrame ? G.requestAnimationFrame(f) : setTimeout(f, 16);
const EMPTY = Object.freeze([]);

function connect(url, opts = {}) {
  const WS = opts.WebSocket || G.WebSocket;
  if (!url && G.location) url = (G.location.protocol === 'https:' ? 'wss://' : 'ws://') + G.location.host + '/room';
  if (!WS || !url) return no('invalid_argument', 'no WebSocket implementation or url');
  return new Promise((resolve, reject) => {
    const want = rnd(16), key = rnd(24), pend = new Map(), rooms = new Map(), links = new Set();
    let me = want, ws = null, up = false, ready = false, closed = false, tries = 0, retry = 0, seq = 0, heard = 0;

    const tx = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
    const call = o => new Promise((ok, bad) => { o.rid = String(++seq); pend.set(o.rid, { ok, bad }); tx(o); });
    const settle = (id, e) => { const p = pend.get(id); if (p) { pend.delete(id); e ? p.bad(e) : p.ok(); } };
    const safe = (fn, a) => { try { fn(a); } catch (e) { console.error(e); } };

    // ---- one room (the lobby or a named one): peers, my presence, listeners ----
    function make(name) {
      const R = { name, peers: new Map(), js: new Map(), snap: null, mine: {}, mj: '{}', hs: new Set(), ls: new Set(), on: new Map(), at: 0, pt: 0, gone: false };
      const live = () => R.gone ? no('invalid_argument', 'room was left') : null;
      const note = (kind, p) => {
        for (const h of R.hs) {
          if (kind === 'joined') { if (h.l.delete(p.peer)) h.u.set(p.peer, p); else h.j.set(p.peer, p); }
          else if (kind === 'updated') { if (h.j.has(p.peer)) h.j.set(p.peer, p); else h.u.set(p.peer, p); }
          else { h.u.delete(p.peer); if (!h.j.delete(p.peer)) h.l.set(p.peer, p); }
          if (!h.q) { h.q = true; frame(() => flush(h)); }
        }
      };
      const flush = h => {
        h.q = false;
        if (h.dead || !(h.j.size + h.l.size + h.u.size)) return;
        const d = { peers: R.api.peers(), joined: [...h.j.values()], left: [...h.l.values()], updated: [...h.u.values()] };
        h.j.clear(); h.l.clear(); h.u.clear();
        safe(h.fn, d);
      };
      R.put = (id, pr, js = JSON.stringify(pr)) => {
        const old = R.peers.get(id);
        if (old && R.js.get(id) === js) return;
        const p = Object.freeze({ peer: id, by: null, isMe: id === me, sameTab: id === me, kind: 'viewer', guest: false, presence: freeze(pr), updatedAt: Date.now() });
        R.peers.set(id, p); R.js.set(id, js); R.snap = null;
        note(old ? 'updated' : 'joined', p);
      };
      R.del = id => {
        const old = R.peers.get(id);
        if (!old) return;
        R.peers.delete(id); R.js.delete(id); R.snap = null;
        note('left', old);
      };
      R.sync = list => {  // a full member list from the server (join, reconnect): reduce it to joined / left / updated against what we hold
        for (const id of [...R.peers.keys()]) if (!list.has(id)) R.del(id);
        for (const [id, pr] of list) if (id === me) R.put(id, R.mine, R.mj); else R.put(id, pr);
        if (R.mj !== '{}') R.sched();
      };
      R.sched = () => {  // leading-edge send, then at most one per GAP; the latest state wins
        if (R.pt) return;
        R.pt = setTimeout(() => {
          R.pt = 0;
          if (!up || R.gone) return;  // re-asserted after the next welcome
          R.at = Date.now();
          tx({ t: 'pres', room: name, presence: R.mine });
        }, Math.max(0, R.at + GAP - Date.now()));
      };
      R.api = {
        presence(patch) {
          const dead = live();
          if (dead) return dead;
          if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return no('invalid_argument', 'presence patch must be an object');
          const next = { ...R.mine };
          for (const [k, v] of Object.entries(patch)) {
            if (!KEY.test(k) || k === '__proto__') return no('invalid_argument', `presence key "${k}" is not an identifier`);
            if (v === null) delete next[k]; else next[k] = v;
          }
          let js;
          try { js = JSON.stringify(next); } catch (e) { return no('invalid_argument', 'presence is not JSON: ' + e.message); }
          const n = bytes(js);
          if (n > LIMIT) return no('invalid_argument', `presence is ${n} bytes, the limit is ${LIMIT}`);
          if (js === R.mj) return Promise.resolve();
          R.mine = JSON.parse(js); R.mj = js;
          R.put(me, R.mine, js);
          R.sched();
          return Promise.resolve();
        },
        peers: () => R.snap || (R.snap = Object.freeze([...R.peers.values()])),
        onPeers(fn) {
          if (typeof fn !== 'function') throw new TypeError('onPeers needs a function');
          const h = { fn, j: new Map(R.peers), l: new Map(), u: new Map(), q: true, dead: false };  // the first delivery presents everyone as joined
          R.hs.add(h);
          Promise.resolve().then(() => flush(h));
          return () => { h.dead = true; R.hs.delete(h); };
        },
        emit(topic, data) {
          const dead = live();
          if (dead) return dead;
          if (typeof topic !== 'string' || !TOPIC.test(topic)) return no('invalid_argument', 'topic must match ' + TOPIC);
          let js;
          try { js = data === undefined ? '' : JSON.stringify(data); } catch (e) { return no('invalid_argument', 'data is not JSON: ' + e.message); }
          if (bytes(js) > LIMIT) return no('invalid_argument', `data is over ${LIMIT} bytes`);
          if (!up) return no('upstream_error', 'not connected');
          return call({ t: 'emit', room: name, topic, data });
        },
        on(topic, fn) {
          if (typeof fn !== 'function') throw new TypeError('on needs a function');
          if (!R.on.has(topic)) R.on.set(topic, new Set());
          R.on.get(topic).add(fn);
          return () => R.on.get(topic)?.delete(fn);
        },
        connected: () => up,
        onConnection(fn) {
          if (typeof fn !== 'function') throw new TypeError('onConnection needs a function');
          const h = { fn, last: undefined, dead: false };
          links.add(h); R.ls.add(h);
          Promise.resolve().then(() => tell(h));
          return () => { h.dead = true; links.delete(h); R.ls.delete(h); };
        },
      };
      return R;
    }
    const tell = h => { if (!h.dead && h.last !== up) { h.last = up; safe(h.fn, up); } };
    const lobby = make('');
    lobby.api.join = name => {
      if (typeof name !== 'string' || !NAME.test(name)) return no('invalid_argument', 'room name must match ' + NAME);
      const have = rooms.get(name);
      if (have) return have.ready;
      if (!up) return no('upstream_error', 'not connected');
      const R = make(name);
      R.api.name = name;
      R.api.leave = () => {
        if (R.gone) return no('invalid_argument', 'room was left');
        R.gone = true; R.hs.clear(); R.on.clear(); clearTimeout(R.pt);
        R.ls.forEach(h => { h.dead = true; links.delete(h); });
        rooms.delete(name); tx({ t: 'leave', room: name });
        return Promise.resolve();
      };
      rooms.set(name, R);
      R.ready = call({ t: 'join', room: name }).then(() => R.api, e => { rooms.delete(name); throw e; });
      return R.ready;
    };
    lobby.api.close = () => { closed = true; clearInterval(watch); clearTimeout(retry); lost(ws); };

    // ---- the socket ----
    function msg(m) {
      const R = rooms.get(m.room) || (m.room === '' ? lobby : null);
      switch (m.t) {
        case 'welcome':
          me = m.peer; tries = 0; up = true;
          lobby.sync(new Map(m.peers));
          for (const r of rooms.values()) tx({ t: 'join', room: r.name, rid: 'again' });
          links.forEach(tell);
          if (!ready) { ready = true; clearTimeout(t5); resolve(lobby.api); }
          break;
        case 'snap': if (R) R.sync(new Map(m.peers)); settle(m.rid); break;
        case 'up': if (R) R.put(m.peer, m.presence); break;
        case 'left': if (R) R.del(m.peer); break;
        case 'emit': {
          const e = Object.freeze({ peer: m.peer, by: null, isMe: m.peer === me, sameTab: m.peer === me, kind: 'viewer', guest: false, topic: m.topic, data: m.data });
          if (R) for (const fn of [...(R.on.get(m.topic) || [])]) safe(fn, e);
          break;
        }
        case 'ack': settle(m.rid); break;
        case 'err': if (m.rid && pend.has(m.rid)) settle(m.rid, err(m.code, m.message)); else console.warn('relay:', m.code, m.message); break;
      }
    }
    function lost(s) {
      if (!s || ws !== s) return;
      ws = null;
      s.onopen = s.onmessage = s.onclose = null;
      s.onerror = () => {};  // a Node ws client throws on an unhandled error event
      try { s.close(); } catch { /* already gone */ }
      const was = up;
      up = false;
      for (const id of [...pend.keys()]) settle(id, err('upstream_error', 'connection lost'));
      if (was) links.forEach(tell);
      if (closed) return;
      if (ready) retry = setTimeout(open, Math.min(8000, 1000 * 2 ** tries++));
      else denied().then(d => giveUp(d ? err('not_granted', 'the relay wants an access code (log in first)') : err('upstream_error', 'cannot reach it')));
    }
    async function denied() {  // a browser can't see a 401 on the upgrade, so ask the same address over plain HTTP
      try { return (await G.fetch(url.replace(/^ws/, 'http'), { headers: opts.headers })).status === 401; } catch { return false; }
    }
    function open() {
      let s;
      try { s = new WS(url, opts.headers ? { headers: opts.headers } : undefined); } catch { return lost((ws = { close() {} })); }
      ws = s; heard = Date.now();
      s.onopen = () => tx({ t: 'hello', peer: me, key });
      s.onmessage = e => {
        heard = Date.now();
        try { msg(JSON.parse(e.data)); } catch (x) { console.error(x); }
      };
      s.onclose = () => lost(s);
      s.onerror = () => {};
    }
    const watch = setInterval(() => { if (ws && Date.now() - heard > SILENT) lost(ws); }, 5000);
    if (watch.unref) watch.unref();
    const giveUp = e => {  // never welcomed: stop trying, the caller decides
      if (ready) return;
      closed = true; clearInterval(watch); clearTimeout(retry); clearTimeout(t5); lost(ws); reject(e);
    };
    const t5 = setTimeout(() => giveUp(err('upstream_error', 'the relay did not answer within 5 s')), 5000);
    open();
  });
}

G.RoomShim = { connect };
})();
