import { clamp } from '../core/mathx.ts';
import type { Cat } from '../cats/Cat.ts';
import type { CatPattern, CatTraits } from '../cats/traits.ts';

export type ToolMode = 'pet' | 'treat' | 'yarn' | 'zoomies';
export type CardAction = 'pet' | 'nap' | 'call' | 'close';

export interface HudCallbacks {
  cycleTime(): void;
  toggleAuto(): boolean;
  toggleSound(): boolean;
  setTool(tool: ToolMode): void;
  newCat(): void;
  napTime(): void;
  zoomies(): void;
  creatorChanged(traits: CatTraits): void;
  creatorOpened(): void;
  creatorClosed(): void;
  adopt(traits: CatTraits): void;
  randomize(traits: CatTraits): CatTraits;
  cardAction(action: CardAction): void;
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

const hexToNumber = (value: string): number => Number.parseInt(value.replace('#', ''), 16);
const numberToHex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

/**
 * All of the DOM interface lives here: the top bar, the cat card, the creator
 * panel, the dock, toasts and the loader.
 */
export class HUD {
  private readonly timeLabel = required<HTMLSpanElement>('timeLabel');
  private readonly timeEmoji = required<HTMLSpanElement>('timeEmoji');
  private readonly autoButton = required<HTMLButtonElement>('btnAuto');
  private readonly soundButton = required<HTMLButtonElement>('btnSound');
  private readonly soundIcon = required<HTMLSpanElement>('soundIcon');
  private readonly helpButton = required<HTMLButtonElement>('btnHelp');
  private readonly help = required<HTMLElement>('help');
  private readonly helpClose = required<HTMLButtonElement>('helpClose');
  private readonly panel = required<HTMLElement>('panel');
  private readonly panelClose = required<HTMLButtonElement>('panelClose');
  private readonly panelButton = required<HTMLButtonElement>('btnPanel');
  private readonly card = required<HTMLElement>('catCard');
  private readonly cardClose = required<HTMLButtonElement>('cardClose');
  private readonly cardAvatar = required<HTMLDivElement>('cardAvatar');
  private readonly cardName = required<HTMLHeadingElement>('cardName');
  private readonly cardMood = required<HTMLParagraphElement>('cardMood');
  private readonly cardBio = required<HTMLParagraphElement>('cardBio');
  private readonly cardStats = required<HTMLUListElement>('cardStats');
  private readonly toast = required<HTMLDivElement>('toast');
  private readonly hint = required<HTMLParagraphElement>('hint');
  private readonly statline = required<HTMLDivElement>('statline');
  private readonly loader = required<HTMLDivElement>('loader');
  private readonly dock = document.querySelector<HTMLElement>('.dock') as HTMLElement;
  private readonly hoverLabel: HTMLDivElement;

  private readonly draft: CatTraits;
  private selected: Cat | null = null;
  private toastTimer = 0;

  constructor(private readonly callbacks: HudCallbacks, initialTraits: CatTraits) {
    this.draft = { ...initialTraits };

    this.hoverLabel = document.createElement('div');
    this.hoverLabel.className = 'pill-hint';
    document.body.appendChild(this.hoverLabel);

    this.bind();
    this.applyTraitsToInputs(this.draft);
    this.updateCreatorLabels();
  }

  /* ── wiring ───────────────────────────────────────────────────────── */

  private bind(): void {
    required<HTMLButtonElement>('btnTime').addEventListener('click', () => this.callbacks.cycleTime());
    this.autoButton.addEventListener('click', () => {
      const enabled = this.callbacks.toggleAuto();
      this.autoButton.setAttribute('aria-pressed', String(enabled));
      this.showToast(enabled ? '🕰️ Day cycle drifting on' : '🕰️ Day cycle paused');
    });
    this.soundButton.addEventListener('click', () => {
      const enabled = this.callbacks.toggleSound();
      this.soundIcon.textContent = enabled ? '🔊' : '🔇';
      this.soundButton.setAttribute('aria-pressed', String(enabled));
    });
    this.helpButton.addEventListener('click', () => this.help.classList.remove('hidden'));
    this.helpClose.addEventListener('click', () => this.help.classList.add('hidden'));
    this.help.addEventListener('click', (event) => {
      if (event.target === this.help) this.help.classList.add('hidden');
    });

    this.panelButton.addEventListener('click', () => this.toggleCreator());
    this.panelClose.addEventListener('click', () => this.closeCreator());

    this.cardClose.addEventListener('click', () => this.callbacks.cardAction('close'));
    for (const button of Array.from(this.card.querySelectorAll<HTMLButtonElement>('[data-card]'))) {
      button.addEventListener('click', () => {
        const action = button.dataset.card as CardAction | undefined;
        if (action) this.callbacks.cardAction(action);
      });
    }

    for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('.dock .tool'))) {
      button.addEventListener('click', () => {
        const tool = button.dataset.tool as ToolMode | undefined;
        const action = button.dataset.action;
        if (tool) {
          this.callbacks.setTool(tool);
          this.markActiveTool(tool === 'zoomies' ? 'pet' : tool);
          if (tool !== 'pet') {
            this.showToast(
              tool === 'treat'
                ? '🐟 Treat mode — click the rug to toss a snack'
                : tool === 'yarn'
                  ? '🧶 Yarn mode — click the rug to launch a ball'
                  : '⚡ Chaos engaged',
            );
          }
          if (tool === 'zoomies') this.callbacks.zoomies();
        } else if (action === 'new') {
          this.callbacks.newCat();
        } else if (action === 'nap') {
          this.callbacks.napTime();
        }
      });
    }

    this.bindCreatorInputs();
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.help.classList.add('hidden');
        this.closeCreator();
      }
      if (event.key === 'h') this.help.classList.toggle('hidden');
      if (event.key === ' ') {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT')) return;
        event.preventDefault();
        this.callbacks.cycleTime();
      }
    });
  }

  private bindCreatorInputs(): void {
    const name = required<HTMLInputElement>('inName');
    const pattern = required<HTMLSelectElement>('inPattern');
    const fur = required<HTMLInputElement>('inFur');
    const accent = required<HTMLInputElement>('inAccent');
    const eyes = required<HTMLInputElement>('inEyes');
    const size = required<HTMLInputElement>('inSize');
    const ears = required<HTMLInputElement>('inEars');
    const tail = required<HTMLInputElement>('inTail');
    const fluff = required<HTMLInputElement>('inFluff');
    const whiskers = required<HTMLInputElement>('inWhiskers');
    const energy = required<HTMLInputElement>('inEnergy');

    this.bindDraftInput('inName', () => {
      this.draft.name = name.value.trim() === '' ? 'Kitty' : name.value.slice(0, 14);
    });
    this.bindDraftInput('inPattern', () => {
      this.draft.pattern = pattern.value as CatPattern;
    });
    this.bindDraftInput('inFur', () => {
      this.draft.fur = hexToNumber(fur.value);
    });
    this.bindDraftInput('inAccent', () => {
      this.draft.accent = hexToNumber(accent.value);
    });
    this.bindDraftInput('inEyes', () => {
      this.draft.eye = hexToNumber(eyes.value);
    });
    this.bindDraftInput('inSize', () => {
      this.draft.size = Number(size.value);
    });
    this.bindDraftInput('inEars', () => {
      this.draft.ear = Number(ears.value);
    });
    this.bindDraftInput('inTail', () => {
      this.draft.tail = Number(tail.value);
    });
    this.bindDraftInput('inFluff', () => {
      this.draft.fluff = Number(fluff.value);
    });
    this.bindDraftInput('inWhiskers', () => {
      this.draft.whiskers = Number(whiskers.value);
    });
    this.bindDraftInput('inEnergy', () => {
      this.draft.energy = Number(energy.value);
    });

    required<HTMLButtonElement>('btnDice').addEventListener('click', () => {
      const names = ['Mochi', 'Biscuit', 'Momo', 'Waffles', 'Pumpkin', 'Suki', 'Noodle', 'Clover', 'Tofu', 'Boba'];
      name.value = names[Math.floor(Math.random() * names.length)];
      this.draft.name = name.value;
      this.emitDraft();
    });

    required<HTMLButtonElement>('btnRandom').addEventListener('click', () => {
      const next = this.callbacks.randomize(this.draft);
      Object.assign(this.draft, next);
      this.applyTraitsToInputs(this.draft);
      this.updateCreatorLabels();
      this.emitDraft();
    });

    required<HTMLButtonElement>('btnAdopt').addEventListener('click', () => {
      this.callbacks.adopt(this.draft);
    });
  }

  private bindDraftInput(id: string, apply: () => void): void {
    const element = required<HTMLInputElement | HTMLSelectElement>(id);
    element.addEventListener('input', () => {
      apply();
      this.updateCreatorLabels();
      this.emitDraft();
    });
  }

  private emitDraft(): void {
    this.callbacks.creatorChanged({ ...this.draft });
  }

  /* ── creator panel ────────────────────────────────────────────────── */

  openCreator(): void {
    if (!this.panel.classList.contains('hidden')) return;
    this.panel.classList.remove('hidden');
    this.callbacks.creatorOpened();
    this.showToast('🎨 Design a kitten, then adopt it');
  }

  closeCreator(): void {
    if (this.panel.classList.contains('hidden')) return;
    this.panel.classList.add('hidden');
    this.callbacks.creatorClosed();
  }

  toggleCreator(): void {
    if (this.panel.classList.contains('hidden')) this.openCreator();
    else this.closeCreator();
  }

  applyTraitsToInputs(traits: CatTraits): void {
    required<HTMLInputElement>('inName').value = traits.name;
    required<HTMLSelectElement>('inPattern').value = traits.pattern;
    required<HTMLInputElement>('inFur').value = numberToHex(traits.fur);
    required<HTMLInputElement>('inAccent').value = numberToHex(traits.accent);
    required<HTMLInputElement>('inEyes').value = numberToHex(traits.eye);
    required<HTMLInputElement>('inSize').value = traits.size.toFixed(2);
    required<HTMLInputElement>('inEars').value = traits.ear.toFixed(2);
    required<HTMLInputElement>('inTail').value = traits.tail.toFixed(2);
    required<HTMLInputElement>('inFluff').value = traits.fluff.toFixed(2);
    required<HTMLInputElement>('inWhiskers').value = String(traits.whiskers);
    required<HTMLInputElement>('inEnergy').value = traits.energy.toFixed(2);
    this.updateCreatorLabels();
  }

  private updateCreatorLabels(): void {
    required<HTMLElement>('outSize').textContent = `${this.draft.size.toFixed(2)}×`;
    required<HTMLElement>('outEars').textContent = `${this.draft.ear.toFixed(2)}×`;
    required<HTMLElement>('outTail').textContent = `${this.draft.tail.toFixed(2)}×`;
    required<HTMLElement>('outFluff').textContent = this.draft.fluff.toFixed(2);
    required<HTMLElement>('outWhiskers').textContent = String(this.draft.whiskers);
    required<HTMLElement>('outEnergy').textContent = this.draft.energy.toFixed(2);
  }

  /* ── tools, toasts, hints ─────────────────────────────────────────── */

  markActiveTool(tool: ToolMode): void {
    for (const button of Array.from(this.dock.querySelectorAll<HTMLButtonElement>('.tool'))) {
      button.classList.toggle('is-active', button.dataset.tool === tool);
    }
  }

  setTime(label: string, emoji: string): void {
    this.timeLabel.textContent = label;
    this.timeEmoji.textContent = emoji;
  }

  setStats(cats: number, pets: number, treats: number): void {
    this.statline.textContent = `${cats} ${cats === 1 ? 'cat' : 'cats'} · ${pets} ${pets === 1 ? 'pet' : 'pets'} given · ${treats} treats`;
  }

  setHint(text: string): void {
    if (this.hint.textContent === text) return;
    this.hint.textContent = text;
  }

  showToast(text: string, duration = 2.6): void {
    this.toast.textContent = text;
    this.toast.classList.add('is-on');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('is-on'), duration * 1000);
  }

  showHoverLabel(text: string, x: number, y: number): void {
    this.hoverLabel.textContent = text;
    this.hoverLabel.style.left = `${x}px`;
    this.hoverLabel.style.top = `${y}px`;
    this.hoverLabel.classList.add('is-on');
  }

  hideHoverLabel(): void {
    this.hoverLabel.classList.remove('is-on');
  }

  hideLoader(): void {
    this.loader.classList.add('is-done');
    window.setTimeout(() => this.loader.remove(), 900);
  }

  /* ── cat card ─────────────────────────────────────────────────────── */

  showCat(cat: Cat): void {
    this.selected = cat;
    this.refreshCat();
    this.card.classList.remove('hidden');
  }

  hideCat(): void {
    this.selected = null;
    this.card.classList.add('hidden');
  }

  /** Keep the open card in sync with live stats and mood. */
  refreshCat(): void {
    const cat = this.selected;
    if (!cat) return;

    this.cardName.textContent = cat.traits.name;
    this.cardMood.textContent = cat.moodLine;
    this.cardAvatar.textContent = cat.purr > 0.4 ? '😻' : cat.isAsleep ? '😴' : '🐱';
    this.cardBio.textContent = cat.personality.bio;

    this.cardStats.innerHTML = '';
    for (const stat of cat.personality.stats) {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = stat.label;
      const bar = document.createElement('span');
      bar.className = 'bar';
      const fill = document.createElement('i');
      fill.style.width = `${clamp(stat.value, 0, 1) * 100}%`;
      bar.appendChild(fill);
      const value = document.createElement('b');
      value.textContent = `${Math.round(clamp(stat.value, 0, 1) * 100)}`;
      li.append(label, bar, value);
      this.cardStats.appendChild(li);
    }
  }

  get hasSelection(): boolean {
    return this.selected !== null;
  }
}
