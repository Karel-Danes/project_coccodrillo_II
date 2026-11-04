import Phaser from 'phaser';
import type { GameEventBus } from '../../bridge/events';
import { publishEvents } from '../../bridge/publish';
import {
  ENEMY_HEIGHT,
  ENEMY_MAX_HP,
  ENEMY_WIDTH,
  getEnemyAttackPhase,
} from '../../game/enemy';
import { tileAt } from '../../game/level';
import { LEVEL_01 } from '../../game/levels';
import { FIXED_TIMESTEP_MS, FixedStepLoop } from '../../game/loop';
import {
  getAttackPhase,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
} from '../../game/player';
import { Simulation } from '../../game/simulation';
import type {
  DeathReason,
  Enemy,
  EnemyState,
  Level,
  Player,
  PlayerState,
} from '../../game/types';
import {
  KNIGHT_FEET_Y,
  KNIGHT_FRAME_HEIGHT,
  KNIGHT_SCALE,
} from '../assets/knight';
import {
  SKELETON_FEET_Y,
  SKELETON_FRAME_HEIGHT,
  SKELETON_SCALE,
  SKELETON_TEXTURES,
} from '../assets/skeleton';
import { loadKnightAssets, registerKnightAnimations } from '../knightAnimations';
import {
  loadSkeletonAssets,
  registerSkeletonAnimations,
} from '../skeletonAnimations';
import { createTerrainTexture, loadTerrainAssets } from '../terrain';
import { TouchControls } from '../TouchControls';

const COLORS = {
  spike: 0x9aa4ae,
} as const;

const PLAYER_ANIMATION: Record<PlayerState, string> = {
  idle: 'knight-idle',
  walk: 'knight-walk',
  jump: 'knight-jump',
  fall: 'knight-fall',
  attack: 'knight-attack',
  guard: 'knight-guard',
  die: 'knight-death',
};

const ENEMY_ANIMATION: Record<EnemyState, string> = {
  idle: 'skeleton-idle',
  walk: 'skeleton-walk',
  attack: 'skeleton-attack',
  hurt: 'skeleton-hurt',
  die: 'skeleton-death',
};

type EnemyView = {
  sprite: Phaser.GameObjects.Sprite;
  animation: string;
};

/**
 * Render layer only: draws the simulation state, feeds it input, and turns
 * domain events into presentation. All rules live in `src/game/`.
 */
export class GameScene extends Phaser.Scene {
  private readonly loop = new FixedStepLoop(FIXED_TIMESTEP_MS);
  private simulation = new Simulation(LEVEL_01);
  private tick = 0;

  private playerSprite!: Phaser.GameObjects.Sprite;
  private cameraFocus!: Phaser.GameObjects.Zone;
  private currentAnimation = '';
  private touchControls: TouchControls | null = null;

  private enemyViews: EnemyView[] = [];
  private enemyHud!: Phaser.GameObjects.Graphics;

  private guardFx!: Phaser.GameObjects.Graphics;
  private attackFx!: Phaser.GameObjects.Graphics;

  private debugText!: Phaser.GameObjects.Text;
  private keyboardHint!: Phaser.GameObjects.Text;
  private deathShade!: Phaser.GameObjects.Rectangle;
  private deathText!: Phaser.GameObjects.Text;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyX!: Phaser.Input.Keyboard.Key;
  private keyC!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;

  constructor(private readonly bus: GameEventBus) {
    super({ key: 'GameScene' });
  }

  preload(): void {
    loadKnightAssets(this);
    loadSkeletonAssets(this);
    loadTerrainAssets(this);
  }

  create(): void {
    const level = this.simulation.level;
    const worldWidth = level.cols * level.tileSize;
    const worldHeight = level.rows * level.tileSize;
    const viewWidth = this.scale.width;
    const viewHeight = this.scale.height;

    this.cameras.main.setBackgroundColor('#0b0d10');
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);

    createTerrainTexture(this, level);
    this.drawSpikes(level);

    registerKnightAnimations(this);
    registerSkeletonAnimations(this);

    this.playerSprite = this.add
      .sprite(0, 0, 'knight-idle')
      .setOrigin(0.5, KNIGHT_FEET_Y / KNIGHT_FRAME_HEIGHT)
      .setScale(KNIGHT_SCALE)
      .setDepth(10);

    this.enemyViews = this.simulation.state.enemies.map(() => ({
      sprite: this.add
        .sprite(0, 0, SKELETON_TEXTURES.idle)
        .setOrigin(0.5, SKELETON_FEET_Y / SKELETON_FRAME_HEIGHT)
        .setScale(SKELETON_SCALE)
        .setDepth(9),
      animation: '',
    }));

    this.guardFx = this.add.graphics().setDepth(9);
    this.attackFx = this.add.graphics().setDepth(11);
    this.enemyHud = this.add.graphics().setDepth(12);

    this.cameraFocus = this.add.zone(0, 0, 1, 1);
    this.cameras.main.startFollow(this.cameraFocus, true, 0.14, 0.14);
    this.centerCameraOnPlayer();

    this.keyboardHint = this.add
      .text(
        16,
        viewHeight - 34,
        '← → / A D  walk    SPACE  jump    X  sword    C  guard    R  restart',
        {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#8b98a5',
          backgroundColor: 'rgba(11, 13, 16, 0.78)',
          padding: { x: 8, y: 6 },
        },
      )
      .setScrollFactor(0)
      .setDepth(20);

    this.debugText = this.add
      .text(16, 14, '', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#aab6c2',
        backgroundColor: 'rgba(11, 13, 16, 0.78)',
        padding: { x: 8, y: 6 },
        lineSpacing: 4,
      })
      .setScrollFactor(0)
      .setDepth(20);

    this.deathShade = this.add
      .rectangle(0, 0, viewWidth, viewHeight, 0x000000, 0.55)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(25)
      .setVisible(false)
      .setInteractive();

    this.deathText = this.add
      .text(viewWidth / 2, viewHeight / 2, '', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#e8dcc0',
        align: 'center',
        lineSpacing: 12,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(26)
      .setVisible(false);

    this.deathShade.on('pointerdown', () => {
      if (this.simulation.state.status === 'dead') {
        this.restart();
      }
    });

    const keyboard = this.input.keyboard;
    if (keyboard === null) {
      throw new Error('Keyboard input is not available in this environment');
    }
    this.cursors = keyboard.createCursorKeys();
    this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyX = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.keyC = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.keyR = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    const forceTouch = new URLSearchParams(window.location.search).has('touch');
    const showTouchControls = forceTouch || this.sys.game.device.input.touch;

    if (showTouchControls) {
      this.keyboardHint.setVisible(false);
      this.touchControls = new TouchControls(this);
      this.touchControls.create();
    }

    this.bus.on('playerDied', this.onPlayerDied, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.bus.off('playerDied', this.onPlayerDied, this);
      this.touchControls?.destroy();
      this.touchControls = null;
    });

    this.bus.emit('sceneReady');
    this.render();
  }

  override update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.keyR)) {
      this.restart();
    }

    const touch = this.touchControls?.input;

    this.simulation.setInput({
      left:
        this.cursors.left.isDown || this.keyA.isDown || touch?.left === true,
      right:
        this.cursors.right.isDown || this.keyD.isDown || touch?.right === true,
      jumpHeld:
        this.cursors.space.isDown ||
        this.cursors.up.isDown ||
        touch?.jumpHeld === true,
      attackHeld: this.keyX.isDown || touch?.attackHeld === true,
      guardHeld: this.keyC.isDown || touch?.guardHeld === true,
    });

    this.loop.advance(delta, () => {
      const events = this.simulation.step();
      publishEvents(this.bus, events);
      this.tick += 1;
    });

    this.render();
  }

  private onPlayerDied(reason: DeathReason): void {
    const title =
      reason === 'spikes'
        ? 'IMPALED'
        : reason === 'sword'
          ? 'SLAIN'
          : 'LOST TO THE VOID';
    this.deathText.setText(`${title}\nTAP OR PRESS R TO RETRY`);
    this.deathShade.setVisible(true);
    this.deathText.setVisible(true);
  }

  private restart(): void {
    this.simulation = new Simulation(LEVEL_01);
    this.loop.reset();
    this.tick = 0;
    this.currentAnimation = '';

    this.deathShade.setVisible(false);
    this.deathText.setVisible(false);
    this.guardFx.clear();
    this.attackFx.clear();
    this.enemyHud.clear();
    for (const view of this.enemyViews) {
      view.animation = '';
      view.sprite.setVisible(true);
    }

    this.centerCameraOnPlayer();
    this.render();
  }

  private centerCameraOnPlayer(): void {
    const player = this.simulation.state.player;
    this.cameraFocus.setPosition(
      player.position.x + PLAYER_WIDTH / 2,
      player.position.y + PLAYER_HEIGHT / 2,
    );
    this.cameras.main.centerOn(this.cameraFocus.x, this.cameraFocus.y);
  }

  private render(): void {
    const { player, enemies } = this.simulation.state;
    this.renderPlayer(player);
    this.renderEnemies(enemies);
    this.renderCombatFx(player, enemies);

    this.cameraFocus.setPosition(
      player.position.x + PLAYER_WIDTH / 2,
      player.position.y + PLAYER_HEIGHT / 2,
    );

    const enemy = enemies[0];
    this.debugText.setText([
      'COCCODRILLO-II — WORLD 01',
      `state ${player.state} · grounded ${player.grounded ? 'yes' : 'no'}`,
      `pos ${player.position.x.toFixed(0)}, ${player.position.y.toFixed(0)} · vy ${player.velocity.y.toFixed(0)}`,
      enemy
        ? `skeleton ${enemy.state} · hp ${enemy.hp}/${ENEMY_MAX_HP}`
        : 'skeleton —',
      `cam ${this.cameras.main.scrollX.toFixed(0)}, ${this.cameras.main.scrollY.toFixed(0)} · tick ${this.tick}`,
    ]);
  }

  private renderPlayer(player: Player): void {
    this.playerSprite.setPosition(
      player.position.x + PLAYER_WIDTH / 2,
      player.position.y + PLAYER_HEIGHT,
    );
    this.playerSprite.setFlipX(player.facing === -1);

    const animation = PLAYER_ANIMATION[player.state];
    if (animation !== this.currentAnimation) {
      this.playerSprite.play(animation, true);
      this.currentAnimation = animation;
    }
  }

  private renderEnemies(enemies: readonly Enemy[]): void {
    this.enemyViews.forEach((view, index) => {
      const enemy = enemies[index];
      if (!enemy) {
        view.sprite.setVisible(false);
        return;
      }

      view.sprite.setVisible(true);
      view.sprite.setPosition(
        enemy.position.x + ENEMY_WIDTH / 2,
        enemy.position.y + ENEMY_HEIGHT,
      );
      view.sprite.setFlipX(enemy.facing === -1);

      const animation = ENEMY_ANIMATION[enemy.state];
      if (animation !== view.animation) {
        view.sprite.play(animation, true);
        view.animation = animation;
      }
    });

    this.enemyHud.clear();
    for (const enemy of enemies) {
      if (enemy.state === 'die' || enemy.hp >= ENEMY_MAX_HP) {
        continue;
      }

      const x = enemy.position.x + ENEMY_WIDTH / 2 - 24;
      const y = enemy.position.y - 18;
      this.enemyHud.fillStyle(0x14181f, 0.9).fillRect(x, y, 48, 7);
      this.enemyHud
        .fillStyle(0xc4453d, 1)
        .fillRect(x + 1, y + 1, 46 * (enemy.hp / ENEMY_MAX_HP), 5);
    }
  }

  private renderCombatFx(player: Player, enemies: readonly Enemy[]): void {
    this.guardFx.clear();
    this.attackFx.clear();

    if (player.state === 'guard') {
      const cx = player.position.x + PLAYER_WIDTH / 2;
      const cy = player.position.y + PLAYER_HEIGHT / 2;
      const pulse = 1 + Math.sin(this.time.now / 140) * 0.04;

      this.guardFx
        .fillStyle(0x4fc3ff, 0.1)
        .fillEllipse(cx, cy, 96 * pulse, 138 * pulse);
      this.guardFx
        .lineStyle(2, 0x9fe8ff, 0.55)
        .strokeEllipse(cx, cy, 96 * pulse, 138 * pulse);

      const start = player.facing === 1 ? -0.7 : Math.PI - 0.7;
      const end = player.facing === 1 ? 0.7 : Math.PI + 0.7;
      this.guardFx
        .lineStyle(3, 0xd8f6ff, 0.8)
        .beginPath()
        .arc(cx, cy, 58, start, end)
        .strokePath();
    }

    if (player.state === 'attack' && getAttackPhase(player) === 'active') {
      const cx = player.position.x + PLAYER_WIDTH / 2;
      const cy = player.position.y + PLAYER_HEIGHT * 0.45;
      const start = player.facing === 1 ? -0.95 : Math.PI - 0.95;
      const end = player.facing === 1 ? 0.95 : Math.PI + 0.95;

      this.attackFx
        .lineStyle(7, 0xdff2ff, 0.75)
        .beginPath()
        .arc(cx, cy, 64, start, end)
        .strokePath();
      this.attackFx
        .lineStyle(2, 0xffffff, 0.9)
        .beginPath()
        .arc(cx, cy, 54, start, end)
        .strokePath();
    }

    for (const enemy of enemies) {
      if (getEnemyAttackPhase(enemy) !== 'active') {
        continue;
      }

      const cx = enemy.position.x + ENEMY_WIDTH / 2;
      const cy = enemy.position.y + ENEMY_HEIGHT * 0.45;
      const start = enemy.facing === 1 ? -0.9 : Math.PI - 0.9;
      const end = enemy.facing === 1 ? 0.9 : Math.PI + 0.9;

      this.attackFx
        .lineStyle(6, 0xffb08a, 0.75)
        .beginPath()
        .arc(cx, cy, 60, start, end)
        .strokePath();
    }
  }

  private drawSpikes(level: Level): void {
    const graphics = this.add.graphics().setDepth(1);
    const { tileSize } = level;

    for (let row = 0; row < level.rows; row += 1) {
      for (let col = 0; col < level.cols; col += 1) {
        if (tileAt(level, col, row) !== 'spike') {
          continue;
        }

        const x = col * tileSize;
        const y = row * tileSize;
        const count = 4;
        const spikeWidth = tileSize / count;
        graphics.fillStyle(COLORS.spike, 1);
        for (let i = 0; i < count; i += 1) {
          const left = x + i * spikeWidth;
          graphics.fillTriangle(
            left,
            y + tileSize,
            left + spikeWidth / 2,
            y + tileSize * 0.55,
            left + spikeWidth,
            y + tileSize,
          );
        }
      }
    }
  }
}
