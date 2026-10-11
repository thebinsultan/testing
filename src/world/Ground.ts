import {
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { TAU } from '../core/mathx.ts';
import type { PaletteMix } from '../core/palette.ts';

/** Drawing helpers shared by the rug/floor textures. */
function canvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  const ctx = element.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return { canvas: element, ctx };
}

function mottle(ctx: CanvasRenderingContext2D, size: number, base: string, dots: number, alpha: number): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < dots; i += 1) {
    const r = 1 + Math.random() * 6;
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 90}, ${Math.random() > 0.5 ? 250 : 70}, ${Math.random() > 0.5 ? 240 : 60}, ${Math.random() * alpha})`;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, TAU);
    ctx.fill();
  }
}

/** A chunky woven rug: concentric rings, wobble and a knotted rim. */
function makeRugTexture(): CanvasTexture {
  const size = 1024;
  const { canvas: element, ctx } = canvas(size);
  mottle(ctx, size, '#ffffff', 5000, 0.07);

  const center = size / 2;
  ctx.save();
  ctx.translate(center, center);

  const rings = 16;
  for (let i = 0; i < rings; i += 1) {
    const t = i / rings;
    const radius = 40 + t * (center - 60);
    ctx.beginPath();
    const wobble = 6 + t * 26;
    for (let a = 0; a <= 64; a += 1) {
      const angle = (a / 64) * TAU;
      const r = radius + Math.sin(angle * (3 + i % 5)) * wobble * (0.4 + t * 0.6);
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const shade = i % 2 === 0 ? 0.16 : 0.06;
    ctx.strokeStyle = `rgba(120, 82, 62, ${shade})`;
    ctx.lineWidth = size * 0.016;
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 255, 255, ${i % 2 === 0 ? 0.1 : 0.16})`;
    ctx.lineWidth = size * 0.006;
    ctx.stroke();
  }

  // Fringe knots around the edge.
  for (let i = 0; i < 150; i += 1) {
    const angle = (i / 150) * TAU;
    const r = center - 22 + Math.sin(angle * 40) * 3;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * r, Math.sin(angle) * r, 7, 0, TAU);
    ctx.fillStyle = `rgba(140, 96, 70, 0.22)`;
    ctx.fill();
  }
  ctx.restore();

  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Soft, slightly mottled floor that stretches out to the fog. */
function makeFloorTexture(): CanvasTexture {
  const size = 512;
  const { canvas: element, ctx } = canvas(size);
  mottle(ctx, size, '#f6efe6', 9000, 0.06);
  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(9, 9);
  texture.anisotropy = 4;
  return texture;
}

/**
 * The room: a big soft floor plus the woven rug the cats live on, and the
 * warm sunbeam patch that drifts across it as the day changes.
 */
export class Ground {
  readonly group = new Group();
  private readonly rugMaterial: MeshStandardMaterial;
  private readonly floorMaterial: MeshStandardMaterial;
  private readonly sunbeam: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly sunbeamTexture: CanvasTexture;

  constructor(readonly bounds = 4.6) {
    const floor = new Mesh(new CircleGeometry(60, 48), new MeshStandardMaterial({
      map: makeFloorTexture(),
      roughness: 1,
      metalness: 0,
    }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.floorMaterial = floor.material as MeshStandardMaterial;

    const rug = new Mesh(
      new CircleGeometry(bounds + 0.35, 96),
      new MeshStandardMaterial({ map: makeRugTexture(), roughness: 0.98, metalness: 0 }),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.008;
    rug.receiveShadow = true;
    this.rugMaterial = rug.material as MeshStandardMaterial;

    this.sunbeamTexture = makeSunbeamTexture();
    this.sunbeam = new Mesh(
      new PlaneGeometry(6.4, 6.4),
      new MeshBasicMaterial({
        map: this.sunbeamTexture,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    this.sunbeam.rotation.x = -Math.PI / 2;
    this.sunbeam.position.y = 0.02;
    this.sunbeam.renderOrder = 1;

    this.group.add(floor, rug, this.sunbeam);
  }

  update(palette: PaletteMix, sunGroundPoint: { x: number; z: number }): void {
    this.rugMaterial.color.copy(palette.rug);
    this.floorMaterial.color.copy(palette.fog).offsetHSL(0, -0.05, -0.03);
    const material = this.sunbeam.material;
    material.color.copy(palette.sunColor);
    material.opacity = 0.1 + Math.max(0, 1 - palette.sunIntensity / 2.4) * 0.06 + palette.sunIntensity * 0.06;
    this.sunbeam.position.x = sunGroundPoint.x;
    this.sunbeam.position.z = sunGroundPoint.z;
  }
}

function makeSunbeamTexture(): CanvasTexture {
  const size = 256;
  const { canvas: element, ctx } = canvas(size);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.55)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
