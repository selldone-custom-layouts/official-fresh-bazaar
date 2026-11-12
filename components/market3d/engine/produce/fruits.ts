/*
 * Fresh Market 3D — procedural fruit models (real-world scale, meters).
 */
import { CatmullRomCurve3, Color, IcosahedronGeometry, Vector2, Vector3 } from "three";
import { displace, merge, paint, sweep, transformed } from "../util/geo";
import { melonNet, pineappleSkin, poresNormal, strawberrySkin } from "../util/textures";
import {
  BuildCtx,
  C,
  NOISE,
  ProduceModel,
  calyx,
  clamp,
  finalize,
  leafGeometry,
  leafMaterial,
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

// ───────────────────────────── Apple ─────────────────────────────
export function apple(ctx: BuildCtx): ProduceModel {
  const v = ctx.variant;
  const body = organicLathe(
    [
      [0, -0.4], [0.1, -0.43], [0.24, -0.45], [0.38, -0.4], [0.47, -0.27], [0.51, -0.08],
      [0.5, 0.1], [0.46, 0.26], [0.38, 0.38], [0.25, 0.44], [0.13, 0.42], [0.05, 0.34], [0, 0.3],
    ],
    ctx,
    0.035,
    (p, a, t) => {
      const lobes = 1 + 0.025 * Math.cos(5 * a) * Math.pow(1 - t, 2);
      p.x *= lobes;
      p.z *= lobes;
    },
  );
  const seed = ctx.seed;
  const sideDir = ctx.rng.range(0, TAU);
  paint(body, (p, _n, uv, out) => {
    const ang = Math.atan2(p.z, p.x);
    const streak = NOISE.noise(Math.cos(ang) * 7 + seed, Math.sin(ang) * 7, p.y * 1.4);
    const fine = NOISE.noise(p.x * 18, p.y * 18, p.z * 18 + seed);
    const side = 0.5 + 0.5 * Math.cos(ang - sideDir);
    const top = smoothstep(0.78, 0.95, uv.y);
    if (v === "green") {
      mix(out, "#5f9a1f", "#9cc63c", side * 0.6 + fine * 0.15 + 0.2);
      out.lerp(tmp.set("#c8b545"), side * 0.25);
    } else if (v === "yellow") {
      mix(out, "#d9b92c", "#f0d85a", side * 0.5 + fine * 0.2);
      out.lerp(tmp.set("#e08a3a"), Math.max(0, side - 0.6) * 0.6);
    } else {
      mix(out, "#6e0910", "#c41f22", side * 0.7 + streak * 0.25 + 0.15);
      out.lerp(tmp.set("#c8a640"), clamp(-streak * 0.9 - 0.15) * (1 - side) * 0.85);
      out.lerp(tmp.set("#a8a030"), top * 0.6);
    }
  });
  body.scale(0.082, 0.082, 0.082);
  const parts = [
    {
      geometry: body,
      material: physical(`apple-${v}`, { roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.28, micro: 0.12 }),
    },
  ];
  const stem = stemGeometry([[0, 0.024, 0], [0.002, 0.033, 0], [0.005, 0.043, 0.001], [0.009, 0.05, 0.002]], 0.0016, 0.0012, "#5a3d1e", "#3a2510");
  const stemParts = [stem];
  if (ctx.detail === "hero" || ctx.rng.next() < 0.0) {
    const lf = leafGeometry({ length: 0.045, width: 0.022, curl: 0.5, fold: 0.25, base: "#5f8f2a", tip: "#3d6e1f", seed: ctx.seed });
    transformed(lf, [0.006, 0.046, 0.001], [-0.5, 0.6, 0]);
    parts.push({ geometry: lf, material: leafMaterial("apple") });
  }
  parts.push({ geometry: merge(stemParts), material: stemMaterial("apple") });
  return finalize(parts, "round");
}

// ───────────────────────────── Pear ─────────────────────────────
export function pear(ctx: BuildCtx): ProduceModel {
  const lean = ctx.rng.range(0.03, 0.08);
  const body = organicLathe(
    [
      [0, -0.48], [0.15, -0.5], [0.32, -0.45], [0.42, -0.33], [0.44, -0.18], [0.4, -0.02],
      [0.31, 0.12], [0.22, 0.25], [0.17, 0.37], [0.13, 0.47], [0.07, 0.53], [0, 0.52],
    ],
    ctx,
    0.03,
    (p, _a, t) => {
      p.x += lean * t * t;
    },
  );
  const seed = ctx.seed;
  paint(body, (p, _n, uv, out) => {
    const n = NOISE.noise(p.x * 3 + seed, p.y * 3, p.z * 3);
    mix(out, "#a8b33a", "#d6c75a", n * 0.4 + 0.5);
    out.lerp(tmp.set("#c06a3a"), clamp(NOISE.noise(p.x * 1.5 - seed, p.y, p.z) - 0.2) * 0.5);
    const speck = NOISE.noise(p.x * 60, p.y * 60 + seed, p.z * 60);
    out.lerp(tmp.set("#8a6a32"), Math.max(0, speck - 0.35) * 0.6);
    out.lerp(tmp.set("#8a6a32"), smoothstep(0.85, 1, uv.y) * 0.6);
  });
  body.scale(0.075, 0.11, 0.075);
  const top = 0.11 * 0.52 - 0.002;
  const stem = stemGeometry([[lean * 0.075, top, 0], [lean * 0.075 + 0.002, top + 0.012, 0], [lean * 0.075 + 0.008, top + 0.026, 0.002]], 0.0022, 0.0015, "#5a3d1e");
  return finalize(
    [
      { geometry: body, material: physical("pear", { roughness: 0.55, clearcoat: 0.15, micro: 0.25 }) },
      { geometry: stem, material: stemMaterial("pear") },
    ],
    "round",
  );
}

// ───────────────────────────── Citrus ─────────────────────────────
export function citrus(ctx: BuildCtx): ProduceModel {
  const v = ctx.variant; // orange | tangerine | lemon | lime | grapefruit
  const seed = ctx.seed;
  let profile: Array<[number, number]> = [
    [0, -0.46], [0.2, -0.44], [0.38, -0.32], [0.48, -0.12], [0.5, 0.04], [0.47, 0.2], [0.37, 0.36], [0.2, 0.45], [0, 0.46],
  ];
  let scale = [0.082, 0.078, 0.082];
  let colors = ["#e8670c", "#f68e1e"];
  let bump = 0.55;
  if (v === "tangerine") {
    scale = [0.064, 0.05, 0.064];
    colors = ["#ea5a06", "#f87d12"];
  } else if (v === "lemon") {
    profile = [[0, -0.62], [0.06, -0.6], [0.2, -0.5], [0.36, -0.32], [0.42, -0.1], [0.43, 0.1], [0.38, 0.3], [0.24, 0.48], [0.08, 0.6], [0, 0.63]];
    scale = [0.07, 0.075, 0.07];
    colors = ["#d4a80a", "#e8c62a"];
  } else if (v === "lime") {
    scale = [0.055, 0.055, 0.055];
    colors = ["#4e8f1c", "#7cb534"];
    bump = 0.45;
  } else if (v === "grapefruit") {
    scale = [0.11, 0.1, 0.11];
    colors = ["#e8a840", "#f3c86a"];
  }
  const body = organicLathe(profile, ctx, 0.02);
  paint(body, (p, _n, uv, out) => {
    const n = NOISE.noise(p.x * 4 + seed, p.y * 4, p.z * 4);
    mix(out, colors[0], colors[1], 0.5 + n * 0.4);
    if (v === "grapefruit") out.lerp(tmp.set("#e0705a"), clamp(NOISE.noise(p.x * 1.5, p.y * 1.5, p.z + seed)) * 0.5);
    if (v !== "lemon") out.lerp(tmp.set("#7a8a2a"), smoothstep(0.93, 1, uv.y) * 0.6);
  });
  body.scale(scale[0], scale[1], scale[2]);
  const pores = poresNormal(200, 1);
  const mat = physical(`citrus-${v}`, {
    roughness: 0.48,
    clearcoat: 0.3,
    clearcoatRoughness: 0.35,
    normalMap: pores,
    normalScale: new Vector2(bump, bump),
  });
  pores.repeat.set(3, 2);
  const parts: any[] = [{ geometry: body, material: mat }];
  // stem button
  const topY = scale[1] * (v === "lemon" ? 0.63 : 0.46);
  if (v === "lemon") {
    const s = stemGeometry([[0, topY - 0.003, 0], [0, topY + 0.004, 0]], 0.003, 0.0025, "#8a8a3a");
    parts.push({ geometry: s, material: stemMaterial("citrus") });
  } else {
    const cx = calyx(5, 0.006, 0.004, 0.2, "#5a6a26", ctx);
    transformed(cx, [0, topY - 0.001, 0]);
    const s = stemGeometry([[0, topY - 0.002, 0], [0, topY + 0.004, 0]], 0.0018, 0.0016, "#6a6a2a");
    parts.push({ geometry: merge([cx, s]), material: stemMaterial("citrus-cap") });
    if (ctx.detail === "hero" && (v === "tangerine" || v === "orange")) {
      const lf = leafGeometry({ length: 0.06, width: 0.026, curl: 0.3, fold: 0.2, base: "#2f6a1e", tip: "#24561a", seed });
      transformed(lf, [0, topY + 0.003, 0], [-0.3, 0.8, 0]);
      parts.push({ geometry: lf, material: leafMaterial("citrus", { roughness: 0.35, clearcoat: 0.5 }) });
    }
  }
  if (v === "lemon") {
    for (const p of parts) p.geometry.rotateZ(Math.PI / 2);
    return finalize(parts, "round");
  }
  return finalize(parts, "round");
}

// ───────────────────────────── Banana bunch ─────────────────────────────
export function banana(ctx: BuildCtx): ProduceModel {
  const ripe = ctx.variant !== "green";
  const count = ctx.detail === "hero" ? 6 : 5;
  const list = [];
  const seed = ctx.seed;
  for (let i = 0; i < count; i++) {
    const L = 0.19 * ctx.rng.range(0.9, 1.08);
    const bend = ctx.rng.range(0.07, 0.11);
    const curve = new CatmullRomCurve3([
      new Vector3(0, 0, 0),
      new Vector3(L * 0.12, L * 0.03, 0),
      new Vector3(L * 0.45, L * bend + L * 0.05, 0),
      new Vector3(L * 0.8, L * bend * 0.9 + L * 0.04, 0),
      new Vector3(L, L * 0.02 + L * bend * 0.3, 0),
    ]);
    const g = sweep(curve, {
      radial: seg(ctx, 20, 8),
      length: seg(ctx, 40, 14),
      radius: (t) => {
        if (t < 0.1) return 0.0055;
        const body = 0.0175 * smoothstep(0.08, 0.3, t);
        const tip = t > 0.86 ? Math.sqrt(Math.max(0, 1 - ((t - 0.86) / 0.14) ** 2)) * 0.85 + 0.15 : 1;
        return Math.max(0.0055, body) * tip;
      },
      cross: (a) => 1 + 0.07 * Math.cos(5 * a),
    });
    paint(g, (p, _n, uv, out) => {
      const t = uv.y;
      if (t < 0.1) out.set("#6d7a3a");
      else {
        if (ripe) mix(out, "#a9b83a", "#f2cf34", smoothstep(0.1, 0.3, t));
        else mix(out, "#5f8f26", "#9cbc3a", smoothstep(0.1, 0.5, t));
        if (ripe && NOISE.noise(p.x * 160 + seed, p.y * 160, p.z * 160 + i) > 0.62) out.lerp(tmp.set("#6a4a22"), 0.65);
        out.lerp(tmp.set("#3a2814"), smoothstep(0.95, 0.99, t));
      }
      out.multiplyScalar(0.92 + 0.1 * Math.abs(Math.cos(2.5 * Math.atan2(p.z, p.y))));
    });
    // a "hand": bananas side by side along the crown, fanning gently, alternate ones slightly raised
    const k = i - (count - 1) / 2;
    g.rotateX(k * 0.12 + ctx.rng.range(-0.04, 0.04));
    g.rotateY(-k * 0.16);
    g.rotateZ(-0.12 + (i % 2) * 0.06);
    transformed(g, [0, (i % 2) * 0.012 + Math.abs(k) * -0.004, k * 0.034]);
    list.push(g);
  }
  const crown = stemGeometry([[-0.016, 0.002, -0.085], [-0.008, 0.006, 0], [-0.016, 0.002, 0.085]], 0.011, 0.011, "#5a4a2a", "#6a5a32", 8, 6);
  const geo = merge(list);
  return finalize(
    [
      { geometry: geo, material: physical(`banana-${ripe}`, { roughness: 0.5, clearcoat: 0.2, micro: 0.2 }) },
      { geometry: crown, material: stemMaterial("banana") },
    ],
    "bunch",
  );
}

// ───────────────────────────── Grapes ─────────────────────────────
export function grapes(ctx: BuildCtx): ProduceModel {
  const green = ctx.variant === "green";
  const n = ctx.detail === "hero" ? 64 : 34;
  const berries = [];
  const placed: Vector3[] = [];
  const r0 = 0.0105;
  let tries = 0;
  while (placed.length < n && tries < 4000) {
    tries++;
    const h = Math.pow(ctx.rng.next(), 0.8);
    const Rc = 0.05 * Math.pow(1 - h, 0.75) + 0.006;
    const a = ctx.rng.range(0, TAU);
    const rr = Rc * Math.sqrt(ctx.rng.range(0.35, 1));
    const p = new Vector3(Math.cos(a) * rr, -h * 0.15, Math.sin(a) * rr);
    if (placed.some((q) => q.distanceTo(p) < r0 * 1.75)) continue;
    placed.push(p);
  }
  const seed = ctx.seed;
  placed.forEach((p, i) => {
    const r = r0 * ctx.rng.range(0.85, 1.1);
    const g = new IcosahedronGeometry(1, seg(ctx, 3, 1));
    g.scale(r, r * 1.12, r);
    g.rotateX(ctx.rng.range(-0.4, 0.4));
    g.translate(p.x, p.y, p.z);
    const tone = ctx.rng.range(-0.08, 0.08);
    paint(g, (q, _n, _uv, out) => {
      const nn = NOISE.noise(q.x * 300 + i, q.y * 300, q.z * 300 + seed) * 0.5 + 0.5;
      if (green) mix(out, "#8faa38", "#c8d870", nn * 0.5 + 0.3 + tone);
      else mix(out, "#2a1030", "#5a2048", nn * 0.5 + 0.25 + tone);
    });
    berries.push(g);
  });
  // rachis
  const stems = [stemGeometry([[0, 0.03, 0], [0, 0.01, 0], [0.002, -0.06, 0.001], [0, -0.13, 0]], 0.0025, 0.0012, "#6a6a32", "#7a6a3a", 6, 8)];
  placed.forEach((p, i) => {
    if (i % 3) return;
    stems.push(stemGeometry([[0, p.y + 0.012, 0], [p.x * 0.6, p.y + 0.006, p.z * 0.6], [p.x * 0.95, p.y + 0.004, p.z * 0.95]], 0.001, 0.0008, "#6a6a32", "#6a6a32", 4, 3));
  });
  const parts: any[] = [
    {
      geometry: merge(berries),
      material: physical(`grape-${green}`, {
        roughness: 0.32,
        clearcoat: 0.25,
        sheen: green ? 0.3 : 0.9,
        sheenColor: new Color(green ? "#e8f0c0" : "#a8b0d8"),
        sheenRoughness: 0.45,
      }),
    },
    { geometry: merge(stems), material: stemMaterial("grape") },
  ];
  // lie the cluster on its side in crates; hang it upright in the showcase
  if (ctx.detail === "pile") parts.forEach((p) => p.geometry.rotateZ(Math.PI / 2 - 0.15));
  return finalize(parts, ctx.detail === "pile" ? "bunch" : "single");
}

// ───────────────────────────── Strawberry ─────────────────────────────
export function strawberry(ctx: BuildCtx): ProduceModel {
  const body = organicLathe(
    [[0, -0.5], [0.12, -0.42], [0.26, -0.25], [0.36, -0.05], [0.4, 0.12], [0.38, 0.28], [0.3, 0.38], [0.16, 0.42], [0, 0.42]],
    ctx,
    0.05,
    undefined,
    ctx.detail === "hero" ? [48, 32] : [14, 10],
  );
  paint(body, (_p, _n, _uv, out) => out.setRGB(1, 1, 1));
  body.scale(0.034, 0.036, 0.034);
  const skin = strawberrySkin();
  const mat = physical("strawberry", {
    map: skin.map,
    normalMap: skin.normalMap,
    normalScale: new Vector2(0.8, 0.8),
    roughness: 0.32,
    clearcoat: 0.7,
    clearcoatRoughness: 0.2,
  });
  const top = 0.036 * 0.42;
  const cx = calyx(seg(ctx, 8, 6), 0.017, 0.007, 1.3, "#3e7a26", ctx, "#2c5e1a");
  cx.rotateX(0); // sepals start level and droop over the shoulders
  transformed(cx, [0, top + 0.0015, 0]);
  const st = stemGeometry([[0, top - 0.002, 0], [0.001, top + 0.008, 0], [0.003, top + 0.016, 0]], 0.0013, 0.001, "#4f7f2a");
  const parts = [
    { geometry: body, material: mat },
    { geometry: merge([cx, st]), material: leafMaterial("strawberry") },
  ];
  parts.forEach((p) => p.geometry.rotateZ(ctx.detail === "hero" ? 0 : 1.2));
  return finalize(parts, "small");
}

// ───────────────────────────── Cherry ─────────────────────────────
export function cherry(ctx: BuildCtx): ProduceModel {
  const sour = ctx.variant === "sour";
  const list = [];
  const stems = [];
  for (let i = 0; i < 2; i++) {
    const b = organicLathe(
      [[0, -0.48], [0.2, -0.45], [0.38, -0.3], [0.48, -0.08], [0.5, 0.1], [0.45, 0.28], [0.3, 0.4], [0.12, 0.4], [0.04, 0.33], [0, 0.3]],
      ctx,
      0.03,
      undefined,
      ctx.detail === "hero" ? [40, 28] : [14, 10],
    );
    paint(b, (p, _n, _uv, out) => {
      const n = NOISE.noise(p.x * 5 + i, p.y * 5, p.z * 5);
      if (sour) mix(out, "#8a0a14", "#c8202a", 0.5 + n * 0.4);
      else mix(out, "#3a0208", "#7a0a16", 0.5 + n * 0.4);
    });
    b.scale(0.024, 0.024, 0.024);
    const off = (i - 0.5) * 0.026;
    b.translate(off, 0, (i - 0.5) * 0.006);
    list.push(b);
    stems.push(
      stemGeometry([[off, 0.007, 0], [off * 0.7, 0.025, 0.002], [off * 0.25, 0.042, 0.004], [0, 0.052, 0.006]], 0.0009, 0.0008, "#6a7a2a", "#5a5a26", 5, 8),
    );
  }
  return finalize(
    [
      { geometry: merge(list), material: physical(`cherry-${sour}`, { roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 }) },
      { geometry: merge(stems), material: stemMaterial("cherry") },
    ],
    "small",
  );
}

// ───────────────────────────── Stone fruit (peach / apricot / plum / nectarine) ─────────────────────────────
export function stoneFruit(ctx: BuildCtx): ProduceModel {
  const v = ctx.variant; // peach | apricot | plum | nectarine
  const seed = ctx.seed;
  const crease = v === "plum" ? 0.035 : 0.06;
  const body = organicLathe(
    [[0, -0.47], [0.22, -0.43], [0.4, -0.28], [0.49, -0.06], [0.49, 0.12], [0.42, 0.3], [0.28, 0.42], [0.12, 0.46], [0.03, 0.43], [0, 0.42]],
    ctx,
    0.025,
    (p, a, t) => {
      let d = Math.abs(((a + Math.PI) % TAU) - Math.PI);
      const k = 1 - crease * Math.exp(-(d * d) / 0.03) * Math.sin(Math.PI * t);
      p.x *= k;
      p.z *= k;
    },
  );
  const blushDir = ctx.rng.range(0, TAU);
  paint(body, (p, _n, uv, out) => {
    const ang = Math.atan2(p.z, p.x);
    const n = NOISE.noise(p.x * 2.5 + seed, p.y * 2.5, p.z * 2.5);
    const blush = smoothstep(-0.3, 0.7, Math.cos(ang - blushDir) * 0.7 + n * 0.5);
    if (v === "apricot") {
      mix(out, "#f09a26", "#f7b64a", 0.5 + n * 0.3);
      out.lerp(tmp.set("#d8502a"), blush * 0.45);
      if (NOISE.noise(p.x * 90, p.y * 90 + seed, p.z * 90) > 0.6) out.lerp(tmp.set("#b03a1a"), 0.5);
    } else if (v === "plum") {
      mix(out, "#2e1236", "#5c1c48", 0.5 + n * 0.4);
    } else if (v === "nectarine") {
      mix(out, "#f0a63a", "#f8c860", 0.5 + n * 0.3);
      out.lerp(tmp.set("#b81c28"), blush * 0.85);
    } else {
      mix(out, "#e8a03a", "#f2c060", 0.5 + n * 0.3);
      out.lerp(tmp.set("#b8222e"), blush * 0.8);
    }
    out.lerp(tmp.set("#8a6a2a"), smoothstep(0.93, 1, uv.y) * 0.5);
  });
  const s = v === "apricot" ? 0.05 : v === "plum" ? 0.052 : 0.075;
  body.scale(s, s * (v === "plum" ? 1.1 : 1), s);
  const fuzz = v === "peach" || v === "apricot";
  const mat = physical(`stone-${v}`, {
    roughness: fuzz ? 0.72 : v === "plum" ? 0.35 : 0.4,
    clearcoat: fuzz ? 0 : 0.4,
    sheen: fuzz ? 0.45 : v === "plum" ? 0.6 : 0,
    sheenColor: new Color(fuzz ? "#e8a070" : "#8088b8"),
    sheenRoughness: fuzz ? 0.8 : 0.4,
    micro: 0.2,
  });
  const topY = s * 0.42;
  const stem = stemGeometry([[0, topY - 0.002, 0], [0.001, topY + 0.006, 0]], 0.0016, 0.0014, "#5a4a2a");
  const parts: any[] = [
    { geometry: body, material: mat },
    { geometry: stem, material: stemMaterial("stone") },
  ];
  if (ctx.detail === "hero" && v === "peach") {
    const lf = leafGeometry({ length: 0.07, width: 0.02, shape: "lance", curl: 0.4, fold: 0.25, base: "#4f8a2a", tip: "#2f6a1e", seed });
    transformed(lf, [0, topY + 0.004, 0], [-0.25, 1.2, 0]);
    parts.push({ geometry: lf, material: leafMaterial("peach") });
  }
  return finalize(parts, "round");
}

// ───────────────────────────── Watermelon ─────────────────────────────
export function watermelon(ctx: BuildCtx): ProduceModel {
  const seed = ctx.seed;
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const ph = t * Math.PI;
    prof.push([Math.sin(ph) * 0.5, -Math.cos(ph) * 0.5]);
  }
  const body = organicLathe(prof, ctx, 0.02, undefined, ctx.detail === "hero" ? [96, 48] : [40, 18]);
  paint(body, (p, n, _uv, out) => {
    const ang = Math.atan2(p.z, p.x);
    const warp = NOISE.fbm(p.x * 3 + seed, p.y * 9, p.z * 3, 3) * 1.4;
    const stripe = Math.sin(ang * 8 + warp);
    const dark = smoothstep(-0.15, 0.25, stripe);
    mix(out, "#7aa64a", "#1c4a1c", dark);
    out.multiplyScalar(0.9 + 0.15 * (NOISE.noise(p.x * 30, p.y * 30, p.z * 30) * 0.5 + 0.5));
    // field spot on the side resting on the ground (−X before rotation)
    const spot = smoothstep(0.55, 0.9, -n.x + NOISE.noise(p.x * 4, p.y * 4, seed) * 0.2);
    out.lerp(tmp.set("#d8c870"), spot * 0.85);
  });
  body.scale(0.23, 0.3, 0.23);
  body.rotateZ(Math.PI / 2);
  const stem = stemGeometry([[0.148, 0, 0], [0.16, 0.004, 0.002], [0.17, 0.01, 0.006]], 0.004, 0.003, "#6a6a32");
  return finalize(
    [
      { geometry: body, material: physical("watermelon", { roughness: 0.32, clearcoat: 0.35, clearcoatRoughness: 0.3, micro: 0.25 }) },
      { geometry: stem, material: stemMaterial("watermelon") },
    ],
    "single",
  );
}

// ───────────────────────────── Melon ─────────────────────────────
export function melon(ctx: BuildCtx): ProduceModel {
  const honeydew = ctx.variant === "honeydew";
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 12; i++) {
    const ph = (i / 12) * Math.PI;
    prof.push([Math.sin(ph) * 0.5, -Math.cos(ph) * 0.5]);
  }
  const body = organicLathe(prof, ctx, 0.025, (p, a, t) => {
    if (!honeydew) {
      const rib = 1 - 0.02 * Math.pow(Math.abs(Math.cos(a * 5)), 6) * Math.sin(Math.PI * t);
      p.x *= rib;
      p.z *= rib;
    }
  });
  if (honeydew) paint(body, (p, _n, _uv, out) => mix(out, "#d0dc96", "#e6ecb4", NOISE.noise(p.x * 4, p.y * 4, p.z * 4) * 0.5 + 0.5));
  else paint(body, (_p, _n, _uv, out) => out.setRGB(1, 1, 1));
  body.scale(0.15, 0.16, 0.15);
  body.rotateZ(Math.PI / 2);
  let mat;
  if (honeydew) mat = physical("honeydew", { roughness: 0.42, clearcoat: 0.2, micro: 0.3 });
  else {
    const net = melonNet();
    mat = physical("cantaloupe", { map: net.map, normalMap: net.normalMap, normalScale: new Vector2(1.2, 1.2), roughness: 0.82 });
  }
  return finalize([{ geometry: body, material: mat }], "single");
}

// ───────────────────────────── Pomegranate ─────────────────────────────
export function pomegranate(ctx: BuildCtx): ProduceModel {
  const seed = ctx.seed;
  const body = organicLathe(
    [[0, -0.44], [0.2, -0.43], [0.38, -0.32], [0.48, -0.12], [0.5, 0.06], [0.46, 0.22], [0.36, 0.34], [0.2, 0.42], [0.08, 0.44], [0, 0.44]],
    ctx,
    0.03,
    (p, a) => {
      const k = 1 + 0.025 * Math.cos(6 * a);
      p.x *= k;
      p.z *= k;
    },
  );
  paint(body, (p, _n, _uv, out) => {
    const n = NOISE.fbm(p.x * 2 + seed, p.y * 2, p.z * 2, 3);
    mix(out, "#7a1218", "#b82a26", 0.55 + n * 0.5);
    out.lerp(tmp.set("#c89a5a"), smoothstep(0.25, 0.6, NOISE.noise(p.x * 1.6 - seed, p.y * 1.6, p.z * 1.6)) * 0.45);
  });
  body.scale(0.095, 0.09, 0.095);
  const topY = 0.09 * 0.44;
  const crownTube = stemGeometry([[0, topY - 0.004, 0], [0, topY + 0.01, 0]], 0.009, 0.0085, "#8a2420", "#a03a2a", 10, 3);
  const crown = calyx(6, 0.012, 0.006, -0.6, "#9a2a24", ctx, "#6a1a18");
  transformed(crown, [0, topY + 0.009, 0]);
  return finalize(
    [
      { geometry: body, material: physical("pomegranate", { roughness: 0.42, clearcoat: 0.35, micro: 0.3 }) },
      { geometry: merge([crownTube, crown]), material: physical("pomegranate-crown", { roughness: 0.6, side: 2 }) },
    ],
    "round",
  );
}

// ───────────────────────────── Kiwi ─────────────────────────────
export function kiwi(ctx: BuildCtx): ProduceModel {
  const seed = ctx.seed;
  const body = organicLathe(
    [[0, -0.5], [0.18, -0.47], [0.3, -0.36], [0.36, -0.15], [0.37, 0.05], [0.35, 0.25], [0.28, 0.4], [0.14, 0.48], [0, 0.5]],
    ctx,
    0.04,
  );
  paint(body, (p, _n, _uv, out) => {
    const n = NOISE.fbm(p.x * 6 + seed, p.y * 6, p.z * 6, 3);
    mix(out, "#6a4a26", "#94703c", 0.5 + n * 0.6);
  });
  body.scale(0.07, 0.075, 0.07);
  body.rotateZ(Math.PI / 2);
  return finalize(
    [
      {
        geometry: body,
        material: physical("kiwi", {
          roughness: 0.9,
          sheen: 1,
          sheenColor: new Color("#c8a878"),
          sheenRoughness: 0.9,
          micro: 0.5,
        }),
      },
    ],
    "round",
  );
}

// ───────────────────────────── Pineapple ─────────────────────────────
export function pineapple(ctx: BuildCtx): ProduceModel {
  const body = organicLathe(
    [[0, -0.5], [0.25, -0.48], [0.4, -0.38], [0.46, -0.15], [0.47, 0.05], [0.43, 0.25], [0.34, 0.4], [0.2, 0.48], [0, 0.5]],
    ctx,
    0.015,
  );
  paint(body, (_p, _n, _uv, out) => out.setRGB(1, 1, 1));
  body.scale(0.13, 0.2, 0.13);
  const skin = pineappleSkin();
  const leaves = [];
  const count = seg(ctx, 30, 14);
  for (let i = 0; i < count; i++) {
    const ring = i / count;
    const a = i * 2.39996;
    const len = 0.08 + (1 - ring) * 0.1 * ctx.rng.range(0.8, 1.1);
    const lf = leafGeometry({
      length: len,
      width: 0.022,
      shape: "sword",
      curl: 0.3 + (1 - ring) * 0.6,
      fold: 0.35,
      base: "#5a7a3a",
      tip: "#3a6a2e",
      rib: "#7a9a5a",
      segU: seg(ctx, 4, 2),
      segV: seg(ctx, 8, 4),
      seed: i,
    });
    lf.rotateX(-Math.PI / 2 + 0.25 + (1 - ring) * 0.7);
    lf.rotateY(a);
    lf.translate(0, 0.1 - 0.004, 0);
    leaves.push(lf);
  }
  const parts: any[] = [
    {
      geometry: body,
      material: physical("pineapple", { map: skin.map, normalMap: skin.normalMap, normalScale: new Vector2(1.4, 1.4), roughness: 0.7 }),
    },
    { geometry: merge(leaves), material: leafMaterial("pineapple", { roughness: 0.5, sheen: 0.6, sheenColor: new Color("#c8d8c0") }) },
  ];
  if (ctx.detail === "pile") parts.forEach((p) => p.geometry.rotateZ(Math.PI / 2));
  return finalize(parts, ctx.detail === "pile" ? "long" : "single");
}

// ───────────────────────────── Mango ─────────────────────────────
export function mango(ctx: BuildCtx): ProduceModel {
  const seed = ctx.seed;
  const body = organicLathe(
    [[0, -0.5], [0.16, -0.47], [0.3, -0.36], [0.37, -0.15], [0.38, 0.05], [0.35, 0.25], [0.27, 0.4], [0.13, 0.48], [0, 0.5]],
    ctx,
    0.02,
    (p, _a, t) => {
      p.x += 0.08 * Math.sin(Math.PI * t) - 0.06 * t;
      p.z *= 0.82;
    },
  );
  paint(body, (p, n, _uv, out) => {
    const nn = NOISE.noise(p.x * 2 + seed, p.y * 2, p.z * 2);
    mix(out, "#5e8f2a", "#efbd34", smoothstep(-0.35, 0.3, p.y + nn * 0.2));
    out.lerp(tmp.set("#d8442a"), smoothstep(0.2, 0.9, n.x + nn * 0.3 + p.y) * 0.75);
  });
  body.scale(0.085, 0.12, 0.085);
  body.rotateZ(Math.PI / 2 - 0.2);
  return finalize([{ geometry: body, material: physical("mango", { roughness: 0.32, clearcoat: 0.45, micro: 0.15 }) }], "round");
}

// ───────────────────────────── Avocado ─────────────────────────────
export function avocado(ctx: BuildCtx): ProduceModel {
  const seed = ctx.seed;
  const hass = ctx.variant !== "green";
  const body = organicLathe(
    [[0, -0.5], [0.2, -0.48], [0.34, -0.38], [0.4, -0.2], [0.38, -0.02], [0.3, 0.16], [0.22, 0.32], [0.17, 0.44], [0.08, 0.52], [0, 0.52]],
    ctx,
    0.03,
  );
  displace(body, (p) => Math.max(0, NOISE.noise(p.x * 60 + seed, p.y * 60, p.z * 60)) * 0.012);
  paint(body, (p, _n, _uv, out) => {
    const n = NOISE.noise(p.x * 30 + seed, p.y * 30, p.z * 30);
    if (hass) mix(out, "#1e2a14", "#3a4220", 0.4 + n * 0.5);
    else mix(out, "#3a5a1e", "#6a8a2a", 0.4 + n * 0.5);
  });
  body.scale(0.075, 0.1, 0.075);
  body.rotateZ(Math.PI / 2);
  return finalize([{ geometry: body, material: physical(`avocado-${hass}`, { roughness: 0.68, clearcoat: 0.15, micro: 0.6 }) }], "round");
}

// ───────────────────────────── Fig ─────────────────────────────
export function fig(ctx: BuildCtx): ProduceModel {
  const seed = ctx.seed;
  const body = organicLathe(
    [[0, -0.48], [0.25, -0.44], [0.42, -0.3], [0.48, -0.1], [0.44, 0.1], [0.32, 0.26], [0.18, 0.38], [0.09, 0.5], [0.05, 0.6], [0, 0.62]],
    ctx,
    0.04,
  );
  paint(body, (p, _n, uv, out) => {
    const n = NOISE.noise(p.x * 8 + seed, p.y * 3, p.z * 8);
    mix(out, "#3a1a30", "#5a2a44", 0.5 + n * 0.4);
    out.lerp(tmp.set("#6a7a3a"), smoothstep(0.7, 1, uv.y) * 0.8);
  });
  body.scale(0.05, 0.055, 0.05);
  return finalize(
    [{ geometry: body, material: physical("fig", { roughness: 0.55, sheen: 0.7, sheenColor: new Color("#b8a0c8"), sheenRoughness: 0.5 }) }],
    "small",
  );
}
