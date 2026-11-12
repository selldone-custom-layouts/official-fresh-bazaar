"""Fresh Bazaar photo studio: real photo -> cutout -> cream studio sweep with natural shadows.

cutout(src) -> RGBA (cached)    compose(rgba, mode) -> RGB square
"""
import os, sys, io, json, hashlib
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

BG_TOP = np.array([247, 242, 234], np.float32)     # warm cream, matches the 3D studio photos
BG_BOTTOM = np.array([238, 230, 218], np.float32)
_session = None


def session():
    global _session
    if _session is None:
        from rembg import new_session
        _session = new_session(os.environ.get("REMBG_MODEL", "isnet-general-use"))
    return _session


def cutout(src_path, cache_dir, max_side=2200, matting=True):
    os.makedirs(cache_dir, exist_ok=True)
    h = hashlib.md5((os.path.abspath(src_path) + str(max_side) + str(matting) + os.environ.get("REMBG_MODEL", "")).encode()).hexdigest()[:12]
    out = os.path.join(cache_dir, os.path.splitext(os.path.basename(src_path))[0] + "-" + h + ".png")
    if os.path.exists(out):
        return Image.open(out)
    from rembg import remove
    im = Image.open(src_path)
    im = im.convert("RGB")
    im.thumbnail((max_side, max_side), Image.LANCZOS)
    rgba = remove(im, session=session(), alpha_matting=matting, alpha_matting_foreground_threshold=235,
                  alpha_matting_background_threshold=15, alpha_matting_erode_size=8, post_process_mask=True)
    rgba = defringe(np.asarray(im).astype(np.float32), np.asarray(rgba)[..., 3].astype(np.float32) / 255)
    rgba.save(out)
    return rgba


def defringe(rgb, a):
    """Keep only the main subject blobs, clean the alpha and pull edge colours from the interior."""
    solid = a > 0.5
    lab, n = ndi.label(solid)
    if n > 1:
        sizes = ndi.sum(solid, lab, range(1, n + 1))
        keep = np.isin(lab, 1 + np.nonzero(sizes >= sizes.max() * 0.04)[0])
        keep = ndi.binary_dilation(keep, iterations=6)
        a = a * keep
    a = np.clip((a - 0.04) / 0.92, 0, 1)
    inner = (a > 0.97).astype(np.float32)
    w = ndi.gaussian_filter(inner, 3) + 1e-4
    est = np.stack([ndi.gaussian_filter(rgb[..., c] * inner, 3) for c in range(3)], -1) / w[..., None]
    k = np.clip(a, 0, 1)[..., None] ** 0.5
    edge = (a < 0.97)[..., None]
    rgb = np.where(edge, est * (1 - k) + rgb * k, rgb)
    # a 1px choke so no halo of the old background survives
    a = np.minimum(a, ndi.grey_erosion(a, size=(2, 2)) * 0.5 + a * 0.5)
    out = np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def trim(rgba):
    a = np.asarray(rgba)[..., 3]
    ys, xs = np.nonzero(a > 8)
    return rgba.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def backdrop(S, seed=0):
    y = np.linspace(0, 1, S, dtype=np.float32)[:, None]
    x = np.linspace(-1, 1, S, dtype=np.float32)[None, :]
    t = np.clip((y - 0.35) / 0.65, 0, 1) ** 1.4
    bg = BG_TOP[None, None] * (1 - t[..., None]) + BG_BOTTOM[None, None] * t[..., None]
    r = np.sqrt(x ** 2 + ((y - 0.45) * 2) ** 2)
    bg = bg * (1 - 0.03 * np.clip(r - 0.7, 0, 1.5)[..., None])          # soft falloff to the corners
    bg = bg * (1 + 0.025 * np.exp(-((x + 0.25) ** 2 + (y - 0.25) ** 2) / 0.25))[..., None]  # key light glow
    return bg


def place(canvas_a, rgba, x, y):
    canvas_a.alpha_composite(rgba, (int(round(x)), int(round(y))))


def compose(items, S=1600, mode="side", grain=2.2, seed=0, light=(-0.35, 1.0)):
    """items: list of (rgba, cx, base_y, height_px) in canvas pixels. base_y = where the object meets the table."""
    bg = backdrop(S, seed)
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    shadow = np.zeros((S, S), np.float32)
    for rgba, cx, base, hpx in items:
        sub = trim(rgba)
        scale = hpx / sub.height
        sub = sub.resize((max(1, round(sub.width * scale)), max(1, round(sub.height * scale))), Image.LANCZOS)
        x0, y0 = cx - sub.width / 2, base - sub.height
        a = np.asarray(sub)[..., 3].astype(np.float32) / 255
        shadow = np.maximum(shadow, shadow_for(a, x0, y0, S, mode, light))
        place(layer, sub, x0, y0)
    bg = bg * (1 - shadow[..., None])
    L = np.asarray(layer).astype(np.float32)
    al = L[..., 3:4] / 255
    # light wrap: let a little of the backdrop bleed into the very edge of the subject
    soft = ndi.gaussian_filter(al[..., 0], 2.0)[..., None]
    wrap = np.clip((1 - soft) * al * 0.35, 0, 0.35)
    fg = L[..., :3] * (1 - wrap) + bg * wrap
    img = bg * (1 - al) + fg * al
    rng = np.random.default_rng(seed)
    img = img + rng.normal(0, grain, img.shape[:2])[..., None]
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")


def shadow_for(a, x0, y0, S, mode, light):
    h, w = a.shape
    sh = np.zeros((S, S), np.float32)

    def stamp(arr, ox, oy, op):
        hh, ww = arr.shape
        xa, ya = int(round(ox)), int(round(oy))
        xs0, ys0 = max(0, xa), max(0, ya)
        xs1, ys1 = min(S, xa + ww), min(S, ya + hh)
        if xs1 <= xs0 or ys1 <= ys0:
            return
        region = arr[ys0 - ya:ys1 - ya, xs0 - xa:xs1 - xa] * op
        sh[ys0:ys1, xs0:xs1] = np.maximum(sh[ys0:ys1, xs0:xs1], region)

    if mode == "top":  # flat-lay: the object lies on the paper, light from upper left
        pad = 60
        A = np.pad(a, pad)
        stamp(ndi.gaussian_filter(A, 22), x0 - pad + 16, y0 - pad + 24, 0.30)
        stamp(ndi.gaussian_filter(A, 5), x0 - pad + 4, y0 - pad + 6, 0.32)
        return np.clip(sh, 0, 0.6)
    # side view: every separate object in the cutout rests on the paper at its own lowest point
    lab, n = ndi.label(ndi.binary_dilation(a > 0.5, iterations=3))
    if n > 1:
        sizes = ndi.sum(np.ones_like(a), lab, range(1, n + 1))
        for i in np.nonzero(sizes >= sizes.max() * 0.08)[0]:
            ys, xs = np.nonzero(lab == i + 1)
            part = (a * (lab == i + 1))[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            sh = np.maximum(sh, shadow_for(part, x0 + xs.min(), y0 + ys.min(), S, mode, light))
        return sh
    cols = np.nonzero(a.max(0) > 0.3)[0]
    full_w = cols.max() - cols.min() + 1
    band = a[int(h * 0.88):]
    bcols = np.nonzero(band.max(0) > 0.5)[0] if band.size else cols
    if len(bcols) == 0:
        bcols = cols
    foot_w = bcols.max() - bcols.min() + 1
    fx = x0 + (bcols.min() + bcols.max()) / 2
    cx = x0 + (cols.min() + cols.max()) / 2
    base = y0 + h

    def blob(ccx, ccy, ew, eh, blur, op):
        e = ellipse(ew, eh, blur)
        stamp(e, ccx - e.shape[1] / 2, ccy - e.shape[0] / 2, op)

    # contact: tight and dark right where it touches
    blob(fx, base - full_w * 0.014, foot_w * 0.85 + full_w * 0.10, full_w * 0.05, full_w * 0.014, 0.52)
    # occlusion pool under the body
    blob(cx, base - full_w * 0.02, full_w * 0.95, full_w * 0.13, full_w * 0.045, 0.34)
    # soft cast shadow falling back and to the right
    blob(cx + full_w * 0.16, base - full_w * 0.07, full_w * 1.15, full_w * 0.26, full_w * 0.10, 0.20)
    return np.clip(sh, 0, 0.7)


def ellipse(w, h, blur):
    pad = int(blur * 3) + 2
    W, H = int(w) + 2 * pad, int(h) + 2 * pad
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    e = (((xx - W / 2) / max(1, w / 2)) ** 2 + ((yy - H / 2) / max(1, h / 2)) ** 2) <= 1
    return ndi.gaussian_filter(e.astype(np.float32), max(0.5, blur))
