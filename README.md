# Wedding Brawl

One wedding group photo becomes an interactive page. Every guest is a paper cut-out standing at their own depth, so the
photo moves in 3D with the mouse. Click a guest for an arcade-style intro, pick a rival, and fight in a ballroom full of
guests who puke, faint, slip in puddles and get abducted by a UFO.

## Run

Serve this folder and open it: `npm run serve`, then http://localhost:8765. The page needs `layers.js` and
`fighters.js`, which are built from your own photo and are not in this repo because they show real people.

## Build from a photo

`./build.sh photo.jpg --name "0.55,0.70=Dana|The Bride" --bodies cyborg` runs `make_layers.py` on a CUDA machine
(`ssh rtx` in build.sh) and copies `layers.js` and `fighters.js` back. The pipeline finds the depth, cuts out every guest,
paints the empty background, upscales the portraits and gives half-hidden guests a full body.
`python3 make_layers.py --help` lists the options.

## Controls

| | Player 1 | Player 2 |
|---|---|---|
| Move | W A S D | I J K L |
| Punch | X | `,` |
| Kick | C | `.` |
| Grab / throw | V | `/` |
| Jump | Z | M |

Controllers join by pressing any button. Esc leaves the fight.

## Tools

- `npm run keytest`: presses every key of both players in headless Chrome and reports what each did.
- `npm run record`: renders a review video frame by frame (steady 30 fps, sound rendered offline from the same clock).
- `make_sounds.py`: builds `sounds.js` from the free sound packs listed in the file.
- `make_ballroom.py`: generates the ballroom backdrop.

## Credits

Sounds: [Kenney](https://kenney.nl) (CC0), OpenGameArt contributors (CC0), crowd cheering by
[Gregor Quendel](https://opengameart.org/content/free-crowd-cheering-sounds) (CC BY 4.0). Details in `make_sounds.py`.
