# Download every source photo the specs need, one at a time with a polite gap. prefetch.py work spec1.json [spec2.json ...]
import sys, os, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render

W = sys.argv[1]
need = []
for sp in sys.argv[2:]:
    for key, spec in json.load(open(sp, encoding="utf8")).items():
        shots = [spec[k] for k in ("main", "category") if k in spec] + spec.get("gallery", [])
        for shot in shots:
            for s in shot["src"]:
                c = render.cand(key, s["i"] if isinstance(s, dict) else s)
                if c["title"] not in {x["title"] for x in need}:
                    need.append(c)
print(len(need), "sources", flush=True)
ok = fail = 0
for c in need:
    try:
        before = time.time()
        p = render.source(c)
        ok += 1
        if time.time() - before > 0.05:  # was actually downloaded
            time.sleep(2.5)
    except Exception as e:
        fail += 1
        print("FAIL", c["title"], repr(e), flush=True)
print("done", ok, "ok", fail, "failed", flush=True)
