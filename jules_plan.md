## Weekly Performance Optimization and Game-Feel Polish

**Optimizations implemented this week:**

**1. Shader ALU Optimization:**
   - Replaced unoptimized `distance(A, B)` calls with `length(A - B)` in `src/webgpu/shaders/postProcess.ts` and related material-aware/enhanced shaders to optimize ALU usage.
   - Refactored multiple `if` condition structures into branchless arithmetic in `src/webgpu/shaders/background.ts` (e.g., handling warpSurge, ghost piece beams, and lock percent warning flashes) by utilizing `step()` and `mix()` to eliminate branching divergence and maximize GPU warp execution parallelization.

**2. Image Sampled Block Rendering:**
   - In `src/webgpu/shaders/pbrBlocks.ts`, tweaked the `glassTint` mix value from `0.1` down to `0.05`. This heavily preserves the background rendering layer behind transparent blocks (like glass), reducing washed-out color artifacts and improving general transparency to ensure the hyperspace video remains incredibly clear.

**3. Playability & Game Feel:**
   - Refined input latency and responsiveness closer to top-level competitive standards: Delayed Auto Shift (DAS) was reduced from `110ms` to `100ms`, and Auto Repeat Rate (ARR) was tightened from `8ms` to `5ms`. This shaves vital milliseconds for top players.
   - Tightened the game's input buffer windows (`JUMP_BUFFER_WINDOW` reduced from 100ms to 80ms, `MOVE_BUFFER_WINDOW` reduced from 120ms to 100ms) to ensure precise tracking without accidental double-activations during high-speed play.
