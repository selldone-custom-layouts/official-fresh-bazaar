# Go Live

An uploaded version changes nothing until it is **attached** to your shop or to one of its domains.

## 1. A domain on Cloudflare (how bazaar.bigmart.me is set up)

1. Get the exact records for your domain from Selldone (dashboard › Domains › Add, or the MCP tool `selldone_domain_setup_guide`), in **Secure CDN + Issue SSL** mode.
2. In Cloudflare › DNS, add:
   - an **A** record for the host (e.g. `bazaar`) to `34.117.142.64`, **DNS only** (grey cloud);
   - the **TXT** record Selldone gives you, named `<host>-challenge` (e.g. `bazaar-challenge`).
3. Add the domain to the shop with **SSL proxy** on (dashboard, or `selldone_domain_add` with `ssl_proxy: true`). Selldone issues the certificate within seconds.
4. Make it **primary** if it should be the shop's main address.

A `CNAME` to `myselldone.com` (direct connect) also routes the domain, but without Cloudflare's proxy it has no certificate for your host: use the A record and SSL proxy mode.

## 2. Attach the version

**In the dashboard:** shop › **Domains** › the domain (or the shop's **Default layout**) › **Change layout**. Pick the Layout and the **exact** version.

**With the Selldone MCP connector:** call `selldone_api_call` with

```json
endpoint_id: "api.shops.domains.layout.set"
path_params: { "domain_key": "<the domain's id>" }
body: { "mode": "private", "layout_id": <your layout id>, "layout_version": "1.0.0" }
```

or `api.shops.layout.set` with the same body for the shop's default. Pin an exact version, never `latest`, so an unverified upload never goes live.

## 3. Home = the bazaar

If `/` shows a landing page while `/shop` shows the bazaar, set the shop's Home to **Shop** (dashboard, or `selldone_shop_home_default_set` with `page_id: "shop"`).

## 4. Verify

- Open the address without a query string. The page source's `window.sdShopLayout` names your package and version.
- The drone shot plays, the stalls carry your categories, a crate opens the inspector, Add to basket works.
- Check on a phone as well.
