/**
 * Temporary DOM wiring check (requires `npm i --no-save jsdom` to run).
 * Loads the real index.html and drives the HUD to make sure every element id
 * exists and every control calls the right callback.
 */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { strict as assert } from 'node:assert';

const html = readFileSync(`${process.cwd()}/index.html`, 'utf8');
const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'https://localhost/' });

/* canvas 2d stub — the HUD never draws, but the cat card/pill do not either */
const proto = dom.window.HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
proto.getContext = (kind: string) =>
  kind === '2d'
    ? new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
              return () => ({ addColorStop: () => undefined });
            }
            return () => undefined;
          },
          set: () => true,
        },
      )
    : null;

const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.HTMLCanvasElement = dom.window.HTMLCanvasElement;
g.HTMLElement = dom.window.HTMLElement;
g.Event = dom.window.Event;
g.MouseEvent = dom.window.MouseEvent;
g.AudioContext = undefined;

const { HUD } = await import('../src/ui/HUD.ts');
const { defaultTraits, randomTraits } = await import('../src/cats/traits.ts');
const { makeRng } = await import('../src/core/mathx.ts');

const seen: string[] = [];
const callbacks = {
  cycleTime: () => seen.push('cycleTime'),
  toggleAuto: () => (seen.push('toggleAuto'), true),
  toggleSound: () => (seen.push('toggleSound'), false),
  setTool: (tool: string) => seen.push(`setTool:${tool}`),
  newCat: () => seen.push('newCat'),
  napTime: () => seen.push('napTime'),
  zoomies: () => seen.push('zoomies'),
  creatorChanged: () => seen.push('creatorChanged'),
  creatorOpened: () => seen.push('creatorOpened'),
  creatorClosed: () => seen.push('creatorClosed'),
  adopt: () => seen.push('adopt'),
  randomize: () => {
    seen.push('randomize');
    return randomTraits(makeRng(7), { name: 'Random' });
  },
  cardAction: (action: string) => seen.push(`cardAction:${action}`),
};

const hud = new HUD(callbacks as never, defaultTraits());
const document = dom.window.document;
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const click = (element: HTMLElement) => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

/* every control exists and is wired */
click($('btnTime'));
click($('btnAuto'));
click($('btnSound'));
click($('btnHelp'));
click($('helpClose'));
click($('panelClose'));
click($('cardClose'));
for (const tool of Array.from(document.querySelectorAll('.dock .tool')) as HTMLElement[]) {
  click(tool);
}
for (const button of Array.from(document.querySelectorAll('[data-card]')) as HTMLElement[]) {
  click(button);
}
assert.ok(seen.includes('cycleTime'), 'time chip wired');
assert.ok(seen.includes('toggleAuto'), 'auto toggle wired');
assert.ok(seen.includes('toggleSound'), 'sound toggle wired');
assert.ok(seen.includes('newCat') && seen.includes('napTime') && seen.includes('zoomies'), 'dock actions wired');
assert.ok(seen.some((s) => s.startsWith('setTool:')), 'tools wired');
assert.ok(seen.includes('cardAction:pet') && seen.includes('cardAction:nap') && seen.includes('cardAction:call'), 'card buttons wired');

/* creator panel: inputs feed the traits draft */
const name = $('inName') as HTMLInputElement;
name.value = 'Pixel';
name.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
const pattern = $('inPattern') as HTMLSelectElement;
pattern.value = 'calico';
pattern.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
const size = $('inSize') as HTMLInputElement;
size.value = '1.25';
size.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
assert.ok(seen.includes('creatorChanged'), 'creator edits bubble up');
assert.equal(($('outSize') as HTMLElement).textContent, '1.25×', 'slider readout updates');

click($('btnDice'));
click($('btnRandom'));
assert.ok(seen.includes('randomize'), 'surprise me wired');
assert.equal(($('inName') as HTMLInputElement).value, 'Random', 'randomize fills the inputs');
click($('btnAdopt'));
assert.ok(seen.includes('adopt'), 'adopt wired');

/* opening/closing the creator fires its lifecycle callbacks */
hud.openCreator();
hud.closeCreator();
assert.ok(seen.includes('creatorOpened') && seen.includes('creatorClosed'), 'creator lifecycle wired');

/* cat card renders live stats */
const { Cat } = await import('../src/cats/Cat.ts');
const { Vector3 } = await import('three');
const catWorld = {
  bounds: 4.4,
  elapsed: 0,
  sunPoint: new Vector3(),
  cats: [] as unknown[],
  obstacles: [],
  toys: [],
  onCatEvent: () => undefined,
  claimToy: () => undefined,
  consumeToy: () => undefined,
};
const cat = new Cat(defaultTraits(), catWorld as never, new Vector3());
(catWorld.cats as unknown[]).push(cat);
hud.showCat(cat as never);
assert.equal($('cardName').textContent, cat.traits.name, 'card shows the name');
assert.equal($('cardStats').children.length, 4, 'card shows four meters');
hud.refreshCat();
hud.hideCat();

/* toasts, stats and hover labels */
hud.showToast('hello');
hud.setStats(3, 12, 2);
assert.ok(($('statline') as HTMLElement).textContent?.includes('12'), 'statline renders');
hud.showHoverLabel('Mochi · pet me', 120, 90);
hud.hideHoverLabel();
hud.setTime('Dusk', '🌆');
assert.equal(($('timeLabel') as HTMLElement).textContent, 'Dusk', 'time chip updates');
hud.hideLoader();

console.log('✔ HUD wiring check passed');
console.log(`  callbacks fired: ${Array.from(new Set(seen)).join(', ')}`);
