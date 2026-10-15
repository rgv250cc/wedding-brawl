// Online lobby: pick a name and a guest as your fighter, see who else is online, queue for a random match or duel someone.
// Two players who agree get a private match room and the fight starts with Brawl.start([hostK, guestK], { mode: 'online', link, onEnd }).
// All of it rides on room presence (never emit): every page publishes { app, v, name, k, st, since, inv, acc, dec, room } in the lobby
// room and runs the same reconcile step over what it sees. An invite carries a random id; the inviter hosts. Everything from other
// peers is untrusted: validated on read, shown with textContent only.
// API: window.Lobby = { open({ k }?), close(), state, Core }. The room comes from claude.use('room') or RoomShim.connect().
//   Core.create(room, { name, k }, { onChange, onMatch, onToast, onAbort }, opts?) -> DOM-free protocol controller (opts: inviteTtl 30000,
//   acceptTtl 6000, stallMs 8000, skipFor 60000, tick 500, now; the tests shrink them):
//     queue(on), duel(peer), cancel(), accept(peer), decline(peer), setProfile({ name, k }), away(), idle(), matchLive(), endMatch(), destroy(),
//     state (a plain snapshot: me, st, players, incoming, outgoing, pending, match)
//   Core.connect(room, { room, role, them }, me, opts?) -> Promise<link> (with .cancel()): join the match room, wait for the opponent.
//   Core.makeLink(matchRoom, role, me, them, opts?) -> the link object brawl.js talks to (send, latest, onData, onGone, close).
(() => {
'use strict';
const APP = 'wedding-brawl', PEER = /^[A-Za-z0-9_-]{1,64}$/  /* claude.ai peer labels are opaque: any plain id */, IID = /^[a-z0-9]{8}$/, MROOM = /^m-[a-z0-9]{8}$/, STS = ['idle', 'queue', 'match', 'away'];
const RANK = { idle: 0, queue: 0, match: 1, away: 2 }, ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';
const safe = (f, ...a) => { try { return typeof f === 'function' ? f(...a) : undefined; } catch (e) { if (window.console) console.error(e); } };
const CTRL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;  // control characters and invisible direction marks
const clean = s => typeof s === 'string'
  ? Array.from(s.slice(0, 80).replace(CTRL, ' ').replace(/\s+/g, ' ').trim()).slice(0, 16).join('').trim() : '';
const nCards = () => window.LAYERS && window.LAYERS.cards ? window.LAYERS.cards.length : 0;
const maxK = () => nCards() || 1e4;
const byQueue = (a, b) => a.since - b.since || (a.peer < b.peer ? -1 : 1);
const byList = (a, b) => (b.you - a.you) || RANK[a.st] - RANK[b.st] || a.name.localeCompare(b.name) || (a.peer < b.peer ? -1 : 1);
const rid = () => {
  const c = window.crypto, b = new Uint8Array(8);
  if (c && c.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 8; i++) b[i] = Math.random() * 256;
  return Array.from(b, x => ALNUM[x % 36]).join('');
};
const ref = o => o && typeof o === 'object' && typeof o.to === 'string' && PEER.test(o.to) && typeof o.id === 'string' && IID.test(o.id)
  ? { to: o.to, id: o.id } : null;

function readPeer(p) {  // a peer's lobby presence, validated; null when it is not a usable wedding-brawl player
  const x = p && typeof p === 'object' && p.presence;
  if (!x || typeof x !== 'object' || x.app !== APP || x.v !== 1 || typeof p.peer !== 'string' ||
      !PEER.test(p.peer) || !STS.includes(x.st)) return null;
  const name = clean(x.name), k = x.k, since = typeof x.since === 'number' && isFinite(x.since) ? x.since : null;
  if (!name || !Number.isInteger(k) || k < 0 || k >= maxK()) return null;
  return { peer: p.peer, name, k, st: x.st === 'queue' && since === null ? 'idle' : x.st, since, inv: ref(x.inv), acc: ref(x.acc), dec: ref(x.dec),
           room: typeof x.room === 'string' && MROOM.test(x.room) ? x.room : null, you: false };
}

function create(room, profile, hooks = {}, opts = {}) {
  const ttl = opts.inviteTtl || 30000, acceptTtl = opts.acceptTtl || 6000, skipFor = opts.skipFor || 60000, stallMs = opts.stallMs || 8000;
  const clock = opts.now || Date.now, my = {}, seen = new Map(), dismissed = new Set(), skip = new Map(), heads = new Map();
  let name = clean(profile.name) || 'Guest', k = Number.isInteger(profile.k) && profile.k >= 0 ? profile.k : 0, st = 'idle', since = null;
  let out = null, pend = null, match = null, declined = [], me = '', list = [], inc = [], others = new Map();
  let connected = true, dead = false, busy = false, again = false, last = '';
  const toast = t => safe(hooks.onToast, t);
  const self = () => ({ peer: me, name, k, st, since, you: true });

  function publish() {  // send only what changed since the last publish; null deletes a key
    const want = { app: APP, v: 1, name, k, st, since, inv: out && { to: out.to, id: out.id }, acc: pend && { to: pend.from, id: pend.id },
                   dec: declined[0] || null, room: match ? match.room : null }, patch = {};
    const norm = v => JSON.stringify(v === undefined ? null : v);
    for (const key in want) if (norm(want[key]) !== norm(my[key])) patch[key] = want[key];
    const keys = Object.keys(patch);
    if (!keys.length) return;
    Object.assign(my, patch);
    let pr; try { pr = room.presence(patch); } catch (e) { pr = Promise.reject(e); }
    Promise.resolve(pr).catch(() => keys.forEach(x => delete my[x]));  // not delivered: the next step sends it again
  }
  function scan() {
    others = new Map();
    for (const p of room.peers()) {
      if (p && p.sameTab) { if (typeof p.peer === 'string') me = p.peer; continue; }
      const x = readPeer(p); if (x) others.set(x.peer, x);
    }
    list = [...others.values()];
    return clock();
  }
  function begin(role, o, id) {
    match = { id, room: 'm-' + id, role, them: { peer: o.peer, name: o.name, k: o.k }, live: false };
    st = 'match'; since = null; out = pend = null; declined = []; inc = [];
    safe(hooks.onMatch, { room: match.room, role, them: Object.assign({}, match.them) });
  }
  const take = (o, id, t) => { out = null; pend = { from: o.peer, id, at: t, name: o.name, k: o.k }; inc = inc.filter(x => x.peer !== o.peer); };

  function watch() {  // a match that has not started yet is dropped when the opponent leaves the lobby
    if (!match || match.live || others.has(match.them.peer)) return;
    const them = match.them; match = null; st = 'idle';
    safe(hooks.onAbort, { reason: 'left', them }); toast(them.name + ' left');
  }
  function live(t) {
    if (out) {
      const o = others.get(out.to), busyNow = o && (o.st === 'match' || o.st === 'away');
      const why = !o ? 'left' : o.acc && o.acc.to === me && o.acc.id === out.id && !busyNow ? 'agreed' : busyNow ? 'busy'
        : o.dec && o.dec.to === me && o.dec.id === out.id ? 'declined' : t - out.at > ttl ? 'expired'
        : out.auto && !(st === 'queue' && o.st === 'queue') ? 'quiet' : '';
      if (why === 'agreed') return begin('host', o, out.id);
      if (why) {
        if (why === 'expired') skip.set(out.to, t + skipFor);
        const text = { left: ' left', busy: ' is busy', declined: ' declined', expired: " didn't answer" }[why];
        if (text && !out.auto) toast(out.name + text);
        out = null;
      }
    }
    if (pend) {
      const s = others.get(pend.from);
      if (s && s.st === 'match' && s.room === 'm-' + pend.id) return begin('guest', s, pend.id);
      const alive = s && (s.st === 'idle' || s.st === 'queue') && s.inv && s.inv.to === me && s.inv.id === pend.id;
      if (!alive || t - pend.at > acceptTtl) {
        toast(!s ? pend.name + ' left' : alive ? 'No answer from ' + pend.name : pend.name + ' cancelled');
        dismissed.add(pend.from + ':' + pend.id); pend = null;
      }
    }
    let yielded = null;
    for (const o of list) {
      if (!o.inv || o.inv.to !== me || o.st === 'match' || o.st === 'away') continue;
      const key = o.peer + ':' + o.inv.id;
      if (!seen.has(key)) seen.set(key, t);
      if (dismissed.has(key) || t - seen.get(key) > ttl || (pend && pend.from === o.peer && pend.id === o.inv.id)) continue;
      if (out && out.to === o.peer) { if (o.peer < me) yielded = o; continue; }  // both invited each other: the lower peer id's invite wins
      inc.push({ peer: o.peer, id: o.inv.id, name: o.name, k: o.k, st: o.st, since: o.since, at: seen.get(key) });
    }
    if (yielded && !pend) take(yielded, yielded.inv.id, t);
    if (st === 'queue' && !pend) {  // a queued player takes the challenge of another queued player at once
      const a = inc.filter(x => x.st === 'queue').sort(byQueue)[0];
      if (a) take(others.get(a.peer), a.id, t);
    }
    if (st !== 'queue') { heads.clear(); return; }
    const q = [self(), ...list].filter(p => p.st === 'queue').sort(byQueue);
    if (q.length > 1 && !q[0].you && !heads.has(q[0].peer)) heads.set(q[0].peer, t);
    for (const p of [...heads.keys()]) if (!q[0] || q[0].peer !== p) heads.delete(p);
    // a head of the queue that never invites (a frozen tab, a ghost entry) is skipped after a while, or it would block everyone behind it
    const active = q.filter(p => p.you || !(heads.has(p.peer) && t - heads.get(p.peer) > stallMs && !p.inv && !p.acc));
    if (!out && !pend && active[0] && active[0].you) {
      const c = active.find(p => !p.you && !(skip.get(p.peer) > t) && !p.acc);
      if (c) out = { to: c.peer, id: rid(), at: t, auto: true, name: c.name, k: c.k };
    }
  }
  function gc(t) {
    for (const key of seen.keys()) {
      const i = key.indexOf(':'), o = others.get(key.slice(0, i));
      if (!o || !o.inv || o.inv.id !== key.slice(i + 1)) { seen.delete(key); dismissed.delete(key); }
    }
    declined = declined.filter(d => { const o = others.get(d.to); return o && o.inv && o.inv.to === me && o.inv.id === d.id; });
    for (const [p, until] of skip) if (until <= t) skip.delete(p);
  }
  function snapshot() {
    const free = (st === 'idle' || st === 'queue') && !out && !pend;
    return {
      me, st, name, k, connected, online: list.length + 1,
      players: [self(), ...list].sort(byList).slice(0, 300).map(p => ({ peer: p.peer, name: p.name, k: p.k, st: p.st, you: !!p.you,
        canDuel: !p.you && (p.st === 'idle' || p.st === 'queue') && free, invited: !!out && out.to === p.peer })),
      incoming: inc.slice(0, 6).map(x => ({ peer: x.peer, id: x.id, name: x.name, k: x.k, expiresAt: x.at + ttl })),
      outgoing: out && { to: out.to, id: out.id, name: out.name, k: out.k, auto: out.auto, expiresAt: out.at + ttl },
      pending: pend && { from: pend.from, id: pend.id, name: pend.name, k: pend.k, expiresAt: pend.at + acceptTtl },
      match: match && { room: match.room, role: match.role, live: match.live, them: Object.assign({}, match.them) },
    };
  }
  function run() {
    inc = [];
    const t = scan();
    if (me) { if (st === 'match') watch(); else if (st !== 'away') live(t); }
    gc(t); publish();
    const s = snapshot(), j = JSON.stringify(s);
    if (j !== last) { last = j; safe(hooks.onChange, s); }
  }
  function step() {  // idempotent: look at the room, move my state, publish the difference
    if (dead) return;
    if (busy) { again = true; return; }
    busy = true;
    try { do { again = false; run(); } while (again); } catch (e) { if (window.console) console.error(e); } finally { busy = false; }
  }
  const stop = [room.onPeers(() => step())];
  if (typeof room.onConnection === 'function') {
    // after a reconnect everything is published again
    stop.push(room.onConnection(c => { connected = !!c; if (c) for (const x in my) delete my[x]; step(); }));
  }
  const timer = setInterval(step, opts.tick || 500);  // expiries and a backstop for frames that never come (hidden tab)
  if (timer.unref) timer.unref();
  step();

  return {
    get state() { return snapshot(); },
    queue(on) {
      if (dead || pend) return false;
      if (on && st === 'idle') { st = 'queue'; since = clock(); } else if (!on && st === 'queue') { st = 'idle'; since = null; out = null; }
      step(); return true;
    },
    duel(peer) {
      step();
      if (dead || (st !== 'idle' && st !== 'queue')) return false;
      if (out || pend) { toast(out ? 'Cancel your challenge first' : 'Answer the match first'); return false; }
      const o = others.get(peer);
      if (!o) return false;
      if (o.st !== 'idle' && o.st !== 'queue') { toast(o.name + ' is busy'); return false; }
      out = { to: o.peer, id: rid(), at: clock(), auto: false, name: o.name, k: o.k };
      step(); return true;
    },
    cancel() { if (out) { out = null; step(); } },
    accept(peer) {
      step();
      const x = inc.find(i => i.peer === peer);
      if (!x || pend || (st !== 'idle' && st !== 'queue')) return false;
      take(others.get(peer), x.id, clock()); step(); return true;
    },
    decline(peer) {
      step();
      const x = inc.find(i => i.peer === peer);
      if (!x) return false;
      declined.push({ to: peer, id: x.id }); dismissed.add(peer + ':' + x.id); step(); return true;
    },
    setProfile(p) { name = clean(p && p.name) || name; if (p && Number.isInteger(p.k)) k = p.k; step(); },
    away() { if (st === 'match') return; st = 'away'; since = null; out = pend = null; declined = []; step(); },
    idle() { if (st === 'away') { st = 'idle'; step(); } },
    matchLive() { if (match) match.live = true; },
    endMatch() { if (match || st === 'match') { match = null; st = 'idle'; since = null; } step(); },
    destroy() { dead = true; clearInterval(timer); stop.forEach(f => safe(f)); },
  };
}

function makeLink(mr, role, me, them, opts = {}) {
  const goneMs = opts.goneMs || 4000, dataFns = new Set(), goneFns = new Set();
  let g = null, closed = false, gone = false, absent = 0, leaving = null;
  const opp = () => { try { return mr.peers().find(p => p.peer === them.peer) || null; } catch (e) { return null; } };  // a left room may throw
  const latest = () => { const p = opp(), v = p && p.presence && p.presence.g; return v && typeof v === 'object' ? v : null; };
  const fire = (fns, v) => { for (const f of [...fns]) safe(f, v); };
  const bye = () => { if (!gone && !closed) { gone = true; fire(goneFns); } };
  function look() {
    if (closed || gone) return;
    if (!opp()) { if (!absent) absent = Date.now(); else if (Date.now() - absent >= goneMs) bye(); return; }
    absent = 0;
    const v = latest();
    if (v && v !== g) { g = v; fire(dataFns, v); }
  }
  const un = mr.onPeers(ev => {
    if (ev && ev.left && ev.left.some(p => (p && p.peer || p) === them.peer)) bye(); else look();
  });
  const timer = setInterval(() => safe(look), 250);
  if (timer.unref) timer.unref();
  return {
    role, me: { name: me.name, k: me.k }, them: { name: them.name, k: them.k },
    send(payload) { if (closed) return; try { Promise.resolve(mr.presence({ g: payload })).catch(() => {}); } catch (e) {} },
    latest,
    onData(fn) { dataFns.add(fn); return () => dataFns.delete(fn); },
    onGone(fn) { goneFns.add(fn); return () => goneFns.delete(fn); },
    close() {
      if (!leaving) { closed = true; clearInterval(timer); safe(un); leaving = Promise.resolve().then(() => mr.leave()).catch(() => {}); }
      return leaving;
    },
  };
}

function connect(room, m, me, opts = {}) {  // join the private room, announce myself, resolve with the link once the opponent has too
  let cancel;
  const done = new Promise((resolve, reject) => {
    let mr = null, off = () => {}, over = false;
    const finish = (err, link) => {
      if (over) return; over = true; clearTimeout(timer); safe(off);
      if (err) { if (mr) Promise.resolve(safe(() => mr.leave())).catch(() => {}); reject(err); } else resolve(link);
    };
    const timer = setTimeout(() => finish({ code: 'timeout', message: "Couldn't connect to " + m.them.name }), opts.timeout || 12000);
    cancel = () => finish({ code: 'cancelled', message: 'Cancelled' });
    const look = () => {
      if (!over && mr.peers().some(p => p.peer === m.them.peer && p.presence && p.presence.ready === true)) {
        finish(null, makeLink(mr, m.role, me, m.them, opts));
      }
    };
    room.join(m.room).then(r => {
      if (over) return Promise.resolve(r.leave()).catch(() => {});
      mr = r; off = mr.onPeers(() => safe(look));
      return Promise.resolve(mr.presence({ ready: true, name: me.name, k: me.k })).then(look);
    }).catch(e => finish(e || { code: 'failed', message: 'Could not join the match room' }));
  });
  done.cancel = () => cancel();
  return done;
}

// ---------------------------------------------------------------- UI (built on first open, so the file loads without a document)
const NO_ROOM = 'Online play works when this page is opened from its shared claude.ai link, or served by the relay server (npm run online). ' +
  'Local play still works: 2 PLAYERS or VS CPU from the character select.';
const NEED_CODE = 'This lobby needs its access code. Reload the page, enter the code, then open the lobby again.';
const CHIP = { idle: 'idle', queue: 'looking for a match', match: 'fighting', away: 'away' };
const CSS = `
.lb[hidden], .lb [hidden] { display: none !important; }
.lb { position: absolute; inset: 0; z-index: 7; container-type: size; overflow: hidden; color: #fff; text-shadow: .15em .15em 0 #1d0d00;
  font: 400 max(9px, 1.9cqh)/1.5 "Press Start 2P", ui-monospace, monospace; background: radial-gradient(120% 90% at 50% 0, #2e1b0d, #120d08 62%); }
.lb::before { content: ""; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 .15em, transparent .15em .3em); }
.lb * { box-sizing: border-box; }
.lb:focus { outline: none; }
.lb-v { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 1.1em; padding: 1.6em 2em; overflow: auto;
  scrollbar-color: #ffd23f #1d0d00; }
.lb-head { display: flex; align-items: center; gap: .9em 1.2em; flex-wrap: wrap; }
.lb-head .sp { flex: 1; }
.lb-t { margin: 0; font: 400 max(18px, 5.2cqh)/1 "Bungee", Impact, "Arial Black", sans-serif; letter-spacing: .02em; text-shadow: none;
  color: transparent;
  background: linear-gradient(#fffbd0, #ffd23f 50%, #ff7b00); -webkit-background-clip: text; background-clip: text;
  -webkit-text-stroke: max(1px, .05em) #3a0a00; filter: drop-shadow(0 .07em 0 #1d0d00); }
.lb-sub { margin: 0; color: #ffd23f; }
.lb-count { color: #ffd23f; }
.lb-conn { color: #ff4d3a; animation: lb-blink 1s steps(2) infinite; }
.lb button { font: inherit; color: #1d0d00; text-shadow: none; cursor: pointer; padding: .6em 1em; border: .2em solid #2a1000; border-radius: .5em;
  background: linear-gradient(#fff6a8, #ffb300); box-shadow: 0 .25em 0 #2a1000; }
.lb button:active:not(:disabled) { transform: translateY(.2em); box-shadow: 0 .05em 0 #2a1000; }
.lb button:disabled { filter: grayscale(1) brightness(.55); cursor: not-allowed; }
.lb button:focus-visible, .lb input:focus-visible { outline: .2em solid #fff; outline-offset: .15em; }
.lb button.ghost { color: #fff; background: rgba(0,0,0,.5); border-color: rgba(255,255,255,.5); box-shadow: none; text-shadow: .12em .12em 0 #000; }
.lb button.red { color: #fff; background: linear-gradient(#ff8a7a, #e0301c); text-shadow: .12em .12em 0 #3a0a00; }
.lb button.blue { color: #fff; background: linear-gradient(#7cc4ff, #1f74d8); text-shadow: .12em .12em 0 #001a3a; }
.lb-x { padding: .4em .8em !important; }
.lb-panel { margin: auto; max-width: 44em; display: flex; flex-direction: column; align-items: center; gap: 1.3em; text-align: center; }
.lb-panel p { margin: 0; line-height: 1.9; }
.lb-field { display: flex; flex-direction: column; gap: .5em; max-width: 32em; }
.lb-field input { width: 100%; font: inherit; color: #fff; text-shadow: none; padding: .6em .8em; background: #1d0d00; border: .2em solid #ffd23f;
  border-radius: .4em; }
.lb-pick { flex: 1 1 12em; min-height: 12em; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(5.5em, 1fr)); gap: .5em;
  padding: .5em; align-content: start; background: rgba(0,0,0,.35); border: .2em solid rgba(255,255,255,.15); border-radius: .5em;
    scrollbar-color: #ffd23f #1d0d00; }
.lb button.lb-opt { padding: .3em; background: rgba(255,255,255,.06); border: .2em solid transparent; box-shadow: none; border-radius: .4em; }
.lb button.lb-opt[aria-pressed="true"] { border-color: #ffd23f; background: rgba(255,210,63,.2); box-shadow: 0 0 .9em rgba(255,210,63,.55); }
.lb-opt img { display: block; width: 100%; height: max(48px, 8cqh); object-fit: contain; }
.lb-go { align-self: center; font-size: 1.35em; padding: .7em 1.6em !important; }
.lb-pt { height: 4.6em; width: 3.6em; object-fit: contain; flex: none;
  filter: drop-shadow(.08em 0 0 #fff) drop-shadow(-.08em 0 0 #fff) drop-shadow(0 .08em 0 #fff) drop-shadow(0 -.08em 0 #fff); }
.lb-alerts { display: flex; flex-wrap: wrap; gap: .8em; }
.lb-alerts:empty, .lb-banner:empty { display: none; }
.lb-card { flex: 1 1 22em; position: relative; display: flex; align-items: center; gap: .9em; padding: .6em .9em; border-radius: .6em;
  background: rgba(0,0,0,.5); border: .2em solid #3aa0ff; }
.lb-card.in { border-color: #ff4d3a; box-shadow: 0 0 1.2em rgba(255,77,58,.55); animation: lb-shake .5s 2; }
.lb-at { flex: 1; min-width: 0; line-height: 1.7; overflow-wrap: anywhere; }
.lb-act { display: flex; gap: .6em; flex-wrap: wrap; justify-content: flex-end; }
.lb-bar { position: absolute; left: .4em; right: .4em; bottom: .25em; height: .3em; background: #ffd23f; transform-origin: left;
  animation: lb-drain linear forwards; }
.lb-banner { padding: .8em 1em; text-align: center; border-radius: .6em; border: .2em solid #ffd23f; background: rgba(255,210,63,.14);
  color: #ffd23f; }
.lb-banner.win { color: #fffbd0; background: rgba(255,210,63,.3); }
.lb-banner.lose { color: #ff8a7a; border-color: #ff4d3a; background: rgba(255,77,58,.14); }
.lb-cols { display: grid; grid-template-columns: minmax(16em, 34%) minmax(0, 1fr); gap: 1.5em; flex: 1 0 auto; min-height: 16em; }
.lb-col { display: flex; flex-direction: column; gap: 1em; min-height: 0; }
.lb-me { display: flex; align-items: center; gap: .9em; padding: .7em .9em; border-radius: .6em; background: rgba(255,210,63,.1);
  border: .2em solid #ffd23f; }
.lb-me .lb-n { font-size: 1.15em; }
.lb-find { font-size: 1.3em; padding: 1em .8em !important; line-height: 1.6; }
.lb-find.on { color: #fff; background: linear-gradient(#ff8a7a, #e0301c); text-shadow: .12em .12em 0 #3a0a00; }
.lb-find i { font-style: normal; animation: lb-dot 1.2s infinite; }
.lb-find i:nth-of-type(2) { animation-delay: .2s; } .lb-find i:nth-of-type(3) { animation-delay: .4s; }
.lb-h { margin: 0; color: #ffd23f; font-weight: 400; font-size: 1em; }
.lb-list { flex: 1; min-height: 0; overflow-y: auto; list-style: none; margin: 0; padding: 0 .3em .3em 0; display: flex; flex-direction: column;
  gap: .5em;
  scrollbar-color: #ffd23f #1d0d00; }
.lb-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: .8em; padding: .5em .7em; border-radius: .5em;
  background: rgba(255,255,255,.06); border: .15em solid rgba(255,255,255,.14); }
.lb-row.you { border-color: #ffd23f; background: rgba(255,210,63,.1); }
.lb-n { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb-chip { display: inline-block; margin-top: .35em; padding: .2em .65em; border-radius: 99em; font-size: .72em; background: #000;
  border: .15em solid currentColor; text-shadow: none; }
.lb-chip.s-idle { color: #3aa0ff; } .lb-chip.s-match { color: #ff4d3a; } .lb-chip.s-away { color: #8a7f73; }
.lb-chip.s-queue { color: #ffd23f; animation: lb-pulse 1.2s ease-in-out infinite; }
.lb-toast { position: absolute; left: 50%; bottom: 1.2em; z-index: 3; max-width: 90%; transform: translateX(-50%); padding: .7em 1.2em;
  border-radius: .5em;
  text-align: center; background: #000; border: .2em solid #ffd23f; color: #fff; overflow-wrap: anywhere; }
.lb-v.lb-vs { display: grid; grid-template-columns: 1fr 1fr; gap: 0; padding: 0; overflow: hidden; background: #120d08; }
.vs-s { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .8em; padding: 1em;
  min-width: 0; }
.vs-s::before { content: ""; position: absolute; inset: 0; z-index: -1; }
.vs-s.l { animation: lb-in-l .45s cubic-bezier(.3,.9,.3,1) both; }
.vs-s.r { animation: lb-in-r .45s cubic-bezier(.3,.9,.3,1) both; }
.vs-s.l::before { clip-path: polygon(0 0, 100% 0, 86% 100%, 0 100%);
  background: repeating-linear-gradient(105deg, rgba(255,255,255,.1) 0 .4em, transparent .4em 2.2em), linear-gradient(105deg, #a80f1c, #ff7a18); }
.vs-s.r::before { clip-path: polygon(14% 0, 100% 0, 100% 100%, 0 100%);
  background: repeating-linear-gradient(75deg, rgba(255,255,255,.1) 0 .4em, transparent .4em 2.2em), linear-gradient(255deg, #1532a8, #19c3ff); }
.vs-s img { height: 55cqh; max-width: 100%; object-fit: contain;
  filter: drop-shadow(.15em 0 0 #fff) drop-shadow(-.15em 0 0 #fff) drop-shadow(0 .15em 0 #fff) drop-shadow(0 -.15em 0 #fff); }
.vs-n { font: 400 max(16px, 5cqh)/1 "Bungee", Impact, sans-serif; text-transform: uppercase; max-width: 100%; overflow-wrap: anywhere;
  text-align: center;
  -webkit-text-stroke: max(1px, .06em) #2a1000; paint-order: stroke fill; }
.vs-v { position: absolute; left: 50%; top: 42%; font: 400 max(34px, 20cqh)/1 "Bungee", Impact, sans-serif; color: #ffd23f;
  -webkit-text-stroke: max(2px, .05em) #3a0a00; text-shadow: 0 .05em 0 #000; transform: translate(-50%, -50%) rotate(-8deg);
  animation: lb-vs .6s cubic-bezier(.2,1.7,.4,1) .35s both; }
.vs-note { position: absolute; left: 0; right: 0; bottom: 1.2em; text-align: center; color: #fff; animation: lb-blink 1s steps(2) infinite; }
@keyframes lb-blink { 50% { opacity: .35; } }
@keyframes lb-dot { 0%, 100% { opacity: .2; } 40% { opacity: 1; } }
@keyframes lb-pulse { 50% { box-shadow: 0 0 .8em currentColor; } }
@keyframes lb-shake { 25% { transform: translateX(-.3em) rotate(-.4deg); } 75% { transform: translateX(.3em) rotate(.4deg); } }
@keyframes lb-drain { to { transform: scaleX(0); } }
@keyframes lb-in-l { from { transform: translateX(-105%); } }
@keyframes lb-in-r { from { transform: translateX(105%); } }
@keyframes lb-vs { from { transform: translate(-50%, -50%) rotate(-30deg) scale(4); opacity: 0; } to { opacity: 1; } }
@container (max-width: 700px) {
  .lb-v { padding: 1em; }
  .lb-cols { display: flex; flex-direction: column; flex: none; min-height: 0; }
  .lb-list { overflow: visible; flex: none; }
  .lb-pick { min-height: 14em; }
  .vs-s img { height: 38cqh; }
}
@media (prefers-reduced-motion: reduce) {
  .lb * { animation-duration: 1ms !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; }
  .lb-bar { display: none; }
}
`;

const store = {
  get: key => { try { return localStorage.getItem(key); } catch (e) { return null; } },
  set: (key, v) => { try { localStorage.setItem(key, v); } catch (e) {} },
};
const sfx = (n, o) => safe(() => window.SFX && window.SFX.play(n, o));
const art = k => (window.FIGHTERS && window.FIGHTERS[k]) || (window.LAYERS && window.LAYERS.cards[k] && window.LAYERS.cards[k].img) || '';
const gname = k => clean(safe(window.guestName, k)) || 'Guest ' + (k + 1);
const el = (tag, cls, text) => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e;
};
const setText = (e, t) => { if (e.textContent !== t) e.textContent = t; };
const setArt = (img, k) => { const s = art(k); if (img._s !== s) { img._s = s; if (s) img.src = s; else img.removeAttribute('src'); } };
const btn = (text, cls, fn) => { const b = el('button', cls, text); b.type = 'button'; b.onclick = fn; return b; };

function sync(box, items, make) {  // keyed reconcile: nodes whose key stays are reused, so portraits don't flash on every update
  const old = new Map(Array.from(box.children, c => [c.dataset.key, c]));
  let at = box.firstChild;
  for (const it of items) {
    const n = make(it, old.get(it.key)); old.delete(it.key); n.dataset.key = it.key;
    if (n === at) at = at.nextSibling; else box.insertBefore(n, at);
  }
  old.forEach(n => n.remove());
}

let root, views = {}, els = {}, view = '', room = null, acquiring = null, core = null, profile = null, touched = false, fighting = null;
let shownAt = 0, toastT = 0, bannerT = 0, token = 0, seenIn = new Set();

async function getRoom() {
  const c = window.claude;
  if (c && typeof c.use === 'function') { let r = null; try { r = await c.use('room'); } catch (e) {} if (r) return r; }
  if (window.RoomShim && typeof window.RoomShim.connect === 'function') return await window.RoomShim.connect();  // {code: 'not_granted'}: no cookie
  return null;
}
const acquire = () => room ? Promise.resolve(room)
  : acquiring || (acquiring = getRoom().then(r => { room = r; return r; }).finally(() => { acquiring = null; }));

function setView(name) {
  view = name;
  for (const v in views) views[v].hidden = v !== name;
  if (name === 'login') {
    els.back.hidden = !core; fillPick();
    const sel = els.pick.querySelector('[aria-pressed="true"]'); if (sel) sel.scrollIntoView({ block: 'nearest' });
    if (window.matchMedia && matchMedia('(pointer: fine)').matches) els.name.focus();  // a phone keyboard would cover the picker
  }
}
function toast(text) {
  if (!root) return;
  setText(els.toast, String(text).slice(0, 120)); els.toast.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { els.toast.hidden = true; }, 3500);
}
const clearBanner = () => { clearTimeout(bannerT); setText(els.banner, ''); };
function banner(text, kind) {
  setText(els.banner, text); els.banner.className = 'lb-banner ' + (kind || '');
  clearTimeout(bannerT); bannerT = setTimeout(() => setText(els.banner, ''), 15000);
}

function build() {
  if (root) return;
  const style = el('style'); style.textContent = CSS; document.head.append(style);
  root = el('div', 'lb'); root.id = 'lobby'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Online lobby');
  root.tabIndex = -1;  // a click on empty space keeps the keys inside the lobby
  const mk = (name, ...kids) => { const v = el('div', 'lb-v'); v.hidden = true; v.append(...kids); views[name] = v; root.append(v); return v; };
  const head = (...extra) => {
    const h = el('div', 'lb-head'), x = btn('X', 'ghost lb-x', close);
    x.setAttribute('aria-label', 'Close lobby'); h.append(el('h2', 'lb-t', 'ONLINE LOBBY'), ...extra, el('span', 'sp'), x); return h;
  };

  const lp = el('div', 'lb-panel'); lp.append(el('p', '', 'CONNECTING…'));
  mk('load', head(), lp);
  els.noneText = el('p'); els.reload = btn('RELOAD PAGE', '', () => location.reload());
  const nb = el('div', 'lb-panel'); nb.append(els.noneText, els.reload, btn('CLOSE', 'ghost', close));
  mk('none', head(), nb);

  els.name = el('input'); els.name.maxLength = 16; els.name.autocomplete = 'off'; els.name.spellcheck = false; els.name.placeholder = 'YOUR NAME';
  els.name.setAttribute('aria-label', 'Your name');
  els.name.addEventListener('input', () => { touched = true; });
  els.name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); enter(); } });
  els.pick = el('div', 'lb-pick'); els.pick.setAttribute('role', 'group'); els.pick.setAttribute('aria-label', 'Choose your fighter');
  const field = el('label', 'lb-field'); field.append(el('span', '', 'YOUR NAME'), els.name);
  els.back = btn('BACK', 'ghost', () => setView('lobby'));
  const go = btn('ENTER LOBBY', 'lb-go', enter);
  mk('login', head(), el('p', 'lb-sub', 'PICK A NAME AND YOUR FIGHTER'), field, els.pick, go, els.back);

  els.count = el('span', 'lb-count'); els.conn = el('span', 'lb-conn', 'RECONNECTING…');
  els.banner = el('div', 'lb-banner'); els.banner.setAttribute('role', 'status');
  els.alerts = el('div', 'lb-alerts');
  els.meImg = el('img', 'lb-pt'); els.meImg.alt = ''; els.meName = el('div', 'lb-n'); els.meSt = el('span', 'lb-chip');
  const mid = el('div'); mid.style.cssText = 'flex:1;min-width:0'; mid.append(els.meName, els.meSt);
  const me = el('div', 'lb-me'); me.append(els.meImg, mid, btn('CHANGE', 'ghost', () => setView('login')));
  els.find = btn('', '', () => { clearBanner(); if (core) core.queue(core.state.st !== 'queue'); }); els.find.classList.add('lb-find');
  els.findA = el('span', '', 'FIND A MATCH'); els.findB = el('span');
  els.findB.append('SEARCHING', el('i', '', '.'), el('i', '', '.'), el('i', '', '.'), document.createElement('br'), 'CANCEL');
  els.find.append(els.findA, els.findB);
  els.list = el('ul', 'lb-list');
  const left = el('div', 'lb-col'); left.append(me, els.find);
  const right = el('div', 'lb-col'); right.append(el('h3', 'lb-h', 'PLAYERS'), els.list);
  const cols = el('div', 'lb-cols'); cols.append(left, right);
  mk('lobby', head(els.count, els.conn), els.banner, els.alerts, cols);

  const side = cls => {
    const s = el('div', 'vs-s ' + cls), img = el('img'), n = el('div', 'vs-n');
    img.alt = ''; s.append(img, n); s._r = { img, n }; return s;
  };
  els.vl = side('l'); els.vr = side('r'); els.note = el('div', 'vs-note', 'CONNECTING…');
  mk('vs', els.vl, els.vr, el('div', 'vs-v', 'VS'), els.note).className = 'lb-v lb-vs';

  els.toast = el('div', 'lb-toast'); els.toast.hidden = true; els.toast.setAttribute('role', 'status'); root.append(els.toast);
  (document.querySelector('.stage') || document.body).append(root);
  root.addEventListener('click', e => { if (e.target.closest && e.target.closest('button')) sfx('swing'); });
  root.addEventListener('keydown', e => e.stopPropagation());  // typing a name must not drive the page behind
  root.addEventListener('keyup', e => e.stopPropagation());
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && root && !root.hidden && !fighting && Date.now() - shownAt > 400) { e.stopPropagation(); close(); }
  }, true);
}

function fillPick() {  // portraits arrive late (fighters.js is async): fill in whatever is available each time the picker opens
  while (els.pick.children.length < nCards()) {
    const k = els.pick.children.length, b = btn('', 'lb-opt', () => choose(k)), i = el('img');
    i.alt = ''; i.decoding = 'async'; b.title = gname(k); b.setAttribute('aria-label', gname(k)); b.setAttribute('aria-pressed', 'false');
    b.append(i); els.pick.append(b);
  }
  Array.from(els.pick.children).forEach((b, k) => { setArt(b.firstChild, k); b.setAttribute('aria-pressed', String(k === profile.k)); });
}
function choose(k) {
  profile.k = k; fillPick();
  if (!touched) els.name.value = gname(k);
  els.pick.children[k].scrollIntoView({ block: 'nearest' });
}
function initProfile(pref) {
  const n = nCards() || 1;
  let k = Number.isInteger(pref) ? pref : parseInt(store.get('brawl-k'), 10);
  if (!(k >= 0 && k < n)) k = Math.floor(Math.random() * n);
  const saved = clean(store.get('brawl-name'));
  profile = { name: saved || gname(k), k }; touched = !!saved && !Number.isInteger(pref);
  els.name.value = profile.name;
}
function enter() {
  profile = { name: clean(els.name.value) || gname(profile.k), k: profile.k };
  store.set('brawl-name', profile.name); store.set('brawl-k', String(profile.k));
  if (core) core.setProfile(profile);
  else core = create(room, profile, { onChange: render, onMatch: startMatch, onToast: toast, onAbort: aborted });
  setView('lobby'); render(core.state);
}

function render(s) {
  if (!root) return;
  setText(els.count, s.online + ' online'); els.conn.hidden = s.connected !== false;
  setArt(els.meImg, s.k); setText(els.meName, s.name); els.meSt.className = 'lb-chip s-' + s.st;
  setText(els.meSt, s.st === 'queue' ? 'searching…' : CHIP[s.st] || s.st);
  const on = s.st === 'queue';
  els.find.classList.toggle('on', on); els.findA.hidden = on; els.findB.hidden = !on; els.find.disabled = !!s.pending || (s.st !== 'idle' && !on);
  const cards = s.incoming.map(x => Object.assign({ key: 'in:' + x.peer + x.id, type: 'in' }, x));
  if (s.outgoing && !s.outgoing.auto) cards.push(Object.assign({ key: 'out', type: 'out' }, s.outgoing));
  if (s.pending) cards.push(Object.assign({ key: 'pend', type: 'pend' }, s.pending));
  sync(els.alerts, cards, makeCard);
  const ids = new Set(s.incoming.map(x => x.peer + x.id));
  if ([...ids].some(i => !seenIn.has(i))) sfx('pickup');
  seenIn = ids;
  sync(els.list, s.players.map(p => Object.assign({ key: p.peer || 'me' }, p)), makeRow);
}
function makeCard(it, n) {
  if (!n) {
    n = el('div', 'lb-card ' + it.type); const img = el('img', 'lb-pt'), txt = el('div', 'lb-at'), act = el('div', 'lb-act');
    img.alt = ''; n._r = { img, txt };
    if (it.type === 'in') {
      act.append(btn('ACCEPT', 'red', () => core.accept(n._it.peer)), btn('DECLINE', 'ghost', () => core.decline(n._it.peer)));
      const bar = el('div', 'lb-bar'); bar.style.animationDuration = Math.max(1, it.expiresAt - Date.now()) + 'ms'; n.append(bar);
    } else if (it.type === 'out') act.append(btn('CANCEL', 'ghost', () => core.cancel()));
    n.prepend(img, txt, act);
  }
  n._it = it;
  setArt(n._r.img, it.k);
  setText(n._r.txt, it.type === 'in' ? it.name + ' challenges you!' :
    (it.type === 'out' ? 'Challenging ' : 'Starting the match with ') + it.name + '…');
  return n;
}
function makeRow(it, n) {
  if (!n) {
    n = el('li', 'lb-row'); const img = el('img', 'lb-pt'), mid = el('div'), nm = el('div', 'lb-n'), chip = el('span', 'lb-chip');
    img.alt = ''; mid.style.minWidth = '0'; mid.append(nm, chip);
    const b = btn('DUEL', 'blue', () => { const p = n._it; clearBanner(); if (p.invited) core.cancel(); else core.duel(p.peer); });
    n.append(img, mid, b); n._r = { img, nm, chip, b };
  }
  n._it = it; const r = n._r;
  n.classList.toggle('you', it.you); setArt(r.img, it.k); setText(r.nm, it.name + (it.you ? ' (you)' : ''));
  setText(r.chip, CHIP[it.st]); r.chip.className = 'lb-chip s-' + it.st;
  r.b.hidden = it.you || it.st === 'match' || it.st === 'away';
  setText(r.b, it.invited ? 'CANCEL' : 'DUEL'); r.b.disabled = !(it.invited || it.canDuel);
  return n;
}

function fillVs(l, r) {
  for (const [side, who] of [[els.vl, l], [els.vr, r]]) { setArt(side._r.img, who.k); setText(side._r.n, who.name); }
  setText(els.note, 'CONNECTING…');
  for (const s of [els.vl, els.vr]) { s.style.animation = 'none'; void s.offsetWidth; s.style.animation = ''; }
}
function back() {  // show the lobby again
  root.hidden = false; shownAt = Date.now(); setView('lobby'); if (core) render(core.state);
}
function startMatch(m) {
  build();
  const f = fighting = { m, live: false, over: false, link: null, cancel: null };
  const host = m.role === 'host', mine = { name: profile.name, k: profile.k };
  const L = host ? mine : m.them, R = host ? m.them : mine;
  root.hidden = false; setView('vs'); fillVs(L, R);
  sfx('boom'); setTimeout(() => { if (f === fighting) sfx('prepare'); }, 800);
  const conn = connect(room, m, mine); f.cancel = conn.cancel;
  Promise.all([conn, new Promise(r => setTimeout(r, 1500))]).then(([link]) => fight(f, link, L, R), () => {
    if (f !== fighting) return;  // cancelled or aborted meanwhile
    fighting = null; toast("Couldn't connect to " + m.them.name); core.endMatch(); back();
  });
}
function fight(f, link, L, R) {
  if (f !== fighting) { link.close(); return; }
  try {
    if (!window.Brawl || typeof window.Brawl.start !== 'function') throw new Error('Brawl is not loaded');
    f.link = link; f.live = true; core.matchLive(); root.hidden = true;
    window.Brawl.start([L.k, R.k], { mode: 'online', link, onEnd: r => over(f, r) });
  } catch (e) {
    if (window.console) console.error(e);
    if (f !== fighting) return;
    fighting = null; link.close(); core.endMatch(); back(); toast('The fight engine is not available');
  }
}
function over(f, r) {
  if (f !== fighting || f.over) return;
  f.over = true; fighting = null; if (f.link) f.link.close();
  core.endMatch();
  const them = f.m.them.name, w = r && r.winner, why = String(r && r.reason || '');
  if (why === 'left') banner(them + ' left the match', 'win');  // a walk-out first: it decides the result, not the score
  else if (why === 'quit') banner('You left the match', '');
  else if (w === 'me') banner('You beat ' + them + '!', 'win');
  else if (w === 'them') banner(them + ' won', 'lose');
  else banner(/draw|tie/i.test(why) ? 'Draw with ' + them : /quit|esc|stop|exit/i.test(why) ? 'You left the match' : them + ' left the match', '');
  back();
}
function aborted() {  // the opponent dropped out of the lobby before the fight began (Core already told the user)
  if (!fighting || fighting.live) return;
  fighting.cancel && fighting.cancel(); fighting = null; back();
}

function unavailable(e) {  // no room: explain why, with the access-code case called out
  const denied = !!e && e.code === 'not_granted';
  setText(els.noneText, denied ? NEED_CODE : e ? "Couldn't reach the lobby: " + String(e.message || e.code || e).slice(0, 80) : NO_ROOM);
  els.reload.hidden = !denied; setView('none');
}
async function open(o) {
  if (typeof document === 'undefined') return;
  build();
  if (fighting) return;
  const t = ++token;
  root.hidden = false; shownAt = Date.now();
  if (core) { core.idle(); setView('lobby'); render(core.state); return; }
  if (!profile) initProfile(o && o.k);
  setView('load');
  let r;
  try { r = await acquire(); } catch (e) { if (t === token && !root.hidden) unavailable(e); return; }
  if (t !== token || root.hidden) return;
  if (r) setView('login'); else unavailable(null);
}
function close() {
  if (!root || (fighting && fighting.live)) return;
  if (fighting) { fighting.cancel && fighting.cancel(); fighting = null; if (core) core.endMatch(); }
  token++; root.hidden = true;
  if (core) core.away();
}

window.Lobby = {
  open, close, Core: { create, connect, makeLink },
  get state() { return Object.assign({ open: !!root && !root.hidden, view, banner: els.banner ? els.banner.textContent : '', fighting: !!fighting },
    core ? core.state : { st: 'offline', players: [], incoming: [], outgoing: null }); },
};
})();
