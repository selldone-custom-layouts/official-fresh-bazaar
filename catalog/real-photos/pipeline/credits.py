"""Build credits (JSON + Markdown) for every rendered shot from the selection specs and candidate lists."""
import sys, os, json, re, html

W, out_json, out_md = sys.argv[1], sys.argv[2], sys.argv[3]
specs = sys.argv[4:]


def cand(key, idx):
    if isinstance(idx, str) and ":" in idx:
        key, idx = idx.split(":")
    return json.load(open(f"{W}/cands/{key}.json", encoding="utf8"))[int(idx)]


def clean(s):
    s = re.sub(r"<[^>]+>", "", s or "")
    s = html.unescape(re.sub(r"\s+", " ", s)).strip()
    return s or "see source page"


credits = {}
for sp in specs:
    for key, spec in json.load(open(sp, encoding="utf8")).items():
        shots = []
        if "category" in spec:
            shots = [(f"categories/{key[4:]}.jpg", spec["category"])]
        else:
            shots = [(f"products/{key}-main.jpg", spec["main"])] + [(f"products/{key}-g{i + 1}.jpg", g) for i, g in enumerate(spec.get("gallery", []))]
        for fname, shot in shots:
            items = []
            for s in shot["src"]:
                c = cand(key, s["i"] if isinstance(s, dict) else s)
                items.append(dict(title=c["title"].replace("File:", ""), author=clean(c["artist"]), license=c["lic"], source=c["page"]))
            credits[fname] = items
json.dump(credits, open(out_json, "w", encoding="utf8"), indent=1, ensure_ascii=False)
lines = ["# Photo credits", "",
         "Every product and category photo is a real photograph from Wikimedia Commons or Openverse, cut out and placed on the",
         "Fresh Bazaar studio backdrop (cream sweep, soft contact shadow). The composites are derivative works and",
         "carry the licence of their sources: CC BY-SA sources make the composite CC BY-SA, CC0 / public-domain",
         "sources carry no conditions.", "",
         "| Image | Source photo | Author | Licence |", "|---|---|---|---|"]
for k in sorted(credits):
    for c in credits[k]:
        a = c["author"].replace("|", "/")
        t = c["title"] if not c["title"].startswith("OV:") else c["title"].split(" ", 1)[-1].strip() or "photo"
        lines.append(f"| `{k}` | [{t}]({c['source']}) | {a} | {c['license']} |")
open(out_md, "w", encoding="utf8").write("\n".join(lines) + "\n")
print(len(credits), "images credited")
