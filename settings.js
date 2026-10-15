// Controls page: how to play, and the keys for one player and for two players on one keyboard. Click a key slot, then press
// the new key (Backspace clears a second slot, Esc cancels); a key already used in that layout swaps places. Saved in this
// browser through Brawl.keys. window.Controls = { open(), close() }.
(() => {
'use strict';
const NAMES = { up: 'MOVE UP', left: 'MOVE LEFT', down: 'MOVE DOWN', right: 'MOVE RIGHT', punch: 'PUNCH', kick: 'KICK', grab: 'GRAB / THROW', jump: 'JUMP' };
const TIPS = [
  'Click a guest to pick your fighter, choose VS CPU, 2 PLAYERS or ONLINE, pick a rival and press FIGHT.',
  'Combos: when a blow lands, keep pressing. Punch, punch, punch = jab, cross, UPPERCUT (launches them: hit them again in the air). Punch, punch, kick = roundhouse. Kick, kick = spin kick.',
  'Hold a direction to run; punch or kick while running = DROPKICK. Jump and punch or kick for an air attack.',
  'Grab right next to your rival = SUPLEX. Hold away from your rival to block. The arrow over them means you are in reach.',
  'Grab next to forks, bottles, shoes, plates and ray guns picks them up; grab again to throw. A champagne bottle fires its cork.',
  'Puddles are slippery. Jump over flying things.',
  'If Moshik the photographer flashes you from the front you are blinded for 2 seconds: turn away or jump.',
  'When your rival\'s health hits zero: FINISH THEM! Press any attack for your finishing move.',
  'Controllers: press any button to join (A jump, B grab/throw, X punch, Y kick). Esc leaves the fight.',
];
const CSS = `
#controls { position: absolute; inset: 0; z-index: 8; overflow: auto; padding: 3cqh 3cqw; box-sizing: border-box; background: rgba(12, 8, 4, .94);
  color: #fff; font: max(8px, 1.6cqh)/1.6 "Press Start 2P", ui-monospace, monospace; }
#controls h2 { margin: 0 0 1.5cqh; font: 400 max(20px, 6cqh)/1 "Bungee", Impact, sans-serif; color: #ffd23f; text-shadow: 0 .5cqh 0 #1d0d00; }
#controls h3 { margin: 2.5cqh 0 1cqh; font: 400 max(11px, 2.6cqh)/1 "Bungee", Impact, sans-serif; color: #ffd23f; }
#controls .cols { display: flex; gap: 3cqw; flex-wrap: wrap; }
#controls .cols > div { flex: 1 1 18em; min-width: 0; }
#controls ul { margin: 0; padding-left: 1.2em; } #controls li { margin: .6em 0; }
#controls table { border-collapse: collapse; } #controls td { padding: .35em .6em .35em 0; white-space: nowrap; }
#controls .key { min-width: 4.2em; padding: .5em .7em; font: inherit; color: #1d0d00; background: #ffd23f; border: 2px solid #1d0d00; border-radius: 4px; cursor: pointer; }
#controls .key.empty { background: rgba(255, 255, 255, .15); color: #fff; }
#controls .key.wait { background: #ff4d3a; color: #fff; animation: kb 1s steps(1) infinite; }
@keyframes kb { 50% { opacity: .5; } }
#controls .head { display: flex; justify-content: space-between; align-items: center; gap: 1em; flex-wrap: wrap; margin-bottom: 1.5cqh; }
#controls .head h2 { margin: 0; }
#controls .bar { display: flex; gap: 1em; flex-wrap: wrap; }
#controls .bar button { font: inherit; padding: .8em 1.4em; border: 2px solid #1d0d00; border-radius: 6px; cursor: pointer; background: #fff; color: #1d0d00; }
#controls .bar .go { background: #ffd23f; }
#controls .opt { display: flex; gap: .8em; align-items: center; margin: 1.5cqh 0; cursor: pointer; color: #ffd23f; }
#controls .opt input { width: 1.4em; height: 1.4em; accent-color: #ffd23f; }
#controls .p1 { color: #ff4d3a; } #controls .p2 { color: #3aa0ff; }`;
let root = null, keys = null, wait = null;
const pingOn = () => { try { return localStorage.getItem('brawl-lobby-ping') !== '0'; } catch (e) { return true; } };

function build() {
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  root = document.createElement('div'); root.id = 'controls'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Controls');
  document.querySelector('.stage').append(root);
  root.addEventListener('change', e => { if (e.target.dataset.ping !== undefined) try { localStorage.setItem('brawl-lobby-ping', e.target.checked ? '1' : '0'); } catch (err) {} });
  root.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act) { wait = { set: b.dataset.set, p: +b.dataset.p, act: b.dataset.act, slot: +b.dataset.slot }; render(); }
    else if (b.dataset.reset !== undefined) { keys = window.Brawl.keys.defaults(); save(); }
    else if (b.dataset.done !== undefined) close();
  });
}
function table(set, p, title, cls) {
  const m = keys[set][p], n = window.Brawl.keys.name;
  const rows = window.Brawl.keys.actions.map(a => `<tr><td>${NAMES[a]}</td>` + [0, 1].map(slot => {
    const code = m[a][slot], waiting = wait && wait.set === set && wait.p === p && wait.act === a && wait.slot === slot;
    return `<td><button class="key${waiting ? ' wait' : code ? '' : ' empty'}" data-set="${set}" data-p="${p}" data-act="${a}" data-slot="${slot}"
      aria-label="${NAMES[a]} key ${slot + 1}">${waiting ? 'PRESS' : code ? n(code) : '+'}</button></td>`;
  }).join('') + '</tr>').join('');
  return `<div><h3 class="${cls || ''}">${title}</h3><table>${rows}</table></div>`;
}
function render() {
  root.innerHTML = `<div class="head"><h2>CONTROLS</h2><div class="bar"><button class="go" data-done>DONE</button><button data-reset>RESET KEYS</button></div></div><ul>${TIPS.map(t => `<li>${t}</li>`).join('')}</ul>
    <label class="opt"><input type="checkbox" data-ping ${pingOn() ? 'checked' : ''}> PING ME WHEN SOMEONE ENTERS THE ONLINE LOBBY</label>
    <div class="cols">${table('solo', 0, 'ONE PLAYER (VS CPU, ONLINE)')}${table('duo', 0, 'TWO PLAYERS: P1', 'p1')}${table('duo', 1, 'TWO PLAYERS: P2', 'p2')}</div>
    <p>Click a key, then press the new one. Backspace clears a second key, Esc cancels.</p>`;
}
function save() { window.Brawl.keys.set(keys); wait = null; render(); }
addEventListener('keydown', e => {  // capture before the game or the 3D page sees it
  if (!root || root.hidden) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (!wait) { if (e.code === 'Escape') close(); return; }
  if (e.code === 'Escape') { wait = null; return render(); }
  const m = keys[wait.set][wait.p], list = m[wait.act];
  if (e.code === 'Backspace' || e.code === 'Delete') { if (wait.slot === 1) list.splice(1, 1); return save(); }
  for (const pl of keys[wait.set]) for (const a in pl) {  // a key can only do one thing per layout: the old owner gets this slot's key
    const i = pl[a].indexOf(e.code);
    if (i >= 0 && !(pl === m && a === wait.act)) { if (list[wait.slot]) pl[a][i] = list[wait.slot]; else pl[a].splice(i, 1); if (!pl[a].length) pl[a].push(list[0]); }
  }
  list[wait.slot] = e.code;
  save();
}, true);
function open() {
  if (!window.Brawl || !window.Brawl.keys) return;
  if (!root) build();
  keys = window.Brawl.keys.get(); wait = null; render(); root.hidden = false;
  window.SFX && SFX.play('swing');
}
function close() { if (root) root.hidden = true; wait = null; }
window.Controls = { open, close };
})();
