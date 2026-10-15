// Ballroom brawl: two guests fight among the rest of the wedding, as jointed paper puppets (puppet.js) with chrome parts
// wherever the photo has none. Modes: 'demo' (the CPU plays both until a keyboard or gamepad joins), 'cpu' (P1 climbs a
// three-level CPU ladder), '2p' (two players on one keyboard or two gamepads, best of 3) and 'online' (best of 3 against
// someone from the lobby: the host runs the game, the guest sends its inputs and draws the host's snapshots).
// The guests are their own disaster: at most 8 bystanders at a time walk in and out, drink, ride each other like horses,
// puke, pee in the corner, faint, flip, get abducted by a UFO, and dodge (or pose for) Moshik the photographer, whose
// flash blinds a fighter it catches from the front for 2 seconds. Sounds come from sfx.js.
// window.Brawl.start(pair?, { mode, link, onEnd }), Brawl.stop(), Brawl.state; Brawl.POSE and Brawl.drawItem feed puppets.html.
(() => {
'use strict';
const R = Math.random, TAU = Math.PI * 2, D = Math.PI / 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, pick = a => a[Math.floor(R() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const q2 = v => Math.round(v * 100) / 100, q3 = v => Math.round(v * 1000) / 1000;
const FLOOR = [0.37, 0.97];  // walkable band of the ballroom picture: back and front edge, as fractions of its height
const HP = 112, ROUND_SECONDS = 60, CROWD = 7;  // guests on the floor at once; with the photographer, 8 bystanders
const WALK = .42, WALK_BACK = .34, ZWALK = .35, RUN = 1.9, RUN_HOLD = .18;  // floor widths (depths) a second: forward, backing off, in depth; running; hold to run
const REACH = 1.5, REACHES = { jab: .09, cross: .10, upper: .07, low: .12, snap: .11, round: .13, spin: .12, dropkick: .18 };  // floor widths
const ROLLS = {  // dodges: seconds, distance, and the stretch of it that can't be hit (never the first frames)
  fwd: { t: .45, d: .20, safe: [.05, .25] }, back: { t: .55, d: .15, safe: [.08, .28] }, side: { t: .25, d: .12, safe: null }, chase: { t: .15, d: .10, safe: null } };
const TAP = .2;  // double-tap window (s)
const GUARDBAR = { regen: .2 };  // the guard refills this much a second after a second without blocking; empty = GUARD BREAK
const CAST_T = .55, CAST_HIT = .45;  // a special: the bolt reaches the rival CAST_HIT after the super freeze; the caster is free again soon after
const LEVELS = [  // CPU ladder: seconds between decisions, attacks per second in reach, speed, damage, odds it jumps a flash
  { name: 'EASY', think: 1, rate: 2.2, speed: .72, dmg: .75, dodge: 0, block: .05, combo: .25, grab: .03, roll: 0 },  // + odds it blocks, chains, throws
  { name: 'MEDIUM', think: .55, rate: 4.5, speed: .92, dmg: 1, dodge: .45, block: .2, combo: .6, grab: .1, roll: .2 },
  { name: 'HARD', think: .3, rate: 8, speed: 1.12, dmg: 1.3, dodge: .9, block: .4, combo: .9, grab: .2, roll: .45 },
];
const DROPS = ['fork', 'fork', 'bottle', 'bottle', 'champagne', 'champagne', 'shoe', 'shoe', 'plate'];
const MOVES = {  // reach in floor widths; t = the whole move, hit = when it lands (s); stun = how long the victim reels, kb = knockback,
  // launch = sends them up for a juggle, knock = knocks them down; pose = how the puppet moves; heavy = a big swing sound
  jab: { dmg: 4, reach: .058, t: .22, hit: .07, stun: .34, kb: .1, word: 'JAB!', snd: 'punch', pose: 'punch' },
  cross: { dmg: 5, reach: .062, t: .26, hit: .08, stun: .36, kb: .14, word: 'POW!', snd: 'punch', pose: 'punch' },
  upper: { dmg: 7, reach: .058, t: .4, hit: .12, launch: 2.5, kb: .12, word: 'UPPERCUT!', snd: 'kick', pose: 'upper', heavy: 1 },
  round: { dmg: 9, reach: .075, t: .44, hit: .16, knock: 1, kb: .55, word: 'WHAM!', snd: 'kick', pose: 'kick', heavy: 1 },
  low: { dmg: 4, reach: .07, t: .28, hit: .1, stun: .32, kb: .1, word: 'TRIP!', snd: 'thwack', pose: 'lowkick', low: 1 },
  snap: { dmg: 5, reach: .07, t: .3, hit: .1, stun: .36, kb: .16, word: 'SNAP!', snd: 'kick', pose: 'kick' },
  spin: { dmg: 9, reach: .08, t: .48, hit: .2, knock: 1, kb: .6, word: 'SPIN KICK!', snd: 'kick', pose: 'spin', heavy: 1 },
  dropkick: { dmg: 10, reach: .085, t: .5, hit: .14, knock: 1, kb: .7, lunge: .5, word: 'DROPKICK!', snd: 'kick', pose: 'dropkick', heavy: 1 },
  airp: { dmg: 5, reach: .065, t: .3, hit: .08, stun: .36, kb: .12, word: 'BOP!', snd: 'punch', pose: 'punch', air: 1 },
  airk: { dmg: 7, reach: .078, t: .42, hit: .1, knock: 1, kb: .45, word: 'FLYING KICK!', snd: 'kick', pose: 'airkick', air: 1, heavy: 1 },
  fork: { dmg: 8, reach: .07, t: .3, hit: .12, stun: .36, kb: .15, word: 'POKE!', snd: 'poke', pose: 'punch' },
  bottle: { dmg: 11, reach: .07, t: .38, hit: .16, stun: .4, kb: .3, word: 'CLONK!', snd: 'clonk', pose: 'swing', heavy: 1 },
  champagne: { dmg: 9, reach: .07, t: .38, hit: .16, stun: .4, kb: .25, word: 'BONK!', snd: 'bonk', pose: 'swing' },
  shoe: { dmg: 6, reach: .062, t: .3, hit: .12, stun: .36, kb: .15, word: 'THWACK!', snd: 'thwack', pose: 'swing' },
  plate: { dmg: 7, reach: .062, t: .3, hit: .12, stun: .36, kb: .2, word: 'CRASH!', snd: 'crash', pose: 'swing' },
  raygun: { dmg: 7, reach: .065, t: .3, hit: .12, stun: .36, kb: .15, word: 'BONK!', snd: 'bonk', pose: 'swing' },
  fist: { dmg: 0, reach: 0, t: .3, hit: .1, word: '', snd: 'swing', pose: 'throw' },  // throwing what's in hand: no blow of its own
};
for (const k in MOVES) { MOVES[k].key = k; MOVES[k].reach = REACHES[k] || MOVES[k].reach * REACH; }
MOVES.round.wide = MOVES.spin.wide = 1; MOVES.spin.around = 1;  // they sweep: wide in depth, and a spin kick hits behind too
// what a landed blow can cancel into (hit-confirm chains): jab > cross > uppercut (launch) or roundhouse; low kick > spin kick
const CHAIN = { jab: { punch: 'cross', kick: 'snap' }, cross: { punch: 'upper', kick: 'round' }, low: { punch: 'cross', kick: 'snap' }, snap: { punch: 'cross', kick: 'spin' },
                airp: { punch: 'airp', kick: 'airk' } };  // in the air: a second blow if the first one lands
const THROWN = { cork: [10, 'POP!', 'thwack'], laser: [12, 'ZAP!', 'zap'], fork: [9, 'POKE!', 'poke'], bottle: [12, 'SMASH!', 'smash'],
                 champagne: [11, 'BONK!', 'bonk'], shoe: [8, 'THWACK!', 'thwack'], plate: [9, 'CRASH!', 'crash'], raygun: [9, 'BONK!', 'bonk'] };
const CRIES = ['WAAAH!', 'MY DRESS!', 'NOT AT A WEDDING!', 'MOMMY!', 'OW OW OW', 'WHY ME?!', 'MY HAIR!'];
const GASPS = ['OMG!', 'WOOO!', 'FIGHT! FIGHT!', 'CALL SECURITY!', 'NOT THE CAKE!', 'GET HIM!'];
const EWW = ['EWW!', 'GROSS!', 'MY SHOES!', 'NOT AGAIN!', 'BLEUGH'];
const NOPE = ['NO!', 'NOOO!', 'NO PHOTOS!', 'NOT MY BAD SIDE!', 'I LOOK AWFUL!'];
const SMILE = ['SMILE!', 'SAY CHEESE!', 'LOOK HERE!', 'GORGEOUS!', 'ONE MORE!', 'FOR THE ALBUM!'];
const DOWN = new Set(['down', 'cry', 'ko', 'slip', 'getup', 'faint', 'flip', 'beam', 'fall', 'grabbed', 'bent']);  // can't be hit or act
// what the fighters say (subtitles + cartoon blips, no voice). {T} = the other fighter. Each guest's own 1-2 punchlines
// come from nicknames.js (NICKNAMES[k].lines) and are used at random moments and after a combo.
const TAUNT = ['{T}, you dance like a folding chair!', 'I\'m gonna toast you, {T}!', 'You\'re going home in a doggy bag!', 'This is MY dance floor!',
  'I\'ve fought tougher wedding cake!', 'Say goodbye to the open bar, {T}!', 'After this you sit at the kids\' table!', 'I\'ll RSVP you to the floor!',
  'You\'re uninvited, {T}!', 'I\'ll fold you like a napkin!', 'Your table number is ZERO!', 'The DJ is playing your exit song!'];
const REPLY = ['Big words for a plus-one!', 'Talk is cheap. The bar is free!', 'Oh, it\'s ON!', 'You\'ll regret that, {T}!', 'I\'ll cut you like the cake!',
  'Bring it, {T}!', 'Nobody puts me in a corner!', 'Cute. Now dance!'];
const BEG = ['Please! I have a plus-one!', 'Not in front of the photographer!', 'Wait! You can have my cake!', 'I take it back! ALL of it!',
  'Mercy! I still have to dance!', 'Please don\'t! I brought a gift!', 'I\'ll say you won! Promise!', 'Not the face! Not the face!',
  'I only came for the open bar!', 'Please don\'t hurt me! I\'m on the guest list!'];
// Moshik, when the match is over: one gripe from the bag, then a cry for whiskey
const GRIPES = ['My favourite part of a wedding... is the end.', 'Fourteen hours on my feet. The cake lasted four minutes.',
  'Nobody looks at the camera. NOBODY.', 'Two thousand photos, and they will pick the blurry one.', 'I asked for golden hour. I got a golden retriever.',
  'The DJ played the same song nine times. I counted.', 'My back has filed for divorce.', 'They want candids. Then they ask why they look candid.',
  'Every aunt here is a photographer now. With a phone. In my shot.', 'I ate one canape. ONE. They called it dinner.',
  'Next wedding I charge per tantrum.', 'Somebody sat on my lens cap. I know who you are.', 'In my day the brawl started AFTER the speeches.',
  'I came to shoot a wedding, not a war.', 'Group photo took forty minutes. Then the uncle went to the toilet.',
  'This is why I do landscapes now. Mountains don\'t punch.', 'Love is beautiful. The lighting is not.', 'The bride said "just natural". Natural took six hours.',
  'A hundred weddings. This one wins. Unfortunately.', 'My face hurts from watching you all smile.', 'Someone asked me if I do bar mitzvahs. Not anymore.',
  'My memory card is full. So is my patience.', 'Who puts a dance floor on GRASS?', 'I\'m not crying. It\'s the smoke machine. There is no smoke machine.',
  'Every year I say last wedding. Every year I lie.', 'They paid for the gold package. They got the full disaster.',
  'Somebody did bunny ears in every single photo. I will find you.', 'The flowers have better posture than the groomsmen.',
  'I have photographed sharks with better table manners.', 'Ten years of art school for THIS.'];
const WHISKEY = ['Somebody get me a WHISKEY!', 'WHISKEY! Neat! NOW!', 'Is there a bartender in this building?! WHISKEY!',
  'I\'ll trade the whole album for one whiskey!', 'Bartender! The brown stuff! Lots of it!', 'Whiskey. Double. Make it a triple.',
  'No whiskey, no photos. I\'m deleting everything!', 'You, in the suit! Whiskey! Chop chop!', 'Whiskey me. Whiskey me NOW.',
  'Who do I have to flash to get a whiskey around here?'];
const GLOAT = ['And THAT is how we do weddings!', 'Somebody cue my victory song!', 'Next!', 'Who wants cake?', 'Best. Wedding. Ever.'];
const lines = k => (window.NICKNAMES && window.NICKNAMES[k] && window.NICKNAMES[k].lines) || [];
const SHAPES = {  // item art in item units (~80 tall), grip at 0,0, pointing up; drawn with a white paper rim like the cut-outs
  fork: [['r', -3, -48, 6, 60, '#cfd5dd'], ['r', -11, -58, 22, 10, '#cfd5dd'], ['r', -11, -84, 4, 28, '#cfd5dd'],
         ['r', -4.5, -84, 4, 28, '#cfd5dd'], ['r', 2, -84, 4, 28, '#cfd5dd'], ['r', 7, -84, 4, 28, '#cfd5dd']],
  bottle: [['r', -13, -22, 26, 56, '#2f7d4f'], ['r', -5, -50, 10, 30, '#2f7d4f'], ['r', -13, -2, 26, 18, '#f1e2b3']],
  champagne: [['r', -14, -22, 28, 58, '#1d4a32'], ['r', -5, -52, 10, 32, '#1d4a32'], ['r', -7, -60, 14, 18, '#d8b445'], ['r', -14, 0, 28, 14, '#d8b445']],
  cork: [['r', -5, -6, 10, 12, '#c8a165']],
  gift: [['r', -18, -34, 36, 34, '#e84a8a'], ['r', -4, -34, 8, 34, '#ffd23f'], ['r', -18, -22, 36, 7, '#ffd23f']],
  shoe: [['p', new Path2D('M-34 -2C-34-20-10-24 6-14L30-4C37-1 37 5 30 7L-34 7Z'), '#d0213b'], ['r', -34, 7, 7, 22, '#8c1026']],
  plate: [['e', 0, 0, 34, 12, '#fbfbfb'], ['e', 0, 0, 21, 7, '#e3e3e3']],
  raygun: [['r', -6, -4, 12, 26, '#8d1d26'], ['r', -12, -18, 40, 18, '#c62f3a'], ['r', 0, -24, 4, 30, '#c9d1d9'], ['r', 10, -24, 4, 30, '#c9d1d9'],
           ['r', 26, -14, 18, 10, '#c9d1d9'], ['e', 47, -9, 6, 6, '#7dff6a']],
};
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
// the crowd's needs (0 = fine, 1 = urgent), how fast each grows per second, and the room's objects: where they are on the
// floor (z = 0 is the back wall), how many guests fit, and what a visit satisfies
const NEEDS = ['thirst', 'hunger', 'bladder', 'fun', 'social', 'tired', 'nosy'];
const GROW = { thirst: .018, hunger: .01, bladder: .007, fun: .014, social: .01, tired: .006, nosy: .016 };
const SPOTS = [
  { key: 'bar', x: .1, z: .1, slots: 3, ads: { thirst: 1, social: .3 }, act: 'drink' },
  { key: 'cake', x: .885, z: .12, slots: 2, ads: { hunger: 1, fun: .2 }, act: 'eat' },
  { key: 'dj', x: .5, z: .05, slots: 4, ads: { fun: 1, social: .5 }, act: 'dance' },
  { key: 'loo', x: .965, z: .02, slots: 1, ads: { bladder: 1.5 }, act: 'loo' },
  { key: 'chairs', x: .045, z: .5, slots: 2, ads: { tired: 1 }, act: 'sit' },
  { key: 'gifts', x: .3, z: .13, slots: 2, ads: { nosy: .9 }, act: 'gift' },
  { key: 'booth', x: .7, z: .04, slots: 2, ads: { fun: .7, social: .6 }, act: 'booth' },
];
const LOO = SPOTS.find(s => s.key === 'loo'), WATCH = { key: 'watch', act: 'watch', x: .5, z: .5 };

// ---- keys: physical KeyboardEvent.code, so any keyboard language works. One player: WASD + J/K/L + Space.
// Two players on one keyboard: P1 on the left (WASD, X C V, Z), P2 on the right (IJKL, , . /, M).
const DEFAULT_KEYS = {
  solo: [{ up: ['KeyW', 'ArrowUp'], left: ['KeyA', 'ArrowLeft'], down: ['KeyS', 'ArrowDown'], right: ['KeyD', 'ArrowRight'],
           punch: ['KeyJ'], kick: ['KeyK'], grab: ['KeyL'], jump: ['Space'], special: ['KeyI'] }],
  duo: [{ up: ['KeyW'], left: ['KeyA'], down: ['KeyS'], right: ['KeyD'], punch: ['KeyX'], kick: ['KeyC'], grab: ['KeyV'], jump: ['KeyZ'], special: ['KeyB'] },
        { up: ['KeyI'], left: ['KeyJ'], down: ['KeyK'], right: ['KeyL'], punch: ['Comma'], kick: ['Period'], grab: ['Slash'], jump: ['KeyM'], special: ['KeyN'] }],
};
const ACTIONS = ['up', 'left', 'down', 'right', 'punch', 'kick', 'grab', 'jump', 'special'];
const copyKeys = k => JSON.parse(JSON.stringify(k));
let LAYOUT = copyKeys(DEFAULT_KEYS);  // the Controls page (settings.js) remaps these; saved per browser
try {
  const saved = JSON.parse(localStorage.getItem('brawl-keys'));
  for (const set of ['solo', 'duo']) if (saved && Array.isArray(saved[set])) {
    const used = new Set(saved[set].flatMap(m => m ? Object.values(m).flat() : []));
    saved[set].forEach((m, i) => ACTIONS.forEach(a => {  // an action added since they saved gets its default key, unless that key is taken
      if (m && !m[a] && DEFAULT_KEYS[set][i]) m[a] = DEFAULT_KEYS[set][i][a].filter(c => !used.has(c));
    }));  // nothing free: the layout fails the check below and falls back to the defaults
  }
  const ok = l => Array.isArray(l) && l.every(m => ACTIONS.every(a => Array.isArray(m[a]) && m[a].length && m[a].every(c => typeof c === 'string' && c.length < 24)));
  if (saved && ok(saved.solo) && ok(saved.duo) && saved.solo.length === 1 && saved.duo.length === 2) LAYOUT = saved;
} catch {}
const keyName = c => ({ Space: 'Space', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Minus: '-', Equal: '=', Backquote: '`', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter', Tab: 'Tab' })[c]
  || c.replace(/^Key|^Digit|^Numpad/, '').replace(/^(Shift|Control|Alt|Meta)(Left|Right)$/, (m, k, s) => `${s === 'Left' ? 'L' : 'R'}-${k === 'Control' ? 'Ctrl' : k}`);
const helpFor = m => `${['up', 'left', 'down', 'right'].map(a => keyName(m[a][0])).join('')} move · ${keyName(m.punch[0])} punch · ${keyName(m.kick[0])} kick · ${keyName(m.grab[0])} grab/throw · ${keyName(m.jump[0])} jump · ${keyName(m.special[0])} special · double-tap to roll`;
const help = two => two ? `P1: ${helpFor(LAYOUT.duo[0])} — P2: ${helpFor(LAYOUT.duo[1])}` : helpFor(LAYOUT.solo[0]);
const CREDITS = 'Sounds: Kenney & OpenGameArt (CC0), crowd by Gregor Quendel (CC BY 4.0)';

// ---- poses for the puppets. A limb is [direction, weight] in the figure's own frame: 0 = forward, D = down, -D = up;
// weight < 1 keeps some of the photo's pose. torso/head/skirt: lean in radians (+ = forward). t = a clock in seconds,
// p = 0..1 through a move, hit = the fraction where the blow lands.
const legs = (f, b, fs = f, bs = b) => ({ fTh: [f], fSh: [fs], bTh: [b], bSh: [bs] });
function stride(t, amp = .45, lift = .7) {  // one step cycle per 2π of t; a leg bends at the knee while it swings forward
  const s = Math.sin(t), c = Math.cos(t);
  return { skirt: .12 * s, fTh: [D - amp * s], bTh: [D + amp * s], fSh: [D - amp * s + lift * Math.max(0, c)], bSh: [D + amp * s + lift * Math.max(0, -c)] };
}
const GUARD = { fUA: [D + .35], fFA: [-1], bUA: [D + .55], bFA: [-1.25] };  // fists up
const STANCE = legs(D - .22, D + .25, D + .05, D + .35), LUNGE = legs(D - .35, D + .35, D - .1, D + .45);
const POSE = {
  stand: t => ({ torso: Math.sin(t * 1.7) * .03, head: Math.sin(t * 1.1) * .05 }),
  guard: t => ({ torso: .08 + Math.sin(t * 6) * .03, ...GUARD, ...STANCE }),
  walk: t => { const s = Math.sin(t); return { ...stride(t), fUA: [D + .35 * s], bUA: [D - .35 * s], fFA: [D + .35 * s - .35], bFA: [D - .35 * s - .35] }; },
  march: t => ({ ...stride(t, .38, .55), ...GUARD, torso: .12 }),
  run: t => ({ ...stride(t, .7, 1.1), torso: .25, fUA: [-D + .5 * Math.sin(t)], fFA: [-D], bUA: [-D - .5 * Math.sin(t)], bFA: [-D] }),
  punch: (t, p, hit) => p < hit ? { torso: -.05, fUA: [D + .7], fFA: [-.5], bUA: [D + .5], bFA: [-1.2], ...STANCE }
                                : { torso: .2, fUA: [-.05], fFA: [-.05], bUA: [D + .7], bFA: [-1.3], ...LUNGE },
  kick: (t, p, hit) => p < hit ? { torso: -.1, fUA: [D - .6], fFA: [-.6], bUA: [D + .9], bFA: [D], ...legs(D - 1.1, D + .1, D + .3, D + .1) }
                               : { torso: -.3, fUA: [D - .9], fFA: [-.5], bUA: [D + 1.2], bFA: [D + .5], ...legs(-.15, D + .15, -.1, D + .15) },
  swing: (t, p, hit) => p < hit ? { torso: -.15, fUA: [-D - .5], fFA: [-D - .9], bUA: [D + .3], bFA: [-.6], ...STANCE }  // overhead, with what's in hand
                                : { torso: .25, fUA: [.5], fFA: [.75], bUA: [D + .6], bFA: [-.8], ...LUNGE },
  upper: (t, p, hit) => p < hit ? { torso: .25, fUA: [D + .3], fFA: [D - .2], bUA: [D + .5], bFA: [-1.2], ...legs(D - .5, D + .3, D + .4, D + .5) }
                                : { torso: -.25, head: -.2, fUA: [-1.35], fFA: [-1.55], bUA: [D + .6], bFA: [-1.2], ...legs(D - .15, D + .2, D - .05, D + .3) },
  lowkick: (t, p, hit) => p < hit ? { torso: .05, ...GUARD, ...legs(D - .5, D + .1, D + .2, D + .1) } : { torso: .15, ...GUARD, ...legs(D - 1.15, D + .15, D - 1.05, D + .2) },
  spin: (t, p, hit) => p < hit ? { torso: -.2, fUA: [D - .9], bUA: [D + 1.1], ...legs(D - .9, D + .15, D + .4, D + .2) }
                               : { torso: -.5, head: -.2, fUA: [D - 1.2], fFA: [-.2], bUA: [D + 1.3], ...legs(-.45, D + .2, -.4, D + .3) },
  dropkick: () => ({ torso: -.6, head: -.3, fUA: [-D - .6], bUA: [-D - .3], ...legs(-.25, -.05, -.2, 0) }),
  airkick: () => ({ torso: -.3, fUA: [-1.2], bUA: [D + 1.2], ...legs(-.15, D - .6, -.1, D + .3) }),
  grip: () => ({ torso: .1, fUA: [-.3], fFA: [-.6], bUA: [-.2], bFA: [-.5], ...LUNGE }),
  sprint: t => ({ ...stride(t, .65, 1), torso: .3, fUA: [D + .7 * Math.sin(t)], fFA: [-.6], bUA: [D - .7 * Math.sin(t)], bFA: [-.6] }),
  aim: () => ({ torso: -.05, fUA: [-.05], fFA: [-.05], bUA: [.35], bFA: [-.1], ...LUNGE }),
  throw: () => ({ torso: .25, fUA: [-.35], fFA: [-.1], bUA: [D + .7], bFA: [D], ...LUNGE }),
  jump: () => ({ torso: .1, fUA: [-.9], fFA: [-1.5], bUA: [-1.3], bFA: [-1.9], ...legs(D - 1.1, D - .5, D + .2, D + .6) }),
  hit: () => ({ torso: -.35, head: -.3, fUA: [D - 1.1], fFA: [D - 1.6], bUA: [D - .7], bFA: [D - 1.3], ...legs(D - .3, D + .2, D + .1, D + .4) }),
  lie: () => ({ head: .1, fUA: [-D + .15], fFA: [-D + .3], bUA: [-D - .1], bFA: [-D + .2], ...legs(D - .5, D + .05, D + .5, D + .1) }),
  cry: t => { const k = Math.sin(t * 11); return { head: Math.sin(t * 9) * .12, fUA: [D - .5], fFA: [-D - .5], bUA: [D - .35], bFA: [-D - .3],
    ...legs(D - .2 - .5 * Math.max(0, k), D - .2 - .5 * Math.max(0, -k), D + .1, D + .1) }; },  // a toddler tantrum, flat on the floor
  slip: t => ({ head: -.3, fUA: [-D - .4 + .3 * Math.sin(t * 20)], fFA: [-D], bUA: [-D + .5], bFA: [-D + .3], ...legs(-.3, .1, -.2, .2) }),
  swoon: () => ({ head: -.4, torso: -.1, fUA: [-D + .4], fFA: [-D + .2], bUA: [-D - .3], bFA: [-D - .5], ...legs(D - .1, D + .1) }),
  crouch: () => ({ torso: .6, head: -.4, fUA: [D - .3], fFA: [D], bUA: [D], bFA: [D + .2], ...legs(D - .9, D - .3, D + .5, D + .9) }),
  tuck: () => ({ torso: .2, fUA: [-D], fFA: [-D], bUA: [-D], bFA: [-D], ...legs(-.2, 0, D + .4, D + .6) }),
  flail: t => ({ ...stride(t * 14, .6, .9), head: Math.sin(t * 7) * .2, fUA: [-D + .5 * Math.sin(t * 14)], fFA: [-D], bUA: [-D - .5 * Math.sin(t * 14)], bFA: [-D] }),
  puke: t => ({ torso: .85 + Math.sin(t * 20) * .04, head: .15, fUA: [D - .25], fFA: [D + .25], bUA: [D - .15], bFA: [D + .3], ...legs(D - .15, D + .2, D + .05, D + .25) }),
  drink: t => { const sway = Math.sin(t * 2) * .06; return t % 2.4 < 1.4  // sip, then lower the bottle, then sip again
    ? { torso: -.1 + sway, head: -.45, fUA: [-.35], fFA: [-2.75], bUA: [D + .1], bFA: [D - .2] }
    : { torso: sway, head: 0, fUA: [D - .5], fFA: [-.4], bUA: [D + .1], bFA: [D - .2] }; },
  dance: t => { const s = Math.sin(t * 8), up = s > 0; return { torso: .15 * s, head: -.1 * s, fUA: [up ? -1.1 : D + .5], fFA: [up ? -1.2 : D + .4],
    bUA: [D - .3 + .2 * s], bFA: [-.6], ...legs(D - .35 * Math.max(0, s), D + .1, D + .25 * Math.max(0, s), D + .1) }; },
  cheer: t => { const w = .25 * Math.sin(t * 9); return { fUA: [-D + .35 + w], fFA: [-D + .1], bUA: [-D - .35 - w], bFA: [-D - .1] }; },
  pee: () => ({ torso: -.12, head: -.35, fUA: [D - .35], fFA: [D - 1.2], bUA: [D - .3], bFA: [D - 1.1], ...legs(D - .12, D + .12) }),
  horse: t => ({ torso: 1.15, head: -.8, fUA: [D - .1], fFA: [D + .15], bUA: [D], bFA: [D + .2],
    ...legs(D - .25 + .15 * Math.sin(t * 10), D + .2 - .15 * Math.sin(t * 10), D + .1, D + .25) }),
  rider: t => ({ torso: -.15 + .05 * Math.sin(t * 10), head: -.1, fUA: [.55], fFA: [.05], bUA: [-D - .25], bFA: [-D + .7 * Math.sin(t * 12)],
    ...legs(.25, .55, D + .15, D + .35) }),
  sit: () => ({ torso: -.08, fUA: [D - .2], fFA: [.25], bUA: [D - .1], bFA: [.35], ...legs(.05, .15, D, D + .1) }),
  gift: t => ({ torso: .05 + Math.sin(t * 30) * .04, head: .15, fUA: [.35 + Math.sin(t * 30) * .15], fFA: [-.3], bUA: [.45], bFA: [-.2] }),
  smile: () => ({ head: .12, fUA: [-.2], fFA: [-2.2], bUA: [D + .55], bFA: [D - 1.9] }),  // a peace sign for the album
  shield: () => ({ torso: -.15, head: .25, fUA: [D - .5], fFA: [-1.6], bUA: [D - .3], bFA: [-1.4] }),
  dazed: t => ({ torso: .1 * Math.sin(t * 4), head: .2 * Math.sin(t * 3), fUA: [D - .6], fFA: [-2.2], bUA: [D - .5], bFA: [-2],
    ...legs(D - .2 + .1 * Math.sin(t * 4), D + .2) }),
  camWalk: t => ({ ...stride(t, .4, .6), torso: .03 * Math.sin(t * 2) }),  // the photographer's arms never move: the camera stays in one piece
  camSit: () => ({ torso: -.06, head: .1, ...legs(.05, .15, D, D + .1) }),  // sitting, camera arms untouched
  drag: t => ({ ...stride(t, .35, .5), torso: .25, head: -.1, bUA: [D + 1.1], bFA: [D + .9], fUA: [D - .25], fFA: [D - .1] }),  // pulling a chair along behind
  smoke: k => ({ torso: -.06 + .04 * k, head: .1 - .2 * k, ...legs(.05, .15, D, D + .1), bUA: [D - .25], bFA: [.35],
    fUA: [D - .3 + (2.45 - D + .3) * k], fFA: [.3 + (-1.55 - .3) * k] }),  // the front hand goes from the knee across to the lips and back (angles found on his rig)
  camAim: () => ({ torso: .08, head: .15, ...legs(D - .3, D + .35, D + .05, D + .45) }),
  camShoot: () => ({ torso: -.1, head: -.12, ...legs(D - .3, D + .35, D + .05, D + .45) }),
};

let root, cv, ctx, W = 1, H = 1, S = null, raf = 0, lastT = 0, bg = null, mode = 'demo', net = null, opts0 = {}, pool = null, photogImg = null, photogNoCam = null;
let nextId = 1, sentAt = 0, inSeq = 0, startSeq = 0;
const keys = new Set(), tapped = new Set();  // keys held, and keys pressed since the last frame (a tap shorter than a frame still counts)
const ctrl = ['cpu', 'cpu'];  // who drives P1 / P2: 'cpu' | 'keys' | 'pad' | 'net' (the online guest)
const ladder = { beaten: [] }, match = { wins: [0, 0], used: [], sp: [0, 0] };
const rigs = new Map(), imgs = new Map(), evs = [];
let evSeq = 0;
const layout = () => mode === '2p' ? LAYOUT.duo : LAYOUT.solo;
const mySlot = () => net ? (net.role === 'host' ? 0 : 1) : 0;

// the scenes: the generated ballroom plus the venue's own photos from stages.js (make_stage.py); each match picks one at random.
// floor = the walkable band (back, front) and tall = a person's height there, as fractions of the picture's height
let stage = { name: 'ballroom', floor: FLOOR, tall: [.231, .42] };
const stages = () => [{ name: 'ballroom', img: window.BALLROOM || (window.LAYERS && window.LAYERS.bg), floor: FLOOR, tall: [.231, .42] }, ...(window.STAGES || [])];
const backdrops = new Map();
function useStage(st) {  // switch scene; the picture decodes in the background (the floor works before it arrives)
  stage = st;
  if (!backdrops.has(st.name)) { const im = new Image(); im.src = st.img; backdrops.set(st.name, im.decode().then(() => im, () => null)); }
  backdrops.get(st.name).then(im => { if (stage === st) bg = im; });
}
let pic = { top: 0, h: 1, w: 1, left: 0 }, DPR = 1;  // where the backdrop sits on screen (px); device pixels per CSS pixel
const coarse = () => matchMedia('(pointer: coarse)').matches;  // a phone or tablet: touch controls
function fitPic() {  // cover the screen; when the picture is taller than the screen its top goes first, so the front of the floor stays in view
  const iw = bg ? bg.width : 3, ih = bg ? bg.height : 2, k = Math.max(W / iw, H / ih), h = ih * k;
  const top0 = clamp(Math.min((H - h) / 2, H * .985 - stage.floor[1] * h), H - h, 0);
  pic = { w: iw * k, h, left: (W - iw * k) / 2, top: Math.min(0, Math.max(top0, H * .12 - h * (stage.floor[0] - .85 * stage.tall[0]))) };  // a head at the back of the floor stays on screen
  pic.front = clamp(((coarse() ? .76 : .985) * H - pic.top) / h, stage.floor[0] + .2, stage.floor[1]);  // on a phone the floor stops above the thumbs
}
const feetY = z => pic.top + pic.h * (stage.floor[0] + z * ((pic.front ?? stage.floor[1]) - stage.floor[0]));
const tall = z => pic.h * .85 * (stage.tall[0] + (stage.tall[1] - stage.tall[0]) * z * ((pic.front ?? stage.floor[1]) - stage.floor[0]) / (stage.floor[1] - stage.floor[0]));  // a person's height on screen at depth z (0 = back of the floor)
const logEv = (...a) => { if (net && net.role === 'host') evs.push([++evSeq, performance.now(), ...a]); };  // replayed by the online guest
const toF = y => q3((y - feetY(0)) / ((feetY(1) - feetY(0)) || 1)), fromF = v => feetY(0) + v * (feetY(1) - feetY(0)), unit = () => tall(.5) || H;  // screen y <-> floor band
const snd = (name, x = .5, o = {}) => {
  logEv('s', name, q2(x), q2(o.pitch || 1), q2(o.vol ?? 1), o.dur || 0);
  window.SFX && window.SFX.play(name, Object.assign({ pan: (x - .5) * 1.4 }, o));
};
function art(k) {  // portrait for guest k (or 'photog'), decoded once per page
  const key = k + (window.FIGHTERS ? '' : '-small');
  if (!imgs.has(key)) {
    const i = new Image();
    i.src = k === 'photog' ? window.PHOTOG : (window.FIGHTERS && window.FIGHTERS[k]) || window.LAYERS.cards[k].img;
    imgs.set(key, i.decode().then(() => i, () => null));
  }
  return imgs.get(key);
}
function solid(img) {  // a standing figure: enough of it is opaque, and there is a head at the top
  const c = Object.assign(document.createElement('canvas'), { width: 30, height: 90 }), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, 30, 90);
  const a = g.getImageData(0, 0, 30, 90).data;
  let all = 0, top = 0;
  for (let i = 3; i < a.length; i += 4) if (a[i] > 128) { all++; if (i < 30 * 14 * 4) top++; }
  return all / 2700 > .2 && top / 420 > .12;
}
function rigFor(k, img) {  // the jointed puppet for a portrait, built once (null: draw the flat cut-out)
  if (!window.Puppet || !window.RIGS || !img || !img.naturalWidth) return null;
  const key = k + ':' + img.naturalWidth;
  if (!rigs.has(key)) {
    let r = null;
    try {
      r = Puppet.rig(img, k === 'photog' ? window.PHOTOG_RIG : k === 'photog-nocam' ? window.PHOTOG_NOCAM_RIG : window.RIGS[k],
                     { skirt: k !== 'photog' && k !== 'photog-nocam' && !window.LAYERS.cards[k].cy });
      if (k === 'photog') r.lens = lensOf(img, r);
    } catch (err) { console.warn('flat cut-out for', k, err); }
    rigs.set(key, r);
  }
  return rigs.get(key);
}
function lensOf(img, r) {  // where the flash goes off: the forward-most opaque point in the top half of the photo, as [up, forward]
  const w = img.naturalWidth, rows = Math.round(img.naturalHeight * .45), c = Object.assign(document.createElement('canvas'), { width: w, height: rows });
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const a = g.getImageData(0, 0, w, rows).data, tall0 = r.foot - r.top;
  let bx = r.cx, by = r.J.fw[1];
  for (let y = 0; y < rows; y += 2) for (let x = w - 1; x > bx; x--) if (a[(y * w + x) * 4 + 3] > 128) { bx = x; by = y; break; }
  return [(r.foot - by) / tall0, (bx - r.cx) / tall0];
}
function person(k, img, role, x, z) {
  const name = k === 'photog' ? 'Moshik' : window.guestName ? window.guestName(k) : `Guest ${k + 1}`;
  return { id: nextId++, k, img, rig: rigFor(k, img), ang: {}, sink: 0, role, name, x, z, y: 0, vx: 0, vz: 0, vy: 0, face: x < .5 ? 1 : -1,
           hp: HP, state: 'idle', st: 0, item: null, prop: null, cd: 0, rot: 0, flash: 0, think: 0, goal: null, dest: null, task: null,
           transit: null, run: false, cheer: 0, aimT: 0, talk: 0, quipIn: 14 + R() * 12, walkPh: R() * TAU, at: null, thinkT: R(),
           needs: Object.fromEntries(NEEDS.map(n => [n, .15 + R() * .7])), drunk: R() * .3, brave: R(), party: R(), seed: R() * 9, say: null, inp: {}, prev: {}, move: null, h: 1, X: 0, Y: 0,
           sp: 0, guard: 1, curse: null, curseT: 0, comboDmg: 0 };
}
function set(e, s) {
  if (e.state === 'drink' && s !== 'drink' && e.prop) {  // the bottle goes down with them: a new weapon on the floor
    S.items.push({ type: e.prop, x: clamp(e.x + e.face * .03, .03, .97), z: e.z, y: .5, vy: 1.2, vx: e.face * .15, ammo: 0, hits: 0, held: null });
    e.prop = null;
  }
  if (e.mount && s !== 'rider') { if (e.mount.rider === e) e.mount.rider = null; e.mount = null; }
  if (e.rider && s !== 'horse') { const r = e.rider; e.rider = null; if (r.mount === e) { r.mount = null; set(r, 'fall'); r.vy = .8; say(r, 'WHOA!'); } }
  e.state = s; e.st = 0; e.done = false; e.threw = false;
  if (s === 'cry') { e.cryFor = 2.5 + R() * 3; snd('cry', e.x, { pitch: voice(e) }); }
}
const voice = e => .8 + (e.seed % 1) * .6;  // everyone sobs in their own key
const isCpu = e => e.role === 'fighter' && ctrl[S.players.indexOf(e)] === 'cpu';

// ---- effects (screen pixels; logged in screen fractions for the online guest)
const fx = o => S.fx.length < 600 && S.fx.push(o);
function at(e, up, fwd = 0) {  // a point on the figure, as fractions of its height above the feet / forward
  const c = Math.cos(e.rot), s = Math.sin(e.rot), lx = fwd * e.h, ly = -up * e.h;
  return [e.X + e.face * (lx * c - ly * s), e.Y + lx * s + ly * c];
}
function text(t, x, y, color = '#ffd23f', size = 1) {
  logEv('t', t, q3(x / W), toF(y), color, size);
  fx({ k: 'text', text: t, x, y, vy: -H * .1, life: .9, max: .9, color, size });
}
function pop(t, e, color, size) { const [x, y] = at(e, 1.05); text(t, x, y, color, size); }
function say(e, t) { e.say = { text: t, t: 1.8 }; e.talk = Math.max(e.talk || 0, .5); }
function talk(e, text, o) {  // a subtitled line: typed out at the bottom while the speaker's mouth flaps and blips
  if (!e || !text || !S) return;
  text = String(text).replace(/\{T\}/g, (o && o.to && o.to.name) || 'you').slice(0, 80);
  logEv('v', e.id, text);
  S.subs.push({ who: e, text, t: 0 });
  if (S.subs.length > 3) S.subs.splice(1, 1);  // never fall far behind: drop the oldest waiting line
}
// ---- voices: one sprite per character (voices/<k>.mp3, made on the GPU box) and voices/index.json saying where each line sits in it.
// Without them (or for a line with no recording) the old cartoon voice bits and blips play instead.
let voiced = null, voxP = null;
const voicePack = () => voxP || (voxP = fetch('voices/index.json').then(r => r.ok ? r.json() : null).catch(() => null).then(v => (voiced = v && v.v === 1 ? v : null)));
async function voiceUp(k) {  // fetch one character's voice
  const v = await voicePack();
  return v && v.lines && v.lines[k] && window.SFX && SFX.loadUrl ? SFX.loadUrl('vc' + k, `voices/${k}.mp3`) : false;
}
const recorded = (e, text) => voiced && voiced.lines && voiced.lines[e.k] && voiced.lines[e.k][text];
function pickLine(e, list) {  // a line this character has a recording of, when there is one
  const said = list.filter(t => recorded(e, t));
  return pick(said.length ? said : list);
}
function voiceOf(e) {  // the speaker's voice clip (voices.js, by apparent gender): random per match-up, the same on both online screens
  const V = window.VOICES, n = typeof e.k === 'number' && window.NICKNAMES && window.NICKNAMES[e.k];
  if (!V || !n) return null;
  const h = Math.abs(Math.sin((e.k + 1) * 91.7 + (S.pair ? S.pair[0] * 13.1 + S.pair[1] * 7.3 : 0)) * 1e4) | 0;
  const pool = n.voice === 'm' || n.voice === 'f' ? n.voice : h % 2 ? 'm' : 'f', list = V[pool];
  return list && list.length ? 'v' + pool + (h % list.length) : null;
}
function subs(dt) {  // host and guest alike: type the current line, play the speaker's voice (or blip), flap
  const s = S.subs[0];
  if (!s) return;
  if (s.who.gone && s.who.left) { S.subs.shift(); return; }
  if (s.voice === undefined) {
    const seg = recorded(s.who, s.text);
    if (seg && window.SFX && SFX.has('vc' + s.who.k)) {  // their own voice saying it
      s.voice = 'vc'; s.len = seg[1] / 1000; SFX.play('vc' + s.who.k, { from: seg[0] / 1000, len: seg[1] / 1000, pan: (s.who.x - .5) * 1.2, vol: 1 });
    } else { s.voice = voiceOf(s.who); if (s.voice && window.SFX) SFX.play(s.voice, { pan: (s.who.x - .5) * 1.2, vol: .9 }); }
  }
  const before = Math.floor(s.t * 30); s.t += dt; const now = Math.floor(s.t * 30);
  if (now <= s.text.length || s.t < (s.len || 0)) {
    s.who.talk = .12;
    if (!s.voice && Math.floor(now / 2) > Math.floor(before / 2) && window.SFX) SFX.play('blip', { pan: (s.who.x - .5) * 1.2, pitch: .7 + (s.who.seed % 1) * .8 + R() * .12, vol: .7 });
  }
  if (s.t > Math.max(s.text.length / 30, s.len || 0) + 1.1) S.subs.shift();
}
function drawSubs() {
  const s = S.subs[0];
  if (!s) return;
  const n = Math.min(s.text.length, Math.floor(s.t * 30)), size = H * .03, y = H * (touch.on || coarse() ? .3 : .86), p = S.players.indexOf(s.who);  // on a phone, clear of the thumbs
  const who = s.who.name.toUpperCase() + ': ', text = s.text.slice(0, n);
  ctx.font = `${size}px "Bungee", Impact, sans-serif`;
  const w1 = ctx.measureText(who).width, w2 = ctx.measureText(s.text).width, w = Math.min(W * .94, w1 + w2 + size * 1.4), x = W / 2 - w / 2;
  ctx.fillStyle = 'rgba(10, 6, 2, .72)'; ctx.beginPath(); ctx.roundRect(x, y - size * 1.25, w, size * 1.8, size * .5); ctx.fill();
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = p >= 0 ? TEAM[p] : '#ffd23f'; ctx.fillText(who, x + size * .7, y);
  ctx.fillStyle = '#fff'; ctx.fillText(text, x + size * .7 + w1, y);
}
function spray(x, y, n, color, vx, vy, r, life = .8, local) {
  if (!local) logEv('y', q3(x / W), toF(y), n, color, q3(vx / H), q3(vy / H), q3(r / unit()), life);
  for (let i = 0; i < n; i++) fx({ k: 'drop', x, y, vx: vx * (.4 + R() * .8) + (R() - .5) * H * .15, vy: -vy * (.3 + R() * .9), color, r: r * (.6 + R() * .7), life, max: life });
}
function spark(x, y, r) { logEv('k', q3(x / W), toF(y), q3(r / unit())); fx({ k: 'spark', x, y, life: .22, max: .22, r }); }
function swoosh(x, y, face, r) { logEv('w', q3(x / W), toF(y), face, q3(r / unit())); fx({ k: 'swoosh', x, y, face, r, life: .12, max: .12 }); }
function flashFx(x, y, face, r) { logEv('f', q3(x / W), toF(y), face, q3(r / unit())); fx({ k: 'flash', x, y, face, r, life: .35, max: .35 }); }
function puddle(x, z, kind, size = 1, rate = 3) {
  S.puddles.push({ x: clamp(x, .04, .96), z: clamp(z, .01, .99), r: 0, max: (.03 + R() * .025) * size, kind, life: 30, rate,
                   dots: Array.from({ length: 5 }, () => [R() * 2 - 1, R() * 2 - 1]) });
}
const onPuddle = e => S.puddles.some(p => {
  const sc = .55 + .45 * p.z, dx = (e.x - p.x) / (p.r * sc + 1e-6), dz = (e.z - p.z) / (p.r * .9 * sc + 1e-6);
  return p.r > .01 && dx * dx + dz * dz < 1;
});
const near = (e, list, r) => list.filter(o => o !== e && !o.gone && Math.hypot(o.x - e.x, (o.z - e.z) * 1.5) < r);
function pukeStream(e, dt, splat) {  // projectile style; some of it lands as more puddle
  if (R() >= dt * 50) return;
  const [x, y] = at(e, .86, .06), floor = feetY(e.z);
  fx({ k: 'drop', x, y, vx: e.face * H * (.45 + R() * .45), vy: -H * (.05 + R() * .2), color: pick(['#9ccc35', '#7fae22', '#c8e05a']),
       r: e.h * .016 * (.7 + R() * .7), life: 1.2, max: 1.2, floor, splat: splat ? f => R() < .03 && puddle(f.x / W, e.z + .012, 'puke', .45) : null });
}
function tears(e, dt) { if (R() < dt * 6) { const [x, y] = at(e, .9); spray(x, y, 2, '#7fd3ff', 0, H * .25, e.h * .012, .6, true); } }

// ---- fighting
function attack(e, kind) {  // punch or kick: starts a chain, continues one after a landed blow, or an air / running attack
  const it = e.item;
  if (it && it.ammo > 0 && kind === 'punch' && (it.type === 'champagne' || it.type === 'raygun')) { if (e.cd > 0) return; return it.type === 'champagne' ? fireCork(e) : fireLaser(e); }
  const cur = e.state === 'attack' && e.move, chained = !!(cur && e.hitConfirm);
  let key;
  if (e.y > .05) { if ((e.airN || 0) >= (chained ? 2 : 1)) return; key = kind === 'kick' ? 'airk' : 'airp'; e.airN = (e.airN || 0) + 1; }
  else if (it) key = it.type;
  else if ((e.running || S.t - (e.ranAt ?? -9) < .15) && !chained) key = 'dropkick';  // a short grace: letting go as you kick still counts
  else if (chained && CHAIN[cur.key]) key = CHAIN[cur.key][kind];
  else key = kind === 'kick' ? 'low' : 'jab';
  if (!key || !MOVES[key]) return;
  e.chainN = chained ? (e.chainN || 1) + 1 : 1;
  if (it && e.chainN > 3) return;
  faceFoe(e);
  if ((e.curse === 'cake' || e.curse === 'face') && R() < .5) { e.face = -e.face; pop('?!', e, '#fff6e6', .7); }  // cream in the eyes: half the swings go the wrong way
  e.move = MOVES[key]; set(e, 'attack'); e.hitConfirm = false; e.swingN = (e.swingN || 0) + 1;
  e.vx = e.move.lunge ? e.face * e.move.lunge : e.vx + e.face * (e.move.heavy ? .14 : .1);  // every blow steps in
  snd(e.move.heavy ? 'swingHeavy' : 'swing', e.x, { pitch: e.move.heavy ? .9 : 1.15 });
}
function stepSpeed(e, mx, mz) {  // a little slower backing off than going forward; running nearly doubles it
  const f = S.players.find(p => p !== e), back = mx && f && Math.sign(mx) !== Math.sign(f.x - e.x);
  e.vx = mx * (back ? WALK_BACK : WALK) * (e.running ? RUN : 1); e.vz = mz * ZWALK;
}
function faceFoe(e, any) {  // a blow turns toward a rival who is close and in the lane, so it's never thrown the wrong way by accident
  const f = e.role === 'fighter' && S.players.find(p => p !== e);
  if (f && (any || (Math.abs(f.z - e.z) < .08 && Math.abs(f.x - e.x) < .2))) e.face = Math.sign(f.x - e.x) || e.face;
}
function roll(e, [dx, dz], chase) {  // toward: through the rival (a cross-up); away: slower and safer; up/down: a sidestep; after a landed blow: a short chase dash
  const f = S.players.find(p => p !== e), toward = f ? Math.sign(f.x - e.x) || e.face : e.face;
  if (!dx && !dz) dx = chase ? toward : -toward;  // the ROLL button with the stick at rest: back off (or chase them)
  const kind = chase ? 'chase' : dz && !dx ? 'side' : dx === toward ? 'fwd' : 'back', k = ROLLS[kind];
  e.rollStack = S.t - (e.rolledAt ?? -9) < 1 ? Math.min(5, (e.rollStack || 0) + 1) : 0; e.rolledAt = S.t;  // roll after roll: each one slower, safe a bit later
  const t = k.t * (1 + .08 * e.rollStack);
  set(e, 'roll'); e.roll = { kind, t, dir: [dx, dz], v: k.d / (t * .9), safe: k.safe && [k.safe[0] + .015 * e.rollStack, k.safe[1]] };
  e.dodged = false; e.running = false; e.runT = 0; e.buf = null; if (chase) e.chaseN = (e.chaseN || 0) + 1;
  snd('dash', e.x, { pitch: chase ? 1.5 : 1.2 });
}
const untouchable = v => v.state === 'roll' && v.roll && v.roll.safe && v.st >= v.roll.safe[0] && v.st < v.roll.safe[1];
const canCancel = e => e.state === 'attack' && e.hitConfirm && e.st >= e.move.hit + .03 && (CHAIN[e.move.key] || (e.item && e.move.key === e.item.type));
function blocks(v, a, m) {  // hold away from the attacker: stops punches and kicks from the front (never a grab); the CPU blocks by chance
  if (v.role !== 'fighter' || a.role !== 'fighter' || v.y > .05 || !['idle', 'walk', 'block'].includes(v.state)) return false;
  const away = Math.sign(v.x - a.x);  // roll past someone and "away" flips: their block now faces the wrong way
  if (isCpu(v)) return (v.state === 'block' || R() < (v.lv.block || 0)) && v.face === -away;
  if (S.t - (v.sideAt ?? -9) < .1) return Math.abs(v.inp.mx || 0) > .3;  // just crossed over: either way blocks for a moment
  return (v.inp.mx || 0) * away > .3;
}
function block(v, a, m) {
  const chip = m.heavy ? Math.min(Math.max(0, v.hp - 1), m.dmg * .2) : 0;  // only heavy blows chip, and never the last point
  v.hp -= chip; v.guard = (v.guard ?? 1) - (2.5 * m.dmg + 5) / 100; v.blockAt = S.t; meter(a, .04);
  if (v.guard <= 0) {  // worn down: the guard breaks and they reel, wide open
    v.guard = .5; set(v, 'hit'); v.stunFor = .8; v.vx = Math.sign(v.x - a.x) * .3;
    pop('GUARD BREAK!', v, '#ff9d1a', 1.2); snd('smash', v.x); S.freeze = Math.max(S.freeze, .12); S.shake = Math.max(S.shake, H * .012);
    return;
  }
  set(v, 'block'); v.blockFor = .16 + m.dmg * .012; v.vx = Math.sign(v.x - a.x) * (.15 + m.dmg * .01); v.face = Math.sign(a.x - v.x) || v.face;
  const [x, y] = at(v, .6, .1); spark(x, y, v.h * .1); pop('BLOCK', v, v.guard < .35 ? '#ff9d1a' : '#9fd8ff', .8); snd('clonk', v.x, { vol: .6, pitch: 1.3 });
  if (chip >= .5) dmgNum(v, chip, 'chip');
  S.freeze = Math.max(S.freeze, .035);
}
function comboUp(e, v) {  // hits that land while the rival still reels are one combo; each extra hit does a little less
  const going = ['hit', 'launched'].includes(v.state) && S.t - (e.comboT ?? -9) < 1.2;
  e.comboN = going ? (e.comboN || 1) + 1 : 1; e.comboT = S.t; if (!going) { e.comboDmg = 0; e.chaseN = 0; }
  if (e.comboN === 3) {
    snd('combo'); pop('COMBO!', e, '#ff6ad5', 1.3); near(e, S.guests, .35).forEach(g => g.cheer = 1.5); S.heat = Math.min(2, S.heat + .2);
    const own = lines(e.k); if (own.length && R() < .5 && !S.subs.length) talk(e, pick(own), { to: v });
  }
  return Math.max(.5, 1 - .1 * (e.comboN - 1));
}
function throwFoe(e) {  // grab right next to the rival: a suplex. Beats a block; loses to a blow already on its way (or a roll), and a whiff leaves you open
  const f = S.players.find(p => p !== e);
  if (!f || e.item || f.y > .05 || DOWN.has(f.state) || ['cursed', 'hit', 'block', 'launched'].includes(f.state) || Math.abs(f.z - e.z) > .05 || Math.abs(f.x - e.x) > .075) return false;  // no throws on someone still reeling
  if ((f.state === 'attack' && f.move && f.st < f.move.hit + .05) || f.state === 'roll' || f.state === 'cast' || f.state === 'throw') {
    set(e, 'whiff'); pop('WHIFF', e, '#d0d0d0', .7); snd('swing', e.x, { pitch: .8 }); return true;
  }
  e.face = Math.sign(f.x - e.x) || e.face; set(e, 'throw'); e.victim = f; set(f, 'grabbed'); f.grabber = e; f.vx = f.vz = 0;
  pop('GOTCHA!', e, '#ffe14d', .8); snd('swingHeavy', e.x);
  return true;
}
function tech(v) {  // GRAB right as you're grabbed: you slip out and you both stumble apart
  const g = v.grabber; v.grabber = null;
  if (g) { g.victim = null; set(g, 'idle'); g.vx = -g.face * .3; }
  set(v, 'idle'); v.y = 0; v.vx = (g ? g.face : -v.face) * .3; pop('TECH!', v, '#9fd8ff', 1); snd('clonk', v.x, { pitch: 1.6 });
}
function strike(e) {
  const m = e.move;
  if (!m.dmg) return;
  const [x, y] = at(e, m.low ? .3 : m.air ? .45 : .62, .18);
  swoosh(x, y, e.face, e.h * (m.heavy ? .22 : .16));
  let n = 0;
  for (const v of S.people) {
    if (v === e || v.gone || DOWN.has(v.state) || (curseG(v) === 'R' && v.state === 'cursed') || S.t - (v.curseAt ?? -9) < .6) continue;  // a curse's first moment can't be hit
    const reach = m.reach * (e.curse === 'tiny' ? .6 : 1), dx = (v.x - e.x) * e.face;  // lows miss a jump, and only an uppercut swats one out of the air
    const high = m.air ? Math.abs(v.y - e.y) < .5 : v.y - e.y < (m.low ? .08 : m.key === 'upper' ? .9 : .32);
    if ((dx > -.012 || (m.around && dx > -reach)) && dx < reach && Math.abs(v.z - e.z) < (m.wide ? .18 : .06) && high) {  // round and spin kicks sweep wide in depth
      if (untouchable(v)) { if (!v.dodged) { v.dodged = true; pop('DODGE!', v, '#9fd8ff', .7); } continue; }  // rolled right through it
      if (blocks(v, e, m)) block(v, e, m);
      else {
        const fighter = v.role === 'fighter', counter = fighter && ((v.state === 'attack' && v.move && (v.st < v.move.hit || !v.hitConfirm)) || v.state === 'whiff');
        let mm = m;
        if (counter) { mm = { ...m, stun: (m.stun || .3) * 1.5 }; pop('COUNTER!', e, '#F0E442', 1); }  // caught mid-swing: it hurts more
        if (m.low && fighter && (v.running || v.state === 'roll')) mm = { ...mm, knock: 1, kb: .3, word: 'TRIP!' };  // a low kick trips someone on the move
        hurt(v, m.dmg * (fighter ? comboUp(e, v) : 1) * (isCpu(e) ? e.lv.dmg : 1) * (e.curse === 'tiny' ? .6 : 1) * (counter ? 1.25 : 1), e.face, mm.word, m.snd, mm, e);
      }
      e.hitConfirm = true;
      if (++n === 2) break;
    }
  }
  if (n) { S.freeze = Math.max(S.freeze, .045 + m.dmg * .007); if (m.lunge) e.vx *= .3; }  // hit-stop: the world holds its breath
  const it = e.item;
  if (n && it && (it.type === 'plate' || (it.type === 'bottle' && ++it.hits >= 2))) breakHeld(e);
}
function breakHeld(e) {
  const it = e.item; e.item = null; S.items.splice(S.items.indexOf(it), 1);
  const [x, y] = at(e, .55, .3); spray(x, y, 14, '#dff6ff', e.face * H * .4, H * .4, e.h * .012);
  if (it.type === 'bottle') puddle(e.x + e.face * .06, e.z + .01, 'booze');
  pop('SMASH!', e, '#bff3ff'); snd('smash', e.x);
}
function hurt(v, dmg, dir, word, sound, m = {}, by = null) {
  if (v.role === 'fighter' && S.phase !== 'fight') return;  // a shot still in the air after the K.O. can't decide it again
  if (v.role === 'fighter' && S.t - (v.curseAt ?? -9) < .6) return;  // the moment a curse lands, it can't be hit
  v.flash = .12; v.face = -dir; v.vx = dir * (.25 + dmg * .025);
  const [x, y] = at(v, .6); spark(x, y, v.h * .16);
  pop(word, v); S.shake = Math.max(S.shake, dmg * .7 * H / 600);
  snd(sound, v.x, { pitch: .9 + R() * .25 });
  if (sound === 'zap') spray(x, y, 12, '#b8ff9e', 0, H * .3, v.h * .012, .5);
  if (v.role !== 'fighter') {
    set(v, 'down'); say(v, v.role === 'photog' ? pick(['MY CAMERA!', 'NOT THE LENS!', 'I\'M WORKING!']) : pick(CRIES)); snd('thud', v.x, { vol: .6 });
    if (R() < .3) snd('gasp', v.x);
    if (v.role === 'guest' && R() < .45) S.items.push({ type: pick(DROPS), x: v.x, z: clamp(v.z + .02, 0, 1), y: .5, vy: 1.8, vx: (R() - .5) * .25, ammo: 1, hits: 0, held: null });
    if (R() < .25) puddle(v.x, v.z + .01, 'booze');  // there goes their drink
    return;
  }
  let still = false;  // walk-around curses: half damage, the 2nd hit breaks them; stuck ones break on the 1st (ice shatters for 1.5x)
  if (v.curse && curseG(v) === 'R' && v.state === 'cursed') return;  // on a ride nobody can interrupt
  if (v.curse && curseG(v) === 'T') {
    dmg *= .5; still = v.state === 'cursed';
    if (v.curse === 'spoon') { v.bendAt = S.t; snd('boing', v.x); }  // Moses bends the spoon; it springs back
    if (++v.curseHits >= 2) { uncurse(v, true); still = false; }
  } else if (v.curse && curseG(v) === 'L') {
    if (v.curse === 'ice') { dmg *= 1.5; const [x, y] = at(v, .6); spray(x, y, 18, '#dff6ff', dir * H * .3, H * .3, v.h * .014, .7); }
    uncurse(v, true);
  }
  dmgNum(v, dmg, m.launch ? 'launch' : ''); v.hurtAt = S.t;
  if (by && by.role === 'fighter' && by !== v) {  // the star bar: +1/8 a clean blow, half for the same blow a 3rd time running, nothing off a cursed rival
    by.sameN = by.lastKey === m.key ? (by.sameN || 0) + 1 : 1; by.lastKey = m.key;
    meter(by, v.curse ? 0 : by.sameN >= 3 ? .0625 : .125); by.comboDmg = (by.comboDmg || 0) + dmg;
  }
  if (v.sp < 1) v.sp = Math.max(0, (v.sp || 0) - .22);  // taking a clean blow costs two pips; a full bar is kept
  const mine = net ? mySlot() : 0;
  if (touch.on && navigator.vibrate && (S.players.indexOf(v) === mine || S.players.indexOf(by) === mine)) navigator.vibrate(m.knock || m.launch ? 30 : 12);
  v.hp = Math.max(0, v.hp - dmg); S.heat = Math.min(2, S.heat + .08 + dmg * .005);
  if (dmg >= 12 && R() < .4) snd('cheerSoft', v.x);
  if (v.item && R() < .3) { const it = v.item; v.item = null; Object.assign(it, { held: null, x: v.x, z: v.z, y: .5, vy: 1.5, vx: -dir * .2 }); }
  if (!v.hp) return match.wins[1 - S.players.indexOf(v)] >= 1 ? finishThem(v) : ko(v);  // FINISH THEM! only when this K.O. decides the battle
  if (still) { v.vx = dir * .25; return; }  // still a pig: it just squeals and slides
  if (m.launch) { set(v, 'launched'); v.vy = m.launch; v.vx = dir * .12; v.juggles = 0; }  // up they go: juggle them
  else if (v.state === 'launched' || v.y > .15) {  // hit in the air: kept up a few times, then down
    v.juggles = (v.juggles || 0) + 1; v.vx = dir * .1;
    if (v.juggles > 3) { set(v, 'down'); v.vy = .5; } else { set(v, 'launched'); v.vy = Math.max(v.vy, 1.4); }
  } else if (m.knock || dmg >= 12) { set(v, 'down'); v.vx = dir * (m.kb || .4); v.vy = .9; }
  else { set(v, 'hit'); v.stunFor = m.stun || .3; v.vx = dir * (m.kb ?? .2); }
  if (v.curse === 'tiny') v.vx *= 1.3;  // little ones fly further
}
// ---- specials: eight blows in a row without being hit fill the star bar; SPECIAL then casts the character's own curse on the rival
const CURSE = {  // seconds. g = T: walk about but can't act (half damage, the 2nd blow breaks it); L: stuck (mash to shorten it, any blow breaks it);
  // W: fight on with a handicap; R: a ride nobody can interrupt. Blocking the bolt halves it; afterwards 2 s of immunity
  pig: { t: 3, g: 'T', word: 'OINK!', color: '#ffb3c7', snd: 'oink' }, chicken: { t: 3, g: 'T', word: 'BAWK!', color: '#fff3c4', snd: 'cluck' },
  balloon: { t: 3, g: 'T', word: 'PUFF!', color: '#ffd1f0', snd: 'inflate' }, spoon: { t: 2, g: 'T', word: 'THERE IS NO SPOON', color: '#9dffb0', snd: 'matrix' },
  disco: { t: 2, g: 'L', word: 'GROOVY!', color: '#ff6ad5', snd: 'disco' }, fart: { t: 1.5, g: 'L', word: 'PEE-YEW!', color: '#a8d84a', snd: 'fart' },
  smooch: { t: 2, g: 'L', word: 'MWAH!', color: '#ff4d6d', snd: 'smooch' }, ice: { t: 2, g: 'L', word: 'BRRR!', color: '#bfeaff', snd: 'freeze' },
  tiny: { t: 4, g: 'W', word: 'SQUEAK!', color: '#c9f0ff', snd: 'shrink' }, dizzy: { t: 3.5, g: 'W', word: 'WHICH WAY?!', color: '#ffe14d', snd: 'daze' },
  cake: { t: 3, g: 'W', word: 'SPLAT!', color: '#fff6e6', snd: 'splat' }, escalator: { t: 3.2, g: 'R', word: 'GOING DOWN!', color: '#d9e3ea', snd: 'escalator' },
  // the generic ones: each guest's own special picks one of these plus a photo (nicknames.js sp: type, prop, motion/size/spot/n/path, dur, word, snd, color)
  transform: { t: 3, g: 'T', word: 'POOF!', color: '#ffe14d', snd: 'pop' }, drop: { t: 2, g: 'L', word: 'SPLAT!', color: '#ffd23f', snd: 'crash' },
  encase: { t: 2, g: 'L', word: 'GOTCHA!', color: '#bfeaff', snd: 'clonk' }, face: { t: 3, g: 'W', word: 'SPLAT!', color: '#fff6e6', snd: 'splat' },
  swarm: { t: 2, g: 'L', word: 'BZZZ!', color: '#ffe14d', snd: 'flap' }, carry: { t: 2.6, g: 'R', word: 'WHOOSH!', color: '#9fd8ff', snd: 'whistle' },
};
const curseG = v => v.curseG || (CURSE[v.curse] || {}).g;  // the curse's group for this victim (a "stuck" transform is L, not T)
const spProp = e => e.curseSp && e.curseSp.prop;
const CURSES = Object.keys(CURSE);
const spOf = k => (window.NICKNAMES && window.NICKNAMES[k] && window.NICKNAMES[k].sp) || { type: CURSES[(k | 0) % 10], name: 'SPECIAL MOVE', shout: 'Take THIS!' };
const GLYPHS = [0x13000, 0x13008, 0x1300A, 0x13010, 0x13020, 0x1302F, 0x13041, 0x13050, 0x13062, 0x1307D, 0x13080, 0x13087, 0x1308F, 0x1309D, 0x130A7,
  0x130B8, 0x130C0, 0x130D2, 0x130ED, 0x130F9, 0x13116, 0x13140, 0x13153, 0x13171, 0x13183, 0x13193, 0x1319B, 0x131A3, 0x131CB, 0x131CC, 0x131EF,
  0x13216, 0x13250, 0x13283, 0x13296, 0x132AA, 0x132B9, 0x132F4, 0x132F9, 0x13319, 0x1333B, 0x13362, 0x13377, 0x13393, 0x133BF, 0x133CF, 0x133E4, 0x13402]
  .map(c => String.fromCodePoint(c));
const HIERO = '"Noto Sans Egyptian Hieroglyphs", "Segoe UI Historic", serif';
let glyphSheet = null;
function glyphs() {  // the rain's glyphs drawn once (white heads, green tails), from Google Fonts' hieroglyphs (just these ones); katakana if they never come
  if (glyphSheet || glyphs.busy) return glyphSheet;
  glyphs.busy = true;
  const make = () => {
    if (glyphSheet) return;
    const ok = [...document.fonts].some(f => f.family.replace(/"/g, '') === 'Noto Sans Egyptian Hieroglyphs' && f.status === 'loaded');
    const set = ok ? GLYPHS : Array.from('ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜ'), cs = 48;
    const c = Object.assign(document.createElement('canvas'), { width: cs * set.length, height: cs * 2 }), g = c.getContext('2d');
    g.font = `${cs * .78}px ${ok ? HIERO : 'monospace'}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    set.forEach((ch, i) => { for (const [row, col, blur] of [[0, '#eaffef', 10], [1, '#00ff66', 6]]) { g.shadowColor = col; g.shadowBlur = blur; g.fillStyle = col; g.fillText(ch, i * cs + cs / 2, row * cs + cs / 2); } });
    glyphSheet = { c, n: set.length, cs };
  };
  const l = document.getElementById('hiero-font') || Object.assign(document.createElement('link'), { id: 'hiero-font', rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Egyptian+Hieroglyphs&display=swap&text=' + encodeURIComponent(GLYPHS.join('')) });
  const load = () => document.fonts.load('40px "Noto Sans Egyptian Hieroglyphs"', GLYPHS.join('')).then(make, make);
  l.onload = load; l.onerror = make; if (!l.isConnected) document.head.append(l);
  setTimeout(make, 4000);
  return null;
}
function meter(e, amt) {  // the star bar
  if (e.sp >= 1) return;
  e.sp = Math.min(1, (e.sp || 0) + amt);
  if (e.sp >= 1) { pop('SPECIAL READY!', e, '#ff6ad5', 1.1); snd('special', e.x); }
}
function dmgNum(v, dmg, kind) {  // the damage each blow does: pops up big over whoever took it, on alternate sides, settles, rises, fades
  const n = Math.round(dmg);
  if (n < 1 || v.role !== 'fighter') return;
  v.dmgLane = ((v.dmgLane || 0) + 1) % 2;
  const [x, y] = at(v, 1.12, v.dmgLane ? .22 : -.22), size = Math.max(18 * DPR, H * Math.min(.1, .04 + .005 * n));
  dmgFx(n + (kind === 'launch' ? '!' : ''), x, y, size, kind === 'chip' ? '#b8c2cc' : kind === 'special' ? '#CC79A7' : kind === 'launch' ? '#F0E442' : '#ffffff');
}
function dmgFx(t, x, y, size, color) {
  logEv('d', t, q3(x / W), toF(y), q3(size / H), color);
  const all = S.fx.filter(f => f.k === 'dmg'); if (all.length >= 6) S.fx.splice(S.fx.indexOf(all[0]), 1);
  fx({ k: 'dmg', text: String(t), x, y, size, color, life: .8, max: .8 });
}
function special(e) {  // cast: a super freeze and a banner so everyone sees it coming; the curse lands CAST_HIT later
  if ((e.sp || 0) < 1) return;
  const f = S.players.find(p => p !== e), s = spOf(e.k);
  if (!f) return;
  e.sp = 0; set(e, 'cast'); e.cast = s.type; e.castN = (e.castN || 0) + 1; e.face = Math.sign(f.x - e.x) || e.face; e.vx = e.vz = 0; e.castX = f.x; e.castZ = f.z;  // the bolt heads where they stand now
  S.freeze = Math.max(S.freeze, .4); S.dimBy = e; S.cutin = { e, t: 1.1 };  // super freeze: the room darkens, the caster's face cuts in
  S.banner = String(s.name).toUpperCase().slice(0, 24); S.sub = `${e.name.toUpperCase()}'S SPECIAL`; S.bannerT = 1.5;
  const [x, y] = at(e, .6); burst(x, y, e.h * 1.2, CURSE[s.type] ? CURSE[s.type].color : '#ff6ad5');
  snd('special', e.x); if (s.shout) talk(e, s.shout, { to: f });
  if (s.type === 'spoon') neo(e, 3.8, .6);
}
function neo(e, t, a = 1) { S.neo = e; S.neoT = t; S.matrix = S.matrixT0 = t + .4; S.matrixA = a; snd('matrix'); glyphs(); }  // Moses: glows like Neo while hieroglyphs rain
function castHit(e) {  // the bolt arrives where the rival stood: jumping, rolling or stepping out of its lane dodges it; blocking halves it
  const f = S.players.find(p => p !== e);
  if (!f || S.phase !== 'fight') return;
  if (f.gone || DOWN.has(f.state) || untouchable(f) || f.y > .1 || Math.abs(f.z - e.castZ) > .08 || S.t < (f.immuneT || 0) || f.state === 'cursed') {
    pop('MISSED!', f, '#9fd8ff', 1.1); e.sp = .4; set(e, 'whiff'); e.st = .05; return;  // a miss leaves the caster open, with some of the bar back
  }
  const blocked = f.state === 'block' || (isCpu(f) ? R() < (f.lv.block || 0) : (f.inp.mx || 0) * Math.sign(f.x - e.x) > .3);
  curseOn(f, e.cast, e, blocked);
}
function curseOn(v, type, by, halved) {
  const own = spOf(by.k), sp = own.type === type ? own : {}, c = Object.assign({}, CURSE[type] || CURSE.pig);
  for (const k of ['word', 'snd', 'color']) if (sp[k]) c[k] = sp[k];
  if (v.curse) uncurse(v);
  if (v.item) { const it = v.item; v.item = null; Object.assign(it, { held: null, x: v.x, z: v.z, y: .5, vy: 1.2, vx: 0 }); }
  v.curse = type; v.curseSp = sp; v.curseG = type === 'transform' && sp.motion === 'stuck' ? 'L' : c.g;
  v.curseT = v.curseDur = clamp(+sp.dur || c.t, 1, 5) * (halved ? .5 : 1); v.curseBy = by; v.buf = null; v.curseAt = S.t; v.curseHits = 0; v.bendAt = null; v.dropHit = false;
  if (halved) pop('HALF BLOCKED!', v, '#9fd8ff', .8);
  v.hp = Math.max(1, v.hp - 5); dmgNum(v, 5, 'special'); if (v.sp < 1) v.sp = Math.max(0, (v.sp || 0) - .22);
  if (v.curseG !== 'W') { set(v, 'cursed'); v.vx = v.vz = 0; v.face = Math.sign(by.x - v.x) || v.face; }
  if (type === 'carry') v.carry = { x: v.x, dir: Math.sign(v.x - by.x) || 1 };
  S.freeze = Math.max(S.freeze, .12);  // the puff hides the swap
  if (type === 'fart') for (const g of near(v, S.guests, .32)) { say(g, pick(EWW)); g.dest = { x: clamp(g.x + Math.sign(g.x - v.x || 1) * .3, .05, .95), z: g.z }; }
  if (type === 'escalator') { v.esc = { x: v.x, z: v.z, dir: Math.sign(v.x - by.x) || 1 }; v.esc.run = escRun(v); }
  const [x, y] = at(v, .6); spray(x, y, 24, c.color, 0, H * .35, v.h * .015, .7);
  pop(c.word, v, c.color, 1.3); snd(c.snd, v.x); S.shake = Math.max(S.shake, H * .01);
}
function uncurse(v, broken) {
  const c = v.curse;
  if (!c || v.keepCurse) return;
  v.curse = null; v.curseT = 0; v.esc = null; v.immuneT = S.t + 2; v.bendAt = null;  // a while before the next one can land
  const path = v.curseSp && v.curseSp.path;
  if (v.state === 'cursed') set(v, c === 'balloon' && !broken ? 'fall' : c === 'escalator' ? 'getup' : c === 'carry' && path !== 'slide' ? 'fall' : 'idle');
  if (c === 'carry' && path !== 'slide') { v.x = .15 + R() * .7; v.y = 3; v.vy = 0; say(v, 'AAAAH!'); snd('whistle', v.x); }  // dropped back in from the sky
  if (c === 'carry' && path === 'slide') v.y = 0;
  v.curseSp = null; v.curseG = null; v.carry = null;
  const [x, y] = at(v, .6); spray(x, y, 16, c === 'ice' ? '#dff6ff' : '#ffffff', 0, H * .3, v.h * .015, .6);
  if (c === 'spoon') { const [x, y] = at(v, .6); burst(x, y, v.h * .8, '#00ff66'); }  // it straightens and bursts into glyphs
  pop(c === 'ice' ? 'CRACK!' : c === 'balloon' ? (broken ? 'POP!' : 'PFFFFT!') : 'POOF!', v, '#fff', 1); snd(c === 'ice' ? 'crack' : c === 'balloon' ? (broken ? 'pop' : 'fart') : 'pop', v.x);
}
function curseTick(e, n, dt) {  // every frame on a cursed fighter (host)
  if (e.keepCurse || S.phase === 'finish') return;
  if ((e.curseT -= dt) <= 0 || S.phase !== 'fight') return uncurse(e);
  if (e.curse === 'dizzy' && ctrl[S.players.indexOf(e)] !== 'net') { n.mx = -(n.mx || 0); n.mz = -(n.mz || 0); if (n.roll) n.roll = n.roll.map(v => -v); }  // left is right
  if (curseG(e) === 'L' && BTN.some(k => n[k])) e.curseT = Math.min(e.curseT, Math.max(e.curseT - .07, 1.2 - (S.t - e.curseAt)));  // mash to break free sooner (never under 1.2 s)
  if (e.state === 'cursed') { BTN.forEach(k => n[k] = false); n.roll = null; }
}
function curseMove(e, dt) {  // what a helpless victim does while it lasts
  const c = e.curse, foe = S.players.find(p => p !== e);
  if (!c) return set(e, 'idle');
  if (e.keepCurse) { e.vx = e.vz = 0; return; }  // the finisher's spoon stands still for Moses
  if (c === 'pig' || c === 'chicken' || c === 'spoon') {  // the victim steers (a little faster; a spoon only hops along); left alone, it waddles about
    const n = e.inp, k = c === 'spoon' ? .5 : 1.2;
    if (n.mx || n.mz) { e.vx = (n.mx || 0) * WALK * k; e.vz = (n.mz || 0) * ZWALK * k; if (n.mx) e.face = Math.sign(n.mx); }
    else {
      if (e.wander === undefined || R() < dt * 1.2) e.wander = R() * TAU;
      e.vx = Math.cos(e.wander) * WALK * .45 * k; e.vz = Math.sin(e.wander) * ZWALK * .4 * k; if (Math.abs(e.vx) > .01) e.face = Math.sign(e.vx);
      if (e.x < .08 || e.x > .92) e.wander = e.x < .5 ? 0 : Math.PI;
    }
    if ((c === 'chicken' || c === 'spoon') && !e.y && R() < dt * (c === 'spoon' ? 3 : 2)) e.vy = c === 'spoon' ? .8 : 1.3;  // flap-hop / boing
    if (c !== 'spoon' && R() < dt * 1.1) { pop(CURSE[c].word, e, CURSE[c].color, .8); snd(CURSE[c].snd, e.x); }
  } else if (c === 'smooch' && foe) {  // drifts dreamily after whoever kissed them
    const dx = foe.x - e.x; e.vx = Math.abs(dx) > .07 ? Math.sign(dx) * WALK * .3 : 0; e.vz = (foe.z - e.z) * .5; e.face = Math.sign(dx) || e.face;
    if (R() < dt * 1.5) pop('♥', e, '#ff4d6d', .9);
  } else if (c === 'balloon') {  // puffs up, floats off the floor, drifts where they steer at half speed
    e.vy = 0; e.y += ((e.st > .6 ? .6 : 0) - e.y) * Math.min(1, dt * 2.5);
    e.vx = (e.inp.mx || 0) * WALK * .5 + Math.sin(e.st * 2.3) * .03; e.vz = (e.inp.mz || 0) * ZWALK * .5;
  }
  else if (c === 'escalator' && e.esc) {  // up on top, shoved, bumping down every step, then a tumble across the floor
    const s = e.esc, st = e.st, run = s.run || .26;
    if (st < .5) { e.x = s.x; e.y = Math.min(1, st * 2.4) * .95; e.vx = e.vz = 0; }
    else if (st < 1.7) { const p = (st - .5) / 1.2; e.x = clamp(s.x + s.dir * run * p, .04, .96); e.y = .95 * (1 - p) + .05 * Math.abs(Math.sin(p * 18)); e.vx = 0; }
    else { e.y = 0; e.vx = s.dir * .5 * Math.max(0, 1 - (st - 1.7) / 1.1); }
    e.vy = 0; e.vz = 0;
    if (st > .5 && st < 1.7 && Math.floor(st * 10) !== Math.floor((st - dt) * 10)) snd('thud', e.x, { vol: .35, pitch: 1.4 });
    if (st > CURSE.escalator.t - .5 && !s.gone) { s.gone = true; const x = (s.x + s.dir * run * .5) * W, y = feetY(s.z); spray(x, y, 20, '#ffffff', 0, H * .2, e.h * .02, .6); snd('pop', e.x); }  // and back into the floor
  }
  else if (c === 'transform') {  // they ARE the thing now: waddle / hop / roll about (steerable), stuck, or float off
    const sp = e.curseSp || {}, mo = sp.motion || 'waddle', n = e.inp;
    if (mo === 'stuck') { e.vx = e.vz = 0; }
    else if (mo === 'float') { e.vy = 0; e.y += ((e.st > .5 ? .7 : 0) - e.y) * Math.min(1, dt * 2.5); e.vx = (n.mx || 0) * WALK * .5 + Math.sin(e.st * 2) * .03; e.vz = (n.mz || 0) * ZWALK * .5; }
    else {
      const k = mo === 'roll' ? 1.4 : mo === 'hop' ? .9 : 1;
      if (n.mx || n.mz) { e.vx = (n.mx || 0) * WALK * k; e.vz = (n.mz || 0) * ZWALK * k; if (n.mx) e.face = Math.sign(n.mx); }
      else {
        if (e.wander === undefined || R() < dt * 1.2) e.wander = R() * TAU;
        e.vx = Math.cos(e.wander) * WALK * .45 * k; e.vz = Math.sin(e.wander) * ZWALK * .4 * k; if (Math.abs(e.vx) > .01) e.face = Math.sign(e.vx);
        if (e.x < .08 || e.x > .92) e.wander = e.x < .5 ? 0 : Math.PI;
      }
      if (mo === 'hop' && !e.y && R() < dt * 4) e.vy = 1.1;
    }
    if (R() < dt * 1.1) { pop(sp.word || 'POOF!', e, sp.color || '#ffe14d', .8); snd(sp.snd || 'boing', e.x); }
  } else if (c === 'drop') {  // flattened under it
    e.vx = e.vz = 0;
    if (!e.dropHit && e.st > .35) {
      e.dropHit = true; S.shake = Math.max(S.shake, H * .025); S.freeze = Math.max(S.freeze, .08); snd('crash', e.x); snd('thud', e.x);
      const [x, y] = at(e, .05); spray(x, y, 18, '#d9cbb0', 0, H * .25, e.h * .02, .6);
    }
  } else if (c === 'swarm') { e.vx = e.vz = 0; if (R() < dt * 2) snd((e.curseSp || {}).snd || 'flap', e.x, { vol: .5 }); }
  else if (c === 'carry') {
    const sp = e.curseSp || {}, p = clamp(e.st / (e.curseDur || 2.6), 0, 1), cr = e.carry || { x: e.x, dir: 1 };
    e.vz = 0; e.vy = 0;
    if (sp.path === 'slide') { e.y = .12; e.vx = 0; e.x = clamp(cr.x + cr.dir * .35 * Math.sin(Math.PI * p), .04, .96); }  // rides it across the floor and back
    else if (e.st > .4) { e.y = Math.min(4, e.y + dt * (1 + (e.st - .4) * 5)); e.vx = cr.dir * .15; }  // grabbed and hauled up out of the room
    else e.vx = 0;
  }
  else { e.vx = e.vz = 0; }  // disco, ice, fart, encase: stuck where they stand
  if (c === 'disco' && R() < dt * 1.2) pop(pick(['GROOVY!', 'YEAH!', 'WOO!']), e, '#ff6ad5', .7);
}
function burst(x, y, r, color) { logEv('b', q3(x / W), toF(y), q3(r / unit()), color); fx({ k: 'burst', x, y, r, color, life: .5, max: .5 }); }
function grab(e) {
  if (e.item) return throwHeld(e);
  const it = S.items.find(i => !i.held && i.y === 0 && Math.abs(i.x - e.x) < .05 && Math.abs(i.z - e.z) < .05);
  if (it) { it.held = e; e.item = it; e.cd = .15; snd('pickup', e.x); }
}
function throwHeld(e) {
  const it = e.item; e.item = null; S.items.splice(S.items.indexOf(it), 1);
  S.shots.push({ type: it.type, it, x: e.x + e.face * .03, z: e.z, y: e.y + .55, vx: e.face * 1.15, vy: .7, owner: e, spin: 0 });
  set(e, 'attack'); e.move = MOVES.fist; e.done = true; e.threw = true; e.cd = .35;  // throwing pose, no melee hit
  snd('swingHeavy', e.x);
}
function fireCork(e) {
  e.item.ammo = 0; e.aimT = .4;
  S.shots.push({ type: 'cork', x: e.x + e.face * .04, z: e.z, y: e.y + .62, vx: e.face * 1.8, vy: 0, owner: e, spin: 0 });
  const [x, y] = at(e, .62, .35); spray(x, y, 18, '#fffbe6', e.face * H * .6, H * .35, e.h * .013, .7);
  pop('POP!', e, '#fff2a8'); e.vx = -e.face * .25; e.cd = .45; snd('pop', e.x);
  puddle(e.x + e.face * .03, e.z + .01, 'booze');
}
function fireLaser(e) {
  e.item.ammo--; e.cd = .35; e.aimT = .35;
  S.shots.push({ type: 'laser', x: e.x + e.face * .05, z: e.z, y: e.y + .6, vx: e.face * 2.4, vy: 0, owner: e, spin: 0 });
  const [x, y] = at(e, .6, .4); spray(x, y, 10, '#b8ff9e', e.face * H * .4, H * .2, e.h * .01, .4);
  snd('zap', e.x);
}
function finishThem(v) {  // the loser staggers, begs; the winner has a few seconds to press an attack for the comic finisher
  if (S.phase !== 'fight') return;
  S.phase = 'finish'; S.phaseT = 0; S.victim = v; S.winner = S.players.find(p => p !== v);
  set(v, 'dazed'); v.dazeFor = 99; v.vx = v.vz = 0;
  S.banner = 'FINISH THEM!'; S.bannerT = 99; S.sub = 'PRESS ANY ATTACK'; S.shake = Math.max(S.shake, H * .02); S.subs.length = 0;
  snd('boom'); snd('gasp', v.x);
  talk(v, pickLine(v, BEG));
}
function finishing(dt) {
  const w = S.winner, i = S.players.indexOf(w);
  if (S.phase === 'finish') {
    let go = false;
    if (ctrl[i] === 'cpu') go = S.phaseT > 1.8;
    else { ctrl[i] === 'net' ? netIn(w) : human(w, i); go = w.inp.punch || w.inp.kick || w.inp.grab; }
    if (S.spoonFin) return spoonFinale(dt, w, S.victim, go && ctrl[i] !== 'cpu');
    if (go && S.phaseT > .5 && spOf(w.k).type === 'spoon') { S.spoonFin = { t: -.001 }; S.banner = ''; S.sub = ''; S.subs.length = 0; return; }
    if (go && S.phaseT > .5) {
      const fin = window.NICKNAMES && window.NICKNAMES[w.k] && window.NICKNAMES[w.k].fin;
      if (!window.Comic) return finishOff();
      S.phase = 'comic'; S.phaseT = 0; S.banner = ''; S.sub = ''; S.subs.length = 0;
      S.comic = { a: w, v: S.victim, fin, len: Comic.length(fin), cues: Comic.cues(fin), cued: 0 };
    } else if (S.phaseT > 5.5) finishOff();  // nobody finished it: a plain K.O.
  } else if (S.phase === 'comic') {
    const c = S.comic;
    while (c.cues[c.cued] && c.cues[c.cued][0] <= S.phaseT) snd(c.cues[c.cued++][1]);
    if (S.phaseT > c.len) finishOff(c.fin && c.fin.name);
  }
}
function spoonFinale(dt, w, v, skip) {  // Neo glow and glyph rain; the loser turns to glyphs, then a spoon; Moses strikes; it bends... CRACK... and topples. The end.
  const f = S.spoonFin, t0 = f.t; f.t += dt;
  if (skip && f.t > 1.6 && f.t < 4.6) f.t = 4.6;  // impatient: straight to the end
  const at_ = (t, fn) => { if (t0 < t && f.t >= t) fn(); };
  at_(0, () => { neo(w, 4.6, 1); talk(w, 'Free your mind.', { to: v }); w.face = Math.sign(v.x - w.x) || w.face; S.slowT = 0; });
  at_(1.2, () => { v.curse = 'spoon'; v.curseBy = w; v.keepCurse = true; v.finBend = 0; set(v, 'cursed'); const [x, y] = at(v, .6);
    burst(x, y, v.h, '#00ff66'); spray(x, y, 28, '#00ff66', 0, H * .3, v.h * .015, .8); snd('pop', v.x); });
  at_(2.0, () => { const [x, y] = at(w, .6); swoosh(x, y, w.face, w.h * .3); w.x = clamp(v.x - w.face * .065, .04, .96); w.z = v.z; set(w, 'attack'); w.move = MOVES.cross; w.done = true; snd('dash', w.x); });
  at_(2.25, () => { pop('TINK', v, '#ffffff', .8); snd('clonk', v.x, { pitch: 2 }); });
  at_(2.4, () => snd('creak', v.x));
  if (f.t >= 2.4 && f.t < 3.4) v.finBend = 1.48 * Math.pow((f.t - 2.4) / 1, 2);  // slowly over to 85 degrees
  at_(3.4, () => { v.finBend = 1.75; v.xEyes = true; set(v, 'bent'); pop('CRACK!', v, '#ffffff', 1.6); snd('crack', v.x); snd('metal', v.x); S.freeze = .3; S.shake = H * .02; });
  for (const [t, vol] of [[3.9, .8], [4.2, .5], [4.4, .3]]) at_(t, () => snd('clatter', v.x, { vol }));
  at_(4.6, () => { S.matrix = 0; S.neoT = 0; S.banner = 'THERE IS NO SPOON'; S.bannerT = 9; });
  if (f.t > 5.5) { S.spoonFin = null; finishOff('THERE IS NO SPOON'); }
}
function finishOff(move) {
  const v = S.victim;
  S.phase = 'fight'; ko(v); S.slowT = 0;
  if (move) { S.sub = String(move).toUpperCase().slice(0, 30); S.finished = true; }
}
function ko(v) {
  if (S.phase !== 'fight') return;
  set(v, 'ko'); S.phase = 'ko'; S.phaseT = 0; S.slowT = 1.3; S.banner = 'K.O.';
  S.winner = S.players.find(p => p !== v);
  snd('boom', v.x); snd('cheer', .5, { vol: 1.2 });
}

// ---- the photographer: picks someone, walks into their lane, "SMILE!", flash. A fighter caught from the front is blinded.
function photog(e, dt, free) {
  if (e.state === 'aim') {
    if (e.target && !e.target.gone) e.face = Math.sign(e.target.x - e.x) || e.face;
    if (e.st > .9) { flash(e); set(e, 'shoot'); }
    return;
  }
  if (e.state === 'shoot') { if (e.st > .6) { set(e, 'idle'); e.target = null; e.think = 1.5 + R() * 2.5; } return; }
  if (!free) return;
  if (e.transit) return stroll(e);
  e.think -= dt;
  let t = e.target;
  if (!t || t.gone || t.transit || DOWN.has(t.state) || e.think < -7) {  // somebody new (or give up on a dodger)
    e.target = t = null;
    if (e.think > 0) { if (!e.dest && R() < dt * .5) e.dest = spot(); return stroll(e); }
    const guests = S.guests.filter(g => g.state === 'idle' && !g.transit && !g.task && !g.gone);
    t = S.phase === 'ko' && S.winner ? S.winner : S.phase === 'fight' && (R() < .55 || !guests.length) ? pick(S.players) : pick(guests);
    if (!t) return stroll(e);
    e.target = t; e.think = 0; e.dest = null;
  }
  const side = Math.sign(e.x - t.x) || 1, x = clamp(t.x + side * .2, .05, .95);
  const want = { x: Math.abs(x - t.x) < .12 ? clamp(t.x - side * .2, .05, .95) : x, z: t.z };
  if (Math.hypot(want.x - e.x, want.z - e.z) < .03) {
    e.dest = null; e.vx = e.vz = 0; e.face = Math.sign(t.x - e.x) || e.face; e.shots = (e.shots || 0) + 1;
    set(e, 'aim'); say(e, pick(SMILE)); snd('beep', e.x);
    if (t.role === 'guest' && t.state === 'idle' && !t.task) react(t);
  } else { e.dest = want; stroll(e); }
}
function react(g) {  // a guest in the viewfinder
  const r = R();
  if (r < .4) { leave(g, true); say(g, pick(NOPE)); snd('gasp', g.x); }
  else if (r < .75) { set(g, 'smile'); say(g, 'CHEESE!'); }
  else { set(g, 'shield'); say(g, pick(['NO NO NO!', 'NOT NOW!', 'MY MAKEUP!'])); }
}
function moshikBit() {  // the match is won: the photographer's turn
  const e = S.photog;
  if (!e || e.gone || e.left || e.state === 'beam' || e.state === 'fall') return;
  S.moshik = { t: 0 }; e.target = null; e.dest = null; e.aimT = 0;
}
function camOff(e) {  // the event's over: the camera goes away, his arms are his own again
  if (e.nocam || !photogNoCam) return;
  const r = rigFor('photog-nocam', photogNoCam);
  if (r) { e.img = photogNoCam; e.rig = r; e.nocam = true; }
}
function moshikTick(e, dt) {  // drag a chair in from the edge, sit down near the middle, light up, gripe, demand a whiskey
  const m = S.moshik, t0 = m.t; m.t += dt;
  const at_ = (t, fn) => { if (t0 < t && m.t >= t) fn(); };
  if (!m.side) {
    m.side = e.x < .5 ? -1 : 1; m.spot = .5 + m.side * .08;
    Object.assign(e, { x: m.side < 0 ? -.1 : 1.1, z: .8, y: 0, vy: 0, transit: 'in', chair: 1, cig: 0, say: null }); set(e, 'walk'); camOff(e);
  }
  if (m.t < 2.8) {
    const dx = m.spot - e.x;
    if (Math.abs(dx) > .01) { e.state = 'walk'; e.vx = Math.sign(dx) * .2; e.vz = 0; e.face = Math.sign(dx); if (Math.floor(m.t * 3) !== Math.floor(t0 * 3)) snd('clatter', e.x, { vol: .3, pitch: .55 }); }
    else { e.state = 'idle'; e.vx = 0; }
  }
  at_(2.8, () => { e.transit = null; e.vx = e.vz = 0; e.chair = 2; set(e, 'sit'); e.actFor = 99; e.face = -m.side; snd('thud', e.x, { vol: .5 }); });
  at_(3.5, () => { e.cig = 1; e.smokeT0 = S.t; });
  at_(3.8, () => { const [x, y] = cigTip(e); spark(x, y, e.h * .05); snd('pop', e.x, { vol: .4, pitch: 1.8 }); });  // the lighter
  if (e.cig && R() < dt * 2.5) { const [x, y] = cigTip(e); smoke(x, y, e.h * .025); }
  if (e.cig && e.nocam) {  // a drag every few seconds; the smoke comes out of his mouth as the hand comes down
    const p = (S.t - e.smokeT0) % 4, p0 = p - dt;
    if (p0 < 1.6 && p >= 1.6) for (let i = 0; i < 3; i++) { const [x, y] = at(e, .88, .06 + i * .03); smoke(x, y, e.h * (.03 + i * .01)); }
  }
  at_(4.4, () => { const g = pick(GRIPES), w = pick(WHISKEY); m.yell = w; m.yellAt = 4.4 + g.length / 30 + 1.15; talk(e, g); talk(e, w); });
  if (m.yell) at_(m.yellAt, () => { say(e, m.yell.toUpperCase().slice(0, 40)); snd('gasp', e.x, { pitch: .7 }); });
}
function cigTip(e) {  // where the lit end is: at his mouth, or (no camera) wherever his hand has got to
  if (!e.nocam) return at(e, .87, .13);
  const k = smokeK(e), [mx, my] = at(e, .9, .14), [rx, ry] = at(e, .32, .24);
  return [rx + (mx - rx) * k, ry + (my - ry) * k];
}
function smokeK(e) {  // 0 = hand resting on the knee, 1 = cigarette at the lips; a 4 s cycle: raise, drag, lower, rest
  const p = (S.t - (e.smokeT0 || 0)) % 4;
  return p < .6 ? p / .6 : p < 1.4 ? 1 : p < 2 ? 1 - (p - 1.4) / .6 : 0;
}
function smoke(x, y, r) { logEv('o', q3(x / W), toF(y), q3(r / unit())); fx({ k: 'smoke', x, y, r, life: 2.2, max: 2.2, drift: (R() - .5) * .3 }); }
function flash(e) {
  const [lu, lf] = (e.rig && e.rig.lens) || [.62, .12], [x, y] = at(e, lu, lf);
  flashFx(x, y, e.face, e.h); snd('shutter', e.x);
  for (const v of S.people) {
    if (v === e || v.gone || DOWN.has(v.state) || v.y > .2) continue;
    const dx = (v.x - e.x) * e.face;
    if (dx < .02 || dx > .5 || Math.abs(v.z - e.z) > .07 || v.face !== -e.face) continue;  // only a picture from the front blinds
    if (v.role === 'fighter' && S.phase === 'fight' && v.state !== 'cursed') {
      set(v, 'dazed'); v.dazeFor = 2; v.vx = v.vz = 0; pop('BLINDED!', v, '#ffffff'); snd('daze', v.x);
      S.white[S.players.indexOf(v)] = .6;
    } else if (v.role === 'fighter' || v.state === 'smile') pop('CLICK!', v, '#ffffff', .7);
    else if (v.role === 'guest' && ['idle', 'walk', 'shield', 'drink'].includes(v.state) && !v.transit) { set(v, 'dazed'); v.dazeFor = 1.3; }
  }
}

// ---- CPU player: chase the rival, grab loot, sometimes flatten a bystander, jump the flash if it's good enough
function cpu(p, dt) {
  const n = p.inp, lv = p.lv; BTN.forEach(k => n[k] = false); n.roll = null;
  const foe = S.players[0] === p ? S.players[1] : S.players[0], ph = S.photog;
  const free = p.state === 'idle' || p.state === 'walk';
  if (free && foe.state === 'attack' && foe.move && foe.st < foe.move.hit && p.sawSwing !== foe.swingN && Math.abs(foe.x - p.x) < foe.move.reach + .03 && Math.abs(foe.z - p.z) < .07) {
    p.sawSwing = foe.swingN; if (R() < (lv.roll || 0)) { n.roll = [R() < .5 ? -Math.sign(foe.x - p.x) : Math.sign(foe.x - p.x), 0]; return; }
  }
  if (free && foe.state === 'cast' && p.sawCast !== foe.castN) { p.sawCast = foe.castN; if (R() < (lv.roll || 0) * 1.5) { n.roll = [0, p.z > .5 ? -1 : 1]; return; } }
  if (free && p.sp >= 1 && R() < dt * 1.2) { n.special = true; return; }
  if (p.state !== 'grabbed') p.techTried = false;
  else if (p.st < .15 && !p.techTried) { p.techTried = true; if (R() < lv.grab * 2) { n.grab = true; return; } }  // one roll of the dice per grab
  if (ph && ph.state === 'aim' && ph.st > .55 && p.sawShot !== ph.shots) {  // the flash is coming
    p.sawShot = ph.shots;
    if (R() < lv.dodge && Math.abs(ph.z - p.z) < .1) n.jump = true;
  }
  if (p.state === 'attack' && p.hitConfirm && p.chainTried !== p.move) { p.chainTried = p.move; if (R() < lv.combo) n[R() < .6 ? 'punch' : 'kick'] = true; }
  p.think -= dt;
  if (p.think <= 0 || !p.goal || (p.goal.held && p.goal !== foe) || p.goal.gone) {
    p.think = lv.think * (.7 + R() * .6);
    const closest = (list, r) => near(p, list, r).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    const loot = !p.item && closest(S.items.filter(i => !i.held && i.y === 0), .35);
    const bystander = closest(S.guests.filter(g => !g.gone && !DOWN.has(g.state)), .15);
    p.goal = loot && R() < .7 ? loot : bystander && R() < .3 ? bystander : foe;
    if (p.hp < HP * .2 && R() < .3) p.goal = { x: clamp(p.x - Math.sign(foe.x - p.x) * .3, .05, .95), z: R(), spot: true };  // catch a breath
  }
  const g = p.goal, dx = g.x - p.x, dz = g.z - p.z, loot = S.items.includes(g);
  const it = p.item, shoots = it && it.ammo > 0 && (it.type === 'champagne' || it.type === 'raygun');
  const ranged = it && (shoots || it.type === 'shoe' || it.type === 'plate');
  const want = loot || g.spot ? 0 : ranged ? .22 : .045 * REACH;
  n.mx = (Math.abs(dx) > want + .015 ? Math.sign(dx) : Math.abs(dx) < want - .03 ? -Math.sign(dx) * .6 : 0) * lv.speed;
  n.mz = (Math.abs(dz) > .02 ? Math.sign(dz) * .9 : 0) * lv.speed;
  if (p.x < .18 || p.x > .82) n.mx = clamp(n.mx + (p.x < .5 ? .7 : -.7), -1.2, 1.2);  // drift back toward the middle of the floor
  if (p.z > .85) n.mz = Math.min(n.mz, -.5);
  if (loot && Math.abs(dx) < .04 && Math.abs(dz) < .04) { n.grab = true; p.goal = null; return; }
  if (loot || g.spot || Math.abs(dz) > .04 || p.cd > 0 || R() > dt * lv.rate) { if (R() < dt * .3) n.jump = true; return; }
  if (ranged && Math.abs(dx) < .5) { p.face = Math.sign(dx) || p.face; n[shoots ? 'punch' : 'grab'] = true; }
  else if (Math.abs(dx) < want + .03) {
    p.face = Math.sign(dx) || p.face;
    if (g === foe && Math.abs(dx) < .075 && R() < (foe.state === 'block' ? 0 : S.t - (foe.blockAt ?? -9) < .6 ? lv.grab * 4 : lv.grab)) n.grab = true; else n[R() < .6 ? 'punch' : 'kick'] = true;
  }
}

// ---- humans: keys (LAYOUT), or gamepad n once any of its buttons is pressed. Buttons fire on press.
const BTN = ['punch', 'kick', 'grab', 'jump', 'special'];  // buttons that act when pressed
const taps = [{}, {}], touch = { on: false, mx: 0, mz: 0, tapped: new Set() };  // tapped: buttons pressed since the last frame (a tap shorter than a frame still counts)
function rollTap(i, b) {  // double-tap a direction, or press ROLL, = roll that way; [0, 0] = roll back
  const s = taps[i], now = performance.now() / 1000;
  const dirOf = v => Math.abs(v) > .4 ? Math.sign(v) : 0;
  let r = b.roll && !s.btn ? [dirOf(b.mx), dirOf(b.mz)] : null; s.btn = b.roll;
  for (const ax of ['x', 'z']) {
    const v = ax === 'x' ? b.mx : b.mz, a = Math.abs(v), last = s['t' + ax];
    const d = a > .6 ? Math.sign(v) : a < .3 || Math.sign(v) !== s[ax] ? 0 : s[ax];  // pressed past .6, released under .3
    if (d && d !== s[ax]) {  // a fresh press of this direction
      if (last && last[0] === d && now - last[1] < TAP) { r = ax === 'x' ? [d, 0] : [0, d]; s['t' + ax] = null; }
      else s['t' + ax] = [d, now];
    }
    s[ax] = d;
  }
  return r;
}
function pad(i) { const gp = navigator.getGamepads && navigator.getGamepads()[i]; return gp && gp.connected ? gp : null; }
function readControls(i) {  // { mx, mz, punch, kick, grab, jump, special, roll } held right now for local player slot i
  const b = { mx: 0, mz: 0, punch: false, kick: false, grab: false, jump: false, special: false, roll: false }, gp = pad(net ? 0 : i);
  if (gp && gp.buttons.some(x => x.pressed)) ctrl[i] = 'pad';
  if (ctrl[i] === 'pad' && gp) {
    const on = j => !!(gp.buttons[j] && gp.buttons[j].pressed);
    b.mx = Math.abs(gp.axes[0]) > .25 ? gp.axes[0] : on(15) - on(14);
    b.mz = Math.abs(gp.axes[1]) > .25 ? gp.axes[1] : on(13) - on(12);
    Object.assign(b, { jump: on(0), grab: on(1), punch: on(2), kick: on(3), roll: on(4), special: on(5) });  // A jump, B grab/throw, X punch, Y kick, LB roll, RB special
  } else {
    const lay = layout(), m = lay[net ? 0 : i] || lay[0], on = a => (m[a] || []).some(c => keys.has(c) || tapped.has(c));
    b.mx = on('right') - on('left'); b.mz = on('down') - on('up');
    Object.assign(b, { punch: on('punch'), kick: on('kick'), grab: on('grab'), jump: on('jump'), special: on('special') });
  }
  if (touch.on && (net || i === 0)) {  // the on-screen pad (phones) drives the local player
    if (touch.mx || touch.mz) { b.mx = touch.mx; b.mz = touch.mz; }
    for (const k of [...BTN, 'roll']) b[k] = b[k] || !!touch[k] || touch.tapped.has(k);
  }
  return b;
}
function human(p, i) {
  const n = p.inp, b = readControls(i);
  n.mx = b.mx; n.mz = b.mz; n.roll = rollTap(i, b);
  for (const key of BTN) { n[key] = b[key] && !p.prev[key]; p.prev[key] = b[key]; }
}
function netIn(p) {  // host: the online guest's latest controls (presses are counters, so a short tap is never lost)
  const d = net.link.latest(), n = p.inp;
  BTN.forEach(k => n[k] = false); n.roll = null; n.mx = n.mz = 0; p.remote = null;
  if (!d || !d.in) return;
  n.mx = clamp(+d.in.mx || 0, -1, 1); n.mz = clamp(+d.in.mz || 0, -1, 1);
  const c = Array.isArray(d.in.p) ? d.in.p : [];
  BTN.forEach((b, i) => { const v = +c[i] || 0; if (v > (net.seen[i] ?? v)) n[b] = true; net.seen[i] = v; });
  const r = Array.isArray(d.in.r) ? d.in.r.map(Number) : null;  // [rolls so far, dx, dz]
  if (r && Number.isFinite(r[0])) { if (r[0] > (net.rolls ?? r[0])) n.roll = [Math.sign(r[1]) || 0, Math.sign(r[2]) || 0]; net.rolls = r[0]; }
  if (Array.isArray(d.me) && d.me.length >= 5 && d.me.slice(0, 4).every(Number.isFinite)) p.remote = d.me;
  net.ack = +d.n || 0;
}

// ---- the guests' own chaos
function chaos(dt) {
  const idle = () => S.guests.filter(g => !g.gone && !g.transit && !g.task && (g.state === 'idle' || g.state === 'walk'));
  if ((S.gaspIn -= dt) <= 0) {
    S.gaspIn = 1.5 + R() * 3;
    const g = pick(idle().filter(g => !g.say));
    if (g) { say(g, pick(GASPS)); g.cheer = 1.2; }
  }
  if ((S.dovesIn -= dt) <= 0) {  // the doves for the send-off, released early
    S.dovesIn = 9 + R() * 9;
    const dir = R() < .5 ? 1 : -1;
    for (let i = 0; i < 7; i++) S.doves.push({ x: dir > 0 ? -.04 - i * .05 : 1.04 + i * .05, y: .06 + R() * .16, dir, ph: R() * 6, sp: .2 + R() * .07 });
    snd('flap');
  }
  if (S.phase === 'fight' && (S.discoIn -= dt) <= 0) {
    S.discoIn = 26; S.disco = 7;
    text('DISCO!', W / 2, H * .3, '#ff6ad5', 1.6); snd('disco', .5, { dur: 7 });
  }
  // the UFO: drifts over a guest, beams them up, sometimes leaves a ray gun; the guest comes back later, from above
  if (S.phase === 'fight' && !S.ufo && (S.ufoIn -= dt) <= 0) {
    S.ufoIn = 11 + R() * 8;
    const target = pick(idle());
    if (target) { const dir = R() < .5 ? 1 : -1; S.ufo = { x: dir > 0 ? -.15 : 1.15, y: .13, dir, state: 'in', t: 0, target, gun: S.ufos++ === 0 || R() < .5 }; }
  }
  const u = S.ufo;
  if (u) {
    u.t += dt; snd('ufo', u.x);
    if (u.state === 'in') {
      u.x += u.dir * .32 * dt;
      if (u.target.gone || u.target.transit) u.state = 'out';
      else if ((u.x - u.target.x) * u.dir >= 0) {
        u.x = u.target.x; u.state = 'beam'; u.t = 0;
        set(u.target, 'beam'); u.target.vy = 0; say(u.target, 'HELP!'); snd('beam', u.x);
        near(u.target, S.guests, .2).forEach(g => !g.say && say(g, pick(['ALIENS?!', 'TAKE HIM!', 'NOT AGAIN!'])));
      }
    } else if (u.state === 'beam') {
      if (u.target.gone || u.t > 3.5) {
        u.state = 'out';
        if (u.gun) { S.items.push({ type: 'raygun', x: clamp(u.x, .1, .9), z: .4 + R() * .3, y: 3.2, vy: 0, vx: 0, ammo: 3, hits: 0, held: null }); snd('whistle', u.x); }
      }
    } else { u.x += u.dir * .5 * dt; if (u.x < -.25 || u.x > 1.25) S.ufo = null; }
  }
}
function faint(g) { set(g, 'faint'); say(g, pick(['*faints*', 'TOO MUCH!', 'I NEED AIR'])); snd('faint', g.x, { pitch: voice(g) }); }
function flip(g) { set(g, 'flip'); g.vy = 2.9; g.fail = R() < .35 + g.drunk * .3; g.spin = g.face; say(g, pick(['WATCH THIS!', 'HOLD MY DRINK', 'YOLO!'])); snd('boing', g.x); }
function startPuke(g, delay = 0) {
  set(g, 'puke'); g.st = -delay; say(g, 'BLEUGH');
  near(g, S.guests, .16).forEach(o => !o.say && say(o, pick(EWW)));
}

// ---- the crowd: at most CROWD guests; they walk in from the sides, stay a while, walk off; scenes happen among them
function spot(avoid = S ? S.guests : []) {  // somewhere to stand, away from others and off the middle of the dance floor
  for (let i = 0; i < 40; i++) {
    const x = .06 + R() * .88, z = R() * .95;
    if (Math.abs(x - .5) < .3 && z > .35) continue;
    if (!avoid.some(o => Math.hypot(o.x - x, (o.z - z) * 1.2) < .09)) return { x, z };
  }
  return { x: .06 + R() * .88, z: R() * .3 };
}
function enter() {
  const here = new Set(S.guests.map(g => g.k)), c = pick(S.cast.filter(c => !here.has(c.k)));
  if (!c) return;
  const to = spot(), g = person(c.k, c.img, 'guest', R() < .5 ? -.07 : 1.07, to.z);
  g.transit = 'in'; g.dest = to; g.stay = 14 + R() * 16; g.wander = R() < .3;
  S.guests.push(g); S.people.push(g);
}
function leave(g, run) {
  g.transit = 'out'; g.task = null; g.run = !!run; g.dest = { x: g.x < .5 ? -.14 : 1.14, z: g.z };
  if (g.rider) g.rider.transit = 'out';  // a horse takes its rider along
}
function director(dt) {
  if ((S.enterIn -= dt) <= 0) { S.enterIn = 2 + R() * 3.5; if (S.guests.length < CROWD) enter(); }
  S.heat = Math.max(0, S.heat - dt * .35);
  for (const g of S.guests) {
    for (const n of NEEDS) g.needs[n] = Math.min(1, g.needs[n] + GROW[n] * dt);
    g.needs.nosy = Math.min(1, g.needs.nosy + S.heat * .03 * dt); g.drunk = Math.max(0, g.drunk - .008 * dt);
    if (!g.transit && !g.task && g.state === 'idle' && (g.stay -= dt) <= 0) leave(g);
    if (g.task === 'horse' && g.state === 'idle' && (g.waitT = (g.waitT || 0) + dt) > 10) g.task = null;  // the rider never came
    if (g.task === 'pee' && g.state === 'idle' && !g.dest) { g.task = null; leave(g); }  // interrupted at the wall: off they go
    if (g.task === 'visit' && g.state === 'idle' && !g.dest) { g.task = null; g.at = null; }  // knocked over on the way
    if (g.state === 'idle' && !g.transit && !g.task && !g.gone && (g.thinkT -= dt) <= 0) { g.thinkT = .45 + R() * .4; decide(g); }
  }
  const out = S.guests.filter(g => g.transit === 'out' && (g.x < -.1 || g.x > 1.1));
  if (out.length) {
    for (const g of out) g.gone = g.left = true;
    S.guests = S.guests.filter(g => !g.left); S.people = S.people.filter(p => !p.left);
  }
}
// ---- the crowd's minds: needs, and room objects that advertise what they satisfy (utility AI, The Sims style; see
// docs/crowd-ai-research.md). Twice a second an idle guest scores every option and picks at random among the best three,
// so drinks fill bladders, a full bladder and a busy loo end in the corner, and a hot fight pulls a ring of watchers.
function decide(g) {
  const n = g.needs, opts = [], put = (v, go) => v > .04 && opts.push([v, go]);
  for (const s of SPOTS) {
    const users = S.guests.filter(o => o !== g && o.at === s).length;
    if (users >= s.slots && s.key !== 'loo') continue;
    let v = 0; for (const k in s.ads) v += s.ads[k] * n[k] * n[k];
    if (s.key === 'dj' || s.key === 'bar') v *= .6 + g.party;
    put(v - .45 * Math.hypot(s.x - g.x, s.z - g.z) - .3 * users, () => visit(g, s));
  }
  const fighters = S.phase === 'fight' ? S.players : [], close = fighters.some(p => Math.hypot(p.x - g.x, (p.z - g.z) * 1.5) < .12);
  if (close) put((1 - g.brave) * 1.3, () => { g.task = 'visit'; g.run = true; g.dest = spot(); say(g, pick(['YIKES!', 'NOT MY SHOES!', 'EXCUSE ME!'])); });
  if (S.heat > .2 && fighters.length) put(n.nosy * S.heat * (.4 + g.brave), () => watch(g));
  if (g.drunk > .6) { put(g.drunk * .45, () => startPuke(g)); put(g.drunk * g.party * .4, () => flip(g)); put(g.drunk * n.tired * .35, () => faint(g)); }
  if (g.drunk > .35 && n.fun > .5) put(n.fun * g.drunk * .45, () => horse(g));
  if (n.bladder > .9) put(2, () => S.guests.some(o => o.state === 'loo' || (o.at === LOO && o !== g)) ? pee(g) : visit(g, LOO));
  put(n.social * .25, () => { g.task = 'visit'; g.dest = spot(); });  // mingle
  if (!opts.length) return;
  const top = opts.sort((a, b) => b[0] - a[0]).slice(0, 3);
  let r = R() * top.reduce((t, o) => t + o[0], 0);
  for (const [v, go] of top) if ((r -= v) <= 0) return go();
}
function visit(g, s) {
  const i = S.guests.filter(o => o.at === s).length;
  g.at = s; g.task = 'visit'; g.run = false; g.dest = { x: clamp(s.x + (i % 3 - 1) * .035, .03, .97), z: clamp(s.z + .03 + Math.floor(i / 3) * .03, 0, 1) };
}
function watch(g) {  // join the ring around the fight, on my side of it
  const [a, b] = S.players, mx = (a.x + b.x) / 2, side = g.x < mx ? -1 : 1;
  g.at = WATCH; g.task = 'visit'; g.dest = { x: clamp(mx + side * (.22 + R() * .06), .05, .95), z: clamp((a.z + b.z) / 2 + (R() - .5) * .25, 0, 1) };
}
function pee(g) {  // the loo is taken: off to a back corner, facing the wall
  g.task = 'pee'; g.at = null; g.dest = { x: R() < .5 ? .045 : .955, z: .015 + R() * .05 };
  say(g, pick(['CAN\'T WAIT!', 'EMERGENCY!', 'THE LINE IS TOO LONG']));
}
function horse(g) {  // one bends over, the other climbs on
  const h = S.guests.find(o => o !== g && o.state === 'idle' && !o.task && !o.transit && !o.gone && Math.hypot(o.x - g.x, o.z - g.z) < .4);
  if (!h) return;
  g.task = 'mount'; g.dest = h; h.task = 'horse'; h.waitT = 0; say(g, 'GIDDY UP!');
}
function act(g, s) {  // arrived at an object: do the thing for a while
  const t = { drink: 3 + R() * 2, eat: 3 + R(), dance: 5 + R() * 3, loo: 3, sit: 4 + R() * 3, gift: 3, booth: 2.5, watch: 3 + R() * 2 }[s.act];
  g.face = s === WATCH ? (Math.sign(((S.players[0].x + S.players[1].x) / 2) - g.x) || 1) : Math.sign(s.x - g.x) || g.face;
  set(g, s.act); g.actFor = t;
  if (s.act === 'drink') { g.prop = pick(['bottle', 'champagne']); say(g, pick(['CHEERS!', 'BOTTOMS UP!', 'ONE MORE!', 'OPEN BAR!'])); }
  else if (s.act === 'eat') { g.prop = 'fork'; say(g, pick(['NOM NOM', 'CAKE!!', 'SO GOOD'])); }
  else if (s.act === 'gift') { g.prop = 'gift'; say(g, pick(['WHAT IS IT?!', 'I HOPE IT\'S CASH', '*shake shake*'])); }
  else if (s.act === 'loo') say(g, 'OCCUPIED!');
  else if (s.act === 'booth') { const [x, y] = at(g, .9); spark(x, y, g.h * .2); snd('shutter', g.x); say(g, 'CHEESE!'); }
}
function done(g) {  // a visit's effects, when it ends
  const n = g.needs, a = g.state;
  if (a === 'drink') { n.thirst = 0; n.social *= .7; n.bladder = Math.min(1, n.bladder + .22); g.drunk = Math.min(1, g.drunk + .25); }
  else if (a === 'eat') { n.hunger = 0; g.prop = null; }
  else if (a === 'dance') { n.fun *= .3; n.social *= .6; n.tired = Math.min(1, n.tired + .15); }
  else if (a === 'loo') n.bladder = 0;
  else if (a === 'sit') n.tired *= .3;
  else if (a === 'gift') { n.nosy *= .3; g.prop = null; }
  else if (a === 'booth') { n.fun *= .5; n.social *= .5; }
  else if (a === 'watch') n.nosy *= .4;
  g.at = null; g.task = null;
  set(g, 'idle');
}
function stroll(e) {  // non-fighters walk to e.dest when they have one
  if (!e.dest && e.transit === 'out') e.dest = { x: e.x < .5 ? -.14 : 1.14, z: e.z };
  if (e.dest && e.dest.id && (e.dest.gone || e.dest.left || e.dest.transit === 'out')) { e.dest = null; if (e.task === 'mount') e.task = null; }  // the horse left
  const g = e.dest;
  if (!g) { e.vx = e.vz = 0; e.state = 'idle'; return; }
  const dx = g.x - e.x, dz = g.z - e.z, d = Math.hypot(dx, dz), sp = e.run ? .3 : e.role === 'photog' ? .12 : .075;
  if (d < .015) { e.dest = null; e.vx = e.vz = 0; e.state = 'idle'; arrive(e, g); return; }
  e.vx = dx / d * sp; e.vz = dz / d * sp * .7; e.state = 'walk';
  if (Math.abs(dx) > .004) e.face = Math.sign(dx);
}
function arrive(e, g) {
  if (e.transit === 'in') e.transit = null;
  if (e.task === 'pee') { e.face = e.x < .5 ? -1 : 1; set(e, 'pee'); }
  else if (e.task === 'visit') { if (e.at) act(e, e.at); else e.task = null; e.run = false; }
  else if (e.task === 'mount') {
    e.task = null;
    const h = g;
    if (h.task === 'horse' && h.state === 'idle' && !h.gone && !h.transit) {
      set(h, 'horse'); h.rider = e; h.rideFor = 6 + R() * 4; h.dest = spot();
      set(e, 'rider'); e.mount = h; say(e, 'YEEHAW!'); say(h, 'NEIGH!'); snd('boing', e.x);
    } else if (h.task === 'horse') h.task = null;
  }
}
const hipAt = e => e.rig ? (e.rig.foot - e.rig.J.hip[1]) / (e.rig.foot - e.rig.top) : .5;

// ---- simulation
function update(dt) {
  if (S.freeze > 0) { S.freeze -= dt; ambient(dt * .25); return; }  // hit-stop
  S.dimBy = null;
  S.t += dt; S.phaseT += dt; S.bannerT -= dt;
  if (S.phase === 'intro' && !S.taunted && S.phaseT > .3) {
    S.taunted = true; const [a, b] = S.players;
    talk(a, pickLine(a, TAUNT), { to: b }); talk(b, pickLine(b, REPLY), { to: a });
  }
  if (S.phase === 'intro' && !S.called && S.phaseT > 2.8) {
    S.called = true;
    snd(match.wins[0] === 1 && match.wins[1] === 1 ? 'finalround' : `round${Math.min(S.round, 5)}`);
  }
  if (S.phase === 'intro' && S.phaseT > 3.8) { S.phase = 'fight'; S.banner = 'FIGHT!'; S.sub = ''; S.bannerT = .9; snd('fight'); }
  subs(dt);
  if (S.phase === 'finish' || S.phase === 'comic') { finishing(dt); if (!S || S.phase === 'comic') return; }  // the comic freezes the room
  if (S.phase === 'fight') {
    S.clock -= dt;
    if (S.clock <= 0) {
      const [a, b] = S.players;
      S.phase = 'ko'; S.phaseT = 0; S.banner = 'TIME!'; S.winner = a.hp === b.hp ? null : a.hp > b.hp ? a : b; snd('time');
    }
  } else if (S.phase === 'intro') { S.banner = `ROUND ${S.round}`; S.sub = mode === 'cpu' ? `LEVEL ${S.level} · ${LEVELS[S.level - 1].name}` : ''; }
  if (S.phase === 'ko') {
    const w = S.winner, wi = S.players.indexOf(w);
    if (S.phaseT > 1.4 && !S.crowned && (!w || !DOWN.has(w.state) || S.phaseT > 4)) {
      S.crowned = true; S.bannerT = 9; if (!S.finished) S.sub = '';
      if (w && !S.finished) talk(w, pickLine(w, lines(w.k).concat(GLOAT)), { to: S.players.find(p => p !== w) });
      if (!w) { S.banner = 'DRAW'; snd('gasp'); }  // the round is replayed
      else {  // every battle is best of three rounds, each in a different scene
        set(w, 'win'); snd('cheer', w.x); S.guests.forEach(g => g.cheer = 3);
        match.wins[wi]++; S.final = match.wins[wi] >= 2;
        if (mode === 'cpu' && S.final) {
          const won = wi === 0; S.banner = won && S.level === 3 ? 'CHAMPION!' : won ? 'YOU WIN!' : 'YOU LOSE'; snd(won ? 'youwin' : 'youlose');
        } else { S.banner = S.final ? `${w.name} WINS THE MATCH` : `${w.name} WINS ROUND ${S.round}`; snd(w.hp >= HP ? 'flawless' : 'winner'); }
        if (S.final) { S.confetti = 6; moshikBit(); }
      }
    }
    if (S.crowned && !S.next && S.phaseT > (S.final ? (S.moshik ? 14 : 8) : 5.5)) { S.next = true; next(); if (!S) return; }
  }
  if (S.phase === 'fight') S.players.forEach((p, i) => ctrl[i] === 'cpu' ? cpu(p, dt) : ctrl[i] === 'net' ? netIn(p) : human(p, i));
  else S.players.forEach(p => { BTN.forEach(k => p.inp[k] = false); p.inp.roll = null; });
  for (let i = 0; i < 2; i++) if (ctrl[i] === 'cpu' && mode === 'demo') { const gp = pad(i); if (gp && gp.buttons.some(b => b.pressed)) ctrl[i] = 'pad'; }
  tapped.clear(); touch.tapped.clear();
  chaos(dt);
  director(dt);
  for (const e of S.people) person_(e, dt);
  pushApart();
  for (const it of S.items) if (!it.held && (it.y > 0 || it.vy)) {
    it.vy -= 6 * dt; it.y = Math.max(0, it.y + it.vy * dt); it.x = clamp(it.x + it.vx * dt, .03, .97);
    if (!it.y) { it.vy = it.vx = 0; snd(it.type === 'raygun' ? 'metal' : 'clatter', it.x); }
  }
  const loose = S.items.filter(i => !i.held);
  if (loose.length > 12) S.items.splice(S.items.indexOf(loose.find(i => i.type !== 'raygun') || loose[0]), 1);  // tidy the oldest leftovers away
  for (const s of S.shots) {
    s.x += s.vx * dt; s.spin += dt * 16;
    if (s.type !== 'cork' && s.type !== 'laser') { s.vy -= 2.6 * dt; s.y += s.vy * dt; }
    const v = S.people.find(v => v !== s.owner && !v.gone && !DOWN.has(v.state) && !untouchable(v) && Math.abs(v.z - s.z) < .05 && Math.abs(v.x - s.x) < .03 && v.y < s.y);
    if (v) {
      const [dmg, word, sound] = THROWN[s.type];
      const scale = v.role === 'fighter' && s.owner.role === 'fighter' ? comboUp(s.owner, v) : 1;
      hurt(v, dmg * scale * (isCpu(s.owner) ? s.owner.lv.dmg : 1), Math.sign(s.vx), word, sound, { stun: .36, kb: .2 }, s.owner);
      land(s, true);
    } else if (s.y <= 0) land(s);
    else if (s.x < -.05 || s.x > 1.05) s.dead = true;
  }
  S.shots = S.shots.filter(s => !s.dead);
  for (const p of S.puddles) { p.r += (p.max - p.r) * Math.min(1, dt * p.rate); p.life -= dt; }
  S.puddles = S.puddles.filter(p => p.life > 0);
  ambient(dt);
}
function ambient(dt) {  // the purely visual part, run by host and online guest alike
  for (const d of S.doves) d.x += d.dir * d.sp * dt;
  S.doves = S.doves.filter(d => d.x > -.4 && d.x < 1.4);
  if (S.disco > 0) S.disco -= dt;
  if (S.matrix > 0) S.matrix -= dt;
  if (S.cutin && (S.cutin.t -= dt) <= 0) S.cutin = null;
  if (S.neoT > 0) S.neoT -= dt;
  for (const p of S.players) {  // the white chunk of health bar that drains a moment after a hit
    if (p.trail == null || p.trail < p.hp) p.trail = p.hp;
    else if (S.t - (p.hurtAt || 0) > .5) p.trail += (p.hp - p.trail) * (1 - Math.exp(-6 * dt));
  }
  S.white = S.white.map(w => Math.max(0, w - dt * 1.6));
  if (S.confetti > 0) {
    S.confetti -= dt;
    for (let i = 0; i < 2; i++) fx({ k: 'conf', x: R() * W, y: -H * .02, vy: H * (.12 + R() * .1), ph: R() * 6, spin: R() * 6, r: H * .007,
                                      color: pick(['#ff4d6d', '#ffd23f', '#4dd2ff', '#7dff6a', '#ffffff', '#c77dff']), life: 7, max: 7 });
  }
  for (const f of S.fx) {
    f.life -= dt;
    if (f.k === 'drop') {
      f.vy += H * 1.6 * dt; f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.floor && f.y > f.floor) { f.life = 0; f.splat && f.splat(f); }  // vomit that reaches the floor
    } else if (f.k === 'text') f.y += f.vy * dt;
    else if (f.k === 'conf') { f.y += f.vy * dt; f.x += Math.sin(S.t * 3 + f.ph) * H * .06 * dt; f.spin += dt * 5; if (f.y > H) f.life = 0; }
  }
  S.fx = S.fx.filter(f => f.life > 0);
}
function land(s, hit) {
  s.dead = true;
  if (s.type === 'cork' || s.type === 'laser') return;
  if (s.type === 'plate' || s.type === 'bottle') {
    const h = tall(s.z); spray(s.x * W, feetY(s.z) - Math.max(s.y, 0) * h, 14, '#e8f7ff', 0, H * .35, h * .012);
    if (s.type === 'bottle') puddle(s.x, s.z + .01, 'booze');
    if (!hit) snd(s.type === 'bottle' ? 'smash' : 'crash', s.x);
    return;
  }
  if (!hit) snd('clatter', s.x);
  S.items.push(Object.assign(s.it, { x: clamp(s.x, .03, .97), z: s.z, y: Math.max(s.y, 0), vy: .8, vx: -Math.sign(s.vx) * .15, held: null }));
}
function pushApart() {  // fighters can't walk through each other; a roll can (that's how you get behind someone)
  const [a, b] = S.players;
  if (!a || !b || [a, b].some(p => p.state === 'roll' || p.y > .3 || DOWN.has(p.state) || p.state === 'cursed' || p.gone)) return;
  const dx = b.x - a.x, gap = .035;
  if (Math.abs(dx) < gap && Math.abs(b.z - a.z) < .05) {
    const push = (gap - Math.abs(dx)) / 2 * (Math.sign(dx) || (a.face > 0 ? 1 : -1));
    a.x = clamp(a.x - push, .04, .96); b.x = clamp(b.x + push, .04, .96);
  }
}
function person_(e, dt) {
  if (e.gone) {  // up in the saucer; drops back in from the sky
    if (!e.left && (e.awayT -= dt) <= 0) {
      Object.assign(e, { gone: false, x: .12 + R() * .76, z: R() * .9, y: 3.4, vy: 0, vx: 0, vz: 0 });
      set(e, 'fall'); say(e, 'AAAAH!'); snd('whistle', e.x);
    }
    return;
  }
  e.st += dt; e.cd -= dt; e.flash -= dt; e.aimT -= dt; e.cheer -= dt;
  if (e.say && (e.say.t -= dt) <= 0) e.say = null;
  const free = e.state === 'idle' || e.state === 'walk', pinned = !!e.remote && free && S.phase === 'fight' && !((e.y > .05 || e.vy > 0) && e.remote[2] < .02);  // the host flies a jump it started
  e.talk -= dt;
  if (e.role === 'fighter' && free && S.phase === 'fight' && (e.quipIn -= dt) <= 0) {
    e.quipIn = 16 + R() * 14;
    const own = lines(e.k); if (own.length && !S.subs.length) talk(e, pick(own), { to: S.players.find(p => p !== e) });
  }
  if (e.role === 'fighter') {
    const n = e.inp;
    if (e.curse) curseTick(e, n, dt);  // a special on you: the controls may not be yours
    if (S.t - (e.blockAt ?? -9) > 1) e.guard = Math.min(1, (e.guard ?? 1) + dt * GUARDBAR.regen);
    const rival = S.players.find(p => p !== e), side = rival ? Math.sign(rival.x - e.x) : 0;
    if (side && side !== e.side) { e.side = side; e.sideAt = S.t; }  // they just crossed over
    if (e.state === 'grabbed' && n.grab && e.st < (e.remote ? .29 : .2) && e.grabber) tech(e);
    if ((e.curse === 'cake' || e.curse === 'face') && n.grab) { e.curseT -= .35; n.grab = false; pop('WIPE!', e, '#fff6e6', .7); }  // wipe some cream off
    if (pinned) {  // the online guest moves its own fighter; the host takes its word for where it is while it's free
      const [x, z, y, f, walking] = e.remote, nx = clamp(x, .04, .96);
      if (!e.y && y > .05) snd('swing', e.x, { pitch: .6 });
      stepSpeed(e, clamp(n.mx || 0, -1, 1), clamp(n.mz || 0, -1, 1)); e.x = nx; e.z = clamp(z, 0, 1); e.y = clamp(y, 0, 3); e.vy = 0; e.face = f < 0 ? -1 : 1;
      if (!e.y) e.airN = 0;
      e.state = walking ? 'walk' : 'idle'; e.running = walking === 2; if (e.running) e.ranAt = S.t;
      if (n.grab && !throwFoe(e)) grab(e);
    } else if (free && S.phase === 'fight') {
      const dirX = Math.sign(n.mx || 0);  // hold a direction to break into a run (a running punch or kick is a dropkick)
      e.runT = dirX && dirX === e.runDir && Math.abs(n.mx) > .85 ? (e.runT || 0) + dt : 0; e.runDir = dirX; e.running = e.runT > RUN_HOLD;
      if (e.running) e.ranAt = S.t;
      stepSpeed(e, n.mx || 0, n.mz || 0);
      if (n.mx) e.face = Math.sign(n.mx);
      e.state = n.mx || n.mz ? 'walk' : 'idle';
      if (n.jump && !e.y) { e.vy = 2.3; snd('swing', e.x, { pitch: .6 }); }
      if (n.grab && !throwFoe(e)) grab(e);
    } else if (free) { e.vx = e.vz = 0; e.state = 'idle'; }
    if (S.phase === 'fight' && !e.y) {
      if (n.roll && (e.state === 'idle' || e.state === 'walk')) roll(e, n.roll);
      else if (n.roll && canCancel(e) && (e.chaseN || 0) < 2) roll(e, n.roll, true);  // a landed blow can be chased with a dash (twice a combo)
      else if (n.special && (e.state === 'idle' || e.state === 'walk')) special(e);
      else if (n.jump && e.state === 'attack' && e.move.key === 'upper' && e.hitConfirm && e.st >= e.move.hit) {  // jump after them: an air combo
        set(e, 'idle'); e.vy = 2.6; e.airN = 0; snd('swing', e.x, { pitch: .6 });
      }
    }
    if (n.punch || n.kick) e.buf = { kind: n.kick ? 'kick' : 'punch', t: S.t };  // buffered: a press just before you can act still counts
    if (e.buf && S.phase === 'fight') {
      if (S.t - e.buf.t > .15) e.buf = null;
      else if (e.state === 'idle' || e.state === 'walk' || canCancel(e) || (e.state === 'roll' && e.roll && e.roll.kind === 'chase' && e.st > .05)) { const k = e.buf.kind; e.buf = null; attack(e, k); }
    }
  } else if (e.role === 'photog') S.moshik ? moshikTick(e, dt) : photog(e, dt, free);
  else if (free) {
    if (!e.dest && e.wander && !e.transit && !e.task && !(S.disco > 0) && R() < dt * .4) e.dest = spot();
    stroll(e);
  }
  if (free && !e.y && Math.abs(e.vx) + Math.abs(e.vz) > .03 && onPuddle(e) && R() < dt * (e.role === 'fighter' ? 2.2 : 1.6)) {  // whoops
    set(e, 'slip'); pop('WHOOPS!', e, '#8fdcff'); snd('whoops', e.x);
    if (e.role === 'fighter') e.hp = Math.max(1, e.hp - 3);
  }
  switch (e.state) {
    case 'attack': if (!e.done && e.st >= e.move.hit) { e.done = true; strike(e); } if (e.st >= e.move.t) set(e, 'idle'); break;
    case 'hit': if (e.st > (e.stunFor || .28)) set(e, 'idle'); break;
    case 'block': if (e.st > (e.blockFor || .2)) set(e, 'idle'); break;
    case 'roll': {  // fast, slowing to a stop; a real roll leaves the floor a little so the tumble clears it
      const r = e.roll || { kind: 'fwd', t: .45, dir: [e.face, 0], v: .5 }, p = clamp(e.st / r.t, 0, 1), k = 1.4 - p;
      e.vx = r.dir[0] * r.v * k; e.vz = r.dir[1] * r.v * k;
      if (r.kind === 'fwd' || r.kind === 'back') { e.y = .18 * Math.sin(Math.PI * p); e.vy = 0; }
      if (e.st >= r.t) { set(e, 'idle'); if (r.kind === 'fwd' || r.kind === 'back') e.y = 0; faceFoe(e, true); }
      break;
    }
    case 'whiff': if (e.st > .45) set(e, 'idle'); break;
    case 'cast': if (!e.done && e.st >= CAST_HIT) { e.done = true; castHit(e); } if (e.st > CAST_T) set(e, 'idle'); break;
    case 'cursed': curseMove(e, dt); break;

    case 'launched': if (!e.y && e.st > .12) { set(e, 'down'); snd('thud', e.x); S.shake = Math.max(S.shake, H * .01); } break;
    case 'grabbed': if (!e.grabber || e.grabber.state !== 'throw') { e.grabber = null; set(e, 'idle'); } break;
    case 'throw': {
      const v = e.victim;
      if (!v || v.state !== 'grabbed' || v.grabber !== e) { if (e.st > .2) { e.victim = null; set(e, 'idle'); } break; }
      if (e.st < .3) { v.x = clamp(e.x + e.face * .03, .04, .96); v.z = e.z; v.y = .1 + e.st; v.face = -e.face; }
      else {  // over the shoulder: they land behind
        v.grabber = null; e.victim = null; set(v, 'idle'); v.y = .4;
        hurt(v, 13 * comboUp(e, v) * (isCpu(e) ? e.lv.dmg : 1), -e.face, 'SUPLEX!', 'kick', { knock: 1, kb: .5 }, e);
        S.freeze = Math.max(S.freeze, .12); S.shake = Math.max(S.shake, H * .02); set(e, 'idle');
      }
      break;
    }
    case 'down': if (e.st > (e.role === 'guest' ? .6 : .85)) set(e, e.role === 'guest' ? 'cry' : 'getup'); break;
    case 'cry':
      if (e.st > e.cryFor) set(e, 'getup');
      tears(e, dt);
      if (!e.say && R() < dt * .7) { say(e, pick(CRIES)); snd('cry', e.x, { pitch: voice(e) }); }
      break;
    case 'slip': if (!e.done && e.st > .38) { e.done = true; snd('thud', e.x); }
      if (e.st > 1.1) set(e, e.role === 'guest' && R() < .55 ? 'cry' : 'getup'); break;
    case 'faint': if (!e.done && e.st > .55) { e.done = true; snd('thud', e.x, { vol: .8 }); } if (e.st > 3.2) set(e, 'getup'); break;
    case 'getup': if (e.st > .45) set(e, 'idle'); break;
    case 'dazed': if (e.st > (e.dazeFor || 2)) set(e, 'idle'); break;
    case 'smile': case 'shield': if (e.st > 1.6) set(e, 'idle'); break;
    case 'flip':
      if (e.st > .25 && !e.y) {
        e.rot = 0;
        if (e.fail) { set(e, 'down'); pop('OOF!', e, '#ffb0b0'); snd('thud', e.x); } else { set(e, 'idle'); say(e, 'TA-DA!'); snd('cheerSoft', e.x); }
      }
      break;
    case 'beam': e.y += dt * 1.3; if (S.ufo ? e.Y < S.ufo.y * H + H * .03 : e.st > 4) { e.gone = true; e.awayT = 3 + R() * 3; } break;
    case 'fall': if (!e.y && e.st > .1) { set(e, 'down'); S.shake = Math.max(S.shake, H * .012); snd('thud', e.x, { vol: 1.2 }); pop('THUD!', e, '#ffd23f'); } break;
    case 'puke':
      if (e.st >= 0 && e.st < 1.4) { if (e.st < dt + .001) snd('puke', e.x, { pitch: voice(e) }); pukeStream(e, dt, true); }
      else if (e.st >= 1.4) {
        puddle(e.x + e.face * .07, e.z + .015, 'puke', 1.4); snd('splat', e.x); set(e, 'idle');
        for (const o of near(e, S.guests, .14)) if ((o.state === 'idle' || o.state === 'walk') && !o.transit && R() < .45) startPuke(o, .3 + R() * .6);  // sympathetic pukers
      }
      break;
    case 'drink':
      if (R() < dt * (.3 + e.drunk)) { pop('HIC!', e, '#ffe9a8', .6); snd('hic', e.x, { pitch: voice(e) }); }
      if (e.st > (e.actFor || 4)) { done(e); if (e.drunk > .5) say(e, pick(['ANOTHER ONE!', 'I LOVE YOU GUYS', 'WHO MOVED THE FLOOR?'])); }
      break;
    case 'eat': case 'dance': case 'sit': case 'gift': case 'booth': case 'watch': case 'loo':
      if (e.state === 'watch' && S.heat > .9 && !e.say && R() < dt * .4) say(e, pick(GASPS));
      if (e.st > (e.actFor || 3) || (e.state === 'watch' && S.phase !== 'fight')) done(e);
      break;
    case 'pee':  // discreet: facing the wall in a back corner; all anyone sees is the puddle
      if (!e.done && e.st > .5) {
        e.done = true; say(e, pick(['AHHH...', 'SO MUCH BETTER', '*whistles*']));
        puddle(e.x + e.face * .02, e.z + .006, 'pee', .9, .35);
        for (const o of near(e, S.guests, .3)) if (!o.say) say(o, pick(['EWW!', 'DUDE!', 'NOT THE CORNER!', 'REALLY?!', 'GROSS!']));
      }
      if (e.st > 4) { e.task = null; set(e, 'idle'); leave(e); }
      break;
    case 'horse': {
      if (!e.rider || e.rider.mount !== e) { e.task = null; e.rider = null; set(e, 'idle'); say(e, 'HEY!'); break; }
      if (e.st > e.rideFor && e.transit !== 'out') { e.transit = e.rider.transit = 'out'; e.dest = { x: e.x < .5 ? -.2 : 1.2, z: e.z }; }  // gallop off together
      if (!e.dest || Math.hypot(e.dest.x - e.x, e.dest.z - e.z) < .02) e.dest = spot();
      const dx = e.dest.x - e.x, dz = e.dest.z - e.z, d = Math.hypot(dx, dz) || 1;
      e.vx = dx / d * .11; e.vz = dz / d * .07; if (Math.abs(dx) > .004) e.face = Math.sign(dx);
      if (R() < dt * 5) snd('clop', e.x);
      if (!e.rider.say && R() < dt * .5) say(e.rider, pick(['YEEHAW!', 'GIDDY UP!', 'FASTER!', 'WHEEE!']));
      break;
    }
    case 'rider': {
      const h = e.mount;
      if (!h || h.gone || h.left || h.rider !== e || h.state !== 'horse') { e.mount = null; set(e, 'fall'); e.vy = .5; break; }
      e.x = h.x + h.face * .02; e.z = h.z + .002; e.face = h.face; e.vx = e.vz = 0; e.vy = 0;
      e.y = Math.max(0, hipAt(h) - (h.sink || 0) - hipAt(e) + .08) + Math.abs(Math.sin(h.walkPh)) * .03;
      break;
    }
    case 'win': if (!e.y && R() < dt * 3) e.vy = 1.7; break;
  }
  const lying = ['down', 'cry', 'ko', 'slip'].includes(e.state) || (e.state === 'faint' && e.st > .4) || (e.state === 'bent' && e.st > .35);
  if (e.state === 'flip') e.rot = -TAU * clamp(e.st / .8, 0, 1) * e.spin;
  else if (e.state === 'beam' || e.state === 'fall') e.rot += dt * 6;
  else if (e.state === 'roll') e.rot = e.roll && (e.roll.kind === 'fwd' || e.roll.kind === 'back') ? TAU * clamp(e.st / e.roll.t, 0, 1) * (Math.sign(e.roll.dir[0] * e.face) || 1) : 0;
  else if (e.state === 'cursed' && e.curse === 'escalator') e.rot = e.st < .5 ? 0 : -TAU * (e.st - .5) * 1.6;
  else {
    e.rot = ((e.rot + Math.PI) % TAU + TAU) % TAU - Math.PI;  // unwind a spin before settling
    const target = lying ? -D : e.state === 'faint' ? Math.sin(e.st * 18) * .15 : e.state === 'launched' ? -.9 : e.state === 'grabbed' ? -.5 : 0;
    e.rot += (target - e.rot) * Math.min(1, dt * (e.state === 'slip' ? 24 : e.state === 'getup' ? 7 : e.state === 'faint' ? 5 : e.state === 'bent' ? 5 : 14));
  }
  const wide = e.transit || e.state === 'horse' || e.state === 'rider';
  if (!pinned) { e.x = clamp(e.x + e.vx * dt, wide ? -.25 : .04, wide ? 1.25 : .96); e.z = clamp(e.z + e.vz * dt, 0, 1); }
  if (!free && e.state !== 'horse') { const f = Math.exp(-5 * dt); e.vx *= f; e.vz *= f; }  // knockbacks die down; walking speeds are set fresh each frame
  if (!pinned && e.state !== 'beam' && e.state !== 'rider' && e.state !== 'grabbed' && !(e.state === 'cursed' && (e.curse === 'balloon' || e.curse === 'escalator' || e.curse === 'carry' || (e.curse === 'transform' && e.curseSp && e.curseSp.motion === 'float'))) && (e.y > 0 || e.vy > 0)) {
    e.vy -= 7 * dt; e.y = Math.max(0, e.y + e.vy * dt); if (!e.y) { e.vy = 0; e.airN = 0; }
  }
  if (e.state === 'walk' || e.state === 'horse') e.walkPh += dt * (5 + Math.hypot(e.vx, e.vz) * 30);
  place(e); animate(e, dt);
}
function place(e) { e.h = tall(e.z); e.X = e.x * W; e.Y = feetY(e.z) - e.y * e.h; }

// ---- puppet animation: every frame each joint eases toward the pose for what the person is doing
function poseFor(e) {
  const t = S.t + e.seed, st = e.st;
  switch (e.state) {
    case 'attack': {
      if (e.threw) return POSE.throw();
      const m = e.move || MOVES.jab;
      return (POSE[m.pose] || POSE.punch)(t, st / m.t, m.hit / m.t);
    }
    case 'hit': return POSE.hit();
    case 'block': return POSE.shield();
    case 'launched': case 'grabbed': return POSE.flail(t);
    case 'throw': return POSE.grip();
    case 'roll': return !e.roll || e.roll.kind === 'fwd' || e.roll.kind === 'back' ? POSE.tuck() : e.roll.kind === 'chase' ? POSE.sprint(t * 3) : POSE.guard(t);
    case 'whiff': return POSE.grip();
    case 'cast': return e.cast === 'spoon' ? POSE.aim() : POSE.cheer(t);
    case 'bent': return POSE.stand(t);
    case 'cursed': return e.curse === 'disco' ? POSE.dance(t) : e.curse === 'balloon' ? POSE.flail(t * .25) : e.curse === 'ice' ? POSE.hit()
      : e.curse === 'smooch' ? POSE.swoon() : e.curse === 'escalator' ? (e.st < 1.7 ? POSE.flail(t) : POSE.tuck()) : POSE.dazed(t);
    case 'down': case 'ko': return POSE.lie();
    case 'cry': return POSE.cry(t);
    case 'slip': return st < .6 ? POSE.slip(t) : POSE.lie();
    case 'faint': return st < .45 ? POSE.swoon() : POSE.lie();
    case 'getup': return POSE.crouch();
    case 'flip': return POSE.tuck();
    case 'beam': case 'fall': return POSE.flail(t);
    case 'puke': return POSE.puke(t);
    case 'win': return POSE.cheer(t);
    case 'dazed': return POSE.dazed(t);
    case 'drink': return POSE.drink(st);
    case 'horse': return POSE.horse(t);
    case 'rider': return POSE.rider(t);
    case 'pee': return POSE.pee();
    case 'eat': return POSE.drink(st);
    case 'dance': return POSE.dance(t);
    case 'sit': return e.role === 'photog' ? (e.nocam ? POSE.smoke(e.cig ? smokeK(e) : 0) : POSE.camSit()) : POSE.sit();
    case 'gift': return POSE.gift(t);
    case 'booth': return POSE.smile();
    case 'watch': return S.heat > .6 || e.cheer > 0 ? POSE.cheer(t) : POSE.stand(t);
    case 'smile': return POSE.smile();
    case 'shield': return POSE.shield();
    case 'aim': return POSE.camAim();
    case 'shoot': return POSE.camShoot();
  }
  const walking = e.state === 'walk';
  if (e.aimT > 0) return POSE.aim();
  if (e.role === 'fighter') return e.y > .02 ? POSE.jump() : walking ? (e.running ? POSE.sprint(e.walkPh) : POSE.march(e.walkPh)) : POSE.guard(t);
  if (e.role === 'photog') return walking ? (e.nocam && e.chair === 1 ? POSE.drag(e.walkPh) : POSE.camWalk(e.walkPh)) : POSE.stand(t);
  if (walking) return e.run ? POSE.run(e.walkPh) : POSE.walk(e.walkPh);
  if (S.disco > 0) return POSE.dance(t);
  if (e.cheer > 0) return POSE.cheer(t);
  return POSE.stand(t);
}
function animate(e, dt) {
  if (!e.rig) return;
  const pose = poseFor(e); pose.mouth = e.talk > 0 ? Math.max(0, Math.sin(S.t * 30 + e.seed * 3)) : 0;
  const tgt = Puppet.solve(e.rig, pose), k = Math.min(1, dt * (e.state === 'attack' ? 30 : DOWN.has(e.state) ? 9 : 15));
  for (const n in tgt) e.ang[n] = (e.ang[n] || 0) + (tgt[n] - (e.ang[n] || 0)) * k;
  e.ang.mouth = tgt.mouth;
  const upright = !['down', 'cry', 'ko', 'slip', 'faint', 'flip', 'beam', 'fall', 'rider', 'launched', 'grabbed', 'roll', 'cursed', 'bent'].includes(e.state) && e.y < .02;
  e.sink += ((upright ? Puppet.sink(e.rig, e.ang) : 0) - e.sink) * k;  // bent knees lower the body instead of lifting the feet
}

// ---- drawing
function drawItem(type, h, ang, ammo, g = ctx) {
  const s = h / 330, parts = type === 'champagne' && ammo ? SHAPES.champagne.concat([['r', -4, -72, 8, 13, '#c8a165']]) : SHAPES[type];
  if (!parts) return;
  g.save(); g.rotate(ang); g.scale(s, s); g.lineJoin = 'round';
  for (const pass of [0, 1]) for (const [k, ...a] of parts) {  // pass 0: white paper rim, pass 1: colour
    const fill = a[a.length - 1];
    let path = null;
    if (k === 'p') path = a[0];
    else { g.beginPath(); k === 'r' ? g.roundRect(a[0], a[1], a[2], a[3], 4) : g.ellipse(a[0], a[1], a[2], a[3], 0, 0, TAU); }
    if (pass) { g.fillStyle = fill; path ? g.fill(path) : g.fill(); }
    else { g.lineWidth = 8; g.strokeStyle = '#fff'; path ? g.stroke(path) : g.stroke(); }
  }
  g.restore();
}
function holding(e) {  // in the front hand: +x runs along the forearm, so 0 = held like a hammer, D = pointing where the arm points
  if (!e.item && !e.prop && e.cig) return cigInHand(e);
  const type = e.item ? e.item.type : e.prop;
  const ang = type === 'raygun' ? 0 : e.aimT > 0 || (e.state === 'attack' && e.move === MOVES.fork) ? D : e.state === 'drink' ? D + .5 : 0;
  drawItem(type, e.h, ang, e.item ? e.item.ammo : 0);
}
function star(x, y, r, fill) {
  ctx.fillStyle = fill; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const q = i * TAU / 10 - Math.PI / 2, rr = i % 2 ? r * .45 : r; ctx.lineTo(x + Math.cos(q) * rr, y + Math.sin(q) * rr); }
  ctx.closePath(); ctx.fill();
}
const TEAM = ['#ff4d3a', '#3aa0ff'];
function bobOf(e) {  // the little bounce of walking, dancing and breathing
  const h = e.h;
  const dancing = S.disco > 0 && e.role === 'guest' && (e.state === 'idle' || e.state === 'walk');
  return e.state === 'walk' || e.state === 'horse' ? Math.abs(Math.sin(e.walkPh)) * h * .02 : dancing ? Math.abs(Math.sin(S.t * 8 + e.seed)) * h * .03
    : DOWN.has(e.state) ? 0 : (Math.sin(S.t * 2.2 + e.seed) * .5 + .5) * h * .005;
}
const glowCv = [0, 1].map(() => [document.createElement('canvas'), document.createElement('canvas')]), glowQ = [0, 1].map(() => document.createElement('canvas'));
function drawGlow(e, i) {  // a red / blue halo around each fighter, drawn over everything so it shows through whoever stands in front
  if (!e.rig || e.gone || !e.img) return;
  const h = e.h, size = Math.ceil(h * 1.9), [a, b] = glowCv[i], ox = e.X - size / 2, oy = e.Y - h * 1.33;
  for (const c of [a, b]) if (c.width !== size) c.width = c.height = size;
  const g = a.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, size, size);
  const neoOn = S.neoT > 0 && S.neo === e;
  if (critter(e)) { g.translate(-ox, -oy); drawCritter(e, bobOf(e), g); }
  else { g.translate(e.X - ox, e.Y - oy - bobOf(e)); g.scale(e.face, 1); turn(g, e); Puppet.draw(g, e.rig, e.ang, h, { sink: e.sink }); }
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = neoOn ? '#c8ffd8' : TEAM[i]; g.fillRect(0, 0, size, size); g.globalCompositeOperation = 'source-over';
  const q = glowQ[i], qs = Math.max(8, Math.round(size / (neoOn ? 10 : 7))), qg = q.getContext('2d');
  if (q.width !== qs) q.width = q.height = qs;
  qg.clearRect(0, 0, qs, qs);
  for (const [dx, dy] of [[0, 0], [.6, 0], [-.6, 0], [0, .6], [0, -.6]]) qg.drawImage(a, dx, dy, qs, qs);
  const r = b.getContext('2d');
  r.setTransform(1, 0, 0, 1, 0, 0); r.clearRect(0, 0, size, size); r.imageSmoothingEnabled = true; r.imageSmoothingQuality = 'high';
  r.globalAlpha = neoOn ? .65 + .2 * Math.sin(S.t * 12.6) : .38; r.drawImage(q, 0, 0, size, size); if (neoOn) r.drawImage(q, 0, 0, size, size); r.globalAlpha = 1;  // a faint rim; Neo blazes
  r.globalCompositeOperation = 'destination-out'; r.drawImage(a, 0, 0); r.globalCompositeOperation = 'source-over';  // only the halo outside the body
  if (neoOn) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(b, ox, oy); ctx.restore(); }
  ctx.drawImage(b, ox, oy);
}
function reachMarks() {  // a pulsing arrow over the rival whenever your next blow would land
  const mine = net ? [mySlot()] : [0, 1].filter(i => ctrl[i] !== 'cpu');
  for (const i of mine) {
    const p = S.players[i], f = S.players[1 - i];
    if (!p || !f || f.gone || DOWN.has(f.state) || S.phase !== 'fight') continue;
    const dx = Math.abs(f.x - p.x), reach = (p.item && MOVES[p.item.type] ? MOVES[p.item.type].reach : MOVES.jab.reach) + .01;
    if (dx > reach || Math.abs(f.z - p.z) > .06) continue;
    const [x, y] = at(f, 1.22), s = f.h * .05 * (1 + .15 * Math.sin(S.t * 14));
    ctx.fillStyle = TEAM[i]; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.5, s * .25);
    ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x, y + s * .3); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}
function drawPerson(e) {
  if (!e.img) return;
  const h = e.h, p = S.players.indexOf(e);
  ctx.fillStyle = 'rgba(25, 12, 0, .3)';
  ctx.beginPath(); ctx.ellipse(e.X, feetY(e.z), Math.max(2, h * .14 * (1 - Math.min(e.y, .8)) + (e.rot < -1 && e.state !== 'flip' ? h * .25 : 0)), h * .04, 0, 0, TAU); ctx.fill();
  if (p >= 0) {  // fighter: team ring on the floor and a tag overhead, so they stand out from the crowd
    ctx.strokeStyle = TEAM[p]; ctx.lineWidth = h * .012;
    ctx.beginPath(); ctx.ellipse(e.X, feetY(e.z), h * .16, h * .045, 0, 0, TAU); ctx.stroke();
    if ((e.guard ?? 1) < .999) {  // what's left of their guard, around the ring
      ctx.strokeStyle = e.guard < .35 ? '#D55E00' : '#ffffff'; ctx.lineWidth = h * .02;
      ctx.beginPath(); ctx.ellipse(e.X, feetY(e.z), h * .16, h * .045, 0, Math.PI * .5, Math.PI * .5 + TAU * Math.max(0, e.guard)); ctx.stroke();
    }
    if (!DOWN.has(e.state)) { const [x, y] = at(e, 1.1); label(net ? (p === mySlot() ? 'YOU' : 'P' + (p + 1)) : `P${p + 1}`, x, y, h * .07, 'center', TEAM[p], 'pixel'); }
  }
  const bob = bobOf(e);
  if (e.chair) drawChair(e);
  if (e.curse === 'escalator' && e.esc && e.state === 'cursed') drawEscalator(e);
  if (e.curse === 'carry' && e.state === 'cursed' && e.curseSp && e.curseSp.path === 'slide') drawCarry(e);
  if (e.state === 'cast' && e.castX != null) {  // the special's bolt running along the floor to where the rival stood
    const p = clamp(e.st / CAST_HIT, 0, 1), x0 = e.X, y0 = feetY(e.z), x1 = x0 + (e.castX * W - x0) * p, y1 = y0 + (feetY(e.castZ) - y0) * p, c = spOf(e.k).color || (CURSE[e.cast] || CURSE.pig).color;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = c; ctx.lineCap = 'round';
    ctx.lineWidth = h * .03; ctx.globalAlpha = .5; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) star(x1 + (R() - .5) * h * .1, y1 - h * (.05 + R() * .25), h * .025, i % 2 ? c : '#ffffff');
    ctx.restore();
  }
  if (critter(e)) { drawCritter(e, bob); return curseFx(e); }
  ctx.save(); ctx.translate(e.X, e.Y - bob); ctx.scale(e.face, 1); turn(ctx, e);
  if (e.flash > 0) ctx.filter = 'brightness(2.6)';
  if (e.rig) Puppet.draw(ctx, e.rig, e.ang, h, { sink: e.sink, hand: e.item || e.prop || (e.cig && e.nocam) ? () => holding(e) : null });
  else {
    const w = h * e.img.width / e.img.height;
    ctx.drawImage(e.img, -w / 2, -h, w, h);
    if (e.item) { ctx.translate(w * .3, -h * .5); drawItem(e.item.type, h, -.35, e.item.ammo); }
  }
  ctx.filter = 'none';
  ctx.restore();
  if (e.state === 'faint' || e.state === 'ko' || e.state === 'dazed' || (e.role === 'fighter' && e.state === 'down')) {  // seeing stars
    const [x, y] = at(e, e.state === 'dazed' ? 1.02 : .95);
    for (let i = 0; i < 3; i++) { const q = S.t * 4 + i * TAU / 3; star(x + Math.cos(q) * h * .08, y - h * .06 + Math.sin(q) * h * .025, h * .022, '#ffe14d'); }
  }
  if (e.curse) curseFx(e);
  if (e.cig) drawCig(e);
  if (e.state === 'cursed' && e.curse === 'drop') drawDrop(e);
  if (e.state === 'cursed' && e.curse === 'carry' && !(e.curseSp && e.curseSp.path === 'slide')) drawCarry(e);
}
function drawChair(e) {  // Moshik's chair: dragged tilted behind him, then set down under him
  const P = prop('xchair');
  if (!P) return;
  const h = e.h, base = P.base || [.5, 1], seat = P.seat || [.5, .55], ih = h * .27 / Math.max(.15, base[1] - seat[1]), iw = ih * P.im.width / P.im.height;
  ctx.save();
  if (e.chair === 1) { ctx.translate(e.X - e.face * h * .2, feetY(e.z)); ctx.rotate(-e.face * .45); }  // tipped back on two legs, scraping along
  else ctx.translate(e.X - e.face * h * .03, feetY(e.z));
  ctx.scale((P.facing === 'left' ? -1 : 1) * e.face, 1);
  ctx.drawImage(P.im, -base[0] * iw, -base[1] * ih, iw, ih);
  ctx.restore();
}
function cigInHand(e) {  // between the fingers, pointing out of the fist; the tip glows while he drags on it
  const P = prop('cigarette');
  if (!P) return;
  const f = P.filter || [0, .5], t = P.tip || [1, .5], len = e.h * .075, iw = len / Math.max(.2, t[0] - f[0]), ih = iw * P.im.height / P.im.width;
  ctx.save(); ctx.rotate(-D * .7); ctx.drawImage(P.im, -f[0] * iw, -f[1] * ih, iw, ih);
  if (smokeK(e) > .9) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255, 120, 30, .8)'; ctx.beginPath(); ctx.arc((t[0] - f[0]) * iw, (t[1] - f[1]) * ih, e.h * .006, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function drawCig(e) {
  const P = prop('cigarette');
  if (!P || e.nocam) return;
  const [x, y] = at(e, .87, .03), f = P.filter || [0, .5], t = P.tip || [1, .5], len = e.h * .075, iw = len / Math.max(.2, t[0] - f[0]), ih = iw * P.im.height / P.im.width;
  ctx.save(); ctx.translate(x, y); ctx.scale(e.face, 1); ctx.rotate(.18); ctx.drawImage(P.im, -f[0] * iw, -f[1] * ih, iw, ih); ctx.restore();
}
function turn(g, e) {  // a roll spins about the middle of the body, not the feet; a cursed body shrinks or puffs up
  const c = (e.state === 'roll' && Math.abs(e.rot) > .01) || (e.state === 'cursed' && e.curse === 'escalator' && e.st > .5) ? e.h * .38 : 0;
  g.translate(0, -c); g.rotate(e.rot); g.translate(0, c);
  if (e.curse === 'tiny') g.scale(.5, .5);
  else if (e.curse === 'drop' && e.state === 'cursed' && e.st > .35) g.scale(1.4, .22);  // paper-flat
  else if (e.curse === 'balloon' && e.state === 'cursed') { const k = Math.min(1, e.st * 2.5); g.scale(1 + .7 * k + .05 * Math.sin(S.t * 9), 1 + .25 * k); }
}
const propImg = {};
function prop(key) {  // a photo prop from props.js (cut out with a paper rim like the people, plus where things go on it), once it has decoded
  const p = window.PROPS && window.PROPS[key];
  if (!p || !p.img) return null;
  if (!propImg[key]) { const i = new Image(); i.src = p.img; propImg[key] = i; }
  return propImg[key].complete && propImg[key].naturalWidth ? Object.assign({ im: propImg[key] }, p) : null;
}
const critterKey = e => e.curse === 'transform' ? spProp(e) : e.curse;
const critter = e => (e.curse === 'spoon' || (e.state === 'cursed' && (e.curse === 'pig' || e.curse === 'chicken' || e.curse === 'transform'))) && !!prop(critterKey(e));
function rimmed(cv) {  // the face with a white paper edge, like everything else cut out of a photo
  if (cv.rim) return cv.rim;
  const r = Math.max(2, Math.round(cv.height * .04)), c = Object.assign(document.createElement('canvas'), { width: cv.width + 2 * r, height: cv.height + 2 * r }), g = c.getContext('2d');
  for (let a = 0; a < TAU; a += TAU / 12) g.drawImage(cv, r + Math.cos(a) * r, r + Math.sin(a) * r);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over'; g.drawImage(cv, r, r);
  return (cv.rim = c);
}
function headOf(e) {  // the victim's face, cut from their puppet (or the top of a flat cut-out)
  const r = e.rig;
  if (r && r.parts.head) {
    if (!r.headCv) {
      const p = r.parts.head, c = Object.assign(document.createElement('canvas'), { width: p.canvas.width, height: p.canvas.height }), g = c.getContext('2d');
      g.drawImage(p.canvas, 0, 0); if (r.parts.jaw) g.drawImage(r.parts.jaw.canvas, 0, 0);
      r.headCv = c; r.headK = 1 / (r.foot - r.top);
    }
    return [r.headCv, r.headK];
  }
  if (!e.img) return null;
  if (!e.headCv) { const c = Object.assign(document.createElement('canvas'), { width: e.img.width, height: Math.round(e.img.height * .22) }); c.getContext('2d').drawImage(e.img, 0, 0); e.headCv = c; }
  return [e.headCv, 1 / e.img.height];
}
function drawCritter(e, bob, g = ctx) {  // the photo pig, chicken or spoon with the victim's face pasted on, rocking like a paper puppet
  const P = prop(critterKey(e)), h = e.h, hd = headOf(e), t = S.t + e.seed, walk = Math.hypot(e.vx, e.vz) > .01, sp = e.curseSp || {};
  if (!P) return;
  const im = P.im, face = hd && rimmed(hd[0]);
  g.save(); g.translate(e.X, e.Y - bob);
  if (e.curse === 'spoon') {  // standing on its handle; a hit bends it at the neck and it springs back; the finisher snaps it and it topples
    const ih = h * .95 / (P.foot || 1), iw = ih * im.width / im.height, x0 = -iw / 2, y0 = -ih * (P.foot || 1);
    const bend = e.finBend ?? (e.bendAt ? .7 * Math.max(0, 1 - (S.t - e.bendAt) / .4) : 0);
    const shiver = S.spoonFin && S.spoonFin.t > 1.6 && S.spoonFin.t < 2.4 ? (R() - .5) * 2 * DPR : 0;
    g.translate(shiver, 0); g.rotate(e.rot + (e.state === 'cursed' ? Math.sin(t * 3) * .05 : 0)); g.scale(e.face, 1);
    const nx = x0 + P.neck[0] * iw, ny = y0 + P.neck[1] * ih;
    g.save(); g.beginPath(); g.rect(x0 - iw, ny, iw * 3, ih); g.clip(); g.drawImage(im, x0, y0, iw, ih); g.restore();  // the handle
    g.save(); g.translate(nx, ny); g.rotate(bend); g.translate(-nx, -ny);  // the bowl, bent at the neck
    g.beginPath(); g.rect(x0 - iw, y0 - ih, iw * 3, ny - y0 + ih); g.clip(); g.drawImage(im, x0, y0, iw, ih);
    const [bx, by, rx, ry] = P.bowl, cx = x0 + bx * iw, cy = y0 + by * ih;
    g.beginPath(); g.ellipse(cx, cy, rx * iw * .92, ry * ih * .92, 0, 0, TAU); g.clip();
    if (hd) { const fh = ry * ih * 1.7, fw = hd[0].width * fh / hd[0].height; g.save(); g.translate(cx, cy); g.scale(1, -1); g.globalAlpha = .9; g.drawImage(hd[0], -fw / 2, -fh / 2, fw, fh); g.restore(); }  // upside down, as a spoon shows you
    if (e.xEyes) {
      g.strokeStyle = '#1d0d00'; g.lineWidth = h * .014;
      for (const sx of [-1, 1]) { const ex = cx + sx * rx * iw * .3, ey = cy + ry * ih * .15, r = rx * iw * .12; g.beginPath(); g.moveTo(ex - r, ey - r); g.lineTo(ex + r, ey + r); g.moveTo(ex + r, ey - r); g.lineTo(ex - r, ey + r); g.stroke(); }
    }
    g.restore();
  } else {  // pig, chicken or any transform: the photo thing with their face on it
    const ih = h * (+sp.size || (e.curse === 'pig' ? .5 : .55)), iw = ih * im.width / im.height, flip = (P.facing === 'left' ? -1 : 1) * e.face;
    if (sp.motion === 'roll' && walk) { g.translate(0, -ih * .45); g.rotate(e.st * 7 * e.face); g.translate(0, ih * .45); }
    else g.rotate(walk ? Math.sin(t * 14) * .07 : Math.sin(t * 2) * .02);  // waddle
    if (e.curse === 'chicken' && e.y > .01) g.rotate(-.15 * flip);
    g.scale(flip, 1);
    const x0 = -iw / 2, y0 = -ih * (P.feet || 1);
    g.drawImage(im, x0, y0, iw, ih);
    if (face) { const [fx, fy, fh] = P.face || [.5, .22, .3], sh = fh * ih * 1.35, sw = face.width * sh / face.height; g.drawImage(face, x0 + fx * iw - sw / 2, y0 + fy * ih - sh / 2, sw, sh); }
  }
  g.restore();
}
function drawDrop(e) {  // the thing falls out of the sky and stays on top of the flattened victim
  const P = prop(spProp(e));
  if (!P) return;
  const ih = e.h * (+(e.curseSp || {}).size || .9), iw = ih * P.im.width / P.im.height, base = P.base || [.5, 1], f = clamp(e.st / .35, 0, 1);
  const land = e.Y - e.h * .2, y = -ih + (land + ih) * f * f, wob = f >= 1 ? Math.sin(e.st * 18) * Math.max(0, 1 - (e.st - .35) * 3) * .06 : 0;
  ctx.save(); ctx.translate(e.X, y); ctx.rotate(wob); ctx.drawImage(P.im, -base[0] * iw, -base[1] * ih, iw, ih); ctx.restore();
}
function drawCarry(e) {  // whatever hauls them off (above them) or carries them along the floor (under them)
  const P = prop(spProp(e)), sp = e.curseSp || {};
  if (!P) return;
  const ih = e.h * (+sp.size || .8), iw = ih * P.im.width / P.im.height, grip = P.grip || (sp.path === 'slide' ? [.5, .4] : [.5, .95]);
  const flip = (P.facing === 'left' ? -1 : 1) * ((e.carry && e.carry.dir) || 1);
  const [x, y] = sp.path === 'slide' ? at(e, .02) : at(e, 1.02), drop = sp.path === 'slide' ? 0 : Math.max(0, 1 - e.st / .4) * H;
  ctx.save(); ctx.translate(x, y - drop); ctx.scale(flip, 1); ctx.rotate(sp.path === 'slide' ? 0 : Math.sin(S.t * 8) * .06);
  ctx.drawImage(P.im, -grip[0] * iw, -grip[1] * ih, iw, ih); ctx.restore();
}
function drawEscalator(e) {  // the photo escalator rises out of the floor under the victim (who rides up to its top landing), then sinks back
  const P = prop('escalator'), s = e.esc;
  if (!P || !s) return;
  const lift = e.h * .95, ih = lift / Math.max(.2, P.bottom[1] - P.top[1]), iw = ih * P.im.width / P.im.height, yb = feetY(s.z), end = CURSE.escalator.t;
  const rise = clamp(Math.min(e.st / .5, (end - e.st) / .5), 0, 1);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, yb + e.h * .02); ctx.clip();  // whatever is below the floor stays hidden
  ctx.translate(s.x * W, yb - lift * rise); ctx.scale(s.dir, 1);  // the photo goes down to the right; mirrored when they fall left
  ctx.drawImage(P.im, -P.top[0] * iw, -P.top[1] * ih, iw, ih);
  ctx.restore();
}
function escRun(v) {  // how far along the floor the escalator carries them (floor widths)
  const P = prop('escalator');
  if (!P) return .26;
  const ih = v.h * .95 / Math.max(.2, P.bottom[1] - P.top[1]), iw = ih * P.im.width / P.im.height;
  return clamp((P.bottom[0] - P.top[0]) * iw / W, .1, .4);
}
function curseFx(e) {  // what floats around a cursed fighter
  const h = e.h, t = S.t + e.seed, [hx, hy] = at(e, .9);
  const P = prop(e.curse === 'encase' || e.curse === 'face' || e.curse === 'swarm' ? spProp(e) : e.curse), sp = e.curseSp || {};
  if ((e.curse === 'ice' || e.curse === 'encase') && e.state === 'cursed' && P) {  // the photo ice block, its inside fitted around them
    const [a0, b0, a1, b1] = P.inner || [.1, .1, .9, .95], bw = h * .42, bh = h * 1.1, iw = bw / (a1 - a0), ih = bh / (b1 - b0);
    ctx.drawImage(P.im, e.X - bw / 2 - a0 * iw, e.Y - bh - b0 * ih, iw, ih);
  } else if (e.curse === 'fart') {
    for (let i = 0; i < 7; i++) {
      const q = t * 1.3 + i * 1.7, r = h * (.08 + .03 * Math.sin(t * 3 + i));
      ctx.fillStyle = `rgba(150, 200, 60, ${.28 + .1 * Math.sin(t * 2 + i)})`; ctx.beginPath(); ctx.arc(e.X + Math.cos(q) * h * .2, e.Y - h * (.25 + .2 * Math.sin(q * .7)), r, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#1d232a';
    for (let i = 0; i < 3; i++) { const q = t * 7 + i * 2; ctx.beginPath(); ctx.arc(hx + Math.sin(q) * h * .14, hy - h * .05 + Math.sin(q * 2) * h * .05, h * .008, 0, TAU); ctx.fill(); }  // flies
  } else if (e.curse === 'smooch') {
    for (let i = 0; i < 3; i++) { const q = t * 3 + i * TAU / 3; heart(hx + Math.cos(q) * h * .13, hy - h * .08 + Math.sin(q) * h * .04, h * .03); }
    ctx.strokeStyle = '#e8173a'; ctx.lineWidth = h * .012; ctx.beginPath(); ctx.arc(hx + e.face * h * .03, hy + h * .02, h * .02, .2, Math.PI - .2); ctx.stroke();  // lipstick
  } else if ((e.curse === 'cake' || e.curse === 'face') && P) {  // the photo thing stuck on their face (or on their head)
    const [ax, ay] = sp.spot === 'head' ? at(e, 1.0) : [hx, hy], iw = h * .14 * (+sp.size || 1) / (P.w || .6), ih = iw * P.im.height / P.im.width, [cx, cy] = P.center || [.5, .5];
    ctx.drawImage(P.im, ax - cx * iw, ay - cy * ih, iw, ih);
  } else if (e.curse === 'swarm' && P && e.state === 'cursed') {  // a cloud of them buzzing about, darting in and out
    const n = clamp(+sp.n || 6, 3, 12), sz = h * clamp(+sp.size || .1, .04, .25), iw = sz * P.im.width / Math.max(P.im.width, P.im.height), ih = sz * P.im.height / Math.max(P.im.width, P.im.height);
    for (let i = 0; i < n; i++) {
      const q = t * (1.6 + i * .17) + i * 2.4, x = e.X + Math.cos(q) * h * (.22 + .08 * Math.sin(t * 3 + i)), y = e.Y - h * (.55 + .3 * Math.sin(q * 1.3 + i)), dir = -Math.sin(q) < 0 ? -1 : 1;
      ctx.save(); ctx.translate(x, y); ctx.scale(dir * (P.facing === 'left' ? -1 : 1), 1); ctx.rotate(Math.sin(t * 9 + i) * .25); ctx.drawImage(P.im, -iw / 2, -ih / 2, iw, ih); ctx.restore();
    }
  } else if (e.curse === 'disco' && e.state === 'cursed') {
    for (let i = 0; i < 8; i++) { const q = t * 4 + i * TAU / 8; ctx.fillStyle = `hsl(${(i * 45 + t * 200) % 360} 90% 70%)`; ctx.fillRect(e.X + Math.cos(q) * h * .25, e.Y - h * .5 + Math.sin(q) * h * .35, h * .02, h * .02); }
  } else if (e.curse === 'dizzy') {
    for (let i = 0; i < 3; i++) { const q = t * 5 + i * TAU / 3; star(hx + Math.cos(q) * h * .09, hy - h * .12 + Math.sin(q) * h * .025, h * .02, '#ffe14d'); }
    label('?', hx + Math.sin(t * 3) * h * .1, hy - h * .2, h * .08, 'center', '#ffe14d');
  } else if (e.curse === 'balloon' && e.state === 'cursed') {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, h * .005); ctx.beginPath(); ctx.moveTo(e.X, e.Y); ctx.quadraticCurveTo(e.X + Math.sin(t * 3) * h * .05, e.Y + h * .15, e.X, e.Y + h * .3); ctx.stroke();
  }
}
function heart(x, y, r) {
  ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.moveTo(x, y + r * .9);
  ctx.bezierCurveTo(x - r * 1.6, y - r * .2, x - r * .6, y - r * 1.4, x, y - r * .5); ctx.bezierCurveTo(x + r * .6, y - r * 1.4, x + r * 1.6, y - r * .2, x, y + r * .9); ctx.fill();
}
function drawMatrix() {  // Moses: the room dims and drops of light fall down still columns of glyphs (white head, green tail)
  const gs = glyphs(), a = clamp(Math.min(S.matrix, (S.matrixT0 || S.matrix) - S.matrix) * 2.5, 0, 1) * (S.matrixA || 1);
  ctx.save(); ctx.fillStyle = `rgba(0, 16, 6, ${.55 * a})`; ctx.fillRect(0, 0, W, H);
  if (!gs) return ctx.restore();
  const cell = Math.max(18 * DPR, Math.round(H * .045)), cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
  ctx.globalCompositeOperation = 'lighter';
  for (let c = 0, n = 0; c < cols && n < 450; c++) {
    const seed = ((c * 9301 + 49297) % 233280) / 233280, speed = 8 + seed * 10, len = 5 + Math.floor(seed * 8);
    const head = Math.floor((S.t * speed + seed * 97) % (rows + len + 8));
    for (let j = 0; j < len; j++, n++) {
      const row = head - j;
      if (row < 0 || row > rows) continue;
      ctx.globalAlpha = a * (j ? Math.pow(1 - j / len, 2) * .9 : 1);
      const gi = (c * 7 + row * 13 + Math.floor(S.t * 1.5 + seed * 9)) % gs.n;
      ctx.drawImage(gs.c, gi * gs.cs, j ? gs.cs : 0, gs.cs, gs.cs, c * cell, row * cell, cell, cell);
    }
  }
  ctx.restore();
}
function drawSpot(s) {  // the room's objects, as paper cut-outs with a white rim like everyone else
  const h = tall(s.z), u = h / 100;
  ctx.save(); ctx.translate(s.x * W, feetY(s.z)); ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2 * u;
  const box = (x, y, w, hh, fill, r = 2) => { ctx.beginPath(); ctx.roundRect(x * u, y * u, w * u, hh * u, r * u); ctx.fillStyle = fill; ctx.fill(); ctx.stroke(); };
  const sign = (t, y, fill = '#ffd23f') => label(t, 0, y * u, 7 * u, 'center', fill, 'pixel');
  switch (s.key) {
    case 'bar':
      box(-46, -40, 92, 40, '#7a4a22'); box(-50, -45, 100, 7, '#a8703a');
      ['#2f7d4f', '#1d4a32', '#8d1d26', '#d8b445', '#2f7d4f'].forEach((c, i) => { box(-38 + i * 17, -63, 7, 18, c, 3); box(-36 + i * 17, -70, 3, 8, c, 1); });
      sign('BAR', -76); break;
    case 'cake':
      box(-30, -28, 60, 28, '#f4f1ea'); box(-17, -50, 34, 22, '#fffaf2', 4); box(-12, -66, 24, 16, '#fffaf2', 4); box(-7, -78, 14, 12, '#fffaf2', 3);
      ctx.lineWidth = 1.2 * u; ['#f4a6c0', '#f4a6c0', '#f4a6c0'].forEach((c, i) => box(-17 + i * 5, -50 + i * 16 - (i ? 6 : 0), 34 - i * 10, 3, c, 1));
      sign('CAKE', -86, '#ff9ec0'); break;
    case 'dj':
      ctx.save(); ctx.scale(1, .28); ['#ff4d6d', '#ffd23f', '#4dd2ff', '#7dff6a'].forEach((c, i) => {
        ctx.globalAlpha = .35 + .25 * (Math.floor(S.t * 4 + i) % 2); ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 0, (90 - i * 18) * u, (90 - i * 18) * u, 0, 0, TAU); ctx.fill(); });
      ctx.restore(); ctx.globalAlpha = 1;
      box(-26, -34, 52, 34, '#1b1b22'); box(-58, -62, 18, 62, '#2a2a33'); box(40, -62, 18, 62, '#2a2a33');
      for (const sx of [-49, 49]) { ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(sx * u, -42 * u, 6 * u, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(sx * u, -20 * u, 7 * u, 0, TAU); ctx.fill(); }
      sign('DJ', -40, '#ff6ad5'); break;
    case 'loo': {
      const busy = S.people.some(p => p.state === 'loo');
      box(-17, -78, 34, 78, '#8c6d4f', 3); ctx.fillStyle = '#e0c48a'; ctx.beginPath(); ctx.arc(11 * u, -38 * u, 2.2 * u, 0, TAU); ctx.fill();
      sign(busy ? 'BUSY' : 'WC', -84, busy ? '#ff4d3a' : '#7dff6a'); break;
    }
    case 'chairs':
      for (const cx of [-14, 14]) { ctx.strokeStyle = '#fff'; box(cx - 10, -24, 20, 4, '#d8b445', 1); box(cx - 10, -50, 3, 50, '#d8b445', 1); box(cx + 7, -24, 3, 24, '#d8b445', 1); box(cx - 10, -50, 20, 3, '#d8b445', 1); }
      break;
    case 'gifts':
      box(-30, -26, 60, 26, '#f4f1ea'); box(-25, -44, 16, 18, '#e84a8a'); box(-5, -50, 18, 24, '#3aa0ff'); box(16, -40, 12, 14, '#ffd23f');
      sign('GIFTS', -58, '#ffd23f'); break;
    case 'booth':
      box(-27, -96, 54, 96, '#b3122e', 3); ctx.strokeStyle = 'rgba(0, 0, 0, .25)'; ctx.lineWidth = u;
      for (let i = -20; i <= 20; i += 8) { ctx.beginPath(); ctx.moveTo(i * u, -88 * u); ctx.lineTo(i * u, -4 * u); ctx.stroke(); }
      sign('PHOTO', -102, '#fff'); break;
  }
  ctx.restore();
}
function drawLoose(it) {
  const h = tall(it.z);
  ctx.save(); ctx.translate(it.x * W, feetY(it.z) - it.y * h - h * .02);
  if (it.type === 'raygun' && !it.y) { ctx.globalAlpha = .5 + .5 * Math.sin(S.t * 8); star(0, -h * .12, h * .03, '#b8ff9e'); ctx.globalAlpha = 1; }  // alien loot glints
  drawItem(it.type, h * .8, it.y ? S.t * 9 : it.type === 'raygun' ? 0 : D, it.ammo);
  ctx.restore();
}
function drawShot(s) {
  const h = tall(s.z), X = s.x * W, Y = feetY(s.z) - s.y * h;
  if (s.type === 'laser') {
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(125, 255, 106, .35)'; ctx.lineWidth = h * .05; ctx.beginPath(); ctx.moveTo(X - Math.sign(s.vx) * W * .06, Y); ctx.lineTo(X, Y); ctx.stroke();
    ctx.strokeStyle = '#eaffdf'; ctx.lineWidth = h * .015; ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(25, 12, 0, .22)';
  ctx.beginPath(); ctx.ellipse(X, feetY(s.z), h * .05, h * .015, 0, 0, TAU); ctx.fill();
  ctx.save(); ctx.translate(X, Y);
  drawItem(s.type, h * (s.type === 'cork' ? 1.4 : .9), s.type === 'cork' ? Math.sign(s.vx) * D : s.spin, 0);
  ctx.restore();
}
const WET_COLOR = { puke: ['rgba(140, 186, 40, .8)', 'rgba(96, 128, 20, .9)'], booze: ['rgba(246, 190, 72, .5)', 'rgba(255, 250, 225, .55)'],
                    pee: ['rgba(238, 214, 52, .62)', 'rgba(255, 252, 200, .6)'] };
function drawPuddle(p) {
  const sc = .55 + .45 * p.z, rx = p.r * sc * W, ry = rx * .3, X = p.x * W, Y = feetY(p.z), [c0, c1] = WET_COLOR[p.kind] || WET_COLOR.booze;
  ctx.globalAlpha = Math.min(1, p.life / 3);
  ctx.fillStyle = c0; ctx.beginPath(); ctx.ellipse(X, Y, rx, ry, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = c1;
  if (p.kind === 'puke') for (const [u, v] of p.dots) { ctx.beginPath(); ctx.arc(X + u * rx * .6, Y + v * ry * .5, rx * .07, 0, TAU); ctx.fill(); }
  else { ctx.beginPath(); ctx.ellipse(X - rx * .3, Y - ry * .3, rx * .25, ry * .2, 0, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
}
function drawBeam(u) {
  if (u.state !== 'beam' || !u.target) return;
  const X = u.x * W, Y = u.y * H, fy = feetY(u.target.z), half = tall(u.target.z) * .32, g = ctx.createLinearGradient(0, Y, 0, fy);
  g.addColorStop(0, 'rgba(170, 255, 170, .6)'); g.addColorStop(1, 'rgba(170, 255, 170, .08)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(X - H * .03, Y); ctx.lineTo(X + H * .03, Y); ctx.lineTo(X + half, fy); ctx.lineTo(X - half, fy); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 6; i++) { const t = (S.t * .8 + i / 6) % 1; star(X + Math.sin(i * 7 + S.t * 3) * half * .6 * t, fy - (fy - Y) * t, H * .006, 'rgba(230, 255, 230, .9)'); }
}
function drawUfo(u) {
  const X = u.x * W, Y = u.y * H + Math.sin(S.t * 3) * H * .006, s = H / 700;
  ctx.save(); ctx.translate(X, Y); ctx.scale(s, s); ctx.rotate(Math.sin(S.t * 2) * .06);
  ctx.fillStyle = 'rgba(160, 230, 255, .55)'; ctx.beginPath(); ctx.ellipse(0, -14, 36, 32, 0, Math.PI, 0); ctx.fill();  // dome
  ctx.fillStyle = '#7ddb4f'; ctx.beginPath(); ctx.ellipse(0, -24, 13, 15, 0, 0, TAU); ctx.fill();  // the pilot
  ctx.fillStyle = '#111'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * 5.5, -25, 4.5, 7, sx * .5, 0, TAU); ctx.fill(); }
  const gr = ctx.createLinearGradient(0, -14, 0, 18); gr.addColorStop(0, '#eef2f6'); gr.addColorStop(1, '#6b7684');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, 0, 88, 20, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.stroke();
  for (let i = 0; i < 7; i++) { ctx.fillStyle = ['#ff5a5a', '#ffe14d', '#5ad1ff'][(i + Math.floor(S.t * 6)) % 3]; ctx.beginPath(); ctx.arc(-60 + i * 20, 7, 5, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function drawDove(d) {
  const X = d.x * W, Y = d.y * H + Math.sin(S.t * 3 + d.ph) * H * .01, s = H * .018, f = Math.sin(S.t * 14 + d.ph);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = s * .4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(X - s * 1.4, Y - f * s); ctx.quadraticCurveTo(X - s * .5, Y - s * .2 - f * s * .5, X, Y);
  ctx.quadraticCurveTo(X + s * .5, Y - s * .2 - f * s * .5, X + s * 1.4, Y - f * s); ctx.stroke();
}
function drawDisco() {
  const a = Math.min(1, S.disco, 7 - S.disco), cols = ['255, 60, 200', '60, 200, 255', '255, 220, 60', '120, 255, 120'];
  const bx = W * .5, by = H * .07, r = H * .045;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  cols.forEach((c, i) => {
    const ang = Math.sin(S.t * (1.1 + i * .3) + i * 2) * .75, g = ctx.createRadialGradient(bx, by, 0, bx, by, H * 1.1);
    g.addColorStop(0, `rgba(${c}, ${.4 * a})`); g.addColorStop(1, `rgba(${c}, 0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx, by); ctx.arc(bx, by, H * 1.1, D + ang - .13, D + ang + .13); ctx.closePath(); ctx.fill();
  });
  ctx.restore();
  ctx.strokeStyle = '#9aa1a8'; ctx.lineWidth = H * .003; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, by - r); ctx.stroke();
  ctx.fillStyle = '#c9d0d8'; ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.fill();
  for (let i = 0; i < 16; i++) {
    const q = i * 2.4 + S.t * 3, d = r * .62 * Math.cos(i * 1.3);
    ctx.fillStyle = `hsl(${(i * 47 + S.t * 220) % 360} 90% 78%)`; ctx.fillRect(bx + Math.cos(q) * d - r * .1, by + Math.sin(i * 1.7) * r * .6 - r * .1, r * .2, r * .2);
  }
}
function label(str, x, y, size, align = 'center', fill = '#fff', font = 'Bungee') {
  ctx.font = `${size}px ${font === 'Bungee' ? '"Bungee", Impact, sans-serif' : '"Press Start 2P", monospace'}`;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  ctx.lineWidth = size * .18; ctx.strokeStyle = '#1d0d00'; ctx.strokeText(str, x, y);
  ctx.fillStyle = fill; ctx.fillText(str, x, y);
}
function drawSay(e) {
  const [x, y0] = at(e, DOWN.has(e.state) && e.state !== 'flip' ? .5 : 1.08), size = H * .021, y = y0 - H * .03;
  ctx.font = `${size}px "Bungee", Impact, sans-serif`;
  const w = ctx.measureText(e.say.text).width + size, h = size * 1.6;
  ctx.globalAlpha = Math.min(1, e.say.t * 3);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1d0d00'; ctx.lineWidth = Math.max(1.5, size * .1);
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h, w, h, h / 2); ctx.moveTo(x - size * .3, y); ctx.lineTo(x, y + size * .6); ctx.lineTo(x + size * .3, y);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1d0d00'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(e.say.text, x, y - h / 2);
  ctx.globalAlpha = 1;
}
function drawFx(f) {
  const a = f.life / f.max;
  if (f.k === 'text') {  // kept on screen, even for someone at the edge of the floor
    const size = H * .05 * f.size * (1.25 - .25 * a);
    ctx.font = `${size}px "Bungee", Impact, sans-serif`;
    const half = ctx.measureText(f.text).width / 2 + size * .2;
    ctx.globalAlpha = Math.min(1, a * 2); label(f.text, clamp(f.x, half, W - half), f.y, size, 'center', f.color);
  }
  else if (f.k === 'drop') { ctx.globalAlpha = Math.min(1, a * 2); ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill(); }
  else if (f.k === 'spark') {
    const r = f.r * (1.4 - a * .4); ctx.globalAlpha = a; ctx.fillStyle = '#fff6a0'; ctx.strokeStyle = '#ff8a00'; ctx.lineWidth = r * .08;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) { const q = i * TAU / 16, rr = i % 2 ? r * .4 : r; ctx.lineTo(f.x + Math.cos(q) * rr, f.y + Math.sin(q) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (f.k === 'swoosh') {
    ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = f.r * .18; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(f.x - f.face * f.r * .6, f.y, f.r, f.face > 0 ? -1 : Math.PI - 1, f.face > 0 ? 1 : Math.PI + 1); ctx.stroke();
  } else if (f.k === 'flash') {  // camera flash: a white burst at the lens and a cone of light the way it points
    const b = a * a, g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * .5), L = W * .4;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    g.addColorStop(0, `rgba(255, 255, 255, ${b})`); g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * .5, 0, TAU); ctx.fill();
    const c = ctx.createLinearGradient(f.x, f.y, f.x + f.face * L, f.y);
    c.addColorStop(0, `rgba(255, 255, 240, ${.55 * b})`); c.addColorStop(1, 'rgba(255, 255, 240, 0)');
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + f.face * L, f.y - f.r * .45); ctx.lineTo(f.x + f.face * L, f.y + f.r * .45); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else if (f.k === 'dmg') {  // pops in at 1.4x, settles in 0.08 s, rises, fades in its last quarter second
    const age = f.max - f.life, s = f.size * (age < .08 ? 1.4 - 5 * age : 1);
    ctx.globalAlpha = Math.min(1, f.life / .25); label(f.text, f.x, f.y - H * .08 * (age / f.max), s, 'center', f.color);
  } else if (f.k === 'smoke') {  // a puff from the cigarette: rises, drifts, swells, fades
    const age = f.max - f.life, r = f.r * (1 + age * 1.6);
    ctx.globalAlpha = .4 * (f.life / f.max); ctx.fillStyle = '#e4e4e4';
    ctx.beginPath(); ctx.arc(f.x + f.drift * age * H * .05, f.y - age * H * .05, r, 0, TAU); ctx.fill();
  } else if (f.k === 'burst') {  // a special's super flash: a ring of light around the caster
    const r = f.r * (1.4 - a * .9); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(f.x, f.y, r * .2, f.x, f.y, r); g.addColorStop(0, 'rgba(255, 255, 255, .9)'); g.addColorStop(.6, f.color); g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill(); ctx.restore();
  } else if (f.k === 'conf') {
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.spin); ctx.fillStyle = f.color; ctx.fillRect(-f.r, -f.r * .5, f.r * 2, f.r); ctx.restore();
  }
  ctx.globalAlpha = 1;
}
function spHint(i) {  // which button casts it, for the people at this screen
  const me = net ? i === mySlot() : ctrl[i] !== 'cpu';
  if (!me) return '';
  if (touch.on) return '';
  if (ctrl[i] === 'pad') return '· RB';
  const m = layout()[net ? 0 : mode === '2p' ? i : 0];
  return m && m.special ? '· ' + keyName(m.special[0]) : '';
}
function hud() {
  const m = W * .03, bw = W * .38, bh = Math.max(16 * DPR, H * .045), y = H * .05, sh = Math.max(7 * DPR, H * .02), dy = sh + H * .018;
  S.players.forEach((p, i) => {
    const x = i ? W - m - bw : m, f = p.hp / HP, fw = bw * f, tw = bw * Math.max(f, (p.trail ?? p.hp) / HP), low = p.hp <= 28, al = i ? 'right' : 'left';
    ctx.fillStyle = 'rgba(0, 0, 0, .55)'; ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = '#D55E00'; ctx.fillRect(i ? x + bw - tw : x, y, tw, bh);  // the chunk just lost, draining a moment later
    ctx.globalAlpha = low ? .85 + .15 * Math.sin(S.t * 9.4) : 1; ctx.fillStyle = '#F0E442'; ctx.fillRect(i ? x + bw - fw : x, y, fw, bh); ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(2, H * .004); ctx.strokeStyle = '#fff'; ctx.strokeRect(x, y, bw, bh);
    const ns = Math.min(bh * .72, Math.max(14 * DPR, H * .04)) * (low ? 1.12 : 1), shake = S.t - (p.hurtAt ?? -9) < .2 ? (R() - .5) * 4 * DPR : 0;  // HP left, at the end that doesn't move
    label(String(Math.ceil(p.hp)), (i ? x + bw - bh * .3 : x + bh * .3) + shake, y + bh / 2 + ns * .5, ns, al, low ? '#D55E00' : '#fff', 'pixel');
    const sy = y + bh + H * .008, sw = W * .25, sx = i ? x + bw - sw : x, full = p.sp >= 1;  // the star bar: eight pips
    ctx.fillStyle = 'rgba(0, 0, 0, .55)'; ctx.fillRect(sx, sy, sw, sh);
    for (let j = 0; j < 8; j++) if ((p.sp || 0) >= (j + 1) / 8 - 1e-6) {
      ctx.fillStyle = full ? `hsl(${(S.t * 300 + j * 30) % 360} 95% 65%)` : '#CC79A7'; ctx.fillRect(sx + (i ? sw - (j + 1) * sw / 8 : j * sw / 8) + 1, sy + 1, sw / 8 - 2, sh - 2);
    }
    if (full) label(`SPECIAL READY ${spHint(i)}`, sx + sw / 2, sy + sh * .85, sh * .8, 'center', '#ffffff', 'pixel');
    label(p.name.toUpperCase(), i ? x + bw : x, y + bh + H * .048 + dy, H * .038, al);
    if (p.comboN >= 2 && S.t - p.comboT < 1) {
      const cy = y + bh + H * .15 + dy, pop = 1 + .15 * Math.max(0, 1 - (S.t - p.comboT) * 6);
      label(`${p.comboN} HITS`, i ? x + bw : x, cy, H * .07 * pop, al, '#CC79A7'); label(`${Math.round(p.comboDmg || 0)} DMG`, i ? x + bw : x, cy + H * .055, H * .045, al, '#ffffff');
    }
    const who = net ? (i === mySlot() ? 'YOU' : 'ONLINE') : ctrl[i] === 'cpu' ? (mode === 'cpu' ? `CPU · LV${S.level} ${LEVELS[S.level - 1].name}` : 'CPU') : ctrl[i] === 'pad' ? 'PAD' : 'KEYS';
    label(who, i ? x + bw : x, y - H * .012, H * .018, i ? 'right' : 'left', '#ffe066', 'pixel');
    for (let w = 0; w < 2; w++) {  // round wins, best of 3
      const cx = i ? x + bw - H * .02 - w * H * .03 : x + H * .02 + w * H * .03, cy = y + bh + H * .07 + dy;
      ctx.beginPath(); ctx.arc(cx, cy, H * .01, 0, TAU); ctx.fillStyle = match.wins[i] > w ? '#ffd23f' : 'rgba(0, 0, 0, .5)'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, H * .002); ctx.stroke();
    }
  });
  label(String(Math.max(0, Math.ceil(S.clock))), W / 2, y + bh, H * .045, 'center', '#fff', 'pixel');
  if (mode === 'cpu') label(`LEVEL ${S.level}/3`, W / 2, y + bh + H * .035, H * .016, 'center', '#ffe066', 'pixel');
  if (S.banner && (S.phase !== 'fight' || S.bannerT > 0)) {
    const size = Math.min(H * (S.banner.length > 10 ? .085 : .14), W * 1.25 / Math.max(1, S.banner.length)), g = ctx.createLinearGradient(0, H * .42 - size, 0, H * .42);
    g.addColorStop(0, '#fffbd0'); g.addColorStop(.5, '#ffd23f'); g.addColorStop(1, '#ff7b00');
    label(S.banner, W / 2, H * .42, size, 'center', g);
    if (S.sub) label(S.sub, W / 2, H * .42 + H * .07, H * .035, 'center', '#fff', 'pixel');
  }
  if (S.waiting) label(S.waiting, W / 2, H * .55, H * .03, 'center', '#fff', 'pixel');
  if (S.cutin && S.cutin.e) cutIn(S.cutin);
  if (padSp) { const me = S.players[net ? mySlot() : 0], on = !!me && me.sp >= 1; if (padSp.classList.contains('ready') !== on) padSp.classList.toggle('ready', on); }
}
function cutIn(c) {  // the caster's face slides in on a slanted band during a special
  const e = c.e, k = clamp(Math.min((1.1 - c.t) * 6, c.t * 4), 0, 1), left = S.players.indexOf(e) !== 1, bh2 = H * .22, y0 = H * .62, hd = headOf(e);
  ctx.save(); ctx.globalAlpha = k; ctx.translate(left ? -(1 - k) * W * .3 : (1 - k) * W * .3, 0);
  ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0 - H * .08); ctx.lineTo(W, y0 - H * .08 + bh2); ctx.lineTo(0, y0 + bh2); ctx.closePath();
  ctx.fillStyle = spOf(e.k).color || (CURSE[e.cast] || CURSE.pig).color; ctx.globalAlpha = k * .85; ctx.fill(); ctx.globalAlpha = k;
  ctx.lineWidth = Math.max(3, H * .006); ctx.strokeStyle = '#1d0d00'; ctx.stroke(); ctx.clip();
  if (hd) { const [cv] = hd, hh = bh2 * 1.25, w = cv.width * hh / cv.height, x = left ? W * .14 : W * .86 - w; ctx.drawImage(cv, x, y0 - H * .07, w, hh); }
  label(String((spOf(e.k).name || '')).toUpperCase().slice(0, 24), left ? W * .62 : W * .38, y0 + bh2 * .62, Math.min(H * .07, W * 1.1 / 24), 'center', '#1d0d00');
  ctx.restore();
}
function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#120d08'; ctx.fillRect(0, 0, W, H);
  const sh = reduce ? 0 : S.shake; S.shake *= .85;
  ctx.translate((R() - .5) * sh, (R() - .5) * sh);
  fitPic();
  if (bg) {
    ctx.drawImage(bg, pic.left, pic.top, pic.w, pic.h);
    const end = pic.top + pic.h; if (end < H) ctx.drawImage(bg, 0, bg.height - 2, bg.width, 2, pic.left, end, pic.w, H - end);  // stretch the floor's last row down
  }
  S.puddles.forEach(drawPuddle);
  if (S.matrix > 0) drawMatrix();
  if (S.ufo) drawBeam(S.ufo);
  const order = [...SPOTS.map(o => [o.z - .004, 3, o]), ...S.people.filter(o => !o.gone && o.state !== 'loo').map(o => [o.z, 0, o]), ...S.items.filter(i => !i.held).map(o => [o.z - .001, 1, o]), ...S.shots.map(o => [o.z + .002, 2, o])];
  for (const [, k, o] of order.sort((a, b) => a[0] - b[0])) (k === 0 ? drawPerson : k === 1 ? drawLoose : k === 2 ? drawShot : drawSpot)(o);
  S.players.forEach(drawGlow);
  reachMarks();
  if (S.disco > 0) drawDisco();
  S.doves.forEach(drawDove);
  if (S.ufo) drawUfo(S.ufo);
  if (S.dimBy && S.freeze > 0) { ctx.fillStyle = 'rgba(0, 0, 0, .5)'; ctx.fillRect(0, 0, W, H); drawPerson(S.dimBy); }  // super freeze: only the caster lit
  S.people.forEach(e => e.say && !e.gone && drawSay(e));
  S.fx.forEach(drawFx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const white = net ? S.white[mySlot()] : Math.max(...S.white.map((w, i) => ctrl[i] === 'cpu' ? 0 : w));  // the blinded human sees white
  if (white > 0 && !reduce) { ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(.85, white)})`; ctx.fillRect(0, 0, W, H); }
  if (S.phase === 'comic' && S.comic && window.Comic) {
    const c = S.comic, as = p => ({ rig: p.rig, img: p.img, name: p.name });
    try { Comic.draw(ctx, W, H, { a: as(c.a), v: as(c.v), fin: c.fin }, S.phaseT); } catch (err) { console.warn(err); }
    return;
  }
  drawSubs();
  hud();
}

// ---- matches
async function castPool() {  // who may wander in: a shuffled mix of everyone at the wedding, decoded once per page
  if (pool) return pool;
  const ks = shuffle([...window.LAYERS.cards.keys()]).slice(0, 30), ims = await Promise.all(ks.map(art));
  return pool = ks.map((k, i) => ({ k, img: ims[i] })).filter(c => c.img && solid(c.img)).slice(0, 20);
}
function freshState(extra) {
  return Object.assign({ t: 0, phase: 'intro', phaseT: 0, round: S ? S.round + 1 : 1, level: 1, clock: ROUND_SECONDS, banner: '', sub: '', bannerT: 0,
    shake: 0, slowT: 0, players: [], guests: [], photog: null, people: [], cast: [], items: [], shots: [], puddles: [], fx: [], doves: [], winner: null,
    white: [0, 0], confetti: 0, pukeIn: 3, gaspIn: 1, faintIn: 6, flipIn: 5, dovesIn: 3, discoIn: 16, disco: 0, ufoIn: 6, ufo: null, ufos: 0,
    enterIn: 2, heat: 0, subs: [], comic: null, freeze: 0 }, extra);
}
async function newMatch(pair, level = 1, round = 0) {
  const run = startSeq, L = window.LAYERS, n = L.cards.length;
  const androids = L.cards.map((c, k) => c.cy ? k : -1).filter(k => k >= 0);
  pair = pair && pair.length === 2 ? pair : shuffle(androids.length >= 2 ? androids : [...Array(n).keys()]).slice(0, 2);
  const [a, b] = await Promise.all(pair.map(art)), cast = (await castPool()).filter(c => !pair.includes(c.k));
  await Promise.race([Promise.all(pair.map(voiceUp)), new Promise(r => setTimeout(r, 1500))]);  // their voices, if they come quickly
  if (run !== startSeq) return;  // the game was stopped while the cut-outs loaded
  const players = [person(pair[0], a, 'fighter', .3, .55), person(pair[1], b, 'fighter', .7, .55)];
  players.forEach((p, i) => { p.lv = LEVELS[mode === 'cpu' && i === 1 ? level - 1 : 1]; p.sp = match.sp[i] || 0; });
  if (players.some(p => spOf(p.k).type === 'spoon')) glyphs();  // Moses is here: fetch his glyphs early
  if (net) { players[0].name = net.link.me.name; players[1].name = net.link.them.name; }
  const guests = [];
  for (const c of shuffle(cast.slice()).slice(0, 4)) {  // a few are already here; the rest drift in and out
    const at = spot(guests), g = person(c.k, c.img, 'guest', at.x, at.z);
    g.face = R() < .5 ? 1 : -1; g.stay = 5 + R() * 15; g.wander = R() < .3; guests.push(g);
  }
  const all = stages().filter(s => s.img);  // a battle's three rounds are in three different scenes
  let fresh = all.filter(s => !match.used.includes(s.name));
  if (!fresh.length) { match.used = []; fresh = all.filter(s => s.name !== (S && S.stage)); }
  const st = pick(fresh.length ? fresh : all); match.used.push(st.name);
  useStage(st); await backdrops.get(st.name);
  if (run !== startSeq) return;
  const ph = photogImg ? person('photog', photogImg, 'photog', R() < .5 ? -.08 : 1.08, .25 + R() * .45) : null;
  if (ph) { ph.transit = 'in'; ph.dest = { x: ph.x < 0 ? .12 : .88, z: ph.z }; ph.think = 3; }
  S = freshState({ stage: st.name, level, pair, players, guests, photog: ph, people: [...players, ...guests, ...(ph ? [ph] : [])], cast, ...(round ? { round } : {}) });
  snd('bell');
}
function next() {
  match.sp = S.winner && S.final ? [0, 0] : S.players.map(p => p.sp || 0);  // a bar earned in one round carries into the next
  if (!S.winner || !S.final) return newMatch(S.pair, S.level, S.round + 1);  // the next round (or a drawn one again): same fighters, a new scene
  const won = S.winner === S.players[0], wi = S.players.indexOf(S.winner);
  match.wins = [0, 0]; match.used = [];
  if (mode === 'online') return finish(wi, 'done');
  if (mode === 'cpu') {
    if (won && S.level === 3) return stop();  // champion: back to the photo
    if (won) ladder.beaten.push(S.pair[1]);
    return newMatch(won ? [S.pair[0], rival()] : S.pair, won ? S.level + 1 : S.level, 1);
  }
  newMatch(mode === '2p' ? S.pair : null, 1, 1);  // two players: a rematch; the demo: new fighters
}
function rival() {  // the next rung of the ladder: an android nobody has beaten yet
  const L = window.LAYERS, used = [S.pair[0], ...ladder.beaten], ok = k => !used.includes(k);
  return pick(L.cards.map((c, k) => c.cy && ok(k) ? k : -1).filter(k => k >= 0)) ?? pick([...L.cards.keys()].filter(k => ok(k) && L.cards[k].full)) ?? S.pair[1];
}

// ---- online. The host packs everything the guest draws into its match-room presence (~30 times a second, < 4 KB); the
// guest unpacks it, eases toward it, replays the sounds and effects, and moves its own fighter itself while it's free.
const STATES = ['idle', 'walk', 'attack', 'hit', 'down', 'cry', 'getup', 'slip', 'ko', 'faint', 'flip', 'beam', 'fall', 'puke', 'win', 'dazed',
                'drink', 'horse', 'rider', 'pee', 'smile', 'shield', 'aim', 'shoot', 'eat', 'dance', 'sit', 'gift', 'booth', 'watch', 'loo', 'block', 'launched', 'grabbed', 'throw', 'roll', 'whiff', 'cast', 'cursed', 'bent'];
const THINGS = ['fork', 'bottle', 'champagne', 'shoe', 'plate', 'raygun', 'cork', 'laser', 'gift'], MOVE_KEYS = Object.keys(MOVES);
const ROLES = ['fighter', 'guest', 'photog'], WET = ['booze', 'puke', 'pee'], PHASES = ['intro', 'fight', 'ko', 'finish', 'comic'], UFO = ['in', 'beam', 'out'];
const bytes = s => new TextEncoder().encode(s).length;
function pack() {
  const now = performance.now();
  while (evs.length && now - evs[0][1] > 700) evs.shift();
  const d = {
    v: 1, sg: S.stage, ph: PHASES.indexOf(S.phase), pt: q2(S.phaseT), cl: q2(S.clock), rd: S.round, w: match.wins, bn: S.banner, bt: q2(S.bannerT), sb: S.sub,
    cb: S.players.map(p => p.comboN >= 2 && S.t - p.comboT < 1.3 ? p.comboN : 0), cd: S.players.map(p => Math.round(p.comboDmg || 0)),
    sp: S.players.map(p => q2(p.sp || 0)), mx: q2(S.matrix || 0), mt: q2(S.matrixT0 || 0), ma: q2(S.matrixA || 1), gd: S.players.map(p => q2(p.guard ?? 1)),
    ci: S.cutin ? [S.cutin.e.id, q2(S.cutin.t)] : 0, dm: S.dimBy && S.freeze > 0 ? S.dimBy.id : 0,
    ct: S.players.map(p => p.state === 'cast' && p.castX != null ? [q3(p.castX), q3(p.castZ), CURSES.indexOf(p.cast)] : 0), nt: S.neoT > 0 && S.neo ? [S.neo.id, q2(S.neoT)] : 0,
    es: S.players.map(p => p.esc ? [q3(p.esc.x), q3(p.esc.z), p.esc.dir, q3(p.esc.run || .26)] : 0), dc: q2(S.disco), wh: q2(S.white[1]), cf: S.confetti > 0 ? 1 : 0, ack: net.ack || 0,
    P: S.people.filter(e => !e.gone).map(e => [e.id, e.k === 'photog' ? -1 : e.k, ROLES.indexOf(e.role), q3(e.x), q3(e.z), q2(e.y), e.face,
      STATES.indexOf(e.state), q2(e.st), Math.round(e.hp), q2(e.rot), e.item ? THINGS.indexOf(e.item.type) : e.prop ? 20 + THINGS.indexOf(e.prop) : -1,
      e.item ? e.item.ammo : 0, MOVE_KEYS.findIndex(k => MOVES[k] === e.move),
      (e.flash > 0) | (e.run << 1) | ((e.cheer > 0) << 2) | ((e.aimT > 0) << 3) | (e.threw << 4) | ((e.state === 'walk' || e.state === 'horse') << 5) | ((e.vy > 0 && !!e.remote && e.remote[2] < .02) << 6) | (!!e.xEyes << 7) | ((e.chair === 1) << 8) | ((e.chair === 2) << 9) | (!!e.cig << 10),
      e.say ? e.say.text : 0, e.curse ? CURSES.indexOf(e.curse) : -1,
      e.curse === 'spoon' ? q2(e.finBend ?? (e.bendAt ? .7 * Math.max(0, 1 - (S.t - e.bendAt) / .4) : 0)) : 0,
      e.curse && e.curseBy && typeof e.curseBy.k === 'number' ? e.curseBy.k : -1]),
    I: S.items.filter(i => !i.held).map(i => [THINGS.indexOf(i.type), q3(i.x), q3(i.z), q2(i.y), i.ammo]),
    X: S.shots.map(s => [THINGS.indexOf(s.type), q3(s.x), q3(s.z), q2(s.y), Math.sign(s.vx), q2(s.spin % TAU)]),
    U: S.puddles.slice(-14).map(p => [q3(p.x), q3(p.z), q3(p.r), WET.indexOf(p.kind), q2(p.life)]),
    O: S.ufo ? [q3(S.ufo.x), q3(S.ufo.y), UFO.indexOf(S.ufo.state), S.ufo.target ? S.ufo.target.id : 0] : 0,
    V: S.doves.map(d => [q3(d.x), q3(d.y), d.dir, q2(d.ph), q2(d.sp)]),
    E: evs.map(e => [e[0], ...e.slice(2)]),
  };
  if (S.ending) d.end = S.ending;
  if (S.phase === 'comic' && S.comic) d.cm = [S.comic.a.id, S.comic.v.id];
  let s = JSON.stringify(d);
  for (const k of ['E', 'U', 'V', 'I']) while (bytes(s) > 3700 && d[k].length) { d[k].shift(); s = JSON.stringify(d); }  // stay inside one presence update
  return d;
}
function unpack(d) {
  if (!d || d.v !== 1 || !Array.isArray(d.P)) return;
  const was = S.phase;
  if (typeof d.sg === 'string' && d.sg !== stage.name) { const st = stages().find(s => s.name === d.sg); if (st) useStage(st); }
  S.phase = PHASES[d.ph] || 'fight'; S.phaseT = +d.pt || 0; S.clock = +d.cl || 0; S.round = d.rd; match.wins = Array.isArray(d.w) ? d.w : [0, 0];
  S.banner = String(d.bn || ''); S.bannerT = +d.bt || 0; S.sub = String(d.sb || ''); S.disco = +d.dc || 0; S.white[1] = Math.max(S.white[1], +d.wh || 0);
  if (d.cf && !S.confetti) S.confetti = 5;
  if (Array.isArray(d.cb)) S.players.forEach((p, i) => { const c = +d.cb[i] || 0; if (c >= 2) { p.comboN = c; p.comboT = S.t; p.comboDmg = Array.isArray(d.cd) ? +d.cd[i] || 0 : 0; } });
  if (Array.isArray(d.sp)) S.players.forEach((p, i) => { p.sp = clamp(+d.sp[i] || 0, 0, 1); });
  S.matrix = clamp(+d.mx || 0, 0, 9); S.matrixT0 = clamp(+d.mt || 0, 0, 9); S.matrixA = clamp(+d.ma || 1, 0, 1);
  if (Array.isArray(d.gd)) S.players.forEach((p, i) => { p.guard = clamp(+d.gd[i] || 0, 0, 1); });
  if (Array.isArray(d.ct)) S.players.forEach((p, i) => { const c = d.ct[i]; if (Array.isArray(c)) { p.castX = +c[0] || 0; p.castZ = +c[1] || 0; p.cast = CURSES[c[2]] || 'pig'; } else p.castX = null; });
  S.cutin = Array.isArray(d.ci) && S.byId.get(d.ci[0]) ? { e: S.byId.get(d.ci[0]), t: clamp(+d.ci[1] || 0, 0, 2) } : null;
  S.dimBy = d.dm ? S.byId.get(d.dm) || null : null; if (S.dimBy) S.freeze = .05;
  if (Array.isArray(d.nt)) { S.neo = S.byId.get(d.nt[0]) || null; S.neoT = clamp(+d.nt[1] || 0, 0, 9); if (S.neoT > 0) glyphs(); } else S.neoT = 0;
  if (Array.isArray(d.es)) S.players.forEach((p, i) => { const q = d.es[i]; p.esc = Array.isArray(q) ? { x: +q[0] || 0, z: +q[1] || 0, dir: q[2] < 0 ? -1 : 1, run: clamp(+q[3] || .26, .1, .4) } : null; });
  if (was !== S.phase && S.phase === 'intro') S.fx = [];
  const seen = new Set(), fighters = [];
  for (const a of d.P.slice(0, 40)) {
    if (!Array.isArray(a) || a.length < 16) continue;
    const [id, k, role, x, z, y, face, st, stt, hp, rot, thing, ammo, mv, flags, said] = a;
    seen.add(id);
    let e = S.byId.get(id);
    if (!e) { spawn(a); continue; }
    if (role === 0) fighters.push(e);
    const mine = e === S.players[1], state = STATES[st] || 'idle', free = state === 'idle' || state === 'walk', local = mine && free && S.phase === 'fight';
    e.hostFree = free;
    if (local && e.state !== 'idle' && e.state !== 'walk') { e.state = state; e.st = stt; }  // back on my feet: mine to move again
    if (!local) {  // my own fighter, while free, is moved here and reported to the host
      e.tx = x; e.tz = z; e.ty = y; e.face = face < 0 ? -1 : 1;
      if (Math.abs(x - e.x) > .15 || Math.abs(z - e.z) > .2) { e.x = x; e.z = z; }
      if (state !== e.state) { e.state = state; e.st = stt; } else if (Math.abs(e.st - stt) > .2) e.st = stt;
    }
    if (hp < e.hp) e.hurtAt = S.t;
    e.hp = hp; e.trot = rot; e.curse = CURSES[a[16]] || null;
    if (e.curse && Number.isInteger(a[18]) && a[18] >= 0) { const sp = spOf(a[18]); e.curseSp = sp.type === e.curse ? sp : {}; } else if (!e.curse) e.curseSp = null;
    if (local && (flags & 64) && e.y < .02 && y > .02) { e.y = y; e.vy = Math.max(e.vy || 0, 1.2); }  // the host started a jump for me (after an uppercut): fly it
    e.finBend = e.curse === 'spoon' ? clamp(+a[17] || 0, 0, 2) : undefined; e.xEyes = !!(flags & 128);
    e.chair = flags & 256 ? 1 : flags & 512 ? 2 : 0;
    if (e.role === 'photog' && e.chair) camOff(e);
    if ((flags & 1024) && !e.cig) e.smokeT0 = S.t; e.cig = !!(flags & 1024);
    e.item = thing >= 0 && thing < 20 ? { type: THINGS[thing], ammo } : null; e.prop = thing >= 20 ? THINGS[thing - 20] : null;
    e.move = MOVES[MOVE_KEYS[mv]] || null;
    e.flash = flags & 1 ? .05 : 0; e.run = !!(flags & 2); e.cheer = flags & 4 ? .1 : 0; e.aimT = flags & 8 ? .05 : 0; e.threw = !!(flags & 16); e.moving = !!(flags & 32);
    if (said && (!e.say || e.say.text !== said)) say(e, String(said).slice(0, 40)); else if (!said) e.say = null;
  }
  for (const e of S.people) if (!seen.has(e.id) && !S.pending.has(e.id)) e.left = true;
  if (S.people.some(e => e.left)) { S.people = S.people.filter(e => !e.left); for (const [id, e] of S.byId) if (e.left) S.byId.delete(id); }
  if (fighters.length === 2) S.players = fighters;
  S.guests = S.people.filter(e => e.role === 'guest');
  S.items = (d.I || []).map(([t, x, z, y, ammo]) => ({ type: THINGS[t], x, z, y, ammo, held: null }));
  S.shots = (d.X || []).map(([t, x, z, y, dir, spin]) => ({ type: THINGS[t], x, z, y, vx: dir, spin }));
  S.puddles = (d.U || []).map(([x, z, r, kind, life], i) => Object.assign(S.puddles[i] && S.puddles[i].x === x ? S.puddles[i] : { dots: Array.from({ length: 5 }, () => [R() * 2 - 1, R() * 2 - 1]) },
                                                                             { x, z, r, kind: WET[kind], life }));
  S.ufo = d.O ? { x: d.O[0], y: d.O[1], state: UFO[d.O[2]], target: S.byId.get(d.O[3]) || null } : null;
  S.doves = (Array.isArray(d.V) ? d.V.slice(0, 20) : []).map(([x, y, dir, ph, sp]) => ({ x, y, dir, ph, sp }));
  for (const ev of (Array.isArray(d.E) ? d.E : []).slice(-60)) if (Array.isArray(ev) && ev[0] > S.evSeen) { S.evSeen = ev[0]; replay(ev); }
  if (S.phase === 'comic' && Array.isArray(d.cm) && (!S.comic || S.comic.a.id !== d.cm[0])) {
    const a = S.byId.get(d.cm[0]), v = S.byId.get(d.cm[1]);
    if (a && v) S.comic = { a, v, fin: window.NICKNAMES && window.NICKNAMES[a.k] && window.NICKNAMES[a.k].fin };
  } else if (S.phase !== 'comic') S.comic = null;
  if (Array.isArray(d.end)) finish(d.end[0], d.end[1]);
}
async function spawn(a) {  // a person the host has and we don't yet: load their cut-out first
  const [id, k, role] = a;
  if (S.pending.has(id)) return;
  S.pending.add(id);
  const s0 = S, img = k === -1 ? photogImg : await art(k);
  if (S !== s0) return;
  S.pending.delete(id);
  const e = person(k === -1 ? 'photog' : k, img, ROLES[role] || 'guest', a[3], a[4]);
  e.id = id; e.tx = a[3]; e.tz = a[4]; e.ty = a[5]; e.face = a[6] < 0 ? -1 : 1; e.state = STATES[a[7]] || 'idle'; e.st = a[8];
  if (role === 0) { e.lv = LEVELS[1]; voiceUp(k); }
  S.byId.set(id, e); S.people.push(e);
  const fs = S.people.filter(p => p.role === 'fighter');
  if (fs.length === 2) {
    S.players = fs.sort((p, q) => p.id - q.id);  // the host makes its fighters first: P1 (host) then P2 (us)
    S.players[0].name = net.link.them.name; S.players[1].name = net.link.me.name;
  }
}
function replay(ev) {
  const [, kind, ...a] = ev;
  const n = (v, lo, hi, d) => Number.isFinite(+v) ? clamp(+v, lo, hi) : d;  // everything from the host is untrusted
  if (kind === 's') window.SFX && window.SFX.play(String(a[0]), { pan: (n(a[1], 0, 1, .5) - .5) * 1.4, pitch: n(a[2], .3, 3, 1), vol: n(a[3], 0, 2, 1), dur: n(a[4], 0, 8, 0) || undefined });
  else if (kind === 't') fx({ k: 'text', text: String(a[0]).slice(0, 30), x: n(a[1], -1, 2, .5) * W, y: fromF(n(a[2], -9, 9, 0)), vy: -H * .1, life: .9, max: .9, color: String(a[3]).slice(0, 40), size: n(a[4], 0, 3, 1) });
  else if (kind === 'y') spray(n(a[0], -1, 2, 0) * W, fromF(n(a[1], -9, 9, 0)), n(a[2], 0, 30, 0), String(a[3]), n(a[4], -3, 3, 0) * H, n(a[5], -3, 3, 0) * H, n(a[6], 0, .3, .05) * unit(), n(a[7], 0, 2, .8), true);
  else if (kind === 'k') fx({ k: 'spark', x: n(a[0], -1, 2, 0) * W, y: fromF(n(a[1], -9, 9, 0)), r: n(a[2], 0, 2, .2) * unit(), life: .22, max: .22 });
  else if (kind === 'w') fx({ k: 'swoosh', x: n(a[0], -1, 2, 0) * W, y: fromF(n(a[1], -9, 9, 0)), face: a[2] < 0 ? -1 : 1, r: n(a[3], 0, 2, .2) * unit(), life: .12, max: .12 });
  else if (kind === 'v') { const e = S.byId.get(a[0]); if (e) talk(e, String(a[1])); }
  else if (kind === 'f') fx({ k: 'flash', x: n(a[0], -1, 2, 0) * W, y: fromF(n(a[1], -9, 9, 0)), face: a[2] < 0 ? -1 : 1, r: n(a[3], 0, 3, 1) * unit(), life: .35, max: .35 });
  else if (kind === 'd') fx({ k: 'dmg', text: String(a[0]).slice(0, 6), x: n(a[1], -1, 2, 0) * W, y: fromF(n(a[2], -9, 9, 0)), size: n(a[3], 0, .2, .05) * H, color: String(a[4]).slice(0, 9), life: .8, max: .8 });
  else if (kind === 'o') fx({ k: 'smoke', x: n(a[0], -1, 2, 0) * W, y: fromF(n(a[1], -9, 9, 0)), r: n(a[2], 0, 1, .03) * unit(), life: 2.2, max: 2.2, drift: 0 });
  else if (kind === 'b') fx({ k: 'burst', x: n(a[0], -1, 2, 0) * W, y: fromF(n(a[1], -9, 9, 0)), r: n(a[2], 0, 3, 1) * unit(), color: String(a[3]).slice(0, 9), life: .5, max: .5 });
}
function replica(dt) {  // the online guest's frame: no game logic, just easing toward the host's picture and moving my own fighter
  S.t += dt; S.phaseT += dt; S.bannerT -= dt;
  if (S.phase === 'fight') S.clock -= dt;
  const me = S.players[1], b = readControls(1), k = Math.min(1, dt * 14);
  if (me && me.curse === 'dizzy') { b.mx = -b.mx; b.mz = -b.mz; }  // cursed: left is right
  const rl = rollTap(1, b); if (rl) { S.presses.roll++; S.rollDir = rl; }
  for (const key of BTN) { if (b[key] && !S.held[key]) S.presses[key]++; S.held[key] = b[key]; }
  tapped.clear(); touch.tapped.clear();
  subs(dt);
  for (const e of S.people) {
    e.st += dt; e.flash -= dt; e.aimT -= dt; e.cheer -= dt; e.talk -= dt;
    if (e.say && (e.say.t -= dt) <= 0) e.say = null;
    if (e === me && e.hostFree && S.phase === 'fight') {
      const dirX = Math.sign(b.mx); e.runT = dirX && dirX === e.runDir && Math.abs(b.mx) > .85 ? (e.runT || 0) + dt : 0; e.runDir = dirX; e.running = e.runT > RUN_HOLD;
      stepSpeed(e, b.mx, b.mz);
      if (b.mx) e.face = Math.sign(b.mx);
      e.state = b.mx || b.mz ? 'walk' : 'idle';
      if (b.jump && !S.jumpHeld && !e.y) e.vy = 2.3;
      S.jumpHeld = b.jump;
      e.x = clamp(e.x + e.vx * dt, .04, .96); e.z = clamp(e.z + e.vz * dt, 0, 1);
      const o = S.players[0], gap = o ? e.x - o.x : 1;  // its half of the push-apart (the host does the other half)
      if (o && o.state !== 'roll' && !DOWN.has(o.state) && o.state !== 'cursed' && e.y < .3 && Math.abs(gap) < .035 && Math.abs(e.z - o.z) < .05)
        e.x = clamp(e.x + (.035 - Math.abs(gap)) / 2 * (Math.sign(gap) || -o.face), .04, .96);
      if (e.y > 0 || e.vy > 0) { e.vy -= 7 * dt; e.y = Math.max(0, e.y + e.vy * dt); if (!e.y) e.vy = 0; }
      e.tx = e.x; e.tz = e.z; e.ty = e.y;
    } else if (e.tx !== undefined) {
      e.x += (e.tx - e.x) * k; e.z += (e.tz - e.z) * k; e.y += (e.ty - e.y) * k;
      if (e === me) e.vy = 0;
    }
    if (e.trot !== undefined) { const dr = ((e.trot - e.rot + Math.PI) % TAU + TAU) % TAU - Math.PI; e.rot += dr * k; }
    if (e.moving || e.state === 'walk') e.walkPh += dt * (e.role === 'fighter' ? 13 : e.run ? 16 : e.state === 'horse' ? 10 : 7.5);
    if (e.state === 'cry') tears(e, dt);
    if (e.state === 'puke' && e.st >= 0 && e.st < 1.4) pukeStream(e, dt, false);
    place(e); animate(e, dt);
  }
  ambient(dt);
  if (performance.now() - sentAt > 30 && me) {
    sentAt = performance.now();
    net.link.send({ n: ++inSeq, in: { mx: b.mx, mz: b.mz, p: BTN.map(x => S.presses[x]), r: [S.presses.roll, ...(S.rollDir || [0, 0])] },
                    me: [q3(me.x), q3(me.z), q2(me.y), me.face, me.state === 'walk' ? (me.running ? 2 : 1) : 0] });
  }
  if (!S.people.length) S.waiting = 'CONNECTING…';
  else S.waiting = '';
}
function finish(winnerSlot, reason) {  // online match over: the host tells the guest first, then both go back to the lobby
  if (!net) return;
  if (!S) { net.early = [winnerSlot, reason]; return; }  // the opponent left while we were still loading
  if (S.ending) return;
  S.ending = [winnerSlot, reason];
  const result = { winner: winnerSlot == null || winnerSlot < 0 ? null : winnerSlot === mySlot() ? 'me' : 'them', reason }, cb = opts0.onEnd, s0 = S;
  if (reason === 'left') { S.banner = 'OPPONENT LEFT'; S.bannerT = 9; S.sub = ''; }
  setTimeout(() => { if (S === s0) stop(true); cb && cb(result); }, net.role === 'host' && reason !== 'left' ? 1500 : reason === 'left' ? 2000 : 0);
}

// ---- loop
function frame(t) {
  raf = requestAnimationFrame(frame);
  let dt = Math.min(.05, (t - lastT) / 1000 || 0); lastT = t;
  if (!S) return;
  if (net && net.role === 'guest') { replica(dt); draw(); return; }
  if (S.slowT > 0) { S.slowT -= dt; dt *= .35; }
  update(dt);
  if (!S) return;
  if (net && performance.now() - sentAt > 33) { sentAt = performance.now(); net.link.send(pack()); }
  draw();
}
const PADB = [['punch', 'PUNCH', 192, 78, 68], ['kick', 'KICK', 108, 90, 68], ['grab', 'GRAB', 212, 160, 68], ['jump', 'JUMP', 120, 174, 68],
  ['roll', 'ROLL', 282, 60, 56], ['special', '★', 84, 254, 60]];  // button, label, centre from the right and from the bottom, diameter (px on an 844x390 phone)
let padSp = null;
function layoutPad() {  // scale the pad to this screen
  const el = root && root.querySelector('.tpad');
  if (!el) return;
  const k = clamp(root.getBoundingClientRect().height / 390, .8, 1.4);
  el.querySelectorAll('.b').forEach((b, i) => {
    const [, , cx, cy, d] = PADB[i];
    Object.assign(b.style, { width: d * k + 'px', height: d * k + 'px', right: `calc(${(cx - d / 2) * k}px + env(safe-area-inset-right, 0px))`, bottom: `calc(${(cy - d / 2) * k}px + env(safe-area-inset-bottom, 0px))` });
  });
  const base = el.querySelector('.base');
  if (!base.classList.contains('on')) Object.assign(base.style, { left: `calc(${125 * k}px + env(safe-area-inset-left, 0px))`, top: `calc(100% - ${99 * k}px)` });
}
function touchPad() {  // phones: a stick that appears under the left thumb, six buttons under the right; the stick and buttons feed the same input as the keys
  if (!coarse()) return;
  root.classList.add('touch');
  if (root.querySelector('.tpad')) return layoutPad();
  const st = document.createElement('style'); st.id = 'tpad-css';
  st.textContent = `#brawl.touch .brawl-bar { display: none; }
  .tpad { position: absolute; inset: 0; z-index: 6; pointer-events: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
  .tpad .zone { position: absolute; bottom: 0; height: 82%; pointer-events: auto; touch-action: none; }
  .tpad .left { left: 0; width: 45%; } .tpad .right { right: 0; width: 55%; }
  .tpad .base { position: absolute; width: 116px; height: 116px; margin: -58px 0 0 -58px; border-radius: 50%; border: 3px solid rgba(255,255,255,.6); background: rgba(0,0,0,.22); opacity: .25; }
  .tpad .base.on { opacity: 1; }
  .tpad .knob { position: absolute; left: 50%; top: 50%; width: 48px; height: 48px; margin: -24px 0 0 -24px; border-radius: 50%; background: rgba(255,255,255,.8); }
  .tpad .b { position: absolute; box-sizing: border-box; border-radius: 50%; border: 3px solid rgba(255,255,255,.75); color: #fff; display: grid; place-items: center;
    font: 9px/1 "Press Start 2P", monospace; background: rgba(0,0,0,.35); opacity: .6; }
  .tpad .b.on { background: rgba(240,228,66,.9); color: #1d0d00; opacity: 1; }
  .tpad .b.special { background: rgba(204,121,167,.5); font-size: 20px; } .tpad .b.special.ready { opacity: 1; animation: tpulse .5s infinite alternate; }
  @keyframes tpulse { to { box-shadow: 0 0 18px 6px #CC79A7; } }
  .tpad .quit { position: absolute; z-index: 2; top: calc(6px + env(safe-area-inset-top, 0px)); left: calc(50% + 34px); pointer-events: auto; height: 32px; border-radius: 16px;
    border: 2px solid rgba(255,255,255,.6); background: rgba(0,0,0,.45); color: #fff; font: 9px/1 "Press Start 2P", monospace; padding: 0 10px; touch-action: manipulation; }
  @media (orientation: portrait) { .tpad::after { content: 'TURN YOUR PHONE SIDEWAYS'; position: absolute; inset: 0; display: grid; place-items: center; padding: 24px;
    background: rgba(12,8,4,.94); color: #ffd23f; font: 14px/1.6 "Press Start 2P", monospace; text-align: center; pointer-events: auto; } }`;
  document.head.append(st);
  const el = document.createElement('div'); el.className = 'tpad';
  el.innerHTML = `<div class="zone left"><div class="base"><div class="knob"></div></div></div><div class="zone right"></div>
    ${PADB.map(([b, t]) => `<div class="b ${b}" data-b="${b}" aria-hidden="true">${t}</div>`).join('')}<button type="button" class="quit">✕</button>`;
  root.append(el); padSp = el.querySelector('.b.special'); layoutPad();
  const left = el.querySelector('.left'), right = el.querySelector('.right'), base = el.querySelector('.base'), knob = el.querySelector('.knob'), btns = [...el.querySelectorAll('.b')];
  const take = () => { touch.on = true; if (!net && mode === 'demo') ctrl[0] = 'keys'; };
  let stick = null;  // { id, cx, cy }
  const move = e => {
    let dx = e.clientX - stick.cx, dy = e.clientY - stick.cy, d = Math.hypot(dx, dy);
    if (d > 58) { stick.cx += dx / d * (d - 58); stick.cy += dy / d * (d - 58); dx = e.clientX - stick.cx; dy = e.clientY - stick.cy; d = 58;  // the base follows a thumb past the rim
      const r = left.getBoundingClientRect(); base.style.left = stick.cx - r.left + 'px'; base.style.top = stick.cy - r.top + 'px'; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const dead = d < 12; touch.mx = dead ? 0 : clamp(dx / 58, -1, 1); touch.mz = dead ? 0 : clamp(dy / 58, -1, 1);
  };
  left.addEventListener('pointerdown', e => {
    if (stick) return;
    e.preventDefault(); left.setPointerCapture(e.pointerId); take();
    const r = left.getBoundingClientRect(); stick = { id: e.pointerId, cx: e.clientX, cy: e.clientY };
    base.classList.add('on'); base.style.left = e.clientX - r.left + 'px'; base.style.top = e.clientY - r.top + 'px'; move(e);
  });
  left.addEventListener('pointermove', e => stick && e.pointerId === stick.id && move(e));
  const unstick = e => { if (!stick || (e && e.pointerId !== stick.id)) return; stick = null; touch.mx = touch.mz = 0; knob.style.transform = ''; base.classList.remove('on'); layoutPad(); };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) left.addEventListener(ev, unstick);
  const held = new Map();  // pointerId -> button: each finger keeps the button it landed on
  right.addEventListener('pointerdown', e => {
    let best = null, bd = 1e9;
    for (const b of btns) { const r = b.getBoundingClientRect(), d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)); if (d < r.width * .65 && d < bd) { best = b; bd = d; } }
    if (!best) return;
    e.preventDefault(); right.setPointerCapture(e.pointerId); take();
    held.set(e.pointerId, best); touch[best.dataset.b] = true; touch.tapped.add(best.dataset.b); best.classList.add('on'); navigator.vibrate && navigator.vibrate(8);
  });
  const lift = e => { const b = held.get(e.pointerId); if (!b) return; held.delete(e.pointerId); if (![...held.values()].includes(b)) { touch[b.dataset.b] = false; b.classList.remove('on'); } };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) right.addEventListener(ev, lift);
  el.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('blur', () => { unstick(); held.clear(); btns.forEach(b => b.classList.remove('on')); PADB.forEach(([b]) => touch[b] = false); });  // a call or a notification: let go of everything
  const quit = el.querySelector('.quit');
  quit.addEventListener('click', () => {  // two taps to leave, so a stray thumb doesn't end the fight
    if (quit.dataset.armed) return stop();
    quit.dataset.armed = '1'; quit.textContent = 'TAP AGAIN TO LEAVE'; setTimeout(() => { delete quit.dataset.armed; quit.textContent = '✕'; }, 2000);
  });
}
function fit() {
  const r = root.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  W = cv.width = Math.max(1, Math.round(r.width * d)); H = cv.height = Math.max(1, Math.round(r.height * d)); DPR = d;
  fitPic(); layoutPad();
}
async function start(pair, opts = {}) {
  if (coarse() && document.documentElement.requestFullscreen && !document.fullscreenElement)  // phones: full screen and sideways (Android; iPhones keep the browser bar)
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape')).catch(() => {});
  if (window.brawling) stop();  // a new game ends the running one (an online match counts as walking out of it)
  const run = ++startSeq, live = () => run === startSeq;
  root = document.getElementById('brawl'); cv = root.querySelector('canvas'); ctx = cv.getContext('2d');
  root.hidden = false; window.brawling = true; fit(); touchPad();
  if (!start.ro) { start.ro = new ResizeObserver(fit); start.ro.observe(root); }
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();  // Space must not press the button that started us
  opts0 = opts; mode = opts.mode || (pair && pair.length === 2 ? 'cpu' : 'demo');
  net = mode === 'online' && opts.link ? { role: opts.link.role, link: opts.link, seen: [], ack: 0, offs: [] } : null;
  if (mode === 'online' && !net) mode = '2p';
  if (net) {  // listen before loading anything: an opponent who leaves meanwhile must still end the match
    net.offs.push(net.link.onGone(() => finish(mySlot(), 'left')));
    if (net.role === 'guest') net.offs.push(net.link.onData(d => S && net && unpack(d)));
  }
  ctrl[0] = mode === 'demo' ? 'cpu' : 'keys'; ctrl[1] = mode === '2p' ? 'keys' : mode === 'online' ? 'net' : 'cpu';
  ladder.beaten = []; match.wins = [0, 0]; match.used = []; match.sp = [0, 0]; evs.length = 0; keys.clear(); tapped.clear();
  const bar = root.querySelector('.brawl-bar span');
  if (bar) bar.textContent = `${help(mode === '2p')}${mode === 'demo' ? ' · press any of them to take over P1' : ''} · Controllers: press any button to join · ${CREDITS}`;
  S = null;
  const ph = new Image(); if (window.PHOTOG) ph.src = window.PHOTOG;
  photogImg = window.PHOTOG ? await ph.decode().then(() => ph, () => null) : null;
  const ph2 = new Image(); if (window.PHOTOG_NOCAM) ph2.src = window.PHOTOG_NOCAM;  // the same Moshik with his camera put away, for after the match
  photogNoCam = window.PHOTOG_NOCAM && window.PHOTOG_NOCAM_RIG ? await ph2.decode().then(() => ph2, () => null) : null;
  await Promise.race([Promise.all(['40px Bungee', '20px "Press Start 2P"'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 1500))]).catch(() => {});
  if (!live()) return;  // stopped (Esc, Leave, another start) while loading
  if (net && net.role === 'guest') {
    S = freshState({ byId: new Map(), pending: new Set(), evSeen: 0, presses: { punch: 0, kick: 0, grab: 0, jump: 0, special: 0, roll: 0 }, held: {}, waiting: 'CONNECTING…' });
    const d0 = net.link.latest(); if (d0) unpack(d0);
  } else {
    await newMatch(pair, 1);
    if (!live()) return;
  }
  if (net && net.early) finish(...net.early);
  cancelAnimationFrame(raf); lastT = performance.now(); raf = requestAnimationFrame(frame);
}
function stop(quiet) {
  startSeq++; cancelAnimationFrame(raf);
  const quit = net && !(S && S.ending), cb = opts0.onEnd;
  if (net) net.offs.forEach(off => { try { off(); } catch {} });
  S = null; window.brawling = false; net = null; opts0 = {};
  if (root) root.hidden = true;
  if (quit && !quiet && cb) cb({ winner: 'them', reason: 'quit' });  // walking out of an online match forfeits it
}
addEventListener('keydown', e => {
  if (!window.brawling) return;
  if (e.code === 'Escape') return stop();
  const lay = layout(), li = lay.findIndex(m => Object.values(m).some(c => c.includes(e.code)));
  if (li < 0) return;
  e.preventDefault();
  keys.add(e.code); tapped.add(e.code);
  const p = net ? mySlot() : li;
  if (!net && !(mode === 'cpu' && p === 1)) ctrl[p] = ctrl[p] === 'pad' ? 'pad' : 'keys';  // a player's first key press takes over from the CPU
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
window.Brawl = { start, stop, get state() { return S; }, POSE, drawItem,
  keys: { get: () => copyKeys(LAYOUT), defaults: () => copyKeys(DEFAULT_KEYS), name: keyName, actions: ACTIONS,
          set(l) { LAYOUT = copyKeys(l); try { localStorage.setItem('brawl-keys', JSON.stringify(LAYOUT)); } catch {} } } };  // state: for poking at a running match from the console
})();
