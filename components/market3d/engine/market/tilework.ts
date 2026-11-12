/*
 * Fresh Market 3D — haft-rang (seven-colour) Persian tilework, generated at high resolution.
 *
 * Patterns are drawn the way the craft is: colour fields separated by dark "cuerda seca" outlines in the
 * real palette (turquoise, lapis/cobalt, white, ochre-yellow, dark brown). They are then turned into
 * actual tiles by a finishing pass:
 *   • the pattern runs across a grid of square tiles with recessed, slightly dirty grout;
 *   • every tile is a little pillowed and tilted on its own, so the wall breaks reflections tile by tile;
 *   • glaze varies a touch from tile to tile, pools lighter in the centre, shows fine crazing;
 *   • a few corners are chipped, exposing the terracotta body;
 *   • glossy glaze (low roughness + clearcoat) against matte grout.
 * Output: colour, normal and AO/roughness maps for a MeshPhysicalMaterial.
 */
import { CanvasTexture, Color, DoubleSide, MeshPhysicalMaterial, RepeatWrapping, Vector2 } from "three";
import { heightToNormalCanvas, makeCanvas, toTexture } from "../util/textures";
import { NOISE, Rng } from "../util/noise";

export const PAL = {
  turquoise: "#1f9fb0",
  turquoiseLight: "#45bcc6",
  cobalt: "#1d3a8c",
  cobaltDeep: "#152a6a",
  white: "#efe8d6",
  ochre: "#d3a03a",
  green: "#3f8a4e",
  brown: "#2b1d14",
  terracotta: "#b77b55",
};

export interface TileSet {
  map: CanvasTexture;
  normalMap: CanvasTexture;
  arm: CanvasTexture;
}

type Draw = (ctx: CanvasRenderingContext2D, W: number, H: number, rng: Rng) => void;

// ───────────────────────────── drawing helpers ─────────────────────────────

/** a filled path with the dark cuerda-seca outline */
function fillOutlined(ctx: CanvasRenderingContext2D, color: string, outline = 3) {
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = outline;
  ctx.strokeStyle = PAL.brown;
  ctx.lineJoin = "round";
  ctx.stroke();
}

/** a stroked stem with outline: dark under-stroke, colour on top */
function stem(ctx: CanvasRenderingContext2D, path: () => void, width: number, color: string) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  path();
  ctx.lineWidth = width + 5;
  ctx.strokeStyle = PAL.brown;
  ctx.stroke();
  path();
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, wid: number, ang: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.45, -wid, len, 0);
  ctx.quadraticCurveTo(len * 0.45, wid, 0, 0);
  fillOutlined(ctx, color, 2.5);
  // midrib
  ctx.beginPath();
  ctx.moveTo(len * 0.1, 0);
  ctx.lineTo(len * 0.82, 0);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = "rgba(255,250,235,0.65)";
  ctx.stroke();
  ctx.restore();
}

/** a split palmette (islimi): two curling lobes */
function palmette(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, ang: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(s * 0.35, side * s * 0.05, s * 0.9, side * s * 0.25, s * 0.95, side * s * 0.62);
    ctx.bezierCurveTo(s * 0.75, side * s * 0.55, s * 0.55, side * s * 0.42, s * 0.62, side * s * 0.25);
    ctx.bezierCurveTo(s * 0.4, side * s * 0.22, s * 0.2, side * s * 0.12, 0, 0);
    fillOutlined(ctx, color, 2.5);
  }
  ctx.restore();
}

/** khatai rosette: layered petals with an ochre heart */
function rosette(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, petals: number, outer: string, inner: string) {
  ctx.save();
  ctx.translate(x, y);
  for (const [rad, col, k] of [
    [r, outer, 1],
    [r * 0.62, inner, 0.5],
  ] as Array<[number, string, number]>) {
    ctx.beginPath();
    for (let i = 0; i <= petals * 2; i++) {
      const a = (i / (petals * 2)) * Math.PI * 2 + k * 0.2;
      const rr = i % 2 ? rad * 0.55 : rad;
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else {
        const am = a - Math.PI / (petals * 2);
        ctx.quadraticCurveTo(Math.cos(am) * rr * 1.18, Math.sin(am) * rr * 1.18, Math.cos(a) * rr, Math.sin(a) * rr);
      }
    }
    fillOutlined(ctx, col, 2.5);
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
  fillOutlined(ctx, PAL.ochre, 2);
  ctx.restore();
}

function blossom(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.5, r * 0.32, a, 0, Math.PI * 2);
    fillOutlined(ctx, PAL.white, 1.6);
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
  fillOutlined(ctx, PAL.ochre, 1.4);
  ctx.restore();
}

// ───────────────────────────── patterns ─────────────────────────────

/**
 * Mirror-symmetric floral arabesque (islimi + khatai) on lapis, composed for an arch spandrel:
 * the arch occupies the middle of the panel, so the design lives in the two upper corners and along
 * the arch — a vine follows the arch curve, a large scroll with a rosette fills each corner, and
 * leaves and blossoms are packed into the remaining space (never inside the arch).
 */
export const islimi: Draw = (ctx, W, H, rng) => {
  ctx.fillStyle = PAL.cobalt;
  ctx.fillRect(0, 0, W, H);
  // arch half-width (in u) at height v (v = 0 springing line, 1 = top of the panel)
  const hw = (v: number) => (v >= 0.985 ? 0 : 0.49 * Math.pow(1 - Math.pow(v / 0.985, 2), 0.55));
  const X = (u: number) => u * W, Y = (v: number) => (1 - v) * H;
  const visible = (u: number, v: number, m = 0.03) => Math.abs(u - 0.5) > hw(v) + m && u > 0.03 && u < 0.97 && v > 0.03 && v < 0.97;
  const half = (fn: (side: 1) => void) => fn(1); // right half only; mirrored below

  half(() => {
    // vine hugging the arch on the outside, leaves pointing outward
    const vine: Array<[number, number]> = [];
    for (let v = 0.04; v <= 0.97; v += 0.01) vine.push([0.5 + hw(v) + 0.045, v]);
    stem(ctx, () => {
      ctx.beginPath();
      vine.forEach(([u, v], i) => (i ? ctx.lineTo(X(u), Y(v)) : ctx.moveTo(X(u), Y(v))));
    }, 7, PAL.white);
    for (let i = 4; i < vine.length - 4; i += 7) {
      const [u, v] = vine[i], [u2, v2] = vine[i + 1];
      const ang = Math.atan2(Y(v2) - Y(v), X(u2) - X(u));
      leaf(ctx, X(u), Y(v), 34 + rng.range(0, 14), 11, ang - (i % 14 < 7 ? 0.9 : -0.9) + Math.PI / 2 * 0, i % 14 < 7 ? PAL.turquoise : PAL.ochre);
    }
    // the corner scroll: a log spiral with leaves, a palmette at its tip and a rosette at its heart
    const c = { u: 0.875, v: 0.76 }, R = 0.11;
    const pts: Array<[number, number, number]> = [];
    for (let t = 0; t <= 2.4 * Math.PI; t += 0.035) {
      const r = R * Math.exp(-0.2 * t);
      const a = -t + Math.PI * 0.85;
      pts.push([c.u + Math.cos(a) * r, c.v + Math.sin(a) * r * (W / H), a]);
    }
    // stem from the vine into the scroll
    const [su, sv] = pts[0];
    stem(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(X(0.5 + hw(0.5) + 0.045), Y(0.5));
      ctx.quadraticCurveTo(X(0.84), Y(0.5), X(su), Y(sv));
    }, 8, PAL.ochre);
    stem(ctx, () => {
      ctx.beginPath();
      pts.forEach(([u, v], i) => (i ? ctx.lineTo(X(u), Y(v)) : ctx.moveTo(X(u), Y(v))));
    }, 8, PAL.ochre);
    for (let i = 5; i < pts.length - 12; i += 10) {
      const [u, v, a] = pts[i];
      leaf(ctx, X(u), Y(v), 30 + (1 - i / pts.length) * 36, 11, -a + Math.PI / 2 + 0.5, i % 20 < 10 ? PAL.turquoise : PAL.green);
    }
    const [eu, ev, ea] = pts[pts.length - 1];
    palmette(ctx, X(eu), Y(ev), 46, -ea, PAL.turquoise);
    rosette(ctx, X(c.u), Y(c.v), 44, 8, PAL.white, PAL.turquoiseLight);
    // a second, smaller scroll lower down the side
    rosette(ctx, X(0.93), Y(0.38), 26, 6, PAL.white, PAL.ochre);
    // pack the remaining corner with leaves, blossoms and seeds (rejection sampling)
    const placed: Array<[number, number, number]> = [[c.u, c.v, 0.075], [0.93, 0.38, 0.04]];
    const free = (u: number, v: number, r: number) => visible(u, v, r * 0.6) && placed.every(([pu, pv, pr]) => Math.hypot(pu - u, (pv - v) * (H / W)) > pr + r);
    for (let k = 0; k < 4000; k++) {
      const u = rng.range(0.5, 0.97), v = rng.range(0.04, 0.96);
      const big = rng.next() < 0.3;
      const r = big ? 0.024 : 0.013;
      if (!free(u, v, r)) continue;
      placed.push([u, v, r]);
      if (big) blossom(ctx, X(u), Y(v), r * W * 0.66);
      else {
        // little tendril with a leaf, as in the gaps of real islimi work
        const a = rng.range(0, Math.PI * 2);
        stem(ctx, () => {
          ctx.beginPath();
          ctx.moveTo(X(u), Y(v));
          ctx.quadraticCurveTo(X(u) + Math.cos(a) * r * W, Y(v) + Math.sin(a) * r * W, X(u) + Math.cos(a + 1.2) * r * W * 1.3, Y(v) + Math.sin(a + 1.2) * r * W * 1.3);
        }, 3, PAL.white);
        leaf(ctx, X(u), Y(v), r * W * 1.7, r * W * 0.55, a + Math.PI, rng.next() < 0.5 ? PAL.turquoiseLight : PAL.ochre);
      }
    }
    for (let k = 0; k < 500; k++) {
      const u = rng.range(0.5, 0.98), v = rng.range(0.02, 0.98);
      if (!visible(u, v, 0.01)) continue;
      ctx.beginPath();
      ctx.arc(X(u), Y(v), rng.range(1.6, 3.2), 0, Math.PI * 2);
      ctx.fillStyle = PAL.white;
      ctx.fill();
    }
  });
  // mirror the right half onto the left (under x' = W - x, drawing at [W/2, W] lands on [0, W/2])
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(ctx.canvas, W / 2, 0, W / 2, H, W / 2, 0, W / 2, H);
  ctx.restore();
  // a small khatai on the axis above the apex
  rosette(ctx, W / 2, Y(0.992), 22, 8, PAL.white, PAL.ochre);
};

/** Star-and-cross girih: eight-pointed stars with crosses between them (tileable on `cell`). */
export function girih(cell: number): Draw {
  return (ctx, W, H) => {
    ctx.fillStyle = PAL.cobalt;
    ctx.fillRect(0, 0, W, H);
    const ro = cell / 2, ri = ro * 0.7654;
    for (let gy = 0; gy <= Math.ceil(H / cell); gy++)
      for (let gx = 0; gx <= Math.ceil(W / cell); gx++) {
        const x = gx * cell, y = gy * cell;
        // star
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const r = i % 2 ? ri : ro;
          i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.closePath();
        fillOutlined(ctx, PAL.turquoise, 3);
        // inner white star and ochre heart
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2 + Math.PI / 8;
          const r = i % 2 ? ri * 0.38 : ri * 0.62;
          i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.closePath();
        fillOutlined(ctx, PAL.white, 2.2);
        ctx.beginPath();
        ctx.arc(x, y, ri * 0.16, 0, Math.PI * 2);
        fillOutlined(ctx, PAL.ochre, 1.8);
        // small turquoise lozenge at the heart of each cross
        const qx = x + cell / 2, qy = y + cell / 2, d = cell * 0.13;
        ctx.beginPath();
        ctx.moveTo(qx, qy - d);
        ctx.lineTo(qx + d, qy);
        ctx.lineTo(qx, qy + d);
        ctx.lineTo(qx - d, qy);
        ctx.closePath();
        fillOutlined(ctx, PAL.turquoiseLight, 2);
      }
  };
}

/** A border band of white lozenges with turquoise hearts on lapis (tileable along x on `step`). */
export function borderBand(step: number): Draw {
  return (ctx, W, H) => {
    ctx.fillStyle = PAL.cobaltDeep;
    ctx.fillRect(0, 0, W, H);
    for (let x = step / 2; x < W + step; x += step) {
      const y = H / 2, dx = step * 0.42, dy = H * 0.36;
      ctx.beginPath();
      ctx.moveTo(x - dx, y);
      ctx.lineTo(x, y - dy);
      ctx.lineTo(x + dx, y);
      ctx.lineTo(x, y + dy);
      ctx.closePath();
      fillOutlined(ctx, PAL.white, 2.5);
      ctx.beginPath();
      ctx.arc(x, y, Math.min(dx, dy) * 0.36, 0, Math.PI * 2);
      fillOutlined(ctx, PAL.turquoise, 2);
      // small ochre dots in between
      ctx.beginPath();
      ctx.arc(x + step / 2, y, H * 0.07, 0, Math.PI * 2);
      fillOutlined(ctx, PAL.ochre, 1.6);
    }
    ctx.fillStyle = PAL.white;
    ctx.fillRect(0, 0, W, H * 0.06);
    ctx.fillRect(0, H * 0.94, W, H * 0.06);
  };
}

/** Twisted rope moulding: diagonal turquoise strands (tileable). */
export const rope: Draw = (ctx, W, H) => {
  const n = 8;
  for (let i = -n; i < n * 2; i++) {
    const x0 = (i / n) * W;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0 + W / n, 0);
    ctx.lineTo(x0 + W / n - H * 0.9, H);
    ctx.lineTo(x0 - H * 0.9, H);
    ctx.closePath();
    fillOutlined(ctx, i % 2 ? PAL.turquoise : PAL.turquoiseLight, 2.5);
  }
};

/**
 * A tile inscription band (katibeh): the name in white glaze with dark cuerda-seca outlines, raised
 * a little from the tile (moulded relief), over a turquoise vine scrolling on lapis, between white
 * bead lines — as over the gates of the Safavid bazaars.
 */
export function inscription(text: string, rtl: boolean): { draw: Draw; relief: Draw } {
  const family = rtl
    ? `"IranNastaliq", "Vazirmatn", "lang-fa-iransans", "IRANSans", Tahoma, serif`
    : `"Palatino Linotype", "Book Antiqua", Palatino, "URW Palladio L", Georgia, serif`;
  const layout = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    let size = Math.round(H * 0.74);
    const set = () => (ctx.font = `${rtl ? "" : "italic "}700 ${size}px ${family}`);
    set();
    while (ctx.measureText(text).width > W * 0.86 && size > 16) {
      size -= 4;
      set();
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    (ctx as any).direction = rtl ? "rtl" : "ltr";
    return size;
  };
  const draw: Draw = (ctx, W, H, rng) => {
    ctx.fillStyle = PAL.cobalt;
    ctx.fillRect(0, 0, W, H);
    // the scrolling vine behind the letters, with leaves and blossoms in its loops
    const amp = H * 0.24, period = H * 1.7, mid = H / 2;
    const yAt = (x: number) => mid + Math.sin((x / period) * Math.PI * 2) * amp;
    stem(ctx, () => {
      ctx.beginPath();
      for (let x = -12; x <= W + 12; x += 5) x === -12 ? ctx.moveTo(x, yAt(x)) : ctx.lineTo(x, yAt(x));
    }, Math.max(4, H * 0.025), PAL.turquoise);
    for (let x = period / 4; x < W + period; x += period / 2) {
      const up = Math.sin((x / period) * Math.PI * 2) > 0;
      const y = yAt(x);
      blossom(ctx, x, y + (up ? -1 : 1) * H * 0.17, H * 0.075);
      for (const dx of [-0.13, 0.13]) {
        const xx = x + dx * period, yy = yAt(xx);
        const slope = Math.atan2(yAt(xx + 2) - yy, 2);
        leaf(ctx, xx, yy, H * 0.17, H * 0.055, slope + (up ? -1 : 1) * 0.9 * Math.sign(dx), rng.next() < 0.5 ? PAL.turquoiseLight : PAL.ochre);
      }
    }
    // white bead lines framing the band
    for (const y of [H * 0.055, H * 0.945]) {
      ctx.fillStyle = PAL.white;
      ctx.fillRect(0, y - H * 0.014, W, H * 0.028);
      for (let x = H * 0.05; x < W; x += H * 0.1) {
        ctx.beginPath();
        ctx.arc(x, y + (y < H / 2 ? H * 0.04 : -H * 0.04), H * 0.014, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // the letters: dark outline first, then the white glaze
    const size = layout(ctx, W, H);
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(5, size * 0.085);
    ctx.strokeStyle = PAL.brown;
    ctx.strokeText(text, W / 2, H * 0.53);
    ctx.fillStyle = PAL.white;
    ctx.fillText(text, W / 2, H * 0.53);
  };
  const relief: Draw = (ctx, W, H) => {
    layout(ctx, W, H);
    ctx.filter = `blur(${Math.max(1.5, H * 0.008)}px)`;
    ctx.fillStyle = "#fff";
    ctx.fillText(text, W / 2, H * 0.53);
    ctx.filter = "none";
  };
  return { draw, relief };
}

// ───────────────────────────── the tile finish ─────────────────────────────

export function makeTiles(
  W: number,
  H: number,
  tilePx: number,
  draw: Draw,
  seed = 1,
  opts: { chips?: number; crazing?: number; dirt?: number; relief?: Draw; reliefHeight?: number } = {},
): TileSet {
  const rng = new Rng(seed);
  const pattern = makeCanvas(W, H);
  const pctx = pattern.getContext("2d")!;
  draw(pctx, W, H, rng);

  const color = makeCanvas(W, H);
  const cctx = color.getContext("2d")!;
  cctx.drawImage(pattern, 0, 0);
  const mask = makeCanvas(W, H); // R: chips, G: crazing
  const mctx = mask.getContext("2d")!;
  mctx.fillStyle = "#000";
  mctx.fillRect(0, 0, W, H);
  const cols = Math.ceil(W / tilePx), rows = Math.ceil(H / tilePx);
  const grout = Math.max(1, Math.round(tilePx * 0.013)); // ~2-3 mm joints on 15 cm tiles
  const tileRough: number[] = [];
  const tileTilt: Array<[number, number]> = [];
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      const x = tx * tilePx, y = ty * tilePx;
      // glaze variation per tile
      const v = rng.range(-1, 1);
      cctx.fillStyle = v > 0 ? `rgba(255,252,240,${v * 0.06})` : `rgba(10,20,40,${-v * 0.08})`;
      cctx.fillRect(x, y, tilePx, tilePx);
      // glaze pools lighter in the middle of a tile, thinner at the edges
      const g = cctx.createRadialGradient(x + tilePx / 2, y + tilePx / 2, tilePx * 0.1, x + tilePx / 2, y + tilePx / 2, tilePx * 0.72);
      g.addColorStop(0, "rgba(255,255,255,0.07)");
      g.addColorStop(1, "rgba(30,20,10,0.10)");
      cctx.fillStyle = g;
      cctx.fillRect(x, y, tilePx, tilePx);
      tileRough.push(rng.range(0.16, 0.26));
      tileTilt.push([rng.range(-1, 1), rng.range(-1, 1)]);
      // crazing: fine hair cracks in the glaze
      if (rng.next() < (opts.crazing ?? 0.25) * 0.7) {
        mctx.strokeStyle = "rgb(0,255,0)";
        mctx.lineWidth = 1;
        for (let k = 0; k < rng.int(2, 5); k++) {
          let px = x + rng.range(0.1, 0.9) * tilePx, py = y + rng.range(0.1, 0.9) * tilePx;
          mctx.beginPath();
          mctx.moveTo(px, py);
          for (let s = 0; s < 6; s++) {
            px += rng.range(-0.18, 0.18) * tilePx;
            py += rng.range(-0.18, 0.18) * tilePx;
            mctx.lineTo(Math.min(x + tilePx, Math.max(x, px)), Math.min(y + tilePx, Math.max(y, py)));
          }
          mctx.stroke();
        }
      }
      // chipped corner: glaze lost, terracotta body showing
      if (rng.next() < (opts.chips ?? 0.04)) {
        const cx = rng.next() < 0.5 ? x : x + tilePx, cy = rng.next() < 0.5 ? y : y + tilePx;
        const r = tilePx * rng.range(0.1, 0.22);
        mctx.fillStyle = "rgb(255,0,0)";
        mctx.beginPath();
        mctx.moveTo(cx, cy);
        for (let k = 0; k <= 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          const rr = r * (0.6 + rng.next() * 0.5);
          mctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        mctx.fill();
      }
    }
  const mdata = mctx.getImageData(0, 0, W, H).data;
  // moulded relief (kashi-ye barjasteh): white = raised, drawn by the pattern itself
  let rdata: Uint8ClampedArray | null = null;
  if (opts.relief) {
    const rc = makeCanvas(W, H);
    const rctx = rc.getContext("2d")!;
    rctx.fillStyle = "#000";
    rctx.fillRect(0, 0, W, H);
    opts.relief(rctx, W, H, new Rng(seed));
    rdata = rctx.getImageData(0, 0, W, H).data;
  }
  const rh = opts.reliefHeight ?? 0.3;
  // apply chips and crazing to the colour, draw the grout
  const img = cctx.getImageData(0, 0, W, H);
  const d = img.data;
  const tc = new Color(PAL.terracotta);
  const groutCol = [205, 196, 178];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4;
      const gx = x % tilePx, gy = y % tilePx;
      const e = Math.min(gx, tilePx - 1 - gx, gy, tilePx - 1 - gy);
      if (e < grout) {
        const dirt = 0.82 + NOISE.noise(x * 0.08, y * 0.08, seed) * 0.12 - (y / H) * (opts.dirt ?? 0.12);
        d[k] = groutCol[0] * dirt;
        d[k + 1] = groutCol[1] * dirt;
        d[k + 2] = groutCol[2] * dirt;
        continue;
      }
      if (mdata[k] > 128) {
        const n = 0.85 + NOISE.noise(x * 0.3, y * 0.3, 4) * 0.2;
        d[k] = tc.r * 255 * n;
        d[k + 1] = tc.g * 255 * n;
        d[k + 2] = tc.b * 255 * n;
      } else if (mdata[k + 1] > 60) {
        // crazing: hairlines barely darker than the glaze
        d[k] *= 0.93;
        d[k + 1] *= 0.93;
        d[k + 2] *= 0.94;
      }
    }
  cctx.putImageData(img, 0, 0);

  // height: pillowed, individually tilted tiles; grout and chips recessed; crazing hairlines
  const h = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const tx = Math.floor(x / tilePx), ty = Math.floor(y / tilePx);
      const u = (x % tilePx) / tilePx, v = (y % tilePx) / tilePx;
      const gx = x % tilePx, gy = y % tilePx;
      const e = Math.min(gx, tilePx - 1 - gx, gy, tilePx - 1 - gy);
      const k = (y * W + x) * 4;
      let val: number;
      if (e < grout) val = 0.05;
      else {
        const pu = 2 * u - 1, pv = 2 * v - 1;
        const pillow = (1 - Math.pow(Math.abs(pu), 6)) * (1 - Math.pow(Math.abs(pv), 6));
        const edge = Math.min(1, (e - grout) / (tilePx * 0.06));
        const tilt = tileTilt[ty * cols + tx] || [0, 0];
        val = 0.55 + 0.4 * pillow * edge + (tilt[0] * pu + tilt[1] * pv) * 0.035;
        if (rdata) val += (rdata[k] / 255) * rh;
        if (mdata[k] > 128) val -= 0.25;
        else if (mdata[k + 1] > 60) val -= 0.02;
      }
      h[y * W + x] = val;
    }
  const normal = heightToNormalCanvas(h, W, H, 2.4);

  // AO / roughness / metal (glTF convention): glaze glossy per tile, grout and chips matte
  const arm = makeCanvas(W, H);
  const actx = arm.getContext("2d")!;
  const aimg = actx.createImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4;
      const tx = Math.floor(x / tilePx), ty = Math.floor(y / tilePx);
      const gx = x % tilePx, gy = y % tilePx;
      const e = Math.min(gx, tilePx - 1 - gx, gy, tilePx - 1 - gy);
      const groutPx = e < grout;
      const chip = mdata[k] > 128;
      aimg.data[k] = groutPx ? 190 : 255;
      aimg.data[k + 1] = Math.round((groutPx ? 0.92 : chip ? 0.85 : tileRough[ty * cols + tx] ?? 0.1) * 255);
      aimg.data[k + 2] = 0;
      aimg.data[k + 3] = 255;
    }
  actx.putImageData(aimg, 0, 0);

  return { map: toTexture(color, true, true, 16), normalMap: toTexture(normal, false, true, 16), arm: toTexture(arm, false, true, 8) };
}

/** Glazed tile material: glossy glaze with a clear reflective coat, matte grout. */
export function tileMaterial(t: TileSet, repeat: [number, number] = [1, 1]): MeshPhysicalMaterial {
  const clone = (x: CanvasTexture) => {
    if (repeat[0] === 1 && repeat[1] === 1) return x;
    const c = x.clone();
    c.wrapS = c.wrapT = RepeatWrapping;
    c.repeat.set(repeat[0], repeat[1]);
    c.needsUpdate = true;
    return c;
  };
  const nor = clone(t.normalMap);
  return new MeshPhysicalMaterial({
    map: clone(t.map),
    normalMap: nor,
    normalScale: new Vector2(1, 1),
    roughnessMap: clone(t.arm),
    aoMap: clone(t.arm),
    roughness: 1,
    metalness: 0,
    clearcoat: 0.32,
    clearcoatRoughness: 0.2,
    clearcoatNormalMap: nor,
    clearcoatNormalScale: new Vector2(0.6, 0.6),
    // glazed tile mirrors the bright sky at grazing angles; keep that a sheen, not a glare
    envMapIntensity: 0.68,
    side: DoubleSide,
  });
}

// ───────────────────────────── shared sets ─────────────────────────────

let cache: Record<string, TileSet> | null = null;
/** All tile sets the bazaar uses (generated once). */
export function bazaarTiles(quality: "low" | "medium" | "high") {
  if (cache) return cache;
  const k = quality === "high" ? 1 : quality === "medium" ? 0.75 : 0.5;
  const px = (n: number) => Math.round(n * k);
  cache = {
    // spandrels: ~17 tiles across the lower arch, the same art scaled into the upper one
    spandrel: makeTiles(px(2048), px(1240), px(118), islimi, 11, { crazing: 0.35, chips: 0.035 }),
    // star band for the cornice and the pool-side planters (tiles exactly one star cell)
    girih: makeTiles(px(1024), px(256), px(128), girih(px(128)), 23, { crazing: 0.3, chips: 0.05 }),
    // border bands for the frames and the ledge between storeys
    border: makeTiles(px(1024), px(128), px(128), borderBand(px(128)), 37, { crazing: 0.25, chips: 0.03 }),
    // twisted rope moulding around the arches
    rope: makeTiles(px(512), px(64), px(64), rope, 41, { crazing: 0.15, chips: 0.02, dirt: 0.05 }),
  };
  return cache;
}
