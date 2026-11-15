# AGENTS.md

**Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** for everything about how this repo is built
(stack, structure, renderers and boot policy, authored block material, WASM/C++ build rules,
conventions, pitfalls, TypeScript configuration, `VITE_BASE`, CI & deploy). It is the single source of
truth shared by `CLAUDE.md`, `AGENTS.md` and `.github/copilot-instructions.md`; keep architecture facts
there so they only need updating once.

Quick orientation: **Tetris_WebGPU** — TypeScript 5.8 + Vite 6, WebGPU rendering (opt-in Emscripten C++
renderer, WebGL2 only when there is no adapter or explicitly chosen), AssemblyScript collision WASM,
procedural Web Audio, Vitest.

Before finishing: `npm run typecheck && npm run lint && npm test`.

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
npm run typecheck     # tsc -b over src, tests, scripts, workers
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

`npm run build:all` then `npm run preview` serves `/dist` with base path `/tetris-webgpu/` (override with `VITE_BASE`; see `docs/ARCHITECTURE.md`).
