# Code Structure After Refactoring

## Overview
This document describes the modular structure that keeps large files (notably
`viewWebGPU.ts`, `controller.ts`, `sound.ts`, and `game.ts`) manageable. The
project guideline is **keep every source file under 1000 lines (prefer <800)**.

The `View` class in `viewWebGPU.ts` is a thin orchestrator: it owns the GPU
resource fields and the `IView` surface, but delegates device/canvas lifecycle,
pipeline construction, texture work, per-frame rendering, materials, premium
visuals, and game-event effects to focused helper modules.

## Directory Structure

```
src/
├── viewWebGPU.ts            # Thin View orchestrator implementing IView (~670 lines)
├── controller.ts           # Thin Controller orchestrator (~816 lines)
├── controller/             # Game loop + HUD DOM bridge
│   ├── gameLoop.ts         # RAF scheduling, gravity step, per-frame pipeline
│   └── hudBridge.ts        # Mode HUD, combo display, pause menu DOM
├── sound.ts                # Procedural audio facade (Web Audio API)
├── game.ts                 # Thin Game orchestrator (~829 lines)
├── webgpu/                 # WebGPU rendering subsystem
│   ├── gpuContext.ts       # Device/canvas acquisition + resize lifecycle
│   ├── viewPipelines.ts    # Block-texture load + pipeline/buffer/bind-group setup
│   ├── viewTextures.ts     # Texture helpers, mipmaps, render-target recreation
│   ├── viewFrostedGlass.ts # Frosted-glass backboard pipeline + uniforms
│   ├── viewMaterials.ts    # Material/theme management, piece render, wireframe
│   ├── viewPremium.ts      # Premium presets, reactive hooks, bloom/FXAA/CRT toggles
│   ├── viewGameEvents.ts   # Game event → visual effect handlers
│   ├── viewRenderLoop.ts   # Per-frame render pass execution
│   ├── viewPlayfield.ts    # Playfield block uniform updates
│   ├── viewUniforms.ts     # Uniform packing helpers
│   ├── renderers/          # blockRenderer, backgroundRenderer, postProcessor
│   ├── shaders/            # WGSL shader modules split by category (see below)
│   ├── shaders.ts          # Barrel re-export of shaders/ (import compatibility)
│   ├── compute.ts          # GPU compute shaders (particle physics, line detect)
│   ├── particles.ts        # GPU-driven particle system
│   ├── jellyfishParticles.ts # Bioluminescent jellyfish particle system
│   ├── bloomSystem.ts      # Multi-pass bloom
│   ├── effects.ts          # Effect parameter wrappers (shockwave, glitch, …)
│   ├── geometry.ts         # 3D mesh data (cube, quad, grid)
│   ├── themes.ts           # Color palette definitions
│   ├── blockTexture*.ts    # Block texture config + tile extraction
│   ├── reactiveVideo.ts    # Reactive video background
│   ├── reactiveMusic.ts    # Reactive music system
│   └── renderMetrics.ts    # Render coordinate constants
├── game/                   # Game logic modules
│   ├── pieces.ts           # Tetromino definitions and bag randomizer
│   ├── collision.ts        # Collision detection (CPU fallback)
│   ├── rotation.ts         # SRS rotation + wall kicks
│   ├── scoring.ts          # Score, combos, back-to-back, all-clear
│   ├── lineUtils.ts        # Line clear and playfield shifting
│   ├── stateProjection.ts  # Game state projection helpers
│   ├── lockDelay.ts        # Lock delay, coyote time, extended placement
│   ├── tSpin.ts            # T-spin corner evaluation
│   ├── spawnHold.ts        # Next queue, hold swap, piece spawn after lock
│   └── hardDrop.ts         # Shared hard-drop path (sync + async line clear)
├── input/                  # Input helpers
│   ├── touchControls.ts    # Mobile touch overlay
│   ├── dasArr.ts           # DAS/ARR repeat + SOCD cleaning + soft drop
│   └── inputBuffer.ts      # Rotation/hold/move input buffering
├── view/                   # IView contract + createView factory
├── viewCpp/                # Emscripten C++ renderer adapter (opt-in)
└── viewWebGL2/             # WebGL2 fallback renderer
```

## viewWebGPU orchestration split

`viewWebGPU.ts` no longer performs device init or pipeline construction inline.

### `webgpu/gpuContext.ts`
Device and canvas lifecycle, plus adapter/device policy and resilience.
- `acquireGpuContext(view)` — requests the adapter with a resolved
  `powerPreference` (`?gpu=low|high` / `tetris_gpu`), logs `adapter.info`,
  requests a labeled device with feature-detected optional features
  (`shader-f16`, `timestamp-query`, texture-compression, …; never hard-required),
  configures the canvas, and attaches lifecycle handlers. Returns the preferred
  presentation format (or `null` if no adapter/device is available).
- `resolvePowerPreference()` / `selectOptionalFeatures()` / `requestGpuAdapterAndDevice()` — pure or shared policy helpers (see `tests/gpu-context.test.ts`). The C++ renderer (`CppRendererLoader`) uses the same `requestGpuAdapterAndDevice()` path for `preinitializedWebGPUDevice`.
- `attachDeviceLifecycleHandlers(view)` — wires `device.lost` recovery (overlay
  + single `preRender` re-init, then fatal overlay + `tetris-webgpu-device-lost`
  event) and an `uncapturederror` logger.
- `pushGpuErrorScopes` / `popGpuErrorScopes` — validation/OOM error scopes around
  pipeline creation for actionable WGSL failures.
- `resizeGpuContext(view)` — recomputes canvas backing size (with render scale),
  reconfigures the context, and resizes the post-processor and bloom system.

### `webgpu/viewPipelines.ts`
GPU resource construction, invoked once from `View.preRender()`.
- `loadBlockTexture(view)` — loads the authored `block.png` tile, generates
  mipmaps, and falls back to a procedural then solid texture on error.
- `initGpuResources(view, presentationFormat)` — builds every render/compute
  pipeline (main block, background, video, grid, particle, post-process,
  line-clear), their GPU buffers, render targets, pass descriptors, the bloom
  system, camera matrices, and the per-block bind-group cache.

`View.preRender()` is now just:
```ts
const presentationFormat = await acquireGpuContext(this);
if (!presentationFormat) return;
await loadBlockTexture(this);
await initGpuResources(this, presentationFormat);
```

## Shaders

WGSL shaders live in `src/webgpu/shaders/`, split by category, and are
re-exported through `src/webgpu/shaders.ts` (a barrel kept for import
compatibility):
- `postProcess.ts` — lens distortion, shockwave, bloom, glitch, chromatic aberration
- `particle.ts` — particle vertex/fragment shaders
- `grid.ts` — Tetris grid block renderer
- `background.ts` — procedural/video background shaders
- `main.ts` — primary 3D block shader (lighting, texture atlas, PBR)

Add a new shader category as a new file and re-export it from `shaders/index.ts`.

## Game modules

`Game` ([`game.ts`](../src/game.ts)) is a thin orchestrator: state lives on the
class, but lock delay, T-spin detection, spawn/hold handoff, and hard drop
delegate to focused helpers under `game/`.

### `game/lockDelay.ts`
- `tickLockDelaySync` / `tickLockDelay` — deduplicated lock-delay tick used by
  `Game.update()` (CPU/replay) and `Game.updateAsync()` (GPU line clear).
- `handleMoveReset` — coyote time and extended-placement reset counter.
- `finishLockUpdate` — scoring, mode hooks, and next-piece spawn after lock.

### `game/tSpin.ts`
- `evaluateTSpin` — 3-of-4 corner occupancy check; reuses pre-allocated corner
  slots on `Game` to avoid GC.

### `game/spawnHold.ts`
- `refillNextQueue`, `spawnNextPiece`, `performHold` — bag queue refill, garbage
  injection before spawn, and hold swap.

### `game/hardDrop.ts`
- `performHardDrop` — shared body for `hardDrop()` / `hardDropAsync()`.

Existing modules: `pieces.ts` (bag randomizer), `collision.ts` (CPU fallback),
`rotation.ts` (SRS + wall kicks), `scoring.ts`, `lineUtils.ts`,
`stateProjection.ts`. Collision runs in WASM when available
(`wasm/WasmCore.ts`), with `game/collision.ts` as the JS fallback.

## Controller orchestration split

Follows the same pattern as the [viewWebGPU split (#399)](https://github.com/konstantin84ukr/Tetris_WebGPU/issues/399):
[`controller.ts`](../src/controller.ts) keeps the public API (`play`, `pause`,
`handleKeyDown`, replay hooks) and wires keyboard/touch events; helpers own
repeatable mechanics.

### `input/dasArr.ts`
- `processDasArrInput` — SOCD last-input priority, horizontal DAS/ARR, soft-drop
  repeat. Used by `Controller.handleInput`; `VersusController` keeps its own loop
  for now (different threshold logic).

### `input/inputBuffer.ts`
- `processInputBuffer` — move/rotate/hold/hard-drop buffer windows from
  `INPUT_CONFIG`.

### `controller/gameLoop.ts`
- `startGameLoop` / `stopGameLoop` — `requestAnimationFrame` lifecycle.
- `stepGravity` — exponential gravity stepping (matches replay simulator math).
- `runControllerFrame` — per-frame pipeline: replay clock, input, gravity,
  `game.updateAsync`, audio/view/a11y, render.

### `controller/hudBridge.ts`
Pure DOM updates: mode HUD, high score label, combo display/milestones, pause menu.

## Benefits

1. **Separation of concerns** — each module has a single, clear responsibility.
2. **Smaller blast radius** — GPU setup, rendering, and effects change
   independently, reducing merge conflicts.
3. **Easier testing** — modules are exercised independently (see `tests/`).
4. **Maintainability** — no file exceeds the 1000-line guideline.
