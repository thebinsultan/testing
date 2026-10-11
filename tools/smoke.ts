/**
 * Headless smoke test.
 *
 * There is no WebGL in Node, so this exercises everything that does *not*
 * need a GL context: procedural fur textures, rig construction, the cat brain
 * and animation solver, toys, props, popups, the palette blender and the orbit
 * camera maths. It catches NaN poses, undefined access and runaway state
 * machines long before a browser does.
 *
 *   npm run smoke
 */
import { strict as assert } from 'node:assert';

/* ── minimal DOM stubs (canvas drawing is recorded, never rendered) ───── */

interface StubGradient {
  addColorStop(offset: number, color: string): void;
}

class StubContext {
  canvas: { width: number; height: number } = { width: 0, height: 0 };
  fillStyle: unknown = '';
  strokeStyle: unknown = '';
  lineWidth = 1;
  font = '';
  textAlign = '';
  textBaseline = '';
  globalAlpha = 1;
  filter = 'none';
  readonly calls: Record<string, number> = {};

  createLinearGradient(): StubGradient {
    this.calls.createLinearGradient = (this.calls.createLinearGradient ?? 0) + 1;
    return { addColorStop: () => undefined };
  }

  createRadialGradient(): StubGradient {
    this.calls.createRadialGradient = (this.calls.createRadialGradient ?? 0) + 1;
    return { addColorStop: () => undefined };
  }

  measureText(text: string): { width: number } {
    return { width: text.length * 8 };
  }
}

const ctxProto = StubContext.prototype as unknown as Record<string, unknown>;
for (const method of [
  'save',
  'restore',
  'translate',
  'scale',
  'rotate',
  'beginPath',
  'closePath',
  'moveTo',
  'lineTo',
  'arc',
  'ellipse',
  'fill',
  'stroke',
  'fillRect',
  'strokeRect',
  'clearRect',
  'fillText',
  'strokeText',
  'clip',
  'setTransform',
  'drawImage',
  'quadraticCurveTo',
  'bezierCurveTo',
  'arcTo',
  'rect',
  'roundRect',
  'createPattern',
  'getImageData',
  'putImageData',
]) {
  ctxProto[method] = () => undefined;
}

function makeCanvas(): unknown {
  const context = new StubContext();
  return {
    width: 0,
    height: 0,
    style: {},
    getContext: (kind: string) => (kind === '2d' ? context : null),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
}

const listeners: Record<string, unknown> = {};
const windowStub = {
  devicePixelRatio: 1,
  innerWidth: 1440,
  innerHeight: 900,
  addEventListener: (name: string, handler: unknown) => {
    listeners[name] = handler;
  },
  removeEventListener: () => undefined,
  matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  requestAnimationFrame: (cb: (t: number) => void) => setTimeout(() => cb(performance.now()), 16) as unknown as number,
  cancelAnimationFrame: () => undefined,
  setTimeout,
  clearTimeout,
  AudioContext: undefined,
};

const documentStub = {
  createElement: (tag: string) => (tag === 'canvas' ? makeCanvas() : { style: {}, appendChild: () => undefined }),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  body: { appendChild: () => undefined },
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  hidden: false,
};

(globalThis as unknown as Record<string, unknown>).window = windowStub;
(globalThis as unknown as Record<string, unknown>).document = documentStub;
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node-smoke-test', maxTouchPoints: 1 },
    configurable: true,
  });
} catch {
  /* Node already exposes a read-only navigator — that is fine. */
}
(globalThis as unknown as Record<string, unknown>).HTMLCanvasElement = class {};

/* ── the actual test ──────────────────────────────────────────────────── */

const { Cat } = await import('../src/cats/Cat.ts');
const { createCatRig, solveLegAngle } = await import('../src/cats/rig.ts');
const { furTextures } = await import('../src/cats/fur.ts');
const { defaultTraits, randomTraits } = await import('../src/cats/traits.ts');
const { personalityOf } = await import('../src/cats/names.ts');
const { makeRng } = await import('../src/core/mathx.ts');
const { blendPresets, createMix, PRESETS } = await import('../src/core/palette.ts');
const { OrbitCamera } = await import('../src/core/camera.ts');
const { Ground } = await import('../src/world/Ground.ts');
const { Props } = await import('../src/world/Props.ts');
const { Motes } = await import('../src/world/Motes.ts');
const { Popups } = await import('../src/world/Popups.ts');
const { ToySystem } = await import('../src/world/toys.ts');
const { mergeParts } = await import('../src/core/geo.ts');
const { SphereGeometry, Vector3 } = await import('three');

const checks: string[] = [];
const check = (label: string, fn: () => void): void => {
  fn();
  checks.push(label);
};

/* geometry merging ----------------------------------------------------- */
check('mergeParts concatenates non-indexed parts', () => {
  const merged = mergeParts([
    { geometry: new SphereGeometry(1, 6, 4) },
    { geometry: new SphereGeometry(1, 6, 4), position: [1, 0, 0], scale: [0.5, 0.5, 0.5], rotation: [0.2, 0.3, 0.4] },
  ]);
  const position = merged.getAttribute('position');
  assert.ok(position.count > 0, 'merged geometry has vertices');
  const box = merged.boundingBox;
  assert.ok(box, 'bounding box computed');
});

/* palette -------------------------------------------------------------- */
check('palette presets blend without NaN', () => {
  const mix = createMix();
  for (let i = 0; i < PRESETS.length; i += 1) {
    for (let t = 0; t <= 1; t += 0.1) {
      blendPresets(PRESETS[i], PRESETS[(i + 1) % PRESETS.length], t, mix);
      assert.ok(Number.isFinite(mix.sunIntensity), 'sunIntensity finite');
      assert.ok(mix.rug.r >= 0 && mix.rug.r <= 1, 'rug colour in range');
      assert.ok(Number.isFinite(mix.sunAzimuth), 'azimuth finite');
    }
  }
});

/* fur textures --------------------------------------------------------- */
check('fur textures are generated for every pattern', () => {
  const rng = makeRng(4242);
  for (let i = 0; i < 30; i += 1) {
    const traits = randomTraits(rng);
    const textures = furTextures(traits);
    assert.ok(textures.map, 'map texture exists');
    assert.ok(textures.plain, 'plain texture exists');
  }
  const again = furTextures(randomTraits(makeRng(4242)));
  assert.ok(again.map, 'textures are cached and reusable');
});

/* rig + ground solver -------------------------------------------------- */
check('rig solves leg angles that stay above the floor', () => {
  const traits = defaultTraits();
  const rig = createCatRig(traits);
  assert.ok(rig.legs.length === 4, 'four legs');
  assert.ok(rig.tail.length === 5, 'five tail segments');
  const leg = rig.legs[0];
  for (let hipHeight = 0.05; hipHeight <= 0.7; hipHeight += 0.05) {
    const angle = solveLegAngle(hipHeight, leg.l1, leg.l2, -0.2, 0.016, 0);
    assert.ok(Number.isFinite(angle), 'angle finite');
    assert.ok(angle >= -0.01, 'angle never folds the wrong way');
  }
});

/* camera --------------------------------------------------------------- */
check('orbit camera stays sane through long interaction', () => {
  const camera = new OrbitCamera(16 / 9);
  for (let i = 0; i < 400; i += 1) {
    camera.rotate(Math.sin(i) * 12, Math.cos(i * 0.7) * 9);
    camera.zoom(Math.sin(i * 0.3) * 200);
    if (i % 20 === 0) camera.pan(Math.sin(i) * 40, Math.cos(i) * 40);
    camera.update(1 / 60);
    const { position } = camera.camera;
    assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z), 'camera finite');
    assert.ok(position.y > 0, 'camera stays above the floor');
  }
  camera.focusOn(new Vector3(2, 0.5, -1), 4);
  for (let i = 0; i < 120; i += 1) camera.update(1 / 60);
  assert.ok(camera.target.distanceTo(new Vector3(2, 0.5, -1)) < 1.5, 'camera eases towards the focus point');
});

/* world props ---------------------------------------------------------- */
check('room, props, motes and popups initialise and update', () => {
  const ground = new Ground(4.4);
  const props = new Props(4.4);
  const motes = new Motes(32);
  const popups = new Popups();
  const mix = createMix();
  blendPresets(PRESETS[1], PRESETS[2], 0.4, mix);
  ground.update(mix, { x: 1, z: 2 });
  motes.update(mix, 12.5);
  props.update(1 / 60);
  assert.ok(props.obstacles.length >= 4, 'props register obstacles');
  for (let i = 0; i < 40; i += 1) popups.update(1 / 60);
  popups.above('❤️', new Vector3(0, 1, 0));
  popups.above('Zzz', new Vector3(0, 1, 0), { color: '#8fa5d8', life: 2 });
  for (let i = 0; i < 200; i += 1) popups.update(1 / 60);
});

/* cats ----------------------------------------------------------------- */
check('cats survive two simulated minutes of cat life', () => {
  const rng = makeRng(99);
  const toySystem = new ToySystem();
  const cats: InstanceType<typeof Cat>[] = [];
  const world = {
    bounds: 4.4,
    elapsed: 0,
    sunPoint: new Vector3(1.5, 0.05, -1),
    cats,
    obstacles: [{ x: -3, z: -2.6, radius: 1.1 }, { x: 2.9, z: -2.4, radius: 1 }],
    get toys() {
      return toySystem.toys;
    },
    onCatEvent: () => undefined,
    claimToy: (toy: { claimedBy: unknown }, cat: unknown) => {
      toy.claimedBy = cat;
    },
    consumeToy: () => undefined,
  };

  for (let i = 0; i < 8; i += 1) {
    const traits = randomTraits(rng, { name: `Cat ${i}` });
    const angle = (i / 8) * Math.PI * 2;
    const cat = new Cat(traits, world as never, new Vector3(Math.sin(angle) * 2, 0, Math.cos(angle) * 2));
    cats.push(cat);
  }

  const dt = 1 / 60;
  let frames = 0;
  for (let step = 0; step < 60 * 120; step += 1) {
    world.elapsed += dt;
    for (const cat of cats) cat.update(dt);
    toySystem.update(dt, world.elapsed, world.bounds);
    frames += 1;

    // occasionally meddle, like a real visitor would
    if (step % 240 === 0) {
      toySystem.spawn(step % 480 === 0 ? 'treat' : 'yarn', new Vector3(1, 1.5, 1), new Vector3(0.4, 0, 0.2), world.bounds);
    }
    if (step % 360 === 0) cats[step % cats.length].pet(1, 0.5);
    if (step % 900 === 0) cats[(step / 900) % cats.length].startZoomies();

    for (const cat of cats) {
      const p = cat.position3;
      assert.ok(
        Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z),
        `${cat.traits.name} position stayed finite at frame ${frames}`,
      );
      assert.ok(Math.hypot(p.x, p.z) <= world.bounds, `${cat.traits.name} stayed on the rug`);
      assert.ok(cat.rest >= 0 && cat.rest <= 1.2, 'rest amount in range');
      assert.ok(cat.purr >= 0 && cat.purr <= 1, 'purr amount in range');
      assert.ok(Number.isFinite(cat.rig.body.position.y), 'body height finite');
      assert.ok(cat.rig.body.position.y > -0.05, 'body never sinks through the floor');
    }
  }
  assert.ok(toySystem.toys.length <= 30, 'toys are cleaned up');
});

/* personality ---------------------------------------------------------- */
check('personality is stable per cat and always has stats', () => {
  const traits = defaultTraits();
  const a = personalityOf(traits);
  const b = personalityOf(traits);
  assert.deepEqual(
    a.stats.map((s) => s.value),
    b.stats.map((s) => s.value),
    'same seed gives the same personality',
  );
  assert.ok(a.bio.length > 20, 'has a bio');
  assert.equal(a.stats.length, 4, 'four stat meters');
});

/* toys ----------------------------------------------------------------- */
check('toys bounce, roll and expire', () => {
  const toys = new ToySystem();
  const toy = toys.spawn('yarn', new Vector3(2, 1.5, 2), new Vector3(1, 0, 0.5), 4.4);
  for (let i = 0; i < 60 * 80; i += 1) {
    toys.update(1 / 60, i / 60, 4.4);
    assert.ok(Number.isFinite(toy.position.y), 'toy height finite');
    assert.ok(toy.position.y >= -0.01, 'toy never falls through the floor');
    assert.ok(Math.hypot(toy.position.x, toy.position.z) <= 4.4, 'toy stays on the rug');
  }
  assert.equal(toys.toys.length, 0, 'toys clean themselves up after their lifetime');
});

console.log(`\n✔ ${checks.length} smoke checks passed`);
for (const label of checks) console.log(`  • ${label}`);
