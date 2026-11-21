# Tetris WebGPU — Architecture & Development Guide

> The single source of truth for how this repo is built. `CLAUDE.md`, `AGENTS.md` and
> `.github/copilot-instructions.md` are short pointers to this file plus tool-specific notes —
> **update architecture facts here, not there.**

## Project Overview

A high-performance Tetris implementation using WebGPU for rendering, WebAssembly for collision detection, and the Web Audio API for procedural sound. The game targets modern browsers with WebGPU support.

## Tech Stack

- **TypeScript 5.8** - Primary language (see *TypeScript configuration* below)
- **Vite** - Build tool and dev server
- **WebGPU** - GPU rendering (Chrome with `--enable-unsafe-webgpu`)
- **AssemblyScript** - WASM collision detection (`assembly/index.ts`)
- **Emscripten (C++)** - Opt-in renderer (`cpp/`, `?renderer=webgpu-cpp`)
- **Web Audio API** - Procedural audio synthesis
- **gl-matrix** - Matrix math for 3D transforms
- **Vitest** - Testing

## Project Structure

```
src/
├── game.ts                  # Core game engine (state, piece/lock flow, mode wiring)
├── controller.ts            # Lifecycle: DOM listeners, pause/resume, replay, per-frame glue
├── controller/              # Split out of controller.ts
│   ├── keyboard.ts          # First-press / release handling, SOCD, input-buffer fallbacks
│   ├── hardDropFlow.ts      # Hard-drop snapshot → async drop → sound/view/leaderboard reactions
│   ├── softDropFx.ts        # Soft-drop particle trail (typed access to the WebGPU particle system)
│   ├── gameLoop.ts          # rAF loop host
│   └── hudBridge.ts         # DOM HUD / pause-menu updates
├── viewWebGPU.ts            # Main WebGPU view (canvas, render passes, themes)
├── sound.ts                 # Procedural audio (Web Audio API)
├── game/                    # Game logic modules
│   ├── pieces.ts            # Tetromino definitions and bag randomizer
│   ├── collision.ts         # Collision detection (CPU fallback)
│   ├── rotation.ts          # SRS rotation + wall kicks
│   ├── scoring.ts           # Score, combos, back-to-back, all-clear
│   ├── lineUtils.ts         # Line clear and playfield shifting
│   ├── stateProjection.ts   # Game state projection helpers
│   ├── rotateFlow.ts        # Active-piece SRS rotation + wall kicks (host-interface module)
│   ├── collisionQuery.ts    # hasCollision / ghostY with the WASM fast path
│   ├── stateSnapshot.ts     # Fills the reused GameState cache for getState()
│   ├── leaderboardSave.ts   # Persist a finished run
│   └── gameState.ts         # GameState type + createGameStateCache()
├── wasm/
│   └── WasmCore.ts          # WASM loader and collision API wrapper
├── view/
│   ├── IView.ts             # Shared view contract (all renderers)
│   ├── createView.ts        # Factory + dynamic cpp import
│   └── rendererPreference.ts
├── viewCpp/
│   ├── EmscriptenView.ts    # C++ renderer IView adapter (opt-in)
│   └── CppRendererLoader.ts # Loads public/cpp/tetris_renderer.*
├── viewWebGL2/              # WebGL2 renderer (auto fallback when no adapter; glBloom.ts = bloom pass; contextAttributes.ts = pinned context attributes)
├── dev/
│   ├── maskLabGate.ts       # Tiny always-loaded gate for ?masklab (imports nothing)
│   ├── textureMaskLab.ts    # Mask/material authoring UI — lazy chunk, loaded only under ?masklab
│   ├── textureMaskLabUi.ts  # Its static CSS/HTML strings
│   └── materialDebugHotkey.ts # Shift+M material inspector
└── webgpu/                  # WebGPU rendering subsystem
    ├── shaders/             # WGSL shader modules (split by purpose)
    │   ├── index.ts         # Re-exports all shader functions
    │   ├── postProcess.ts   # Post-processing (lens distortion, shockwave, bloom, glitch)
    │   ├── particle.ts      # Particle vertex/fragment shaders
    │   ├── grid.ts          # Tetris grid block renderer
    │   ├── background.ts    # Procedural/video background shaders
    │   ├── block/           # Block shader TS wrappers (blockShader.ts composes the WGSL; uniforms.ts = CPU offsets)
    │   └── wgsl/block/      # Block WGSL source (see File Size Guidelines)
    ├── shaders.ts           # Barrel re-export (kept for import compatibility)
    ├── gpuContext.ts        # Adapter/device acquisition + acquire diagnostics
    ├── presentation.ts      # Canvas configure(): format / colour space / tone mapping / usage; ?hdr, ?capture
    ├── gpuLimits.ts         # Which limits are requested (derived from what is allocated) + probe report
    ├── renderResolution.ts  # Backing-store size policy (DPR cap, pixel budget, texture limit) + frame-time governor
    ├── frameCapture.ts      # ?capture: canvas texture → PNG readback
    ├── bootProbe.ts         # window.webgpuProbe (see docs/webgpu-boot-probe.md)
    ├── fatalBootOverlay.ts  # Blocking overlay on a failed WebGPU boot probe
    ├── viewGameEvents.ts    # Event → visual effect handlers
    ├── backdropCapture.ts   # Scene backdrop blit sampled by glass refraction
    ├── glassRefraction.ts   # Quality/adaptive gating for backdrop refraction
    ├── compute.ts           # GPU compute shaders for particle physics
    ├── gpuChores/           # Post/juice compute helpers (see docs/gpu-chores.md)
    │   ├── runner.ts        # Adopts the active renderer's device; encodes jobs
    │   ├── shaders.ts       # luma_histogram (8,8), downsample_2d (8,8), compact_indices (64)
    │   ├── lumaStats.ts     # Histogram → bloom threshold math (pure)
    │   ├── autoBloom.ts     # Measured stats → BloomSystem params (smoothed)
    │   ├── compact.ts       # Spawn-flag build + CPU compaction rung
    │   ├── policy.ts        # `?no_gpu_compute` kill switch, WebGPU → CPU order
    │   ├── deviceRegistry.ts# One live GPU device per session
    │   └── breadcrumbs.ts   # `window.__tetrisGpuChores` trail
    ├── particles.ts         # Particle system (GPU-driven)
    ├── effects.ts           # Effect parameter wrappers (shockwave, glitch)
    ├── geometry.ts          # 3D mesh data (cube, quad, grid)
    ├── blockMaterial.ts     # Authored material contract (block-material.json)
    ├── blockMaterialMaps.ts # Pure bakers: packed normal/roughness/metallic + metrics
    ├── blockMaterialCanvas.ts # Browser glue for the bakers
    ├── blockMaskBake.ts     # Pure metal/glass mask bake (canvas-free)
    ├── blockTileCpu.ts      # Canvas-free tile extraction (for CPU contract tests)
    ├── ktx2.ts              # Optional BC7/KTX2 albedo upgrade (PNG stays canonical)
    ├── materialModifiers.ts # Variant deltas on the authored material
    ├── themes.ts            # Color palette definitions
    ├── debug_shaders.ts     # Debug visualization shaders
    └── renderMetrics.ts     # Render coordinate constants
assembly/
├── index.ts                 # AssemblyScript collision detection (compiled to WASM)
└── tsconfig.json
cpp/                         # Emscripten C++ renderer (opt-in, parallel to assembly/)
├── build.config.json        # Single source of truth: sources, flags, exports, port flags, size budget
├── CMakeLists.txt           # Second front end for build.config.json + TETRIS_CPP_NATIVE_TESTS host build
├── tests/                   # Host-side doctest suite for the pure headers (npm run cpp:test:native)
├── src/renderer.cpp
├── src/gpu_renderer.cpp     # WebGPU instanced cubes + initial post-process pass
├── src/playfield_draw.cpp
├── src/shaders/             # block/authoredBlock.wgsl, postprocess/postprocess.wgsl
└── README.md
shared/                      # blockMaterialSchema.json, authoredBlockUniforms.json, cppParityVectors.json (TS + C++ contract)                # emsdk setup, build commands, test matrix
index.ts                     # App entry point (UI creation, wiring)
index.html                   # HTML bootstrap
```

## Architecture

### MVC Pattern
- **Model**: `Game` class manages playfield, pieces, scoring, lock delay, T-spin detection
- **View**: `createView()` selects WebGPU (TS), WebGL2, or Emscripten C++ (`EmscriptenView`); each implements `IView`
- **Controller**: `controller.ts` (+ `controller/`, `input/`) handles input polling, game loop, and synchronization

### C++ Renderer (opt-in)
- **Switch:** `?renderer=webgpu-cpp` or `localStorage.tetris_renderer=webgpu-cpp`
- **Build:** `npm run cpp:release` (requires [emsdk](https://emscripten.org/) — `source emsdk_env.sh`)
- **Artifacts:** `public/cpp/tetris_renderer.{js,wasm}` + `public/cpp/build-info.json` (all committed; `build/` is scratch and never tracked)
- **On failure:** hard-fails (fatal overlay) if wasm is missing, init fails, or its
  own backend isn't WebGPU — it never falls back to TS WebGPU or WebGL2 as a rescue.
- **Provenance:** `public/cpp/build-info.json` is committed with the wasm (emcc version, port,
  flags, source hash, sha256). `npm run cpp:verify` / `tests/cpp-artifact-provenance.test.ts`
  fail if the sources it hashes changed (cpp/src, shared uniforms/material, shared WGSL, build
  scripts, `.emsdk-version`) without a rebuild — rebuild with the pinned emsdk and commit
  `public/cpp`. A release `cpp:release` exits non-zero if no WebGPU port links
  (`TETRIS_CPP_WEBGPU=none` is the explicit Canvas2D-only opt-in).
- **One build definition:** `cpp/build.config.json` (sources, `-std=c++17 -fno-exceptions
  -fno-rtti`, `-Wall -Wextra -Wpedantic` + `-Werror` under `CI`, link settings, exports,
  WebGPU port flags, wasm budget) is read by `scripts/build-cpp.mjs` **and**
  `cpp/CMakeLists.txt`. Never hand-copy a flag or export into either; `tests/cpp-build-config.test.ts`
  fails if `exports.loader` differs from the `cwrap` names in `CppRendererLoader.ts`.
  Glue is an ES module (`-sEXPORT_ES6=1`) so the loader's `import()` can get the factory.
- **EM_JS bodies are JavaScript:** keep them inside `// clang-format off` / `on`
  (clang-format rewrites `===` as `== =`).
- **Docs:** `cpp/README.md`, `docs/webgpu-boot-probe.md`

### WebGPU boot policy (hard-fail, WebGL2 only when no adapter exists)
- **What:** the active renderer (TS WebGPU *or* cpp, never both) either gets a
  real `GPUDevice` or the boot hard-fails with a blocking overlay. The one
  exception: with the default `auto` preference and **no adapter at all**
  (`navigator.gpu` missing / `requestAdapter()` null), `createView()` uses WebGL2
  (decided by an adapter-only preflight before any WebGPU view is built) and the
  UI badge says "WebGL2 (no WebGPU)". A device failure after an adapter was
  found, and explicit `?renderer=webgpu` / `webgpu-cpp`, never fall back.
  `?renderer=webgl2` remains an explicit opt-in.
- **Adapter retry:** `requestGpuAdapterAndDevice()` (the only `requestAdapter`
  call site) tries `powerPreference` → default adapter → `featureLevel:
  "compatibility"`; the winning rung is `adapterAttempt` on the probe.
- **Probe:** `window.webgpuProbe` (`src/webgpu/bootProbe.ts`) — `{ ok, browser,
  reason, adapter, adapterAttempt, renderer, features, limits, presentation }`, set on every boot attempt, success or failure.
- **Overlay:** `src/webgpu/fatalBootOverlay.ts`.
- **Docs:** `docs/webgpu-boot-probe.md`

### Canvas presentation (what we ask the context for)
- **Default (SDR):** `configure({ device, format: getPreferredCanvasFormat(), alphaMode: 'premultiplied', viewFormats: [] })`
  — exactly as before `presentation.ts` existed. The bloom composite ACES-tone-maps into it. Nothing
  below changes this path.
- **HDR output (opt-in):** Settings → "HDR (if supported)" (`GameSettings.hdrOutput`, reload on change)
  or `?hdr=0|1` (URL wins). `rgba16float` + `colorSpace: 'display-p3'` + `toneMapping: { mode: 'extended' }`.
  Capability, not user agent: the display must report `(dynamic-range: high)` (`?hdr=1` skips this — "try
  anyway") **and** `getConfiguration()` must read `extended` back, because WebIDL silently drops a
  dictionary member a browser doesn't know. Anything else reconfigures SDR and records why in
  `window.webgpuProbe.presentation.hdrStatus`.
- **Where the tone map lives:** the bloom composite (`bloomShaders.ts#createCompositeShader`), not `postProcess`.
  `{ hdr: false }` is byte-identical to the pre-HDR shader (sha256-pinned by `tests/bloom-composite-hdr.test.ts`);
  `{ hdr: true }` keeps ACES for the SDR range, passes energy past SDR white through a soft shoulder up to
  `DEFAULT_HDR_PEAK` (1.4 encoded ≈ 2.2× SDR white), and re-expresses the result in Display P3 primaries.
  The helpers are `wgsl/postprocess/hdrOutput.wgsl`, binding-free and shared verbatim with the C++ post pass.
  HDR output forces the composite path (`PostProcessor`), since nothing else owns the tone map.
- **Resize** reuses `view.presentation.configuration` so acquisition and resize cannot drift; `?capture` adds `COPY_SRC`
  to it, and the C++ renderer receives the HDR choice as module options (see `cpp/README.md`).
- **Features and limits:** `DESIRED_OPTIONAL_FEATURES` lists only features something reads
  (`tests/gpu-limits.test.ts` greps for each). Required limits are the compute floor plus `maxBindGroups: 1`
  (every shader binds `@group(0)` only — also grep-tested); `maxTextureDimension2D` is raised only if the
  render-resolution policy could need more than 8192 on this screen. The probe reports requested / adapter / granted.
- **Render resolution:** `renderResolution.ts` caps the backing store (DPR ≤ 2, per-quality pixel budget, device
  `maxTextureDimension2D`) for both the WebGPU and WebGL2 views, and a slow frame-time governor
  (`resolutionFactor`, 5 quantised steps, only above 1.5 MP, only with adaptive quality on and unlocked) sits behind
  `adaptiveQuality.ts`. Screens that fit the budget get exactly what they got before.
- **WebGL2 context attributes** are pinned in `viewWebGL2/contextAttributes.ts` (no MSAA, `powerPreference` from the
  same `resolvePowerPreference()`, `desynchronized`, `preserveDrawingBuffer: false`).

### GPU chores (post/juice helpers)
- **What:** luminance histogram, 2D downsample and index compaction for bloom and
  line-clear juice — never board state, collision or gravity.
- **Device:** chores *adopt* the active renderer's device (TS WebGPU **or** the
  C++ renderer, never both); they never request one. `gpuChores/deviceRegistry.ts`
  keeps a session to a single live device.
- **Backends:** WebGPU compute → CPU overlay FX. No WebGL2 rung; without WebGPU
  the board plays and the juice degrades.
- **Kill switch:** `?no_gpu_compute` (or `localStorage.tetris_no_gpu_compute`);
  breadcrumbs at `__tetrisGpuChores.breadcrumbs()` / `.status()`.
- **Bloom:** the measured threshold never drops below the static baseline, so
  auto-bloom can only bloom less than the hand-tuned look (#265 guard).
- **Docs:** `docs/gpu-chores.md`

### Authored block material (the visual contract)
The go.1ink.us look is **data**, not shader constants:
- `public/block-material.json` — glass curve, gold grade, roughness band, normal
  strength, map paths, contract thresholds. Validated against
  `shared/blockMaterialSchema.json` by both the runtime loader and `prebuild`.
- Packed material map: one RGBA texture, `R/G` = tangent normal, `B` = roughness,
  `A` = metallic. Baked from the extracted tile by `blockMaterialMaps.ts`; bound at
  `@binding(13)` in TS and C++, `u_blockMaterialMap` in WebGL2.
- `AuthoredMaterialParams` (`@binding(14)`; folded into binding 0 on the C++ path)
  carries the contract to the GPU.
- Shared WGSL: `authoredMaterial.wgsl` (TBN, normal mapping, roughness, gold grade) and
  `authoredGlass.wgsl` (glass albedo, opacity curve, direct lighting) are composed
  verbatim by TS and C++; WebGL2 hand-ports them and `tests/block-material-parity.test.ts`
  pins the port against the WGSL source.
- **A new brick is a PNG + JSON, never a shader edit.** See
  `docs/block-material-contract.md`.

### Data Flow
```
Keyboard Input → Controller (DAS/ARR/SOCD) → Game methods → Game.update()
    → Line clear + Scoring → View.render() → WebGPU render pass
    → Event callbacks → Visual effects + Audio
```

### Playfield Storage
- 1D `Int8Array` of 200 cells (10 columns × 20 rows) per board; Y-down (`y = 0` is the top)
- Shared with WASM via direct memory access for fast collision detection
- Single-player uses board 0; local versus uses board 0 (P1) and board 1 (P2)

### TypeScript / WASM hybrid (collision)
- **AssemblyScript core:** `assembly/index.ts` exports board-indexed collision, line-clear and hard-drop kernels that read/write shared linear memory.
- **Memory layout (480 bytes of one 64 KiB page):** board 0 playfield 0–199 · board 1 playfield 200–399 · board 0 scratch (row flags + index staging) 400–439 · board 1 scratch 440–479.
- **Bridge:** `src/wasm/WasmCore.ts` creates the `WebAssembly.Memory`, loads `release.wasm`, exposes `getPlayfieldView(boardId)` / `playfieldView` (board 0).
- **Fallback:** if WASM fails to load, each `Game` falls back to the JS collision path. Tests assert the WASM path is the active one.
- The C++ renderer is rendering-only; it never touches game logic or collision.

### Render Pipeline
1. Background layer (video or procedural shader)
2. Frosted glass backboard
3. Backdrop capture — blit the scene so far into a fixed-size texture (`webgpu/backdropCapture.ts`) so the glass path can refract it in screen space; blocks cannot sample the target they render into
4. Grid shader (blocks with texture atlas + lighting)
5. Particle system (GPU compute + render)
6. Luma chore — `downsample_2d` + `luma_histogram` over the composited frame, feeding the bloom threshold (`webgpu/gpuChores/`)
7. Post-processing (bloom, lens distortion, shockwave, chromatic aberration, glitch)

## Key Game Mechanics

| Feature | Details |
|---------|---------|
| Rotation | SRS (Standard Rotation System) with wall kicks |
| DAS | 100ms delay, 0ms repeat rate |
| Lock delay | Extended placement with up to 15 resets (coyote time) |
| Input buffer | 50ms window for failed actions |
| SOCD | Last-input-priority cleaning |
| Scoring | Single/Double/Triple/Tetris + T-Spin + Combo + B2B + All-Clear |

## Development Commands

```bash
npm run dev              # Start dev server (Vite)
npm run build            # Production build (Vite only)
npm run build:all        # AS WASM + cpp + Vite
npm run build:desktop    # Vite build with VITE_BASE=./ (Tauri shell; see Build base path)
npm run test             # Run tests (Vitest)
npm run typecheck        # tsc -b (src, tests, node/scripts, workers) + the noUncheckedIndexedAccess ratchet
npm run lint             # ESLint (src/tests/workers via typescript-eslint; scripts/ with a Node block)
npm run asbuild:release  # Compile AssemblyScript → public/release.wasm
npm run cpp:release      # Compile C++ renderer → public/cpp/ (skips if no emcc; fails if no WebGPU port links)
npm run cpp:verify       # Check committed public/cpp artifact vs build-info.json + .emsdk-version (no emcc)
npm run cpp:lint         # clang-format + clang-tidy over cpp/src and cpp/tests (cpp:format fixes in place)
npm run cpp:test:native  # Host doctest suite for the pure C++ headers (cmake; no emsdk)
npm run cpp:size         # wasm/js size report (-- --base origin/main for a delta)
npm run cpp:debug        # Debug Emscripten build
npm run material:validate # Validate public/block-material.json + authored maps
```

**Try C++ renderer:** `npm run cpp:release` then open `?renderer=webgpu-cpp`

## File Size Guidelines

- **Keep all files under 1000 lines**
- The block fragment shader is split by stage in `src/webgpu/shaders/wgsl/block/`:
  - `fragmentMain.wgsl` — thin entry point: sample, classify, dispatch
  - `authoredPath.wgsl` — authored gold + crystal composition
  - `fallbackPath.wgsl` — classic + generic PBR
  - `ghost.wgsl` — ghost-piece hologram
  - `blockFx.wgsl` — rim, lock tension, pulses, shadow, dissolve
  - `authoredMaterial.wgsl` / `authoredGlass.wgsl` — shared, binding-free look modules
    (also embedded by the C++ renderer; never add a `@binding` to these)
- Shaders live in `src/webgpu/shaders/` split by category:
  - `postProcess.ts` — Post-processing effects
  - `particle.ts` — Particle shaders
  - `grid.ts` — Grid block renderer
  - `background.ts` — Background shaders
  - `block/blockShader.ts` — Primary 3D block shader (composes `wgsl/block/`)
- Add new shader categories as new files; update `shaders/index.ts` to re-export

## Performance Notes

- Avoid allocating objects in hot paths (game loop runs at 60fps)
- Collision detection runs in WASM when available; JS fallback in `game/collision.ts`
- Particle physics run on GPU via compute shaders in `webgpu/compute.ts`
- Use typed arrays (`Int8Array`, `Float32Array`) for playfield and GPU buffers

## TypeScript configuration

One `tsc -b` checks everything CI cares about — there is no unchecked corner of the repo.

| File | Role |
|------|------|
| `tsconfig.json` | Solution root: `files: []` + `references` to the four projects below |
| `tsconfig.base.json` | Shared options: `strict`, `moduleResolution: "Bundler"`, `noImplicitOverride`, `noUnused*`, `noImplicitReturns`, `isolatedModules` |
| `tsconfig.project.json` | Composite + declaration-only settings; output lives in `node_modules/.cache/tsc/` (nothing is emitted into the tree) |
| `tsconfig.src.json` | `src/`, `index.ts` |
| `tsconfig.tests.json` | `tests/` (references src + node) |
| `tsconfig.node.json` | `vite.config.ts`, `vitest.config.ts`, and `scripts/**/*.{mjs,cjs}` with `checkJs` (annotate new scripts with JSDoc; `noImplicitAny` is off there for the legacy ones) |
| `tsconfig.workers.json` | `workers/` (Cloudflare globals declared in `workers/cloudflare.d.ts`) |
| `tsconfig.index-access.json` | **Ratchet** for `noUncheckedIndexedAccess`: the listed directories (and what they import) are checked with the flag on. Add a directory once it is clean; never remove one. Still to migrate: `src/webgpu`, `src/view`, `src/viewCpp`, `src/viewWebGL2`, `src/dev`, `index.ts` |
| `tsconfig.eslint.json` | The single program typed-lint uses |

- **Escape hatches are ratcheted:** `tests/ts-escape-hatches.test.ts` counts `as any` / `@ts-ignore` / `@ts-expect-error` under `src/`. The count may only go down — lower `BASELINE` in the same PR when you remove one; raising it needs a justification in review.
- With the index-access flag on, `arr[i]` is `T | undefined`. In hot grid/typed-array loops where the index is provably in range, a trailing `!` is the accepted idiom (zero runtime cost); anywhere the value can genuinely be absent, handle it.
- **Imports use `.js` extensions** for local files (`import Game from './game.js'`), even when the target is `.ts`.
- ESLint ([`eslint.config.js`](../eslint.config.js)): `no-floating-promises`, `consistent-type-imports`, `no-unused-vars` (underscore ignore) for TS; `@eslint/js` recommended + Node globals for `scripts/`.

## Build base path (`VITE_BASE`)

`vite.config.ts` and `scripts/generate-sw.mjs` both call `resolveBase()` in `scripts/lib/viteBase.mjs`:

| `VITE_BASE` | Production base | Use |
|-------------|-----------------|-----|
| unset | `/tetris-webgpu/` (dev server: `/`) | GitHub Pages / the 1ink mirror |
| `./` | relative | Tauri shell (`npm run build:desktop`), any non-Pages static host |
| `/some/prefix` | `/some/prefix/` | custom path |

A relative base skips the service worker (no stable URL prefix to precache or scope). Browsers refuse
`type="module"` scripts from a bare `file://` origin, so the relative bundle is meant for Tauri's own
protocol or a static server at any prefix. `npm run preview` after a default build serves `/tetris-webgpu/`.

## Conventions

1. **AssemblyScript is a manual build.** Vite does not compile `assembly/`; after editing it run `npm run asbuild:release` (writes `build/release.wasm`, copies it to `public/release.wasm`, which is committed and is what the browser and the tests load). `npm test`'s `pretest` does this for you and fails the run if it fails (`TETRIS_SKIP_ASBUILD=1` skips, loudly).
2. **The C++ renderer build is optional** (needs emsdk): `npm run cpp:release`. It exits 0 only when `emcc` is absent (`TETRIS_CPP_REQUIRE_EMCC=1` — set in CI — makes that an error), and fails when no WebGPU port links (`TETRIS_CPP_WEBGPU=none` is the explicit Canvas2D-only opt-in).
3. **GC avoidance in hot paths.** Pre-allocated arrays/objects in `Game` (`collisionCoordsCache`, `_updateResult`, `_tempPiece`, `_tSpinCorners`…), cached bound methods, one batched uniform write per frame. Don't allocate inside `update()` / `Frame()`.
4. **Coordinates are Y-down** (`y = 0` is the top). SRS kick tables in `game/rotation.ts` are already adapted; don't paste Y-up tables from the wiki.
5. **Shader uniform offsets are hardcoded on the CPU side** (`webgpu/viewPipelines.ts`, `viewUniforms.ts`, `webgpu/shaders/block/uniforms.ts` mirroring `wgsl/block/uniforms.wgsl`; C++ block uniforms are generated from `shared/authoredBlockUniforms.json`). Change a WGSL struct → update the offsets (`tests/block-uniform-layout.test.ts` guards the block struct).
6. **Canvas transparency:** the WebGPU canvas must use `alphaMode: 'premultiplied'` and the background pass must clear with alpha `0.0`, or the `<video>` portal disappears.
7. **Movement/DAS/ARR runs in the animation-frame loop** (`controller.handleInput`, `input/dasArr.ts`), never in raw `keydown` handlers — it would lose auto-repeat and feel laggy.
8. **GPU device lifecycle is centralised** in `webgpu/gpuContext.ts` (`acquireGpuContext`). Don't add ad-hoc `requestAdapter`/`requestDevice` calls; keep new pipeline setup inside `pushGpuErrorScopes`/`popGpuErrorScopes`. On an unexpected `device.lost` it shows a recovery overlay and re-runs `View.preRender()` once, then a permanent overlay plus a `tetris-webgpu-device-lost` window event.
9. **Credentials come from the environment only** (`deploy.py` reads `DEPLOY_TOKEN`); never commit secrets. Verbose logging: `localStorage.setItem('tetris_debug', 'true')`.
10. **Don't commit local/tool state or duplicates.** `.gitignore` covers `build/`, `.idea/`, `.playwright-mcp/`, `*.pid`, `diff.txt`, `*.orig`. The canonical block texture is `public/block.png`.

## Common pitfalls

| Symptom | Cause / fix |
|---------|-------------|
| WASM changes not showing | Forgot `npm run asbuild:release` (the dev server serves `public/release.wasm`). |
| Black screen / init failure | Needs WebGPU (Chrome/Edge 113+); see the boot policy above and `window.webgpuProbe`. |
| Tests fail with "Using JS fallback" | `public/release.wasm` missing or corrupt — `npm run asbuild:release`. |
| Laggy / broken auto-repeat | Movement logic was moved into an event handler (convention 7). |
| Background video invisible | Opaque clear or wrong `alphaMode` (convention 6). |
| `?renderer=webgpu-cpp` shows the fatal overlay | `public/cpp/tetris_renderer.wasm` missing/stale — `npm run cpp:release` (needs emsdk); there is no rescue by design. |
| cpp edits not visible | Re-run `npm run cpp:release` and hard-refresh. |
| `cpp:verify` / provenance test fails | A hashed input changed without a rebuild — rebuild with the pinned emsdk, commit `public/cpp`. |

## Known hazards

- **WebGPU resource management** (`viewWebGPU.ts` + `webgpu/`): no wrapper engine — `GPUDevice`, buffers, bind groups and pipelines are managed by hand. The `View` constructor starts async init (`preRender`); the render loop guards `!this.device`, but calling view methods from the controller before init completes can crash if unguarded.
- **Input timing:** physics uses `performance.now()` deltas while key state comes from DOM events; keep repeat logic in the frame loop.
- **Rotation kicks:** `game/rotateFlow.ts` advances `kickIndex` twice per loop iteration (every second kick offset is skipped). It is long-standing behaviour that the T-Spin kick indices and tests depend on, so treat any change as a gameplay change, not a refactor.
- **Video background:** relies on DOM layering (`z-index`) behind the transparent canvas; large aspect-ratio changes can drift the portal alignment.
- **Block bind groups** are rebuilt per frame in some paths, which pressures the browser's resource tracker.

## CI & deployment

- `.github/workflows/ci.yml` (PRs and `main`, Node 20 and 22): `npm ci` → `asbuild:release` → `cpp:verify` → `typecheck` → `lint` → `test` → `build`. `cpp-renderer.yml` rebuilds the C++ renderer with the pinned emsdk and fails if `public/cpp` differs. `copilot-setup-steps.yml` is setup-only, not a gate.
- `package.json` `engines.node` is `>=20`.
- Deploy: `deploy.py` uploads `dist/` (after `npm run build:all`) to the Contabo storage manager with `DEPLOY_TOKEN` from the environment. The removed `deploy_old.py` held a plaintext SFTP password that remains in git history and **must be rotated**.
- Repo size: `.git` carries historical binary churn (wasm/png). Rewriting history (`git filter-repo --invert-paths --path build --path block.png --path public/block-2.png …`) is an optional, separate, coordinated step — never part of a normal PR.

## Testing

Tests live in `tests/` (a few are co-located, e.g. `src/webgpu/materials.test.ts`). Run with `npm run test`. WASM-dependent tests load the committed `public/release.wasm` through a mocked `fetch` and assert the WASM path — not the JS fallback — is active. Key test files:
- `game.test.ts` — Core game logic
- `game-utils.test.ts` — Utility functions
- `render-metrics.test.ts` — Render coordinate math
- `renderer-preference.test.ts` — `webgpu-cpp` preference parsing
- `block-material-contract.test.ts` — the visual contract, measured on `public/block.png`
- `block-material-maps.test.ts` — packed-map bakers
- `block-material-schema.test.ts` — material validation + uniform packing
- `block-material-parity.test.ts` — TS / WebGL2 / C++ material parity + shader split
- `validate-block-material.test.ts` — the `prebuild` gate
- `gpu-chores-*.test.ts` — chore policy, luma/bloom math, compaction parity, runner, wiring
- `webgpu-boot-probe.test.ts` — `window.webgpuProbe`, browser detection, acquire diagnostics
- `fatal-boot-overlay.test.ts` — blocking overlay on a failed boot probe
- `create-view-integration.test.ts` — no WebGPU → WebGL2 rescue chain after a device failure
- `create-view-auto-fallback.test.ts` — `auto` → WebGL2 only when no adapter; explicit choices stay strict
- `webgl2-bloom.test.ts` — WebGL2 bloom params/shaders + renderer badge labels
- `cpp-build-config.test.ts` — one build config: exports vs loader `cwrap`s vs `EMSCRIPTEN_KEEPALIVE`, no hand-copied flags, artifact records the config
- `cpp-parity-vectors.test.ts` — `shared/cppParityVectors.json` held by the TS renderer (the C++ side is `cpp/tests/`)
- `cpp-size-report.test.ts` — size report formatting and the base-ref delta
- `presentation.test.ts` / `bloom-composite-hdr.test.ts` / `cpp-hdr-post.test.ts` — canvas configuration, the SDR-pinned composite, and both HDR tone maps executed on a software adapter against CPU references
- `render-resolution.test.ts` / `gpu-limits.test.ts` / `webgl2-context.test.ts` / `frame-capture.test.ts` — resolution policy, requested features/limits, pinned WebGL2 attributes, capture readback
- `tests/e2e/presentation.spec.ts` — probe `presentation` / `?hdr` / Settings round trip / `?capture` configuration in a real browser
- `ts-escape-hatches.test.ts` — `as any` / `@ts-ignore` ratchet + the typecheck-surface wiring
- `vite-base.test.ts` — `VITE_BASE` resolution
