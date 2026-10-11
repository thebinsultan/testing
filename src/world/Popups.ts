import { CanvasTexture, Group, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from 'three';

interface Popup {
  sprite: Sprite;
  life: number;
  maxLife: number;
  velocity: Vector3;
  spin: number;
}

export interface PopupOptions {
  color?: string;
  scale?: number;
  rise?: number;
  life?: number;
}

const textureCache = new Map<string, CanvasTexture>();

function popupTexture(text: string, color: string): CanvasTexture {
  const key = `${text}|${color}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '800 86px "Baloo 2", "Nunito", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // soft halo so the text reads against any sky
  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(255, 250, 245, 0.92)';
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);

  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  if (textureCache.size > 64) textureCache.clear();
  textureCache.set(key, texture);
  return texture;
}

/**
 * Little floating reactions — "Zzz", "❤️", "nom!" — that pop above a cat and
 * drift upwards before fading out.
 */
export class Popups {
  readonly group = new Group();
  private readonly active: Popup[] = [];

  spawn(text: string, at: Vector3, opts: PopupOptions = {}): void {
    if (this.active.length > 18) return;

    const material = new SpriteMaterial({
      map: popupTexture(text, opts.color ?? '#f5798f'),
      transparent: true,
      depthWrite: false,
      opacity: 0.95,
    });
    const sprite = new Sprite(material);
    const scale = opts.scale ?? 0.5;
    sprite.scale.set(scale, scale * 0.5, 1);
    sprite.position.copy(at);
    sprite.position.y += 0.1;
    this.group.add(sprite);

    this.active.push({
      sprite,
      life: opts.life ?? 1.5,
      maxLife: opts.life ?? 1.5,
      velocity: new Vector3((Math.random() - 0.5) * 0.35, opts.rise ?? 0.72, (Math.random() - 0.5) * 0.35),
      spin: (Math.random() - 0.5) * 1.6,
    });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const popup = this.active[i];
      popup.life -= dt;
      const t = 1 - Math.max(0, popup.life) / popup.maxLife;

      popup.sprite.position.addScaledVector(popup.velocity, dt);
      popup.velocity.y *= 1 - dt * 0.6;

      const pop = Math.sin(Math.min(1, t * 3.2) * Math.PI * 0.5);
      const scale = (0.42 + t * 0.12) * pop;
      popup.sprite.scale.set(scale, scale * 0.5, 1);
      popup.sprite.material.rotation += popup.spin * dt * 0.25;
      popup.sprite.material.opacity = Math.max(0, 1 - t * t) * 0.95;

      if (popup.life <= 0) {
        this.group.remove(popup.sprite);
        popup.sprite.material.dispose();
        this.active.splice(i, 1);
      }
    }
  }

  /** Convenience: float a reaction above a specific world position. */
  above(text: string, at: Vector3, opts?: PopupOptions): void {
    const jitter = (Math.random() - 0.5) * 0.2;
    this.spawn(text, at.clone().add(new Vector3(jitter, 0, jitter)), opts);
  }

  randomEmoji(): string {
    const pool = ['❤️', '💛', '✨', '🐾', '🐟', '😻'];
    return pool[Math.floor(Math.random() * pool.length)];
  }
}
