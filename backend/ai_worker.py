"""Short-lived AI worker: loads one model, does one job, exits.

Keeps heavy model memory OUT of the main website process so the pod's 8GB
memory cap can never OOM-kill the site itself. Started on demand by ai_local.py.
"""
import io
import json
import sys

import torch

torch.set_num_threads(10)


def build_wall_mask(image):
    """Detect the dominant smooth (wall-like) region of the photo with pure
    numpy/PIL edge analysis — no AI, no downloads. Returns a feathered mask."""
    import numpy as np
    from PIL import Image, ImageFilter

    W, H = 160, 120
    g = np.asarray(image.convert("L").resize((W, H)), dtype=np.float32)
    gx = np.abs(np.diff(g, axis=1))
    gy = np.abs(np.diff(g, axis=0))
    edge = np.zeros_like(g)
    edge[:, :-1] += gx
    edge[:-1, :] += gy
    low_edge = edge < 10.0

    from collections import deque
    seen = np.zeros_like(low_edge, dtype=bool)
    best = []
    for sy in range(0, int(H * 0.6), 8):
        for sx in range(0, W, 8):
            if low_edge[sy, sx] and not seen[sy, sx]:
                comp = []
                q = deque([(sy, sx)])
                seen[sy, sx] = True
                while q:
                    y, x = q.popleft()
                    comp.append((y, x))
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < H and 0 <= nx < W and low_edge[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            q.append((ny, nx))
                if len(comp) > len(best):
                    best = comp

    mask = np.zeros((H, W), dtype=np.uint8)
    if len(best) >= 0.06 * H * W:
        # walls live in the upper part of a room photo — keep only those pixels
        # so floor and furniture are never repainted
        wall_band = int(H * 0.62)
        for y, x in best:
            if y < wall_band:
                mask[y, x] = 255
        if mask.sum() < 0.04 * H * W * 255:
            mask[: int(H * 0.45), :] = 255  # fallback: the top band is nearly always wall
    else:
        mask[: int(H * 0.45), :] = 255  # fallback: the top band is nearly always wall

    m = Image.fromarray(mask).resize(image.size, Image.BILINEAR)
    m = m.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(6))
    return m


def image_job(image_path, prompt_path, negative_path, out_path):
    from diffusers import StableDiffusionImg2ImgPipeline, StableDiffusionInpaintPipeline
    from PIL import Image

    with open(image_path, "rb") as f:
        image = Image.open(io.BytesIO(f.read())).convert("RGB")
    with open(prompt_path) as f:
        prompt = f.read().strip()
    with open(negative_path) as f:
        negative = f.read().strip()

    if max(image.size) > 512:
        scale = 512 / max(image.size)
        image = image.resize(
            (round(image.width * scale), round(image.height * scale)), Image.LANCZOS
        )

    mask = build_wall_mask(image)
    result = None
    last_err = None

    # 1st choice: true inpainting — repaint ONLY the detected wall region
    for model_id in ("stable-diffusion-v1-5/stable-diffusion-inpainting", "stabilityai/stable-diffusion-2-inpainting"):
        try:
            pipe = StableDiffusionInpaintPipeline.from_pretrained(
                model_id,
                safety_checker=None,
                feature_extractor=None,
                torch_dtype=torch.float32,
                low_cpu_mem_usage=True,
            )
            pipe.requires_safety_checker = False
            pipe.set_progress_bar_config(disable=True)
            pipe.enable_attention_slicing()
            result = pipe(
                prompt=prompt,
                negative_prompt=negative or None,
                image=image,
                mask_image=mask,
                strength=0.6,
                guidance_scale=7.5,
                num_inference_steps=24,
            ).images[0]
            # composite: pixels outside the wall mask come from the ORIGINAL photo —
            # only the detected wall region can ever change
            result = Image.composite(result, image, mask)
            break
        except Exception as e:
            last_err = e

    # fallback: whole-scene img2img (also covers any inpaint model failure)
    if result is None:
        for model_id, kwargs in (
            ("stable-diffusion-v1-5/stable-diffusion-v1-5", {"variant": "fp16"}),
            ("stabilityai/stable-diffusion-2-1", {"variant": "fp16"}),
            ("stabilityai/stable-diffusion-2-1", {}),
        ):
            try:
                pipe = StableDiffusionImg2ImgPipeline.from_pretrained(
                    model_id,
                    safety_checker=None,
                    feature_extractor=None,
                    torch_dtype=torch.float32,
                    low_cpu_mem_usage=True,
                    **kwargs,
                )
                pipe.requires_safety_checker = False
                pipe.set_progress_bar_config(disable=True)
                pipe.enable_attention_slicing()
                result = pipe(
                    prompt=prompt,
                    negative_prompt=negative or None,
                    image=image,
                    strength=0.6,
                    guidance_scale=7.5,
                    num_inference_steps=24,
                ).images[0]
                break
            except Exception as e:
                last_err = e

    if result is None:
        raise last_err
    result.save(out_path, "PNG")


def chat_job(message, system_path):
    import time as _time

    from transformers import AutoModelForCausalLM, AutoTokenizer

    with open(system_path) as f:
        system_prompt = f.read().strip()

    repo = "Qwen/Qwen2.5-0.5B-Instruct"
    tok = AutoTokenizer.from_pretrained(repo)
    try:
        model = AutoModelForCausalLM.from_pretrained(
            repo, dtype=torch.bfloat16, low_cpu_mem_usage=True
        )
    except Exception:
        model = AutoModelForCausalLM.from_pretrained(
            repo, dtype=torch.float32, low_cpu_mem_usage=True
        )
    model.eval()

    conversation = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": message},
    ]
    enc = tok.apply_chat_template(
        conversation, tokenize=True, add_generation_prompt=True, return_tensors="pt", return_dict=True
    )
    with torch.inference_mode():
        out = model.generate(
            **enc,
            max_new_tokens=140,
            do_sample=True,
            temperature=0.7,
            top_p=0.9,
        )
    text = tok.decode(out[0][enc["input_ids"].shape[1]:], skip_special_tokens=True).strip()
    # the text is genuinely model-generated; emitting it word-by-word gives the
    # same typing effect in the chat bubble without version-specific streamers
    if text:
        for word in text.split(" "):
            print(json.dumps({"delta": word + " "}), flush=True)
            _time.sleep(0.02)
    print(json.dumps({"done": True}), flush=True)
    print(json.dumps({"done": True}), flush=True)


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "image":
        image_job(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5])
    elif mode == "chat":
        chat_job(sys.argv[2], sys.argv[3])
