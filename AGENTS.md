# AGENTS.md

## Project Overview

**Tetris_WebGPU** is a browser-based Tetris implementation designed to showcase high-performance web graphics. It targets modern WebGPU-enabled browsers and features advanced visual effects including particle systems, dynamic lighting, PBR material shaders, post-processing (bloom, chromatic aberration, shockwave, film grain, CRT, FXAA), and level-based background video portals.

* **Live Demo:** https://konstantin84ukr.github.io/Tetris_WebGPU/
* **Frontend:** TypeScript 4.9 + Vite 4.
* **Rendering:** WebGPU (WGSL shaders). Not WebGL.
* **Game Logic:** Hybrid TypeScript and AssemblyScript 0.27 (WASM).
* **Audio:** Web Audio API (procedural synthesis + sample playback).
* **Math:** `gl-matrix` 3.4 for 3D transformations.
* **Testing:** Vitest 1.x.

## Architecture

The project follows a classic **MVC** pattern:

* **Model (`src/game.ts` + `src/game/`)**: Manages the 10×20 playfield, piece generation (7-bag randomizer), SRS rotation with wall kicks, collision detection, lock delay (extended placement / Infinity-like behavior with up to 25 resets), T-spin detection, scoring, combos, back-to-backs, and all-clears.
* **View (`src/viewWebGPU.ts` + `src/webgpu/`)**: Handles the entire WebGPU render loop, shader pipelines, buffer management, particle systems, visual effects, theme switching, premium visuals (FXAA, film grain, CRT, supersampling), reactive video/audio, and DOM synchronization for UI overlays.
* **Controller (`src/controller.ts` + `src/input/`)**: Bridges input and game logic. Runs a `requestAnimationFrame` loop, handles DAS/ARR (Delayed Auto Shift / Auto Repeat Rate), input buffering, SOCD cleaning, and touch controls for mobile devices.

### TypeScript / WASM Hybrid

* **AssemblyScript core:** `assembly/index.ts` exports a fast collision check (`checkPieceCollision`) that reads directly from shared linear memory.
* **Bridge:** `src/wasm/WasmCore.ts` creates a `WebAssembly.Memory` (initial 1 page = 64KB), loads `release.wasm`, and exposes an `Int8Array` view (`playfieldView`) of the first 200 bytes.
* **Fallback:** If WASM fails to load, the app falls back to a pure-JS collision path so it does not crash. Tests explicitly verify that the WASM path is active.
* **Playfield storage:** A flat 1D `Int8Array` of 200 cells (10 columns × 20 rows). The game logic uses Y-down coordinates (row 0 is the top).

### Render Pipeline (simplified)

1. Background pass (procedural shader or HTML `<video>` portal)
2. Playfield pass (3D blocks with texture atlas, lighting, and materials)
3. Particle pass (CPU-simulated, GPU-rendered point sprites)
4. Post-process pass (bloom, lens distortion, chromatic aberration, glitch, scanlines, FXAA, film grain, CRT)

## Directory Structure

```
/assembly              # AssemblyScript source (compiles to WASM)
  index.ts             # Collision kernel + shared memory layout
  tsconfig.json        # Extends assemblyscript/std/assembly.json

/src
  index.ts             # App entry point (UI injection, MVC wiring, theme setup)
  game.ts              # Main game engine (~650 lines)
  controller.ts        # Input + game loop (~860 lines)
  viewWebGPU.ts        # Main WebGPU renderer (~1160 lines)
  sound.ts             # Sound manager + music manager (Web Audio API, procedural music)
  /game                # Game logic modules
    pieces.ts          # Tetromino definitions, 7-bag randomizer
    rotation.ts        # SRS rotation tables + wall kicks
    collision.ts       # JS collision detector (fallback path)
    scoring.ts         # Scoring, combos, back-to-back, all-clear, high scores
    lineUtils.ts       # Line clearing + playfield shifting
    stateProjection.ts # Ghost piece / playfield projection helpers
  /webgpu              # Rendering subsystem
    shaders/           # WGSL shader modules (~3,000 lines) split by purpose
    shaders.ts         # Barrel re-export for backward compatibility
    geometry.ts        # Cube, full-screen quad, grid line meshes
    themes.ts          # Color palette definitions
    materials.ts       # PBR material definitions
    particles.ts       # Particle system CPU logic
    jellyfishParticles.ts
    effects.ts         # Visual effect parameter wrappers
    compute.ts         # GPU compute shaders for particle physics
    bloomSystem.ts     # Bloom post-process subsystem
    reactiveVideo.ts   # Level-based background video manager
    reactiveMusic.ts   # Reactive audio-visual hooks
    viewGameEvents.ts  # Event → visual effect dispatch
    viewPlayfield.ts   # Playfield block rendering helpers
    viewMaterials.ts   # Material uniform updates
    viewUniforms.ts    # Per-frame uniform updates
    viewTextures.ts    # Texture loading, fallback, mipmap generation
    viewPremium.ts     # Premium visuals (FXAA, film grain, CRT, supersampling)
    viewFrostedGlass.ts
    renderMetrics.ts   # World-space coordinate constants
    blockTexture.ts    # Procedural block texture generation
    textureSampling.ts # WGSL texture sampling code generation
    chaosMode.ts       # Chaos mode visual effects
    particleMaterialInteraction.ts
    postProcessUniforms.ts
    debug_shaders.ts
    materials.test.ts  # Inline co-located tests
  /wasm
    WasmCore.ts        # WASM loader, memory view, collision API wrapper
  /input
    touchControls.ts   # Mobile touch overlay controls
  /effects
    lineClearAnimation.ts
    lineFlashEffect.ts
    musicGenerator.ts  # Procedural music generator
    gameOverAnimation.ts
    levelUpCelebration.ts
  /config
    audioConfig.ts
    gameConfig.ts
    renderConfig.ts
  /utils
    logger.ts          # Categorized logging (render, game, wasm, etc.)

/tests                 # Vitest test suites
  game.test.ts         # WASM + Game integration tests
  game-utils.test.ts   # Line clear + projection helpers
  render-metrics.test.ts
  block-texture.test.ts
  shader-optimizations.test.ts
  texture-sampling.test.ts

/public                # Static assets served by Vite
  release.wasm         # Copied here by asbuild:release
  block.png            # Block texture atlas
  block-2.png
  assets/              # Additional runtime assets (videos, etc.)

/css
  style.css
  themes.css

deploy.py              # SFTP deployment script
index.html             # Vite entry HTML
vite.config.ts         # Vite config (base: '/tetris-webgpu/')
package.json           # npm scripts and dependencies
tsconfig.json          # TypeScript config (strict, ESNext, .js imports)
```

## Build & Development Commands

```bash
# Dev server (Vite HMR for /src, but NOT for /assembly)
npm run dev

# Compile AssemblyScript to WASM (debug)
npm run asbuild:debug

# Compile AssemblyScript to WASM (release) → build/release.wasm + public/release.wasm
npm run asbuild:release

# Full production build (WASM + Vite frontend)
npm run build:all

# Run unit tests (Vitest). pretest automatically compiles WASM first.
npm test
```

## Key Directives & Conventions

### 1. WASM Build is Manual and Mandatory
**Vite does NOT compile AssemblyScript.**
* If you edit anything in `/assembly`, you **must** run `npm run asbuild:release` before testing or deploying.
* The browser loads `public/release.wasm`, not `assembly/index.ts`.
* `npm test` runs `pretest` which attempts `asbuild:release`, but do not rely on this during iterative dev.

### 2. Import Extensions
All TypeScript files use **`.js` extensions** in their `import` statements, even when importing `.ts` files. This matches the project's `tsconfig.json` (`module: "ESNext"`, `moduleResolution: "Node"`) and Vite's expectations.

```typescript
// Correct
import Game from './game.js';

// Incorrect
import Game from './game';
```

### 3. Strict TypeScript
`tsconfig.json` enables:
* `strict: true`
* `noUnusedLocals: true`
* `noUnusedParameters: true`
* `noImplicitReturns: true`
* `isolatedModules: true`

Unused variables and implicit returns will fail compilation.

### 4. GC Avoidance / Hot-Path Optimization
The game loop and render loop are optimized to minimize garbage collection:
* **Pre-allocated arrays/objects** in `Game` (`collisionCoordsCache`, `_updateResult`, `_tempPiece`, `_tSpinCorners`, etc.).
* **Bound method caching** to avoid per-frame closure allocation.
* **Batched uniform buffer writes** in `viewWebGPU.ts` (reduced from ~800 `writeBuffer` calls per frame to a single batched write).

When modifying hot paths, avoid creating new objects inside `update()` or `Frame()`.

### 5. Coordinate System
* **Grid:** 10 columns × 20 rows.
* **Y-down:** `y = 0` is the top of the board; `y` increases downward.
* **SRS wall kicks** are adapted to this Y-down system. Standard wiki tables often assume Y-up, so the code manually inverts Y offsets.

### 6. Shader Uniform Offsets are Hardcoded
`viewWebGPU.ts` contains many hardcoded byte offsets and struct sizes for WebGPU uniform buffers (e.g., `size: 208`, `offset: 64`). If you change a WGSL struct layout in any shader, you **must** update the matching CPU-side offset calculations or the renderer will corrupt uniforms.

### 7. Canvas Transparency Requirement
The WebGPU canvas **must** use `alphaMode: 'premultiplied'` and the background render pass **must** clear with `alpha: 0.0`. This allows the HTML `<video>` background element to show through behind the board.

## Testing Instructions

* **Runner:** Vitest (`vitest run`)
* **WASM dependency:** `pretest` runs `npm run asbuild:release || true`, so tests that rely on WASM will fail if the WASM binary is missing or invalid.
* **Mocking:** `tests/game.test.ts` mocks `global.fetch` to load `build/release.wasm` from disk via `fs.readFileSync`.
* **WASM strictness:** The game integration test intentionally throws if the WASM memory buffer is ≤ 200 bytes, ensuring the JS fallback is not accidentally used during CI.
* **Inline tests:** Some modules (e.g., `src/webgpu/materials.test.ts`) keep tests co-located with source.

## Deployment

* **Script:** `deploy.py`
* **Prerequisite:** Run `npm run build:all` first to populate `/dist`.
* **Target:** Uploads `/dist` via SFTP to `test.1ink.us/tetris-webgpu`.
* **Security note:** `deploy.py` contains a hardcoded password. Treat this file as sensitive and do not expose it in public repositories.

## Security Considerations

* **Hardcoded credentials:** `deploy.py` contains a plaintext SFTP password (`GoogleBez12!`). Do not commit this file to public repositories without sanitizing it.
* **LocalStorage:** High scores are stored in `localStorage` (`tetris_highscores`). No sensitive data is persisted.
* **WASM fetch:** The app fetches `./release.wasm` or `/release.wasm` from the same origin. Ensure the server serves the correct MIME type (`application/wasm`).
* **Debug mode:** Developers can enable verbose logging by setting `localStorage.setItem('tetris_debug', 'true')` and refreshing.

## Common Pitfalls

1. **"My WASM changes aren't showing up"**  
   You forgot `npm run asbuild:release`. The dev server serves `public/release.wasm`, not the source in `/assembly`.

2. **WebGPU init failure / black screen**  
   Ensure the browser supports WebGPU (Chrome/Edge 113+ or Safari Technology Preview). The game requires `navigator.gpu` to be present.

3. **Tests failing with "Using JS fallback"**  
   The `build/release.wasm` binary is missing or corrupt. Run `npm run asbuild:release` before `npm test`.

4. **Laggy or broken auto-repeat movement**  
   Movement logic lives inside the animation frame (`controller.ts` → `handleInput`), not in `keydown` event listeners. Do not move it to event handlers.

5. **Background video not visible**  
   Check that the WebGPU canvas clear color has `alpha: 0.0` and `alphaMode: 'premultiplied'`. Any opaque clear will hide the video portal.
