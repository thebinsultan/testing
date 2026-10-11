/** Tiny math helpers shared across the playground. */

export const TAU = Math.PI * 2;

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Frame-rate independent exponential smoothing (a = 1 - exp(-k*dt)). */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const invLerp = (a: number, b: number, v: number): number => (b === a ? 0 : (v - a) / (b - a));

/** Deterministic tiny PRNG (mulberry32) so a seed always yields the same kitten. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randRange = (rng: () => number, min: number, max: number): number => min + rng() * (max - min);
export const randInt = (rng: () => number, min: number, max: number): number => Math.floor(randRange(rng, min, max + 1));
export const pick = <T>(rng: () => number, list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

export const chance = (rng: () => number, p: number): boolean => rng() < p;

/** Pick a random item from an array, mutating the array (lightweight sampling without replacement). */
export function takeRandom<T>(rng: () => number, list: T[]): T | undefined {
  if (list.length === 0) return undefined;
  const i = Math.floor(rng() * list.length);
  const [item] = list.splice(i, 1);
  return item;
}

export const TWO_PI = TAU;

/** Direction helpers on the ground plane. */
export const dirFromAngle = (angle: number): { x: number; z: number } => ({
  x: Math.sin(angle),
  z: Math.cos(angle),
});

export const angleLerp = (a: number, b: number, t: number): number => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
};

export const shortestAngle = (a: number, b: number): number => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
