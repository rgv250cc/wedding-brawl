"""Builds sounds.js (window.SOUNDS = {event: [mp3 data: URIs]}) from free sound packs, for sfx.js to play.
Sources (download and unzip each into its own folder under SRC):
  impact/    Kenney Impact Sounds, CC0          https://kenney.nl/assets/impact-sounds
  voice/     Kenney Voiceover Pack: Fighter, CC0  https://opengameart.org/content/voiceover-pack-fighter-40-taunts
  scifi/     Kenney Sci-Fi Sounds, CC0          https://opengameart.org/content/sci-fi-sounds
  glass/     Glass break (Till Behrend), CC0    https://opengameart.org/content/glass-break
  accessory/ Fantasy accessory SFX library, CC0 https://opengameart.org/content/fantasy-accessory-sfx-library
  swish/     Swishes pack (artisticdude), CC0   https://opengameart.org/node/4693
  crowd/     Crowd cheering, Gregor Quendel, CC BY 4.0 (credit shown in the page)
             https://opengameart.org/content/free-crowd-cheering-sounds
Usage: python3 make_sounds.py SRC   (needs ffmpeg)"""
import sys, re, glob, base64, json, subprocess, os

SRC = sys.argv[1]
f = lambda pat: sorted(glob.glob(os.path.join(SRC, "**", pat), recursive=True))
CHEER = f("*04 - Strong cheering - II - Short.mp3")[0]
SOFT = f("*05 - Soft cheering - I.mp3")[0]
# event -> [(file, start s, max length s)]; several files = random variants
BANK = {
    "punch":  [(p, 0, .45) for p in f("impactPunch_medium_00[0-4].ogg")],
    "kick":   [(p, 0, .55) for p in f("impactPunch_heavy_00[0-4].ogg")],
    "swing":  [(p, 0, .4) for p in f("swish-[1-4].wav")],
    "swingHeavy": [(p, 0, .5) for p in f("swish-[5-9].wav")],
    "poke":   [(p, 0, .4) for p in f("impactMetal_light_00[0-2].ogg")],
    "clonk":  [(p, 0, .5) for p in f("impactGlass_medium_00[0-2].ogg")],
    "bonk":   [(p, 0, .45) for p in f("impactWood_medium_00[0-2].ogg")],
    "thwack": [(p, 0, .45) for p in f("impactSoft_medium_00[0-2].ogg")],
    "crash":  [(p, 0, .8) for p in f("impactPlate_heavy_00[0-2].ogg")],
    "smash":  [(f("glass_breaking.wav")[0], 0, 1.3)],
    "pop":    [(p, 0, .7) for p in f("bottle-glass-uncork-0[1-3].wav")],
    "zap":    [(p, 0, .55) for p in f("laserRetro_00[0-2].ogg")],
    "thud":   [(p, 0, .55) for p in f("impactSoft_heavy_00[0-4].ogg")],
    "clatter": [(p, 0, .35) for p in f("impactWood_light_00[0-2].ogg")],
    "metal":  [(p, 0, .5) for p in f("impactMetal_medium_00[0-1].ogg")],
    "splat":  [(p, 0, .8) for p in f("slime_00[0-1].ogg")],
    "beam":   [(f("forceField_000.ogg")[0], 0, 1.6)],
    "ufo":    [(f("spaceEngineSmall_000.ogg")[0], 0, 2.5)],
    "bell":   [(f("impactBell_heavy_000.ogg")[0], 0, 1.6)],
    "boom":   [(f("lowFrequency_explosion_000.ogg")[0], 0, 1.6)],
    "paper":  [(p, 0, .25) for p in f("footstep_carpet_00[0-4].ogg")],
    "cheer":  [(CHEER, s, 3.2) for s in (0, 3.5, 7)],
    "cheerSoft": [(SOFT, s, 2.6) for s in (1, 5)],
}
for line in ["round_1", "round_2", "round_3", "round_4", "round_5", "final_round", "fight", "winner", "flawless_victory",
             "choose_your_character", "player_1", "player_2", "prepare_yourself", "time", "combo"]:
    BANK[line.replace("_victory", "").replace("_your_character", "").replace("player_", "p").replace("_yourself", "").replace("_", "")] = \
        [(f(line + ".ogg")[0], 0, 3)]

def mp3(path, start, dur):
    peak = subprocess.run(["ffmpeg", "-v", "info", "-ss", str(start), "-t", str(dur), "-i", path, "-af", "volumedetect", "-f", "null", "-"],
                          capture_output=True, text=True).stderr
    gain = -1.5 - float(re.search(r"max_volume: (-?[\d.]+) dB", peak).group(1))  # every clip peaks at -1.5 dB
    fade = max(.02, min(.25, dur * .2))
    af = f"silenceremove=start_periods=1:start_threshold=-55dB,atrim=0:{dur},volume={gain}dB,afade=t=out:st={dur - fade}:d={fade}"
    if start: af += ",afade=t=in:d=0.25"
    out = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(start), "-i", path, "-af", af, "-ac", "1", "-ar", "44100",
                          "-b:a", "72k", "-f", "mp3", "-"], capture_output=True, check=True).stdout
    return "data:audio/mpeg;base64," + base64.b64encode(out).decode()

sounds = {name: [mp3(*clip) for clip in clips] for name, clips in BANK.items()}
js = "window.SOUNDS = " + json.dumps(sounds) + ";\nwindow.SFX && window.SFX.load(window.SOUNDS);\n"
open("sounds.js", "w").write(js)
print(len(sounds), "events,", sum(map(len, sounds.values())), "clips,", round(len(js) / 1024), "KB")
