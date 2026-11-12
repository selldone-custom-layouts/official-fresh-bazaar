/*
 * Ported from selldone-custom-layouts/official-valero
 * scripts/kalio-svg-flatten.mjs; changed only here, in the usage line, and
 * by removing <script>/<foreignObject> elements in flattenSvgText().
 * Run by scripts/layout-postbuild.mjs after every production build.
 */
/*
 * Selldone Layout release step: flatten SVG references in the built Layout.
 *
 *   node scripts/layout-svg-flatten.mjs dist/app
 *
 * The Selldone Layout upload rejects an archive containing SVG files with
 * "Active SVG attributes are not permitted." The SVGs in this build are the
 * platform's own assets — vue-flag-icon country flags, the page-builder
 * landscape set, Selldone illustration icons — and none of them carries a
 * script, an event handler or an external link. What they do carry is the
 * standard internal reuse pattern: <use xlink:href="#id"> and gradients that
 * inherit through xlink:href="#other".
 *
 * It also normalises what an upload scanner treats as unsafe in any SVG,
 * whether or not it uses references: a <!DOCTYPE> declaration (sixteen
 * Illustrator exports carry one — the XML entity-expansion vector), editor
 * <metadata>, an xmlns:xlink declaration nothing uses any more, and UTF-16
 * encoding (five files), which byte-level scanners cannot read and which hid
 * those files from every check here until they were decoded.
 *
 * The reference rewrite itself: every <use> becomes a <g> holding a copy of
 * the element it pointed at (with the use's x/y folded into a translate), and
 * every gradient or pattern that inherited through href gets the missing
 * attributes and stops copied in. The drawn result is the same picture; the
 * files simply no longer reference anything. It refuses to leave any href
 * behind, so a pattern it does not understand fails the release loudly
 * instead of shipping a broken flag.
 */
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

const XLINK = "http://www.w3.org/1999/xlink";
const root = process.argv[2];
if (!root || !fs.existsSync(root)) {
  console.error("usage: node scripts/layout-svg-flatten.mjs <dist/app>");
  process.exit(2);
}

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );

/* UTF-16 (with BOM) and UTF-8 BOM both become plain UTF-8 text. */
function readSvg(file) {
  const buf = fs.readFileSync(file);
  if (buf[0] === 0xff && buf[1] === 0xfe) return { text: buf.subarray(2).toString("utf16le"), recoded: true };
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return { text: swapped.toString("utf16le"), recoded: true };
  }
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { text: buf.subarray(3).toString("utf8"), recoded: true };
  return { text: buf.toString("utf8"), recoded: false };
}

const UNSAFE = /href\s*=|<!DOCTYPE|<metadata|xmlns:xlink/i;

const hrefOf = (el) => el.getAttribute("href") ?? el.getAttributeNS(XLINK, "href");
const dropHref = (el) => {
  el.removeAttribute("href");
  el.removeAttributeNS(XLINK, "href");
};

/* Attributes of <use> that carry over to the wrapper group. Geometry
   (x, y, width, height) is handled separately; href is the thing removed. */
const USE_SKIP = new Set(["x", "y", "width", "height", "href", "xlink:href"]);

function flattenUses(doc) {
  let guard = 0;
  for (;;) {
    const uses = [...doc.getElementsByTagName("use")];
    if (!uses.length) return;
    if (++guard > 25) throw new Error("<use> nesting deeper than 25 levels");

    for (const use of uses) {
      const ref = hrefOf(use) || "";
      if (!ref) {
        use.remove(); // a <use> pointing at nothing draws nothing (the Bolivia flag has two)
        continue;
      }
      if (!ref.startsWith("#")) throw new Error(`<use> with non-local href "${ref}"`);
      const target = doc.getElementById(ref.slice(1));
      if (!target) {
        use.remove(); // a dangling reference draws nothing either way
        continue;
      }

      const g = doc.createElementNS(use.namespaceURI, "g");
      for (const attr of [...use.attributes]) {
        if (!USE_SKIP.has(attr.name)) g.setAttribute(attr.name, attr.value);
      }
      const x = parseFloat(use.getAttribute("x") || "0");
      const y = parseFloat(use.getAttribute("y") || "0");
      if (x || y) {
        const t = g.getAttribute("transform");
        g.setAttribute("transform", `${t ? t + " " : ""}translate(${x} ${y})`);
      }

      const copy = target.cloneNode(true);
      copy.removeAttribute("id");
      for (const el of copy.querySelectorAll("[id]")) el.removeAttribute("id");
      if (copy.localName === "symbol") {
        // A symbol draws its children; a viewBox would also scale them.
        if (copy.getAttribute("viewBox")) throw new Error("<use> of a <symbol> with a viewBox");
        while (copy.firstChild) g.appendChild(copy.firstChild);
      } else {
        g.appendChild(copy);
      }
      use.replaceWith(g);
    }
  }
}

/* Gradients and patterns may inherit attributes and stops through href. */
function flattenInheritance(doc) {
  const kinds = ["linearGradient", "radialGradient", "pattern"];
  let changed = true;
  let guard = 0;
  while (changed) {
    changed = false;
    if (++guard > 25) throw new Error("gradient inheritance deeper than 25 levels");
    for (const kind of kinds) {
      for (const el of [...doc.getElementsByTagName(kind)]) {
        const ref = hrefOf(el);
        if (!ref) continue;
        if (!ref.startsWith("#")) throw new Error(`<${kind}> with non-local href "${ref}"`);
        const base = doc.getElementById(ref.slice(1));
        if (base && hrefOf(base)) continue; // resolve the base first
        if (base) {
          for (const attr of [...base.attributes]) {
            if (attr.name === "id" || attr.name === "href" || attr.name === "xlink:href") continue;
            if (!el.hasAttribute(attr.name)) el.setAttribute(attr.name, attr.value);
          }
          if (!el.children.length) {
            for (const child of [...base.children]) el.appendChild(child.cloneNode(true));
          }
        }
        dropHref(el);
        changed = true;
      }
    }
  }
}

/* ▆▆▆▆ Passive SVG ▆▆▆▆

   The upload scanner admits SVG files made only of passive vector shapes,
   and it enforces that with an attribute whitelist. Probed one construct at a
   time against archives that could never deploy, it accepts the attributes
   below and rejects, among others: style="…", a <style> element, xml:space,
   enable-background, version, overflow, vector-effect, color, display,
   visibility, data-*, fx/fy, spreadMethod, letter-spacing, word-spacing and
   the editor properties Inkscape writes (mix-blend-mode, isolation,
   font-variant-*, text-indent and friends).

   So: CSS is applied by hand — <style> class rules, then style="…", in that
   cascade order and over any presentation attribute, as a browser would —
   and written back as the plain attributes the scanner accepts. What cannot
   be expressed that way is dropped; elements CSS hid are removed, since they
   draw nothing; currentColor is resolved from color before color goes. */
const KEEP = new Set([
  "id", "class", "viewBox", "width", "height", "x", "y", "x1", "x2", "y1", "y2",
  "cx", "cy", "r", "rx", "ry", "d", "points", "transform", "offset",
  "gradientUnits", "gradientTransform", "stop-color", "stop-opacity",
  "fill", "fill-opacity", "fill-rule", "clip-rule", "clip-path", "mask",
  "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
  "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "opacity",
  "font-family", "font-size", "font-weight", "text-anchor", "aria-label",
]);
/* CSS properties that survive as attributes of the same name. */
const CSS_TO_ATTR = new Set([...KEEP].filter((a) => /-|^(fill|stroke|opacity|mask)$/.test(a)));

function parseDecls(text) {
  const out = {};
  for (const part of String(text).split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    const value = part.slice(i + 1).replace(/!important/i, "").trim();
    if (prop && value) out[prop] = value;
  }
  return out;
}

function makePassive(doc) {
  const computed = new Map(); // element -> { prop: value }
  const add = (el, decls) => computed.set(el, { ...(computed.get(el) || {}), ...decls });

  // 1. Stylesheet rules, in document order (later rules win, as in CSS).
  for (const style of [...doc.getElementsByTagName("style")]) {
    const css = style.textContent.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@[^{]+\{[^}]*\}/g, "");
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const decls = parseDecls(rule[2]);
      for (const selector of rule[1].split(",").map((s) => s.trim()).filter(Boolean)) {
        let matched = [];
        try {
          matched = [...doc.querySelectorAll(selector)];
        } catch {
          continue; // a selector jsdom cannot parse matches nothing it can style
        }
        for (const el of matched) add(el, decls);
      }
    }
    style.remove();
  }

  // 2. Inline style attributes outrank the stylesheet.
  for (const el of [...doc.querySelectorAll("[style]")]) {
    add(el, parseDecls(el.getAttribute("style")));
    el.removeAttribute("style");
  }

  // 3. Write CSS back as attributes; CSS outranks presentation attributes.
  const hidden = [];
  for (const [el, decls] of computed) {
    for (const [prop, value] of Object.entries(decls)) {
      if ((prop === "display" && value === "none") || (prop === "visibility" && value === "hidden")) {
        hidden.push(el);
      } else if (prop === "color") {
        el.setAttribute("color", value); // resolved below, then dropped
      } else if (CSS_TO_ATTR.has(prop)) {
        el.setAttribute(prop, value);
      }
    }
  }
  for (const el of [...doc.querySelectorAll('[display="none"], [visibility="hidden"]')]) hidden.push(el);
  /* Only drawn content is removed. Paint servers, clip paths and masks are
     never displayed themselves, so a stray display:none on one (or inside
     one) says nothing about whether something else still references it. */
  const NOT_DRAWN = "defs, clipPath, mask, linearGradient, radialGradient, pattern, symbol, marker";
  for (const el of hidden) if (!el.closest(NOT_DRAWN)) el.remove();

  // 4. currentColor takes the nearest color, the way the browser resolves it.
  for (const el of [...doc.querySelectorAll("*")]) {
    for (const attr of ["fill", "stroke", "stop-color"]) {
      if (el.getAttribute(attr)?.toLowerCase() !== "currentcolor") continue;
      let n = el;
      while (n && n.nodeType === 1 && !n.getAttribute("color")) n = n.parentElement;
      const color = n && n.nodeType === 1 ? n.getAttribute("color") : null;
      if (color) el.setAttribute(attr, color);
    }
  }

  // 5. Everything off the whitelist goes. Namespace declarations stay.
  //    Newlines and tabs inside a value (Illustrator wraps long path data)
  //    serialize as &#xA;&#x9; — character references, the usual way to
  //    smuggle "javascript" past a filter, so the scanner refuses them. Path
  //    and point data treat any whitespace alike; one space draws the same.
  for (const el of [...doc.querySelectorAll("*")]) {
    for (const attr of [...el.attributes]) {
      if (attr.name === "xmlns" || attr.name.startsWith("xmlns:")) continue;
      if (!KEEP.has(attr.name)) {
        el.removeAttribute(attr.name);
      } else if (/[\t\n\r]/.test(attr.value)) {
        el.setAttribute(attr.name, attr.value.replace(/\s+/g, " ").trim());
      }
    }
  }
}

/* <svg:svg xmlns:svg="…"> is the same element as <svg>, but a scanner that
   whitelists element names sees "svg:svg". Inkscape writes it (the
   "013-disappointed" emoji); every prefixed SVG element gets its plain name. */
function unprefixSvg(doc) {
  const SVG = "http://www.w3.org/2000/svg";
  const prefixed = [...doc.getElementsByTagName("*")].filter((el) => el.namespaceURI === SVG && el.prefix);
  for (const el of prefixed.reverse()) {
    const plain = doc.createElementNS(SVG, el.localName);
    for (const attr of [...el.attributes]) {
      if (attr.name === "xmlns:" + el.prefix) continue;
      if (attr.namespaceURI) plain.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
      else plain.setAttribute(attr.name, attr.value);
    }
    while (el.firstChild) plain.appendChild(el.firstChild);
    el.replaceWith(plain);
  }
}

/* One SVG document in, the same picture out, passive and self-contained. */
function flattenSvgText(src) {
  const dom = new JSDOM(src, { contentType: "image/svg+xml" });
  const doc = dom.window.document;
  doc.doctype?.remove();
  unprefixSvg(doc);
  for (const m of [...doc.getElementsByTagName("metadata")]) m.remove();
  /* Added in this port: one inlined vendor logo carries an empty <script/>;
     scripts and foreign HTML never belong in a passive picture. */
  for (const m of [...doc.querySelectorAll("script, foreignObject")]) m.remove();
  flattenUses(doc);
  flattenInheritance(doc);
  makePassive(doc);

  const leftover = [...doc.querySelectorAll("*")].filter((el) => hrefOf(el) !== null);
  if (leftover.length) throw new Error(`href left on <${leftover[0].localName}>`);
  doc.documentElement.removeAttributeNS("http://www.w3.org/2000/xmlns/", "xlink");
  doc.documentElement.removeAttribute("xmlns:xlink");

  /* The XML declaration is dropped: the output is UTF-8, which is the
     default, so a stale encoding="UTF-16" can never contradict it. */
  const out = new dom.window.XMLSerializer().serializeToString(doc);
  if (UNSAFE.test(out)) throw new Error("serialized output still contains href, DOCTYPE, metadata or xlink");
  return out;
}

let scanned = 0;
let rewritten = 0;
const failures = [];

/* Every SVG file goes through: the whitelist is about attributes any file can
   carry, not only the ones that use references. */
for (const file of walk(root).filter((f) => f.toLowerCase().endsWith(".svg"))) {
  scanned++;
  const { text: src } = readSvg(file);
  try {
    fs.writeFileSync(file, flattenSvgText(src));
    rewritten++;
  } catch (error) {
    failures.push(`${path.relative(root, file)}: ${error.message}`);
  }
}

/* SVG data URIs inside the bundles. Vite inlines any SVG under 4 KB straight
   into the CSS or JS that imports it — that is how 370 flag references ended
   up inside shop.css — and some vendor CSS ships its own (the Mapbox logo).
   The upload scanner decodes those too, so each one is decoded, flattened,
   and written back as base64, which needs no escaping in url() or a string.

   The URI is bounded by whatever opened it, not by a character class: a
   percent-encoded SVG keeps raw single quotes and brackets (fill='…',
   matrix(…)), so it runs to the matching closing quote of url("…") or of the
   JS string, or to ")" for an unquoted url(), where CSS requires brackets to
   be escaped anyway. */
const MARK = "data:image/svg+xml";

function closeOf(text, start, opener) {
  if (opener === "(") return text.indexOf(")", start);
  for (let i = start; i < text.length; i++) {
    if (text[i] === "\\") { i++; continue; }
    if (text[i] === opener) return i;
  }
  return -1;
}

function decodeSvgUri(uri) {
  const comma = uri.indexOf(",");
  if (comma < 0) return null;
  const meta = uri.slice(MARK.length, comma);
  const payload = uri.slice(comma + 1);
  try {
    if (/;base64$/i.test(meta)) return Buffer.from(payload, "base64").toString("utf8");
    // A JS string keeps its own escapes (\' \" \\); undo those first.
    return decodeURIComponent(payload.replace(/\\(.)/g, "$1"));
  } catch {
    return null;
  }
}

let uris = 0;
let urisRewritten = 0;

for (const file of walk(root).filter((f) => /\.(css|js)$/i.test(f))) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(MARK)) continue;

  let out = "";
  let cursor = 0;
  let changed = false;
  for (let at = text.indexOf(MARK); at >= 0; at = text.indexOf(MARK, at + MARK.length)) {
    const opener = text[at - 1];
    if (!`"'\`(`.includes(opener)) continue;
    const end = closeOf(text, at, opener);
    if (end < 0) continue;
    uris++;

    /* Every inline SVG is made passive, not only the ones with references:
       the build now inlines small SVG files on purpose, and what ships
       inside the CSS meets the same standard as what ships beside it. */
    const svg = decodeSvgUri(text.slice(at, end));
    if (!svg || !/<svg[\s>:]/i.test(svg)) continue;
    try {
      const flat = flattenSvgText(svg);
      out += text.slice(cursor, at) + `${MARK};base64,${Buffer.from(flat, "utf8").toString("base64")}`;
      cursor = end;
      changed = true;
      urisRewritten++;
    } catch (error) {
      failures.push(`${path.relative(root, file)} (inline SVG at ${at}): ${error.message}`);
    }
  }
  if (changed) fs.writeFileSync(file, out + text.slice(cursor));
}

console.log(`SVG files scanned: ${scanned}, flattened: ${rewritten}`);
console.log(`Inline SVG data URIs found: ${uris}, flattened: ${urisRewritten}`);
if (failures.length) {
  console.error("FAILED:\n  " + failures.join("\n  "));
  process.exit(1);
}
