/*
 * Fresh Market 3D — photo-scanned produce and bazaar props.
 *
 * Real photogrammetry scans from Poly Haven (CC0), simplified offline into two levels of detail
 * (≈480 triangles for the piles in the crates, ≈3000 for the close-up turntable) with their scanned
 * colour, normal and roughness maps. Products whose kind has a scan use it; everything else keeps its
 * procedural model, so the market still works for any shop.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  Material,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
} from "three";
import { fetchPack, Pack } from "../people/pack";

const URLS = import.meta.glob("../../assets/scans/*.{bin,jpg}", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const byName: Record<string, string> = {};
for (const [k, v] of Object.entries(URLS)) byName[k.split("/").pop()!] = v;

/** produce kind:variant → scan id ("*" matches any variant of the kind) */
export const PRODUCE_SCANS: Record<string, string> = {
  "apple:red": "food_apple_01",
  "avocado:*": "food_avocado_01",
  "potato:ginger": "food_ginger_01",
  "kiwi:*": "food_kiwi_01",
  "citrus:lime": "food_lime_01",
  "citrus:lemon": "lemon",
  "pomegranate:*": "food_pomegranate_01",
  "potato:sweet": "sweet_potato",
  "onion:yellow": "yellow_onion",
};

export const PROP_SCANS = ["brass_pot_01", "brass_pot_02", "wicker_basket_01", "planter_pot_clay", "brass_vase_01"] as const;
export type PropId = (typeof PROP_SCANS)[number];

export interface Scan {
  id: string;
  lods: BufferGeometry[];
  material: MeshStandardMaterial;
  size: Vector3;
}

const scans = new Map<string, Scan>();
const textures: Texture[] = [];
let loading: Promise<void> | null = null;

function decode(p: Pack, li: number): BufferGeometry {
  const L = p.header.lods[li];
  const pos = p.get<Uint16Array>(`p${li}`), nor = p.get<Int8Array>(`n${li}`), uvq = p.get<Uint16Array>(`u${li}`);
  const n = L.vertices;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      P[i * 3 + k] = L.pmin[k] + (pos[i * 3 + k] / 65535) * (L.pmax[k] - L.pmin[k]);
      N[i * 3 + k] = nor[i * 3 + k] / 127;
    }
    for (let k = 0; k < 2; k++) UV[i * 2 + k] = L.umin[k] + (uvq[i * 2 + k] / 65535) * (L.umax[k] - L.umin[k]);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(P, 3));
  g.setAttribute("normal", new Float32BufferAttribute(N, 3));
  g.setAttribute("uv", new Float32BufferAttribute(UV, 2));
  const idx = p.get<Uint16Array | Uint32Array>(`i${li}`);
  g.setIndex(new BufferAttribute(idx instanceof Uint32Array ? new Uint32Array(idx) : new Uint16Array(idx), 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

async function loadOne(id: string, loader: TextureLoader) {
  const u = (f: string) => byName[f];
  if (!u(`${id}.bin`)) return;
  const tex = async (f: string, color: boolean) => {
    const t = await loader.loadAsync(u(f));
    t.flipY = false; // glTF UV convention (origin top-left)
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = 8;
    if (color) t.colorSpace = SRGBColorSpace;
    textures.push(t);
    return t;
  };
  const [pack, map, normalMap, mr] = await Promise.all([fetchPack(u(`${id}.bin`)), tex(`${id}-diff.jpg`, true), tex(`${id}-nor.jpg`, false), tex(`${id}-mr.jpg`, false)]);
  const metal = !!pack.header.metal;
  const material = new MeshStandardMaterial({
    name: `scan-${id}`,
    map,
    normalMap,
    roughnessMap: mr,
    aoMap: mr,
    metalnessMap: metal ? mr : null,
    metalness: metal ? 1 : 0,
    roughness: 1,
  });
  const lods = pack.header.lods.map((_: any, i: number) => decode(pack, i));
  scans.set(id, { id, lods, material, size: new Vector3().fromArray(pack.header.size) });
}

/** Load every scan once (shared by every market instance). Failures just leave the procedural models. */
export function loadScans(): Promise<void> {
  if (loading) return loading;
  const loader = new TextureLoader();
  const ids = [...new Set(Object.values(PRODUCE_SCANS)), ...PROP_SCANS];
  loading = Promise.all(ids.map((id) => loadOne(id, loader).catch((e) => console.warn("Fresh Market 3D: scan failed", id, e)))).then(() => undefined);
  return loading;
}

export function scanFor(kind: string, variant: string): Scan | null {
  const id = PRODUCE_SCANS[`${kind}:${variant}`] || PRODUCE_SCANS[`${kind}:*`];
  return (id && scans.get(id)) || null;
}

export function propScan(id: PropId): Scan | null {
  return scans.get(id) || null;
}

/** A scan's geometry for a level of detail, uniformly scaled so its largest side is `maxSide` metres. */
const scaled = new Map<string, BufferGeometry>();
export function scanGeometry(s: Scan, lod: number, maxSide: number): BufferGeometry {
  const li = Math.min(lod, s.lods.length - 1);
  const key = `${s.id}:${li}:${maxSide.toFixed(4)}`;
  let g = scaled.get(key);
  if (!g) {
    const k = maxSide / Math.max(s.size.x, s.size.y, s.size.z);
    g = s.lods[li].clone();
    g.scale(k, k, k);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    scaled.set(key, g);
  }
  return g;
}

export function disposeScans() {
  scaled.forEach((g) => g.dispose());
  scaled.clear();
}

export type { Material };
