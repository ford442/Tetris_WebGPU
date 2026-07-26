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
| `cpp/src/shaders/block/block.wgsl` | C++ block shader source (real file — see "Shader source of truth" below) |
| `cpp/src/generated/shader_sources.h` | Generated, gitignored — `cpp/src/shaders/**/*.wgsl` embedded as C++ string constants |
| `scripts/generate-cpp-shaders.mjs` | Embeds `cpp/src/shaders/**/*.wgsl` into the header above; pure Node, no `emcc` needed |
| `src/viewCpp/EmscriptenView.ts` | `IView` adapter — TS shell + wasm handoff |
| `src/viewCpp/CppRendererLoader.ts` | Loads glue JS + wasm (WasmCore-style multi-path fetch) |
| `src/view/createView.ts` | Dynamic `import()` of EmscriptenView when pref is `webgpu-cpp` |
| `public/cpp/tetris_renderer.js` | Emscripten glue (Vite serves at runtime) |
| `public/cpp/tetris_renderer.wasm` | Compiled module |
| `build/cpp/` | Mirror of build artifacts |
| `scripts/build-cpp.mjs` | Tolerant Node driver for `emcc` |

## Prerequisites: Emscripten SDK

### Pinned version (reproducible builds)

This repo pins a tested emsdk release in **`.emsdk-version`** (currently **5.0.7** — the line verified to link `emdawnwebgpu` successfully; legacy `-s USE_WEBGPU=1` was removed upstream around the 5.0 line, so `auto` no longer wastes a failed link attempt on it). Use the same version locally and in CI to avoid `USE_WEBGPU` vs `emdawnwebgpu` drift.

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
| `auto` (default) | Try `emdawnwebgpu` → Canvas2D-only on pinned emsdk ≥ 5.0; on older pins also tries legacy `USE_WEBGPU` before Canvas2D |
| `emdawn` | Force `--use-port=emdawnwebgpu`, then Canvas2D fallback |
| `legacy` | Force `-s USE_WEBGPU=1`, then Canvas2D fallback |
| `none` | Canvas2D bootstrap only (`TETRIS_ENABLE_WEBGPU=0`) |

`auto` prefers `emdawnwebgpu` first: it's the port the pinned emsdk (5.0.7) actually links, so the common case builds without ever attempting — and failing — the removed legacy flag first.

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

`npm run cpp:release` remains the canonical path (build-info, port fallbacks, artifact mirroring). Both paths regenerate `cpp/src/generated/shader_sources.h` before compiling (CMake via the `generate_cpp_shaders` custom target).

## CI

GitHub Actions workflow **`.github/workflows/cpp-renderer.yml`**:

- Caches emsdk keyed on `.emsdk-version` (`emsdk-<version>-ubuntu-22.04`) — bumping the pin automatically busts the cache and installs the new version fresh on the next run; no manual cache invalidation needed
- Runs `npm run cpp:release` and uploads wasm + `build-info.json` + `compile_commands.json`
- Verifies `wasmBytes`/`jsBytes` are present in `build-info.json` and enforces the release size budget (see below)
- Runs debug + sanitizer build with `continue-on-error` (matrix documentation)
- Skips cleanly when workflow is not triggered; main `npm test` still does **not** require `emcc`

### Release size budget

`scripts/build-cpp.mjs` fails a **release** build if `tetris_renderer.wasm` exceeds **256 KB** (`TETRIS_CPP_WASM_BUDGET_BYTES` to override locally). This is a guardrail against accidental bloat (e.g. forgetting `-flto`, linking unused Emscripten runtime methods) — if a legitimate feature needs more, raise the budget deliberately in the same PR with a comment explaining why, rather than letting it drift silently.


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
1. Respects `TETRIS_CPP_WEBGPU` (`auto` tries `--use-port=emdawnwebgpu` first — the port the pinned emsdk 5.0.7 actually links)
2. Falls back to legacy `-s USE_WEBGPU=1` only if emdawn linking fails (older emsdk)
3. Falls back to Canvas2D-only if both WebGPU ports fail to link

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
| Block texture (`block.png`) | C++ via TS upload | Atlas tile + material-lite lighting |
| Full PBR / premium materials | TS WebGPU renderer | C++ uses simplified shader |
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
int set_block_texture_rgba(const uint8_t* rgba, int width, int height, int byte_len);
```

**WebGPU path:** each `render_frame` acquires the swap-chain texture, clears with **transparent alpha** (`a=0`) so the DOM video portal shows through the premultiplied surface, draws instanced blocks when the pipeline initialized, then presents. Surface format comes from `navigator.gpu.getPreferredCanvasFormat()` (via EM_JS). Camera aligned to `renderMetrics.ts` (FOV 42°, block size 2.2).

**Fallback:** Canvas2D quads when WebGPU device/surface init fails.

## WebGPU init sequence (Emscripten + emdawnwebgpu)

Adapter/device acquisition is **async in the browser**, so the C++ side uses a synchronous device handle provided by TypeScript before wasm startup:

```
1. requestGpuAdapterAndDevice()     // shared gpuContext policy (?gpu= / GameSettings.gpuPower, optional features, required limits, label)
2. attachDeviceLifecycleHandlers()  // overlay + device-lost event on fatal loss
3. createTetrisRendererModule({ canvas, preinitializedWebGPUDevice: device })
4. init_renderer()                  // C++: emscripten_webgpu_get_device(), surface configure (premultiplied)
5. uploadBlockTexture()             // TS decodes block.png → set_block_texture_rgba() in wasm
6. render_frame(dt)                 // clear (alpha=0) → textured instanced blocks → present
7. get_renderer_backend()           // 2 (WebGPU) | 1 (Canvas2D fallback)
```

### Device request policy (`src/webgpu/gpuContext.ts`)

Both this loader and the TS WebGPU renderer call the same `requestGpuAdapterAndDevice()` — one policy, no divergent adapter/device setup per renderer:

| Concern | Source (first match wins) | Notes |
|---------|---------------------------|-------|
| Power preference | `?gpu=low\|high` → `GameSettings.gpuPower` (settings UI) → `high-performance` default | Settings-UI change reloads the page so the new preference takes effect on next acquisition |
| Optional features | Adapter-advertised subset of `DESIRED_OPTIONAL_FEATURES` (`timestamp-query`, `texture-compression-{bc,astc,etc2}`, `shader-f16`) | Never hard-required; device still creates with none of them present |
| Required limits | `REQUIRED_GPU_LIMITS` (4 storage buffers/stage, `workgroup_size(64)`), clamped to what the adapter reports | Matches actual line-clear + particle compute usage; a device that can't meet these fails fast at `requestDevice()` instead of deep in a dispatch |
| Device label | `tetris-main-device` (or caller-supplied) | Retried without features/limits if the labeled+featured request is rejected |

See the doc comments on `requestGpuAdapterAndDevice`, `resolvePowerPreference`, `resolveRequiredLimits`, and `buildCanvasConfiguration` in `gpuContext.ts` for the exact fallback order; `tests/gpu-context.test.ts` covers all of it.

## Shader source of truth (TS + C++)

Both renderers used to hold their block shader as a hand-copied string — TS as JS template literals split across `src/webgpu/shaders/block/*.wgsl.ts`, and C++ as an inline `R"(...)"` literal in `gpu_renderer.cpp` (`kBlockWgsl`). Neither is true anymore:

- **TS**: the static parts of the block shader (vertex, fragment `main()`, PBR helper functions, the `FragmentUniforms` struct, particle-material-interaction functions) are real `.wgsl` files under `src/webgpu/shaders/wgsl/block/`, loaded with Vite's `?raw` import (`vite/client` types already cover this). Each `block/*.wgsl.ts` file is now a one-line `?raw` re-export — the `.wgsl` file is the only copy. The one exception is `getSimpleTextureSamplingWGSL()` (`src/webgpu/textureSampling.ts`), which stays TS-generated because it interpolates runtime `BlockTextureConfig` values (metal/glass thresholds) into the shader text — it's genuinely not static.
- **C++**: `cpp/src/shaders/block/block.wgsl` is a real file too. `scripts/generate-cpp-shaders.mjs` (pure Node, no `emcc` needed) embeds every `cpp/src/shaders/**/*.wgsl` into `cpp/src/generated/shader_sources.h` (gitignored, regenerated on every build — wired into both `scripts/build-cpp.mjs`'s `main()` and `cpp/CMakeLists.txt`'s `generate_cpp_shaders` target). `gpu_renderer.cpp` includes that header instead of hand-copying the string.

**Important:** this does *not* mean the TS and C++ block shaders are the same program. They intentionally aren't (see "What lives in C++ vs TypeScript today" above) — C++'s `Uniforms`/`UniformData` struct (128 bytes: `viewProj`, `params0`, `params1`, `lightDir`, `eyePos`) is a completely different, deliberately simplified contract from TS's 224-byte `FragmentUniforms` (no PBR branches, ghost piece, dissolve glow, audio-reactive border, or particle-material interaction). Full parity is the "long term" roadmap item below, not this. What changed here is that **each shader now has exactly one real file as its source** on both sides, instead of a string literal being the only copy — so future parity work has real files to diff against instead of re-deriving WGSL from JS/C++ source.

### Adding a block-shader uniform

**TS path:**
1. Add the field (with its byte-offset comment) to `src/webgpu/shaders/wgsl/block/uniforms.wgsl`'s `FragmentUniforms` struct.
2. Add the same offset to `BLOCK_FRAGMENT_UNIFORM_OFFSETS` (and bump `BLOCK_FRAGMENT_UNIFORM_SIZE` if it no longer fits) in `src/webgpu/shaders/block/uniforms.ts`.
3. Write it from the appropriate call site (`viewMaterials.ts` or `viewUniforms.ts`).
4. Run `tests/block-uniform-layout.test.ts` — it fails if the WGSL comment and the CPU offset disagree.

**C++ path:**
1. Add the field to `UniformData` in `cpp/src/gpu_renderer.cpp` and the matching field to the `Uniforms` struct in `cpp/src/shaders/block/block.wgsl`.
2. Write it in `update_uniforms()` / `recreate_bind_group()`.
3. Run `tests/block-uniform-layout.test.ts` — its second describe block parses both structs and fails if their total byte sizes disagree (it only knows about the WGSL types already in use; extend `WGSL_TYPE_SIZES` in the test if you add a new one).

TS and C++ uniform layouts are **independent contracts today** — this workflow is about keeping each side internally consistent (WGSL text matching its own CPU offsets), not about the two backends describing identical bytes.

`cpp/src/board_metrics.h` (camera/board/block-size constants) has a similar parity test against `src/webgpu/renderMetrics.ts` in `tests/render-metrics.test.ts` — update both files together when either changes.

Release wasm size is recorded in `public/cpp/build-info.json` (`wasmBytes`, `jsBytes`). Target: stay well under debug bloat (~2 MB); release builds are typically tens of KB before texture assets.

**ASYNCIFY / JSPI:** not required with the `preinitializedWebGPUDevice` pattern above. Only needed if you move `requestAdapter` / `requestDevice` into C++ with blocking waits.

**Build ports** (`npm run cpp:release` logs the winner):

| emsdk | Typical linked port |
|-------|---------------------|
| 4.0.10 – 4.x | `--use-port=emdawnwebgpu` (tried first) or `-s USE_WEBGPU=1` if forced via `TETRIS_CPP_WEBGPU=legacy` |
| 5.0.7+ (pinned) | `--use-port=emdawnwebgpu` only — `-s USE_WEBGPU=1` is gone upstream, `auto` skips it intentionally |
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
| `?renderer=webgpu-cpp` | wasm present | `C++ GPU` badge; textured blocks (block.png), ghost + lock flash |
| `?renderer=webgpu-cpp` | wasm present, no WebGPU | `C++ wasm` badge, Canvas2D fallback draw |
| `?renderer=webgpu-cpp` | wasm absent | `C++ WIP` or fallback warning → WebGPU/WebGL2 |

**Per preference, verify:**

- [ ] `?renderer=webgpu-cpp` shows gold/glass textured blocks (not flat vertex colors)
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
RENDERER=webgpu-cpp node scripts/screenshot.cjs
```

## Roadmap (post-scaffolding)

### Short term — C++ owns playfield draw via WebGPU
- Acquire `GPUDevice` / surface from C++ (`emdawnwebgpu` / `webgpu.h`)
- Colored or textured quads for locked + active pieces
- Keep `EmscriptenView` as thin `IView` shell

### Mid term — rendering depth
- Move block lighting math to C++
- ~~Bundle WGSL from the C++ build~~ — done: `cpp/src/shaders/**/*.wgsl` embedded via `scripts/generate-cpp-shaders.mjs` (see "Shader source of truth" above). Remaining work is PBR *parity* with TS, not sourcing.
- GPU particle system (or hybrid with TS effects)

### Long term — full renderer ownership
- Post-process pipeline (bloom, aberration, shockwave) in C++
- **Take over reactive video compositing** (remove DOM `<video>` dependency)
- Shared memory for zero-copy playfield + piece state beyond the 200-byte grid

### Suggested follow-up issues
1. C++ WebGPU device + surface acquisition (#362)
2. Textured block quads + camera in C++
3. ~~WGSL shader pipeline owned by cpp build~~ — done (`cpp/src/shaders/` + `generate-cpp-shaders.mjs`); full PBR parity with the TS shader is the real remaining work
4. Particle pass migration
5. Video background compositing in C++

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `emcc not found` | `source emsdk_env.sh` |
| `USE_WEBGPU` rejected | Normal on emsdk 5.x — legacy flag is gone upstream; `auto` no longer tries it first, and only falls back to it under `TETRIS_CPP_WEBGPU=legacy` on older emsdk |
| No lime frame / `C++ WIP` badge | Run `npm run cpp:release`; confirm `public/cpp/*.wasm` exists |
| Black board on cpp path | Check console for wasm fetch failures; verify Vite serves `/cpp/` |
| Falls back to WebGPU | Expected when wasm missing or `EmscriptenView.create()` throws |
