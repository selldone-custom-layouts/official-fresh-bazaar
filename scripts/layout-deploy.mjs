/*
 * Upload dist.zip as a new version of this Layout — a thin wrapper around the
 * official selldone-cli 1.0.16, ported from selldone-custom-layouts/
 * official-valero scripts/kalio-deploy.mjs.
 *
 *   npm run layout:release        # build + post-build checks + dist.zip
 *   npm run layout:deploy         # this script (interactive)
 *
 * Why not plain `selldone deploy`: CLI 1.0.16 rebuilds, zips dist/ itself and
 * posts the whole manifest.json (including the build-only deploy_server and
 * deploy_path) as one JSON text field, which api.selldone.com has answered
 * with "The manifest must be an array." This wrapper changes only the upload:
 * the ZIP is the already validated dist.zip, and the manifest field holds the
 * six fields of the artifact contract (package, version, name, description,
 * storefront, backoffice) — mode "fields" sends manifest[key] form fields
 * instead. Everything else is the CLI's own code: the saved sign-in in
 * ~/.selldone-dev/.persist (read by the CLI module, never printed here), its
 * login/2FA flow, premium check, version check, and its interactive
 * "Is the name … and version … correct? (yes/no)" confirmation. Nothing is
 * uploaded without that typed "yes" on a real terminal.
 *
 * Usage: node scripts/layout-deploy.mjs [selldone-cli root] [safe-json|fields]
 * (default root: "$(npm root -g)/selldone-cli"; or set SELLDONE_CLI).
 * A CLI exit code is not proof: check the developer panel / CDN afterwards.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import JSZip from "jszip";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT); // the CLI's Config uses ./manifest.json and dist.zip

const args = process.argv.slice(2);
const MODE = args.find((a) => a === "safe-json" || a === "fields") || "safe-json";
const cliRoot =
  args.find((a) => a !== MODE) ||
  process.env.SELLDONE_CLI ||
  path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "selldone-cli");

if (!fs.existsSync(path.join(cliRoot, "src/authentication.mjs"))) {
  console.error(`selldone-cli not found at ${cliRoot}. Install it: npm install -g selldone-cli@1.0.16`);
  process.exit(2);
}
if (!process.stdin.isTTY) {
  console.error("Run this in an interactive terminal: the upload needs a typed confirmation.");
  process.exit(2);
}
const cliVersion = JSON.parse(fs.readFileSync(path.join(cliRoot, "package.json"), "utf8")).version;
if (cliVersion !== "1.0.16") console.warn(`Note: wrapper written against selldone-cli 1.0.16, found ${cliVersion}.`);

const mod = (p) => import(pathToFileURL(path.join(cliRoot, p)).href);
const { Authentication } = await mod("src/authentication.mjs");
const { default: Config } = await mod("src/config.mjs");
const { default: Manifest } = await mod("src/manifest.mjs");

/* 1. The archive must be the validated package of the current build. */
const ZIP = path.resolve(Config.BUILD_ZIP_PATH);
const SHOP_JS = path.join(ROOT, "dist/app/shop.js");
if (!fs.existsSync(ZIP) || !fs.existsSync(SHOP_JS)) {
  console.error("dist.zip or dist/app/shop.js is missing. Run: npm run layout:release");
  process.exit(2);
}
const zip = await JSZip.loadAsync(fs.readFileSync(ZIP));
const zipped = await zip.file("app/shop.js")?.async("nodebuffer");
if (!zipped || !zipped.equals(fs.readFileSync(SHOP_JS)) || Object.keys(zip.files).some((n) => !n.startsWith("app/"))) {
  console.error("dist.zip is not the package of the current dist/. Run: npm run layout:release");
  process.exit(2);
}

/* 2. The CLI's own sign-in (login + 2FA when needed). */
await new Promise((resolve) => {
  if (Authentication.getAccessToken()) Authentication.check2FAStatus(async () => resolve());
  else Authentication.auth(async () => resolve());
});
if (!Authentication.USER) {
  console.error("Login could not be confirmed; stopping before upload.");
  process.exit(2);
}
if (!Authentication.IsPremium()) {
  console.error("Only premium Selldone accounts can deploy layouts.");
  process.exit(2);
}

/* 3. The CLI's manifest checks, version check and typed yes/no confirmation
      (it exits the process on "no" or on a used version). */
await Manifest.checkManifest();

/* 4. Upload. */
const MANIFEST = JSON.parse(fs.readFileSync(Config.MANIFEST_PATH, "utf8"));
const SAFE = ["package", "version", "name", "description", "storefront", "backoffice"];
/* Laravel's boolean rule accepts "1"/"0", not the strings "true"/"false". */
const field = (v) => (v === true ? "1" : v === false ? "0" : v === null || v === undefined ? "" : String(v));
const form = new FormData();
form.append("file", new Blob([fs.readFileSync(ZIP)], { type: "application/zip" }), "dist.zip");
if (MODE === "fields") {
  for (const k of SAFE) form.append(`manifest[${k}]`, field(MANIFEST[k] ?? null));
} else {
  form.append("manifest", JSON.stringify(Object.fromEntries(SAFE.map((k) => [k, MANIFEST[k] ?? null]))));
}
console.log(`Uploading ${MANIFEST.package}@${MANIFEST.version} (${(fs.statSync(ZIP).size / 1048576).toFixed(1)} MiB, manifest mode ${MODE})…`);

/* The archive is extracted while the request is open. The outcome is always
   reported and never retried automatically: a version that may exist is
   checked in the developer panel / on the CDN, not uploaded twice. */
const started = Date.now();
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;
let response;
try {
  response = await fetch(Config.SELLDONE_API_UPLOAD_URL, {
    method: "POST",
    body: form,
    headers: { Authorization: `Bearer ${Authentication.ACCESS_TOKEN}`, Accept: "application/json" },
  });
} catch (error) {
  console.log(`TRANSPORT ERROR after ${elapsed()}: ${error.message}; cause=${error?.cause?.code || error?.cause?.message || "?"}`);
  console.log("The version may still have been registered. Check the developer panel before any retry.");
  process.exit(3);
}
let text = "";
try {
  text = await response.text();
} catch (error) {
  console.log(`BODY CUT OFF after ${elapsed()}: ${error.cause?.code || error.message}`);
  console.log("Check the developer panel before any retry.");
  process.exit(3);
}
let data = null;
try {
  data = JSON.parse(text);
} catch {
  /* not JSON */
}
console.log(`HTTP ${response.status} after ${elapsed()}`);
if (response.ok && data && !data.error) {
  console.log("UPLOAD ACCEPTED:", data.message || "");
  if (data.deploy) {
    const { layout_id, id, version, status } = data.deploy;
    console.log("deploy:", JSON.stringify({ layout_id, id, version, status }));
    console.log(`panel: ${Config.SELLDONE_SERVICE_URL}/developer/layouts/${layout_id}`);
  }
  process.exit(0);
}
console.log("UPLOAD REJECTED:", data ? JSON.stringify(data).slice(0, 600) : text.slice(0, 600));
process.exit(1);
