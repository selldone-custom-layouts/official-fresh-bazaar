/*
 * Fresh Market 3D — one realistic person driven by motion capture.
 *
 *  • Locomotion blend tree: idle ↔ slow walk ↔ walk, with the gait phase advanced by the real ground
 *    speed ÷ captured stride length, so feet stay planted (no skating) at any speed.
 *  • Turning on the spot blends in short shuffling steps instead of spinning on frozen feet.
 *  • Standing layer: several idle captures cross-faded at random (weight shifts, breathing, glances),
 *    plus one-shot acts — wave, talk, listen, present, look around, fidget.
 *  • Procedural head/neck look-at layered on top of the capture (people look at you, at produce,
 *    at whoever they talk to), with eased saccade-like motion.
 */
import { AnimationAction, AnimationMixer, Bone, Group, LoopOnce, LoopRepeat, MathUtils, Quaternion, SkinnedMesh, Vector3 } from "three";
import { AvatarAsset, AvatarInfo, CLIPS, ClipRole, PeopleLibrary } from "./library";
import type { Costume } from "./costume";

export interface PersonOptions {
  /** override clip lists (e.g. seated idles) */
  clips?: Partial<Record<ClipRole, string[]>>;
  costume?: Costume;
}

export type Act = "wave" | "talk" | "listen" | "present" | "look" | "fidget";

interface Loco {
  action: AnimationAction;
  /** captured ground speed (m/s) for this avatar's leg length */
  speed: number;
  /** distance covered per gait cycle (m) */
  stride: number;
  duration: number;
}

interface StandSlot {
  action: AnimationAction;
  w: number;
  target: number;
}

const _q = new Quaternion();
const _qp = new Quaternion();
const _v = new Vector3();
const _axis = new Vector3();
const UP = new Vector3(0, 1, 0);

function wrap(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Person {
  readonly root: Group;
  readonly mesh: SkinnedMesh;
  readonly info: AvatarInfo;
  /** ground speed (m/s) and heading turn rate (rad/s), written by the crowd each frame */
  speed = 0;
  turn = 0;
  lookTarget: Vector3 | null = null;

  private mixer: AnimationMixer;
  private hip: Bone;
  private neck: Bone | undefined;
  private head: Bone | undefined;
  private walk: Loco;
  private slow: Loco;
  private stand = new Map<string, StandSlot>();
  private current = "";
  private idles: string[] = [];
  private actEnd = 0;
  private idleTimer = 8 + Math.random() * 12;
  private locoW = 0;
  private phase = Math.random();
  private t = 0;
  private look = { yaw: 0, pitch: 0, vy: 0, vp: 0, w: 0 };
  private skip = 0;
  private acc = 0;

  private extra: SkinnedMesh[] = [];
  private set: Record<ClipRole, string[]>;

  constructor(private lib: PeopleLibrary, id: string, opts: PersonOptions = {}) {
    const inst = lib.instance(id, opts.costume);
    this.extra = inst.extra;
    this.root = inst.root;
    this.mesh = inst.mesh;
    const asset = inst.asset;
    this.info = asset.info;
    this.hip = inst.bones.get("Bip01")!;
    this.neck = inst.bones.get("Bip01_Neck");
    this.head = inst.bones.get("Bip01_Head");
    this.mixer = new AnimationMixer(this.root);
    const set = { ...CLIPS[asset.info.sex], ...(opts.clips || {}) } as Record<ClipRole, string[]>;
    this.set = set;
    const pick = (role: ClipRole) => set[role][Math.floor(Math.random() * set[role].length)];
    this.walk = this.loco(asset, set.walk[0]);
    this.slow = this.loco(asset, pick("slow"));
    // standing layer
    for (const role of ["idle", "look", "talk", "listen", "wave", "present", "fidget"] as ClipRole[]) {
      for (const name of new Set(set[role])) {
        if (this.stand.has(name)) {
          if (role === "idle") this.idles.push(name);
          continue;
        }
        const info = lib.clipFor(name, asset.hipY);
        if (!info) continue;
        const a = this.mixer.clipAction(info.clip);
        a.setLoop(role === "idle" || role === "talk" || role === "listen" ? LoopRepeat : LoopOnce, Infinity);
        a.clampWhenFinished = true;
        a.enabled = true;
        a.setEffectiveWeight(0);
        a.play();
        this.stand.set(name, { action: a, w: 0, target: 0 });
        if (role === "idle") this.idles.push(name);
      }
    }
    const first = this.idles[Math.floor(Math.random() * this.idles.length)];
    const slot = this.stand.get(first);
    if (slot) {
      slot.w = slot.target = 1;
      slot.action.time = Math.random() * slot.action.getClip().duration;
    }
    this.current = first;
  }

  private loco(asset: AvatarAsset, name: string): Loco {
    const info = this.lib.clipFor(name, asset.hipY)!;
    const a = this.mixer.clipAction(info.clip);
    a.setLoop(LoopRepeat, Infinity);
    a.enabled = true;
    a.timeScale = 0; // the gait phase is driven by ground speed
    a.setEffectiveWeight(0);
    a.play();
    const ratio = asset.hipY / info.hipY;
    const speed = (info.speed / 100) * ratio;
    return { action: a, speed, stride: speed * info.clip.duration, duration: info.clip.duration };
  }

  get height() {
    return this.info.child ? 1.2 : this.info.sex === "f" ? 1.66 : 1.78;
  }

  /** true while a one-shot act (wave, talk…) is playing */
  busy() {
    return this.t < this.actEnd;
  }

  /** Play an act on the standing layer; returns its duration in seconds. */
  act(kind: Act, maxDur?: number): number {
    const names = this.set[kind as ClipRole] || [];
    const name = names[Math.floor(Math.random() * names.length)];
    const slot = name && this.stand.get(name);
    if (!slot) return 0;
    const clipDur = slot.action.getClip().duration;
    const looping = kind === "talk" || kind === "listen";
    slot.action.reset();
    slot.action.setEffectiveWeight(0);
    if (looping) slot.action.time = Math.random() * clipDur * 0.5;
    const dur = Math.min(maxDur ?? (looping ? 8 : clipDur), looping ? 60 : clipDur) ;
    this.fadeTo(name);
    this.actEnd = this.t + Math.max(0.5, dur - 0.45);
    return dur;
  }

  private fadeTo(name: string) {
    this.current = name;
    this.stand.forEach((s, n) => (s.target = n === name ? 1 : 0));
  }

  private backToIdle() {
    const name = this.idles[Math.floor(Math.random() * this.idles.length)];
    const slot = this.stand.get(name)!;
    if (slot.w < 0.01) slot.action.time = Math.random() * slot.action.getClip().duration;
    this.fadeTo(name);
  }

  update(dt: number, cam?: Vector3) {
    // far people animate at half rate
    if (cam) {
      const far = this.root.position.distanceToSquared(cam) > 22 * 22;
      this.acc += dt;
      if (far && (this.skip++ & 1)) return;
      dt = this.acc;
    }
    this.acc = 0;
    this.t += dt;

    // ── locomotion weights and gait phase
    const v = this.speed;
    const turning = v < 0.25 ? Math.min(0.5, Math.abs(this.turn) * 0.55) : 0;
    const target = Math.max(MathUtils.smoothstep(v, 0.03, 0.24), turning);
    this.locoW += (target - this.locoW) * Math.min(1, dt * 6);
    const k = MathUtils.clamp((v - this.slow.speed) / Math.max(0.05, this.walk.speed - this.slow.speed), 0, 1);
    const stride = MathUtils.lerp(this.slow.stride, this.walk.stride, k);
    const vEff = Math.max(v, Math.abs(this.turn) * 0.32, this.locoW > 0.02 ? 0.22 : 0);
    this.phase = (this.phase + (dt * vEff) / stride) % 1;
    this.slow.action.time = this.phase * this.slow.duration;
    this.walk.action.time = this.phase * this.walk.duration;
    this.slow.action.setEffectiveWeight(this.locoW * (1 - k));
    this.walk.action.setEffectiveWeight(this.locoW * k);

    // ── standing layer
    if (this.actEnd && this.t >= this.actEnd) {
      this.actEnd = 0;
      this.backToIdle();
    }
    if (!this.busy() && this.locoW < 0.1) {
      this.idleTimer -= dt;
      if (this.idleTimer <= 0) {
        this.idleTimer = 9 + Math.random() * 14;
        const r = Math.random();
        if (r < 0.22) this.act("look");
        else if (r < 0.3) this.act("fidget");
        else this.backToIdle();
      }
    }
    let sum = 0;
    this.stand.forEach((s) => {
      const rate = dt / 0.45;
      s.w = s.target > s.w ? Math.min(s.target, s.w + rate) : Math.max(s.target, s.w - rate);
      sum += s.w;
    });
    const standW = 1 - this.locoW;
    this.stand.forEach((s) => s.action.setEffectiveWeight(sum > 0 ? (s.w / sum) * standW : 0));

    this.mixer.update(dt);
    this.updateLook(dt);
  }

  private updateLook(dt: number) {
    const L = this.look;
    let wantYaw = 0, wantPitch = 0, wantW = 0;
    if (this.lookTarget && this.head) {
      this.head.getWorldPosition(_v);
      const dx = this.lookTarget.x - _v.x, dy = this.lookTarget.y - _v.y, dz = this.lookTarget.z - _v.z;
      const rel = wrap(Math.atan2(dx, dz) - this.root.rotation.y);
      if (Math.abs(rel) < 1.75) {
        wantYaw = MathUtils.clamp(rel, -1.1, 1.1);
        wantPitch = MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.55, 0.35);
        wantW = 1;
      }
    }
    // critically damped springs: quick start, soft settle (like a real head turn)
    const w = 9;
    const spring = (x: number, vel: number, goal: number) => {
      const a = w * w * (goal - x) - 2 * w * vel;
      vel += a * dt;
      return [x + vel * dt, vel];
    };
    [L.yaw, L.vy] = spring(L.yaw, L.vy, wantYaw);
    [L.pitch, L.vp] = spring(L.pitch, L.vp, wantPitch);
    L.w += (wantW - L.w) * Math.min(1, dt * 3);
    const yaw = L.yaw * L.w;
    const pitch = L.pitch * L.w;
    if (Math.abs(yaw) < 1e-3 && Math.abs(pitch) < 1e-3) return;
    const heading = this.root.rotation.y;
    const apply = (bone: Bone | undefined, fy: number, fp: number, yawSoFar: number) => {
      if (!bone || !bone.parent) return;
      // world rotation: yaw about world up, then pitch about the (yawed) body left axis
      _axis.set(Math.cos(heading + yawSoFar + yaw * fy), 0, -Math.sin(heading + yawSoFar + yaw * fy));
      _q.setFromAxisAngle(UP, yaw * fy);
      _qp.setFromAxisAngle(_axis, -pitch * fp);
      _q.premultiply(_qp);
      bone.parent.getWorldQuaternion(_qp);
      // local' = parentWorld⁻¹ · R · parentWorld · local
      const pInv = _qp.clone().invert();
      bone.quaternion.premultiply(pInv.multiply(_q).multiply(_qp));
    };
    apply(this.neck, 0.4, 0.35, 0);
    apply(this.head, 0.6, 0.65, yaw * 0.4);
  }

  dispose() {
    this.extra.forEach((m) => {
      m.geometry.dispose();
      (m.material as any).dispose?.();
    });
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }
}
