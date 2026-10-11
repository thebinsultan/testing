import { clamp, pick, randInt } from '../core/mathx.ts';
import type { CatTraits } from './traits.ts';

export const NAME_POOL = [
  'Mochi', 'Biscuit', 'Momo', 'Waffles', 'Pumpkin', 'Suki', 'Noodle', 'Clover', 'Muffin', 'Pepper',
  'Tofu', 'Miso', 'Latte', 'Clementine', 'Pudding', 'Marshmallow', 'Boba', 'Dumpling', 'Bean', 'Juniper',
  'Sardine', 'Pickle', 'Custard', 'Wasabi', 'Hazel', 'Nutmeg', 'Peaches', "S'more", 'Crumpet', 'Mittens',
  'Sesame', 'Turnip', 'Mango', 'Bramble', 'Olive', 'Pistachio', 'Cocoa', 'Brie', 'Saffron', 'Gizmo',
] as const;

const MOODS = [
  'feeling mysterious',
  'in a loaf formation',
  'plotting a 3am sprint',
  'smelling something suspicious',
  'professionally cozy',
  'wants the yarn. badly.',
  'having a very small crisis',
  'vibing at maximum purr',
  'considering a nap',
  'mid-nap, technically',
  'guarding the sunbeam',
  'judging your choices, kindly',
] as const;

const ARCHETYPES = [
  'semi-professional birdwatcher',
  'collector of bottle caps and secrets',
  'world champion of the 4am hallway sprint',
  'sunbeam cartographer',
  'cardboard box inspector, union rep',
  'slow-blink specialist',
  'amateur pastry critic',
  'blanket excavation engineer',
  'yarn-chasing enthusiast (retired)',
  'loudest purr in the county',
  'kneading expert, biscuits on request',
  'certified window-watcher, first class',
] as const;

const LOVES = [
  'fishing toys',
  'the top of the fridge',
  'warm laundry',
  'your keyboard at 2am',
  'chasing dust in sunbeams',
  'tiny crinkle balls',
  'chin scratches',
  'boxes exactly one size too small',
  'the loudest water glass in the house',
  'sitting on the book you are reading',
] as const;

const QUIRKS = [
  'purrs like a tiny tractor',
  'does a small chirp instead of meowing',
  'head-butts doors open',
  'sleeps with one paw up like a hero',
  'stars in the nightly zoomies',
  'falls asleep mid-groom',
  'insists on being the little spoon',
  'answers to any name, especially not their own',
  'snores, adorably',
  'steals hair ties and hides them under the rug',
] as const;

export function randomName(rng: () => number): string {
  return pick(rng, NAME_POOL);
}

export interface Personality {
  mood: string;
  bio: string;
  stats: { label: string; value: number }[];
}

/**
 * Derive a stable personality from the traits, so a cat's card never changes
 * between visits.
 */
export function personalityOf(traits: CatTraits): Personality {
  const rng = mulberry(traits.seed ^ 0x9e3779b9);
  const mood = pick(rng, MOODS);
  const archetype = pick(rng, ARCHETYPES);
  const loves = pick(rng, LOVES);
  const quirk = pick(rng, QUIRKS);

  const bio = `${traits.name} is a ${archetype} who loves ${loves} and ${quirk}.`;

  const chaos = clamp(traits.energy * 0.7 + rng() * 0.5, 0, 1);
  const fluffScore = clamp(traits.fluff * 0.85 + rng() * 0.3, 0, 1);
  const snuggle = clamp(1 - chaos * 0.4 + rng() * 0.35, 0, 1);
  const hungry = clamp(rng() * 0.9 + 0.1, 0, 1);

  return {
    mood,
    bio,
    stats: [
      { label: 'Purr', value: snuggle },
      { label: 'Chaos', value: chaos },
      { label: 'Fluff', value: fluffScore },
      { label: 'Snacks', value: hungry },
    ],
  };
}

/** How many whiskers/`whiskers` a cat gets, for the card badge. */
export function quirkBadge(traits: CatTraits): string {
  if (traits.pattern === 'calico') return '🍀 calico luck';
  if (traits.pattern === 'tuxedo') return '🎩 formal wear';
  if (traits.size < 0.8) return '🐣 forever kitten';
  if (traits.fluff > 0.8) return '☁️ maximum fluff';
  if (traits.energy > 0.85) return '⚡ zoomies pending';
  return '🐾 certified good cat';
}

export function smallTalk(rng: () => number, name: string): string {
  const lines = [
    `${name} slowly blinks at you.`,
    `${name} purrs. It is very loud.`,
    `${name} flops onto their side.`,
    `${name} kneads the rug like a tiny baker.`,
    `${name} head-butts your hand.`,
    `${name} chirps.`,
    `${name} rolls over to show the belly (it is a trap).`,
    `${name} sniffs your finger and approves.`,
    `${name} stretches into a perfect crescent.`,
    `${name} gives you a 4-star rating on the petting.`,
  ];
  return pick(rng, lines) ?? `${name} purrs.`;
}

export function treatCount(): number {
  return randInt(Math.random, 1, 3);
}

/** Small local PRNG so personality does not shift between renders. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
