"""Photo -> interactive pop-up book: depth, per-guest cut-outs, people-free background, fighter-intro portraits.
Runs on a CUDA box (build.sh does the copying):
    python make_layers.py photo.jpg [--scene "what the empty place looks like"] [--plate 0-3]
                          [--name "x,y=Name|Title" ...] [--bodies cyborg|shadow|none]
Writes out/layers.js and out/fighters.js for index.html."""
import os, io, json, base64, argparse, urllib.request
import numpy as np, cv2, torch
from PIL import Image
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument("photo")
ap.add_argument("--scene", default="the same place with nobody in it, empty background, natural light, photo",
                help="describes the people-free background the inpainting should paint")
ap.add_argument("--plate", type=int, default=0, help="which background candidate (out/plate_0..3.jpg) to use")
ap.add_argument("--name", action="append", default=[], help='"x,y=Name|Title", x,y = where the guest stands, as fractions of the photo')
ap.add_argument("--bodies", default="cyborg", choices=["cyborg", "shadow", "none"], help="body for guests hidden from the chest down")
args = ap.parse_args()

SRC, stem = args.photo, os.path.splitext(os.path.basename(args.photo))[0]
os.makedirs("out", exist_ok=True)
img = Image.open(SRC).convert("RGB"); W, H = img.size; rgb = np.asarray(img)

_dm = None
def disparity(im):  # Depth Anything V2: relative disparity, bigger = closer
    global _dm
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation
    if _dm is None:
        n = "depth-anything/Depth-Anything-V2-Large-hf"
        _dm = AutoImageProcessor.from_pretrained(n), AutoModelForDepthEstimation.from_pretrained(n).cuda().eval()
    proc, model = _dm
    with torch.no_grad():
        d = model(**proc(images=im, return_tensors="pt").to("cuda")).predicted_depth
    return torch.nn.functional.interpolate(d[None], (H, W), mode="bicubic")[0, 0].cpu().numpy()

def lama(rgb, mask):  # big-lama TorchScript, the model IOPaint ships
    if not os.path.exists("big-lama.pt"):
        urllib.request.urlretrieve("https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt", "big-lama.pt")
    model = torch.jit.load("big-lama.pt", map_location="cuda").eval()
    ph, pw = -H % 8, -W % 8
    x = torch.from_numpy(np.pad(rgb, ((0, ph), (0, pw), (0, 0)), "reflect")).cuda().permute(2, 0, 1)[None].float() / 255
    m = torch.from_numpy(np.pad(mask, ((0, ph), (0, pw)), "reflect")).cuda()[None, None].float()
    with torch.no_grad():
        out = model(x, m)[0].permute(1, 2, 0)[:H, :W].cpu().numpy()
    return np.clip(out * 255, 0, 255).astype(np.uint8)

_pipe = _sam = _sr = None
def inpainter():
    global _pipe
    if _pipe is None:
        from diffusers import AutoPipelineForInpainting
        _pipe = AutoPipelineForInpainting.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1",
                                                          torch_dtype=torch.float16, variant="fp16").to("cuda")
    return _pipe

def sam():
    global _sam
    if _sam is None:
        from ultralytics import SAM
        _sam = SAM("sam2.1_l.pt")
    return _sam

def sdxl(init, mask):  # LaMa smears big holes; SDXL inpainting repaints them as a believable empty place
    w, h = 1024, round(1024 * H / W / 8) * 8
    outs = []
    for strength in (0.75, 0.95):  # 4 candidates; look at out/plate_*.jpg and rerun with --plate n to pick
        outs += inpainter()(prompt=args.scene,
                            negative_prompt="people, person, crowd, man, woman, child, face, body, legs, clothing, statue, fence, railing, "
                                            "rock, boulder, mound, sand dune, large bush, text, watermark, blurry",
                            image=Image.fromarray(init).resize((w, h)), mask_image=Image.fromarray(mask.astype(np.uint8) * 255).resize((w, h)),
                            width=w, height=h, strength=strength, guidance_scale=7, num_inference_steps=30, num_images_per_prompt=2,
                            generator=torch.Generator("cuda").manual_seed(7)).images
    for i, o in enumerate(outs): o.resize((W // 2, H // 2)).save(f"out/plate_{i}.jpg", quality=85)
    return np.asarray(outs[args.plate].resize((W, H), Image.LANCZOS))

def upscale(crop, alpha, cap=900):  # Real-ESRGAN x4 for the big fighter-intro cut-outs; alpha just resized and re-sharpened
    global _sr
    if _sr is None:
        from spandrel import ModelLoader
        _sr = ModelLoader().load_from_file("RealESRGAN_x4plus.pth").cuda().eval()
    with torch.no_grad():
        y = _sr(torch.from_numpy(np.ascontiguousarray(crop)).cuda().permute(2, 0, 1)[None].float() / 255)
    big = (y[0].permute(1, 2, 0).clamp(0, 1).cpu().numpy() * 255).round().astype(np.uint8)
    a = cv2.resize(alpha, big.shape[1::-1], interpolation=cv2.INTER_CUBIC)
    a = cv2.GaussianBlur(np.clip((a - 0.5) * 3 + 0.5, 0, 1), (0, 0), 0.8)
    out = Image.fromarray(np.dstack([big, (a * 255).astype(np.uint8)]))
    if out.height > cap: out = out.resize((round(out.width * cap / out.height), cap), Image.LANCZOS)
    return out

def ground(hole, fill):  # depth of the people-free picture, scale/shift matched to the original depth outside the hole
    raw = disparity(Image.fromarray(np.where(hole[..., None], fill, rgb)))
    a, b = np.polyfit(raw[~hole], disp[~hole], 1)
    return (a * raw + b).astype(np.float32)

CACHE = f"out/{stem}.stage1.npz"  # ponytail: cached so tuning the later steps doesn't rerun the models
if os.path.exists(CACHE):
    c = np.load(CACHE); disp, masks, kps = c["disp"], c["masks"], c["kps"]
else:
    from ultralytics import YOLO
    disp = disparity(img)
    # big imgsz + low conf: the half-hidden guests in the back rows are small
    det = YOLO("yolo11x-seg.pt").predict(SRC, classes=[0], conf=0.1, imgsz=1920, verbose=False)[0]
    masks = sam().predict(SRC, bboxes=det.boxes.xyxy.tolist(), verbose=False)[0].masks.data.cpu().numpy() > 0.5
    kps = YOLO("yolo11x-pose.pt").predict(SRC, conf=0.1, imgsz=1920, verbose=False)[0].keypoints.data.cpu().numpy()
    np.savez_compressed(CACHE, disp=disp, masks=masks, kps=kps)

# --- people: drop duplicate/part masks, then each pixel goes to the person whose depth matches it best
med = np.array([np.median(disp[m]) if m.any() else 0 for m in masks])
flat = masks[:, ::2, ::2].reshape(len(masks), -1).astype(np.float32)
inter, area = flat @ flat.T, flat.sum(1)
keep = []
for i in np.argsort(-area):  # big first; a mask mostly inside a kept one at the same depth is a duplicate or a part
    if area[i] > 40 and not any(inter[i, j] > 0.6 * area[i] and abs(med[i] - med[j]) < 15 for j in keep):
        keep.append(i)
ms, md = masks[keep], med[keep]
cost = np.where(ms, np.abs(disp[None] - md[:, None, None]), np.inf)
label = np.where(ms.any(0), cost.argmin(0), -1)
for i in range(len(ms)):  # drop stray specks of each person
    n, cc, st, _ = cv2.connectedComponentsWithStats((label == i).astype(np.uint8))
    if n > 1:
        a = st[1:, cv2.CC_STAT_AREA]
        label[np.isin(cc, np.nonzero(a < 0.2 * a.max())[0] + 1)] = -1

# --- foreground hedge: everything clearly nearer than the front row, attached to the bottom edge
fg = ((disp > np.percentile(md, 95) + 20) & (label < 0)).astype(np.uint8)
fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
n, cc, st, _ = cv2.connectedComponentsWithStats(fg)
fg = np.isin(cc, [k for k in range(1, n) if st[k, 1] + st[k, 3] >= H - 2])

# --- strays no mask caught (the bouquet, a pair of legs): anything standing clearly in front of the
#     people-free ground joins the nearest guest at a similar depth
hole = cv2.dilate((masks.any(0) | (label >= 0) | fg).astype(np.uint8), np.ones((31, 31), np.uint8)) > 0
stray = (label < 0) & ~fg & hole & (disp - ground(hole, lama(rgb, hole)) > 12)
gap, (iy, ix) = ndimage.distance_transform_edt(label < 0, return_indices=True)
near = label[iy, ix]
rows = np.broadcast_to(np.arange(H)[:, None], (H, W))
feet = np.zeros(len(ms), int); np.maximum.at(feet, label[label >= 0], rows[label >= 0])
adopt = stray & (gap < 40) & (np.abs(disp - md[near]) < 25) & (rows < feet[near] - 8)  # never the ground below their feet
label[adopt] = near[adopt]

# --- empty place: inpaint everyone (and the hedge) away, then get its depth
hole = cv2.dilate((masks.any(0) | (label >= 0) | fg).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
fill = sdxl(np.where(hole[..., None], lama(rgb, hole), rgb), hole)
soft = cv2.GaussianBlur(cv2.dilate(hole.astype(np.float32), np.ones((5, 5), np.uint8)), (0, 0), 2)[..., None]
plate = (fill * soft + rgb * (1 - soft)).astype(np.uint8)
bgd = cv2.GaussianBlur(ground(hole, plate), (0, 0), 2)
f = fg.astype(np.float32)  # hedge depth: masked blur so it doesn't pick up the people behind it
fgd = cv2.GaussianBlur(disp * f, (0, 0), 4) / np.maximum(cv2.GaussianBlur(f, (0, 0), 4), 1e-3)
fgd = np.where(f > 0, fgd, bgd)

# --- bodies for guests hidden from the chest down: complete their skeleton, draw a mannequin in that pose,
#     let SDXL paint it (cyborg) or just shade it (shadow), always under their real face
def skeleton(m, width):  # joints YOLO-pose sees on this cut-out, the hidden ones filled in as a relaxed standing pose
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
    return J, sw, 11 not in P and 12 not in P, head

def body(hi, box, J, sw, seed):
    x0, y0, x1, y1 = box
    Wc, Hc = 832, 1216
    s = .9 * Hc / (max(J["la"][1], J["ra"][1]) + .25 * sw - y0)  # source px -> canvas px, whole figure fits
    cx = (J["ls"][0] + J["rs"][0]) / 2
    pt = lambda p: (int(round((p[0] - cx) * s + Wc / 2)), int(round((p[1] - y0) * s + .05 * Hc)))
    th = lambda f: max(2, int(f * sw * s))
    shape = np.zeros((Hc, Wc), np.uint8)
    cv2.fillConvexPoly(shape, np.array([pt(J[k]) for k in ("ls", "rs", "rh", "lh")], np.int32), 255, cv2.LINE_AA)
    for a, b, f in [("ls", "le", .28), ("le", "lw", .22), ("rs", "re", .28), ("re", "rw", .22), ("lh", "rh", .5),
                    ("lh", "lk", .38), ("lk", "la", .3), ("rh", "rk", .38), ("rk", "ra", .3)]:
        cv2.line(shape, pt(J[a]), pt(J[b]), 255, th(f), cv2.LINE_AA)
    for k in ("lw", "rw"): cv2.circle(shape, pt(J[k]), th(.13), 255, -1, cv2.LINE_AA)
    for k in ("la", "ra"): cv2.ellipse(shape, pt(J[k] + [0, .08 * sw]), (th(.2), th(.09)), 0, 0, 360, 255, -1, cv2.LINE_AA)
    layer = Image.new("RGBA", (Wc, Hc))
    layer.paste(hi.resize((max(1, round((x1 - x0) * s)), max(1, round((y1 - y0) * s))), Image.LANCZOS), pt((x0, y0)))
    real = np.asarray(layer).astype(np.float32) / 255; va = real[..., 3:]
    shape = shape.astype(np.float32) / 255
    shadow = lambda: (np.full((Hc, Wc, 3), (.1, .1, .16), np.float32),  # dark silhouette fading toward the feet, no AI needed
                      np.maximum(cv2.GaussianBlur(shape, (0, 0), max(2, .08 * sw * s)) * np.linspace(1, .35, Hc)[:, None], va[..., 0]))
    if args.bodies == "shadow":
        gen, alpha = shadow()
    else:
        init = np.full((Hc, Wc, 3), .8, np.float32); init[shape > .5] = (.35, .37, .42)  # grey mannequin steers the pose
        init = real[..., :3] * va + init * (1 - va)
        keep = cv2.erode((va[..., 0] > .8).astype(np.uint8), np.ones((5, 5), np.uint8))
        # real guests' faces: keep it a bulky, fully covering suit (an unguarded "cyborg body" prompt drifts to skimpy outfits)
        painted = (shape > .5) & (va[..., 0] < .1)
        tries = []
        for attempt in range(4):  # reroll a body that shows skin or came out as a flat blob
            out = inpainter()(prompt="full-length photo of a person wearing a bulky full-body robotic mech armor suit that covers everything from the neck "
                                     "down to the feet, thick steel and chrome plates, glowing blue joints, standing, plain light grey studio background",
                              negative_prompt="skin, bare skin, bare legs, bare arms, cleavage, bikini, swimsuit, lingerie, leotard, corset, nude, sexy, "
                                              "revealing, extra head, two heads, extra arms, extra legs, deformed, cropped, text, watermark, scenery, other people",
                              image=Image.fromarray((init * 255).astype(np.uint8)), mask_image=Image.fromarray((1 - keep) * 255),
                              width=Wc, height=Hc, strength=.85, guidance_scale=7, num_inference_steps=30,
                              generator=torch.Generator("cuda").manual_seed(seed + 1000 * attempt)).images[0]
            ycc = cv2.cvtColor(np.asarray(out), cv2.COLOR_RGB2YCrCb)[painted]
            skin = np.mean((ycc[:, 1] > 135) & (ycc[:, 1] < 180) & (ycc[:, 2] > 85) & (ycc[:, 2] < 135))
            flat = ycc[:, 0].std() < 18
            tries.append((skin + flat, out))
            if skin < .03 and not flat: break
        score, out = min(tries, key=lambda t: t[0])
        print(f"guest {seed}: {len(tries)} tries, {'ok' if score < .03 else 'still off -> shadow body'}")
        if score >= .03:
            gen, alpha = shadow()
        else:
            gen = np.asarray(out).astype(np.float32) / 255
            region = cv2.dilate(np.maximum(shape, va[..., 0]), np.ones((th(.5), th(.5)), np.uint8)) > .5
            ys_, xs_ = np.nonzero(region)
            r = sam().predict(out, bboxes=[[xs_.min(), ys_.min(), xs_.max(), ys_.max()]], verbose=False)[0].masks
            fig = (r.data[0].cpu().numpy() > .5) & region if r is not None else region
            alpha = np.maximum(cv2.GaussianBlur(fig.astype(np.float32), (0, 0), 1), va[..., 0])
    rgb_ = real[..., :3] * va + gen * (1 - va)
    ys_, xs_ = np.nonzero(alpha > .1)  # low threshold: a fading shadow body still counts down to its feet
    fig = Image.fromarray((np.dstack([rgb_, alpha]) * 255).astype(np.uint8)).crop((xs_.min(), ys_.min(), xs_.max() + 1, ys_.max() + 1))
    return fig.resize((round(fig.width * 900 / fig.height), 900), Image.LANCZOS) if fig.height > 900 else fig

lo, hi = np.percentile(bgd, 0.5), np.percentile(disp, 99.5)
norm = lambda v: np.clip((v - lo) / (hi - lo), 0, 1)

def uri(arr, fmt, **kw):
    buf = io.BytesIO(); Image.fromarray(arr).save(buf, fmt, **kw)
    return f"data:image/{fmt.lower()};base64," + base64.b64encode(buf.getvalue()).decode()

def rgba(mask):
    a = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 0.6)  # anti-alias the cut
    return np.dstack([rgb, (a * 255).astype(np.uint8)])

def depth_png(d):
    return uri((cv2.resize(norm(d), (W // 4, H // 4), interpolation=cv2.INTER_AREA) * 255).astype(np.uint8), "PNG")

PAD = 10  # room for the paper edge + shadow
cards = []
for i in range(len(ms)):
    m = label == i
    if m.sum() < 150: continue
    ys, xs = np.nonzero(m)
    x0, y0, x1, y1 = max(xs.min() - PAD, 0), max(ys.min() - PAD, 0), min(xs.max() + PAD + 1, W), min(ys.max() + PAD + 1, H)
    cut = rgba(m)[y0:y1, x0:x1]
    big = upscale(cut[..., :3], cut[..., 3].astype(np.float32) / 255)
    sk = skeleton(m, xs.max() - xs.min()) if args.bodies != "none" else None
    cy = sk is not None and sk[2] and ys.max() < (sk[0]["ls"][1] + sk[0]["rs"][1]) / 2 + 2.2 * sk[1]  # hips hidden, little below the chest
    # whole enough to stand on the brawl floor: a generated body, or real hips with some thigh below them
    full = cy or (sk is not None and sk[3] and not sk[2] and ys.max() > max(sk[0]["lh"][1], sk[0]["rh"][1]) + .8 * sk[1])
    cards.append(dict(x=int(x0), y=int(y0), w=int(x1 - x0), h=int(y1 - y0), d=round(float(norm(np.median(disp[m]))), 4),
                      img=uri(cut, "WEBP", quality=88, alpha_quality=100, method=6, exact=True),
                      big=body(big, (x0, y0, x1, y1), *sk[:2], seed=i) if cy else big,
                      **({"cy": 1} if cy else {}), **({"full": 1} if full else {})))
cards.sort(key=lambda c: c["d"])  # far -> near = paint order
# big portraits for the fighter intro, as data: URIs in their own script (artifact viewers refuse plain image files)
fighters = [uri(np.asarray(c.pop("big")), "WEBP", quality=82, alpha_quality=90, method=6) for c in cards]
open("out/fighters.js", "w").write("window.FIGHTERS = " + json.dumps(fighters) + ";\n")

names = []
for s in args.name:
    pos, _, who = s.partition("="); name, _, title = who.partition("|")
    names.append(dict(zip("xy", map(float, pos.split(","))), name=name.strip(), title=title.strip()))
L = dict(W=W, H=H, bg=uri(plate, "JPEG", quality=90), bgDepth=depth_png(bgd), names=names, bodies=args.bodies,
         fg=uri(rgba(fg), "WEBP", quality=88, alpha_quality=100, method=6, exact=True), fgDepth=depth_png(fgd), cards=cards)
open("out/layers.js", "w").write("window.LAYERS = " + json.dumps(L) + ";\n")
print(f"{len(cards)} guests ({sum('cy' in c for c in cards)} given {args.bodies} bodies), layers.js {os.path.getsize('out/layers.js') / 1e6:.1f} MB")

# debug views
cols = np.random.default_rng(1).integers(60, 255, (len(ms) + 1, 3))
vis = rgb.copy(); m = label >= 0
vis[m] = (0.4 * rgb[m] + 0.6 * cols[label[m]]).astype(np.uint8)
vis[fg] = (0.5 * rgb[fg] + [0, 120, 255]).clip(0, 255).astype(np.uint8)
vis[adopt] = [255, 0, 255]
vis[stray & ~adopt] = [0, 255, 255]
Image.fromarray(vis).save("out/debug_layers.jpg", quality=90)
Image.fromarray(plate).save("out/debug_plate.jpg", quality=90)
