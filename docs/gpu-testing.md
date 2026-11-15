# GPU testing without a GPU

Three layers, cheapest first. All run on **software** adapters — no GPU hardware, nothing added to the
shipped bundle. `.github/workflows/gpu-tests.yml` runs them on PRs touching `src/webgpu/**`,
`src/viewWebGL2/**`, `cpp/**`, `shared/**` (and the tests themselves); `ci.yml` also runs layers 1–2 as
part of `npm test`.

| Layer | What it proves | Command | Backend |
|---|---|---|---|
| 1. WGSL compile | every shader module the game ships compiles (Tint), with `file:line` on error | `npm run wgsl:validate` · `tests/wgsl-compile.test.ts` | Dawn Node + lavapipe/SwiftShader |
| 2. Kernel parity | the compute kernels give the same answers as their CPU rungs | `npm run test:gpu` · `tests/gpu-chores-dawn.test.ts` | Dawn Node + lavapipe/SwiftShader |
| 3. Browser E2E | boot policy, deterministic frames, goldens, cross-renderer agreement | `npm run build && npm run e2e` | Chromium + SwiftShader |

## Getting an adapter

Layers 1–2 use the `webgpu` npm package (Dawn's Node bindings). `tests/helpers/dawn.ts` picks a software
Vulkan driver: a preset `VK_ICD_FILENAMES`, else Mesa **lavapipe** (`sudo apt-get install mesa-vulkan-drivers`),
else any system ICD, else the SwiftShader that ships inside Playwright's Chromium.

With no adapter the suites are **skipped with a printed `[gpu-skip]` reason, never silently passed**. Set
`TETRIS_REQUIRE_GPU=1` (CI does) and a missing adapter is a failure instead.

## Layer 1 — compile every module

`tests/helpers/shaderCatalog.ts` collects every module in the form the browser compiles it:

- the TS template-string shaders (`grid`, `particle`, `postProcess`, `background`, `bloomShaders`,
  `frostedGlass`, `materialAwarePostProcess`, the debug set, the compute shaders, the chore kernels),
- the block shader exactly as `createBlockShaders()` composes the `.wgsl` stages,
- the two private blit shaders (scraped from their `const`; the scrape throws if one moves or starts
  interpolating),
- the C++ renderer's shaders, read back from the **generated** `cpp/src/generated/*.h` and composed in the
  order `compose_authored_block_wgsl()` documents.

The "composed verbatim" claim in CLAUDE.md is a checked fact: the test asserts each `kShared*Wgsl` literal is
byte-identical to its `src/` file, that the TS block fragment embeds the same shared modules, and that the
compose order in `gpu_renderer.cpp` equals the order the catalog compiles.

Beyond compiling, each module's declared entry points must include the ones its pipeline-creation site asks
for, and compute modules get a real `createComputePipeline` (catches binding conflicts).

### The baseline (`tests/helpers/wgslBaseline.ts`)

The first run found six modules that **real Chromium (153) also rejects**, with identical messages:
`let dangerOpacity` assigned in three post-process shaders, and derivative / `textureSample` calls in
non-uniform control flow in the block shaders and the C++ post-process. They are listed in
`KNOWN_WGSL_FAILURES` so the gate could be switched on without changing rendering code. The list is strict
both ways: a new error fails, and a listed error that no longer occurs also fails ("fixed — delete the
entry"), so it can only shrink. Fixing a shader means deleting its entry in the same change.

## Layer 2 — kernels vs CPU rungs

Runs real WGSL on the software adapter and compares:

| Kernel | Reference | Comparison |
|---|---|---|
| `luma_histogram` | `cpuLumaHistogram` (rgba8) + a float reference (HDR, 0, negatives) | exact, odd sizes (partial workgroups), totals prove no edge double-count |
| `downsample_2d` | CPU port, incl. f16 rounding of the `rgba16float` target | ≤ 1.5e-3 (one half-float ulp) |
| `compact_indices` | `compactIndicesCpu` via `GpuChoreRunner.compactIndicesOnGpu` | exact, 9 flag sets incl. `maxOut` truncation |
| luma chore end-to-end | `GpuChoreRunner.encodeLumaScan` → `histogramToStats` | within one bin (drivers choose the f16 rounding mode) |
| `detect_lines` | board scan + `rowsFromClearMask` | exact mask / count / consumed flags; dissolve decay |
| particle compute | CPU port of the physics step | ε = 2e-3 + 1e-4·|x|; dead particles byte-identical |

A GPU rung that silently falls back to its CPU path would pass a parity test for free, so runner-driven
checks also assert the GPU rung is still enabled.

Fixtures keep every texel clear of a histogram bin edge (3e-5 bin widths), so f32-vs-f64 binning cannot
differ by luck of the seed.

Two things the kernels tests pinned that are worth knowing:

- `detect_lines`: columns 1–9 of a newly cleared row read `clearFlags[row]` while column 0 writes it, with no
  barrier. Whether they see the re-arm is unspecified in WGSL (hardware happens to agree). The test accepts
  either legal outcome.
- `ParticleComputeShader`: the `y < -60` cull is unreachable because the floor clamp at `y = -43` runs first.

### Dawn Node gotcha (important if you extend this)

**Keep the Dawn instance and adapter referenced for the life of the process.** Dawn-node frees the native
instance when its JS wrapper is garbage-collected while its event-polling timer keeps calling
`InstanceBase::ProcessEvents()`. That is a use-after-free that shows up as random `SIGSEGV`,
`std::system_error: Invalid argument` or "The futex facility returned an unexpected error code" aborts
whenever a GC lands mid-run — it looks exactly like a driver or threading bug. `acquireDawn()` pins them.

## Layer 3 — browser E2E and visual regression

`playwright.config.ts` runs the **production build** (`npm run build`) through `tests/e2e/server.mjs` in
Chromium on SwiftShader. `@playwright/test` is pinned to an **exact** version: each release ships one
Chromium revision and the goldens are pixels from it. Bumping Playwright means regenerating goldens in the
same change. Screenshots and diffs go to `test-results/` — not `.playwright-mcp/`.

**`boot.spec.ts`** — the boot policy in a real browser: `auto` → TS WebGPU with `window.webgpuProbe.ok`;
`?renderer=webgl2`; `?renderer=webgpu-cpp`; **no adapter** (`navigator.gpu` removed, or `requestAdapter()`
→ null) → WebGL2 with the "WebGL2 (no WebGPU)" badge; explicit `webgpu` / `webgpu-cpp` with no adapter →
the fatal overlay, a failed probe, and no `window.game`. Console errors are checked against
`tests/e2e/knownIssues.ts` (strict both ways, like the WGSL baseline).

**`visual.spec.ts`** — deterministic frames:

- `?deterministic[&seed=N]` (`src/deterministic.ts`) seeds `Math.random` (bag, particles, shake) and freezes
  the `<video>` background on frame 0. It is inert without the flag.
- time comes from Playwright's `page.clock` (`performance.now`, timers and rAF together).
- the board is not hand-set: `tests/e2e/frameFixture.ts` runs the **replay simulator** (`GameSimulator`) over
  a recorded input list and writes `tests/e2e/fixtures/frame.json`; `tests/e2e-frame-fixture.test.ts` fails if
  that file stops matching the simulator, so a rules change appears as a fixture diff, not a mystery
  screenshot diff. Regenerate with `UPDATE_E2E_FIXTURES=1 npm test -- e2e-frame-fixture`.
- the frame is the playfield rect only (the HUD is live DOM with a timer).

Per renderer: (1) the filled board differs from an empty board by more than 2% of pixels (golden-free "blocks
draw" check), (2) `pixelmatch` against `tests/e2e/goldens/<renderer>/frame.png` (≤ 0.2%), and across
renderers (3) TS WebGPU ↔ C++ ≤ 1%, WebGL2 ↔ TS WebGPU ≤ 12%.

```bash
npm run build && npm run e2e                 # run
UPDATE_GOLDENS=1 npm run e2e                 # write goldens for the renderers that draw correctly
npx playwright show-report                   # after a CI run: download the e2e-results artifact
```

### Known-broken renderers

`KNOWN_BROKEN_RENDERERS` in `knownIssues.ts` lists renderers that do not draw a correct board today (the
WGSL baseline above breaks the TS WebGPU block and post-process pipelines; the C++ renderer cannot load from
the production build). Their visual tests are declared `test.fail()`: they pass while the renderer is broken
and fail with "expected to fail, but passed" the moment it is fixed — the cue to delete the entry, run
`UPDATE_GOLDENS=1 npm run e2e`, and commit the goldens. Only the WebGL2 golden exists today.

### App bug found while building this

`src/viewCpp/CppRendererLoader.ts` probes absolute `/cpp/...` URLs and ignores Vite's base, so
`?renderer=webgpu-cpp` cannot load from a build served under `/tetris-webgpu/`. `tests/e2e/server.mjs`
aliases `/cpp/*` so the C++ path is still exercised; delete the alias when the loader honours
`import.meta.env.BASE_URL`.
