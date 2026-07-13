# C++ Tetris Renderer (Emscripten + WebGPU)

Opt-in renderer compiled with **Emscripten**, parallel to the AssemblyScript collision core in `assembly/`. It is **behind an explicit switch** and always falls back safely to the TypeScript WebGPU or WebGL2 paths when artifacts or `emcc` are missing.

## Quick start (fresh clone)

```bash
npm install
npm run dev
# Default renderer (auto → WebGPU or WebGL2)

# With Emscripten installed:
source /path/to/emsdk/emsdk_env.sh
npm run cpp:release
npm run dev
# Open: http://localhost:5173/?renderer=webgpu-cpp
```

**Without `emcc`:** `npm run cpp:release` prints a skip message and exits 0. `npm test` and `npm run build` still succeed. The game loads via TS Canvas2D placeholder when you force `?renderer=webgpu-cpp` without wasm artifacts, then falls back to WebGPU/WebGL2 if `EmscriptenView` itself fails to init.

## Directory layout

| Path | Purpose |
|------|---------|
| `cpp/src/renderer.cpp` | Exported API (`init_renderer`, `render_frame`, `update_playfield`) |
| `cpp/src/gpu_renderer.cpp` | WebGPU instanced cubes + Canvas2D stub fallback |
| `src/viewCpp/EmscriptenView.ts` | `IView` adapter — TS shell + wasm handoff |
| `src/viewCpp/CppRendererLoader.ts` | Loads glue JS + wasm (WasmCore-style multi-path fetch) |
| `src/view/createView.ts` | Dynamic `import()` of EmscriptenView when pref is `webgpu-cpp` |
| `public/cpp/tetris_renderer.js` | Emscripten glue (Vite serves at runtime) |
| `public/cpp/tetris_renderer.wasm` | Compiled module |
| `build/cpp/` | Mirror of build artifacts |
| `scripts/build-cpp.mjs` | Tolerant Node driver for `emcc` |

## Prerequisites: Emscripten SDK

### Pinned version (reproducible builds)

This repo pins a tested emsdk release in **`.emsdk-version`** (currently **4.0.10** — minimum for the built-in `emdawnwebgpu` remote port). Use the same version locally and in CI to avoid `USE_WEBGPU` vs `emdawnwebgpu` drift.

```bash
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
cd ~/emsdk
./emsdk install $(cat /path/to/tetris_webgpu/.emsdk-version)
./emsdk activate $(cat /path/to/tetris_webgpu/.emsdk-version)
source ./emsdk_env.sh   # required in every new shell
```

`scripts/build-cpp.mjs` warns when active `emcc` major.minor differs from `.emsdk-version`.

1. Install [emsdk](https://emscripten.org/docs/getting_started/downloads.html) (or use the pinned flow above).

2. Verify:

   ```bash
   which emcc
   emcc --version
   cat ../.emsdk-version   # from repo root
   ```

3. Build the renderer module:

   ```bash
   cd /path/to/tetris_webgpu
   npm run cpp:release
   ```

   Outputs:
   - `public/cpp/tetris_renderer.{js,wasm}`
   - `public/cpp/build-info.json` — linked WebGPU backend + `emcc` version
   - `build/cpp/compile_commands.json` — clangd / IDE (mirrored to `cpp/compile_commands.json`)

## Build flags matrix

| Mode | npm script | Compiler flags | Notes |
|------|------------|----------------|-------|
| **Debug** | `npm run cpp:debug` | `-O0 -g -sASSERTIONS=2 -sSAFE_HEAP=1` | Heap checks at link time |
| **Release** | `npm run cpp:release` | `-O3 -flto` | Set `TETRIS_CPP_NO_LTO=1` to skip LTO |
| **Sanitizer (local)** | `TETRIS_CPP_SANITIZE=1 npm run cpp:debug` | `+ -fsanitize=address,undefined` | Experimental; CI runs with `continue-on-error` |

### WebGPU backend selection

Set **`TETRIS_CPP_WEBGPU`** before building:

| Value | Behavior |
|-------|----------|
| `auto` (default) | Try `USE_WEBGPU` → `emdawnwebgpu` → Canvas2D-only |
| `emdawn` | Force `--use-port=emdawnwebgpu`, then Canvas2D fallback |
| `legacy` | Force `-s USE_WEBGPU=1`, then Canvas2D fallback |
| `none` | Canvas2D bootstrap only (`TETRIS_ENABLE_WEBGPU=0`) |

```bash
TETRIS_CPP_WEBGPU=emdawn npm run cpp:release
```

## IDE / clangd

After `npm run cpp:release` or `cpp:debug`:

- **`build/cpp/compile_commands.json`** — primary compilation database
- **`cpp/compile_commands.json`** — mirror for editors opening `cpp/`
- **`.clangd`** at repo root points `CompilationDatabase` → `build/cpp`

Jump-to-definition in `cpp/src/` should work once `compile_commands.json` exists.

## Optional: CMake + Ninja

Parallel to `scripts/build-cpp.mjs` (same sources, Emscripten-only):

```bash
source ~/emsdk/emsdk_env.sh
emcmake cmake -S cpp -B build/cpp-cmake -G Ninja \
  -DTETRIS_CPP_WEBGPU_BACKEND=emdawn
cmake --build build/cpp-cmake
# compile_commands.json → build/cpp-cmake/compile_commands.json
```

`npm run cpp:release` remains the canonical path (build-info, port fallbacks, artifact mirroring).

## CI

GitHub Actions workflow **`.github/workflows/cpp-renderer.yml`**:

- Caches emsdk keyed on `.emsdk-version`
- Runs `npm run cpp:release` and uploads wasm + `build-info.json` + `compile_commands.json`
- Runs debug + sanitizer build with `continue-on-error` (matrix documentation)
- Skips cleanly when workflow is not triggered; main `npm test` still does **not** require `emcc`


## npm scripts

| Script | Description |
|--------|-------------|
| `npm run cpp:debug` | Debug build (`-O0 -g -sASSERTIONS=2 -sSAFE_HEAP=1`) |
| `npm run cpp:release` | Release build (`-O3 -flto`) |
| `npm run build:cpp` | Alias for `cpp:release` (non-fatal if `emcc` missing) |
| `npm run build:all` | AS WASM + cpp + Vite frontend |

`pretest` does **not** require `emcc` — only AssemblyScript (`asbuild:release || true`).

## Exact emcc command (reference)

Debug (`scripts/build-cpp.mjs`):

```bash
emcc cpp/src/renderer.cpp cpp/src/playfield_draw.cpp cpp/src/gpu_renderer.cpp \
  -I cpp/src \
  -O0 -g -s ASSERTIONS=2 -s SAFE_HEAP=1 \
  -o public/cpp/tetris_renderer.js \
  --use-port=emdawnwebgpu \
  -DTETRIS_ENABLE_WEBGPU=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME=createTetrisRendererModule \
  -s ENVIRONMENT=web \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s 'EXPORTED_FUNCTIONS=["_init_renderer",...]' \
  -s 'EXPORTED_RUNTIME_METHODS=["ccall","cwrap","HEAP8","HEAPU8"]'
```

Release: `-O3 -flto` instead of debug flags.

`scripts/build-cpp.mjs` automates port selection, `compile_commands.json`, and `build-info.json`:
1. Respects `TETRIS_CPP_WEBGPU` (`auto` tries `-s USE_WEBGPU=1` first)
2. Retries with `--use-port=emdawnwebgpu` on newer emsdk (4.0.10+)
3. Falls back to Canvas2D-only if WebGPU linking fails

## Selecting the renderer

| Method | Example |
|--------|---------|
| URL query | `?renderer=webgpu-cpp` |
| `localStorage` | `localStorage.setItem('tetris_renderer', 'webgpu-cpp')` |
| Other values | `webgpu`, `webgl2`, or omit for `auto` |

Console on boot: `Tetris renderer: webgpu-cpp (preference: webgpu-cpp)`.

**Badge:** `C++ wasm` when wasm loaded; `C++ WIP` when TS placeholder only.

**Fallback chain for `webgpu-cpp`:** EmscriptenView → TS WebGPU → WebGL2.

## What lives in C++ vs TypeScript today

| Concern | Owner today | Notes |
|---------|-------------|-------|
| Game logic, scoring, SRS | TypeScript (`src/game.ts`) | Unchanged |
| Collision WASM | AssemblyScript (`assembly/`) | Separate from cpp renderer |
| View / `IView` contract | `EmscriptenView.ts` | Full MVC compatibility |
| Playfield sync | TS → 200-byte HEAP view | Zero-copy like `WasmCore` |
| Board draw (bootstrap) | C++ WebGPU instanced cubes | Canvas2D fallback if no GPU |
| Lighting, PBR, textures | TS WebGPU renderer | Not ported yet |
| Particles, post-process | TS WebGPU | No-op / DOM effects on cpp path |
| Reactive video `<video>` | TS DOM portal | C++ compositing planned later |
| Audio | Web Audio API (TS) | Works on all renderer prefs |

## Exported C API

```c
int  init_renderer(int width, int height);
void resize_renderer(int width, int height);
void render_frame(float dt);
void update_playfield(const uint8_t* data, int len);  // 200 bytes (10×20)
int8_t* get_playfield_ptr();  // zero-copy HEAP view for TS
int get_playfield_len();      // always 200

// Extended piece state (16-byte HEAP region)
PieceState* get_piece_state_ptr();
void update_piece_state(int8_t type, int8_t rot, int8_t x, int8_t y,
                        int8_t ghost_y, float lock_flash);
int get_renderer_backend();     // 0=none, 1=canvas2d, 2=webgpu (for TS badge)
int is_gpu_renderer_active();   // shorthand: backend == 2
int is_canvas_fallback_active();
```

**WebGPU path:** each `render_frame` acquires the swap-chain texture, clears to deep teal (`#071812`), draws instanced blocks when the pipeline initialized, then presents. Surface format comes from `navigator.gpu.getPreferredCanvasFormat()` (via EM_JS). Camera aligned to `renderMetrics.ts` (FOV 42°, block size 2.2).

**Fallback:** Canvas2D quads when WebGPU device/surface init fails.

## WebGPU init sequence (Emscripten + emdawnwebgpu)

Adapter/device acquisition is **async in the browser**, so the C++ side uses a synchronous device handle provided by TypeScript before wasm startup:

```
1. CppRendererLoader.createWebGpuDevice()
      navigator.gpu.requestAdapter() → adapter.requestDevice()   [async, TS]
2. createTetrisRendererModule({ canvas, preinitializedWebGPUDevice: device })
3. C++ init_renderer()
      emscripten_webgpu_get_device()   // reads Module.preinitializedWebGPUDevice
      wgpuInstanceCreateSurface()    // canvas id = "canvaswebgpu" (EmscriptenView)
      wgpuSurfaceConfigure()         // format = getPreferredCanvasFormat()
4. render_frame(dt)
      wgpuSurfaceGetCurrentTexture → clear (deep teal) → [optional block draw] → present
5. get_renderer_backend() → 2 (WebGPU) | 1 (Canvas2D fallback)
```

**ASYNCIFY / JSPI:** not required with the `preinitializedWebGPUDevice` pattern above. Only needed if you move `requestAdapter` / `requestDevice` into C++ with blocking waits.

**Build ports** (`npm run cpp:release` logs the winner):

| emsdk | Typical linked port |
|-------|---------------------|
| older | `-s USE_WEBGPU=1` |
| 4.x+  | `--use-port=emdawnwebgpu` |
| no GPU headers | Canvas2D-only (stubs) |

## Loading from TypeScript

```typescript
const createModule = (await import('./cpp/tetris_renderer.js')).default;
const mod = await createModule({ canvas: document.getElementById('canvaswebgpu') });
// Wrapped via CppRendererLoader — see src/viewCpp/CppRendererLoader.ts
```

## Video background (future)

The DOM `<video>` portal and alpha-cleared canvas are owned by TypeScript today. A later milestone will move background video **compositing into the C++ renderer** so the native WebGPU swap chain owns the full frame and the DOM portal can be removed.

## Manual test matrix (scaffolding sign-off)

Run `npm run dev` (or preview build) and exercise each row. Check console for errors and confirm `rendererName` in the boot log.

| Pref | Artifacts | Expected |
|------|-----------|----------|
| (none) / `auto` | any | TS WebGPU if available, else WebGL2 |
| `?renderer=webgpu` | any | TS WebGPU or WebGL2 fallback |
| `?renderer=webgl2` | any | WebGL2 |
| `?renderer=webgpu-cpp` | wasm present | `C++ GPU` badge when WebGPU active, playable blocks |
| `?renderer=webgpu-cpp` | wasm present, no WebGPU | `C++ wasm` badge, Canvas2D fallback draw |
| `?renderer=webgpu-cpp` | wasm absent | `C++ WIP` or fallback warning → WebGPU/WebGL2 |

**Per preference, verify:**

- [ ] Start / pause / game over overlays
- [ ] Movement (DAS/ARR), SRS rotations + wall kicks
- [ ] Hold, hard drop, soft drop
- [ ] Line clears, T-spins, combos, back-to-back, perfect clear
- [ ] Level up (floating text / effects)
- [ ] Audio after clicking START (user gesture)
- [ ] Touch controls (narrow viewport / mobile)
- [ ] High score in `localStorage` (`tetris_highscores`)
- [ ] Glitch / bloom buttons (no crash on cpp path; may be no-ops visually)
- [ ] Next / hold piece side canvases update

**Screenshots (optional):**

```bash
# Playwright capture script — renderer is argv[4]
node scripts/capture-screenshot.mjs http://127.0.0.1:5173/ ./screenshots webgpu-cpp

# Puppeteer — pass full URL or use RENDERER env
RENDERER=webgpu-cpp node scripts/screenshot.js
```

## Roadmap (post-scaffolding)

### Short term — C++ owns playfield draw via WebGPU
- Acquire `GPUDevice` / surface from C++ (`emdawnwebgpu` / `webgpu.h`)
- Colored or textured quads for locked + active pieces
- Keep `EmscriptenView` as thin `IView` shell

### Mid term — rendering depth
- Move block lighting math to C++
- Bundle WGSL from the C++ build
- GPU particle system (or hybrid with TS effects)

### Long term — full renderer ownership
- Post-process pipeline (bloom, aberration, shockwave) in C++
- **Take over reactive video compositing** (remove DOM `<video>` dependency)
- Shared memory for zero-copy playfield + piece state beyond the 200-byte grid

### Suggested follow-up issues
1. C++ WebGPU device + surface acquisition (#362)
2. Textured block quads + camera in C++
3. WGSL shader pipeline owned by cpp build
4. Particle pass migration
5. Video background compositing in C++

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `emcc not found` | `source emsdk_env.sh` |
| `USE_WEBGPU` rejected | Normal on emsdk 5.x — build script retries automatically |
| No lime frame / `C++ WIP` badge | Run `npm run cpp:release`; confirm `public/cpp/*.wasm` exists |
| Black board on cpp path | Check console for wasm fetch failures; verify Vite serves `/cpp/` |
| Falls back to WebGPU | Expected when wasm missing or `EmscriptenView.create()` throws |
