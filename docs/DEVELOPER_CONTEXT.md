# DEVELOPER_CONTEXT.md

## 1. High-Level Architecture & Intent

### Core Purpose
This application is a modern, high-fidelity Tetris clone built to demonstrate the capabilities of **WebGPU**. It features a "Future/Neon" aesthetic with advanced visual effects like particle systems, dynamic lighting, shaders, and a "portal" video background system, while maintaining strict adherence to standard Tetris mechanics (SRS, Wall Kicks, Lock Delay).

### Tech Stack
*   **Language:** TypeScript
*   **Rendering:** WebGPU (native API), HTML5 Canvas (for 2D UI elements like Next/Hold)
*   **Build System:** Vite
*   **Math Library:** `gl-matrix` (used for 3D transformations)
*   **Audio:** Web Audio API (via custom `SoundManager`)

### Design Patterns
*   **MVC (Model-View-Controller):**
    *   **Model (`src/game.ts`):** Pure logic state (playfield, pieces, collision, SRS rules). Independent of rendering.
    *   **View (`src/viewWebGPU.ts`):** Handles the WebGPU render loop, shaders, particle systems, and DOM synchronization.
    *   **Controller (`src/controller.ts`):** Manages user input (DAS/ARR), game loop timing, and bridges Model updates to View.

## 2. Feature Map

*   **Game Loop & Logic**
    *   *Entry:* `src/controller.ts` -> `gameLoop()`
    *   *Details:* A `requestAnimationFrame` loop calculates `dt` and calls `game.update(dt)`. It handles gravity and lock delays.
*   **WebGPU Rendering**
    *   *Entry:* `src/viewWebGPU.ts` -> `Frame()`
    *   *Details:* Manages multiple render pipelines (Background, Playfield, Particles). Uses manual buffer writing (`device.queue.writeBuffer`) for dynamic updates.
*   **SRS (Super Rotation System)**
    *   *Entry:* `src/game.ts` -> `rotatePiece()`
    *   *Details:* Implements standard Tetris wall kicks using lookup tables (`SRS_KICKS_JLSTZ`, `SRS_KICKS_I`).
*   **Input Handling (DAS/ARR)**
    *   *Entry:* `src/controller.ts` -> `handleInput()`
    *   *Details:* Implements "Delayed Auto Shift" and "Auto Repeat Rate" for precise piece movement, decoupled from frame rate.
*   **Particle System**
    *   *Entry:* `src/viewWebGPU.ts` -> `emitParticles()`
    *   *Details:* CPU-simulated, GPU-rendered point sprites for effects like Hard Drop and Line Clear.
*   **Video Background "Portal"**
    *   *Entry:* `src/viewWebGPU.ts` -> `updateVideoPosition()`
    *   *Details:* Dynamically positions an HTML `<video>` element behind the transparent WebGPU canvas to create a "portal" effect.

## 3. Complexity Hotspots

### WebGPU Resource Management (`src/viewWebGPU.ts`)
*   **Why it's complex:** The application interacts directly with the WebGPU API without a wrapper engine. It manually manages `GPUDevice`, `GPUBuffer`, `GPUBindGroup`, and `GPURenderPipeline`.
*   **Agent Note:** Watch out for `device.queue.writeBuffer` calls. The byte offsets (e.g., `offset_ARRAY + 192`) are hardcoded and brittle. Changing the `Uniforms` struct in the shader requires manual recalculation of all CPU-side buffer offsets.
*   **Race Conditions:** The `View` constructor starts initialization async (`preRender`). The render loop (`Frame`) guards against `!this.device`, but accessing `view` methods from `controller` before init completes can cause crashes if not carefully guarded.

### Collision & Wall Kicks (`src/game.ts`)
*   **Why it's complex:** The SRS implementation uses inverted Y-axis logic (Y increases downwards).
*   **Agent Note:** Standard Wiki SRS tables often assume Y-up. The code manually adapts this. When debugging rotation bugs, ensure you are thinking in "Y-down" coordinates.

### Input Timing (`src/controller.ts`)
*   **Why it's complex:** The game uses `performance.now()` for delta-time physics but mixes it with DOM `keydown`/`keyup` events for state flags.
*   **Agent Note:** `handleInput` runs inside the animation loop to apply DAS/ARR. Do not move movement logic strictly into event listeners, or the controls will feel "laggy" and lose the auto-repeat feature.

## 4. Inherent Limitations & "Here be Dragons"

### Known Issues
*   **Browser Support:** The `CheckWebGPU` function is basic. The game will fail silently or with a generic error on non-WebGPU browsers if the guard clauses are missed.
*   **Resource Leaks:** The current implementation creates new `BindGroups` for blocks every frame in `renderPlayfild_WebGPU` (`uniformBindGroup_ARRAY`). While JS GC handles the objects, this creates significant pressure on the WebGPU implementation's internal resource tracker.
*   **Video Fallback:** The video background relies on DOM layering (`z-index`). If the aspect ratio changes drastically, the alignment between the "3D Portal" and the 2D video might drift.

### Technical Debt
*   **`gl-matrix` Import:** Uses `// @ts-ignore const glMatrix = Matrix;` to bypass ESM/CJS interop issues. **Do not remove this hack** unless you are refactoring the entire build configuration.
*   **Hardcoded Geometry:** Cube and Quad geometry is defined inline in `src/viewWebGPU.ts`.
*   **Magic Numbers:** Shader uniform offsets (e.g., `size: 208`, `offset: 64`) are hardcoded.

### Hard Constraints
*   **Canvas Transparency:** The WebGPU canvas **must** use `alphaMode: 'premultiplied'` and the render pass **must** clear with `alpha: 0.0` to allow the background video to show through.
*   **Coordinate System:** The game logic relies on a 10x20 grid with Y-down. Changing grid dimensions requires updates to both `game.ts` logic and `viewWebGPU.ts` translation matrices (`colom * 2.2`).

## 5. Dependency Graph & Key Flows

### Critical Flow: Frame Update
1.  **Browser:** Triggers `requestAnimationFrame`.
2.  **Controller:** `gameLoop()` fires.
3.  **Controller:** Calculates `dt` and calls `game.update(dt)` (Logic/Physics).
    *   *Event:* Piece locks? -> `game` updates grid -> Returns `linesCleared`.
4.  **Controller:** Calls `viewWebGPU.onLineClear()` (if needed) to spawn particles.
5.  **View:** `Frame()` runs (Graphics).
    *   Updates Particle Physics (CPU).
    *   Writes Uniform Buffers (Global Time, Camera).
    *   **Render Pass 1 (Background):** Clears screen (Transparent).
    *   **Render Pass 2 (Playfield):** Iterates `game.playfield`, creates BindGroups, draws Cubes.
    *   **Render Pass 3 (Particles):** Draws particle instances.
6.  **Browser:** Composites WebGPU Canvas over HTML Video Element.
