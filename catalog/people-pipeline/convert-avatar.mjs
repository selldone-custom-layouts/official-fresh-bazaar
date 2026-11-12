// Rocketbox avatar FBX → compact "FMP1" pack (indexed, quantized skinned mesh + skeleton).
// usage: node convert-avatar.mjs <in.fbx> <out.bin>
import { THREE, BGU, loadFBX, writePack } from "./boot.mjs";

const [, , input, output] = process.argv;
const root = loadFBX(input);
let mesh = null;
root.traverse((o) => {
  if (o.isSkinnedMesh && !mesh) mesh = o;
});
if (!mesh) throw new Error("no skinned mesh");
const top = root.children.find((c) => c.isBone);
const bones = [];
top.traverse((o) => o.isBone && bones.push(o));
const boneIndex = new Map(bones.map((b, i) => [b, i]));
const sk = mesh.skeleton;
const remap = sk.bones.map((b) => boneIndex.get(b));

// geometry: index it, group triangles by material kind
let g = mesh.geometry.clone();
for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv", "skinIndex", "skinWeight"].includes(k)) g.deleteAttribute(k);
const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
const kindOf = (m) => (/opacity/i.test(m.name) ? "hair" : /head/i.test(m.name) ? "head" : "body");
const groups = g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
g = BGU.mergeVertices(g, 1e-4);
const srcIndex = g.index.array;
const byKind = { body: [], head: [], hair: [] };
for (const gr of groups) {
  const kind = kindOf(mats[gr.materialIndex] || mats[0]);
  for (let i = gr.start; i < gr.start + gr.count; i++) byKind[kind].push(srcIndex[i]);
}
const outGroups = [];
const order = [];
for (const kind of ["body", "head", "hair"]) {
  if (!byKind[kind].length) continue;
  outGroups.push({ kind, start: order.length, count: byKind[kind].length });
  order.push(...byKind[kind]);
}
const vcount = g.attributes.position.count;
if (vcount > 65535) throw new Error("too many vertices " + vcount);
const index = Uint16Array.from(order);

const P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
const pmin = [Infinity, Infinity, Infinity], pmax = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < vcount; i++) for (let k = 0; k < 3; k++) {
  const v = P.array[i * 3 + k];
  pmin[k] = Math.min(pmin[k], v);
  pmax[k] = Math.max(pmax[k], v);
}
const pos = new Uint16Array(vcount * 3);
for (let i = 0; i < vcount; i++) for (let k = 0; k < 3; k++) pos[i * 3 + k] = Math.round(((P.array[i * 3 + k] - pmin[k]) / (pmax[k] - pmin[k] || 1)) * 65535);
const nor = new Int8Array(vcount * 3);
const n = new THREE.Vector3();
for (let i = 0; i < vcount; i++) {
  n.fromBufferAttribute(N, i).normalize();
  nor[i * 3] = Math.round(n.x * 127);
  nor[i * 3 + 1] = Math.round(n.y * 127);
  nor[i * 3 + 2] = Math.round(n.z * 127);
}
const umin = [Infinity, Infinity], umax = [-Infinity, -Infinity];
for (let i = 0; i < vcount; i++) for (let k = 0; k < 2; k++) {
  const v = UV.array[i * 2 + k];
  umin[k] = Math.min(umin[k], v);
  umax[k] = Math.max(umax[k], v);
}
const uv = new Uint16Array(vcount * 2);
for (let i = 0; i < vcount; i++) for (let k = 0; k < 2; k++) uv[i * 2 + k] = Math.round(((UV.array[i * 2 + k] - umin[k]) / (umax[k] - umin[k] || 1)) * 65535);
const si = new Uint8Array(vcount * 4), sw = new Uint8Array(vcount * 4);
for (let i = 0; i < vcount; i++) {
  const w = [SW.getX(i), SW.getY(i), SW.getZ(i), SW.getW(i)];
  const ids = [SI.getX(i), SI.getY(i), SI.getZ(i), SI.getW(i)].map((x) => remap[x] ?? 0);
  const tot = w.reduce((a, b) => a + b, 0) || 1;
  let q = w.map((x) => Math.round((x / tot) * 255));
  const diff = 255 - q.reduce((a, b) => a + b, 0);
  const big = q.indexOf(Math.max(...q));
  q[big] += diff;
  for (let k = 0; k < 4; k++) {
    si[i * 4 + k] = q[k] > 0 ? ids[k] : 0;
    sw[i * 4 + k] = q[k];
  }
}

// skeleton
const inv = new Float32Array(bones.length * 16);
bones.forEach((b, i) => {
  const k = sk.bones.indexOf(b);
  const m = k >= 0 ? sk.boneInverses[k] : b.matrixWorld.clone().invert();
  inv.set(m.elements, i * 16);
});
const boneHeader = bones.map((b) => ({
  n: b.name,
  p: b.parent && b.parent.isBone ? boneIndex.get(b.parent) : -1,
  t: b.position.toArray().map((v) => +v.toFixed(5)),
  q: b.quaternion.toArray().map((v) => +v.toFixed(7)),
  s: b.scale.toArray().map((v) => +v.toFixed(5)),
}));
const hipWorld = new THREE.Vector3();
top.getWorldPosition(hipWorld);
const prefix = (mats[0].name.match(/^([a-z]+\d+)/i) || [])[1] || "";
const header = {
  version: 1,
  prefix,
  vertices: vcount,
  triangles: index.length / 3,
  pmin, pmax, umin, umax,
  groups: outGroups,
  bones: boneHeader,
  bindMatrix: mesh.bindMatrix.elements.map((v) => +v.toFixed(7)),
  meshMatrix: mesh.matrix.elements.map((v) => +v.toFixed(7)),
  rootMatrix: top.parent === root ? null : top.parent.matrixWorld.elements,
  height: pmax[1],
  hipY: hipWorld.y,
};
const size = writePack(output, header, { index, pos, nor, uv, si, sw, inv });
console.log(input.split(/[\\/]/).pop(), "→", (size / 1024).toFixed(0) + "KB", "verts", vcount, "tris", index.length / 3, "bones", bones.length, "groups", outGroups.map((g) => g.kind + ":" + g.count / 3).join(" "), "uv", umin.map((v) => v.toFixed(2)), umax.map((v) => v.toFixed(2)), "hipY", hipWorld.y.toFixed(1), "prefix", prefix);
