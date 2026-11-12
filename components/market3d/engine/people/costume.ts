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
  Matrix4,
  Object3D,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  MathUtils,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SkinnedMesh,
  TorusGeometry,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { lathe, surface } from "../util/geo";
import { heightToNormalCanvas, toTexture } from "../util/textures";
import { NOISE } from "../util/noise";
import type { AvatarAsset } from "./library";
import { FabricSpec, fabricTexture } from "./fabric";

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
  /** woven pattern of the outer garment (termeh, suzani, ikat, wool) */
  fabric?: FabricSpec;
  /** hem of the outer garment (default: just above the ankle) */
  length?: "knee" | "calf" | "ankle";
  /** front opening half-angle in radians (0 = closed coat, default 0.32 = open cloak) */
  open?: number;
  /**
   * headwear: felt cap (kolah namadi), the tall felt kolah of the 10th–12th c. with a fur brim, the
   * Seljuk sharbush (fur brim rising into a pointed plate over the forehead), a turban, or none.
   * `turban` gives the crown colour, `fur` the brim.
   */
  hat?: "turban" | "felt" | "kolah" | "sharbush" | "none";
  fur?: string;
  /** tiraz: the woven band round the upper sleeves of Persian robes */
  tiraz?: string;
  /**
   * Re-dress instead of over-dress: the avatar keeps its own artist-made garments (true fit, folds,
   * seams and skinning) re-woven in `fabric`, with trims at collar, placket and cuffs; only a slim
   * skirt below the sash and the headwear are added. See `redress`.
   */
  fitted?: boolean;
  /** colour of the trousers under a fitted qaba */
  trousers?: string;
  /** sleeve cut: wide (period robes) or tailored (coats) */
  sleeve?: "wide" | "tailored";
}

/**
 * Body capsules used by the garment-collision pass, measured per avatar from its own skin weights:
 * thighs, shins, feet, upper arms and forearms (left/right).
 */
export const CAPSULES: Array<[string, string, string]> = [
  ["Bip01_L_Thigh", "Bip01_L_Calf", "Bip01_L_Thigh"],
  ["Bip01_R_Thigh", "Bip01_R_Calf", "Bip01_R_Thigh"],
  ["Bip01_L_Calf", "Bip01_L_Foot", "Bip01_L_Calf"],
  ["Bip01_R_Calf", "Bip01_R_Foot", "Bip01_R_Calf"],
  ["Bip01_L_Foot", "Bip01_L_Toe0", "Bip01_L_Foot"],
  ["Bip01_R_Foot", "Bip01_R_Toe0", "Bip01_R_Foot"],
  ["Bip01_L_UpperArm", "Bip01_L_Forearm", "Bip01_L_UpperArm"],
  ["Bip01_R_UpperArm", "Bip01_R_Forearm", "Bip01_R_UpperArm"],
  ["Bip01_L_Forearm", "Bip01_L_Hand", "Bip01_L_Forearm"],
  ["Bip01_R_Forearm", "Bip01_R_Hand", "Bip01_R_Forearm"],
  // hips (across the two hip joints) and the belly — keeps pockets, buckles and seats inside
  ["Bip01_L_Thigh", "Bip01_R_Thigh", "Bip01_Pelvis"],
  ["Bip01_Spine", "Bip01_Spine2", "Bip01_Spine"],
];
const CLEARANCE = [1.6, 1.6, 1.4, 1.4, 1.2, 1.2, 1.2, 1.2, 1.0, 1.0, 1.4, 1.2];

type W = Array<[number, number]>; // [boneIndex, weight]

interface Piece {
  pos: number[];
  uv: number[];
  col: number[];
  skin: W[];
  index: number[];
  /** 1 = solid trim colour (placket, hem, cuffs, sash), 0 = woven pattern */
  trim?: number[];
  /** layer order for the collision pass (cm): outer layers are kept this far outside inner ones */
  lay?: number;
  /** 1 = body panel (drapes outward over the legs), 2 = sash (also ignores the arms), 0 = sleeve */
  drape?: number;
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
  const iNeck = idx("Bip01_Neck");
  const neckPts: Vector3[] = [];
  const capBones = CAPSULES.map(([a2, b2, dom]) => ({ a: J(a2), b: J(b2), dom: idx(dom), d: [] as number[] }));
  const segDist = (p: Vector3, a2: Vector3, b2: Vector3) => {
    const ab = b2.clone().sub(a2);
    const t = MathUtils.clamp(p.clone().sub(a2).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1);
    return p.distanceTo(a2.clone().addScaledVector(ab, t));
  };
  for (let i = 0; i < P.count; i++) {
    bv.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(a.bindMatrix);
    const x = bv.x, y = bv.y, z = bv.z;
    let best = 0, bw = -1;
    const ws = [SW.getX(i), SW.getY(i), SW.getZ(i), SW.getW(i)], is = [SI.getX(i), SI.getY(i), SI.getZ(i), SI.getW(i)];
    for (let k = 0; k < 4; k++) if (ws[k] > bw) (bw = ws[k]), (best = is[k]);
    for (const cb of capBones) if (cb.dom === best) cb.d.push(segDist(bv, cb.a, cb.b));
    if (y > topY) topY = y;
    if (y > neck.y + 4) headPts.push(new Vector3(x, y, z));
    if (best === iNeck && y > neck.y - 1 && y < neck.y + 6) neckPts.push(bv.clone());
    if (armBone[best] || y < y0 || y > y1) continue;
    const s = Math.round((y - y0) / STEP);
    rx[s] = Math.max(rx[s], Math.abs(x - cx));
    if (z > cz) rf[s] = Math.max(rf[s], z - cz);
    else rb[s] = Math.max(rb[s], cz - z);
  }
  // capsule radius = 95th percentile of the skin's distance to the bone, plus clearance for cloth
  const capsuleRadii = capBones.map((cb, i) => {
    if (!cb.d.length) return 0;
    cb.d.sort((p2, q2) => p2 - q2);
    return cb.d[Math.floor(cb.d.length * 0.95)] + CLEARANCE[i];
  });
  // smooth (moving max) and make the skirt flare monotonically below the hips
  const smooth = (arr: Float32Array) => {
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = Math.max(arr[Math.max(0, i - 1)], arr[i], arr[Math.min(arr.length - 1, i + 1)]);
    return out;
  };
  const RX = smooth(rx), RF = smooth(rf), RB = smooth(rb);
  const hipS = Math.round((pelvis.y - y0) / STEP);
  // a fitted qaba falls almost straight; tailored coats flare gently; period robes freely
  const flare = c.fitted ? 0.2 : c.sleeve === "tailored" ? 0.62 : 1;
  for (let i = hipS - 1; i >= 0; i--) {
    RX[i] = Math.max(RX[i], RX[i + 1] + 0.55 * flare);
    RF[i] = Math.max(RF[i], RF[i + 1] + 0.35 * flare);
    RB[i] = Math.max(RB[i], RB[i + 1] + 0.42 * flare);
  }
  const at = (arr: Float32Array, y: number) => {
    const f = MathUtils.clamp((y - y0) / STEP, 0, arr.length - 1);
    const i = Math.floor(f), k = f - i;
    return MathUtils.lerp(arr[i], arr[Math.min(arr.length - 1, i + 1)], k);
  };
  // the natural waist: the slimmest slice between the hips and the chest — the sash sits there and
  // a tailored coat is taken in to it, so the cut follows the figure instead of hanging like a sack
  let waistY = spine.y, waistW = Infinity;
  for (let y = pelvis.y + 4; y <= spine2.y - 2; y += 1) {
    const w = at(RX, y) * 2 + at(RF, y) + at(RB, y);
    if (w < waistW) (waistW = w), (waistY = y);
  }
  // the collar: a snug band around the base of the neck
  // measured on the skin the neck bone owns (shirt collars included), centred on the neck itself —
  // usually a little forward of the torso's centre
  let ncx = cx, ncz = neck.z, neckX = 6.4, neckF = 6, neckB = 6;
  if (neckPts.length > 20) {
    ncx = neckPts.reduce((t, q) => t + q.x, 0) / neckPts.length;
    ncz = neckPts.reduce((t, q) => t + q.z, 0) / neckPts.length;
    const pct = (arr: number[], f: number) => (arr.sort((p2, q2) => p2 - q2), arr[Math.floor((arr.length - 1) * f)] || 0);
    neckX = Math.max(5, pct(neckPts.map((q) => Math.abs(q.x - ncx)), 0.92));
    neckF = Math.max(4.5, pct(neckPts.filter((q) => q.z > ncz).map((q) => q.z - ncz), 0.92));
    neckB = Math.max(4.5, pct(neckPts.filter((q) => q.z <= ncz).map((q) => ncz - q.z), 0.92));
  }

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
    // follow the legs firmly (a seated figure's robe drapes over thighs and shins, never through them)
    const k = MathUtils.smoothstep(y, pelvis.y, calfL.y) * 0.9;
    const k2 = MathUtils.smoothstep(y, calfL.y + 6, footL.y + 12) * 0.85;
    const L = "Bip01_L_", R = "Bip01_R_";
    return [
      [idx("Bip01_Pelvis"), 1 - k],
      [idx(L + "Thigh"), (k - k2) * side],
      [idx(R + "Thigh"), (k - k2) * (1 - side)],
      [idx(L + "Calf"), k2 * side],
      [idx(R + "Calf"), k2 * (1 - side)],
    ];
  };

  // the shoulder line: coats end at the shoulder joints (sleeves take over), sloping up to the neck
  const uaL = J("Bip01_L_UpperArm"), uaR = J("Bip01_R_UpperArm");
  const tailored = c.sleeve === "tailored";
  const shoulderX = (Math.abs(uaL.x - cx) + Math.abs(uaR.x - cx)) / 2 + (tailored ? -1.5 : 2.2);
  const shoulderY = (uaL.y + uaR.y) / 2 + 1.5;
  const pieces: Piece[] = [];
  const shell = (open: number, pad: number, hemY: number, topYs: number, base: string, trim: string | null, folds: number, lay: number, top: "collar" | "waist" = "collar") => {
    const piece: Piece = { pos: [], uv: [], col: [], skin: [], index: [], lay, drape: 1 };
    const U = 60;
    const cBase = new Color(base), cTrim = trim ? new Color(trim) : null;
    const p = new Vector3();
    const tmpC = new Color();
    const dust = new Color("#7a6a55");
    // rows: evenly spaced, plus a pair of rows hugging each trim edge (hem band, collar band) so the
    // trims end in a crisp line instead of a blurred, zig-zag gradient
    // closed garments finish in a standing (mandarin) collar: the shoulders slope up to the base of
    // the neck and a 3.5 cm band rises straight from there; open cloaks just lie on the shoulders
    const stand = open < 0.05 && top === "collar";
    const neckTop = stand ? topYs - 3.5 : topYs;
    // a skirt that starts at the waist (under a sash) has no collar band
    const HEM = hemY + 4, COL = top === "waist" ? Infinity : stand ? neckTop - 0.3 : topYs - 2.5;
    const ys: number[] = [];
    for (let j = 0; j <= 40; j++) ys.push(MathUtils.lerp(hemY, topYs, j / 40));
    if (cTrim) ys.push(HEM - 0.2, HEM + 0.2);
    if (cTrim && Number.isFinite(COL)) ys.push(COL - 0.2, COL + 0.2);
    ys.sort((a2, b2) => a2 - b2);
    const T = Math.PI * 2 - open * 2; // the angular span of the garment
    for (const y of ys) {
      // shoulders slope from the shoulder point up to a mandarin collar at the neck
      const collar = Math.pow(MathUtils.smoothstep(y, shoulderY - 3, neckTop), 0.85);
      const skirt = MathUtils.smoothstep(y, pelvis.y, hemY);
      // a little extra ease over the belt line, where buckles and pockets sit
      const beltEase = Math.exp(-Math.pow((y - (pelvis.y + spine.y) / 2) / 9, 2)) * (tailored ? 0.8 : 1.6);
      let x = at(RX, y) + pad + beltEase * 0.5, zf = at(RF, y) + pad + beltEase, zb = at(RB, y) + pad + beltEase * 0.4;
      // tailoring: take the coat in to the natural waist (darts) so it follows the figure
      if (tailored) {
        const dart = Math.exp(-Math.pow((y - waistY) / 8, 2));
        x -= dart * pad * 0.45;
        zb -= dart * pad * 0.35;
        zf -= dart * pad * 0.3;
      }
      if (y > spine2.y - 6) x = Math.min(x, shoulderX + pad * 0.5);
      x = MathUtils.lerp(x, neckX + 1.1 + pad * 0.15, collar);
      zf = MathUtils.lerp(zf, neckF + 1.1 + pad * 0.15, collar);
      zb = MathUtils.lerp(zb, neckB + 1.1 + pad * 0.15, collar);
      const ox = MathUtils.lerp(cx, ncx, collar), oz = MathUtils.lerp(cz, ncz, collar);
      // columns: the first and last two hug the front trim (placket on a closed coat, facings on an
      // open one) at a fixed width in cm, the rest are spread evenly round the body
      const tw = open > 0 ? 4.5 : 2.0;
      const a = Math.min(T * 0.2, tw / Math.max(6, zf)), eps = 0.2 / Math.max(6, zf);
      const offs: number[] = [0, a - eps];
      for (let i = 2; i <= U - 2; i++) offs.push(MathUtils.lerp(a + eps, T - a - eps, (i - 2) / (U - 4)));
      offs.push(T - a + eps, T);
      const rowTrim = !!cTrim && (y < HEM || y > COL);
      for (let i = 0; i <= U; i++) {
        const u = offs[i] / T;
        const ang = Math.PI / 2 + open + offs[i];
        const ca = Math.cos(ang), sa = Math.sin(ang);
        // folds only ever add cloth (outward), so inner layers can never show through the valleys;
        // the noise is sampled on the circle so a closed coat's front seam meets itself exactly
        const wave = Math.sin(ang * 9 + NOISE.noise(ca * 1.6, y * 0.03, sa * 1.6) * 3) * 0.5 + 0.5;
        const ripple = 1 + folds * skirt * (wave * 0.07 + (Math.sin(ang * 23) * 0.5 + 0.5) * 0.012);
        p.set(ox + ca * x * ripple, y - skirt * 0.6 * Math.abs(sa), oz + sa * (sa > 0 ? zf : zb) * ripple);
        piece.pos.push(p.x, p.y, p.z);
        piece.uv.push((u * (x * 2 + zf + zb) * 2) / 9, y / 9);
        const isTrim = rowTrim || (!!cTrim && (i <= 1 || i >= U - 1));
        const valley = folds * skirt * (1 - wave);
        tmpC.copy(isTrim ? cTrim! : cBase).multiplyScalar((0.9 + NOISE.noise(p.x * 0.08, p.y * 0.05, p.z * 0.08) * 0.12) * (1 - valley * 0.3));
        // a touch of dust towards the hem
        tmpC.lerp(dust, MathUtils.smoothstep(y, hemY + 25, hemY) * 0.18);
        piece.col.push(tmpC.r, tmpC.g, tmpC.b);
        (piece.trim ||= []).push(isTrim ? 1 : 0);
        piece.skin.push(torsoW(p.x, y));
      }
    }
    for (let j = 0; j < ys.length - 1; j++)
      for (let i = 0; i < U; i++) {
        const k = j * (U + 1) + i;
        piece.index.push(k, k + U + 1, k + 1, k + 1, k + U + 1, k + U + 2);
      }
    pieces.push(piece);
  };

  // inner robe (only when the avatar's own clothes must be hidden)
  if (c.robe && !c.fitted) shell(0, 1.6, footL.y + 3, neck.y + 1, c.robe, null, 0.3, 0);
  // outer garment: cloak or coat, open or closed, knee / calf / ankle length
  const hem = c.length === "knee" ? calfL.y + 3 : c.length === "calf" ? (calfL.y + footL.y) / 2 + 2 : footL.y + 9;
  const coatPad = c.robe ? 3.2 : tailored ? 1.9 : 2.6;
  // layer order: robe 0 → sash (under an open cloak) → coat → sash over a closed coat → sleeves
  const closed = (c.open ?? 0.32) < 0.05;
  const coatLay = c.robe || !closed ? 1.6 : 0;
  // a fitted figure wears only its own clothes re-woven (see `redress`): no garment is layered on top
  if (!c.fitted) shell(c.open ?? 0.32, coatPad, hem, closed ? neck.y + 2.5 : neck.y - 1, c.fabric ? "#ffffff" : c.cloak, c.trim, tailored ? 0.55 : 1, coatLay);
  // sash around the waist
  if (c.sash) {
    const piece: Piece = { pos: [], uv: [], col: [], skin: [], index: [], lay: closed ? coatLay + 1.0 : 0.8, drape: 2 };
    const U = 40, V = 3;
    const sc = new Color(c.sash);
    for (let j = 0; j <= V; j++) {
      const y = c.fitted ? waistY - 2.5 + (j / V) * 5 : waistY - 4.5 + (j / V) * 9;
      for (let i = 0; i <= U; i++) {
        const ang = (i / U) * Math.PI * 2;
        const pad = c.fitted ? 1.15 : (c.open ?? 0.32) < 0.05 ? coatPad + (tailored ? 0.4 : 0.9) : c.robe ? 2.3 : 1.6;
        const x = at(RX, y) + pad, zf = at(RF, y) + pad, zb = at(RB, y) + pad;
        const s = Math.sin(ang);
        const px = cx + Math.cos(ang) * x, pz = cz + s * (s > 0 ? zf : zb);
        piece.pos.push(px, y, pz);
        piece.uv.push(i / U * 4, j / V);
        const k = 0.85 + ((j % 2) * 0.1) + NOISE.noise(px * 0.3, y * 0.3, pz * 0.3) * 0.08;
        piece.col.push(sc.r * k, sc.g * k, sc.b * k);
        (piece.trim ||= []).push(1);
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

  // ── wide sleeves along each arm (a fitted qaba keeps the avatar's own sleeves)
  for (const s of c.fitted ? [] : ["L", "R"]) {
    const ua = J(`Bip01_${s}_UpperArm`), fa = J(`Bip01_${s}_Forearm`), ha = J(`Bip01_${s}_Hand`);
    // tailored sleeves reach just past the wrist bone (covering any shirt cuff underneath)
    const end = ha.clone().addScaledVector(ha.clone().sub(fa).normalize(), tailored ? 0.6 : -1.5);
    // tailored sleeves start a little inside the shoulder so the seam is hidden in the coat
    // tailored sleeves: start slightly above the joint so a rounded cap covers the deltoid
    if (tailored) ua.addScaledVector(fa.clone().sub(ua).normalize(), -3.2);
    const iU = idx(`Bip01_${s}_UpperArm`), iF = idx(`Bip01_${s}_Forearm`), iC = idx(`Bip01_${s}_Clavicle`);
    const piece: Piece = { pos: [], uv: [], col: [], skin: [], index: [], lay: coatLay + 0.6 };
    const U = 18, V = 24;
    const base = new Color(c.fabric ? "#ffffff" : c.cloak), trim = new Color(c.trim), tirazC = new Color(c.tiraz || c.trim);
    const d1 = fa.clone().sub(ua), d2 = end.clone().sub(fa);
    const side = new Vector3(), up = new Vector3(), dir = new Vector3(), q = new Vector3();
    for (let j = 0; j <= V; j++) {
      const t = j / V;
      const center = t < 0.5 ? ua.clone().addScaledVector(d1, t * 2) : fa.clone().addScaledVector(d2, (t - 0.5) * 2);
      dir.copy(t < 0.5 ? d1 : d2).normalize();
      side.set(0, 0, 1).cross(dir).normalize();
      up.copy(dir).cross(side).normalize();
      // tailored sleeves are cut to this avatar's own arm (the measured collision capsules), so
      // slim arms get slim sleeves and broad ones are never squeezed through the cloth
      const rUA = Math.max(5.0, (capsuleRadii[s === "L" ? 6 : 7] || 6.2) + 0.7);
      const rFA = Math.max(4.4, Math.min(rUA - 0.3, (capsuleRadii[s === "L" ? 8 : 9] || 5.4) + 0.8));
      const r =
        c.sleeve === "tailored"
          ? t < 0.16
            ? rUA * Math.sqrt(Math.sin((Math.PI / 2) * Math.max(0.04, t / 0.16))) // rounded sleeve cap
            : t < 0.5 ? MathUtils.lerp(rUA, rUA - 0.2, (t - 0.16) / 0.34) : MathUtils.lerp(rUA - 0.2, rFA, (t - 0.5) * 2)
          : t < 0.12 ? MathUtils.lerp(9.6, 8.0, t / 0.12) : t < 0.5 ? 7.6 : MathUtils.lerp(7.8, 10.5, Math.pow((t - 0.5) * 2, 1.6));
      for (let i = 0; i <= U; i++) {
        const ang = (i / U) * Math.PI * 2;
        // the wide cuff hangs: more cloth below the arm
        const sag = c.sleeve === "tailored" ? 0 : t > 0.6 ? Math.max(0, -Math.cos(ang)) * (t - 0.6) * 6 : 0;
        q.copy(center).addScaledVector(side, Math.sin(ang) * r).addScaledVector(up, Math.cos(ang) * r - sag);
        piece.pos.push(q.x, q.y, q.z);
        piece.uv.push((i / U) * 6, t * 6);
        const band = !!c.tiraz && t > 0.2 && t < 0.27;
        const col = (t > 0.93 ? trim : band ? tirazC : base).clone().multiplyScalar(0.9 + NOISE.noise(q.x * 0.1, q.y * 0.1, q.z * 0.1) * 0.12);
        piece.col.push(col.r, col.g, col.b);
        (piece.trim ||= []).push(t > 0.93 || band ? 1 : 0);
        const k = MathUtils.smoothstep(t, 0.42, 0.58);
        const cl = t < 0.1 ? (1 - t / 0.1) * (tailored ? 0.25 : 0.45) : 0;
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

  const garmentPieces = pieces.length;
  const hat = c.hat ?? "turban";
  // ── felt cap (kolah namadi): a firm, slightly tapered felt dome sitting on the crown
  if (hat === "felt") {
    const hc = new Vector3();
    let cnt = 0;
    for (const p of headPts) if (p.y > topY - 8) (hc.add(p), cnt++);
    hc.multiplyScalar(1 / Math.max(1, cnt));
    let hr = 0;
    for (const p of headPts) if (p.y > topY - 9 && p.y < topY - 3) hr = Math.max(hr, Math.hypot(p.x - hc.x, p.z - hc.z));
    hr = Math.min(hr, 11.5) + 0.4;
    const prof: Array<[number, number]> = [
      [hr + 0.2, -7.5],
      [hr + 0.5, -6.8],
      [hr + 0.2, -2],
      [hr - 0.6, 2.2],
      [hr * 0.7, 4.2],
      [0, 4.9],
    ];
    const g = lathe(prof.map(([r, y]) => [r, topY + y] as [number, number]), 40, 14);
    g.translate(hc.x, 0, hc.z - 0.4);
    const tc = new Color(c.turban);
    const iH = idx("Bip01_Head");
    const piece: Piece = { pos: [], uv: [], col: [], skin: [], index: [] };
    const pp = g.getAttribute("position"), uu = g.getAttribute("uv");
    for (let i = 0; i < pp.count; i++) {
      const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
      piece.pos.push(x, y, z);
      piece.uv.push(uu.getX(i) * 8, uu.getY(i) * 2);
      const sh = 0.86 + NOISE.noise(x * 0.5, y * 0.5, z * 0.5) * 0.1 - (y < topY - 6.4 ? 0.12 : 0);
      piece.col.push(tc.r * sh, tc.g * sh, tc.b * sh);
      piece.skin.push([[iH, 1]]);
    }
    const ix = g.index!;
    for (let i = 0; i < ix.count; i++) piece.index.push(ix.getX(i));
    pieces.push(piece);
  }
  // ── period Persian hats: the tall felt kolah with a fur brim (Samanid–Seljuk scholars and
  // courtiers), and the Seljuk sharbush, whose fur brim rises into a pointed, gold-faced plate
  if (hat === "kolah" || hat === "sharbush") {
    const hc = new Vector3();
    let cnt = 0;
    for (const p of headPts) if (p.y > topY - 8) (hc.add(p), cnt++);
    hc.multiplyScalar(1 / Math.max(1, cnt));
    let hr = 0;
    for (const p of headPts) if (p.y > topY - 9 && p.y < topY - 3) hr = Math.max(hr, Math.hypot(p.x - hc.x, p.z - hc.z));
    // a real head is ~9 cm in radius at the hat band; measured hair can exaggerate it
    hr = MathUtils.clamp(hr, 8.2, 10.2) + 0.35;
    const iH = idx("Bip01_Head");
    const crownC = new Color(c.turban), furC = new Color(c.fur || "#2a1f18"), goldC = new Color(c.trim);
    const fromGeo = (g: BufferGeometry, colour: (x: number, y: number, z: number) => Color, us: number, vs: number) => {
      const piece: Piece = { pos: [], uv: [], col: [], skin: [], index: [] };
      const pp = g.getAttribute("position"), uu = g.getAttribute("uv");
      for (let i = 0; i < pp.count; i++) {
        const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
        piece.pos.push(x, y, z);
        piece.uv.push(uu ? uu.getX(i) * us : 0, uu ? uu.getY(i) * vs : 0);
        const cc = colour(x, y, z);
        piece.col.push(cc.r, cc.g, cc.b);
        piece.skin.push([[iH, 1]]);
      }
      const ix = g.index!;
      for (let i = 0; i < ix.count; i++) piece.index.push(ix.getX(i));
      pieces.push(piece);
    };
    const brimY = topY - 7.2; // the band sits a little above the brow
    // crown
    const prof: Array<[number, number]> =
      hat === "kolah"
        ? [[hr + 0.15, -7.4], [hr + 0.05, -3], [hr - 0.5, 1.2], [hr * 0.7, 4.5], [hr * 0.4, 7.5], [hr * 0.12, 9.6], [0, 10]]
        : [[hr + 0.2, -7.4], [hr + 0.3, -3], [hr - 0.2, 1.4], [hr * 0.74, 3.5], [0, 4.2]];
    const crown = lathe(prof.map(([r, y]) => [r, topY + y] as [number, number]), 40, 18);
    crown.translate(hc.x, 0, hc.z - 0.4);
    fromGeo(crown, (x, y, z) => crownC.clone().multiplyScalar(0.84 + NOISE.noise(x * 0.4, y * 0.4, z * 0.4) * 0.1 + Math.sin(Math.atan2(z - hc.z, x - hc.x) * 10) * 0.02), 8, 3);
    // fur brim: a thick roll round the head; on the sharbush it rises over the forehead
    const brim = new TorusGeometry(hr + 0.55, hat === "kolah" ? 1.5 : 1.8, 14, 72);
    brim.rotateX(Math.PI / 2);
    {
      const pp = brim.getAttribute("position");
      for (let i = 0; i < pp.count; i++) {
        const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
        const f = Math.max(0, z / Math.max(1e-3, Math.hypot(x, z))); // 1 = straight ahead (+z)
        const rise = hat === "sharbush" ? 6.5 * Math.pow(f, 9) : 0;
        // shaggy fur: low-frequency lumps along the roll
        const fur = 1 + NOISE.noise(x * 0.5, y * 0.8, z * 0.5) * 0.1;
        pp.setXYZ(i, x, y * fur + rise, z);
      }
    }
    brim.translate(hc.x, brimY, hc.z - 0.4);
    fromGeo(brim, (x, y, z) => furC.clone().multiplyScalar(0.8 + NOISE.noise(x * 1.3, y * 1.3, z * 1.3) * 0.22), 24, 2);
    if (hat === "sharbush") {
      // the gold-faced plate filling the raised point, with a jewel at its heart
      const plate = surface(10, 8, (u, v, out) => {
        const w = 3.4 * Math.pow(1 - v, 0.85);
        const x = (u * 2 - 1) * w;
        out.set(hc.x + x, brimY + 0.8 + v * 6, hc.z - 0.4 + hr + 0.7 - v * 1.2 - (x * x) / (2 * (hr + 2)));
      }, false);
      fromGeo(plate, (_x, y) => goldC.clone().multiplyScalar(0.95 + Math.sin(y * 2.2) * 0.05), 1, 1);
      const jewel = new SphereGeometry(0.8, 12, 8);
      jewel.translate(hc.x, brimY + 3, hc.z - 0.4 + hr + 1.0);
      fromGeo(jewel, () => new Color("#8a1a24"), 1, 1);
    }
  }
  // ── turban, wound around the skull and sitting on the forehead
  if (hat === "turban") {
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
    g.setAttribute("trim", new Float32BufferAttribute(pc.trim && pc.trim.length === pc.skin.length ? pc.trim : new Array(pc.skin.length).fill(0), 1));
    g.setAttribute("layer", new Float32BufferAttribute(new Array(pc.skin.length).fill(pc.lay ?? 0), 1));
    g.setAttribute("drape", new Float32BufferAttribute(new Array(pc.skin.length).fill(pc.drape ?? 0), 1));
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
    if (pc.drape) {
      // the collision pass pushes along the normal: make sure it points away from the body
      const P = g.getAttribute("position"), N = g.getAttribute("normal");
      let vote = 0;
      for (let i = 0; i < P.count; i += 7) vote += Math.sign(N.getX(i) * (P.getX(i) - cx) + N.getZ(i) * (P.getZ(i) - cz));
      if (vote < 0) {
        const ix = pc.index.slice();
        for (let t = 0; t < ix.length; t += 3) [ix[t + 1], ix[t + 2]] = [ix[t + 2], ix[t + 1]];
        g.setIndex(ix);
        g.computeVertexNormals();
      }
    }
    return g;
  });
  const garments = mergeGeometries(geos.slice(0, garmentPieces), false)!;
  const headwear = geos.length > garmentPieces ? mergeGeometries(geos.slice(garmentPieces), false) : null;
  const out = headwear ? mergeGeometries([garments, headwear], true)! : garments;
  if (!headwear) out.addGroup(0, out.index!.count, 0);
  geos.forEach((g) => g.dispose());
  out.userData.capsuleRadii = capsuleRadii;
  // back into the mesh's local frame (skinning applies bindMatrix first)
  out.applyMatrix4(a.bindMatrix.clone().invert());
  out.boundingSphere = a.sphere.clone();
  void surface;
  void head;
  return out;
}

/**
 * Garment collision ("capsule push"): after skinning, every cloth vertex inside one of the body
 * capsules is pushed out to its surface. Capsules are measured per avatar from its own skin and
 * updated each frame from the live skeleton, so legs never come through a robe in mid-stride, while
 * seated or during gestures.
 */
function withCapsules(mat: MeshPhysicalMaterial, uniforms: { uCapA: { value: Vector3[] }; uCapB: { value: Vector3[] }; uCapR: { value: number[] } }) {
  const n = CAPSULES.length;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCapA = uniforms.uCapA;
    sh.uniforms.uCapB = uniforms.uCapB;
    sh.uniforms.uCapR = uniforms.uCapR;
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 uCapA[${n}];
        uniform vec3 uCapB[${n}];
        uniform float uCapR[${n}];
        vec3 fmPushOut(vec3 p, vec3 nrm) {
          // "outward" for a garment panel is its own skinned surface normal (built facing out), so
          // a lap drapes upward over the thighs and a skirt forward over a striding shin
          float nl = length(nrm);
          vec3 outw = nl > 1e-4 ? nrm / nl : vec3(0.0, 0.0, 1.0);
          for (int i = 0; i < ${n}; i++) {
            if (uCapR[i] <= 0.0) continue;
            float r = uCapR[i] + layer;
            vec3 a = uCapA[i], ab = uCapB[i] - uCapA[i];
            float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
            vec3 c = a + ab * t;
            vec3 d = p - c;
            float l = length(d);
            // soft contact: a smooth maximum of the current distance and the capsule radius, so cloth
            // near a limb eases away from it instead of snapping vertex by vertex (no jagged edges)
            const float K = 2.2;
            if (l > r + 2.5 * K) continue;
            float tgt = 0.5 * (l + r + sqrt((l - r) * (l - r) + K * K));
            if (tgt - l < 0.02) continue;
            // a coat panel never wraps behind a leg that swings into it: it is carried outward,
            // over the leg, as real cloth is (sleeves and anything near the arms take the short way)
            bool arm = i >= 6 && i <= 9;
            // a sash is wrapped tight round the waist: limbs rest on it, never push it
            if (drape > 1.5) continue;
            if (drape > 0.5 && !arm) {
              // along the cloth's normal when it faces the limb (a lap over a thigh) or when the limb
              // has come through from behind (a shin through a skirt); otherwise the short way
              float b = dot(d, outw);
              float cosA = b / max(l, 1e-4);
              if (cosA > 0.35 || cosA < -0.2) {
                p += outw * min(-b + sqrt(max(b * b - l * l + tgt * tgt, 0.0)), 2.2 * tgt);
                continue;
              }
            }
            p = c + (l > 1e-4 ? d / l : vec3(0.0, 0.0, 1.0)) * tgt;
          }
          return p;
        }`,
      )
      .replace("#include <skinning_vertex>", "#include <skinning_vertex>\n  transformed = fmPushOut(transformed, objectNormal);")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\n  vTrim = trim;")
      .replace("#include <common>", "#include <common>\nattribute float trim;\nattribute float layer;\nattribute float drape;\nvarying float vTrim;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vTrim;")
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D( map, vMapUv );
          diffuseColor *= mix( sampledDiffuseColor, vec4( 1.0 ), vTrim );
        #endif`,
      );
  };
  mat.customProgramCacheKey = () => "fm-capsules";
}

/**
 * Re-dressing. Instead of wrapping a garment round the avatar, re-weave the clothes it already wears:
 * the artist-made coat keeps its exact fit, folds, seams and skinning — so nothing is inflated and
 * nothing pokes through — and only its cloth changes. Per fragment the shader
 *  • replaces the original fabric with the Persian silk, projected round the torso and round each
 *    arm in true centimetres (the same scale as the skirt below the sash);
 *  • keeps the original folds, seams and creases as shading: each texel's brightness relative to the
 *    average brightness of its neighbourhood (plus the original normal map);
 *  • adds a gold collar, a front placket, cuffs and tiraz bands on the upper sleeves;
 *  • turns the trousers into plain dark shalvar and leaves skin and shoes untouched.
 */
export function redress(a: AvatarAsset, mesh: SkinnedMesh, c: Costume) {
  if (!c.fabric) return;
  const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as MeshStandardMaterial[];
  const bodyMat = mats.find((m) => m.name.endsWith("-body"));
  if (!bodyMat || !bodyMat.map) return;
  const names = a.bones.map((b) => b.n.replace(/^Bip0\d/, "Bip01"));
  const idx = (n: string) => names.indexOf(n);
  const J = (n: string) => new Vector3().setFromMatrixPosition(a.inverses[idx(n)].clone().invert());
  const geo = a.geometry.clone();
  const P = geo.getAttribute("position"), SI = geo.getAttribute("skinIndex"), SW = geo.getAttribute("skinWeight"), UV = geo.getAttribute("uv");
  const n = P.count;
  const onBody = new Uint8Array(n);
  const index = geo.index!;
  for (const g of geo.groups) {
    if (mats[g.materialIndex ?? 0] !== bodyMat) continue;
    for (let k = g.start; k < g.start + g.count; k++) onBody[index.getX(k)] = 1;
  }
  const pelvis = J("Bip01_Pelvis"), spine2 = J("Bip01_Spine2"), neck = J("Bip01_Neck");
  const cx = pelvis.x, cz = (pelvis.z + spine2.z) / 2;
  const arms = ["L", "R"].map((s) => {
    const ua = J(`Bip01_${s}_UpperArm`), ha = J(`Bip01_${s}_Hand`);
    const dir = ha.clone().sub(ua);
    const len = dir.length();
    dir.normalize();
    const side = new Vector3(0, 1, 0).cross(dir);
    if (side.lengthSq() < 1e-3) side.set(0, 0, 1);
    side.normalize();
    return { s, ua, dir, len, side, up: dir.clone().cross(side).normalize() };
  });
  // local average brightness of the original cloth (a 64² copy of the atlas, in linear light)
  const L = 64;
  const cv = document.createElement("canvas");
  cv.width = cv.height = L;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bodyMat.map.image as CanvasImageSource, 0, 0, L, L);
  const px = ctx.getImageData(0, 0, L, L).data;
  const lin = (v: number) => Math.pow(v / 255, 2.2);
  const lumAt = (u: number, v: number) => {
    const x = Math.min(L - 1, Math.max(0, Math.floor((u - Math.floor(u)) * L)));
    const y = Math.min(L - 1, Math.max(0, Math.floor((1 - (v - Math.floor(v))) * L)));
    const k = (y * L + x) * 4;
    return 0.2126 * lin(px[k]) + 0.7152 * lin(px[k + 1]) + 0.0722 * lin(px[k + 2]);
  };
  const gClass = new Float32Array(n), gA = new Float32Array(n * 4), gKind = new Float32Array(n), gLum = new Float32Array(n), gLen = new Float32Array(n);
  const bv = new Vector3(), r = new Vector3();
  for (let i = 0; i < n; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) {
      const w = SW.getComponent(i, k);
      if (w > bw) (bw = w), (best = SI.getComponent(i, k));
    }
    const bn = names[best] || "";
    const cls = !onBody[i] || /Hand|Finger|Head/.test(bn) ? 0 : /Foot|Toe/.test(bn) ? 3 : /Thigh|Calf/.test(bn) ? 2 : 1;
    gClass[i] = cls;
    gLum[i] = Math.max(0.01, lumAt(UV.getX(i), UV.getY(i)));
    bv.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(a.bindMatrix);
    const isArm = /UpperArm|Forearm/.test(bn);
    if (isArm) {
      const arm = arms[bn.includes("_L_") ? 0 : 1];
      const t = r.copy(bv).sub(arm.ua).dot(arm.dir);
      r.copy(bv).sub(arm.ua).addScaledVector(arm.dir, -t);
      gA.set([r.dot(arm.side), t, r.dot(arm.up), t], i * 4);
      gKind[i] = 1;
      gLen[i] = arm.len;
    } else {
      gA.set([bv.x - cx, bv.y, bv.z - cz, -1], i * 4);
      gKind[i] = 0;
    }
  }
  geo.setAttribute("gClass", new Float32BufferAttribute(gClass, 1));
  geo.setAttribute("gA", new Float32BufferAttribute(gA, 4));
  geo.setAttribute("gKind", new Float32BufferAttribute(gKind, 1));
  geo.setAttribute("gLum", new Float32BufferAttribute(gLum, 1));
  geo.setAttribute("gLen", new Float32BufferAttribute(gLen, 1));
  mesh.geometry = geo;

  const rep = { termeh: 0.45, suzani: 0.3, ikat: 0.4, wool: 0.62, roundel: 0.56 }[c.fabric.kind];
  const uniforms = {
    uFabric: { value: fabricTexture(c.fabric) },
    uRep: { value: rep },
    uTrimC: { value: new Color(c.trim).convertSRGBToLinear() },
    uTirazC: { value: new Color(c.tiraz || c.trim).convertSRGBToLinear() },
    uTrouser: { value: new Color(c.trousers || "#2a2320").convertSRGBToLinear() },
    uShoe: { value: new Color("#3b2416").convertSRGBToLinear() },
    uNeckY: { value: neck.y },
  };
  const m = bodyMat.clone();
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float gClass;\nattribute vec4 gA;\nattribute float gKind;\nattribute float gLum;\nattribute float gLen;\nvarying float vGClass;\nvarying vec4 vGA;\nvarying float vGKind;\nvarying float vGLum;\nvarying float vGLen;",
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGClass = gClass;\nvGA = gA;\nvGKind = gKind;\nvGLum = gLum;\nvGLen = gLen;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2D uFabric;\nuniform float uRep;\nuniform vec3 uTrimC;\nuniform vec3 uTirazC;\nuniform vec3 uTrouser;\nuniform vec3 uShoe;\nuniform float uNeckY;\nvarying float vGClass;\nvarying vec4 vGA;\nvarying float vGKind;\nvarying float vGLum;\nvarying float vGLen;",
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        #ifdef USE_MAP
        if (vGClass > 0.5) {
          // the original cloth's folds and seams survive as relative brightness
          float lum = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          float shade = pow(clamp(lum / max(vGLum, 0.01), 0.45, 1.7), 0.6);
          vec3 cloth;
          if (vGClass > 2.5) cloth = uShoe; // soft leather shoes
          else if (vGClass > 1.5) cloth = uTrouser; // plain wool trousers
          else {
            bool armK = vGKind > 0.5;
            // silk projected round the torso / round the arm, in 9 cm units like the skirt
            vec2 fuv = armK ? vec2(atan(vGA.z, vGA.x) * 5.0, vGA.y) / 9.0 : vec2(atan(vGA.x, vGA.z) * 15.0, vGA.y) / 9.0;
            cloth = texture2D(uFabric, fuv * uRep).rgb;
            float trim = 0.0, tiraz = 0.0;
            if (armK) {
              trim = step(vGLen - 5.0, vGA.w);                           // cuffs
              tiraz = step(9.5, vGA.w) * (1.0 - step(13.5, vGA.w));      // tiraz band
            } else {
              trim = step(uNeckY - 2.5, vGA.y);                          // collar
              trim = max(trim, (1.0 - step(1.1, abs(vGA.x))) * step(0.0, vGA.z) * step(uNeckY - 60.0, vGA.y)); // placket
            }
            cloth = mix(cloth, uTirazC, tiraz);
            cloth = mix(cloth, uTrimC, trim);
          }
          diffuseColor.rgb = cloth * shade;
        }
        #endif`,
      );
  };
  m.customProgramCacheKey = () => "fm-redress";
  mesh.material = mats.map((x) => (x === bodyMat ? m : x)) as any;
}

export interface CostumeHandle {
  mesh: SkinnedMesh;
  /** call once per frame after the pose is final */
  update(): void;
}

export function costumeMesh(a: AvatarAsset, c: Costume, like: SkinnedMesh, shadows: boolean, bones: Map<string, Object3D>): CostumeHandle {
  const geo = buildCostume(a, c);
  const radii: number[] = geo.userData.capsuleRadii;
  const uniforms = {
    uCapA: { value: CAPSULES.map(() => new Vector3()) },
    uCapB: { value: CAPSULES.map(() => new Vector3()) },
    uCapR: { value: radii.slice() },
  };
  const weave = weaveNormal();
  let map: CanvasTexture | null = null;
  if (c.fabric) {
    map = fabricTexture(c.fabric).clone();
    // true-to-life motif sizes on the 9 cm UV grid: termeh boteh ≈ 4 cm in rows, suzani rosettes
    // ≈ 9 cm, ikat bands ≈ 5 cm wide
    const rep = { termeh: 0.45, suzani: 0.3, ikat: 0.4, wool: 0.62, roundel: 0.56 }[c.fabric.kind];
    map.repeat.set(rep, rep);
    map.needsUpdate = true;
  }
  const cloth = new MeshPhysicalMaterial({
    vertexColors: true,
    map,
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.6,
    sheen: c.fitted ? 0.12 : c.fabric?.kind === "termeh" || c.fabric?.kind === "roundel" ? 0.6 : 0.3,
    sheenRoughness: 0.55,
    sheenColor: new Color(c.fabric?.kind === "termeh" || c.fabric?.kind === "roundel" ? "#ffe2a0" : "#fff4e0"),
    normalMap: weave,
    normalScale: new Vector2(0.16, 0.16),
    side: DoubleSide,
  });
  withCapsules(cloth, uniforms);
  // felt and fur: matte, with only a faint sheen so dark fur stays dark
  const felt = new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, sheen: 0.18, sheenRoughness: 0.85, sheenColor: new Color("#e8dccb"), normalMap: weave, normalScale: new Vector2(0.12, 0.12) });
  const m = new SkinnedMesh(geo, [cloth, felt]);
  m.position.copy(like.position);
  m.quaternion.copy(like.quaternion);
  m.scale.copy(like.scale);
  like.parent!.add(m);
  m.updateMatrixWorld(true);
  m.bind(like.skeleton, a.bindMatrix);
  m.boundingSphere = a.sphere.clone();
  m.castShadow = shadows;
  m.receiveShadow = true;
  const ends = CAPSULES.map(([b1, b2]) => [bones.get(b1), bones.get(b2)] as const);
  const inv = new Matrix4();
  const w = new Vector3();
  return {
    mesh: m,
    update() {
      m.updateWorldMatrix(true, false);
      inv.copy(m.matrixWorld).invert();
      ends.forEach(([b1, b2], i) => {
        if (!b1 || !b2) {
          uniforms.uCapR.value[i] = 0;
          return;
        }
        b1.getWorldPosition(w);
        uniforms.uCapA.value[i].copy(w).applyMatrix4(inv);
        b2.getWorldPosition(w);
        uniforms.uCapB.value[i].copy(w).applyMatrix4(inv);
      });

    },
  };
}
