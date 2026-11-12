/*
 * Fresh Market 3D — the bazaar gate (sar-dar), built the way the Safavid bazaar gates are:
 *
 *  • a brick pishtaq framed by a tiled border, with a stone plinth and a crenellated (kongereh) crest;
 *  • a tile inscription (katibeh) carrying the shop's name in raised white glaze;
 *  • a four-centred arch in a raised alfiz frame with haft-rang islimi spandrels, a turquoise rope
 *    moulding springing from twisted colonnettes;
 *  • a deep iwan roofed by a muqarnas half-dome — generated tier by tier: each tier is a row of concave
 *    niche cells, every other row offset by half a cell, the plan following the arch profile so the
 *    vault meets the opening exactly, and a sunburst (shamseh) closing the top;
 *  • a studded walnut double door in a marble surround, with the two traditional knockers (the heavy
 *    hammer and the light ring) and a wooden lattice in the tympanum; brass lanterns in the iwan.
 *
 * Local frame: front face at z = 0 facing +z, the iwan going back into -z.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  ConeGeometry,
  CircleGeometry,
  CanvasTexture,
  Vector2,
} from "three";
import { lathe, merge, paint, transformed } from "../util/geo";
import { makeCanvas, toTexture } from "../util/textures";
import { NOISE } from "../util/noise";
import { archHalfWidth, archPoints } from "./arch";
import { PBRSet, PBRName, pbr } from "./realism";
import { PAL, TileSet, bazaarTiles, inscription, islimi, makeTiles, tileMaterial } from "./tilework";

export interface PortalOptions {
  shopTitle: string;
  rtl: boolean;
  shadows: boolean;
  quality: "low" | "medium" | "high";
  sets: Partial<Record<PBRName, PBRSet>>;
  brass: Material;
  glow: Material;
}

// overall size and the arch
const PW = 8.4, PH = 12.5, DEPTH = 1.2;
const AW = 4.6, AS = 6.2, AA = 9.6;
const RR = AW / 2; // iwan plan radius
const RC = -DEPTH; // iwan plan centre (z)
const PLINTH = 1.3;
// the raised alfiz frame round the spandrels (top chosen so the arch apex sits where the islimi
// composition expects it)
const BAND = 0.22;
const FX = AW / 2 + 0.36;
const SP_TOP = AS + (AA + 0.12 - AS) / 0.985; // spandrel panel top
const FRAME_TOP = SP_TOP + BAND / 2;
// the frieze
const INS_Y0 = 10.17, INS_Y1 = 11.13, INS_X = 3.62;
const BORDER = 0.42, BORDER_TOP0 = 11.3, BORDER_TOP1 = 11.72;

type V3 = [number, number, number];

/** a parametric grid surface; front faces turned towards `inside` when given */
function surface(nu: number, nv: number, f: (u: number, v: number) => V3, uvf: (u: number, v: number) => [number, number], inside?: (p: Vector3) => Vector3, colorf?: (u: number, v: number) => Color): BufferGeometry {
  const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      pos.push(...f(u, v));
      uv.push(...uvf(u, v));
      if (colorf) {
        const c = colorf(u, v);
        col.push(c.r, c.g, c.b);
      }
    }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  if (colorf) g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (inside) {
    const P = g.getAttribute("position"), N = g.getAttribute("normal");
    const k = Math.floor(P.count / 2);
    const p = new Vector3().fromBufferAttribute(P, k), n = new Vector3().fromBufferAttribute(N, k);
    if (n.dot(inside(p.clone()).sub(p)) < 0) {
      for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
      g.setIndex(idx);
      g.computeVertexNormals();
    }
  }
  return g;
}

/** a flat strip in the front plane; UVs in texture repeats (u along x, v up) */
function strip(x0: number, x1: number, y0: number, y1: number, z: number, uLen: number, vLen: number, vertical = false): BufferGeometry {
  const g = new PlaneGeometry(x1 - x0, y1 - y0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
  const pos = g.getAttribute("position"), uv = g.getAttribute("uv");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    // vertical bands run their motif up the strip
    if (vertical) uv.setXY(i, (y - y0) / uLen, (x - x0) / vLen);
    else uv.setXY(i, (x - x0) / uLen, (y - y0) / vLen);
  }
  return g;
}

/** UVs in metres for brick / plaster / stone: u along whichever horizontal axis the face runs */
function metreUV(g: BufferGeometry, metres: number) {
  const pos = g.getAttribute("position"), nor = g.getAttribute("normal");
  let uv = g.getAttribute("uv") as Float32BufferAttribute;
  if (!uv) {
    uv = new Float32BufferAttribute(new Float32Array(pos.count * 2), 2);
    g.setAttribute("uv", uv);
  }
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ny > nx && ny > nz) uv.setXY(i, x / metres, z / metres);
    else if (nx > nz) uv.setXY(i, z / metres, y / metres);
    else uv.setXY(i, x / metres, y / metres);
  }
  uv.needsUpdate = true;
  return g;
}

const col = (g: BufferGeometry, hex: string, jitter = 0.06) => {
  const c = new Color(hex);
  return paint(g, (p, _n, _uv, out) => out.copy(c).multiplyScalar(1 - jitter + NOISE.noise(p.x * 6, p.y * 6, p.z * 6) * jitter * 2));
};

// tile sets made for the gate (cached; they only depend on quality and the title)
let spandrelCache: { q: string; set: TileSet } | null = null;
const inscriptionCache = new Map<string, TileSet>();

function portalSpandrel(q: PortalOptions["quality"]) {
  if (spandrelCache?.q === q) return spandrelCache.set;
  const k = q === "high" ? 1 : q === "medium" ? 0.75 : 0.5;
  const W = Math.round(2048 * k), H = Math.round(W * (SP_TOP - AS) / (2 * (FX - BAND / 2)));
  const set = makeTiles(W, H, Math.round(W / 34), islimi, 13, { crazing: 0.35, chips: 0.03 });
  spandrelCache = { q, set };
  return set;
}

function inscriptionTiles(text: string, rtl: boolean, q: PortalOptions["quality"]) {
  const key = `${q}|${rtl}|${text}`;
  const hit = inscriptionCache.get(key);
  if (hit) return hit;
  const k = q === "high" ? 1 : q === "medium" ? 0.75 : 0.5;
  const W = Math.round(2560 * k), H = Math.round((W * (INS_Y1 - INS_Y0)) / (2 * INS_X));
  const { draw, relief } = inscription(text, rtl);
  // ~19 cm tiles, as on the bazaar gates
  const set = makeTiles(W, H, Math.round((W / (2 * INS_X)) * 0.19), draw, 71, { crazing: 0.3, chips: 0.025, relief, reliefHeight: 0.38 });
  inscriptionCache.set(key, set);
  return set;
}

/** the wooden lattice (shabak) for the door's tympanum: eight-point stars in walnut strips */
function latticeTexture(): CanvasTexture {
  const W = 512, H = 256;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = "#5a3a22";
  ctx.lineWidth = 7;
  ctx.lineJoin = "round";
  const cell = 64;
  for (let gy = 0; gy <= H / cell + 1; gy++)
    for (let gx = 0; gx <= W / cell + 1; gx++) {
      const x = gx * cell, y = gy * cell, ro = cell * 0.42, ri = ro * 0.62;
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = i % 2 ? ri : ro;
        i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + ro, y);
      ctx.lineTo(x + cell - ro, y);
      ctx.moveTo(x, y + ro);
      ctx.lineTo(x, y + cell - ro);
      ctx.stroke();
    }
  // a thin highlight along each strip so the wood reads as carved
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = "rgba(255,220,170,0.08)";
  ctx.fillRect(0, 0, W, H);
  return toTexture(c, true, false, 8);
}

export function buildPortal(o: PortalOptions): Group {
  const g = new Group();
  const S = o.sets;
  const shadows = o.shadows;
  const tiles = bazaarTiles(o.quality);

  // ── materials
  const brick = S.brown_brick_02 ? pbr(S.brown_brick_02, [1, 1], { color: new Color("#f2e3cb") }) : new MeshStandardMaterial({ color: "#a8754f", roughness: 0.9 });
  const marble = S.marble_01 ? pbr(S.marble_01, [1, 1], { color: new Color("#f1e9da") }) : new MeshStandardMaterial({ color: "#e8e0cf", roughness: 0.5 });
  const wood = S.weathered_brown_planks
    ? pbr(S.weathered_brown_planks, [1, 1], { color: new Color("#8a6243"), normalStrength: 0.7 })
    : new MeshStandardMaterial({ color: "#5a3a24", roughness: 0.7 });
  const floor = S.brick_floor ? pbr(S.brick_floor, [1, 1]) : new MeshStandardMaterial({ color: "#9a7a5a", roughness: 0.95 });
  const glazed = (hex: string) => new MeshPhysicalMaterial({ color: hex, roughness: 0.25, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.12 });
  const baseMat = new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.12 });
  const borderMat = tileMaterial(tiles.border);
  const girihMat = tileMaterial(tiles.girih);
  const ropeMat = tileMaterial(tiles.rope);
  const spandrelMat = tileMaterial(portalSpandrel(o.quality));
  const insMat = tileMaterial(inscriptionTiles(o.shopTitle || "Bazaar", o.rtl, o.quality));
  const add = (geo: BufferGeometry, mat: Material | Material[], cast = shadows) => {
    const m = new Mesh(geo, mat as any);
    m.castShadow = cast;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  // ── the pishtaq: one brick mass with the arch cut through it
  {
    const s = new Shape();
    s.moveTo(-PW / 2, 0);
    s.lineTo(PW / 2, 0);
    s.lineTo(PW / 2, PH);
    s.lineTo(-PW / 2, PH);
    s.closePath();
    const hole = new Shape();
    [...archPoints(AW, 0, AS, AA, 48)].reverse().forEach(([x, y], i) => (i ? hole.lineTo(x, y) : hole.moveTo(x, y)));
    s.holes.push(hole as any);
    const geo = new ExtrudeGeometry(s, { depth: DEPTH, bevelEnabled: false, curveSegments: 8 });
    geo.translate(0, 0, -DEPTH);
    geo.clearGroups();
    add(metreUV(geo, 1.6), brick);
  }

  // ── wing walls tying the gate into the arcade on either side, so no gap opens onto the fields
  {
    const parts: BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      parts.push(transformed(new BoxGeometry(3.4, 8.3, 1.5), [sx * (PW / 2 + 1.7), 4.15, -1.05]));
      parts.push(transformed(new BoxGeometry(3.5, 0.16, 1.62), [sx * (PW / 2 + 1.7), 8.38, -1.05]));
    }
    add(metreUV(merge(parts), 1.6), brick);
  }

  // ── stone plinth across the front (both sides of the opening) and the jambs' dado
  {
    const parts: BufferGeometry[] = [];
    const w = (PW - AW) / 2 + 0.03;
    for (const sx of [-1, 1]) {
      parts.push(transformed(new BoxGeometry(w, PLINTH, 0.08), [sx * (AW / 2 + w / 2 - 0.015), PLINTH / 2, 0.04]));
      parts.push(transformed(new BoxGeometry(w + 0.02, 0.07, 0.13), [sx * (AW / 2 + w / 2 - 0.015), PLINTH + 0.035, 0.065]));
      parts.push(transformed(new BoxGeometry(0.05, PLINTH, DEPTH), [sx * (AW / 2 - 0.02), PLINTH / 2, -DEPTH / 2]));
    }
    add(metreUV(merge(parts), 1.2), marble);
  }

  // ── tiled soffit of the arch (between the front face and the iwan)
  {
    const pts = archPoints(AW - 0.012, 0, AS, AA - 0.006, 64).map(([x, y]) => [x, Math.max(y, PLINTH)] as [number, number]);
    const len: number[] = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const N = pts.length - 1;
    const geo = surface(
      N,
      2,
      (u, v) => {
        const p = pts[Math.round(u * N)];
        return [p[0], p[1], -v * DEPTH];
      },
      (u, v) => [len[Math.round(u * N)] / 1.6, (v * DEPTH) / 0.4],
      (p) => new Vector3(0, Math.min(p.y, AS) * 0.5 + 0.5, p.z),
    );
    add(geo, girihMat, false);
  }

  // ── colonnettes with twisted glazed shafts, marble bases and capitals
  {
    const shaftH = AS - 0.8;
    const shaft = new CylinderGeometry(0.1, 0.1, shaftH, 40, 72, true);
    const sp = shaft.getAttribute("position");
    const cols: number[] = [];
    const tq = new Color(PAL.turquoise), cb = new Color(PAL.cobalt);
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
      const th = Math.atan2(x, z);
      const ridge = Math.max(0, Math.cos(6 * th - y * 7.5));
      const r = 0.1 + 0.02 * Math.pow(ridge, 1.4);
      sp.setXYZ(i, Math.sin(th) * r, y, Math.cos(th) * r);
      const c = cb.clone().lerp(tq, MathUtils01(ridge * 1.6));
      cols.push(c.r, c.g, c.b);
    }
    shaft.setAttribute("color", new Float32BufferAttribute(cols, 3));
    shaft.computeVertexNormals();
    const base = lathe([[0.17, 0], [0.17, 0.07], [0.14, 0.11], [0.155, 0.2], [0.12, 0.3], [0.105, 0.4]], 28, 10);
    const cap = lathe([[0.105, 0], [0.125, 0.07], [0.115, 0.13], [0.16, 0.25], [0.19, 0.34], [0.19, 0.4]], 28, 10);
    for (const sx of [-1, 1]) {
      const x = sx * (AW / 2 + 0.13), z = 0.1;
      add(transformed(shaft.clone(), [x, 0.4 + shaftH / 2, z]), new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.1 }));
      add(metreUV(transformed(base.clone(), [x, 0, z]), 0.6), marble);
      add(metreUV(transformed(cap.clone(), [x, AS - 0.4, z]), 0.6), marble);
    }
  }

  // ── raised alfiz frame, islimi spandrels and the rope moulding over the arch
  {
    const base: BufferGeometry[] = [], border: BufferGeometry[] = [];
    const h = FRAME_TOP - PLINTH - 0.07;
    for (const sx of [-1, 1]) {
      base.push(col(transformed(new BoxGeometry(BAND, h, 0.06), [sx * FX, PLINTH + 0.07 + h / 2, 0.03]), "#18306f"));
      border.push(strip(-BAND / 2, BAND / 2, 0, h, 0, BAND * 8, BAND, true).translate(sx * FX, PLINTH + 0.07, 0.0605));
    }
    base.push(col(transformed(new BoxGeometry(FX * 2 + BAND, BAND, 0.06), [0, FRAME_TOP - BAND / 2, 0.03]), "#18306f"));
    border.push(strip(-FX - BAND / 2, FX + BAND / 2, FRAME_TOP - BAND, FRAME_TOP, 0.0605, BAND * 8, BAND));
    add(merge(base), baseMat);
    add(merge(border), borderMat);

    const xl = -FX + BAND / 2, xr = FX - BAND / 2, yb = AS, yt = SP_TOP;
    const archPts = archPoints(AW + 0.26, 0, AS, AA + 0.12, 48).filter(([, y]) => y >= yb - 1e-6);
    const shape = new Shape();
    shape.moveTo(xl, yb);
    shape.lineTo(xl, yt);
    shape.lineTo(xr, yt);
    shape.lineTo(xr, yb);
    [...archPts].reverse().forEach(([x, y]) => shape.lineTo(x, y));
    shape.lineTo(xl, yb);
    const sp = new ShapeGeometry(shape, 32);
    const spos = sp.getAttribute("position");
    const suv = new Float32Array(spos.count * 2);
    for (let i = 0; i < spos.count; i++) {
      suv[i * 2] = (spos.getX(i) - xl) / (xr - xl);
      suv[i * 2 + 1] = (spos.getY(i) - yb) / (yt - yb);
    }
    sp.setAttribute("uv", new Float32BufferAttribute(suv, 2));
    sp.translate(0, 0, 0.014);
    add(sp, spandrelMat, false);

    // the rope springs from the colonnette capitals and runs over the arch
    const rp = archPoints(AW + 0.2, 0, AS, AA + 0.1, 64)
      .filter(([, y]) => y >= AS - 0.01)
      .map(([x, y]) => new Vector3(x, y, 0.06));
    const curve = new CatmullRomCurve3(rp, false, "centripetal");
    const tube = new TubeGeometry(curve, 160, 0.07, 12, false);
    const len = curve.getLength();
    const tuv = tube.getAttribute("uv");
    for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getX(i) * (len / 0.55), tuv.getY(i));
    add(tube, ropeMat);
  }

  // ── girih panels on the piers, each in a thin lapis frame
  {
    const panels: BufferGeometry[] = [], frames: BufferGeometry[] = [];
    const x0 = FX + BAND / 2 + 0.14, x1 = PW / 2 - BORDER - 0.14, y0 = PLINTH + 0.22, y1 = FRAME_TOP;
    const cell = (x1 - x0) / 4;
    for (const sx of [-1, 1]) {
      const a = sx < 0 ? -x1 : x0, b = sx < 0 ? -x0 : x1;
      panels.push(strip(a, b, y0, y1, 0.012, cell * 8, cell * 2));
      for (const [cx, w] of [[a - 0.025, 0.05], [b + 0.025, 0.05]] as Array<[number, number]>) frames.push(col(transformed(new BoxGeometry(w, y1 - y0 + 0.1, 0.04), [cx, (y0 + y1) / 2, 0.02]), "#152a6a"));
      for (const y of [y0 - 0.025, y1 + 0.025]) frames.push(col(transformed(new BoxGeometry(b - a + 0.1, 0.05, 0.04), [(a + b) / 2, y, 0.02]), "#152a6a"));
    }
    add(merge(panels), girihMat, false);
    add(merge(frames), baseMat);
  }

  // ── the inscription band, between two rope mouldings
  {
    add(strip(-INS_X, INS_X, INS_Y0, INS_Y1, 0.014, 2 * INS_X, INS_Y1 - INS_Y0), insMat, false);
    add(col(transformed(new BoxGeometry(2 * INS_X + 0.1, INS_Y1 - INS_Y0 + 0.1, 0.012), [0, (INS_Y0 + INS_Y1) / 2, 0.006]), "#152a6a"), baseMat);
    const ropes: BufferGeometry[] = [];
    for (const y of [INS_Y0 - 0.06, INS_Y1 + 0.06]) {
      const tube = new TubeGeometry(new CatmullRomCurve3([new Vector3(-INS_X - 0.05, y, 0.05), new Vector3(INS_X + 0.05, y, 0.05)]), 64, 0.05, 10, false);
      const tuv = tube.getAttribute("uv");
      for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getX(i) * ((2 * INS_X) / 0.45), tuv.getY(i));
      ropes.push(tube);
    }
    add(merge(ropes), ropeMat);
  }

  // ── outer tiled border, muqarnas teeth, stone ledge and the brick crest (kongereh)
  {
    const bands: BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      const a = sx < 0 ? -PW / 2 + 0.08 : PW / 2 - 0.08 - BORDER;
      bands.push(strip(a, a + BORDER, PLINTH + 0.07, BORDER_TOP1, 0.012, BORDER * 8, BORDER, true));
    }
    bands.push(strip(-PW / 2 + 0.08, PW / 2 - 0.08, BORDER_TOP0, BORDER_TOP1, 0.0135, BORDER * 8, BORDER_TOP1 - BORDER_TOP0));
    add(merge(bands), borderMat, false);
    const base: BufferGeometry[] = [];
    const n = Math.round((PW - 0.2) / 0.2);
    for (let i = 0; i < n; i++) {
      const x = -PW / 2 + 0.1 + (i + 0.5) * ((PW - 0.2) / n);
      const tooth = new ConeGeometry(0.095, 0.22, 4, 1);
      tooth.rotateY(Math.PI / 4);
      tooth.rotateX(Math.PI);
      base.push(col(transformed(tooth, [x, BORDER_TOP1 + 0.13, 0.09]), i % 2 ? PAL.turquoise : PAL.cobalt, 0.08));
    }
    add(merge(base), baseMat);
    const ledge = merge([
      transformed(new BoxGeometry(PW + 0.16, 0.14, 0.34), [0, BORDER_TOP1 + 0.31, 0.1]),
      transformed(new BoxGeometry(PW + 0.08, 0.06, 0.24), [0, BORDER_TOP1 + 0.21, 0.06]),
    ]);
    add(metreUV(ledge, 1.2), marble);
    // stepped merlons along the top
    const crest: BufferGeometry[] = [];
    const m = Math.round(PW / 0.52);
    for (let i = 0; i < m; i++) {
      const x = -PW / 2 + (i + 0.5) * (PW / m);
      crest.push(transformed(new BoxGeometry(0.34, 0.22, 0.34), [x, PH + 0.11, -0.2]));
      crest.push(transformed(new BoxGeometry(0.22, 0.16, 0.3), [x, PH + 0.3, -0.2]));
      crest.push(transformed(new ConeGeometry(0.11, 0.14, 4, 1), [x, PH + 0.45, -0.2], [0, Math.PI / 4, 0]));
    }
    add(metreUV(merge(crest), 1.6), brick);
  }

  // ── the iwan: marble dado and tiled walls on a half-round plan
  const wallAt = (phi: number, r: number, y: number): V3 => [Math.cos(phi) * r, y, RC - Math.sin(phi) * r];
  const towardsAxis = (p: Vector3) => new Vector3(0, p.y, RC);
  {
    const arc = Math.PI * RR;
    add(surface(48, 1, (u, v) => wallAt(u * Math.PI, RR, v * PLINTH), (u, v) => [(u * arc) / 1.2, (v * PLINTH) / 1.2], towardsAxis), marble);
    add(surface(48, 1, (u, v) => wallAt(u * Math.PI, RR - 0.005, PLINTH + v * (AS - PLINTH - 0.2)), (u, v) => [(u * arc) / 1.6, (v * (AS - PLINTH - 0.2)) / 0.4], towardsAxis), girihMat, false);
    add(surface(48, 1, (u, v) => wallAt(u * Math.PI, RR - 0.01, AS - 0.2 + v * 0.2), (u, v) => [(u * arc) / 1.6, v], towardsAxis), borderMat, false);
    // floor: brick paving through the opening and into the iwan, a short apron outside
    const fl = new CircleGeometry(RR, 32, 0, Math.PI);
    fl.rotateX(-Math.PI / 2);
    fl.translate(0, 0.006, RC);
    const tunnel = new PlaneGeometry(AW, DEPTH + 1.8);
    tunnel.rotateX(-Math.PI / 2);
    tunnel.translate(0, 0.006, RC + (DEPTH + 1.8) / 2);
    const apron = new PlaneGeometry(PW, 1.6);
    apron.rotateX(-Math.PI / 2);
    apron.translate(0, 0.004, 0.8);
    add(metreUV(merge([fl, tunnel, apron]), 1.4), floor, false);
  }

  // ── muqarnas half-dome: concave niche cells in staggered tiers following the arch profile
  {
    const half = archHalfWidth(AW, AS, AA);
    const tiers = o.quality === "low" ? 5 : 7;
    const yTop = AA - 0.5;
    const ys = Array.from({ length: tiers + 1 }, (_, i) => AS + (yTop - AS) * Math.pow(i / tiers, 0.92));
    const cells: BufferGeometry[] = [];
    const C = {
      cobalt: new Color(PAL.cobalt),
      turq: new Color(PAL.turquoise),
      white: new Color(PAL.white),
      ochre: new Color(PAL.ochre),
    };
    const nu = o.quality === "low" ? 4 : 6, nv = o.quality === "low" ? 4 : 6;
    for (let t = 0; t < tiers; t++) {
      const ya = ys[t], yb = ys[t + 1];
      const m = Math.max(2, Math.round((Math.PI * half(ya)) / 0.62));
      const dPhi = Math.PI / m;
      const off = t % 2 ? 0.5 : 0;
      const depth = 0.1 + 0.14 * (half(ya) / RR);
      for (let k = -1; k <= m; k++) {
        const p0 = Math.max(0, (k + off) * dPhi), p1 = Math.min(Math.PI, (k + 1 + off) * dPhi);
        if (p1 - p0 < 1e-3) continue;
        const kind = (k + t * 2 + 6) % 3;
        const body = kind === 0 ? C.cobalt : kind === 1 ? C.turq : C.white;
        const rim = kind === 2 ? C.ochre : C.white;
        const cellArc = (p1 - p0) * half(ya);
        cells.push(
          surface(
            nu,
            nv,
            (u, v) => {
              const y = ya + (yb - ya) * v;
              // sharp ridges between niches, and a hood: the niche is deepest high up, under its arch
              const prof = 1 - Math.pow(Math.abs(2 * u - 1), 1.1);
              const hood = Math.pow(v, 0.65) * Math.pow(1 - v, 0.3) * 1.85;
              return wallAt(p0 + (p1 - p0) * u, half(y) + depth * prof * hood, y);
            },
            (u, v) => [(u * cellArc) / 0.6, (v * (yb - ya)) / 0.3],
            towardsAxis,
            (u, v) => {
              const edge = Math.max(Math.abs(2 * u - 1), Math.abs(2 * v - 1));
              const prof = (1 - Math.pow(Math.abs(2 * u - 1), 1.1)) * Math.pow(v, 0.65) * Math.pow(1 - v, 0.3) * 1.85;
              const c = body.clone().lerp(rim, MathUtils01((edge - 0.9) / 0.08) * 0.8);
              // a little baked occlusion deep in each hood
              return c.multiplyScalar(0.9 - 0.22 * prof + NOISE.noise(u * 3 + k, v * 3 + t, 7) * 0.04);
            },
          ).toNonIndexed(),
        );
      }
    }
    // the shamseh closing the vault: a sunburst of turquoise and white rays round a gold heart
    cells.push(
      surface(
        36,
        6,
        (u, v) => {
          const y = yTop + (AA - yTop) * v;
          return wallAt(u * Math.PI, half(y), y);
        },
        (u, v) => [u * 3, v],
        towardsAxis,
        (u, v) => (v > 0.7 ? C.ochre.clone() : Math.floor(u * 18) % 2 ? C.turq.clone() : C.white.clone()).multiplyScalar(0.92),
      ),
    );
    // (normals come from each cell: smooth inside a niche, crisp between niches)
    const dome = merge(cells);
    add(dome, new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.3, normalMap: tiles.girih.normalMap, normalScale: new Vector2(0.25, 0.25), envMapIntensity: 0.7, side: DoubleSide }), false);
  }

  // ── the door: marble surround, two studded walnut leaves, knockers and a lattice tympanum
  {
    const DW = 2.3, DS = 3.5, DA = 4.45; // opening width, springing, apex
    const front = RC - Math.sqrt(RR * RR - 1.52 * 1.52) + 0.02;
    const sur = new Shape();
    sur.moveTo(-1.52, 0);
    sur.lineTo(1.52, 0);
    sur.lineTo(1.52, 4.95);
    sur.lineTo(-1.52, 4.95);
    sur.closePath();
    const h = new Shape();
    [...archPoints(DW, 0, DS, DA, 32)].reverse().forEach(([x, y], i) => (i ? h.lineTo(x, y) : h.moveTo(x, y)));
    sur.holes.push(h as any);
    const sd = 0.7;
    const sg = new ExtrudeGeometry(sur, { depth: sd, bevelEnabled: false, curveSegments: 8 });
    sg.translate(0, 0, front - sd);
    sg.clearGroups();
    add(metreUV(sg, 1.2), marble);
    // a turquoise rope round the door arch
    const rp = archPoints(DW + 0.14, 0.05, DS, DA + 0.07, 40).map(([x, y]) => new Vector3(x, y, front + 0.03));
    const rc = new CatmullRomCurve3(rp, false, "centripetal");
    const rt = new TubeGeometry(rc, 120, 0.045, 10, false);
    const ruv = rt.getAttribute("uv");
    for (let i = 0; i < ruv.count; i++) ruv.setXY(i, ruv.getX(i) * (rc.getLength() / 0.45), ruv.getY(i));
    add(rt, ropeMat);

    const leafZ = front - 0.36;
    const leafW = DW / 2 - 0.01, leafH = DS - 0.02, T = 0.08;
    const woodParts: BufferGeometry[] = [];
    const studs: Matrix4[] = [];
    const stud = (x: number, y: number, z: number) => studs.push(new Matrix4().makeTranslation(x, y, z));
    for (const sx of [-1, 1]) {
      const cx = sx * (DW / 4);
      woodParts.push(transformed(new BoxGeometry(leafW, leafH, T), [cx, leafH / 2 + 0.01, leafZ]));
      // raised frame: stiles, a centre muntin and four rails, all studded
      const zf = leafZ + T / 2 + 0.018;
      for (const x of [cx - leafW / 2 + 0.05, cx + leafW / 2 - 0.05]) woodParts.push(transformed(new BoxGeometry(0.1, leafH, 0.036), [x, leafH / 2 + 0.01, zf]));
      woodParts.push(transformed(new BoxGeometry(0.07, leafH, 0.03), [cx, leafH / 2 + 0.01, zf]));
      for (const y of [0.12, 1.25, 2.35, leafH - 0.06]) {
        woodParts.push(transformed(new BoxGeometry(leafW, 0.1, 0.036), [cx, y, zf]));
        for (let x = cx - leafW / 2 + 0.06; x <= cx + leafW / 2 - 0.05; x += 0.13) stud(x, y, zf + 0.02);
      }
      for (const x of [cx - leafW / 2 + 0.05, cx + leafW / 2 - 0.05]) for (let y = 0.3; y < leafH - 0.1; y += 0.22) stud(x, y, zf + 0.02);
    }
    // the meeting strip over the joint
    woodParts.push(transformed(new BoxGeometry(0.06, leafH, 0.05), [0, leafH / 2 + 0.01, leafZ + T / 2 + 0.03]));
    // transom bar under the tympanum
    woodParts.push(transformed(new BoxGeometry(DW, 0.12, 0.12), [0, DS + 0.02, leafZ]));
    add(metreUV(merge(woodParts), 1.4), wood);
    const studGeo = new SphereGeometry(0.021, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    studGeo.rotateX(Math.PI / 2);
    const st = new InstancedMesh(studGeo, o.brass, studs.length);
    studs.forEach((mm, i) => st.setMatrixAt(i, mm));
    g.add(st);
    // knockers: the heavy hammer (left leaf) and the light ring (right leaf), on round back plates
    const zk = leafZ + T / 2 + 0.04;
    const knock: BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      const x = sx * 0.17;
      knock.push(transformed(new CylinderGeometry(0.065, 0.065, 0.012, 24), [x, 1.5, zk], [Math.PI / 2, 0, 0]));
      knock.push(transformed(new SphereGeometry(0.018, 10, 8), [x, 1.56, zk + 0.02]));
    }
    knock.push(transformed(new CylinderGeometry(0.013, 0.02, 0.2, 10), [-0.17, 1.46, zk + 0.035]));
    knock.push(transformed(new SphereGeometry(0.032, 12, 10), [-0.17, 1.35, zk + 0.035]));
    knock.push(transformed(new TorusGeometry(0.07, 0.011, 8, 28), [0.17, 1.49, zk + 0.03]));
    g.add(new Mesh(merge(knock), o.brass));
    // the tympanum: carved lattice in front of the dark passage
    const tp = archPoints(DW, 0, DS, DA, 32).filter(([, y]) => y >= DS + 0.07);
    const ts = new Shape();
    ts.moveTo(-DW / 2, DS + 0.08);
    tp.forEach(([x, y]) => ts.lineTo(x, y));
    ts.lineTo(DW / 2, DS + 0.08);
    const tg = new ShapeGeometry(ts, 16);
    const tpos = tg.getAttribute("position");
    const tuv = new Float32Array(tpos.count * 2);
    for (let i = 0; i < tpos.count; i++) {
      tuv[i * 2] = ((tpos.getX(i) + DW / 2) / DW) * 2;
      tuv[i * 2 + 1] = (tpos.getY(i) - DS) / (DA - DS);
    }
    tg.setAttribute("uv", new Float32BufferAttribute(tuv, 2));
    const lattice = new Mesh(tg.clone().translate(0, 0, leafZ + 0.02), new MeshStandardMaterial({ map: latticeTexture(), alphaTest: 0.5, roughness: 0.75, side: DoubleSide }));
    g.add(lattice);
    g.add(new Mesh(tg.translate(0, 0, leafZ - 0.15), new MeshBasicMaterial({ color: "#120c08" })));
  }

  // ── brass lanterns hanging in the iwan
  {
    const body = merge([
      transformed(new CylinderGeometry(0.14, 0.17, 0.06, 12), [0, -0.22, 0]),
      transformed(new ConeGeometry(0.17, 0.2, 12), [0, 0.16, 0]),
      transformed(new SphereGeometry(0.03, 8, 6), [0, 0.28, 0]),
      transformed(new TorusGeometry(0.14, 0.014, 6, 18), [0, -0.16, 0], [Math.PI / 2, 0, 0]),
      transformed(new CylinderGeometry(0.006, 0.006, 1.2, 4), [0, 0.88, 0]),
    ]);
    for (const sx of [-1, 1]) {
      const p = new Vector3(sx * 1.05, 4.75, RC - 0.9);
      const b = new Mesh(body, o.brass);
      b.position.copy(p);
      const glass = new Mesh(new CylinderGeometry(0.11, 0.13, 0.3, 12), o.glow);
      glass.position.copy(p);
      g.add(b, glass);
    }
  }

  return g;
}

function MathUtils01(x: number) {
  return Math.min(1, Math.max(0, x));
}
