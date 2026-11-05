import { GameEventBus } from './bridge/events';
import { createGame } from './render/createGame';

const bus = new GameEventBus();

bus.on('sceneReady', () => {
  console.info('[bridge] render scene ready');
});

const game = createGame('game', bus);

// Handy for local smoke tests and console debugging.
(window as unknown as { coccodrilloGame?: unknown }).coccodrilloGame = game;

window.addEventListener('beforeunload', () => {
  game.destroy(true);
});
