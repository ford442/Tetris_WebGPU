# GPU Particle System

Unified **GPU-resident** gameplay particle pool. Jellyfish background particles (`jellyfishParticles.ts`) remain a separate ambient system.

## Architecture

```
TypeScript emit API (ParticleEmitter)
  → staging buffer (pendingUploads / pendingUploadIndices)
  → queue.writeBuffer → GPU storage (64 B / particle)
  → compute.ts ParticleComputeShader (integrate, die, floor bounce, shockwave)
  → billboard render pass (viewRenderLoop)
```

Optional second pass: `particleMaterialInteraction.ts` WGSL in block shader (specular flash / neon when particles pass near premium materials). Enabled via `useParticleInteraction` when particles are on.

## Buffer layout

See `src/webgpu/particles/layout.ts` — **64 bytes** per particle, 16 floats in CPU staging. Must match WGSL `Particle` in `compute.ts`.

## API

| Module | Role |
|--------|------|
| `particles/ParticleEmitter.ts` | `emitParticles`, `emitParticlesRadial`, `emitStream`, `emitExplosion`, `enqueue` |
| `particles.ts` (`ParticleSystem`) | Game-specific: line-clear shards, T-spin crown, perfect clear text, droplets |
| `particles/metrics.ts` | `aliveEstimate`, dispatch ms, skip count |

## Emit call sites (gameplay juice)

| Location | Method |
|----------|--------|
| `viewGameEvents.ts` | `emitParticles`, `emitParticlesRadial`, `emitLineClearShards` |
| `viewPremium.ts` | `emitTSpinCrown`, `emitPerfectClearText` |
| `gameOverAnimation.ts` | `emitParticlesRadial` |
| `controller.ts` | `emitParticlesRadial` (hard drop) |

All route through `view.particleSystem` → `ParticleEmitter` staging.

## Quality budget

| Preset | Max particles |
|--------|----------------|
| low | 800 |
| medium | 2000 |
| high | 4000 |
| ultra | 5000 |

Applied in `viewPremium.applyGameSettings` via `applyQualityBudget`.

## Quiet-frame optimization (preserved)

Compute dispatch skipped when (`viewUniforms.ts` / `viewRenderLoop.ts`):

- `useParticles === false`, and
- no pending uploads, and
- shockwave inactive, and
- `time - lastEmitTime > 3s`

## Visual parity

- **Same** billboard shader + compute physics as pre-refactor.
- **Intentional**: metrics expose dispatch/skip counts for profiling; no gameplay change.
- CPU `updateParticles()` is a documented no-op; simulation is 100% GPU.

## Deprecated

- `Particle[]` CPU array on `ParticleSystem` — unused legacy field.
- `getParticleData()` — returns empty buffer.
