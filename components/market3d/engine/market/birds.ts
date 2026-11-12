/*
 * Fresh Market 3D — a small flock of pigeons circling the dome, now and then gliding over the plaza.
 */
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3, DoubleSide } from "three";

function wingGeo(side: 1 | -1) {
  const g = new BufferGeometry();
  // a swept wing triangle-pair attached at the body (x = 0)
  const v = [0, 0, 0.04, side * 0.22, 0, -0.02, 0, 0, -0.06, side * 0.22, 0, -0.02, side * 0.3, 0, -0.1, 0, 0, -0.06];
  g.setAttribute("position", new Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

export class Birds {
  readonly group = new Group();
  private birds: Array<{ g: Group; wl: Mesh; wr: Mesh; r: number; h: number; speed: number; phase: number; flap: number; dir: number }> = [];
  private center: Vector3;

  constructor(center: Vector3, count = 9) {
    this.center = center.clone();
    const mat = new MeshStandardMaterial({ color: "#6b6e78", roughness: 0.8, side: DoubleSide });
    const body = new SphereGeometry(0.07, 8, 6);
    body.scale(0.8, 0.7, 1.6);
    const wl = wingGeo(1);
    const wr = wingGeo(-1);
    for (let i = 0; i < count; i++) {
      const g = new Group();
      const b = new Mesh(body, mat);
      const l = new Mesh(wl, mat);
      const r = new Mesh(wr, mat);
      g.add(b, l, r);
      g.scale.setScalar(1.6 + Math.random() * 0.4);
      this.group.add(g);
      this.birds.push({
        g,
        wl: l,
        wr: r,
        r: 7 + Math.random() * 9,
        h: 16 + Math.random() * 9,
        speed: 0.22 + Math.random() * 0.12,
        phase: Math.random() * Math.PI * 2,
        flap: Math.random() * 10,
        dir: Math.random() < 0.7 ? 1 : -1,
      });
    }
  }

  update(t: number, dt: number) {
    for (const b of this.birds) {
      b.phase += dt * b.speed * b.dir;
      // occasional wide swoop over the plaza
      const swoop = Math.max(0, Math.sin(t * 0.05 + b.r)) ** 8;
      const r = b.r + swoop * 20;
      const x = this.center.x + Math.cos(b.phase) * r;
      const z = this.center.z + Math.sin(b.phase) * r + swoop * 14;
      const y = b.h + Math.sin(t * 0.7 + b.r) * 1.2 - swoop * 6;
      const p = b.g.position;
      const dx = x - p.x, dz = z - p.z;
      p.set(x, y, z);
      if (dx * dx + dz * dz > 1e-6) b.g.rotation.y = Math.atan2(dx, dz);
      b.g.rotation.z = -b.dir * 0.35;
      const gliding = Math.sin(t * 0.9 + b.r) > 0.3;
      b.flap += dt * (gliding ? 2 : 16);
      const a = gliding ? 0.15 : Math.sin(b.flap) * 0.9;
      b.wl.rotation.z = a;
      b.wr.rotation.z = -a;
    }
  }
}
