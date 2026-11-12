# Troubleshooting

## The bazaar is slow on my device

The engine lowers its resolution, shadows and crowd on weaker devices by itself. For a quick check, open the classic list view from the HUD: it is the standard storefront and always fast.

## The page is blank, or an old page flashes first

A chunk imports `../shop.js`, so the app loads twice through Selldone's loader. Keep shared code in a shared chunk, as the build config does, and check the release with the steps in [Build and Upload](Build-and-Upload).

## The upload is rejected or cut off

| Message | Fix |
| --- | --- |
| "Archive paths must be safe relative app/ paths." | Only `app/` may be in the archive; `index.html` must not be. |
| Request cut off after ~100 s, version exists but is empty | Too many files. Keep the archive small (see [Build and Upload](Build-and-Upload)) and upload a **new** version. |
| Chunks fail with a MIME error (`text/x-java`) | Every JS file must start with `"use strict";`. |
| 401 | The CLI is signed out. Run `selldone` → Login. |

A version number is used up even when an upload fails. Never reuse one.

## The shop still shows the old design

- The version isn't attached yet: see [Go Live](Go-Live).
- A custom domain keeps its own Layout selection: set it on the domain, or to **inherit**.
- You opened a URL with a query string. Open the plain address and read `window.sdShopLayout`.

## `/` shows a landing page; the bazaar is only at `/shop`

Set the shop's Home to **Shop**: see [Go Live](Go-Live).

## HTTPS fails on a new subdomain

With a `CNAME` to `myselldone.com` and Cloudflare's proxy off, nothing issues a certificate for your host. Use an **A** record to `34.117.142.64` (DNS only) and add the domain with **SSL proxy** on: see [Go Live](Go-Live).

## A product shows as a package instead of produce

No 3D model matched its title. Add a tag such as `3d:apple-red` (see [Shop Requirements](Shop-Requirements)).
