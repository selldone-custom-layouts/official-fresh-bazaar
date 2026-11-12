/*
 * Fresh Market 3D — main engine.
 *
 * Renders a walkable open-air market where every stall is a shop category and every crate is a
 * product. The engine is framework-agnostic: the Vue layer feeds it data and listens to events.
 */
import {
  ACESFilmicToneMapping,
  NeutralToneMapping,
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Clock,
  Color,
  Group,
  HalfFloatType,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { buildEnvironment, disposeObject, EnvBuild } from "./market/environment";
import { buildPersianBazaar, PersianBuild } from "./market/persian";
import { Body, Crowd, StallSpot } from "./people/crowd";
import { PeopleLibrary, peopleAssetsAvailable, ROSTER } from "./people/library";
import { Person } from "./people/person";
import { Character, Outfit } from "./people/characters";
import { loadEnvAssets } from "./market/realism";
import { disposeScans, loadScans, propScan, PropId } from "./produce/scans";
import { FIGURES } from "../data/figures";
import { CylinderGeometry as FigureHitGeometry, Mesh as FigureHitMesh, MeshBasicMaterial as FigureHitMaterial } from "three";
import { Ambience } from "./audio/ambience";
import { Birds } from "./market/birds";
import { buildStall, MarketProduct, MarketStallData, setStallPlanks, StallBuild, STALL, updateCrateTag } from "./market/stall";
import { glowTexture } from "./util/textures";
import { disposeProduceModels } from "./produce/catalog";
import { disposeProduceMaterials } from "./produce/parts";
import { disposeTextureCache } from "./util/textures";

export type Quality = "low" | "medium" | "high";

export interface HoverInfo {
  type: "product" | "stall" | "more" | "figure";
  productId?: number;
  figureId?: string;
  stallIndex: number;
  x: number;
  y: number;
}

export interface EngineEvents {
  onProgress?: (p: number, label: string) => void;
  onReady?: () => void;
  onHover?: (h: HoverInfo | null) => void;
  onSelect?: (productId: number, stallIndex: number) => void;
  onStallFocus?: (stallIndex: number) => void;
  onMore?: (stallIndex: number) => void;
  onFirstMove?: () => void;
  /** a historical figure was clicked */
  onFigure?: (id: string) => void;
}

interface Pose {
  pos: Vector3;
  yaw: number;
  pitch: number;
}

const EYE = 1.62;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function detectQuality(): Quality {
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const mem = (navigator as any).deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  if (coarse || small || mem <= 4) return "low";
  if (cores <= 4) return "medium";
  return "high";
}

export class MarketEngine {
  readonly container: HTMLElement;
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  quality: Quality;
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private gtao: GTAOPass | null = null;
  private clock = new Clock();
  private raf = 0;
  private disposed = false;
  events: EngineEvents;
  ready = false;
  private paused = false;
  private env: EnvBuild | null = null;
  private stallRoot = new Group();
  stalls: StallBuild[] = [];
  private hits: Object3D[] = [];
  private plazaRadius = 9;
  private dust: Points | null = null;
  private bazaar: PersianBuild | null = null;
  private crowd: Crowd | null = null;
  private people: PeopleLibrary | null = null;
  private crowdSpots: StallSpot[] = [];
  private birds: Birds | null = null;
  readonly ambience = new Ambience();
  private soundMuted = false;
  private obstacles: Array<{ c: Vector3; r: number }> = [];
  private dpr = 1;
  private dprCap = 2;

  // controls
  private pose: Pose = { pos: new Vector3(0, EYE, 6), yaw: 0, pitch: -0.05 };
  private vel = new Vector3();
  private keys = new Set<string>();
  private move = new Vector2();
  private dragging = false;
  private dragMoved = 0;
  private lastPointer = new Vector2();
  private pointer = new Vector2();
  private pinchDist = 0;
  private activePointers = new Map<number, Vector2>();
  private flight: { from: Pose; to: Pose; t: number; dur: number; done?: () => void } | null = null;
  private yawVel = 0;
  private pitchVel = 0;
  private inputEnabled = true;
  private firstMoveSent = false;
  private currentStall = -1;

  // hover
  private raycaster = new Raycaster();
  private hovered: { type: string; productId?: number; stallIndex: number; obj: Object3D } | null = null;
  private hoverTimer = 0;
  private hops = new Map<Object3D, number>();

  // perf
  private frameTimes: number[] = [];
  private qualityLocked = false;

  constructor(container: HTMLElement, events: EngineEvents = {}, quality?: Quality) {
    this.container = container;
    this.events = events;
    this.quality = quality || detectQuality();
    this.renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance", alpha: false, stencil: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    // Khronos PBR Neutral: the tone mapper made for product rendering — true produce colours, soft highlights
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setClearColor(new Color("#d9b48e"));
    this.renderer.domElement.style.touchAction = "none";
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    container.appendChild(this.renderer.domElement);
    this.camera = new PerspectiveCamera(55, 1, 0.1, 2000);
    this.applyQuality();
    this.bindInput();
    this.onResize();
    window.addEventListener("resize", this.onResize);
  }

  // ───────────────────────────── Quality & post ─────────────────────────────

  private applyQuality() {
    const dprCap = this.quality === "high" ? 2 : this.quality === "medium" ? 1.5 : 1.25;
    this.dprCap = Math.min(window.devicePixelRatio || 1, dprCap);
    this.dpr = this.dprCap;
    this.renderer.setPixelRatio(this.dpr);
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const dpr = this.renderer.getPixelRatio();
    const rt = new WebGLRenderTarget(w * dpr, h * dpr, { type: HalfFloatType, samples: this.quality === "low" ? 0 : 4 });
    this.composer?.dispose();
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = null;
    if (this.quality === "high") {
      const g = new GTAOPass(this.scene, this.camera, w, h);
      g.output = GTAOPass.OUTPUT.Default;
      g.blendIntensity = 0.6;
      g.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.4, thickness: 1.5, scale: 1.1, samples: 12 });
      g.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      this.composer.addPass(g);
      this.gtao = g;
    }
    this.bloom = new UnrealBloomPass(new Vector2(w, h), 0.22, 0.12, 2.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // cinematic finish: gentle vignette + soft S-curve with warm highlights (no grain → no flicker)
    this.composer.addPass(
      new ShaderPass({
        uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.22 } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: `uniform sampler2D tDiffuse; uniform float uVignette; varying vec2 vUv;
          void main(){
            vec4 c = texture2D(tDiffuse, vUv);
            vec3 x = c.rgb;
            // soft S-curve around mid grey
            x = mix(x, x * x * (3.0 - 2.0 * x), 0.18);
            // warm the highlights, cool the shadows a touch
            float l = dot(x, vec3(0.2126, 0.7152, 0.0722));
            x += (vec3(0.018, 0.006, -0.012) * smoothstep(0.45, 1.0, l)) + (vec3(-0.006, 0.0, 0.01) * (1.0 - smoothstep(0.0, 0.35, l)));
            vec2 d = vUv - 0.5;
            float v = 1.0 - uVignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
            gl_FragColor = vec4(clamp(x * v, 0.0, 1.0), c.a);
          }`,
      }),
    );
    this.composer.setSize(w, h);
  }

  setQuality(q: Quality) {
    if (q === this.quality) return;
    this.quality = q;
    this.qualityLocked = true;
    this.applyQuality();
  }

  private onResize = () => {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 68 : 55;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.gtao?.setSize(w, h);
  };

  // ───────────────────────────── Build ─────────────────────────────

  async build(stalls: MarketStallData[], opts: { shopTitle?: string; rtl?: boolean } = {}) {
    const N = Math.max(1, stalls.length);
    const chord = STALL.width + 1.7; // room for a vendor beside each stall
    const ringFraction = 0.8;
    this.plazaRadius = Math.max(8.5, (N * chord) / (Math.PI * 2 * ringFraction));
    const R = this.plazaRadius;
    const span = Math.min(Math.PI * 2 * ringFraction, (N * chord) / R);
    const step = span / N;
    const shadows = true;
    const progress = (p: number, l: string) => this.events.onProgress?.(p, l);
    // realistic people stream in parallel with the bazaar build
    let peopleLoad: Promise<boolean> | null = null;
    if (peopleAssetsAvailable()) {
      this.people = new PeopleLibrary(shadows && this.quality !== "low", this.quality);
      peopleLoad = this.people.load().then(
        () => true,
        (e) => {
          console.warn("Fresh Market 3D: people assets failed, using procedural people", e);
          return false;
        },
      );
    }

    progress(0.04, "sky");
    // photo-scanned materials and the HDR sky (procedural fallbacks if anything fails)
    // photo-scanned produce and props load alongside the materials (procedural fallbacks otherwise)
    const [envAssets] = await Promise.all([loadEnvAssets(this.quality).catch(() => undefined), loadScans().catch(() => undefined)]);
    if (this.disposed) return;
    progress(0.08, "sky");
    await nextFrame();
    if (this.disposed) return;
    const anchors: Array<{ left: Vector3; right: Vector3 }> = [];
    const placements: Array<{ x: number; z: number; ry: number }> = [];
    for (let i = 0; i < N; i++) {
      const th = (i - (N - 1) / 2) * step;
      const x = R * Math.sin(th);
      const z = -R * Math.cos(th);
      placements.push({ x, z, ry: -th });
      const o = new Object3D();
      o.position.set(x, 0, z);
      o.rotation.y = -th;
      o.updateMatrixWorld();
      anchors.push({ left: new Vector3(-1.66, 2.3, 0.86).applyMatrix4(o.matrixWorld), right: new Vector3(1.66, 2.3, 0.86).applyMatrix4(o.matrixWorld) });
    }
    this.env = buildEnvironment(this.scene, this.renderer, {
      plazaRadius: R,
      stallAnchors: anchors,
      shadows,
      shadowMapSize: this.quality === "high" ? 4096 : this.quality === "medium" ? 2048 : 1024,
      quality: this.quality,
      persian: true,
      assets: envAssets,
    });
    progress(0.25, "plaza");
    await nextFrame();
    if (this.disposed) return;

    this.scene.add(this.stallRoot);
    setStallPlanks(envAssets?.sets.weathered_brown_planks);
    for (let i = 0; i < stalls.length; i++) {
      const s = buildStall(stalls[i], i, shadows);
      const pl = placements[i];
      s.group.position.set(pl.x, 0, pl.z);
      s.group.rotation.y = pl.ry;
      this.stallRoot.add(s.group);
      this.stalls.push(s);
      s.crates.forEach((c) => this.hits.push(c.hit));
      this.hits.push(s.signHit);
      if (s.moreHit) this.hits.push(s.moreHit);
      progress(0.25 + (0.7 * (i + 1)) / stalls.length, stalls[i].title);
      await nextFrame();
      if (this.disposed) return;
    }
    this.stallRoot.updateMatrixWorld(true);
    this.placeProps(R);

    // Persian bazaar setting around the plaza
    progress(0.96, "bazaar");
    await nextFrame();
    if (this.disposed) return;
    this.bazaar = buildPersianBazaar({
      plazaRadius: R,
      shopTitle: opts.shopTitle || "",
      rtl: !!opts.rtl,
      shadows,
      quality: this.quality,
      assets: envAssets,
      sunDir: this.env ? this.env.sun.position.clone().normalize() : undefined,
      pixelHeight: () => this.renderer.domElement.height,
      stallAnchors: this.stalls.map((st) => ({
        center: new Vector3(0, 0, 0.9).applyMatrix4(st.group.matrixWorld),
        normal: new Vector3(0, 0, 1).applyQuaternion(st.group.quaternion),
      })),
    });
    this.scene.add(this.bazaar.group);
    this.obstacles.push(...this.bazaar.obstacles);

    // People: a vendor beside every stall, strolling shoppers and a few chatting locals
    const spots: StallSpot[] = this.stalls.map((st, i) => {
      const side = i % 2 ? -1 : 1; // opposite to the decorative sack
      const m = st.group.matrixWorld;
      const yawLocal = Math.atan2(-side * 0.45, 1);
      return {
        front: new Vector3(0, 0, 0.9).applyMatrix4(m),
        normal: new Vector3(0, 0, 1).applyQuaternion(st.group.quaternion),
        vendor: new Vector3(side * 2.08, 0, 0.62).applyMatrix4(m),
        vendorYaw: st.group.rotation.y + yawLocal,
      };
    });
    this.crowdSpots = spots;
    progress(0.97, "people");
    const ready = peopleLoad ? await Promise.race([peopleLoad, new Promise<null>((r) => setTimeout(() => r(null), 9000))]) : false;
    if (this.disposed) return;
    if (ready === null) peopleLoad!.then((ok) => !this.disposed && !this.crowd && this.spawnCrowd(ok));
    else this.spawnCrowd(!!ready);
    this.birds = new Birds(new Vector3(0, 0, -(R + 18)), this.quality === "low" ? 5 : 9);
    this.scene.add(this.birds.group);
    this.buildDust();

    // compile shaders up-front to avoid hitches on first look-around
    try {
      await (this.renderer as any).compileAsync?.(this.scene, this.camera);
    } catch (e) {
      /* optional */
    }
    progress(1, "ready");

    // intro: drone shot sweeping down to the entrance
    const start = this.entrancePose();
    this.pose = { pos: new Vector3(0, 11, R * 1.6), yaw: 0, pitch: -0.45 };
    this.flyTo(start, /[?&]market-nointro/.test(window.location.search) ? 0.01 : 3.2);
    this.start();
    this.ready = true;
    this.events.onReady?.();
  }

  private entrancePose(): Pose {
    const R = this.plazaRadius;
    return { pos: new Vector3(0, EYE, R * 0.56), yaw: 0, pitch: -0.05 };
  }

  private buildDust() {
    const n = this.quality === "low" ? 160 : 420;
    const g = new BufferGeometry();
    const p = new Float32Array(n * 3);
    const R = this.plazaRadius;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * R;
      p[i * 3] = Math.cos(a) * r;
      p[i * 3 + 1] = 0.3 + Math.random() * 3.2;
      p[i * 3 + 2] = Math.sin(a) * r;
    }
    g.setAttribute("position", new BufferAttribute(p, 3));
    const m = new PointsMaterial({
      size: 0.035,
      map: glowTexture(),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: AdditiveBlending,
      color: new Color("#ffd9a0"),
    });
    this.dust = new Points(g, m);
    this.scene.add(this.dust);
  }

  /** Update price tags (e.g. after currency change). */
  updateProducts(stallIndex: number, products: MarketProduct[]) {
    const s = this.stalls[stallIndex];
    if (!s) return;
    s.crates.forEach((c) => {
      const p = products.find((x) => x.id === c.product.id);
      if (p) updateCrateTag(c, p, s.data.dir);
    });
  }

  // ───────────────────────────── Camera & navigation ─────────────────────────────

  private poseLookingAt(pos: Vector3, target: Vector3): Pose {
    const d = target.clone().sub(pos);
    return { pos: pos.clone(), yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(MathUtils.clamp(d.y / d.length(), -1, 1)) };
  }

  flyTo(to: Pose, dur = 1.3, done?: () => void) {
    const from = { pos: this.pose.pos.clone(), yaw: this.pose.yaw, pitch: this.pose.pitch };
    // shortest yaw path
    let dy = to.yaw - from.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.flight = { from, to: { ...to, yaw: from.yaw + dy }, t: 0, dur, done };
    this.vel.set(0, 0, 0);
    this.yawVel = this.pitchVel = 0;
  }

  focusStall(index: number, dur = 1.4) {
    const s = this.stalls[index];
    if (!s) return;
    const pos = s.view.position.clone().applyMatrix4(s.group.matrixWorld);
    const target = s.view.target.clone().applyMatrix4(s.group.matrixWorld);
    this.flyTo(this.poseLookingAt(pos, target), dur);
    this.setCurrentStall(index);
  }

  focusProduct(productId: number, stallIndex?: number, dur = 1.1) {
    const found = this.findCrate(productId, stallIndex);
    if (!found) return;
    const { stall, crate } = found;
    const center = crate.hit.getWorldPosition(new Vector3());
    const forward = new Vector3(0, 0, 1).applyQuaternion(stall.group.quaternion);
    const pos = center.clone().addScaledVector(forward, 1.05).add(new Vector3(0, 0.55, 0));
    pos.y = Math.max(pos.y, 1.25);
    this.flyTo(this.poseLookingAt(pos, center), dur);
    this.setCurrentStall(this.stalls.indexOf(stall));
  }

  backToStall() {
    if (this.currentStall >= 0) this.focusStall(this.currentStall, 0.9);
  }

  private findCrate(productId: number, stallIndex?: number) {
    const list = stallIndex != null && this.stalls[stallIndex] ? [this.stalls[stallIndex]] : this.stalls;
    for (const stall of list) {
      const crate = stall.crates.find((c) => c.product.id === productId);
      if (crate) return { stall, crate };
    }
    return null;
  }

  /** Little bounce of a product pile (e.g. after adding it to the basket). */
  hop(productId: number) {
    this.stalls.forEach((s) => s.crates.forEach((c) => c.product.id === productId && this.hops.set(c.pile, 0)));
  }

  /** Start the soundscape (needs a user gesture). */
  startSound() {
    if (this.ambience.started || this.disposed || this.paused) return;
    this.ambience.start();
    this.ambience.setMuted(this.soundMuted);
  }

  setMuted(m: boolean) {
    this.soundMuted = m;
    this.ambience.setMuted(m);
  }

  setInputEnabled(v: boolean) {
    this.inputEnabled = v;
    if (!v) {
      this.keys.clear();
      this.move.set(0, 0);
      this.setHover(null);
    }
  }

  /** Virtual joystick input (x: strafe, y: forward) in -1..1. */
  setMove(x: number, y: number) {
    this.move.set(x, y);
    if ((x || y) && !this.firstMoveSent) this.notifyFirstMove();
  }

  private notifyFirstMove() {
    this.firstMoveSent = true;
    this.events.onFirstMove?.();
  }

  private setCurrentStall(i: number) {
    if (i === this.currentStall) return;
    this.currentStall = i;
    this.events.onStallFocus?.(i);
  }

  // ───────────────────────────── Input ─────────────────────────────

  private bindInput() {
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerup", this.onPointerUp);
    el.addEventListener("pointercancel", this.onPointerUp);
    el.addEventListener("pointerleave", this.onPointerLeave);
    el.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  private onPointerDown = (e: PointerEvent) => {
    this.startSound();
    if (!this.inputEnabled) return;
    this.renderer.domElement.setPointerCapture?.(e.pointerId);
    this.activePointers.set(e.pointerId, new Vector2(e.clientX, e.clientY));
    if (this.activePointers.size === 2) {
      const [a, b] = [...this.activePointers.values()];
      this.pinchDist = a.distanceTo(b);
    }
    this.dragging = true;
    this.dragMoved = 0;
    this.lastPointer.set(e.clientX, e.clientY);
  };

  private onPointerMove = (e: PointerEvent) => {
    this.setPointer(e);
    if (!this.inputEnabled) return;
    if (this.activePointers.has(e.pointerId)) this.activePointers.get(e.pointerId)!.set(e.clientX, e.clientY);
    if (this.activePointers.size === 2) {
      const [a, b] = [...this.activePointers.values()];
      const d = a.distanceTo(b);
      const delta = d - this.pinchDist;
      this.pinchDist = d;
      this.vel.addScaledVector(this.forwardFlat(), delta * 0.02);
      this.dragMoved += Math.abs(delta);
      this.flight = null;
      return;
    }
    if (this.dragging) {
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer.set(e.clientX, e.clientY);
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      if (this.dragMoved > 5) {
        this.flight = null;
        const k = e.pointerType === "touch" ? 0.0055 : 0.0038;
        this.yawVel = dx * k;
        this.pitchVel = dy * k * 0.8;
        this.pose.yaw += dx * k;
        this.pose.pitch = MathUtils.clamp(this.pose.pitch + dy * k * 0.8, -0.75, 0.55);
        if (!this.firstMoveSent) this.notifyFirstMove();
        this.renderer.domElement.style.cursor = "grabbing";
      }
    } else {
      this.hoverTimer = 1;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);
    if (!this.dragging) return;
    this.dragging = this.activePointers.size > 0;
    this.renderer.domElement.style.cursor = "";
    if (!this.inputEnabled) return;
    if (this.dragMoved <= 6 && this.activePointers.size === 0) {
      this.setPointer(e);
      const hit = this.pick();
      if (hit) this.activate(hit);
    }
  };

  private onPointerLeave = () => {
    if (!this.dragging) this.setHover(null);
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.inputEnabled) return;
    e.preventDefault();
    this.flight = null;
    this.vel.addScaledVector(this.lookDirFlat(), -e.deltaY * 0.006);
    if (!this.firstMoveSent) this.notifyFirstMove();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    this.startSound();
    if (!this.inputEnabled) return;
    const t = e.target as HTMLElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift", "q", "e"].includes(k)) {
      this.keys.add(k);
      this.flight = null;
      if (k.startsWith("arrow")) e.preventDefault();
      if (!this.firstMoveSent) this.notifyFirstMove();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
  private onBlur = () => this.keys.clear();

  private setPointer(e: { clientX: number; clientY: number }) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.lastClient = { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private lastClient = { x: 0, y: 0 };

  private pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const res = this.raycaster.intersectObjects(this.hits, false);
    for (const r of res) {
      const d = r.object.userData;
      if (d && d.type) return { ...d, obj: r.object, distance: r.distance } as any;
    }
    return null;
  }

  private activate(hit: any) {
    if (hit.type === "product") {
      this.focusProduct(hit.productId, hit.stallIndex);
      this.hop(hit.productId);
      this.events.onSelect?.(hit.productId, hit.stallIndex);
    } else if (hit.type === "stall") {
      this.focusStall(hit.stallIndex);
    } else if (hit.type === "more") {
      this.events.onMore?.(hit.stallIndex);
    } else if (hit.type === "figure") {
      this.events.onFigure?.(hit.figureId);
    }
  }

  private setHover(h: any | null) {
    const prev = this.hovered;
    if (prev && h && prev.obj === h.obj) {
      this.events.onHover?.({ type: h.type, productId: h.productId, stallIndex: h.stallIndex, figureId: h.figureId, x: this.lastClient.x, y: this.lastClient.y });
      return;
    }
    if (prev) this.highlight(prev, false);
    this.hovered = h;
    if (h) this.highlight(h, true);
    this.renderer.domElement.style.cursor = h ? "pointer" : "";
    this.events.onHover?.(h ? { type: h.type, productId: h.productId, stallIndex: h.stallIndex, figureId: h.figureId, x: this.lastClient.x, y: this.lastClient.y } : null);
  }

  private highlight(h: any, on: boolean) {
    if (h.type !== "product") return;
    const stall = this.stalls[h.stallIndex];
    const crate = stall?.crates.find((c) => c.hit === h.obj);
    if (!crate) return;
    const m = crate.tag.mesh.material as MeshStandardMaterial;
    m.emissive = new Color(on ? "#ffffff" : "#000000");
    m.emissiveMap = on ? m.map : null;
    m.emissiveIntensity = on ? 0.35 : 0;
    m.needsUpdate = true;
    crate.pile.userData.lift = on ? 1 : 0;
  }

  private forwardFlat() {
    return new Vector3(-Math.sin(this.pose.yaw), 0, -Math.cos(this.pose.yaw));
  }

  private lookDirFlat() {
    return this.forwardFlat();
  }

  // ───────────────────────────── Loop ─────────────────────────────

  /** Re-attach the canvas to a new container (the page was re-mounted) and resume. */
  attach(container: HTMLElement, events: EngineEvents) {
    (this as any).container = container;
    this.events = events;
    container.appendChild(this.renderer.domElement);
    this.onResize();
    this.resume();
  }

  pause() {
    this.ambience.suspend();
    this.paused = true;
    cancelAnimationFrame(this.raf);
    this.keys.clear();
    this.move.set(0, 0);
  }

  resume() {
    if (!this.paused || this.disposed) return;
    this.paused = false;
    this.ambience.resume();
    if (this.ready) {
      this.clock.getDelta();
      this.loopFn?.();
    }
  }

  get isDisposed() {
    return this.disposed;
  }

  private loopFn: (() => void) | null = null;

  private start() {
    this.clock.start();
    const loop = () => {
      if (this.disposed || this.paused) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.update(dt);
      this.composer.render(dt);
      this.trackPerf(dt);
    };
    this.loopFn = loop;
    if (!this.paused) loop();
  }

  private update(dt: number) {
    const t = this.clock.elapsedTime;
    // flight
    if (this.flight) {
      const f = this.flight;
      f.t += dt / f.dur;
      const k = easeInOut(Math.min(1, f.t));
      this.pose.pos.lerpVectors(f.from.pos, f.to.pos, k);
      this.pose.yaw = MathUtils.lerp(f.from.yaw, f.to.yaw, k);
      this.pose.pitch = MathUtils.lerp(f.from.pitch, f.to.pitch, k);
      if (f.t >= 1) {
        this.flight = null;
        f.done?.();
      }
    } else {
      // walking
      const fwd = this.forwardFlat();
      const right = new Vector3(-fwd.z, 0, fwd.x);
      const run = this.keys.has("shift") ? 1.8 : 1;
      const accel = new Vector3();
      if (this.keys.has("w") || this.keys.has("arrowup")) accel.add(fwd);
      if (this.keys.has("s") || this.keys.has("arrowdown")) accel.sub(fwd);
      if (this.keys.has("d")) accel.add(right);
      if (this.keys.has("a")) accel.sub(right);
      if (this.keys.has("arrowleft") || this.keys.has("q")) this.pose.yaw += dt * 1.6;
      if (this.keys.has("arrowright") || this.keys.has("e")) this.pose.yaw -= dt * 1.6;
      if (this.move.lengthSq() > 0.0001) accel.addScaledVector(fwd, this.move.y).addScaledVector(right, this.move.x);
      if (accel.lengthSq() > 0) accel.normalize().multiplyScalar(22 * run);
      this.vel.addScaledVector(accel, dt);
      const maxV = 3.2 * run;
      if (this.vel.length() > maxV) this.vel.setLength(maxV);
      this.vel.multiplyScalar(Math.pow(0.0025, dt));
      this.pose.pos.addScaledVector(this.vel, dt);
      // look inertia
      if (!this.dragging) {
        this.pose.yaw += this.yawVel;
        this.pose.pitch = MathUtils.clamp(this.pose.pitch + this.pitchVel, -0.75, 0.55);
        this.yawVel *= Math.pow(0.002, dt);
        this.pitchVel *= Math.pow(0.002, dt);
      }
      // collisions: stay inside the ring of stalls and outside the pole base
      const p = this.pose.pos;
      const r = Math.hypot(p.x, p.z);
      const maxR = this.plazaRadius - 1.25;
      if (r > maxR) {
        p.x *= maxR / r;
        p.z *= maxR / r;
      }
      for (const ob of this.obstacles) {
        const dx = p.x - ob.c.x, dz = p.z - ob.c.z;
        const d = Math.hypot(dx, dz);
        const min = ob.r + 0.35;
        if (d < min && d > 0.0001) {
          p.x = ob.c.x + (dx / d) * min;
          p.z = ob.c.z + (dz / d) * min;
        }
      }
      if (this.crowd) {
        for (const c of this.crowd.colliders()) {
          const dx = p.x - c.x, dz = p.z - c.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.55 && d > 0.0001) {
            p.x = c.x + (dx / d) * 0.55;
            p.z = c.z + (dz / d) * 0.55;
          }
        }
      }
      // gentle head bob while walking
      const speed = this.vel.length();
      p.y = MathUtils.lerp(p.y, EYE + Math.sin(t * 9) * 0.012 * Math.min(1, speed / 2), 0.2);
      if (speed > 0.2) this.updateNearestStall();
    }
    // apply pose
    const cp = Math.cos(this.pose.pitch);
    this.camera.position.copy(this.pose.pos);
    this.camera.lookAt(
      this.pose.pos.x - Math.sin(this.pose.yaw) * cp,
      this.pose.pos.y + Math.sin(this.pose.pitch),
      this.pose.pos.z - Math.cos(this.pose.yaw) * cp,
    );

    // hover picking (throttled)
    if (this.hoverTimer > 0 && !this.dragging && this.inputEnabled) {
      this.hoverTimer = 0;
      this.setHover(this.pick());
    }

    // pile lift / hop animations
    this.stalls.forEach((s) =>
      s.crates.forEach((c) => {
        const target = c.pile.userData.lift ? 0.018 : 0;
        let y = MathUtils.lerp(c.pile.position.y, target, Math.min(1, dt * 10));
        const hop = this.hops.get(c.pile);
        if (hop != null) {
          const ht = hop + dt;
          if (ht > 0.7) this.hops.delete(c.pile);
          else {
            this.hops.set(c.pile, ht);
            y += Math.sin((ht / 0.7) * Math.PI) * 0.05 * (1 - ht / 0.7);
          }
        }
        c.pile.position.y = y;
      }),
    );

    // dust drift
    if (this.dust) {
      this.dust.rotation.y += dt * 0.01;
      this.dust.position.y = Math.sin(t * 0.3) * 0.05;
    }
    this.env?.update(t);
    this.bazaar?.update(t);
    this.crowd?.update(dt, this.camera.position);
    this.birds?.update(t, dt);
    if (this.ambience.started) this.ambience.update(Math.hypot(this.camera.position.x, this.camera.position.z));
  }

  /** Vendors, shoppers and chatting locals: motion-capture people, or procedural ones as a fallback. */
  private spawnCrowd(real: boolean) {
    const lib = real && this.people && this.people.avatars.size ? this.people : null;
    const VENDORS = ROSTER.filter((a) => a.role === "vendor").map((a) => a.id);
    // walkers 0+1 (mother and child) and 4+5 (a couple) walk together
    const WALKERS = ["Female_Adult_05", "Male_Child_01", "Male_Adult_17", "Female_Adult_03", "Male_Adult_07", "Female_Adult_02", "Female_Adult_15", "Female_Adult_07", "Male_Adult_17"];
    const CHATTERS = ["Male_Adult_03", "Male_Adult_02"];
    const V_OUT: Outfit[] = ["man-qaba", "man-vest", "elder", "woman-scarf", "man-vest", "woman-qashqai"];
    const S_OUT: Outfit[] = ["woman-qashqai", "man-qaba", "woman-scarf", "man-vest", "elder", "woman-scarf", "man-qaba", "woman-qashqai"];
    // historical figures: Khayyam on the rim of the pool facing the entrance, the physicians by their stalls
    const figs = FIGURES.filter((f) => !lib || lib.avatars.has(f.avatar));
    const used = new Set<number>();
    const figureSpots = figs.map((f, k) => {
      if (f.spot === "pool") return { id: f.id, pos: new Vector3(0, 0, 2.02), yaw: 0, seated: !!(f.seated && lib) };
      const rx = f.spot as RegExp;
      const free = (i: number) => i >= 0 && !used.has(i);
      let si = this.stalls.findIndex((s, i) => free(i) && rx.test(s.data.title));
      if (si < 0) si = this.stalls.findIndex((s, i) => free(i) && rx.test(s.data.products.map((p) => p.title).join(" ")));
      if (si < 0) si = this.stalls.findIndex((_, i) => free(i) && i === (k * 3) % this.stalls.length);
      if (si < 0) si = this.stalls.findIndex((_, i) => free(i));
      used.add(si);
      const st = this.stalls[si];
      const side = si % 2 ? 1 : -1; // the side away from the vendor
      const pos = new Vector3(side * 1.05, 0, 0.9 + 1.25).applyMatrix4(st.group.matrixWorld);
      pos.y = 0;
      const toCentre = Math.atan2(-pos.x, -pos.z);
      const toStall = st.group.rotation.y + Math.PI;
      return { id: f.id, pos, yaw: toCentre + MathUtils.clamp(((toStall - toCentre + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -0.6, 0.6), seated: false };
    });
    const make = (kind: "vendor" | "walker" | "chatter" | "figure", i: number): Body => {
      if (kind === "figure") {
        const f = figs[i];
        if (lib)
          return new Person(lib, f.avatar, {
            costume: f.costume,
            clips: f.seated
              ? { idle: ["m_sit_chair_idle_neutral_01", "m_sit_chair_breathe_01"], look: ["m_sit_chair_breathe_01"], talk: ["m_sit_chair_gestic_thoughtful"], listen: ["m_sit_chair_breathe_01"], wave: [], present: [], fidget: [] }
              : { talk: ["m_gestic_talk_neutral_02", "m_gestic_talk_neutral_01"], wave: [], fidget: [] },
          });
        return new Character({ outfit: "elder", seed: 700 + i * 13 });
      }
      if (lib) {
        const list = (kind === "vendor" ? VENDORS : kind === "walker" ? WALKERS : CHATTERS).filter((id) => lib.avatars.has(id));
        const any = [...lib.avatars.keys()];
        const id = list.length ? list[i % list.length] : any[i % any.length];
        return new Person(lib, id);
      }
      const outfit = kind === "vendor" ? V_OUT[i % V_OUT.length] : S_OUT[(i + (kind === "chatter" ? 3 : 0)) % S_OUT.length];
      return new Character({ outfit, seed: (kind === "vendor" ? 100 : kind === "walker" ? 300 : 900) + i * 7 });
    };
    this.crowd = new Crowd({
      stalls: this.crowdSpots,
      plazaRadius: this.plazaRadius,
      obstacles: this.obstacles,
      quality: this.quality,
      make,
      companions: [
        [0, 1],
        [4, 5],
      ],
      figures: figureSpots,
    });
    this.scene.add(this.crowd.group);
    // invisible click targets around the historical figures
    const hitMat = new FigureHitMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 });
    for (const f of this.crowd.figureRoots()) {
      const h = f.seated ? 1.35 : 1.9;
      const m = new FigureHitMesh(new FigureHitGeometry(0.42, 0.42, h, 10), hitMat);
      m.position.set(f.root.position.x, h / 2, f.root.position.z);
      m.userData = { type: "figure", figureId: f.id, stallIndex: -1 };
      this.scene.add(m);
      this.hits.push(m);
    }
  }

  /** Scanned bazaar props: copper pots, brass trays, wicker baskets and clay pots beside the stalls. */
  private placeProps(R: number) {
    const mk = (id: PropId, scale = 1) => {
      const sc = propScan(id);
      if (!sc) return null;
      const m = new Mesh(sc.lods[0], sc.material);
      m.scale.setScalar(scale);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    this.stalls.forEach((st, i) => {
      const side = i % 2 ? 1 : -1; // the sack side, away from the vendor
      const set: Array<[PropId, number, number, number, number]> =
        i % 3 === 0
          ? [["brass_pot_01", side * 2.0, 1.02, i * 1.1, 1], ["brass_pot_02", side * 1.52, 1.16, i * 0.7, 0.85]]
          : i % 3 === 1
            ? [["wicker_basket_01", side * 1.98, 1.05, i * 0.9, 1.15]]
            : [["planter_pot_clay", side * 2.0, 1.04, i, 0.95], ["brass_pot_02", side * 1.55, 1.18, i * 1.3, 0.8]];
      for (const [id, x, z, ry, k] of set) {
        const m = mk(id, k);
        if (!m) continue;
        m.position.set(x, 0, z);
        m.rotation.y = ry;
        st.group.add(m);
      }
    });
    // a pair of tall brass vases by the entrance cypresses
    for (const sx of [-1, 1]) {
      const m = mk("brass_vase_01", 1);
      if (!m) continue;
      m.position.set(sx * 4.25, 0, R * 0.79);
      m.rotation.y = sx * 0.6;
      this.scene.add(m);
      this.obstacles.push({ c: new Vector3(m.position.x, 0, m.position.z), r: 0.2 });
    }
  }

  /** Make a historical figure turn to the visitor and speak for a while. */
  figureSpeak(id: string, seconds: number) {
    this.crowd?.speak(id, seconds);
  }

  figureHush(id: string) {
    this.crowd?.hush(id);
  }

  private updateNearestStall() {
    let best = -1;
    let bestScore = -Infinity;
    const fwd = this.forwardFlat();
    const p = this.pose.pos;
    this.stalls.forEach((s, i) => {
      const d = new Vector3(s.group.position.x - p.x, 0, s.group.position.z - p.z);
      const dist = d.length();
      const facing = d.normalize().dot(fwd);
      const score = facing * 2 - dist * 0.25;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0 && bestScore > 0) this.setCurrentStall(best);
  }

  /**
   * Dynamic resolution: every ~1.5 s compare the median frame time with the target and nudge the
   * render resolution; if still too slow at the floor, drop the heavy passes.
   */
  private perfGood = 0;
  private lastDprChange = 0;
  private downgrades = 0;

  /**
   * Dynamic resolution with hysteresis: resizing render targets is visible, so the resolution only
   * drops on sustained slow frames, waits between changes, and only climbs back after a long run of
   * comfortably fast frames (and never after it has had to drop twice) — no resolution "breathing".
   */
  private trackPerf(dt: number) {
    if (this.flight || document.hidden) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 120) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    this.frameTimes = [];
    const fps = 1 / Math.max(sorted[Math.floor(sorted.length * 0.5)], 1e-3);
    const now = performance.now();
    const floor = this.quality === "low" ? 0.6 : 0.75;
    if (fps < 45) {
      this.perfGood = 0;
      if (now - this.lastDprChange < 4000) return;
      this.lastDprChange = now;
      this.downgrades++;
      if (this.dpr > floor + 0.01) this.setDpr(Math.max(floor, this.dpr - 0.2));
      else if (!this.qualityLocked && this.quality !== "low") {
        this.quality = this.quality === "high" ? "medium" : "low";
        this.applyQuality();
      }
    } else if (fps > 57) {
      this.perfGood++;
      if (this.perfGood >= 5 && this.downgrades < 2 && this.dpr < this.dprCap - 0.01 && now - this.lastDprChange > 15000) {
        this.perfGood = 0;
        this.lastDprChange = now;
        this.setDpr(Math.min(this.dprCap, this.dpr + 0.1));
      }
    } else this.perfGood = 0;
  }

  private setDpr(v: number) {
    this.dpr = v;
    this.renderer.setPixelRatio(v);
    this.composer.setPixelRatio(v);
    this.onResize();
  }

  // ───────────────────────────── Teardown ─────────────────────────────

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onPointerDown);
    el.removeEventListener("pointermove", this.onPointerMove);
    el.removeEventListener("pointerup", this.onPointerUp);
    el.removeEventListener("pointercancel", this.onPointerUp);
    el.removeEventListener("pointerleave", this.onPointerLeave);
    el.removeEventListener("wheel", this.onWheel);
    this.env?.envDispose();
    this.crowd?.dispose();
    this.people?.dispose();
    disposeScans();
    this.ambience.dispose();
    disposeObject(this.scene);
    disposeProduceModels();
    disposeProduceMaterials();
    disposeTextureCache();
    this.composer?.dispose();
    this.renderer.dispose();
    el.remove();
  }
}

/** Yield to the browser: next animation frame, or a short timeout when the tab is hidden. */
function nextFrame() {
  return new Promise<void>((r) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      r();
    };
    requestAnimationFrame(finish);
    setTimeout(finish, 60);
  });
}

export type { MarketStallData, MarketProduct };
