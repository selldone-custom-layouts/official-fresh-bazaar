/*
 * Fresh Market 3D — one market stall = one category.
 * Local frame: the stall's front faces +Z, ground at y = 0, centered on x.
 */
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import { merge, surface, transformed } from "../util/geo";
import { awningStripes, burlapSet, drawChalkboard, makeCanvas, toTexture, valanceTexture, woodSet } from "../util/textures";
import { pbr, PBRSet } from "./realism";
import { NOISE } from "../util/noise";
import { CRATE, CrateBuild, TagInfo, buildCrate, drawTag } from "./crate";
import { detectKind, getLabeledModel, getProduceModel, KindRef } from "../produce/catalog";

export interface MarketProduct {
  id: number;
  title: string;
  title_en?: string | null;
  price: string;
  oldPrice?: string | null;
  unit?: string | null;
  soldOut?: boolean;
  /** optional explicit 3D kind (otherwise detected) */
  kind?: KindRef | null;
  /** product photo URL (used on packages for non-produce products) */
  image?: string | null;
  /** small thumbnail URL used when the original is not served */
  thumb?: string | null;
  raw?: any;
}

export interface MarketStallData {
  id: string | number;
  title: string;
  image?: string | null;
  products: MarketProduct[];
  more?: number;
  dir?: "ltr" | "rtl";
}

export interface StallBuild {
  group: Group;
  data: MarketStallData;
  crates: Array<CrateBuild & { product: MarketProduct; slot: number }>;
  signHit: Mesh;
  moreHit: Mesh | null;
  /** camera pose in stall-local space */
  view: { position: Vector3; target: Vector3 };
  signCanvas: HTMLCanvasElement;
  signTexture: CanvasTexture;
  bulbs: Mesh[];
}

export const STALL = { width: 3.5, depth: 1.8 };

export const AWNING_PALETTE: Array<[string, string]> = [
  ["#c0322b", "#f3ebdc"],
  ["#2f7a48", "#f3ebdc"],
  ["#d99a1e", "#fff3d8"],
  ["#2b62a0", "#f2eee4"],
  ["#d6612a", "#fff0dc"],
  ["#6e3a86", "#f5ecf4"],
  ["#1b8580", "#eef5ef"],
  ["#8a5a2a", "#f1e4c8"],
];

const shared: Record<string, any> = {};
let scannedPlanks: PBRSet | null = null;
/** Use photo-scanned weathered planks for the stall stands (call before building stalls). */
export function setStallPlanks(set: PBRSet | null | undefined) {
  scannedPlanks = set || null;
}
function woodMat(key: string, tint: [number, number, number], planks = 4, rep = 1) {
  if (shared[key]) return shared[key];
  if (scannedPlanks && key.startsWith("stall-wood")) {
    const dark = key.endsWith("dark");
    return (shared[key] = pbr(scannedPlanks, [1 / 1.25, 1 / 1.25], { color: new Color(dark ? "#8f8070" : "#e8dccb") }));
  }
  const w = woodSet(tint, key, planks);
  const m = new MeshStandardMaterial({ map: w.map, normalMap: w.normalMap, roughnessMap: w.roughnessMap, roughness: 1 });
  m.normalScale = new Vector2(0.8, 0.8);
  if (rep !== 1) {
    // textures are shared; repetition is baked into UVs instead
  }
  shared[key] = m;
  return m;
}

function uvBox(w: number, h: number, d: number, scale = 1) {
  const g = new BoxGeometry(w, h, d);
  const uv = g.getAttribute("uv");
  const n = g.getAttribute("normal");
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const sx = ax > 0.5 ? d : w;
    const sy = ay > 0.5 ? d : h;
    uv.setXY(i, uv.getX(i) * sx * scale, uv.getY(i) * sy * scale);
  }
  return g;
}

function bulbMaterial() {
  if (!shared.bulb) shared.bulb = new MeshStandardMaterial({ color: "#fff1d0", emissive: new Color("#ffc469"), emissiveIntensity: 3.2, roughness: 0.3 });
  return shared.bulb as MeshStandardMaterial;
}

export function buildStall(data: MarketStallData, index: number, shadows: boolean): StallBuild {
  const group = new Group();
  group.name = `stall-${data.id}`;
  const [c1, c2] = AWNING_PALETTE[index % AWNING_PALETTE.length];
  const wood = woodMat("stall-wood", [140, 96, 60], 4);
  const darkWood = woodMat("stall-wood-dark", [104, 70, 44], 3);
  const W = 3.2;

  // ── Tiered display stand
  const tiers = [
    { y: 0.78, z0: 0.0, z1: 0.68 },
    { y: 1.04, z0: -0.62, z1: 0.06 },
  ];
  const standParts = [];
  for (const t of tiers) {
    const g = uvBox(W, t.y, t.z1 - t.z0, 1.1);
    transformed(g, [0, t.y / 2, (t.z0 + t.z1) / 2]);
    standParts.push(g);
    const lip = uvBox(W + 0.04, 0.04, 0.05, 1.1);
    transformed(lip, [0, t.y + 0.02, t.z1 + 0.005]);
    standParts.push(lip);
  }
  const stand = new Mesh(merge(standParts), wood);
  stand.castShadow = shadows;
  stand.receiveShadow = true;
  group.add(stand);

  // burlap skirt in front of the lower tier
  {
    const b = burlapSet([168, 132, 86]);
    // canvas skirt dyed in the stall's accent colour
    const skirtMat = new MeshStandardMaterial({ map: b.map, normalMap: b.normalMap, roughness: 0.95, side: DoubleSide, color: new Color(c1).lerp(new Color("#ffffff"), 0.25) });
    const g = surface(40, 6, (u, v, out) => {
      const x = (u - 0.5) * (W + 0.06);
      const y = 0.03 + v * 0.72;
      const fold = Math.sin(u * Math.PI * 22) * 0.018 * (1 - v * 0.6);
      out.set(x, y, 0.705 + fold);
    }, false);
    const uv = g.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 1.6);
    const skirt = new Mesh(g, skirtMat);
    skirt.receiveShadow = true;
    skirt.castShadow = shadows;
    group.add(skirt);
  }

  // ── Posts, beams, back wall
  const postParts = [];
  const FX = 1.66;
  const fz = 0.86;
  const bz = -0.8;
  const fH = 2.32;
  const bH = 2.66;
  for (const sx of [-1, 1]) {
    postParts.push(transformed(uvBox(0.08, fH, 0.08, 1.4), [sx * FX, fH / 2, fz]));
    postParts.push(transformed(uvBox(0.08, bH, 0.08, 1.4), [sx * FX, bH / 2, bz]));
    // side rail
    const len = Math.hypot(fz - bz, bH - fH);
    const rail = uvBox(0.06, 0.06, len, 1.4);
    rail.rotateX(Math.atan2(bH - fH, fz - bz));
    postParts.push(transformed(rail, [sx * FX, (fH + bH) / 2 - 0.02, (fz + bz) / 2]));
  }
  postParts.push(transformed(uvBox(FX * 2 + 0.1, 0.09, 0.09, 1.4), [0, fH - 0.03, fz]));
  postParts.push(transformed(uvBox(FX * 2 + 0.1, 0.09, 0.09, 1.4), [0, bH - 0.03, bz]));
  const posts = new Mesh(merge(postParts), darkWood);
  posts.castShadow = shadows;
  posts.receiveShadow = true;
  group.add(posts);

  const back = new Mesh(transformed(uvBox(FX * 2, 2.1, 0.05, 1.0), [0, 1.05, bz - 0.02]), wood);
  back.castShadow = shadows;
  back.receiveShadow = true;
  group.add(back);

  // ── Awning (sagging striped canvas) + scalloped valance
  const stripes = awningStripes(c1, c2, 10);
  const awnMat = new MeshStandardMaterial({ map: stripes.map, normalMap: stripes.normalMap, roughness: 0.82, side: DoubleSide });
  const AW = FX * 2 + 0.24;
  const awn = surface(28, 10, (u, v, out) => {
    const x = (u - 0.5) * AW;
    const z = fz + 0.12 + (bz - 0.08 - fz - 0.12) * v;
    const yEdge = fH + 0.02 + (bH + 0.02 - fH - 0.02) * v;
    const sag = Math.sin(u * Math.PI) * 0.06 * Math.sin(v * Math.PI) + Math.sin(u * Math.PI * 2) ** 2 * 0.015;
    out.set(x, yEdge + 0.05 - sag, z);
  }, false);
  const awning = new Mesh(awn, awnMat);
  awning.castShadow = shadows;
  awning.receiveShadow = true;
  group.add(awning);

  const valMat = new MeshStandardMaterial({ map: valanceTexture(c1, c2, 10), roughness: 0.85, side: DoubleSide, alphaTest: 0.5 });
  const val = surface(28, 2, (u, v, out) => {
    const x = (u - 0.5) * AW;
    out.set(x, fH + 0.07 - (1 - v) * 0.3, fz + 0.12 + Math.sin(u * Math.PI * 20) * 0.006);
  }, false);
  const valance = new Mesh(val, valMat);
  valance.castShadow = shadows;
  group.add(valance);

  // ── Bulbs along the valance
  const bulbs: Mesh[] = [];
  const bulbGeo = (shared.bulbGeo ||= new SphereGeometry(0.035, 12, 8));
  const wireMat = (shared.wire ||= new MeshStandardMaterial({ color: "#2a2420", roughness: 0.6 }));
  for (let i = 0; i < 7; i++) {
    const x = (i / 6 - 0.5) * (AW - 0.5);
    const b = new Mesh(bulbGeo, bulbMaterial());
    b.position.set(x, fH - 0.3, fz + 0.16);
    group.add(b);
    bulbs.push(b);
    const wire = new Mesh((shared.wireGeo ||= new CylinderGeometry(0.004, 0.004, 0.14, 4)), wireMat);
    wire.position.set(x, fH - 0.21, fz + 0.16);
    group.add(wire);
  }

  // ── Sign board above the awning front
  const signCanvas = makeCanvas(1024, 300);
  drawSign(signCanvas, data, null);
  const signTexture = toTexture(signCanvas, true, false, 8);
  const sign = new Mesh(new PlaneGeometry(1.7, 1.7 * (300 / 1024)), new MeshStandardMaterial({ map: signTexture, roughness: 0.8 }));
  sign.position.set(0, fH + 0.36, fz + 0.1);
  sign.rotation.x = -0.08;
  sign.castShadow = shadows;
  group.add(sign);
  const signBack = new Mesh(transformed(uvBox(1.76, 0.56, 0.05), [0, fH + 0.36, fz + 0.065]), darkWood);
  signBack.rotation.x = -0.08;
  signBack.castShadow = shadows;
  group.add(signBack);
  const signHit = new Mesh(new BoxGeometry(1.8, 0.62, 0.2), new MeshBasicMaterial({ visible: false }));
  signHit.position.copy(sign.position);
  group.add(signHit);

  if (data.image) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        drawSign(signCanvas, data, img);
        signTexture.needsUpdate = true;
      } catch (e) {
        drawSign(signCanvas, data, null);
        signTexture.needsUpdate = true;
      }
    };
    img.src = data.image;
  }

  // ── Crates
  const crates: StallBuild["crates"] = [];
  const xs = [-1.17, -0.39, 0.39, 1.17];
  const tilt = 0.22;
  const products = data.products;
  const n = Math.min(8, Math.max(products.length, 1));
  const slots = products.length ? 8 : 0;
  for (let s = 0; s < slots; s++) {
    const p = products[s % products.length];
    const tier = s < 4 ? tiers[0] : tiers[1];
    const xi = s % 4;
    const ref = p.kind || detectKind(p.raw || p, data.title);
    const model = ref.kind === "bag" && p.image ? getLabeledModel(p.image, p.thumb) : getProduceModel(ref, "pile");
    const info: TagInfo = { title: p.title, price: p.price, oldPrice: p.oldPrice, unit: p.unit, soldOut: p.soldOut, dir: data.dir };
    const c = buildCrate(model, info, (Number(p.id) || s) * 31 + s * 7 + index * 101, shadows);
    const pivot = new Group();
    pivot.position.set(xs[xi] + (s >= 4 ? 0.0 : 0), tier.y, tier.z1 - 0.04);
    c.group.position.set(0, 0, -CRATE.D / 2);
    pivot.rotation.x = tilt;
    pivot.add(c.group);
    // wedge under the lifted back edge
    const wh = Math.sin(tilt) * CRATE.D;
    const wedge = new Mesh(transformed(uvBox(CRATE.W * 0.9, wh, 0.06), [xs[xi], tier.y + wh / 2, tier.z1 - 0.04 - CRATE.D * Math.cos(tilt) + 0.04]), darkWood);
    wedge.castShadow = shadows;
    group.add(wedge);
    group.add(pivot);
    c.hit.userData = { type: "product", productId: p.id, stallIndex: index, slot: s };
    crates.push({ ...c, product: p, slot: s });
  }
  void n;

  // ── "+N more" hanging card
  let moreHit: Mesh | null = null;
  if (data.more && data.more > 0) {
    const cv = makeCanvas(384, 224);
    drawChalkboard(cv, [{ text: `+${data.more}`, size: 80, color: "#ffe08a" }, { text: "more ›", size: 46 }], { dir: data.dir });
    const m = new Mesh(new PlaneGeometry(0.34, 0.2), new MeshStandardMaterial({ map: toTexture(cv, true, false), roughness: 0.8 }));
    m.position.set(FX - 0.05, 1.55, fz + 0.06);
    m.castShadow = shadows;
    group.add(m);
    moreHit = new Mesh(new BoxGeometry(0.4, 0.26, 0.1), new MeshBasicMaterial({ visible: false }));
    moreHit.position.copy(m.position);
    moreHit.userData = { type: "more", stallIndex: index };
    group.add(moreHit);
  }

  // ── Decorative burlap sacks
  {
    const b = burlapSet([160, 124, 80]);
    const sackMat = (shared.sack ||= new MeshStandardMaterial({ map: b.map, normalMap: b.normalMap, roughness: 0.95 }));
    const sackGeo = (shared.sackGeo ||= (() => {
      const g = new IcosahedronGeometry(0.5, 4);
      const pos = g.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const t = (y + 0.5);
        const squash = y < -0.2 ? 0.75 : 1;
        const neck = y > 0.25 ? 1 - (y - 0.25) * 1.6 : 1;
        x *= neck * (1 + NOISE.noise(x * 4, y * 4, z * 4) * 0.08);
        z *= neck * (1 + NOISE.noise(z * 4, x * 4, y * 4) * 0.08);
        y = (y < -0.2 ? -0.2 + (y + 0.2) * 0.3 : y) * squash;
        pos.setXYZ(i, x, y + 0.26, z);
        void t;
      }
      g.computeVertexNormals();
      g.scale(0.42, 0.62, 0.36);
      return g;
    })());
    const side = index % 2 ? 1 : -1;
    const sack = new Mesh(sackGeo, sackMat);
    sack.position.set(side * (FX + 0.32), 0, 0.55);
    sack.rotation.y = index * 1.3;
    sack.castShadow = shadows;
    sack.receiveShadow = true;
    group.add(sack);
  }

  signHit.userData = { type: "stall", stallIndex: index };

  return {
    group,
    data,
    crates,
    signHit,
    moreHit,
    view: { position: new Vector3(0, 1.62, 3.15), target: new Vector3(0, 1.0, 0.15) },
    signCanvas,
    signTexture,
    bulbs,
  };
}

export function drawSign(canvas: HTMLCanvasElement, data: MarketStallData, img: HTMLImageElement | null) {
  drawChalkboard(
    canvas,
    [{ text: data.title, size: 120, weight: "800" }],
    { frame: "#6a4426", board: "#1d2a22", image: img, dir: data.dir },
  );
}

export function updateCrateTag(c: CrateBuild & { product: MarketProduct }, p: MarketProduct, dir?: "ltr" | "rtl") {
  drawTag(c.tag.canvas, { title: p.title, price: p.price, oldPrice: p.oldPrice, unit: p.unit, soldOut: p.soldOut, dir });
  c.tag.texture.needsUpdate = true;
}
