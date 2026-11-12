// Rocketbox animation FBX → compact "FMP1" clip pack.
// Quaternion tracks for body bones (facial bones dropped: blinking/look-at are procedural),
// int16-quantized, constant tracks collapsed; root (Bip01) position kept in place with the
// root-motion speed measured so the runtime can match stride to walking speed (no foot sliding).
// usage: node convert-anim.mjs <in.fbx> <out.bin> <name> <avatar mesh pack for bone list>
import fs from "node:fs";
import { THREE, loadFBX, writePack } from "./boot.mjs";

const [, , input, output, name, avatarPack, maxDurArg] = process.argv;
const MAX_DUR = Number(maxDurArg || 14);
const buf = fs.readFileSync(avatarPack);
const hlen = buf.readUInt32LE(4);
const avatarBones = new Set(JSON.parse(buf.subarray(8, 8 + hlen).toString("utf8")).bones.map((b) => b.n));
const FACIAL = /(Eye|Mouth|Lip|lip|Cheek|Eyebrow|Jaw|Tongue|Nose|Masseter|Caninus)/;

const root = loadFBX(input);
const clip = root.animations[0];
const fullDuration = clip.duration;
const duration = Math.min(fullDuration, MAX_DUR);
const trimmed = fullDuration > MAX_DUR + 0.5;
const fps = duration > 3 ? 20 : 30;
const frames = Math.max(2, Math.round(duration * fps) + 1);
const times = Float32Array.from({ length: frames }, (_, i) => Math.min(duration, i / fps));

const qTracks = clip.tracks.filter((t) => t.name.endsWith(".quaternion"));
const bones = [];
const constant = [];
const chunks = [];
for (const t of qTracks) {
  const bone = t.name.slice(0, -".quaternion".length);
  if (!avatarBones.has(bone) || FACIAL.test(bone)) continue;
  const it = t.createInterpolant();
  const vals = new Float32Array(frames * 4);
  const q = new THREE.Quaternion(), prev = new THREE.Quaternion();
  for (let f = 0; f < frames; f++) {
    const r = it.evaluate(times[f]);
    q.set(r[0], r[1], r[2], r[3]).normalize();
    if (f > 0 && q.dot(prev) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    prev.copy(q);
    vals.set([q.x, q.y, q.z, q.w], f * 4);
  }
  if (trimmed) {
    // seamless loop: ease the last 0.8 s back into the first pose
    const B = Math.round(0.8 * fps);
    const q0 = new THREE.Quaternion(vals[0], vals[1], vals[2], vals[3]);
    for (let f = frames - B; f < frames; f++) {
      const w = (f - (frames - B)) / (B - 1);
      const k = w * w * (3 - 2 * w);
      q.set(vals[f * 4], vals[f * 4 + 1], vals[f * 4 + 2], vals[f * 4 + 3]).slerp(q0, k);
      vals.set([q.x, q.y, q.z, q.w], f * 4);
    }
  }
  let isConst = true;
  for (let f = 1; f < frames && isConst; f++) for (let k = 0; k < 4; k++) if (Math.abs(vals[f * 4 + k] - vals[k]) > 3e-4) { isConst = false; break; }
  bones.push(bone);
  constant.push(isConst ? 1 : 0);
  const src = isConst ? vals.subarray(0, 4) : vals;
  chunks.push(Int16Array.from(src, (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767)));
}
const qlen = chunks.reduce((a, c) => a + c.length, 0);
const quats = new Int16Array(qlen);
let o = 0;
for (const c of chunks) quats.set(c, o), (o += c.length);

// root motion: in-place + measured speed
const rt = clip.tracks.find((t) => t.name === "Bip01.position");
const rootPos = new Float32Array(frames * 3);
let speed = 0, dir = [0, 1], hipY = 90;
if (rt) {
  const it = rt.createInterpolant();
  const first = Array.from(it.evaluate(0));
  const last = Array.from(it.evaluate(duration));
  const dx = last[0] - first[0], dz = last[2] - first[2];
  const dist = Math.hypot(dx, dz);
  speed = dist > 5 ? dist / duration : 0;
  if (dist > 5) dir = [dx / dist, dz / dist];
  let ysum = 0;
  for (let f = 0; f < frames; f++) {
    const r = it.evaluate(times[f]);
    const k = times[f] / duration;
    rootPos[f * 3] = r[0] - first[0] - (speed ? dx * k : 0);
    rootPos[f * 3 + 1] = r[1];
    rootPos[f * 3 + 2] = r[2] - first[2] - (speed ? dz * k : 0);
    ysum += r[1];
  }
  hipY = ysum / frames;
  if (trimmed) {
    const B = Math.round(0.8 * fps);
    for (let f = frames - B; f < frames; f++) {
      const w = (f - (frames - B)) / (B - 1), k = w * w * (3 - 2 * w);
      for (let c = 0; c < 3; c++) rootPos[f * 3 + c] += (rootPos[c] - rootPos[f * 3 + c]) * k;
    }
  }
}
const header = { version: 1, name, fps, frames, duration, bones, constant, speed, dir, hipY, root: !!rt };
const size = writePack(output, header, { q: quats, root: rootPos });
console.log(name.padEnd(32), (size / 1024).toFixed(0).padStart(4) + "KB", "dur", duration.toFixed(2), "bones", bones.length, "const", constant.filter(Boolean).length, "speed", speed.toFixed(1), "dir", dir.map((v) => v.toFixed(2)).join(","), "hipY", hipY.toFixed(1));
