import Phaser from 'phaser';
import type { GameEventBus } from '../../bridge/events';
import { publishEvents } from '../../bridge/publish';
import {
  getEnemyAttackPhase,
  statsFor,
} from '../../game/enemy';
import { tileAt } from '../../game/level';
import { LEVEL_01 } from '../../game/levels';
import { FIXED_TIMESTEP_MS, FixedStepLoop } from '../../game/loop';
import {
  getAttackPhase,
  PLAYER_HEIGHT,
  PLAYER_MAX_HP,
  PLAYER_WIDTH,
} from '../../game/player';
import { Simulation } from '../../game/simulation';
import type {
  DeathReason,
  Enemy,
  EnemyKind,
  EnemyState,
  Level,
  Pickup,
  PickupKind,
  Player,
  PlayerState,
  Projectile,
} from '../../game/types';
import {
  ENEMY_ART,
  enemyAnimationKey,
  enemyTextureKey,
} from '../assets/enemies';
import {
  KNIGHT_FEET_Y,
  KNIGHT_FRAME_HEIGHT,
  KNIGHT_SCALE,
} from '../assets/knight';
import { COIN_KEYS, HEART_KEYS } from '../assets/pickups';
import { createBackdrop, loadDesertAssets, type Backdrop } from '../backdrop';
import {
  loadEnemyAssets,
  registerEnemyAnimations,
} from '../enemyAnimations';
import { loadKnightAssets, registerKnightAnimations } from '../knightAnimations';
import { loadPickupAssets, registerPickupAnimations } from '../pickups';
import { Sfx } from '../sfx';
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
  hurt: 'knight-hurt',
  die: 'knight-death',
};

type EnemyView = {
  sprite: Phaser.GameObjects.Sprite;
  animation: string;
  kind: EnemyKind;
};

type PickupView = {
  sprite: Phaser.GameObjects.Sprite;
  base?: Phaser.GameObjects.Graphics;
  glow?: Phaser.GameObjects.Image;
  kind: PickupKind;
  phase: number;
};

/**
 * Development shortcuts: ?spawnX=1900 drops the Knight at a world x on the
 * ground, and ?boss=1 puts him at the arena entrance for the intro.
 */
function resolveStartLevel(): Level {
  if (typeof window === 'undefined') {
    return LEVEL_01;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.has('boss')) {
    return { ...LEVEL_01, spawn: { x: 5240, y: 936 } };
  }

  const spawnX = Number(params.get('spawnX'));
  if (Number.isFinite(spawnX) && spawnX > 0) {
    return { ...LEVEL_01, spawn: { x: spawnX, y: 936 } };
  }

  return LEVEL_01;
}

/**
 * Render layer only: draws the simulation state, feeds it input, and turns
 * domain events into presentation. All rules live in `src/game/`.
 */
export class GameScene extends Phaser.Scene {
  private readonly loop = new FixedStepLoop(FIXED_TIMESTEP_MS);
  private simulation = new Simulation(LEVEL_01);
  private startLevel: Level = LEVEL_01;
  private tick = 0;

  private playerSprite!: Phaser.GameObjects.Sprite;
  private cameraFocus!: Phaser.GameObjects.Zone;
  private currentAnimation = '';
  private touchControls: TouchControls | null = null;
  private backdrop!: Backdrop;

  private hudLayer!: Phaser.GameObjects.Layer;
  private hudCamera!: Phaser.Cameras.Scene2D.Camera;
  private readonly zoomLevels = [1, 1.2, 1.4, 1.6, 1.8] as const;
  private zoomIndex = 0;
  private baseZoom = 1;
  private zoomLabel: Phaser.GameObjects.Text | null = null;

  private enemyViews: EnemyView[] = [];
  private enemyHud!: Phaser.GameObjects.Graphics;
  private bossHud!: Phaser.GameObjects.Graphics;
  private bossName!: Phaser.GameObjects.Text;

  private pickupViews: PickupView[] = [];
  private heartHud: Phaser.GameObjects.Image[] = [];
  private coinText!: Phaser.GameObjects.Text;
  private guardBadge!: Phaser.GameObjects.Image;
  private guardLabel!: Phaser.GameObjects.Text;
  private bannerText: Phaser.GameObjects.Text | null = null;
  private projectileViews: Phaser.GameObjects.Image[] = [];

  private guardFx!: Phaser.GameObjects.Graphics;
  private attackFx!: Phaser.GameObjects.Graphics;

  private debugText!: Phaser.GameObjects.Text;
  private keyboardHint!: Phaser.GameObjects.Text;
  private deathShade!: Phaser.GameObjects.Rectangle;
  private deathText!: Phaser.GameObjects.Text;

  private cutsceneShade!: Phaser.GameObjects.Rectangle;
  private cutsceneGlow!: Phaser.GameObjects.Image;
  private cutsceneBubble: Phaser.GameObjects.Container | null = null;
  private cutsceneActive = false;
  private cutsceneGeneration = 0;
  private cutsceneGolemIndex = -1;
  private cutsceneTweens: Phaser.Tweens.Tween[] = [];

  private lastPlayerState: PlayerState | null = null;
  private lastPlayerGrounded = true;
  private lastEnemyStates: Array<EnemyState | undefined> = [];

  private readonly sfx = new Sfx();

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyX!: Phaser.Input.Keyboard.Key;
  private keyC!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;

  constructor(private readonly bus: GameEventBus) {
    super({ key: 'GameScene' });
  }

  private addHud<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.hudLayer.add(object);
    return object;
  }

  preload(): void {
    loadKnightAssets(this);
    loadEnemyAssets(this);
    loadPickupAssets(this);
    loadDesertAssets(this);
    loadTerrainAssets(this);
  }

  create(): void {
    this.startLevel = resolveStartLevel();
    this.simulation = new Simulation(this.startLevel);

    const level = this.simulation.level;
    const worldWidth = level.cols * level.tileSize;
    const worldHeight = level.rows * level.tileSize;
    const viewWidth = this.scale.width;
    const viewHeight = this.scale.height;
    const groundY = level.spawn.y + PLAYER_HEIGHT;

    this.hudLayer = this.add.layer();

    const forceTouch = new URLSearchParams(window.location.search).has('touch');
    const showTouchControls =
      forceTouch || this.sys.game.device.input.touch;

    if (showTouchControls) {
      try {
        const saved = Number(
          window.localStorage.getItem('coccodrillo.zoom'),
        );
        const index = this.zoomLevels.findIndex(
          (zoom) => Math.abs(zoom - saved) < 0.001,
        );
        if (index >= 0) {
          this.zoomIndex = index;
        }
      } catch {
        // localStorage can be unavailable; keep the default zoom.
      }
    }
    this.baseZoom = this.zoomLevels[this.zoomIndex] ?? 1;

    this.cameras.main.setBackgroundColor('#0b0d10');
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);

    this.backdrop = createBackdrop(this, viewWidth, viewHeight, groundY);
    createTerrainTexture(this, level);
    this.drawSpikes(level);

    // A cool moon over the desert night.
    this.add
      .circle(viewWidth * 0.78, viewHeight * 0.2, 70, 0xffdf9a, 0.1)
      .setScrollFactor(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(-45);
    this.add
      .circle(viewWidth * 0.78, viewHeight * 0.2, 32, 0xfff0c8, 0.95)
      .setScrollFactor(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(-45);

    registerKnightAnimations(this);
    registerEnemyAnimations(this);
    registerPickupAnimations(this);

    this.playerSprite = this.add
      .sprite(0, 0, 'knight-idle')
      .setOrigin(0.5, KNIGHT_FEET_Y / KNIGHT_FRAME_HEIGHT)
      .setScale(KNIGHT_SCALE)
      .setDepth(10);

    this.enemyViews = this.simulation.state.enemies.map((enemy) => {
      const art = ENEMY_ART[enemy.kind];
      const sprite = this.add
        .sprite(0, 0, enemyTextureKey(enemy.kind, 'idle'))
        .setScale(art.scale)
        .setDepth(9);

      if (art.anchor === 'feet') {
        sprite.setOrigin(0.5, art.feetY / art.frameHeight);
      } else {
        sprite.setOrigin(0.5, 0.5);
      }

      return { sprite, animation: '', kind: enemy.kind };
    });

    this.guardFx = this.add.graphics().setDepth(9);
    this.attackFx = this.add.graphics().setDepth(11);
    this.enemyHud = this.add.graphics().setDepth(12);

    this.createGlowTexture();
    this.createGuardArtifactTexture();
    this.createWellOrbTexture();

    this.pickupViews = this.simulation.state.pickups.map((pickup, index) => {
      let texture = HEART_KEYS[0] ?? 'pickup-heart-0';
      let scale = 1.4;
      let base: Phaser.GameObjects.Graphics | undefined;
      let glow: Phaser.GameObjects.Image | undefined;

      if (pickup.kind === 'coin') {
        texture = COIN_KEYS[0] ?? 'pickup-coin-0';
        scale = 1.2;
      } else if (pickup.kind === 'well') {
        texture = 'well-orb';
        scale = 1.3;
      } else if (pickup.kind === 'artifact') {
        texture = 'guard-artifact';
        scale = 1.2;
      }

      const sprite = this.add
        .sprite(pickup.position.x, pickup.position.y, texture)
        .setDepth(5)
        .setScale(scale);

      if (pickup.kind === 'coin') {
        sprite.play('coin-spin');
      } else if (pickup.kind === 'heart') {
        sprite.play('heart-pulse');
      } else if (pickup.kind === 'well') {
        sprite.setBlendMode(Phaser.BlendModes.ADD);
      }

      if (pickup.kind === 'well' || pickup.kind === 'artifact') {
        const x = pickup.position.x;
        const artifact = pickup.kind === 'artifact';
        const y = pickup.position.y + (artifact ? 44 : 34);
        base = this.add.graphics().setDepth(2);
        base.fillStyle(0x161d29, 0.95).fillEllipse(x, y, 86, 28);
        base
          .lineStyle(3, artifact ? 0xd8b46a : 0x6f7f9c, 0.9)
          .strokeEllipse(x, y, 86, 28);
        base
          .fillStyle(artifact ? 0x4a6c7a : 0x3e6472, 0.7)
          .fillEllipse(x, y - 5, 58, 12);

        if (artifact) {
          glow = this.add
            .image(x, pickup.position.y, 'boss-glow')
            .setDepth(3)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.18)
            .setAlpha(0.55);
        }
      }

      return {
        sprite,
        base,
        glow,
        kind: pickup.kind,
        phase: index * 0.7,
      };
    });

    this.heartHud = [];
    for (let i = 0; i < PLAYER_MAX_HP; i += 1) {
      this.heartHud.push(
        this.addHud(
          this.add
            .image(34 + i * 50, 152, HEART_KEYS[0] ?? 'pickup-heart-0')
            .setScrollFactor(0)
            .setDepth(22)
            .setScale(1),
        ),
      );
    }

    this.addHud(
      this.add
        .sprite(34, 204, COIN_KEYS[0] ?? 'pickup-coin-0')
        .setScrollFactor(0)
        .setDepth(22)
        .setScale(0.9)
        .play('coin-spin'),
    );
    this.coinText = this.addHud(
      this.add
        .text(58, 190, 'x 0', {
          fontFamily: 'monospace',
          fontSize: '22px',
          color: '#f0d68a',
        })
        .setScrollFactor(0)
        .setDepth(22),
    );

    this.guardBadge = this.addHud(
      this.add
        .image(34, 250, 'guard-artifact')
        .setScrollFactor(0)
        .setDepth(22)
        .setScale(0.5)
        .setAlpha(0.2),
    );
    this.guardLabel = this.addHud(
      this.add
        .text(58, 238, 'GUARD', {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: '#d8b46a',
        })
        .setScrollFactor(0)
        .setDepth(22)
        .setAlpha(0.25),
    );

    this.cameraFocus = this.add.zone(0, 0, 1, 1);
    this.cameras.main.startFollow(this.cameraFocus, true, 0.14, 0.14);
    this.cameras.main.setZoom(this.baseZoom);
    this.centerCameraOnPlayer();

    this.keyboardHint = this.addHud(
      this.add
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
        .setDepth(20),
    );

    this.debugText = this.addHud(
      this.add
        .text(16, 14, '', {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: '#aab6c2',
          backgroundColor: 'rgba(11, 13, 16, 0.78)',
          padding: { x: 8, y: 6 },
          lineSpacing: 4,
        })
        .setScrollFactor(0)
        .setDepth(20),
    );

    this.bossName = this.addHud(
      this.add
        .text(viewWidth / 2, 28, 'THE MIGHTY JAN ZÁTKA', {
          fontFamily: 'Georgia, serif',
          fontSize: '22px',
          color: '#f3dfa2',
          stroke: '#1a1208',
          strokeThickness: 4,
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(21)
        .setVisible(false),
    );

    this.bossHud = this.addHud(
      this.add.graphics().setScrollFactor(0).setDepth(21),
    );

    this.deathShade = this.addHud(
      this.add
        .rectangle(0, 0, viewWidth, viewHeight, 0x000000, 0.58)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(25)
        .setVisible(false)
        .setInteractive(),
    );

    this.deathText = this.addHud(
      this.add
        .text(viewWidth / 2, viewHeight / 2, '', {
          fontFamily: 'monospace',
          fontSize: '32px',
          color: '#e8dcc0',
          align: 'center',
          lineSpacing: 14,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(26)
        .setVisible(false),
    );

    this.deathShade.on('pointerdown', () => {
      const state = this.simulation.state;
      if (state.status === 'dead' || state.mode === 'victory') {
        this.restart();
      }
    });

    this.createGlowTexture();
    this.cutsceneShade = this.add
      .rectangle(0, 0, viewWidth, viewHeight, 0x000000, 1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(27)
      .setVisible(false);
    this.cutsceneGlow = this.add
      .image(0, 0, 'boss-glow')
      .setDepth(28)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);

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

    keyboard.on('keydown', this.unlockAudio, this);
    this.input.on('pointerdown', this.unlockAudio, this);

    if (showTouchControls) {
      this.keyboardHint.setVisible(false);
      this.touchControls = new TouchControls(this, this.hudLayer);
      this.touchControls.create();
      this.createZoomControls(viewWidth);
    }

    this.hudCamera = this.cameras.add(0, 0, viewWidth, viewHeight);
    this.hudCamera.setScroll(0, 0);
    this.hudCamera.setZoom(1);
    this.cameras.main.ignore(this.hudLayer);
    this.hudCamera.ignore(
      this.children.list.filter(
        (child) =>
          child !==
          (this.hudLayer as unknown as Phaser.GameObjects.GameObject),
      ),
    );

    this.bus.on('playerDied', this.onPlayerDied, this);
    this.bus.on('playerHurt', this.onPlayerHurt, this);
    this.bus.on('enemyHit', this.onEnemyHit, this);
    this.bus.on('enemyDied', this.onEnemyDied, this);
    this.bus.on('attackBlocked', this.onAttackBlocked, this);
    this.bus.on('pickupCollected', this.onPickupCollected, this);
    this.bus.on('bossIntro', this.startBossCutscene, this);
    this.bus.on('bossShot', this.onBossShot, this);
    this.bus.on('bossDefeated', this.onBossDefeated, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.bus.off('playerDied', this.onPlayerDied, this);
      this.bus.off('playerHurt', this.onPlayerHurt, this);
      this.bus.off('enemyHit', this.onEnemyHit, this);
      this.bus.off('enemyDied', this.onEnemyDied, this);
      this.bus.off('attackBlocked', this.onAttackBlocked, this);
      this.bus.off('pickupCollected', this.onPickupCollected, this);
      this.bus.off('bossIntro', this.startBossCutscene, this);
      this.bus.off('bossShot', this.onBossShot, this);
      this.bus.off('bossDefeated', this.onBossDefeated, this);
      keyboard.off('keydown', this.unlockAudio, this);
      this.input.off('pointerdown', this.unlockAudio, this);
      this.touchControls?.destroy();
      this.touchControls = null;
      this.cutsceneBubble?.destroy();
      this.cutsceneBubble = null;
      this.sfx.close();
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

  private unlockAudio(): void {
    this.sfx.unlock();
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
    this.sfx.playerDeath();
  }

  private onEnemyHit(): void {
    this.sfx.hit();
  }

  private onPlayerHurt(): void {
    this.sfx.playerHurt();
    this.cameras.main.shake(120, 0.003);
  }

  private onPickupCollected(kind: PickupKind): void {
    if (kind === 'coin') {
      this.sfx.coin();
    } else if (kind === 'artifact') {
      this.sfx.heal();
      this.showBanner('GUARD UNLOCKED');
    } else {
      this.sfx.heal();
    }
  }

  private onBossShot(): void {
    this.sfx.bossShot();
  }

  private showBanner(message: string): void {
    this.bannerText?.destroy();
    const text = this.addHud(
      this.add
        .text(this.scale.width / 2, this.scale.height * 0.3, message, {
          fontFamily: 'Georgia, serif',
          fontSize: '27px',
          color: '#f3dfa2',
          stroke: '#1a1208',
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(24)
        .setAlpha(0),
    );
    this.bannerText = text;

    this.tweens.add({
      targets: text,
      alpha: 1,
      y: text.y - 16,
      duration: 350,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: text,
          alpha: 0,
          delay: 1400,
          duration: 500,
          onComplete: () => {
            text.destroy();
            if (this.bannerText === text) {
              this.bannerText = null;
            }
          },
        });
      },
    });
  }

  private onEnemyDied(kind: EnemyKind): void {
    if (kind !== 'golem') {
      this.sfx.enemyDie();
    }
  }

  private onAttackBlocked(): void {
    this.sfx.block();
  }

  private onBossDefeated(): void {
    this.bossName.setVisible(false);
    this.bossHud.clear();
    this.deathText.setText(
      'THE MIGHTY JAN ZÁTKA HAS FALLEN\nYOU WIN\nPRESS R TO PLAY AGAIN',
    );
    this.deathShade.setVisible(true);
    this.deathText.setVisible(true);
    this.sfx.victory();
  }

  private startBossCutscene(): void {
    if (this.cutsceneActive) {
      return;
    }

    const enemies = this.simulation.state.enemies;
    const golemIndex = enemies.findIndex((enemy) => enemy.kind === 'golem');
    const golem = enemies[golemIndex];
    const view = this.enemyViews[golemIndex];
    if (!golem || !view) {
      this.simulation.resumeFromCutscene();
      return;
    }

    this.cutsceneActive = true;
    this.cutsceneGeneration += 1;
    const generation = this.cutsceneGeneration;
    this.cutsceneGolemIndex = golemIndex;

    this.hudCamera.setVisible(false);
    this.hudLayer.setVisible(false);
    this.debugText.setVisible(false);
    this.keyboardHint.setVisible(false);
    this.touchControls?.setVisible(false);
    this.bossName.setVisible(false);
    this.bossHud.clear();

    const stats = statsFor('golem');
    const golemX = golem.position.x + stats.width / 2;
    const golemY = golem.position.y + stats.height / 2;

    this.cameraFocus.setPosition(golemX, golemY);
    this.cameras.main.zoomTo(
      Math.max(1.7, this.baseZoom),
      900,
      'Sine.easeInOut',
    );

    this.cutsceneShade.setVisible(true).setAlpha(0);
    this.tweens.add({
      targets: this.cutsceneShade,
      alpha: 0.84,
      duration: 650,
      ease: 'Sine.easeOut',
    });

    this.cutsceneGlow
      .setVisible(true)
      .setAlpha(0)
      .setPosition(golemX, golemY - stats.height * 0.15)
      .setScale(1.15);
    this.tweens.add({
      targets: this.cutsceneGlow,
      alpha: 0.85,
      duration: 850,
      ease: 'Sine.easeOut',
    });

    const art = ENEMY_ART.golem;
    view.sprite.setDepth(29).setTint(0xffe2a8).setScale(art.scale);
    this.cutsceneTweens.push(
      this.tweens.add({
        targets: view.sprite,
        scaleX: art.scale * 1.035,
        scaleY: art.scale * 1.035,
        yoyo: true,
        repeat: -1,
        duration: 900,
        ease: 'Sine.easeInOut',
      }),
    );

    this.sfx.bossRoar();

    this.time.delayedCall(950, () => {
      if (generation !== this.cutsceneGeneration) {
        return;
      }
      this.showBossBubble(golemX, golem.position.y, generation);
    });

    this.time.delayedCall(5800, () => {
      if (generation !== this.cutsceneGeneration) {
        return;
      }
      this.endBossCutscene();
    });
  }

  private showBossBubble(
    x: number,
    golemTopY: number,
    generation: number,
  ): void {
    const container = this.add.container(x, golemTopY - 50).setDepth(30);
    this.hudCamera.ignore(container);
    const background = this.add.graphics();

    background.fillStyle(0xffefd0, 0.97);
    background.lineStyle(4, 0x2a1c10, 1);
    background.fillRoundedRect(-300, -150, 600, 130, 20);
    background.strokeRoundedRect(-300, -150, 600, 130, 20);
    background.fillTriangle(-26, -22, 26, -22, 0, 18);
    background.lineBetween(-26, -22, 0, 18);
    background.lineBetween(26, -22, 0, 18);

    const text = this.add.text(-276, -136, '', {
      fontFamily: 'Georgia, serif',
      fontSize: '27px',
      color: '#241a12',
      wordWrap: { width: 552 },
      lineSpacing: 6,
    });

    container.add([background, text]);
    container.setScale(0.25).setAlpha(0);
    this.cutsceneBubble = container;

    this.tweens.add({
      targets: container,
      scale: 1,
      alpha: 1,
      duration: 420,
      ease: 'Back.Out',
    });

    const fullText =
      "I'm the Mighty Jan Zátka!\nHow dare you to wake me up!";
    const counter = { characters: 0 };
    this.tweens.add({
      targets: counter,
      characters: fullText.length,
      duration: 1900,
      delay: 180,
      ease: 'Linear',
      onUpdate: () => {
        text.setText(fullText.slice(0, Math.floor(counter.characters)));
      },
    });

    this.tweens.add({
      targets: container,
      alpha: 0,
      delay: 4300,
      duration: 500,
      onComplete: () => {
        if (generation === this.cutsceneGeneration) {
          container.destroy();
          if (this.cutsceneBubble === container) {
            this.cutsceneBubble = null;
          }
        }
      },
    });
  }

  private endBossCutscene(): void {
    if (!this.cutsceneActive) {
      return;
    }

    this.cutsceneActive = false;
    for (const tween of this.cutsceneTweens) {
      tween.stop();
    }
    this.cutsceneTweens = [];

    const view = this.enemyViews[this.cutsceneGolemIndex];
    if (view) {
      view.sprite.setDepth(9).clearTint().setScale(ENEMY_ART.golem.scale);
    }

    if (this.cutsceneBubble) {
      this.cutsceneBubble.destroy();
      this.cutsceneBubble = null;
    }

    this.tweens.add({
      targets: [this.cutsceneShade, this.cutsceneGlow],
      alpha: 0,
      duration: 480,
      onComplete: () => {
        this.cutsceneShade.setVisible(false);
        this.cutsceneGlow.setVisible(false);
      },
    });

    this.cameras.main.zoomTo(this.baseZoom, 700, 'Sine.easeInOut');
    this.hudCamera.setVisible(true);
    this.hudLayer.setVisible(true);
    this.debugText.setVisible(true);
    this.keyboardHint.setVisible(this.touchControls === null);
    this.touchControls?.setVisible(true);
    this.simulation.resumeFromCutscene();
  }

  private restart(): void {
    this.cutsceneGeneration += 1;
    this.cutsceneActive = false;
    this.cutsceneGolemIndex = -1;
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.cutsceneBubble?.destroy();
    this.cutsceneBubble = null;
    this.cutsceneShade.setVisible(false).setAlpha(0);
    this.cutsceneGlow.setVisible(false).setAlpha(0);

    this.simulation = new Simulation(this.startLevel);
    this.loop.reset();
    this.tick = 0;
    this.currentAnimation = '';
    this.lastPlayerState = null;
    this.lastPlayerGrounded = true;
    this.lastEnemyStates = [];

    this.deathShade.setVisible(false);
    this.deathText.setVisible(false);
    this.guardFx.clear();
    this.attackFx.clear();
    this.enemyHud.clear();
    this.bossHud.clear();
    this.bossName.setVisible(false);
    this.debugText.setVisible(true);
    this.keyboardHint.setVisible(this.touchControls === null);
    this.touchControls?.setVisible(true);

    for (const view of this.enemyViews) {
      const art = ENEMY_ART[view.kind];
      view.animation = '';
      view.sprite.setVisible(true).setDepth(9).clearTint().setScale(art.scale);
    }

    for (const view of this.pickupViews) {
      view.sprite.setVisible(true).setAlpha(1).setAngle(0);
      view.base?.setAlpha(1);
      view.glow?.setVisible(true).setAlpha(0.55);
      const scales = {
        heart: 1.4,
        coin: 1.2,
        well: 1.3,
        artifact: 1.2,
      } as const;
      view.sprite.setScale(scales[view.kind]);
    }
    for (const view of this.projectileViews) {
      view.setVisible(false);
    }
    this.bannerText?.destroy();
    this.bannerText = null;
    this.playerSprite.setAlpha(1);

    this.cameras.main.zoomEffect.reset();
    this.cameras.main.setZoom(this.baseZoom);
    this.hudCamera.setVisible(true);
    this.hudLayer.setVisible(true);
    this.cameras.main.startFollow(this.cameraFocus, true, 0.14, 0.14);
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

  private createZoomControls(viewWidth: number): void {
    const y = 48;
    const minusX = viewWidth - 160;
    const plusX = viewWidth - 40;
    const labelX = viewWidth - 100;

    const create = (x: number, label: string, delta: number): void => {
      const circle = this.addHud(
        this.add
          .circle(x, y, 24, 0x10161d, 0.55)
          .setStrokeStyle(2, 0x6a7785, 0.9)
          .setScrollFactor(0)
          .setDepth(23)
          .setInteractive(),
      );
      this.addHud(
        this.add
          .text(x, y, label, {
            fontFamily: 'monospace',
            fontSize: '26px',
            color: '#d7dde3',
          })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(24),
      );
      circle.on('pointerdown', () => this.changeZoom(delta));
    };

    create(minusX, '−', -1);
    create(plusX, '+', 1);

    this.zoomLabel = this.addHud(
      this.add
        .text(labelX, 82, '', {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#8b98a5',
          backgroundColor: 'rgba(11, 13, 16, 0.78)',
          padding: { x: 6, y: 3 },
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(24),
    );
    this.updateZoomLabel();
  }

  private changeZoom(delta: number): void {
    if (this.cutsceneActive) {
      return;
    }

    const next = Math.max(
      0,
      Math.min(this.zoomLevels.length - 1, this.zoomIndex + delta),
    );
    if (next === this.zoomIndex) {
      return;
    }

    this.zoomIndex = next;
    this.baseZoom = this.zoomLevels[next] ?? 1;
    this.cameras.main.zoomTo(this.baseZoom, 180, 'Sine.easeOut');
    this.updateZoomLabel();

    try {
      window.localStorage.setItem(
        'coccodrillo.zoom',
        String(this.baseZoom),
      );
    } catch {
      // Persistence is optional.
    }
  }

  private updateZoomLabel(): void {
    this.zoomLabel?.setText(`${Math.round(this.baseZoom * 100)}%`);
  }

  private render(): void {
    const { player, enemies, pickups, projectiles, mode } =
      this.simulation.state;

    this.renderPlayer(player);
    this.renderEnemies(enemies);
    this.renderPickups(pickups);
    this.renderProjectiles(projectiles);
    this.renderHud();
    this.renderCombatFx(player, enemies);
    this.renderBossBar(player, enemies);
    this.updateSfx(player, enemies);

    this.backdrop.update(this.cameras.main.scrollX);

    if (!this.cutsceneActive) {
      this.cameraFocus.setPosition(
        player.position.x + PLAYER_WIDTH / 2,
        player.position.y + PLAYER_HEIGHT / 2,
      );
    }

    const golem = enemies.find((enemy) => enemy.kind === 'golem');
    const alive = enemies.filter((enemy) => enemy.state !== 'die').length;
    this.debugText.setText([
      'COCCODRILLO-II — WORLD 01',
      `mode ${mode} · ${player.state} · grounded ${player.grounded ? 'yes' : 'no'}`,
      `hp ${player.hp}/${player.maxHp} · pos ${player.position.x.toFixed(0)}, ${player.position.y.toFixed(0)} · vy ${player.velocity.y.toFixed(0)}`,
      `enemies ${alive}/${enemies.length} alive${golem ? ` · golem ${golem.hp}/${statsFor('golem').maxHp}` : ''}`,
      `cam ${this.cameras.main.scrollX.toFixed(0)}, ${this.cameras.main.scrollY.toFixed(0)} · tick ${this.tick}`,
    ]);
  }

  private renderPlayer(player: Player): void {
    this.playerSprite.setPosition(
      player.position.x + PLAYER_WIDTH / 2,
      player.position.y + PLAYER_HEIGHT,
    );
    this.playerSprite.setFlipX(player.facing === -1);

    const blinking =
      player.state !== 'die' &&
      player.invulnerableTime > 0 &&
      Math.floor(this.time.now / 90) % 2 === 0;
    this.playerSprite.setAlpha(blinking ? 0.35 : 1);

    const animation = PLAYER_ANIMATION[player.state];
    if (animation !== this.currentAnimation) {
      this.playerSprite.play(animation, true);
      this.currentAnimation = animation;
    }
  }

  private renderPickups(pickups: readonly Pickup[]): void {
    pickups.forEach((pickup, index) => {
      const view = this.pickupViews[index];
      if (!view) {
        return;
      }

      if (pickup.collected) {
        view.sprite.setVisible(false);
        view.glow?.setVisible(false);
        view.base?.setAlpha(0.25);
        return;
      }

      view.sprite.setVisible(true);
      view.glow?.setVisible(true);
      view.sprite.setPosition(
        pickup.position.x,
        pickup.position.y +
          Math.sin(this.time.now / 420 + view.phase) * 4,
      );

      if (view.kind === 'artifact') {
        view.sprite.setAngle(
          Math.sin(this.time.now / 500 + view.phase) * 6,
        );
        if (view.glow) {
          view.glow.setAlpha(
            0.45 + Math.sin(this.time.now / 260) * 0.12,
          );
        }
      } else if (view.kind === 'well') {
        view.sprite.setScale(
          1.3 + Math.sin(this.time.now / 280 + view.phase) * 0.06,
        );
      }

      view.base?.setAlpha(1);
    });
  }

  private renderProjectiles(projectiles: readonly Projectile[]): void {
    projectiles.forEach((projectile, index) => {
      let view = this.projectileViews[index];
      if (!view) {
        view = this.add
          .image(projectile.position.x, projectile.position.y, 'boss-glow')
          .setDepth(12)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.1);
        this.hudCamera.ignore(view);
        this.projectileViews.push(view);
      }

      view.setVisible(true);
      view.setPosition(projectile.position.x, projectile.position.y);
      view.setScale(
        0.1 + Math.sin(this.time.now / 110 + index) * 0.012,
      );
    });

    for (
      let index = projectiles.length;
      index < this.projectileViews.length;
      index += 1
    ) {
      this.projectileViews[index]?.setVisible(false);
    }
  }

  private renderHud(): void {
    const { player, coins } = this.simulation.state;

    this.heartHud.forEach((heart, index) => {
      const full = index < player.hp;
      heart.setAlpha(full ? 1 : 0.22);
      if (full) {
        heart.clearTint();
      } else {
        heart.setTint(0x2a2a2a);
      }
    });

    this.coinText.setText(`x ${coins}`);

    this.guardBadge.setAlpha(player.guardUnlocked ? 1 : 0.2);
    this.guardLabel.setAlpha(player.guardUnlocked ? 1 : 0.25);
  }

  private renderEnemies(enemies: readonly Enemy[]): void {
    this.enemyViews.forEach((view, index) => {
      const enemy = enemies[index];
      if (!enemy) {
        view.sprite.setVisible(false);
        return;
      }

      const art = ENEMY_ART[enemy.kind];
      const stats = statsFor(enemy.kind);
      view.sprite.setVisible(true);
      view.sprite.setFlipX(enemy.facing === -1);

      if (art.anchor === 'feet') {
        view.sprite.setPosition(
          enemy.position.x + stats.width / 2,
          enemy.position.y + stats.height,
        );
      } else {
        view.sprite.setPosition(
          enemy.position.x + stats.width / 2,
          enemy.position.y + stats.height / 2,
        );
      }

      const animation = enemyAnimationKey(enemy.kind, enemy.state);
      if (animation !== view.animation) {
        view.sprite.play(animation, true);
        view.animation = animation;
      }
    });

    this.enemyHud.clear();
    for (const enemy of enemies) {
      const stats = statsFor(enemy.kind);
      if (
        enemy.kind === 'golem' ||
        enemy.state === 'die' ||
        enemy.hp >= stats.maxHp
      ) {
        continue;
      }

      const x = enemy.position.x + stats.width / 2 - 24;
      const y = enemy.position.y - 16;
      this.enemyHud.fillStyle(0x14181f, 0.9).fillRect(x, y, 48, 7);
      this.enemyHud
        .fillStyle(0xc4453d, 1)
        .fillRect(x + 1, y + 1, 46 * (enemy.hp / stats.maxHp), 5);
    }
  }

  private renderBossBar(player: Player, enemies: readonly Enemy[]): void {
    const golem = enemies.find((enemy) => enemy.kind === 'golem');
    const show =
      !this.cutsceneActive &&
      golem !== undefined &&
      golem.state !== 'die' &&
      this.simulation.state.mode !== 'victory' &&
      player.position.x > golem.position.x - 850;

    this.bossName.setVisible(show);
    this.bossHud.clear();
    if (!show || !golem) {
      return;
    }

    const maxHp = statsFor('golem').maxHp;
    const barWidth = 600;
    const barHeight = 18;
    const x = this.scale.width / 2 - barWidth / 2;
    const y = 56;

    this.bossHud.fillStyle(0x0b0d10, 0.86).fillRect(x - 6, y - 6, barWidth + 12, barHeight + 12);
    this.bossHud.fillStyle(0x3a1d1a, 1).fillRect(x, y, barWidth, barHeight);
    this.bossHud
      .fillStyle(0xb43c32, 1)
      .fillRect(x + 2, y + 2, (barWidth - 4) * (golem.hp / maxHp), barHeight - 4);
    this.bossHud
      .lineStyle(2, 0xd8b46a, 0.85)
      .strokeRect(x - 3, y - 3, barWidth + 6, barHeight + 6);
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

      const stats = statsFor(enemy.kind);
      const cx = enemy.position.x + stats.width / 2;
      const cy = enemy.position.y + stats.height * 0.45;
      const start = enemy.facing === 1 ? -0.9 : Math.PI - 0.9;
      const end = enemy.facing === 1 ? 0.9 : Math.PI + 0.9;

      this.attackFx
        .lineStyle(6, 0xffb08a, 0.75)
        .beginPath()
        .arc(cx, cy, Math.max(44, stats.attackReach * 0.9), start, end)
        .strokePath();
    }
  }

  private updateSfx(player: Player, enemies: readonly Enemy[]): void {
    if (this.lastPlayerState !== null && player.state !== this.lastPlayerState) {
      if (player.state === 'jump') {
        this.sfx.jump();
      } else if (player.state === 'attack') {
        this.sfx.swing();
      } else if (player.state === 'guard') {
        this.sfx.guard();
      }
    }

    if (!this.lastPlayerGrounded && player.grounded && player.state !== 'die') {
      this.sfx.land();
    }
    this.lastPlayerState = player.state;
    this.lastPlayerGrounded = player.grounded;

    enemies.forEach((enemy, index) => {
      const previous = this.lastEnemyStates[index];
      if (
        previous !== undefined &&
        previous !== enemy.state &&
        enemy.state === 'attack'
      ) {
        this.sfx.enemySwing(enemy.kind);
      }
      this.lastEnemyStates[index] = enemy.state;
    });
  }

  private createWellOrbTexture(): void {
    if (this.textures.exists('well-orb')) {
      return;
    }

    const size = 64;
    const canvas = this.textures.createCanvas('well-orb', size, size);
    if (!canvas) {
      return;
    }

    const context = canvas.getContext();
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      2,
      size / 2,
      size / 2,
      size / 2 - 2,
    );
    gradient.addColorStop(0, 'rgba(235, 255, 255, 1)');
    gradient.addColorStop(0.35, 'rgba(100, 220, 255, 0.85)');
    gradient.addColorStop(1, 'rgba(40, 120, 255, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    canvas.refresh();
  }

  private createGuardArtifactTexture(): void {
    if (this.textures.exists('guard-artifact')) {
      return;
    }

    const canvas = this.textures.createCanvas('guard-artifact', 64, 76);
    if (!canvas) {
      return;
    }

    const context = canvas.getContext();
    context.clearRect(0, 0, 64, 76);
    context.save();
    context.translate(32, 38);

    context.beginPath();
    context.moveTo(0, -32);
    context.lineTo(26, -20);
    context.lineTo(23, 9);
    context.quadraticCurveTo(17, 27, 0, 35);
    context.quadraticCurveTo(-17, 27, -23, 9);
    context.lineTo(-26, -20);
    context.closePath();
    context.fillStyle = '#25466f';
    context.fill();
    context.lineWidth = 4;
    context.strokeStyle = '#e8c76a';
    context.stroke();

    context.beginPath();
    context.moveTo(0, -22);
    context.lineTo(18, -14);
    context.lineTo(16, 6);
    context.quadraticCurveTo(12, 19, 0, 25);
    context.quadraticCurveTo(-12, 19, -16, 6);
    context.lineTo(-18, -14);
    context.closePath();
    context.lineWidth = 2;
    context.strokeStyle = '#86d8f0';
    context.stroke();

    context.beginPath();
    context.arc(0, -4, 6, 0, Math.PI * 2);
    context.fillStyle = '#8fe9ff';
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = '#e8f8ff';
    context.stroke();

    context.restore();
    canvas.refresh();
  }

  private createGlowTexture(): void {
    if (this.textures.exists('boss-glow')) {
      return;
    }

    const size = 512;
    const texture = this.textures.createCanvas('boss-glow', size, size);
    if (!texture) {
      return;
    }

    const context = texture.getContext();
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, 'rgba(255, 244, 200, 0.95)');
    gradient.addColorStop(0.35, 'rgba(255, 214, 120, 0.45)');
    gradient.addColorStop(1, 'rgba(255, 180, 60, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    texture.refresh();
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
