// Load three.js (from the project) in Node with the tiny DOM stub FBXLoader needs for texture refs.
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

// this folder lives in <project>/catalog/people-pipeline → use the project's own three.js
export const THREE_ROOT = fileURLToPath(new URL("../../node_modules/three", import.meta.url));
globalThis.self = globalThis;
globalThis.document = {
  createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {}, set src(v) {} }),
};
export const THREE = await import(pathToFileURL(THREE_ROOT + "/build/three.module.js").href);
const { FBXLoader } = await import(pathToFileURL(THREE_ROOT + "/examples/jsm/loaders/FBXLoader.js").href);
export const BGU = await import(pathToFileURL(THREE_ROOT + "/examples/jsm/utils/BufferGeometryUtils.js").href);

export function loadFBX(file) {
  const buf = fs.readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const root = new FBXLoader().parse(ab, "");
  root.updateMatrixWorld(true);
  return root;
}

/** Pack a JSON header + binary sections: "FMP1" | u32 headerBytes | header | pad4 | sections… */
export function writePack(file, header, sections) {
  let offset = 0;
  header.sections = {};
  const bufs = [];
  for (const [name, arr] of Object.entries(sections)) {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    header.sections[name] = { offset, length: bytes.byteLength, type: arr.constructor.name, count: arr.length };
    bufs.push(bytes);
    const pad = (4 - (bytes.byteLength % 4)) % 4;
    if (pad) bufs.push(new Uint8Array(pad));
    offset += bytes.byteLength + pad;
  }
  let json = Buffer.from(JSON.stringify(header), "utf8");
  const hpad = (4 - ((8 + json.length) % 4)) % 4;
  json = Buffer.concat([json, Buffer.alloc(hpad, 0x20)]);
  const head = Buffer.alloc(8);
  head.write("FMP1", 0, "ascii");
  head.writeUInt32LE(json.length, 4);
  fs.writeFileSync(file, Buffer.concat([head, json, ...bufs.map((b) => Buffer.from(b.buffer, b.byteOffset, b.byteLength))]));
  return fs.statSync(file).size;
}
