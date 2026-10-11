import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeParts, type GeometryPart } from '../core/geo.ts';
import { angleLerp, clamp, damp, lerp, makeRng, shortestAngle, smoothstep, TAU } from '../core/mathx.ts';
import { furTextures, shadowBlobTexture } from './fur.ts';
import { createCatRig, solveLegAngle, type CatRig, type LegLink } from './rig.ts';
import { personalityOf, smallTalk, type Personality } from './names.ts';
import type { CatTraits } from './traits.ts';
import type { Toy } from '../world/toys.ts';

export type CatState = 'idle' | 'walk' | 'sit' | 'sleep' | 'play' | 'eat' | 'groom' | 'zoomies' | 'petted';

export type CatEventType =
  | 'purr'
  | 'meow'
  | 'chirp'
  | 'pounce'
  | 'sleep'
  | 'wake'
  | 'eat'
  | 'yarn'
  | 'happy'
  | 'pet';

export interface CatEvent {
  type: CatEventType;
  cat: Cat;
}

/** Everything a cat is allowed to know about the wider playground. */
export interface CatWorld {
  /** Radius of the walkable rug. */
  bounds: number;
  elapsed: number;
  /** A point on the rug that the sun is shining on. */
  sunPoint: Vector3;
  cats: Cat[];
  toys: Toy[];
  /** Circular furniture footprints that cats walk around. */
  obstacles: { x: number; z: number; radius: number }[];
  onCatEvent(event: CatEvent): void;
  claimToy(toy: Toy, cat: Cat): void;
  consumeToy(toy: Toy): void;
}

/* ── shared primitives (never mutated — mergeParts clones them) ───────── */
const UNIT_SPHERE = new SphereGeometry(1, 24, 18);
const UNIT_CONE = new ConeGeometry(1, 1, 7, 1);
const SHADOW_TEXTURE = shadowBlobTexture();
const SHADOW_GEOMETRY = new PlaneGeometry(1, 0.82);
const MIN_PAW_HEIGHT = 0.016;

const materialCache = new Map<string, MeshStandardMaterial>();

function furMaterial(key: string, map: MeshPhysicalMaterial['map'], sheen: number): MeshPhysicalMaterial {
  const id = `fur:${key}:${sheen.toFixed(2)}`;
  const cached = materialCache.get(id);
  if (cached instanceof MeshPhysicalMaterial) return cached;
  const material = new MeshPhysicalMaterial({
    map,
    roughness: 0.95,
    metalness: 0,
    sheen,
    sheenRoughness: 0.8,
    sheenColor: new Color(0xfff4e8),
  });
  materialCache.set(id, material);
  return material;
}

function plainMaterial(key: string, color: number, opts: { roughness?: number; emissive?: number } = {}): MeshStandardMaterial {
  const id = `plain:${key}:${color}:${opts.emissive ?? 0}`;
  const cached = materialCache.get(id);
  if (cached) return cached;
  const material = new MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.85,
    metalness: 0,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissive ? 0.6 : 0,
  });
  materialCache.set(id, material);
  return material;
}

function shell(geometry: BufferGeometry, material: MeshStandardMaterial, name: string, cast = false): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  // Only the big masses cast shadows — the blob shadow handles the rest and
  // this keeps the shadow pass cheap enough for phones.
  mesh.castShadow = cast;
  return mesh;
}

const tmpVec = new Vector3();
const tmpVec2 = new Vector3();

/**
 * A single procedurally generated cat: geometry, materials, brain and
 * animation. Everything is driven by `CatTraits`, so two cats are never alike.
 */
export class Cat {
  readonly traits: CatTraits;
  readonly rig: CatRig;
  readonly personality: Personality;
  readonly group: Group;
  /** Current movement speed in un-scaled local units per second. */
  speed = 0;

  state: CatState = 'idle';
  stateTimer = 0;
  /** When true the brain is paused — used to hold a pose for the cat creator. */
  frozen = false;
  purr = 0;
  rest = 0;
  energy: number;

  private readonly world: CatWorld;
  private readonly rng: () => number;
  private readonly eyeGroups: Group[] = [];
  private readonly shadow: Mesh;
  private readonly position = new Vector3();
  private readonly target = new Vector3();
  private readonly lookAt = new Vector3();

  private facing: number;
  private desiredFacing: number;
  private hasTarget = false;
  private desiredSpeed = 0;
  private restTarget = 0;
  private walkPhase = 0;
  private petHold = 0;
  private petStrength = 0;
  private blinkTimer = 2;
  private blink = -1;
  private sleepTimer = 0;
  private earTwitch = 0;
  private earFlick = 0;
  private alert = 0;
  private hopY = 0;
  private hopVel = 0;
  private airborne = false;
  private tailMood = 0.3;
  private tailSwish = 0.45;
  private toy?: Toy;
  private toyTimer = 0;
  private scanTimer = 1 + Math.random() * 2;
  private gazeTimer = 0;
  private gazeYaw = 0;
  private gazePitch = 0;
  private noiseOffset = Math.random() * 100;
  private disposed = false;

  constructor(traits: CatTraits, world: CatWorld, spawn: Vector3) {
    this.traits = traits;
    this.world = world;
    this.rng = makeRng(traits.seed ^ 0x5bf03635);
    this.personality = personalityOf(traits);
    this.energy = traits.energy;

    this.rig = createCatRig(traits);
    this.group = this.rig.root;
    this.position.copy(spawn);
    this.group.position.copy(spawn);
    this.facing = this.rng() * TAU;
    this.desiredFacing = this.facing;
    this.group.rotation.y = this.facing;
    this.lookAt.copy(spawn);

    this.build();
    this.group.userData.cat = this;
    this.shadow = this.buildShadow();
    this.group.add(this.shadow);

    this.enter('idle', { force: true });
  }

  /* ── geometry ─────────────────────────────────────────────────────── */

  private build(): void {
    const { rig, traits } = this;
    const textures = furTextures(traits);
    const m = rig.metrics;
    const fluff = clamp(traits.fluff, 0, 1);
    const sheen = 0.25 + fluff * 0.55;

    const fur = furMaterial(`body:${traits.seed}`, textures.map, sheen);
    const furSoft = furMaterial(`soft:${traits.seed}`, textures.plain, sheen * 0.85);
    const accent = plainMaterial(`accent:${traits.seed}`, traits.accent, { roughness: 0.9 });
    const pink = plainMaterial('pink', blendHex(0xf29aa0, traits.accent, 0.25), { roughness: 0.7 });
    const eyeMat = plainMaterial('eyeMat', traits.eye, { roughness: 0.22 });
    const pupilMat = plainMaterial('pupil', 0x2a2220, { roughness: 0.16 });
    const glintMat = plainMaterial('glint', 0xffffff, { roughness: 0.1, emissive: 0xffffff });

    const R = m.bodyRadius;
    const L = m.bodyLength;
    const HR = m.headRadius;

    /* torso — three overlapping blobs, merged into a single mesh */
    const torsoParts: GeometryPart[] = [
      { geometry: UNIT_SPHERE, position: [0, 0.02, L * 0.17], scale: [R, R * 0.98, L * 0.4] },
      { geometry: UNIT_SPHERE, position: [0, -0.01, -L * 0.05], scale: [R * 1.04, R, L * 0.44] },
      { geometry: UNIT_SPHERE, position: [0, 0.03, -L * 0.35], scale: [R * 0.99, R * 0.99, L * 0.34] },
    ];
    rig.spine.add(shell(mergeParts(torsoParts), fur, 'torso', true));

    /* neck */
    rig.neck.add(
      shell(mergeParts([{ geometry: UNIT_SPHERE, position: [0, 0.05, 0.02], scale: [0.22, 0.24, 0.22] }]), fur, 'neck'),
    );

    /* head: skull + cheeks + muzzle merged together */
    const headParts: GeometryPart[] = [
      { geometry: UNIT_SPHERE, position: [0, 0, 0], scale: [HR, HR * 0.94, HR * 0.96] },
      { geometry: UNIT_SPHERE, position: [-0.16, -0.085, 0.12], scale: [0.13, 0.12, 0.12] },
      { geometry: UNIT_SPHERE, position: [0.16, -0.085, 0.12], scale: [0.13, 0.12, 0.12] },
      { geometry: UNIT_SPHERE, position: [0, -0.075, HR * 0.62], scale: [0.13, 0.1, 0.12] },
    ];
    rig.head.add(shell(mergeParts(headParts), furSoft, 'head', true));

    /* ears live on their own pivots so they can twitch */
    const earH = 0.24 * m.earScale;
    const earW = 0.115 * Math.sqrt(m.earScale);
    const earPart = (): GeometryPart[] => [
      {
        geometry: UNIT_CONE,
        position: [0, earH * 0.48, 0],
        rotation: [0, Math.PI * 0.25, 0],
        scale: [earW, earH * 0.5, earW * 0.42],
      },
    ];
    rig.earL.add(shell(mergeParts(earPart()), furSoft, 'earL'));
    rig.earR.add(shell(mergeParts(earPart()), furSoft, 'earR'));

    const innerEar = (): GeometryPart[] => [
      {
        geometry: UNIT_CONE,
        position: [0, earH * 0.42, 0.012],
        rotation: [0, Math.PI * 0.25, 0],
        scale: [earW * 0.6, earH * 0.32, earW * 0.24],
      },
    ];
    rig.innerEarL.add(shell(mergeParts(innerEar()), pink, 'innerEarL'));
    rig.innerEarR.add(shell(mergeParts(innerEar()), pink, 'innerEarR'));

    const nose = new Mesh(UNIT_SPHERE, pink);
    nose.scale.set(0.05, 0.036, 0.038);
    nose.position.set(0, 0.014, 0.075);
    rig.muzzle.add(nose);

    /* eyes: eyeball + pupil + glint inside a group we can squash to blink */
    for (const side of [-1, 1] as const) {
      const eye = new Group();
      eye.position.set(side * 0.118, 0.038, HR * 0.78);

      const ball = new Mesh(UNIT_SPHERE, eyeMat);
      ball.scale.set(0.062, 0.06, 0.062);
      eye.add(ball);

      const pupil = new Mesh(UNIT_SPHERE, pupilMat);
      pupil.scale.set(0.03, 0.036, 0.03);
      pupil.position.set(side * 0.004, 0, 0.032);
      eye.add(pupil);

      const glint = new Mesh(UNIT_SPHERE, glintMat);
      glint.scale.set(0.013, 0.013, 0.01);
      glint.position.set(side * 0.018, 0.02, 0.046);
      eye.add(glint);

      this.eyeGroups.push(eye);
      rig.gaze.add(eye);
    }

    rig.muzzle.add(this.buildWhiskers());

    for (const leg of rig.legs) {
      this.buildLeg(leg, fur, accent);
    }

    rig.tail.forEach((link, index) => {
      const thickness = link.radius * (1 + fluff * 0.4);
      const part: GeometryPart = {
        geometry: UNIT_SPHERE,
        position: [0, -link.length * 0.5, 0],
        scale: [thickness, link.length * 0.66, thickness],
      };
      link.pivot.add(shell(mergeParts([part]), fur, `tail-${index}`));
    });

    const tipRadius = 0.07 * (1 + fluff * 0.5);
    rig.tailTip.add(
      shell(mergeParts([{ geometry: UNIT_SPHERE, scale: [tipRadius, tipRadius * 1.15, tipRadius] }]), fur, 'tailTip'),
    );
  }

  private buildLeg(leg: LegLink, fur: MeshPhysicalMaterial, accent: MeshStandardMaterial): void {
    leg.root.add(
      shell(
        mergeParts([
          { geometry: UNIT_SPHERE, position: [0, -leg.l1 * 0.5, 0], scale: [0.09, leg.l1 * 0.58, 0.097] },
        ]),
        fur,
        'thigh',
      ),
    );

    leg.mid.add(
      shell(
        mergeParts([
          { geometry: UNIT_SPHERE, position: [0, -leg.l2 * 0.5, 0], scale: [0.074, leg.l2 * 0.52, 0.08] },
        ]),
        fur,
        'shin',
      ),
    );

    // Paws wear the accent colour, which gives tuxedo cats their little socks.
    leg.paw.add(
      shell(
        mergeParts([
          { geometry: UNIT_SPHERE, position: [0, -0.028, 0.03], scale: [0.088, 0.062, 0.108] },
          { geometry: UNIT_SPHERE, position: [0, -0.032, 0.08], scale: [0.05, 0.042, 0.05] },
        ]),
        accent,
        'paw',
      ),
    );
  }

  private buildWhiskers(): LineSegments {
    const pairs = clamp(Math.round(this.traits.whiskers), 1, 8);
    const positions: number[] = [];
    const rng = makeRng(this.traits.seed + 17);
    for (const side of [-1, 1] as const) {
      for (let i = 0; i < pairs; i += 1) {
        const spread = pairs === 1 ? 0 : (i / (pairs - 1) - 0.5) * 0.8;
        const origin: [number, number, number] = [side * 0.085, 0.01 + spread * 0.02, 0.03];
        const length = 0.24 + rng() * 0.09;
        const dir = new Vector3(side * 0.85, spread * 0.75 + 0.12, 0.5).normalize().multiplyScalar(length);
        positions.push(...origin, origin[0] + dir.x, origin[1] + dir.y, origin[2] + dir.z);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    const material = new LineBasicMaterial({ color: 0xa4938a, transparent: true, opacity: 0.62 });
    const lines = new LineSegments(geometry, material);
    lines.name = 'whiskers';
    return lines;
  }

  private buildShadow(): Mesh {
    const material = new MeshBasicMaterial({
      map: SHADOW_TEXTURE,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: DoubleSide,
    });
    const mesh = new Mesh(SHADOW_GEOMETRY, material);
    mesh.name = 'shadow';
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.setScalar(this.traits.size * 1.8);
    mesh.position.y = 0.02;
    mesh.renderOrder = 2;
    return mesh;
  }

  /* ── public API ───────────────────────────────────────────────────── */

  get position3(): Vector3 {
    return this.position;
  }

  get isAsleep(): boolean {
    return this.state === 'sleep';
  }

  /** Rough physical radius, used to keep cats from overlapping. */
  get bodyRadius(): number {
    return 0.42 * this.rig.metrics.scale;
  }

  /** Live mood line for the UI card. */
  get moodLine(): string {
    switch (this.state) {
      case 'sleep':
        return 'fast asleep, dreaming of fish';
      case 'petted':
        return 'purring like a tiny engine';
      case 'play':
        return 'hunting a toy with great seriousness';
      case 'zoomies':
        return 'ZOOMIES IN PROGRESS';
      case 'eat':
        return 'mid-snack, do not disturb';
      case 'groom':
        return 'grooming the elbow. important work';
      case 'sit':
        return 'sitting. being a cat.';
      default:
        return this.personality.mood;
    }
  }

  get petIntensity(): number {
    return this.petStrength * this.petHold;
  }

  /** Called every frame while the pointer is petting this cat. */
  pet(strength: number, duration = 0.4): void {
    const first = this.petHold <= 0;
    this.petHold = Math.max(this.petHold, duration);
    this.petStrength = Math.max(this.petStrength, clamp(strength, 0, 1));
    if (first) this.world.onCatEvent({ type: 'pet', cat: this });
    if (this.state === 'sleep') this.enter('petted', { force: true });
    else if (this.state !== 'petted') this.enter('petted');
  }

  wake(next: CatState = 'idle'): void {
    if (this.state === 'sleep') {
      this.alert = 1;
      this.world.onCatEvent({ type: 'wake', cat: this });
    }
    this.enter(next, { force: true });
  }

  /** Ask the cat to walk to a spot and hang out there. */
  callTo(point: Vector3): void {
    this.setTarget(point);
    this.enter('walk', { force: true });
    this.world.onCatEvent({ type: 'meow', cat: this });
  }

  sleepNow(): void {
    if (this.state === 'sleep') return;
    this.enter('sleep', { force: true });
  }

  startle(): void {
    this.alert = 1;
    this.earFlick = 0.45;
    this.world.onCatEvent({ type: 'chirp', cat: this });
  }

  startZoomies(): void {
    if (this.state === 'sleep') this.wake();
    this.enter('zoomies', { force: true });
  }

  quip(): string {
    return smallTalk(this.rng, this.traits.name);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.geometry && mesh.geometry !== UNIT_SPHERE && mesh.name !== 'shadow' && mesh.name !== 'whiskers') {
        mesh.geometry.dispose();
      }
    });
  }

  /* ── brain ────────────────────────────────────────────────────────── */

  private enter(state: CatState, opts: { force?: boolean } = {}): void {
    if (this.state === state && !opts.force) return;
    this.state = state;
    this.stateTimer = 0;
    this.hasTarget = false;

    switch (state) {
      case 'walk':
        this.desiredSpeed = this.energyRamp(0.35, 0.55) * 2;
        this.tailMood = 0.4;
        break;
      case 'zoomies':
        this.desiredSpeed = this.energyRamp(1.5, 1.15) * 2;
        this.tailMood = 1;
        this.setRandomTarget();
        this.world.onCatEvent({ type: 'pounce', cat: this });
        break;
      case 'sleep':
        this.sleepTimer = 16 + this.rng() * 22;
        this.world.onCatEvent({ type: 'sleep', cat: this });
        break;
      case 'play':
        this.desiredSpeed = this.energyRamp(0.9, 0.8) * 2;
        break;
      default:
        this.desiredSpeed = 0;
        break;
    }
  }

  /** Speed baseline that scales with both the cat's energy and its size. */
  private energyRamp(slow: number, fast: number): number {
    return (slow + this.energy * fast) * this.rig.metrics.scale;
  }

  private setTarget(point: Vector3): void {
    const limit = this.world.bounds * 0.9;
    tmpVec.set(point.x, 0, point.z);
    const radius = Math.hypot(tmpVec.x, tmpVec.z);
    if (radius > limit) tmpVec.multiplyScalar(limit / radius);
    this.target.copy(tmpVec);
    this.hasTarget = true;
  }

  private setRandomTarget(): void {
    const angle = this.rng() * TAU;
    const radius = Math.sqrt(this.rng()) * this.world.bounds * 0.82;
    this.setTarget(tmpVec.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius));
  }

  update(dtRaw: number): void {
    if (this.disposed) return;
    const dt = clamp(dtRaw, 0, 0.05);
    this.stateTimer += dt;
    this.petHold = Math.max(0, this.petHold - dt);
    this.alert = Math.max(0, this.alert - dt * 0.8);
    this.handlePetting(dt);
    this.think(dt);
    this.move(dt);
    this.pose(dt);
    this.cosmetics(dt);
  }

  private handlePetting(dt: number): void {
    if (this.petHold > 0) {
      this.purr = clamp(this.purr + dt * 1.5, 0, 1);
      this.petStrength = Math.max(0, this.petStrength - dt * 0.3);
      if (this.state !== 'petted') this.enter('petted');
    } else {
      this.purr = damp(this.purr, 0, 0.55, dt);
      this.petStrength = damp(this.petStrength, 0, 1.4, dt);
      if (this.state === 'petted') this.enter('sit');
    }
  }

  private think(dt: number): void {
    if (this.frozen) return;
    const t = this.stateTimer;

    /* Toy scan — cats get distracted by treats and yarn. */
    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      this.scanTimer = 0.6 + this.rng() * 1.4;
      if (!this.toy && this.world.toys.length > 0 && this.energy > 0.18 && this.state !== 'sleep') {
        let best: Toy | undefined;
        let bestDistance = Infinity;
        for (const toy of this.world.toys) {
          if (toy.consumed) continue;
          const stale = this.world.elapsed - toy.claimedAt > 12;
          if (toy.claimedBy && toy.claimedBy !== this && !stale) continue;
          const distance = toy.position.distanceTo(this.position);
          if (distance < bestDistance && distance < 8) {
            bestDistance = distance;
            best = toy;
          }
        }
        if (best) {
          this.toy = best;
          this.toyTimer = 14;
          this.world.claimToy(best, this);
          this.enter('play', { force: true });
          this.world.onCatEvent({ type: 'chirp', cat: this });
        }
      }
    }

    if (this.toy) {
      this.toyTimer -= dt;
      if (this.toyTimer <= 0 || this.toy.consumed || this.toy.claimedBy !== this) {
        this.toy = undefined;
        if (this.state === 'play') this.enter('idle');
      }
    }

    switch (this.state) {
      case 'idle': {
        if (t > 3 + this.rng() * 6) {
          const roll = this.rng();
          if (roll < 0.4) {
            this.setRandomTarget();
            this.enter('walk');
          } else if (roll < 0.6) {
            this.enter('sit');
          } else if (roll < 0.72) {
            this.enter('groom');
          } else if (roll < 0.8 + this.energy * 0.12) {
            this.enter('zoomies');
          } else {
            this.lookAt.copy(this.world.sunPoint);
            this.stateTimer = 0;
          }
        }
        break;
      }
      case 'walk': {
        if (!this.hasTarget) {
          this.enter('idle');
          break;
        }
        const distance = Math.hypot(this.target.x - this.position.x, this.target.z - this.position.z);
        if (distance < 0.16 || t > 16) {
          const roll = this.rng();
          if (roll < 0.4) this.enter('sit');
          else if (roll < 0.72) this.enter('idle');
          else if (roll < 0.86) this.enter('groom');
          else this.enter('sleep');
        }
        break;
      }
      case 'sit': {
        if (t > 5 + this.rng() * 9) {
          if (this.rng() < 0.34) this.enter('sleep');
          else this.enter('idle');
        }
        break;
      }
      case 'sleep': {
        this.sleepTimer -= dt;
        if (this.sleepTimer <= 0 && this.petHold <= 0) this.wake();
        break;
      }
      case 'groom': {
        if (t > 2.6 + this.rng() * 2.5) this.enter('idle');
        break;
      }
      case 'petted': {
        if (this.petHold <= 0) this.enter('sit');
        break;
      }
      case 'play': {
        const toy = this.toy;
        if (!toy || toy.consumed) {
          this.enter('idle');
          break;
        }
        const distance = toy.position.distanceTo(this.position);
        if (distance > 0.7) {
          this.setTarget(toy.position);
          if (!this.airborne && distance > 1.6 && this.rng() < dt * 2.4) this.hop(3.1);
        } else if (toy.kind === 'treat') {
          toy.consume();
          this.world.consumeToy(toy);
          this.toy = undefined;
          this.enter('eat');
          this.world.onCatEvent({ type: 'eat', cat: this });
        } else {
          const away = tmpVec.copy(this.position).sub(toy.position).setY(0);
          if (away.lengthSq() < 0.0001) away.set(this.rng() - 0.5, 0, this.rng() - 0.5);
          away.normalize();
          toy.kick(away, 1.7 + this.energy * 1.7);
          this.world.onCatEvent({ type: 'yarn', cat: this });
          this.hop(3.4);
          // Release the ball so the next pounce can happen right away.
          toy.claimedBy = null;
          this.toy = undefined;
          this.scanTimer = 0.4 + this.rng() * 0.7;
          this.enter('idle');
        }
        break;
      }
      case 'eat': {
        if (t > 4.4) {
          this.purr = 0.75;
          this.enter('idle');
          this.world.onCatEvent({ type: 'happy', cat: this });
        }
        break;
      }
      case 'zoomies': {
        const distance = Math.hypot(this.target.x - this.position.x, this.target.z - this.position.z);
        if (distance < 0.35 || t > 4) this.setRandomTarget();
        if (t > 3 + this.rng() * 3) this.enter(this.rng() < 0.5 ? 'idle' : 'sit');
        break;
      }
    }
  }

  private hop(power: number): void {
    this.hopVel = power;
    this.airborne = true;
  }

  private move(dt: number): void {
    tmpVec2.set(this.target.x - this.position.x, 0, this.target.z - this.position.z);
    const distance = tmpVec2.length();

    if (this.hasTarget && distance > 0.001) {
      this.desiredFacing = Math.atan2(tmpVec2.x, tmpVec2.z);
    }

    const shouldMove = this.hasTarget && distance > 0.12 && this.state !== 'sleep';
    this.speed = damp(this.speed, shouldMove ? this.desiredSpeed : 0, shouldMove ? 3.5 : 6, dt);
    if (this.speed < 0.01) this.speed = 0;

    const turn = 1 - Math.exp(-7 * dt);
    this.facing = angleLerp(this.facing, this.desiredFacing, turn);
    this.group.rotation.y = this.facing;

    if (this.speed > 0) {
      const step = this.speed * dt;
      this.position.x += Math.sin(this.facing) * step;
      this.position.z += Math.cos(this.facing) * step;
      this.walkPhase += dt * (2.5 + this.speed * 2.6);
    }

    this.resolveCollisions(dt);
    this.group.position.set(this.position.x, 0, this.position.z);
  }

  /** Keep cats on the rug and out of each other's fur. */
  private resolveCollisions(dt: number): void {
    const limit = this.world.bounds * 0.94;
    const radius = Math.hypot(this.position.x, this.position.z);
    if (radius > limit) {
      const excess = radius - limit;
      this.position.multiplyScalar((radius - excess) / radius);
      if (this.state === 'zoomies' || this.state === 'walk') this.setTarget(this.position.clone().multiplyScalar(0.4));
    }

    for (const obstacle of this.world.obstacles) {
      const dx = this.position.x - obstacle.x;
      const dz = this.position.z - obstacle.z;
      const dist = Math.hypot(dx, dz);
      const min = obstacle.radius + this.bodyRadius * 0.6;
      if (dist > 0.0001 && dist < min) {
        const push = Math.min(2.4 * dt, min - dist);
        this.position.x += (dx / dist) * push;
        this.position.z += (dz / dist) * push;
        if (this.state === 'walk' || this.state === 'zoomies') this.setTarget(this.target.clone().sub(this.position).normalize().multiplyScalar(3).add(this.position));
      }
    }

    for (const other of this.world.cats) {
      if (other === this) continue;
      const dx = this.position.x - other.position.x;
      const dz = this.position.z - other.position.z;
      const dist = Math.hypot(dx, dz);
      const min = this.bodyRadius + other.bodyRadius;
      if (dist > 0.0001 && dist < min) {
        const push = ((min - dist) / min) * 1.6 * dt;
        this.position.x += (dx / dist) * push;
        this.position.z += (dz / dist) * push;
        other.position.x -= (dx / dist) * push * 0.4;
        other.position.z -= (dz / dist) * push * 0.4;
      }
    }
  }

  /* ── animation ────────────────────────────────────────────────────── */

  private pose(dt: number): void {
    const { rig } = this;
    const m = rig.metrics;
    const time = this.world.elapsed + this.noiseOffset;

    this.restTarget =
      this.state === 'sleep'
        ? 1
        : this.state === 'petted'
          ? 0.7
          : this.state === 'sit'
            ? 0.42
            : this.state === 'eat'
              ? 0.34
              : this.state === 'groom'
                ? 0.3
                : 0;
    this.rest = damp(this.rest, this.restTarget, 3.4, dt);

    const breatheRate = this.state === 'sleep' ? 1.2 : 2.4 - this.energy * 0.8;
    const breatheAmp = this.state === 'sleep' ? 0.014 : 0.007 + this.traits.fluff * 0.005;
    const breathe = Math.sin(time * breatheRate) * breatheAmp;

    if (this.airborne) {
      this.hopVel -= dt * 9.5;
      this.hopY = Math.max(0, this.hopY + this.hopVel * dt);
      if (this.hopY <= 0) {
        this.hopY = 0;
        this.hopVel = 0;
        this.airborne = false;
      }
    }

    const bodyY = lerp(m.standHeight, m.flopHeight, smoothstep(0, 1, this.rest));
    const walkBob = this.speed > 0.02 ? Math.abs(Math.sin(this.walkPhase)) * 0.022 * (1 - this.rest) : 0;
    rig.body.position.y = bodyY + breathe + walkBob + this.hopY;
    rig.body.rotation.x = -this.rest * 0.05 + (this.airborne ? -0.2 + this.hopY * 0.25 : 0);
    rig.body.rotation.z = Math.sin(this.walkPhase) * 0.035 * clamp(this.speed, 0, 1.6) * (1 - this.rest);

    rig.spine.rotation.x = this.rest * 0.05;
    rig.hips.rotation.x = this.rest * 0.02;

    const purrShake = this.purr * 0.01;
    rig.neck.rotation.x = lerp(0.02, 0.14, this.rest) + Math.sin(time * breatheRate) * 0.014 + purrShake;

    this.updateGaze(dt);
    const eatBob = this.state === 'eat' ? Math.sin(time * 9) * 0.22 - 0.12 : 0;
    rig.neck.rotation.y = this.gazeYaw * 0.62;
    rig.head.rotation.y = this.gazeYaw * 0.4 + Math.sin(time * 0.5) * 0.02;
    rig.head.rotation.x = this.gazePitch * 0.55 - this.rest * 0.18 + eatBob + purrShake * 0.6;
    rig.head.rotation.z = Math.sin(time * 0.7) * 0.022 + purrShake * 0.6;

    /* ears */
    this.earTwitch = Math.max(0, this.earTwitch - dt);
    this.earFlick = Math.max(0, this.earFlick - dt);
    if (this.earTwitch <= 0 && this.rng() < dt * 0.55) this.earTwitch = 0.22 + this.rng() * 0.18;
    const flick = (this.earTwitch > 0 ? Math.sin(this.earTwitch * 42) * 0.18 : 0) + this.earFlick * 0.5;
    const splay = this.alert * 0.3 + (this.state === 'zoomies' ? 0.2 : 0);
    rig.earL.rotation.z = 0.22 - splay - flick * 0.5;
    rig.earR.rotation.z = -0.22 + splay + flick * 0.5;
    rig.earL.rotation.x = -0.05 + Math.sin(time * 1.3) * 0.05;
    rig.earR.rotation.x = -0.05 + Math.sin(time * 1.1 + 1) * 0.05;

    /* legs */
    const fold = clamp(this.rest, 0, 1);
    for (let i = 0; i < rig.legs.length; i += 1) {
      const leg = rig.legs[i];
      const isFront = !leg.hind;
      const foldAngle = (isFront ? 1.55 : -1.5) * fold;
      const baseBend = isFront ? -0.22 : 0.46;
      const kneeBend = baseBend + fold * (isFront ? 0.9 : -0.75);

      const diagonal = i === 0 || i === 3 ? 0 : Math.PI;
      const swing = this.speed > 0.01 ? Math.sin(this.walkPhase + diagonal) : 0;
      const amp = clamp(this.speed * m.scale * 1.2, 0, 1) * 0.5;
      const preferred = foldAngle + swing * amp * (1 - fold);

      const hipHeight = rig.body.position.y + (this.airborne ? 0.05 : 0);
      const angle = solveLegAngle(
        hipHeight,
        leg.l1,
        leg.l2,
        Math.abs(kneeBend) * Math.sign(isFront ? -1 : 1),
        this.airborne ? -0.5 : MIN_PAW_HEIGHT,
        preferred,
      );

      leg.root.rotation.x = angle;
      leg.root.rotation.z = leg.side * (0.06 + this.rest * 0.12);
      leg.mid.rotation.x = (isFront ? -1 : 1) * Math.abs(kneeBend) * (0.75 + fold * 0.4) + swing * amp * 0.35;
    }

    /* tail: mood-driven base angle plus a travelling wave */
    const tailUp =
      this.state === 'sleep' ? -0.7 : this.purr * 0.95 + (this.state === 'zoomies' ? 0.9 : 0) + this.tailMood * 0.3;
    this.tailSwish = damp(
      this.tailSwish,
      this.state === 'zoomies' ? 2.6 : this.purr > 0.3 ? 1.2 : this.state === 'play' ? 1.9 : 0.45,
      2,
      dt,
    );
    rig.tail.forEach((link, index) => {
      const wave = Math.sin(time * this.tailSwish + index * 0.7) * (0.09 + index * 0.04);
      const base = index === 0 ? 1.45 : -0.14 - tailUp * 0.24;
      link.pivot.rotation.x = base + (index === 0 ? 0 : wave * 0.5);
      link.pivot.rotation.z = wave * (index === 0 ? 0.3 : 1);
      link.pivot.rotation.y = wave * 0.5;
    });
    rig.tailTip.rotation.x = -0.2 - tailUp * 0.2 + Math.sin(time * this.tailSwish) * 0.12;

    /* shadow shrinks while hopping */
    const airborneScale = 1 - clamp(this.hopY * 0.7, 0, 0.45);
    this.shadow.scale.setScalar(this.traits.size * 1.8 * airborneScale);
    const material = this.shadow.material as MeshBasicMaterial;
    material.opacity = (0.62 - this.hopY * 0.3) * (1 - this.rest * 0.08);
  }

  private updateGaze(dt: number): void {
    const m = this.rig.metrics;
    this.gazeTimer -= dt;
    if (this.gazeTimer <= 0) {
      this.gazeTimer = 1.4 + this.rng() * 2.6;
      const mode = this.rng();
      if (mode < 0.28) {
        this.lookAt.copy(this.world.sunPoint);
      } else if (mode < 0.5 && this.world.cats.length > 1) {
        this.lookAt.copy(this.world.cats[Math.floor(this.rng() * this.world.cats.length)].position);
      } else if (mode < 0.7 && this.world.toys.length > 0) {
        this.lookAt.copy(this.world.toys[Math.floor(this.rng() * this.world.toys.length)].position);
      } else {
        const angle = this.rng() * TAU;
        this.lookAt.set(this.position.x + Math.sin(angle) * 4, 0.25, this.position.z + Math.cos(angle) * 4);
      }
    }
    if (this.toy) this.lookAt.copy(this.toy.position);
    if (this.petHold > 0) {
      // Look up at whoever is doing the petting.
      this.lookAt.set(this.position.x + Math.sin(this.facing) * 2, 1.4, this.position.z + Math.cos(this.facing) * 2);
    }

    const headY = (this.rig.body.position.y + 0.1 + m.headPos.y) * m.scale;
    const dx = this.lookAt.x - this.position.x;
    const dz = this.lookAt.z - this.position.z;
    const dy = this.lookAt.y - headY;
    const yaw = clamp(shortestAngle(this.facing, Math.atan2(dx, dz)), -1.15, 1.15);
    const pitch = clamp(Math.atan2(dy, Math.max(0.001, Math.hypot(dx, dz))), -0.4, 0.8);

    const settle = 1 - Math.exp(-5 * dt);
    this.gazeYaw += (yaw - this.gazeYaw) * settle;
    this.gazePitch += (pitch - this.gazePitch) * settle;

    this.rig.gaze.rotation.y = this.gazeYaw * 0.12;
    this.rig.gaze.rotation.x = clamp(this.gazePitch * 0.25, -0.25, 0.25);
  }

  private cosmetics(dt: number): void {
    const asleep = this.state === 'sleep';
    this.blinkTimer -= dt;
    if (this.blink <= 0 && this.blinkTimer <= 0) {
      this.blink = 0.14;
      this.blinkTimer = (asleep ? 4 : 2.2) + this.rng() * 4;
    }
    if (this.blink > 0) this.blink -= dt;

    const phase = clamp(this.blink / 0.14, 0, 1);
    const content = this.purr > 0.65 ? 0.78 : 0;
    const lid = Math.max(asleep ? 1 : 0, content, Math.sin(phase * Math.PI) * (asleep ? 0.25 : 1));
    const eyeScale = clamp(1 - lid * 0.95, 0.05, 1);
    for (const eye of this.eyeGroups) eye.scale.y = eyeScale;

    if (this.purr > 0.01) {
      this.rig.body.position.y += Math.sin(this.world.elapsed * 38) * 0.004 * this.purr;
    }
  }
}

function blendHex(a: number, b: number, t: number): number {
  return new Color(a).lerp(new Color(b), clamp(t, 0, 1)).getHex();
}
