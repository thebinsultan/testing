import {
  ACESFilmicToneMapping,
  Clock,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PCFSoftShadowMap,
  Plane,
  PointLight,
  Object3D,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  SRGBColorSpace,
} from 'three';
import { OrbitCamera } from './core/camera.ts';
import { clamp, makeRng, pick, randRange, smoothstep, TAU } from './core/mathx.ts';
import { applyPaletteToCss, blendPresets, createMix, PRESETS, type PaletteMix } from './core/palette.ts';
import { Cat, type CatEvent, type CatWorld } from './cats/Cat.ts';
import { NAME_POOL, randomName } from './cats/names.ts';
import { cloneTraits, defaultTraits, randomTraits, type CatTraits } from './cats/traits.ts';
import { Sound } from './audio/Sound.ts';
import { Ground } from './world/Ground.ts';
import { Motes } from './world/Motes.ts';
import { Popups } from './world/Popups.ts';
import { Props } from './world/Props.ts';
import { Sky } from './world/Sky.ts';
import { ToySystem, type Toy } from './world/toys.ts';
import { HUD, type CardAction, type HudCallbacks, type ToolMode } from './ui/HUD.ts';

const MAX_CATS = 14;
const GROUND_PLANE = new Plane(new Vector3(0, 1, 0), 0);

/**
 * Purrlane's beating heart: owns the renderer, the room, the cats and every
 * interaction. It doubles as the `CatWorld` the cats talk to and as the set of
 * callbacks the HUD talks to.
 */
export class Playground implements CatWorld, HudCallbacks {
  readonly scene = new Scene();
  readonly camera: OrbitCamera;
  readonly hud: HUD;
  readonly sound = new Sound();

  /* ── CatWorld surface ─────────────────────────────────────────────── */
  readonly bounds = 4.4;
  elapsed = 0;
  readonly sunPoint = new Vector3(2, 0, 2);
  readonly cats: Cat[] = [];
  readonly obstacles: { x: number; z: number; radius: number }[] = [];

  /** Every treat and yarn ball currently in the room. */
  get toys(): Toy[] {
    return this.toySystem.toys;
  }

  private readonly renderer: WebGLRenderer;
  private readonly clock = new Clock();
  private readonly ground: Ground;
  private readonly sky = new Sky();
  private readonly props: Props;
  private readonly motes = new Motes();
  private readonly popups = new Popups();
  private readonly toySystem = new ToySystem();

  private readonly sun = new DirectionalLight(0xfff0d8, 2.2);
  private readonly hemi = new HemisphereLight(0xdfefff, 0xe8ecd8, 1);
  private readonly lamp = new PointLight(0xffbb77, 0, 14, 2);

  private readonly palette: PaletteMix = createMix();
  private readonly raycaster = new Raycaster();
  private readonly pointerNdc = new Vector2();
  private readonly hitPoint = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmpFlat = new Vector3();
  private readonly focusPoint = new Vector3();

  private timeIndex = 1;
  private timePhase = 0.0;
  private autoCycle = true;
  private tool: ToolMode = 'pet';
  private selected: Cat | null = null;
  private preview: Cat | null = null;
  private previewTraits: CatTraits = defaultTraits();
  private previewRebuild = 0;

  private readonly activePointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  private pointerDown = false;
  private pointerId = -1;
  private pointerButton = 0;
  private lastPointer = new Vector2();
  private dragDistance = 0;
  private wiggle = 0;
  private hovered: Cat | null = null;
  private statsRefresh = 0;
  private zzzTimer = 0;
  private petsGiven = 0;
  private treatsGiven = 0;
  private frameHandle = 0;
  private disposed = false;
  private readonly onResize = (): void => this.resize();
  private readonly onVisibility = (): void => {
    this.clock.getDelta();
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    this.camera = new OrbitCamera(window.innerWidth / Math.max(1, window.innerHeight));
    this.ground = new Ground(this.bounds);
    this.props = new Props(this.bounds);
    this.obstacles.push(...this.props.obstacles);

    this.scene.add(
      this.sky.mesh,
      this.ground.group,
      this.props.group,
      this.motes.points,
      this.popups.group,
      this.toySystem.group,
    );
    this.setupLights();

    this.hud = new HUD(this, defaultTraits());

    this.bindEvents();
    this.resize();
    this.seedRoom();
    this.applyPalette(0);
  }

  /* ── setup ────────────────────────────────────────────────────────── */

  private setupLights(): void {
    this.hemi.position.set(0, 12, 0);
    this.scene.add(this.hemi);

    this.sun.position.set(8, 12, 6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -8;
    this.sun.shadow.camera.right = 8;
    this.sun.shadow.camera.top = 8;
    this.sun.shadow.camera.bottom = -8;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 45;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.022;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.lamp.position.set(-this.bounds * 0.68, 2.85, -this.bounds * 0.6);
    this.scene.add(this.lamp);
  }

  private seedRoom(): void {
    const rng = makeRng(Date.now() % 1_000_000);
    const names = [...NAME_POOL];
    const count = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 3 : 5;
    for (let i = 0; i < count; i += 1) {
      const traits = randomTraits(rng, { name: names[i % names.length] });
      const angle = (i / count) * TAU + rng() * 0.6;
      const radius = 1.2 + rng() * (this.bounds - 2);
      this.spawnCat(traits, new Vector3(Math.sin(angle) * radius, 0, Math.cos(angle) * radius), false);
    }
  }

  /* ── rendering ────────────────────────────────────────────────────── */

  start(): void {
    this.clock.start();
    const loop = (): void => {
      if (this.disposed) return;
      this.frameHandle = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.06);
      if (document.hidden) {
        this.renderer.render(this.scene, this.camera.camera);
        return;
      }
      this.update(dt);
      this.renderer.render(this.scene, this.camera.camera);
    };
    this.frameHandle = requestAnimationFrame(loop);
  }

  private update(dt: number): void {
    this.elapsed += dt;

    this.updatePalette(dt);
    this.camera.update(dt);
    this.props.update(dt);

    for (const cat of this.cats) cat.update(dt);
    if (this.selected) this.camera.track(this.focusPoint.copy(this.selected.position3).setY(0.45), 4.3);
    if (this.preview) {
      this.preview.update(dt);
      if (this.previewRebuild > 0) {
        this.previewRebuild -= dt;
        if (this.previewRebuild <= 0) this.rebuildPreview();
      }
    }

    this.toySystem.update(dt, this.elapsed, this.bounds);
    this.popups.update(dt);

    this.updatePointerInteraction();

    /* audio layer */
    let purr = 0;
    for (const cat of this.cats) purr = Math.max(purr, cat.purr);
    if (this.preview) purr = Math.max(purr, this.preview.purr);
    this.sound.setPurrLevel(purr);
    this.sound.update(dt);

    /* a sleepy room keeps going "Zzz" */
    this.zzzTimer -= dt;
    if (this.zzzTimer <= 0) {
      this.zzzTimer = 3.4;
      const sleepers = this.cats.filter((cat) => cat.isAsleep);
      if (sleepers.length > 0) {
        const cat = sleepers[Math.floor(Math.random() * sleepers.length)];
        this.popups.above('Zzz', this.headTop(cat), { color: '#8fa5d8', scale: 0.42 });
      }
    }

    /* keep the open card fresh */
    if (this.selected) {
      this.statsRefresh -= dt;
      if (this.statsRefresh <= 0) {
        this.statsRefresh = 0.35;
        this.hud.refreshCat();
        if (this.selected.purr > 0.5 && Math.random() < 0.25) {
          this.popups.above('❤️', this.headTop(this.selected), { color: '#f5798f', scale: 0.4 });
        }
      }
    }
  }

  private headTop(cat: Cat): Vector3 {
    return this.tmp.copy(cat.position3).setY(1.15 * cat.rig.metrics.scale + 0.25).clone();
  }

  /* ── day / night ──────────────────────────────────────────────────── */

  private updatePalette(dt: number): void {
    if (this.autoCycle) {
      this.timePhase += dt / 46;
      while (this.timePhase >= 1) {
        this.timePhase -= 1;
        this.timeIndex = (this.timeIndex + 1) % PRESETS.length;
      }
    }
    this.applyPalette(this.timePhase);
  }

  private applyPalette(phase: number): void {
    const from = PRESETS[this.timeIndex % PRESETS.length];
    const to = PRESETS[(this.timeIndex + 1) % PRESETS.length];
    const eased = smoothstep(0, 1, phase);
    blendPresets(from, to, eased, this.palette);

    this.sky.update(this.palette, this.elapsed);

    const direction = this.sky.sunDirection;
    this.sun.position.copy(direction).multiplyScalar(16);
    this.sun.color.copy(this.palette.sunColor);
    this.sun.intensity = this.palette.sunIntensity;
    this.sun.target.position.set(0, 0, 0);

    this.hemi.color.copy(this.palette.hemiSky);
    this.hemi.groundColor.copy(this.palette.hemiGround);
    this.hemi.intensity = this.palette.hemiIntensity;

    this.lamp.intensity = this.palette.lamp * 16;
    this.lamp.color.setHex(0xffbb77);

    const fog = this.scene.fog instanceof Fog ? this.scene.fog : new Fog(0xffffff, 14, 46);
    fog.color.copy(this.palette.fog);
    fog.near = this.palette.fogNear;
    fog.far = this.palette.fogFar;
    this.scene.fog = fog;
    this.renderer.setClearColor(this.palette.skyHorizon, 1);

    // The sunbeam lands opposite the sun's horizontal direction.
    const flat = this.tmpFlat.set(-direction.x, 0, -direction.z);
    if (flat.lengthSq() < 0.0001) flat.set(0.3, 0, 0.3);
    flat.normalize().multiplyScalar(1.7);
    this.sunPoint.set(flat.x, 0.05, flat.z);

    this.ground.update(this.palette, this.sunPoint);
    this.motes.update(this.palette, this.elapsed);
    applyPaletteToCss(this.palette);

    this.hud.setTime(this.palette.label, this.palette.emoji);
  }

  /* ── cats ─────────────────────────────────────────────────────────── */

  private spawnCat(traits: CatTraits, at: Vector3, celebrate: boolean): Cat | null {
    if (this.cats.length >= MAX_CATS) {
      const oldest = this.cats.shift();
      if (oldest) {
        this.scene.remove(oldest.group);
        oldest.dispose();
        this.hud.showToast(`😽 ${oldest.traits.name} wandered off to a good home`);
      }
    }

    const cat = new Cat(traits, this, at);
    cat.group.userData.cat = cat;
    this.cats.push(cat);
    this.scene.add(cat.group);

    if (celebrate) {
      this.popups.above(traits.name, new Vector3(at.x, 1.1, at.z), { color: '#f5798f', scale: 0.62 });
      this.sound.chime();
      this.hud.showToast(`🐾 ${traits.name} has joined the room`);
    }
    this.hud.setStats(this.cats.length, this.petsGiven, this.treatsGiven);
    return cat;
  }

  onCatEvent(event: CatEvent): void {
    const { cat } = event;
    switch (event.type) {
      case 'meow':
        this.sound.meow(randRange(Math.random, 0.9, 1.25));
        break;
      case 'chirp':
        this.sound.chirp();
        this.popups.above('♪', this.headTop(cat), { color: '#8fb0e8', scale: 0.38 });
        break;
      case 'pounce':
        this.sound.thud(0.5);
        break;
      case 'sleep':
        this.popups.above('Zzz', this.headTop(cat), { color: '#8fa5d8', scale: 0.42 });
        break;
      case 'wake':
        this.sound.chirp();
        this.popups.above('!', this.headTop(cat), { color: '#f0a25c', scale: 0.42 });
        break;
      case 'eat':
        this.sound.nom();
        this.popups.above('nom!', this.headTop(cat), { color: '#e8a44f', scale: 0.46 });
        break;
      case 'yarn':
        this.sound.thud(0.65);
        this.popups.above('🧶', this.headTop(cat), { color: '#c98bd8', scale: 0.42 });
        break;
      case 'happy':
        this.sound.meow(1.3);
        this.popups.above(pick(Math.random, ['😻', '❤️', '✨']), this.headTop(cat), { scale: 0.46 });
        break;
      case 'pet': {
        this.petsGiven += 1;
        this.hud.setStats(this.cats.length, this.petsGiven, this.treatsGiven);
        if (Math.random() < 0.5) {
          this.popups.above(pick(Math.random, ['❤️', '💛', '✨', '🐾']), this.headTop(cat), { scale: 0.36 });
        }
        if (Math.random() < 0.35) this.sound.meow(randRange(Math.random, 1.1, 1.45));
        break;
      }
      case 'purr':
      default:
        break;
    }
  }

  claimToy(toy: Toy, cat: Cat): void {
    toy.claimedBy = cat;
    toy.claimedAt = this.elapsed;
  }

  consumeToy(toy: Toy): void {
    // The toy shrinks away on its own; just release any claim on it.
    toy.claimedBy = null;
  }

  /* ── toys ─────────────────────────────────────────────────────────── */

  private tossToy(kind: 'treat' | 'yarn', at: Vector3): void {
    const direction = new Vector3(Math.sin(this.camera.yawAngle), 0, Math.cos(this.camera.yawAngle));
    const toy = this.toySystem.spawn(kind, new Vector3(at.x, 1.5, at.z), direction.multiplyScalar(0.35), this.bounds);
    toy.claimedBy = null;
    toy.group.userData.toy = toy;
    this.treatsGiven += 1;
    this.sound.click(0.08);
    this.hud.setStats(this.cats.length, this.petsGiven, this.treatsGiven);

    // Wake the nearest cat up so someone actually eats it.
    let nearest: Cat | null = null;
    let distance = Infinity;
    for (const cat of this.cats) {
      const d = cat.position3.distanceTo(at);
      if (d < distance) {
        distance = d;
        nearest = cat;
      }
    }
    if (nearest && nearest.isAsleep && distance < 4) nearest.startle();
  }

  /* ── pointer ──────────────────────────────────────────────────────── */

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);

    const canvas = this.canvas;
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    canvas.addEventListener('pointerdown', (event) => {
      this.sound.unlock();
      this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.activePointers.size === 2) this.pinchDistance = this.pointerSpread();
      this.pointerDown = true;
      this.pointerId = event.pointerId;
      this.pointerButton = event.button;
      this.dragDistance = 0;
      this.lastPointer.set(event.clientX, event.clientY);
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('is-grabbing');
      this.camera.notifyInteraction();
    });

    canvas.addEventListener('pointermove', (event) => {
      const dx = event.clientX - this.lastPointer.x;
      const dy = event.clientY - this.lastPointer.y;
      this.lastPointer.set(event.clientX, event.clientY);
      this.wiggle += Math.hypot(dx, dy);

      // Two fingers = pinch to zoom, no orbit.
      if (this.activePointers.has(event.pointerId)) {
        this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }
      if (this.activePointers.size >= 2) {
        const spread = this.pointerSpread();
        if (this.pinchDistance > 0) this.camera.zoom(-(spread - this.pinchDistance) * 2.4);
        this.pinchDistance = spread;
        this.dragDistance += 12;
        return;
      }

      if (!this.pointerDown || event.pointerId !== this.pointerId) {
        this.updateHover(event.clientX, event.clientY);
        return;
      }
      this.dragDistance += Math.hypot(dx, dy);
      if (this.pointerButton === 2 || event.shiftKey) this.camera.pan(dx, dy);
      else this.camera.rotate(dx, dy);
    });

    const endPointer = (event: PointerEvent): void => {
      this.activePointers.delete(event.pointerId);
      if (this.activePointers.size < 2) this.pinchDistance = 0;
      if (!this.pointerDown || event.pointerId !== this.pointerId) return;
      this.pointerDown = false;
      canvas.classList.remove('is-grabbing');
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);

      if (this.dragDistance < 7) this.handleClick(event.clientX, event.clientY);
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.camera.zoom(event.deltaY);
        this.camera.notifyInteraction();
      },
      { passive: false },
    );

    canvas.addEventListener('pointerleave', () => {
      this.hovered = null;
      this.hud.hideHoverLabel();
      canvas.classList.remove('is-over-cat');
    });

    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.hud.showToast('😿 The graphics context was lost — reloading the room', 6);
    });
  }

  /** Distance between the two active touch points (0 when not pinching). */
  private pointerSpread(): number {
    const points = Array.from(this.activePointers.values());
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  private updateHover(clientX: number, clientY: number): void {
    const cat = this.pickCat(clientX, clientY);
    if (cat !== this.hovered) this.hovered = cat;
    if (cat) {
      this.canvas.classList.add('is-over-cat');
      this.hud.showHoverLabel(`${cat.traits.name} · ${cat.isAsleep ? 'sleeping' : 'pet me'}`, clientX, clientY - 34);
    } else {
      this.canvas.classList.remove('is-over-cat');
      this.hud.hideHoverLabel();
    }
  }

  /** While a cat is hovered, moving the pointer back and forth pets it. */
  private updatePointerInteraction(): void {
    const hovered = this.hovered;
    const wiggle = this.wiggle;
    this.wiggle = 0;
    if (!hovered || wiggle <= 1.5) return;
    hovered.pet(clamp(wiggle / 16, 0.15, 1));
  }

  private pickCat(clientX: number, clientY: number): Cat | null {
    if (this.cats.length === 0) return null;
    this.pointerNdc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera.camera);
    const hits = this.raycaster.intersectObjects(
      this.cats.map((cat) => cat.group),
      true,
    );
    for (const hit of hits) {
      let node: Object3D | null = hit.object;
      while (node) {
        const cat = node.userData.cat as Cat | undefined;
        if (cat) return cat;
        node = node.parent;
      }
    }
    return null;
  }

  private groundPoint(clientX: number, clientY: number): Vector3 | null {
    this.pointerNdc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera.camera);
    const hit = this.raycaster.ray.intersectPlane(GROUND_PLANE, this.hitPoint);
    if (!hit) return null;
    const flat = Math.hypot(hit.x, hit.z);
    const limit = this.bounds * 0.92;
    if (flat > limit) hit.multiplyScalar(limit / flat);
    return hit.clone();
  }

  private handleClick(clientX: number, clientY: number): void {
    const cat = this.pickCat(clientX, clientY);
    if (cat) {
      this.selectCat(cat);
      return;
    }

    const ground = this.groundPoint(clientX, clientY);
    if (!ground) return;

    if (this.tool === 'treat') {
      this.tossToy('treat', ground);
      this.hud.showToast('🐟 Treat tossed — someone will find it');
      return;
    }
    if (this.tool === 'yarn') {
      this.tossToy('yarn', ground);
      this.hud.showToast('🧶 Yarn launched — brace for zoomies');
      return;
    }

    // Clicking the rug nudges the nearest cat over for a visit.
    if (this.tool === 'pet') {
      let nearest: Cat | null = null;
      let distance = Infinity;
      for (const candidate of this.cats) {
        const d = candidate.position3.distanceTo(ground);
        if (d < distance) {
          distance = d;
          nearest = candidate;
        }
      }
      if (nearest && distance > 0.8) {
        nearest.callTo(ground);
        this.popups.above('🐾', new Vector3(ground.x, 0.5, ground.z), { color: '#e8a44f', scale: 0.34, life: 0.9 });
      } else if (distance <= 0.8 && nearest) {
        nearest.startle();
        this.popups.above('❤️', this.headTop(nearest), { scale: 0.36 });
      }
      this.deselect();
    }
  }

  private selectCat(cat: Cat): void {
    this.selected = cat;
    this.hud.showCat(cat);
    this.camera.track(this.focusPoint.copy(cat.position3).setY(0.45), 4.3);
    this.sound.click(0.05);
  }

  private deselect(): void {
    if (!this.selected) return;
    this.selected = null;
    this.hud.hideCat();
    if (!this.preview) this.camera.clearFocus();
  }

  /* ── HUD callbacks ────────────────────────────────────────────────── */

  cycleTime(): void {
    this.timeIndex = (this.timeIndex + 1) % PRESETS.length;
    this.timePhase = 0;
    const preset = PRESETS[this.timeIndex];
    this.hud.showToast(`${preset.emoji} ${preset.label}`);
  }

  toggleAuto(): boolean {
    this.autoCycle = !this.autoCycle;
    return this.autoCycle;
  }

  toggleSound(): boolean {
    const enabled = !this.sound.enabled;
    this.sound.unlock();
    this.sound.setEnabled(enabled);
    return enabled;
  }

  setTool(tool: ToolMode): void {
    this.tool = tool;
    if (tool === 'zoomies') {
      this.hud.markActiveTool('pet');
      this.tool = 'pet';
    }
  }

  newCat(): void {
    const rng = makeRng(Math.floor(Math.random() * 1e9));
    const traits = randomTraits(rng, { name: randomName(rng) });
    const angle = rng() * TAU;
    const radius = 0.8 + rng() * (this.bounds - 1.6);
    const cat = this.spawnCat(traits, new Vector3(Math.sin(angle) * radius, 0, Math.cos(angle) * radius), true);
    if (cat) {
      cat.startle();
      this.camera.notifyInteraction();
    }
  }

  napTime(): void {
    for (const cat of this.cats) cat.sleepNow();
    this.hud.showToast('😴 Nap time. The whole room is asleep.');
  }

  zoomies(): void {
    for (const cat of this.cats) cat.startZoomies();
    this.hud.showToast('⚡ ZOOMIES. Good luck.');
    this.sound.chirp();
  }

  creatorOpened(): void {
    this.deselect();
    if (!this.preview) {
      const traits = cloneTraits(this.previewTraits);
      this.preview = new Cat(traits, this, new Vector3(1.1, 0, 1.2));
      this.preview.group.userData.cat = this.preview;
      this.preview.frozen = true;
      this.preview.sleepNow();
      this.scene.add(this.preview.group);
    }
    this.camera.focusOn(new Vector3(1.1, 0.5, 1.2), 3.8);
  }

  creatorClosed(): void {
    this.disposePreview();
    if (!this.selected) this.camera.clearFocus();
  }

  creatorChanged(traits: CatTraits): void {
    Object.assign(this.previewTraits, { ...traits, id: this.previewTraits.id });
    this.previewRebuild = 0.14;
    if (!this.preview) this.creatorOpened();
  }

  adopt(traits: CatTraits): void {
    const spawnPoint = this.preview ? this.preview.position3.clone() : new Vector3(1.1, 0, 1.2);
    this.disposePreview();

    const adopted = cloneTraits({ ...traits, id: this.previewTraits.id });
    const cat = this.spawnCat(adopted, spawnPoint, true);
    if (cat) {
      cat.startle();
      this.selectCat(cat);
    }
    this.hud.closeCreator();
    this.sound.chime();
  }

  randomize(): CatTraits {
    const rng = makeRng(Math.floor(Math.random() * 1e9));
    const next = randomTraits(rng, { name: randomName(rng) });
    Object.assign(next, { id: this.previewTraits.id });
    Object.assign(this.previewTraits, next);
    this.previewRebuild = 0.05;
    return next;
  }

  cardAction(action: CardAction): void {
    const cat = this.selected;
    if (action === 'close') {
      this.deselect();
      return;
    }
    if (!cat) return;
    if (action === 'pet') {
      cat.pet(1, 1.6);
      for (let i = 0; i < 3; i += 1) this.popups.above('❤️', this.headTop(cat), { scale: 0.4, life: 1.2 });
    } else if (action === 'nap') {
      cat.sleepNow();
      this.popups.above('Zzz', this.headTop(cat), { color: '#8fa5d8', scale: 0.42 });
    } else if (action === 'call') {
      cat.callTo(new Vector3(this.camera.target.x, 0, this.camera.target.z));
    }
  }

  /* ── preview helpers ──────────────────────────────────────────────── */

  private rebuildPreview(): void {
    if (!this.preview) return;
    const at = this.preview.position3.clone();
    const traits = cloneTraits(this.previewTraits);
    this.scene.remove(this.preview.group);
    this.preview.dispose();
    this.preview = new Cat(traits, this, at);
    this.preview.group.userData.cat = this.preview;
    this.preview.frozen = true;
    this.preview.sleepNow();
    this.scene.add(this.preview.group);
  }

  private disposePreview(): void {
    if (!this.preview) return;
    this.scene.remove(this.preview.group);
    this.preview.dispose();
    this.preview = null;
    this.previewRebuild = 0;
  }

  /* ── misc ─────────────────────────────────────────────────────────── */

  private resize(): void {
    const width = window.innerWidth;
    const height = Math.max(1, window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.camera.setAspect(width / height);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const cat of this.cats) cat.dispose();
    this.disposePreview();
    this.toySystem.clear();
    this.sound.dispose();
    this.renderer.dispose();
  }
}
