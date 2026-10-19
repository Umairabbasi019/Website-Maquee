"""Build a labelled thumbnail grid of every image in a folder: contact_sheet.py <folder> <out.jpg>"""
import os, sys
from PIL import Image, ImageDraw

src, out = sys.argv[1], sys.argv[2]
files = sorted(f for f in os.listdir(src) if f.lower().endswith(('jpg', 'jpeg', 'png', 'webp')))
W, H, cols = 300, 220, 6
sheet = Image.new('RGB', (cols * W, ((len(files) + cols - 1) // cols) * H), 'white')
draw = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(os.path.join(src, f)).convert('RGB')
    im.thumbnail((W - 6, H - 24))
    x, y = (i % cols) * W, (i // cols) * H
    sheet.paste(im, (x + 3, y + 3))
    draw.text((x + 3, y + H - 18), f'{i + 1}. {f[:38]}', fill='black')
sheet.save(out, quality=82)
print(len(files), 'images ->', out)
