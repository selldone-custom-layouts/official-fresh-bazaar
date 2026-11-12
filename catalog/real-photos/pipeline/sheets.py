# Build candidate contact sheets per product from Wikimedia Commons searches.
import sys, json, os, io, re, urllib.request, concurrent.futures as cf
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from commons_search import search, UA, get

OUT = sys.argv[1]
TERMS = json.loads(open(sys.argv[2], encoding="utf8").read())
only = sys.argv[3].split(",") if len(sys.argv) > 3 else None
os.makedirs(f"{OUT}/sheets", exist_ok=True)
os.makedirs(f"{OUT}/cands", exist_ok=True)
os.makedirs(f"{OUT}/sheets3", exist_ok=True)
OK = re.compile(r"^(CC0|Public domain|PD.*|CC BY(-SA)? [0-9.]+.*)$", re.I)


def fetch(u):
    return get(u)


font = ImageFont.truetype("arial.ttf", 18)


def thumb(r):
    try:
        return Image.open(io.BytesIO(fetch(r["thumb"]))).convert("RGB")
    except Exception:
        return None


def build(key, terms):
    cpath = f"{OUT}/cands/{key}.json"
    old = json.load(open(cpath, encoding="utf8")) if os.path.exists(cpath) and os.environ.get("APPEND") else []
    seen, cands = {c["title"] for c in old}, []
    for q in terms:
        try:
            rs = search(q, 25)
        except Exception as e:
            print("search fail", q, e)
            continue
        for r in rs:
            if r["title"] in seen or not OK.match(r["lic"].strip()) or min(r["w"], r["h"]) < 700:
                continue
            seen.add(r["title"])
            cands.append(r)
    cands = cands[:35]
    with cf.ThreadPoolExecutor(2) as ex:
        thumbs = list(ex.map(thumb, cands))
    T, cols = 200, 7
    rows = max(1, (len(cands) + cols - 1) // cols)
    sheet = Image.new("RGB", (cols * T, rows * (T + 22)), "#333")
    d = ImageDraw.Draw(sheet)
    for i, (r, im) in enumerate(zip(cands, thumbs)):
        x, y = (i % cols) * T, (i // cols) * (T + 22)
        if im:
            im.thumbnail((T, T))
            sheet.paste(im, (x + (T - im.width) // 2, y + (T - im.height) // 2))
        d.text((x + 3, y + T + 1), f"{len(old) + i} {r['lic'][:12]} {r['w']}", fill="#ff0", font=font)
    sheet.save(f"{OUT}/sheets{'3' if old else ''}/{key}.jpg", quality=80)
    json.dump(old + cands, open(cpath, "w", encoding="utf8"), indent=1)
    return key, f"{len(cands)} cands, {sum(x is None for x in thumbs)} missing thumbs"


items = [(k, v) for k, v in TERMS.items() if not only or k in only]
with cf.ThreadPoolExecutor(1) as ex:
    for k, n in ex.map(lambda kv: build(*kv), items):
        print(k, n, flush=True)
