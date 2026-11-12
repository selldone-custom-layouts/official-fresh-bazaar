/*
 * Fresh Market 3D — procedural vegetable & herb models (real-world scale, meters).
 */
import { BoxGeometry, CatmullRomCurve3, Color, IcosahedronGeometry, SphereGeometry, TorusGeometry, Vector2, Vector3 } from "three";
import { displace, merge, paint, surface, sweep, transformed } from "../util/geo";
import { cornKernels, kraftSet } from "../util/textures";
import {
  BuildCtx,
  NOISE,
  ProduceModel,
  calyx,
  clamp,
  finalize,
  leafGeometry,
  leafMaterial,
  lerp,
  mix,
  organicLathe,
  physical,
  seg,
  smoothstep,
  stemGeometry,
  stemMaterial,
} from "./parts";

const TAU = Math.PI * 2;
const tmp = new Color();

// ───────────────────────────── Tomato ─────────────────────────────
export function tomato(ctx: BuildCtx): ProduceModel {
  const cherryT = ctx.variant === "cherry";
  const yellow = ctx.variant === "yellow";
  const seed = ctx.seed;
  const body = organicLathe(
    [[0, -0.4], [0.2, -0.4], [0.38, -0.32], [0.49, -0.14], [0.51, 0.04], [0.48, 0.2], [0.38, 0.32], [0.22, 0.38], [0.08, 0.34], [0, 0.31]],
    ctx,
    0.02,
    (p, a, t) => {
      const lobes = 1 + 0.04 * Math.cos(5 * a + 0.6 * NOISE.noise(p.x * 3, p.y, seed)) * smoothstep(0.35, 0.95, t);
      p.x *= lobes;
      p.z *= lobes;
    },
  );
  paint(body, (p, _n, uv, out) => {
    const n = NOISE.noise(p.x * 3 + seed, p.y * 3, p.z * 3);
    if (yellow) mix(out, "#e8a812", "#f7c832", 0.5 + n * 0.4);
    else mix(out, "#b4140c", "#e02a16", 0.55 + n * 0.4);
    if (!yellow) out.lerp(tmp.set("#d8701e"), smoothstep(0.86, 0.97, uv.y) * 0.5);
  });
  const s = cherryT ? 0.03 : 0.078;
  body.scale(s, s * 0.95, s);
  const topY = s * 0.95 * 0.31;
  const cx = calyx(seg(ctx, 6, 5), s * 0.42, s * 0.12, -0.9, "#3a6e22", ctx, "#2e5a1a");
  transformed(cx, [0, topY + s * 0.02, 0]);
  const st = stemGeometry([[0, topY, 0], [0.001, topY + s * 0.12, 0], [s * 0.04, topY + s * 0.2, 0]], s * 0.035, s * 0.028, "#4f7a2a");
  return finalize(
    [
      { geometry: body, material: physical(`tomato-${ctx.variant}`, { roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.12, micro: 0.08 }) },
      { geometry: merge([cx, st]), material: leafMaterial("tomato") },
    ],
    cherryT ? "small" : "round",
  );
}

// ───────────────────────────── Cucumber / Zucchini ─────────────────────────────
export function cucumber(ctx: BuildCtx): ProduceModel {
  const zuc = ctx.variant === "zucchini";
  const L = zuc ? 0.22 : 0.16;
  const R = zuc ? 0.022 : 0.016;
  const seed = ctx.seed;
  const bend = ctx.rng.range(-0.012, 0.012);
  const curve = new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3(L * 0.5, bend, 0), new Vector3(L, 0, 0)]);
  const g = sweep(curve, {
    radial: seg(ctx, 28, 10),
    length: seg(ctx, 48, 14),
    radius: (t) => R * Math.pow(Math.sin(Math.PI * clamp(t, 0.0001, 0.9999)), zuc ? 0.22 : 0.3) * (zuc ? 0.9 + 0.12 * t : 1),
    cross: (a) => (zuc ? 1 + 0.03 * Math.cos(5 * a) : 1 + 0.02 * Math.cos(6 * a)),
  });
  if (!zuc) displace(g, (p) => Math.max(0, NOISE.noise(p.x * 220 + seed, p.y * 220, p.z * 220) - 0.55) * 0.004);
  paint(g, (p, _n, uv, out) => {
    const ang = uv.x * TAU;
    const n = NOISE.noise(p.x * 60 + seed, p.y * 60, p.z * 60);
    if (zuc) {
      mix(out, "#1f4a18", "#3e6a26", 0.5 + n * 0.4);
      if (NOISE.noise(p.x * 200, p.y * 200, p.z * 200 + seed) > 0.55) out.lerp(tmp.set("#b8c890"), 0.4);
    } else {
      mix(out, "#1a3e14", "#2f5a1e", 0.5 + n * 0.3);
      const stripe = Math.pow(Math.abs(Math.sin(ang * 5)), 4) * smoothstep(0.4, 1, uv.y);
      out.lerp(tmp.set("#8aa04a"), stripe * 0.5);
    }
  });
  const parts: any[] = [{ geometry: g, material: physical(`cuc-${zuc}`, { roughness: zuc ? 0.4 : 0.5, clearcoat: 0.3, micro: 0.25 }) }];
  if (zuc) {
    const st = stemGeometry([[-0.004, 0, 0], [-0.014, 0.002, 0], [-0.022, 0.003, 0]], 0.007, 0.006, "#7a8a4a", "#9a9a6a", 5, 3);
    parts.push({ geometry: st, material: stemMaterial("zucchini") });
  }
  return finalize(parts, "long");
}

// ───────────────────────────── Eggplant ─────────────────────────────
export function eggplant(ctx: BuildCtx): ProduceModel {
  const seed = ctx.seed;
  const body = organicLathe(
    [[0, -0.5], [0.22, -0.48], [0.36, -0.38], [0.42, -0.2], [0.4, 0.0], [0.34, 0.18], [0.27, 0.32], [0.22, 0.42], [0.18, 0.5], [0, 0.52]],
    ctx,
    0.025,
    (p, _a, t) => {
      p.x += 0.05 * t * t;
    },
  );
  paint(body, (p, _n, _uv, out) => mix(out, "#1c0820", "#3a1238", 0.4 + NOISE.noise(p.x * 3 + seed, p.y * 2, p.z * 3) * 0.4));
  body.scale(0.085, 0.2, 0.085);
  const topY = 0.2 * 0.5;
  const cap = calyx(5, 0.05, 0.03, 1.6, "#4a6e30", ctx, "#3e5e28");
  transformed(cap, [0.004, topY - 0.012, 0]);
  const st = stemGeometry([[0.004, topY - 0.01, 0], [0.006, topY + 0.02, 0], [0.012, topY + 0.04, 0]], 0.0075, 0.0065, "#5a7a3a", "#6a7a4a", 8, 5);
  const parts: any[] = [
    { geometry: body, material: physical("eggplant", { roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06 }) },
    { geometry: merge([cap, st]), material: leafMaterial("eggplant-cap", { roughness: 0.7, sheen: 0.8, sheenColor: new Color("#c8d8b0") }) },
  ];
  parts.forEach((p) => p.geometry.rotateZ(-Math.PI / 2));
  return finalize(parts, "long");
}

// ───────────────────────────── Bell pepper ─────────────────────────────
export function pepper(ctx: BuildCtx): ProduceModel {
  const v = ctx.variant; // red | yellow | green | orange
  const seed = ctx.seed;
  const body = organicLathe(
    [[0, -0.4], [0.2, -0.44], [0.36, -0.4], [0.46, -0.24], [0.5, -0.02], [0.5, 0.18], [0.46, 0.32], [0.34, 0.42], [0.16, 0.42], [0.07, 0.35], [0, 0.34]],
    ctx,
    0.02,
    (p, a, t) => {
      const lobe = Math.cos(4 * a + 0.3);
      const k = 1 + 0.1 * lobe * (0.55 + 0.45 * (1 - t));
      p.x *= k;
      p.z *= k;
      p.y -= 0.05 * Math.max(0, lobe) * Math.pow(1 - t, 3);
    },
  );
  const cols: Record<string, [string, string]> = {
    red: ["#9a0c0a", "#d4180e"],
    yellow: ["#e09a06", "#f6c412"],
    green: ["#1f5214", "#347a1e"],
    orange: ["#e0600a", "#f68a16"],
  };
  const c = cols[v] || cols.red;
  paint(body, (p, _n, _uv, out) => mix(out, c[0], c[1], 0.55 + NOISE.noise(p.x * 3 + seed, p.y * 3, p.z * 3) * 0.4));
  body.scale(0.09, 0.095, 0.09);
  const topY = 0.095 * 0.34;
  const shoulder = new SphereGeometry(0.011, 12, 6, 0, TAU, 0, Math.PI / 2);
  shoulder.scale(1, 0.5, 1);
  shoulder.translate(0, topY - 0.001, 0);
  paint(shoulder, (_p, _n, _uv, out) => out.set("#3a6a24"));
  const st = stemGeometry([[0, topY, 0], [0.002, topY + 0.016, 0], [0.008, topY + 0.03, 0.002]], 0.0045, 0.0038, "#3f6e22", "#5a7a32", 8, 6);
  return finalize(
    [
      { geometry: body, material: physical(`pepper-${v}`, { roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }) },
      { geometry: merge([shoulder, st]), material: stemMaterial("pepper", { roughness: 0.4 }) },
    ],
    "round",
  );
}

// ───────────────────────────── Chili ─────────────────────────────
export function chili(ctx: BuildCtx): ProduceModel {
  const green = ctx.variant === "green";
  const L = 0.09;
  const hook = ctx.rng.range(0.01, 0.02);
  const curve = new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3(L * 0.4, -0.003, 0), new Vector3(L * 0.8, -hook * 0.5, 0), new Vector3(L, -hook, 0.004)]);
  const g = sweep(curve, {
    radial: seg(ctx, 16, 7),
    length: seg(ctx, 30, 10),
    radius: (t) => 0.0085 * (t < 0.06 ? Math.sqrt(t / 0.06) * 0.6 + 0.4 : Math.pow(1 - t, 0.55)),
    cross: (a) => 1 + 0.04 * Math.cos(3 * a),
  });
  paint(g, (p, _n, _uv, out) => (green ? mix(out, "#2a6a14", "#3e8a1e", 0.5 + NOISE.noise(p.x * 80, p.y * 80, p.z * 80) * 0.3) : mix(out, "#8a0606", "#c41208", 0.5 + NOISE.noise(p.x * 80, p.y * 80, p.z * 80) * 0.3)));
  const cap = calyx(5, 0.008, 0.006, -0.4, "#3a6a22", ctx);
  cap.rotateZ(Math.PI / 2);
  const st = stemGeometry([[0, 0, 0], [-0.012, 0.003, 0], [-0.022, 0.008, 0]], 0.0018, 0.0015, "#3f6e22");
  return finalize(
    [
      { geometry: g, material: physical(`chili-${green}`, { roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.08 }) },
      { geometry: merge([cap, st]), material: stemMaterial("chili", { roughness: 0.45 }) },
    ],
    "small",
  );
}

// ───────────────────────────── Carrot ─────────────────────────────
export function carrot(ctx: BuildCtx): ProduceModel {
  const seed = ctx.seed;
  const L = 0.17 * ctx.rng.range(0.9, 1.1);
  const R = 0.016;
  const curve = new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3(L * 0.5, ctx.rng.range(-0.004, 0.004), 0.002), new Vector3(L, ctx.rng.range(-0.01, 0.01), 0)]);
  const g = sweep(curve, {
    radial: seg(ctx, 22, 9),
    length: seg(ctx, 48, 14),
    radius: (t) => (t < 0.04 ? R * Math.sqrt(t / 0.04) : R * Math.pow(1 - (t - 0.04) / 0.96, 0.85) + 0.0006),
  });
  displace(g, (p, _n, uv) => -0.0009 * Math.pow(Math.abs(Math.sin(uv.y * 70 + NOISE.noise(p.x * 40, p.y * 40, seed) * 2)), 10) + NOISE.noise(p.x * 90, p.y * 90, p.z * 90 + seed) * 0.0004);
  paint(g, (p, _n, uv, out) => {
    mix(out, "#d8540a", "#f2801c", 0.55 + NOISE.noise(p.x * 30 + seed, p.y * 30, p.z * 30) * 0.4);
    out.lerp(tmp.set("#a83a06"), Math.pow(Math.abs(Math.sin(uv.y * 70)), 14) * 0.5);
    out.lerp(tmp.set("#7a7a26"), smoothstep(0.04, 0.0, uv.y) * 0.7);
  });
  const parts: any[] = [{ geometry: g, material: physical("carrot", { roughness: 0.55, clearcoat: 0.1, micro: 0.3 }) }];
  // greens
  const greens = [];
  const n = seg(ctx, 6, 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const len = ctx.rng.range(0.08, 0.13);
    const end: [number, number, number] = [-len, Math.sin(a) * 0.025 + 0.01, Math.cos(a) * 0.025];
    greens.push(stemGeometry([[0.002, 0, 0], [-len * 0.4, end[1] * 0.4 + 0.004, end[2] * 0.4], end], 0.0014, 0.0007, "#5a8a2a", "#4a7a24", 5, 6));
    const leaves = seg(ctx, 5, 2);
    for (let k = 0; k < leaves; k++) {
      const t = 0.45 + (k / leaves) * 0.55;
      const lf = leafGeometry({ length: 0.03, width: 0.018, shape: "serrated", curl: 0.2, fold: 0.3, ruffle: 0.08, ruffleFreq: 12, base: "#3e7a22", tip: "#2e6a1a", segU: 4, segV: seg(ctx, 6, 3), seed: k });
      lf.rotateY(-Math.PI / 2 + (k % 2 ? 0.6 : -0.6));
      lf.rotateX(ctx.rng.range(-0.4, 0.4));
      lf.translate(end[0] * t, end[1] * t + 0.004, end[2] * t);
      greens.push(lf);
    }
  }
  parts.push({ geometry: merge(greens), material: leafMaterial("carrot") });
  return finalize(parts, "long");
}

// ───────────────────────────── Potato / sweet potato / ginger ─────────────────────────────
export function potato(ctx: BuildCtx): ProduceModel {
  const v = ctx.variant; // potato | red | sweet | ginger
  const seed = ctx.seed;
  if (v === "ginger") return ginger(ctx);
  const g = new IcosahedronGeometry(0.5, seg(ctx, 5, 3));
  const sx = v === "sweet" ? 0.16 : 0.085;
  const sy = v === "sweet" ? 0.055 : 0.058;
  const sz = v === "sweet" ? 0.06 : 0.065;
  g.scale(sx, sy, sz);
  displace(g, (p) => {
    let d = NOISE.fbm(p.x * 18 + seed, p.y * 18, p.z * 18, 3) * 0.006;
    const eye = NOISE.noise(p.x * 70 - seed, p.y * 70, p.z * 70);
    if (eye > 0.65) d -= (eye - 0.65) * 0.012;
    if (v === "sweet") d *= 1.4;
    return d;
  });
  if (v === "sweet") {
    // taper the ends
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / (sx * 0.5);
      const k = 1 - 0.55 * Math.pow(Math.abs(x), 2.2);
      pos.setY(i, pos.getY(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    g.computeVertexNormals();
  }
  paint(g, (p, _n, _uv, out) => {
    const n = NOISE.fbm(p.x * 40 + seed, p.y * 40, p.z * 40, 3);
    if (v === "red") mix(out, "#7a2a22", "#a8443a", 0.5 + n * 0.6);
    else if (v === "sweet") mix(out, "#7a2e22", "#a8503a", 0.5 + n * 0.6);
    else mix(out, "#a8834e", "#cba870", 0.5 + n * 0.6);
    if (NOISE.noise(p.x * 120, p.y * 120 + seed, p.z * 120) > 0.55) out.multiplyScalar(0.72);
  });
  g.rotateY(ctx.rng.range(0, TAU));
  return finalize([{ geometry: g, material: physical(`potato-${v}`, { roughness: 0.88, micro: 0.7 }) }], v === "sweet" ? "long" : "round");
}

function ginger(ctx: BuildCtx): ProduceModel {
  const seed = ctx.seed;
  const list = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const g = new IcosahedronGeometry(0.5, seg(ctx, 3, 2));
    const len = ctx.rng.range(0.035, 0.06);
    g.scale(len, 0.026, 0.028);
    g.rotateZ(ctx.rng.range(-0.8, 0.8));
    g.rotateY(ctx.rng.range(-0.6, 0.6));
    g.translate(i * 0.022 - 0.04, ctx.rng.range(-0.004, 0.006), ctx.rng.range(-0.012, 0.012));
    list.push(g);
  }
  const g = merge(list);
  displace(g, (p) => NOISE.fbm(p.x * 40 + seed, p.y * 40, p.z * 40, 2) * 0.003, true);
  paint(g, (p, _n, _uv, out) => {
    mix(out, "#b48a52", "#d4ac72", 0.5 + NOISE.noise(p.x * 50, p.y * 50, p.z * 50 + seed) * 0.5);
    out.lerp(tmp.set("#8a6236"), Math.pow(Math.abs(Math.sin(p.x * 300)), 12) * 0.5);
  });
  return finalize([{ geometry: g, material: physical("ginger", { roughness: 0.8, micro: 0.6 }) }], "long");
}

// ───────────────────────────── Onion / garlic ─────────────────────────────
export function onion(ctx: BuildCtx): ProduceModel {
  const v = ctx.variant; // yellow | red | white | garlic
  const seed = ctx.seed;
  const garlicV = v === "garlic";
  const body = organicLathe(
    garlicV
      ? [[0, -0.36], [0.2, -0.38], [0.38, -0.3], [0.48, -0.12], [0.48, 0.06], [0.38, 0.22], [0.22, 0.34], [0.09, 0.46], [0.03, 0.6], [0, 0.64]]
      : [[0, -0.4], [0.08, -0.42], [0.25, -0.36], [0.42, -0.2], [0.49, 0.0], [0.46, 0.18], [0.34, 0.32], [0.18, 0.42], [0.07, 0.5], [0.03, 0.6], [0, 0.62]],
    ctx,
    0.03,
    garlicV
      ? (p, a, t) => {
          const k = 0.93 + 0.07 * Math.pow(Math.abs(Math.cos(a * 4)), 0.5) * Math.sin(Math.PI * Math.min(1, t * 1.4));
          p.x *= k;
          p.z *= k;
        }
      : undefined,
  );
  paint(body, (p, _n, uv, out) => {
    const ang = Math.atan2(p.z, p.x);
    const streak = NOISE.noise(Math.cos(ang) * 14 + seed, Math.sin(ang) * 14, p.y * 2) * 0.5 + 0.5;
    if (garlicV) {
      mix(out, "#e6dccb", "#f4eee2", streak);
      out.lerp(tmp.set("#a87a98"), clamp(streak - 0.6) * 1.2 * (1 - uv.y));
    } else if (v === "red") {
      mix(out, "#5a1430", "#8e2c50", streak);
    } else if (v === "white") {
      mix(out, "#e4ddc8", "#f6f0e0", streak);
    } else {
      mix(out, "#9a5a22", "#cf8a3c", streak);
    }
    out.lerp(tmp.set(garlicV || v === "white" ? "#c8b898" : "#6a4420"), smoothstep(0.85, 1, uv.y) * 0.7);
  });
  const s = garlicV ? 0.055 : 0.08;
  body.scale(s, s, s);
  const roots = [];
  if (ctx.detail === "hero") {
    for (let i = 0; i < 14; i++) {
      const a = ctx.rng.range(0, TAU);
      const r = ctx.rng.range(0.001, s * 0.08);
      roots.push(
        stemGeometry([[Math.cos(a) * r, -s * 0.4, Math.sin(a) * r], [Math.cos(a) * r * 2, -s * 0.47, Math.sin(a) * r * 2], [Math.cos(a) * r * 3.5, -s * 0.5, Math.sin(a) * r * 3.5]], 0.0005, 0.0003, "#d8c8a0", "#c8b890", 3, 3),
      );
    }
  }
  const parts: any[] = [
    {
      geometry: body,
      material: physical(`onion-${v}`, { roughness: 0.5, clearcoat: 0.25, sheen: 0.5, sheenColor: new Color("#fff0d8"), sheenRoughness: 0.6, micro: 0.35 }),
    },
  ];
  if (roots.length) parts.push({ geometry: merge(roots), material: stemMaterial("roots") });
  return finalize(parts, "round");
}

// ───────────────────────────── Leafy heads: cabbage / lettuce ─────────────────────────────
export function cabbage(ctx: BuildCtx): ProduceModel {
  const v = ctx.variant; // cabbage | red | iceberg | lettuce | romaine
  const seed = ctx.seed;
  const red = v === "red";
  const loose = v === "lettuce" || v === "romaine";
  const list = [];
  if (!loose) {
    const core = new IcosahedronGeometry(0.5, seg(ctx, 4, 2));
    core.scale(0.14, 0.13, 0.14);
    displace(core, (p) => NOISE.fbm(p.x * 20 + seed, p.y * 20, p.z * 20, 2) * 0.004);
    paint(core, (p, _n, _uv, out) => (red ? mix(out, "#4a1a48", "#7a3a7a", 0.5 + NOISE.noise(p.x * 30, p.y * 30, p.z * 30) * 0.4) : mix(out, "#b8d080", "#d4e4a4", 0.5 + NOISE.noise(p.x * 30, p.y * 30, p.z * 30) * 0.4)));
    core.translate(0, 0.065, 0);
    list.push(core);
    // wrapping outer leaves (spherical shells)
    const n = seg(ctx, 7, 4);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU + ctx.rng.range(-0.2, 0.2);
      const span = ctx.rng.range(1.6, 2.2);
      const R = 0.075 + i * 0.002;
      const open = ctx.rng.range(0.1, 0.35);
      const leaf = surface(
        seg(ctx, 18, 7),
        seg(ctx, 14, 6),
        (u, vv, out) => {
          const th = a0 + (u - 0.5) * span;
          const ph = lerp(Math.PI * 0.95, Math.PI * (0.2 - open * 0.3), vv);
          const wr = R * (1 + 0.06 * NOISE.noise(Math.cos(th) * 6 + i, ph * 4, seed) + vv * vv * open * 0.5);
          out.set(Math.cos(th) * Math.sin(ph) * wr, -Math.cos(ph) * wr + 0.065, Math.sin(th) * Math.sin(ph) * wr);
        },
        false,
      );
      paint(leaf, (p, _n, uv, out) => {
        const vein = Math.exp(-Math.pow((uv.x - 0.5) * 18, 2));
        if (red) mix(out, "#5a2050", "#3a1238", uv.y);
        else mix(out, "#c8dc98", "#5e8e36", smoothstep(0.1, 1, uv.y * 0.8 + Math.abs(uv.x - 0.5) * 0.6));
        out.lerp(tmp.set(red ? "#c8a0c0" : "#e8f0c8"), vein * 0.6);
        out.multiplyScalar(0.92 + 0.12 * (NOISE.noise(p.x * 80, p.y * 80, p.z * 80) * 0.5 + 0.5));
      });
      list.push(leaf);
    }
  } else {
    const n = seg(ctx, 16, 8);
    for (let i = 0; i < n; i++) {
      const ring = i / n;
      const a = i * 2.39996;
      const len = v === "romaine" ? lerp(0.16, 0.24, ring) : lerp(0.1, 0.17, ring);
      const lf = leafGeometry({
        length: len,
        width: v === "romaine" ? len * 0.45 : len * 0.85,
        shape: v === "romaine" ? "oval" : "round",
        curl: lerp(-0.5, 0.55, ring),
        fold: 0.35,
        ruffle: v === "romaine" ? 0.04 : 0.12,
        ruffleFreq: v === "romaine" ? 8 : 14,
        base: "#e4f0c0",
        tip: ctx.variant === "red" ? "#7a2a3a" : "#4e8e2a",
        rib: "#f0f8d8",
        segU: seg(ctx, 10, 5),
        segV: seg(ctx, 16, 7),
        seed: i,
      });
      lf.rotateX(-Math.PI / 2 + lerp(0.05, 0.62, ring));
      lf.rotateY(a);
      list.push(lf);
    }
  }
  const geo = merge(list);
  const mat = leafMaterial(`head-${v}`, { roughness: 0.45, clearcoat: 0.25, sheen: 0.3 });
  return finalize([{ geometry: geo, material: mat }], loose ? "single" : "single");
}

// ───────────────────────────── Broccoli / cauliflower ─────────────────────────────
export function broccoli(ctx: BuildCtx): ProduceModel {
  const cauli = ctx.variant === "cauliflower";
  const seed = ctx.seed;
  const florets = [];
  const stalks = [stemGeometry([[0, -0.06, 0], [0, -0.02, 0], [0, 0.02, 0]], 0.016, 0.013, cauli ? "#d8e0b0" : "#8ab060", cauli ? "#e8e8c8" : "#7aa050", 10, 4)];
  const branches = seg(ctx, 7, 5);
  for (let b = 0; b < branches; b++) {
    const a = (b / branches) * TAU + ctx.rng.range(-0.3, 0.3);
    const out = ctx.rng.range(0.025, 0.045);
    const top = ctx.rng.range(0.035, 0.05);
    const end: [number, number, number] = [Math.cos(a) * out, top, Math.sin(a) * out];
    stalks.push(stemGeometry([[0, 0.01, 0], [end[0] * 0.5, top * 0.6, end[2] * 0.5], end], 0.006, 0.004, cauli ? "#e0e4c0" : "#8ab060", cauli ? "#e8e8d0" : "#7aa050", 6, 4));
    const cl = seg(ctx, 7, 3);
    for (let k = 0; k < cl; k++) {
      const g = new IcosahedronGeometry(1, seg(ctx, 2, 1));
      const r = ctx.rng.range(0.012, 0.02);
      g.scale(r, r * 0.8, r);
      const aa = ctx.rng.range(0, TAU);
      const rr = ctx.rng.range(0, 0.016);
      g.translate(end[0] + Math.cos(aa) * rr, end[1] + 0.008 + ctx.rng.range(0, 0.008), end[2] + Math.sin(aa) * rr);
      florets.push(g);
    }
  }
  // center crown
  for (let k = 0; k < seg(ctx, 6, 3); k++) {
    const g = new IcosahedronGeometry(1, seg(ctx, 2, 1));
    const r = ctx.rng.range(0.016, 0.024);
    g.scale(r, r * 0.8, r);
    g.translate(ctx.rng.range(-0.012, 0.012), 0.058 + ctx.rng.range(0, 0.006), ctx.rng.range(-0.012, 0.012));
    florets.push(g);
  }
  const fg = merge(florets);
  displace(fg, (p) => (NOISE.noise(p.x * 260 + seed, p.y * 260, p.z * 260) * 0.5 + 0.5) * (cauli ? 0.0018 : 0.0028), true);
  paint(fg, (p, _n, _uv, out) => {
    const n = NOISE.noise(p.x * 200 + seed, p.y * 200, p.z * 200) * 0.5 + 0.5;
    if (cauli) mix(out, "#d8cfa8", "#f4eedc", n);
    else {
      mix(out, "#1e3e1a", "#3a6a2a", n);
      out.lerp(tmp.set("#2a4a44"), clamp(0.5 - n) * 0.5);
    }
  });
  const parts: any[] = [
    { geometry: fg, material: physical(`floret-${cauli}`, { roughness: 0.85, micro: 0.5, sheen: 0.3, sheenColor: new Color(cauli ? "#fff8e0" : "#a0c8a0") }) },
    { geometry: merge(stalks), material: stemMaterial(`brocstalk-${cauli}`, { roughness: 0.55 }) },
  ];
  if (cauli) {
    const leaves = [];
    for (let i = 0; i < seg(ctx, 8, 5); i++) {
      const a = (i / 8) * TAU;
      const lf = leafGeometry({ length: 0.13, width: 0.07, curl: -0.3, fold: 0.3, ruffle: 0.05, base: "#d8e4b0", tip: "#4e8a3a", rib: "#f0f4d8", segU: seg(ctx, 8, 4), segV: seg(ctx, 10, 5), seed: i });
      lf.rotateX(-Math.PI / 2 + 0.45);
      lf.rotateY(a);
      lf.translate(0, -0.04, 0);
      leaves.push(lf);
    }
    parts.push({ geometry: merge(leaves), material: leafMaterial("cauli") });
  }
  return finalize(parts, "single");
}

// ───────────────────────────── Corn ─────────────────────────────
export function corn(ctx: BuildCtx): ProduceModel {
  const cob = organicLathe(
    [[0, -0.5], [0.18, -0.49], [0.26, -0.45], [0.28, -0.3], [0.28, 0.1], [0.26, 0.3], [0.2, 0.45], [0.1, 0.5], [0, 0.5]],
    ctx,
    0.01,
  );
  paint(cob, (_p, _n, _uv, out) => out.setRGB(1, 1, 1));
  cob.scale(0.17, 0.2, 0.17);
  const k = cornKernels();
  const husks = [];
  const n = seg(ctx, 5, 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + ctx.rng.range(-0.3, 0.3);
    const lf = leafGeometry({
      length: ctx.rng.range(0.15, 0.2),
      width: 0.06,
      shape: "lance",
      curl: ctx.rng.range(-0.6, -0.1),
      fold: -0.6,
      base: "#c8d090",
      tip: "#a8b870",
      rib: "#d8dca8",
      segU: seg(ctx, 8, 4),
      segV: seg(ctx, 12, 5),
      seed: i,
    });
    lf.rotateX(-Math.PI / 2 + 0.12);
    lf.translate(0, 0, 0.038);
    lf.rotateY(a);
    lf.translate(0, -0.1, 0);
    husks.push(lf);
  }
  const silk = [];
  if (ctx.detail === "hero") {
    for (let i = 0; i < 16; i++) {
      const a = ctx.rng.range(0, TAU);
      silk.push(stemGeometry([[0, 0.098, 0], [Math.cos(a) * 0.006, 0.112, Math.sin(a) * 0.006], [Math.cos(a) * 0.016, 0.125, Math.sin(a) * 0.016]], 0.0006, 0.0004, "#c8a050", "#8a5a2a", 3, 4));
    }
  }
  const parts: any[] = [
    { geometry: cob, material: physical("corn", { map: k.map, normalMap: k.normalMap, normalScale: new Vector2(1.6, 1.6), roughness: 0.4, clearcoat: 0.4 }) },
    { geometry: merge(husks), material: leafMaterial("husk", { roughness: 0.7, sheen: 0.4 }) },
  ];
  if (silk.length) parts.push({ geometry: merge(silk), material: stemMaterial("silk", { roughness: 0.4 }) });
  parts.forEach((p) => p.geometry.rotateZ(-Math.PI / 2));
  return finalize(parts, "long");
}

// ───────────────────────────── Pumpkin / squash ─────────────────────────────
export function pumpkin(ctx: BuildCtx): ProduceModel {
  const seed = ctx.seed;
  const butternut = ctx.variant === "butternut";
  if (butternut) {
    const body = organicLathe(
      [[0, -0.5], [0.2, -0.49], [0.32, -0.4], [0.36, -0.25], [0.32, -0.08], [0.2, 0.08], [0.17, 0.25], [0.17, 0.4], [0.12, 0.48], [0, 0.5]],
      ctx,
      0.015,
    );
    paint(body, (p, _n, _uv, out) => mix(out, "#d8a060", "#e8b878", 0.5 + NOISE.noise(p.x * 6 + seed, p.y * 6, p.z * 6) * 0.4));
    body.scale(0.14, 0.26, 0.14);
    body.rotateZ(Math.PI / 2);
    return finalize([{ geometry: body, material: physical("butternut", { roughness: 0.5, clearcoat: 0.2, micro: 0.3 }) }], "long");
  }
  const body = organicLathe(
    [[0, -0.3], [0.15, -0.37], [0.35, -0.35], [0.48, -0.2], [0.52, 0.0], [0.48, 0.18], [0.36, 0.3], [0.16, 0.34], [0.05, 0.27], [0, 0.26]],
    ctx,
    0.025,
    (p, a) => {
      const rib = Math.pow(Math.abs(Math.cos(a * 5)), 0.5);
      const k = 0.93 + 0.07 * rib;
      p.x *= k;
      p.z *= k;
    },
  );
  paint(body, (p, _n, _uv, out) => {
    const a = Math.atan2(p.z, p.x);
    const rib = Math.pow(Math.abs(Math.cos(a * 5)), 0.5);
    mix(out, "#b8460a", "#f08a1e", rib * 0.7 + 0.2 + NOISE.noise(p.x * 4 + seed, p.y * 4, p.z * 4) * 0.2);
  });
  body.scale(0.26, 0.24, 0.26);
  const topY = 0.24 * 0.26;
  const st = stemGeometry([[0, topY - 0.01, 0], [0.004, topY + 0.02, 0], [0.016, topY + 0.045, 0.004], [0.03, topY + 0.05, 0.006]], 0.013, 0.009, "#6a5a32", "#8a7a52", 6, 8);
  return finalize(
    [
      { geometry: body, material: physical("pumpkin", { roughness: 0.48, clearcoat: 0.25, micro: 0.35 }) },
      { geometry: st, material: stemMaterial("pumpkin", { roughness: 0.85 }) },
    ],
    "single",
  );
}

// ───────────────────────────── Mushroom ─────────────────────────────
export function mushroom(ctx: BuildCtx): ProduceModel {
  const brown = ctx.variant === "brown";
  const seed = ctx.seed;
  const cap = organicLathe(
    [[0, 0.02], [0.25, 0.04], [0.42, 0.06], [0.5, 0.12], [0.48, 0.22], [0.38, 0.32], [0.2, 0.37], [0, 0.38]],
    ctx,
    0.03,
  );
  paint(cap, (p, _n, uv, out) => {
    const n = NOISE.noise(p.x * 30 + seed, p.y * 30, p.z * 30);
    if (uv.y < 0.15) out.set(brown ? "#4a3022" : "#b8a080");
    else if (brown) mix(out, "#7a5236", "#9a7050", 0.5 + n * 0.4);
    else mix(out, "#e8e0d0", "#f6f2ea", 0.5 + n * 0.4);
  });
  const stalk = organicLathe([[0, -0.3], [0.13, -0.3], [0.12, -0.1], [0.11, 0.05], [0, 0.06]], ctx, 0.02, undefined, ctx.detail === "hero" ? [24, 8] : [10, 4]);
  paint(stalk, (_p, _n, _uv, out) => out.set(brown ? "#d8c8b0" : "#efe8dc"));
  const g = merge([cap, stalk]);
  g.scale(0.05, 0.05, 0.05);
  return finalize([{ geometry: g, material: physical(`mushroom-${brown}`, { roughness: 0.7, sheen: 0.3, micro: 0.3 }) }], "small");
}

// ───────────────────────────── Root with greens: radish / beet ─────────────────────────────
export function radish(ctx: BuildCtx): ProduceModel {
  const beet = ctx.variant === "beet";
  const seed = ctx.seed;
  const body = organicLathe(
    [[0, -0.95], [0.02, -0.7], [0.1, -0.45], [0.32, -0.25], [0.45, 0], [0.42, 0.2], [0.28, 0.35], [0.1, 0.42], [0, 0.42]],
    ctx,
    0.04,
  );
  paint(body, (p, _n, uv, out) => {
    const n = NOISE.noise(p.x * 6 + seed, p.y * 6, p.z * 6);
    if (beet) mix(out, "#3a0a1e", "#6a1a32", 0.5 + n * 0.4);
    else {
      mix(out, "#f2ece0", "#c81e44", smoothstep(0.3, 0.6, uv.y + n * 0.08));
    }
  });
  const s = beet ? 0.075 : 0.035;
  body.scale(s, s, s);
  const greens = [];
  const n = seg(ctx, 5, 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const h = ctx.rng.range(0.06, 0.1) * (beet ? 1.5 : 1);
    const end: [number, number, number] = [Math.cos(a) * 0.02, s * 0.42 + h, Math.sin(a) * 0.02];
    greens.push(stemGeometry([[0, s * 0.4, 0], [end[0] * 0.5, s * 0.42 + h * 0.5, end[2] * 0.5], end], 0.0018, 0.0012, beet ? "#8a1a3a" : "#7a9a4a", beet ? "#a02a4a" : "#6a8a3a", 5, 5));
    const lf = leafGeometry({ length: h * 0.9, width: h * 0.45, curl: 0.4, fold: 0.25, ruffle: 0.05, base: beet ? "#4a6a2a" : "#4e8a2a", tip: beet ? "#3a5a22" : "#3a7a22", rib: beet ? "#a02a4a" : "#a8c870", segU: seg(ctx, 6, 3), segV: seg(ctx, 10, 4), seed: i });
    lf.rotateX(-Math.PI / 2 + 0.6);
    lf.rotateY(a + Math.PI / 2);
    lf.translate(end[0], end[1] - 0.01, end[2]);
    greens.push(lf);
  }
  const parts: any[] = [
    { geometry: body, material: physical(`radish-${beet}`, { roughness: 0.4, clearcoat: 0.3, micro: 0.2 }) },
    { geometry: merge(greens), material: leafMaterial("radish") },
  ];
  if (ctx.detail === "pile") parts.forEach((p) => p.geometry.rotateZ(Math.PI / 2 - 0.1));
  return finalize(parts, ctx.detail === "pile" ? "bunch" : "single");
}

// ───────────────────────────── Herbs & greens bunches ─────────────────────────────
export function herbs(ctx: BuildCtx): ProduceModel {
  const v = ctx.variant; // parsley | mint | basil | dill | cilantro | spinach | generic
  const seed = ctx.seed;
  const stems = [];
  const leaves = [];
  const n = v === "spinach" ? seg(ctx, 14, 8) : seg(ctx, 26, 14);
  const H = v === "spinach" ? 0.2 : 0.26;
  for (let i = 0; i < n; i++) {
    const a = ctx.rng.range(0, TAU);
    const spread = ctx.rng.range(0.01, 0.05);
    const h = H * ctx.rng.range(0.75, 1.05);
    const end: [number, number, number] = [Math.cos(a) * spread * 1.6, h, Math.sin(a) * spread * 1.6];
    const mid: [number, number, number] = [Math.cos(a) * spread * 0.6, h * 0.55, Math.sin(a) * spread * 0.6];
    const b0: [number, number, number] = [Math.cos(a) * 0.004, 0, Math.sin(a) * 0.004];
    stems.push(stemGeometry([b0, mid, end], v === "spinach" ? 0.0022 : 0.0016, 0.001, v === "spinach" ? "#a8c878" : "#6a9a3a", "#4e8a2a", 4, seg(ctx, 6, 4)));
    const per = v === "spinach" ? 1 : seg(ctx, 5, 3);
    for (let k = 0; k < per; k++) {
      const t = v === "spinach" ? 1 : 0.55 + (k / per) * 0.45;
      const pos = new Vector3(lerp(mid[0], end[0], t), lerp(mid[1], end[1], t), lerp(mid[2], end[2], t));
      const opts: any = {
        segU: seg(ctx, 5, 3),
        segV: seg(ctx, 7, 4),
        seed: i * 7 + k,
        fold: 0.25,
        curl: 0.35,
        base: "#3f7a26",
        tip: "#2c5e1a",
      };
      if (v === "mint") Object.assign(opts, { length: 0.035, width: 0.022, shape: "serrated", ruffle: 0.06, base: "#5a9a3a", tip: "#3e7e2a" });
      else if (v === "basil") Object.assign(opts, { length: 0.045, width: 0.028, shape: "oval", fold: 0.45, base: "#3e8a2a", tip: "#2a6a1e" });
      else if (v === "dill") Object.assign(opts, { length: 0.05, width: 0.006, shape: "lance", ruffle: 0.2, ruffleFreq: 20, base: "#5a8a3a", tip: "#4a7a32" });
      else if (v === "spinach") Object.assign(opts, { length: 0.11, width: 0.065, shape: "heart", fold: 0.3, curl: 0.5, base: "#2e5e1e", tip: "#1e4a16", rib: "#7aa04a" });
      else Object.assign(opts, { length: 0.03, width: 0.026, shape: "round", ruffle: 0.18, ruffleFreq: 16, base: "#3a7a24", tip: "#2a6a1c" });
      const lf = leafGeometry(opts);
      lf.rotateX(-Math.PI / 2 + ctx.rng.range(0.4, 1.2));
      lf.rotateY(a + (k % 2 ? 0.9 : -0.9) + ctx.rng.range(-0.3, 0.3));
      lf.translate(pos.x, pos.y, pos.z);
      leaves.push(lf);
    }
  }
  // twine band
  const band = new TorusGeometry(0.014, 0.0028, 6, 18);
  band.rotateX(Math.PI / 2);
  band.translate(0, 0.035, 0);
  paint(band, (p, _n, _uv, out) => mix(out, "#a8865a", "#c8a878", NOISE.noise(p.x * 400, p.y * 400, p.z * 400) * 0.5 + 0.5));
  const parts: any[] = [
    { geometry: merge(leaves), material: leafMaterial(`herb-${v}`, { roughness: v === "basil" || v === "spinach" ? 0.35 : 0.55, clearcoat: v === "basil" ? 0.4 : 0.1 }) },
    { geometry: merge([...stems, band]), material: stemMaterial("herb-stems", { roughness: 0.6 }) },
  ];
  if (ctx.detail === "pile") parts.forEach((p) => p.geometry.rotateZ(Math.PI / 2));
  return finalize(parts, ctx.detail === "pile" ? "bunch" : "single");
}

// ───────────────────────────── Leek / scallion / celery ─────────────────────────────
export function leek(ctx: BuildCtx): ProduceModel {
  const v = ctx.variant; // leek | scallion | celery
  const seed = ctx.seed;
  const list = [];
  const leaves = [];
  if (v === "celery") {
    const ribs = seg(ctx, 8, 5);
    for (let i = 0; i < ribs; i++) {
      const a = (i / ribs) * TAU;
      const off = 0.012;
      const curve = new CatmullRomCurve3([new Vector3(Math.cos(a) * off * 0.6, 0, Math.sin(a) * off * 0.6), new Vector3(Math.cos(a) * off, 0.15, Math.sin(a) * off), new Vector3(Math.cos(a) * off * 1.6, 0.28, Math.sin(a) * off * 1.6)]);
      const g = sweep(curve, {
        radial: seg(ctx, 12, 6),
        length: seg(ctx, 16, 6),
        radius: (t) => 0.009 * (1.25 - t * 0.5),
        cross: (aa) => 1 - 0.32 * Math.cos(aa - a) + 0.03 * Math.cos(aa * 8),
      });
      paint(g, (p, _n, uv, out) => mix(out, "#d8e8b0", "#8ab85a", uv.y * 0.8 + NOISE.noise(p.x * 80, p.y * 80, p.z * 80 + seed) * 0.15));
      list.push(g);
      const lf = leafGeometry({ length: 0.07, width: 0.05, shape: "serrated", curl: 0.4, ruffle: 0.08, base: "#6a9a3a", tip: "#4a8a2a", segU: seg(ctx, 6, 3), segV: seg(ctx, 8, 4), seed: i });
      lf.rotateX(-Math.PI / 2 + 0.5);
      lf.rotateY(-a + Math.PI / 2);
      lf.translate(Math.cos(a) * off * 1.6, 0.27, Math.sin(a) * off * 1.6);
      leaves.push(lf);
    }
  } else {
    const count = v === "scallion" ? seg(ctx, 8, 5) : 1;
    for (let i = 0; i < count; i++) {
      const R = v === "scallion" ? 0.005 : 0.017;
      const L = v === "scallion" ? 0.3 : 0.24;
      const a = (i / count) * TAU;
      const ox = count > 1 ? Math.cos(a) * 0.008 : 0;
      const oz = count > 1 ? Math.sin(a) * 0.008 : 0;
      const curve = new CatmullRomCurve3([new Vector3(ox, 0, oz), new Vector3(ox * 1.2, L * 0.5, oz * 1.2), new Vector3(ox * 1.6, L, oz * 1.6)]);
      const g = sweep(curve, { radial: seg(ctx, 16, 7), length: seg(ctx, 20, 8), radius: (t) => R * (t < 0.04 ? 0.7 + t * 7 : 1) });
      paint(g, (p, _n, uv, out) => mix(out, "#f2f0e2", v === "scallion" ? "#4e8a2a" : "#6a9a4a", smoothstep(0.35, 0.75, uv.y)).multiplyScalar(0.94 + 0.08 * (NOISE.noise(p.x * 200, p.y * 30, p.z * 200 + seed) * 0.5 + 0.5)));
      list.push(g);
      const fl = v === "scallion" ? 2 : seg(ctx, 5, 3);
      for (let k = 0; k < fl; k++) {
        const lf = leafGeometry({ length: v === "scallion" ? 0.12 : 0.16, width: v === "scallion" ? 0.008 : 0.034, shape: "sword", curl: 0.3 + k * 0.1, fold: 0.5, base: "#5a8a3a", tip: v === "scallion" ? "#3e7a26" : "#3a6a3a", segU: 3, segV: seg(ctx, 8, 4), seed: k + i });
        lf.rotateX(-Math.PI / 2 + 0.2 + k * 0.12);
        lf.rotateY(a + (k / fl) * TAU);
        lf.translate(ox * 1.6, L - 0.01, oz * 1.6);
        leaves.push(lf);
      }
    }
  }
  const parts: any[] = [
    { geometry: merge(list), material: physical(`stalk-${v}`, { roughness: 0.45, clearcoat: 0.2, micro: 0.25 }) },
    { geometry: merge(leaves), material: leafMaterial(`leek-${v}`) },
  ];
  if (ctx.detail === "pile") parts.forEach((p) => p.geometry.rotateZ(Math.PI / 2));
  return finalize(parts, ctx.detail === "pile" ? "bunch" : "single");
}

// ───────────────────────────── Generic: kraft bag with label ─────────────────────────────
export function bag(ctx: BuildCtx): ProduceModel {
  const g = new BoxGeometry(0.12, 0.16, 0.08, seg(ctx, 8, 3), seg(ctx, 10, 4), seg(ctx, 6, 3));
  const pos = g.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const crumple = y > 0.06 ? (y - 0.06) * 0.6 : 0;
    pos.setZ(i, pos.getZ(i) * (1 - crumple * 6));
    pos.setX(i, pos.getX(i) + NOISE.noise(pos.getX(i) * 40, y * 40, pos.getZ(i) * 40) * 0.002);
  }
  g.computeVertexNormals();
  g.translate(0, 0.08, 0);
  paint(g, (_p, _n, _uv, out) => out.setRGB(1, 1, 1));
  const k = kraftSet();
  return finalize([{ geometry: g, material: physical("kraft", { map: k.map, normalMap: k.normalMap, roughness: 0.85 }) }], "single");
}
