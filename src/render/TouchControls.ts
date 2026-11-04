import Phaser from 'phaser';
import type { InputState } from '../game/types';

type HoldKey = 'left' | 'right' | 'jumpHeld' | 'attackHeld' | 'guardHeld';

const IDLE_FILL = 0x0f141a;
const ACTIVE_FILL = 0x3a4a5c;
const FILL_ALPHA = 0.45;
const ACTIVE_ALPHA = 0.9;

function labelSize(key: HoldKey): string {
  switch (key) {
    case 'jumpHeld':
      return '18px';
    case 'attackHeld':
      return '16px';
    case 'guardHeld':
      return '13px';
    case 'left':
    case 'right':
      return '26px';
  }
}

/**
 * On-screen hold buttons for touch devices. Each button tracks its own
 * pointer ids, so walking and jumping can be held with separate fingers.
 */
export class TouchControls {
  readonly input: InputState = {
    left: false,
    right: false,
    jumpHeld: false,
    attackHeld: false,
    guardHeld: false,
  };

  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly cleanups: Array<() => void> = [];

  constructor(private readonly scene: Phaser.Scene) {}

  create(): void {
    // Mouse pointer + three touch pointers: two thumbs and jump.
    this.scene.input.addPointer(3);

    const height = this.scene.scale.height;
    const width = this.scene.scale.width;
    // Keep the controls below the walking surface so they never cover the knight.
    const bottom = height - 64;

    // Movement on the left, combat and jump on the right.
    this.createButton(165, bottom, 48, '◀', 'left');
    this.createButton(315, bottom, 48, '▶', 'right');
    this.createButton(width - 390, bottom, 44, 'GUARD', 'guardHeld');
    this.createButton(width - 265, bottom, 48, 'ATK', 'attackHeld');
    this.createButton(width - 125, bottom, 58, 'JUMP', 'jumpHeld');
  }

  destroy(): void {
    for (const cleanup of this.cleanups) {
      cleanup();
    }
    for (const object of this.objects) {
      object.destroy();
    }
    this.cleanups.length = 0;
    this.objects.length = 0;
  }

  private createButton(
    x: number,
    y: number,
    radius: number,
    label: string,
    key: HoldKey,
  ): void {
    const circle = this.scene.add
      .circle(x, y, radius, IDLE_FILL, FILL_ALPHA)
      .setStrokeStyle(2, 0x6a7785, 0.9)
      .setScrollFactor(0)
      .setDepth(8)
      .setInteractive();

    const text = this.scene.add
      .text(x, y, label, {
        fontFamily: 'monospace',
        fontSize: labelSize(key),
        color: '#d7dde3',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(9);

    this.objects.push(circle, text);

    const pointers = new Set<number>();

    const press = (pointer: Phaser.Input.Pointer): void => {
      pointers.add(pointer.id);
      this.input[key] = true;
      circle.setFillStyle(ACTIVE_FILL, ACTIVE_ALPHA);
    };

    const release = (pointer: Phaser.Input.Pointer): void => {
      pointers.delete(pointer.id);
      if (pointers.size === 0) {
        this.input[key] = false;
        circle.setFillStyle(IDLE_FILL, FILL_ALPHA);
      }
    };

    circle.on('pointerdown', press);
    circle.on('pointerup', release);
    circle.on('pointerout', release);

    this.cleanups.push(() => {
      circle.off('pointerdown', press);
      circle.off('pointerup', release);
      circle.off('pointerout', release);
    });
  }
}
