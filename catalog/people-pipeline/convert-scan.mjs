// Poly Haven scanned model (glTF 1k) → compact "FMP1" pack with one or more LODs.
// Simplification uses three's SimplifyModifier (meshoptimizer bundled with three, UV/normal aware).
// usage: node convert-scan.mjs <scan dir with model.gltf> <out.bin> <id> <tris per LOD, e.g. 480,3000>
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { THREE, THREE_ROOT, writePack } from "./boot.mjs";

const { MeshoptSimplifier } = await import(pathToFileURL(THREE_ROOT + "/examples/jsm/libs/meshopt_simplifier.module.js").href);
await MeshoptSimplifier.ready;

/**
 * Simplify while keeping UV seams exactly in place: on scans every texture seam is a topological
 * border (seam vertices are split), so LockBorder stops triangles from stretching across UV islands.
 */
function simplifyLocked(geo, targetTris) {
  const P = geo.getAttribute("position"), N = geo.getAttribute("normal"), U = geo.getAttribute("uv");
  const n = P.count;
  const pos = new Float32Array(n * 3), attr = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) {
    pos.set([P.getX(i), P.getY(i), P.getZ(i)], i * 3);
    attr.set([N.getX(i), N.getY(i), N.getZ(i), U.getX(i), U.getY(i)], i * 5);
  }
  const index = new Uint32Array(geo.index.array);
  const target = Math.max(3, Math.floor(targetTris) * 3);
  const [indices] = MeshoptSimplifier.simplifyWithAttributes(index, pos, 3, attr, 5, [0.3, 0.3, 0.3, 1, 1], null, target, 0.02, ["LockBorder"]);
  const [remap, unique] = MeshoptSimplifier.compactMesh(indices);
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    const a = geo.getAttribute(name);
    const arr = new Float32Array(unique * a.itemSize);
    for (let i = 0; i < remap.length; i++) {
      const t = remap[i];
      if (t === 0xffffffff) continue;
      for (let k = 0; k < a.itemSize; k++) arr[t * a.itemSize + k] = a.getComponent(i, k);
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  return out;
}

const [, , dir, output, id, lodArg] = process.argv;
const lods = (lodArg || "3000").split(",").map(Number);
const gltf = JSON.parse(fs.readFileSync(path.join(dir, "model.gltf"), "utf8"));
const bin = fs.readFileSync(path.join(dir, gltf.buffers[0].uri));

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(i) {
  const a = gltf.accessors[i];
  const bv = gltf.bufferViews[a.bufferView];
  const C = COMP[a.componentType];
  const n = SIZE[a.type];
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const stride = bv.byteStride || n * C.BYTES_PER_ELEMENT;
  const out = new C(a.count * n);
  for (let k = 0; k < a.count; k++) {
    const src = new C(bin.buffer, bin.byteOffset + off + k * stride, n);
    out.set(src, k * n);
  }
  return out;
}

// world transforms (all scans are single-node, but be correct anyway)
const geos = [];
function visit(ni, parent) {
  const node = gltf.nodes[ni];
  const m = new THREE.Matrix4();
  if (node.matrix) m.fromArray(node.matrix);
  else m.compose(new THREE.Vector3(...(node.translation || [0, 0, 0])), new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(node.scale || [1, 1, 1])));
  const world = parent.clone().multiply(m);
  if (node.mesh != null)
    for (const prim of gltf.meshes[node.mesh].primitives) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(accessor(prim.attributes.POSITION), 3));
      if (prim.attributes.NORMAL != null) g.setAttribute("normal", new THREE.BufferAttribute(accessor(prim.attributes.NORMAL), 3));
      if (prim.attributes.TEXCOORD_0 != null) g.setAttribute("uv", new THREE.BufferAttribute(accessor(prim.attributes.TEXCOORD_0), 2));
      if (prim.indices != null) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(accessor(prim.indices)), 1));
      g.applyMatrix4(world);
      geos.push(g);
    }
  (node.children || []).forEach((c) => visit(c, world));
}
(gltf.scenes[gltf.scene || 0].nodes || []).forEach((n) => visit(n, new THREE.Matrix4()));
let geo = geos.length > 1 ? (await import(pathToFileURL(THREE_ROOT + "/examples/jsm/utils/BufferGeometryUtils.js").href)).mergeGeometries(geos) : geos[0];

// rest on the ground, centred
geo.computeBoundingBox();
const bb = geo.boundingBox;
const c = new THREE.Vector3();
bb.getCenter(c);
geo.translate(-c.x, -bb.min.y, -c.z);
geo.computeBoundingBox();
const size = new THREE.Vector3();
geo.boundingBox.getSize(size);

const sections = {};
const lodInfo = [];
const srcTris = geo.index.count / 3;
for (let li = 0; li < lods.length; li++) {
  let g = geo;
  const target = lods[li];
  if (srcTris > target * 1.05) g = simplifyLocked(geo, target);
  const P = g.getAttribute("position"), N = g.getAttribute("normal"), U = g.getAttribute("uv");
  const n = P.count;
  const pmin = [Infinity, Infinity, Infinity], pmax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
    const v = P.getComponent(i, k);
    pmin[k] = Math.min(pmin[k], v);
    pmax[k] = Math.max(pmax[k], v);
  }
  const pos = new Uint16Array(n * 3);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) pos[i * 3 + k] = Math.round(((P.getComponent(i, k) - pmin[k]) / (pmax[k] - pmin[k] || 1)) * 65535);
  const nor = new Int8Array(n * 3);
  const v3 = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v3.fromBufferAttribute(N, i).normalize();
    nor[i * 3] = Math.round(v3.x * 127);
    nor[i * 3 + 1] = Math.round(v3.y * 127);
    nor[i * 3 + 2] = Math.round(v3.z * 127);
  }
  const umin = [Infinity, Infinity], umax = [-Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) {
    const v = U.getComponent(i, k);
    umin[k] = Math.min(umin[k], v);
    umax[k] = Math.max(umax[k], v);
  }
  const uv = new Uint16Array(n * 2);
  for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) uv[i * 2 + k] = Math.round(((U.getComponent(i, k) - umin[k]) / (umax[k] - umin[k] || 1)) * 65535);
  const idx = n > 65535 ? Uint32Array.from(g.index.array) : Uint16Array.from(g.index.array);
  sections[`p${li}`] = pos;
  sections[`n${li}`] = nor;
  sections[`u${li}`] = uv;
  sections[`i${li}`] = idx;
  lodInfo.push({ tris: idx.length / 3, vertices: n, pmin, pmax, umin, umax });
}

const mat = gltf.materials[0] || {};
const pbr = mat.pbrMetallicRoughness || {};
const mrImage = pbr.metallicRoughnessTexture ? gltf.images[gltf.textures[pbr.metallicRoughnessTexture.index].source].uri : "";
const header = {
  version: 1,
  id,
  size: size.toArray(),
  metal: pbr.metallicFactor === 0 ? 0 : /arm/.test(mrImage) ? 1 : 0,
  lods: lodInfo,
};
const bytes = writePack(output, header, sections);
console.log(id.padEnd(22), (bytes / 1024).toFixed(0).padStart(4) + "KB", "src", srcTris, "→", lodInfo.map((l) => l.tris).join("/"), "size(cm)", size.toArray().map((v) => (v * 100).toFixed(1)).join("×"), "metal", header.metal);
