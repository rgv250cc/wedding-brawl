"""The wedding photographer for the brawl. From a real photo: `python make_photographer.py his_photo.jpg` (cuts out the
person and whatever they hold, writes photog.js). Without one, a stand-in: SDXL draws 6 candidates on a
plain background, SAM cuts each one out. Writes out/photog_0..3.png; `python make_photographer.py N` writes photog.js
(window.PHOTOG = data: URI) from candidate N."""
import sys, os, io, base64, json
import numpy as np, torch
from PIL import Image
from ultralytics import SAM

def cutout(im):  # RGB PIL -> tight RGBA cut-out of the biggest person and whatever they hold, <= 900 px tall (None if nobody)
    from ultralytics import YOLO
    r = YOLO("yolo11x-seg.pt").predict(im, conf=.25, verbose=False)[0]
    found = [(b, int(c)) for b, c in zip(r.boxes.xyxy.tolist(), r.boxes.cls.tolist())]
    people = [b for b, c in found if c == 0]
    if not people: return None
    box = max(people, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))  # find the person first, then cut just that box
    inside = lambda b: max(0, min(b[2], box[2]) - max(b[0], box[0])) * max(0, min(b[3], box[3]) - max(b[1], box[1])) > .5 * (b[2] - b[0]) * (b[3] - b[1])
    held = [b for b, c in found if c != 0 and inside(b)]  # a camera, a glass: mostly overlapping the person, so it's in their hands
    masks = SAM("sam2.1_l.pt").predict(im, bboxes=[box] + held, verbose=False)[0].masks.data.cpu().numpy() > .5
    m = masks.any(0)
    ys, xs = np.nonzero(m)
    fig = Image.fromarray(np.dstack([np.asarray(im), m.astype(np.uint8) * 255])).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    return fig.resize((round(fig.width * 900 / fig.height), 900), Image.LANCZOS) if fig.height > 900 else fig

def save_js(fig):
    buf = io.BytesIO(); fig.save(buf, "WEBP", quality=85, alpha_quality=90, method=6)
    open("photog.js", "w").write("window.PHOTOG = " + json.dumps("data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()) + ";\n")

arg = sys.argv[1] if len(sys.argv) > 1 else None
if arg and os.path.exists(arg):          # a real photo of the photographer
    fig = cutout(Image.open(arg).convert("RGB")); os.makedirs("out", exist_ok=True); fig.save("out/photog_real.png"); save_js(fig)
elif arg:                                # pick one of the generated candidates
    save_js(Image.open(f"out/photog_{int(arg)}.png"))
else:
    from diffusers import AutoPipelineForInpainting
    pipe = AutoPipelineForInpainting.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1", torch_dtype=torch.float16, variant="fp16").to("cuda")
    W, H = 832, 1216
    imgs = pipe(prompt="studio photo, full body portrait of a cheerful wedding photographer standing in the center, a bearded man in a black vest, "
                       "white shirt, dark jeans and sneakers, holding a big DSLR camera with a flash in both hands at chest height, "
                       "looking at the viewer, entire body from head to shoes in frame, plain light grey seamless backdrop",
                negative_prompt="tripod, empty room, cropped, out of frame, extra arms, extra legs, deformed, text, watermark, crowd, scenery, furniture",
                image=Image.new("RGB", (W, H), (200, 200, 200)), mask_image=Image.new("L", (W, H), 255), width=W, height=H, strength=.99,
                guidance_scale=7.5, num_inference_steps=40, num_images_per_prompt=6, generator=torch.Generator("cuda").manual_seed(21)).images
    os.makedirs("out", exist_ok=True)
    for i, im in enumerate(imgs):
        im.save(f"out/photog_raw_{i}.jpg", quality=85)
        fig = cutout(im)
        if fig: fig.save(f"out/photog_{i}.png")
    print("candidates: out/photog_*.png")
