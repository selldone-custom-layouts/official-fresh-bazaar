/*
 * Fresh Market 3D — procedural geometry toolkit.
 * Parametric surfaces, lathes and sweeps with seam-safe normals, vertex painting and merging.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Curve,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type SurfaceFn = (u: number, v: number, out: Vector3) => void;

/**
 * Build a (u,v) grid surface. u wraps around when closedU is true.
 * Normals are averaged across the u seam and across degenerate pole rows.
 */
export function surface(
  uSegs: number,
  vSegs: number,
  fn: SurfaceFn,
  closedU = true,
): BufferGeometry {
  const cols = uSegs + 1;
  const rows = vSegs + 1;
  const pos = new Float32Array(cols * rows * 3);
  const uv = new Float32Array(cols * rows * 2);
  const p = new Vector3();
  for (let j = 0; j < rows; j++) {
    const v = j / vSegs;
    for (let i = 0; i < cols; i++) {
      const u = i / uSegs;
      fn(closedU && i === uSegs ? 0 : u, v, p);
      const k = j * cols + i;
      pos[k * 3] = p.x;
      pos[k * 3 + 1] = p.y;
      pos[k * 3 + 2] = p.z;
      uv[k * 2] = u;
      uv[k * 2 + 1] = v;
    }
  }
  const index: number[] = [];
  for (let j = 0; j < vSegs; j++) {
    for (let i = 0; i < uSegs; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("uv", new BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  fixSurfaceNormals(g, cols, rows, closedU);
  return g;
}

function fixSurfaceNormals(g: BufferGeometry, cols: number, rows: number, closedU: boolean) {
  const n = g.getAttribute("normal") as BufferAttribute;
  const p = g.getAttribute("position") as BufferAttribute;
  const tmp = new Vector3();
  if (closedU) {
    for (let j = 0; j < rows; j++) {
      const a = j * cols;
      const b = a + cols - 1;
      tmp.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
      n.setXYZ(a, tmp.x, tmp.y, tmp.z);
      n.setXYZ(b, tmp.x, tmp.y, tmp.z);
    }
  }
  // Degenerate (pole) rows: all vertices in the row coincide.
  for (let j = 0; j < rows; j++) {
    const a = j * cols;
    let degenerate = true;
    for (let i = 1; i < cols; i++) {
      const k = a + i;
      if (
        Math.abs(p.getX(k) - p.getX(a)) > 1e-7 ||
        Math.abs(p.getY(k) - p.getY(a)) > 1e-7 ||
        Math.abs(p.getZ(k) - p.getZ(a)) > 1e-7
      ) {
        degenerate = false;
        break;
      }
    }
    if (!degenerate) continue;
    tmp.set(0, 0, 0);
    for (let i = 0; i < cols; i++) tmp.x += n.getX(a + i), tmp.y += n.getY(a + i), tmp.z += n.getZ(a + i);
    if (tmp.lengthSq() < 1e-12) tmp.set(0, j === 0 ? -1 : 1, 0);
    tmp.normalize();
    for (let i = 0; i < cols; i++) n.setXYZ(a + i, tmp.x, tmp.y, tmp.z);
  }
  n.needsUpdate = true;
}

export type LatheDeform = (p: Vector3, angle: number, t: number) => void;

/**
 * Lathe a smooth profile [radius, y] (bottom → top) around the Y axis.
 * Profile points are interpolated with a centripetal Catmull–Rom spline.
 */
export function lathe(
  profile: Array<[number, number]>,
  segments = 48,
  steps = 32,
  deform?: LatheDeform,
): BufferGeometry {
  const curve = new CatmullRomCurve3(
    profile.map(([r, y]) => new Vector3(r, y, 0)),
    false,
    "centripetal",
  );
  const pts = curve.getSpacedPoints(steps);
  // Make sure poles really close.
  if (profile[0][0] === 0) pts[0].x = 0;
  if (profile[profile.length - 1][0] === 0) pts[pts.length - 1].x = 0;
  return surface(segments, steps, (u, v, out) => {
    const a = u * Math.PI * 2;
    const q = pts[Math.round(v * steps)];
    out.set(Math.cos(a) * q.x, q.y, Math.sin(a) * q.x);
    if (deform) deform(out, a, v);
  });
}

export interface SweepOptions {
  radius: (t: number) => number;
  radial?: number;
  length?: number;
  /** radial multiplier by angle (cross-section shape) */
  cross?: (a: number, t: number) => number;
  deform?: (p: Vector3, a: number, t: number, center: Vector3) => void;
}

/** Sweep a variable-radius cross-section along a curve. */
export function sweep(curve: Curve<Vector3>, o: SweepOptions): BufferGeometry {
  const radial = o.radial ?? 16;
  const length = o.length ?? 32;
  const frames = curve.computeFrenetFrames(length, false);
  const c = new Vector3();
  return surface(radial, length, (u, v, out) => {
    const j = Math.round(v * length);
    curve.getPointAt(Math.min(1, Math.max(0, v)), c);
    const a = u * Math.PI * 2;
    let r = o.radius(v);
    if (o.cross) r *= o.cross(a, v);
    const N = frames.normals[j];
    const B = frames.binormals[j];
    out.set(
      c.x + r * (Math.cos(a) * N.x + Math.sin(a) * B.x),
      c.y + r * (Math.cos(a) * N.y + Math.sin(a) * B.y),
      c.z + r * (Math.cos(a) * N.z + Math.sin(a) * B.z),
    );
    if (o.deform) o.deform(out, a, v, c);
  });
}

/** Displace vertices along their normal, then recompute normals (seam-safe for surfaces). */
export function displace(
  g: BufferGeometry,
  fn: (p: Vector3, n: Vector3, uv: Vector2) => number,
  recompute = true,
) {
  const pos = g.getAttribute("position") as BufferAttribute;
  const nor = g.getAttribute("normal") as BufferAttribute;
  const uvs = g.getAttribute("uv") as BufferAttribute | undefined;
  const p = new Vector3();
  const n = new Vector3();
  const uv = new Vector2();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    if (uvs) uv.fromBufferAttribute(uvs, i);
    const d = fn(p, n, uv);
    pos.setXYZ(i, p.x + n.x * d, p.y + n.y * d, p.z + n.z * d);
  }
  pos.needsUpdate = true;
  if (recompute) recomputeNormalsKeepingSeams(g);
}

/** Recompute normals for an indexed geometry, welding coincident vertices (fixes UV seams). */
export function recomputeNormalsKeepingSeams(g: BufferGeometry) {
  g.computeVertexNormals();
  const pos = g.getAttribute("position") as BufferAttribute;
  const nor = g.getAttribute("normal") as BufferAttribute;
  const map = new Map<string, number[]>();
  const q = 1e5;
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * q)},${Math.round(pos.getY(i) * q)},${Math.round(pos.getZ(i) * q)}`;
    let list = map.get(key);
    if (!list) map.set(key, (list = []));
    list.push(i);
  }
  const s = new Vector3();
  map.forEach((list) => {
    if (list.length < 2) return;
    s.set(0, 0, 0);
    for (const i of list) s.x += nor.getX(i), s.y += nor.getY(i), s.z += nor.getZ(i);
    if (s.lengthSq() < 1e-12) return;
    s.normalize();
    for (const i of list) nor.setXYZ(i, s.x, s.y, s.z);
  });
  nor.needsUpdate = true;
}

/** Write per-vertex colors. */
export function paint(
  g: BufferGeometry,
  fn: (p: Vector3, n: Vector3, uv: Vector2, out: Color) => void,
): BufferGeometry {
  const pos = g.getAttribute("position") as BufferAttribute;
  const nor = g.getAttribute("normal") as BufferAttribute;
  const uvs = g.getAttribute("uv") as BufferAttribute | undefined;
  const col = new Float32Array(pos.count * 3);
  const p = new Vector3();
  const n = new Vector3();
  const uv = new Vector2();
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    if (uvs) uv.fromBufferAttribute(uvs, i);
    c.setRGB(1, 1, 1);
    fn(p, n, uv, c);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  return g;
}

export function solidColor(g: BufferGeometry, color: Color | number | string): BufferGeometry {
  const c = color instanceof Color ? color : new Color(color as any);
  return paint(g, (_p, _n, _uv, out) => out.copy(c));
}

/** Make sure a geometry has the attribute set required for merging. */
export function normalizeForMerge(g: BufferGeometry): BufferGeometry {
  let geo = g;
  if (!geo.index) {
    const count = geo.getAttribute("position").count;
    const idx = new Array(count);
    for (let i = 0; i < count; i++) idx[i] = i;
    geo.setIndex(idx);
  }
  const count = geo.getAttribute("position").count;
  if (!geo.getAttribute("normal")) geo.computeVertexNormals();
  if (!geo.getAttribute("uv")) geo.setAttribute("uv", new Float32BufferAttribute(new Float32Array(count * 2), 2));
  if (!geo.getAttribute("color")) solidColor(geo, 0xffffff);
  for (const name of Object.keys(geo.attributes)) {
    if (!["position", "normal", "uv", "color"].includes(name)) geo.deleteAttribute(name);
  }
  geo.morphAttributes = {};
  return geo;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3();

export function transformed(
  g: BufferGeometry,
  position: Vector3 | [number, number, number] = [0, 0, 0],
  rotation: Euler | [number, number, number] = [0, 0, 0],
  scale: number | [number, number, number] = 1,
): BufferGeometry {
  const p = Array.isArray(position) ? new Vector3(...position) : position;
  if (Array.isArray(rotation)) _e.set(rotation[0], rotation[1], rotation[2]);
  else _e.copy(rotation);
  _q.setFromEuler(_e);
  if (typeof scale === "number") _s.setScalar(scale);
  else _s.set(scale[0], scale[1], scale[2]);
  _m.compose(p, _q, _s);
  g.applyMatrix4(_m);
  return g;
}

/** Merge geometries (normalizing their attributes first). */
export function merge(list: BufferGeometry[]): BufferGeometry {
  const prepared = list.filter(Boolean).map((g) => normalizeForMerge(g));
  if (prepared.length === 1) return prepared[0];
  const out = mergeGeometries(prepared, false);
  if (!out) throw new Error("merge failed");
  prepared.forEach((g) => g.dispose());
  return out;
}

/** Orient a geometry so +Y points along `dir`. */
export function alignY(g: BufferGeometry, dir: Vector3): BufferGeometry {
  _q.setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize());
  _m.makeRotationFromQuaternion(_q);
  g.applyMatrix4(_m);
  return g;
}
