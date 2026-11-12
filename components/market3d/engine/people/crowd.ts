/*
 * Fresh Market 3D — crowd behaviour.
 *
 *  Vendors   stand by their stall, turn to face whoever comes close, greet the visitor, present their
 *            produce, chat with shoppers.
 *  Shoppers  plan curved routes around the fountain and trees, walk with human acceleration and turn
 *            rates, predict and sidestep each other (time-to-collision avoidance, keep-right bias),
 *            browse crates (eyes moving over the produce), talk to the vendor, linger by the pool.
 *            Couples and parent+child walk side by side.
 *  Locals    small groups in conversation, taking turns to talk and listen.
 *
 * Bodies are realistic motion-capture people (Person) or the procedural fallback (Character); both
 * implement Body.
 */
import { Group, MathUtils, Object3D, Vector3 } from "three";
import { Rng } from "../util/noise";
import type { Act } from "./person";

export interface Body {
  root: Object3D;
  speed: number;
  turn: number;
  lookTarget: Vector3 | null;
  readonly height?: number;
  act(kind: Act, maxDur?: number): number;
  busy(): boolean;
  update(dt: number, cam?: Vector3): void;
  dispose(): void;
}

export interface StallSpot {
  /** world position of the stall front centre and its outward normal */
  front: Vector3;
  normal: Vector3;
  /** vendor spot (world) and facing */
  vendor: Vector3;
  vendorYaw: number;
}

export interface CrowdOptions {
  stalls: StallSpot[];
  plazaRadius: number;
  /** obstacles on the plaza floor (centre + radius), e.g. the pool and planters */
  obstacles: Array<{ c: Vector3; r: number }>;
  quality: "low" | "medium" | "high";
  make: (kind: "vendor" | "walker" | "chatter" | "figure", index: number) => Body;
  /** historical figures: fixed spots, they notice the visitor and speak when clicked */
  figures?: Array<{ id: string; pos: Vector3; yaw: number; seated: boolean }>;
  /** walker index pairs [leader, follower] that walk together */
  companions?: Array<[number, number]>;
}

interface Agent {
  b: Body;
  pos: Vector3;
  heading: number;
  angVel: number;
  speed: number;
  vel: Vector3;
  radius: number;
  head: number;
}

interface Walker extends Agent {
  state: "walk" | "browse" | "linger";
  path: Vector3[];
  goalYaw: number | null;
  stall: number;
  slot: number;
  timer: number;
  maxSpeed: number;
  lane: number;
  leader: Walker | null;
  followers: Walker[];
  side: number;
  nextLook: number;
  look: Vector3;
  talked: boolean;
  glanceT: number;
  glanceCool: number;
  stuck: number;
}

interface Vendor extends Agent {
  spot: StallSpot;
  baseYaw: number;
  greetCool: number;
  actTimer: number;
  near: boolean;
  focus: Vector3 | null;
}

interface FigureAgent extends Agent {
  id: string;
  baseYaw: number;
  seated: boolean;
  speakUntil: number;
}

interface Chatter extends Agent {
  partner: Chatter | null;
  speaking: boolean;
  turnTimer: number;
  baseYaw: number;
}

const tmp = new Vector3();
const tmp2 = new Vector3();

function wrap(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Crowd {
  readonly group = new Group();
  private vendors: Vendor[] = [];
  private walkers: Walker[] = [];
  private chatters: Chatter[] = [];
  private figures: FigureAgent[] = [];
  private time = 0;
  private rng = new Rng(77);
  private o: CrowdOptions;
  private poolR = 2;
  private maxR: number;
  private player = { pos: new Vector3(), vel: new Vector3(), prev: new Vector3(), init: false };
  private slots: Array<Set<number>>;

  constructor(o: CrowdOptions) {
    this.o = o;
    const rng = this.rng;
    this.maxR = o.plazaRadius - 1.4;
    const pool = o.obstacles.find((ob) => ob.c.lengthSq() < 0.01);
    if (pool) this.poolR = pool.r;
    this.slots = o.stalls.map(() => new Set<number>());

    // vendors
    o.stalls.forEach((s, i) => {
      const b = o.make("vendor", i);
      b.root.position.copy(s.vendor);
      b.root.rotation.y = s.vendorYaw;
      this.group.add(b.root);
      this.vendors.push({
        b, pos: b.root.position, heading: s.vendorYaw, angVel: 0, speed: 0, vel: new Vector3(), radius: 0.32, head: (b.height ?? 1.75) - 0.12,
        spot: s, baseYaw: s.vendorYaw, greetCool: 0, actTimer: rng.range(3, 10), near: false, focus: null,
      });
    });

    // historical figures
    (o.figures || []).forEach((f, i) => {
      const b = o.make("figure", i);
      b.root.position.copy(f.pos);
      b.root.rotation.y = f.yaw;
      this.group.add(b.root);
      this.figures.push({ b, pos: b.root.position, heading: f.yaw, angVel: 0, speed: 0, vel: new Vector3(), radius: f.seated ? 0.45 : 0.34, head: f.seated ? 1.25 : 1.68, id: f.id, baseYaw: f.yaw, seated: f.seated, speakUntil: 0 });
    });

    // shoppers — a calm, believable number of people
    const n = o.quality === "low" ? 4 : o.quality === "medium" ? 6 : 7;
    for (let i = 0; i < n; i++) {
      const b = o.make("walker", i);
      const a = rng.range(-Math.PI, Math.PI);
      const r = rng.range(this.poolR + 1.2, this.maxR - 0.5);
      b.root.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
      const heading = rng.range(-Math.PI, Math.PI);
      b.root.rotation.y = heading;
      this.group.add(b.root);
      const child = (b.height ?? 1.7) < 1.4;
      const w: Walker = {
        b, pos: b.root.position, heading, angVel: 0, speed: 0, vel: new Vector3(), radius: child ? 0.22 : 0.3, head: (b.height ?? 1.7) - 0.12,
        state: "linger", path: [], goalYaw: null, stall: -1, slot: -1, timer: rng.range(0.2, 3), maxSpeed: rng.range(0.95, 1.22),
        lane: rng.range(-0.5, 0.5), leader: null, followers: [], side: 1, nextLook: 0, look: new Vector3(), talked: false,
        glanceT: 0, glanceCool: rng.range(1, 6), stuck: 0,
      };
      w.look.copy(w.pos).add(new Vector3(Math.sin(heading), 1.4, Math.cos(heading)));
      this.walkers.push(w);
    }
    for (const [l, f] of o.companions || []) {
      const L = this.walkers[l], F = this.walkers[f];
      if (!L || !F) continue;
      F.leader = L;
      L.followers.push(F);
      F.side = L.followers.length % 2 ? 1 : -1;
      F.pos.copy(L.pos).addScaledVector(this.right(L.heading), 0.7 * F.side);
      F.heading = L.heading;
      L.maxSpeed = Math.min(L.maxSpeed, 1.02); // walking with a child / partner
    }

    // locals chatting in small groups near the entrance
    if (o.quality !== "low") {
      const R = o.plazaRadius;
      const groups: Array<[Vector3, Vector3]> = [[new Vector3(-3.3, 0, R * 0.6), new Vector3(-2.45, 0, R * 0.6 + 0.55)]];
      let k = 0;
      for (const [pa, pb] of groups) {
        const A = this.makeChatter(k++, pa, pb);
        const B = this.makeChatter(k++, pb, pa);
        A.partner = B;
        B.partner = A;
        A.speaking = true;
        A.turnTimer = rng.range(1, 4);
        B.turnTimer = 999;
      }
    }
  }

  private makeChatter(i: number, at: Vector3, other: Vector3): Chatter {
    const b = this.o.make("chatter", i);
    b.root.position.copy(at);
    // face the partner, opened slightly towards the plaza (a natural conversation stance)
    const yaw = Math.atan2(other.x - at.x, other.z - at.z) + (i % 2 ? -0.28 : 0.28);
    b.root.rotation.y = yaw;
    this.group.add(b.root);
    const c: Chatter = {
      b, pos: b.root.position, heading: yaw, angVel: 0, speed: 0, vel: new Vector3(), radius: 0.32, head: (b.height ?? 1.72) - 0.12,
      partner: null, speaking: false, turnTimer: 0, baseYaw: yaw,
    };
    this.chatters.push(c);
    return c;
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private fwd(h: number) {
    return tmp2.set(Math.sin(h), 0, Math.cos(h));
  }

  private right(h: number) {
    return new Vector3(-Math.cos(h), 0, Math.sin(h));
  }

  /** stall-local point (x across the counter, y up, z towards the shopper) → world */
  private stallPoint(i: number, x: number, y: number, z: number, out = new Vector3()) {
    const s = this.o.stalls[i];
    const tx = s.normal.z, tz = -s.normal.x; // stall local +X
    return out.set(s.front.x + tx * x + s.normal.x * (z - 0.9), y, s.front.z + tz * x + s.normal.z * (z - 0.9));
  }

  private segmentHits(a: Vector3, b: Vector3, c: Vector3, r: number) {
    const abx = b.x - a.x, abz = b.z - a.z;
    const len2 = abx * abx + abz * abz || 1e-6;
    const t = MathUtils.clamp(((c.x - a.x) * abx + (c.z - a.z) * abz) / len2, 0, 1);
    const px = a.x + abx * t, pz = a.z + abz * t;
    return Math.hypot(c.x - px, c.z - pz) < r ? new Vector3(px, 0, pz) : null;
  }

  /** Curved route around the pool, with detours around planters. */
  private planPath(from: Vector3, to: Vector3, lane: number): Vector3[] {
    const rr = this.poolR + 0.9;
    const pts: Vector3[] = [];
    if (this.segmentHits(from, to, new Vector3(), rr)) {
      const a0 = Math.atan2(from.x, from.z), a1 = Math.atan2(to.x, to.z);
      const da = wrap(a1 - a0);
      const r0 = Math.max(Math.hypot(from.x, from.z), rr + 0.4), r1 = Math.max(Math.hypot(to.x, to.z), rr + 0.4);
      const n = Math.max(2, Math.ceil(Math.abs(da) / 0.42));
      for (let k = 1; k < n; k++) {
        const a = a0 + (da * k) / n;
        const bulge = Math.sin((Math.PI * k) / n) * 0.35;
        const r = MathUtils.clamp(MathUtils.lerp(r0, r1, k / n) + lane * 0.6 - bulge, rr + 0.3, this.maxR - 0.4);
        pts.push(new Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));
      }
    }
    pts.push(to.clone());
    // planter detours
    const out: Vector3[] = [];
    let prev = from;
    for (const p of pts) {
      for (const ob of this.o.obstacles) {
        if (ob.c.lengthSq() < 0.01) continue;
        const hit = this.segmentHits(prev, p, ob.c, ob.r + 0.45);
        if (hit) {
          const away = hit.clone().sub(ob.c);
          away.y = 0;
          if (away.lengthSq() < 1e-4) away.set(-(p.z - prev.z), 0, p.x - prev.x);
          away.normalize();
          out.push(ob.c.clone().addScaledVector(away, ob.r + 0.75));
        }
      }
      out.push(p);
      prev = p;
    }
    return out;
  }

  private occupancy(i: number) {
    let n = 0;
    for (const w of this.walkers) if (w.stall === i && !w.leader) n++;
    return n;
  }

  private pickDestination(w: Walker) {
    const rng = this.rng;
    const stalls = this.o.stalls;
    const prevStall = w.stall;
    if (w.stall >= 0 && w.slot >= 0) this.slots[w.stall].delete(w.slot);
    w.stall = -1;
    w.slot = -1;
    w.talked = false;
    const r = rng.next();
    if (stalls.length && r < 0.74) {
      // a stall with room, not the one we just left
      const order = stalls.map((_, i) => i).sort(() => rng.next() - 0.5);
      const i = order.find((k) => k !== prevStall && this.occupancy(k) < 2 && this.slots[k].size < 4) ?? order[0];
      const free = [0, 1, 2, 3].filter((k) => !this.slots[i].has(k));
      const slot = free.length ? free[rng.int(0, free.length - 1)] : rng.int(0, 3);
      this.slots[i].add(slot);
      const xs = [-1.12, -0.38, 0.38, 1.12];
      const dest = this.stallPoint(i, xs[slot] + rng.range(-0.12, 0.12), 0, 0.9 + rng.range(0.78, 0.95));
      w.stall = i;
      w.slot = slot;
      w.goalYaw = Math.atan2(-stalls[i].normal.x, -stalls[i].normal.z);
      w.path = this.planPath(w.pos, dest, w.lane);
      w.timer = rng.range(7, 16);
    } else if (r < 0.88) {
      // watch the fountain for a moment
      const a = rng.range(-Math.PI, Math.PI);
      const rr = this.poolR + rng.range(0.55, 0.9);
      const dest = new Vector3(Math.sin(a) * rr, 0, Math.cos(a) * rr);
      w.goalYaw = Math.atan2(-dest.x, -dest.z);
      w.path = this.planPath(w.pos, dest, w.lane);
      w.timer = rng.range(3, 7);
    } else {
      // stroll to an open spot and look around
      const a = rng.range(-Math.PI, Math.PI);
      const rr = rng.range(this.poolR + 1.4, this.maxR - 0.8);
      const dest = new Vector3(Math.sin(a) * rr, 0, Math.cos(a) * rr);
      w.goalYaw = null;
      w.path = this.planPath(w.pos, dest, w.lane);
      w.timer = rng.range(2, 5);
    }
    w.state = "walk";
  }

  // ───────────────────────────── update ─────────────────────────────

  update(dt: number, camera: Vector3) {
    dt = Math.min(dt, 0.1);
    const P = this.player;
    P.pos.set(camera.x, 0, camera.z);
    if (!P.init) {
      P.prev.copy(P.pos);
      P.init = true;
    }
    P.vel.copy(P.pos).sub(P.prev).multiplyScalar(1 / Math.max(dt, 1e-3));
    if (P.vel.length() > 6) P.vel.setLength(6);
    P.prev.copy(P.pos);
    const eye = camera;

    this.time += dt;
    this.updateVendors(dt, eye);
    this.updateChatters(dt, eye);
    this.updateFigures(dt, eye);
    for (const w of this.walkers) this.updateWalker(w, dt, eye);
    this.resolveOverlaps();

    for (const a of [...this.vendors, ...this.chatters, ...this.figures, ...this.walkers]) {
      a.b.root.rotation.y = a.heading;
      a.b.speed = a.speed;
      a.b.turn = a.angVel;
      a.b.update(dt, eye);
    }
  }

  private turnTowards(a: Agent, yaw: number, dt: number, maxRate: number) {
    const diff = wrap(yaw - a.heading);
    const want = MathUtils.clamp(diff * 3.2, -maxRate, maxRate);
    a.angVel += (want - a.angVel) * Math.min(1, dt * 7);
    a.heading = wrap(a.heading + a.angVel * dt);
    return diff;
  }

  private updateVendors(dt: number, eye: Vector3) {
    const P = this.player;
    for (const v of this.vendors) {
      const dPlayer = Math.hypot(P.pos.x - v.pos.x, P.pos.z - v.pos.z);
      const toPlayer = Math.atan2(P.pos.x - v.pos.x, P.pos.z - v.pos.z);
      const inFront = Math.abs(wrap(toPlayer - v.baseYaw)) < 1.5;
      // who deserves attention: the visitor, else a shopper at this stall
      let focus: Vector3 | null = null;
      if (dPlayer < 6 && inFront) focus = eye;
      else {
        const idx = this.vendors.indexOf(v);
        const s = this.walkers.find((w) => w.stall === idx && w.state === "browse");
        if (s) focus = tmp.set(s.pos.x, s.head, s.pos.z).clone();
      }
      v.focus = focus;
      let goal = v.baseYaw;
      if (focus) {
        const want = Math.atan2(focus.x - v.pos.x, focus.z - v.pos.z);
        goal = v.baseYaw + MathUtils.clamp(wrap(want - v.baseYaw), -0.95, 0.95);
      }
      this.turnTowards(v, goal, dt, 1.3);
      v.b.lookTarget = focus;
      // greet the visitor as they arrive
      v.greetCool -= dt;
      const near = dPlayer < 4.2 && inFront;
      if (near && !v.near && v.greetCool <= 0 && !v.b.busy()) {
        v.b.act("wave");
        v.greetCool = 25;
      }
      v.near = near;
      v.actTimer -= dt;
      if (v.actTimer <= 0 && !v.b.busy()) {
        v.actTimer = this.rng.range(6, 13);
        if (near) v.b.act(this.rng.next() < 0.7 ? "present" : "talk", this.rng.range(3.5, 6));
        else if (!focus && this.rng.next() < 0.35) v.b.act("look");
      }
    }
  }

  private updateFigures(dt: number, eye: Vector3) {
    const P = this.player;
    for (const f of this.figures) {
      const dPlayer = Math.hypot(P.pos.x - f.pos.x, P.pos.z - f.pos.z);
      const toPlayer = Math.atan2(P.pos.x - f.pos.x, P.pos.z - f.pos.z);
      const inFront = Math.abs(wrap(toPlayer - f.baseYaw)) < 1.7;
      const speaking = this.time < f.speakUntil;
      const attentive = speaking || (dPlayer < 5 && inFront);
      f.b.lookTarget = attentive ? eye : null;
      if (!f.seated) {
        const goal = attentive ? f.baseYaw + MathUtils.clamp(wrap(toPlayer - f.baseYaw), -0.85, 0.85) : f.baseYaw;
        this.turnTowards(f, goal, dt, 1.1);
      }
    }
  }

  /** A historical figure turns to the visitor and speaks for `seconds`. */
  speak(id: string, seconds: number) {
    const f = this.figures.find((x) => x.id === id);
    if (!f) return;
    f.speakUntil = this.time + seconds;
    f.b.act("talk", seconds);
  }

  /** Stop speaking early (card closed). */
  hush(id: string) {
    const f = this.figures.find((x) => x.id === id);
    if (f) f.speakUntil = 0;
  }

  /** World position + root of each figure (for click targets). */
  figureRoots() {
    return this.figures.map((f) => ({ id: f.id, root: f.b.root, seated: f.seated }));
  }

  private updateChatters(dt: number, eye: Vector3) {
    const P = this.player;
    for (const c of this.chatters) {
      const p = c.partner!;
      const dPlayer = Math.hypot(P.pos.x - c.pos.x, P.pos.z - c.pos.z);
      // the listener glances at a visitor who stops right next to them; otherwise eyes on the partner
      const listening = c.speaking; // "speaking" = it is our turn next, i.e. we are listening now
      c.b.lookTarget = listening && dPlayer < 2.4 ? eye : (c.b.lookTarget && c.b.lookTarget !== eye ? c.b.lookTarget.set(p.pos.x, p.head, p.pos.z) : new Vector3(p.pos.x, p.head, p.pos.z));
      c.turnTimer -= dt;
      if (c.speaking && c.turnTimer <= 0) {
        const dur = this.rng.range(4, 9);
        c.b.act("talk", dur);
        p.b.act("listen", dur);
        c.speaking = false;
        p.speaking = true;
        p.turnTimer = dur + this.rng.range(0.3, 1.2);
        c.turnTimer = 999;
      }
      this.turnTowards(c, c.baseYaw, dt, 1);
    }
  }

  private updateWalker(w: Walker, dt: number, eye: Vector3) {
    const rng = this.rng;
    const L = w.leader;
    let dest: Vector3 | null = null;
    let arriveSpeed = w.maxSpeed;

    if (L) {
      // companion: keep beside the leader (a little behind when walking)
      const walking = L.speed > 0.25;
      const fh = L.heading;
      tmp.copy(L.pos).addScaledVector(this.right(fh), 0.68 * w.side);
      if (walking) tmp.addScaledVector(this.fwd(fh), -0.12);
      dest = tmp.clone();
      const d = Math.hypot(dest.x - w.pos.x, dest.z - w.pos.z);
      arriveSpeed = MathUtils.clamp(L.speed + d * 1.4, 0, w.maxSpeed * 1.3);
      w.state = walking ? "walk" : L.state;
      w.stall = L.stall;
      w.goalYaw = walking ? null : L.goalYaw ?? L.heading;
      if (d < 0.12 && !walking) dest = null;
    } else if (w.state === "walk") {
      while (w.path.length > 1 && Math.hypot(w.path[0].x - w.pos.x, w.path[0].z - w.pos.z) < 0.75) w.path.shift();
      dest = w.path[0] || null;
      if (dest) {
        const d = Math.hypot(dest.x - w.pos.x, dest.z - w.pos.z);
        const last = w.path.length === 1;
        if (last) arriveSpeed = w.maxSpeed * MathUtils.smoothstep(d, 0.05, 1.5) + 0.06;
        if (last && (d < 0.16 || (d < 0.5 && w.stuck > 2.5))) {
          w.path = [];
          dest = null;
          w.state = w.stall >= 0 ? "browse" : "linger";
          w.nextLook = 0;
          w.stuck = 0;
        }
      } else w.state = "linger";
    } else {
      // browsing or lingering
      w.timer -= dt;
      if (w.timer <= 0 && !w.b.busy()) this.pickDestination(w);
    }

    // ── steering
    const desired = new Vector3();
    if (dest) {
      tmp.copy(dest).sub(w.pos);
      tmp.y = 0;
      const d = tmp.length();
      if (d > 1e-3) desired.copy(tmp).multiplyScalar(Math.min(arriveSpeed, w.maxSpeed * 1.3) / d);
    }
    const moving = desired.lengthSq() > 0.0004;
    if (moving) this.avoid(w, desired);
    const dlen = desired.length();
    let goalHeading = w.heading;
    if (dlen > 0.05) goalHeading = Math.atan2(desired.x, desired.z);
    else if (w.goalYaw != null) goalHeading = w.goalYaw;
    const maxTurn = MathUtils.lerp(2.6, 1.5, MathUtils.clamp(w.speed / 1.2, 0, 1));
    const diff = this.turnTowards(w, goalHeading, dt, maxTurn);
    const targetSpeed = dlen > 0.05 ? Math.min(dlen, w.maxSpeed * 1.3) * MathUtils.clamp(Math.cos(diff) * 1.25, 0.12, 1) : 0;
    const accel = targetSpeed > w.speed ? 0.95 : 1.9;
    w.speed = targetSpeed > w.speed ? Math.min(targetSpeed, w.speed + accel * dt) : Math.max(targetSpeed, w.speed - accel * dt);
    const f = this.fwd(w.heading);
    w.vel.copy(f).multiplyScalar(w.speed);
    w.pos.addScaledVector(w.vel, dt);
    if (w.state === "walk" && w.speed < 0.15 && dest) w.stuck += dt;
    else w.stuck = Math.max(0, w.stuck - dt);
    if (!L && w.stuck > 6) {
      w.stuck = 0;
      this.pickDestination(w);
    }
    this.keepInside(w);

    // ── attention
    this.walkerGaze(w, dt, eye);
    void rng;
  }

  /** Predictive (time-to-collision) avoidance + separation + obstacle and boundary forces. */
  private avoid(w: Walker, desired: Vector3) {
    const others: Agent[] = [...this.walkers, ...this.vendors, ...this.chatters, ...this.figures];
    const P = this.player;
    const consider = (pos: Vector3, vel: Vector3, r: number, weight: number) => {
      const rx = pos.x - w.pos.x, rz = pos.z - w.pos.z;
      const dist = Math.hypot(rx, rz);
      if (dist > 4 || dist < 1e-4) return;
      const minD = w.radius + r + 0.22;
      if (dist < minD) {
        const k = ((minD - dist) / minD) * 2.2 * weight;
        desired.x -= (rx / dist) * k;
        desired.z -= (rz / dist) * k;
      }
      const vx = vel.x - w.vel.x, vz = vel.z - w.vel.z;
      const vv = vx * vx + vz * vz;
      if (vv < 1e-4) return;
      const t = -(rx * vx + rz * vz) / vv;
      if (t <= 0 || t > 2.6) return;
      const cx = rx + vx * t, cz = rz + vz * t;
      const cd = Math.hypot(cx, cz);
      if (cd >= minD + 0.15) return;
      const urgency = ((minD + 0.15 - cd) / (minD + 0.15)) * (1 - t / 2.6) * 1.7 * weight;
      let ax: number, az: number;
      if (cd > 0.02) {
        ax = -cx / cd;
        az = -cz / cd;
      } else {
        // dead ahead: pass on the right
        const rgt = this.right(w.heading);
        ax = rgt.x;
        az = rgt.z;
      }
      // a slight keep-right bias for head-on encounters
      const headOn = (rx * w.vel.x + rz * w.vel.z) > 0 && (vel.x * w.vel.x + vel.z * w.vel.z) < 0;
      if (headOn) {
        const rgt = this.right(w.heading);
        ax += rgt.x * 0.5;
        az += rgt.z * 0.5;
      }
      desired.x += ax * urgency;
      desired.z += az * urgency;
    };
    for (const o of others) {
      if (o === (w as Agent) || o === (w.leader as Agent) || (w.followers as Agent[]).includes(o)) continue;
      consider(o.pos, o.vel, o.radius, 1);
    }
    consider(P.pos, P.vel, 0.35, 1.3);
    for (const ob of this.o.obstacles) {
      const dx = w.pos.x - ob.c.x, dz = w.pos.z - ob.c.z;
      const d = Math.hypot(dx, dz);
      const m = ob.r + w.radius + 0.35;
      if (d < m && d > 1e-4) {
        const k = ((m - d) / m) * 2.5;
        desired.x += (dx / d) * k;
        desired.z += (dz / d) * k;
      }
    }
    const r = Math.hypot(w.pos.x, w.pos.z);
    if (r > this.maxR - 0.5) {
      const k = (r - (this.maxR - 0.5)) * 2;
      desired.x -= (w.pos.x / r) * k;
      desired.z -= (w.pos.z / r) * k;
    }
  }

  private keepInside(a: Agent) {
    const r = Math.hypot(a.pos.x, a.pos.z);
    if (r > this.maxR) {
      a.pos.x *= this.maxR / r;
      a.pos.z *= this.maxR / r;
    }
    for (const ob of this.o.obstacles) {
      const dx = a.pos.x - ob.c.x, dz = a.pos.z - ob.c.z;
      const d = Math.hypot(dx, dz);
      const m = ob.r + a.radius;
      if (d < m && d > 1e-4) {
        a.pos.x = ob.c.x + (dx / d) * m;
        a.pos.z = ob.c.z + (dz / d) * m;
      }
    }
  }

  /** People never interpenetrate: push overlapping walkers apart (static people don't move). */
  private resolveOverlaps() {
    const all: Agent[] = [...this.walkers, ...this.vendors, ...this.chatters, ...this.figures];
    for (const w of this.walkers) {
      for (const o of all) {
        if (o === w) continue;
        const dx = w.pos.x - o.pos.x, dz = w.pos.z - o.pos.z;
        const d = Math.hypot(dx, dz);
        const m = w.radius + o.radius;
        if (d < m && d > 1e-4) {
          const movable = this.walkers.includes(o as Walker);
          const push = (m - d) * (movable ? 0.5 : 1);
          w.pos.x += (dx / d) * push;
          w.pos.z += (dz / d) * push;
        }
      }
    }
  }

  private walkerGaze(w: Walker, dt: number, eye: Vector3) {
    const rng = this.rng;
    const P = this.player;
    w.glanceCool -= dt;
    w.glanceT -= dt;
    const dPlayer = Math.hypot(P.pos.x - w.pos.x, P.pos.z - w.pos.z);
    const ang = Math.abs(wrap(Math.atan2(P.pos.x - w.pos.x, P.pos.z - w.pos.z) - w.heading));
    if (w.glanceCool <= 0 && dPlayer < 4.2 && ang < 1.2) {
      w.glanceT = rng.range(1.1, 2.4);
      w.glanceCool = rng.range(7, 14);
    }
    if (w.glanceT > 0) {
      w.b.lookTarget = eye;
      return;
    }
    if (w.state === "browse" && w.stall >= 0) {
      const i = w.stall;
      // talk to the vendor once in a while
      if (!w.talked && !w.leader && w.timer < 9 && rng.next() < dt * 0.25 && !w.b.busy()) {
        w.talked = true;
        const v = this.vendors[i];
        const dur = rng.range(3.5, 6);
        w.b.act("talk", dur);
        if (v && !v.b.busy()) v.b.act(rng.next() < 0.5 ? "present" : "listen", dur);
        w.timer = Math.max(w.timer, dur + 1.5);
      }
      const v = this.vendors[i];
      if (w.b.busy() && v) {
        w.b.lookTarget = w.look.set(v.pos.x, v.head, v.pos.z);
        return;
      }
      w.nextLook -= dt;
      if (w.nextLook <= 0) {
        // eyes wander across the crates nearest to us
        const xs = [-1.17, -0.39, 0.39, 1.17];
        const base = w.slot >= 0 ? w.slot : 1;
        const k = MathUtils.clamp(base + rng.int(-1, 1), 0, 3);
        const upper = rng.next() < 0.4;
        this.stallPoint(i, xs[k] + rng.range(-0.2, 0.2), upper ? 1.1 : 0.86, upper ? -0.05 : 0.55, w.look);
        w.nextLook = rng.range(1.2, 2.8);
        if (w.leader && rng.next() < 0.3) w.look.set(w.leader.pos.x, w.leader.head, w.leader.pos.z);
      }
      w.b.lookTarget = w.look;
      return;
    }
    if (w.state === "linger") {
      w.nextLook -= dt;
      if (w.nextLook <= 0) {
        const r = rng.next();
        if (r < 0.45) w.look.set(rng.range(-0.3, 0.3), rng.range(0.6, 1.4), rng.range(-0.3, 0.3)); // the fountain
        else if (r < 0.65) w.look.set(0, 12, -(this.o.plazaRadius + 15)); // the dome
        else w.look.set(w.pos.x + rng.range(-4, 4), 1.5, w.pos.z + rng.range(-4, 4));
        w.nextLook = rng.range(1.5, 3.5);
        if (!w.b.busy() && rng.next() < 0.15) w.b.act("look");
      }
      w.b.lookTarget = w.b.busy() ? null : w.look;
      return;
    }
    // walking: mostly look where we go, glance at stalls we pass
    w.nextLook -= dt;
    if (w.nextLook <= 0) {
      w.nextLook = rng.range(1.4, 3.2);
      let best = -1, bd = 3.2;
      this.o.stalls.forEach((s, i) => {
        const d = Math.hypot(s.front.x - w.pos.x, s.front.z - w.pos.z);
        if (d < bd) (bd = d), (best = i);
      });
      if (best >= 0 && rng.next() < 0.55) this.stallPoint(best, rng.range(-1.2, 1.2), 0.9, 0.5, w.look);
      else if (w.leader && rng.next() < 0.4) w.look.set(w.leader.pos.x, w.leader.head, w.leader.pos.z);
      else w.look.set(NaN, 0, 0);
    }
    w.b.lookTarget = Number.isNaN(w.look.x) ? null : w.look;
  }

  /** Characters to raycast-ignore / dispose. */
  all(): Object3D[] {
    return [...this.vendors, ...this.chatters, ...this.figures, ...this.walkers].map((a) => a.b.root);
  }

  /** Positions the shopper should not walk through. */
  colliders(): Vector3[] {
    return [...this.vendors, ...this.chatters, ...this.figures, ...this.walkers].map((a) => a.pos);
  }

  dispose() {
    [...this.vendors, ...this.chatters, ...this.figures, ...this.walkers].forEach((a) => a.b.dispose());
  }
}
