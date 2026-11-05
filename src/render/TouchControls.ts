import Phaser from 'phaser';
import type { InputState } from '../game/types';

type HoldKey =
  | 'left'
  | 'right'
  | 'jumpHeld'
  | 'attackHeld'
  | 'rangedHeld'
  | 'guardHeld';

export type TouchControlsOptions = {
  showMelee: boolean;
  showRanged: boolean;
  rangedLabel: string;
  extraLabel: string;
};

const IDLE_FILL = 0x0f141a;
const ACTIVE_FILL = 0x3a4a5c;
const FILL_ALPHA = 0.45;
const ACTIVE_ALPHA = 0.9;

function labelSize(key: HoldKey): string {
  switch (key) {
    case 'jumpHeld':
      return '22px';
    case 'attackHeld':
    case 'rangedHeld':
      return '18px';
    case 'guardHeld':
      return '15px';
    case 'left':
    case 'right':
      return '32px';
  }
}

/**
 * On-screen hold buttons for touch devices. Each button tracks its own
 * pointer ids, so walking and jumping can be held with separate fingers.
 * The extra/relic button is hidden until the artefact is collected.
 */
export class TouchControls {
  readonly input: InputState = {
    left: false,
    right: false,
    jumpHeld: false,
    attackHeld: false,
    rangedHeld: false,
    guardHeld: false,
  };

  private readonly objects: Array<
    Phaser.GameObjects.Shape | Phaser.GameObjects.Text
  > = [];
  private readonly cleanups: Array<() => void> = [];
  private guardObjects: Array<
    Phaser.GameObjects.Shape | Phaser.GameObjects.Text
  > = [];
  private guardCircle: Phaser.GameObjects.Arc | null = null;
  private guardUnlocked = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: TouchControlsOptions,
    private readonly layer?: Phaser.GameObjects.Layer,
  ) {}

  create(): void {
    // Mouse pointer + enough touch pointers for both thumbs and jump.
    this.scene.input.addPointer(3);

    const height = this.scene.scale.height;
    const width = this.scene.scale.width;
    const bottom = height - 116;

    // Movement on the left.
    this.createButton(165, bottom, 62, '◀', 'left');
    this.createButton(315, bottom, 62, '▶', 'right');

    // Combat buttons on the right, leaving room for the big jump target.
    if (this.options.showMelee && this.options.showRanged) {
      this.createButton(width - 445, bottom, 58, this.options.rangedLabel, 'rangedHeld');
      this.createButton(width - 290, bottom, 60, 'ATK', 'attackHeld');
    } else if (this.options.showMelee) {
      this.createButton(width - 290, bottom, 62, 'ATK', 'attackHeld');
    } else if (this.options.showRanged) {
      this.createButton(width - 290, bottom, 64, this.options.rangedLabel, 'rangedHeld');
    }

    const jumpX = width - 130;
    const jumpRadius = 74;
    this.createButton(jumpX, bottom, jumpRadius, 'JUMP', 'jumpHeld');

    // The earned relic action sits directly above the big jump button.
    const guardRadius = 58;
    const guard = this.createButton(
      jumpX,
      bottom - (jumpRadius + guardRadius),
      guardRadius,
      this.options.extraLabel,
      'guardHeld',
    );
    this.guardObjects = [guard.circle, guard.text];
    this.guardCircle = guard.circle;
    this.setGuardVisible(false);
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
    this.guardObjects = [];
    this.guardCircle = null;
  }

  setVisible(visible: boolean): void {
    for (const object of this.objects) {
      object.setVisible(visible);
    }

    if (!visible) {
      this.clearInput();
      return;
    }

    if (!this.guardUnlocked) {
      for (const object of this.guardObjects) {
        object.setVisible(false);
      }
    }
  }

  /** Called when the relic is picked up and the extra skill unlocks. */
  setGuardVisible(visible: boolean): void {
    const wasVisible = this.guardUnlocked;
    this.guardUnlocked = visible;

    if (!visible) {
      this.input.guardHeld = false;
      this.guardCircle?.setFillStyle(IDLE_FILL, FILL_ALPHA);
      for (const object of this.guardObjects) {
        object.setVisible(false);
      }
      return;
    }

    for (const object of this.guardObjects) {
      object.setVisible(true);
    }

    if (!wasVisible) {
      for (const object of this.guardObjects) {
        object.setScale(0.65).setAlpha(0);
      }
      this.scene.tweens.add({
        targets: this.guardObjects,
        scale: 1,
        alpha: 1,
        duration: 260,
        ease: 'Back.Out',
      });
    }
  }

  private clearInput(): void {
    this.input.left = false;
    this.input.right = false;
    this.input.jumpHeld = false;
    this.input.attackHeld = false;
    this.input.rangedHeld = false;
    this.input.guardHeld = false;
  }

  private createButton(
    x: number,
    y: number,
    radius: number,
    label: string,
    key: HoldKey,
  ): {
    circle: Phaser.GameObjects.Arc;
    text: Phaser.GameObjects.Text;
  } {
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
    this.layer?.add(circle);
    this.layer?.add(text);

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

    return { circle, text };
  }
}
