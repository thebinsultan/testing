import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { clamp, damp } from './mathx.ts';

export interface CameraOptions {
  minDistance?: number;
  maxDistance?: number;
  minPolar?: number;
  maxPolar?: number;
}

/**
 * A hand-rolled orbit camera. Deliberately simple and smooth: rotation and
 * zoom are damped so the room never feels jittery, and it can gently drift on
 * its own when nobody has touched it for a while.
 */
export class OrbitCamera {
  readonly camera: PerspectiveCamera;

  readonly target = new Vector3(0, 0.85, 0);
  readonly desiredTarget = new Vector3(0, 0.85, 0);

  azimuth = 0.65;
  polar = 1.02;
  distance = 7.9;

  autoRotate = true;

  private desiredAzimuth = 0.65;
  private desiredPolar = 1.02;
  private desiredDistance = 7.9;
  private readonly minDistance: number;
  private readonly maxDistance: number;
  private readonly minPolar: number;
  private readonly maxPolar: number;
  private idleTime = 0;
  private focus: { point: Vector3; distance: number } | null = null;

  constructor(aspect: number, options: CameraOptions = {}) {
    this.minDistance = options.minDistance ?? 3.4;
    this.maxDistance = options.maxDistance ?? 20;
    this.minPolar = options.minPolar ?? 0.24;
    this.maxPolar = options.maxPolar ?? 1.44;

    this.camera = new PerspectiveCamera(42, aspect, 0.1, 260);
    this.camera.position.set(6, 4.4, 7);
    this.apply(true);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Rotate from a pointer drag, in screen pixels. */
  rotate(dx: number, dy: number): void {
    this.idleTime = 0;
    this.desiredAzimuth -= dx * 0.0052;
    this.desiredPolar = clamp(this.desiredPolar - dy * 0.0044, this.minPolar, this.maxPolar);
  }

  /** Zoom from a wheel delta or pinch scale. */
  zoom(delta: number): void {
    this.idleTime = 0;
    this.desiredDistance = clamp(this.desiredDistance * Math.exp(delta * 0.0011), this.minDistance, this.maxDistance);
  }

  /** Pan the look-at target across the floor. */
  pan(dx: number, dy: number): void {
    this.idleTime = 0;
    this.clearFocus();
    const scale = this.desiredDistance * 0.0013;
    const right = new Vector3(Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));
    const forward = new Vector3(Math.sin(this.azimuth), 0, Math.cos(this.azimuth));
    this.desiredTarget.addScaledVector(right, -dx * scale);
    this.desiredTarget.addScaledVector(forward, -dy * scale);
    this.desiredTarget.x = clamp(this.desiredTarget.x, -6, 6);
    this.desiredTarget.z = clamp(this.desiredTarget.z, -6, 6);
  }

  /** Gently pull the camera towards a cat (used when one is selected). */
  focusOn(point: Vector3, distance = 4.6): void {
    this.focus = { point: point.clone(), distance };
  }

  /**
   * Follow a point without allocating — pass a reusable vector, it is copied
   * every frame.
   */
  track(point: Vector3, distance = 4.6): void {
    if (!this.focus) this.focus = { point: point.clone(), distance };
    else this.focus.point.copy(point);
    this.focus.distance = distance;
  }

  clearFocus(): void {
    if (this.focus) {
      this.focus = null;
      this.desiredTarget.set(0, 0.85, 0);
      this.desiredDistance = 7.9;
    }
  }

  setTarget(point: Vector3, distance = 5): void {
    this.focus = { point: point.clone(), distance };
  }

  /** Kick the idle timer so auto-drift doesn't fight the user. */
  notifyInteraction(): void {
    this.idleTime = 0;
  }

  update(dt: number): void {
    this.idleTime += dt;

    if (this.focus) {
      this.desiredTarget.set(this.focus.point.x, Math.max(0.5, this.focus.point.y + 0.42), this.focus.point.z);
      this.desiredDistance = this.focus.distance;
    } else if (this.idleTime > 14 && this.autoRotate) {
      // barely-there drift so the room feels alive while idle
      this.desiredAzimuth += dt * 0.021;
    }

    this.azimuth = damp(this.azimuth, this.desiredAzimuth, 6, dt);
    this.polar = damp(this.polar, this.desiredPolar, 6, dt);
    this.distance = damp(this.distance, this.desiredDistance, 4.2, dt);
    this.target.x = damp(this.target.x, this.desiredTarget.x, 5, dt);
    this.target.y = damp(this.target.y, this.desiredTarget.y, 5, dt);
    this.target.z = damp(this.target.z, this.desiredTarget.z, 5, dt);

    this.apply(false);
  }

  private apply(immediate: boolean): void {
    if (immediate) {
      this.azimuth = this.desiredAzimuth;
      this.polar = this.desiredPolar;
      this.distance = this.desiredDistance;
      this.target.copy(this.desiredTarget);
    }
    const sinPolar = Math.sin(this.polar);
    const x = this.target.x + this.distance * sinPolar * Math.sin(this.azimuth);
    const y = this.target.y + this.distance * Math.cos(this.polar);
    const z = this.target.z + this.distance * sinPolar * Math.cos(this.azimuth);
    this.camera.position.set(x, Math.max(0.35, y), z);
    this.camera.lookAt(this.target);
  }

  /** Screen-space angle used to slide the sun patch around. */
  get yawAngle(): number {
    return MathUtils.euclideanModulo(this.azimuth, Math.PI * 2);
  }
}
