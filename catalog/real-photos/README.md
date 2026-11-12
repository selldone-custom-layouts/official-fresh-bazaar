# Real product photos — Fresh Bazaar studio

The shop's product and category images are **real photographs** (Wikimedia Commons and Openverse,
free licences), not renders. Each photo goes through the same "studio", so the whole catalog reads as one
shoot:

1. **Source.** Candidates come from the curated Commons categories (*Fruits / Vegetables on white
   background*, *Cross sections of …*, Coyau's light-background series), targeted Commons searches and
   Openverse (Flickr). They are filtered to CC0, public domain, CC BY or CC BY-SA. Contact sheets are
   reviewed by eye and the picks are recorded in [`selection.json`](selection.json). Each product gets a
   hero shot (often whole + cut) and 1–3 gallery shots (single piece, cross-section, top view).
2. **Cutout.** `rembg` (IS-Net general-use model) with alpha matting, then a clean-up pass. Stray blobs
   are dropped, and edge colours are pulled from the interior so no halo of the old background survives.
   A source whose subject touches the frame edge is flagged (`WARN edge-touch`) and replaced.
3. **Studio composite.** The subject's real pixels go unchanged onto the bazaar's cream sweep
   (`#F7F2EA → #EEE6DA`, soft key-light glow, gentle corner falloff, light film grain) at a common
   framing on a 1600 px square. Each separate object gets a tight contact shadow where it touches the
   paper, an occlusion pool and a soft cast shadow falling back-right. Flat-lay shots (`"mode": "top"`)
   get a drop shadow instead. A 2 px light wrap blends the edge into the backdrop.
4. **Categories.** Still lifes built from cutouts of that category's products
   ([`spec-cat.json`](spec-cat.json)).

The images themselves are published in the public repository
[`selldone-custom-layouts/fresh-bazaar-photos`](https://github.com/selldone-custom-layouts/fresh-bazaar-photos)
(`products/<key>-main.jpg`, `products/<key>-g1..g3.jpg`, `categories/<category>.jpg`). Selldone's upload
tools import an image from a public URL and keep their own copy on the shop CDN.
[`upload-plan.json`](upload-plan.json) maps each file to its product or category id in shop 88.

## Licences

Each composite is a derivative of its sources. A CC BY-SA source makes that image CC BY-SA, a CC BY
source needs attribution, and CC0 or public-domain sources have no conditions.
[`CREDITS.md`](CREDITS.md) is the attribution for every image (source photo, author and licence). It
also ships next to the images in the photos repository.

## Re-running

```bash
python -m venv .venv && .venv/Scripts/pip install "rembg[cpu]" pillow numpy scipy
P=catalog/real-photos/pipeline
# candidates → contact sheets (work/sheets*/<key>.jpg) + candidate lists (work/cands/<key>.json)
python $P/sheets.py work $P/terms.json
python $P/crawl.py work/crawl.json "Category:Fruits on white background" "Category:Vegetables on white background" "Category:Cross sections of fruits"
python $P/crawl_sheets.py work
python $P/openverse_sheets.py work my-terms.json
# pick indices into selection.json, then download once (polite, sequential) and render offline
python $P/prefetch.py work selection.json spec-cat.json
OFFLINE=1 python $P/render.py work selection.json        # → work/out/<key>-main.jpg, -g1.jpg …
OFFLINE=1 python $P/render.py work spec-cat.json         # → work/out/cat-<category>-cat.jpg
python $P/package.py work photos-repo                     # → photos-repo/products, photos-repo/categories
python $P/credits.py work credits.json CREDITS.md selection.json spec-cat.json
```

The current set has 53 products (main image plus 1–3 gallery shots, 173 product images) and 7
category images.

`work/cands/*.json` is the index space of `selection.json`. Keep the `work/` folder (or re-run the same
searches) when editing picks. Wikimedia throttles bursts: the scripts back off on HTTP 429, and
`prefetch.py` downloads sequentially, taking a standard 1280 px thumbnail when the original is larger.
