// Settings page (the cog at the bottom right of the photo, or Esc on the main page): sound, paper edges, pop-up replay, a demo brawl, the online
// lobby, how to play, and the keys for one player and for two players on one keyboard. Click a key slot, then press the new key (Backspace
// clears a second slot, Esc cancels); a key already used in that layout swaps places. Saved in this browser through Brawl.keys.
// window.Settings = window.Controls = { open(), close() }. The sound, paper and replay switches live in index.html (window.Game).
(() => {
'use strict';
const NAMES = { up: 'MOVE UP', left: 'MOVE LEFT', down: 'MOVE DOWN', right: 'MOVE RIGHT', punch: 'PUNCH', kick: 'KICK', grab: 'GRAB / THROW', jump: 'JUMP', special: 'SPECIAL' };
const TIPS = [
  'Click a guest to pick your fighter, choose VS CPU, 2 PLAYERS or ONLINE, pick a rival and press FIGHT.',
  'Combos: when a blow lands, keep pressing. Punch, punch, punch = jab, cross, UPPERCUT (it launches them: jump and hit them again in the air). Punch, punch, kick = roundhouse. Kick, kick, kick = low kick, snap kick, spin kick.',
  'Double-tap toward your rival to ROLL through them, away to roll back, up or down to sidestep (or hold a direction and press ROLL). A roll can\'t be hit in its middle, but rolling over and over gets slower. Right after a blow lands, ROLL dashes after them.',
  'Hold a direction to run; punch or kick while running = DROPKICK.',
  'Everything has an answer. BLOCK (hold away from your rival) stops punches and kicks from the front, but not a grab or a hit from behind, and every blocked blow wears the ring of guard under your feet down: when it runs out, your guard breaks. GRAB beats a block but loses to a blow already swinging. Press GRAB the moment you are grabbed to slip out. A low kick (kick on its own) trips anyone running. JUMP clears low kicks and grabs, but an uppercut swats you out of the air. Hit someone mid-swing for a COUNTER.',
  'SPECIAL: every blow that lands fills a pip of your star bar; getting hit costs two. Eight pips = your character\'s own ridiculous curse, and a full bar carries into the next round. The curse runs along the floor: jump, roll or sidestep to dodge it, block to halve it. Mash buttons to shake off the stuck ones.',
  'Grab next to forks, bottles, shoes, plates and ray guns picks them up; grab again to throw. A champagne bottle fires its cork.',
  'Puddles are slippery. Jump over flying things.',
  'If Moshik the photographer flashes you from the front you are blinded for 2 seconds: turn away or jump.',
  'When your rival\'s health hits zero in the deciding round: FINISH THEM! Press any attack for your finishing move.',
  'On a phone: the stick appears wherever your left thumb lands; the buttons are under your right thumb. Controllers: press any button to join (A jump, B grab/throw, X punch, Y kick, RB special, LB roll). Esc leaves the fight.',
];
const CSS = `
#settings { position: absolute; inset: 0; z-index: 8; overflow: auto; box-sizing: border-box; background: rgba(12, 8, 4, .94); color: #fff;
  padding: max(3cqh, env(safe-area-inset-top, 0px)) max(3cqw, env(safe-area-inset-right, 0px)) max(3cqh, env(safe-area-inset-bottom, 0px)) max(3cqw, env(safe-area-inset-left, 0px));
  font: max(10px, 1.6cqh)/1.6 "Press Start 2P", ui-monospace, monospace; }
#settings[hidden] { display: none; }
#settings h2 { margin: 0 0 1.5cqh; font: 400 max(20px, 6cqh)/1 "Bungee", Impact, sans-serif; color: #ffd23f; text-shadow: 0 .5cqh 0 #1d0d00; }
#settings h3 { margin: 2.5cqh 0 1cqh; font: 400 max(11px, 2.6cqh)/1 "Bungee", Impact, sans-serif; color: #ffd23f; }
#settings .cols { display: flex; gap: 3cqw; flex-wrap: wrap; }
#settings .cols > div { flex: 1 1 18em; min-width: 0; }
#settings ul { margin: 0; padding-left: 1.2em; } #settings li { margin: .6em 0; }
#settings table { border-collapse: collapse; } #settings td { padding: .35em .6em .35em 0; white-space: nowrap; }
#settings .key { min-width: 4.2em; padding: .5em .7em; font: inherit; color: #1d0d00; background: #ffd23f; border: 2px solid #1d0d00; border-radius: 4px; cursor: pointer; }
#settings .key.empty { background: rgba(255, 255, 255, .15); color: #fff; }
#settings .key.wait { background: #ff4d3a; color: #fff; animation: kb 1s steps(1) infinite; }
@keyframes kb { 50% { opacity: .5; } }
#settings .head { display: flex; justify-content: space-between; align-items: center; gap: 1em; flex-wrap: wrap; margin-bottom: 1.5cqh; }
#settings .head h2 { margin: 0; }
#settings .bar { display: flex; gap: 1em; flex-wrap: wrap; }
#settings .bar button { font: inherit; padding: .8em 1.4em; border: 2px solid #1d0d00; border-radius: 6px; cursor: pointer; background: #fff; color: #1d0d00; }
#settings .bar button:hover, #settings .bar button:focus-visible { background: #fff3b8; outline: none; }
#settings .bar .go { background: #ffd23f; }
#settings .opt { display: flex; gap: .8em; align-items: center; margin: 1.2cqh 0; cursor: pointer; color: #ffd23f; }
#settings .opt input { width: 1.4em; height: 1.4em; accent-color: #ffd23f; }
#settings .game .bar { margin-top: 2cqh; }
#settings .p1 { color: #ff4d3a; } #settings .p2 { color: #3aa0ff; }`;
let root = null, keys = null, wait = null, prev = null;
const pingOn = () => { try { return localStorage.getItem('brawl-lobby-ping') !== '0'; } catch (e) { return true; } };
const G = () => window.Game || {};
const hasKeys = () => !!(window.Brawl && window.Brawl.keys);
const GAME = {  // the buttons of the GAME section: leave the settings first, they open things over the whole screen
  replay: () => window.Game && window.Game.replay(),
  demo: () => window.Brawl && window.Brawl.start(),
  online: () => window.Lobby && window.Lobby.open(),
};

function build() {
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  root = document.createElement('div'); root.id = 'settings'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Settings');
  (document.querySelector('.stage') || document.body).append(root);
  root.addEventListener('change', e => {
    const d = e.target.dataset;
    if (d.ping !== undefined) try { localStorage.setItem('brawl-lobby-ping', e.target.checked ? '1' : '0'); } catch (err) {}
    else if (d.sound !== undefined && window.Game) window.Game.sound = e.target.checked;
    else if (d.paper !== undefined && window.Game) window.Game.paper = e.target.checked;
  });
  root.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act) { wait = { set: b.dataset.set, p: +b.dataset.p, act: b.dataset.act, slot: +b.dataset.slot }; render(); }
    else if (b.dataset.reset !== undefined) { keys = window.Brawl.keys.defaults(); save(); }
    else if (b.dataset.done !== undefined) close();
    else if (b.dataset.game) { close(); GAME[b.dataset.game](); }
  });
}
function table(set, p, title, cls) {
  const m = keys[set][p], n = window.Brawl.keys.name;
  const rows = window.Brawl.keys.actions.map(a => `<tr><td>${NAMES[a] || String(a).toUpperCase()}</td>` + [0, 1].map(slot => {
    const code = (m[a] || [])[slot], waiting = wait && wait.set === set && wait.p === p && wait.act === a && wait.slot === slot;
    return `<td><button class="key${waiting ? ' wait' : code ? '' : ' empty'}" data-set="${set}" data-p="${p}" data-act="${a}" data-slot="${slot}"
      aria-label="${NAMES[a] || a} key ${slot + 1}">${waiting ? 'PRESS' : code ? n(code) : '+'}</button></td>`;
  }).join('') + '</tr>').join('');
  return `<div><h3 class="${cls || ''}">${title}</h3><table>${rows}</table></div>`;
}
function render() {
  const sound = 'sound' in G() ? G().sound : !(window.SFX && window.SFX.muted), paper = 'paper' in G() ? G().paper : true;
  const tables = hasKeys() ? `<div class="head"><h3 style="margin:0">KEYS</h3><div class="bar"><button data-reset>RESET KEYS</button></div></div>
    <div class="cols">${table('solo', 0, 'ONE PLAYER (VS CPU, ONLINE)')}${table('duo', 0, 'TWO PLAYERS: P1', 'p1')}${table('duo', 1, 'TWO PLAYERS: P2', 'p2')}</div>
    <p>Click a key, then press the new one. Backspace clears a second key, Esc cancels.</p>` : '';
  root.innerHTML = `<div class="head"><h2>SETTINGS</h2><div class="bar"><button class="go" data-done>DONE</button></div></div>
    <div class="game"><h3>GAME</h3>
      <label class="opt"><input type="checkbox" data-sound ${sound ? 'checked' : ''}> SOUND</label>
      <label class="opt"><input type="checkbox" data-paper ${paper ? 'checked' : ''}> PAPER EDGES</label>
      <label class="opt"><input type="checkbox" data-ping ${pingOn() ? 'checked' : ''}> PING ME WHEN SOMEONE ENTERS THE ONLINE LOBBY</label>
      <div class="bar"><button data-game="replay">POP UP AGAIN</button><button data-game="demo">WATCH A DEMO BRAWL</button><button data-game="online">PLAY ONLINE</button></div></div>
    <h3>HOW TO PLAY</h3><ul>${TIPS.map(t => `<li>${t}</li>`).join('')}</ul>${tables}`;
}
function save() { window.Brawl.keys.set(keys); wait = null; render(); }
addEventListener('keydown', e => {  // capture before the game or the 3D page sees it
  if (!root || root.hidden) return;
  if (!wait) { if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } return; }  // other keys work the page (Tab, Enter, Space)
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.code === 'Escape') { wait = null; return render(); }
  const m = keys[wait.set][wait.p], list = m[wait.act] || (m[wait.act] = []);
  if (e.code === 'Backspace' || e.code === 'Delete') { if (wait.slot === 1) list.splice(1, 1); return save(); }
  for (const pl of keys[wait.set]) for (const a in pl) {  // a key can only do one thing per layout: the old owner gets this slot's key
    const i = pl[a].indexOf(e.code);
    if (i >= 0 && !(pl === m && a === wait.act)) { if (list[wait.slot]) pl[a][i] = list[wait.slot]; else pl[a].splice(i, 1); if (!pl[a].length) pl[a].push(list[0]); }
  }
  list[wait.slot] = e.code;
  save();
}, true);
function open() {
  if (!root) build();
  if (!root.hidden) return;
  keys = hasKeys() ? window.Brawl.keys.get() : null; wait = null; render();
  prev = document.activeElement; root.hidden = false;
  const go = root.querySelector('.go'); if (go) go.focus({ preventScroll: true });
  window.SFX && SFX.play('swing');
}
function close() {
  if (!root || root.hidden) return;
  root.hidden = true; wait = null;
  if (prev && prev.isConnected && prev.focus) prev.focus({ preventScroll: true });
  prev = null;
}
window.Settings = window.Controls = { open, close, get isOpen() { return !!root && !root.hidden; } };
})();
