"""Rocketbox 2048 TGA texture set -> compact web textures.

usage: python textures.py <Textures dir> <out dir> [body_size]
writes body.jpg, body_n.jpg, body_r.jpg (roughness from specular), head.jpg, head_n.jpg, head_r.jpg, hair.webp
"""
import os
import sys
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
body_size = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
os.makedirs(out, exist_ok=True)


def find(suffix):
    for f in os.listdir(src):
        if f.lower().endswith(suffix):
            return os.path.join(src, f)
    return None


def save_rgb(suffix, name, size, q=82):
    p = find(suffix)
    if not p:
        print("missing", suffix)
        return
    im = Image.open(p).convert("RGB").resize((size, size), Image.LANCZOS)
    im.save(os.path.join(out, name), quality=q, optimize=True, progressive=True)


def save_rough(suffix, name, size):
    p = find(suffix)
    if not p:
        return
    im = Image.open(p).convert("L").resize((size, size), Image.LANCZOS)
    # specular intensity -> roughness: shiny skin/leather ~0.45, matte cloth ~0.92
    lut = [max(0, min(255, round((0.93 - 0.62 * (v / 255.0)) * 255))) for v in range(256)]
    im = im.point(lut)
    im.save(os.path.join(out, name), quality=85, optimize=True)


save_rgb("_body_color.tga", "body.jpg", body_size, 82)
save_rgb("_body_normal.tga", "body_n.jpg", body_size // 2, 86)
save_rough("_body_specular.tga", "body_r.jpg", body_size // 4)
save_rgb("_head_color.tga", "head.jpg", 512, 84)
save_rgb("_head_normal.tga", "head_n.jpg", 256, 86)
save_rough("_head_specular.tga", "head_r.jpg", 128)

p = find("_opacity_color.tga")
if p:
    im = Image.open(p).convert("RGBA").resize((512, 512), Image.LANCZOS)
    im.save(os.path.join(out, "hair.webp"), quality=82, method=6)

total = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out))
print(os.path.basename(out.rstrip("/\\")), "textures", round(total / 1024), "KB")
