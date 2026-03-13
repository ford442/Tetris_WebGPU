# Tetris WebGPU - Claude Development Guide

## Project Overview

A high-performance Tetris implementation using WebGPU for rendering, WebAssembly for collision detection, and the Web Audio API for procedural sound. The game targets modern browsers with WebGPU support.

## Tech Stack

- **TypeScript** - Primary language
- **Vite** - Build tool and dev server
- **WebGPU** - GPU rendering (Chrome with `--enable-unsafe-webgpu`)
- **AssemblyScript** - WASM collision detection (`assembly/index.ts`)
- **Web Audio API** - Procedural audio synthesis
- **gl-matrix** - Matrix math for 3D transforms
- **Vitest/Mocha/Chai** - Testing

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
└── webgpu/                  # WebGPU rendering subsystem
    ├── shaders/             # WGSL shader modules (split by purpose)
    │   ├── index.ts         # Re-exports all shader functions
    │   ├── postProcess.ts   # Post-processing (lens distortion, shockwave, bloom, glitch)
    │   ├── particle.ts      # Particle vertex/fragment shaders
    │   ├── grid.ts          # Tetris grid block renderer
    │   ├── background.ts    # Procedural/video background shaders
    │   └── main.ts          # Primary 3D block shader (lighting, texture atlas)
    ├── shaders.ts           # Barrel re-export (kept for import compatibility)
    ├── viewGameEvents.ts    # Event → visual effect handlers
    ├── compute.ts           # GPU compute shaders for particle physics
    ├── particles.ts         # Particle system (GPU-driven)
    ├── effects.ts           # Effect parameter wrappers (shockwave, glitch)
    ├── geometry.ts          # 3D mesh data (cube, quad, grid)
    ├── themes.ts            # Color palette definitions
    ├── debug_shaders.ts     # Debug visualization shaders
    └── renderMetrics.ts     # Render coordinate constants
assembly/
├── index.ts                 # AssemblyScript collision detection (compiled to WASM)
└── tsconfig.json
index.ts                     # App entry point (UI creation, wiring)
index.html                   # HTML bootstrap
```

## Architecture

### MVC Pattern
- **Model**: `Game` class manages playfield, pieces, scoring, lock delay, T-spin detection
- **View**: `viewWebGPU.ts` + `webgpu/` modules handle all rendering
- **Controller**: `controller.ts` handles input polling, game loop, and synchronization

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
2. Grid shader (blocks with texture atlas + lighting)
3. Particle system (GPU compute + render)
4. Post-processing (bloom, lens distortion, shockwave, chromatic aberration, glitch)

## Key Game Mechanics

| Feature | Details |
|---------|---------|
| Rotation | SRS (Standard Rotation System) with wall kicks |
| DAS | 130ms delay, 10ms repeat rate |
| Lock delay | Extended placement with up to 20 resets (coyote time) |
| Input buffer | 150ms window for failed actions |
| SOCD | Last-input-priority cleaning |
| Scoring | Single/Double/Triple/Tetris + T-Spin + Combo + B2B + All-Clear |

## Development Commands

```bash
npm run dev          # Start dev server (Vite)
npm run build        # Production build
npm run test         # Run tests (Vitest)
npm run asbuild      # Compile AssemblyScript to WASM
```

## File Size Guidelines

- **Keep all files under 1000 lines**
- Shaders live in `src/webgpu/shaders/` split by category:
  - `postProcess.ts` — Post-processing effects
  - `particle.ts` — Particle shaders
  - `grid.ts` — Grid block renderer
  - `background.ts` — Background shaders
  - `main.ts` — Primary 3D block shader
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
