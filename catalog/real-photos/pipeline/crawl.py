# Crawl Commons "on white background" category trees -> list of files with their category
import sys, os, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from commons_search import api

roots = sys.argv[2:]
out = sys.argv[1]
seen_cat, files = set(), {}


def members(cat, typ):
    cont = {}
    while True:
        r = api(dict(action="query", list="categorymembers", cmtitle=cat, cmtype=typ, cmlimit=500, **cont))
        for m in r["query"]["categorymembers"]:
            yield m["title"]
        if "continue" not in r:
            break
        cont = {"cmcontinue": r["continue"]["cmcontinue"]}


def crawl(cat, depth):
    if cat in seen_cat or depth < 0:
        return
    seen_cat.add(cat)
    for f in members(cat, "file"):
        files.setdefault(f, []).append(cat)
    for sub in members(cat, "subcat"):
        crawl(sub, depth - 1)


for r in roots:
    crawl(r, 3)
    print(r, len(files), "files so far,", len(seen_cat), "cats", flush=True)
json.dump(dict(files=files, cats=sorted(seen_cat)), open(out, "w", encoding="utf8"), indent=0, ensure_ascii=False)
