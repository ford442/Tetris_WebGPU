# Copilot instructions for `tetris_webgpu`

## Build and test commands

- `npm run dev` — start the Vite dev server for the TypeScript app.
- `npm run asbuild:debug` — compile `assembly/index.ts` to `build/debug.wasm` and copy it to `public/debug.wasm`.
- `npm run asbuild:release` — compile the production WASM binary and copy it to both `build/release.wasm` and `public/release.wasm`.
- `npm run build` — build the frontend with Vite.
- `npm run build:all` — rebuild release WASM, then build the frontend. Use this before deploys and after AssemblyScript changes.
- `npm test` — run the full Vitest suite. `pretest` already runs `npm run asbuild:release || true`.
- `npm test -- tests/game.test.ts` — run a single test file. The same pattern works for co-located tests such as `npm test -- src/webgpu/materials.test.ts`.
- There is no lint script in `package.json`.

## High-level architecture

- The app is wired in `index.ts`: it builds the DOM UI, awaits `WasmCore.init()`, creates `Game`, `View`, `SoundManager`, and `Controller`, then connects UI buttons plus reactive view/audio hooks.
- The project uses an MVC split:
  - **Model:** `src/game.ts` with helpers in `src/game/` owns the 10x20 playfield, bag randomizer, SRS rotation, collision, lock delay, scoring, combos, back-to-backs, all-clears, hold, and ghost projection.
  - **Controller:** `src/controller.ts` runs the main `requestAnimationFrame` loop. It handles buffered input, DAS/ARR, gravity, calls `game.update(dt)`, triggers sound/effect callbacks, then renders.
  - **View:** `src/viewWebGPU.ts` plus `src/webgpu/` owns WebGPU setup, shader pipelines, textures, particles, bloom/post-processing, reactive video/music, and UI-facing visual events.
- The game model stores the playfield as a flat `Int8Array` of 200 cells, but `game.getState()` projects it back to a 2D array for the view layer.
- Collision is a TS/WASM hybrid:
  - `assembly/index.ts` contains the AssemblyScript collision kernel.
  - `src/wasm/WasmCore.ts` creates `WebAssembly.Memory`, loads `release.wasm`, and exposes the first 200 bytes as `playfieldView`.
  - `Game` uses that shared memory when WASM loads successfully and falls back to a normal `Int8Array` if it does not.
- View-side gameplay reactions are event-driven: the controller/game call methods like `onLineClear`, `onLock`, `onRotate`, and `onHardDrop`, and `src/webgpu/viewGameEvents.ts` translates those into particles, shake, bloom-era post effects, and floating UI text.

## Key codebase-specific conventions

- If you change anything in `assembly/`, rebuild WASM with `npm run asbuild:release`. Vite does **not** compile AssemblyScript, and the browser loads `public/release.wasm`.
- Source TypeScript modules use ESM imports with `.js` suffixes for local files (for example `import Game from './game.js'`).
- Hot paths are intentionally allocation-light. Reuse existing caches and typed arrays in `Game`, `Controller`, and `View` instead of creating fresh objects inside frame-by-frame logic.
- The board uses Y-down coordinates (`y = 0` at the top). SRS kick data in `src/game/rotation.ts` is already adapted for that coordinate system; do not copy standard Y-up tables blindly.
- Keep movement/DAS/ARR logic inside the controller’s animation-frame loop (`gameLoop()` + `handleInput()`), not inside raw DOM key handlers.
- WebGPU transparency is required for the HTML video background: the canvas is configured with `alphaMode: 'premultiplied'`, and render passes clear with alpha `0.0`.
- Uniform buffer layout details are hardcoded on the CPU side. If you change WGSL struct layouts, also update the matching sizes/offsets in the renderer (for example the 208-byte block uniform region on a 256-byte stride).
- Tests that touch the WASM path expect a real compiled binary. `tests/game.test.ts` mocks `fetch()` to load `build/release.wasm` and fails if the game falls back to the JS collision path.
