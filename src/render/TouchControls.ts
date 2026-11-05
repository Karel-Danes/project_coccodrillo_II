import Phaser from 'phaser';
import type { InputState } from '../game/types';

type HoldKey =
  | 'left'
  | 'right'
  | 'jumpHeld'
  | 'attackHeld'
  | 'rangedHeld'
  | 'guardHeld'
  | 'powerHeld';

export type TouchRangedMode = 'none' | 'side' | 'overJump';

export type TouchControlsOptions = {
  showMelee: boolean;
  ranged: TouchRangedMode;
  rangedLabel: string;
  extraLabel: string;
  /** Mage-only charged power button, revealed with the relic. */
  power: boolean;
};

const IDLE_FILL = 0x0f141a;
const ACTIVE_FILL = 0x3a4a5c;
const FILL_ALPHA = 0.45;
const ACTIVE_ALPHA = 0.9;

function labelSize(key: HoldKey): string {
  switch (key) {
    case 'jumpHeld':
      return '26px';
    case 'attackHeld':
    case 'rangedHeld':
      return '21px';
    case 'powerHeld':
      return '17px';
    case 'guardHeld':
      return '17px';
    case 'left':
    case 'right':
      return '38px';
  }
}

/**
 * On-screen hold buttons for touch devices. Each button tracks its own
 * pointer ids, so walking and jumping can be held with separate fingers.
 * The extra/relic button is hidden until the artefact is collected; the
 * Orc's throw button replaces it only while berserk is burning.
 */
export class TouchControls {
  readonly input: InputState = {
    left: false,
    right: false,
    jumpHeld: false,
    attackHeld: false,
    rangedHeld: false,
    guardHeld: false,
    powerHeld: false,
  };

  private readonly objects: Array<
    Phaser.GameObjects.Shape | Phaser.GameObjects.Text
  > = [];
  private readonly cleanups: Array<() => void> = [];
  private readonly pointerReleases: Array<
    (pointer: Phaser.Input.Pointer) => void
  > = [];
  private readonly clearHandlers: Array<() => void> = [];
  private guardObjects: Array<
    Phaser.GameObjects.Shape | Phaser.GameObjects.Text
  > = [];
  private rangedObjects: Array<
    Phaser.GameObjects.Shape | Phaser.GameObjects.Text
  > = [];
  private powerObjects: Array<
    Phaser.GameObjects.Shape | Phaser.GameObjects.Text
  > = [];
  private guardCircle: Phaser.GameObjects.Arc | null = null;
  private extraUnlocked = false;
  private throwVisible = false;
  private jumpTapQueued = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: TouchControlsOptions,
    private readonly layer?: Phaser.GameObjects.Layer,
  ) {}

  create(): void {
    // Mouse pointer + enough touch pointers for both thumbs and jump.
    this.scene.input.addPointer(3);
    this.scene.input.on('pointerup', this.releasePointer, this);
    this.scene.input.on('pointerupoutside', this.releasePointer, this);
    window.addEventListener('blur', this.clearAll);
    window.addEventListener('pointercancel', this.clearAll);
    window.addEventListener('touchcancel', this.clearAll);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    const height = this.scene.scale.height;
    const width = this.scene.scale.width;
    const bottom = height - 150;

    // Movement on the left.
    this.createButton(180, bottom, 78, '◀', 'left');
    this.createButton(360, bottom, 78, '▶', 'right');

    const sideRanged =
      this.options.ranged === 'side' && !this.options.showMelee;

    // Combat buttons on the right, leaving room for the big jump target.
    if (sideRanged) {
      this.createButton(width - 330, bottom, 78, this.options.rangedLabel, 'rangedHeld');
    } else if (this.options.showMelee) {
      this.createButton(width - 330, bottom, 76, 'ATK', 'attackHeld');
    }

    if (this.options.power) {
      const power = this.createButton(
        width - 500,
        bottom,
        70,
        'POWER',
        'powerHeld',
      );
      this.powerObjects = [power.circle, power.text];
    }

    const jumpX = width - 125;
    const jumpRadius = 92;
    this.createButton(jumpX, bottom, jumpRadius, 'JUMP', 'jumpHeld');

    // The earned relic action sits directly above the big jump button.
    const guardRadius = 72;
    const guard = this.createButton(
      jumpX,
      bottom - (jumpRadius + guardRadius + 6),
      guardRadius,
      this.options.extraLabel,
      'guardHeld',
    );
    this.guardObjects = [guard.circle, guard.text];
    this.guardCircle = guard.circle;

    // The Orc's throw shares that slot and appears only during berserk.
    if (this.options.ranged === 'overJump') {
      const thrown = this.createButton(
        jumpX,
        bottom - (jumpRadius + guardRadius + 6),
        guardRadius,
        this.options.rangedLabel,
        'rangedHeld',
      );
      this.rangedObjects = [thrown.circle, thrown.text];
    }

    this.syncAuxiliaryButtons(false);
  }

  destroy(): void {
    this.scene.input.off('pointerup', this.releasePointer, this);
    this.scene.input.off('pointerupoutside', this.releasePointer, this);
    window.removeEventListener('blur', this.clearAll);
    window.removeEventListener('pointercancel', this.clearAll);
    window.removeEventListener('touchcancel', this.clearAll);
    document.removeEventListener(
      'visibilitychange',
      this.onVisibilityChange,
    );
    for (const cleanup of this.cleanups) {
      cleanup();
    }
    for (const object of this.objects) {
      object.destroy();
    }
    this.cleanups.length = 0;
    this.objects.length = 0;
    this.guardObjects = [];
    this.rangedObjects = [];
    this.powerObjects = [];
    this.pointerReleases.length = 0;
    this.clearHandlers.length = 0;
    this.guardCircle = null;
  }

  setVisible(visible: boolean): void {
    for (const object of this.objects) {
      object.setVisible(visible);
    }

    if (!visible) {
      this.clearAll();
      return;
    }

    this.syncAuxiliaryButtons(false);
  }

  /** Called when the relic is picked up and the extra skill unlocks. */
  setGuardVisible(visible: boolean): void {
    const wasVisible = this.extraUnlocked;
    this.extraUnlocked = visible;

    if (!visible) {
      this.input.guardHeld = false;
      this.guardCircle?.setFillStyle(IDLE_FILL, FILL_ALPHA);
    }

    this.syncAuxiliaryButtons(visible && !wasVisible);
  }

  /** Shows the Orc's throw button only while berserk is active. */
  setThrowVisible(visible: boolean): void {
    if (this.options.ranged !== 'overJump' || visible === this.throwVisible) {
      return;
    }
    this.throwVisible = visible;
    if (!visible) {
      this.input.rangedHeld = false;
    }
    this.syncAuxiliaryButtons(false);
  }

  /** True once after the jump button is pressed, even on a very short tap. */
  consumeJumpTap(): boolean {
    const queued = this.jumpTapQueued;
    this.jumpTapQueued = false;
    return queued;
  }

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.clearAll();
    }
  };

  private releasePointer(pointer: Phaser.Input.Pointer): void {
    for (const release of this.pointerReleases) {
      release(pointer);
    }
  }

  private clearAll = (): void => {
    this.input.left = false;
    this.input.right = false;
    this.input.jumpHeld = false;
    this.input.attackHeld = false;
    this.input.rangedHeld = false;
    this.input.guardHeld = false;
    this.input.powerHeld = false;
    this.jumpTapQueued = false;
    for (const clear of this.clearHandlers) {
      clear();
    }
  };

  private syncAuxiliaryButtons(animate: boolean): void {
    const showExtra = this.extraUnlocked && !this.throwVisible;
    const showPower =
      this.options.power && this.extraUnlocked && !this.throwVisible;
    for (const object of this.guardObjects) {
      object.setVisible(showExtra);
    }
    for (const object of this.rangedObjects) {
      object.setVisible(this.throwVisible);
    }
    for (const object of this.powerObjects) {
      object.setVisible(showPower);
    }

    if (!animate || !showExtra) {
      return;
    }

    for (const object of [...this.guardObjects, ...this.powerObjects]) {
      object.setScale(0.65).setAlpha(0);
    }
    this.scene.tweens.add({
      targets: [...this.guardObjects, ...this.powerObjects],
      scale: 1,
      alpha: 1,
      duration: 260,
      ease: 'Back.Out',
    });
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
      if (key === 'jumpHeld') {
        this.jumpTapQueued = true;
      }
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
    circle.on('pointerupoutside', release);
    circle.on('pointerout', release);
    this.pointerReleases.push(release);
    this.clearHandlers.push(() => {
      pointers.clear();
      circle.setFillStyle(IDLE_FILL, FILL_ALPHA);
    });

    this.cleanups.push(() => {
      circle.off('pointerdown', press);
      circle.off('pointerup', release);
      circle.off('pointerupoutside', release);
      circle.off('pointerout', release);
    });

    return { circle, text };
  }
}
