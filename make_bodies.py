"""Full bodies for the guests the photo cuts off at the chest ("cy" cards): a mannequin drawn on their completed
skeleton, SDXL-inpainted into full-coverage sci-fi armour with a colour scheme of its own, under their real face.
make_layers.py --bodies cyborg calls Bodies.make() for each such guest. On its own (CUDA box, same venv, run where
make_layers.py ran) it re-rolls the bodies of an existing build from out/layers.js and the stage-1 cache:
    python make_bodies.py photo.jpg --ks 10,14 --seeds 8 --cands out/cands   candidates + measurements to choose from
    python make_bodies.py photo.jpg --apply out/fighters.js                   PICKS (else the best seed) -> fighters.js
"""
import os, io, json, base64, argparse
import numpy as np, cv2, torch
from PIL import Image
from scipy import ndimage

# colour schemes: armour, trim, glow, armour RGB (mannequin tint and the hue the check expects), kind.
# kind "hue": the armour has to come out in that hue; "dark" / "light": neutral armour, judged by lightness
PALETTES = {
    "copper":    ("polished copper", "black", "amber", (184, 115, 51), "hue"),
    "royal":     ("royal blue", "gold", "white", (40, 70, 190), "hue"),
    "champagne": ("champagne gold", "ivory", "soft white", (215, 190, 130), "hue"),
    "teal":      ("teal", "bronze", "turquoise", (20, 130, 130), "hue"),
    "black":     ("matte black", "crimson", "red", (25, 25, 28), "dark"),
    "orange":    ("burnt orange", "charcoal", "orange", (204, 85, 0), "hue"),
    "pearl":     ("pearl white", "black", "pink", (235, 230, 225), "light"),  # rose gold trim kept tripping the skin test
    "olive":     ("olive green military", "tan", "orange", (95, 105, 45), "hue"),
    "lime":      ("lime green", "black", "lime green", (140, 200, 40), "hue"),
    "purple":    ("royal purple", "silver", "violet", (100, 40, 150), "hue"),
    "navy":      ("navy blue", "copper", "warm yellow", (25, 35, 90), "hue"),
    "burgundy":  ("burgundy", "gold", "magenta", (110, 20, 40), "hue"),
    "emerald":   ("emerald green", "brass", "green", (20, 130, 70), "hue"),
    "red":       ("glossy red", "white", "golden", (200, 20, 30), "hue"),
    "pink":      ("hot pink", "black", "white", (230, 60, 150), "hue"),
    "sky":       ("sky blue", "white", "soft blue", (120, 180, 230), "hue"),
    "yellow":    ("sunflower yellow", "black", "white", (240, 190, 20), "hue"),
}
CYAN_OK = {"teal"}  # the one scheme allowed cyan/turquoise light
# schemes and seeds chosen by eye per photo: stem -> card index -> (palette, seed or None = best of N,
# None or the guest's label index in make_layers.py when someone in front bit into their face: see complete_head)
PICKS = {"wedding": {
    10: ("copper", 1004, None), 14: ("royal", 1406, None), 20: ("champagne", 2005, None), 21: ("teal", 2104, None),
    22: ("black", 2207, None), 23: ("lime", 2300, None), 25: ("pearl", 2513, None), 30: ("olive", 3007, None),
    35: ("purple", 3501, None), 39: ("navy", 3903, None), 41: ("burgundy", 4109, None), 42: ("emerald", 4200, None),
    44: ("red", 4407, None), 45: ("pink", 4506, None), 49: ("sky", 4909, 65), 50: ("yellow", 5002, None)}}

PROMPT = ("full-body studio photo of a person in {armour} sci-fi power armor with {trim} trim and {glow} glowing lights, "
          "polished hard-surface plates with clear panel lines, covering the whole body from a high collar down to armored boots, "
          "armored gauntlets, standing straight, front view, studio lighting, sharp focus, highly detailed")
NEG = ("skin, bare skin, bare shoulders, bare arms, bare legs, cleavage, neckline, bikini, swimsuit, lingerie, leotard, corset, nude, sexy, "
       "revealing, blurry, washed out, transparent, translucent, ghost, faded, grey blob, flat shading, plain, low detail, smooth mannequin, "
       "deformed hands, extra head, extra arms, extra legs, deformed, cropped, text, watermark, scenery, other people")
# second text encoder: the colours this scheme must not drift to, then the modesty core again
AVOID = ["cyan", "turquoise", "light blue", "blue lights", "grey", "silver", "chrome"]
NEG2 = ("skin, bare skin, cleavage, bikini, lingerie, nude, revealing, blurry, washed out, low detail, flat shading, "
        "deformed hands, extra arms, extra legs, text, other people")
# the first body recipe: only used to complete a face someone in front bit into (it paints believable chins)
OLD_P = ("full-length photo of a person wearing a bulky full-body robotic mech armor suit that covers everything from the neck "
         "down to the feet, thick steel and chrome plates, glowing blue joints, standing, plain light grey studio background")
OLD_NEG = ("skin, bare skin, bare legs, bare arms, cleavage, bikini, swimsuit, lingerie, leotard, corset, nude, sexy, "
           "revealing, extra head, two heads, extra arms, extra legs, deformed, cropped, text, watermark, scenery, other people")
BG = np.array([.5, .5, .52], np.float32)  # backdrop the body is painted on (and cut from)
Wc, Hc = 832, 1216

def negative2(pal):
    armour, trim, glow, _, _ = PALETTES[pal]
    words = f"{armour} {trim} {glow}"
    drop = set(w for w in AVOID if w in words)
    if pal in CYAN_OK: drop |= {"cyan", "turquoise"}
    if "blue" in armour or "blue" in glow: drop |= {"light blue", "blue lights"}
    return ", ".join([w for w in AVOID if w not in drop] + [NEG2])

def hue_of(rgb):
    return float(cv2.cvtColor(np.uint8([[rgb]]), cv2.COLOR_RGB2HSV)[0, 0, 0]) * 2

def hue_dist(a, b):
    return abs((a - b + 180) % 360 - 180)

def skeleton(kps, m, width):
    """joints YOLO-pose sees on this cut-out, the hidden ones filled in as a relaxed standing pose
    -> (joints, shoulder width, hips hidden, face on this cut-out, the keypoints seen)"""
    H, W = m.shape
    best, n = None, 1
    for kp in kps:
        ok = kp[:, 2] > 0.4
        hits = m[kp[ok, 1].astype(int).clip(0, H - 1), kp[ok, 0].astype(int).clip(0, W - 1)].sum()
        if hits > n: best, n = kp, hits
    if best is None or min(best[5, 2], best[6, 2]) < 0.4: return None  # need both shoulders to size a body
    P = {i: best[i, :2] for i in range(17) if best[i, 2] > 0.4}
    ls, rs = P[5], P[6]
    sw = max(np.linalg.norm(ls - rs), 0.5 * width)  # turned sideways -> shoulders look narrow; the cut-out width keeps it sane
    across = (ls - rs) / max(np.linalg.norm(ls - rs), 1e-6)
    down = np.array([-across[1], across[0]]); down = down if down[1] > 0 else -down
    unit = lambda v: v / max(np.linalg.norm(v), 1e-6)
    J = dict(ls=ls, rs=rs)
    hip = (ls + rs) / 2 + down * 1.55 * sw
    J["lh"], J["rh"] = P.get(11, hip + across * .4 * sw), P.get(12, hip - across * .4 * sw)
    J["lk"], J["rk"] = P.get(13, J["lh"] + down * 1.2 * sw), P.get(14, J["rh"] + down * 1.2 * sw)
    J["la"], J["ra"] = P.get(15, J["lk"] + down * 1.2 * sw), P.get(16, J["rk"] + down * 1.2 * sw)
    J["le"], J["re"] = P.get(7, ls + down * .9 * sw + across * .15 * sw), P.get(8, rs + down * .9 * sw - across * .15 * sw)
    J["lw"], J["rw"] = P.get(9, J["le"] + unit(J["le"] - ls) * .8 * sw), P.get(10, J["re"] + unit(J["re"] - rs) * .8 * sw)
    head = 0 in P and m[int(np.clip(P[0][1], 0, H - 1)), int(np.clip(P[0][0], 0, W - 1))]  # their face is on this cut-out
    return J, sw, 11 not in P and 12 not in P, head, P

def skinbox(ycc):
    return (ycc[..., 1] > 135) & (ycc[..., 1] < 180) & (ycc[..., 2] > 85) & (ycc[..., 2] < 135)

def true_lab(px):  # uint8 RGB N x 3 -> CIE L*a*b* N x 3
    lab = cv2.cvtColor(px[None], cv2.COLOR_RGB2LAB)[0].astype(np.float32)
    return np.stack([lab[:, 0] / 2.55, lab[:, 1] - 128, lab[:, 2] - 128], 1)

def outfit_colours(cut_rgb, cut_a, y_sh):  # dominant non-skin colours of the real cut below the shoulder line, RGB
    px = cut_rgb[y_sh:][cut_a[y_sh:] > .9].reshape(-1, 3)
    if len(px) < 30: return []
    px = px[~skinbox(cv2.cvtColor(px[None], cv2.COLOR_RGB2YCrCb)[0])]
    if len(px) < 30: return []
    _, lab_, cen = cv2.kmeans(px.astype(np.float32), 3, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1), 3,
                              cv2.KMEANS_PP_CENTERS)
    cnt = np.bincount(lab_.ravel(), minlength=3)
    return [tuple(int(v) for v in cen[i]) for i in np.argsort(-cnt) if cnt[i] >= .12 * len(px)]

def solid_alpha(fig, gen, region):
    """binary figure -> solid alpha: largest parts only, interior holes filled unless they look like backdrop,
    soft only on the outer ~2 px"""
    fig = fig & region
    n, cc, st, _ = cv2.connectedComponentsWithStats(fig.astype(np.uint8))
    if n > 1:
        big = st[1:, cv2.CC_STAT_AREA]; fig = np.isin(cc, np.nonzero(big >= .05 * big.max())[0] + 1)
    holes = ndimage.binary_fill_holes(fig) & ~fig
    n, cc = cv2.connectedComponents(holes.astype(np.uint8))
    for i in range(1, n):
        hm = cc == i
        if hm.sum() < 600 or np.abs(gen[hm].mean(0) - BG).max() > .12: fig |= hm
    fig = cv2.morphologyEx(fig.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)) > 0
    soft = cv2.GaussianBlur(fig.astype(np.float32), (0, 0), .9)
    core = cv2.erode(fig.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    return np.where(core, 1., soft)

def measure(out, painted, face_lab, pal):
    """the colours the body came out in, and whether they are the scheme's: dominant armour hue (chroma-weighted,
    skin-like pixels left out), lightness, glow hue (bright saturated pixels), how much cyan"""
    px = out[painted]
    ycc = cv2.cvtColor(px[None], cv2.COLOR_RGB2YCrCb)[0]
    hsv = cv2.cvtColor(px[None], cv2.COLOR_RGB2HSV)[0].astype(np.float32)
    lab = true_lab(px)
    box = skinbox(ycc)
    near = np.linalg.norm(lab - face_lab, axis=1) < 22 if face_lab is not None else box
    skin, skin_face = float(box.mean()), float((box & near).mean())
    # bare skin comes in patches (a thigh, a midriff); skin-coloured trim and highlights come in specks
    m = np.zeros(painted.shape, np.uint8); m[painted] = box & near
    n, _, st, _ = cv2.connectedComponentsWithStats(cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)))
    blob = float(st[1:, cv2.CC_STAT_AREA].max() / painted.sum()) if n > 1 else 0.
    body = ~(box & near)
    hue, S, V = hsv[:, 0] * 2, hsv[:, 1], hsv[:, 2]
    chroma = np.hypot(lab[:, 1], lab[:, 2])
    col = body & (chroma > 15)
    def peak(h, w):
        if len(h) < 20: return None
        hist = np.bincount((h // 15).astype(int) % 24, weights=w, minlength=24)
        c = (np.argmax(hist) + .5) * 15
        near_ = hue_dist(h, c) <= 22
        ang = np.deg2rad(h[near_]); ww = w[near_]
        return round(float(np.rad2deg(np.arctan2((np.sin(ang) * ww).sum(), (np.cos(ang) * ww).sum())) % 360), 1)
    dom = peak(hue[col], chroma[col])
    glow = body & (V > 215) & (S > 100)
    ghue = peak(hue[glow], np.ones(glow.sum()))
    cyanband = (hue >= 165) & (hue <= 200) & (S > 90) & (V > 120)
    cyan, cyan_glow = float((cyanband & body).mean()), float((cyanband & glow).mean())
    L = float(np.median(lab[body, 0]))
    _, _, _, rgb, kind = PALETTES[pal]
    want = hue_of(rgb)
    if kind == "hue": ok = col.mean() >= .3 and dom is not None and hue_dist(dom, want) <= 30
    elif kind == "dark": ok = L < 32
    else: ok = L > 62
    near_cyan = kind == "hue" and hue_dist(want, 182) <= 30
    if pal not in CYAN_OK: ok = ok and cyan_glow <= .005 and (near_cyan or cyan <= .03)
    return dict(skin=round(skin, 4), skin_face=round(skin_face, 4), skin_blob=round(blob, 4), dom_hue=dom, want_hue=round(want, 1), colored=round(float(col.mean()), 3),
                L=round(L, 1), glow_hue=ghue, glow=round(float(glow.mean()), 4), cyan=round(cyan, 4), cyan_glow=round(cyan_glow, 4), ok_pal=bool(ok))

class Bodies:
    def __init__(self, rgb, kps, inpainter, sam, stem, log=print, out=None):
        self.rgb, self.kps, self.inpainter, self.sam, self.log, self.out = rgb, kps, inpainter, sam, log, out
        self.H, self.W = rgb.shape[:2]
        self.picks, self.used, self._pose = PICKS.get(stem, {}), set(), None

    def pose(self, fig):  # the joint check make_rigs.py's view of the portrait has to pass: shoulders, hips, knees
        if self._pose is None:
            from ultralytics import YOLO
            self._pose = YOLO("yolo11x-pose.pt")
        flat = Image.new("RGB", fig.size, (128, 128, 128)); flat.paste(fig, (0, 0), fig)
        r = self._pose.predict(np.asarray(flat)[..., ::-1], conf=.15, imgsz=960, verbose=False)[0]
        if r.keypoints is None or not len(r.keypoints.data): return [0] * 17
        boxes = r.boxes.xyxy.cpu().numpy()
        i = int(np.argmax((boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])))
        return [round(float(c), 2) for c in r.keypoints.data[i, :, 2].cpu().numpy()]

    def prepare(self, k, cut, box, big):
        """cut: the guest's RGBA cut-out at photo size, box its place in the photo, big its upscaled version"""
        x0, y0, x1, y1 = box
        m = np.zeros((self.H, self.W), bool); m[y0:y1, x0:x1] = cut[..., 3] > 127
        ys, xs = np.nonzero(m)
        J, sw, _, _, P = skeleton(self.kps, m, xs.max() - xs.min())
        s = .9 * Hc / (max(J["la"][1], J["ra"][1]) + .25 * sw - y0)  # source px -> canvas px, whole figure fits
        cx = (J["ls"][0] + J["rs"][0]) / 2
        pt = lambda p: (int(round((p[0] - cx) * s + Wc / 2)), int(round((p[1] - y0) * s + .05 * Hc)))
        th = lambda f: max(2, int(f * sw * s))
        shape = np.zeros((Hc, Wc), np.uint8)  # the mannequin: bulky enough that the armour reads as armour
        cv2.fillConvexPoly(shape, np.array([pt(J[j]) for j in ("ls", "rs", "rh", "lh")], np.int32), 255, cv2.LINE_AA)
        for a, b, f in [("ls", "le", .3), ("le", "lw", .25), ("rs", "re", .3), ("re", "rw", .25), ("lh", "rh", .5),
                        ("lh", "lk", .4), ("lk", "la", .33), ("rh", "rk", .4), ("rk", "ra", .33)]:
            cv2.line(shape, pt(J[a]), pt(J[b]), 255, th(f), cv2.LINE_AA)
        for j in ("lw", "rw"): cv2.circle(shape, pt(J[j]), th(.14), 255, -1, cv2.LINE_AA)
        for j in ("la", "ra"): cv2.ellipse(shape, pt(J[j] + [0, .08 * sw]), (th(.22), th(.1)), 0, 0, 360, 255, -1, cv2.LINE_AA)
        layer = Image.new("RGBA", (Wc, Hc))
        layer.paste(big.resize((max(1, round((x1 - x0) * s)), max(1, round((y1 - y0) * s))), Image.LANCZOS), pt((x0, y0)))
        real = np.asarray(layer).astype(np.float32) / 255
        d = dict(k=k, J=J, sw=sw, P=P, s=s, pt=pt, th=th, shape=shape.astype(np.float32) / 255, real=real, va=real[..., 3:].copy())
        # this guest's skin tone: the face oval's skin-box pixels, or (dark skin can sit outside the box) its pixels
        # that are neither sunglasses-dark nor highlight-bright
        oval, px = self.face_oval(d) & (d["va"][..., 0] > .9), (real[..., :3] * 255).astype(np.uint8)
        face = oval & skinbox(cv2.cvtColor(px, cv2.COLOR_RGB2YCrCb))
        if face.sum() < 200: face = oval & (true_lab(px.reshape(-1, 3))[:, 0].reshape(Hc, Wc) > 15) & (px.max(-1) < 245)
        d["face_lab"] = np.median(true_lab(px[face]), 0) if face.sum() >= 200 else None
        d["outfit"] = outfit_colours(cut[..., :3], cut[..., 3].astype(np.float32) / 255, max(int(min(J["ls"][1], J["rs"][1]) - y0), 0))
        return d

    def face_oval(self, d):  # the head as an ellipse hung on the face keypoints, canvas px
        J, P, pt, sw, s = d["J"], d["P"], d["pt"], d["sw"], d["s"]
        eyes = [P[i] for i in (1, 2) if i in P]
        c = np.mean(eyes, 0) if eyes else P.get(0, (J["ls"] + J["rs"]) / 2 - [0, .9 * sw]) - [0, .08 * sw]
        oval = np.zeros((Hc, Wc), np.uint8)
        cv2.ellipse(oval, pt(c + [0, .1 * sw]), (int(.3 * sw * s), int(.42 * sw * s)), 0, 0, 360, 1, -1)
        oval[min(pt(J["ls"])[1], pt(J["rs"])[1]):] = 0
        return oval > 0

    def complete_head(self, d, seed):
        """someone in front bit into the face: run the first body recipe (grey mannequin, chrome-suit prompt, the same
        skin/flat rerolls) with that guest's seed from make_layers.py, the label index; it fills chins believably.
        Keep only the face it completed and treat it as real from then on"""
        J, pt, th, sw, s, real, va = d["J"], d["pt"], d["th"], d["sw"], d["s"], d["real"], d["va"]
        shape = np.zeros((Hc, Wc), np.uint8)
        cv2.fillConvexPoly(shape, np.array([pt(J[j]) for j in ("ls", "rs", "rh", "lh")], np.int32), 255, cv2.LINE_AA)
        for a, b, f in [("ls", "le", .28), ("le", "lw", .22), ("rs", "re", .28), ("re", "rw", .22), ("lh", "rh", .5),
                        ("lh", "lk", .38), ("lk", "la", .3), ("rh", "rk", .38), ("rk", "ra", .3)]:
            cv2.line(shape, pt(J[a]), pt(J[b]), 255, th(f), cv2.LINE_AA)
        for j in ("lw", "rw"): cv2.circle(shape, pt(J[j]), th(.13), 255, -1, cv2.LINE_AA)
        for j in ("la", "ra"): cv2.ellipse(shape, pt(J[j] + [0, .08 * sw]), (th(.2), th(.09)), 0, 0, 360, 255, -1, cv2.LINE_AA)
        shape = shape.astype(np.float32) / 255
        init = np.full((Hc, Wc, 3), .8, np.float32); init[shape > .5] = (.35, .37, .42)
        init = real[..., :3] * va + init * (1 - va)
        keep = cv2.erode((va[..., 0] > .8).astype(np.uint8), np.ones((5, 5), np.uint8))
        painted = (shape > .5) & (va[..., 0] < .1)
        tries = []
        for attempt in range(4):
            out = self.inpainter()(prompt=OLD_P, negative_prompt=OLD_NEG, image=Image.fromarray((init * 255).astype(np.uint8)),
                                   mask_image=Image.fromarray((1 - keep) * 255), width=Wc, height=Hc, strength=.85, guidance_scale=7,
                                   num_inference_steps=30, generator=torch.Generator("cuda").manual_seed(seed + 1000 * attempt)).images[0]
            ycc = cv2.cvtColor(np.asarray(out), cv2.COLOR_RGB2YCrCb)[painted]
            skin, flat = np.mean(skinbox(ycc)), ycc[:, 0].std() < 18
            tries.append((skin + flat, attempt, out))
            if skin < .03 and not flat: break
        out = min(tries, key=lambda t: t[:2])[2]
        region = cv2.dilate(np.maximum(shape, va[..., 0]), np.ones((th(.5), th(.5)), np.uint8)) > .5
        ys_, xs_ = np.nonzero(region)
        r = self.sam().predict(out, bboxes=[[xs_.min(), ys_.min(), xs_.max(), ys_.max()]], verbose=False)[0].masks
        fig = ((r.data[0].cpu().numpy() > .5) & region) if r is not None else region
        fill = self.face_oval(d) & fig & (va[..., 0] < .99)
        w = (cv2.GaussianBlur(fill.astype(np.float32), (0, 0), 1.0) * fig)[..., None] * (1 - va)
        gen = np.asarray(out).astype(np.float32) / 255
        d["real"] = real.copy(); d["real"][..., :3] = (real[..., :3] * va + gen * w) / np.maximum(va + w, 1e-6)
        d["va"] = va + w
        if self.out:
            ys_, xs_ = np.nonzero(self.face_oval(d))
            y0, y1, x0, x1 = max(ys_.min() - 60, 0), ys_.max() + 60, max(xs_.min() - 60, 0), xs_.max() + 60
            Image.fromarray(((d["real"][..., :3] * d["va"] + .2 * (1 - d["va"]))[y0:y1, x0:x1] * 255).astype(np.uint8)).save(
                f"{self.out}/k{d['k']}_head{seed}.png")

    def palette(self, k, d):
        if self.picks.get(k, (None,))[0]: return self.picks[k][0]
        free = [p for p in PALETTES if p not in self.used] or list(PALETTES)
        vivid = [c for c in d["outfit"] if cv2.cvtColor(np.uint8([[c]]), cv2.COLOR_RGB2HSV)[0, 0, 1] > 60]
        if vivid:  # a colourful outfit: the free scheme nearest its colour
            h = hue_of(vivid[0]); near = [p for p in free if PALETTES[p][4] == "hue" and hue_dist(hue_of(PALETTES[p][3]), h) <= 35]
            if near: return min(near, key=lambda p: hue_dist(hue_of(PALETTES[p][3]), h))
        return free[0]

    def candidate(self, d, pal, seed, steps=45, strength=.93, cfg=7.5, detail=.3):
        J, pt, th, shape, real, va = d["J"], d["pt"], d["th"], d["shape"], d["real"], d["va"]
        armour, trim, glow, rgb, _ = PALETTES[pal]
        prompt = PROMPT.format(armour=armour, trim=trim, glow=glow)
        # init: a shaded mannequin in the armour colour (volume from a distance transform + top light, a little noise)
        dist = cv2.distanceTransform((shape > .5).astype(np.uint8), cv2.DIST_L2, 5)
        vol = np.clip(dist / max(.12 * d["sw"] * d["s"], 1), 0, 1) ** .5
        tint = .9 * np.array(rgb, np.float32) / 255 + .1 * np.array([.6, .62, .66], np.float32)
        mann = tint[None, None] * (.45 + .6 * vol)[..., None] * np.linspace(1.1, .8, Hc)[:, None, None]
        mann = (mann + np.random.default_rng(seed).normal(0, .04, mann.shape)).astype(np.float32)
        init = np.where((shape > .5)[..., None], mann, BG)
        init = (real[..., :3] * va + init * (1 - va)).clip(0, 1)
        keep = cv2.erode((va[..., 0] > .8).astype(np.uint8), np.ones((5, 5), np.uint8))
        # repaint a generous band around the mannequin only; the rest stays plain backdrop (cleaner cut)
        band = cv2.dilate((np.maximum(shape, va[..., 0]) > .5).astype(np.uint8), np.ones((th(.7), th(.7)), np.uint8))
        mask = Image.fromarray(((band & (1 - keep)) * 255).astype(np.uint8))
        pipe, neg2 = self.inpainter(), negative2(pal)
        out = pipe(prompt=prompt, negative_prompt=NEG, negative_prompt_2=neg2, image=Image.fromarray((init * 255).astype(np.uint8)),
                   mask_image=mask, width=Wc, height=Hc, strength=strength, guidance_scale=cfg, num_inference_steps=steps,
                   generator=torch.Generator("cuda").manual_seed(seed)).images[0]
        W2, H2 = Wc * 3 // 2, Hc * 3 // 2  # detail pass at 1.5x: low strength, same mask, sharpens panels and joints
        out = pipe(prompt=prompt, negative_prompt=NEG, negative_prompt_2=neg2, image=out.resize((W2, H2), Image.LANCZOS),
                   mask_image=mask.resize((W2, H2)), width=W2, height=H2, strength=detail, guidance_scale=cfg, num_inference_steps=steps,
                   generator=torch.Generator("cuda").manual_seed(seed + 7)).images[0].resize((Wc, Hc), Image.LANCZOS)
        o = np.asarray(out)
        painted = (shape > .5) & (va[..., 0] < .1)
        info = dict(k=d["k"], seed=seed, palette=pal, **measure(o, painted, d["face_lab"], pal))
        info["flat"] = round(float(cv2.cvtColor(o, cv2.COLOR_RGB2YCrCb)[painted][:, 0].std()), 1)
        info["detail"] = round(float(cv2.Laplacian(cv2.cvtColor(o, cv2.COLOR_RGB2GRAY), cv2.CV_32F)[painted].var()), 1)
        # cut-out: SAM on the figure, plus mannequin pixels clearly unlike the backdrop (SAM sometimes drops a limb)
        gen = o.astype(np.float32) / 255
        region = cv2.dilate(np.maximum(shape, va[..., 0]), np.ones((th(.5), th(.5)), np.uint8)) > .5
        ys_, xs_ = np.nonzero(region)
        r = self.sam().predict(out, bboxes=[[xs_.min(), ys_.min(), xs_.max(), ys_.max()]], verbose=False)[0].masks
        fig = (r.data[0].cpu().numpy() > .5) if r is not None else region
        fig = fig | ((shape > .5) & (np.abs(gen - BG).max(-1) > .1))
        alpha = np.maximum(solid_alpha(fig, gen, region), va[..., 0])
        rgb_ = real[..., :3] * va + gen * (1 - va)
        ys_, xs_ = np.nonzero(alpha > .1)
        figim = Image.fromarray((np.dstack([rgb_, alpha]) * 255).round().astype(np.uint8)).crop((xs_.min(), ys_.min(), xs_.max() + 1, ys_.max() + 1))
        if figim.height > 900: figim = figim.resize((round(figim.width * 900 / figim.height), 900), Image.LANCZOS)
        c = self.pose(Image.open(io.BytesIO(webp(figim))))  # judged on what fighters.js will hold
        info["rig"] = [c[i] for i in (0, 5, 6, 11, 12, 13, 14, 15, 16)]
        info["ok_rig"] = min(c[5], c[6]) > .35 and min(c[11:15]) > .12
        # modesty: the skin reroll test (skin-box pixels under 3%). Gold, copper, red or pink armour sits in that box
        # too, so it also passes when the pixels close to this guest's own face tone are specks, not a patch: no
        # patch over 1% of the body (a bare thigh or midriff is several %) and under 6% in all
        info["ok_skin"] = info["skin"] < .03 or (info["skin_blob"] < .01 and info["skin_face"] < .06)
        info["ok"] = bool(info["ok_skin"] and info["flat"] >= 18 and info["ok_pal"] and info["ok_rig"])
        info["prompt"] = prompt
        return figim, info, out

    def make(self, k, cut, box, big, seeds=6, enough=3):
        """the body for card k: PICKS' seed for this photo, else the most detailed of the seeds that pass
        (modesty, not flat, the scheme's colours, joints the puppet can use); None if none does"""
        d = self.prepare(k, cut, box, big)
        pal = self.palette(k, d); self.used.add(pal)
        pk = self.picks.get(k)
        if pk and pk[2] is not None: self.complete_head(d, pk[2])  # no reliable way to spot a bitten face: by eye only
        pinned = pk is not None and pk[1] is not None
        best, passed = None, 0
        for seed in ([pk[1]] if pinned else [100 * k + i for i in range(seeds)]):
            fig, info, _ = self.candidate(d, pal, seed)
            self.log(f"guest {k}: {pal} seed {seed}: {'ok' if info['ok'] else 'rejected'} (armour hue {info['dom_hue']}, "
                     f"want {info['want_hue']}, glow {info['glow_hue']}, skin {info['skin']}/{info['skin_face']}, rig {info['ok_rig']})")
            if pinned: return fig
            if info["ok"]:
                passed += 1
                if best is None or info["detail"] > best[1]: best = (fig, info["detail"])
                if passed >= enough: break
        return best[0] if best else None

def webp(im):
    buf = io.BytesIO(); im.save(buf, "WEBP", quality=82, alpha_quality=90, method=6); return buf.getvalue()

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("photo")
    ap.add_argument("--layers", default="out/layers.js")
    ap.add_argument("--ks", default="cy", help="card indices, or cy = every generated body")
    ap.add_argument("--seeds", type=int, default=6)
    ap.add_argument("--seed0", type=int, default=0)
    ap.add_argument("--palette", default="", help="k=name,... overrides")
    ap.add_argument("--head", default="", help="k=seed,... complete the face first with that seed")
    ap.add_argument("--cands", default="", help="write candidates + log here instead of applying")
    ap.add_argument("--apply", default="", help="fighters.js to put the bodies into (only the cy entries change)")
    ap.add_argument("--offload", action="store_true", help="keep only the SDXL part in use on the GPU (~10 GB instead of ~18 GB, a bit slower)")
    args = ap.parse_args()
    stem = os.path.splitext(os.path.basename(args.photo))[0]
    rgb = np.asarray(Image.open(args.photo).convert("RGB")); H, W = rgb.shape[:2]
    kps = np.load(f"out/{stem}.stage1.npz")["kps"]
    src = open(args.layers).read(); L = json.loads(src[src.index("{"):src.rindex("}") + 1])
    _m = {}
    def inpainter():
        if "pipe" not in _m:
            from diffusers import AutoPipelineForInpainting
            _m["pipe"] = AutoPipelineForInpainting.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1",
                                                                   torch_dtype=torch.float16, variant="fp16")
            _m["pipe"].enable_model_cpu_offload() if args.offload else _m["pipe"].to("cuda")
            _m["pipe"].set_progress_bar_config(disable=True)
        return _m["pipe"]
    def sam():
        if "sam" not in _m:
            from ultralytics import SAM
            _m["sam"] = SAM("sam2.1_l.pt")
        return _m["sam"]
    def upscale(crop, alpha, cap=900):  # same as make_layers.py
        if "sr" not in _m:
            from spandrel import ModelLoader
            _m["sr"] = ModelLoader().load_from_file("RealESRGAN_x4plus.pth").cuda().eval()
        with torch.no_grad():
            y = _m["sr"](torch.from_numpy(np.ascontiguousarray(crop)).cuda().permute(2, 0, 1)[None].float() / 255)
        big = (y[0].permute(1, 2, 0).clamp(0, 1).cpu().numpy() * 255).round().astype(np.uint8)
        a = cv2.resize(alpha, big.shape[1::-1], interpolation=cv2.INTER_CUBIC)
        a = cv2.GaussianBlur(np.clip((a - 0.5) * 3 + 0.5, 0, 1), (0, 0), 0.8)
        out = Image.fromarray(np.dstack([big, (a * 255).astype(np.uint8)]))
        if out.height > cap: out = out.resize((round(out.width * cap / out.height), cap), Image.LANCZOS)
        return out
    if args.cands: os.makedirs(args.cands, exist_ok=True)
    B = Bodies(rgb, kps, inpainter, sam, stem, out=args.cands or None)
    for kv in filter(None, args.palette.split(",")):
        k, p = kv.split("="); B.picks[int(k)] = (p,) + tuple(B.picks.get(int(k), (None, None, None))[1:])
    for kv in filter(None, args.head.split(",")):
        k, s_ = kv.split("="); B.picks[int(k)] = B.picks.get(int(k), (None, None, None))[:2] + (int(s_),)
    ks = [k for k, c in enumerate(L["cards"]) if c.get("cy")] if args.ks == "cy" else [int(k) for k in args.ks.split(",")]
    F = None
    if args.apply:
        fs = open(args.apply).read(); pre = "window.FIGHTERS = "
        assert fs.startswith(pre); F = json.loads(fs[len(pre):fs.rindex("]") + 1])
    for k in ks:
        c = L["cards"][k]; assert c.get("cy"), f"card {k} has a real body"
        x0, y0 = c["x"], c["y"]; box = (x0, y0, x0 + c["w"], y0 + c["h"])
        a = np.asarray(Image.open(io.BytesIO(base64.b64decode(c["img"].split(",", 1)[1]))).convert("RGBA"))[..., 3]
        cut = np.dstack([rgb[y0:box[3], x0:box[2]], a])
        big = upscale(cut[..., :3], cut[..., 3].astype(np.float32) / 255)
        if args.cands:
            d = B.prepare(k, cut, box, big)
            pal = B.palette(k, d); B.used.add(pal)
            pk = B.picks.get(k)
            print(f"k{k}: palette {pal}, outfit {d['outfit']}", flush=True)
            if pk and pk[2] is not None: B.complete_head(d, pk[2])
            with open(f"{args.cands}/log.jsonl", "a") as log:
                for i in range(args.seed0, args.seed0 + args.seeds):
                    fig, info, raw = B.candidate(d, pal, 100 * k + i)
                    open(f"{args.cands}/k{k}_s{100 * k + i}.webp", "wb").write(webp(fig))
                    raw.save(f"{args.cands}/k{k}_s{100 * k + i}_raw.jpg", quality=88)
                    log.write(json.dumps(info) + "\n"); log.flush()
                    print(json.dumps({x: info[x] for x in ("k", "seed", "palette", "dom_hue", "want_hue", "colored", "L", "glow_hue",
                                                           "cyan", "skin", "skin_face", "ok_pal", "ok_skin", "ok_rig", "ok")}), flush=True)
        else:
            fig = B.make(k, cut, box, big)
            if fig is None: print(f"k{k}: no body passed, left as it was"); continue
            if F is not None: F[k] = "data:image/webp;base64," + base64.b64encode(webp(fig)).decode()
    if F is not None:
        open(args.apply, "w").write("window.FIGHTERS = " + json.dumps(F) + ";\n")
        print("wrote", args.apply)
