/*
 * Fresh Market 3D — the howz: an octagonal Persian pool with a fountain, made to read as real water.
 *
 *  • Water surface: a planar mirror (real reflections of the arcades, people and sky, rendered at half
 *    resolution once per frame) with Fresnel, two drifting ripple layers, sun glints and analytic
 *    ring waves spreading from every point where a stream lands. See-through when you look down.
 *  • Streams: thousands of droplets on true ballistic arcs (g = 9.81) over thin glassy cores, a central
 *    plume, and splash droplets bouncing where the water hits the surface.
 *  • Caustics: a moving network of focused sunlight on the tiled floor and walls (procedural cellular
 *    edges), the single strongest cue that this is water.
 *  • Glazed turquoise tile with grout relief, a wet line on the marble, goldfish swimming, and clay
 *    pots of red geraniums on the rim — the classic Iranian courtyard pool.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NormalBlending,
  Points,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  Sphere,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  Vector4,
} from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { lathe, merge, paint, transformed } from "../util/geo";
import { heightToNormalCanvas, makeCanvas, toTexture } from "../util/textures";
import { NOISE, Rng } from "../util/noise";
import { pbr, PBRSet } from "./realism";
import { propScan } from "../produce/scans";

export interface FountainOptions {
  radius: number;
  shadows: boolean;
  quality: "low" | "medium" | "high";
  marble?: PBRSet;
  brass: Material;
  sunDir: Vector3;
  /** drawing-buffer height in pixels (for droplet sizes) */
  pixelHeight: () => number;
}

const WATER_Y = 0.36;
const NOZZLE_Y = 1.0;
const ARC = { vh: 1.29, vy: 1.6, T: 0.56 }; // lands at r ≈ 0.72 on the water
const LAND_R = ARC.vh * ARC.T;

// ───────────────────────────── textures ─────────────────────────────

function poolTiles(): { map: CanvasTexture; normalMap: CanvasTexture } {
  const N = 512, cells = 4, cell = N / cells, grout = 5;
  const c = makeCanvas(N);
  const ctx = c.getContext("2d")!;
  const h = new Float32Array(N * N);
  const rng = new Rng(31);
  ctx.fillStyle = "#d8d2c0";
  ctx.fillRect(0, 0, N, N);
  for (let y = 0; y < cells; y++)
    for (let x = 0; x < cells; x++) {
      const accent = rng.next() < 0.08;
      const l = rng.range(-6, 6);
      ctx.fillStyle = accent ? `hsl(${rng.range(212, 220)}, 62%, ${30 + l}%)` : `hsl(${rng.range(181, 188)}, ${rng.range(58, 70)}%, ${40 + l}%)`;
      ctx.fillRect(x * cell + grout / 2, y * cell + grout / 2, cell - grout, cell - grout);
      // glaze pooling: a lighter centre, darker edges
      const g = ctx.createRadialGradient(x * cell + cell / 2, y * cell + cell / 2, 4, x * cell + cell / 2, y * cell + cell / 2, cell * 0.7);
      g.addColorStop(0, "rgba(255,255,255,0.10)");
      g.addColorStop(1, "rgba(0,20,30,0.14)");
      ctx.fillStyle = g;
      ctx.fillRect(x * cell + grout / 2, y * cell + grout / 2, cell - grout, cell - grout);
    }
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const gx = x % cell, gy = y % cell;
      const e = Math.min(gx, cell - gx, gy, cell - gy);
      h[y * N + x] = e < grout / 2 ? 0.2 : e < grout ? 0.2 + ((e - grout / 2) / (grout / 2)) * 0.8 : 1 - NOISE.noise(x * 0.05, y * 0.05, 2) * 0.03;
    }
  return { map: toTexture(c, true, true, 8), normalMap: toTexture(heightToNormalCanvas(h, N, N, 3), false, true, 8) };
}

function rippleNormal(): CanvasTexture {
  const N = 256;
  const rng = new Rng(7);
  const waves = Array.from({ length: 18 }, () => ({ kx: rng.int(-8, 8), ky: rng.int(-8, 8), ph: rng.range(0, Math.PI * 2), a: rng.range(0.3, 1) }));
  const h = new Float32Array(N * N);
  let lo = Infinity, hi = -Infinity;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let v = 0;
      for (const w of waves) v += (w.a * Math.sin(Math.PI * 2 * ((w.kx * x) / N + (w.ky * y) / N) + w.ph)) / Math.max(1, Math.hypot(w.kx, w.ky));
      h[y * N + x] = v;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  for (let i = 0; i < h.length; i++) h[i] = (h[i] - lo) / (hi - lo);
  return toTexture(heightToNormalCanvas(h, N, N, 3), false, true, 4);
}

function wetTexture(): CanvasTexture {
  const N = 256;
  const c = makeCanvas(N, 32);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(N, 32);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < N; x++) {
      const t = y / 31; // 0 = by the rim, 1 = outer edge
      const n = NOISE.fbm(x * 0.06, y * 0.25, 5, 3) * 0.5 + 0.5;
      const a = Math.max(0, (1 - t) * 1.3 - n * 0.9) * 255;
      const k = (y * N + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.min(255, a);
    }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, false, false, 4);
}

// ───────────────────────────── shaders ─────────────────────────────

const CAUSTIC_GLSL = /* glsl */ `
  vec2 fmHash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }
  // distance between the two nearest moving cell points: small along cell edges
  float fmCells(vec2 p, float t) {
    vec2 g = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y));
        vec2 h = fmHash2(g + o);
        vec2 r = o + 0.5 + 0.42 * sin(t + 6.2831 * h) - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
    return sqrt(d2) - sqrt(d1);
  }
  float fmCaustic(vec2 p, float t) {
    float a = fmCells(p * 5.0, t * 1.1);
    float b = fmCells(p * 7.3 + 3.1, t * 0.8 + 1.7);
    float c = (1.0 - smoothstep(0.0, 0.18, a)) * 0.65 + (1.0 - smoothstep(0.0, 0.15, b)) * 0.45;
    return c * c;
  }
`;

/** Adds animated caustics (focused sunlight) below the water line of a standard material. */
function withCaustics(mat: MeshStandardMaterial, uniforms: { uTime: { value: number } }, strength: number) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFmWorld;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFmWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uTime;\nvarying vec3 vFmWorld;\n${CAUSTIC_GLSL}`)
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
        float fmUnder = 1.0 - smoothstep(${(WATER_Y - 0.02).toFixed(3)}, ${WATER_Y.toFixed(3)}, vFmWorld.y);
        float fmC = fmCaustic(vFmWorld.xz + vec2(vFmWorld.y * 0.6), uTime);
        reflectedLight.directDiffuse += diffuseColor.rgb * fmC * ${strength.toFixed(2)} * fmUnder;
        reflectedLight.directDiffuse *= mix(1.0, 0.82, fmUnder);`,
      );
  };
  mat.customProgramCacheKey = () => `fm-caustics-${strength}`;
}

// ───────────────────────────── geraniums & fish ─────────────────────────────

function geraniumGeometry(seed: number): BufferGeometry {
  const rng = new Rng(seed);
  const parts: BufferGeometry[] = [];
  // round, scalloped leaves with the darker "zone" ring geraniums are named for
  for (let i = 0; i < 16; i++) {
    const g = new CircleGeometry(0.045 * rng.range(0.8, 1.15), 18);
    const pos = g.getAttribute("position");
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), y = pos.getY(k);
      const a = Math.atan2(y, x), r = Math.hypot(x, y);
      const s = 1 + Math.sin(a * 7) * 0.06;
      pos.setXYZ(k, Math.cos(a) * r * s, Math.sin(a) * r * s, -r * r * 6); // cupped
    }
    paint(g, (p, _n, _uv, out) => {
      const r = Math.hypot(p.x, p.y) / 0.05;
      out.setRGB(0.12, 0.32, 0.08).multiplyScalar(0.8 + NOISE.noise(p.x * 80, p.y * 80, seed) * 0.2);
      if (r > 0.45 && r < 0.62) out.multiplyScalar(0.55);
    });
    const ang = (i / 16) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const out = rng.range(0.03, 0.09);
    g.rotateX(-Math.PI / 2 + rng.range(0.2, 0.7));
    g.rotateY(-ang + Math.PI / 2);
    g.translate(Math.cos(ang) * out, rng.range(0.02, 0.09), Math.sin(ang) * out);
    parts.push(g);
  }
  // flower heads: umbels of five-petal flowers on stems
  const red = new Color(rng.pick(["#d81e2c", "#e0283f", "#c4122a"]));
  for (let u = 0; u < 5; u++) {
    const cx = rng.range(-0.06, 0.06), cz = rng.range(-0.06, 0.06), cy = rng.range(0.14, 0.2);
    const stem = new CylinderGeometry(0.0025, 0.003, cy, 4);
    stem.translate(cx * 0.5, cy / 2, cz * 0.5);
    paint(stem, (_p, _n, _uv, out) => out.setRGB(0.2, 0.36, 0.12));
    parts.push(stem);
    for (let f = 0; f < 11; f++) {
      const g = new CircleGeometry(0.012, 5);
      paint(g, (_p, _n, _uv, out) => out.copy(red).multiplyScalar(rng.range(0.85, 1.12)));
      const th = rng.range(0, Math.PI * 2), ph = rng.range(0, 1.1);
      const d = new Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
      g.lookAt(d);
      g.translate(cx + d.x * 0.025, cy + d.y * 0.02, cz + d.z * 0.025);
      parts.push(g);
    }
  }
  return merge(parts);
}

function fishGeometry(): BufferGeometry {
  // a spindle body along +Z (head) and a forked tail; painted orange with white patches
  const body = lathe([[0, -0.05], [0.012, -0.042], [0.019, -0.02], [0.02, 0.005], [0.016, 0.03], [0.008, 0.045], [0, 0.05]], 12, 10);
  body.rotateX(Math.PI / 2);
  body.scale(0.75, 1, 1);
  const tail = new BufferGeometry();
  tail.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, -0.045, 0, 0.022, -0.085, 0, 0, -0.07, 0, 0, -0.045, 0, 0, -0.07, 0, -0.022, -0.085]), 3));
  tail.computeVertexNormals();
  tail.setAttribute("uv", new BufferAttribute(new Float32Array(12), 2));
  const g = merge([body, tail]);
  paint(g, (p, _n, _uv, out) => {
    out.setRGB(0.95, 0.32, 0.06);
    if (NOISE.noise(p.x * 60, p.y * 60, p.z * 60) > 0.3 || p.y > 0.012) out.setRGB(0.95, 0.9, 0.82);
  });
  return g;
}

// ───────────────────────────── build ─────────────────────────────

export function buildFountain(o: FountainOptions) {
  const group = new Group();
  const PR = o.radius;
  const uniforms = { uTime: { value: 0 } };
  const disposables: Array<{ dispose: () => void }> = [];

  // rim of marble, with a darker wet line where the water laps
  const rim = new Mesh(
    lathe([[PR - 0.2, 0], [PR + 0.05, 0], [PR + 0.12, 0.38], [PR + 0.12, 0.46], [PR - 0.12, 0.46], [PR - 0.14, 0.12]], 8, 4),
    o.marble ? pbr(o.marble, [6, 1], { color: new Color("#e6dccb") }) : new MeshStandardMaterial({ color: "#9a7e5c", roughness: 0.8 }),
  );
  rim.castShadow = o.shadows;
  rim.receiveShadow = true;
  group.add(rim);
  const wetLine = new Mesh(
    new CylinderGeometry(PR - 0.136, PR - 0.138, 0.06, 8, 1, true),
    new MeshStandardMaterial({ color: "#3a3428", transparent: true, opacity: 0.45, roughness: 0.12, side: DoubleSide, depthWrite: false }),
  );
  wetLine.position.y = WATER_Y + 0.02;
  group.add(wetLine);

  // glazed tile interior with caustics
  const tiles = poolTiles();
  const wallMap = tiles.map.clone(), wallNor = tiles.normalMap.clone();
  wallMap.repeat.set(24, 1.05);
  wallNor.repeat.set(24, 1.05);
  wallMap.needsUpdate = wallNor.needsUpdate = true;
  const wallMat = new MeshStandardMaterial({ map: wallMap, normalMap: wallNor, normalScale: new Vector2(0.8, 0.8), roughness: 0.22, side: DoubleSide });
  withCaustics(wallMat, uniforms, 1.6);
  const inner = new Mesh(new CylinderGeometry(PR - 0.14, PR - 0.16, 0.42, 8, 1, true), wallMat);
  inner.position.y = 0.21;
  inner.receiveShadow = true;
  group.add(inner);
  const floorMap = tiles.map.clone(), floorNor = tiles.normalMap.clone();
  floorMap.repeat.set(7.8, 7.8);
  floorNor.repeat.set(7.8, 7.8);
  floorMap.needsUpdate = floorNor.needsUpdate = true;
  const floorMat = new MeshStandardMaterial({ map: floorMap, normalMap: floorNor, normalScale: new Vector2(0.8, 0.8), roughness: 0.25 });
  withCaustics(floorMat, uniforms, 2.2);
  const floor = new Mesh(new CircleGeometry(PR - 0.14, 8), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.04;
  floor.receiveShadow = true;
  group.add(floor);

  // ── water surface
  const ripples = rippleNormal();
  disposables.push(ripples);
  // where streams land (xz, strength, phase); the stream directions use the same angles as the droplets
  const drops = Array.from({ length: 7 }, (_, i) =>
    i < 6 ? new Vector4(Math.cos((i / 6) * Math.PI * 2) * LAND_R, Math.sin((i / 6) * Math.PI * 2) * LAND_R, 1, i * 1.7) : new Vector4(0, 0, 0.6, 0.4),
  );
  const waterGeo = new CircleGeometry(PR - 0.14, 8);
  const sunDir = o.sunDir.clone().normalize();
  let water: Mesh;
  const frame = { n: 0 };
  if (o.quality !== "low") {
    const size = o.quality === "high" ? 640 : 448;
    const refl = new Reflector(waterGeo, {
      textureWidth: size,
      textureHeight: size,
      clipBias: 0.002,
      shader: {
        name: "FmWaterShader",
        uniforms: {
          color: { value: new Color(0xffffff) },
          tDiffuse: { value: null },
          textureMatrix: { value: null },
          tNormal: { value: ripples },
          uTime: uniforms.uTime,
          uSun: { value: sunDir },
          uSunColor: { value: new Color(1.0, 0.92, 0.8) },
          uTint: { value: new Color(0.012, 0.15, 0.17) },
          uDrops: { value: drops },
        },
        vertexShader: /* glsl */ `
          uniform mat4 textureMatrix;
          varying vec4 vRefl;
          varying vec3 vWorld;
          #include <common>
          #include <logdepthbuf_pars_vertex>
          void main() {
            vRefl = textureMatrix * vec4(position, 1.0);
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
            #include <logdepthbuf_vertex>
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 color;
          uniform sampler2D tDiffuse;
          uniform sampler2D tNormal;
          uniform float uTime;
          uniform vec3 uSun;
          uniform vec3 uSunColor;
          uniform vec3 uTint;
          uniform vec4 uDrops[7];
          varying vec4 vRefl;
          varying vec3 vWorld;
          #include <logdepthbuf_pars_fragment>
          void main() {
            #include <logdepthbuf_fragment>
            vec2 p = vWorld.xz;
            vec3 n1 = texture2D(tNormal, p * 0.9 + vec2(uTime * 0.031, uTime * 0.017)).xyz * 2.0 - 1.0;
            vec3 n2 = texture2D(tNormal, p * 1.9 - vec2(uTime * 0.022, -uTime * 0.027)).xyz * 2.0 - 1.0;
            vec2 slope = (n1.xy + n2.xy) * 0.045;
            // ring waves spreading from every point where a stream lands
            for (int i = 0; i < 7; i++) {
              vec2 d = p - uDrops[i].xy;
              float r = length(d) + 1e-4;
              float ph = r * 58.0 - uTime * 8.5 + uDrops[i].w;
              float env = exp(-r * 5.5) * uDrops[i].z * (1.0 - smoothstep(0.55, 0.9, r));
              slope += (d / r) * cos(ph) * env * 0.32;
            }
            vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
            vec3 V = normalize(cameraPosition - vWorld);
            float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
            vec2 ruv = vRefl.xy / vRefl.w + slope * 0.35;
            vec3 refl = texture2D(tDiffuse, ruv).rgb;
            vec3 H = normalize(uSun + V);
            float nh = max(dot(N, H), 0.0);
            float spec = pow(nh, 900.0) * 5.0;       // sharp sun glints
            float sheen = pow(nh, 60.0) * 0.22;       // broad sunlit sheen
            // white water where the streams hit, flickering with the impacts
            float foam = 0.0;
            for (int i = 0; i < 7; i++) {
              float r = length(p - uDrops[i].xy);
              foam += smoothstep(0.11, 0.0, r) * (0.55 + 0.45 * sin(uTime * 23.0 + r * 90.0 + uDrops[i].w * 3.0)) * uDrops[i].z;
            }
            float crest = clamp(length(slope) * 1.6, 0.0, 1.0);
            vec3 col = mix(uTint, refl * color, fres) + uSunColor * (spec + sheen) + vec3(0.55, 0.7, 0.72) * crest * 0.22 + vec3(0.95) * foam * 0.6;
            float alpha = clamp(mix(0.44, 0.97, fres) + spec + foam * 0.5 + crest * 0.15, 0.0, 1.0);
            gl_FragColor = vec4(col, alpha);
          }`,
      },
    });
    const m = refl.material as ShaderMaterial;
    m.transparent = true;
    m.depthWrite = false;
    // render the reflection once per frame, not again for the AO pre-pass
    const original = refl.onBeforeRender;
    let last = -1;
    refl.onBeforeRender = function (...args: any[]) {
      if (frame.n === last) return;
      last = frame.n;
      (original as any).apply(this, args);
    };
    disposables.push({ dispose: () => refl.dispose() });
    water = refl;
  } else {
    water = new Mesh(
      waterGeo,
      new MeshPhysicalMaterial({ color: "#0e4f55", roughness: 0.03, transparent: true, opacity: 0.8, normalMap: ripples, normalScale: new Vector2(0.28, 0.28), envMapIntensity: 1.35 }),
    );
  }
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  water.renderOrder = 1;
  group.add(water);

  // ── brass spout
  const spout = new Mesh(
    merge([
      transformed(new CylinderGeometry(0.09, 0.13, 0.62, 16), [0, 0.31, 0]),
      transformed(new SphereGeometry(0.1, 16, 10), [0, 0.68, 0]),
      transformed(new CylinderGeometry(0.025, 0.04, 0.3, 10), [0, 0.86, 0]),
    ]),
    o.brass,
  );
  spout.castShadow = o.shadows;
  group.add(spout);

  // ── glassy stream cores following the same ballistic arcs as the droplets
  const cores: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const pts: Vector3[] = [];
    for (let k = 0; k <= 20; k++) {
      const t = (k / 20) * ARC.T;
      pts.push(new Vector3(Math.cos(a) * ARC.vh * t, NOZZLE_Y + ARC.vy * t - 4.905 * t * t, Math.sin(a) * ARC.vh * t));
    }
    cores.push(new TubeGeometry(new CatmullRomCurve3(pts), 32, 0.0085, 6, false));
  }
  const coreMat = new MeshPhysicalMaterial({ color: "#e8f8ff", transparent: true, opacity: 0.32, roughness: 0.04, metalness: 0, envMapIntensity: 1.6, depthWrite: false });
  const coreMesh = new Mesh(merge(cores), coreMat);
  coreMesh.renderOrder = 2;
  group.add(coreMesh);

  // ── droplets: arcs, the central plume and splashes
  const count = o.quality === "high" ? 3600 : o.quality === "medium" ? 2200 : 1100;
  const rng = new Rng(5);
  const aStream = new Float32Array(count), aSeed = new Float32Array(count), aJit = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = rng.next();
    aStream[i] = r < 0.62 ? Math.floor(rng.next() * 6) : r < 0.8 ? 6 : 7;
    aSeed[i] = rng.next();
    aJit[i * 3] = rng.range(-1, 1);
    aJit[i * 3 + 1] = rng.range(-1, 1);
    aJit[i * 3 + 2] = rng.range(-1, 1);
  }
  const dropGeo = new BufferGeometry();
  dropGeo.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
  dropGeo.setAttribute("aStream", new BufferAttribute(aStream, 1));
  dropGeo.setAttribute("aSeed", new BufferAttribute(aSeed, 1));
  dropGeo.setAttribute("aJit", new BufferAttribute(aJit, 3));
  dropGeo.boundingSphere = new Sphere(new Vector3(0, 0.8, 0), 1.6);
  const dropMat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    uniforms: { uTime: uniforms.uTime, uScale: { value: 900 }, uColor: { value: new Color(1.15, 1.25, 1.32) } },
    vertexShader: /* glsl */ `
      attribute float aStream;
      attribute float aSeed;
      attribute vec3 aJit;
      uniform float uTime;
      uniform float uScale;
      varying float vAlpha;
      void main() {
        vec3 pos;
        float alpha = 0.5;
        float size = 0.016;
        if (aStream < 5.5) {
          float a = aStream * 1.0471976;
          vec2 dir = vec2(cos(a), sin(a));
          float life = fract(uTime / ${ARC.T.toFixed(3)} + aSeed);
          float t = life * ${ARC.T.toFixed(3)};
          float vh = ${ARC.vh.toFixed(3)} * (1.0 + aJit.x * 0.035);
          float vy = ${ARC.vy.toFixed(3)} * (1.0 + aJit.y * 0.035);
          vec2 side = vec2(-dir.y, dir.x) * aJit.z * 0.07 * t;
          pos = vec3(dir.x * vh * t + side.x, ${NOZZLE_Y.toFixed(3)} + vy * t - 4.905 * t * t, dir.y * vh * t + side.y);
          size = mix(0.011, 0.02, life);
          alpha = 0.42 * (1.0 - smoothstep(0.92, 1.0, life));
        } else if (aStream < 6.5) {
          float T = 0.72;
          float life = fract(uTime / T + aSeed);
          float t = life * T;
          float vy = 2.6 * (1.0 + aJit.y * 0.04);
          vec2 sp = aJit.xz * 0.16 * t;
          pos = vec3(sp.x, 1.02 + vy * t - 4.905 * t * t, sp.y);
          size = mix(0.012, 0.024, smoothstep(0.3, 0.7, life));
          alpha = pos.y < ${WATER_Y.toFixed(3)} + 0.02 ? 0.0 : 0.38;
        } else {
          float k = floor(fract(aSeed * 7.31) * 6.0);
          float a = k * 1.0471976;
          vec2 c = vec2(cos(a), sin(a)) * ${LAND_R.toFixed(3)};
          float T = 0.34;
          float life = fract(uTime / T + aSeed * 3.7);
          float t = life * T;
          vec2 v = aJit.xz * 0.5;
          float vy = 0.55 + aJit.y * 0.3;
          pos = vec3(c.x + v.x * t, ${WATER_Y.toFixed(3)} + max(0.0, vy * t - 4.905 * t * t), c.y + v.y * t);
          size = 0.01;
          alpha = 0.4 * (1.0 - life);
        }
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = max(1.0, size * uScale / -mv.z);
        gl_Position = projectionMatrix * mv;
        vAlpha = alpha;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = dot(c, c);
        if (d > 0.25 || vAlpha <= 0.0) discard;
        float a = vAlpha * (1.0 - d * 4.0);
        // a bright rim like a tiny lens, darker core
        vec3 col = uColor * (0.75 + 0.5 * smoothstep(0.08, 0.22, d));
        gl_FragColor = vec4(col, a);
      }`,
  });
  const droplets = new Points(dropGeo, dropMat);
  droplets.frustumCulled = false;
  droplets.renderOrder = 3;
  group.add(droplets);

  // ── wet stone on the plaza around the pool
  const wet = new Mesh(
    new RingGeometry(PR + 0.11, PR + 0.62, 64, 1),
    new MeshStandardMaterial({ color: "#1d1a16", alphaMap: wetTexture(), transparent: true, opacity: 0.32, roughness: 0.18, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  wet.rotation.x = -Math.PI / 2;
  wet.position.y = 0.006;
  wet.receiveShadow = true;
  group.add(wet);

  // ── goldfish
  const fishCount = 7;
  const fishMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05 });
  const phase = new Float32Array(fishCount).map((_, i) => i * 1.37);
  const fishGeo = fishGeometry();
  fishGeo.setAttribute("aPhase", new InstancedBufferAttribute(phase, 1));
  fishMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nattribute float aPhase;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float behind = clamp(-transformed.z / 0.085, 0.0, 1.0);
        transformed.x += sin(uTime * 9.0 + aPhase - transformed.z * 40.0) * 0.012 * behind * behind;`,
      );
  };
  fishMat.customProgramCacheKey = () => "fm-fish";
  const fish = new InstancedMesh(fishGeo, fishMat, fishCount);
  fish.frustumCulled = false;
  group.add(fish);
  const fishState = Array.from({ length: fishCount }, (_, i) => ({ r: 0.55 + (i % 3) * 0.28, a: i * 0.9, s: 0.25 + (i % 4) * 0.06, y: 0.14 + (i % 3) * 0.05, dir: i % 2 ? 1 : -1 }));
  const m4 = new Matrix4(), q = new Quaternion(), up = new Vector3(0, 1, 0), pv = new Vector3(), sc = new Vector3(1, 1, 1);

  // ── clay pots of red geraniums on the rim corners (one corner is Khayyam's seat)
  const potScan = propScan("planter_pot_clay");
  const potSpots = [0, 1, 3, 4, 5, 7].map((k) => (k / 8) * Math.PI * 2);
  if (potScan) {
    const pots = new InstancedMesh(potScan.lods[0], potScan.material, potSpots.length);
    potSpots.forEach((a, i) => {
      m4.compose(new Vector3(Math.cos(a) * PR, 0.46, Math.sin(a) * PR), q.setFromAxisAngle(up, i * 1.3), new Vector3(0.62, 0.62, 0.62));
      pots.setMatrixAt(i, m4);
    });
    pots.castShadow = o.shadows;
    pots.receiveShadow = true;
    group.add(pots);
  }
  const plantGeo = geraniumGeometry(17);
  const plants = new InstancedMesh(plantGeo, new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: DoubleSide }), potSpots.length);
  potSpots.forEach((a, i) => {
    m4.compose(new Vector3(Math.cos(a) * PR, 0.46 + (potScan ? 0.12 : 0.05), Math.sin(a) * PR), q.setFromAxisAngle(up, i * 2.1), new Vector3(1, 1, 1).multiplyScalar(0.95 + (i % 3) * 0.07));
    plants.setMatrixAt(i, m4);
  });
  plants.castShadow = o.shadows;
  group.add(plants);

  let lastT = 0;
  return {
    group,
    update(t: number) {
      const dt = Math.min(0.1, Math.max(0, t - lastT));
      lastT = t;
      frame.n++;
      uniforms.uTime.value = t;
      dropMat.uniforms.uScale.value = o.pixelHeight() * 0.95;
      for (let i = 0; i < fishCount; i++) {
        const f = fishState[i];
        f.a += (f.s / f.r) * dt * f.dir;
        const r = f.r + Math.sin(t * 0.21 + i) * 0.12;
        const x = Math.cos(f.a) * r, z = Math.sin(f.a) * r;
        pv.set(x, f.y + Math.sin(t * 0.7 + i) * 0.02, z);
        // face the direction of travel (tangent)
        const heading = Math.atan2(-Math.sin(f.a) * f.dir, Math.cos(f.a) * f.dir);
        q.setFromAxisAngle(up, heading);
        m4.compose(pv, q, sc);
        fish.setMatrixAt(i, m4);
      }
      fish.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}
