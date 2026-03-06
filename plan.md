1. **Performance Optimizations (GC & WebGPU loops):**
   - Review `src/viewWebGPU.ts` focusing on `renderPlayfild_WebGPU`. The method `renderPlayfild_WebGPU` uses `Matrix.mat4.translate(this.MODELMATRIX, this.MODELMATRIX, [colom * 2.2, row * -2.2, 0.0]);` which creates a new array every loop iteration. I will modify this to use `this._f32_3` to pre-allocate `[colom * 2.2, row * -2.2, 0.0]`.
   - I will do the same optimization for `renderPlayfild_Border_WebGPU` where `[colom * 2.2 - 2.2, row * -2.2 + 2.2, 0.0]` is created.
   - Refactor `render` in `src/viewWebGPU.ts` to cache WebGPU render pass descriptors (`backgroundPassDescriptor`, `renderPassDescription`, `ppPassDescriptor`) instead of recreating them on every frame, significantly reducing garbage collection.
   - I will do the same optimization in `render` where `Matrix.mat4.lookAt(this.VIEWMATRIX, [camX, camY, camZ], [9.0, -20.0, 0.0], [0.0, 1.0, 0.0]);` allocates new arrays. I will use preallocated class fields.
   - Run `npm run build:all` to verify compilation.

2. **Graphical Performance (Shader Math):**
   - I will optimize the `pow(x, 4.0)` calculations inside the `Shaders` fragment in `src/webgpu/shaders.ts`. There are multiple lines using `pow(x, 4.0)`, such as `pow(max(0.0, 1.0 - dotNV * (1.0 - dispersion * 0.5)), 4.0)` and `pow(1.0 - max(dot(N, V), 0.0), 4.0)`. I will replace `pow(val, 4.0)` with multiplication `(val * val) * (val * val)` or similar avoiding the expensive `pow` function.
   - Run `npm run build:all` to verify compilation.

3. **Playability & Game Feel (Jump-Buffer & Controller):**
   - In `src/controller.ts`, I will adjust the `BUFFER_WINDOW` to be shorter to make rotation buffering feel snappier. I will change it from `150` to `80`.
   - In `src/controller.ts`, I will optimize integer division in the soft drop logic by replacing `Math.floor(this.actionTimers.down! / SOFT_DROP_SPEED)` with `(this.actionTimers.down! / SOFT_DROP_SPEED) | 0`.
   - In `src/controller.ts`, I will update `actionTimers` initialization to include all `Action` keys to avoid optional key checks.
   - Run `npm run build:all` to verify compilation.

4. **Testing & Verification:**
   - Run the test suite via `npm test` in the terminal using `run_in_bash_session` to ensure no logic regressions occurred.

5. **Pre-commit Steps:**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.

6. **Submit Code:**
   - Once all tests pass and pre-commit checks are green, submit the changes with a concise commit message.
