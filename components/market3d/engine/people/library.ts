/*
 * Fresh Market 3D — realistic people library.
 *
 * Scanned-quality rigged humans and motion-capture clips from the Microsoft Rocketbox library
 * (MIT licence, see assets/people/LICENSE-Rocketbox.txt), converted offline into compact packs
 * (quantized meshes, int16 animation tracks, web textures). Loaded lazily after the bazaar is on screen.
 */
import {
  AnimationClip,
  Bone,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Matrix4,
  MeshStandardMaterial,
  QuaternionKeyframeTrack,
  Skeleton,
  SkinnedMesh,
  Sphere,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  VectorKeyframeTrack,
} from "three";
import { fetchPack, Pack } from "./pack";
import { Costume, costumeMesh } from "./costume";

export type Sex = "m" | "f";
export interface AvatarInfo {
  id: string;
  sex: Sex;
  role: "vendor" | "shopper" | "figure";
  child?: boolean;
  elder?: boolean;
}

/** Cast for an Iranian bazaar: vendors in work clothes, shoppers in everyday clothes, one child. */
export const ROSTER: AvatarInfo[] = [
  { id: "Gardener_Male_01", sex: "m", role: "vendor", elder: true },
  // historical figures (dressed in period costume at runtime)
  { id: "Male_Adult_05", sex: "m", role: "figure", elder: true },
  { id: "Male_Adult_15", sex: "m", role: "figure" },
  { id: "Male_Adult_19", sex: "m", role: "figure" },
  { id: "Delivery_Male_01", sex: "m", role: "vendor" },
  { id: "Wood_Male_01", sex: "m", role: "vendor" },
  { id: "Female_Adult_11", sex: "f", role: "vendor" },
  { id: "Male_Adult_14", sex: "m", role: "vendor", elder: true },
  { id: "Male_Adult_04", sex: "m", role: "vendor" },
  { id: "Female_Adult_03", sex: "f", role: "shopper" },
  { id: "Male_Adult_17", sex: "m", role: "shopper" },
  { id: "Female_Adult_05", sex: "f", role: "shopper" },
  { id: "Male_Adult_07", sex: "m", role: "shopper" },
  { id: "Female_Adult_02", sex: "f", role: "shopper" },
  { id: "Male_Adult_02", sex: "m", role: "shopper" },
  { id: "Female_Adult_07", sex: "f", role: "shopper" },
  { id: "Male_Adult_03", sex: "m", role: "shopper", elder: true },
  { id: "Female_Adult_15", sex: "f", role: "shopper" },
  { id: "Male_Child_01", sex: "m", role: "shopper", child: true },
];

export type ClipRole = "walk" | "slow" | "idle" | "look" | "talk" | "listen" | "wave" | "present" | "fidget";

/** extra clips used by the historical figures (seated Khayyam, a scholar's talk) */
export const FIGURE_CLIPS = ["m_sit_chair_idle_neutral_01", "m_sit_chair_breathe_01", "m_sit_chair_gestic_thoughtful", "m_gestic_talk_neutral_02"];
export const CLIPS: Record<Sex, Record<ClipRole, string[]>> = {
  m: {
    walk: ["m_walk_neutral_01"],
    slow: ["m_walk_slow_01"],
    idle: ["m_idle_neutral_01", "m_idle_neutral_02", "m_idle_breathe_01"],
    look: ["m_idle_look_around_01", "m_idle_look_around_02"],
    talk: ["m_gestic_talk_neutral_01"],
    listen: ["m_gestic_listen_neutral_01"],
    wave: ["m_wave_01"],
    present: ["f_gestic_presentation_right_01"],
    fidget: ["m_idle_scratch_head_01"],
  },
  f: {
    walk: ["f_walk_neutral_01"],
    slow: ["f_walk_slow_01", "f_walk_stroll_01"],
    idle: ["f_idle_neutral_01", "f_idle_neutral_02", "f_idle_breathe_01"],
    look: ["f_idle_look_around_01", "f_idle_look_around_02"],
    talk: ["f_gestic_talk_neutral_01"],
    listen: ["f_gestic_listen_neutral_01"],
    wave: ["f_wave_01"],
    present: ["f_gestic_presentation_right_01"],
    fidget: ["f_idle_touch_hair_01"],
  },
};

// every converted asset ships through Vite as a hashed URL
const URLS = import.meta.glob("../../assets/people/**/*.{bin,jpg,webp}", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const byName: Record<string, string> = {};
for (const [k, v] of Object.entries(URLS)) byName[k.split("/").pop()!] = v;
const url = (file: string) => byName[file];

export function peopleAssetsAvailable() {
  return ROSTER.every((a) => !!url(`${a.id}.bin`));
}

export interface ClipInfo {
  clip: AnimationClip;
  /** root-motion speed of the original capture (cm/s, 0 for in-place clips) */
  speed: number;
  hipY: number;
}

export interface AvatarAsset {
  info: AvatarInfo;
  geometry: BufferGeometry;
  bones: Array<{ n: string; p: number; t: number[]; q: number[]; s: number[] }>;
  inverses: Matrix4[];
  bindMatrix: Matrix4;
  meshMatrix: Matrix4;
  materials: MeshStandardMaterial[];
  hipY: number;
  height: number;
  sphere: Sphere;
}

function decodeAvatar(p: Pack): Omit<AvatarAsset, "info" | "materials"> & { groups: Array<{ kind: string; start: number; count: number }> } {
  const h = p.header;
  const pos = p.get<Uint16Array>("pos");
  const nor = p.get<Int8Array>("nor");
  const uvq = p.get<Uint16Array>("uv");
  const n = h.vertices;
  const P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) P[i * 3 + k] = h.pmin[k] + (pos[i * 3 + k] / 65535) * (h.pmax[k] - h.pmin[k]);
  const N = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) N[i] = nor[i] / 127;
  const UV = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) UV[i * 2 + k] = h.umin[k] + (uvq[i * 2 + k] / 65535) * (h.umax[k] - h.umin[k]);
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(P, 3));
  g.setAttribute("normal", new Float32BufferAttribute(N, 3));
  g.setAttribute("uv", new Float32BufferAttribute(UV, 2));
  g.setAttribute("skinIndex", new BufferAttribute(new Uint8Array(p.get<Uint8Array>("si")), 4));
  g.setAttribute("skinWeight", new BufferAttribute(new Uint8Array(p.get<Uint8Array>("sw")), 4, true));
  g.setIndex(new BufferAttribute(new Uint16Array(p.get<Uint16Array>("index")), 1));
  h.groups.forEach((gr: any, i: number) => g.addGroup(gr.start, gr.count, i));
  g.computeBoundingBox();
  const sphere = new Sphere();
  g.boundingBox!.getBoundingSphere(sphere);
  sphere.radius *= 1.35; // room for animation
  g.boundingSphere = sphere.clone();
  const inv = p.get<Float32Array>("inv");
  const inverses = h.bones.map((_: any, i: number) => new Matrix4().fromArray(inv, i * 16));
  return {
    geometry: g,
    groups: h.groups,
    bones: h.bones,
    inverses,
    bindMatrix: new Matrix4().fromArray(h.bindMatrix),
    meshMatrix: new Matrix4().fromArray(h.meshMatrix),
    hipY: h.hipY,
    height: h.height,
    sphere,
  };
}

function decodeClip(p: Pack): ClipInfo {
  const h = p.header;
  const q = p.get<Int16Array>("q");
  const root = p.get<Float32Array>("root");
  const times = new Float32Array(h.frames);
  for (let i = 0; i < h.frames; i++) times[i] = Math.min(h.duration, i / h.fps);
  const tracks: any[] = [];
  let o = 0;
  const unq = (src: Int16Array, from: number, count: number) => {
    const out = new Float32Array(count);
    for (let i = 0; i < count; i += 4) {
      const x = src[from + i] / 32767, y = src[from + i + 1] / 32767, z = src[from + i + 2] / 32767, w = src[from + i + 3] / 32767;
      const l = Math.hypot(x, y, z, w) || 1;
      out[i] = x / l;
      out[i + 1] = y / l;
      out[i + 2] = z / l;
      out[i + 3] = w / l;
    }
    return out;
  };
  h.bones.forEach((b: string, i: number) => {
    if (h.constant[i]) {
      tracks.push(new QuaternionKeyframeTrack(`${b}.quaternion`, [0], unq(q, o, 4)));
      o += 4;
    } else {
      tracks.push(new QuaternionKeyframeTrack(`${b}.quaternion`, times, unq(q, o, h.frames * 4)));
      o += h.frames * 4;
    }
  });
  if (h.root) tracks.push(new VectorKeyframeTrack("Bip01.position", times, new Float32Array(root)));
  return { clip: new AnimationClip(h.name, h.duration, tracks), speed: h.speed, hipY: h.hipY };
}

export class PeopleLibrary {
  readonly avatars = new Map<string, AvatarAsset>();
  readonly clips = new Map<string, ClipInfo>();
  private textures: Texture[] = [];
  private loader = new TextureLoader();
  private abort = new AbortController();

  constructor(private shadows: boolean, private quality: "low" | "medium" | "high") {}

  /** Load the cast (subset on low quality) and every clip they need. */
  async load(onProgress?: (p: number) => void): Promise<void> {
    const everyday = ROSTER.filter((a) => a.role !== "figure");
    const cast = [...ROSTER.filter((a) => a.role === "figure"), ...(this.quality === "low" ? everyday.slice(0, 8) : everyday)];
    const clipNames = new Set<string>(FIGURE_CLIPS);
    for (const a of cast) for (const list of Object.values(CLIPS[a.sex])) list.forEach((c) => clipNames.add(c));
    const total = cast.length + clipNames.size;
    let done = 0;
    const tick = () => onProgress?.(++done / total);
    await Promise.all(
      [...clipNames].map(async (name) => {
        const u = url(`${name}.bin`);
        if (!u) return tick();
        this.clips.set(name, decodeClip(await fetchPack(u, this.abort.signal)));
        tick();
      }),
    );
    // avatars a few at a time so the first people can appear early
    const queue = [...cast];
    const worker = async () => {
      while (queue.length) {
        const a = queue.shift()!;
        await this.loadAvatar(a);
        tick();
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  private async tex(file: string, color: boolean, aniso = 4): Promise<Texture | null> {
    const u = url(file);
    if (!u) return null;
    const t = await this.loader.loadAsync(u);
    if (color) t.colorSpace = SRGBColorSpace;
    t.anisotropy = aniso;
    this.textures.push(t);
    return t;
  }

  private async loadAvatar(info: AvatarInfo) {
    const id = info.id;
    const [pack, body, bodyN, bodyR, head, headN, headR, hair] = await Promise.all([
      fetchPack(url(`${id}.bin`), this.abort.signal),
      this.tex(`${id}-body.jpg`, true),
      this.tex(`${id}-body_n.jpg`, false),
      this.tex(`${id}-body_r.jpg`, false),
      this.tex(`${id}-head.jpg`, true),
      this.tex(`${id}-head_n.jpg`, false),
      this.tex(`${id}-head_r.jpg`, false),
      this.tex(`${id}-hair.webp`, true),
    ]);
    const d = decodeAvatar(pack);
    const mat = (kind: string) => {
      if (kind === "hair")
        return hair
          ? new MeshStandardMaterial({ name: `${id}-hair`, map: hair, alphaTest: 0.42, side: DoubleSide, roughness: 0.62, metalness: 0 })
          : new MeshStandardMaterial({ name: `${id}-hair`, visible: false });
      if (kind === "head")
        return new MeshStandardMaterial({ name: `${id}-head`, map: head, normalMap: headN, roughnessMap: headR, roughness: headR ? 1 : 0.62, metalness: 0 });
      return new MeshStandardMaterial({ name: `${id}-body`, map: body, normalMap: bodyN, roughnessMap: bodyR, roughness: bodyR ? 1 : 0.85, metalness: 0 });
    };
    const materials = d.groups.map((g) => mat(g.kind));
    this.avatars.set(id, { info, ...d, materials });
  }

  /** A new animated instance of an avatar: a 1-unit group (metres) with the skinned body inside. */
  instance(id: string, costume?: Costume): { root: Group; mesh: SkinnedMesh; bones: Map<string, Bone>; asset: AvatarAsset; extra: SkinnedMesh[] } {
    const a = this.avatars.get(id)!;
    const root = new Group();
    const body = new Group();
    body.scale.setScalar(0.01); // centimetres → metres
    root.add(body);
    const bones = a.bones.map((d) => {
      const b = new Bone();
      // some rigs (the children) use a "Bip02" biped; clips target "Bip01"
      b.name = d.n.replace(/^Bip0\d/, "Bip01");
      b.position.fromArray(d.t);
      b.quaternion.fromArray(d.q);
      b.scale.fromArray(d.s);
      return b;
    });
    a.bones.forEach((d, i) => (d.p >= 0 ? bones[d.p].add(bones[i]) : body.add(bones[i])));
    const mesh = new SkinnedMesh(a.geometry, a.materials);
    a.meshMatrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    body.add(mesh);
    body.updateMatrixWorld(true);
    mesh.bind(new Skeleton(bones, a.inverses), a.bindMatrix);
    mesh.boundingSphere = a.sphere.clone();
    mesh.castShadow = this.shadows;
    mesh.receiveShadow = true;
    const map = new Map<string, Bone>();
    bones.forEach((b) => map.set(b.name, b));
    const extra = costume ? [costumeMesh(a, costume, mesh, this.shadows)] : [];
    return { root, mesh, bones: map, asset: a, extra };
  }

  clip(name: string) {
    return this.clips.get(name);
  }

  private scaled = new Map<string, ClipInfo>();
  /** Clip with its hip-height track rescaled to an avatar's leg length (shared per height). */
  clipFor(name: string, hipY: number): ClipInfo | undefined {
    const base = this.clips.get(name);
    if (!base) return undefined;
    const key = `${name}@${Math.round(hipY * 10)}`;
    let c = this.scaled.get(key);
    if (!c) {
      // seated captures: scale by the actor's standing hip height, not the seated one
      const ref = /_sit_/.test(name) ? (name.startsWith("f_") ? 91.9 : 89.5) : base.hipY;
      const ratio = hipY / ref;
      const tracks = base.clip.tracks.map((t) => {
        if (t.name !== "Bip01.position") return t;
        const s = t.clone();
        const v = s.values as Float32Array;
        for (let i = 0; i < v.length; i++) v[i] *= ratio;
        return s;
      });
      c = { clip: new AnimationClip(base.clip.name, base.clip.duration, tracks), speed: base.speed, hipY: base.hipY };
      this.scaled.set(key, c);
    }
    return c;
  }

  dispose() {
    this.abort.abort();
    this.avatars.forEach((a) => {
      a.geometry.dispose();
      a.materials.forEach((m) => m.dispose());
    });
    this.textures.forEach((t) => t.dispose());
    this.avatars.clear();
    this.clips.clear();
  }
}

export const _v = new Vector3();
