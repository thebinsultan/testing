# 🐾 Purrlane

A cozy, interactive **WebGL cat playground** — procedurally generated cats that
purr, nap, pounce, chase yarn and get the zoomies on a woven rug at golden hour.

Built with **TypeScript**, **Three.js** and **Vite**. No 3D models, no textures
and no audio files are downloaded — every cat, fur pattern, prop, sky and sound
is generated in code at runtime.

> **Live-ish preview:** `npm run dev` → http://localhost:5173
> **Deploy:** push to GitHub and import the repo on Vercel (zero config).

---

## ✨ What's in it

| | |
|---|---|
| 🐱 **Procedural cats** | Every kitten is built from primitives at runtime: body, cheeks, ears, tail chain, legs, whiskers, eyes. Size, ear shape, tail length and fluffiness are all trait-driven. |
| 🎨 **Cat Creator** | Design a cat — name, pattern (tabby, tuxedo, calico, spotted, siamese…), fur/accent/eye colours, size, ears, tail, fluff, whiskers and energy — then adopt it into the room. |
| 🧠 **Behaviour state machine** | Cats idle, walk, sit, groom, nap, play, eat and go on zoomies. They seek the sunbeam, watch each other, blink, twitch their ears and knead the rug. |
| 🖐️ **Petting** | Hover a cat and wiggle the pointer — it purrs, loaves up and closes its eyes. |
| 🧶 **Toys** | Toss treats (🐟) and yarn balls (🧶) with a click. Yarn rolls with physics and gets batted around; treats get eaten. |
| 🌇 **Day cycle** | Dawn → morning → golden hour → dusk → night. The sky shader, fog, lights, rug, dust motes, sunbeam patch and the whole UI palette blend continuously. |
| 🔊 **Synthesised audio** | Meows, chirps, landings, crunching, a purr bed that tracks the loudest cat, and an ambient pad — all built from WebAudio oscillators. |
| 📱 **Responsive** | Orbit / pinch-zoom / pan, mobile-friendly layout, `prefers-reduced-motion` aware, and it keeps running smoothly by sharing geometries and materials. |

## 🕹️ Controls

| Action | Input |
|---|---|
| Orbit the room | drag |
| Zoom | scroll / pinch |
| Pan | right-drag (or shift-drag) |
| Pet a cat | hover it and wiggle the pointer |
| Meet a cat | click it — the card shows mood + personality meters |
| Toss a treat / yarn | pick 🐟 or 🧶 in the dock, then click the rug |
| Call a cat over | with 🐾 selected, click the rug |
| Zoomies / nap time / new cat | dock buttons |
| Cycle the time of day | the ☀️ chip in the top bar (or press `space`) |
| Help | ❔ chip in the top bar (or press `h`) |

## 🚀 Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm run check      # type-check + headless smoke tests (see below)
```

Requires Node 20.19+ (Vite 7).

## ▲ Deploying to Vercel

`vercel.json` already pins the Vite preset, the build command, the output
directory and long-lived caching for hashed assets:

```jsonc
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

**Option A — dashboard:** push this repo to GitHub → *Add New… → Project* →
import the repository → Vercel detects Vite and deploys. Every push to `main`
redeploys automatically.

**Option B — CLI:**

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production deployment
```

No environment variables, no server, no database — it is a static site.

## 🗂️ Project structure

```
index.html              UI shell (top bar, cat card, creator panel, dock, loader)
src/
  main.ts               bootstrap + graceful WebGL failure message
  Playground.ts         owns the renderer, room, cats, input and HUD wiring
  style.css             cozy glass UI, responsive layout
  core/
    camera.ts           custom smooth orbit camera (drag/zoom/pan/follow)
    mathx.ts            clamp/damp/rng helpers, seeded PRNG
    palette.ts          5 mood presets + continuous blending → sky, lights, CSS vars
    geo.ts              dependency-free geometry merging (keeps draw calls low)
  cats/
    Cat.ts              geometry, materials, brain, animation states
    rig.ts              transform hierarchy + ground-contact leg solver
    traits.ts           the trait model + randomisation
    fur.ts              canvas-generated fur patterns, shadows, sprites
    names.ts            name pool, personalities, small talk
  world/
    Sky.ts              GLSL gradient sky with sun disc and stars
    Ground.ts           woven rug + floor + drifting sunbeam
    Props.ts            cat tower, tunnel, cushions, plant, yarn basket, box
    toys.ts             treats & yarn balls with toy physics
    Motes.ts            single-draw-call GPU dust motes
    Popups.ts           floating "Zzz" / "❤️" / "nom!" reactions
  audio/Sound.ts        WebAudio synthesised cat sounds
  ui/HUD.ts             every DOM interaction in one place
tools/
  smoke.ts              headless simulation test (cats, toys, palette, camera)
  hud-check.ts          jsdom test that drives the real index.html UI
```

## 🧪 Tests

There is no browser in CI here, so `npm run check` runs three things:

1. **`tsc --noEmit`** — strict type-checking across the whole project.
2. **`npm run smoke`** — builds a headless harness with a stubbed DOM/canvas and
   simulates **two minutes of cat life** (8 cats, toys, petting, zoomies),
   asserting nothing goes NaN, nothing leaves the rug, nothing sinks through
   the floor and toys clean themselves up.
3. **`npm run smoke:hud`** — loads the real `index.html` in jsdom and drives
   every control (time chip, tools, dock, cat card, creator panel) to make sure
   the markup and the UI code stay in sync.

## 🐈 How a cat is built

A cat is ~30 merged primitives hung off a `Group` hierarchy from `rig.ts`:

```
root (scaled by traits.size)
 └ body ................ y animates for rest/breathe/hop
    ├ spine → torso (3 blobs merged into 1 mesh), hips
    ├ neck → head → gaze → eyes (squashed to blink)
    │              ├ muzzle → nose + whisker line-segments
    │              └ ear pivots → outer ear + inner ear
    ├ 4 legs (hip → knee → paw), the paw gets the accent colour for socks
    └ tail chain of 5 pivots with a travelling wave
```

Legs use a small analytic solver (`solveLegAngle`) that keeps paws from
punching through the rug as the body lowers into a loaf — the same maths gives
the crouch when a cat is about to pounce.

## 📄 License

MIT — see [LICENSE](./LICENSE). Made for cat people. 🐾
