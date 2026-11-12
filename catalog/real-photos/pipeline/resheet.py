# Rebuild a contact sheet for a slice of an existing candidate list: resheet.py work key start end
import sys, os, json, io, concurrent.futures as cf
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from commons_search import get

W, key, a, b = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
cands = json.load(open(f"{W}/cands/{key}.json", encoding="utf8"))[a:b]
font = ImageFont.truetype("arial.ttf", 18)


def thumb(r):
    try:
        return Image.open(io.BytesIO(get(r["thumb"]))).convert("RGB")
    except Exception:
        return None


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
    d.text((x + 3, y + T + 1), f"{a + i} {r['lic'][:12]} {r['w']}", fill="#ff0", font=font)
os.makedirs(f"{W}/sheets-r", exist_ok=True)
sheet.save(f"{W}/sheets-r/{key}.jpg", quality=80)
print(key, len(cands))
