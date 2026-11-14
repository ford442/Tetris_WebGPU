# Tetris WebGPU - Claude Development Guide

## Project Overview

A high-performance Tetris implementation using WebGPU for rendering, WebAssembly for collision detection, and the Web Audio API for procedural sound. The game targets modern browsers with WebGPU support.

## Tech Stack

- **TypeScript** - Primary language
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
├── game.ts                  # Core game engine (state, mechanics, scoring)
├── controller.ts            # Input handling, DAS/ARR timers, game loop
├── viewWebGPU.ts            # Main WebGPU view (canvas, render passes, themes)
├── sound.ts                 # Procedural audio (Web Audio API)
├── game/                    # Game logic modules
│   ├── pieces.ts            # Tetromino definitions and bag randomizer
│   ├── collision.ts         # Collision detection (CPU fallback)
│   ├── rotation.ts          # SRS rotation + wall kicks
│   ├── scoring.ts           # Score, combos, back-to-back, all-clear
│   ├── lineUtils.ts         # Line clear and playfield shifting
│   └── stateProjection.ts   # Game state projection helpers
├── wasm/
│   └── WasmCore.ts          # WASM loader and collision API wrapper
├── view/
│   ├── IView.ts             # Shared view contract (all renderers)
│   ├── createView.ts        # Factory + dynamic cpp import
│   └── rendererPreference.ts
├── viewCpp/
│   ├── EmscriptenView.ts    # C++ renderer IView adapter (opt-in)
│   └── CppRendererLoader.ts # Loads public/cpp/tetris_renderer.*
├── viewWebGL2/              # WebGL2 renderer (auto fallback when no adapter; glBloom.ts = bloom pass)
├── dev/
│   ├── textureMaskLab.ts    # Mask/material authoring UI (?masklab)
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
- **Controller**: `controller.ts` handles input polling, game loop, and synchronization

### C++ Renderer (opt-in)
- **Switch:** `?renderer=webgpu-cpp` or `localStorage.tetris_renderer=webgpu-cpp`
- **Build:** `npm run cpp:release` (requires [emsdk](https://emscripten.org/) — `source emsdk_env.sh`)
- **Artifacts:** `public/cpp/tetris_renderer.{js,wasm}` (mirrored to `build/cpp/`)
- **On failure:** hard-fails (fatal overlay) if wasm is missing, init fails, or its
  own backend isn't WebGPU — it never falls back to TS WebGPU or WebGL2 as a rescue.
- **Provenance:** `public/cpp/build-info.json` is committed with the wasm (emcc version, port,
  flags, source hash, sha256). `npm run cpp:verify` / `tests/cpp-artifact-provenance.test.ts`
  fail if the sources it hashes changed (cpp/src, shared uniforms/material, shared WGSL, build
  scripts, `.emsdk-version`) without a rebuild — rebuild with the pinned emsdk and commit
  `public/cpp` + `build/cpp`. A release `cpp:release` exits non-zero if no WebGPU port links
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
  reason, adapter, adapterAttempt, renderer }`, set on every boot attempt, success or failure.
- **Overlay:** `src/webgpu/fatalBootOverlay.ts`.
- **Docs:** `docs/webgpu-boot-probe.md`

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
- 1D `Int8Array` of 200 cells (10 columns × 20 rows)
- Shared with WASM via direct memory access for fast collision detection

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
npm run test             # Run tests (Vitest)
npm run typecheck        # tsc --noEmit
npm run lint             # ESLint
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

## Testing

Tests live in `tests/`. Run with `npm run test`. Key test files:
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
