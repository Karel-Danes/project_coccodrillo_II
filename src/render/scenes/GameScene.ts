import Phaser from 'phaser';
import type { GameEventBus } from '../../bridge/events';
import { FIXED_TIMESTEP_MS, FixedStepLoop } from '../../game/loop';

/**
 * Render layer only: drives the fixed-step clock, draws the current state.
 * Game rules live in `src/game/` and will be wired in through the bridge.
 */
export class GameScene extends Phaser.Scene {
  private readonly loop = new FixedStepLoop(FIXED_TIMESTEP_MS);
  private tick = 0;
  private debugText?: Phaser.GameObjects.Text;

  constructor(private readonly bus: GameEventBus) {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0d0f12');

    this.debugText = this.add
      .text(24, 24, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#8b98a5',
        lineSpacing: 6,
      })
      .setDepth(1);

    this.renderDebug();
    this.bus.emit('sceneReady');
  }

  override update(_time: number, delta: number): void {
    const steps = this.loop.advance(delta, () => this.step());

    // Repaint the overlay at render rate, not simulation rate.
    if (steps > 0) {
      this.renderDebug();
    }
  }

  /** One deterministic simulation step. Gameplay systems hook in here later. */
  private step(): void {
    this.tick += 1;
  }

  private renderDebug(): void {
    const hz = Math.round(1000 / FIXED_TIMESTEP_MS);
    this.debugText?.setText([
      'COCCODRILLO-II',
      `milestone 1 scaffold — fixed step ${hz} Hz`,
      `tick ${this.tick} · alpha ${this.loop.alpha.toFixed(2)}`,
    ]);
  }
}
