/*
 * Fresh Market 3D — photographic materials and sky.
 *
 * Photo-scanned PBR texture sets (colour, OpenGL normal, AO/roughness/metal) and an HDR afternoon sky
 * from Poly Haven (CC0 — public domain). Loaded before the bazaar is built; every builder falls back to
 * its procedural textures when a set is missing.
 */
import {
  DataTexture,
  EquirectangularReflectionMapping,
  MeshStandardMaterial,
  MeshStandardMaterialParameters,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
} from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";

const URLS = import.meta.glob("../../assets/env/*.{jpg,hdr}", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const byName: Record<string, string> = {};
for (const [k, v] of Object.entries(URLS)) byName[k.split("/").pop()!] = v;

export type PBRName = "brown_brick_02" | "clay_plaster" | "brick_floor" | "weathered_brown_planks" | "marble_01";

export interface PBRSet {
  name: PBRName;
  images: { diff: HTMLImageElement; nor: HTMLImageElement; arm: HTMLImageElement };
  base: { diff: Texture; nor: Texture; arm: Texture };
}

export interface EnvAssets {
  sets: Partial<Record<PBRName, PBRSet>>;
  hdr: DataTexture | null;
  /** direction of the sun found in the HDR (unrotated), and its elevation in degrees */
  hdrSun: Vector3 | null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function baseTexture(img: HTMLImageElement, color: boolean) {
  const t = new Texture(img);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  if (color) t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Brightest texel of an equirect HDR → world direction (three's equirect convention). */
function findSun(tex: DataTexture): Vector3 | null {
  const { width: W, height: H, data } = tex.image as { width: number; height: number; data: ArrayLike<number> };
  if (!W || !H || !data) return null;
  const stride = data.length / (W * H);
  const half = (data as any) instanceof Uint16Array;
  const f16 = (h: number) => {
    const s = (h & 0x8000) >> 15, e = (h & 0x7c00) >> 10, m = h & 0x03ff;
    if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (m / 1024);
    if (e === 0x1f) return m ? NaN : (s ? -1 : 1) * Infinity;
    return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + m / 1024);
  };
  let best = -1, bi = 0;
  for (let i = 0; i < W * H; i++) {
    const k = i * stride;
    const r = half ? f16(data[k]) : data[k];
    const g = half ? f16(data[k + 1]) : data[k + 1];
    const b = half ? f16(data[k + 2]) : data[k + 2];
    const l = r * 0.2126 + g * 0.7152 + b * 0.0722;
    if (l > best) (best = l), (bi = i);
  }
  const col = bi % W, row = Math.floor(bi / W);
  const u = (col + 0.5) / W;
  const v = tex.flipY ? 1 - (row + 0.5) / H : (row + 0.5) / H;
  const lon = (u - 0.5) * Math.PI * 2;
  const el = (v - 0.5) * Math.PI;
  return new Vector3(Math.cos(el) * Math.cos(lon), Math.sin(el), Math.cos(el) * Math.sin(lon)).normalize();
}

let cached: Promise<EnvAssets> | null = null;

export function loadEnvAssets(quality: "low" | "medium" | "high"): Promise<EnvAssets> {
  if (cached) return cached;
  cached = (async () => {
    const out: EnvAssets = { sets: {}, hdr: null, hdrSun: null };
    const names: PBRName[] = ["brick_floor", "brown_brick_02", "clay_plaster", "weathered_brown_planks", "marble_01"];
    await Promise.all([
      ...names.map(async (name) => {
        const u = (k: string) => byName[`${name}_${k}.jpg`];
        if (!u("diff") || !u("nor") || !u("arm")) return;
        try {
          const [diff, nor, arm] = await Promise.all([loadImage(u("diff")), loadImage(u("nor")), loadImage(u("arm"))]);
          out.sets[name] = { name, images: { diff, nor, arm }, base: { diff: baseTexture(diff, true), nor: baseTexture(nor, false), arm: baseTexture(arm, false) } };
        } catch (e) {
          console.warn("Fresh Market 3D: texture set failed", name, e);
        }
      }),
      (async () => {
        const url = byName["kiara_6_afternoon_1k.hdr"];
        if (!url) return;
        try {
          const tex = await new HDRLoader().loadAsync(url);
          tex.mapping = EquirectangularReflectionMapping;
          out.hdr = tex;
          out.hdrSun = findSun(tex);
        } catch (e) {
          console.warn("Fresh Market 3D: HDR sky failed", e);
        }
      })(),
    ]);
    void quality;
    return out;
  })();
  return cached;
}

/** Physically based material from a scanned set, tiled `repeat` times (shares GPU textures). */
export function pbr(set: PBRSet, repeat: [number, number], params: MeshStandardMaterialParameters & { normalStrength?: number; aoStrength?: number } = {}) {
  const tile = (t: Texture) => {
    const c = t.clone();
    c.repeat.set(repeat[0], repeat[1]);
    c.needsUpdate = true;
    return c;
  };
  const { normalStrength = 1, aoStrength = 1, ...rest } = params;
  const arm = tile(set.base.arm);
  return new MeshStandardMaterial({
    map: tile(set.base.diff),
    normalMap: tile(set.base.nor),
    normalScale: new Vector2(normalStrength, normalStrength),
    roughnessMap: arm,
    aoMap: arm,
    aoMapIntensity: aoStrength,
    roughness: 1,
    metalness: 0,
    ...rest,
  });
}

/** CSS pattern from a scanned image, scaled so one image tile covers `metres` at `pxPerM`. */
export function canvasPattern(ctx: CanvasRenderingContext2D, img: HTMLImageElement, pxPerM: number, metres: number, offset = 0) {
  const p = ctx.createPattern(img, "repeat")!;
  const s = (pxPerM * metres) / img.width;
  p.setTransform(new DOMMatrix().translate(offset, 0).scale(s, s));
  return p;
}
