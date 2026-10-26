"""Depth maps for the hero's depth parallax layer.

Usage: python -I tools/depth.py <model.onnx> <out_dir> <images...>

Runs Depth Anything V2 small (ONNX) on each image and writes <out_dir>/<stem>-depth.png: grayscale, near = light,
far = dark, at the image's aspect with a 1024 px long side. Needs Pillow, numpy and onnxruntime (Anaconda python).
"""

import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter

SIDE = 518  # the model's training resolution (a multiple of its 14 px patch)
LONG_SIDE = 1024
MAX_BYTES = 200_000
BLUR = 6  # px at LONG_SIDE
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def depth_map(session: ort.InferenceSession, image: Image.Image) -> Image.Image:
    rgb = np.asarray(image.convert("RGB").resize((SIDE, SIDE), Image.BICUBIC), dtype=np.float32) / 255
    pixels = ((rgb - MEAN) / STD).transpose(2, 0, 1)[None]
    (depth,) = session.run(None, {"pixel_values": pixels})
    depth = depth[0]
    # The model predicts relative inverse depth: larger is nearer, so a min-max stretch gives near = light.
    span = float(depth.max() - depth.min()) or 1.0
    gray = ((depth - depth.min()) / span * 255).round().astype(np.uint8)
    scale = LONG_SIDE / max(image.size)
    size = (round(image.width * scale), round(image.height * scale))
    # Hard depth edges tear the photo when the layer shifts it; a soft blur turns the tear into a gentle stretch.
    return Image.fromarray(gray, "L").resize(size, Image.BICUBIC).filter(ImageFilter.GaussianBlur(BLUR))


def main(args: list[str]) -> None:
    if len(args) < 3:
        sys.exit(__doc__)
    model, out_dir, *images = args
    session = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for path in map(Path, images):
        target = out / f"{path.stem}-depth.png"
        with Image.open(path) as image:
            depth_map(session, image).save(target, optimize=True)
        size = target.stat().st_size
        print(f"{target} {size} bytes")
        if size > MAX_BYTES:
            print(f"warning: {target.name} is over {MAX_BYTES} bytes", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1:])
