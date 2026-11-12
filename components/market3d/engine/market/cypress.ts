/*
 * Fresh Market 3D — Persian cypress (sarv), built like a game tree:
 * a dark inner core plus hundreds of alpha-tested foliage sprays arranged in the narrow flame-shaped
 * crown, with volumetric (crown-normal) lighting, depth-correct shadows and a gentle wind sway.
 */
import {
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  MeshDepthMaterial,
  MeshStandardMaterial,
  Quaternion,
  RGBADepthPacking,
  Vector3,
} from "three";
import { lathe, merge, paint } from "../util/geo";
import { makeCanvas, toTexture } from "../util/textures";
import { NOISE, Rng, smoothstep } from "../util/noise";

const HEIGHT = 6.8;
const RMAX = 0.78;

/** crown radius at height fraction t (0 = bottom of the crown, 1 = tip) */
function crown(t: number) {
  return RMAX * Math.pow(Math.max(0, 1 - t), 0.82) * (0.35 + 0.65 * smoothstep(0, 0.14, t));
}

function sprayTexture(): CanvasTexture {
  const W = 256, H = 256;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  const rng = new Rng(17);
  const leaf = (x: number, y: number, s: number, ang: number, l: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = `hsl(${rng.range(92, 112)}, ${rng.range(32, 48)}%, ${l}%)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.55, s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  // a fan of upright fronds, each covered in tiny overlapping scale leaves
  for (let f = 0; f < 9; f++) {
    const a0 = -Math.PI / 2 + rng.range(-0.75, 0.75);
    const len = rng.range(120, 230);
    let x = W / 2 + rng.range(-30, 30), y = H - 4;
    let a = a0;
    for (let s = 0; s < len; s += 2.6) {
      const k = s / len;
      a += rng.range(-0.05, 0.05);
      x += Math.cos(a) * 2.6;
      y += Math.sin(a) * 2.6;
      const size = 6.5 * (1 - k * 0.7);
      leaf(x, y, size, a + Math.PI / 2 + rng.range(-0.5, 0.5), 13 + k * 16 + rng.range(-3, 3));
      // side branchlets
      if (s % 14 < 2.6 && k < 0.85) {
        const side = rng.next() < 0.5 ? -1 : 1;
        let bx = x, by = y, ba = a + side * rng.range(0.5, 0.9);
        const bl = rng.range(16, 38) * (1 - k * 0.6);
        for (let t = 0; t < bl; t += 2.4) {
          bx += Math.cos(ba) * 2.4;
          by += Math.sin(ba) * 2.4;
          ba -= side * 0.03;
          leaf(bx, by, 4.2 * (1 - t / bl * 0.6), ba + Math.PI / 2, 16 + (t / bl) * 14 + k * 8);
        }
      }
    }
  }
  return toTexture(c, true, false, 8);
}

function cardsGeometry(seed: number): BufferGeometry {
  const rng = new Rng(seed);
  const N = 620;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [];
  const idx: number[] = [];
  const up = new Vector3(0, 1, 0);
  const radial = new Vector3(), side = new Vector3(), cup = new Vector3(), cn = new Vector3(), vn = new Vector3();
  const base = 0.5;
  for (let i = 0; i < N; i++) {
    const t = Math.pow(rng.next(), 0.92);
    const a = rng.range(0, Math.PI * 2);
    const r = crown(t);
    const depth = 0.55 + 0.45 * Math.sqrt(rng.next());
    radial.set(Math.cos(a), 0, Math.sin(a));
    const cx = radial.x * r * depth, cz = radial.z * r * depth, cy = base + t * HEIGHT;
    const w = rng.range(0.42, 0.66) * (1 - t * 0.45);
    const h = rng.range(0.55, 0.85) * (1 - t * 0.4);
    // the card faces outwards (± a little), fronds pointing up and slightly out
    const yaw = a + rng.range(-0.6, 0.6);
    cn.set(Math.cos(yaw), 0, Math.sin(yaw));
    side.crossVectors(up, cn).normalize();
    cup.copy(up).addScaledVector(radial, rng.range(0.05, 0.35)).normalize();
    // smooth, volumetric lighting: crown normal blended with up
    vn.copy(radial).multiplyScalar(0.8).addScaledVector(up, 0.35 + t * 0.4).normalize();
    const shade = (0.42 + 0.58 * depth) * (0.8 + 0.2 * t) * (0.9 + NOISE.noise(cx * 3, cy * 2, cz * 3) * 0.12);
    const v0 = pos.length / 3;
    for (const [su, sv] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]) {
      pos.push(cx + side.x * su * w + cup.x * (sv - 0.2) * h, cy + cup.y * (sv - 0.2) * h, cz + side.z * su * w + cup.z * (sv - 0.2) * h);
      nor.push(vn.x, vn.y, vn.z);
      uv.push(su + 0.5, sv);
      col.push(shade, shade, shade);
    }
    idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function coreGeometry(): BufferGeometry {
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    prof.push([crown(t) * 0.72, 0.5 + t * HEIGHT * 0.97]);
  }
  prof.push([0, 0.5 + HEIGHT * 0.98]);
  prof.unshift([0, 0.45]);
  const g = lathe(prof, 18, 30);
  paint(g, (p, _n, _uv, out) => out.setRGB(0.05, 0.075, 0.035).multiplyScalar(0.8 + NOISE.noise(p.x * 4, p.y * 2, p.z * 4) * 0.2));
  const trunk = new CylinderGeometry(0.07, 0.11, 0.7, 8);
  trunk.translate(0, 0.35, 0);
  paint(trunk, (_p, _n, _uv, out) => out.setRGB(0.2, 0.14, 0.09));
  return merge([g, trunk]);
}

export function buildCypresses(spots: Array<[number, number]>, shadows: boolean) {
  const group = new Group();
  const tex = sprayTexture();
  const uniforms = { uTime: { value: 0 } };
  const sway = (m: MeshStandardMaterial | MeshDepthMaterial) => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
          #else
            float ph = 0.0;
          #endif
          float hh = max(0.0, position.y - 0.6);
          float bend = hh * hh * 0.0016;
          transformed.x += (sin(uTime * 0.9 + ph) + 0.35 * sin(uTime * 2.3 + ph * 2.0)) * bend;
          transformed.z += (cos(uTime * 0.7 + ph) * 0.6) * bend;`,
        );
    };
    m.customProgramCacheKey = () => "cypress-sway";
  };
  const leafMat = new MeshStandardMaterial({ map: tex, alphaTest: 0.42, side: DoubleSide, vertexColors: true, roughness: 0.82, metalness: 0, envMapIntensity: 0.55 });
  sway(leafMat);
  const coreMat = new MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: 0.3 });
  sway(coreMat);
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, map: tex, alphaTest: 0.42 });
  sway(depth);
  const variants = [cardsGeometry(11), cardsGeometry(29)];
  const core = coreGeometry();
  const mk = (geo: BufferGeometry, mat: MeshStandardMaterial, list: number[]) => {
    const im = new InstancedMesh(geo, mat, list.length);
    list.forEach((si, k) => {
      const [x, z] = spots[si];
      const s = 0.92 + (si % 3) * 0.07;
      im.setMatrixAt(k, new Matrix4().compose(new Vector3(x, 0, z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), si * 1.7), new Vector3(s, s * (1 + (si % 2) * 0.06), s)));
    });
    im.castShadow = shadows;
    im.receiveShadow = true;
    if (mat === leafMat) im.customDepthMaterial = depth;
    group.add(im);
    return im;
  };
  const even = spots.map((_, i) => i).filter((i) => i % 2 === 0);
  const odd = spots.map((_, i) => i).filter((i) => i % 2 === 1);
  if (even.length) mk(variants[0], leafMat, even);
  if (odd.length) mk(variants[1], leafMat, odd);
  mk(core, coreMat, spots.map((_, i) => i));
  return {
    group,
    update(t: number) {
      uniforms.uTime.value = t;
    },
  };
}
