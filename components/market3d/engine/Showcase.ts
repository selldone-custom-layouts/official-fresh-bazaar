/*
 * Fresh Market 3D — product showcase: a studio-lit turntable rendered on its own transparent canvas,
 * shown over the (blurred) market while a product is being inspected.
 */
import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
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
import { getLabeledModel, getProduceModel, KindRef } from "./produce/catalog";
import { blobShadowTexture } from "./util/textures";

export class Showcase {
  readonly renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(32, 1, 0.01, 50);
  private holder = new Group();
  private spin = new Group();
  private raf = 0;
  private running = false;
  private yaw = 0.6;
  private pitch = 0.18;
  private yawVel = 0.0;
  private auto = true;
  private dist = 1;
  private targetDist = 1;
  private baseDist = 1;
  private drag: { x: number; y: number } | null = null;
  private pinch = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private appear = 0;
  private fly: { t: number; done: () => void } | null = null;
  private envTex: any;
  private last = performance.now();

  constructor(private container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    const el = this.renderer.domElement;
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.display = "block";
    el.style.touchAction = "none";
    container.appendChild(el);

    const pmrem = new PMREMGenerator(this.renderer);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    pmrem.dispose();
    this.scene.environment = this.envTex;
    (this.scene as any).environmentIntensity = 0.85;

    const key = new DirectionalLight(new Color("#fff1dc"), 2.6);
    key.position.set(-1.2, 2.2, 1.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 6;
    (key.shadow.camera as any).left = -0.5;
    (key.shadow.camera as any).right = 0.5;
    (key.shadow.camera as any).top = 0.5;
    (key.shadow.camera as any).bottom = -0.5;
    key.shadow.bias = -0.0004;
    key.shadow.radius = 4;
    const rim = new DirectionalLight(new Color("#bcd6ff"), 1.6);
    rim.position.set(1.5, 1.2, -2);
    this.scene.add(key, rim);

    const ground = new Mesh(new PlaneGeometry(3, 3), new ShadowMaterial({ opacity: 0.28 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const blob = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false, opacity: 0.7 }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.001;
    this.holder.add(blob);
    this.blob = blob;

    this.holder.add(this.spin);
    this.scene.add(this.holder);

    el.addEventListener("pointerdown", this.down);
    el.addEventListener("pointermove", this.moveH);
    el.addEventListener("pointerup", this.up);
    el.addEventListener("pointercancel", this.up);
    el.addEventListener("wheel", this.wheel, { passive: false });
    window.addEventListener("resize", this.resize);
    this.resize();
  }

  private blob: Mesh;

  show(ref: KindRef, image?: string | null, thumb?: string | null) {
    // clear previous
    while (this.spin.children.length) this.spin.remove(this.spin.children[0]);
    const model = ref.kind === "bag" && image ? getLabeledModel(image, thumb) : getProduceModel(ref, "hero");
    const g = new Group();
    model.parts.forEach((p) => {
      const m = new Mesh(p.geometry, p.material);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    });
    this.spin.add(g);
    const box = new Box3().setFromObject(g);
    const size = new Vector3();
    box.getSize(size);
    const radius = Math.max(size.x, size.y, size.z) * 0.5;
    g.position.y = 0;
    const c = new Vector3();
    box.getCenter(c);
    g.position.x = -c.x;
    g.position.z = -c.z;
    this.blob.scale.setScalar(Math.max(size.x, size.z) * 1.8);
    this.center.set(0, size.y * 0.5, 0);
    this.radius = radius;
    this.baseDist = this.fitDistance();
    this.dist = this.baseDist * 1.6;
    this.targetDist = this.baseDist;
    // start broadside to long items (x is their long axis), three-quarter view for round ones
    this.yaw = size.x > Math.max(size.y, size.z) * 1.6 ? 0.25 : 0.7;
    this.pitch = 0.22;
    this.yawVel = 0;
    this.auto = true;
    this.appear = 0;
    this.fly = null;
    this.holder.scale.setScalar(1);
    this.holder.position.set(0, 0, 0);
    this.start();
  }

  private center = new Vector3();
  private radius = 0.05;

  /** Distance that fits the model in both the vertical and horizontal field of view. */
  private fitDistance() {
    const v = MathUtils.degToRad(this.camera.fov);
    const h = 2 * Math.atan(Math.tan(v / 2) * Math.min(1, this.camera.aspect));
    const eff = Math.min(v, h);
    return (this.radius / Math.sin(eff / 2)) * 1.55;
  }

  /** Shrink & fly the product towards the top-right (cart) corner. */
  flyToCart(done: () => void) {
    this.fly = { t: 0, done };
  }

  private start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick(dt: number) {
    this.appear = Math.min(1, this.appear + dt * 2.2);
    const pop = 1 - Math.pow(1 - this.appear, 3);
    if (this.auto && !this.drag) this.yaw += dt * 0.32;
    else if (!this.drag) {
      this.yaw += this.yawVel;
      this.yawVel *= Math.pow(0.02, dt);
      if (Math.abs(this.yawVel) < 0.0004) this.auto = true;
    }
    this.dist = MathUtils.lerp(this.dist, this.targetDist, Math.min(1, dt * 6));
    this.spin.rotation.y = this.yaw;
    this.spin.position.y = Math.sin(performance.now() / 900) * 0.004 * this.baseDist;
    const s = 0.6 + 0.4 * pop;
    this.holder.scale.setScalar(s);
    if (this.fly) {
      this.fly.t += dt / 0.6;
      const k = Math.min(1, this.fly.t);
      const e = k * k;
      this.holder.scale.setScalar(s * (1 - e * 0.85));
      // move to the upper-right of the view
      const right = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
      const up = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
      this.holder.position.copy(right.multiplyScalar(e * this.baseDist * 0.9)).add(up.multiplyScalar(e * this.baseDist * 0.55));
      if (k >= 1) {
        const done = this.fly.done;
        this.fly = null;
        done();
      }
    }
    const cp = Math.cos(this.pitch);
    this.camera.position.set(Math.sin(0) * cp * this.dist, this.center.y + Math.sin(this.pitch) * this.dist, Math.cos(0) * cp * this.dist);
    this.camera.lookAt(this.center);
    this.camera.near = this.dist / 50;
    this.camera.far = this.dist * 20;
    this.camera.updateProjectionMatrix();
  }

  private down = (e: PointerEvent) => {
    this.renderer.domElement.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
    this.drag = { x: e.clientX, y: e.clientY };
    this.auto = false;
  };

  private moveH = (e: PointerEvent) => {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.targetDist = MathUtils.clamp(this.targetDist * (this.pinch / Math.max(1, d)), this.baseDist * 0.45, this.baseDist * 2);
      this.pinch = d;
      return;
    }
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    this.drag = { x: e.clientX, y: e.clientY };
    this.yaw += dx * 0.01;
    this.yawVel = dx * 0.01;
    this.pitch = MathUtils.clamp(this.pitch + dy * 0.006, -0.2, 1.2);
  };

  private up = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) this.drag = null;
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.targetDist = MathUtils.clamp(this.targetDist * (1 + e.deltaY * 0.001), this.baseDist * 0.45, this.baseDist * 2);
  };

  resize = () => {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    const prev = this.baseDist;
    this.baseDist = this.fitDistance();
    if (prev) this.targetDist *= this.baseDist / prev;
  };

  dispose() {
    this.stop();
    window.removeEventListener("resize", this.resize);
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.down);
    el.removeEventListener("pointermove", this.moveH);
    el.removeEventListener("pointerup", this.up);
    el.removeEventListener("pointercancel", this.up);
    el.removeEventListener("wheel", this.wheel);
    this.envTex?.dispose();
    this.renderer.dispose();
    el.remove();
  }
}
