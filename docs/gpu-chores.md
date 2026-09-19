# GPU chores

`src/webgpu/gpuChores/` holds small compute helpers for **post-processing and
juice** — a luminance histogram that drives the bloom threshold, a downsample
step for the bloom pyramid, and an index compaction for line-clear particle
spawns.

They are deliberately *not* a GPU game. The board, collision, gravity, DAS/ARR
and scoring stay exactly where they are (CPU + AssemblyScript WASM). A chore
takes a rendered texture or a flag buffer and hands back a handful of numbers.

```
Game (CPU/WASM)  ──►  Renderer  ──►  frame texture ──►  chore  ──►  a few floats
      ▲                                                               │
      └──────────────── never written by a chore ────────────────────┘
```

## Jobs

| Job | Workgroup | Input | Output | Used by |
|-----|-----------|-------|--------|---------|
| `luma_histogram` | `(8, 8)` | composited frame | 64 luminance bins | bloom threshold, flash headroom |
| `downsample_2d` | `(8, 8)` | any color texture | half/quarter-res copy | histogram input, bloom pyramid |
| `compact_indices` | `(64)` | 0/1 flags | dense ascending index list | line-clear spawn cells |

## One device per session

Chores **adopt** the device the active renderer owns; they never call
`requestAdapter`/`requestDevice`. `gpuChores/deviceRegistry.ts` records every
device `requestGpuAdapterAndDevice()` hands out and retires a predecessor when a
replacement is registered, so the cpp-renderer → TS-WebGPU fallback and
device-loss recovery both end with exactly one live device. `CppRendererLoader`
releases its device explicitly when C++ init fails, before the TS renderer
builds its own.

Only the renderer that actually won the fallback chain wires chores up. Today
that is the TS WebGPU view (`viewPipelines.ts`); the Emscripten C++ renderer
stays as it is, and the policy already accepts `webgpu-cpp` for when it opts in.
There is never a second device, and never a TS renderer and a C++ renderer live
at once.

## Backends

```
WebGPU compute  →  WASM/JS overlay FX (CPU)
```

There is no WebGL2 rung by design: on the WebGL2 fallback renderer, or with no
device at all, the chores run their CPU rung and the renderer keeps the static
tuning. The board plays either way — losing the GPU rung costs juice quality,
never playability.

The GPU rung is retired for the rest of the session the first time a chore call
throws (device lost, a driver that rejects the shader, a browser whose WebGPU
implementation differs — Chrome vs Edge). That transition is a breadcrumb, not
an error dialog.

## Kill switch and breadcrumbs

| Switch | Effect |
|--------|--------|
| `?no_gpu_compute` | forces the CPU rung for the session |
| `?no_gpu_compute=0` | forces it back on, overriding the stored key |
| `localStorage.tetris_no_gpu_compute = 'true'` | same as the flag, persisted |
| `?gpu=low` / quality `low` | CPU rung (keeps the extra passes off the budget) |

Every state transition lands in a ring buffer exposed on the console:

```js
__tetrisGpuChores.breadcrumbs()   // [{ t, event: 'luma:first-readback', detail: 'avg=0.214' }, ...]
__tetrisGpuChores.status()        // { backend, reason, enabled, scans, readbacks, stats }
```

Greppable event ids: `device:registered`, `device:replaced`, `device:released`,
`chores:created`, `luma:pipelines-ready`, `luma:resized`, `luma:first-readback`,
`luma:encode-failed`, `luma:map-rejected`, `compact:failed`, `chores:destroyed`.

## Bloom threshold (the #265 guard)

The bloom threshold used to be a constant — 0.72, or 1.05 on the HDR playfield.
A constant is wrong in both directions: on a dark board nothing crosses it, and
on a bright frame most of the picture crosses it and blooms into mush.

Each scan bins the composited frame, and `lumaStats.ts` places the threshold at
the luminance where only ~6% of the frame is brighter. One invariant keeps it
safe:

> **the derived threshold is never lower than the static baseline**

so the measured path can only bloom *less* than the hand-tuned look, never more.
`AutoBloomController` eases between values (the scan lands every 4th frame; a
raw value would pump) and scales the additive line-clear flash by the frame's
remaining headroom. With no stats — chore absent, CPU rung, kill switch, or just
the first frames — it returns the static tuning verbatim, which is what makes
the whole thing optional.

Cost: two compute passes on a ≤256px-wide copy every 4th frame, and a 256-byte
non-blocking readback. The frame never waits on it; a scan whose readback has
not landed simply reuses the previous stats.

## Line-clear spawn compaction

`buildSpawnFlags()` marks the cells of the cleared rows that are occupied and
survive the current particle-budget stride; `compact_indices` turns that into
the dense list of cells that get a per-cell firework. At the full budget every
cell survives, so a healthy frame behaves exactly as before; under adaptive
pressure the burst thins evenly across the row instead of letting the particle
ring buffer drop whichever emits happened to land last.

Positions, colours and counts stay in `viewGameEvents.ts`. The chore picks
cells, nothing else.

The wired path uses the CPU rung: the burst needs its indices in the same frame
the rows clear, and a GPU compaction would have to be read back — one or two
frames of latency for a 200-element list. `GpuChoreRunner.compactIndicesOnGpu()`
exists for callers that can take the deferral; both rungs are pinned to the same
ascending output (the kernel derives each slot from a prefix count rather than
an atomic bump, precisely so the two can be compared).

## Tests

| File | Covers |
|------|--------|
| `tests/gpu-chores-policy.test.ts` | kill switch, backend order, renderer/quality gating |
| `tests/gpu-chores-luma.test.ts` | histogram stats, threshold floor, flash headroom, smoothing |
| `tests/gpu-chores-compact.test.ts` | CPU/WGSL compaction parity, spawn flags, budget stride |
| `tests/gpu-chores-runner.test.ts` | device adoption, throttling, readback, failure → CPU rung |
| `tests/gpu-chores-device-registry.test.ts` | one live device per session |
| `tests/gpu-chores-shaders.test.ts` | workgroup shape, entry points, no board state in WGSL |
| `tests/gpu-chores-line-clear-wiring.test.ts` | burst unchanged at full budget, thinned under pressure |
| `tests/gpu-chores-postprocess-wiring.test.ts` | the scan runs on the pre-bloom frame, in the same encoder |
