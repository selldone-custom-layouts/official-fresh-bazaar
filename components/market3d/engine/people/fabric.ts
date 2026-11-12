/*
 * Fresh Market 3D — Iranian-inspired textile patterns for the costumes (tileable canvases).
 *
 *  termeh — Yazd brocade: rows of boteh (paisley) in alternating directions with small blossoms,
 *           woven in coloured and gold-ish threads on a deep ground
 *  suzani — needlework: pomegranate / sun rosettes joined by vines on a light ground
 *  ikat   — resist-dyed warp: feathered diamonds in vertical bands
 *  wool   — plain heathered cloth
 * Every pattern gets a fine woven grain so it reads as cloth, not print.
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { makeCanvas } from "../util/textures";
import { NOISE, Rng } from "../util/noise";

export type FabricKind = "termeh" | "suzani" | "ikat" | "wool" | "roundel";
export interface FabricSpec {
  kind: FabricKind;
  ground: string;
  colors: string[]; // motif colours
}

function boteh(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, flip: number, fill: string, line: string, inner: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip, 1);
  ctx.beginPath();
  ctx.moveTo(0, s * 0.55);
  ctx.bezierCurveTo(-s * 0.55, s * 0.45, -s * 0.5, -s * 0.2, -s * 0.05, -s * 0.38);
  ctx.bezierCurveTo(s * 0.18, -s * 0.48, s * 0.42, -s * 0.62, s * 0.3, -s * 0.85); // the curled tip
  ctx.bezierCurveTo(s * 0.62, -s * 0.55, s * 0.5, s * 0.1, s * 0.32, s * 0.36);
  ctx.bezierCurveTo(s * 0.22, s * 0.5, s * 0.12, s * 0.56, 0, s * 0.55);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.strokeStyle = line;
  ctx.stroke();
  // inner boteh and dotted border, as in the woven ones
  ctx.beginPath();
  ctx.ellipse(-s * 0.02, s * 0.12, s * 0.2, s * 0.28, 0.25, 0, Math.PI * 2);
  ctx.fillStyle = inner;
  ctx.fill();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(-s * 0.02 + Math.cos(a) * s * 0.3, s * 0.12 + Math.sin(a) * s * 0.38, s * 0.035, 0, Math.PI * 2);
    ctx.fillStyle = line;
    ctx.fill();
  }
  ctx.restore();
}

function flower(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, petal: string, heart: string) {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.45, r * 0.28, a, 0, Math.PI * 2);
    ctx.fillStyle = petal;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, r * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = heart;
  ctx.fill();
}

/** draw `fn` at (x, y) and at its wrapped copies so the tile is seamless */
function wrapped(N: number, x: number, y: number, pad: number, fn: (x: number, y: number) => void) {
  for (const dx of [-N, 0, N])
    for (const dy of [-N, 0, N]) {
      const X = x + dx, Y = y + dy;
      if (X > -pad && X < N + pad && Y > -pad && Y < N + pad) fn(X, Y);
    }
}

const cache = new Map<string, CanvasTexture>();

export function fabricTexture(spec: FabricSpec, N = 512): CanvasTexture {
  const key = JSON.stringify(spec) + N;
  const hit = cache.get(key);
  if (hit) return hit;
  const rng = new Rng(N + spec.kind.length * 31 + spec.ground.charCodeAt(1));
  const c = makeCanvas(N);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = spec.ground;
  ctx.fillRect(0, 0, N, N);
  const [c1, c2 = c1, c3 = c2, c4 = c3] = spec.colors;
  if (spec.kind === "termeh") {
    // small boteh with plenty of ground between them: the deep ground reads first, gold motifs second
    const rows = 4, cols = 4, s = N / 7.4;
    for (let r = 0; r < rows; r++)
      for (let k = 0; k < cols; k++) {
        const x = (k + (r % 2) * 0.5 + 0.5) * (N / cols), y = (r + 0.5) * (N / rows);
        wrapped(N, x, y, s, (X, Y) => boteh(ctx, X, Y, s, r % 2 ? -1 : 1, c1, c4, c2));
        wrapped(N, x + N / cols / 2, y + N / rows / 2, s, (X, Y) => flower(ctx, X, Y, s * 0.16, c3, c4));
      }
    // fine diagonal twill in gold-ish thread
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = c4;
    ctx.lineWidth = 1;
    for (let i = -N; i < N * 2; i += 4) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + N, N);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (spec.kind === "suzani") {
    const spots: Array<[number, number, number]> = [
      [0.25, 0.25, 0.14],
      [0.75, 0.75, 0.14],
      [0.75, 0.25, 0.08],
      [0.25, 0.75, 0.08],
    ];
    // vines first
    ctx.lineWidth = N * 0.012;
    ctx.strokeStyle = c3;
    for (let i = 0; i < 4; i++) {
      wrapped(N, 0, 0, N, (X, Y) => {
        ctx.beginPath();
        ctx.moveTo(X + 0.25 * N, Y + 0.25 * N);
        ctx.bezierCurveTo(X + 0.5 * N, Y + (0.05 + i * 0.1) * N, X + 0.5 * N, Y + 0.95 * N, X + 0.75 * N, Y + 0.75 * N);
        ctx.stroke();
      });
    }
    for (const [u, v, r] of spots)
      wrapped(N, u * N, v * N, r * N * 1.4, (X, Y) => {
        const R = r * N;
        for (const [rr, col] of [
          [1, c1],
          [0.72, c2],
          [0.45, c1],
          [0.22, c4],
        ] as Array<[number, string]>) {
          ctx.beginPath();
          for (let i = 0; i <= 24; i++) {
            const a = (i / 24) * Math.PI * 2;
            const k = rr * R * (1 + (rr > 0.9 ? Math.sin(a * 12) * 0.08 : 0));
            i ? ctx.lineTo(X + Math.cos(a) * k, Y + Math.sin(a) * k) : ctx.moveTo(X + Math.cos(a) * k, Y + Math.sin(a) * k);
          }
          ctx.fillStyle = col;
          ctx.fill();
        }
        // stitched spokes
        ctx.strokeStyle = c4;
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(X + Math.cos(a) * R * 0.48, Y + Math.sin(a) * R * 0.48);
          ctx.lineTo(X + Math.cos(a) * R * 0.7, Y + Math.sin(a) * R * 0.7);
          ctx.stroke();
        }
      });
    for (let i = 0; i < 20; i++) {
      const x = rng.next() * N, y = rng.next() * N;
      wrapped(N, x, y, 20, (X, Y) => flower(ctx, X, Y, N * 0.02, c2, c4));
    }
  } else if (spec.kind === "roundel") {
    // pearl-roundel silk (Sasanian → Buyid → Seljuk): medallions framed by a ring of pearls, each
    // holding a rosette tree of life, with four-lobed palmettes in the spaces between them
    const R = N * 0.21;
    const drawRoundel = (X: number, Y: number) => {
      ctx.beginPath();
      ctx.arc(X, Y, R, 0, Math.PI * 2);
      ctx.fillStyle = c1;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(X, Y, R * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = c2;
      ctx.fill();
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(X + Math.cos(a) * R * 0.9, Y + Math.sin(a) * R * 0.9, R * 0.055, 0, Math.PI * 2);
        ctx.fillStyle = c4;
        ctx.fill();
      }
      // the tree of life: a stem with paired leaves and a crowning rosette
      ctx.strokeStyle = c3;
      ctx.lineWidth = R * 0.07;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(X, Y + R * 0.62);
      ctx.lineTo(X, Y - R * 0.2);
      ctx.stroke();
      for (const [dy, s] of [[0.38, 0.32], [0.08, 0.28]] as Array<[number, number]>)
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(X + side * R * s * 0.75, Y + R * dy, R * s * 0.7, R * s * 0.26, side * -0.5, 0, Math.PI * 2);
          ctx.fillStyle = c3;
          ctx.fill();
        }
      flower(ctx, X, Y - R * 0.36, R * 0.34, c1, c4);
    };
    for (const [u, v] of [[0.25, 0.25], [0.75, 0.75]]) wrapped(N, u * N, v * N, R * 1.1, drawRoundel);
    // palmettes in the interstices
    for (const [u, v] of [[0.75, 0.25], [0.25, 0.75]])
      wrapped(N, u * N, v * N, R, (X, Y) => {
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(X + Math.cos(a) * R * 0.28, Y + Math.sin(a) * R * 0.28, R * 0.3, R * 0.12, a, 0, Math.PI * 2);
          ctx.fillStyle = c3;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(X, Y, R * 0.1, 0, Math.PI * 2);
        ctx.fillStyle = c4;
        ctx.fill();
      });
  } else if (spec.kind === "ikat") {
    // feathered diamonds in vertical bands (the blurred edges are the signature of ikat)
    const bands = 4, w = N / bands;
    for (let b = 0; b < bands; b++) {
      const col = [c1, c2, c3, c4][b % 4];
      for (let y = 0; y < N; y += 2) {
        const t = (y / N) * 4 * Math.PI;
        const half = (Math.abs(Math.sin(t)) * 0.38 + 0.08) * w;
        const jitter = NOISE.noise(b * 3.1, y * 0.15, 1) * w * 0.08;
        ctx.fillStyle = col;
        ctx.fillRect(b * w + w / 2 - half + jitter, y, half * 2, 2);
      }
    }
    ctx.globalAlpha = 0.18;
    for (let y = 0; y < N; y += 3) {
      ctx.fillStyle = y % 6 ? "#ffffff" : "#000000";
      ctx.fillRect(0, y, N, 1);
    }
    ctx.globalAlpha = 1;
  }
  // woven grain for every fabric
  const img = ctx.getImageData(0, 0, N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const k = (y * N + x) * 4;
      const g = 0.92 + ((x + y) % 4 < 2 ? 0.04 : -0.02) + NOISE.noise(x * 0.07, y * 0.07, 9) * 0.06;
      img.data[k] *= g;
      img.data[k + 1] *= g;
      img.data[k + 2] *= g;
    }
  ctx.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}
