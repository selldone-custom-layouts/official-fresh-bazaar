/*
 * Fresh Market 3D — shared produce parts: materials, leaves, stems and model finalization.
 */
import {
  Box3,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Material,
  MeshPhysicalMaterial,
  MeshPhysicalMaterialParameters,
  Vector2,
  Vector3,
} from "three";
import { lathe, merge, paint, surface, sweep, transformed } from "../util/geo";
import { leafVeins, microNormal } from "../util/textures";
import { NOISE, Rng, clamp, lerp, smoothstep } from "../util/noise";

export type Detail = "hero" | "pile";
export type RestStyle = "round" | "long" | "bunch" | "single" | "small" | "package";

export interface ProducePart {
  geometry: BufferGeometry;
  material: Material;
}

export interface ProduceModel {
  parts: ProducePart[];
  /** bounding size in meters (x, y, z) in rest orientation */
  size: Vector3;
  rest: RestStyle;
}

export interface BuildCtx {
  detail: Detail;
  rng: Rng;
  variant: string;
  seed: number;
}

// ───────────────────────────── Materials ─────────────────────────────

const matCache = new Map<string, MeshPhysicalMaterial>();

export function physical(key: string, p: MeshPhysicalMaterialParameters & { micro?: number }): MeshPhysicalMaterial {
  let m = matCache.get(key);
  if (m) return m;
  const { micro, ...params } = p;
  m = new MeshPhysicalMaterial({ vertexColors: true, ...params });
  if (micro && !params.normalMap) {
    m.normalMap = microNormal();
    m.normalScale = new Vector2(micro, micro);
  }
  matCache.set(key, m);
  return m;
}

export function leafMaterial(key = "leaf", extra: MeshPhysicalMaterialParameters = {}): MeshPhysicalMaterial {
  return physical(`leaf-${key}`, {
    roughness: 0.55,
    side: DoubleSide,
    normalMap: leafVeins(),
    normalScale: new Vector2(0.6, 0.6),
    sheen: 0.25,
    sheenColor: new Color("#d8f0b0"),
    sheenRoughness: 0.6,
    ...extra,
  });
}

export function stemMaterial(key = "stem", extra: MeshPhysicalMaterialParameters = {}): MeshPhysicalMaterial {
  return physical(`stem-${key}`, { roughness: 0.75, micro: 0.4, ...extra });
}

export function disposeProduceMaterials() {
  matCache.forEach((m) => m.dispose());
  matCache.clear();
}

// ───────────────────────────── Colors ─────────────────────────────

export const C = (hex: string) => new Color(hex);
const _c1 = new Color();
const _c2 = new Color();

export function mix(out: Color, a: string | Color, b: string | Color, t: number): Color {
  _c1.copy(typeof a === "string" ? C(a) : a);
  _c2.copy(typeof b === "string" ? C(b) : b);
  return out.copy(_c1).lerp(_c2, clamp(t));
}

export const seg = (ctx: BuildCtx, hero: number, pile: number) => (ctx.detail === "hero" ? hero : pile);

// ───────────────────────────── Leaves ─────────────────────────────

export interface LeafOptions {
  length: number;
  width: number;
  /** bend along the length (positive = tips curl down) */
  curl?: number;
  /** V-fold across the midrib */
  fold?: number;
  /** wavy edge amplitude (fraction of width) */
  ruffle?: number;
  ruffleFreq?: number;
  /** leaf outline: 'oval' | 'lance' | 'heart' | 'sword' | 'round' */
  shape?: "oval" | "lance" | "heart" | "sword" | "round" | "serrated";
  base?: string;
  tip?: string;
  rib?: string;
  segU?: number;
  segV?: number;
  seed?: number;
}

/** Leaf lying along +Z (base at origin), width along X, facing +Y. */
export function leafGeometry(o: LeafOptions): BufferGeometry {
  const segU = o.segU ?? 8;
  const segV = o.segV ?? 12;
  const shape = o.shape ?? "oval";
  const curl = o.curl ?? 0.3;
  const fold = o.fold ?? 0.15;
  const ruffle = o.ruffle ?? 0;
  const freq = o.ruffleFreq ?? 9;
  const seed = o.seed ?? 0;
  const widthAt = (v: number) => {
    switch (shape) {
      case "lance":
        return Math.pow(Math.sin(Math.PI * Math.pow(v, 0.8)), 0.9) * (1 - v * 0.2);
      case "heart":
        return Math.pow(Math.sin(Math.PI * Math.pow(v, 0.6)), 0.7);
      case "sword":
        return v < 0.85 ? 1 - v * 0.55 : (1 - v) / 0.15 * 0.53;
      case "round":
        return Math.pow(Math.sin(Math.PI * v), 0.55);
      case "serrated":
        return Math.pow(Math.sin(Math.PI * Math.pow(v, 0.7)), 0.8) * (1 + 0.12 * Math.abs(Math.sin(v * Math.PI * 9)));
      default:
        return Math.pow(Math.sin(Math.PI * Math.pow(v, 0.75)), 0.85);
    }
  };
  const g = surface(
    segU,
    segV,
    (u, v, out) => {
      const s = u * 2 - 1; // -1..1 across
      const w = widthAt(v) * o.width * 0.5;
      const x = s * w;
      const z = v * o.length;
      let y = Math.abs(s) * w * fold;
      // curl along length: bend around X
      const bend = curl * v * v;
      const yy = y - Math.sin(bend) * z * 0.6;
      const zz = z * Math.cos(bend * 0.6);
      // ruffle near edges
      const r = ruffle ? Math.sin(v * freq * Math.PI + seed + s * 2) * ruffle * o.width * Math.pow(Math.abs(s), 1.5) : 0;
      out.set(x, yy + r, zz);
    },
    false,
  );
  const base = C(o.base ?? "#6b9a3a");
  const tip = C(o.tip ?? "#3f7a26");
  const rib = C(o.rib ?? "#a8c870");
  const tmp = new Color();
  paint(g, (p, _n, uv, out) => {
    const s = Math.abs(uv.x * 2 - 1);
    const v = uv.y;
    const n = NOISE.noise(p.x * 60 + seed, p.z * 60, seed) * 0.5 + 0.5;
    out.copy(base).lerp(tip, smoothstep(0.0, 0.9, v * 0.6 + s * 0.6));
    out.lerp(tmp.copy(rib), Math.max(0, 1 - s * 14) * 0.7 * (1 - v * 0.5));
    out.multiplyScalar(0.9 + n * 0.2);
  });
  return g;
}

// ───────────────────────────── Stems ─────────────────────────────

export function stemGeometry(
  points: Array<[number, number, number]>,
  r0: number,
  r1: number,
  color: string,
  colorTip?: string,
  radial = 7,
  length = 8,
): BufferGeometry {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)));
  const g = sweep(curve, {
    radius: (t) => lerp(r0, r1, t) * (t > 0.96 ? 0.6 + (1 - t) * 10 : 1),
    radial,
    length,
  });
  const a = C(color);
  const b = C(colorTip ?? color);
  paint(g, (p, _n, uv, out) => out.copy(a).lerp(b, uv.y).multiplyScalar(0.92 + 0.12 * (NOISE.noise(p.x * 300, p.y * 300, p.z * 300) * 0.5 + 0.5)));
  return g;
}

/** Star of small sepals (calyx) around +Y at origin, opening outward/downward. */
export function calyx(
  count: number,
  length: number,
  width: number,
  droop: number,
  color: string,
  ctx: BuildCtx,
  tip?: string,
): BufferGeometry {
  const list: BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + ctx.rng.range(-0.2, 0.2);
    const g = leafGeometry({
      length: length * ctx.rng.range(0.85, 1.15),
      width,
      shape: "lance",
      curl: droop,
      fold: 0.2,
      base: color,
      tip: tip ?? color,
      rib: color,
      segU: ctx.detail === "hero" ? 4 : 2,
      segV: ctx.detail === "hero" ? 6 : 3,
      seed: i,
    });
    transformed(g, [0, 0, 0], [-0.3, 0, 0]);
    g.rotateY(a);
    list.push(g);
  }
  return merge(list);
}

// ───────────────────────────── Finalize ─────────────────────────────

/**
 * Center model on its bounding box (x,z) and rest it on y=0, return size.
 */
export function finalize(parts: ProducePart[], rest: RestStyle): ProduceModel {
  const box = new Box3();
  parts.forEach((p) => {
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox!);
  });
  const c = new Vector3();
  box.getCenter(c);
  parts.forEach((p) => {
    p.geometry.translate(-c.x, -box.min.y, -c.z);
    p.geometry.computeBoundingSphere();
    p.geometry.computeBoundingBox();
  });
  const size = new Vector3();
  box.getSize(size);
  return { parts, size, rest };
}

/** Lathe helper with standard noise wobble. */
export function organicLathe(
  profile: Array<[number, number]>,
  ctx: BuildCtx,
  wobble = 0.03,
  extra?: (p: Vector3, a: number, t: number) => void,
  segs?: [number, number],
): BufferGeometry {
  const [su, sv] = segs ?? (ctx.detail === "hero" ? [64, 40] : [22, 14]);
  const s = ctx.seed * 0.137;
  return lathe(profile, su, sv, (p, a, t) => {
    const k = 1 + wobble * NOISE.noise(p.x * 2.2 + s, p.y * 2.2, p.z * 2.2 - s);
    p.x *= k;
    p.z *= k;
    if (extra) extra(p, a, t);
  });
}

export { Rng, NOISE, clamp, lerp, smoothstep };
