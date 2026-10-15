"""Joints for every fighter portrait, for the puppet animation in brawl.js. Runs YOLO-pose on each portrait in
fighters.js (and on the photographer, if photog.js is next to it) and writes rigs.js:
window.RIGS = [17 COCO keypoints [x, y, confidence] as fractions of the portrait, or null], window.PHOTOG_RIG = [...].
Usage (CUDA box, venv from make_layers.py): python make_rigs.py fighters.js [photog.js]"""
import sys, json, base64, io, os
import numpy as np
from PIL import Image
from ultralytics import YOLO

model = YOLO("yolo11x-pose.pt")

def uris(path):
    src = open(path).read()
    return json.loads(src[src.index("["):src.rindex("]") + 1]) if src.lstrip().startswith("window.FIGHTERS") else [json.loads(src[src.index('"'):src.rindex('"') + 1])]

def rig(uri):  # the biggest person in the portrait -> keypoints as fractions, or None
    im = Image.open(io.BytesIO(base64.b64decode(uri.split(",", 1)[1]))).convert("RGBA")
    flat = Image.new("RGB", im.size, (128, 128, 128)); flat.paste(im, (0, 0), im)
    r = model.predict(np.asarray(flat)[..., ::-1], conf=.15, imgsz=960, verbose=False)[0]
    if r.keypoints is None or not len(r.keypoints.data): return None
    boxes = r.boxes.xyxy.cpu().numpy()
    i = int(np.argmax((boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])))
    return [[round(float(x) / im.width, 4), round(float(y) / im.height, 4), round(float(c), 2)] for x, y, c in r.keypoints.data[i].cpu().numpy()]

rigs = [rig(u) for u in uris(sys.argv[1])]
js = "window.RIGS = " + json.dumps(rigs) + ";\n"
if len(sys.argv) > 2 and os.path.exists(sys.argv[2]): js += "window.PHOTOG_RIG = " + json.dumps(rig(uris(sys.argv[2])[0])) + ";\n"
open("rigs.js", "w").write(js)
print(sum(r is not None for r in rigs), "of", len(rigs), "portraits rigged")
