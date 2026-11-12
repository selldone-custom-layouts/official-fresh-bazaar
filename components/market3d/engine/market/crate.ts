/*
 * Fresh Market 3D — display crates, punnets, produce piles and price tags.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector2,
  Vector3,
  Euler,
  DoubleSide,
  Box3,
} from "three";
import { merge, transformed } from "../util/geo";
import { burlapSet, drawChalkboard, makeCanvas, toTexture, woodSet } from "../util/textures";
import { NOISE, Rng } from "../util/noise";
import type { ProduceModel } from "../produce/parts";

export const CRATE = { W: 0.6, D: 0.42, H: 0.16, wall: 0.018 };

let crateGeo: BufferGeometry | null = null;
let crateMat: MeshStandardMaterial | null = null;
let linerGeo: BufferGeometry | null = null;
let linerMat: MeshStandardMaterial | null = null;
let punnetGeo: BufferGeometry | null = null;
let punnetMat: MeshStandardMaterial | null = null;

function crateGeometry(): BufferGeometry {
  if (crateGeo) return crateGeo;
  const { W, D, H, wall } = CRATE;
  const parts: BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, uvScale = 1) => {
    const g = new BoxGeometry(w, h, d);
    const uv = g.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 2.2 * uvScale + x * 1.7, uv.getY(i) * h * 2.2 * uvScale + y * 3.1 + z);
    return transformed(g, [x, y, z]);
  };
  // floor boards
  for (let i = 0; i < 3; i++) parts.push(box(W, 0.014, D / 3 - 0.006, 0, 0.007, -D / 3 + (i * D) / 3));
  // side slats (two per side with a gap)
  for (const [y, h] of [[0.045, 0.06], [0.125, 0.05]] as const) {
    parts.push(box(W, h, wall, 0, y, D / 2 - wall / 2));
    parts.push(box(W, h, wall, 0, y, -D / 2 + wall / 2));
    parts.push(box(wall, h, D - wall * 2, W / 2 - wall / 2, y, 0));
    parts.push(box(wall, h, D - wall * 2, -W / 2 + wall / 2, y, 0));
  }
  // corner posts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.032, H, 0.032, sx * (W / 2 - 0.016), H / 2, sz * (D / 2 - 0.016)));
  crateGeo = merge(parts);
  return crateGeo;
}

function crateMaterial(): MeshStandardMaterial {
  if (crateMat) return crateMat;
  const w = woodSet([168, 122, 78], "crate", 3);
  crateMat = new MeshStandardMaterial({ map: w.map, normalMap: w.normalMap, roughnessMap: w.roughnessMap, roughness: 1 });
  crateMat.normalScale = new Vector2(0.7, 0.7);
  return crateMat;
}

function linerParts(): { g: BufferGeometry; m: MeshStandardMaterial } {
  if (!linerGeo) {
    const { W, D, wall } = CRATE;
    const g = new PlaneGeometry(W - wall * 2, D - wall * 2, 12, 8);
    g.rotateX(-Math.PI / 2);
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const edge = Math.max(Math.abs(x) / (W / 2), Math.abs(z) / (D / 2));
      pos.setY(i, 0.016 + Math.pow(edge, 6) * 0.05 + NOISE.noise(x * 12, z * 12, 3) * 0.004);
    }
    g.computeVertexNormals();
    const uv = g.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 1.4);
    linerGeo = g;
    const b = burlapSet();
    linerMat = new MeshStandardMaterial({ map: b.map, normalMap: b.normalMap, roughness: 0.95, side: DoubleSide });
  }
  return { g: linerGeo!, m: linerMat! };
}

function punnetParts(w: number, d: number, h: number): { g: BufferGeometry; m: MeshStandardMaterial } {
  if (!punnetGeo) {
    const t = 0.004;
    const parts: BufferGeometry[] = [];
    const b = (ww: number, hh: number, dd: number, x: number, y: number, z: number) => transformed(new BoxGeometry(ww, hh, dd), [x, y, z]);
    parts.push(b(w, t, d, 0, t / 2, 0));
    parts.push(b(w, h, t, 0, h / 2, d / 2 - t / 2));
    parts.push(b(w, h, t, 0, h / 2, -d / 2 + t / 2));
    parts.push(b(t, h, d, w / 2 - t / 2, h / 2, 0));
    parts.push(b(t, h, d, -w / 2 + t / 2, h / 2, 0));
    punnetGeo = merge(parts);
    const ws = woodSet([214, 186, 140], "veneer", 6);
    punnetMat = new MeshStandardMaterial({ map: ws.map, normalMap: ws.normalMap, roughness: 0.8 });
  }
  return { g: punnetGeo!, m: punnetMat! };
}

// ───────────────────────────── Pile layout ─────────────────────────────

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3();
const _p = new Vector3();

function hexLayer(w: number, d: number, r: number, y: number, rng: Rng, shrink = 0): Vector3[] {
  const out: Vector3[] = [];
  const s = r * 2 * 0.98;
  const rowH = s * 0.866;
  const W = w - shrink * 2;
  const D = d - shrink * 2;
  if (W < r * 1.6 || D < r * 1.6) return out;
  const rows = Math.max(1, Math.floor((D - r * 2) / rowH) + 1);
  const z0 = -((rows - 1) * rowH) / 2;
  for (let j = 0; j < rows; j++) {
    const off = j % 2 ? s / 2 : 0;
    const n = Math.max(1, Math.floor((W - r * 2 - off) / s) + 1);
    const x0 = -((n - 1) * s) / 2 + off / 2;
    for (let i = 0; i < n; i++) {
      out.push(new Vector3(x0 + i * s + rng.range(-0.08, 0.08) * r, y, z0 + j * rowH + rng.range(-0.08, 0.08) * r));
    }
  }
  return out;
}

/** Instance matrices for a pile of `model` inside a w×d tray whose floor is at y = floorY. */
export function pileMatrices(model: ProduceModel, w: number, d: number, floorY: number, rng: Rng, maxCount = 90): Matrix4[] {
  const mats: Matrix4[] = [];
  const sz = model.size;
  const push = (p: Vector3, rot: [number, number, number], scale: number) => {
    _e.set(rot[0], rot[1], rot[2]);
    _q.setFromEuler(_e);
    _s.setScalar(scale);
    mats.push(new Matrix4().compose(p, _q, _s));
  };
  switch (model.rest) {
    case "round":
    case "small": {
      const r = Math.max(sz.x, sz.z) / 2;
      const h = sz.y;
      let layer = hexLayer(w, d, r, floorY, rng);
      let li = 0;
      while (layer.length && mats.length < maxCount && li < 4) {
        for (const p of layer) {
          if (mats.length >= maxCount) break;
          const tilt = model.rest === "small" ? 1.2 : 0.35;
          const sink = li === 0 ? 0 : -h * 0.08;
          push(new Vector3(p.x, p.y + sink, p.z), [rng.range(-tilt, tilt), rng.range(0, Math.PI * 2), rng.range(-tilt, tilt)], rng.range(0.92, 1.08));
        }
        li++;
        // next layer sits in the hollows, shrinking towards a heap
        layer = hexLayer(w, d, r, floorY + li * h * 0.68, rng, li * r * 1.05);
      }
      break;
    }
    case "long":
    case "bunch": {
      let l = sz.x;
      let wd = sz.z;
      let scale = 1;
      if (l > w * 1.02) {
        scale = (w * 0.98) / l;
        l *= scale;
        wd *= scale;
      }
      const spacing = model.rest === "bunch" ? 0.78 : 1.04;
      const rows = Math.max(1, Math.floor(d / (wd * spacing)));
      const per = Math.max(1, Math.floor(w / (l * 1.02)));
      for (let layer = 0; layer < 2; layer++) {
        const lr = layer === 0 ? rows : Math.max(1, rows - 1);
        const z0 = -((lr - 1) * wd * spacing) / 2;
        for (let j = 0; j < lr; j++) {
          for (let i = 0; i < per; i++) {
            if (mats.length >= maxCount) break;
            const x = -((per - 1) * l * 1.02) / 2 + i * l * 1.02;
            const yaw = model.rest === "bunch" ? rng.range(-0.18, 0.18) : rng.range(-0.06, 0.06);
            const flip = rng.next() < 0.5 ? Math.PI : 0;
            push(
              new Vector3(x + rng.range(-0.01, 0.01), floorY + layer * sz.y * scale * 0.72, z0 + j * wd * spacing + (layer ? 0 : 0)),
              [rng.range(-0.08, 0.08), yaw + flip, rng.range(-0.04, 0.04)],
              scale * rng.range(0.95, 1.05),
            );
          }
        }
        if (layer === 0 && rows < 2 && model.rest !== "bunch") break;
      }
      break;
    }
    case "package": {
      // packaged goods stand in neat rows with their label facing the shopper (+z)
      const nx = Math.max(1, Math.floor(w / (sz.x * 1.12)));
      const nz = Math.max(1, Math.floor(d / (sz.z * 1.7)));
      const sx = w / nx;
      const szz = d / nz;
      for (let j = 0; j < nz; j++)
        for (let i = 0; i < nx; i++)
          push(
            new Vector3(-w / 2 + sx * (i + 0.5), floorY, -d / 2 + szz * (j + 0.5)),
            [rng.range(-0.04, 0.04) - 0.06, rng.range(-0.12, 0.12), rng.range(-0.03, 0.03)],
            1,
          );
      break;
    }
    case "single":
    default: {
      // try both orientations, keep the denser one
      const fit = (ax: number, az: number) => [Math.max(1, Math.floor(w / (ax * 1.02))), Math.max(1, Math.floor(d / (az * 1.02)))];
      const a = fit(sz.x, sz.z);
      const b = fit(sz.z, sz.x);
      const useB = b[0] * b[1] > a[0] * a[1];
      const [nx, nz] = useB ? b : a;
      const ax = useB ? sz.z : sz.x;
      const az = useB ? sz.x : sz.z;
      const over = Math.max(ax / w, az / d, 0);
      const scale = over > 1 ? 1 / over : 1;
      const sx = Math.min(ax * scale * 1.02, w / nx);
      const sz2 = Math.min(az * scale * 1.02, d / nz);
      for (let j = 0; j < nz; j++)
        for (let i = 0; i < nx; i++) {
          push(
            new Vector3(-((nx - 1) * sx) / 2 + i * sx, floorY, -((nz - 1) * sz2) / 2 + j * sz2),
            [rng.range(-0.05, 0.05), (useB ? Math.PI / 2 : 0) + rng.range(-0.25, 0.25) + (rng.next() < 0.5 ? Math.PI : 0), rng.range(-0.05, 0.05)],
            scale * rng.range(0.94, 1.04),
          );
        }
      if (nx * nz >= 2 && sz.y < 0.25) {
        push(new Vector3(0, floorY + sz.y * scale * 0.55, 0), [rng.range(-0.2, 0.2), rng.range(0, Math.PI * 2), rng.range(-0.2, 0.2)], scale);
      }
    }
  }
  return mats;
}

function instancesFor(model: ProduceModel, matrices: Matrix4[], parent: Object3D, shadows: boolean) {
  for (const part of model.parts) {
    const im = new InstancedMesh(part.geometry, part.material, matrices.length);
    matrices.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = shadows;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    parent.add(im);
  }
}

// ───────────────────────────── Price tag ─────────────────────────────

export interface TagInfo {
  title: string;
  price: string;
  oldPrice?: string | null;
  unit?: string | null;
  soldOut?: boolean;
  dir?: "ltr" | "rtl";
}

export function drawTag(canvas: HTMLCanvasElement, info: TagInfo) {
  const lines: any[] = [{ text: info.title, size: 46, weight: "700" }];
  if (info.soldOut) lines.push({ text: "✕ Sold out", size: 48, color: "#ff9a8a" });
  else lines.push({ text: info.price + (info.unit ? ` / ${info.unit}` : ""), size: 54, color: "#ffe08a" });
  if (info.oldPrice && !info.soldOut) lines.push({ text: info.oldPrice, size: 30, color: "rgba(255,255,255,0.55)" });
  drawChalkboard(canvas, lines, { frame: "#8a5a32", board: "#1f2b24", dir: info.dir });
  if (info.oldPrice && !info.soldOut) {
    // strike-through the old price
    const ctx = canvas.getContext("2d")!;
    const total = lines.reduce((a: number, l: any) => a + l.size * 1.18, 0);
    const y = canvas.height / 2 - total / 2 + (lines[0].size + lines[1].size) * 1.18 + 16;
    ctx.strokeStyle = "rgba(255,140,120,0.9)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.36, y);
    ctx.lineTo(canvas.width * 0.64, y);
    ctx.stroke();
  }
}

export function makeTagMesh(info: TagInfo): { mesh: Mesh; canvas: HTMLCanvasElement; texture: CanvasTexture } {
  const canvas = makeCanvas(384, 224);
  drawTag(canvas, info);
  const texture = toTexture(canvas, true, false, 8);
  const mat = new MeshStandardMaterial({ map: texture, roughness: 0.85, metalness: 0 });
  const g = new PlaneGeometry(0.2, 0.2 * (224 / 384));
  const mesh = new Mesh(g, mat);
  mesh.castShadow = true;
  return { mesh, canvas, texture };
}

// ───────────────────────────── Crate with produce ─────────────────────────────

export interface CrateBuild {
  group: Group;
  pile: Group;
  hit: Mesh;
  tag: { mesh: Mesh; canvas: HTMLCanvasElement; texture: CanvasTexture };
  /** world-space anchor to look at the produce */
  focus: Vector3;
}

const hitMat = new MeshBasicMaterial({ visible: false });

export function buildCrate(model: ProduceModel, info: TagInfo, seed: number, shadows: boolean): CrateBuild {
  const rng = new Rng(seed + 7);
  const group = new Group();
  const crate = new Mesh(crateGeometry(), crateMaterial());
  crate.castShadow = shadows;
  crate.receiveShadow = true;
  group.add(crate);
  const { W, D, wall } = CRATE;
  const iw = W - wall * 2 - 0.01;
  const id = D - wall * 2 - 0.01;
  const pile = new Group();
  group.add(pile);

  if (model.rest === "small") {
    // 3 × 2 chip-wood punnets heaped with small produce
    const pw = iw / 3 - 0.008;
    const pd = id / 2 - 0.008;
    const ph = 0.07;
    const pun = punnetParts(pw, pd, ph);
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 3; i++) {
        const x = -iw / 2 + pw / 2 + 0.004 + i * (pw + 0.008);
        const z = -id / 2 + pd / 2 + 0.004 + j * (pd + 0.008);
        const pm = new Mesh(pun.g, pun.m);
        pm.position.set(x, 0.016, z);
        pm.rotation.y = rng.range(-0.03, 0.03);
        pm.castShadow = shadows;
        pm.receiveShadow = true;
        pile.add(pm);
        const sub = new Group();
        sub.position.set(x, 0.016 + 0.006, z);
        sub.rotation.y = pm.rotation.y;
        const mats = pileMatrices(model, pw - 0.01, pd - 0.01, 0, rng, 26);
        instancesFor(model, mats, sub, shadows);
        pile.add(sub);
      }
  } else {
    const liner = linerParts();
    const lm = new Mesh(liner.g, liner.m);
    lm.receiveShadow = true;
    group.add(lm);
    const mats = pileMatrices(model, iw, id, 0.02, rng, 90);
    instancesFor(model, mats, pile, shadows);
  }

  // price tag clipped to the front slat, tilted up towards the shopper
  const tag = makeTagMesh(info);
  tag.mesh.position.set(W * 0.26, 0.11, D / 2 + 0.012);
  tag.mesh.rotation.set(-0.12, 0, rng.range(-0.04, 0.04));
  group.add(tag.mesh);

  // hit volume (crate + heap)
  const box = new Box3().setFromObject(group);
  const size = new Vector3();
  box.getSize(size);
  const center = new Vector3();
  box.getCenter(center);
  const hit = new Mesh(new BoxGeometry(Math.max(size.x, W), Math.max(size.y, 0.2) + 0.04, Math.max(size.z, D) + 0.04), hitMat);
  hit.position.copy(center);
  group.add(hit);
  return { group, pile, hit, tag, focus: center.clone() };
}
