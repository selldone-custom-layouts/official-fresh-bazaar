/*
 * Selldone Layout post-build step. Runs after `vite build` (package.json
 * "build-production"), so both `npm run layout:release` and the official
 * `selldone deploy` (which runs build-production, then zips dist/) see an
 * upload-safe dist/.
 *
 *   node scripts/layout-postbuild.mjs            # fix + check dist/
 *   node scripts/layout-postbuild.mjs --check    # check only
 *
 * 1. Removes dist/index.html: every ZIP member must be under app/ ("Archive
 *    paths must be safe relative app/ paths."); the Layout host supplies the
 *    HTML, index.html is never used in production.
 * 2. Flattens every SVG file and inline SVG data URI to passive attributes
 *    (scripts/layout-svg-flatten.mjs).
 * 3. Fails (exit 1) unless:
 *    - dist/ holds only app/, with app/shop.js and app/shop.css;
 *    - at most MAX_FILES files (the upload is extracted inside one ~100 s
 *      request; ~714 files were cut off and burned the version);
 *    - every file name is [A-Za-z0-9._-] only;
 *    - every JS file starts with "use strict"; (Selldone stores the sniffed
 *      MIME type; `import{` sniffs as text/x-java) — and, where the `file`
 *      tool exists, none sniffs as anything but JavaScript/text;
 *    - no JS file imports shop.js (loaded through a redirect, a second
 *      import of it runs the app twice);
 *    - no SVG (file or data URI) carries an attribute or element outside the
 *      passive whitelist, a character reference, href, DOCTYPE or script.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const APP = path.join(DIST, "app");
const MAX_FILES = 340;
const CHECK_ONLY = process.argv.includes("--check");

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
const relDist = (f) => path.relative(DIST, f).split(path.sep).join("/");

if (!fs.existsSync(path.join(APP, "shop.js"))) {
  console.error("dist/app/shop.js is missing; run `npx vite build` first.");
  process.exit(1);
}

/* ━━━━━━━━━━━━━━━━━━ 1–2. Fix ━━━━━━━━━━━━━━━━━━ */
if (!CHECK_ONLY) {
  fs.rmSync(path.join(DIST, "index.html"), { force: true });
  const flatten = spawnSync(process.execPath, [path.join(ROOT, "scripts/layout-svg-flatten.mjs"), APP], {
    stdio: "inherit",
  });
  if (flatten.status !== 0) {
    console.error("SVG flattening failed.");
    process.exit(1);
  }
}

/* ━━━━━━━━━━━━━━━━━━ 3. Check ━━━━━━━━━━━━━━━━━━ */
const errors = [];
const files = walk(DIST);
const names = files.map(relDist);

for (const n of names) if (!n.startsWith("app/")) errors.push(`outside app/: ${n}`);
if (!fs.existsSync(path.join(APP, "shop.css"))) errors.push("missing app/shop.css");
if (files.length > MAX_FILES) errors.push(`${files.length} files; keep at most ${MAX_FILES}`);
for (const n of names) {
  if (n.split("/").some((part) => !/^[A-Za-z0-9._-]+$/.test(part))) errors.push(`unsafe file name: ${n}`);
}

const js = files.filter((f) => /\.m?js$/i.test(f));
for (const f of js) {
  const text = fs.readFileSync(f, "utf8");
  if (!text.startsWith('"use strict";')) errors.push(`does not start with "use strict";: ${relDist(f)}`);
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) errors.push(`raw control character (sniffs as binary): ${relDist(f)}`);
  if (/(?:from|import)\s*["'](?:\.\.?\/)+shop\.js["']|import\(\s*["'](?:\.\.?\/)+shop\.js["']\s*\)/.test(text)) {
    errors.push(`imports shop.js: ${relDist(f)}`);
  }
}

/* The MIME type Selldone will store: libmagic, as `file` reports it. */
let sniffed = "skipped (no `file` tool)";
try {
  const out = execFileSync("file", ["-b", "--mime-type", ...js.map((f) => path.relative(ROOT, f))], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const types = out.trim().split(/\r?\n/);
  types.forEach((t, i) => {
    if (!/javascript|ecmascript|^text\/plain$/.test(t)) errors.push(`sniffs as ${t}: ${relDist(js[i])}`);
  });
  sniffed = [...new Set(types)].join(", ");
} catch (error) {
  if (error.code !== "ENOENT") errors.push(`file --mime-type failed: ${error.message}`);
}

/* Passive SVG: the whitelist layout-svg-flatten.mjs writes. */
const KEEP = new Set([
  "id", "class", "viewBox", "width", "height", "x", "y", "x1", "x2", "y1", "y2",
  "cx", "cy", "r", "rx", "ry", "d", "points", "transform", "offset",
  "gradientUnits", "gradientTransform", "stop-color", "stop-opacity",
  "fill", "fill-opacity", "fill-rule", "clip-rule", "clip-path", "mask",
  "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
  "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "opacity",
  "font-family", "font-size", "font-weight", "text-anchor", "aria-label",
]);
function svgProblems(svg) {
  const problems = [];
  if (/<!DOCTYPE|<script|<style|<foreignObject|<metadata|<!ENTITY/i.test(svg)) problems.push("active element/DOCTYPE");
  for (const tag of svg.matchAll(/<[A-Za-z][^<>]*>/g)) {
    for (const a of tag[0].matchAll(/\s([^\s=<>"'/]+)\s*=\s*("[^"]*"|'[^']*')/g)) {
      const name = a[1];
      if (name === "xmlns" || name.startsWith("xmlns:")) continue;
      if (!KEEP.has(name)) problems.push(`attribute ${name}`);
      if (/&#/.test(a[2])) problems.push(`character reference in ${name}`);
    }
  }
  return [...new Set(problems)];
}
let svgFiles = 0;
let svgUris = 0;
for (const f of files.filter((f) => /\.svg$/i.test(f))) {
  svgFiles++;
  const p = svgProblems(fs.readFileSync(f, "utf8"));
  if (p.length) errors.push(`SVG not passive (${p.slice(0, 4).join(", ")}): ${relDist(f)}`);
}
const MARK = "data:image/svg+xml";
for (const f of files.filter((f) => /\.(css|m?js)$/i.test(f))) {
  const text = fs.readFileSync(f, "utf8");
  if (/\.css$/i.test(f) && /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) errors.push(`raw control character in ${relDist(f)}`);
  for (let at = text.indexOf(MARK); at >= 0; at = text.indexOf(MARK, at + MARK.length)) {
    const comma = text.indexOf(",", at);
    const meta = text.slice(at + MARK.length, comma);
    if (!/;base64$/i.test(meta)) {
      /* The flattener rewrites every static SVG URI as base64, so a literal
         SVG after a plain "data:image/svg+xml," is one it could not read
         (e.g. UTF-16 text). URIs built at run time ("…,"+x, `…,${x}`) are
         not static content and are skipped. */
      const after = text.slice(comma + 1, comma + 80).replace(/\\0|\0|�|\\u0000/g, "");
      if (!/^(\\?["'`+]|\$\{)/.test(after) && /^[\s\S]{0,24}(%3c|<)/i.test(after)) {
        errors.push(`inline SVG left un-flattened in ${relDist(f)} at ${at}`);
      }
      continue;
    }
    const m = text.slice(comma + 1).match(/^[A-Za-z0-9+/=]+/);
    if (!m) continue;
    const svg = Buffer.from(m[0], "base64").toString("utf8");
    if (!/<svg[\s>:]/i.test(svg)) continue;
    svgUris++;
    const p = svgProblems(svg);
    if (p.length) errors.push(`inline SVG not passive (${p.slice(0, 4).join(", ")}) in ${relDist(f)} at ${at}`);
  }
}

/* ━━━━━━━━━━━━━━━━━━ Report ━━━━━━━━━━━━━━━━━━ */
const byDir = {};
let total = 0;
for (const f of files) {
  const d = path.dirname(relDist(f));
  byDir[d] = (byDir[d] || 0) + 1;
  total += fs.statSync(f).size;
}
console.log(
  `Layout dist: ${files.length}/${MAX_FILES} files, ${(total / 1048576).toFixed(1)} MiB ` +
    `(${Object.entries(byDir).map(([d, n]) => `${d}: ${n}`).join(", ")})`,
);
console.log(`JS files: ${js.length}, all "use strict"; first, sniffed as: ${sniffed}`);
console.log(`SVG checked: ${svgFiles} files, ${svgUris} inline data URIs`);
if (errors.length) {
  console.error(`LAYOUT CHECK FAILED (${errors.length}):\n  ${errors.slice(0, 40).join("\n  ")}`);
  process.exit(1);
}
console.log("LAYOUT CHECK PASSED");
