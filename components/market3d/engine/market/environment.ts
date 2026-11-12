/*
 * Fresh Market 3D — environment: sky, sun, IBL, ground, trees, string lights and decor.
 */
import {
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PMREMGenerator,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Scene,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  BoxGeometry,
  Euler,
  ShaderMaterial,
  BackSide,
  AdditiveBlending,
  DataTexture,
  DataUtils,
} from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { displace, merge, paint, transformed } from "../util/geo";
import { cobbleSet, makeCanvas, toTexture, woodSet } from "../util/textures";
import { NOISE, Rng, clamp } from "../util/noise";
import { EnvAssets, pbr } from "./realism";

export interface EnvBuild {
  group: Group;
  sun: DirectionalLight;
  hemi: HemisphereLight;
  sky: Sky;
  envDispose: () => void;
  bulbs: InstancedMesh[];
  update: (t: number) => void;
}

export interface EnvOptions {
  plazaRadius: number;
  stallAnchors: Array<{ left: Vector3; right: Vector3 }>;
  shadows: boolean;
  shadowMapSize: number;
  quality: "low" | "medium" | "high";
  /** Persian bazaar mode: arcades replace the tree ring and hills */
  persian?: boolean;
  /** photo-scanned materials + HDR sky (procedural fallbacks when absent) */
  assets?: EnvAssets;
}

function grassTexture() {
  const W = 512;
  const c = makeCanvas(W);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(W, W);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / W;
      const a = u * Math.PI * 2, b = v * Math.PI * 2;
      const n = NOISE.fbm(Math.cos(a) * 3, Math.sin(a) * 3 + Math.cos(b) * 3, Math.sin(b) * 3, 5);
      const fine = NOISE.noise(Math.cos(a) * 40, Math.sin(a) * 40 + Math.cos(b) * 40, Math.sin(b) * 40);
      const k = (y * W + x) * 4;
      const dry = clamp(n * 1.4 + 0.2);
      img.data[k] = 70 + dry * 70 + fine * 12;
      img.data[k + 1] = 96 + dry * 40 + fine * 14;
      img.data[k + 2] = 40 + dry * 20 + fine * 6;
      img.data[k + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, true, true, 8);
}

/** A stylised but soft broadleaf tree (merged geometry with vertex colors). */
function treeGeometry(seed: number, scale = 1): BufferGeometry {
  const rng = new Rng(seed);
  const parts: BufferGeometry[] = [];
  const trunkH = rng.range(2.2, 3.2) * scale;
  const trunk = new CylinderGeometry(0.12 * scale, 0.22 * scale, trunkH, 8, 6);
  displace(trunk, (p) => NOISE.noise(p.x * 4 + seed, p.y * 2, p.z * 4) * 0.03 * scale, true);
  trunk.translate(0, trunkH / 2, 0);
  paint(trunk, (p, _n, _uv, out) => out.setRGB(0.16 + NOISE.noise(p.x * 9, p.y * 9, seed) * 0.03, 0.11, 0.07));
  parts.push(trunk);
  const blobs = rng.int(7, 11);
  for (let i = 0; i < blobs; i++) {
    const r = rng.range(0.75, 1.25) * scale;
    const g = new IcosahedronGeometry(r, 4);
    const a = rng.range(0, Math.PI * 2);
    const rr = i === 0 ? 0 : rng.range(0.6, 1.2) * scale;
    const y = trunkH + rng.range(-0.1, 1.1) * scale + (i === 0 ? 0.5 * scale : 0);
    displace(g, (p) => (NOISE.fbm(p.x * 2.4 + seed + i, p.y * 2.4, p.z * 2.4, 4) * 0.32 + NOISE.noise(p.x * 9, p.y * 9, p.z * 9 + i) * 0.06) * r, true);
    // foliage shading: blend face normals with spherical normals for a soft, leafy look
    {
      const pos = g.getAttribute("position");
      const nor = g.getAttribute("normal");
      const v = new Vector3();
      const n = new Vector3();
      for (let k = 0; k < pos.count; k++) {
        v.fromBufferAttribute(pos, k).normalize();
        n.fromBufferAttribute(nor, k).lerp(v, 0.7).normalize();
        nor.setXYZ(k, n.x, n.y, n.z);
      }
    }
    g.translate(Math.cos(a) * rr, y, Math.sin(a) * rr);
    const hue = rng.range(-0.03, 0.03);
    paint(g, (p, n, _uv, out) => {
      const nn = NOISE.noise(p.x * 3 + seed, p.y * 3, p.z * 3) * 0.5 + 0.5;
      const top = clamp(n.y * 0.5 + 0.5);
      out.setHSL(0.22 + hue + nn * 0.05, 0.42 + nn * 0.18, 0.1 + top * 0.13 + nn * 0.06);
    });
    parts.push(g);
  }
  return merge(parts);
}

function skyDome(sunDir: Vector3): Mesh {
  const g = new SphereGeometry(1500, 48, 24);
  const m = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new Color("#3f74c4") },
      mid: { value: new Color("#9fc3e8") },
      horizon: { value: new Color("#ffd9a8") },
      bottom: { value: new Color("#c9a77e") },
      sunDir: { value: sunDir.clone().normalize() },
      sunColor: { value: new Color("#fff0d0") },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = h > 0.0 ? mix(horizon, mid, smoothstep(0.0, 0.18, h)) : mix(horizon, bottom, smoothstep(0.0, -0.08, h));
        c = mix(c, top, smoothstep(0.18, 0.75, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += sunColor * (pow(s, 6.0) * 0.28 + pow(s, 64.0) * 0.5 + pow(s, 1800.0) * 2.5);
        // soft clouds band
        gl_FragColor = vec4(c * 0.92, 1.0);
      }`,
  });
  const mesh = new Mesh(g, m);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * The captured sky with its sun clipped. A 1k HDR stores the sun in two or three texels of enormous
 * value; magnified and bloomed they become a white ball the size of a dome. We clip the sky to a
 * believable peak and draw the sun ourselves (see `sunDisc`).
 */
function clippedSky(src: DataTexture, peak: number): DataTexture {
  const img = src.image as { data: Float32Array | Uint16Array; width: number; height: number };
  const half = img.data instanceof Uint16Array;
  const data = img.data.slice() as Float32Array | Uint16Array;
  const n = img.width * img.height, ch = data.length / n;
  const hPeak = half ? DataUtils.toHalfFloat(peak) : peak;
  const get = (k: number) => (half ? DataUtils.fromHalfFloat(data[k]) : data[k]);
  const set = (k: number, v: number) => (data[k] = half ? DataUtils.toHalfFloat(v) : v);
  for (let i = 0; i < n; i++) {
    const k = i * ch;
    // positive half floats sort like integers, so most texels are skipped without decoding
    if (data[k] <= hPeak && data[k + 1] <= hPeak && data[k + 2] <= hPeak) continue;
    const r = get(k), g = get(k + 1), b = get(k + 2);
    const sc = peak / Math.max(r, g, b);
    set(k, r * sc);
    set(k + 1, g * sc);
    set(k + 2, b * sc);
  }
  const t = new DataTexture(data, img.width, img.height, src.format as any, src.type, src.mapping as any, src.wrapS, src.wrapT, src.magFilter, src.minFilter);
  t.colorSpace = src.colorSpace;
  t.flipY = src.flipY;
  t.generateMipmaps = src.generateMipmaps;
  t.needsUpdate = true;
  return t;
}

/**
 * The sun as a camera would see it: a small limb-darkened disc (0.53° across in reality; drawn a
 * little larger so it survives the screen resolution) with forward-scattering haze (Mie) around it.
 * The disc is bright enough for the bloom pass to add a natural glare — and no more.
 */
function sunDisc(sunDir: Vector3): Mesh {
  const m = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    blending: AdditiveBlending,
    fog: false,
    toneMapped: true,
    uniforms: { sunDir: { value: sunDir.clone().normalize() } },
    vertexShader: `varying vec3 vWorld;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 sunDir; varying vec3 vWorld;
      void main(){
        vec3 d = normalize(vWorld - cameraPosition);
        float c = dot(d, sunDir);
        float ang = acos(clamp(c, -1.0, 1.0));
        const float R = 0.0068; // disc radius (rad)
        float x = clamp(ang / R, 0.0, 1.0);
        float mu = sqrt(max(1.0 - x * x, 0.0));
        float limb = 1.0 - 0.6 * (1.0 - mu) - 0.2 * (1.0 - mu) * (1.0 - mu);
        float disc = (1.0 - smoothstep(0.86, 1.0, ang / R)) * limb;
        vec3 col = vec3(1.0, 0.95, 0.86) * disc * 26.0;
        // aureole: tight forward-scattering glow, then a broad warm haze
        float s = max(c, 0.0);
        col += vec3(1.0, 0.9, 0.74) * (pow(s, 9000.0) * 2.2 + pow(s, 900.0) * 0.55 + pow(s, 60.0) * 0.07);
        if (max(col.r, max(col.g, col.b)) < 0.002) discard;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new Mesh(new SphereGeometry(900, 32, 16), m);
  mesh.renderOrder = -9;
  mesh.frustumCulled = false;
  // keep the sky shell centred on the viewer
  mesh.onBeforeRender = (_r, _s, cam) => {
    mesh.position.copy(cam.position);
    mesh.updateMatrixWorld();
  };
  return mesh;
}

function bench(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) parts.push(transformed(new BoxGeometry(1.6, 0.04, 0.11), [0, 0.45, -0.13 + i * 0.13]));
  for (let i = 0; i < 2; i++) parts.push(transformed(new BoxGeometry(1.6, 0.1, 0.03), [0, 0.68 + i * 0.13, -0.24], [-0.15, 0, 0]));
  for (const sx of [-0.7, 0.7]) {
    parts.push(transformed(new BoxGeometry(0.06, 0.45, 0.4), [sx, 0.225, 0]));
    parts.push(transformed(new BoxGeometry(0.06, 0.5, 0.05), [sx, 0.7, -0.24]));
  }
  return merge(parts);
}

function planter(seed: number): { box: BufferGeometry; flowers: BufferGeometry; leaves: BufferGeometry } {
  const rng = new Rng(seed);
  const box = merge([transformed(new BoxGeometry(1.1, 0.45, 0.5), [0, 0.225, 0])]);
  const fl: BufferGeometry[] = [];
  const lv: BufferGeometry[] = [];
  const palette = ["#e8434a", "#f2b12c", "#f6efe2", "#d65ab0", "#ff7a3a", "#8a6ae0"];
  for (let i = 0; i < 40; i++) {
    const x = rng.range(-0.48, 0.48);
    const z = rng.range(-0.2, 0.2);
    const h = rng.range(0.5, 0.72);
    const leaf = new IcosahedronGeometry(rng.range(0.06, 0.1), 1);
    leaf.scale(1, 0.7, 1);
    leaf.translate(x, rng.range(0.45, 0.55), z);
    paint(leaf, (_p, _n, _uv, out) => out.setHSL(0.27 + rng.range(-0.02, 0.02), 0.5, 0.2 + rng.range(0, 0.06)));
    lv.push(leaf);
    if (i % 2 === 0) {
      const f = new IcosahedronGeometry(rng.range(0.03, 0.045), 1);
      f.translate(x, h, z);
      const col = new Color(palette[rng.int(0, palette.length - 1)]);
      paint(f, (_p, _n, _uv, out) => out.copy(col));
      fl.push(f);
    }
  }
  return { box, flowers: merge(fl), leaves: merge(lv) };
}

export function buildEnvironment(scene: Scene, renderer: WebGLRenderer, o: EnvOptions): EnvBuild {
  const group = new Group();
  const R = o.plazaRadius;

  // ── Sky & sun (golden hour)
  const sky = new Sky();
  sky.scale.setScalar(4500);
  const u = sky.material.uniforms;
  u.turbidity.value = 6.5;
  u.rayleigh.value = 1.6;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.86;
  const EA = o.assets;
  const hdrSun = EA?.hdr && EA.hdrSun ? EA.hdrSun : null;
  // with the HDR sky the sun keeps its captured height; its azimuth stays behind the visitor's right
  // shoulder at the entrance so the stalls are front-lit (the HDR is rotated to match)
  const elevation = hdrSun ? MathUtils.clamp(MathUtils.radToDeg(Math.asin(hdrSun.y)), 22, 48) : 19;
  const azimuth = 32;
  const phi = MathUtils.degToRad(90 - elevation);
  const theta = MathUtils.degToRad(azimuth);
  const sunDir = new Vector3().setFromSphericalCoords(1, phi, theta);
  u.sunPosition.value.copy(sunDir);
  // The raw Sky shader is far brighter than the scene; we show it through the PMREM background
  // with a controlled intensity so bloom only catches real highlights.

  // image based lighting baked from the sky
  const pmrem = new PMREMGenerator(renderer);
  const skyScene = new Scene();
  const skyClone = new Sky();
  skyClone.scale.setScalar(4500);
  Object.keys(u).forEach((k) => ((skyClone.material.uniforms as any)[k].value = (u as any)[k].value));
  skyScene.add(skyClone);
  // a warm ground disc so the lower hemisphere bounces earthy light
  const bounce = new Mesh(new CircleGeometry(4000, 16), new MeshStandardMaterial({ color: "#6a5236", emissive: new Color("#3a2a1a"), emissiveIntensity: 0.6 }));
  bounce.rotation.x = -Math.PI / 2;
  bounce.position.y = -2;
  skyScene.add(bounce);
  let envRT: { texture: any; dispose: () => void };
  if (hdrSun && EA?.hdr) {
    // real captured sky: lighting, reflections and the visible sky all come from the HDR
    const rot = MathUtils.degToRad(azimuth) - Math.atan2(hdrSun.x, hdrSun.z);
    // the directional light already carries the sun; the IBL keeps only a softened sun so glazed
    // tile and water don't mirror a second, blinding one
    envRT = pmrem.fromEquirectangular(clippedSky(EA.hdr, 30));
    scene.environment = envRT.texture;
    (scene as any).environmentIntensity = 0.95;
    (scene as any).environmentRotation?.set(0, rot, 0);
    scene.background = clippedSky(EA.hdr, 6);
    (scene as any).backgroundRotation?.set(0, rot, 0);
    (scene as any).backgroundIntensity = 0.82;
    scene.fog = new Fog(new Color("#b9c2cc"), R + 30, R + 220);
    group.add(sunDisc(sunDir));
  } else {
    envRT = pmrem.fromScene(skyScene, 0.02);
    scene.environment = envRT.texture;
    (scene as any).environmentIntensity = 0.5;
    // Visible sky: an art-directed golden-hour dome in display range (the physical sky only lights the scene).
    scene.add(skyDome(sunDir));
    scene.fog = new Fog(new Color("#e6cfae"), R + 24, R + 150);
  }
  pmrem.dispose();

  const sun = new DirectionalLight(new Color(hdrSun ? "#fff1dc" : "#ffd6a8"), hdrSun ? 2.9 : 2.7);
  sun.position.copy(sunDir).multiplyScalar(40);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = o.shadows;
  if (o.shadows) {
    const s = R + 5;
    sun.shadow.mapSize.set(o.shadowMapSize, o.shadowMapSize);
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 90;
    sun.shadow.bias = -0.00025;
    sun.shadow.normalBias = 0.02;
    // a real sun is half a degree wide: soft penumbrae, and shade that still holds detail
    sun.shadow.radius = 6;
    (sun.shadow as any).intensity = 0.86;
  }
  group.add(sun, sun.target);
  // sky fill from above and warm bounce from the brick paving, so shaded corners never go black
  const hemi = new HemisphereLight(new Color("#a9c8f0"), new Color("#8a6a48"), 0.55);
  group.add(hemi);

  // ── Ground
  const cob = cobbleSet();
  const tiles = (R + 2) / 1.05;
  cob.map.repeat.set(tiles, tiles);
  cob.normalMap.repeat.set(tiles, tiles);
  cob.roughnessMap!.repeat.set(tiles, tiles);
  const floorSet = EA?.sets.brick_floor;
  const floorRep = ((R + 2.2) * 2) / 1.35; // one scan ≈ 1.35 m of herringbone brick paving
  const plaza = new Mesh(
    new CircleGeometry(R + 2.2, 96),
    floorSet
      ? pbr(floorSet, [floorRep, floorRep], { normalStrength: 1.15, aoStrength: 1 })
      : new MeshStandardMaterial({ map: cob.map, normalMap: cob.normalMap, roughnessMap: cob.roughnessMap, roughness: 1, normalScale: new Vector2(1.1, 1.1) }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.receiveShadow = true;
  group.add(plaza);
  // curb ring
  const curb = new Mesh(
    new RingGeometry(R + 2.2, R + 2.5, 128, 1),
    EA?.sets.marble_01 ? pbr(EA.sets.marble_01, [40, 1], { color: "#d8cdb8" }) : new MeshStandardMaterial({ color: "#8f8374", roughness: 0.9 }),
  );
  curb.rotation.x = -Math.PI / 2;
  curb.position.y = 0.012;
  curb.receiveShadow = true;
  group.add(curb);
  const grassTex = grassTexture();
  grassTex.repeat.set(40, 40);
  const grass = new Mesh(new PlaneGeometry(400, 400, 1, 1), new MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.01;
  grass.receiveShadow = true;
  group.add(grass);

  // ── Trees ring
  const treeMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const variants = [treeGeometry(11), treeGeometry(23, 1.15), treeGeometry(37, 0.9)];
  const rng = new Rng(4242);
  const tmpM = new Matrix4();
  const q = new Quaternion();
  const treeCount = o.quality === "low" ? 18 : 34;
  const perVariant: Matrix4[][] = [[], [], []];
  for (let i = 0; i < treeCount; i++) {
    const a = (i / treeCount) * Math.PI * 2 + rng.range(-0.08, 0.08);
    const rr = R + rng.range(5.5, 14);
    q.setFromEuler(new Euler(0, rng.range(0, Math.PI * 2), 0));
    const s = rng.range(0.85, 1.35);
    tmpM.compose(new Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr), q, new Vector3(s, s, s));
    perVariant[i % 3].push(tmpM.clone());
  }
  if (!o.persian) perVariant.forEach((list, vi) => {
    const im = new InstancedMesh(variants[vi], treeMat, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = o.shadows;
    im.receiveShadow = true;
    group.add(im);
  });

  // distant hills
  const hills = new Mesh(
    (() => {
      const g = new RingGeometry(R + 40, R + 160, 96, 6);
      const pos = g.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        const d = Math.hypot(x, y);
        const h = (NOISE.fbm(x * 0.012, y * 0.012, 3, 4) * 0.5 + 0.5) * clamp((d - R - 40) / 60) * 11;
        pos.setZ(i, h);
      }
      g.computeVertexNormals();
      return g;
    })(),
    new MeshStandardMaterial({ color: "#5d6b3c", roughness: 1 }),
  );
  hills.rotation.x = -Math.PI / 2;
  if (!o.persian) group.add(hills);

  // ── Festoon lights criss-crossing the plaza between stall awnings
  const bulbs: InstancedMesh[] = [];
  const bulbMat = new MeshStandardMaterial({ color: "#fff0d0", emissive: new Color("#ffbf5e"), emissiveIntensity: 3.6, roughness: 0.3 });
  const bulbGeo = new SphereGeometry(0.038, 10, 8);
  const wireMat = new MeshStandardMaterial({ color: "#1d1a17", roughness: 0.7 });
  const bulbMatrices: Matrix4[] = [];
  const wires: BufferGeometry[] = [];
  const strand = (a: Vector3, b: Vector3, sag: number, count: number) => {
    const pts: Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      pts.push(new Vector3().lerpVectors(a, b, t).add(new Vector3(0, -sag * 4 * t * (1 - t), 0)));
    }
    wires.push(new TubeGeometry(new CatmullRomCurve3(pts), 32, 0.005, 4, false));
    for (let i = 1; i < count; i++) {
      const t = i / count;
      const p = new Vector3().lerpVectors(a, b, t).add(new Vector3(0, -sag * 4 * t * (1 - t) - 0.06, 0));
      bulbMatrices.push(new Matrix4().makeTranslation(p.x, p.y, p.z));
    }
  };
  const A = o.stallAnchors;
  const nA = A.length;
  if (nA >= 3) {
    const lift = (v: Vector3) => v.clone().add(new Vector3(0, 2.7, 0));
    const half = Math.max(1, Math.floor(nA / 2));
    for (let i = 0; i < nA; i++) {
      const j = (i + half) % nA;
      if ((i < j || nA % 2) && i % 2 === 0) strand(lift(A[i].right), lift(A[j].left), 0.9, 13);
    }
  } else if (nA) {
    A.forEach((s) => strand(s.left.clone().add(new Vector3(0, 0.6, 0)), s.right.clone().add(new Vector3(0, 0.6, 0)), 0.25, 8));
  }
  // perimeter strands linking neighbouring stalls
  for (let i = 0; i < o.stallAnchors.length; i++) {
    const a = o.stallAnchors[i].right;
    const b = o.stallAnchors[(i + 1) % o.stallAnchors.length].left;
    if (a.distanceTo(b) < 8) strand(a, b, 0.35, 6);
  }
  if (wires.length) {
    const wm = new Mesh(merge(wires), wireMat);
    group.add(wm);
  }
  if (bulbMatrices.length) {
    const im = new InstancedMesh(bulbGeo, bulbMat, bulbMatrices.length);
    bulbMatrices.forEach((m, i) => im.setMatrixAt(i, m));
    group.add(im);
    bulbs.push(im);
  }

  // ── Benches & planters around the pole
  const benchGeo = bench();
  const benchMat = new MeshStandardMaterial({ ...woodMaps(), roughness: 1 });
  const planterMat = new MeshStandardMaterial({ ...woodMaps([110, 76, 48]), roughness: 1 });
  const flowerMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const leafMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const addPlanter = (pos: Vector3, seed: number) => {
    const pl = planter(seed);
    const holder = new Group();
    holder.position.copy(pos);
    holder.lookAt(0, 0, 0);
    const boxM = new Mesh(pl.box, planterMat);
    boxM.castShadow = o.shadows;
    boxM.receiveShadow = true;
    const fM = new Mesh(pl.flowers, flowerMat);
    const lM = new Mesh(pl.leaves, leafMat);
    lM.castShadow = o.shadows;
    holder.add(boxM, fM, lM);
    group.add(holder);
  };
  for (let i = 0; i + 1 < o.stallAnchors.length; i++) {
    const a = o.stallAnchors[i].right;
    const b = o.stallAnchors[i + 1].left;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y = 0;
    // set back from the stall front so the vendors standing in the gap have room
    if (a.distanceTo(b) > 0.9) addPlanter(mid.setLength(mid.length() + 1.1), i * 13 + 5);
  }
  // entrance: two benches facing the market, flanked by planters
  for (const side of [-1, 1]) {
    const b = new Mesh(benchGeo, benchMat);
    b.position.set(side * 2.6, 0, R * 0.92);
    b.rotation.y = Math.PI;
    b.castShadow = o.shadows;
    b.receiveShadow = true;
    group.add(b);
    addPlanter(new Vector3(side * 4.2, 0, R * 0.9), side > 0 ? 71 : 83);
  }

  scene.add(group);

  const bulbBase = 7;
  return {
    group,
    sun,
    hemi,
    sky,
    bulbs,
    envDispose: () => envRT.dispose(),
    update: (t: number) => {
      bulbMat.emissiveIntensity = 3.6 + Math.sin(t * 1.7) * 0.25;
    },
  };
}

function woodMaps(tint: [number, number, number] = [150, 108, 70]) {
  const w = woodSet(tint, "decor", 3);
  return { map: w.map, normalMap: w.normalMap, roughnessMap: w.roughnessMap };
}

export function disposeObject(o: Object3D) {
  o.traverse((c: any) => {
    if (c.geometry) c.geometry.dispose?.();
    if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m: any) => m.dispose?.());
  });
}
