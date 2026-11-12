/*
 * Package dist/ as dist.zip — the exact archive scripts/layout-deploy.mjs
 * uploads. Run after `npm run build-production` (vite build + post-build).
 *
 *   node scripts/layout-package.mjs
 *
 * Members are the contents of dist/ (no dist/ wrapper), with explicit
 * directory members (app/, app/js/, app/assets/) as the Selldone extractor
 * requires, DEFLATE level 9. The ZIP is then re-read and checked: every
 * member under app/, app/ + app/shop.js + app/shop.css present, safe names,
 * no duplicates, at most 50 MiB, member count, and shop.js/shop.css
 * byte-identical to dist/ (so a stale dist.zip can never be uploaded).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const OUT = path.join(ROOT, "dist.zip");
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_MEMBERS = 340;

/* The post-build checks must pass first (check only, nothing is changed). */
const check = spawnSync(process.execPath, [path.join(ROOT, "scripts/layout-postbuild.mjs"), "--check"], {
  stdio: "inherit",
});
if (check.status !== 0) {
  console.error("dist/ is not upload-safe; run `npm run build-production` first.");
  process.exit(1);
}

const zip = new JSZip();
const addDir = (abs, relDir) => {
  const entries = fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    const rel = relDir ? `${relDir}/${e.name}` : e.name;
    const full = path.join(abs, e.name);
    if (e.isDirectory()) {
      zip.folder(rel); // explicit "rel/" directory member
      addDir(full, rel);
    } else if (e.isFile()) {
      zip.file(rel, fs.readFileSync(full), { date: new Date(fs.statSync(full).mtimeMs) });
    } else {
      throw new Error(`unsupported entry in dist/: ${rel}`);
    }
  }
};
addDir(DIST, "");

const buffer = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 9 },
  platform: "UNIX",
});
const tmp = `${OUT}.tmp`;
fs.writeFileSync(tmp, buffer);

/* Re-read what was written and validate it. */
const errors = [];
const back = await JSZip.loadAsync(fs.readFileSync(tmp), { checkCRC32: true });
const names = Object.keys(back.files);
for (const n of names) {
  if (!n.startsWith("app/")) errors.push(`member outside app/: ${n}`);
  if (n.includes("\\") || n.startsWith("/") || n.split("/").includes("..")) errors.push(`unsafe member: ${n}`);
  if (n.split("/").some((p) => p && !/^[A-Za-z0-9._-]+$/.test(p))) errors.push(`unsafe name: ${n}`);
}
if (new Set(names).size !== names.length) errors.push("duplicate members");
for (const required of ["app/", "app/shop.js", "app/shop.css"]) {
  if (!back.files[required]) errors.push(`missing member ${required}`);
}
if (back.files["app/"] && !back.files["app/"].dir) errors.push("app/ is not a directory member");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
for (const f of ["app/shop.js", "app/shop.css"]) {
  if (!back.files[f]) continue;
  const inZip = await back.files[f].async("nodebuffer");
  if (sha(inZip) !== sha(fs.readFileSync(path.join(DIST, f)))) errors.push(`${f} in the ZIP differs from dist/`);
}
if (buffer.length > MAX_BYTES) errors.push(`ZIP is ${buffer.length} bytes; the upload limit is ${MAX_BYTES} (50 MiB)`);
if (names.length > MAX_MEMBERS) errors.push(`${names.length} members; keep at most ${MAX_MEMBERS}`);

if (errors.length) {
  fs.rmSync(tmp, { force: true });
  console.error(`PACKAGE FAILED:\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
fs.renameSync(tmp, OUT);
const files = names.filter((n) => !back.files[n].dir).length;
console.log(
  `dist.zip: ${names.length} members (${files} files + ${names.length - files} directories), ` +
    `${(buffer.length / 1048576).toFixed(1)} MiB of 50 MiB, all under app/; shop.js sha256 ${sha(fs.readFileSync(path.join(DIST, "app/shop.js"))).slice(0, 12)}`,
);
console.log("PACKAGE PASSED");
