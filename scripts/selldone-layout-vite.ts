/*
 * Build rules that make the production output uploadable as a Selldone Layout.
 *
 * Ported from the sibling Layouts in the selldone-custom-layouts organisation
 * (official-valero: vite.config.ts and its wiki pages "Build and Upload" and
 * "Troubleshooting"), where each rule was learned from a failed upload:
 *
 *  1. File count. Selldone extracts the ZIP inside the upload request, behind a
 *     ~100 s limit; at ~714 files the request was cut off and the version was
 *     burned. -> layoutChunks() (few JS files), cssCodeSplit:false (one
 *     stylesheet), layoutInlineLimit() (small SVG/PNG inline), woff2Only(),
 *     flagIconsFromCdn().
 *  2. Selldone stores the MIME type it sniffs. A chunk that opens with
 *     `import{` is stored as text/x-java and browsers refuse it.
 *     -> sniffAsJavaScript(): every JS file opens with "use strict";.
 *  3. Selldone reaches shop.js through a redirect. A chunk importing
 *     "../shop.js" loads the app twice (old page flashes, then blank).
 *     -> layoutChunks(): the entry keeps only itself, shared code is "core".
 *     -> checkLayoutChunks(): the build fails if any chunk imports the entry
 *        or if the chunk graph has a static cycle.
 *  4. Archive paths must be safe relative app/ paths. -> safeName().
 *
 * The SVG attribute whitelist (rule 5) and dist/index.html removal (rule 4)
 * are post-build steps: scripts/layout-postbuild.mjs.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ File names ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * Emitted file names limited to [A-Za-z0-9._-]. The Layout upload rejects the
 * whole archive ("Archive paths must be safe relative app/ paths.") for a
 * space or a bracket, and the platform's own assets include
 * "011-pine tree.svg" and "IRANSansWeb(FaNum).woff2". Renaming at emit time
 * lets Vite rewrite every reference.
 */
export function safeName(name: string) {
  return (
    String(name || "asset")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "asset"
  );
}

/** The asset's file name without directory or extension. */
export function baseName(name: string) {
  return path.basename(name).replace(/\.[^.]+$/, "");
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Inlining ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * build.assetsInlineLimit. SVGs up to 16 KB and small PNG/GIF icons ride
 * inside the JS/CSS that use them (layout-postbuild.mjs makes inline SVGs
 * passive too). Everything else keeps Vite's 4 KB default, so the 3D assets
 * (.bin, .jpg/.webp textures, .hdr) stay files.
 */
export function layoutInlineLimit(file: string, content: Buffer): boolean | undefined {
  const f = file.toLowerCase().split("?")[0];
  if (f.endsWith(".svg")) {
    /* A UTF-16 SVG (a few Corel/Illustrator exports) would be inlined as
       mangled text the flattener cannot read; as a file it is re-encoded to
       UTF-8 and flattened like the rest. */
    if (content.includes(0)) return false;
    return content.length <= 16 * 1024;
  }
  if (f.endsWith(".png") || f.endsWith(".gif")) return content.length <= 12 * 1024;
  return undefined;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Chunks ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const rel = (id: string) =>
  path.relative(ROOT, id.split("?")[0].replace(/^\0/, "")).split(path.sep).join("/");

const packageOf = (id: string) => {
  const m = id.split("?")[0].replace(/\\/g, "/").match(/node_modules\/((?:@[^/]+\/)?[^/]+)/g);
  if (!m) return null;
  return m[m.length - 1].replace(/^node_modules\//, "");
};

/**
 * Storefront language packs (lang/<code>.ts, ~100 KB each) are loaded one at
 * a time when a shop's language is chosen. Separately they would be ~100
 * files, so they ride in regional bundles of 4–10 languages: a shop that
 * offers neighbouring languages usually loads one bundle. A code missing from
 * this table goes to "lang-other".
 */
const LANGUAGE_BUNDLES: Record<string, string[]> = {
  "western": ["de", "fr", "it", "es", "pt", "nl", "ht"],
  "iberian-celtic": ["ca", "gl", "eu", "co", "ga", "cy", "fy", "lb", "mt"],
  "nordic-baltic": ["da", "no", "sv", "fi", "is", "et", "lv", "lt"],
  "central-europe": ["pl", "cs", "sk", "hu", "sl", "hr", "bs", "sr", "ro"],
  "eastern-europe": ["ru", "uk", "be", "bg", "mk", "sq", "el"],
  "middle-east": ["ar", "fa", "he", "ur", "ps", "ku", "yi"],
  "anatolia-caucasus": ["tr", "az", "hy", "ka"],
  "central-asia": ["kk", "ky", "uz", "tk", "tt", "ug", "tg", "mn"],
  "south-asia": ["hi", "bn", "pa", "gu", "mr", "ne", "si"],
  "south-india": ["ta", "te", "kn", "ml", "or"],
  "southeast-asia": ["th", "lo", "km", "my", "vi", "id", "ms", "jv", "su", "mi"],
  "east-asia": ["zh", "zh-tw", "ja", "ko"],
  "africa-east-west": ["sw", "am", "so", "ha", "ig", "yo"],
  "africa-south": ["af", "zu", "xh", "st", "sn", "ny", "rw", "mg"],
};
const LANGUAGE_BUNDLE_OF = new Map(
  Object.entries(LANGUAGE_BUNDLES).flatMap(([bundle, codes]) => codes.map((c) => [c, bundle] as [string, string])),
);

/**
 * Lazy groups whose own code is smaller than this (before minification) are
 * merged into "<kind>-misc" (pages-misc, components-misc, lib-misc, …).
 */
const MIN_GROUP_BYTES = 100 * 1024;

/**
 * The fine group a lazily loaded module (a dynamic-import target) belongs
 * to. Every dynamic entry with the same key shares one chunk.
 */
function groupOf(id: string): string {
  const r = rel(id);
  const pkg = packageOf(id);
  if (pkg) return `lib-${safeName(pkg.replace(/^@/, "").replace("/", "-"))}`;

  let m = r.match(/^lang\/([a-z-]+)\.ts$/);
  if (m) return `lang-${LANGUAGE_BUNDLE_OF.get(m[1]) || "other"}`;

  if (r.startsWith("components/market3d/") || r.startsWith("pages/market/")) return "market3d";

  m = r.match(/^pages\/([^/]+)\//);
  if (m) return `pages-${m[1]}`;

  m = r.match(/^modules\/([^/]+)\/([^/]+)\/(?:([^/]+)\/)?/);
  if (m) return `${m[1]}-${m[2]}${m[3] ? "-" + m[3] : ""}`;

  m = r.match(/^([^/]+)\//);
  return m ? `app-${m[1]}` : "app";
}

let plan: Map<string, string> | null = null;

/**
 * output.manualChunks.
 *
 *  - The entry (index.html -> shop.js) keeps only itself.
 *  - Everything the entry reaches statically goes into "core". A lazy chunk
 *    then imports "./core.[hash].js" and the entry "./js/core.[hash].js";
 *    both resolve against the address the browser landed on, so there is one
 *    core even when shop.js was requested through a redirect, and no chunk
 *    ever imports shop.js.
 *  - Every other module goes to the group (groupOf) of the dynamic entries
 *    that reach it. A module reached from two or more groups goes to
 *    "shared" — or to "lib-<package>" when it lives in node_modules.
 *
 * Why this cannot form a cycle: a module imported by a module of group set G
 * is reached from at least G, so imports only ever point to the same group,
 * to shared/lib chunks, or to core; shared only imports shared, lib and core;
 * core imports nothing lazy. checkLayoutChunks() verifies it on every build.
 */
export function layoutChunks(id: string, { getModuleInfo, getModuleIds }: any): string | undefined {
  if (!plan) plan = buildPlan(getModuleInfo, getModuleIds);
  return plan.get(id);
}

function buildPlan(getModuleInfo: any, getModuleIds: any) {
  const ids: string[] = [...getModuleIds()];
  const out = new Map<string, string>();

  /* 1. core: the static closure of the entries. */
  const core = new Set<string>();
  const entries = ids.filter((id) => getModuleInfo(id)?.isEntry);
  if (process.env.LAYOUT_CHUNK_REPORT) {
    console.log(`[layout-chunks] entries: ${entries.map((e) => `${rel(e)} (imports ${getModuleInfo(e)?.importedIds.length})`).join(", ")}`);
  }
  const queue = [...entries];
  while (queue.length) {
    const next = queue.pop()!;
    for (const imported of getModuleInfo(next)?.importedIds || []) {
      if (!core.has(imported)) {
        core.add(imported);
        queue.push(imported);
      }
    }
  }
  for (const id of entries) core.delete(id);
  for (const id of core) out.set(id, "core");

  /* 2. Lazy modules: which groups reach each one. */
  const dynamicEntries = new Set<string>();
  for (const id of ids) {
    for (const d of getModuleInfo(id)?.dynamicallyImportedIds || []) {
      if (!core.has(d) && !entries.includes(d)) dynamicEntries.add(d);
    }
  }
  const bytes = (id: string) => (getModuleInfo(id)?.code || "").length;
  const reach = (keyOf: (d: string) => string) => {
    const reachedBy = new Map<string, Set<string>>();
    for (const d of dynamicEntries) {
      const group = keyOf(d);
      const seen = new Set<string>([d]);
      const stack = [d];
      while (stack.length) {
        const m = stack.pop()!;
        if (!reachedBy.has(m)) reachedBy.set(m, new Set());
        reachedBy.get(m)!.add(group);
        for (const imported of getModuleInfo(m)?.importedIds || []) {
          if (core.has(imported) || entries.includes(imported) || seen.has(imported)) continue;
          seen.add(imported);
          stack.push(imported);
        }
      }
    }
    return reachedBy;
  };

  /* 3. Small fine groups merge into "<kind>-misc"; then reach again with the
        final keys, so the no-cycle argument holds for what is emitted. */
  const groupBytes = new Map<string, number>();
  for (const [id, groups] of reach(groupOf)) {
    if (groups.size !== 1) continue;
    const g = [...groups][0];
    groupBytes.set(g, (groupBytes.get(g) || 0) + bytes(id));
  }
  const finalGroupOf = (d: string) => {
    const g = groupOf(d);
    if (g.startsWith("lang-") || g === "market3d" || (groupBytes.get(g) || 0) >= MIN_GROUP_BYTES) return g;
    return `${g.split("-")[0]}-misc`;
  };
  const reachedBy = reach(finalGroupOf);

  /* 4. Modules reached from two or more groups: big vendor packages keep a
        chunk of their own (mapbox-gl must not load with every page), the
        rest go to "shared" (app code) or "lib-shared" (small packages). */
  const sharedPackageBytes = new Map<string, number>();
  for (const [id, groups] of reachedBy) {
    const pkg = packageOf(id);
    if (groups.size > 1 && pkg) sharedPackageBytes.set(pkg, (sharedPackageBytes.get(pkg) || 0) + bytes(id));
  }
  for (const [id, groups] of reachedBy) {
    if (groups.size === 1) {
      out.set(id, [...groups][0]);
      continue;
    }
    const pkg = packageOf(id);
    if (!pkg) out.set(id, "shared");
    else if ((sharedPackageBytes.get(pkg) || 0) >= MIN_GROUP_BYTES) out.set(id, `lib-${safeName(pkg.replace(/^@/, "").replace("/", "-"))}`);
    else out.set(id, "lib-shared");
  }

  if (process.env.LAYOUT_CHUNK_REPORT) report(out, getModuleInfo, reachedBy);
  return out;
}

/** LAYOUT_CHUNK_REPORT=1 npx vite build — planned chunks and their sizes before minification. */
function report(out: Map<string, string>, getModuleInfo: any, reachedBy: Map<string, Set<string>>) {
  const sizes = new Map<string, { n: number; bytes: number }>();
  const sharedBy = new Map<string, number>();
  for (const [id, chunk] of out) {
    const s = sizes.get(chunk) || { n: 0, bytes: 0 };
    const b = (getModuleInfo(id)?.code || "").length;
    s.n++;
    s.bytes += b;
    sizes.set(chunk, s);
    if (chunk === "shared") {
      const sig = [...(reachedBy.get(id) || [])].sort().join(" + ");
      sharedBy.set(sig, (sharedBy.get(sig) || 0) + b);
    }
  }
  const rows = [...sizes].sort((a, b) => b[1].bytes - a[1].bytes);
  console.log(`\n[layout-chunks] ${rows.length} planned chunks`);
  for (const [name, s] of rows) console.log(`  ${String(Math.round(s.bytes / 1024)).padStart(7)} KB  ${String(s.n).padStart(5)} mods  ${name}`);
  console.log(`[layout-chunks] "shared" is reached from:`);
  for (const [sig, b] of [...sharedBy].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${String(Math.round(b / 1024)).padStart(7)} KB  ${sig}`);
  }
}

/**
 * Build-time guard for rule 3: no chunk may import the entry (shop.js), and
 * the static import graph between chunks must be acyclic.
 */
export function checkLayoutChunks() {
  return {
    name: "selldone-layout-check-chunks",
    apply: "build" as const,
    enforce: "post" as const,
    generateBundle(_options: any, bundle: Record<string, any>) {
      const chunks = Object.values(bundle).filter((f: any) => f.type === "chunk");
      const entryFiles = new Set(chunks.filter((c: any) => c.isEntry).map((c: any) => c.fileName));
      const problems: string[] = [];
      for (const c of chunks as any[]) {
        for (const imp of [...c.imports, ...c.dynamicImports]) {
          if (entryFiles.has(imp)) problems.push(`${c.fileName} imports the entry ${imp}`);
        }
      }
      const graph = new Map((chunks as any[]).map((c) => [c.fileName, c.imports as string[]]));
      const state = new Map<string, number>();
      const visit = (f: string, trail: string[]) => {
        if (state.get(f) === 2) return;
        if (state.get(f) === 1) {
          problems.push(`static import cycle: ${[...trail.slice(trail.indexOf(f)), f].join(" -> ")}`);
          return;
        }
        state.set(f, 1);
        for (const next of graph.get(f) || []) visit(next, [...trail, f]);
        state.set(f, 2);
      };
      for (const f of graph.keys()) visit(f, []);
      if (problems.length) this.error(`Selldone Layout chunk check failed:\n  ${problems.join("\n  ")}`);
    },
  };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Plugins ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * Every emitted JS file opens with a "use strict" directive (rule 2).
 *
 * The Layout service stores each file with the MIME type libmagic reads from
 * its content. A chunk that opens with `import{…}from"./core.js";const` reads
 * as Java source (text/x-java) and browsers refuse to run it. The directive
 * makes libmagic read JavaScript and changes nothing at run time: module code
 * is strict already. It is added twice:
 *  - in a normal generateBundle, before Vite's HTML plugin runs: that plugin
 *    drops an entry chunk that is "entirely imports" (ours is: the entry
 *    only imports core) and points the HTML at core instead — app/shop.js
 *    would never be written;
 *  - again as the very last generateBundle handler (order "post"), because
 *    Vite puts its `const __vite__mapDeps=…` preload map at the top of the
 *    files that preload others, in front of the directive.
 *
 * The minifier also leaves raw control characters (U+0000–U+001F except tab
 * and line breaks, U+007F) inside string, template and regex literals —
 * apexcharts, mapbox-gl and the barcode library have them — and libmagic then
 * reads the whole file as binary "data" (application/octet-stream). Outside a
 * literal such a character is a syntax error, so each one is rewritten as the
 * equivalent \xNN escape. layout-postbuild re-checks both on every build.
 */
export function sniffAsJavaScript() {
  const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
  const fix = (bundle: Record<string, any>) => {
    for (const file of Object.values(bundle)) {
      if (file.type !== "chunk") continue;
      file.code = file.code.replace(CONTROL, (c: string) => `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
      if (!file.code.startsWith('"use strict";')) file.code = `"use strict";\n${file.code}`;
    }
  };
  return [
    {
      name: "selldone-layout-sniff-as-javascript",
      apply: "build" as const,
      generateBundle(_options: any, bundle: Record<string, any>) {
        fix(bundle);
      },
    },
    {
      name: "selldone-layout-sniff-as-javascript-final",
      apply: "build" as const,
      enforce: "post" as const,
      generateBundle: {
        order: "post" as const,
        handler(_options: any, bundle: Record<string, any>) {
          fix(bundle);
        },
      },
    },
  ];
}

/**
 * Web fonts as WOFF2 only. Font Awesome, Material Icons and the Persian face
 * declare each weight in up to four formats (EOT, WOFF2, WOFF, TTF); every
 * current browser picks WOFF2, so the other three only add files. Each
 * @font-face with a WOFF2 source keeps that source alone; one without WOFF2
 * is left as it was.
 */
export function woff2Only() {
  const FONT_FACE = /@font-face\s*\{[^}]*\}/g;
  /* Quoted URLs may contain parentheses ("IRANSansWeb(FaNum)_Black.woff2"). */
  const WOFF2_URL = /url\(\s*(?:'([^']+\.woff2[^']*)'|"([^"]+\.woff2[^"]*)"|([^'"()\s]+\.woff2[^'"()\s]*))\s*\)/;
  const SRC = /\bsrc\s*:[^;}]*;?/g;
  return {
    name: "selldone-layout-woff2-only",
    apply: "build" as const,
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!/\.(s?css)$/.test(id.split("?")[0]) || !code.includes("@font-face") || !code.includes(".woff2")) return null;
      const next = code.replace(FONT_FACE, (block) => {
        const woff2 = block.match(WOFF2_URL);
        if (!woff2) return block;
        const url = woff2[1] || woff2[2] || woff2[3];
        const body = block.replace(SRC, "").replace(/\}\s*$/, "");
        return `${body}src: url("${url}") format("woff2");}`;
      });
      return next === code ? null : { code: next, map: null };
    },
  };
}

/**
 * Country flags from jsDelivr instead of from the Layout archive.
 *
 * vue-flag-icon imports flag-icons.min.css, whose ~540 url(../flags/…) rules
 * are the largest group of files in the build (142 SVG files above the inline
 * limit, the rest inlined into shop.css). The same stylesheet is kept — same
 * classes, same flags — with each URL pointed at the identical flag-icons
 * version on jsDelivr, which Vite leaves untouched because it is absolute. A
 * flag that fails to load costs a flag image in a country or phone picker.
 */
export function flagIconsFromCdn() {
  const version = JSON.parse(
    fs.readFileSync(path.resolve(ROOT, "node_modules/flag-icons/package.json"), "utf8"),
  ).version;
  const cdn = `https://cdn.jsdelivr.net/npm/flag-icons@${version}/flags/`;
  return {
    name: "selldone-layout-flag-icons-from-cdn",
    apply: "build" as const,
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!/[\\/]flag-icons[\\/]css[\\/]flag-icons(\.min)?\.css$/.test(id.split("?")[0])) return null;
      return { code: code.replace(/url\((["']?)\.\.\/flags\//g, `url($1${cdn}`), map: null };
    },
  };
}

/** All build-only Layout plugins, in order. */
export function selldoneLayoutPlugins() {
  return [flagIconsFromCdn(), woff2Only(), ...sniffAsJavaScript(), checkLayoutChunks()];
}
