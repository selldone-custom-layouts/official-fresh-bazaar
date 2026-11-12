# Copy rendered shots into the photos repo layout and write credits. package.py work repo_dir
import sys, os, json, shutil, subprocess
W, R = sys.argv[1], sys.argv[2]
sel = json.load(open(f"{W}/selection.json")); cat = json.load(open(f"{W}/spec-cat.json"))
os.makedirs(f"{R}/products", exist_ok=True); os.makedirs(f"{R}/categories", exist_ok=True)
missing = []
for k, v in sel.items():
    for n in ["main"] + [f"g{i + 1}" for i in range(len(v.get("gallery", [])))]:
        src = f"{W}/out/{k}-{n}.jpg"
        if not os.path.exists(src):
            missing.append(src); continue
        shutil.copy2(src, f"{R}/products/{k}-{n}.jpg")
for k in cat:
    src = f"{W}/out/{k}-cat.jpg"
    if not os.path.exists(src):
        missing.append(src); continue
    shutil.copy2(src, f"{R}/categories/{k[4:]}.jpg")
print("missing", missing)
