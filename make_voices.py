"""Voice clips for the fighters, from free Pixabay sound effects (Pixabay Content License: free in games, no credit needed).
Each file is split into its separate utterances (gaps of silence), the best short bits (0.5-2.4 s) are kept, levelled and
written to voices.js as window.VOICES = { m: [mp3 data URIs], f: [...] }; voices-credits.md lists where each came from.
Usage: python3 make_voices.py ~/Downloads/men ~/Downloads/women [per-gender, default 10]   (needs ffmpeg and numpy)"""
import sys, os, glob, json, base64, hashlib, subprocess
import numpy as np

SR = 22050

def pcm(path):  # mono float samples
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)

def utterances(x):  # [(start, end)] seconds of sound separated by at least 0.25 s of quiet
    hop = int(SR * .02); n = len(x) // hop
    if not n: return []
    rms = np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12); db = 20 * np.log10(rms / (rms.max() + 1e-12))
    on, out, start, quiet = db > -32, [], None, 0
    for i, v in enumerate(on):
        if v: start = i if start is None else start; quiet = 0
        elif start is not None:
            quiet += 1
            if quiet * .02 >= .25: out.append((start * .02, (i - quiet + 1) * .02)); start, quiet = None, 0
    if start is not None: out.append((start * .02, n * .02))
    return [(a, b) for a, b in out if b - a >= .45]

def pick(path, room):  # the loudest well-sized bits of one file
    x = pcm(path); segs = []
    for a, b in utterances(x):
        b = min(b, a + 2.4)  # long babble: keep its first 2.4 s
        loud = float(np.sqrt((x[int(a * SR):int(b * SR)] ** 2).mean()))
        segs.append((loud * min(1, (b - a) / 1.2), a, b))
    return [(a, b) for _, a, b in sorted(segs, reverse=True)[:room]]

def mp3(path, a, b):
    af = f"atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d=0.01,afade=t=out:st={max(0, b - a - .08)}:d=0.08,dynaudnorm=f=150:g=5,alimiter=limit=0.84"
    return subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-af", af, "-ac", "1", "-ar", "44100", "-b:a", "64k", "-f", "mp3", "-"],
                          capture_output=True, check=True).stdout

def bank(folder, want):
    files, seen = [], set()
    for f in sorted(glob.glob(os.path.join(os.path.expanduser(folder), "*.mp3"))):
        h = hashlib.md5(open(f, "rb").read()).hexdigest()
        if h not in seen: seen.add(h); files.append(f)  # the same clip downloaded twice counts once
    picks = {f: pick(f, 3) for f in files}  # round robin: every file's best bit first, then second bits from the long ones
    order = [(f, *picks[f][i]) for i in range(3) for f in files if i < len(picks[f])][:want]
    return [(f, a, b, mp3(f, a, b)) for f, a, b in order]

men, women = sys.argv[1], sys.argv[2]
want = int(sys.argv[3]) if len(sys.argv) > 3 else 10
banks = {"m": bank(men, want), "f": bank(women, want)}
uri = lambda d: "data:audio/mpeg;base64," + base64.b64encode(d).decode()
js = ("window.VOICES = " + json.dumps({g: [uri(c[3]) for c in v] for g, v in banks.items()}) + ";\n"
      "window.SFX && window.SFX.load(Object.fromEntries([...VOICES.m.map((u, i) => ['vm' + i, [u]]), ...VOICES.f.map((u, i) => ['vf' + i, [u]])]));\n")
open("voices.js", "w").write(js)
lines = ["# Voice clips", "", "From Pixabay sound effects, used under the Pixabay Content License (free, no attribution required).", ""]
for g, v in banks.items():
    for i, (f, a, b, _) in enumerate(v):
        name = os.path.basename(f)[:-4]; uploader, rest = name.split("-", 1); pid = rest.rsplit("-", 1)[-1]
        lines.append(f"- v{g}{i}: \"{rest.rsplit('-', 1)[0].replace('-', ' ')}\" by {uploader}, Pixabay #{pid}, {a:.2f}-{b:.2f} s")
open("voices-credits.md", "w").write("\n".join(lines) + "\n")
print({g: len(v) for g, v in banks.items()}, f"voices.js {len(js) // 1024} KB")
