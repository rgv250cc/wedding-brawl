// Tests lobby.js's DOM-free protocol (Lobby.Core) against an in-memory fake of the room API: several clients, async delivery with random
// latency, frozen snapshots, per-room presence, join/leave. One line per check; exit code 0 = all passed. Run: node lobbytest.mjs
import { pathToFileURL } from 'node:url';

globalThis.window = globalThis;
globalThis.LAYERS = { W: 1, H: 1, cards: Array.from({ length: 73 }, () => ({})) };
await import(pathToFileURL(new URL('./lobby.js', import.meta.url).pathname).href);
const { Core } = window.Lobby;

// ---------------------------------------------------------------- the fake room hub
const deepFreeze = o => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); }
  return o;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = o => JSON.parse(JSON.stringify(o));

function makeHub({ lat = [0, 4] } = {}) {
  const store = new Map(), members = new Map();  // room name -> Map(peer -> presence) held by the "server"; room name -> Set(client)
  const jitter = () => lat[0] + Math.random() * (lat[1] - lat[0]);
  const newId = () => Array.from({ length: 16 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
  const roomStore = n => { if (!store.has(n)) { store.set(n, new Map()); members.set(n, new Set()); } return store.get(n); };
  const peerObj = (peer, presence, me) =>
    deepFreeze({ peer, by: null, isMe: me, sameTab: me, kind: 'viewer', guest: false, presence, updatedAt: Date.now() });
  const later = (n, from) => { for (const o of members.get(n)) if (o !== from) setTimeout(() => refresh(n, o), jitter()); };

  function refresh(n, c) {  // bring client c's view of room n up to date with the server
    const v = c.views.get(n); if (!v) return;
    const next = new Map();
    for (const [peer, pres] of roomStore(n)) {
      const old = v.map.get(peer);
      if (peer === c.peer) next.set(peer, old);  // my own entry is local state
      else next.set(peer, old && eq(old.presence, pres) ? old : peerObj(peer, clone(pres), false));
    }
    commit(v, next);
  }
  function commit(v, next) {
    v.map = next; v.list = Object.freeze([...next.values()]);
    if (!v.timer) v.timer = setTimeout(() => deliver(v), 2);  // handlers run at most once per "frame"
  }
  function deliver(v) {
    v.timer = 0;
    const joined = [], left = [], updated = [];
    for (const [p, x] of v.map) { const d = v.sent.get(p); if (!d) joined.push(x); else if (d !== x) updated.push(x); }
    for (const [p, x] of v.sent) if (!v.map.has(p)) left.push(x);
    v.sent = new Map(v.map);
    if (!joined.length && !left.length && !updated.length && v.delivered) return;
    v.delivered = true;
    for (const f of [...v.fns]) f({ peers: v.list, joined, left, updated });
  }
  function setPresence(c, n, patch) {
    const v = c.views.get(n);
    if (!v) return Promise.reject({ code: 'left', message: 'not in this room' });
    const merged = { ...v.map.get(c.peer).presence };
    for (const [key, val] of Object.entries(patch)) if (val === null) delete merged[key]; else merged[key] = val;
    if (new TextEncoder().encode(JSON.stringify(merged)).length > 4096) {
      return Promise.reject({ code: 'invalid_argument', message: 'presence too large' });
    }
    const next = new Map(v.map);
    next.set(c.peer, peerObj(c.peer, clone(merged), true));  // applied locally at once
    commit(v, next);
    setTimeout(() => {  // reaches the others a little later; the latest merged state wins
      if (!c.views.has(n)) return;
      roomStore(n).set(c.peer, clone(c.views.get(n).map.get(c.peer).presence));
      later(n, c);
    }, jitter());
    return Promise.resolve();
  }
  function enter(c, n) {
    roomStore(n).set(c.peer, {}); members.get(n).add(c);
    const me = peerObj(c.peer, {}, true);
    c.views.set(n, { map: new Map([[c.peer, me]]), list: Object.freeze([me]), fns: new Set(), sent: new Map(), timer: 0, delivered: false });
    refresh(n, c); later(n, c);
  }
  function exit(c, n) {
    if (!c.views.has(n)) return;
    const v = c.views.get(n); v.fns.clear(); clearTimeout(v.timer);  // after leave() its listeners stop
    roomStore(n).delete(c.peer); members.get(n).delete(c); c.views.delete(n); c.api.delete(n);
    later(n, c);
  }
  function api(c, n) {
    if (c.api.has(n)) return c.api.get(n);
    const view = () => { const x = c.views.get(n); if (!x) throw { code: 'left', message: 'left' }; return x; };
    const a = {
      name: n, peers: () => view().list, presence: p => setPresence(c, n, p),
      onPeers(fn) {
        if (typeof fn !== 'function') throw new TypeError('handler');
        const x = view(); x.fns.add(fn); if (!x.timer) x.timer = setTimeout(() => deliver(x), 2);
        return () => x.fns.delete(fn);
      },
      emit: () => Promise.reject({ code: 'forbidden', message: 'the lobby must not use emit' }), on: () => () => {},
      connected: () => c.conn,
      onConnection(fn) { queueMicrotask(() => fn(c.conn)); c.connFns.add(fn); return () => c.connFns.delete(fn); },
      async join(name) {
        if (!/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(name)) throw { code: 'invalid_argument', message: 'room name' };
        if (!c.views.has(name)) enter(c, name);
        return api(c, name);
      },
      async leave() { exit(c, n); },
    };
    c.api.set(n, a);
    return a;
  }
  return {
    client(peer = newId()) {
      const c = { peer, views: new Map(), api: new Map(), conn: true, connFns: new Set() };
      enter(c, '');
      c.room = api(c, '');
      c.drop = () => { for (const n of [...c.views.keys()]) exit(c, n); };  // the page is gone
      return c;
    },
    inject(n, peer, presence) {  // raw presence from a peer that is not running our code (bypasses the size limit)
      roomStore(n).set(peer, presence); later(n, null);
    },
    remove(n, peer) { roomStore(n).delete(peer); later(n, null); },
    server: (n, peer) => roomStore(n).get(peer),
  };
}

// ---------------------------------------------------------------- helpers
const FAST = { inviteTtl: 30000, acceptTtl: 6000, tick: 40, stallMs: 8000 };
let hub, cores = [], errors = [];
function player(name, k, { opts = {}, peer } = {}) {
  const c = hub.client(peer), p = { c, name, k, matches: [], aborts: [], toasts: [] };
  const hooks = { onChange() {}, onMatch: m => p.matches.push(m), onToast: t => p.toasts.push(t), onAbort: a => p.aborts.push(a) };
  p.core = Core.create(c.room, { name, k }, hooks, { ...FAST, ...opts });
  Object.defineProperty(p, 's', { get: () => p.core.state });
  p.drop = () => { p.core.destroy(); c.drop(); };  // the page is gone: it stops running and leaves every room
  cores.push(p);
  return p;
}
async function until(f, ms = 3000, what = 'condition') {
  const t = Date.now();
  while (Date.now() - t < ms) { if (f()) return; await sleep(8); }
  throw new Error('timed out waiting for ' + what);
}
const idOf = p => p.c.peer;
const lobbyOf = p => p.c.room.peers().find(x => x.sameTab).presence;
const row = (viewer, target) => viewer.s.players.find(p => p.peer === idOf(target)) || {};  // {} until viewer has seen target
const RLO = String.fromCharCode(0x202e);  // right-to-left override: must not survive in a name
const VALID = { app: 'wedding-brawl', v: 1, st: 'idle' };
const bad = (cond, msg) => { if (cond) throw new Error(typeof msg === 'function' ? msg() : msg); };
async function fresh() { cores.forEach(p => p.core.destroy()); cores = []; hub = makeHub(); }
async function queuePair(a, b) {
  a.core.queue(true); await sleep(15); b.core.queue(true);
  await until(() => a.matches.length && b.matches.length, 3000, 'a match');
}
async function duelAndAccept(a, b) {
  await until(() => a.s.players.length >= 2 && b.s.players.length >= 2, 2000, 'peers visible');
  a.core.duel(idOf(b)); await until(() => b.s.incoming.length === 1, 2000, 'incoming invite'); b.core.accept(idOf(a));
  await until(() => a.matches.length && b.matches.length, 3000, 'a match');
}

// ---------------------------------------------------------------- checks
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

check('two queued players are matched into one room: one host, one guest', async () => {
  const a = player('Ana', 1), b = player('Ben', 2);
  await queuePair(a, b);
  const [ma, mb] = [a.matches[0], b.matches[0]];
  bad(ma.room !== mb.room, () => 'rooms differ: ' + ma.room + ' ' + mb.room);
  bad(!/^m-[a-z0-9]{8}$/.test(ma.room), 'bad room name ' + ma.room);
  bad(ma.role !== 'host' || mb.role !== 'guest', () => 'roles ' + ma.role + '/' + mb.role + ' (the earlier queuer should host)');
  bad(ma.them.name !== 'Ben' || ma.them.k !== 2 || mb.them.name !== 'Ana' || mb.them.k !== 1, 'opponent info wrong');
  bad(a.matches.length !== 1 || b.matches.length !== 1, 'more than one match each');
  bad(a.s.st !== 'match' || b.s.st !== 'match', () => 'st is ' + a.s.st + '/' + b.s.st);
  await sleep(150);
  const pa = lobbyOf(a), pb = lobbyOf(b);
  bad(pa.st !== 'match' || pa.room !== ma.room || pb.room !== ma.room || pa.inv || pa.since || pb.acc,
      () => 'presence not cleaned up: ' + JSON.stringify([pa, pb]));
});

check('a third queued player waits; a fourth joining later is matched with the third', async () => {
  const a = player('Ana', 1), b = player('Ben', 2), c = player('Cleo', 3), d = player('Dov', 4);
  a.core.queue(true); await sleep(15); b.core.queue(true); await sleep(15); c.core.queue(true);
  await until(() => a.matches.length && b.matches.length, 3000, 'first pair');
  await sleep(250);
  bad(c.matches.length || c.s.st !== 'queue' || c.s.outgoing, () => 'third player should still be queued, st=' + c.s.st);
  d.core.queue(true);
  await until(() => c.matches.length && d.matches.length, 3000, 'second pair');
  bad(c.matches[0].room !== d.matches[0].room, 'second pair rooms differ');
  bad(c.matches[0].room === a.matches[0].room, 'both pairs share a room');
  bad(c.matches[0].role !== 'host', 'earlier queuer should host');
  await sleep(150);
  bad(a.matches.length !== 1 || b.matches.length !== 1 || a.s.st !== 'match', 'first pair was disturbed');
});

check('manual duel: invite + accept produces a match, the inviter hosts', async () => {
  const a = player('Ana', 1), b = player('Ben', 2);
  await until(() => a.s.players.length === 2 && b.s.players.length === 2, 2000, 'peers visible');
  bad(!row(a, b).canDuel, 'Duel should be allowed on an idle peer');
  bad(!a.core.duel(idOf(b)), 'duel() refused');
  bad(!a.s.outgoing || a.s.outgoing.to !== idOf(b), 'no outgoing invite');
  await until(() => b.s.incoming.length === 1, 2000, 'incoming invite');
  const inc = b.s.incoming[0];
  bad(inc.peer !== idOf(a) || inc.name !== 'Ana' || inc.k !== 1, () => 'bad incoming ' + JSON.stringify(inc));
  bad(b.matches.length, 'invitee must not start before accepting');
  bad(!b.core.accept(idOf(a)), 'accept() refused');
  bad(!b.s.pending, 'no pending state after accepting');
  await until(() => a.matches.length && b.matches.length, 3000, 'match');
  bad(a.matches[0].room !== b.matches[0].room || a.matches[0].role !== 'host' || b.matches[0].role !== 'guest', 'bad match');
  bad(b.s.pending || a.s.outgoing || b.s.incoming.length, 'leftovers after the match');
});

check('decline clears the invite on both sides', async () => {
  const a = player('Ana', 1), b = player('Ben', 2);
  await until(() => a.s.players.length === 2, 2000, 'peers');
  a.core.duel(idOf(b));
  await until(() => b.s.incoming.length === 1, 2000, 'incoming');
  bad(!b.core.decline(idOf(a)), 'decline() refused');
  bad(b.s.incoming.length, 'declined invite still listed on the invitee');
  await until(() => !a.s.outgoing, 2000, 'inviter to clear');
  bad(!a.toasts.includes('Ben declined'), () => 'inviter toasts: ' + JSON.stringify(a.toasts));
  await until(() => !lobbyOf(a).inv && !lobbyOf(b).dec, 2000, 'presence cleanup');
  await sleep(150);
  bad(b.s.incoming.length || a.s.outgoing || a.s.st !== 'idle' || b.s.st !== 'idle' || a.matches.length || b.matches.length, 'state not clean');
});

check('inviter can cancel; the invitee loses the card', async () => {
  const a = player('Ana', 1), b = player('Ben', 2);
  await until(() => a.s.players.length === 2, 2000, 'peers');
  a.core.duel(idOf(b)); await until(() => b.s.incoming.length === 1, 2000, 'incoming');
  a.core.cancel(); await until(() => !b.s.incoming.length, 2000, 'card to vanish');
  bad(a.s.outgoing || lobbyOf(a).inv, 'outgoing not cleared');
});

check('an invite to someone who then leaves is cleared', async () => {
  const a = player('Ana', 1), b = player('Ben', 2);
  await until(() => a.s.players.length === 2, 2000, 'peers');
  a.core.duel(idOf(b)); await until(() => b.s.incoming.length === 1, 2000, 'incoming');
  b.drop();
  await until(() => !a.s.outgoing, 2000, 'outgoing to clear');
  bad(a.s.players.length !== 1 || !a.toasts.includes('Ben left'), () => 'toasts ' + JSON.stringify(a.toasts));
  bad(lobbyOf(a).inv, 'inv still in presence');
});

check('an invite from someone who then leaves disappears from the invitee', async () => {
  const a = player('Ana', 1), b = player('Ben', 2);
  await until(() => a.s.players.length === 2, 2000, 'peers');
  a.core.duel(idOf(b)); await until(() => b.s.incoming.length === 1, 2000, 'incoming');
  a.drop();
  await until(() => !b.s.incoming.length, 2000, 'incoming to clear');
});

check('a peer in a match cannot be invited', async () => {
  const a = player('Ana', 1), b = player('Ben', 2), c = player('Cleo', 3);
  a.core.queue(true); await sleep(15); b.core.queue(true);
  await until(() => a.matches.length && b.matches.length && row(c, a) && row(c, a).st === 'match', 3000, 'match visible to Cleo');
  bad(row(c, a).canDuel, 'canDuel should be false for a fighting peer');
  bad(c.core.duel(idOf(a)) !== false || c.s.outgoing, 'duel() should refuse');
  bad(!c.toasts.some(t => /busy/.test(t)), () => 'no busy toast: ' + JSON.stringify(c.toasts));
  hub.inject('', 'zzzzzzzzzzzzzzzz', { ...VALID, name: 'Late', k: 9, inv: { to: idOf(a), id: 'abcd1234' } });  // a stale invite to a fighter
  await sleep(150);
  bad(a.s.incoming.length, 'a fighting player listed an invite');
});

check('an outgoing invite is dropped when the target starts fighting somebody else', async () => {
  const a = player('Ana', 1), b = player('Ben', 2), c = player('Cleo', 3);
  await until(() => a.s.players.length === 3, 2000, 'peers');
  c.core.duel(idOf(a));
  await until(() => a.s.incoming.length === 1, 2000, 'incoming at Ana');
  b.core.duel(idOf(a)); await until(() => a.s.incoming.length === 2, 2000, 'two incoming');
  a.core.accept(idOf(b));  // Ana picks Ben
  await until(() => a.matches.length && b.matches.length, 3000, 'Ana+Ben');
  await until(() => !c.s.outgoing, 3000, "Cleo's invite to be dropped");
  bad(c.matches.length, 'Cleo must not have a match');
});

check('accepting a challenge withdraws my own outgoing one, so I never end up in two matches', async () => {
  const a = player('Ana', 1), b = player('Ben', 2), c = player('Cleo', 3);
  await until(() => a.s.players.length === 3, 2000, 'peers');
  a.core.duel(idOf(c)); b.core.duel(idOf(a));
  await until(() => c.s.incoming.length === 1 && a.s.incoming.length === 1, 2000, 'both invites visible');
  a.core.accept(idOf(b)); c.core.accept(idOf(a));  // same tick: Cleo has not seen Ana withdraw
  bad(a.s.outgoing, 'outgoing kept after accepting');
  await until(() => a.matches.length && b.matches.length, 3000, 'Ana+Ben');
  await sleep(300);
  bad(a.matches.length !== 1 || c.matches.length || c.s.pending || c.s.st !== 'idle', () => 'Ana ' + a.matches.length + ' matches, Cleo ' + c.s.st);
});

check('two players inviting each other at the same moment end up in exactly one match', async () => {
  for (let i = 0; i < 24; i++) {
    await fresh();
    const low = i % 2 === 0, A = 'aaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbb';  // alternate which caller has the lower peer id
    const x = player('Xia', 1, { peer: low ? A : B }), y = player('Yan', 2, { peer: low ? B : A });
    await until(() => x.s.players.length === 2 && y.s.players.length === 2, 2000, 'peers');
    if (i % 3 === 2) {  // queues race too
      x.core.queue(true); y.core.queue(true); await until(() => x.matches.length, 3000, 'queue match'); continue;
    }
    x.core.duel(idOf(y)); y.core.duel(idOf(x));  // same tick: neither has seen the other's invite yet
    await until(() => x.matches.length && y.matches.length, 3000, 'a match (round ' + i + ')');
    await sleep(140);
    bad(x.matches.length !== 1 || y.matches.length !== 1, 'several matches in round ' + i);
    bad(x.matches[0].room !== y.matches[0].room, 'different rooms in round ' + i);
    bad(x.matches[0].role === y.matches[0].role, 'same role twice in round ' + i);
    bad(idOf(x.matches[0].role === 'host' ? x : y) !== A, 'the lower peer id should have won, round ' + i);
    bad(lobbyOf(x).room !== x.matches[0].room || lobbyOf(y).room !== x.matches[0].room, 'presence room differs from the match in round ' + i);
    bad(x.s.st !== 'match' || y.s.st !== 'match' || x.s.outgoing || y.s.outgoing, 'state not settled in round ' + i);
  }
});

check('queue race with three players never produces two matches for one player', async () => {
  for (let i = 0; i < 12; i++) {
    await fresh();
    const ps = [player('P1', 1), player('P2', 2), player('P3', 3)];
    await until(() => ps.every(p => p.s.players.length === 3), 2000, 'peers');
    ps.forEach(p => p.core.queue(true));
    await until(() => ps.filter(p => p.matches.length).length >= 2, 3000, 'a pair');
    await sleep(400);
    bad(ps.some(p => p.matches.length > 1), 'a player was matched twice in round ' + i);
    const matched = ps.filter(p => p.s.st === 'match'), waiting = ps.filter(p => p.s.st === 'queue');
    bad(matched.length !== 2 || waiting.length !== 1, () => 'round ' + i + ': ' + ps.map(p => p.s.st).join());
    bad(matched[0].matches[0].room !== matched[1].matches[0].room, 'pair in different rooms in round ' + i);
  }
});

check('malformed presence from a bogus peer does not crash or show up badly', async () => {
  const a = player('Ana', 1), b = player('Ben', 2);
  const odd = { toString() { return 'x'; } };
  const junk = [
    { ...VALID, name: 12345, k: 3 }, { ...VALID, name: 'x'.repeat(5000), k: -3 }, { ...VALID, name: 'Okay', k: 1.5 },
    { ...VALID, name: 'Okay', k: '3' },
    { ...VALID, name: 'Okay', k: 999 }, { ...VALID, name: 'Okay', k: 3, st: 'dancing' }, { ...VALID, name: '   ', k: 3 },
    { app: 'something-else', name: 'Other', k: 3, st: 'idle' }, { ...VALID, name: 'Okay', k: 3, v: 2 }, 'just a string',
    { ...VALID, name: odd, k: 4 },
    { ...VALID, name: null, k: null }, null, [],
  ];
  junk.forEach((pr, i) => hub.inject('', 'junk' + String(i).padStart(2, '0') + 'x'.repeat(10), pr));
  const html = '<img src=x onerror=alert(1)>' + 'x'.repeat(40);
  hub.inject('', 'bigname000000000', { ...VALID, name: 'N'.repeat(5000), k: 5 });
  hub.inject('', 'htmlname00000000', { ...VALID, name: html, k: 6 });
  hub.inject('', 'ghostly000000000', { ...VALID, name: 'Hostile', k: 7, inv: { to: idOf(a), id: { evil: 1 } }, acc: 'x', dec: [1, 2], room: 42 });
  hub.inject('', 'inviter000000000', { ...VALID, name: 'BadInv', k: 8, inv: { to: idOf(a), id: 'x'.repeat(5000) } });
  hub.inject('', 'queuebad00000000', { ...VALID, name: 'NoSince', k: 9, st: 'queue', since: 'yesterday' });
  hub.inject('', 'queuenull0000000', { ...VALID, name: 'NullSince', k: 10, st: 'queue', since: null });
  await until(() => a.s.players.length >= 8, 2000, 'peers');
  await sleep(100);
  const names = a.s.players.map(p => p.name).sort();
  const want = ['Ana', 'Ben', 'N'.repeat(16), html.slice(0, 16), 'Hostile', 'BadInv', 'NoSince', 'NullSince'].sort();
  bad(!eq(names, want), () => 'visible players: ' + JSON.stringify(names));
  bad(a.s.players.some(p => p.name.length > 16 || !Number.isInteger(p.k) || p.k < 0 || p.k >= 73), 'unsafe player in the list');
  bad(a.s.incoming.length || b.s.incoming.length, () => 'bogus invite listed: ' + JSON.stringify(a.s.incoming));
  bad(a.s.players.some(p => p.st === 'queue'), 'a bogus queue entry counted as queued');
  a.core.queue(true); b.core.queue(true);
  await until(() => a.matches.length && b.matches.length, 3000, 'real players still match');
});

check('a flood of peers is capped in the snapshot (players 300, challenges 6) but still counted', async () => {
  const a = player('Ana', 1);
  for (let i = 0; i < 320; i++) {
    const id = 'flood' + String(i).padStart(3, '0') + 'x'.repeat(8);
    hub.inject('', id, { ...VALID, name: 'F' + i, k: i % 73, inv: { to: idOf(a), id: ('f' + i + 'abcdefg').slice(0, 8) } });
  }
  await until(() => a.s.online === 321, 3000, 'all peers');
  bad(a.s.players.length !== 300 || !a.s.players[0].you || a.s.incoming.length !== 6,
      () => a.s.players.length + ' players, ' + a.s.incoming.length + ' incoming');
});

check('a ghost at the head of the queue that never invites cannot block two real players', async () => {
  const a = player('Ana', 1, { opts: { stallMs: 250 } }), b = player('Ben', 2, { opts: { stallMs: 250 } });
  hub.inject('', 'ghost00000000000', { ...VALID, name: 'Ghost', k: 11, st: 'queue', since: 1 });
  await until(() => a.s.players.some(p => p.name === 'Ghost'), 2000, 'ghost visible');
  a.core.queue(true); await sleep(20); b.core.queue(true);
  await sleep(100);
  bad(a.matches.length, 'should not match before the stall time');
  await until(() => a.matches.length && b.matches.length, 3000, 'match despite the ghost');
  bad(a.matches[0].them.name !== 'Ben', () => 'matched with ' + a.matches[0].them.name);
});

check('an unanswered invite expires on both sides', async () => {
  const a = player('Ana', 1, { opts: { inviteTtl: 250 } }), b = player('Ben', 2, { opts: { inviteTtl: 250 } });
  await until(() => a.s.players.length === 2, 2000, 'peers');
  a.core.duel(idOf(b)); await until(() => b.s.incoming.length === 1, 2000, 'incoming');
  await until(() => !a.s.outgoing && !b.s.incoming.length, 2000, 'expiry');
  bad(!a.toasts.includes("Ben didn't answer"), () => 'toasts ' + JSON.stringify(a.toasts));
  bad(lobbyOf(a).inv, 'expired inv still in presence');
  await sleep(150); bad(b.s.incoming.length, 'expired invite came back');
});

check('accepting an invite the inviter never confirms gives up after the accept timeout', async () => {
  const b = player('Ben', 2, { opts: { acceptTtl: 250 } });
  hub.inject('', 'slowpoke00000000', { ...VALID, name: 'Slow', k: 12, inv: { to: idOf(b), id: 'abcd1234' } });
  await until(() => b.s.incoming.length === 1, 2000, 'incoming');
  b.core.accept('slowpoke00000000');
  bad(!b.s.pending || !eq(lobbyOf(b).acc, { to: 'slowpoke00000000', id: 'abcd1234' }), 'accept not published');
  await until(() => !b.s.pending, 2000, 'timeout');
  bad(b.s.st !== 'idle' || b.matches.length || lobbyOf(b).acc, 'did not return to the previous state');
  bad(!b.toasts.some(t => /Slow/.test(t)), 'no toast');
  await sleep(150); bad(b.s.incoming.length, 'the same invite was offered again');
});

check('accepting while queued returns to the queue after the timeout', async () => {
  const b = player('Ben', 2, { opts: { acceptTtl: 250 } });
  hub.inject('', 'slowpoke00000000', { ...VALID, name: 'Slow', k: 12, inv: { to: idOf(b), id: 'abcd1234' } });
  await until(() => b.s.incoming.length === 1, 2000, 'incoming');
  b.core.queue(true); await sleep(80);  // Slow is idle, so the invite stays a manual challenge
  bad(!b.s.incoming.length, 'manual invite lost');
  b.core.accept('slowpoke00000000');
  await until(() => !b.s.pending, 2000, 'timeout');
  bad(b.s.st !== 'queue', () => 'expected queue, got ' + b.s.st);
});

check('an invite from a queued player is accepted automatically by a queued player', async () => {
  const b = player('Ben', 2); b.core.queue(true); await sleep(30);
  hub.inject('', 'queuer0000000000', { ...VALID, name: 'Que', k: 13, st: 'queue', since: 5, inv: { to: idOf(b), id: 'abcd1234' } });
  await until(() => eq(lobbyOf(b).acc, { to: 'queuer0000000000', id: 'abcd1234' }), 2000, 'automatic acc');
  hub.inject('', 'queuer0000000000', { ...VALID, name: 'Que', k: 13, st: 'match', room: 'm-abcd1234' });
  await until(() => b.matches.length, 2000, 'guest commit');
  bad(b.matches[0].role !== 'guest' || b.matches[0].room !== 'm-abcd1234', () => 'bad commit ' + JSON.stringify(b.matches[0]));
});

check('the match is dropped before the fight if the opponent leaves the lobby', async () => {
  const a = player('Ana', 1), b = player('Ben', 2);
  await duelAndAccept(a, b);
  b.drop();
  await until(() => a.aborts.length, 2000, 'abort');
  bad(a.s.st !== 'idle' || a.s.match || !a.toasts.includes('Ben left') || a.aborts[0].reason !== 'left', () => 'state after abort: ' + a.s.st);
  bad(lobbyOf(a).room || lobbyOf(a).st !== 'idle', 'presence not reset');
});

check('a live fight ignores the opponent leaving the lobby (the link handles it); endMatch returns to idle and queueing works again', async () => {
  const a = player('Ana', 1), b = player('Ben', 2), c = player('Cleo', 3);
  await queuePair(a, b);
  a.core.matchLive(); b.core.matchLive();
  b.drop(); await sleep(250);
  bad(a.aborts.length || a.s.st !== 'match', 'a live match was aborted by the lobby');
  a.core.endMatch(); await until(() => lobbyOf(a).st === 'idle' && !lobbyOf(a).room, 2000, 'idle again');
  a.core.queue(true); c.core.queue(true);
  await until(() => a.matches.length === 2 && c.matches.length === 1, 3000, 'rematch');
});

check('away leaves the queue, hides Duel for others, and idle comes back', async () => {
  const a = player('Ana', 1), b = player('Ben', 2);
  await until(() => a.s.players.length === 2, 2000, 'peers');
  a.core.queue(true); await until(() => row(b, a).st === 'queue', 2000, 'queued');
  bad(!row(b, a).canDuel, 'a queued peer should be duelable');
  a.core.away(); await until(() => row(b, a).st === 'away', 2000, 'away');
  bad(row(b, a).canDuel || b.core.duel(idOf(a)), 'an away peer was duelable');
  bad(lobbyOf(a).since, 'since not cleared');
  a.core.idle(); await until(() => row(b, a).st === 'idle', 2000, 'idle');
});

check('closing the lobby (away) cancels my pending challenges on both sides', async () => {
  const a = player('Ana', 1), b = player('Ben', 2);
  await until(() => a.s.players.length === 2, 2000, 'peers');
  a.core.duel(idOf(b)); await until(() => b.s.incoming.length === 1, 2000, 'incoming');
  a.core.away(); await until(() => !b.s.incoming.length, 2000, 'card gone');
  bad(a.s.outgoing, 'outgoing kept');
});

check('only one outgoing invite at a time', async () => {
  const a = player('Ana', 1), b = player('Ben', 2), c = player('Cleo', 3);
  await until(() => a.s.players.length === 3, 2000, 'peers');
  bad(!a.core.duel(idOf(b)), 'first duel refused');
  bad(a.core.duel(idOf(c)), 'second duel should be refused');
  bad(a.s.players.some(p => p.canDuel), 'canDuel should be false while an invite is out');
  bad(a.s.outgoing.to !== idOf(b), 'first invite replaced');
});

check('profile changes are published and sanitised', async () => {
  const a = player('Ana', 1), b = player('Ben', 2);
  await until(() => a.s.players.length === 2, 2000, 'peers');
  a.core.setProfile({ name: '  Ana\n' + RLO + 'Banana  with a very long name ', k: 40 });
  await until(() => b.s.players.some(p => p.k === 40), 2000, 'new k');
  const n = b.s.players.find(p => p.k === 40).name;
  bad(n.length > 16 || /[\n]/.test(n) || n.includes(RLO) || !n.startsWith('Ana'), () => 'name ' + JSON.stringify(n));
});

check('the lobby never uses emit and never mutates frozen peer data', async () => {
  const a = player('Ana', 1), b = player('Ben', 2);
  a.c.room.emit = () => { throw new Error('emit was called'); };
  await queuePair(a, b);
});

check('link: send arrives in onData and latest(); onGone fires when the other side leaves', async () => {
  const a = player('Ana', 1), b = player('Ben', 2);
  await queuePair(a, b);
  const ma = a.matches[0], mb = b.matches[0], opts = { goneMs: 4000 };
  const [host, guest] = await Promise.all([Core.connect(a.c.room, ma, { name: 'Ana', k: 1 }, opts),
                                           Core.connect(b.c.room, mb, { name: 'Ben', k: 2 }, opts)]);
  bad(host.role !== 'host' || guest.role !== 'guest' || host.them.name !== 'Ben' || guest.them.k !== 1 || host.me.name !== 'Ana',
      'link metadata wrong');
  bad(!eq(Object.keys(host).sort(), ['close', 'latest', 'me', 'onData', 'onGone', 'role', 'send', 'them']), 'link members differ from the contract');
  bad(host.latest() !== null || guest.latest() !== null, 'latest() should start null');
  const got = [], back = [], gone = [];
  guest.onData(p => got.push(p)); host.onData(p => back.push(p)); guest.onGone(() => gone.push('guest')); host.onGone(() => gone.push('host'));
  host.send({ a: 1 });
  await until(() => got.length === 1, 2000, 'data at guest');
  bad(!eq(got[0], { a: 1 }) || !eq(guest.latest(), { a: 1 }), 'payload wrong');
  bad(host.latest() !== null, 'the sender must not see its own payload as latest');
  host.send({ a: 2, big: 'x'.repeat(3000) }); await until(() => got.length === 2, 2000, 'second payload');
  guest.send({ b: 7 }); await until(() => back.length === 1 && eq(host.latest(), { b: 7 }), 2000, 'data at host');
  const off = guest.onData(() => { throw new Error('boom'); });
  host.send({ a: 3 }); await until(() => got.length === 3, 2000, 'a payload while another listener throws'); off();
  errors = errors.filter(e => !/boom/.test(e));  // the lobby logs a throwing listener and carries on
  const stranger = await hub.client().room.join(ma.room);
  await stranger.presence({ ready: true, g: { evil: true } }); await sleep(120);  // somebody else in the match room is not the opponent
  bad(!eq(guest.latest(), { a: 3 }), () => 'latest() changed to ' + JSON.stringify(guest.latest()));
  bad(got.length !== 3, 'a bystander reached onData');
  await host.close(); await host.close();
  await until(() => gone.includes('guest'), 2000, 'onGone at guest');
  await sleep(200);
  bad(!eq(gone, ['guest']), () => 'onGone fired ' + JSON.stringify(gone));
  host.send({ late: 1 });  // after close: ignored, no throw
  await guest.close();
  bad(hub.server(ma.room, idOf(a)) || hub.server(ma.room, idOf(b)), 'match room not left');
});

check('link: onGone also fires when the opponent is simply absent for goneMs', async () => {
  const a = player('Ana', 1), b = player('Ben', 2);
  await queuePair(a, b);
  const opts = { goneMs: 300 }, room = a.matches[0].room;
  const [host, guest] = await Promise.all([Core.connect(a.c.room, a.matches[0], { name: 'Ana', k: 1 }, opts),
                                           Core.connect(b.c.room, b.matches[0], { name: 'Ben', k: 2 }, opts)]);
  let n = 0; host.onGone(() => n++);
  hub.remove(room, idOf(b));  // the server just forgets the guest: no leave event from the guest itself
  await until(() => n === 1, 2000, 'gone'); await sleep(500);
  bad(n !== 1, () => 'fired ' + n + ' times');
  await host.close(); await guest.close();
});

check('connect: times out when the opponent never shows up, and leaves the room', async () => {
  const a = player('Ana', 1), b = player('Ben', 2);
  await queuePair(a, b);
  const t0 = Date.now();
  const err = await Core.connect(a.c.room, a.matches[0], { name: 'Ana', k: 1 }, { timeout: 300 }).then(() => null, e => e);
  bad(!err || err.code !== 'timeout' || !/Ben/.test(err.message) || Date.now() - t0 < 250, () => 'got ' + JSON.stringify(err));
  await sleep(30); bad(hub.server(a.matches[0].room, idOf(a)), 'did not leave the match room');
  const p = Core.connect(b.c.room, b.matches[0], { name: 'Ben', k: 2 }, { timeout: 5000 }); p.cancel();
  const e2 = await p.then(() => null, e => e);
  bad(!e2 || e2.code !== 'cancelled', () => 'cancel gave ' + JSON.stringify(e2));
  await sleep(30); bad(hub.server(b.matches[0].room, idOf(b)), 'cancel did not leave the room');
});

check('Lobby loads without a document and reports a plain state', async () => {
  const s = window.Lobby.state;
  bad(typeof window.Lobby.open !== 'function' || typeof window.Lobby.close !== 'function', 'open/close missing');
  bad(s.st !== 'offline' || s.open !== false || !Array.isArray(s.players), () => JSON.stringify(s));
  await window.Lobby.open(); window.Lobby.close();  // no document: harmless
});

// ---------------------------------------------------------------- run
let failed = 0;
console.error = (...a) => errors.push(a.map(String).join(' '));  // the lobby logs through console.error only when something it ran threw
for (const [name, fn] of checks) {
  await fresh(); errors = [];
  const t0 = Date.now();
  try {
    await fn();
    if (errors.length) throw new Error('console.error: ' + errors[0]);
    console.log('ok   ' + name + ' (' + (Date.now() - t0) + ' ms)');
  } catch (e) {
    failed++; console.log('FAIL ' + name + ': ' + (e && e.stack || e && e.message || JSON.stringify(e)));
  }
}
cores.forEach(p => p.core.destroy());
console.log(failed ? failed + ' of ' + checks.length + ' failed' : 'all ' + checks.length + ' passed');
process.exit(failed ? 1 : 0);
