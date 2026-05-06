# Weekly Optimization Note

During the weekly scan for performance optimizations and game-feel polish, I found the following:

- **Missing Comments**: The source code in `src/` does not contain any of the typical marker comments such as `// TODO: Polish`, `// TODO: GameFeel`, or `// FIX: Latency`.
- **Pre-existing Optimizations**: Several expected optimizations (such as capping the sonic/soft drop steps to 22 in `src/controller.ts` to improve latency without relying on expensive `getGhostY()` calls per frame) are already present and applied in the active codebase.

Because the codebase is currently free of these specific TODO/FIX markers and recent game-feel optimizations have already been integrated into the controller module, no further actionable code changes were required for this task.

Future scans should ensure that the repository branch is synced properly and monitor for new game-feel features or latency regressions.

**Update (Current Run):** Replaced `Math.exp` calls in `src/viewWebGPU.ts` piece and camera interpolation with a faster `1.0 / (1.0 + x)` approximation to further reduce ALU operations per frame. Optimization check completed.

## NEON BRICKLAYER'S JOURNAL - VISUAL LOG

**Date:** 2026-05-06
**Enhancements:**
- "Added additive blending to the particle shader makes the explosions look like real light." (Verified already active)
- "Screen shake should decay exponentially, not linearly, for a snappier feel." (Verified already active)
- "Juiced up the shockwave on hard drops by multiplying its width and distortion strength by 1.5 in both the enhanced and material-aware post-processing shaders, giving it a much heavier, crunchier impact."
- "Added a gentle sine wave 'breathing' pulse to the ghost piece's alpha channel. It makes the piece look like glowing neon rather than static hologram wireframe."
