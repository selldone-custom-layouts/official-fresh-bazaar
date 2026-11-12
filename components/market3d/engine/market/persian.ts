/*
 * Fresh Market 3D — Persian bazaar setting.
 * Brick arcades with pointed (four-centred) arches and turquoise tile bands, a tiled entrance portal
 * (sar-dar) with the shop name in a tile inscription, brick bazaar domes and windcatchers, a tiled pool
 * (howz) with a fountain, cypress trees, carpets and brass lanterns.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  TubeGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Shape,
  ShapeGeometry,
  Float32BufferAttribute,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  ConeGeometry,
  IcosahedronGeometry,
  CircleGeometry,
  Vector2,
} from "three";
import { displace, lathe, merge, paint, transformed } from "../util/geo";
import { heightToNormalCanvas, makeCanvas, toTexture } from "../util/textures";
import { NOISE, Rng, clamp } from "../util/noise";
import { canvasPattern, EnvAssets, pbr, PBRSet } from "./realism";
import { buildCypresses } from "./cypress";
import { buildFountain } from "./fountain";
import { bazaarTiles, tileMaterial } from "./tilework";
import { archPoints } from "./arch";
import { buildPortal } from "./portal";

// ───────────────────────────── palettes ─────────────────────────────
const TURQ = "#1a9aa6";
const TURQ_L = "#3cc0c8";
const COBALT = "#1b3f8f";
const GOLD = "#e7b84a";
const IVORY = "#f3ead6";
const BRICK = [172, 116, 76];

// ───────────────────────────── arch path ─────────────────────────────
function tracePath(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>, X: (x: number) => number, Y: (y: number) => number) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
}

// ───────────────────────────── painted textures ─────────────────────────────

function bricks(ctx: CanvasRenderingContext2D, W: number, H: number, pxPerM: number, seed = 1) {
  const rng = new Rng(seed);
  const bh = 0.07 * pxPerM; // brick course height
  const bw = 0.24 * pxPerM;
  ctx.fillStyle = "#a89478";
  ctx.fillRect(0, 0, W, H);
  for (let row = 0, y = 0; y < H; row++, y += bh) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -off; x < W; x += bw) {
      const t = rng.range(-18, 14);
      ctx.fillStyle = `rgb(${BRICK[0] + t},${BRICK[1] + t * 0.8},${BRICK[2] + t * 0.6})`;
      ctx.fillRect(x + 1.2, y + 1.2, bw - 2.4, bh - 2.4);
    }
  }
}

/** Small 8-point star tile pattern (girih-like) filling a rectangle. */
function starTiles(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, cell: number, a = COBALT, b = TURQ, c = IVORY) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  ctx.fillStyle = a;
  ctx.fillRect(x0, y0, w, h);
  for (let y = y0; y < y0 + h + cell; y += cell)
    for (let x = x0; x < x0 + w + cell; x += cell) {
      const cx = x + cell / 2, cy = y + cell / 2, r = cell * 0.42;
      ctx.fillStyle = b;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2 + Math.PI / 8;
        const rr = i % 2 ? r * 0.55 : r;
        ctx.lineTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  ctx.restore();
}

/** Arabesque swirls for spandrels and the dome. */
function arabesque(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, seed: number, base = TURQ) {
  const rng = new Rng(seed);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(x0, y0, w, h);
  const n = Math.max(6, Math.round((w * h) / 2600));
  for (let i = 0; i < n; i++) {
    const cx = x0 + rng.next() * w, cy = y0 + rng.next() * h, r = rng.range(8, 22);
    ctx.strokeStyle = rng.next() < 0.5 ? IVORY : GOLD;
    ctx.lineWidth = rng.range(1.5, 3);
    ctx.beginPath();
    ctx.arc(cx, cy, r, rng.range(0, 3), rng.range(3.5, 6.2));
    ctx.stroke();
    ctx.fillStyle = rng.next() < 0.5 ? COBALT : "#f2f0ea";
    ctx.beginPath();
    ctx.ellipse(cx + r, cy, r * 0.28, r * 0.14, rng.range(0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

interface BayDims {
  W: number;
  H: number;
  lower: { w: number; spring: number; apex: number };
  upper: { w: number; y0: number; spring: number; apex: number };
}

const BAY: BayDims = {
  W: 3.6,
  H: 7.4,
  lower: { w: 2.3, spring: 2.5, apex: 3.85 },
  upper: { w: 1.7, y0: 4.6, spring: 5.55, apex: 6.55 },
};

type FacadeMode = "color" | "normal" | "arm";

/**
 * Overlay a grid of individual tiles on a tiled area: per-tile glaze variation and light grout joints
 * (colour), rough grout between glossy tiles (AO/roughness). `cell` is the tile size in pixels.
 */
function tileGrid(ctx: CanvasRenderingContext2D, mode: FacadeMode, x0: number, y0: number, w: number, h: number, cell: number, seed: number) {
  if (mode === "normal") return;
  const rng = new Rng(seed);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  if (mode === "color") {
    for (let y = y0; y < y0 + h; y += cell)
      for (let x = x0; x < x0 + w; x += cell) {
        const v = rng.range(-1, 1);
        ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v * 0.07})` : `rgba(20,10,0,${-v * 0.1})`;
        ctx.fillRect(x, y, cell, cell);
      }
  }
  ctx.strokeStyle = mode === "color" ? "rgba(214,204,182,0.75)" : "rgb(235,225,0)";
  ctx.lineWidth = Math.max(1.5, cell * 0.045);
  ctx.beginPath();
  for (let x = x0; x <= x0 + w; x += cell) {
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + h);
  }
  for (let y = y0; y <= y0 + h; y += cell) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + w, y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * One arcade bay painted at 1:1 — brick field (photo-scanned when available) with glazed tile
 * frames, spandrels, cornice and floor band. The same layout is painted three times (colour,
 * normal, AO/roughness) so the brick reads rough and deep while the glazed tile reads smooth and shiny.
 */
function paintFacade(d: BayDims, seed: number, mode: FacadeMode, brick?: PBRSet) {
  const px = brick ? 200 : 140; // pixels per metre
  const W = Math.round(d.W * px), H = Math.round(d.H * px);
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d")!;
  const flat = mode === "normal" ? "#8080ff" : mode === "arm" ? "rgb(255,86,0)" : null; // glazed tile: AO 1, roughness ~0.34 (no sparkle)
  if (brick) {
    const img = mode === "color" ? brick.images.diff : mode === "normal" ? brick.images.nor : brick.images.arm;
    ctx.fillStyle = canvasPattern(ctx, img, px, 1.1, seed * 37);
    ctx.fillRect(0, 0, W, H);
  } else if (mode === "color") bricks(ctx, W, H, px, seed);
  else {
    ctx.fillStyle = mode === "normal" ? "#8080ff" : "rgb(255,235,0)";
    ctx.fillRect(0, 0, W, H);
  }
  const X = (x: number) => (x + d.W / 2) * px;
  const Y = (y: number) => H - y * px;
  const band = 0.16 * px;
  // alfiz frames with arabesque spandrels
  for (const a of [{ ...d.lower, y0: 0 }, d.upper]) {
    const fx = X(-a.w / 2 - 0.32), fw = (a.w + 0.64) * px, fy = Y(a.apex + 0.3), fh = (a.apex + 0.3 - a.y0) * px;
    if (flat) {
      ctx.fillStyle = flat;
      ctx.fillRect(fx, fy, fw, (a.apex + 0.3 - a.spring) * px * 0.98);
    } else arabesque(ctx, fx, fy, fw, (a.apex + 0.3 - a.spring) * px * 0.98, seed + a.apex * 10, TURQ);
    tileGrid(ctx, mode, fx, fy, fw, (a.apex + 0.3 - a.spring) * px * 0.98, 0.15 * px, seed + a.apex * 3);
    ctx.strokeStyle = flat || COBALT;
    ctx.lineWidth = band;
    ctx.strokeRect(fx + band / 2, fy + band / 2, fw - band, fh + band);
    ctx.strokeStyle = flat || IVORY;
    ctx.lineWidth = 2;
    ctx.strokeRect(fx + band, fy + band, fw - band * 2, fh);
    // tile band hugging the arch
    const pts = archPoints(a.w + 0.18, a.y0, a.spring, a.apex + 0.1);
    tracePath(ctx, pts, X, Y);
    ctx.strokeStyle = flat || TURQ_L;
    ctx.lineWidth = band * 0.9;
    ctx.stroke();
    if (!flat) {
      tracePath(ctx, pts, X, Y);
      ctx.strokeStyle = GOLD;
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // cornice: star tiles + muqarnas-like teeth
  if (flat) {
    ctx.fillStyle = flat;
    ctx.fillRect(0, Y(d.H), W, 0.42 * px);
    ctx.fillRect(0, Y(4.35), W, 0.2 * px);
  } else {
    starTiles(ctx, 0, Y(d.H), W, 0.42 * px, 0.21 * px);
    ctx.fillStyle = "rgba(60,30,10,0.35)";
    for (let x = 0; x < W; x += 0.18 * px) {
      ctx.beginPath();
      ctx.moveTo(x, Y(d.H - 0.42));
      ctx.lineTo(x + 0.09 * px, Y(d.H - 0.62));
      ctx.lineTo(x + 0.18 * px, Y(d.H - 0.42));
      ctx.fill();
    }
    // floor band between storeys
    starTiles(ctx, 0, Y(4.35), W, 0.2 * px, 0.2 * px, TURQ, COBALT, GOLD);
  }
  tileGrid(ctx, mode, 0, Y(d.H), W, 0.42 * px, 0.21 * px, seed + 91);
  tileGrid(ctx, mode, 0, Y(4.35), W, 0.2 * px, 0.2 * px, seed + 57);
  if (mode === "color") {
    // weathering: soot and dust gather low, the glaze fades a little
    const img = ctx.getImageData(0, 0, W, H);
    for (let y = 0; y < H; y += 1)
      for (let x = 0; x < W; x += 1) {
        const k = (y * W + x) * 4;
        const n = NOISE.fbm(x / 90, y / 90, seed, 3) * 0.08 + Math.pow(y / H, 3) * 0.16;
        const r = img.data[k], g = img.data[k + 1], b = img.data[k + 2];
        const l = (r + g + b) / 3;
        img.data[k] = (r * 0.88 + l * 0.12) * (1 - n);
        img.data[k + 1] = (g * 0.88 + l * 0.12) * (1 - n);
        img.data[k + 2] = (b * 0.88 + l * 0.12) * (1 - n);
      }
    ctx.putImageData(img, 0, 0);
  }
  return toTexture(c, mode === "color", false, 8);
}

/** Tileable ripple normal map (sum of integer-frequency waves, so it wraps seamlessly). */
function rippleNormal(): CanvasTexture {
  const N = 256;
  const rng = new Rng(7);
  const waves = Array.from({ length: 16 }, () => ({ kx: rng.int(-7, 7), ky: rng.int(-7, 7), ph: rng.range(0, Math.PI * 2), a: rng.range(0.3, 1) }));
  const h = new Float32Array(N * N);
  let lo = Infinity, hi = -Infinity;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let v = 0;
      for (const w of waves) v += (w.a * Math.sin(Math.PI * 2 * ((w.kx * x) / N + (w.ky * y) / N) + w.ph)) / Math.max(1, Math.hypot(w.kx, w.ky));
      h[y * N + x] = v;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  for (let i = 0; i < h.length; i++) h[i] = (h[i] - lo) / (hi - lo);
  return toTexture(heightToNormalCanvas(h, N, N, 3), false, true, 4);
}

function facadeTexture(d: BayDims, seed: number): CanvasTexture {
  return paintFacade(d, seed, "color");
}

function brickTexture(scale = 1): CanvasTexture {
  const c = makeCanvas(256, 256);
  bricks(c.getContext("2d")!, 256, 256, 256 * scale, 9);
  return toTexture(c, true, true, 8);
}

function tileTexture(kind: "star" | "arabesque", seed = 1): CanvasTexture {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext("2d")!;
  if (kind === "star") starTiles(ctx, 0, 0, 512, 512, 64);
  else arabesque(ctx, 0, 0, 512, 512, seed, TURQ);
  return toTexture(c, true, true, 8);
}

function carpetTexture(seed: number): CanvasTexture {
  const rng = new Rng(seed);
  const W = 512, H = 768;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d")!;
  const field = rng.pick(["#8f1d22", "#7a1a2a", "#1d2f5a", "#a3471f"]);
  const border = rng.pick(["#1d2f5a", "#2b1a12", "#8f1d22"]);
  ctx.fillStyle = border;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = IVORY;
  ctx.fillRect(28, 28, W - 56, H - 56);
  ctx.fillStyle = field;
  ctx.fillRect(40, 40, W - 80, H - 80);
  // border motifs
  ctx.fillStyle = GOLD;
  for (let x = 40; x < W - 40; x += 32) {
    ctx.beginPath();
    ctx.arc(x + 16, 16, 7, 0, Math.PI * 2);
    ctx.arc(x + 16, H - 16, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let y = 40; y < H - 40; y += 32) {
    ctx.beginPath();
    ctx.arc(16, y + 16, 7, 0, Math.PI * 2);
    ctx.arc(W - 16, y + 16, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  // central medallion
  const cx = W / 2, cy = H / 2;
  for (let r = 150, i = 0; r > 20; r -= 26, i++) {
    ctx.fillStyle = [IVORY, border, GOLD, field, "#2e6a5a"][i % 5];
    ctx.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const rr = r * (k % 2 ? 0.8 : 1);
      ctx.lineTo(cx + Math.cos(a) * rr * 0.75, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  // corner spandrels + scattered boteh
  ctx.fillStyle = IVORY;
  for (const [x, y] of [[40, 40], [W - 40, 40], [40, H - 40], [W - 40, H - 40]]) {
    ctx.beginPath();
    ctx.arc(x, y, 70, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(240,210,150,0.55)";
  for (let i = 0; i < 40; i++) {
    const x = rng.range(60, W - 60), y = rng.range(60, H - 60);
    if (Math.hypot((x - cx) / 0.75, y - cy) < 170) continue;
    ctx.beginPath();
    ctx.ellipse(x, y, 7, 12, rng.range(0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  // wool texture
  const img = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < W * H; i++) {
    const n = (Math.random() - 0.5) * 18;
    img.data[i * 4] += n;
    img.data[i * 4 + 1] += n;
    img.data[i * 4 + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, true, false, 8);
}

function calligraphyTexture(text: string, rtl: boolean): CanvasTexture {
  const W = 2048, H = 256;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = COBALT;
  ctx.fillRect(0, 0, W, H);
  arabesque(ctx, 0, 0, W, H, 5, COBALT);
  ctx.fillStyle = "rgba(20,40,110,0.55)";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, W - 20, H - 20);
  ctx.fillStyle = "#fbf6e8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  (ctx as any).direction = rtl ? "rtl" : "ltr";
  let size = 150;
  const fam = `"IranNastaliq", "Nastaliq", "Vazirmatn", "Noto Naskh Arabic", "Georgia", serif`;
  ctx.font = `700 ${size}px ${fam}`;
  while (ctx.measureText(text).width > W - 160 && size > 40) ctx.font = `700 ${(size -= 6)}px ${fam}`;
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 8;
  ctx.fillText(text, W / 2, H / 2 + 6);
  return toTexture(c, true, false, 8);
}

// ───────────────────────────── builders ─────────────────────────────

function bayGeometry(d: BayDims): BufferGeometry {
  const s = new Shape();
  s.moveTo(-d.W / 2, 0);
  s.lineTo(d.W / 2, 0);
  s.lineTo(d.W / 2, d.H);
  s.lineTo(-d.W / 2, d.H);
  s.closePath();
  const holes = [archPoints(d.lower.w, 0.0, d.lower.spring, d.lower.apex), archPoints(d.upper.w, d.upper.y0, d.upper.spring, d.upper.apex)];
  for (const pts of holes) {
    const h = new Shape();
    // holes must be clockwise relative to the outer contour
    [...pts].reverse().forEach(([x, y], i) => (i ? h.lineTo(x, y) : h.moveTo(x, y)));
    s.holes.push(h as any);
  }
  const g = new ExtrudeGeometry(s, { depth: 0.55, bevelEnabled: false, curveSegments: 4 });
  // front cap UVs → 0..1 over the bay for the painted facade
  const pos = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  const nor = g.getAttribute("normal");
  for (let i = 0; i < pos.count; i++) {
    const nz = nor.getZ(i);
    if (Math.abs(nz) > 0.9) uv.setXY(i, (pos.getX(i) + d.W / 2) / d.W, pos.getY(i) / d.H);
    else uv.setXY(i, (pos.getX(i) + pos.getZ(i)) * 1.2, pos.getY(i) * 1.2);
  }
  g.translate(0, 0, -0.55); // front face at z = 0
  return g;
}

/** A flat strip in the bay's front plane with UVs in texture repeats (u along x, v up). */
function strip(x0: number, x1: number, y0: number, y1: number, z: number, uLen: number, vLen: number): BufferGeometry {
  const g = new PlaneGeometry(x1 - x0, y1 - y0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
  const pos = g.getAttribute("position"), uv = g.getAttribute("uv");
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - x0) / uLen, (pos.getY(i) - y0) / vLen);
  return g;
}

/**
 * Real relief in front of the bay (bay-local, front face at z = 0), split by finish:
 *  spandrel — haft-rang islimi panels framing each arch (one inverted-U shape, UVs centred on the arch)
 *  border   — the faces of the raised alfiz frames and of the ledge between storeys
 *  girih    — the star-and-cross band under the cornice
 *  rope     — the twisted turquoise moulding around each arch
 *  base     — frame sides, cornice ledges and muqarnas teeth (vertex coloured)
 */
function bayRelief(d: BayDims) {
  const base: BufferGeometry[] = [], spandrel: BufferGeometry[] = [], border: BufferGeometry[] = [], girihP: BufferGeometry[] = [], ropeP: BufferGeometry[] = [];
  const col = (g: BufferGeometry, hex: string, jitter = 0.06) => {
    const c = new Color(hex);
    return paint(g, (p, _n, _uv, out) => out.copy(c).multiplyScalar(1 - jitter + NOISE.noise(p.x * 6, p.y * 6, p.z * 6) * jitter * 2));
  };
  const BAND = 0.16;
  for (const a of [{ ...d.lower, y0: 0 }, d.upper]) {
    // rope moulding hugging the arch: u along the curve (one texture per ~0.45 m), v around the tube
    const pts = archPoints(a.w + 0.18, a.y0, a.spring, a.apex + 0.1, 40).map(([x, y]) => new Vector3(x, y, 0.035));
    const curve = new CatmullRomCurve3(pts, false, "centripetal");
    const tube = new TubeGeometry(curve, 96, 0.05, 10, false);
    const len = curve.getLength();
    const tuv = tube.getAttribute("uv");
    for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getX(i) * (len / 0.45), tuv.getY(i));
    ropeP.push(tube);

    // raised alfiz frame: cobalt body, tiled border on its face
    const fx = a.w / 2 + 0.32 - BAND / 2, top = a.apex + 0.3 - BAND / 2, h = a.apex + 0.3 - a.y0;
    for (const sx of [-1, 1]) {
      base.push(col(transformed(new BoxGeometry(BAND, h, 0.05), [sx * fx, a.y0 + h / 2, 0.025]), "#18306f"));
      const fr = strip(-BAND / 2, BAND / 2, 0, h, 0, BAND * 8, BAND);
      // run the band vertically: swap u/v so the motif flows up the jamb
      const uv = fr.getAttribute("uv"), pos = fr.getAttribute("position");
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getY(i) / (BAND * 8), (pos.getX(i) + BAND / 2) / BAND);
      fr.translate(sx * fx, a.y0, 0.0505);
      border.push(fr);
    }
    base.push(col(transformed(new BoxGeometry(fx * 2 + BAND, BAND, 0.05), [0, top, 0.025]), "#18306f"));
    border.push(strip(-fx - BAND / 2, fx + BAND / 2, top - BAND / 2, top + BAND / 2, 0.0505, BAND * 8, BAND));

    // spandrel panel: the frame's inner rectangle above the springing line, minus the arch
    const xl = -fx + BAND / 2, xr = fx - BAND / 2, yb = a.spring, yt = top - BAND / 2;
    const archPts = archPoints(a.w + 0.26, a.y0, a.spring, a.apex + 0.12, 40).filter(([, y]) => y >= yb - 1e-6);
    const shape = new Shape();
    shape.moveTo(xl, yb);
    shape.lineTo(xl, yt);
    shape.lineTo(xr, yt);
    shape.lineTo(xr, yb);
    // along the arch from its right springing point over the apex back to the left one
    [...archPts].reverse().forEach(([x, y]) => shape.lineTo(x, y));
    shape.lineTo(xl, yb);
    const sp = new ShapeGeometry(shape, 24);
    const spos = sp.getAttribute("position");
    const suv = new Float32Array(spos.count * 2);
    for (let i = 0; i < spos.count; i++) {
      suv[i * 2] = (spos.getX(i) - xl) / (xr - xl);
      suv[i * 2 + 1] = (spos.getY(i) - yb) / (yt - yb);
    }
    sp.setAttribute("uv", new Float32BufferAttribute(suv, 2));
    sp.translate(0, 0, 0.012);
    spandrel.push(sp);
  }
  // cornice: star band, ledges and muqarnas teeth
  girihP.push(strip(-d.W / 2, d.W / 2, d.H - 0.43, d.H - 0.13, 0.008, 0.3 * 4, 0.3));
  base.push(col(transformed(new BoxGeometry(d.W + 0.02, 0.13, 0.3), [0, d.H - 0.065, 0.15]), "#cdb894", 0.1));
  base.push(col(transformed(new BoxGeometry(d.W + 0.02, 0.06, 0.2), [0, d.H - 0.16, 0.1]), "#bfa984", 0.1));
  const n = Math.round(d.W / 0.18);
  for (let i = 0; i < n; i++) {
    const x = -d.W / 2 + (i + 0.5) * (d.W / n);
    const tooth = new ConeGeometry(0.085, 0.22, 4, 1);
    tooth.rotateY(Math.PI / 4);
    tooth.rotateX(Math.PI);
    base.push(col(transformed(tooth, [x, d.H - 0.3, 0.085]), i % 2 ? "#1f9fb0" : "#1d3a8c", 0.08));
  }
  // ledge between storeys, its face tiled with the border band
  base.push(col(transformed(new BoxGeometry(d.W + 0.02, 0.18, 0.09), [0, 4.25, 0.045]), "#c6b28f", 0.1));
  border.push(strip(-d.W / 2 - 0.01, d.W / 2 + 0.01, 4.16, 4.34, 0.0905, 0.18 * 8, 0.18));
  return { base: merge(base), spandrel: merge(spandrel), border: merge(border), girih: merge(girihP), rope: merge(ropeP) };
}

export interface PersianBuild {
  group: Group;
  obstacles: Array<{ c: Vector3; r: number }>;
  update: (t: number) => void;
}

export interface PersianOptions {
  plazaRadius: number;
  /** angles (radians, around +Y, 0 = -Z) occupied by stalls; arcade bays fill the ring behind them */
  shopTitle: string;
  rtl: boolean;
  shadows: boolean;
  quality: "low" | "medium" | "high";
  stallAnchors: Array<{ center: Vector3; normal: Vector3 }>;
  assets?: EnvAssets;
  sunDir?: Vector3;
  pixelHeight?: () => number;
}

export function buildPersianBazaar(o: PersianOptions): PersianBuild {
  const group = new Group();
  const R = o.plazaRadius;
  const ringR = R + 3.0;
  const shadows = o.shadows;

  // ── Arcade ring (instanced bays)
  const sets = o.assets?.sets || {};
  const brickSet = sets.brown_brick_02;
  const plasterSet = sets.clay_plaster;
  const facade = brickSet
    ? (() => {
        const arm = paintFacade(BAY, 3, "arm", brickSet);
        return new MeshStandardMaterial({ map: paintFacade(BAY, 3, "color", brickSet), normalMap: paintFacade(BAY, 3, "normal", brickSet), roughnessMap: arm, aoMap: arm, roughness: 1, metalness: 0 });
      })()
    : new MeshStandardMaterial({ map: facadeTexture(BAY, 3), roughness: 0.88 });
  const sideMat = brickSet ? pbr(brickSet, [1 / 1.1, 1 / 1.1]) : new MeshStandardMaterial({ map: brickTexture(1), roughness: 0.9 });
  const bayGeo = bayGeometry(BAY);
  const circumference = Math.PI * 2 * ringR;
  const count = Math.floor(circumference / BAY.W);
  const step = (Math.PI * 2) / count;
  const portalHalf = 0.42; // radians kept free for the portal at +Z
  const mats: Matrix4[] = [];
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const placements: Array<{ a: number; pos: Vector3 }> = [];
  for (let i = 0; i < count; i++) {
    const a = i * step; // 0 = -Z, increasing clockwise when seen from above
    const dz = Math.abs(((a - Math.PI + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (dz < portalHalf) continue;
    const pos = new Vector3(Math.sin(a) * ringR, 0, -Math.cos(a) * ringR);
    q.setFromAxisAngle(up, -a);
    mats.push(new Matrix4().compose(pos, q, new Vector3(1, 1, 1)));
    placements.push({ a, pos });
  }
  const bays = new InstancedMesh(bayGeo, [facade, sideMat] as any, mats.length);
  mats.forEach((m, i) => bays.setMatrixAt(i, m));
  bays.castShadow = shadows;
  bays.receiveShadow = true;
  group.add(bays);
  // haft-rang tilework in real relief, instanced across every bay
  const tiles = bazaarTiles(o.quality);
  const relief = bayRelief(BAY);
  const reliefParts: Array<[BufferGeometry, Material]> = [
    [relief.base, new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.1 })],
    [relief.spandrel, tileMaterial(tiles.spandrel)],
    [relief.border, tileMaterial(tiles.border)],
    [relief.girih, tileMaterial(tiles.girih)],
    [relief.rope, tileMaterial(tiles.rope)],
  ];
  for (const [geo, mat] of reliefParts) {
    const im = new InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = shadows;
    im.receiveShadow = true;
    group.add(im);
  }

  // recess back walls + roof slab (one merged ring each)
  const backParts: BufferGeometry[] = [];
  const roofParts: BufferGeometry[] = [];
  const lanternSpots: Vector3[] = [];
  const carpetSpots: Array<{ pos: Vector3; a: number }> = [];
  placements.forEach(({ a, pos }, i) => {
    const o3 = new Object3D();
    o3.position.copy(pos);
    o3.rotation.y = -a;
    o3.updateMatrix();
    const back = new BoxGeometry(BAY.W, BAY.H, 0.2);
    back.translate(0, BAY.H / 2, -1.6);
    back.applyMatrix4(o3.matrix);
    backParts.push(back);
    const roof = new BoxGeometry(BAY.W + 0.02, 0.3, 2.2);
    roof.translate(0, BAY.H + 0.15, -1.0);
    roof.applyMatrix4(o3.matrix);
    roofParts.push(roof);
    lanternSpots.push(new Vector3(0, BAY.lower.apex - 0.55, -0.7).applyMatrix4(o3.matrix));
    if (i % 3 === 1) carpetSpots.push({ pos: new Vector3(0, 0.05, -1.45).applyMatrix4(o3.matrix), a });
  });
  // arch recesses: straw-and-mud (kahgel) plaster
  const recessMat = plasterSet
    ? pbr(plasterSet, [BAY.W / 1.6, BAY.H / 1.6], { color: new Color("#b8a58c") })
    : new MeshStandardMaterial({ map: brickTexture(1), color: new Color("#8a7660"), roughness: 0.95 });
  if (!plasterSet) recessMat.map!.repeat.set(3, 6);
  const backMesh = new Mesh(merge(backParts), recessMat);
  backMesh.receiveShadow = true;
  group.add(backMesh);
  const roofMesh = new Mesh(merge(roofParts), plasterSet ? pbr(plasterSet, [2, 1], { color: new Color("#c9b79c") }) : new MeshStandardMaterial({ color: "#a8906e", roughness: 0.95 }));
  roofMesh.castShadow = shadows;
  group.add(roofMesh);
  // floor of the arcade gallery
  const gallery = new Mesh(new CylinderGeometry(ringR + 1.7, ringR + 1.7, 0.12, 96, 1, true), new MeshStandardMaterial({ color: "#8f7d66", roughness: 1, side: DoubleSide }));
  gallery.position.y = 0.06;
  group.add(gallery);

  // hanging carpets inside some arches
  carpetSpots.forEach((s, i) => {
    const m = new Mesh(new PlaneGeometry(1.4, 2.1), new MeshStandardMaterial({ map: carpetTexture(40 + i), roughness: 0.95, side: DoubleSide }));
    m.position.copy(s.pos).add(new Vector3(0, 1.25, 0));
    m.rotation.y = -a2(s.a);
    m.castShadow = shadows;
    group.add(m);
  });

  // brass lanterns in every lower arch
  const brass = new MeshStandardMaterial({ color: "#b98a3a", metalness: 0.85, roughness: 0.35 });
  const glow = new MeshStandardMaterial({ color: "#ffe2a8", emissive: new Color("#ffb04a"), emissiveIntensity: 4.2, roughness: 0.4 });
  const lanternBody = merge([
    transformed(new CylinderGeometry(0.11, 0.13, 0.05, 10), [0, -0.17, 0]),
    transformed(new ConeGeometry(0.13, 0.16, 10), [0, 0.12, 0]),
    transformed(new CylinderGeometry(0.006, 0.006, 0.55, 4), [0, 0.45, 0]),
    transformed(new TorusGeometry(0.11, 0.012, 6, 16), [0, -0.12, 0], [Math.PI / 2, 0, 0]),
  ]);
  const lanternGlass = new CylinderGeometry(0.085, 0.1, 0.24, 10);
  const lb = new InstancedMesh(lanternBody, brass, lanternSpots.length);
  const lg = new InstancedMesh(lanternGlass, glow, lanternSpots.length);
  lanternSpots.forEach((p, i) => {
    const m = new Matrix4().makeTranslation(p.x, p.y, p.z);
    lb.setMatrixAt(i, m);
    lg.setMatrixAt(i, m);
  });
  group.add(lb, lg);

  // ── Entrance gate (sar-dar) at +Z, facing the plaza — see portal.ts
  const portal = buildPortal({ shopTitle: o.shopTitle, rtl: o.rtl, shadows, quality: o.quality, sets, brass, glow });
  portal.position.set(0, 0, ringR + 0.7);
  portal.rotation.y = Math.PI;
  group.add(portal);

  // ── Bazaar skyline: a brick dome with a skylight over every bay (as in the covered bazaars of
  // Kashan and Isfahan) and Yazd-style windcatchers (badgir) rising behind the arcades. No religious
  // architecture — this is a market.
  const brickMat = brickSet ? pbr(brickSet, [3, 2], { color: new Color("#e2cfb2") }) : new MeshStandardMaterial({ map: brickTexture(0.25), roughness: 0.9 });
  const plasterMat = plasterSet ? pbr(plasterSet, [2, 4], { color: new Color("#d8c3a2") }) : new MeshStandardMaterial({ color: "#c9b391", roughness: 0.95 });
  {
    const domeGeo = merge([
      transformed(new SphereGeometry(1.45, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0, 0], [0, 0, 0], [1, 0.62, 1]),
      // drum ring and the little skylight lantern on top
      transformed(new CylinderGeometry(1.5, 1.55, 0.35, 28, 1, true), [0, -0.12, 0]),
      transformed(new CylinderGeometry(0.32, 0.36, 0.38, 12), [0, 1.05, 0]),
      transformed(new CylinderGeometry(0.42, 0.42, 0.07, 12), [0, 1.27, 0]),
    ]);
    const domes = new InstancedMesh(domeGeo, brickMat, placements.length);
    const m = new Matrix4(), q2 = new Quaternion(), up2 = new Vector3(0, 1, 0);
    placements.forEach(({ a: ang }, i) => {
      const rr = ringR + 1.05;
      m.compose(new Vector3(Math.sin(ang) * rr, BAY.H + 0.32, -Math.cos(ang) * rr), q2.setFromAxisAngle(up2, -ang), new Vector3(1, 1, 1));
      domes.setMatrixAt(i, m);
    });
    domes.castShadow = shadows;
    domes.receiveShadow = true;
    group.add(domes);

    // windcatcher: plastered shaft, slotted head with a dark interior, stepped cap
    const tower = (h: number) => {
      const solid: BufferGeometry[] = [];
      const dark: BufferGeometry[] = [];
      solid.push(transformed(new BoxGeometry(2.3, h, 2.3), [0, h / 2, 0]));
      const head = 3.4, y0 = h;
      dark.push(transformed(new BoxGeometry(2.1, head, 2.1), [0, y0 + head / 2, 0]));
      const fins = 6;
      for (let side = 0; side < 4; side++) {
        for (let k = 0; k <= fins; k++) {
          const x = -1.2 + (k / fins) * 2.4;
          const fin = new BoxGeometry(0.16, head, 0.34);
          fin.translate(x, y0 + head / 2, 1.2);
          fin.rotateY((side * Math.PI) / 2);
          solid.push(fin);
        }
      }
      solid.push(transformed(new BoxGeometry(2.7, 0.28, 2.7), [0, y0 + head + 0.14, 0]));
      solid.push(transformed(new BoxGeometry(2.45, 0.22, 2.45), [0, y0 + head + 0.39, 0]));
      solid.push(transformed(new BoxGeometry(2.6, 0.18, 2.6), [0, y0 - 0.09, 0]));
      return { solid: merge(solid), dark: merge(dark) };
    };
    const darkMat = new MeshStandardMaterial({ color: "#1b1410", roughness: 1 });
    const spots: Array<[number, number, number]> = [
      [0, ringR + 5.5, 11.5],
      [2.05, ringR + 4.5, 10],
      [-2.2, ringR + 5, 12.5],
    ];
    for (const [ang, rr, h] of spots) {
      const t = tower(h);
      const g2 = new Group();
      g2.add(new Mesh(t.solid, plasterMat), new Mesh(t.dark, darkMat));
      g2.position.set(Math.sin(ang) * rr, 0, -Math.cos(ang) * rr);
      g2.rotation.y = -ang;
      g2.traverse((c: any) => c.isMesh && ((c.castShadow = false), (c.receiveShadow = true)));
      group.add(g2);
    }
  }

  // ── Central howz (pool) with a fountain — see fountain.ts
  const obstacles: Array<{ c: Vector3; r: number }> = [];
  const PR = 1.7;
  const fountain = buildFountain({
    radius: PR,
    shadows,
    quality: o.quality,
    marble: sets.marble_01,
    brass,
    sunDir: o.sunDir || new Vector3(0.5, 0.6, 0.6),
    pixelHeight: o.pixelHeight || (() => window.innerHeight),
  });
  group.add(fountain.group);
  obstacles.push({ c: new Vector3(0, 0, 0), r: PR + 0.2 });

  // ── Cypress trees (sarv) flanking the pool and the portal
  const cypressSpots: Array<[number, number]> = [
    [3.4, -3.4], [-3.4, -3.4],
    [5.2, R * 0.82], [-5.2, R * 0.82],
  ];
  const cypresses = buildCypresses(cypressSpots, shadows);
  group.add(cypresses.group);
  cypressSpots.forEach(([x, z]) => obstacles.push({ c: new Vector3(x, 0, z), r: 0.7 }));
  // tiled planter rings around the cypresses
  const planterGeo = new CylinderGeometry(0.6, 0.65, 0.35, 32, 1);
  {
    // wrap the star band around the planter: ~3.8 m of band around, one band high
    const uv = planterGeo.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (Math.PI * 1.2) / 1.2, uv.getY(i));
  }
  const planterRing = new InstancedMesh(planterGeo, tileMaterial(bazaarTiles(o.quality).girih), cypressSpots.length);
  cypressSpots.forEach(([x, z], i) => planterRing.setMatrixAt(i, new Matrix4().makeTranslation(x, 0.17, z)));
  planterRing.receiveShadow = true;
  group.add(planterRing);

  // ── Carpets on the ground in front of every other stall
  o.stallAnchors.forEach((s, i) => {
    if (i % 2) return;
    const m = new Mesh(new PlaneGeometry(1.5, 2.3), new MeshStandardMaterial({ map: carpetTexture(70 + i), roughness: 0.97 }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.atan2(s.normal.x, s.normal.z) + Math.PI / 2;
    m.position.copy(s.center).addScaledVector(s.normal, 1.7);
    m.position.y = 0.012;
    m.receiveShadow = true;
    group.add(m);
  });

  const update = (t: number) => {
    cypresses.update(t);
    fountain.update(t);
    glow.emissiveIntensity = 4 + Math.sin(t * 1.7) * 0.12 + Math.sin(t * 4.3) * 0.05; // soft candle breathing, no strobing
  };
  void a2;
  return { group, obstacles, update };
}

function a2(a: number) {
  return a;
}
