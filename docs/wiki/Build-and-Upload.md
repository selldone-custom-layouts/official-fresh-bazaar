# Build and Upload

Every release is a **new version** of your Layout on Selldone. A version number is used up even when an upload fails, so never reuse one.

## One-time setup

```bash
npm i -g selldone-cli
```

Sign in once: run `selldone`, choose **Login**, approve the sign-in in your browser and type your **2FA code** in the terminal. The sign-in is saved in `~/.selldone-dev/.persist`. Never share that file or put it in the repository.

## Release

1. Bump `version` in `manifest.json`.
2. Build and check the archive (see below), then commit and push the exact source you are releasing.
3. Upload with the Selldone CLI and **confirm** when it asks for the name and version.
4. Verify the upload in the Selldone developer panel, then [attach it](Go-Live).

## What Selldone accepts

| Rule | Why |
| --- | --- |
| Only `app/` in the archive (`app/shop.js`, `app/shop.css`, chunks and assets); no `index.html` | Selldone serves the Layout inside its own page |
| Every JavaScript file starts with `"use strict";` | Selldone stores the MIME type it sniffs; a chunk starting with `import{` would be refused by browsers |
| No chunk imports `../shop.js` | The loader reaches `shop.js` through a redirect; such an import loads the app twice |
| A few hundred files at most | The archive is extracted inside the upload request, which has a time limit |
| Only passive SVG attributes | Active SVG content is refused |
