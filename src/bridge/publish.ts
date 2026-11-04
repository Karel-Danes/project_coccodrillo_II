import type { GameEvent } from '../game/simulation';
import type { GameEventBus } from './events';

/**
 * Forwards pure game events onto the typed render bus. Kept in the bridge
 * so neither the game core nor the Phaser scene needs to know the mapping.
 */
export function publishEvents(
  bus: GameEventBus,
  events: readonly GameEvent[],
): void {
  for (const event of events) {
    switch (event.type) {
      case 'playerMoved':
        bus.emit('playerMoved', event.player);
        break;
      case 'playerDied':
        bus.emit('playerDied', event.reason);
        break;
      case 'playerHurt':
        bus.emit('playerHurt', event.hp);
        break;
      case 'enemyHit':
        bus.emit('enemyHit', event.kind);
        break;
      case 'enemyDied':
        bus.emit('enemyDied', event.kind);
        break;
      case 'attackBlocked':
        bus.emit('attackBlocked');
        break;
      case 'pickupCollected':
        bus.emit(
          'pickupCollected',
          event.kind,
          event.hp,
          event.coins,
        );
        break;
      case 'bossIntro':
        bus.emit('bossIntro', event.kind);
        break;
      case 'bossDefeated':
        bus.emit('bossDefeated');
        break;
    }
  }
}
