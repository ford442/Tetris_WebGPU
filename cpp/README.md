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
| `cpp/src/playfield_draw.cpp` | Canvas2D bootstrap draw (colored quads, lime “C++ wasm” frame) |
| `src/viewCpp/EmscriptenView.ts` | `IView` adapter — TS shell + wasm handoff |
| `src/viewCpp/CppRendererLoader.ts` | Loads glue JS + wasm (WasmCore-style multi-path fetch) |
| `src/view/createView.ts` | Dynamic `import()` of EmscriptenView when pref is `webgpu-cpp` |
| `public/cpp/tetris_renderer.js` | Emscripten glue (Vite serves at runtime) |
| `public/cpp/tetris_renderer.wasm` | Compiled module |
| `build/cpp/` | Mirror of build artifacts |
| `scripts/build-cpp.mjs` | Tolerant Node driver for `emcc` |

## Prerequisites: Emscripten SDK

1. Install [emsdk](https://emscripten.org/docs/getting_started/downloads.html):

   ```bash
   git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
   cd ~/emsdk
   ./emsdk install latest
   ./emsdk activate latest
   source ./emsdk_env.sh   # required in every new shell
   ```

2. Verify:

   ```bash
   which emcc
   emcc --version
   ```

3. Build the renderer module:

   ```bash
   cd /path/to/tetris_webgpu
   npm run cpp:release
   ```

## npm scripts

| Script | Description |
|--------|-------------|
| `npm run cpp:debug` | Debug build (`-O0 -g`) |
| `npm run cpp:release` | Optimized release build |
| `npm run build:cpp` | Alias for `cpp:release` (non-fatal if `emcc` missing) |
| `npm run build:all` | AS WASM + cpp + Vite frontend |

`pretest` does **not** require `emcc` — only AssemblyScript (`asbuild:release || true`).

## Exact emcc command (reference)

Debug:

```bash
emcc cpp/src/renderer.cpp cpp/src/playfield_draw.cpp \
  -I cpp/src \
  -O0 -g -s ASSERTIONS=2 \
  -o public/cpp/tetris_renderer.js \
  -s USE_WEBGPU=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME=createTetrisRendererModule \
  -s ENVIRONMENT=web \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s 'EXPORTED_FUNCTIONS=["_init_renderer","_resize_renderer","_render_frame","_update_playfield","_get_playfield_ptr","_get_playfield_len","_malloc","_free"]' \
  -s 'EXPORTED_RUNTIME_METHODS=["ccall","cwrap","HEAP8","HEAPU8"]'
```

Release: same with `-O2` instead of `-O0 -g -s ASSERTIONS=2`.

`scripts/build-cpp.mjs` automates this and:
1. Tries `-s USE_WEBGPU=1`
2. Retries with `--use-port=emdawnwebgpu` on newer emsdk (5.x)
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
| Board draw (bootstrap) | C++ via Canvas2D EM_JS | Lime frame = wasm path |
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
```

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
| `?renderer=webgpu-cpp` | wasm present | `C++ wasm` badge, lime board frame, playable |
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
RENDERER=webgpu-cpp node screenshot_playing.js
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
