# Openverse (Flickr & co., CC licences) candidates -> appended to work/cands/<key>.json + sheet in work/sheets-ov/
import sys, os, json, io, time, urllib.parse, concurrent.futures as cf
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from commons_search import get

W = sys.argv[1]
TERMS = json.load(open(sys.argv[2], encoding="utf8"))
LIC = {"cc0": "CC0", "pdm": "Public domain", "by": "CC BY", "by-sa": "CC BY-SA"}
font = ImageFont.truetype("arial.ttf", 18)


def search(q):
    url = "https://api.openverse.org/v1/images/?" + urllib.parse.urlencode(
        dict(q=q, license="cc0,pdm,by,by-sa", page_size=20, mature="false"))
    return json.loads(get(url))["results"]


def thumb(r):
    try:
        return Image.open(io.BytesIO(get(r["thumb"]))).convert("RGB")
    except Exception:
        return None


for key, qs in TERMS.items():
    cpath = f"{W}/cands/{key}.json"
    old = json.load(open(cpath, encoding="utf8")) if os.path.exists(cpath) else []
    seen = {c["title"] for c in old}
    new = []
    for q in qs:
        try:
            rs = search(q)
        except Exception as e:
            print("search fail", q, e)
            continue
        time.sleep(1)
        for r in rs:
            t = f"OV:{r['id']} {r['title'][:60]}"
            if t in seen or (r.get("width") or 0) < 800 or r["license"] not in LIC:
                continue
            seen.add(t)
            lic = LIC[r["license"]] + (f" {r['license_version']}" if r["license"] in ("by", "by-sa") else "")
            new.append(dict(title=t, w=r["width"], h=r["height"], lic=lic, artist=r.get("creator") or "",
                            thumb=r.get("thumbnail"), url=r["url"], direct=r["url"], page=r.get("foreign_landing_url") or r["url"]))
    new = new[:int(os.environ.get("OVMAX", 42))]
    with cf.ThreadPoolExecutor(2) as ex:
        thumbs = list(ex.map(thumb, new))
    T, cols = 200, 7
    rows = max(1, (len(new) + cols - 1) // cols)
    sheet = Image.new("RGB", (cols * T, rows * (T + 22)), "#333")
    d = ImageDraw.Draw(sheet)
    for i, (r, im) in enumerate(zip(new, thumbs)):
        x, y = (i % cols) * T, (i // cols) * (T + 22)
        if im:
            im.thumbnail((T, T))
            sheet.paste(im, (x + (T - im.width) // 2, y + (T - im.height) // 2))
        d.text((x + 3, y + T + 1), f"{len(old) + i} {r['lic'][:12]} {r['w']}", fill="#ff0", font=font)
    os.makedirs(f"{W}/sheets-ov", exist_ok=True)
    sheet.save(f"{W}/sheets-ov/{key}.jpg", quality=80)
    json.dump(old + new, open(cpath, "w", encoding="utf8"), indent=1)
    print(key, "new", len(new), "from", len(old), flush=True)
