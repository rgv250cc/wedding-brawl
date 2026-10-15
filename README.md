# Wedding Brawl

One wedding group photo becomes an interactive page. Every guest is a paper cut-out standing at their own depth, so the
photo moves in 3D with the mouse. Click a guest for an arcade-style intro, choose who plays the other side, pick a rival,
and fight in a ballroom full of guests who wander in and out, drink, ride each other like horses, puke, pee in the corner,
faint, slip in puddles and get abducted by a UFO. Moshik the photographer walks around too: if his flash catches you from
the front you're blinded for 2 seconds.

Everyone has a sweet nickname based on how they look (Gabi, Stephanie and Moshik keep their real names), a couple of
signature punchlines shown as typed subtitles with cartoon gibberish blips, and a South Park style talking head. When a
fighter's health runs out, FINISH THEM! appears: press any attack and the winner's own finishing move plays as a
four-panel comic that ends in K.O. Each match is in a random scene: the generated ballroom or the venue's own photos.

The bystanders run on needs (thirst, hunger, bladder, fun, social, tiredness, curiosity) and the room's objects (bar, cake,
DJ dance floor, loo, chairs, gift table, photo booth): drinks fill bladders, a busy loo sends someone to the corner, and a
hot fight pulls a ring of watchers. `docs/crowd-ai-research.md` compares this with behaviour trees, LLM agents and Jev.

Every person is a jointed paper puppet: the portrait is cut at the shoulders, elbows, hips and knees, so arms and legs move
with each action. Limbs and bellies the photo doesn't show (hidden behind someone, or below the frame) are drawn as chrome
cyborg parts.

## Run

Serve this folder and open it: `npm run serve`, then http://localhost:8765. The page needs `layers.js`, `fighters.js`,
`rigs.js` and `photog.js`, which are built from your own photos and are not in this repo because they show real people.

## Modes

After the first pick, choose who plays player 2:

- **VS CPU**: a three-level ladder (easy, medium, hard). Beat level 3 to be champion; a loss retries the level.
- **2 PLAYERS**: two people at one keyboard (or two controllers), best of 3.
- **ONLINE**: the lobby. Pick a name and a fighter, then press FIND A MATCH (the first two in the queue are paired) or
  DUEL someone in the list. Best of 3; the inviter's browser runs the game and the other sends its moves.

**Ballroom brawl** in the bottom bar is a demo: the CPU plays both sides until you press a key or a controller button.

## Controls

One player (VS CPU, online, demo):

| Move | Punch | Kick | Grab / throw | Jump |
|---|---|---|---|---|
| W A S D or arrows | J | K | L | Space |

Two players on one keyboard:

| | Move | Punch | Kick | Grab / throw | Jump |
|---|---|---|---|---|---|
| Player 1 | W A S D | X | C | V | Z |
| Player 2 | I J K L | `,` | `.` | `/` | M |

Controllers join by pressing any button (A jump, B grab/throw, X punch, Y kick). Esc leaves the fight.

The **Controls** button on the main page explains how to play and lets you remap every key (saved in your browser).

## Online play

- **From the shared claude.ai page**: the lobby uses the page's live room, so anyone you share the page with can join.
- **Self-hosted**: `npm install`, then `BRAWL_CODE=some-secret npm run online` serves the game and the relay on
  http://localhost:8780. Everyone needs the access code (8 characters or more). To let a friend in from outside, expose that port, e.g.
  `cloudflared tunnel --url http://localhost:8780` (free, no account), and send them the URL and the code.
  Without `BRAWL_CODE` the server is open to anyone who can reach it. It listens on 127.0.0.1 unless you set `HOST`.

## Publish on Cloudflare

`deploy/build.sh` copies exactly the files the page loads (the `PAGE` list in `server.mjs`) into `deploy/public/`, then
`cd deploy && npx wrangler deploy` publishes them to https://wedding-brawl.grinevich.cc (set in `deploy/wrangler.toml`).
`deploy/worker.js` serves the static files and runs the online relay at `/room` (the same protocol as `server.mjs`) in one
Durable Object, so online play works there too. It runs on the free Workers plan.

The deployed site is public: there is no access code, and anyone with the URL gets the photos of every guest.

`npx wrangler dev` (in `deploy/`) runs the same thing on http://127.0.0.1:8787. `NETTEST_URL=<url> node nettest.mjs` runs
the online test against a running site instead of starting `server.mjs`.

## Build from a photo

`./build.sh photo.jpg --name "0.55,0.70=Dana|The Bride" --bodies cyborg` runs `make_layers.py` and `make_rigs.py` on a
CUDA machine (`ssh rtx` in build.sh) and copies `layers.js`, `fighters.js` and `rigs.js` back. The pipeline finds the depth,
cuts out every guest, paints the empty background, upscales the portraits, gives half-hidden guests a full body and finds
everyone's joints. `python3 make_layers.py --help` lists the options.

The photographer: `python make_photographer.py his_photo.jpg` on the GPU box cuts him out with whatever he holds and
writes `photog.js`; then rerun `make_rigs.py fighters.js photog.js`.

Scenes: `python make_stage.py venue.jpg --name garden --floor .68,.985 --tall .12,.44` on the GPU box paints out anyone in
the photo and adds it to `stages.js` (floor = the walkable band, tall = a person's height at its back and front, as
fractions of the picture's height). Nicknames, titles, finishers and punchlines live in `nicknames.js`.
All of these generated files show real people or the venue, so they stay out of the repo.

## Tools

- `npm run keytest`: presses every control of every layout in headless Chrome and reports what each did.
- `npm run nettest`: two headless players log in, queue, fight online, duel, and leave, through `server.mjs`.
- `npm run relaytest` / `npm run lobbytest`: the relay server and the lobby's matchmaking on their own.
- `npm run record`: renders a review video frame by frame (steady 30 fps, sound rendered offline from the same clock).
- `puppets.html`: every pose on a few guests, for tuning the puppets (`?k=all`, `?poses=walk,kick`, `?cols=4`).
- `comics.html`: every comic finisher panel, for tuning `comic.js`.
- `probe.mjs` / `shot.mjs`: run a match headless and screenshot it / screenshot any page once its title says ready.
- `make_sounds.py`: builds `sounds.js` from the free sound packs listed in the file (downloaded into `sound-packs/`).
- `make_ballroom.py`: generates the ballroom backdrop.
- `make_voices.py`: builds `voices.js` (the fighters' voices, 10 male and 10 female) from Pixabay clips you download.

## Credits

Sounds: [Kenney](https://kenney.nl) (CC0), OpenGameArt contributors (CC0), crowd cheering by
[Gregor Quendel](https://opengameart.org/content/free-crowd-cheering-sounds) (CC BY 4.0). Details in `make_sounds.py`.
