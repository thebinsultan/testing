import { Group, Object3D, Vector3 } from 'three';
import { clamp } from '../core/mathx.ts';
import type { CatTraits } from './traits.ts';

/** One leg: hip pivot → knee pivot → paw pivot, plus segment lengths for ground solving. */
export interface LegLink {
  /** Rotates at the hip (attached to the body). */
  root: Object3D;
  /** Rotates at the knee/elbow. */
  mid: Object3D;
  /** Pivot at the ankle; the paw mesh hangs here. */
  paw: Object3D;
  l1: number;
  l2: number;
  /** True for the two hind legs (they rest with a different bend). */
  hind: boolean;
  /** +1 for the cat's right side, -1 for the left. */
  side: number;
}

export interface TailLink {
  pivot: Object3D;
  length: number;
  radius: number;
}

export interface CatMetrics {
  /** Overall object scale applied at the root. */
  scale: number;
  standHeight: number;
  flopHeight: number;
  bodyRadius: number;
  bodyLength: number;
  headRadius: number;
  muzzleLength: number;
  /** Distance from the hip line to the shoulders, used by the walk cycle. */
  legSpan: number;
  /** Local position of the head pivot inside the body group. */
  headPos: Vector3;
  earScale: number;
  tailScale: number;
}

export interface CatRig {
  root: Group;
  /** Everything that bobs: torso, head, tail, legs. */
  body: Group;
  spine: Group;
  hips: Group;
  neck: Group;
  head: Group;
  muzzle: Group;
  /** Pupil / gaze pivot inside the head. */
  gaze: Group;
  earL: Group;
  earR: Group;
  innerEarL: Group;
  innerEarR: Group;
  tail: TailLink[];
  tailTip: Group;
  legs: LegLink[];
  metrics: CatMetrics;
}

export const BASE_BODY_RADIUS = 0.3;
export const BASE_BODY_LENGTH = 1.0;
export const BASE_STAND_HEIGHT = 0.6;
export const BASE_HEAD_RADIUS = 0.3;

/**
 * Build the transform hierarchy for a cat. No geometry here — `Cat.ts`
 * attaches the meshes to these pivots, which keeps animation code readable.
 */
export function createCatRig(traits: CatTraits): CatRig {
  const scale = 0.92 * clamp(traits.size, 0.55, 1.5);

  const metrics: CatMetrics = {
    scale,
    standHeight: BASE_STAND_HEIGHT,
    flopHeight: BASE_BODY_RADIUS * 0.94,
    bodyRadius: BASE_BODY_RADIUS,
    bodyLength: BASE_BODY_LENGTH,
    headRadius: BASE_HEAD_RADIUS,
    muzzleLength: 0.14,
    legSpan: 0.17,
    headPos: new Vector3(0, 0.36, 0.4),
    earScale: clamp(traits.ear, 0.5, 1.7),
    tailScale: clamp(traits.tail, 0.5, 1.8),
  };

  const root = new Group();
  root.name = 'cat';
  root.scale.setScalar(scale);

  const body = new Group();
  body.position.y = metrics.standHeight;
  root.add(body);

  const spine = new Group();
  body.add(spine);

  const hips = new Group();
  hips.position.z = -metrics.bodyLength * 0.28;
  spine.add(hips);

  const neck = new Group();
  neck.position.set(0, 0.1, metrics.bodyLength * 0.38);
  spine.add(neck);

  const head = new Group();
  head.position.copy(metrics.headPos).setZ(0.24);
  neck.add(head);

  const gaze = new Group();
  gaze.position.set(0, 0.01, 0);
  head.add(gaze);

  const muzzle = new Group();
  muzzle.position.set(0, -0.075, metrics.headRadius * 0.72);
  head.add(muzzle);

  // Ears — pivots sit at the base of each ear so they can twitch.
  const earL = new Group();
  earL.position.set(-0.15, 0.19, -0.01);
  earL.rotation.z = 0.22;
  head.add(earL);

  const earR = new Group();
  earR.position.set(0.15, 0.19, -0.01);
  earR.rotation.z = -0.22;
  head.add(earR);

  const innerEarL = new Group();
  innerEarL.position.set(0, 0.012, 0.028);
  earL.add(innerEarL);

  const innerEarR = new Group();
  innerEarR.position.set(0, 0.012, 0.028);
  earR.add(innerEarR);

  // Tail — a chain of 5 pivots so it can curl and counter-sway.
  const tail: TailLink[] = [];
  const segmentLength = 0.17 * metrics.tailScale;
  let tailParent: Object3D = spine;
  const tailBasePos = new Vector3(0, 0.12, -metrics.bodyLength * 0.46);
  for (let i = 0; i < 5; i += 1) {
    const pivot = new Group();
    if (i === 0) {
      pivot.position.copy(tailBasePos);
    } else {
      pivot.position.set(0, -segmentLength, 0);
    }
    tailParent.add(pivot);
    tailParent = pivot;
    tail.push({ pivot, length: segmentLength, radius: 0.075 - i * 0.008 });
  }
  const tailTip = new Group();
  tailTip.position.set(0, -segmentLength, 0);
  tailParent.add(tailTip);

  // Legs — front pair slightly narrower than the hind pair.
  const legs: LegLink[] = [];
  const legLayout: { x: number; z: number; hind: boolean }[] = [
    { x: -0.16, z: metrics.bodyLength * 0.3, hind: false },
    { x: 0.16, z: metrics.bodyLength * 0.3, hind: false },
    { x: -0.18, z: -metrics.bodyLength * 0.3, hind: true },
    { x: 0.18, z: -metrics.bodyLength * 0.3, hind: true },
  ];
  for (const layout of legLayout) {
    const hip = new Group();
    hip.position.set(layout.x, 0, layout.z);
    body.add(hip);

    const l1 = BASE_STAND_HEIGHT * 0.56;
    const l2 = BASE_STAND_HEIGHT * 0.44;

    const mid = new Group();
    mid.position.y = -l1;
    hip.add(mid);

    const paw = new Group();
    paw.position.y = -l2;
    mid.add(paw);

    legs.push({
      root: hip,
      mid,
      paw,
      l1,
      l2,
      hind: layout.hind,
      side: Math.sign(layout.x),
    });
  }

  return {
    root,
    body,
    spine,
    hips,
    neck,
    head,
    muzzle,
    gaze,
    earL,
    earR,
    innerEarL,
    innerEarR,
    tail,
    tailTip,
    legs,
    metrics,
  };
}

/**
 * Given the current hip height, work out how far a leg may extend without
 * pushing the paw through the floor. Returns a hip rotation in radians where
 * 0 = straight down (maximum reach) and larger values tuck the paw upward.
 */
export function solveLegAngle(
  hipHeight: number,
  l1: number,
  l2: number,
  kneeBend: number,
  minPawHeight: number,
  preferred: number,
): number {
  const reach = (a: number): number => l1 * Math.cos(a) + l2 * Math.cos(a + kneeBend);
  const pawHeight = (a: number): number => hipHeight - reach(a);

  // Fully tucked poses keep the paws inside the torso, which is fine.
  if (pawHeight(preferred) >= minPawHeight) return preferred;

  let lo = preferred;
  let hi = preferred + 1.5;
  if (pawHeight(hi) < minPawHeight) return hi;
  for (let i = 0; i < 7; i += 1) {
    const mid = (lo + hi) * 0.5;
    if (pawHeight(mid) < minPawHeight) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 0.5;
}
