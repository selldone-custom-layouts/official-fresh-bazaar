# Candidate sheets from the crawled "on white background" categories; appends to work/cands/<key>.json
import sys, os, json, re, io, concurrent.futures as cf
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from commons_search import api, get

W = sys.argv[1]
only = sys.argv[2].split(",") if len(sys.argv) > 2 else None
KW = {
    "green-apple": r"granny|green apple|grüner apfel|pomme verte|apple.*green|green.*apple",
    "apricot": r"apricot|armeniaca|aprikose|abricot|albaricoque|marille",
    "fig": r"\bfigs?\b|ficus carica|feigen?\b|figues?\b|\bhigos?\b",
    "watermelon": r"watermelon|citrullus|wassermelone|pastèque|sandía|sandia",
    "cantaloupe": r"cantaloup|muskmelon|melon",
    "cucumber": r"cucumber|cucumis sativus|gurke|concombre|pepino",
    "zucchini": r"zucchin|courgette|calabac",
    "eggplant": r"eggplant|aubergine|melongena|berenjena",
    "red-pepper": r"bell pepper|paprika|capsicum annuum|pimiento|poivron|sweet pepper|pepper",
    "yellow-pepper": r"bell pepper|paprika|capsicum annuum|pimiento|poivron|sweet pepper|pepper",
    "green-pepper": r"bell pepper|paprika|capsicum annuum|pimiento|poivron|sweet pepper|pepper",
    "chili": r"chil+i|\bchile\b|cayenne|hot pepper|frutescens|jalape|piment",
    "carrot": r"carrot|daucus|karotte|möhre|carotte|zanahoria",
    "potato": r"potato|tuberosum|kartoffel|pomme de terre|patata",
    "onion": r"onion|allium cepa|zwiebel|oignon|cebolla|shallot",
    "red-onion": r"onion|allium cepa|zwiebel|oignon|cebolla",
    "garlic": r"garlic|allium sativum|knoblauch|\bail\b|\bajo\b",
    "radish": r"radish|raphanus|radieschen|radis|rábano|rettich",
    "ginger": r"ginger|zingiber|ingwer|gingembre|jengibre",
    "pumpkin": r"pumpkin|cucurbita|kürbis|potiron|citrouille|calabaza|squash|butternut|hokkaido",
    "cabbage": r"cabbage|brassica oleracea|kohl|\bchou\b|repollo",
    "lettuce": r"lettuce|lactuca|\bsalat|laitue|lechuga|romaine",
    "broccoli": r"broc+oli|brokkoli",
    "cauliflower": r"cauliflower|chou-fleur|blumenkohl|coliflor",
    "corn": r"\bcorn\b|maize|zea mays|\bmais\b|maïs|maíz|corncob|corn cob",
    "mushroom": r"mushroom|agaricus|champignon",
    "leek": r"\bleeks?\b|porrum|ampeloprasum|lauch|poireau|puerro",
    "celery": r"celery|apium graveolens|sellerie|céleri|\bapio\b",
    "parsley": r"parsley|petroselinum|petersilie|persil|perejil",
    "mint": r"\bmint\b|mentha|minze|menthe|spearmint|peppermint|hierbabuena",
    "basil": r"basil|ocimum|basilikum|basilic|albahaca",
    "spinach": r"spinach|spinacia|spinat|épinard|espinaca",
    "dill": r"\bdill\b|anethum|aneth|eneldo",
    "cilantro": r"coriand|cilantro|koriander",
    "pineapple": r"pineapple|ananas",
    "red-grapes": r"grape|vitis|traube|raisin",
    "green-grapes": r"grape|vitis|traube|raisin",
    "peach": r"peach|persica|pfirsich|pêche|nectarine",
    "pear": r"pear\b|pears|pyrus|birne|poire",
    "plum": r"\bplums?\b|prunus domestica|pflaume|prune",
    "tangerine": r"tangerine|mandarin|clementine",
}
SKIP_CAT = re.compile(r"Pomologische|Hoffy|grapes of New York|pears of New York|USDA|Viala|Sjöberg|Hamburgers|Cheese|Chocolate|Breads|coffee|Yi mein|white plates", re.I)
d = json.load(open(f"{W}/crawl.json", encoding="utf8"))
files = {f: c for f, c in d["files"].items() if not all(SKIP_CAT.search(x) for x in c)}
font = ImageFont.truetype("arial.ttf", 18)


def info(titles):
    out = {}
    for i in range(0, len(titles), 40):
        r = api(dict(action="query", titles="|".join(titles[i:i + 40]), prop="imageinfo", iiprop="url|size|extmetadata", iiurlwidth=400))
        for p in r["query"]["pages"]:
            if "imageinfo" not in p:
                continue
            ii = p["imageinfo"][0]
            md = ii.get("extmetadata", {})
            out[p["title"]] = dict(title=p["title"], w=ii["width"], h=ii["height"], lic=md.get("LicenseShortName", {}).get("value", "?"),
                                   artist=md.get("Artist", {}).get("value", ""), thumb=ii.get("thumburl"), url=ii["url"], page=ii.get("descriptionurl"))
    return out


BROAD = re.compile(r"Vegetables|Fruits|Food|Fruit on|Citrus|Drupes|Pomes|Solanaceae|Cucurbitaceae|Cross sections of (fruits|vegetables)", re.I)
OK = re.compile(r"^(CC0|Public domain|PD.*|CC BY(-SA)? [0-9.]+.*)$", re.I)


def thumb(r):
    try:
        return Image.open(io.BytesIO(get(r["thumb"]))).convert("RGB")
    except Exception:
        return None


for key, rx in KW.items():
    if only and key not in only:
        continue
    pat = re.compile(rx, re.I)
    hits = [f for f, cats in files.items() if pat.search(f) or any(pat.search(c) for c in cats if not BROAD.search(c))]
    cpath = f"{W}/cands/{key}.json"
    old = json.load(open(cpath, encoding="utf8")) if os.path.exists(cpath) else []
    have = {c["title"] for c in old}
    hits = [h for h in hits if h not in have and re.search(r"\.(jpe?g|png|webp|tiff?)$", h, re.I)][:120]
    meta = info(hits)
    new = [meta[h] for h in hits if h in meta and OK.match(meta[h]["lic"].strip()) and min(meta[h]["w"], meta[h]["h"]) >= 600][:42]
    with cf.ThreadPoolExecutor(3) as ex:
        thumbs = list(ex.map(thumb, new))
    T, cols = 200, 7
    rows = max(1, (len(new) + cols - 1) // cols)
    sheet = Image.new("RGB", (cols * T, rows * (T + 22)), "#333")
    dr = ImageDraw.Draw(sheet)
    for i, (r, im) in enumerate(zip(new, thumbs)):
        x, y = (i % cols) * T, (i // cols) * (T + 22)
        if im:
            im.thumbnail((T, T))
            sheet.paste(im, (x + (T - im.width) // 2, y + (T - im.height) // 2))
        dr.text((x + 3, y + T + 1), f"{len(old) + i} {r['lic'][:12]} {r['w']}", fill="#ff0", font=font)
    os.makedirs(f"{W}/sheets2", exist_ok=True)
    sheet.save(f"{W}/sheets2/{key}.jpg", quality=80)
    json.dump(old + new, open(cpath, "w", encoding="utf8"), indent=1)
    print(key, "hits", len(hits), "new", len(new), "from", len(old), flush=True)
