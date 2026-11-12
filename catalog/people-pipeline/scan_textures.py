"""Poly Haven scan textures (1k) -> web set.

usage: python scan_textures.py <scan dir> <out dir> <id> [colour size]
writes <id>-diff.jpg, <id>-nor.jpg and <id>-mr.jpg (R = AO, G = roughness, B = metalness, glTF convention).
"""
import os
import sys
from PIL import Image

src, out, ident = sys.argv[1], sys.argv[2], sys.argv[3]
size = int(sys.argv[4]) if len(sys.argv) > 4 else 512
tex = os.path.join(src, "textures")
os.makedirs(out, exist_ok=True)


def find(*keys):
    for f in os.listdir(tex):
        if any(k in f for k in keys):
            return os.path.join(tex, f)
    return None


def save(im, name, s, q):
    im = im.resize((s, s), Image.LANCZOS) if im.size != (s, s) else im
    im.save(os.path.join(out, f"{ident}-{name}.jpg"), quality=q, optimize=True, progressive=True)


save(Image.open(find("_diff_")).convert("RGB"), "diff", size, 84)
save(Image.open(find("_nor_gl_")).convert("RGB"), "nor", size, 86)
arm = find("_arm_")
if arm:
    save(Image.open(arm).convert("RGB"), "mr", max(128, size // 2), 86)
else:
    rough = Image.open(find("_rough_")).convert("L")
    w, h = rough.size
    mr = Image.merge("RGB", (Image.new("L", (w, h), 255), rough, Image.new("L", (w, h), 0)))
    save(mr, "mr", max(128, size // 2), 86)
total = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out) if f.startswith(ident + "-"))
print(ident, "textures", round(total / 1024), "KB")
