"""
Builds the README hero: the live 3D render on the left, the same frame re-imagined photorealistically
on the right, a soft seam between them, an arrow, and the caption about where AI and 3D engines are
heading.

    python docs/screenshots/make-hero.py docs/screenshots/hero-render.jpg docs/screenshots/hero-real.jpg docs/screenshots/hero.jpg

Both inputs should show the same view (16:9). Needs Pillow.
"""
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

src_render, src_real, out = sys.argv[1:4]
W, H = 2400, 1350
render = Image.open(src_render).convert("RGB").resize((W, H), Image.LANCZOS)
# "-" = no photoreal frame yet: show the render alone, honestly labelled (no fake "goal" half)
split = src_real != "-"
if split:
    real = Image.open(src_real).convert("RGB").resize((W, H), Image.LANCZOS)
    # left half: render; right half: photoreal, joined by a soft vertical seam
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).rectangle([W // 2, 0, W, H], fill=255)
    hero = Image.composite(real, render, mask.filter(ImageFilter.GaussianBlur(6)))
else:
    hero = render.copy()
d = ImageDraw.Draw(hero, "RGBA")
if split:
    d.line([(W // 2, 0), (W // 2, H)], fill=(255, 255, 255, 230), width=4)


def font(size, bold=True):
    for name in (["seguisb.ttf", "segoeuib.ttf", "arialbd.ttf"] if bold else ["segoeui.ttf", "arial.ttf"]):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def pill(xy, text, f, fg=(255, 255, 255, 255), bg=(10, 14, 24, 175)):
    x, y = xy
    l, t, r, b = d.textbbox((0, 0), text, font=f)
    pad = 22
    d.rounded_rectangle([x, y, x + (r - l) + pad * 2, y + (b - t) + pad * 1.6], radius=26, fill=bg)
    d.text((x + pad, y + pad * 0.8 - t), text, font=f, fill=fg)


pill((48, 44), "Today: real-time 3D in the browser", font(46))
if split:
    pill((W // 2 + 48, 44), "The goal: indistinguishable from a photo", font(46))
    # arrow across the seam, left → right
    cy = int(H * 0.31)
    x0, x1 = W // 2 - 300, W // 2 + 300
    d.line([(x0, cy), (x1 - 40, cy)], fill=(255, 214, 120, 255), width=16)
    d.polygon([(x1, cy), (x1 - 70, cy - 46), (x1 - 70, cy + 46)], fill=(255, 214, 120, 255))

# caption band
band_h = 190
d.rectangle([0, H - band_h, W, H], fill=(8, 10, 18, 190))
headline = (
    "How far can AI and 3D engines go — until the bazaar on the left becomes the one on the right?"
    if split
    else "How far can AI and 3D engines go — until this bazaar is indistinguishable from a photograph?"
)
d.text((60, H - band_h + 34), headline, font=font(44), fill=(255, 255, 255, 255))
d.text((60, H - band_h + 104), "A live Selldone storefront, rebuilt with every new Claude and Codex model.", font=font(36, False), fill=(225, 214, 190, 255))

hero.save(out, quality=88, optimize=True, progressive=True)
print("saved", out, hero.size)
