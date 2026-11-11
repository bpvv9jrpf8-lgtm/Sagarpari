#!/usr/bin/env python3
"""Make a small .og.jpg copy of big cover images for Facebook/WhatsApp link previews.

WhatsApp and Facebook often show no preview picture when the image is a 0.5–1.9 MB PNG.
For every cover bigger than 300 KB this writes <name>.og.jpg (1200 px wide, ~100 KB).
build.js uses it automatically for og:image / twitter:image when it exists; the page
itself keeps using the .webp / .png.

Usage:  python3 tools/make-share.py           (only new/changed images)
        python3 tools/make-share.py --all     (redo every image)
Needs Pillow (pip install pillow).
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "static" / "images"
LIMIT = 300 * 1024
redo_all = "--all" in sys.argv

made = 0
for src in sorted(IMAGES.glob("*")):
    if src.suffix.lower() not in (".png", ".jpg", ".jpeg") or src.name.endswith(".og.jpg"):
        continue
    if src.stat().st_size <= LIMIT:
        continue
    out = src.with_name(src.stem + ".og.jpg")
    if out.exists() and not redo_all and out.stat().st_mtime >= src.stat().st_mtime:
        continue
    with Image.open(src) as im:
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            bg = Image.new("RGB", im.size, (232, 238, 245))  # house background #e8eef5
            bg.paste(im, mask=im.split()[-1])
            im = bg
        else:
            im = im.convert("RGB")
        if im.width > 1200:
            im = im.resize((1200, round(im.height * 1200 / im.width)), Image.LANCZOS)
        im.save(out, "JPEG", quality=82, optimize=True, progressive=True)
    made += 1
    print(f"{src.name}: {src.stat().st_size // 1024} KB -> {out.stat().st_size // 1024} KB")

print(f"done, {made} share image(s) written")
