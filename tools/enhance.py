"""Cinematic grade for venue photos: upscale, local contrast, warm tone curve, edge falloff into page colour.

Usage: python tools/enhance.py <out_dir> <image> [<image> ...]
Writes one file per device size for each input: e-<name>-s.jpg (phones), e-<name>.jpg (laptops), e-<name>-l.jpg (large/retina).
Feed Real-ESRGAN output (realesrgan-x4plus) as the input; Lanczos only fits the graded result to each size.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from skimage import color, exposure

PAGE_BG = np.array([11, 4, 5]) / 255  # --ink in the mockup; edges fall off to this
# suffix -> (min width, min height); the page picks by screen width x pixel ratio.
# min height keeps wide panoramas sharp under background-size:cover on 16:10 laptops and tall phones
SIZES = {"-s": (1280, 1400), "": (2400, 1500), "-l": (3200, 2000)}


def target_width(img: Image.Image, size: tuple[int, int]) -> int:
    min_w, min_h = size
    return max(min_w, round(min_h * img.width / img.height))


def fit(img: Image.Image, width: int) -> Image.Image:
    return img if img.width == width else img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)


def grade(img: Image.Image) -> Image.Image:
    img = fit(img, target_width(img, SIZES["-l"]))
    rgb = np.asarray(img.convert("RGB")).astype(np.float64) / 255

    # local contrast on lightness only, blended so it does not look HDR
    lab = color.rgb2lab(rgb)
    L = lab[..., 0] / 100
    lab[..., 0] = (0.55 * exposure.equalize_adapthist(L, clip_limit=0.012) + 0.45 * L) * 100
    rgb = np.clip(color.lab2rgb(lab), 0, 1)

    # tone curve: crush blacks, soft S, keep highlights
    rgb = np.clip((rgb - 0.04) / 0.96, 0, 1) ** 1.18
    rgb = rgb + 0.22 * rgb * (1 - rgb) * (rgb - 0.5) * 4

    # split tone: warm amber highlights, maroon-black shadows
    lum = (rgb @ [0.2126, 0.7152, 0.0722])[..., None]
    rgb = rgb * (1 + lum * np.array([0.06, 0.01, -0.09]))
    rgb = rgb * (1 - lum) * (1 + np.array([0.04, -0.03, -0.04])) + rgb * lum

    # gentle desaturation toward luminance
    rgb = lum + (rgb - lum) * 0.88

    # edge falloff into page background so the photo melts into the page
    h, w = rgb.shape[:2]
    y, x = np.ogrid[-1:1:h * 1j, -1:1:w * 1j]
    r = np.sqrt((x * 0.85) ** 2 + (y * 1.0) ** 2)
    fall = np.clip((r - 0.55) / 0.75, 0, 1)[..., None] ** 1.6
    rgb = rgb * (1 - fall) + PAGE_BG * fall

    out = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8))
    return out


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    out_dir = Path(sys.argv[1])
    out_dir.mkdir(parents=True, exist_ok=True)
    for src in map(Path, sys.argv[2:]):
        graded = grade(Image.open(src))
        for suffix, size in SIZES.items():
            width = target_width(graded, size)
            # sharpen after resizing so each size gets crisp edges at its own scale
            out = fit(graded, width).filter(ImageFilter.UnsharpMask(radius=1.2 * width / 1280, percent=75, threshold=2))
            dst = out_dir / f"e-{src.stem}{suffix}.jpg"
            out.save(dst, quality=86, optimize=True, progressive=True)
            print(dst)


if __name__ == "__main__":
    main()
