Project brief: "Coccodrillo-II" — a cinematic rotoscoped platformer (TypeScript)

Genre & feel
Build a 2D cinematic platformer in the spirit of Prince of Persia (1989), Another World, and Flashback. This is not a run-and-gun or reflex platformer. Movement must feel weighty, deliberate, and animation-committed: the player cannot change direction mid-air, every jump and climb has startup and recovery frames, and a single misstep (spikes, a fall, a sword hit) is fatal. Progress comes from precision, memorization, and environmental puzzle-solving (levers, pressure plates, loose tiles, gates, trapdoors). Sword combat, if included later, should be simple timing-based duels (advance, retreat, strike, parry), not combos.

Technical stack (keep it consistent with my existing experience)

Language: TypeScript (strict mode)

Build/dev server: Vite 5

Rendering: Phaser 3 (2D, WebGL/Canvas). Use Phaser for rendering, input, and scene management only.

Game logic: Pure TypeScript modules, no Phaser imports inside src/game/. This keeps the core testable and lets you unit-test movement and collision without a browser.

State bridge: eventemitter3 to connect logic → render (e.g. playerMoved, playerDied, leverPulled).

Testing: Vitest for the pure logic layer.

Hosting: Vercel (static build, dist output). Keep vite.config.ts and vercel.json compatible with that.

Architecture rules (important — follow strictly)

src/game/ — pure logic: player state machine (idle, walk, jump, climb, fall, die), fixed-timestep physics, tile-based collision, trap/lever logic. No Phaser.

src/render/ — Phaser scenes and sprite/animation handling only. Reads game state and draws it; translates input into game commands. No game rules here.

src/bridge/ — event emitter connecting the two.

src/assets/ — sprite sheets and tilemaps. I will provide the rotoscoped figure graphics; use placeholder rectangles or simple shapes until then.

Core technical pillars

Fixed-timestep physics loop (e.g. 60 Hz) decoupled from render rate, so movement and collision are deterministic and frame-perfect.

Animation state machine with explicit commitment: a jump or climb cannot be interrupted mid-animation; input is buffered or ignored per state rules.

Tile-based level collision with solid tiles, spikes, and interactive tiles (levers, loose floor, gates). Levels defined as data (JSON/TS tilemaps), not hard-coded.

Milestone 1 (build only this first, then stop and let me review)

Scaffold Vite + TS + Phaser + eventemitter3 + Vitest, matching the stack above.

One Phaser scene showing a small tile-based room (e.g. 20×12 tiles) with a floor, a few platforms, and spikes.

A player rectangle with a minimal state machine: idle, walk (left/right), jump (committed arc, no mid-air turning), and death on spike contact or falling off-screen.

Fixed-timestep loop running the player physics; Phaser renders the result.

One unit test for the player state machine (e.g. "cannot change direction mid-jump" and "spike contact triggers death").

Constraints

Build incrementally, one small commit-sized change at a time, and wait for my confirmation between steps.

Prefer small, readable files over large ones.

Use strict TypeScript types for all game entities (Player, Tile, Level, GameState).

If a Phaser or package API is unclear, check its types/README first rather than guessing; if you can't verify it, tell me instead of inventing an API.

Do not add features beyond Milestone 1 until I confirm.

First task: scaffold the project with the stack and folder structure above, get an empty Phaser canvas running, and set up the fixed-timestep loop skeleton (no gameplay yet). Then stop.