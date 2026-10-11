import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { makeRng } from '../core/mathx.ts';
import type { PaletteMix } from '../core/palette.ts';

const VERTEX = /* glsl */ `
  attribute vec3 aSeed;
  attribute float aScale;
  uniform float uTime;
  uniform float uHeight;
  uniform float uPixelRatio;
  varying float vFade;

  void main() {
    vec3 p = position;
    float drift = 0.05 + aSeed.x * 0.08;
    p.y = mod(p.y + uTime * drift, uHeight);
    p.x += sin(uTime * 0.28 + aSeed.y * 6.2831) * (0.4 + aSeed.x);
    p.z += cos(uTime * 0.22 + aSeed.z * 6.2831) * (0.4 + aSeed.y);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aScale * uPixelRatio * (140.0 / max(0.001, -mv.z));
    // fade in close to the floor and near the top of their arc
    float t = p.y / uHeight;
    vFade = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.65, 1.0, t));
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float alpha = smoothstep(0.5, 0.06, d) * uOpacity * vFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <colorspace_fragment>
  }
`;

/**
 * Floating dust / pollen / fireflies. One draw call, animated entirely on the
 * GPU so the CPU is free for cats.
 */
export class Motes {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  private readonly height = 6;

  constructor(count = 260) {
    const rng = makeRng(90210);
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 3);
    const scales = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      const radius = Math.sqrt(rng()) * 7.5;
      const angle = rng() * Math.PI * 2;
      positions[i * 3] = Math.sin(angle) * radius;
      positions[i * 3 + 1] = rng() * this.height;
      positions[i * 3 + 2] = Math.cos(angle) * radius;

      seeds[i * 3] = rng();
      seeds[i * 3 + 1] = rng();
      seeds[i * 3 + 2] = rng();

      scales[i] = 0.5 + rng() * 1.6;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new BufferAttribute(seeds, 3));
    geometry.setAttribute('aScale', new BufferAttribute(scales, 1));

    const material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uHeight: { value: this.height },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uColor: { value: new Vector3(1, 0.95, 0.85) },
        uOpacity: { value: 0.5 },
      },
    });

    this.points = new Points(geometry, material);
    this.points.name = 'motes';
    this.points.frustumCulled = false;
  }

  update(palette: PaletteMix, time: number): void {
    const { uniforms } = this.points.material;
    uniforms.uTime.value = time;
    (uniforms.uColor.value as Vector3).set(palette.mote.r, palette.mote.g, palette.mote.b);
    uniforms.uOpacity.value = palette.moteOpacity;
  }
}
