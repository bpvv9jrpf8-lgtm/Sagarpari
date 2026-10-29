#!/usr/bin/env python3
"""Make a small .webp copy of every cover image (dev helper, not run by build.js).

PNG covers are 0.1–1.9 MB; the WebP copy is usually 5–15x smaller, so pages load
much faster on phones (good for readers and for Google ranking). build.js serves the
.webp automatically when it sits next to the .png, and keeps the .png as fallback
and for Facebook/WhatsApp previews.

Usage:  python3 tools/make-webp.py            (only new/changed images)
        python3 tools/make-webp.py --all      (redo every image)
Needs Pillow (pip install pillow).
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "static" / "images"
redo_all = "--all" in sys.argv

made = 0
for src in sorted(IMAGES.glob("*")):
    if src.suffix.lower() not in (".png", ".jpg", ".jpeg"):
        continue
    out = src.with_suffix(".webp")
    if out.exists() and not redo_all and out.stat().st_mtime >= src.stat().st_mtime:
        continue
    with Image.open(src) as im:
        im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
        if im.width > 1200:
            im = im.resize((1200, round(im.height * 1200 / im.width)), Image.LANCZOS)
        im.save(out, "WEBP", quality=80, method=6)
    made += 1
    print(f"{src.name}: {src.stat().st_size // 1024} KB -> {out.stat().st_size // 1024} KB")

print(f"done, {made} webp file(s) written")
