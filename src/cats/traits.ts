import { chance, clamp, pick, randInt, randRange } from '../core/mathx.ts';

export type CatPattern = 'solid' | 'tabby' | 'tuxedo' | 'calico' | 'spotted' | 'siamese';

export const PATTERNS: readonly CatPattern[] = ['solid', 'tabby', 'tuxedo', 'calico', 'spotted', 'siamese'];

/** Everything that makes one kitten different from another. */
export interface CatTraits {
  id: string;
  seed: number;
  name: string;
  pattern: CatPattern;
  /** Base fur colour (hex). */
  fur: number;
  /** Pattern / bib / belly colour (hex). */
  accent: number;
  /** Iris colour (hex). */
  eye: number;
  /** Overall scale multiplier. */
  size: number;
  /** Ear size multiplier. */
  ear: number;
  /** Tail length multiplier. */
  tail: number;
  /** Sheen / belly fluff amount, 0…1. */
  fluff: number;
  /** Whisker pairs per cheek. */
  whiskers: number;
  /** How lively the cat is, 0…1. */
  energy: number;
}

export const FUR_COLORS = [
  0xf0c58a, 0xe7a869, 0xd79150, 0xb9764a, 0x8c5a3c, 0x5d4037, 0xf7e3cd, 0xe9d7c1, 0xfaf1e6, 0xc9c3bd, 0x9aa2ad,
  0x707a86, 0x3d4450, 0xf3b7ad, 0xe0918f,
] as const;

export const ACCENT_COLORS = [
  0xfff6ea, 0xffe9d2, 0xf6d7b0, 0xe6b98a, 0xd9a066, 0xa9724a, 0x6b4a34, 0x40302a, 0xfdfdff, 0xf2c9c4,
] as const;

export const EYE_COLORS = [0x8fd3c0, 0x7fb4e8, 0xf7d774, 0xa8e08a, 0xd79f6a, 0x5fb0a0, 0xb48cf0] as const;

let idCounter = 0;
export const nextCatId = (): string => `cat-${++idCounter}`;

export function defaultTraits(seed = Math.floor(Math.random() * 1e9)): CatTraits {
  return {
    id: nextCatId(),
    seed,
    name: 'Mochi',
    pattern: 'tabby',
    fur: 0xe8b070,
    accent: 0xfff4e2,
    eye: 0x8fd3c0,
    size: 1,
    ear: 1,
    tail: 1,
    fluff: 0.5,
    whiskers: 4,
    energy: 0.6,
  };
}

export interface RandomTraitsOptions {
  name?: string;
  /** Push size/tail/ear variation further for "kitten" spawns. */
  kitten?: boolean;
}

export function randomTraits(rng: () => number, opts: RandomTraitsOptions = {}): CatTraits {
  const pattern = pick(rng, PATTERNS);
  let fur: number = pick(rng, FUR_COLORS);
  let accent: number = pick(rng, ACCENT_COLORS);

  // Make sure the pattern is visible: nudge accent away from the base fur.
  if (pattern !== 'solid' && pattern !== 'siamese') {
    let guard = 0;
    while (colorDistance(fur, accent) < 70 && guard++ < 12) accent = pick(rng, ACCENT_COLORS);
  }

  // Siamese cats are always light bodied with a dark mask.
  if (pattern === 'siamese') {
    fur = pick(rng, [0xf7e3cd, 0xfaf1e6, 0xfff6ea]);
    accent = pick(rng, [0x8c5a3c, 0x5d4037, 0x40302a]);
  }

  const kitten = opts.kitten ?? chance(rng, 0.35);

  return {
    id: nextCatId(),
    seed: Math.floor(rng() * 1e9),
    name: opts.name ?? 'Kitty',
    pattern,
    fur,
    accent,
    eye: pick(rng, EYE_COLORS),
    size: clamp(kitten ? randRange(rng, 0.66, 0.92) : randRange(rng, 0.88, 1.28), 0.6, 1.4),
    ear: randRange(rng, 0.75, 1.35),
    tail: randRange(rng, 0.72, 1.5),
    fluff: randRange(rng, 0.15, 0.95),
    whiskers: randInt(rng, 2, 6),
    energy: randRange(rng, 0.25, 1),
  };
}

/** Rough perceptual distance between two packed RGB hex values. */
export function colorDistance(a: number, b: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  // Weighted euclidean (approximates human luminance sensitivity).
  const dr = (ar - br) * 0.3;
  const dg = (ag - bg) * 0.59;
  const db = (ab - bb) * 0.11;
  return Math.sqrt(dr * dr + dg * dg + db * db) * 2.6;
}

export const cloneTraits = (t: CatTraits): CatTraits => ({ ...t, id: nextCatId() });
