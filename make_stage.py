"""A fight scene from a photo of the venue: everyone in it is found (YOLO11-seg) and painted out (LaMa), and the picture is
added to stages.js as window.STAGES = [{ name, img: data URI, floor: [back, front], tall: [back, front] }]. floor = where
the walkable ground starts and ends, tall = a person's height there, both as fractions of the picture's height.
Usage (CUDA box, venv from make_layers.py): python make_stage.py photo.jpg --name garden --floor .68,.985 --tall .1,.44
Running it again with the same --name replaces that scene; out/stage_<name>.jpg is the cleaned picture to check."""
import argparse, base64, io, json, os, re
import numpy as np, torch
from PIL import Image, ImageFilter
from ultralytics import YOLO

ap = argparse.ArgumentParser()
ap.add_argument("photo"); ap.add_argument("--name", required=True)
ap.add_argument("--floor", default=".6,.98"); ap.add_argument("--tall", default=".14,.44")
a = ap.parse_args()
im = Image.open(a.photo).convert("RGB")
if im.width > 1600: im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
rgb = np.asarray(im)
r = YOLO("yolo11x-seg.pt").predict(im, classes=[0], conf=.2, imgsz=1280, retina_masks=True, verbose=False)[0]
mask = np.zeros(rgb.shape[:2], bool)
if r.masks is not None:
    for m in r.masks.data.cpu().numpy(): mask |= m > .5
grown = Image.fromarray(mask.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(25))  # take the edges and shadows too
grown = (np.asarray(grown.transform(grown.size, Image.AFFINE, (1, 0, 0, 0, 1, -6))) > 0) | (np.asarray(grown) > 0)  # and a little below the feet
H, W = mask.shape
model = torch.jit.load("big-lama.pt", map_location="cuda").eval()
ph, pw = -H % 8, -W % 8
x = torch.from_numpy(np.pad(rgb, ((0, ph), (0, pw), (0, 0)), "reflect")).cuda().permute(2, 0, 1)[None].float() / 255
m = torch.from_numpy(np.pad(grown, ((0, ph), (0, pw)), "reflect")).cuda()[None, None].float()
with torch.no_grad(): out = model(x, m)[0].permute(1, 2, 0)[:H, :W].cpu().numpy()
clean = Image.fromarray(np.clip(out * 255, 0, 255).astype(np.uint8))
os.makedirs("out", exist_ok=True); clean.save(f"out/stage_{a.name}.jpg", quality=90)
buf = io.BytesIO(); clean.save(buf, "WEBP", quality=82, method=6)
stage = { "name": a.name, "img": "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode(),
          "floor": [float(v) for v in a.floor.split(",")], "tall": [float(v) for v in a.tall.split(",")] }
stages = []
if os.path.exists("stages.js"):
    src = open("stages.js").read(); stages = json.loads(src[src.index("["):src.rindex("]") + 1])
stages = [s for s in stages if s["name"] != a.name] + [stage]
open("stages.js", "w").write("window.STAGES = " + json.dumps(stages) + ";\n")
print(f"{a.name}: {int(mask.sum())} px of people painted out; stages.js has", [s["name"] for s in stages])
