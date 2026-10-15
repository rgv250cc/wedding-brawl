"""One-off backdrop for the brawl: an empty wedding ballroom, 4 candidates -> out/ballroom_0..3.jpg (pick one, see build notes)."""
import torch
from PIL import Image
from diffusers import AutoPipelineForInpainting

pipe = AutoPipelineForInpainting.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1",
                                                 torch_dtype=torch.float16, variant="fp16").to("cuda")
W, H = 1216, 832  # same 1.46 shape as the stage
imgs = pipe(prompt="empty elegant wedding reception ballroom, wide polished wooden dance floor filling the lower half of the picture, "
                   "crystal chandeliers, warm fairy lights, round banquet tables with white tablecloths along the walls, "
                   "wide shot from slightly above eye level, nobody there, photo",
            negative_prompt="people, person, crowd, text, watermark, blurry, distorted",
            image=Image.new("RGB", (W, H), (128, 128, 128)), mask_image=Image.new("L", (W, H), 255),  # full mask = draw from scratch
            width=W, height=H, strength=0.99, guidance_scale=7, num_inference_steps=35, num_images_per_prompt=4,
            generator=torch.Generator("cuda").manual_seed(11)).images
for i, im in enumerate(imgs): im.save(f"out/ballroom_{i}.jpg", quality=88)
