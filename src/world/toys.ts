import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { clamp, makeRng, TAU } from '../core/mathx.ts';
import type { Cat } from '../cats/Cat.ts';

export type ToyKind = 'treat' | 'yarn';

const SPHERE = new SphereGeometry(1, 20, 14);
const CONE = new ConeGeometry(1, 1, 10);
const TORUS = new TorusGeometry(1, 0.18, 8, 22);
const CYLINDER = new CylinderGeometry(1, 1, 1, 8);

const YARN_COLORS = [0xf7a3b5, 0x9fc9ee, 0xf7d78d, 0xb8ddab, 0xcdb6f2, 0xf2b78d];

let toyCounter = 0;

/**
 * A tossable toy. Both treats and yarn balls share the same little physics
 * simulation so cats can chase, bat and eat them.
 */
export class Toy {
  readonly id = `toy-${++toyCounter}`;
  readonly kind: ToyKind;
  readonly group = new Group();
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  readonly radius: number;

  /** Set when a cat has decided this toy is theirs. */
  claimedBy: Cat | null = null;
  /** World time of the last claim, so stale claims can expire. */
  claimedAt = 0;
  consumed = false;
  age = 0;

  private readonly lifetime: number;
  private readonly baseY: number;
  private readonly spin = new Vector3();
  private readonly materials: MeshStandardMaterial[] = [];
  private landed = false;
  private groundTime = 0;

  constructor(kind: ToyKind, origin: Vector3, toss: Vector3, bounds: number) {
    this.kind = kind;
    this.radius = kind === 'treat' ? 0.14 : 0.2;
    this.baseY = this.radius;
    this.lifetime = kind === 'treat' ? 42 : 70;

    const rng = makeRng(Math.floor(Math.random() * 1e9));
    this.build(rng);

    // Toss from above the rug, aiming inward so nothing sails into the fog.
    this.position.copy(origin);
    this.position.y = Math.max(this.position.y, 1.1);
    this.velocity.copy(toss);

    const flat = new Vector3(this.position.x, 0, this.position.z);
    if (flat.length() > bounds * 0.85) {
      flat.setLength(bounds * 0.85);
      this.position.x = flat.x;
      this.position.z = flat.z;
    }
    this.spin.set(rng() * 6 - 3, rng() * 6 - 3, rng() * 6 - 3);
    this.group.position.copy(this.position);
    this.group.rotation.set(rng() * TAU, rng() * TAU, rng() * TAU);
  }

  private build(rng: () => number): void {
    const material = (color: number, roughness = 0.85): MeshStandardMaterial => {
      const created = new MeshStandardMaterial({ color, roughness, metalness: 0 });
      this.materials.push(created);
      return created;
    };

    if (this.kind === 'treat') {
      const body = new Mesh(SPHERE, material(0xf0a08c, 0.8));
      body.scale.set(0.13, 0.1, 0.2);
      this.group.add(body);

      const tail = new Mesh(CONE, material(0xe98d84, 0.8));
      tail.scale.set(0.09, 0.16, 0.02);
      tail.position.set(0, 0, -0.2);
      tail.rotation.x = -Math.PI / 2;
      this.group.add(tail);

      const fin = new Mesh(CONE, material(0xf6c0ad, 0.8));
      fin.scale.set(0.07, 0.12, 0.015);
      fin.position.set(0, 0.08, 0.02);
      this.group.add(fin);

      const eye = new Mesh(SPHERE, material(0x3a2f2c, 0.4));
      eye.scale.setScalar(0.022);
      eye.position.set(0.06, 0.035, 0.12);
      this.group.add(eye);

      const mouth = new Mesh(CYLINDER, material(0xf6c0ad, 0.9));
      mouth.scale.set(0.03, 0.02, 0.012);
      mouth.position.set(0, -0.03, 0.14);
      this.group.add(mouth);
    } else {
      const color = YARN_COLORS[Math.floor(rng() * YARN_COLORS.length)];
      const ball = new Mesh(SPHERE, material(color, 0.98));
      ball.scale.setScalar(0.2);
      this.group.add(ball);

      // a few wraps so it reads as yarn rather than a marble
      for (let i = 0; i < 3; i += 1) {
        const wrap = new Mesh(TORUS, material(new Color(color).offsetHSL(0, 0, i % 2 ? 0.08 : -0.06).getHex(), 0.98));
        wrap.scale.setScalar(0.202);
        wrap.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
        this.group.add(wrap);
      }

      const strand = new Mesh(CYLINDER, material(new Color(color).offsetHSL(0, 0, -0.05).getHex(), 0.98));
      strand.scale.set(0.018, 0.42, 0.018);
      strand.position.set(0.12, -0.16, -0.1);
      strand.rotation.set(0.5, 0.3, 0.4);
      this.group.add(strand);
    }

    this.group.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh) mesh.castShadow = false;
    });
  }

  /** A cat just batted the toy: send it flying. */
  kick(direction: Vector3, power: number): void {
    if (this.consumed) return;
    this.velocity.x += direction.x * power;
    this.velocity.z += direction.z * power;
    this.velocity.y = Math.max(this.velocity.y, 1.3 + power * 0.24);
    this.spin.set(power * 2.2, power * 0.8, power * 1.6);
  }

  consume(): void {
    this.consumed = true;
  }

  update(dt: number, time: number, bounds: number): void {
    this.age += dt;
    if (this.consumed) {
      // shrink away when eaten
      this.group.scale.multiplyScalar(Math.max(0, 1 - dt * 6));
      this.materials.forEach((material) => {
        material.transparent = true;
        material.opacity = Math.max(0, (material.opacity ?? 1) - dt * 4);
      });
      return;
    }

    const gravity = 10.5;
    this.velocity.y -= gravity * dt;
    this.position.addScaledVector(this.velocity, dt);

    if (this.position.y <= this.baseY) {
      this.position.y = this.baseY;
      if (!this.landed) {
        this.landed = true;
        this.velocity.multiplyScalar(0.42);
      }
      this.velocity.y *= -0.34;
      if (Math.abs(this.velocity.y) < 0.25) this.velocity.y = 0;

      // rolling / sliding friction
      const friction = this.kind === 'yarn' ? 0.55 : 1.8;
      const damping = Math.max(0, 1 - friction * dt);
      this.velocity.x *= damping;
      this.velocity.z *= damping;
      this.groundTime += dt;
    } else {
      this.groundTime = 0;
    }

    // bounce off the edge of the play space
    const flat = Math.hypot(this.position.x, this.position.z);
    const limit = bounds * 0.95;
    if (flat > limit) {
      const nx = this.position.x / flat;
      const nz = this.position.z / flat;
      this.position.x = nx * limit;
      this.position.z = nz * limit;
      const dot = this.velocity.x * nx + this.velocity.z * nz;
      this.velocity.x -= 2 * dot * nx * 0.6;
      this.velocity.z -= 2 * dot * nz * 0.6;
    }

    // gentle idle bob once it has settled
    const settled = this.velocity.lengthSq() < 0.02;
    const bob = settled ? Math.sin(time * 2.4 + this.position.x * 3) * 0.012 : 0;
    this.group.position.set(this.position.x, this.position.y + bob, this.position.z);

    // spin: fast while rolling, slow while waiting to be pounced
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const spinScale = settled ? 0.25 : clamp(speed * 1.6, 0.4, 9);
    const spinZ = this.spin.z * spinScale;
    this.group.rotation.x += this.spin.x * spinScale * dt * 0.5;
    this.group.rotation.y += this.spin.y * spinScale * dt * 0.5;
    this.group.rotation.z += spinZ * dt * 0.5;

    // a treat that nobody wants slowly disappears
    const fadeStart = this.lifetime - 6;
    if (this.age > fadeStart) {
      const fade = clamp((this.lifetime - this.age) / 6, 0, 1);
      this.materials.forEach((material) => {
        material.transparent = true;
        material.opacity = fade;
      });
      this.group.visible = fade > 0.02;
    }
  }

  get expired(): boolean {
    return this.age > this.lifetime;
  }

  dispose(): void {
    this.group.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh && mesh.geometry) mesh.geometry.dispose();
    });
    this.materials.forEach((material) => material.dispose());
  }
}

/** Owns every treat and yarn ball currently on the rug. */
export class ToySystem {
  readonly group = new Group();
  readonly toys: Toy[] = [];

  spawn(kind: ToyKind, origin: Vector3, direction: Vector3, bounds: number): Toy {
    const toss = direction.clone().setY(0).clampLength(0, 1);
    toss.multiplyScalar(kind === 'treat' ? 2.1 : 3.4);
    toss.y = kind === 'treat' ? 3.4 : 3.0;
    const toy = new Toy(kind, origin, toss, bounds);
    this.toys.push(toy);
    this.group.add(toy.group);
    return toy;
  }

  update(dt: number, time: number, bounds: number): void {
    for (let i = this.toys.length - 1; i >= 0; i -= 1) {
      const toy = this.toys[i];
      toy.update(dt, time, bounds);
      const gone = toy.expired || (toy.consumed && toy.group.scale.x < 0.05);
      if (gone) {
        this.group.remove(toy.group);
        toy.dispose();
        this.toys.splice(i, 1);
      }
    }
  }

  remove(toy: Toy): void {
    const index = this.toys.indexOf(toy);
    if (index >= 0) {
      this.group.remove(toy.group);
      toy.dispose();
      this.toys.splice(index, 1);
    }
  }

  clear(): void {
    for (const toy of this.toys) {
      this.group.remove(toy.group);
      toy.dispose();
    }
    this.toys.length = 0;
  }
}
