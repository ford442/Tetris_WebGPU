# Weekly Plan

## GPU-resident clear-dissolve field

Goal: demonstrate the CPU-authoritative → GPU-pushed → GPU-consumed pattern with a
single per-cell visual field. When `lineUtils` clears rows, a compute shader writes a
10×20 f32 buffer of dissolve progress (0..1, decaying over ~300ms) that the playfield
block fragment shader samples to glow cleared cells. No `mapAsync`, no readback.

### Done
- **Fix First**: `pbrBlocks.ts` authored glass path used an undefined `combinedGlassMask`
  identifier (WGSL compile error) and a literal `mix(0.82, 0.97, …)` that diverged from the
  documented intent. Restored to `glassMin`/`glassMax` constants + `glassMaskAlpha`, matching
  `tests/shader-optimizations.test.ts` (was 1 failing test, now green).
- Added `dissolveBuffer` (200 × f32 storage, indexed `row*10+col`) — GPU-resident,
  zero round-trip. Bound to BOTH the dissolve compute pass (`read_write`, binding 0) and
  the block render pipeline (`read`, `@binding(5) @group(0)`).
- Added `DissolveComputeShader` in `webgpu/compute.ts` (next to the particle compute shader):
  decays every cell by `dt/0.3`, re-arms rows flagged this frame to `1.0`.
- `viewWebGPU.onLineClear` → `triggerDissolve(lines)` pushes cleared rows DOWN into the
  compute uniform (`dt`, `decayRate`, `rowClear[20]`); `dispatchDissolveCompute` runs the
  pass only during the ~300ms post-clear window (self-gated, no per-frame cost otherwise).
- Block fragment shader (`pbrBlocks`) derives cell from `vWorldPos` (reusing the existing
  `/BLOCK_WORLD_SIZE` mapping) and adds an additive cyan glow scaled by the field value;
  alpha untouched so shifted blocks don't flicker.
- Added binding 5 (shared `dissolveBuffer`) to `uniformBindGroup_CACHE` (viewWebGPU) and the
  border bind groups (viewPlayfield) so the `layout:"auto"` block pipeline stays valid.

### Last Run
- `npm run build` — ✅ built in ~1.2s (90 modules).
- `npm run test` — ✅ 62 passed (11 files). Previously 1 failing (pre-existing glass-path bug).
