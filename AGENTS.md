# AGENTS.md

## Project Context
**Tetris_WebGPU** is a web-based Tetris implementation showcasing high-performance web graphics and computing.
* **Frontend:** TypeScript + Vite.
* **Rendering:** **WebGPU** (Not WebGL).
* **Game Logic:** Hybrid of TypeScript and **AssemblyScript (WASM)**.

## Key Directives

### 1. The Build Pipeline (Critical)
This project requires a distinct compilation step for the WASM modules. Vite does **not** compile the AssemblyScript automatically.
* **If you modify files in `/assembly`:** You **MUST** run `npm run asbuild:release` to update the `public/release.wasm` binary.
* **If you modify files in `/src`:** Vite's HMR usually handles this.
* **Full Build:** Use `npm run build:all` to compile WASM and then build the frontend.

### 2. WebGPU Specifics
* **API:** Uses the modern WebGPU standard (`@webgpu/types`).
* **Shaders:** Located in `src/webgpu/shaders.ts` (WGSL).
* **Browser Requirement:** Requires a WebGPU-enabled browser (Chrome/Edge/Arc).

### 3. Architecture & State
* **Logic Core:** The game logic is primarily driven by AssemblyScript (`assembly/index.ts`).
* **Bridge:** `src/wasm/WasmCore.ts` acts as the bridge between the UI/WebGPU and the compiled WASM binary.
* **Rendering:** `src/viewWebGPU.ts` handles the GPU command encoding and rendering loop.

## Directory Structure
* **`/assembly`**: AssemblyScript source code (Game Logic). Compiles to `.wasm`.
* **`/src`**: TypeScript source code.
    * **`/webgpu`**: Rendering logic, buffers, and WGSL shaders.
    * **`/wasm`**: Interface/Bridge to the compiled WASM module.
    * **`/game`**: Pure TypeScript game logic (Collision, Scoring, Pieces).
* **`/public`**: Static assets.
    * *Note:* The build script copies `release.wasm` here.
* **`/dist`**: The output folder for production deployment.

## Available Tools & Commands

### Build & Run
* **Dev Server:** `npm run dev` (Vite)
* **Compile WASM (Release):** `npm run asbuild:release`
* **Compile WASM (Debug):** `npm run asbuild:debug`
* **Full Production Build:** `npm run build:all`

### Testing
* **Unit Tests:** `npm test` (Runs Vitest)

### Deployment
* **Script:** `deploy.py`
* **Pre-requisite:** Run `npm run build:all` first to populate `/dist`.
* **Command:** `python3 deploy.py`
* **Target:** Deploys via SFTP to `test.1ink.us/tetris-webgpu`.

## Common Pitfalls
1.  **"My WASM changes aren't showing up":** You likely forgot to run `npm run asbuild:release`. The browser loads the `.wasm` file from `public/`, not the `.ts` file from `assembly/`.
2.  **WebGPU Errors:** Ensure `navigator.gpu` is available. If the app crashes on init, it is usually because the browser lacks WebGPU support or the context was lost.
