"""Render product shots from a selection spec.

spec = { key: { "main": shot, "gallery": [shot, ...] } }
shot = { "src": [idx | {"i": idx, "flip": bool, "box": f, "x": f, "base": f}], "layout": "solo|pair|trio|row", "mode": "side|top" }
idx refers to work/cands/<key>.json (or "key:idx" for another product's candidates).
"""
import sys, os, json, urllib.parse
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from commons_search import api, get
import compose

W = sys.argv[1]               # work dir
SPEC = json.load(open(sys.argv[2], encoding="utf8"))
only = sys.argv[3].split(",") if len(sys.argv) > 3 and sys.argv[3] else None
S = 1600
LAYOUTS = {
    "solo": [dict(x=.5, base=.81, bw=.74, bh=.60)],
    "pair": [dict(x=.38, base=.73, bw=.46, bh=.46), dict(x=.62, base=.83, bw=.48, bh=.48)],
    "trio": [dict(x=.32, base=.71, bw=.40, bh=.40), dict(x=.68, base=.72, bw=.40, bh=.40), dict(x=.5, base=.85, bw=.44, bh=.44)],
    "row": [dict(x=.30, base=.80, bw=.36, bh=.55), dict(x=.70, base=.80, bw=.36, bh=.55)],
    # category still lifes: back row first, front row last
    "four": [dict(x=.33, base=.66, bw=.36, bh=.36), dict(x=.67, base=.65, bw=.36, bh=.36),
             dict(x=.27, base=.86, bw=.34, bh=.32), dict(x=.66, base=.87, bw=.36, bh=.32)],
    "five": [dict(x=.26, base=.64, bw=.30, bh=.34), dict(x=.52, base=.60, bw=.30, bh=.36), dict(x=.77, base=.65, bw=.30, bh=.34),
             dict(x=.36, base=.86, bw=.32, bh=.30), dict(x=.68, base=.87, bw=.32, bh=.30)],
}


def cand(key, idx):
    if isinstance(idx, str) and ":" in idx:
        key, idx = idx.split(":")
    c = json.load(open(f"{W}/cands/{key}.json", encoding="utf8"))[int(idx)]
    return c


OFFLINE = bool(os.environ.get("OFFLINE"))


def source(c):
    os.makedirs(f"{W}/src", exist_ok=True)
    name = urllib.parse.quote(c["title"].replace("File:", "").replace(" ", "_").replace(":", "-"), safe="")[:80]
    if c.get("direct") and not os.path.splitext(name)[1]:
        name += os.path.splitext(urllib.parse.urlparse(c["direct"]).path)[1] or ".jpg"
    p = f"{W}/src/{name}"
    if os.path.exists(p) and os.path.getsize(p) == 0:
        os.remove(p)
    if not os.path.exists(p):
        if OFFLINE:
            raise RuntimeError("not prefetched: " + c["title"])
        if c.get("direct"):
            data = get(c["direct"])
            open(p, "wb").write(data)
            return p
        # standard 1280 px thumbnail when the original is larger (cached by Wikimedia, rarely throttled), else the original
        if c["w"] > 1280 and c.get("thumb") and "/500px-" in c["thumb"]:
            url = c["thumb"].split("?")[0].replace("/500px-", "/1280px-")
        else:
            url = c["url"].split("?")[0]
        data = get(url)
        open(p, "wb").write(data)
    return p


def render_shot(key, shot, seed):
    mode = shot.get("mode", "side")
    srcs = shot["src"]
    lay = LAYOUTS[shot.get("layout") or {1: "solo", 2: "pair", 3: "trio", 4: "four", 5: "five"}[len(srcs)]]
    items, used = [], []
    for n, s in enumerate(srcs):
        s = s if isinstance(s, dict) else {"i": s}
        c = cand(key, s["i"])
        used.append(c)
        rgba = compose.cutout(source(c), f"{W}/cut")
        al = np.asarray(rgba)[..., 3] > 128
        edge = max(al[0].mean(), al[-1].mean(), al[:, 0].mean(), al[:, -1].mean())
        if edge > 0.02:
            print(f"WARN edge-touch {key} {s['i']} {edge:.2f}", flush=True)
        if s.get("crop"):  # keep only a fractional box of the cutout, e.g. to drop a neighbour cut by the frame
            x0, y0, x1, y1 = s["crop"]
            rgba = rgba.crop((int(x0 * rgba.width), int(y0 * rgba.height), int(x1 * rgba.width), int(y1 * rgba.height)))
        if s.get("largest"):  # keep only the biggest object of the cutout
            from scipy import ndimage as ndi
            arr = np.asarray(rgba).copy()
            lab, nlab = ndi.label(ndi.binary_dilation(arr[..., 3] > 128, iterations=4))
            if nlab > 1:
                sizes = ndi.sum(np.ones(lab.shape), lab, range(1, nlab + 1))
                arr[..., 3] = arr[..., 3] * (lab == 1 + int(np.argmax(sizes)))
                rgba = Image.fromarray(arr, "RGBA")
        if s.get("rot"):
            rgba = rgba.rotate(s["rot"], expand=True, resample=Image.BICUBIC)
        if s.get("flip"):
            rgba = rgba.transpose(Image.FLIP_LEFT_RIGHT)
        sub = compose.trim(rgba)
        L = dict(lay[n])
        L.update({k: s[k] for k in ("x", "base", "bw", "bh") if k in s})
        if "box" in s:
            L["bw"] = L["bh"] = s["box"]
        if "box" in shot:
            L["bw"], L["bh"] = L["bw"] * shot["box"], L["bh"] * shot["box"]
        scale = min(L["bw"] * S / sub.width, L["bh"] * S / sub.height)
        hpx = sub.height * scale
        base = L["base"] * S
        if mode == "top" and len(srcs) == 1 and "base" not in s:
            base = S * 0.5 + hpx / 2
        items.append((sub, L["x"] * S, base, hpx))
    img = compose.compose(items, S=S, mode=mode, seed=seed)
    return img, used


def main():
    os.makedirs(f"{W}/out", exist_ok=True)
    credits = json.load(open(f"{W}/credits.json", encoding="utf8")) if os.path.exists(f"{W}/credits.json") else {}
    for key, spec in SPEC.items():
        if only and key not in only:
            continue
        shots = ([("main", spec["main"])] if "main" in spec else []) + [(f"g{i + 1}", g) for i, g in enumerate(spec.get("gallery", []))]
        if "category" in spec:
            shots = [("cat", spec["category"])]
        for j, (name, shot) in enumerate(shots):
            if os.environ.get("SKIP_EXISTING") and os.path.exists(f"{W}/out/{key}-{name}.jpg"):
                continue
            try:
                img, used = render_shot(key, shot, seed=hash((key, name)) & 0xffff)
            except Exception as e:
                print(f"FAIL {key}-{name}: {e!r}", flush=True)
                continue
            out = f"{W}/out/{key}-{name}.jpg"
            img.save(out, quality=90, optimize=True, progressive=True)
            credits[f"{key}-{name}"] = [dict(title=c["title"], lic=c["lic"], artist=c["artist"], page=c["page"]) for c in used]
            print("rendered", out, flush=True)
    json.dump(credits, open(f"{W}/credits.json", "w", encoding="utf8"), indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
