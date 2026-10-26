"""Generate the placeholder demo-venue images: soft gradients with an arch or circle.

Run: python tools/make_demo_images.py   (needs Pillow)
Writes <key>-s.jpg (1280 px long side) and <key>-m.jpg (1920 px) to scripts/seed-data/demo-media/.
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "scripts" / "seed-data" / "demo-media"
SIZES = {"s": 1280, "m": 1920}

# key -> (aspect w/h, top colour, bottom colour, shape)
IMAGES = {
    "demo-front": (1.6, (52, 46, 86), (214, 150, 120), "arch"),
    "demo-hall": (1.6, (30, 52, 78), (120, 170, 190), "circle"),
    "demo-room-1": (1.5, (70, 40, 60), (220, 170, 150), "arch"),
    "demo-room-2": (1.5, (28, 58, 70), (150, 196, 180), "circle"),
    "demo-room-3": (1.5, (80, 60, 40), (226, 196, 140), "arch"),
    "demo-stage": (1.6, (60, 30, 50), (200, 110, 120), "arch"),
    "demo-tile-1": (0.8, (44, 60, 90), (170, 190, 220), "circle"),
    "demo-tile-2": (1.6, (90, 50, 50), (230, 170, 140), "arch"),
    "demo-tile-3": (0.67, (40, 70, 60), (160, 210, 180), "arch"),
    "demo-tile-4": (1.5, (70, 50, 90), (200, 170, 220), "circle"),
    "demo-tile-5": (0.8, (86, 66, 40), (230, 200, 150), "circle"),
    "demo-tile-6": (1.6, (36, 56, 84), (150, 190, 214), "arch"),
}


def render(aspect, top, bottom, shape, long_side):
    w, h = (long_side, round(long_side / aspect)) if aspect >= 1 else (round(long_side * aspect), long_side)
    img = Image.new("RGB", (w, h))
    px = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        px.line([(0, y), (w, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))
    light = tuple(min(255, round(c + (255 - c) * 0.35)) for c in bottom)
    if shape == "arch":
        aw, ah = w * 0.34, h * 0.62
        x0, y1 = (w - aw) / 2, h * 0.9
        px.rectangle([x0, y1 - ah + aw / 2, x0 + aw, y1], fill=light)
        px.pieslice([x0, y1 - ah, x0 + aw, y1 - ah + aw], 180, 360, fill=light)
    else:
        r = min(w, h) * 0.22
        cx, cy = w / 2, h * 0.45
        px.ellipse([cx - r, cy - r, cx + r, cy + r], fill=light)
    return img


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for key, (aspect, top, bottom, shape) in IMAGES.items():
        for size, long_side in SIZES.items():
            render(aspect, top, bottom, shape, long_side).save(OUT / f"{key}-{size}.jpg", quality=80, optimize=True)
    print(f"wrote {len(IMAGES) * len(SIZES)} images to {OUT}")
