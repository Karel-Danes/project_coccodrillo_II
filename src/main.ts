import { GameEventBus } from './bridge/events';
import { createGame } from './render/createGame';

const bus = new GameEventBus();

bus.on('sceneReady', () => {
  console.info('[bridge] render scene ready');
});

const game = createGame('game', bus);

window.addEventListener('beforeunload', () => {
  game.destroy(true);
});
