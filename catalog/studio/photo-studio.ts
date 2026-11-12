/*
 * Fresh Market 3D — dev photo studio.
 * Renders catalog product photos and the shop logo from the same procedural models the market uses,
 * so the 2D storefront (product pages, basket, checkout) matches the 3D market.
 *
 * Usage (dev only):  node catalog/studio/receive.mjs   then open
 *   http://localhost:8080/catalog/studio/photo-studio.html?run=1
 * Files are written to catalog/photos/<key>.jpg and catalog/brand/logo.png.
 */
import {
  ACESFilmicToneMapping,
  Box3,
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { getProduceModel } from "../../components/market3d/engine/produce/catalog";
import plan from "../catalog-plan.json";

const SIZE = 640;
const log = (t: string) => ((document.getElementById("log") as HTMLElement).textContent = t);

const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(SIZE, SIZE);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new Scene();
const pmrem = new PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
(scene as any).environmentIntensity = 0.9;
const key = new DirectionalLight(new Color("#fff3e2"), 2.4);
key.position.set(-1.4, 2.6, 1.8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -0.6, right: 0.6, top: 0.6, bottom: -0.6, near: 0.1, far: 8 });
key.shadow.radius = 6;
key.shadow.bias = -0.0004;
const rim = new DirectionalLight(new Color("#cfe0ff"), 1.2);
rim.position.set(1.6, 1.4, -2.2);
scene.add(key, rim);
const ground = new Mesh(new PlaneGeometry(6, 6), new ShadowMaterial({ opacity: 0.22 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const camera = new PerspectiveCamera(30, 1, 0.01, 50);

function kindRef(kind: string) {
  const [k, v] = kind.split("-");
  return { kind: k, variant: v || "default" };
}

function buildArrangement(kind: string) {
  const ref = kindRef(kind);
  const g = new Group();
  const m = getProduceModel(ref, "hero");
  const maxDim = Math.max(m.size.x, m.size.y, m.size.z);
  const place = (x: number, z: number, ry: number, s = 1) => {
    const item = new Group();
    m.parts.forEach((p) => {
      const mesh = new Mesh(p.geometry, p.material);
      mesh.castShadow = mesh.receiveShadow = true;
      item.add(mesh);
    });
    item.position.set(x, 0, z);
    item.rotation.y = ry;
    item.scale.setScalar(s);
    g.add(item);
  };
  if (maxDim < 0.065) {
    // small produce: a little heap
    const d = maxDim * 0.95;
    [[0, 0], [d, -d * 0.3], [-d, -d * 0.25], [d * 0.5, -d * 1.1], [-d * 0.5, -d * 1.05], [0, d * 0.8]].forEach(([x, z], i) => place(x, z, i * 1.3, 1 - i * 0.02));
  } else if (maxDim < 0.13 && m.rest === "round") {
    const d = maxDim * 0.92;
    place(-d * 0.55, -d * 0.45, 0.4);
    place(d * 0.55, -d * 0.5, 2.1, 0.97);
    place(0, d * 0.35, 1.1, 1.02);
  } else {
    place(0, 0, 0.35);
  }
  return g;
}

function frame(obj: Group, pitch = 0.42, yaw = 0.55, fill = 1.6) {
  const box = new Box3().setFromObject(obj);
  const c = new Vector3();
  const s = new Vector3();
  box.getCenter(c);
  box.getSize(s);
  const r = s.length() / 2;
  const dist = (r / Math.sin((camera.fov * Math.PI) / 360)) * (1 / fill) * 1.25;
  camera.position.set(c.x + Math.sin(yaw) * Math.cos(pitch) * dist, c.y + Math.sin(pitch) * dist, c.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.near = dist / 50;
  camera.far = dist * 10;
  camera.lookAt(c.x, c.y * 0.9, c.z);
  camera.updateProjectionMatrix();
}

async function post(path: string, dataUrl: string) {
  await fetch("http://localhost:8099/save", { method: "POST", body: JSON.stringify({ path, dataUrl }) });
}

async function shoot(kind: string, keyName: string) {
  const g = buildArrangement(kind);
  scene.add(g);
  scene.background = new Color("#f5efe6");
  frame(g);
  renderer.render(scene, camera);
  await post(`catalog/photos/${keyName}.jpg`, renderer.domElement.toDataURL("image/jpeg", 0.86));
  scene.remove(g);
}

async function logo() {
  // Shop icon: one glossy red apple centred on a deep-green badge (reads well at 32–128 px).
  const g = new Group();
  const m = getProduceModel(kindRef("apple-red"), "hero");
  const it = new Group();
  m.parts.forEach((p) => {
    const mesh = new Mesh(p.geometry, p.material);
    mesh.castShadow = mesh.receiveShadow = true;
    it.add(mesh);
  });
  it.rotation.y = 0.5;
  g.add(it);
  scene.add(g);
  scene.background = new Color("#1f5a36");
  (ground.material as ShadowMaterial).opacity = 0.35;
  const box = new Box3().setFromObject(it);
  const c = new Vector3();
  box.getCenter(c);
  camera.fov = 26;
  camera.position.set(0, c.y + 0.11, 0.3);
  camera.lookAt(c.x, c.y + 0.004, c.z);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  // round badge mask + subtle ring
  const out = document.createElement("canvas");
  out.width = out.height = SIZE;
  const ctx = out.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(renderer.domElement, 0, 0);
  const grd = ctx.createRadialGradient(SIZE / 2, SIZE * 0.4, SIZE * 0.1, SIZE / 2, SIZE / 2, SIZE / 2);
  grd.addColorStop(0, "rgba(255,255,255,0.0)");
  grd.addColorStop(1, "rgba(0,30,10,0.35)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = "rgba(255,240,200,0.55)";
  ctx.lineWidth = SIZE * 0.02;
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - SIZE * 0.035, 0, Math.PI * 2);
  ctx.stroke();
  await post("catalog/brand/logo.png", out.toDataURL("image/png"));
  scene.remove(g);
  (ground.material as ShadowMaterial).opacity = 0.22;
}

async function run() {
  const all: Array<[string, string]> = [];
  for (const c of (plan as any).categories) for (const p of c.products) all.push([p.kind, p.key]);
  let i = 0;
  for (const [kind, k] of all) {
    log(`rendering ${++i}/${all.length}: ${k}`);
    await shoot(kind, k);
    await new Promise((r) => setTimeout(r, 30));
  }
  log("rendering logo");
  await logo();
  log(`done: ${all.length} photos + logo`);
  (window as any).__studioDone = true;
}

(window as any).__studio = { run, shoot, logo };
if (/[?&]run=1/.test(location.search)) run();
