/*
 * Fresh Market 3D — period costume for the historical figures.
 *
 * Built on top of a realistic avatar and skinned to its own skeleton, so it moves with the motion
 * capture: a full-length robe (qaba), an open-fronted cloak (aba) with wide sleeves, a sash and a
 * wound turban (amameh). The shapes are fitted by measuring the avatar's body in its bind pose, so
 * nothing pokes through, then given folds, trims and a woven-cloth normal map.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  MathUtils,
  MeshPhysicalMaterial,
  SkinnedMesh,
  TorusGeometry,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { surface } from "../util/geo";
import { heightToNormalCanvas, toTexture } from "../util/textures";
import { NOISE } from "../util/noise";
import type { AvatarAsset } from "./library";

export interface Costume {
  /** outer open-fronted cloak */
  cloak: string;
  /** embroidered edge of the cloak */
  trim: string;
  /** full-length inner robe (hides modern clothes); omit to keep the avatar's own long garment */
  robe?: string;
  sash?: string;
  turban: string;
  /** extra turban girth (cm) for bulky headwear underneath */
  turbanExtra?: number;
}

type W = Array<[number, number]>; // [boneIndex, weight]

interface Piece {
  pos: number[];
  uv: number[];
  col: number[];
  skin: W[];
  index: number[];
}

const ARM = /UpperArm|Forearm|Hand|Finger/;

let weave: CanvasTexture | null = null;
function weaveNormal() {
  if (weave) return weave;
  const N = 128;
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // twill weave + a little slub
      const t = Math.sin(((x + y) / N) * Math.PI * 2 * 16) * 0.5 + 0.5;
      const s = Math.sin((y / N) * Math.PI * 2 * 32) * 0.25;
      h[y * N + x] = t * 0.7 + s * 0.3 + (NOISE.noise(x * 0.2, y * 0.2, 3) * 0.5 + 0.5) * 0.25;
    }
  weave = toTexture(heightToNormalCanvas(h, N, N, 1.6), false, true, 4);
  return weave;
}

export function buildCostume(a: AvatarAsset, c: Costume): BufferGeometry {
  const names = a.bones.map((b) => b.n.replace(/^Bip0\d/, "Bip01"));
  const idx = (n: string) => names.indexOf(n);
  const J = (n: string) => new Vector3().setFromMatrixPosition(a.inverses[idx(n)].clone().invert());
  const pelvis = J("Bip01_Pelvis"), spine = J("Bip01_Spine"), spine1 = J("Bip01_Spine1"), spine2 = J("Bip01_Spine2"), neck = J("Bip01_Neck"), head = J("Bip01_Head");
  const thighL = J("Bip01_L_Thigh"), calfL = J("Bip01_L_Calf"), footL = J("Bip01_L_Foot");
  const cx = pelvis.x, cz = (pelvis.z + spine2.z) / 2;

  // ── measure the body (no arms, no head) slice by slice in the bind pose
  const P = a.geometry.getAttribute("position");
  const SI = a.geometry.getAttribute("skinIndex");
  const SW = a.geometry.getAttribute("skinWeight");
  const armBone = names.map((n) => ARM.test(n));
  const STEP = 3;
  const y0 = footL.y - 2, y1 = neck.y + 2;
  const slices = Math.ceil((y1 - y0) / STEP) + 1;
  const rx = new Float32Array(slices), rf = new Float32Array(slices), rb = new Float32Array(slices);
  let topY = -Infinity;
  const headPts: Vector3[] = [];
  // geometry is stored in the mesh's local frame (Z-up); measure in the bind (character, Y-up) frame
  const bv = new Vector3();
  for (let i = 0; i < P.count; i++) {
    bv.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(a.bindMatrix);
    const x = bv.x, y = bv.y, z = bv.z;
    let best = 0, bw = -1;
    const ws = [SW.getX(i), SW.getY(i), SW.getZ(i), SW.getW(i)], is = [SI.getX(i), SI.getY(i), SI.getZ(i), SI.getW(i)];
    for (let k = 0; k < 4; k++) if (ws[k] > bw) (bw = ws[k]), (best = is[k]);
    if (y > topY) topY = y;
    if (y > neck.y + 4) headPts.push(new Vector3(x, y, z));
    if (armBone[best] || y < y0 || y > y1) continue;
    const s = Math.round((y - y0) / STEP);
    rx[s] = Math.max(rx[s], Math.abs(x - cx));
    if (z > cz) rf[s] = Math.max(rf[s], z - cz);
    else rb[s] = Math.max(rb[s], cz - z);
  }
  // smooth (moving max) and make the skirt flare monotonically below the hips
  const smooth = (arr: Float32Array) => {
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = Math.max(arr[Math.max(0, i - 1)], arr[i], arr[Math.min(arr.length - 1, i + 1)]);
    return out;
  };
  const RX = smooth(rx), RF = smooth(rf), RB = smooth(rb);
  const hipS = Math.round((pelvis.y - y0) / STEP);
  for (let i = hipS - 1; i >= 0; i--) {
    RX[i] = Math.max(RX[i], RX[i + 1] + 0.55);
    RF[i] = Math.max(RF[i], RF[i + 1] + 0.35);
    RB[i] = Math.max(RB[i], RB[i + 1] + 0.42);
  }
  const at = (arr: Float32Array, y: number) => {
    const f = MathUtils.clamp((y - y0) / STEP, 0, arr.length - 1);
    const i = Math.floor(f), k = f - i;
    return MathUtils.lerp(arr[i], arr[Math.min(arr.length - 1, i + 1)], k);
  };

  // ── skin weights by height (spine chain) and side (legs)
  const spineChain: Array<[number, number]> = [
    [pelvis.y, idx("Bip01_Pelvis")],
    [spine.y, idx("Bip01_Spine")],
    [spine1.y, idx("Bip01_Spine1")],
    [spine2.y, idx("Bip01_Spine2")],
    [neck.y, idx("Bip01_Neck")],
  ];
  const torsoW = (x: number, y: number): W => {
    if (y >= pelvis.y) {
      for (let i = 0; i < spineChain.length - 1; i++) {
        const [ya, ba] = spineChain[i], [yb, bb] = spineChain[i + 1];
        if (y <= yb) {
          const k = MathUtils.clamp((y - ya) / (yb - ya), 0, 1);
          const w: W = [[ba, 1 - k], [bb, k]];
          // shoulders follow the clavicles a little
          if (y > spine2.y && Math.abs(x - cx) > 9) w.push([idx(x > cx ? "Bip01_L_Clavicle" : "Bip01_R_Clavicle"), 0.35 * MathUtils.smoothstep(Math.abs(x - cx), 9, 17)]);
          return w;
        }
      }
      return [[idx("Bip01_Neck"), 1]];
    }
    // skirt: from the pelvis towards the thigh/calf on the same side
    const side = MathUtils.smoothstep(x - cx, -7, 7); // 1 = left (+x)
    const k = MathUtils.smoothstep(y, pelvis.y, calfL.y) * 0.72;
    const k2 = MathUtils.smoothstep(y, calfL.y, footL.y) * 0.3;
    const L = "Bip01_L_", R = "Bip01_R_";
    return [
      [idx("Bip01_Pelvis"), 1 - k],
      [idx(L + "Thigh"), (k - k2) * side],
      [idx(R + "Thigh"), (k - k2) * (1 - side)],
      [idx(L + "Calf"), k2 * side],
      [idx(R + "Calf"), k2 * (1 - side)],
    ];
  };

  const pieces: Piece[] = [];
  const shell = (open: number, pad: number, hemY: number, topYs: number, base: string, trim: string | null, folds: number) => {
    const piece: Piece = { pos: [], uv: [], col: [], skin: [], index: [] };
    const U = 56, V = 40;
    const cBase = new Color(base), cTrim = trim ? new Color(trim) : null;
    const cols = U + 1;
    const p = new Vector3();
    const tmpC = new Color();
    for (let j = 0; j <= V; j++) {
      const v = j / V;
      const y = MathUtils.lerp(hemY, topYs, v);
      // close in towards the collar
      const collar = MathUtils.smoothstep(y, neck.y - 5, topYs);
      for (let i = 0; i <= U; i++) {
        const u = i / U;
        const ang = Math.PI / 2 + open + u * (Math.PI * 2 - open * 2);
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const skirt = MathUtils.smoothstep(y, pelvis.y, hemY);
        const ripple = 1 + folds * skirt * (Math.sin(ang * 9 + NOISE.noise(ang * 2, y * 0.03, 1) * 3) * 0.05 + Math.sin(ang * 23) * 0.012);
        let x = at(RX, y) + pad, zf = at(RF, y) + pad, zb = at(RB, y) + pad;
        x = MathUtils.lerp(x, 9.5, collar);
        zf = MathUtils.lerp(zf, 8, collar);
        zb = MathUtils.lerp(zb, 8, collar);
        p.set(cx + ca * x * ripple, y - skirt * 0.6 * Math.abs(sa), cz + sa * (sa > 0 ? zf : zb) * ripple);
        piece.pos.push(p.x, p.y, p.z);
        piece.uv.push((u * (x * 2 + zf + zb) * 2) / 9, y / 9);
        // trim along the front edges and the hem
        const edge = open > 0 ? Math.min(u, 1 - u) * (Math.PI * 2 - open * 2) * x : 999;
        const isTrim = cTrim && (edge < 5 || y < hemY + 4);
        const valley = folds * skirt * (0.5 - 0.5 * Math.sin(ang * 9 + NOISE.noise(ang * 2, y * 0.03, 1) * 3));
        tmpC.copy(isTrim ? cTrim! : cBase).multiplyScalar((0.9 + NOISE.noise(p.x * 0.08, p.y * 0.05, p.z * 0.08) * 0.12) * (1 - valley * 0.32));
        // a touch of dust towards the hem
        tmpC.lerp(new Color("#7a6a55"), MathUtils.smoothstep(y, hemY + 25, hemY) * 0.18);
        piece.col.push(tmpC.r, tmpC.g, tmpC.b);
        piece.skin.push(torsoW(p.x, y));
        void cols;
      }
    }
    for (let j = 0; j < V; j++)
      for (let i = 0; i < U; i++) {
        const k = j * (U + 1) + i;
        piece.index.push(k, k + U + 1, k + 1, k + 1, k + U + 1, k + U + 2);
      }
    pieces.push(piece);
  };

  // inner robe (only when the avatar's own clothes must be hidden)
  if (c.robe) shell(0, 1.6, footL.y + 3, neck.y + 1, c.robe, null, 0.6);
  // outer cloak, open at the front, a little shorter
  shell(0.32, c.robe ? 3.2 : 2.6, footL.y + 9, neck.y - 1, c.cloak, c.trim, 1);
  // sash around the waist
  if (c.sash) {
    const piece: Piece = { pos: [], uv: [], col: [], skin: [], index: [] };
    const U = 40, V = 3;
    const sc = new Color(c.sash);
    for (let j = 0; j <= V; j++) {
      const y = spine.y - 3 + (j / V) * 9;
      for (let i = 0; i <= U; i++) {
        const ang = (i / U) * Math.PI * 2;
        const pad = (c.robe ? 2.3 : 1.6);
        const x = at(RX, y) + pad, zf = at(RF, y) + pad, zb = at(RB, y) + pad;
        const s = Math.sin(ang);
        const px = cx + Math.cos(ang) * x, pz = cz + s * (s > 0 ? zf : zb);
        piece.pos.push(px, y, pz);
        piece.uv.push(i / U * 4, j / V);
        const k = 0.85 + ((j % 2) * 0.1) + NOISE.noise(px * 0.3, y * 0.3, pz * 0.3) * 0.08;
        piece.col.push(sc.r * k, sc.g * k, sc.b * k);
        piece.skin.push(torsoW(px, y));
      }
    }
    for (let j = 0; j < V; j++)
      for (let i = 0; i < U; i++) {
        const k = j * (U + 1) + i;
        piece.index.push(k, k + U + 1, k + 1, k + 1, k + U + 1, k + U + 2);
      }
    pieces.push(piece);
  }

  // ── wide sleeves along each arm
  for (const s of ["L", "R"]) {
    const ua = J(`Bip01_${s}_UpperArm`), fa = J(`Bip01_${s}_Forearm`), ha = J(`Bip01_${s}_Hand`);
    const end = ha.clone().addScaledVector(ha.clone().sub(fa).normalize(), -1.5);
    const iU = idx(`Bip01_${s}_UpperArm`), iF = idx(`Bip01_${s}_Forearm`), iC = idx(`Bip01_${s}_Clavicle`);
    const piece: Piece = { pos: [], uv: [], col: [], skin: [], index: [] };
    const U = 18, V = 24;
    const base = new Color(c.cloak), trim = new Color(c.trim);
    const d1 = fa.clone().sub(ua), d2 = end.clone().sub(fa);
    const side = new Vector3(), up = new Vector3(), dir = new Vector3(), q = new Vector3();
    for (let j = 0; j <= V; j++) {
      const t = j / V;
      const center = t < 0.5 ? ua.clone().addScaledVector(d1, t * 2) : fa.clone().addScaledVector(d2, (t - 0.5) * 2);
      dir.copy(t < 0.5 ? d1 : d2).normalize();
      side.set(0, 0, 1).cross(dir).normalize();
      up.copy(dir).cross(side).normalize();
      const r = t < 0.12 ? MathUtils.lerp(9.6, 8.0, t / 0.12) : t < 0.5 ? 7.6 : MathUtils.lerp(7.8, 10.5, Math.pow((t - 0.5) * 2, 1.6));
      for (let i = 0; i <= U; i++) {
        const ang = (i / U) * Math.PI * 2;
        // the wide cuff hangs: more cloth below the arm
        const sag = t > 0.6 ? Math.max(0, -Math.cos(ang)) * (t - 0.6) * 6 : 0;
        q.copy(center).addScaledVector(side, Math.sin(ang) * r).addScaledVector(up, Math.cos(ang) * r - sag);
        piece.pos.push(q.x, q.y, q.z);
        piece.uv.push((i / U) * 6, t * 6);
        const col = (t > 0.93 ? trim : base).clone().multiplyScalar(0.9 + NOISE.noise(q.x * 0.1, q.y * 0.1, q.z * 0.1) * 0.12);
        piece.col.push(col.r, col.g, col.b);
        const k = MathUtils.smoothstep(t, 0.42, 0.58);
        const cl = t < 0.1 ? (1 - t / 0.1) * 0.45 : 0;
        piece.skin.push([[iU, (1 - k) * (1 - cl)], [iF, k * (1 - cl)], [iC, cl]]);
      }
    }
    for (let j = 0; j < V; j++)
      for (let i = 0; i < U; i++) {
        const k = j * (U + 1) + i;
        piece.index.push(k, k + 1, k + U + 1, k + 1, k + U + 2, k + U + 1);
      }
    pieces.push(piece);
  }

  // ── turban, wound around the skull and sitting on the forehead
  {
    const hc = new Vector3();
    let cnt = 0;
    for (const p of headPts) if (p.y > topY - 8) (hc.add(p), cnt++);
    hc.multiplyScalar(1 / Math.max(1, cnt));
    let hr = 0;
    for (const p of headPts) if (p.y > topY - 9 && p.y < topY - 3) hr = Math.max(hr, Math.hypot(p.x - hc.x, p.z - hc.z));
    hr = Math.min(hr, 12.5) + 0.6 + (c.turbanExtra || 0);
    const iH = idx("Bip01_Head");
    const tc = new Color(c.turban);
    const geos: BufferGeometry[] = [];
    // three fat wraps crossing each other diagonally over a rounded crown
    const wraps: Array<[number, number, number, number]> = [
      // [y offset, tilt X, tilt Z, tube]
      [-6.2, -0.1, 0.05, 3.4],
      [-3.4, 0.22, -0.12, 3.3],
      [-1.0, -0.2, 0.16, 3.0],
    ];
    for (const [dy, tx, tz, tube] of wraps) {
      const g = new TorusGeometry(hr + 0.9, tube, 12, 48);
      g.rotateX(Math.PI / 2 + tx);
      g.rotateZ(tz);
      g.translate(hc.x, topY + dy, hc.z - 0.4);
      geos.push(g);
    }
    const dome = new SphereGeometry(hr * 1.02, 26, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, 0.72, 1.02);
    dome.translate(hc.x, topY - 2.2, hc.z - 0.4);
    geos.push(dome);
    // soft, lumpy cloth: displace along the normal with low-frequency noise
    for (const g of geos) {
      g.computeVertexNormals();
      const pp = g.getAttribute("position"), nn = g.getAttribute("normal");
      for (let i = 0; i < pp.count; i++) {
        const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
        const d = NOISE.noise(x * 0.18, y * 0.35, z * 0.18) * 0.9 + Math.sin(Math.atan2(z - hc.z, x - hc.x) * 6 + y * 0.6) * 0.35;
        pp.setXYZ(i, x + nn.getX(i) * d, y + nn.getY(i) * d, z + nn.getZ(i) * d);
      }
    }
    for (const g of geos) {
      const piece: Piece = { pos: [], uv: [], col: [], skin: [], index: [] };
      const pp = g.getAttribute("position"), uu = g.getAttribute("uv");
      for (let i = 0; i < pp.count; i++) {
        const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
        piece.pos.push(x, y, z);
        piece.uv.push(uu.getX(i) * 14, uu.getY(i) * 3);
        const sh = 0.88 + NOISE.noise(x * 0.4, y * 0.9, z * 0.4) * 0.08 + Math.sin(Math.atan2(z - hc.z, x - hc.x) * 7 + y * 0.8) * 0.03;
        piece.col.push(tc.r * sh, tc.g * sh, tc.b * sh);
        piece.skin.push([[iH, 1]]);
      }
      const ix = g.index!;
      for (let i = 0; i < ix.count; i++) piece.index.push(ix.getX(i));
      pieces.push(piece);
    }
  }

  // ── assemble
  const geos = pieces.map((pc) => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pc.pos, 3));
    g.setAttribute("uv", new Float32BufferAttribute(pc.uv, 2));
    g.setAttribute("color", new Float32BufferAttribute(pc.col, 3));
    const n = pc.skin.length;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    pc.skin.forEach((w, i) => {
      const list = w.filter(([b, x]) => b >= 0 && x > 1e-4).sort((p, q) => q[1] - p[1]).slice(0, 4);
      const tot = list.reduce((s, [, x]) => s + x, 0) || 1;
      list.forEach(([b, x], k) => {
        si[i * 4 + k] = b;
        sw[i * 4 + k] = x / tot;
      });
      if (!list.length) sw[i * 4] = 1;
    });
    g.setAttribute("skinIndex", new BufferAttribute(si, 4));
    g.setAttribute("skinWeight", new BufferAttribute(sw, 4));
    g.setIndex(pc.index);
    g.computeVertexNormals();
    return g;
  });
  const out = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  // back into the mesh's local frame (skinning applies bindMatrix first)
  out.applyMatrix4(a.bindMatrix.clone().invert());
  out.boundingSphere = a.sphere.clone();
  void surface;
  void head;
  return out;
}

export function costumeMesh(a: AvatarAsset, c: Costume, like: SkinnedMesh, shadows: boolean): SkinnedMesh {
  const geo = buildCostume(a, c);
  const mat = new MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
    envMapIntensity: 0.6,
    sheen: 0.25,
    sheenRoughness: 0.8,
    sheenColor: new Color("#fff4e0"),
    normalMap: weaveNormal(),
    normalScale: new Vector2(0.14, 0.14),
    side: DoubleSide,
  });
  const m = new SkinnedMesh(geo, mat);
  m.position.copy(like.position);
  m.quaternion.copy(like.quaternion);
  m.scale.copy(like.scale);
  like.parent!.add(m);
  m.updateMatrixWorld(true);
  m.bind(like.skeleton, a.bindMatrix);
  m.boundingSphere = a.sphere.clone();
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}
