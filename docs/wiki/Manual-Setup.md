# Manual Setup

## 1. Your copy

```bash
git clone https://github.com/selldone-custom-layouts/official-fresh-bazaar.git my-bazaar
cd my-bazaar
git remote rename origin source
git remote add origin https://github.com/<you>/<your-repo>.git
git remote add upstream https://github.com/selldone/storefront.git
git remote set-url --push upstream DISABLED   # upstream is fetch-only
```

## 2. Install and run

```bash
npm install
```

In `.env`, set your shop: `VITE_APP_SAMPLE_SHOP_NAME=<your shop handle>`. Only public client configuration belongs in `.env`; never put a token there.

```bash
npm run serve
```

Open the dev server with `/?market-nointro` to skip the drone shot, or `/?market-demo` to see every 3D model.

## 3. The manifest

`manifest.json` identifies your Layout on Selldone:

```json
{
  "deploy_server": "https://layouts.selldone.com",
  "package": "mybrand-bazaar-3d",
  "name": "My Bazaar 3D",
  "version": "1.0.0",
  "storefront": true,
  "backoffice": false
}
```

- `package` is permanent: choose it once, before the first upload.
- Every upload needs a new `version`.
- Keep `layout.identity.json` → `package` the same; after the first upload, set its `layout_id`.

Then [build and upload](Build-and-Upload) and [go live](Go-Live).
