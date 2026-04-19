## Weekly Performance Optimization and Game-Feel Polish

**Optimizations implemented this week:**

**1. Shader ALU Optimization:**
   - Modified distance and length calculations in `src/webgpu/shaders/background.ts` and `src/webgpu/shaders/postProcess.ts` (and enhanced versions) to use dot products (`dot(diff, diff)`) where possible to calculate squared distances. This avoids the expensive square root (`sqrt`) operation commonly found in shader length/distance built-ins, improving GPU execution time and preserving frame stability on weaker hardware.
   - Refactored several `if` condition structures into branchless arithmetic in `src/webgpu/shaders/background.ts`. For instance, replacing logic like `if (hash > threshold)` with `let isStar = step(threshold, hash);` to avoid branching divergence on GPU warp execution.

**2. Image Sampled Block Rendering:**
   - Updated `textureScale` in `src/webgpu/geometry.ts` from `0.85` to `0.95`. This zooms the block UV mapping closer to the edges, bringing sharper and more prominent texture details (especially visible in marble and metal themes) onto the front faces without bleeding onto other atlas blocks.
   - In `src/webgpu/shaders/pbrBlocks.ts`, tweaked the `glassTint` mix value from `0.2` down to `0.1`. This heavily preserves the background rendering layer behind transparent blocks (like glass), ensuring the hyperspace video remains incredibly clear.

**3. Playability & Game Feel:**
   - As per recent standards, explicit game feel `TODO` elements were previously cleared, and mechanics like Coyote Time and Buffer Input Split Windows are running well in the engine.
   - To align more closely with professional Tetris tuning, I adjusted the controller constants: Delayed Auto Shift (DAS) was tuned down slightly from `120ms` to `110ms`, and Auto Repeat Rate (ARR) was tightened from `10ms` to `8ms`. This provides a noticeably faster response for high-level players, helping to shave fractions of a second during fast drops.
