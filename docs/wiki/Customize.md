# Customize

The visual design can change completely; the storefront contract cannot. Products, prices, stock, the basket, checkout, payments and accounts must keep coming from Selldone's own state and API.

## Where each part lives

| Part | Files |
| --- | --- |
| The bazaar page: HUD, loader, verse card, inspection, basket drawer | `pages/market/StorefrontPageMarket3D.vue` |
| Product panel, basket drawer, joystick | `components/market3d/MarketProductPanel.vue`, `MarketCart.vue`, `MarketJoystick.vue` |
| Catalogue from the shop | `components/market3d/data/marketCatalog.ts` |
| Historical figures: who, where, dress, verses | `components/market3d/data/figures.ts` |
| Engine: renderer, post-processing, lighting balance, walking, picking | `components/market3d/engine/MarketEngine.ts` |
| Arcades, skyline, relief | `components/market3d/engine/market/persian.ts` |
| The gate (muqarnas, inscription, door) | `components/market3d/engine/market/portal.ts` |
| Haft-rang tile generator | `components/market3d/engine/market/tilework.ts` |
| Pool, fountain, stone rim, geraniums | `components/market3d/engine/market/fountain.ts` |
| Sky, sun, plaza, string lights | `components/market3d/engine/market/environment.ts` |
| Produce models and product → model matching | `components/market3d/engine/produce/` |
| People, motion, re-dressing, crowd | `components/market3d/engine/people/` |

## Common changes

- **The shop name on the gate** comes from the shop's title automatically.
- **Who stands where:** `spot` in `figures.ts` (a regular expression matched against stall titles, or `"pool"`).
- **A figure's dress:** `costume` in `figures.ts`: `fabric` (`roundel`, `termeh`, `suzani`, `ikat`, `wool`, with colours), `trim`, `tiraz`, `sash`, `hat` (`kolah`, `sharbush`, `felt`) and `turban` (the hat's colour), `fur`, `trousers`.
- **Light and mood:** the sun's height and colour, shadow softness and the fill lights are in `environment.ts`; exposure and the colour grade in `MarketEngine.ts`.
- **Tile colours:** `PAL` in `tilework.ts`.

## Rules that keep it working

- Keep `manifest.json` → `package` unchanged after the first upload; give every release a new `version`.
- Don't hard-code products or prices: read them from the shop.
- New 3D assets must have an open licence; add them to the credits.
