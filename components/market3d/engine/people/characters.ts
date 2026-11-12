/*
 * Fresh Market 3D — procedural people in traditional Persian dress.
 *
 * Each character is ONE SkinnedMesh (one draw call) built from primitives with rigid + blended skin
 * weights (long robes and skirts follow the legs). Animation is procedural: walk cycle, breathing,
 * weight shift, head-tracking and vendor gestures — no animation files.
 */
import {
  Bone,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  MathUtils,
  MeshStandardMaterial,
  Object3D,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  Uint16BufferAttribute,
  Vector3,
  BoxGeometry,
  ConeGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { lathe, paint } from "../util/geo";
import { NOISE, Rng, smoothstep } from "../util/noise";

export type Outfit = "man-qaba" | "man-vest" | "woman-qashqai" | "woman-chador" | "woman-scarf" | "elder";

export interface CharacterOptions {
  outfit: Outfit;
  seed: number;
  height?: number;
}

const BONES = [
  "hips", "spine", "chest", "neck", "head",
  "shoulderL", "upperArmL", "foreArmL", "handL",
  "shoulderR", "upperArmR", "foreArmR", "handR",
  "thighL", "shinL", "footL",
  "thighR", "shinR", "footR",
] as const;
type BoneName = (typeof BONES)[number];
const BI: Record<BoneName, number> = Object.fromEntries(BONES.map((b, i) => [b, i])) as any;

// rest-pose joint positions (model space, metres, character faces +Z, left = +X)
const J: Record<BoneName, [number, number, number]> = {
  hips: [0, 0.94, 0],
  spine: [0, 1.06, 0],
  chest: [0, 1.24, 0],
  neck: [0, 1.46, 0],
  head: [0, 1.55, 0.01],
  shoulderL: [0.07, 1.42, 0],
  upperArmL: [0.19, 1.41, 0],
  foreArmL: [0.215, 1.12, 0.0],
  handL: [0.225, 0.87, 0.02],
  shoulderR: [-0.07, 1.42, 0],
  upperArmR: [-0.19, 1.41, 0],
  foreArmR: [-0.215, 1.12, 0.0],
  handR: [-0.225, 0.87, 0.02],
  thighL: [0.095, 0.92, 0],
  shinL: [0.095, 0.5, 0.01],
  footL: [0.095, 0.08, 0],
  thighR: [-0.095, 0.92, 0],
  shinR: [-0.095, 0.5, 0.01],
  footR: [-0.095, 0.08, 0],
};
const PARENT: Record<BoneName, BoneName | null> = {
  hips: null, spine: "hips", chest: "spine", neck: "chest", head: "neck",
  shoulderL: "chest", upperArmL: "shoulderL", foreArmL: "upperArmL", handL: "foreArmL",
  shoulderR: "chest", upperArmR: "shoulderR", foreArmR: "upperArmR", handR: "foreArmR",
  thighL: "hips", shinL: "thighL", footL: "shinL",
  thighR: "hips", shinR: "thighR", footR: "shinR",
};

// ───────────────────────────── palettes ─────────────────────────────
const SKIN = ["#c58c63", "#d9a57b", "#b47a52", "#e2b48c", "#a86e48"];
const COATS = ["#2d3f6b", "#5a3b26", "#3d4f2e", "#6b2d2d", "#2f4f5a", "#4a3a5e"];
const SASH = ["#b5322b", "#c99a2e", "#2e7d5a", "#7a2a6a"];
const DRESS = ["#c0283a", "#2a8a4a", "#7a2a8a", "#d6871e", "#1f6aa8", "#c43a7a"];
const SCARF = ["#f2d14b", "#e24a5a", "#3aa0c8", "#f08a2a", "#ffffff", "#7ac74f"];

type Skin = { idx: number[]; w: number[] };

function rigid(g: BufferGeometry, bone: BoneName, color: string | ((p: Vector3, out: Color) => void)) {
  if (typeof color === "string") {
    const c = new Color(color);
    paint(g, (_p, _n, _uv, out) => out.copy(c));
  } else paint(g, (p, _n, _uv, out) => color(p, out));
  return skinUniform(g, BI[bone]);
}

function skinUniform(g: BufferGeometry, b: number) {
  const n = g.getAttribute("position").count;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    si[i * 4] = b;
    sw[i * 4] = 1;
  }
  g.setAttribute("skinIndex", new Uint16BufferAttribute(si, 4));
  g.setAttribute("skinWeight", new Float32BufferAttribute(sw, 4));
  return g;
}

function skinBy(g: BufferGeometry, fn: (p: Vector3) => Skin) {
  const pos = g.getAttribute("position");
  const n = pos.count;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const p = new Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    const s = fn(p);
    let tot = 0;
    for (let k = 0; k < Math.min(4, s.idx.length); k++) tot += s.w[k];
    for (let k = 0; k < Math.min(4, s.idx.length); k++) {
      si[i * 4 + k] = s.idx[k];
      sw[i * 4 + k] = s.w[k] / (tot || 1);
    }
  }
  g.setAttribute("skinIndex", new Uint16BufferAttribute(si, 4));
  g.setAttribute("skinWeight", new Float32BufferAttribute(sw, 4));
  return g;
}

function limb(a: [number, number, number], b: [number, number, number], r0: number, r1: number, seg = 10) {
  const A = new Vector3(...a);
  const B = new Vector3(...b);
  const len = A.distanceTo(B);
  const g = new CylinderGeometry(r1, r0, len, seg, 3, false);
  const dir = B.clone().sub(A).normalize();
  const mid = A.clone().add(B).multiplyScalar(0.5);
  const o = new Object3D();
  o.position.copy(mid);
  o.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
  o.updateMatrix();
  g.applyMatrix4(o.matrix);
  return g;
}

function ball(c: [number, number, number], r: number, sx = 1, sy = 1, sz = 1, seg = 12) {
  const g = new SphereGeometry(r, seg, Math.max(6, seg - 4));
  g.scale(sx, sy, sz);
  g.translate(...c);
  return g;
}

/** Long garment (coat / dress / chador body) from y0 (top) to y1 (hem), weighted to hips + legs. */
function garment(top: number, hem: number, rTop: number, rHem: number, depth: number, color: (p: Vector3, t: number, out: Color) => void, segs = 20) {
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const y = hem + (top - hem) * (1 - t);
    const waist = Math.exp(-Math.pow((y - 1.0) / 0.12, 2)) * 0.03;
    prof.push([MathUtils.lerp(rHem, rTop, Math.pow(1 - t, 0.0) * 0 + (1 - Math.pow(1 - t, 1.6))) - waist, y]);
  }
  prof.reverse(); // bottom → top
  prof.forEach((p, i) => (prof[i] = [MathUtils.lerp(rHem, rTop, i / 8) - Math.exp(-Math.pow((p[1] - 1.0) / 0.12, 2)) * 0.03, p[1]]));
  const g = lathe(prof, segs, 34);
  g.scale(1, 1, depth);
  paint(g, (p, _n, uv, out) => color(p, 1 - uv.y, out));
  return skinBy(g, (p) => {
    if (p.y > 1.18) return { idx: [BI.chest, BI.spine], w: [smoothstep(1.18, 1.32, p.y), 1 - smoothstep(1.18, 1.32, p.y)] };
    if (p.y > 0.98) return { idx: [BI.spine, BI.hips], w: [smoothstep(0.98, 1.18, p.y), 1 - smoothstep(0.98, 1.18, p.y)] };
    // below the hips: follow the leg on the same side, stronger towards the hem
    const k = smoothstep(0.95, 0.35, p.y) * 0.75;
    const side = smoothstep(-0.06, 0.06, p.x); // 1 = left (+x)
    return { idx: [BI.hips, BI.thighL, BI.thighR], w: [1 - k, k * side, k * (1 - side)] };
  });
}

function finishGeo(list: BufferGeometry[]) {
  const prepared = list.map((g) => {
    const geo = g.index ? g : g;
    if (!geo.getAttribute("uv")) geo.setAttribute("uv", new Float32BufferAttribute(new Float32Array(geo.getAttribute("position").count * 2), 2));
    for (const name of Object.keys(geo.attributes)) if (!["position", "normal", "uv", "color", "skinIndex", "skinWeight"].includes(name)) geo.deleteAttribute(name);
    return geo;
  });
  const out = mergeGeometries(prepared, false)!;
  prepared.forEach((g) => g.dispose());
  out.computeBoundingSphere();
  return out;
}

let sharedMat: MeshStandardMaterial | null = null;
export function characterMaterial() {
  if (!sharedMat) sharedMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  return sharedMat;
}

// ───────────────────────────── builder ─────────────────────────────

export class Character {
  readonly root = new Group();
  readonly mesh: SkinnedMesh;
  readonly bones: Record<BoneName, Bone>;
  private rest: Record<BoneName, Vector3>;
  outfit: Outfit;
  // locomotion state
  speed = 0; // m/s
  phase = Math.random() * Math.PI * 2;
  t = Math.random() * 10;
  lookTarget: Vector3 | null = null;
  gesture: { kind: "wave" | "offer" | "point"; t: number; dur: number } | null = null;
  private headYaw = 0;
  private headPitch = 0;

  constructor(o: CharacterOptions) {
    // no head coverings: chador / scarf outfits become a dress with uncovered hair
    if (o.outfit === "woman-chador") o = { ...o, outfit: "woman-scarf" };
    this.outfit = o.outfit;
    const rng = new Rng(o.seed * 97 + 13);
    const skin = rng.pick(SKIN);
    const parts: BufferGeometry[] = [];
    const woman = o.outfit.startsWith("woman");
    const coat = rng.pick(COATS);
    const sash = rng.pick(SASH);
    const dress = rng.pick(DRESS);
    const scarf = rng.pick(SCARF);
    const trousers = rng.pick(["#2a2420", "#3a3a40", "#4a3828", "#1f2a3a"]);
    const shoe = rng.pick(["#2a1a12", "#3a2618", "#1a1a1a"]);

    // legs & feet
    for (const s of ["L", "R"] as const) {
      const hip = J[`thigh${s}`], knee = J[`shin${s}`], ankle = J[`foot${s}`];
      parts.push(rigid(limb(hip, knee, 0.072, 0.058), `thigh${s}`, trousers));
      parts.push(rigid(limb(knee, ankle, 0.056, 0.042), `shin${s}`, trousers));
      const f = new BoxGeometry(0.095, 0.07, 0.24, 2, 1, 3);
      f.translate(ankle[0], 0.035, 0.05);
      parts.push(rigid(f, `foot${s}`, shoe));
    }
    // torso core (under the garment)
    parts.push(rigid(ball([0, 0.97, 0], 0.15, 1.05, 0.7, 0.75), "hips", trousers));
    const torso = lathe([[0.0, 0.98], [0.15, 1.0], [0.16, 1.12], [0.19, 1.3], [0.17, 1.42], [0.06, 1.47], [0, 1.47]], 16, 8);
    torso.scale(1, 1, 0.72);
    paint(torso, (_p, _n, _uv, out) => out.set(woman ? dress : "#efe6d6"));
    parts.push(
      skinBy(torso, (p) => (p.y > 1.2 ? { idx: [BI.chest], w: [1] } : { idx: [BI.spine, BI.hips], w: [smoothstep(1.0, 1.2, p.y), 1 - smoothstep(1.0, 1.2, p.y)] })),
    );
    // neck & head
    parts.push(rigid(limb([0, 1.44, 0], [0, 1.56, 0.005], 0.05, 0.045, 8), "neck", skin));
    const head = ball([0, 1.65, 0.01], 0.105, 0.95, 1.12, 1.02, 16);
    parts.push(rigid(head, "head", skin));
    const nose = new ConeGeometry(0.016, 0.04, 6);
    nose.rotateX(Math.PI / 2);
    nose.translate(0, 1.645, 0.115);
    parts.push(rigid(nose, "head", skin));
    // face: eyes (white + iris), brows, lips, ears
    const browCol = woman ? "#2a1a10" : rng.pick(["#2a1a10", "#3a2618", "#1a120c"]);
    for (const sx of [-1, 1]) {
      parts.push(rigid(ball([sx * 0.035, 1.677, 0.0935], 0.0165, 1.25, 0.8, 0.6, 8), "head", "#f3ede2"));
      parts.push(rigid(ball([sx * 0.035, 1.677, 0.1025], 0.0088, 1, 1, 0.45, 6), "head", rng.pick(["#2a1a10", "#3a2a18", "#4a3a20"])));
      const brow = new BoxGeometry(0.036, 0.008, 0.012);
      brow.rotateZ(sx * -0.12);
      brow.translate(sx * 0.036, 1.703, 0.094);
      parts.push(rigid(brow, "head", browCol));
      parts.push(rigid(ball([sx * 0.1, 1.655, 0.0], 0.022, 0.5, 1, 0.8, 6), "head", skin));
    }
    parts.push(rigid(ball([0, 1.603, 0.096], 0.021, 1.15, 0.32, 0.45, 8), "head", woman ? "#b0524a" : "#9a5a48"));

    // arms
    for (const s of ["L", "R"] as const) {
      const sh = J[`upperArm${s}`], el = J[`foreArm${s}`], wr = J[`hand${s}`];
      const sleeve = o.outfit === "woman-chador" ? "#16161c" : woman ? dress : o.outfit === "man-vest" ? "#efe6d6" : coat;
      parts.push(rigid(limb(sh, el, 0.058, 0.05), `upperArm${s}`, sleeve));
      parts.push(rigid(limb(el, [wr[0], wr[1] + 0.03, wr[2]], 0.05, 0.042), `foreArm${s}`, sleeve));
      parts.push(rigid(ball([wr[0], wr[1] - 0.02, wr[2]], 0.045, 0.75, 1.1, 0.5, 8), `hand${s}`, skin));
      parts.push(rigid(ball([sh[0] * 0.96, sh[1] - 0.01, sh[2]], 0.056, 1, 0.9, 1, 8), `upperArm${s}`, sleeve));
    }

    // ── outfits
    const hemBand = (base: string, band: string, band2: string) => (p: Vector3, t: number, out: Color) => {
      out.set(base);
      const hy = p.y;
      if (hy < 0.24 && hy > 0.19) out.set(band);
      else if (hy < 0.17 && hy > 0.14) out.set(band2);
      const n = NOISE.noise(p.x * 30, p.y * 30, p.z * 30) * 0.06;
      out.multiplyScalar(0.94 + n);
      void t;
    };
    if (o.outfit === "man-qaba" || o.outfit === "elder") {
      // long qaba coat with a sash, felt hat (kolah namadi)
      parts.push(garment(1.44, o.outfit === "elder" ? 0.14 : 0.32, 0.2, 0.27, 0.8, (p, _t, out) => {
        out.set(coat);
        if (Math.abs(p.x) < 0.02 && p.z > 0) out.multiplyScalar(0.7); // front opening
        if (p.y > 0.97 && p.y < 1.05) out.set(sash);
        out.multiplyScalar(0.95 + NOISE.noise(p.x * 20, p.y * 20, p.z * 20) * 0.06);
      }));
      const hat = lathe([[0, 1.72], [0.1, 1.72], [0.105, 1.76], [0.095, 1.8], [0.06, 1.83], [0, 1.835]], 16, 6);
      paint(hat, (_p, _n, _uv, out) => out.set(o.outfit === "elder" ? "#e8e0cc" : rng.pick(["#6a4a2e", "#3a2a1e", "#8a6a4a"])));
      parts.push(skinUniform(hat, BI.head));
      if (rng.next() < 0.75 || o.outfit === "elder") {
        const beard = ball([0, 1.6, 0.06], 0.085, 1.0, 0.75, 0.7, 10);
        paint(beard, (_p, _n, _uv, out) => out.set(o.outfit === "elder" ? "#d8d4cc" : "#2a1c12"));
        parts.push(skinUniform(beard, BI.head));
      }
    } else if (o.outfit === "man-vest") {
      // white shirt, embroidered vest (jelighe), sash, loose trousers, felt cap
      const vest = lathe([[0.17, 0.98], [0.19, 1.12], [0.205, 1.3], [0.18, 1.42], [0.0, 1.44]], 16, 6);
      vest.scale(1, 1, 0.78);
      paint(vest, (p, _n, _uv, out) => {
        out.set(coat);
        const edge = Math.abs(Math.abs(p.x) - 0.04) < 0.012 && p.z > 0;
        if (edge) out.set("#d8b04a");
        if (Math.abs(p.x) < 0.03 && p.z > 0) out.set("#efe6d6");
      });
      parts.push(skinBy(vest, (p) => (p.y > 1.2 ? { idx: [BI.chest], w: [1] } : { idx: [BI.spine], w: [1] })));
      const belt = new CylinderGeometry(0.175, 0.17, 0.08, 16);
      belt.scale(1, 1, 0.78);
      belt.translate(0, 1.0, 0);
      parts.push(rigid(belt, "hips", sash));
      const hair = ball([0, 1.68, -0.012], 0.11, 1.0, 0.9, 1.0, 12);
      paint(hair, (_p, _n, _uv, out) => out.set("#1e140c"));
      const hp = hair.getAttribute("position");
      for (let i = 0; i < hp.count; i++) if (hp.getZ(i) > 0.03 && hp.getY(i) < 1.72) hp.setZ(i, 0.03);
      parts.push(skinUniform(hair, BI.head));
      const cap = lathe([[0, 1.73], [0.098, 1.73], [0.1, 1.78], [0.07, 1.81], [0, 1.815]], 14, 5);
      paint(cap, (_p, _n, _uv, out) => out.set("#d8ccb0"));
      parts.push(skinUniform(cap, BI.head));
      const mous = ball([0, 1.615, 0.1], 0.04, 1.4, 0.35, 0.5, 8);
      paint(mous, (_p, _n, _uv, out) => out.set("#2a1c12"));
      parts.push(skinUniform(mous, BI.head));
    } else if (o.outfit === "woman-qashqai") {
      // layered, bright Qashqai skirts with gold bands, short jacket, long scarf with headband
      parts.push(garment(1.02, 0.1, 0.19, 0.42, 0.9, hemBand(dress, "#f2c84a", "#ffffff"), 24));
      const jacket = lathe([[0.18, 1.0], [0.2, 1.14], [0.205, 1.3], [0.18, 1.42], [0, 1.45]], 16, 6);
      jacket.scale(1, 1, 0.78);
      const jc = rng.pick(["#1f2a5a", "#5a1f3a", "#2a5a3a"]);
      paint(jacket, (p, _n, _uv, out) => out.set(Math.abs(p.x) < 0.03 && p.z > 0 ? "#f2c84a" : jc));
      parts.push(skinBy(jacket, (p) => (p.y > 1.2 ? { idx: [BI.chest], w: [1] } : { idx: [BI.spine], w: [1] })));
      this.addScarf(parts, scarf, true, rng);
    } else if (o.outfit === "woman-chador") {
      // full-length chador: a body drape from the shoulders plus a hood that frames the face
      const floral = rng.next() < 0.5;
      const motif = rng.pick(["#3a6aa8", "#c84a6a", "#5a8a3a"]);
      const chColor = (p: Vector3, out: Color) => {
        if (floral) {
          out.set("#cfc8ba");
          if (NOISE.noise(p.x * 40, p.y * 40, p.z * 40) > 0.45) out.set(motif);
        } else out.set("#17171c");
        out.multiplyScalar(0.94 + NOISE.noise(p.x * 9, p.y * 9, p.z * 9) * 0.08);
      };
      parts.push(garment(1.5, 0.06, 0.2, 0.38, 0.92, (p, _t, out) => chColor(p, out), 24));
      const hood = ball([0, 1.655, -0.01], 0.128, 1.02, 1.14, 1.08, 16);
      const hp = hood.getAttribute("position");
      for (let i = 0; i < hp.count; i++) {
        const z = hp.getZ(i), y = hp.getY(i), x = hp.getX(i);
        if (z > 0.04 && y < 1.75 && y > 1.55 && Math.abs(x) < 0.085) hp.setZ(i, Math.min(z, 0.035));
      }
      hood.computeVertexNormals();
      paint(hood, (p, _n, _uv, out) => chColor(p, out));
      parts.push(skinUniform(hood, BI.head));
      const veil = limb([0, 1.64, -0.05], [0, 1.3, -0.08], 0.14, 0.22, 16);
      veil.scale(1, 1, 0.7);
      paint(veil, (p, _n, _uv, out) => chColor(p, out));
      parts.push(skinBy(veil, (p) => ({ idx: [BI.head, BI.chest], w: [smoothstep(1.42, 1.6, p.y), 1 - smoothstep(1.42, 1.6, p.y)] })));
    } else {
      // woman-scarf: long manteau-dress + patterned scarf
      parts.push(garment(1.44, 0.16, 0.2, 0.3, 0.82, hemBand(dress, "#f6e0a0", rng.pick(SASH)), 22));
      this.addScarf(parts, scarf, false, rng);
    }

    const geometry = finishGeo(parts);
    // skeleton
    const bones = {} as Record<BoneName, Bone>;
    this.rest = {} as Record<BoneName, Vector3>;
    for (const name of BONES) {
      const b = new Bone();
      b.name = name;
      const p = PARENT[name];
      const w = J[name];
      const pw = p ? J[p] : [0, 0, 0];
      b.position.set(w[0] - pw[0], w[1] - pw[1], w[2] - pw[2]);
      if (p) bones[p].add(b);
      bones[name] = b;
      this.rest[name] = b.position.clone();
    }
    this.bones = bones;
    const skeleton = new Skeleton(BONES.map((n) => bones[n]));
    this.mesh = new SkinnedMesh(geometry, characterMaterial());
    this.mesh.add(bones.hips);
    this.mesh.bind(skeleton);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    const h = (o.height ?? (woman ? 1.64 : 1.75)) / 1.83;
    this.root.scale.setScalar(h * rng.range(0.96, 1.04));
    this.root.add(this.mesh);
    this.t = rng.range(0, 20);
  }

  /** Uncovered hair: a hair cap shaped around the face plus long hair down the back. */
  private addScarf(parts: BufferGeometry[], _color: string, headband: boolean, rng: Rng) {
    const color = rng.pick(["#1c120b", "#2a1a10", "#3b2414", "#140e0a"]);
    const sc = ball([0, 1.672, -0.012], 0.113, 1.0, 1.08, 1.04, 14);
    // open the face
    const pos = sc.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      const y = pos.getY(i);
      if (z > 0.05 && y < 1.73 && y > 1.56) pos.setZ(i, Math.min(z, 0.045));
    }
    sc.computeVertexNormals();
    paint(sc, (p, _n, _uv, out) => {
      out.set(color);
      out.multiplyScalar(0.85 + NOISE.noise(p.x * 140, p.y * 12, p.z * 140) * 0.25); // strands
      if (headband && p.y > 1.71 && p.y < 1.735 && p.z > -0.02) out.set(NOISE.noise(p.x * 90, 0, p.z * 90) > 0 ? "#e2b84a" : "#b8862a");
    });
    parts.push(skinUniform(sc, BI.head));
    // drape over the shoulders & back
    const drape = limb([0, 1.64, -0.07], [0, 1.25, -0.11], 0.1, 0.075, 12);
    drape.scale(1, 1, 0.45);
    paint(drape, (p, _n, _uv, out) => out.set(color).multiplyScalar(0.85 + NOISE.noise(p.x * 150, p.y * 10, 0) * 0.25));
    parts.push(skinBy(drape, (p) => ({ idx: [BI.head, BI.chest], w: [smoothstep(1.4, 1.6, p.y), 1 - smoothstep(1.4, 1.6, p.y)] })));
  }

  // ───────────────────────────── crowd interface ─────────────────────────────

  turn = 0;

  get height() {
    return this.outfit.startsWith("woman") ? 1.64 : 1.75;
  }

  busy() {
    return !!this.gesture;
  }

  act(kind: string, maxDur?: number): number {
    const map: Record<string, "wave" | "offer" | "point" | null> = { wave: "wave", present: "offer", talk: "point", listen: null, look: null, fidget: null };
    const g = map[kind];
    const dur = Math.min(maxDur ?? 2.4, 4);
    if (g) this.gesture = { kind: g, t: 0, dur };
    return g ? dur : 0;
  }

  // ───────────────────────────── animation ─────────────────────────────

  update(dt: number, camWorld?: Vector3) {
    this.t += dt;
    const b = this.bones;
    const r = this.rest;
    const sp = this.speed;
    const walk = MathUtils.clamp(sp / 1.2, 0, 1);
    if (sp > 0.01) this.phase += dt * (2.2 + sp * 3.4);
    const ph = this.phase;
    const longSkirt = this.outfit === "woman-chador" || this.outfit === "woman-qashqai";
    const legAmp = (longSkirt ? 0.42 : 0.55) * walk;

    // legs
    const swingL = -Math.sin(ph) * legAmp;
    const swingR = Math.sin(ph) * legAmp;
    b.thighL.rotation.x = swingL;
    b.thighR.rotation.x = swingR;
    b.shinL.rotation.x = Math.pow(Math.max(0, Math.cos(ph)), 1.5) * 0.95 * walk;
    b.shinR.rotation.x = Math.pow(Math.max(0, Math.cos(ph + Math.PI)), 1.5) * 0.95 * walk;
    b.footL.rotation.x = -swingL * 0.4 - b.shinL.rotation.x * 0.5;
    b.footR.rotation.x = -swingR * 0.4 - b.shinR.rotation.x * 0.5;

    // hips / spine
    const breathe = Math.sin(this.t * 1.7);
    const sway = Math.sin(this.t * 0.45) * (1 - walk);
    b.hips.position.set(r.hips.x + sway * 0.012, r.hips.y + Math.cos(ph * 2) * 0.018 * walk - 0.008 * walk, r.hips.z);
    b.hips.rotation.y = Math.sin(ph) * 0.09 * walk;
    b.hips.rotation.z = Math.sin(ph) * 0.03 * walk + sway * 0.025;
    b.spine.rotation.y = -Math.sin(ph) * 0.11 * walk;
    b.spine.rotation.x = 0.04 * walk;
    b.chest.rotation.x = breathe * 0.015;
    b.chest.rotation.z = -sway * 0.02;

    // arms (relaxed hang + counter swing)
    const armAmp = 0.38 * walk;
    let uaL = Math.sin(ph) * armAmp;
    let uaR = -Math.sin(ph) * armAmp;
    let faL = -0.18 - Math.max(0, Math.sin(ph)) * 0.25 * walk;
    let faR = -0.18 - Math.max(0, -Math.sin(ph)) * 0.25 * walk;
    let zL = 0.07 + breathe * 0.01;
    let zR = -0.07 - breathe * 0.01;
    let faZR = 0;

    // vendor / idle gestures
    const g = this.gesture;
    if (g) {
      g.t += dt;
      const k = Math.sin(Math.min(1, g.t / g.dur) * Math.PI); // ease in/out envelope
      if (g.kind === "wave") {
        zR = MathUtils.lerp(zR, -2.5, k);
        uaR = MathUtils.lerp(uaR, -0.2, k);
        faR = MathUtils.lerp(faR, -0.3, k);
        faZR = Math.sin(g.t * 9) * 0.45 * k;
      } else if (g.kind === "offer") {
        uaL = MathUtils.lerp(uaL, -0.55, k);
        uaR = MathUtils.lerp(uaR, -0.55, k);
        faL = MathUtils.lerp(faL, -1.1, k);
        faR = MathUtils.lerp(faR, -1.1, k);
        zL = MathUtils.lerp(zL, 0.15, k);
        zR = MathUtils.lerp(zR, -0.15, k);
      } else {
        uaR = MathUtils.lerp(uaR, -1.25, k);
        zR = MathUtils.lerp(zR, -0.55, k);
        faR = MathUtils.lerp(faR, -0.15, k);
      }
      if (g.t >= g.dur) this.gesture = null;
    }
    b.upperArmL.rotation.set(uaL, 0, zL);
    b.upperArmR.rotation.set(uaR, 0, zR);
    b.foreArmL.rotation.set(faL, 0, 0);
    b.foreArmR.rotation.set(faR, 0, faZR);

    // head: look at the shopper when close, otherwise idle glances
    let yaw = Math.sin(this.t * 0.31) * 0.35 * (1 - walk);
    let pitch = Math.sin(this.t * 0.23) * 0.06;
    if (this.lookTarget) {
      const local = this.root.worldToLocal(this.lookTarget.clone());
      const dx = local.x;
      const dz = local.z;
      const dy = local.y - 1.6;
      const want = Math.atan2(dx, dz);
      if (Math.abs(want) < 1.9) {
        yaw = MathUtils.clamp(want, -1.1, 1.1);
        pitch = MathUtils.clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.4, 0.35) * -1;
      }
    }
    this.headYaw = MathUtils.lerp(this.headYaw, yaw, Math.min(1, dt * 4));
    this.headPitch = MathUtils.lerp(this.headPitch, pitch, Math.min(1, dt * 4));
    b.neck.rotation.y = this.headYaw * 0.4;
    b.head.rotation.y = this.headYaw * 0.6;
    b.head.rotation.x = this.headPitch;
    void camWorld;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.skeleton.dispose();
  }
}
