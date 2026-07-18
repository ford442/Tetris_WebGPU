# AGENTS.md

## Project Overview

**Tetris_WebGPU** is a browser-based Tetris implementation designed to showcase high-performance web graphics. It targets modern WebGPU-enabled browsers and features advanced visual effects including particle systems, dynamic lighting, PBR material shaders, post-processing (bloom, chromatic aberration, shockwave, film grain, CRT, FXAA), and level-based background video portals.

* **Live Demo:** https://konstantin84ukr.github.io/Tetris_WebGPU/
* **Frontend:** TypeScript 4.9 + Vite 6.
* **Testing:** Vitest 3.x.
* **Rendering:** WebGPU (WGSL shaders) primary; WebGL2 fallback; optional Emscripten C++ (`webgpu-cpp`).
* **Game Logic:** Hybrid TypeScript and AssemblyScript 0.27 (WASM) for collision; C++ renderer is rendering-only.
* **Audio:** Web Audio API (procedural synthesis + sample playback).
* **Math:** `gl-matrix` 3.4 for 3D transformations.

## Architecture

The project follows a classic **MVC** pattern:

* **Model (`src/game.ts` + `src/game/`)**: Manages the 10×20 playfield, piece generation (7-bag randomizer), SRS rotation with wall kicks, collision detection, lock delay (extended placement / Infinity-like behavior with up to 25 resets), T-spin detection, scoring, combos, back-to-backs, and all-clears.
* **View (`src/viewWebGPU.ts` + `src/webgpu/` + `src/view/`)**: Handles render loop selection via `createView()`. Default path is WebGPU; WebGL2 and opt-in C++ (`src/viewCpp/EmscriptenView.ts`) implement the shared `IView` contract.
* **Controller (`src/controller.ts` + `src/input/`)**: Bridges input and game logic. Runs a `requestAnimationFrame` loop, handles DAS/ARR (Delayed Auto Shift / Auto Repeat Rate), input buffering, SOCD cleaning, and touch controls for mobile devices.

### TypeScript / WASM Hybrid

* **AssemblyScript core:** `assembly/index.ts` exports board-indexed collision, line clear, and hard-drop kernels that read/write shared linear memory.
* **Memory layout (480 bytes used of 64 KiB page):**
  * Board 0 playfield: bytes 0–199
  * Board 1 playfield: bytes 200–399
  * Board 0 scratch (row flags + index staging): bytes 400–439
  * Board 1 scratch: bytes 440–479
* **Bridge:** `src/wasm/WasmCore.ts` creates a `WebAssembly.Memory` (initial 1 page = 64KB), loads `release.wasm`, and exposes `getPlayfieldView(boardId)` / `playfieldView` (board 0 alias).
* **Fallback:** If WASM fails to load, the app falls back to a pure-JS collision path per game instance so it does not crash. Tests explicitly verify that the WASM path is active.
* **Playfield storage:** A flat 1D `Int8Array` of 200 cells (10 columns × 20 rows) per board. Single-player uses board 0; local versus uses board 0 (P1) and board 1 (P2). The game logic uses Y-down coordinates (row 0 is the top).

### C++ Renderer (opt-in, Emscripten)

Parallel to `assembly/` — **not** used for game logic or collision.

* **Source:** `cpp/src/` → `public/cpp/tetris_renderer.{js,wasm}`
* **Adapter:** `src/viewCpp/EmscriptenView.ts` implements `IView`; `CppRendererLoader.ts` loads wasm (WasmCore-style multi-path fetch)
* **Factory:** `src/view/createView.ts` dynamic-imports EmscriptenView when preference is `webgpu-cpp`
* **Switch:** `?renderer=webgpu-cpp` or `localStorage.setItem('tetris_renderer', 'webgpu-cpp')`
* **Build:** `npm run cpp:release` / `cpp:debug` / `build:cpp` — requires `emcc` on PATH (`source emsdk_env.sh`). **Skips cleanly** when emsdk is absent; `npm test` still passes.
* **Fallback:** `webgpu-cpp` → TS WebGPU → WebGL2 if wasm missing or init fails
* **Current state:** Canvas2D bootstrap draw from C++; full WebGPU port in progress. See `cpp/README.md` for roadmap and manual test matrix.

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

/cpp                   # Emscripten C++ renderer (opt-in)
  src/renderer.cpp
  src/playfield_draw.cpp
  README.md

/src
  index.ts             # App entry point (UI injection, MVC wiring, theme setup)
  game.ts              # Main game engine (~650 lines)
  controller.ts        # Input + game loop (~980 lines)
  viewWebGPU.ts        # Thin WebGPU View orchestrator implementing IView (~670 lines)
  sound.ts             # Sound manager + music manager (Web Audio API, procedural music)
  /game                # Game logic modules
    pieces.ts          # Tetromino definitions, 7-bag randomizer
    rotation.ts        # SRS rotation tables + wall kicks
    collision.ts       # JS collision detector (fallback path)
    scoring.ts         # Scoring, combos, back-to-back, all-clear, high scores
    lineUtils.ts       # Line clearing + playfield shifting
    stateProjection.ts # Ghost piece / playfield projection helpers
  /webgpu              # Rendering subsystem
    gpuContext.ts      # Device/canvas acquisition + resize lifecycle
    viewPipelines.ts   # Block-texture load + pipeline/buffer/bind-group setup
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
  /view
    IView.ts           # Shared view interface (all backends)
    createView.ts      # Renderer factory (dynamic cpp import)
    rendererPreference.ts
  /viewCpp
    EmscriptenView.ts  # C++ renderer IView adapter
    CppRendererLoader.ts
    cppPlayfieldSync.ts
  /viewWebGL2
    viewWebGL2.ts      # WebGL2 fallback renderer
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
  release.wasm         # Collision WASM (asbuild:release)
  cpp/                 # C++ renderer glue + wasm (cpp:release)
    tetris_renderer.js
    tetris_renderer.wasm
  block.png            # Block texture atlas
  block-2.png
  assets/              # Additional runtime assets (videos, etc.)

/css
  style.css
  themes.css

deploy.py              # SFTP deployment script
index.html             # Vite entry HTML
vite.config.ts         # Vite config (base: '/tetris-webgpu/')
package.json           # npm scripts and dependencies (engines.node >=20)
tsconfig.json          # TypeScript config (strict, ESNext, .js imports)
eslint.config.js       # ESLint flat config (minimal typescript-eslint rules)
tsconfig.eslint.json   # Lint scope (src, tests, index.ts, vite/vitest configs)
vitest.config.ts       # Vitest 3 config (merges vite.config.ts)
```

## Build & Development Commands

```bash
# Dev server (Vite HMR for /src, but NOT for /assembly)
npm run dev

# Compile AssemblyScript to WASM (debug)
npm run asbuild:debug

# Compile AssemblyScript to WASM (release) → build/release.wasm + public/release.wasm
npm run asbuild:release

# Compile C++ renderer (optional; skips if emcc missing)
npm run cpp:release
npm run cpp:debug
npm run build:cpp      # alias for cpp:release

# Full production build (collision WASM + cpp + Vite frontend)
npm run build:all

# Run unit tests (Vitest). pretest compiles collision WASM only (not cpp).
npm test

# Lint (minimal typescript-eslint ruleset)
npm run lint
npm run lint:fix
```

### Renderer preferences (dev)

| URL / storage | Result |
|---------------|--------|
| (default / `auto`) | WebGPU if available, else WebGL2 |
| `?renderer=webgpu` | Force TS WebGPU |
| `?renderer=webgl2` | Force WebGL2 |
| `?renderer=webgpu-cpp` | Emscripten C++ (fallback if no wasm) |

```bash
npm run dev
# http://localhost:5173/?renderer=webgpu-cpp   # after npm run cpp:release
```

See `cpp/README.md` for the full manual test matrix.

## Key Directives & Conventions

### 1. WASM Build is Manual and Mandatory (Collision)
**Vite does NOT compile AssemblyScript.**
* If you edit anything in `/assembly`, you **must** run `npm run asbuild:release` before testing or deploying.
* The browser loads `public/release.wasm`, not `assembly/index.ts`.
* `npm test` runs `pretest` which attempts `asbuild:release`, but do not rely on this during iterative dev.

### 1b. C++ Renderer Build is Optional (Rendering)
**Vite does NOT compile Emscripten C++ either.**
* Edit `cpp/src/` → run `npm run cpp:release` (requires `emcc` / emsdk).
* Artifacts: `public/cpp/tetris_renderer.{js,wasm}`.
* Without artifacts, `?renderer=webgpu-cpp` uses a TS Canvas2D placeholder or falls back to WebGPU/WebGL2.
* `npm run cpp:release` and `build:cpp` exit 0 when `emcc` is missing — CI-safe.

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
* **Target:** Uploads `/dist` (zipped) to the Contabo storage manager.
* **Secrets:** `deploy.py` reads `DEPLOY_TOKEN` from the environment only — no credentials are hardcoded. See the *Continuous Integration & Deployment* section above.

## Security Considerations

* **Credentials via env only:** `deploy.py` reads `DEPLOY_TOKEN` from the environment; never hardcode secrets in tracked files. The old `deploy_old.py` held a plaintext SFTP password and has been removed — that credential remains in git history and **must be rotated**.
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

6. **C++ renderer not loading**  
   Run `npm run cpp:release` with `source emsdk_env.sh`. Confirm `public/cpp/tetris_renderer.wasm` exists. Without it, `webgpu-cpp` falls back safely. See `cpp/README.md`.

7. **"My cpp changes aren't showing up"**  
   Re-run `npm run cpp:release` after editing `cpp/src/`. Hard-refresh the browser (Vite does not rebuild wasm).

8. **Device loss / dead canvas after tab backgrounding or GPU reset**  
   Device lifecycle is centralized in `src/webgpu/gpuContext.ts`. On unexpected
   `device.lost` (reason ≠ `'destroyed'`) it shows a recovery overlay and re-runs
   `View.preRender()` once on a fresh device; a second failure surfaces a
   permanent overlay and dispatches a `tetris-webgpu-device-lost` window event.
   Do **not** re-add ad-hoc `requestAdapter`/`requestDevice` calls in
   `viewWebGPU.ts` — go through `acquireGpuContext` so power-preference
   (`?gpu=low|high`), optional-feature detection, labels, `device.lost`, and the
   `uncapturederror` listener stay in one place. Pipeline creation is wrapped in
   `pushGpuErrorScopes`/`popGpuErrorScopes` so WGSL/allocation failures log with
   context — keep new pipeline setup inside that scope.

## Continuous Integration & Deployment

- **CI:** `.github/workflows/ci.yml` runs on every pull request and on pushes to
  `main` — `npm ci` → `npm run asbuild:release` → `npm run typecheck` →
  `npm run lint` → `npm test` → `npm run build` across Node 20 and 22. Keep PRs
  green before merge. (`copilot-setup-steps.yml` is a separate setup-only
  workflow, not the test gate.)
- **Lint:** `npm run lint` uses [`eslint.config.js`](eslint.config.js) with
  `@typescript-eslint/no-floating-promises`, `consistent-type-imports`, and
  `no-unused-vars` (underscore ignore aligned with `tsc`). Type-aware lint scope:
  [`tsconfig.eslint.json`](tsconfig.eslint.json).
- **Node:** `package.json` `engines.node` is `>=20` (matches CI matrix).
- **Deploy:** `deploy.py` uploads `dist/` to the Contabo storage manager and
  reads secrets **from the environment only** (`DEPLOY_TOKEN`). Never hardcode
  credentials in tracked files; use env vars or a secret store. The legacy
  `deploy_old.py` (which contained a plaintext SFTP password) has been removed —
  that password lives in git history and **must be rotated**.

## Cursor Cloud specific instructions

This is a **client-only SPA** — no Docker, database, or backend services. One process covers local development.

### Services

| Service | Command | Notes |
|---------|---------|-------|
| Vite dev server | `npm run dev -- --host 0.0.0.0 --port 5173` | Serves the app at `http://localhost:5173`. Use tmux for long-running dev. |
| WebGPU browser | Google Chrome (preinstalled on Cloud VMs) | Required for visual/manual E2E testing. `navigator.gpu` must be available. |

WASM (`public/release.wasm`) is a **build artifact**, not a daemon. Vite does not compile AssemblyScript; run `npm run asbuild:release` after `/assembly` changes.

C++ renderer (`public/cpp/`) is also a build artifact. Run `npm run cpp:release` after `/cpp` changes (requires emsdk).

### Verify the environment

```bash
npm test              # Vitest (pretest rebuilds collision WASM only)
npm run lint          # ESLint
npm run build:all     # collision WASM + cpp (if emcc) + Vite → /dist
```

### Try the C++ renderer

```bash
source /path/to/emsdk/emsdk_env.sh
npm run cpp:release
npm run dev -- --host 0.0.0.0 --port 5173
# http://localhost:5173/?renderer=webgpu-cpp
```

Lint runs in the main CI job via `npm run lint` (ESLint + typescript-eslint).

### Browser / WebGPU on Cloud VMs

- Chrome 148+ on the VM supports WebGPU. If initialization fails, launch with `--enable-unsafe-webgpu --enable-features=WebGPU`.
- **AudioContext** requires a user gesture (click START or the canvas) before sound plays; console warnings before that are expected.
- Manual gameplay testing needs keyboard focus on the game canvas after starting.

### Production preview

`npm run build:all` then `npm run preview` serves `/dist` with base path `/tetris-webgpu/` (see `vite.config.ts`).
