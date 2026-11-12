/*
 * Fresh Market 3D — procedural canvas textures (color, normal, roughness).
 * Everything is generated at runtime: no texture files ship with the layout.
 */
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearSRGBColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from "three";
import { NOISE, Rng, clamp } from "./noise";

const cache = new Map<string, any>();
function memo<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

export function makeCanvas(w: number, h = w): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function toTexture(canvas: HTMLCanvasElement, srgb = true, repeat = true, anisotropy = 4): CanvasTexture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = srgb ? SRGBColorSpace : LinearSRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

/** Height field (0..1) → tangent-space normal map canvas (wrapping Sobel). */
export function heightToNormalCanvas(h: Float32Array, w: number, hh: number, strength = 2): HTMLCanvasElement {
  const c = makeCanvas(w, hh);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, hh);
  const at = (x: number, y: number) => h[((y + hh) % hh) * w + ((x + w) % w)];
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      const dx =
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy =
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * strength;
      let ny = dy * strength;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const k = (y * w + x) * 4;
      img.data[k] = (nx * 0.5 + 0.5) * 255;
      img.data[k + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[k + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function heightToGray(h: Float32Array, w: number, hh: number, lo = 0, hi = 1): HTMLCanvasElement {
  const c = makeCanvas(w, hh);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, hh);
  for (let i = 0; i < w * hh; i++) {
    const v = (lo + (hi - lo) * h[i]) * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Tileable noise sampled on a torus so it wraps seamlessly. */
function tileNoise(x: number, y: number, freq: number, octaves = 4, seed = 0): number {
  const a = x * Math.PI * 2;
  const b = y * Math.PI * 2;
  const R = freq / (Math.PI * 2);
  return NOISE.fbm(
    Math.cos(a) * R + seed,
    Math.sin(a) * R + seed * 0.37,
    Math.cos(b) * R + Math.sin(b) * R * 0.0001 + seed * 1.3,
    octaves,
  ) + 0 * Math.sin(b);
}

function tileNoise2(x: number, y: number, freq: number, octaves = 4, seed = 0): number {
  // 4D torus mapped into 3D by mixing; good enough for organic surfaces.
  const a = x * Math.PI * 2;
  const b = y * Math.PI * 2;
  const R = freq / (Math.PI * 2);
  return NOISE.fbm(Math.cos(a) * R + seed, Math.sin(a) * R + Math.cos(b) * R, Math.sin(b) * R - seed, octaves);
}

// ───────────────────────────── Produce skins ─────────────────────────────

/** Fine pores / dimples (citrus peel, avocado, generic skin). */
export function poresNormal(density = 180, depth = 1, key = "pores"): Texture {
  return memo(`${key}-${density}-${depth}`, () => {
    const W = 512;
    const h = new Float32Array(W * W).fill(0.5);
    const rng = new Rng(density * 7 + 3);
    const count = density * 40;
    for (let n = 0; n < count; n++) {
      const cx = rng.next() * W;
      const cy = rng.next() * W;
      const r = 1.5 + rng.next() * 2.2;
      for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
        for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
          const d = Math.hypot(x - cx, y - cy) / r;
          if (d > 1) continue;
          const k = ((y + W) % W) * W + ((x + W) % W);
          h[k] -= (1 - d * d) * 0.35 * depth;
        }
      }
    }
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) h[y * W + x] += tileNoise2(x / W, y / W, 24, 2) * 0.05;
    return toTexture(heightToNormalCanvas(h, W, W, 2.2), false);
  });
}

/** Very subtle organic micro-variation normal map. */
export function microNormal(): Texture {
  return memo("micro", () => {
    const W = 256;
    const h = new Float32Array(W * W);
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) h[y * W + x] = tileNoise2(x / W, y / W, 12, 4) * 0.5 + 0.5;
    return toTexture(heightToNormalCanvas(h, W, W, 0.9), false);
  });
}

/** Strawberry: red skin with yellow achenes in dimples. */
export function strawberrySkin(): { map: Texture; normalMap: Texture } {
  return memo("strawberry", () => {
    const W = 512;
    const H = 512;
    const c = makeCanvas(W, H);
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    // canvas top = v 1 = shoulder under the calyx (paler), bottom = tip
    g.addColorStop(0, "#f2c8a0");
    g.addColorStop(0.1, "#e2402c");
    g.addColorStop(0.3, "#d61c22");
    g.addColorStop(1, "#b0101a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const h = new Float32Array(W * H).fill(0.6);
    const rows = 14;
    const cols = 16;
    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        const x = ((q + (r % 2) * 0.5) / cols) * W;
        const y = ((r + 0.6) / (rows + 0.4)) * H * 0.92 + 8;
        // dimple
        for (let yy = -9; yy <= 9; yy++)
          for (let xx = -9; xx <= 9; xx++) {
            const d = Math.hypot(xx / 1.0, yy / 1.3) / 9;
            if (d > 1) continue;
            const k = ((Math.round(y + yy) + H) % H) * W + ((Math.round(x + xx) + W) % W);
            h[k] -= (1 - d) * (1 - d) * 0.5;
          }
        // seed
        ctx.fillStyle = "#e9c74a";
        ctx.beginPath();
        ctx.ellipse(x, y, 3.2, 4.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(120,40,10,0.35)";
        ctx.beginPath();
        ctx.ellipse(x + 1, y + 1.5, 2, 2.6, 0, 0, Math.PI * 2);
        ctx.fill();
        for (let yy = -4; yy <= 4; yy++)
          for (let xx = -3; xx <= 3; xx++) {
            const d = Math.hypot(xx / 3.2, yy / 4.4);
            if (d > 1) continue;
            const k = ((Math.round(y + yy) + H) % H) * W + ((Math.round(x + xx) + W) % W);
            h[k] += (1 - d) * 0.35;
          }
      }
    }
    return { map: toTexture(c), normalMap: toTexture(heightToNormalCanvas(h, W, H, 3.0), false) };
  });
}

/** Cantaloupe net. */
export function melonNet(): { map: Texture; normalMap: Texture } {
  return memo("melon-net", () => {
    const W = 512;
    const h = new Float32Array(W * W);
    const c = makeCanvas(W);
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(W, W);
    // Voronoi edges (tileable via wrapped distance)
    const rng = new Rng(91);
    const pts: number[][] = [];
    for (let i = 0; i < 260; i++) pts.push([rng.next(), rng.next()]);
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const v = y / W;
        let d1 = 9, d2 = 9;
        for (const p of pts) {
          let dx = Math.abs(u - p[0]);
          let dy = Math.abs(v - p[1]);
          if (dx > 0.5) dx = 1 - dx;
          if (dy > 0.5) dy = 1 - dy;
          const d = dx * dx + dy * dy;
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
        const edge = Math.sqrt(d2) - Math.sqrt(d1);
        const ridge = clamp(1 - edge / 0.012);
        const k = y * W + x;
        h[k] = ridge * 0.8 + tileNoise2(u, v, 30, 2) * 0.05;
        const n = tileNoise2(u, v, 6, 3) * 0.5 + 0.5;
        const base = [150 + n * 40, 150 + n * 30, 90 + n * 20]; // greenish tan
        const net = [222, 205, 160];
        const k4 = k * 4;
        img.data[k4] = base[0] + (net[0] - base[0]) * ridge;
        img.data[k4 + 1] = base[1] + (net[1] - base[1]) * ridge;
        img.data[k4 + 2] = base[2] + (net[2] - base[2]) * ridge;
        img.data[k4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return { map: toTexture(c), normalMap: toTexture(heightToNormalCanvas(h, W, W, 2.5), false) };
  });
}

/** Corn kernels in rows (u around, v along cob). */
export function cornKernels(): { map: Texture; normalMap: Texture } {
  return memo("corn", () => {
    const W = 512;
    const H = 512;
    const c = makeCanvas(W, H);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#b8862a";
    ctx.fillRect(0, 0, W, H);
    const h = new Float32Array(W * H);
    const cols = 16;
    const rows = 34;
    const rng = new Rng(5);
    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        const cx = ((q + 0.5 + (r % 2) * 0.25) / cols) * W;
        const cy = ((r + 0.5) / rows) * H;
        const rw = W / cols / 2 - 1.5;
        const rh = H / rows / 2 - 1.2;
        const tone = rng.range(-14, 14);
        const gr = ctx.createRadialGradient(cx - rw * 0.3, cy - rh * 0.3, 1, cx, cy, rw * 1.2);
        gr.addColorStop(0, `rgb(${255},${236 + tone * 0.5},${150 + tone})`);
        gr.addColorStop(0.6, `rgb(${246 + tone * 0.3},${196 + tone},${58 + tone})`);
        gr.addColorStop(1, `rgb(${214},${150 + tone},${30})`);
        ctx.fillStyle = gr;
        ctx.beginPath();
        if ((ctx as any).roundRect) (ctx as any).roundRect(cx - rw, cy - rh, rw * 2, rh * 2, Math.min(rw, rh) * 0.8);
        else ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
        ctx.fill();
        for (let y = Math.floor(cy - rh); y <= cy + rh; y++)
          for (let x = Math.floor(cx - rw); x <= cx + rw; x++) {
            const dx = (x - cx) / rw;
            const dy = (y - cy) / rh;
            const d = Math.max(Math.abs(dx), Math.abs(dy)) * 0.6 + Math.hypot(dx, dy) * 0.4;
            if (d > 1) continue;
            h[((y + H) % H) * W + ((x + W) % W)] = Math.sqrt(1 - d * d);
          }
      }
    }
    return { map: toTexture(c), normalMap: toTexture(heightToNormalCanvas(h, W, H, 2.2), false) };
  });
}

/** Pineapple diamond eyes. */
export function pineappleSkin(): { map: Texture; normalMap: Texture } {
  return memo("pineapple", () => {
    const W = 512;
    const H = 512;
    const c = makeCanvas(W, H);
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(W, H);
    const h = new Float32Array(W * H);
    const N = 9; // eyes around
    const M = 10; // eyes along
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = (x / W) * N;
        const v = (y / H) * M;
        // rotate into diamond lattice
        const a = u + v * 0.5;
        const b = v;
        const fa = a - Math.floor(a) - 0.5;
        const fb = b - Math.floor(b) - 0.5;
        const d = Math.abs(fa) + Math.abs(fb); // diamond distance 0..1
        const hgt = clamp(1 - d * 1.6);
        const center = clamp(1 - Math.hypot(fa, fb + 0.12) * 5);
        const k = y * W + x;
        h[k] = hgt * 0.9 - center * 0.35;
        const n = tileNoise2(x / W, y / H, 10, 2) * 0.5 + 0.5;
        // golden brown with green-ish edges
        const edge = clamp(d * 1.8 - 0.6);
        const r = 196 - edge * 90 - center * 70 + n * 20;
        const g = 140 - edge * 50 - center * 70 + n * 14;
        const bl = 52 - edge * 20 - center * 30;
        img.data[k * 4] = r;
        img.data[k * 4 + 1] = g;
        img.data[k * 4 + 2] = bl;
        img.data[k * 4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return { map: toTexture(c), normalMap: toTexture(heightToNormalCanvas(h, W, H, 3.2), false) };
  });
}

/** Fine leaf veins normal map for leafy surfaces (u across, v along the leaf). */
export function leafVeins(): Texture {
  return memo("leaf-veins", () => {
    const W = 256;
    const H = 512;
    const h = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = x / W - 0.5;
        const v = y / H;
        const mid = Math.exp(-(u * u) / 0.0008);
        const side = Math.pow(Math.abs(Math.sin((v * 14 - Math.abs(u) * 10) * Math.PI)), 18) * (1 - Math.abs(u) * 1.6);
        h[y * W + x] = mid * 0.9 + side * 0.4 + tileNoise2(x / W, y / H, 20, 2) * 0.08;
      }
    }
    return toTexture(heightToNormalCanvas(h, W, H, 3), false, false);
  });
}

// ───────────────────────────── Environment ─────────────────────────────

export interface PbrSet {
  map: Texture;
  normalMap: Texture;
  roughnessMap?: Texture;
}

/** Wood planks with grain (tileable). */
export function woodSet(tint: [number, number, number] = [150, 102, 62], key = "wood", planks = 4): PbrSet {
  return memo(`${key}-${tint.join(",")}-${planks}`, () => {
    const W = 512;
    const c = makeCanvas(W);
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(W, W);
    const h = new Float32Array(W * W);
    const rng = new Rng(tint[0] * 3 + planks);
    const plankTone = Array.from({ length: planks }, () => rng.range(-22, 18));
    const plankOff = Array.from({ length: planks }, () => rng.range(0, 10));
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const v = y / W;
        const p = Math.min(planks - 1, Math.floor(v * planks));
        const pv = v * planks - p;
        // long, mostly straight grain running along the plank (u), gently warped
        const warp = tileNoise2(u, v + plankOff[p], 2, 2) * 1.1;
        const grain = Math.pow(Math.abs(Math.sin((v * 56 + warp + plankOff[p]) * Math.PI)), 3);
        const fine = tileNoise2(u, v * 3 + plankOff[p], 24, 3) * 0.5 + 0.5;
        const gap = pv < 0.025 || pv > 0.975 ? 1 : 0;
        const tone = plankTone[p] - grain * 16 + fine * 12 - gap * 70;
        const k = y * W + x;
        img.data[k * 4] = clamp((tint[0] + tone) / 255) * 255;
        img.data[k * 4 + 1] = clamp((tint[1] + tone * 0.8) / 255) * 255;
        img.data[k * 4 + 2] = clamp((tint[2] + tone * 0.6) / 255) * 255;
        img.data[k * 4 + 3] = 255;
        h[k] = (1 - gap) * (0.62 - grain * 0.12 + fine * 0.08);
      }
    }
    ctx.putImageData(img, 0, 0);
    const rough = heightToGray(h, W, W, 0.95, 0.7);
    return {
      map: toTexture(c),
      normalMap: toTexture(heightToNormalCanvas(h, W, W, 1.6), false),
      roughnessMap: toTexture(rough, false),
    };
  });
}

/** Cobblestone plaza (tileable Voronoi stones). */
export function cobbleSet(): PbrSet {
  return memo("cobble", () => {
    const W = 1024;
    const c = makeCanvas(W);
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(W, W);
    const h = new Float32Array(W * W);
    const rough = new Float32Array(W * W);
    const rng = new Rng(17);
    const pts: { x: number; y: number; t: number }[] = [];
    const grid = 14;
    for (let gy = 0; gy < grid; gy++)
      for (let gx = 0; gx < grid; gx++)
        pts.push({ x: (gx + 0.5 + rng.range(-0.3, 0.3)) / grid, y: (gy + 0.5 + rng.range(-0.3, 0.3)) / grid, t: rng.range(-1, 1) });
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const v = y / W;
        const gx = Math.floor(u * grid);
        const gy = Math.floor(v * grid);
        let d1 = 9, d2 = 9, best = 0;
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            const cx = (gx + ox + grid) % grid;
            const cy = (gy + oy + grid) % grid;
            const p = pts[cy * grid + cx];
            const px = p.x + (gx + ox - ((gx + ox + grid) % grid)) / grid;
            const py = p.y + (gy + oy - ((gy + oy + grid) % grid)) / grid;
            const d = (u - px) ** 2 + (v - py) ** 2;
            if (d < d1) { d2 = d1; d1 = d; best = cy * grid + cx; } else if (d < d2) d2 = d;
          }
        const edge = Math.sqrt(d2) - Math.sqrt(d1);
        const n = tileNoise2(u, v, 18, 3);
        const stone = clamp(edge * grid * 3.2 + n * 0.15);
        const dome = Math.sqrt(stone);
        const k = y * W + x;
        h[k] = dome * 0.9 + n * 0.06;
        const t = pts[best].t;
        const base = 142 + t * 24 + n * 18;
        const warm = 1.06 + t * 0.06;
        const mortar = 1 - stone;
        img.data[k * 4] = clamp((base * warm * (1 - mortar * 0.55) + mortar * 10) / 255) * 255;
        img.data[k * 4 + 1] = clamp((base * 0.93 * (1 - mortar * 0.55) + mortar * 8) / 255) * 255;
        img.data[k * 4 + 2] = clamp((base * 0.8 * (1 - mortar * 0.55)) / 255) * 255;
        img.data[k * 4 + 3] = 255;
        rough[k] = 0.62 + mortar * 0.35 - dome * 0.08;
      }
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: toTexture(c, true, true, 8),
      normalMap: toTexture(heightToNormalCanvas(h, W, W, 3.5), false, true, 8),
      roughnessMap: toTexture(heightToGray(rough, W, W), false, true, 8),
    };
  });
}

/** Woven burlap / canvas fabric. */
export function burlapSet(tint = [176, 140, 92]): PbrSet {
  return memo(`burlap-${tint.join(",")}`, () => {
    const W = 256;
    const c = makeCanvas(W);
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(W, W);
    const h = new Float32Array(W * W);
    const n = 32;
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const u = (x / W) * n;
        const v = (y / W) * n;
        const wu = Math.sin(u * Math.PI * 2) * 0.5 + 0.5;
        const wv = Math.sin(v * Math.PI * 2) * 0.5 + 0.5;
        const over = (Math.floor(u) + Math.floor(v)) % 2 === 0;
        const hv = over ? wv * (0.6 + 0.4 * Math.sin((u % 1) * Math.PI)) : wu * (0.6 + 0.4 * Math.sin((v % 1) * Math.PI));
        const k = y * W + x;
        const nn = tileNoise2(x / W, y / W, 16, 2) * 0.5 + 0.5;
        h[k] = hv;
        const tone = hv * 30 + nn * 20 - 25;
        img.data[k * 4] = tint[0] + tone;
        img.data[k * 4 + 1] = tint[1] + tone * 0.9;
        img.data[k * 4 + 2] = tint[2] + tone * 0.7;
        img.data[k * 4 + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    return { map: toTexture(c), normalMap: toTexture(heightToNormalCanvas(h, W, W, 1.4), false) };
  });
}

/** Striped awning canvas, stripes run along v (front→back). */
export function awningStripes(a: string, b: string, stripes = 8): PbrSet {
  return memo(`awning-${a}-${b}-${stripes}`, () => {
    const W = 512;
    const c = makeCanvas(W, W);
    const ctx = c.getContext("2d")!;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? b : a;
      ctx.fillRect((i / stripes) * W, 0, W / stripes + 1, W);
    }
    // fabric weave + soft weathering
    const img = ctx.getImageData(0, 0, W, W);
    const h = new Float32Array(W * W);
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        const weave = ((x % 4 < 2) !== (y % 4 < 2) ? 1 : 0) * 0.5 + 0.5;
        const n = tileNoise2(x / W, y / W, 5, 3) * 0.5 + 0.5;
        h[k] = weave * 0.3 + n * 0.1;
        const f = 0.94 + n * 0.08 - weave * 0.03;
        img.data[k * 4] *= f;
        img.data[k * 4 + 1] *= f;
        img.data[k * 4 + 2] *= f;
      }
    ctx.putImageData(img, 0, 0);
    return { map: toTexture(c), normalMap: toTexture(heightToNormalCanvas(h, W, W, 0.8), false) };
  });
}

/** Scalloped valance alpha + stripes. */
export function valanceTexture(a: string, b: string, stripes = 8): Texture {
  return memo(`valance-${a}-${b}-${stripes}`, () => {
    const W = 1024;
    const H = 128;
    const c = makeCanvas(W, H);
    const ctx = c.getContext("2d")!;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? b : a;
      ctx.fillRect((i / stripes) * W, 0, W / stripes + 1, H);
    }
    // scallops: cut with destination-in
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, H * 0.55);
    const s = W / stripes;
    for (let i = stripes - 1; i >= 0; i--) {
      const x0 = (i + 1) * s;
      const x1 = i * s;
      ctx.quadraticCurveTo((x0 + x1) / 2, H * 1.25, x1, H * 0.55);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    // trim line
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.12);
    ctx.lineTo(W, H * 0.12);
    ctx.stroke();
    const t = toTexture(c, true, false);
    return t;
  });
}

/** Chalkboard-style sign / price tag. Lines rendered with a chalky look. */
export function chalkboardTexture(
  lines: Array<{ text: string; size: number; color?: string; weight?: string; font?: string }>,
  w = 512,
  h = 256,
  opts: { board?: string; frame?: string | null; image?: HTMLImageElement | null; dir?: "ltr" | "rtl" } = {},
): CanvasTexture {
  const c = makeCanvas(w, h);
  drawChalkboard(c, lines, opts);
  const t = toTexture(c, true, false, 8);
  return t;
}

export function drawChalkboard(
  c: HTMLCanvasElement,
  lines: Array<{ text: string; size: number; color?: string; weight?: string; font?: string }>,
  opts: { board?: string; frame?: string | null; image?: HTMLImageElement | null; dir?: "ltr" | "rtl" } = {},
) {
  const w = c.width;
  const h = c.height;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  const frame = opts.frame === undefined ? "#7a5232" : opts.frame;
  const pad = frame ? Math.round(Math.min(w, h) * 0.06) : 0;
  if (frame) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#9a6a40");
    g.addColorStop(0.5, frame);
    g.addColorStop(1, "#5a3a20");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.fillStyle = opts.board || "#23302a";
  ctx.fillRect(pad, pad, w - pad * 2, h - pad * 2);
  // chalk dust smudges
  const rng = new Rng(w * 13 + h);
  for (let i = 0; i < 40; i++) {
    const x = rng.range(pad, w - pad);
    const y = rng.range(pad, h - pad);
    const r = rng.range(10, 60);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.035)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  let imgW = 0;
  if (opts.image) {
    const s = h - pad * 2 - 16;
    const ix = pad + 8;
    const iy = pad + 8;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ix + s / 2, iy + s / 2, s / 2, 0, Math.PI * 2);
    ctx.clip();
    try {
      const im = opts.image;
      const ar = im.width / im.height;
      const dw = ar > 1 ? s * ar : s;
      const dh = ar > 1 ? s : s / ar;
      ctx.drawImage(im, ix + (s - dw) / 2, iy + (s - dh) / 2, dw, dh);
    } catch (e) {
      /* tainted or broken image — ignore */
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ix + s / 2, iy + s / 2, s / 2, 0, Math.PI * 2);
    ctx.stroke();
    imgW = s + 16;
  }
  const total = lines.reduce((a, l) => a + l.size * 1.18, 0);
  let y = h / 2 - total / 2;
  const cx = imgW ? pad + imgW + (w - pad * 2 - imgW) / 2 : w / 2;
  const maxW = w - pad * 2 - imgW - 20;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  (ctx as any).direction = opts.dir || "inherit";
  for (const l of lines) {
    let size = l.size;
    const fam = l.font || `"Segoe Print", "Bradley Hand", "Comic Sans MS", "Vazirmatn", "Tahoma", cursive`;
    ctx.font = `${l.weight || "700"} ${size}px ${fam}`;
    while (ctx.measureText(l.text).width > maxW && size > 10) {
      size -= 2;
      ctx.font = `${l.weight || "700"} ${size}px ${fam}`;
    }
    ctx.fillStyle = l.color || "rgba(245,245,235,0.95)";
    ctx.shadowColor = "rgba(255,255,255,0.25)";
    ctx.shadowBlur = 4;
    ctx.fillText(l.text, cx, y + (l.size - size) / 2);
    ctx.shadowBlur = 0;
    y += l.size * 1.18;
  }
}

/** Kraft paper (for generic bags). */
export function kraftSet(): PbrSet {
  return memo("kraft", () => {
    const W = 256;
    const c = makeCanvas(W);
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(W, W);
    const h = new Float32Array(W * W);
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        const n = tileNoise2(x / W, y / W, 40, 3) * 0.5 + 0.5;
        const fib = tileNoise2(x / W, (y / W) * 0.2, 80, 2) * 0.5 + 0.5;
        h[k] = n * 0.3 + fib * 0.2;
        const tone = n * 18 + fib * 10;
        img.data[k * 4] = 176 + tone;
        img.data[k * 4 + 1] = 134 + tone * 0.9;
        img.data[k * 4 + 2] = 88 + tone * 0.6;
        img.data[k * 4 + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    return { map: toTexture(c), normalMap: toTexture(heightToNormalCanvas(h, W, W, 0.8), false) };
  });
}

/** Soft radial "contact shadow" blob. */
export function blobShadowTexture(): Texture {
  return memo("blob", () => {
    const W = 128;
    const c = makeCanvas(W);
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(0.5, "rgba(0,0,0,0.25)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, W);
    return toTexture(c, true, false);
  });
}

/** Glow sprite for light bulbs. */
export function glowTexture(): Texture {
  return memo("glow", () => {
    const W = 64;
    const c = makeCanvas(W);
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
    g.addColorStop(0, "rgba(255,230,180,1)");
    g.addColorStop(0.25, "rgba(255,200,120,0.5)");
    g.addColorStop(1, "rgba(255,170,80,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, W);
    return toTexture(c, true, false);
  });
}

export function disposeTextureCache() {
  cache.forEach((v) => {
    if (!v) return;
    if (v.isTexture) v.dispose();
    else Object.values(v).forEach((t: any) => t?.isTexture && t.dispose());
  });
  cache.clear();
}
