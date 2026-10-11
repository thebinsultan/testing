import './style.css';
import { Playground } from './Playground.ts';

const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
const loader = document.getElementById('loader');

function showFatal(message: string): void {
  if (!loader) return;
  loader.classList.remove('is-done');
  loader.innerHTML = `
    <div class="loader__inner" style="animation:none">
      <div class="loader__paw">🙀</div>
      <p style="max-width:26ch;text-align:center;line-height:1.5">${message}</p>
    </div>`;
}

if (!canvas) {
  showFatal('The canvas could not be found.');
} else {
  try {
    const playground = new Playground(canvas);
    playground.start();

    // Let the first frame settle before lifting the curtain.
    const revealNow = (): void => {
      playground.hud.hideLoader();
      playground.hud.showToast('🐾 Hover a cat and wiggle the mouse to pet it', 4.4);
      playground.hud.setHint('Drag to look around · click a cat to meet them · 🎨 to design one');
    };
    window.setTimeout(revealNow, 700);

    // Handy for tinkering from the console.
    (window as unknown as { purrlane?: Playground }).purrlane = playground;

    window.addEventListener('beforeunload', () => playground.dispose());
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message : String(error);
    showFatal(`WebGL could not start in this browser. ${detail}`);
  }
}
