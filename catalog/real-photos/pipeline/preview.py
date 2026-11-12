import sys, os, glob
from PIL import Image, ImageDraw, ImageFont
W, out = sys.argv[1], sys.argv[2]
keys = sys.argv[3].split(",")
T = int(os.environ.get("T", 330))
font = ImageFont.truetype("arial.ttf", 16)
rows = []
for k in keys:
    files = sorted(glob.glob(f"{W}/out/{k}-main.jpg")) + sorted(glob.glob(f"{W}/out/{k}-g*.jpg"))
    rows.append((k, files))
cols = max(len(f) for _, f in rows)
sheet = Image.new("RGB", (cols * T, len(rows) * T), "#222")
d = ImageDraw.Draw(sheet)
for r, (k, files) in enumerate(rows):
    for c, f in enumerate(files):
        im = Image.open(f)
        im.thumbnail((T, T))
        sheet.paste(im, (c * T, r * T))
        d.text((c * T + 4, r * T + 2), os.path.basename(f)[:-4], fill="#333", font=font)
sheet.save(out, quality=85)
