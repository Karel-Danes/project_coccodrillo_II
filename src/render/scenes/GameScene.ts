import Phaser from 'phaser';
import type { GameEventBus } from '../../bridge/events';
import { publishEvents } from '../../bridge/publish';
import {
  bossName,
  characterDefinition,
  isBossKind,
  isCharacterKind,
  isWorldMode,
  RANDOM_BOSSES,
  type BossKind,
} from '../../game/characters';
import { CAMPAIGN_LEVEL } from '../../game/campaign';
import {
  DEFAULT_DIFFICULTY,
  isDifficulty,
  prepareCampaignLevel,
} from '../../game/difficulty';
import {
  getEnemyAttackPhase,
  statsFor,
} from '../../game/enemy';
import { tileAt } from '../../game/level';
import { FIXED_TIMESTEP_MS, FixedStepLoop } from '../../game/loop';
import {
  getAttackPhase,
  isBerserk,
  MAX_PLAYER_HP,
  MAX_POWER_CHARGE,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
} from '../../game/player';
import {
  generateRandomLevel,
  randomSeed,
} from '../../game/randomLevel';
import { Simulation } from '../../game/simulation';
import type {
  DamageSource,
  DeathReason,
  Enemy,
  EnemyHitAttack,
  EnemyKind,
  EnemyState,
  FloatingIsland,
  GameConfig,
  Level,
  Pickup,
  PickupKind,
  Player,
  PlayerProgress,
  PlayerState,
  Projectile,
  ProjectileKind,
  SkillKind,
  Teleport,
} from '../../game/types';
import {
  ENEMY_ART,
  enemyAnimationKey,
  enemyTextureKey,
} from '../assets/enemies';
import {
  PLAYER_ART,
  playerAnimationKey,
  playerTextureKey,
} from '../assets/players';
import { COIN_KEYS, HEART_KEYS } from '../assets/pickups';
import { createBackdrop, loadDesertAssets, type Backdrop } from '../backdrop';
import {
  createDecorations,
  loadDecorationAssets,
} from '../decorations';
import {
  loadEnemyAssets,
  registerEnemyAnimations,
} from '../enemyAnimations';
import {
  loadPlayerAssets,
  registerPlayerAnimations,
} from '../playerAnimations';
import { loadPickupAssets, registerPickupAnimations } from '../pickups';
import { Sfx } from '../sfx';
import { createTerrainTexture, loadTerrainAssets } from '../terrain';
import { TouchControls } from '../TouchControls';

const COLORS = {
  spike: 0x9aa4ae,
} as const;

/** The Knight is the default for older direct links and tests. */
const DEFAULT_CONFIG: GameConfig = {
  character: 'knight',
  worldMode: 'campaign',
  difficulty: DEFAULT_DIFFICULTY,
  runLevel: 1,
  flyIn: false,
};

const BOSS_DECK_KEY = 'coccodrillo.bossDeck';

function shuffledBossDeck(): BossKind[] {
  const deck = [...RANDOM_BOSSES];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const a = deck[index];
    const b = deck[swap];
    deck[index] = b!;
    deck[swap] = a!;
  }
  return deck;
}

/**
 * Draws from a persisted shuffled deck so a short random session still sees
 * each boss before any repeats. Seeded dev URLs keep their deterministic boss.
 */
function nextRandomBoss(): BossKind | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  try {
    const raw = window.localStorage.getItem(BOSS_DECK_KEY);
    let deck: BossKind[] = raw ? (JSON.parse(raw) as BossKind[]) : [];
    if (
      !Array.isArray(deck) ||
      deck.length === 0 ||
      deck.some((kind) => !RANDOM_BOSSES.includes(kind))
    ) {
      deck = shuffledBossDeck();
    }
    const chosen = deck.pop() ?? RANDOM_BOSSES[0];
    window.localStorage.setItem(BOSS_DECK_KEY, JSON.stringify(deck));
    return chosen;
  } catch {
    return undefined;
  }
}

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

function enemyLabel(kind: EnemyKind): string {
  switch (kind) {
    case 'skeleton':
      return 'Skeleton';
    case 'goblin':
      return 'Goblin';
    case 'slime':
      return 'Slime';
    case 'bat':
      return 'Bat';
    case 'golem':
      return 'Jan Zátka';
    case 'darkKnight':
      return 'Morvane';
    case 'orcBrute':
      return 'Grakka';
  }
}

function projectileLabel(kind: ProjectileKind): string {
  switch (kind) {
    case 'golemOrb':
      return 'A fireball';
    case 'darkOrb':
      return 'A dark bolt';
    case 'enemyBolt':
      return 'A hex bolt';
    case 'axe':
      return 'An axe';
    case 'lightning':
      return 'Lightning';
    case 'chargedLightning':
      return 'Charged lightning';
    case 'reflected':
      return 'A reflected spell';
  }
}

function projectileVisual(kind: ProjectileKind): {
  texture: string;
  tint: number | null;
  scale: number;
  additive: boolean;
} {
  switch (kind) {
    case 'lightning':
      return {
        texture: 'boss-glow',
        tint: 0x9fe8ff,
        scale: 0.075,
        additive: true,
      };
    case 'chargedLightning':
      return {
        texture: 'boss-glow',
        tint: 0xd8f6ff,
        scale: 0.12,
        additive: true,
      };
    case 'axe':
      return {
        texture: 'projectile-axe',
        tint: null,
        scale: 1,
        additive: false,
      };
    case 'darkOrb':
      return {
        texture: 'boss-glow',
        tint: 0xb58cff,
        scale: 0.1,
        additive: true,
      };
    case 'enemyBolt':
      return {
        texture: 'boss-glow',
        tint: 0x9dff9a,
        scale: 0.07,
        additive: true,
      };
    case 'reflected':
      return {
        texture: 'boss-glow',
        tint: 0xffd87a,
        scale: 0.09,
        additive: true,
      };
    case 'golemOrb':
      return {
        texture: 'boss-glow',
        tint: null,
        scale: 0.1,
        additive: true,
      };
  }
}

/**
 * Development shortcuts: ?spawnX=1900 drops the hero at a world x on the
 * ground, ?boss=1 puts them at the arena entrance, and ?world=random
 * generates a seeded random world. These are also used by the smoke tests.
 */
function queryConfig(data?: Partial<GameConfig>): GameConfig {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_CONFIG, ...data };
  }

  const params = new URLSearchParams(window.location.search);
  const characterParam = params.get('character');
  const worldParam = params.get('world');
  const difficultyParam = params.get('difficulty');
  const seedParam = Number(params.get('seed'));

  return {
    character:
      data?.character ??
      (isCharacterKind(characterParam) ? characterParam : DEFAULT_CONFIG.character),
    worldMode:
      data?.worldMode ??
      (isWorldMode(worldParam) ? worldParam : DEFAULT_CONFIG.worldMode),
    difficulty:
      data?.difficulty ??
      (isDifficulty(difficultyParam)
        ? difficultyParam
        : DEFAULT_CONFIG.difficulty),
    seed:
      data?.seed ??
      (Number.isFinite(seedParam) && seedParam > 0 ? seedParam : undefined),
    bossKind: isBossKind(data?.bossKind) ? data.bossKind : undefined,
    runLevel: Math.max(1, Math.floor(data?.runLevel ?? 1)),
    progress: data?.progress,
    flyIn: data?.flyIn ?? false,
  };
}

function resolveCampaignLevel(): Level {
  if (typeof window === 'undefined') {
    return CAMPAIGN_LEVEL;
  }

  const params = new URLSearchParams(window.location.search);
  const boss = params.has('boss');

  if (boss) {
    return { ...CAMPAIGN_LEVEL, spawn: { x: 5240, y: 936 } };
  }

  const spawnX = Number(params.get('spawnX'));
  if (Number.isFinite(spawnX) && spawnX > 0) {
    return { ...CAMPAIGN_LEVEL, spawn: { x: spawnX, y: 936 } };
  }

  return CAMPAIGN_LEVEL;
}

function resolveLevel(config: GameConfig): Level {
  if (config.worldMode === 'random') {
    const bossOverride = isBossKind(config.bossKind)
      ? config.bossKind
      : undefined;
    const level = generateRandomLevel(
      config.seed ?? randomSeed(),
      config.difficulty,
      bossOverride,
      config.runLevel ?? 1,
    );
    if (typeof window === 'undefined') {
      return level;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.has('boss')) {
      const boss = level.enemies.find((enemy) => enemy.boss === true);
      if (boss) {
        return {
          ...level,
          spawn: { x: Math.max(128, boss.x - 380), y: level.spawn.y },
        };
      }
    }
    return level;
  }

  return prepareCampaignLevel(
    resolveCampaignLevel(),
    config.difficulty,
  );
}

/**
 * Render layer only: draws the simulation state, feeds it input, and turns
 * domain events into presentation. All rules live in `src/game/`.
 */
export class GameScene extends Phaser.Scene {
  private readonly loop = new FixedStepLoop(FIXED_TIMESTEP_MS);
  private config: GameConfig = { ...DEFAULT_CONFIG };
  private simulation = new Simulation(CAMPAIGN_LEVEL, {
    character: 'knight',
    worldMode: 'campaign',
    difficulty: DEFAULT_DIFFICULTY,
  });
  private startLevel: Level = CAMPAIGN_LEVEL;
  private jumpBufferUntil = 0;

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
  private islandViews: Phaser.GameObjects.Graphics[] = [];
  private teleportViews: Phaser.GameObjects.Graphics[] = [];
  private heartHud: Phaser.GameObjects.Image[] = [];
  private coinText!: Phaser.GameObjects.Text;
  private guardBadge!: Phaser.GameObjects.Image;
  private guardLabel!: Phaser.GameObjects.Text;
  private berserkLabel!: Phaser.GameObjects.Text;
  private bannerText: Phaser.GameObjects.Text | null = null;
  private projectileViews: Phaser.GameObjects.Image[] = [];

  private guardFx!: Phaser.GameObjects.Graphics;
  private attackFx!: Phaser.GameObjects.Graphics;
  private powerGlow!: Phaser.GameObjects.Image;
  private introGlow!: Phaser.GameObjects.Image;
  private introFlightActive = false;
  private introFlight = { x: 0, y: 0, angle: 0 };
  private introTrail: Phaser.Time.TimerEvent | null = null;

  private debugText!: Phaser.GameObjects.Text;
  private logLines: string[] = [];
  private keyboardHint!: Phaser.GameObjects.Text;
  private deathShade!: Phaser.GameObjects.Rectangle;
  private deathText!: Phaser.GameObjects.Text;

  private cutsceneShade!: Phaser.GameObjects.Rectangle;
  private cutsceneGlow!: Phaser.GameObjects.Image;
  private cutsceneBubble: Phaser.GameObjects.Container | null = null;
  private cutsceneActive = false;
  private cutsceneGeneration = 0;
  private cutsceneBossIndex = -1;
  private cutsceneTweens: Phaser.Tweens.Tween[] = [];

  private endingActive = false;
  private endingComplete = false;
  private endingGeneration = 0;
  private levelTransitioning = false;
  private endingText: Phaser.GameObjects.Text | null = null;
  private endingPrompt: Phaser.GameObjects.Text | null = null;
  private postRunMenu: Phaser.GameObjects.GameObject[] = [];

  private lastPlayerState: PlayerState | null = null;
  private lastPlayerGrounded = true;
  private lastEnemyStates: Array<EnemyState | undefined> = [];

  private readonly sfx = new Sfx();

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyX!: Phaser.Input.Keyboard.Key;
  private keyZ!: Phaser.Input.Keyboard.Key;
  private keyV!: Phaser.Input.Keyboard.Key;
  private keyC!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;
  private keyM!: Phaser.Input.Keyboard.Key;

  constructor(private readonly bus: GameEventBus) {
    super({ key: 'GameScene' });
  }

  init(data?: Partial<GameConfig>): void {
    this.config = queryConfig(data);
  }

  private addHud<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.hudLayer.add(object);
    return object;
  }

  preload(): void {
    loadPlayerAssets(this);
    loadEnemyAssets(this);
    loadPickupAssets(this);
    loadDesertAssets(this);
    loadDecorationAssets(this);
    loadTerrainAssets(this);
  }

  create(): void {
    // The scene may be restarted for a fresh random world; clear old views.
    this.enemyViews = [];
    this.pickupViews = [];
    this.islandViews = [];
    this.teleportViews = [];
    this.projectileViews = [];
    this.heartHud = [];
    this.bannerText = null;
    this.zoomLabel = null;
    this.currentAnimation = '';
    this.lastPlayerState = null;
    this.lastPlayerGrounded = true;
    this.lastEnemyStates = [];
    this.cutsceneActive = false;
    this.cutsceneGeneration += 1;
    this.cutsceneBossIndex = -1;
    this.cutsceneBubble = null;
    this.cutsceneTweens = [];
    this.endingActive = false;
    this.endingComplete = false;
    this.levelTransitioning = false;
    this.endingGeneration += 1;
    this.endingText = null;
    this.endingPrompt = null;
    this.postRunMenu = [];
    this.logLines = [];
    this.introFlightActive = false;
    this.introTrail = null;
    this.loop.reset();
    this.jumpBufferUntil = 0;

    if (
      this.config.worldMode === 'random' &&
      this.config.seed === undefined
    ) {
      this.config = {
        ...this.config,
        seed: randomSeed(),
        bossKind: nextRandomBoss(),
      };
    }

    this.startLevel = resolveLevel(this.config);
    this.simulation = new Simulation(this.startLevel, {
      character: this.config.character,
      worldMode: this.config.worldMode,
      difficulty: this.config.difficulty,
    });
    if (this.config.progress) {
      this.simulation.applyProgress(this.config.progress);
    }

    if (new URLSearchParams(window.location.search).has('guard')) {
      this.simulation.state.player.guardUnlocked = true;
    }

    const definition = characterDefinition(this.config.character);
    const playerArt = PLAYER_ART[this.config.character];

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
    if (this.config.flyIn) {
      this.cameras.main.fadeIn(260, 0, 0, 0);
    }

    this.backdrop = createBackdrop(this, viewWidth, viewHeight, groundY);
    createTerrainTexture(this, level);
    createDecorations(this, level);
    this.islandViews = this.simulation.state.islands.map(() =>
      this.add.graphics().setDepth(4),
    );
    this.teleportViews = this.simulation.state.teleports.map(() =>
      this.add.graphics().setDepth(6),
    );
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

    registerPlayerAnimations(this);
    registerEnemyAnimations(this);
    registerPickupAnimations(this);

    this.playerSprite = this.add
      .sprite(
        0,
        0,
        playerTextureKey(this.config.character, 'idle'),
      )
      .setOrigin(0.5, playerArt.feetY / playerArt.frameHeight)
      .setScale(playerArt.scale)
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
    this.createAxeTexture();
    this.powerGlow = this.add
      .image(0, 0, 'boss-glow')
      .setDepth(12)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    this.introGlow = this.add
      .image(0, 0, 'boss-glow')
      .setDepth(9)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);

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
      } else if (pickup.kind === 'skill') {
        texture = 'boss-glow';
        scale = 0.09;
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
      } else if (pickup.kind === 'skill') {
        const color =
          pickup.skill === 'melee'
            ? 0xffb36a
            : pickup.skill === 'ranged'
              ? 0x8fe8ff
              : pickup.skill === 'jump'
                ? 0xaaffc4
                : 0xff86b8;
        sprite.setBlendMode(Phaser.BlendModes.ADD).setTint(color);

        const x = pickup.position.x;
        const y = pickup.position.y + 30;
        base = this.add.graphics().setDepth(2);
        base.fillStyle(0x161d29, 0.9).fillEllipse(x, y, 68, 20);
        base.lineStyle(2, color, 0.85).strokeEllipse(x, y, 68, 20);
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
    // The hard life cap and the number of HUD heart slots are the same.
    for (let i = 0; i < MAX_PLAYER_HP; i += 1) {
      this.heartHud.push(
        this.addHud(
          this.add
            .image(34 + i * 50, 152, HEART_KEYS[0] ?? 'pickup-heart-0')
            .setScrollFactor(0)
            .setDepth(22)
            .setScale(1.35),
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
        .text(58, 238, definition.extraLabel, {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: '#d8b46a',
        })
        .setScrollFactor(0)
        .setDepth(22)
        .setAlpha(0.25),
    );
    this.berserkLabel = this.addHud(
      this.add
        .text(58, 266, '', {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ff9b6a',
        })
        .setScrollFactor(0)
        .setDepth(22)
        .setVisible(false),
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
          definition.kind === 'mage'
            ? '← → / A D  walk    SPACE  jump    X or Z  lightning    V  hold power    C  bounce    R  restart    M  menu'
            : definition.kind === 'orcBrute'
              ? '← → / A D  walk    SPACE  jump    X  axe    C  berserk    Z  throw while berserk    R  restart    M  menu'
              : '← → / A D  walk    SPACE  jump    X  sword    C  guard    R  restart    M  menu',
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
          fontSize: '30px',
          color: '#e8edf2',
          backgroundColor: 'rgba(11, 13, 16, 0.86)',
          padding: { x: 12, y: 10 },
          lineSpacing: 6,
          wordWrap: { width: 980 },
        })
        .setScrollFactor(0)
        .setDepth(20),
    );

    this.logLines = [];
    this.pushLog(
      `${this.heroLabel()} enters the ${
        this.config.worldMode === 'campaign'
          ? 'campaign'
          : 'random world'
      }.`,
    );
    this.pushLog(
      this.config.worldMode === 'campaign'
        ? 'Reach the mighty Jan Zátka.'
        : `Level ${this.config.runLevel ?? 1} · ${
            this.config.runLevel ?? 1
          } boss${(this.config.runLevel ?? 1) === 1 ? '' : 'es'}.`,
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
      if (this.levelTransitioning) {
        return;
      }
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
    this.keyZ = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.keyV = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.V);
    this.keyC = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.keyR = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.keyM = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);

    keyboard.on('keydown', this.unlockAudio, this);
    this.input.on('pointerdown', this.unlockAudio, this);

    if (showTouchControls) {
      this.keyboardHint.setVisible(false);
      this.touchControls = new TouchControls(
        this,
        {
          showMelee: definition.meleeDamage > 0,
          ranged: definition.rangedRequiresBerserk
            ? 'overJump'
            : definition.rangedDamage > 0
              ? 'side'
              : 'none',
          rangedLabel: definition.kind === 'mage' ? 'CAST' : 'THROW',
          extraLabel: definition.extraLabel,
          power: definition.kind === 'mage',
        },
        this.hudLayer,
      );
      this.touchControls.create();
      this.touchControls.setGuardVisible(
        this.simulation.state.player.guardUnlocked,
      );
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
    this.bus.on('enemyShot', this.onEnemyShot, this);
    this.bus.on('bossDefeated', this.onBossDefeated, this);
    this.bus.on('playerPowerShot', this.onPlayerPowerShot, this);
    this.bus.on('spellBounced', this.onSpellBounced, this);
    this.bus.on('berserkStarted', this.onBerserkStarted, this);
    this.bus.on('spikeRescue', this.onSpikeRescue, this);
    this.bus.on('teleported', this.onTeleported, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.bus.off('playerDied', this.onPlayerDied, this);
      this.bus.off('playerHurt', this.onPlayerHurt, this);
      this.bus.off('enemyHit', this.onEnemyHit, this);
      this.bus.off('enemyDied', this.onEnemyDied, this);
      this.bus.off('attackBlocked', this.onAttackBlocked, this);
      this.bus.off('pickupCollected', this.onPickupCollected, this);
      this.bus.off('bossIntro', this.startBossCutscene, this);
      this.bus.off('bossShot', this.onBossShot, this);
      this.bus.off('enemyShot', this.onEnemyShot, this);
      this.bus.off('bossDefeated', this.onBossDefeated, this);
      this.bus.off('playerPowerShot', this.onPlayerPowerShot, this);
      this.bus.off('spellBounced', this.onSpellBounced, this);
      this.bus.off('berserkStarted', this.onBerserkStarted, this);
      this.bus.off('spikeRescue', this.onSpikeRescue, this);
      this.bus.off('teleported', this.onTeleported, this);
      keyboard.off('keydown', this.unlockAudio, this);
      this.input.off('pointerdown', this.unlockAudio, this);
      this.touchControls?.destroy();
      this.touchControls = null;
      this.cutsceneBubble?.destroy();
      this.cutsceneBubble = null;
      this.sfx.close();
    });

    this.bus.emit('sceneReady');
    if (this.config.flyIn) {
      this.startFlyIn();
    }
    this.render();
  }

  override update(_time: number, delta: number): void {
    if (this.introFlightActive) {
      this.render();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyR)) {
      this.restart();
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyM)) {
      this.returnToMenu();
      return;
    }

    const touch = this.touchControls?.input;

    if (this.touchControls?.consumeJumpTap()) {
      this.jumpBufferUntil = this.time.now + 170;
    }
    const bufferedJump =
      this.time.now < this.jumpBufferUntil && touch?.jumpHeld !== true;

    this.simulation.setInput({
      left:
        this.cursors.left.isDown || this.keyA.isDown || touch?.left === true,
      right:
        this.cursors.right.isDown || this.keyD.isDown || touch?.right === true,
      jumpHeld:
        this.cursors.space.isDown ||
        this.cursors.up.isDown ||
        touch?.jumpHeld === true ||
        bufferedJump,
      attackHeld: this.keyX.isDown || touch?.attackHeld === true,
      rangedHeld: this.keyZ.isDown || touch?.rangedHeld === true,
      guardHeld: this.keyC.isDown || touch?.guardHeld === true,
      powerHeld: this.keyV.isDown || touch?.powerHeld === true,
    });

    this.loop.advance(delta, () => {
      const events = this.simulation.step();
      publishEvents(this.bus, events);
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
    this.pushLog(
      reason === 'spikes'
        ? `${this.heroLabel()} was impaled.`
        : reason === 'fall'
          ? `${this.heroLabel()} fell into the void.`
          : `${this.heroLabel()} was slain.`,
    );
    this.deathText.setText(`${title}\nTAP OR PRESS R TO RETRY`);
    this.deathShade.setVisible(true);
    this.deathText.setVisible(true);
    this.showPostRunMenuButton();
    this.sfx.playerDeath();
  }

  private onEnemyHit(
    kind: EnemyKind,
    damage: number,
    attack: EnemyHitAttack,
  ): void {
    this.sfx.hit();
    this.pushLog(
      `${this.heroLabel()} ${this.attackVerb(attack)} hit ${enemyLabel(kind)} for ${damage}.`,
    );
  }

  private onPlayerHurt(
    _hp: number,
    damage: number,
    source: DamageSource,
  ): void {
    this.sfx.playerHurt();
    this.cameras.main.shake(120, 0.003);
    this.pushLog(
      `${this.damageSourceLabel(source)} hit ${this.heroLabel()} for ${damage}.`,
    );
  }

  private onPickupCollected(
    kind: PickupKind,
    _hp: number,
    _coins: number,
    skill?: SkillKind,
  ): void {
    if (kind === 'coin') {
      this.sfx.coin();
    } else if (kind === 'artifact') {
      this.sfx.heal();
      const definition = characterDefinition(this.config.character);
      const message =
        definition.kind === 'orcBrute'
          ? 'BERSERK + 3 EXTRA LIFE'
          : definition.kind === 'mage'
            ? 'SPELL BOUNCE + POWER UNLOCKED'
            : 'DEFENCE BUBBLE UNLOCKED';
      this.showBanner(message);
      this.pushLog(
        definition.kind === 'orcBrute'
          ? `${this.heroLabel()}: PERMANENT BERSERK +3 life.`
          : definition.kind === 'mage'
            ? `${this.heroLabel()} learned Spell Bounce + POWER.`
            : `${this.heroLabel()} learned the Defence Bubble.`,
      );
      this.touchControls?.setGuardVisible(true);
    } else if (kind === 'skill') {
      this.sfx.heal();
      const banner =
        skill === 'ranged'
          ? 'STORM SIGIL · +2 RANGED'
          : skill === 'vitality'
            ? 'VITALITY SIGIL · +2 LIFE'
            : skill === 'jump'
              ? 'WIND SIGIL · HIGHER JUMPS'
              : 'BLADE SIGIL · +2 MELEE';
      this.showBanner(banner);
      const effect =
        skill === 'ranged'
          ? '+2 ranged'
          : skill === 'vitality'
            ? '+2 life'
            : skill === 'jump'
              ? 'higher jumps'
              : '+2 melee';
      this.pushLog(
        `${this.heroLabel()} absorbed a sigil: ${effect}.`,
      );
    } else {
      this.sfx.heal();
      this.pushLog(`${this.heroLabel()} recovered health.`);
    }
  }

  private onBossShot(): void {
    this.sfx.bossShot();
  }

  private onEnemyShot(): void {
    this.sfx.enemyShot();
  }

  private onSpellBounced(): void {
    this.sfx.reflect();
    this.pushLog(`${this.heroLabel()} bounced the spell back.`);
  }

  private onBerserkStarted(): void {
    this.sfx.berserk();
    this.cameras.main.shake(180, 0.004);
    this.pushLog(`${this.heroLabel()}'s rage ignites.`);
  }

  private onSpikeRescue(damage: number, _hp: number): void {
    this.sfx.playerHurt();
    this.sfx.jump();
    this.cameras.main.shake(140, 0.003);
    this.pushLog(
      damage > 0
        ? `${this.heroLabel()} hit spikes: -${damage} life, vaulted out.`
        : `${this.heroLabel()} vaulted out of the spikes.`,
    );
  }

  private onPlayerPowerShot(damage: number, charge: number): void {
    this.sfx.powerShot();
    this.cameras.main.shake(140, 0.003);
    this.pushLog(
      `${this.heroLabel()} released ${Math.round(charge * 100)}% charged lightning (${damage} dmg).`,
    );
  }

  private onTeleported(by: 'player' | 'enemy'): void {
    this.sfx.teleport();
    if (by === 'player') {
      this.cameras.main.flash(180, 210, 235, 255);
      this.pushLog(`${this.heroLabel()} stepped through a sky portal.`);
    }
  }

  private pushLog(message: string): void {
    this.logLines.push(message);
    if (this.logLines.length > 3) {
      this.logLines.splice(0, this.logLines.length - 3);
    }
    this.debugText.setText(this.logLines.join('\n'));
  }

  private heroLabel(): string {
    const name = characterDefinition(this.config.character).name;
    return name.charAt(0) + name.slice(1).toLowerCase();
  }

  private attackVerb(attack: EnemyHitAttack): string {
    if (attack === 'charged') {
      return 'charged lightning';
    }
    if (attack === 'ranged') {
      return this.config.character === 'mage' ? 'lightning' : 'axe';
    }
    return this.config.character === 'orcBrute' ? 'axe' : 'sword';
  }

  private damageSourceLabel(source: DamageSource): string {
    if (
      source === 'skeleton' ||
      source === 'goblin' ||
      source === 'slime' ||
      source === 'bat' ||
      source === 'golem' ||
      source === 'darkKnight' ||
      source === 'orcBrute'
    ) {
      return enemyLabel(source);
    }

    if (source === 'golemOrb') {
      return `${enemyLabel('golem')}'s spell`;
    }
    if (source === 'darkOrb') {
      return `${enemyLabel('darkKnight')}'s spell`;
    }
    if (source === 'axe') {
      return `${enemyLabel('orcBrute')}'s axe`;
    }

    return projectileLabel(source);
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

  private onEnemyDied(
    kind: EnemyKind,
    damage: number,
    attack: EnemyHitAttack,
  ): void {
    if (!isBossKind(kind)) {
      this.sfx.enemyDie();
    }
    this.pushLog(
      `${this.heroLabel()} ${this.attackVerb(attack)} defeated ${enemyLabel(kind)} for ${damage}.`,
    );
  }

  private onAttackBlocked(): void {
    this.sfx.block();
  }

  private onBossDefeated(kind: EnemyKind): void {
    const bossCount = this.simulation.state.enemies.filter(
      (enemy) => enemy.boss,
    ).length;
    this.pushLog(
      bossCount > 1
        ? `All ${bossCount} bosses have fallen.`
        : `${bossName(kind)} has fallen.`,
    );
    this.bossName.setVisible(false);
    this.bossHud.clear();
    this.enemyHud.clear();
    this.guardFx.clear();
    this.attackFx.clear();
    this.sfx.victory();

    if (this.config.worldMode === 'campaign') {
      this.startCampaignEnding(kind);
      return;
    }

    this.startRandomLevelClear();
  }

  private captureProgress(): PlayerProgress {
    const player = this.simulation.state.player;
    return {
      hp: player.hp,
      maxHp: player.maxHp,
      bonusMelee: player.bonusMelee,
      bonusRanged: player.bonusRanged,
      jumpBonus: player.jumpBonus,
      guardUnlocked: player.guardUnlocked,
      berserkPermanent: player.berserkPermanent,
      coins: this.simulation.state.coins,
    };
  }

  private startRandomLevelClear(): void {
    const cleared = this.config.runLevel ?? 1;
    const next = cleared + 1;
    this.levelTransitioning = true;
    this.endingActive = true;
    this.touchControls?.setVisible(false);
    this.keyboardHint.setVisible(false);
    this.debugText.setVisible(false);

    this.deathText.setText(
      `LEVEL ${cleared} CLEARED\nNEXT: LEVEL ${next} · ${next} BOSS${
        next === 1 ? '' : 'ES'
      }\nPOWERS CARRIED FORWARD`,
    );
    this.deathShade.setVisible(true);
    this.deathText.setVisible(true);

    this.time.delayedCall(1700, () => {
      if (!this.levelTransitioning) {
        return;
      }
      const progress = this.captureProgress();
      this.scene.restart({
        character: this.config.character,
        worldMode: 'random',
        difficulty: this.config.difficulty,
        seed: randomSeed(),
        runLevel: next,
        progress,
        flyIn: true,
      });
    });
  }

  private startCampaignEnding(kind: EnemyKind): void {
    this.endingActive = true;
    this.endingComplete = false;
    this.endingGeneration += 1;
    const generation = this.endingGeneration;

    this.touchControls?.setVisible(false);
    this.keyboardHint.setVisible(false);
    this.debugText.setVisible(false);
    this.bossName.setVisible(false);
    this.bossHud.clear();
    this.hudLayer.each((child: Phaser.GameObjects.GameObject) => {
      const visible = child as Phaser.GameObjects.GameObject & {
        setVisible(value: boolean): unknown;
      };
      visible.setVisible(false);
    });

    const width = this.scale.width;
    const height = this.scale.height;

    const shade = this.addHud(
      this.add
        .rectangle(0, 0, width, height, 0x000000, 1)
        .setOrigin(0, 0)
        .setDepth(40)
        .setAlpha(0)
        .setInteractive(),
    );
    shade.on('pointerdown', () => {
      if (this.endingComplete) {
        this.restart();
      }
    });
    this.endingText = this.addHud(
      this.add
        .text(width / 2, height / 2, '', {
          fontFamily: 'Georgia, serif',
          fontSize: '34px',
          color: '#f3dfa2',
          stroke: '#140d06',
          strokeThickness: 6,
          align: 'center',
          wordWrap: { width: width - 160 },
          lineSpacing: 12,
        })
        .setOrigin(0.5)
        .setDepth(41)
        .setAlpha(0),
    );
    this.endingPrompt = this.addHud(
      this.add
        .text(width / 2, height - 52, '', {
          fontFamily: 'monospace',
          fontSize: '17px',
          color: '#8b98a5',
        })
        .setOrigin(0.5)
        .setDepth(42)
        .setAlpha(0),
    );

    this.tweens.add({
      targets: shade,
      alpha: 0.84,
      duration: 1400,
      ease: 'Sine.easeInOut',
    });

    const boss = this.simulation.state.enemies.find((enemy) => enemy.kind === kind);
    if (boss) {
      const stats = statsFor(boss.kind);
      const x = boss.position.x + stats.width / 2;
      const y = boss.position.y + stats.height / 2;
      this.cameras.main.stopFollow();
      this.cameras.main.pan(x, y, 1600, 'Sine.easeInOut');
      this.cameras.main.zoomTo(
        Math.max(1.85, this.baseZoom),
        1800,
        'Sine.easeInOut',
      );
    }

    this.spawnEndingEmbers();

    const showLine = (
      message: string,
      size: number,
      delay: number,
      hold: number,
      final = false,
    ): void => {
      this.time.delayedCall(delay, () => {
        if (generation !== this.endingGeneration || !this.endingText) {
          return;
        }
        const text = this.endingText;
        this.tweens.killTweensOf(text);
        text
          .setText(message)
          .setFontSize(size)
          .setAlpha(0)
          .setY(height / 2 + 10);
        this.tweens.add({
          targets: text,
          alpha: 1,
          y: height / 2,
          duration: 700,
          ease: 'Sine.easeOut',
          onComplete: () => {
            if (final || !this.endingText) {
              return;
            }
            this.tweens.add({
              targets: text,
              alpha: 0,
              delay: hold,
              duration: 600,
            });
          },
        });
      });
    };

    showLine('THE MIGHTY JAN ZÁTKA HAS FALLEN', 36, 1300, 2300);
    showLine('THE DESERT EXHALES.', 30, 5000, 1400);
    showLine('BUT THE RUINS REMEMBER.', 30, 7100, 1500);
    showLine('COCCODRILLO-II', 64, 9400, 0, true);

    this.time.delayedCall(12600, () => {
      if (generation !== this.endingGeneration || !this.endingText) {
        return;
      }
      this.endingComplete = true;
      this.tweens.killTweensOf(this.endingText);
      this.endingText.setText('THE END').setFontSize(38).setAlpha(1);
      this.endingPrompt?.setText(
        this.touchControls === null
          ? 'PRESS R TO RIDE AGAIN  ·  M FOR MENU'
          : 'TAP TO RIDE AGAIN  ·  MENU',
      );
      this.showPostRunMenuButton();
      this.tweens.add({
        targets: this.endingPrompt,
        alpha: 1,
        duration: 900,
      });
    });
  }

  private spawnEndingEmbers(): void {
    for (let index = 0; index < 18; index += 1) {
      const x = 100 + Math.random() * (this.scale.width - 200);
      const y = this.scale.height + 20 + Math.random() * 120;
      const ember = this.addHud(
        this.add
          .image(x, y, 'boss-glow')
          .setScale(0.02 + Math.random() * 0.03)
          .setTint(0xf0c46a)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(39)
          .setAlpha(0),
      );
      this.tweens.add({
        targets: ember,
        y: y - 360 - Math.random() * 260,
        x: x + (Math.random() - 0.5) * 140,
        alpha: { from: 0, to: 0.5 + Math.random() * 0.35 },
        duration: 3600 + Math.random() * 2600,
        delay: Math.random() * 2600,
        ease: 'Sine.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: ember,
            alpha: 0,
            duration: 700,
            onComplete: () => ember.destroy(),
          });
        },
      });
    }
  }

  private showPostRunMenuButton(): void {
    if (this.postRunMenu.length > 0) {
      return;
    }

    const x = this.scale.width - 98;
    const y = this.scale.height - 42;
    const background = this.addHud(
      this.add
        .rectangle(x, y, 128, 38, 0x10161d, 0.86)
        .setStrokeStyle(2, 0x6a7785, 0.9)
        .setDepth(44)
        .setInteractive({ useHandCursor: true }),
    );
    background.on('pointerdown', () => this.returnToMenu());

    const label = this.addHud(
      this.add
        .text(x, y, 'MENU', {
          fontFamily: 'monospace',
          fontSize: '17px',
          color: '#d7dde3',
        })
        .setOrigin(0.5)
        .setDepth(45),
    );

    this.postRunMenu = [background, label];
  }

  private returnToMenu(): void {
    this.scene.start('MenuScene');
  }

  private startBossCutscene(kind: EnemyKind): void {
    if (this.cutsceneActive) {
      return;
    }

    const enemies = this.simulation.state.enemies;
    const marked = enemies.findIndex(
      (enemy) => enemy.kind === kind && enemy.boss,
    );
    const bossIndex =
      marked >= 0 ? marked : enemies.findIndex((enemy) => enemy.kind === kind);
    const boss = enemies[bossIndex];
    const view = this.enemyViews[bossIndex];
    if (!boss || !view) {
      this.simulation.resumeFromCutscene();
      return;
    }

    this.cutsceneActive = true;
    this.cutsceneGeneration += 1;
    const generation = this.cutsceneGeneration;
    this.cutsceneBossIndex = bossIndex;

    this.hudCamera.setVisible(false);
    this.hudLayer.setVisible(false);
    this.debugText.setVisible(false);
    this.keyboardHint.setVisible(false);
    this.touchControls?.setVisible(false);
    this.bossName.setVisible(false);
    this.bossHud.clear();

    const stats = statsFor(kind);
    const bossX = boss.position.x + stats.width / 2;
    const bossY = boss.position.y + stats.height / 2;

    this.cameraFocus.setPosition(bossX, bossY);
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
      .setPosition(bossX, bossY - stats.height * 0.15)
      .setScale(1.15);
    this.tweens.add({
      targets: this.cutsceneGlow,
      alpha: 0.85,
      duration: 850,
      ease: 'Sine.easeOut',
    });

    const art = ENEMY_ART[kind];
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

    const speech =
      kind === 'golem'
        ? "I'm the Mighty Jan Zátka!\nHow dare you to wake me up!"
        : kind === 'darkKnight'
          ? 'I am Morvane, the Dark Knight.\nNo light survives my blade.'
          : 'GRAKKA SMASH!\nYou small. Grakka big!';

    this.time.delayedCall(950, () => {
      if (generation !== this.cutsceneGeneration) {
        return;
      }
      this.showBossBubble(bossX, boss.position.y, generation, speech);
    });

    this.time.delayedCall(kind === 'golem' ? 5800 : 4700, () => {
      if (generation !== this.cutsceneGeneration) {
        return;
      }
      this.endBossCutscene();
    });
  }

  private showBossBubble(
    x: number,
    bossTopY: number,
    generation: number,
    speech: string,
  ): void {
    const container = this.add.container(x, bossTopY - 50).setDepth(30);
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

    const fullText = speech;
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

    const view = this.enemyViews[this.cutsceneBossIndex];
    if (view) {
      view.sprite
        .setDepth(9)
        .clearTint()
        .setScale(ENEMY_ART[view.kind].scale);
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
    this.endingGeneration += 1;
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.scene.restart({
      character: this.config.character,
      worldMode: this.config.worldMode,
      difficulty: this.config.difficulty,
      // Retry the same generated world; a new one only comes from the menu.
      seed: this.config.seed,
      bossKind:
        this.config.worldMode === 'random'
          ? this.config.bossKind
          : undefined,
      runLevel: this.config.runLevel,
      progress:
        this.config.worldMode === 'random'
          ? this.config.progress
          : undefined,
      flyIn: false,
    });
  }

  private startFlyIn(): void {
    const player = this.simulation.state.player;
    const targetX = player.position.x + PLAYER_WIDTH / 2;
    const targetY = player.position.y + PLAYER_HEIGHT;
    const accent = characterDefinition(this.config.character).accent;

    this.introFlightActive = true;
    this.introFlight.x = targetX - 540;
    this.introFlight.y = targetY - 310;
    this.introFlight.angle = -24;
    this.playerSprite.setDepth(10);
    this.introGlow
      .setVisible(true)
      .setPosition(this.introFlight.x, this.introFlight.y - 42)
      .setTint(accent)
      .setScale(0.13)
      .setAlpha(0.7);

    this.hudCamera.setVisible(false);
    this.hudLayer.setVisible(false);
    this.debugText.setVisible(false);
    this.keyboardHint.setVisible(false);
    this.touchControls?.setVisible(false);

    this.tweens.add({
      targets: this.introFlight,
      x: targetX,
      y: targetY,
      angle: 0,
      duration: 980,
      ease: 'Cubic.easeOut',
      onComplete: () => this.finishFlyIn(),
    });

    this.introTrail = this.time.addEvent({
      delay: 55,
      loop: true,
      callback: () => {
        if (!this.introFlightActive) {
          return;
        }
        const trail = this.add
          .image(
            this.introFlight.x,
            this.introFlight.y - 42,
            'boss-glow',
          )
          .setTint(accent)
          .setDepth(8)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.06)
          .setAlpha(0.5);
        this.hudCamera.ignore(trail);
        this.tweens.add({
          targets: trail,
          alpha: 0,
          scale: 0.01,
          duration: 420,
          onComplete: () => trail.destroy(),
        });
      },
    });
  }

  private finishFlyIn(): void {
    this.introFlightActive = false;
    this.introTrail?.remove();
    this.introTrail = null;
    this.introGlow.setVisible(false);
    this.playerSprite.setRotation(0);

    this.hudCamera.setVisible(true);
    this.hudLayer.setVisible(true);
    this.debugText.setVisible(true);
    this.keyboardHint.setVisible(this.touchControls === null);
    this.touchControls?.setVisible(true);

    const player = this.simulation.state.player;
    const feetX = player.position.x + PLAYER_WIDTH / 2;
    const feetY = player.position.y + PLAYER_HEIGHT;
    for (let index = 0; index < 6; index += 1) {
      const dust = this.add
        .image(feetX, feetY - 4, 'boss-glow')
        .setTint(0xd8c8a8)
        .setDepth(9)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.03)
        .setAlpha(0.7);
      this.hudCamera.ignore(dust);
      this.tweens.add({
        targets: dust,
        x: feetX + (index - 2.5) * 24,
        y: feetY - 28,
        alpha: 0,
        scale: 0.01,
        duration: 420,
        ease: 'Sine.easeOut',
        onComplete: () => dust.destroy(),
      });
    }

    this.sfx.land();
    this.cameras.main.shake(100, 0.002);
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
    const y = 42;
    const minusX = viewWidth - 180;
    const plusX = viewWidth - 48;
    const labelX = viewWidth - 114;

    const create = (x: number, label: string, delta: number): void => {
      const circle = this.addHud(
        this.add
          .circle(x, y, 34, 0x10161d, 0.6)
          .setStrokeStyle(2, 0x7d8b9b, 0.95)
          .setScrollFactor(0)
          .setDepth(23)
          .setInteractive(),
      );
      this.addHud(
        this.add
          .text(x, y, label, {
            fontFamily: 'monospace',
            fontSize: '32px',
            color: '#eef2f6',
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
        .text(labelX, 90, '', {
          fontFamily: 'monospace',
          fontSize: '18px',
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
    const { player, enemies, pickups, projectiles, islands, teleports } =
      this.simulation.state;

    this.renderPlayer(player);
    this.renderEnemies(enemies);
    this.renderIslands(islands);
    this.renderTeleports(teleports);
    this.renderPickups(pickups);
    this.renderProjectiles(projectiles);
    if (!this.endingActive) {
      this.renderHud();
      this.renderCombatFx(player, enemies);
      this.renderBossBar(player, enemies);
      this.updateSfx(player, enemies);
    }

    this.backdrop.update(this.cameras.main.scrollX);

    if (!this.cutsceneActive && !this.endingActive) {
      this.cameraFocus.setPosition(
        player.position.x + PLAYER_WIDTH / 2,
        player.position.y + PLAYER_HEIGHT / 2,
      );
    }
  }

  private renderPlayer(player: Player): void {
    this.touchControls?.setThrowVisible(isBerserk(player));

    if (this.introFlightActive) {
      this.playerSprite.setPosition(
        this.introFlight.x,
        this.introFlight.y,
      );
      this.playerSprite
        .setFlipX(false)
        .setRotation(Phaser.Math.DegToRad(this.introFlight.angle))
        .setAlpha(1);
      this.introGlow.setPosition(
        this.introFlight.x,
        this.introFlight.y - 42,
      );
      const animation = playerAnimationKey(
        player.character,
        'jump',
      );
      if (animation !== this.currentAnimation) {
        this.playerSprite.play(animation, true);
        this.currentAnimation = animation;
      }
      return;
    }

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

    if (isBerserk(player)) {
      this.playerSprite.setTint(0xffa070);
    } else {
      this.playerSprite.clearTint();
    }

    const animation = playerAnimationKey(player.character, player.state);
    if (animation !== this.currentAnimation) {
      this.playerSprite.play(animation, true);
      this.currentAnimation = animation;
    }
  }

  private renderIslands(islands: readonly FloatingIsland[]): void {
    islands.forEach((island, index) => {
      let view = this.islandViews[index];
      if (!view) {
        view = this.add.graphics().setDepth(4);
        this.islandViews[index] = view;
      }

      view.clear();
      view.setPosition(island.x, island.y);

      const w = island.width;
      const shape = (island.shape ?? index) % 3;
      const cx = w / 2;

      if (shape === 0) {
        view
          .fillStyle(0x1d2533, 0.98)
          .fillRoundedRect(0, 0, w, 24, 7);
      } else if (shape === 1) {
        view.fillStyle(0x1d2533, 0.98).fillPoints(
          [
            { x: 0, y: 0 },
            { x: w, y: 0 },
            { x: w - 18, y: 17 },
            { x: w * 0.68, y: 28 },
            { x: cx, y: 20 },
            { x: w * 0.32, y: 28 },
            { x: 18, y: 17 },
          ],
          true,
        );
      } else {
        view.fillStyle(0x1d2533, 0.98).fillPoints(
          [
            { x: 0, y: 0 },
            { x: w, y: 0 },
            { x: w, y: 11 },
            { x: w - 24, y: 21 },
            { x: w - 48, y: 14 },
            { x: w * 0.52, y: 27 },
            { x: 34, y: 18 },
            { x: 0, y: 15 },
          ],
          true,
        );
      }

      view.fillStyle(0x3a475c, 1).fillRect(0, 5, w, 12);
      view.fillStyle(0x53657e, 1).fillRect(0, 5, w, 4);
      view.fillStyle(0x4f7a5d, 1).fillRect(0, 0, w, 5);
      view.fillStyle(0x7fae7a, 0.9).fillRect(0, 0, w, 2);

      if (shape === 0) {
        const teeth = Math.max(2, Math.floor(w / 44));
        for (let tooth = 0; tooth < teeth; tooth += 1) {
          const tx =
            10 + (tooth * (w - 20)) / Math.max(1, teeth - 1);
          view
            .fillStyle(0x18202c, 0.95)
            .fillTriangle(tx - 9, 23, tx + 9, 23, tx, 34);
        }
      }

      // A small rune marks the island as rideable without pointing anywhere.
      view
        .fillStyle(0xd8b46a, 0.7)
        .fillPoints(
          [
            { x: cx, y: 7 },
            { x: cx + 5, y: 12 },
            { x: cx, y: 17 },
            { x: cx - 5, y: 12 },
          ],
          true,
        );

      // A faint glow beneath distinguishes a rideable island from scenery.
      view
        .fillStyle(0x8fd0ff, 0.08)
        .fillEllipse(cx, 30, w * 0.8, 18);
    });

    for (
      let index = islands.length;
      index < this.islandViews.length;
      index += 1
    ) {
      this.islandViews[index]?.setVisible(false);
    }
  }

  private renderTeleports(teleports: readonly Teleport[]): void {
    const pulse = 1 + Math.sin(this.time.now / 260) * 0.06;

    teleports.forEach((portal, index) => {
      let view = this.teleportViews[index];
      if (!view) {
        view = this.add.graphics().setDepth(6);
        this.teleportViews[index] = view;
      }

      const color = portal.y > 600 ? 0x8fd0ff : 0xe8c77a;
      const x = portal.x;
      const y = portal.y;

      view.clear();
      view
        .fillStyle(0x0b1118, 0.82)
        .fillEllipse(x, y, 76, 20);
      view
        .lineStyle(3, color, 0.9)
        .strokeEllipse(x, y, 76, 20);
      view
        .fillStyle(color, 0.12)
        .fillEllipse(x, y - 38, 46 * pulse, 84 * pulse);
      view
        .lineStyle(3, color, 0.8)
        .strokeEllipse(x, y - 38, 46, 84);
      view
        .lineStyle(1, 0xffffff, 0.45)
        .strokeEllipse(x, y - 38, 28, 62);
      view.fillStyle(color, 0.9).fillCircle(x, y - 38, 4);
      view
        .fillStyle(color, 0.7)
        .fillTriangle(x, y - 15, x - 7, y - 3, x + 7, y - 3);
    });

    for (
      let index = teleports.length;
      index < this.teleportViews.length;
      index += 1
    ) {
      this.teleportViews[index]?.setVisible(false);
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
      } else if (view.kind === 'skill') {
        view.sprite.setScale(
          0.085 + Math.sin(this.time.now / 220 + view.phase) * 0.012,
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
      view.clearTint();

      const pulse = Math.sin(this.time.now / 110 + index) * 0.012;
      const visuals = projectileVisual(projectile.kind);
      const chargeBoost =
        projectile.kind === 'chargedLightning'
          ? (projectile.charge ?? 0) * 0.14
          : 0;
      view.setTexture(visuals.texture);
      view.setScale(visuals.scale + chargeBoost + pulse);
      if (visuals.tint !== null) {
        view.setTint(visuals.tint);
      }
      view.setBlendMode(visuals.additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
      view.setRotation(
        projectile.kind === 'axe'
          ? Math.atan2(projectile.velocity.y, projectile.velocity.x)
          : 0,
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
      const active = index < player.maxHp;
      heart.setVisible(active);
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
    if (isBerserk(player)) {
      this.berserkLabel
        .setVisible(true)
        .setText(
          player.berserkPermanent
            ? 'BERSERK'
            : `BERSERK ${player.berserkTime.toFixed(1)}s`,
        );
    } else {
      this.berserkLabel.setVisible(false);
    }
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
      if (enemy.ranged) {
        view.sprite.setTint(0xc7a8ff);
      } else {
        view.sprite.clearTint();
      }

      if (art.anchor === 'feet') {
        view.sprite.setPosition(
          enemy.position.x + stats.width / 2,
          enemy.position.y + stats.height,
        );
      } else {
        let spriteY = enemy.position.y + stats.height / 2;
        if (
          enemy.kind === 'bat' &&
          enemy.state === 'die' &&
          enemy.grounded
        ) {
          const footOffset =
            (art.feetY - art.frameHeight / 2) * art.scale;
          spriteY = enemy.position.y + stats.height - footOffset;
        }
        view.sprite.setPosition(
          enemy.position.x + stats.width / 2,
          spriteY,
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
        enemy.boss ||
        enemy.state === 'die' ||
        enemy.hp >= enemy.maxHp
      ) {
        continue;
      }

      const x = enemy.position.x + stats.width / 2 - 24;
      const y = enemy.position.y - 16;
      this.enemyHud.fillStyle(0x14181f, 0.9).fillRect(x, y, 48, 7);
      this.enemyHud
        .fillStyle(0xc4453d, 1)
        .fillRect(x + 1, y + 1, 46 * (enemy.hp / enemy.maxHp), 5);
    }
  }

  private renderBossBar(player: Player, enemies: readonly Enemy[]): void {
    const bossKind = this.simulation.state.bossKind;
    const marked = enemies.filter((enemy) => enemy.boss);
    const bosses = marked.length
      ? marked
      : enemies.filter(
          (enemy) => bossKind !== null && enemy.kind === bossKind,
        );
    const alive = bosses.filter((enemy) => enemy.state !== 'die');
    const boss = alive
      .slice()
      .sort(
        (a, b) =>
          Math.abs(a.position.x - player.position.x) -
          Math.abs(b.position.x - player.position.x),
      )[0];
    const show =
      !this.cutsceneActive &&
      !this.endingActive &&
      boss !== undefined &&
      this.simulation.state.mode !== 'victory' &&
      player.position.x > boss.position.x - 850;

    this.bossName.setVisible(show);
    this.bossHud.clear();
    if (!show || !boss) {
      return;
    }

    const label =
      this.config.worldMode === 'campaign'
        ? 'THE MIGHTY JAN ZÁTKA'
        : bossName(boss.kind);
    this.bossName.setText(
      alive.length > 1 ? `${label} · ${alive.length} BOSSES` : label,
    );

    const maxHp = boss.maxHp;
    const barWidth = 600;
    const barHeight = 18;
    const x = this.scale.width / 2 - barWidth / 2;
    const y = 56;

    this.bossHud.fillStyle(0x0b0d10, 0.86).fillRect(x - 6, y - 6, barWidth + 12, barHeight + 12);
    this.bossHud.fillStyle(0x3a1d1a, 1).fillRect(x, y, barWidth, barHeight);
    this.bossHud
      .fillStyle(0xb43c32, 1)
      .fillRect(x + 2, y + 2, (barWidth - 4) * (boss.hp / maxHp), barHeight - 4);
    this.bossHud
      .lineStyle(2, 0xd8b46a, 0.85)
      .strokeRect(x - 3, y - 3, barWidth + 6, barHeight + 6);
  }

  private renderCombatFx(player: Player, enemies: readonly Enemy[]): void {
    this.guardFx.clear();
    this.attackFx.clear();
    this.powerGlow.setVisible(false);
    if (this.cutsceneActive) {
      return;
    }
    const definition = characterDefinition(player.character);

    if (player.state === 'guard') {
      const cx = player.position.x + PLAYER_WIDTH / 2;
      const cy = player.position.y + PLAYER_HEIGHT / 2;
      const pulse = 1 + Math.sin(this.time.now / 140) * 0.04;
      const accent = definition.accent;

      this.guardFx
        .fillStyle(accent, 0.1)
        .fillEllipse(cx, cy, 96 * pulse, 138 * pulse);
      this.guardFx
        .lineStyle(2, 0xd8f6ff, 0.55)
        .strokeEllipse(cx, cy, 96 * pulse, 138 * pulse);

      const start = player.facing === 1 ? -0.7 : Math.PI - 0.7;
      const end = player.facing === 1 ? 0.7 : Math.PI + 0.7;
      this.guardFx
        .lineStyle(3, 0xd8f6ff, 0.8)
        .beginPath()
        .arc(cx, cy, 58, start, end)
        .strokePath();

      if (player.character === 'mage') {
        this.guardFx
          .lineStyle(1.5, 0xe4d4ff, 0.55)
          .strokeEllipse(cx, cy, 72 * pulse, 118 * pulse);
      }
    }

    if (player.powerCharge > 0) {
      const cx = player.position.x + PLAYER_WIDTH / 2;
      const cy = player.position.y + PLAYER_HEIGHT / 2;
      const ratio = Math.min(1, player.powerCharge / MAX_POWER_CHARGE);
      const pulse = 1 + Math.sin(this.time.now / 120) * 0.06;
      const radius = (26 + ratio * 58) * pulse;

      this.powerGlow
        .setVisible(true)
        .setPosition(cx, cy)
        .setScale(0.06 + ratio * 0.13)
        .setAlpha(0.45 + ratio * 0.35);
      this.guardFx
        .fillStyle(0x9fe8ff, 0.08 + ratio * 0.08)
        .fillCircle(cx, cy, radius);
      this.guardFx
        .lineStyle(2, 0xd8f6ff, 0.45 + ratio * 0.3)
        .strokeCircle(cx, cy, radius);

      for (let spoke = 0; spoke < 6; spoke += 1) {
        const angle =
          (spoke / 6) * Math.PI * 2 + this.time.now / 240;
        this.guardFx
          .lineStyle(2, 0xbdf3ff, 0.4 + ratio * 0.4)
          .lineBetween(
            cx + Math.cos(angle) * radius * 0.55,
            cy + Math.sin(angle) * radius * 0.55,
            cx + Math.cos(angle) * radius,
            cy + Math.sin(angle) * radius,
          );
      }
    } else {
      this.powerGlow.setVisible(false);
    }

    if (isBerserk(player)) {
      const cx = player.position.x + PLAYER_WIDTH / 2;
      const cy = player.position.y + PLAYER_HEIGHT / 2;
      const pulse = 1 + Math.sin(this.time.now / 90) * 0.08;
      this.guardFx
        .fillStyle(0xff4d2e, 0.09)
        .fillEllipse(cx, cy, 110 * pulse, 150 * pulse);
      this.guardFx
        .lineStyle(3, 0xff8a5a, 0.55)
        .strokeEllipse(cx, cy, 104 * pulse, 144 * pulse);
    }

    if (player.state === 'attack' && getAttackPhase(player) === 'active') {
      const cx = player.position.x + PLAYER_WIDTH / 2;
      const cy = player.position.y + PLAYER_HEIGHT * 0.45;
      const start = player.facing === 1 ? -0.95 : Math.PI - 0.95;
      const end = player.facing === 1 ? 0.95 : Math.PI + 0.95;
      const color = player.character === 'orcBrute' ? 0xffb08a : 0xdff2ff;

      this.attackFx
        .lineStyle(7, color, 0.75)
        .beginPath()
        .arc(cx, cy, 64, start, end)
        .strokePath();
      this.attackFx
        .lineStyle(2, 0xffffff, 0.9)
        .beginPath()
        .arc(cx, cy, 54, start, end)
        .strokePath();

      if (player.character === 'orcBrute') {
        for (const offset of [-30, 30]) {
          this.attackFx
            .lineStyle(5, color, 0.5)
            .beginPath()
            .arc(cx, cy + offset, 56, start, end)
            .strokePath();
        }
      }
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
        if (player.attackKind === 'ranged') {
          this.sfx.cast();
        } else {
          this.sfx.swing();
        }
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

  private createAxeTexture(): void {
    if (this.textures.exists('projectile-axe')) {
      return;
    }

    const size = 48;
    const canvas = this.textures.createCanvas('projectile-axe', size, size);
    if (!canvas) {
      return;
    }

    const context = canvas.getContext();
    context.clearRect(0, 0, size, size);
    context.save();
    context.translate(size / 2, size / 2);

    // Handle pointing right, so rotation can follow the throw arc.
    context.strokeStyle = '#7a4b28';
    context.lineWidth = 6;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(-19, 0);
    context.lineTo(8, 0);
    context.stroke();

    context.fillStyle = '#9aa8b5';
    context.beginPath();
    context.moveTo(4, -15);
    context.lineTo(21, -6);
    context.lineTo(21, 6);
    context.lineTo(4, 15);
    context.lineTo(8, 0);
    context.closePath();
    context.fill();
    context.strokeStyle = '#d7e2ea';
    context.lineWidth = 2;
    context.stroke();

    context.restore();
    canvas.refresh();
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
