# Fresh Market 3D — a walkable Persian bazaar layout for Selldone

A custom Selldone **Layout** built on the official [`selldone/storefront`](https://github.com/selldone/storefront).
The shop home becomes a real-time 3D open-air bazaar: every top-level category is a market stall, every
product is a crate piled with procedurally modelled produce. Shoppers walk around, inspect a product on a
studio turntable and add it to the real Selldone basket. Checkout, account, product pages, blog and all other
routes stay the standard storefront.

The produce, stalls and architecture are procedural (Three.js). For realism the market also streams real
assets, all free for commercial use. The procedural fallbacks keep it working if any asset fails:

- **People** — realistic rigged humans and motion capture from Microsoft Rocketbox (MIT): vendors,
  shoppers (couples, a mother and child), chatting locals. Walk speed drives the gait phase (no foot
  sliding), people turn with stepping feet, browse crates, talk to vendors and look at you.
- **Historical figures** — Omar Khayyam (seated on the pool rim), Avicenna (by the herbs) and Rhazes
  (by the fruit) in period costume (robe, cloak, turban) generated on top of their skeletons. Click one:
  he turns to you and recites (verse card, read aloud when the browser has a Persian or English voice).
  Data and verses: `components/market3d/data/figures.ts`.
- **Materials & sky** — photo-scanned PBR sets and an HDR afternoon sky from Poly Haven (CC0):
  herringbone brick paving, tan brick facades with real tile relief, straw-mud plaster, weathered
  planks, marble pool rim; card-based cypress trees with wind sway.

Asset weight: people ≈ 9 MB (19 avatars, 28 clips), materials + sky ≈ 2.9 MB, loaded after the
bazaar appears (low quality loads a smaller cast).

## Run it locally

```bash
npm run serve        # http://localhost:8080  (shop from .env → VITE_APP_SAMPLE_SHOP_NAME)
```

Dev-only helpers: `?market-demo` shows every 3D model with a demo catalog, `?market-nointro` skips the drone intro.

## What is where

| Area | Path |
|---|---|
| Page (HUD, loader, inspection, basket drawer wiring) | `pages/market/StorefrontPageMarket3D.vue` |
| Product panel / basket drawer / joystick | `components/market3d/MarketProductPanel.vue`, `MarketCart.vue`, `MarketJoystick.vue` |
| Catalog loader (categories → stalls, Storefront SDK only) | `components/market3d/data/marketCatalog.ts` |
| Engine: renderer, post (GTAO, bloom), walk controls, picking, dynamic resolution | `components/market3d/engine/MarketEngine.ts` |
| Studio turntable for inspected products | `components/market3d/engine/Showcase.ts` |
| ~50 procedural fruit / vegetable / herb models | `components/market3d/engine/produce/{fruits,veggies,parts}.ts` |
| Product → model matching (English + Persian keywords, `3d:kind-variant` tag override) | `components/market3d/engine/produce/catalog.ts` |
| Stalls, crates, piles, price tags | `components/market3d/engine/market/{stall,crate}.ts` |
| Sky, sun, plaza, festoon lights | `components/market3d/engine/market/environment.ts` |
| Persian bazaar: arcades, tiles, portal + calligraphy, dome, minarets, pool, cypresses, carpets, lanterns | `components/market3d/engine/market/persian.ts` |
| Realistic people: asset library, motion-capture person, period costume | `components/market3d/engine/people/{library,person,costume,pack}.ts` |
| Crowd behaviour (paths, avoidance, browsing, conversations, historical figures) | `components/market3d/engine/people/crowd.ts` |
| Procedural fallback people | `components/market3d/engine/people/characters.ts` |
| Historical figures and their verses | `components/market3d/data/figures.ts` |
| Photo materials + HDR sky loader | `components/market3d/engine/market/realism.ts` |
| Cypress trees | `components/market3d/engine/market/cypress.ts` |
| Converted assets (+ licences/credits) | `components/market3d/assets/{people,env}/` |
| Avatar / animation converter | `catalog/people-pipeline/` |
| Soundscape (fountain, murmur, santur in Shur) | `components/market3d/engine/audio/ambience.ts` |
| Product photo studio (renders catalog photos from the 3D models) | `catalog/studio/` |
| Fresh Bazaar catalog plan (7 categories, 53 products, EN + FA) | `catalog/catalog-plan.json` |

Routing: `/` renders the market for shop / landing homes (blog, community, map homes are unchanged),
`/shop` is the classic listing, a landing home stays reachable at `/home`.

## Products that are not produce

Unknown products are shown as a package printed with the product photo. To force a model, add a product
tag such as `3d:apple-green`, `3d:herbs-mint` or `3d:pumpkin`.

## Deploy as a Selldone Layout

`manifest.json` → package `fresh-market-3d-storefront`, version `1.0.0`. The build emits the Layout contract
(`dist/app/shop.js`, `dist/app/shop.css`, `dist/app/js/…`).

```bash
npm install -g selldone-cli
selldone            # signs in (browser), builds, packages and uploads a new Layout version
```

Then pick the layout for the shop in **Dashboard → Settings → Domains & Home → Default layout**
(or through the Selldone MCP `shops.layout.set`). Bump `manifest.version` for every release.
