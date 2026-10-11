import { CanvasTexture, ClampToEdgeWrapping, Color, SRGBColorSpace, type Texture } from 'three';
import { makeRng, TAU } from '../core/mathx.ts';
import type { CatTraits } from './traits.ts';

const hex = (value: number): string => `#${new Color(value).getHexString()}`;

/**
 * Draw a soft-edged ellipse onto the fur canvas. Everything in here is
 * deliberately feathered so the pattern reads as "fur" rather than "decals".
 */
function softEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  alpha: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  grad.addColorStop(0, withAlpha(color, alpha));
  grad.addColorStop(0.62, withAlpha(color, alpha * 0.82));
  grad.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Soft-edged vertical stripe (used for tabby markings). */
function softStripe(
  ctx: CanvasRenderingContext2D,
  x: number,
  halfWidth: number,
  y0: number,
  y1: number,
  color: string,
  alpha: number,
): void {
  const grad = ctx.createLinearGradient(x - halfWidth, 0, x + halfWidth, 0);
  grad.addColorStop(0, withAlpha(color, 0));
  grad.addColorStop(0.5, withAlpha(color, alpha));
  grad.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(x - halfWidth, y0, halfWidth * 2, y1 - y0);
}

function withAlpha(color: string, alpha: number): string {
  const c = new Color(color);
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${Math.max(0, Math.min(1, alpha))})`;
}

export interface FurTextures {
  /** Full pattern map applied to the body. */
  map: Texture;
  /** Plain-ish version (no stripes) used for face parts so patterns stay readable. */
  plain: Texture;
}

const cache = new Map<string, FurTextures>();

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable in this browser.');
  return { canvas, ctx };
}

function finish(canvas: HTMLCanvasElement): Texture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** Sprinkle fine noise so flat colours still feel like hair. */
function addFurNoise(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: () => number,
  fur: string,
  accent: string,
  amount = 900,
): void {
  for (let i = 0; i < amount; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 3 + rng() * 7;
    const light = rng() > 0.5;
    ctx.strokeStyle = withAlpha(light ? accent : fur, light ? 0.05 : 0.07);
    ctx.lineWidth = 0.7 + rng() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 2.4, y + len);
    ctx.stroke();
  }
}

function paintPattern(traits: CatTraits, ctx: CanvasRenderingContext2D, size: number, rng: () => number): void {
  const accent = hex(traits.accent);
  const fur = hex(traits.fur);

  switch (traits.pattern) {
    case 'tabby': {
      const stripeCount = 7 + Math.floor(rng() * 4);
      for (let i = 0; i < stripeCount; i += 1) {
        const x = ((i + 0.5) / stripeCount) * size + (rng() - 0.5) * size * 0.03;
        softStripe(ctx, x, size * (0.045 + rng() * 0.03), 0, size, accent, 0.5 + rng() * 0.22);
      }
      // A couple of horizontal bands so it reads from any angle.
      for (let i = 0; i < 3; i += 1) {
        const y = size * (0.18 + i * 0.3) + rng() * size * 0.06;
        softEllipse(ctx, size * 0.5, y, size * 0.36, size * 0.045, accent, 0.22);
      }
      softEllipse(ctx, size * 0.5, size * 0.82, size * 0.42, size * 0.16, hex(0xffffff), 0.14);
      break;
    }
    case 'tuxedo': {
      softEllipse(ctx, size * 0.5, size * 0.58, size * 0.26, size * 0.30, accent, 0.94);
      softEllipse(ctx, size * 0.5, size * 0.30, size * 0.20, size * 0.14, accent, 0.85);
      softEllipse(ctx, size * 0.18, size * 0.9, size * 0.12, size * 0.08, accent, 0.8);
      softEllipse(ctx, size * 0.82, size * 0.9, size * 0.12, size * 0.08, accent, 0.8);
      break;
    }
    case 'calico': {
      const patches = 5 + Math.floor(rng() * 4);
      for (let i = 0; i < patches; i += 1) {
        const cx = rng() * size;
        const cy = rng() * size;
        const rx = size * (0.11 + rng() * 0.13);
        softEllipse(ctx, cx, cy, rx, rx * (0.7 + rng() * 0.5), i % 2 === 0 ? accent : fur, 0.85);
      }
      softEllipse(ctx, size * 0.5, size * 0.86, size * 0.38, size * 0.14, hex(0xffffff), 0.22);
      break;
    }
    case 'spotted': {
      const spots = 16 + Math.floor(rng() * 12);
      for (let i = 0; i < spots; i += 1) {
        const rx = size * (0.03 + rng() * 0.035);
        softEllipse(ctx, rng() * size, rng() * size, rx, rx * (0.85 + rng() * 0.4), accent, 0.72);
      }
      break;
    }
    case 'siamese': {
      // Dark mask at the top of the UV map, dark paws at the bottom.
      const top = ctx.createLinearGradient(0, 0, 0, size * 0.42);
      top.addColorStop(0, withAlpha(accent, 0.92));
      top.addColorStop(0.55, withAlpha(accent, 0.42));
      top.addColorStop(1, withAlpha(accent, 0));
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, size, size * 0.42);

      const bottom = ctx.createLinearGradient(0, size, 0, size * 0.6);
      bottom.addColorStop(0, withAlpha(accent, 0.8));
      bottom.addColorStop(0.6, withAlpha(accent, 0.26));
      bottom.addColorStop(1, withAlpha(accent, 0));
      ctx.fillStyle = bottom;
      ctx.fillRect(0, size * 0.6, size, size * 0.4);
      break;
    }
    case 'solid':
    default: {
      softEllipse(ctx, size * 0.5, size * 0.85, size * 0.42, size * 0.15, hex(0xffffff), 0.1);
      break;
    }
  }
}

/**
 * Build (or reuse) the two fur textures for a set of traits.
 * Everything is cached by a seed + colour key, so re-spawning kittens is cheap.
 */
export function furTextures(traits: CatTraits): FurTextures {
  const key = [traits.seed, traits.pattern, traits.fur, traits.accent, traits.fluff > 0.6 ? 1 : 0].join(':');
  const cached = cache.get(key);
  if (cached) return cached;

  const size = 512;
  const rng = makeRng(traits.seed);
  const fur = hex(traits.fur);
  const accent = hex(traits.accent);

  const base = makeCanvas(size);
  base.ctx.fillStyle = fur;
  base.ctx.fillRect(0, 0, size, size);
  paintPattern(traits, base.ctx, size, rng);
  addFurNoise(base.ctx, size, rng, fur, accent, 1100);

  const plain = makeCanvas(size);
  plain.ctx.fillStyle = fur;
  plain.ctx.fillRect(0, 0, size, size);
  // A hint of the accent, so the face still feels related to the body.
  softEllipse(plain.ctx, size * 0.5, size * 0.55, size * 0.34, size * 0.28, accent, 0.1);
  addFurNoise(plain.ctx, size, makeRng(traits.seed + 7), fur, accent, 700);

  const textures: FurTextures = { map: finish(base.canvas), plain: finish(plain.canvas) };
  // Keep the cache from growing forever during long sessions.
  if (cache.size > 48) cache.clear();
  cache.set(key, textures);
  return textures;
}

/** A tiny round radial texture — handy for shadows, motes and popups. */
export function radialSpriteTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)'): Texture {
  const { canvas, ctx } = makeCanvas(128);
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return finish(canvas);
}

/** Soft vanilla blur/spot shadow used under every cat. */
export function shadowBlobTexture(): Texture {
  const { canvas, ctx } = makeCanvas(128);
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(90, 62, 48, 0.55)');
  grad.addColorStop(0.55, 'rgba(96, 68, 54, 0.24)');
  grad.addColorStop(1, 'rgba(100, 72, 58, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(64, 64, 62, 62 * 0.86, 0, 0, TAU);
  ctx.fill();
  return finish(canvas);
}
