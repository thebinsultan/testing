import { BackSide, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import type { PaletteMix } from '../core/palette.ts';

const VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vDirection = normalize(worldPosition.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  uniform float uNight;
  uniform float uTime;
  varying vec3 vDirection;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
  }

  void main() {
    vec3 dir = normalize(vDirection);

    // Vertical gradient with a soft horizon band.
    float height = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 color = mix(uBottom, uTop, pow(height, 0.85));
    color = mix(color, uHorizon, pow(1.0 - abs(dir.y), 9.0) * 0.85);

    // Sun (or moon) disc and its halo.
    vec3 sun = normalize(uSunDirection);
    float amount = max(dot(dir, sun), 0.0);
    color += uSunColor * pow(amount, 220.0) * 1.5;
    color += uSunColor * pow(amount, 7.0) * 0.24;

    // Stars fade in for the night presets.
    if (uNight > 0.01) {
      vec3 cell = floor(dir * 190.0);
      float star = step(0.986, hash(cell));
      float twinkle = 0.55 + 0.45 * sin(uTime * 1.7 + cell.x * 3.1 + cell.z * 1.7);
      float mask = smoothstep(0.02, 0.35, dir.y);
      color += vec3(star * twinkle) * uNight * 1.1 * mask;
    }

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

/** A big inverted sphere that paints the room's mood behind everything. */
export class Sky {
  readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;
  /** Direction *towards* the sun/moon, normalised. */
  readonly sunDirection = new Vector3(0.4, 0.6, 0.3).normalize();

  constructor() {
    const material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new Vector3(0.55, 0.7, 0.95) },
        uBottom: { value: new Vector3(0.95, 0.85, 0.8) },
        uHorizon: { value: new Vector3(1, 0.95, 0.9) },
        uSunColor: { value: new Vector3(1, 0.95, 0.85) },
        uSunDirection: { value: new Vector3(0.4, 0.6, 0.3) },
        uNight: { value: 0 },
        uTime: { value: 0 },
      },
    });

    this.mesh = new Mesh(new SphereGeometry(120, 32, 20), material);
    this.mesh.name = 'sky';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  update(palette: PaletteMix, time: number): void {
    const { uniforms } = this.mesh.material;

    const elevation = (palette.sunElevation * Math.PI) / 180;
    const azimuth = (palette.sunAzimuth * Math.PI) / 180;
    this.sunDirection
      .set(Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.cos(azimuth))
      .normalize();

    (uniforms.uTop.value as Vector3).set(palette.skyTop.r, palette.skyTop.g, palette.skyTop.b);
    (uniforms.uBottom.value as Vector3).set(palette.skyBottom.r, palette.skyBottom.g, palette.skyBottom.b);
    (uniforms.uHorizon.value as Vector3).set(palette.skyHorizon.r, palette.skyHorizon.g, palette.skyHorizon.b);
    (uniforms.uSunColor.value as Vector3).set(palette.sunColor.r, palette.sunColor.g, palette.sunColor.b);
    (uniforms.uSunDirection.value as Vector3).copy(this.sunDirection);
    uniforms.uNight.value = Math.max(0, 1 - palette.sunIntensity / 2.1);
    uniforms.uTime.value = time;
  }
}
