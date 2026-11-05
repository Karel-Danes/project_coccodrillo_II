import { GameEventBus } from './bridge/events';
import { createGame } from './render/createGame';

const bus = new GameEventBus();

bus.on('sceneReady', () => {
  console.info('[bridge] render scene ready');
});

const parent = document.getElementById('game');
if (!parent) {
  throw new Error('Game parent element is missing');
}

/**
 * iOS Safari reports 100vh as the *large* viewport, so the bottom of the
 * 1280x768 canvas can hide behind the browser bars. Size the game parent to
 * the visible visual viewport instead, then let Phaser FIT the canvas inside.
 */
function fitGameParent(): void {
  const viewport = window.visualViewport;
  const width = Math.max(1, Math.floor(viewport?.width ?? window.innerWidth));
  const height = Math.max(
    1,
    Math.floor(viewport?.height ?? window.innerHeight),
  );

  parent!.style.width = `${width}px`;
  parent!.style.height = `${height}px`;
}

fitGameParent();
const game = createGame('game', bus);

function refreshGameScale(): void {
  fitGameParent();
  game.scale.refresh();
}

window.addEventListener('resize', refreshGameScale);
window.addEventListener('orientationchange', () => {
  window.setTimeout(refreshGameScale, 220);
});
window.visualViewport?.addEventListener('resize', refreshGameScale);
window.visualViewport?.addEventListener('scroll', refreshGameScale);
window.setTimeout(refreshGameScale, 320);

// Handy for local smoke tests and console debugging.
(window as unknown as { coccodrilloGame?: unknown }).coccodrilloGame = game;

window.addEventListener('beforeunload', () => {
  game.destroy(true);
});
