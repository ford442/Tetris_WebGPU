# WebGPU boot probe (hard-fail policy)

Related: [#485](https://github.com/ford442/Tetris_WebGPU/issues/485) (gpu-chores single-device
registry).

## Policy

This game is built for WebGPU. The **active renderer** — the TS WebGPU renderer
(`src/viewWebGPU.ts`) *or* the Emscripten C++ renderer (`?renderer=webgpu-cpp`),
never both — either gets a real `GPUDevice` or the boot **hard-fails**: a
blocking overlay replaces the page, and the game (`Game`, `Controller`,
`SoundManager`, …) is never constructed.

There is **no automatic WebGL rescue**. Previously, `createView()` silently
fell back TS WebGPU → WebGL2 (and cpp → TS WebGPU → WebGL2), so a broken
adapter/device on a WebGPU-branded game quietly drew the well on a different
GPU API. That fallback chain is gone:

| Preference (`?renderer=`) | Active renderer | On failure |
|---|---|---|
| `webgpu` / `auto` (default) | TS WebGPU | hard-fail, no WebGL2 |
| `webgpu-cpp` | Emscripten C++ (WebGPU backend only) | hard-fail, no TS WebGPU, no WebGL2 |
| `webgl2` | WebGL2 | n/a — this is a deliberate manual choice, not a rescue |

`?renderer=webgl2` (or `localStorage.tetris_renderer=webgl2`) still works: it's
an explicit, opt-in renderer selection, not something the boot probe reaches
for on its own. A **WebGL tetromino renderer that the probe falls back to
automatically** is an explicit non-goal for now — a later wave may reintroduce
that as its own opt-in, probed path, but it is not part of this change.

## Boot probe

`src/webgpu/gpuContext.ts`'s `requestGpuAdapterAndDevice()` is still the only
place that calls `navigator.gpu.requestAdapter()` / `adapter.requestDevice()`
— the probe never requests its own adapter/device, so recording one never
risks a second live device. It leaves behind `getLastGpuAcquireDiagnostics()`
(`{ reason, adapterDescription }`), and `src/webgpu/bootProbe.ts` turns that
into a stable, JSON-serializable record on `window.webgpuProbe`:

```ts
interface WebgpuProbeResult {
  ok: boolean;
  browser: string;           // 'chrome' | 'edge' | 'firefox' | 'safari' | 'opera' | 'other'
  reason: string | null;     // null on success
  adapter: string | null;    // adapter description, when one was obtained
  renderer: 'ts' | 'cpp';    // which renderer this probe is for
}
```

`browser` and `reason` deliberately don't collapse Chrome and Edge into one
"Chromium" bucket: both gate WebGPU behind different flags
(`chrome://flags/#enable-unsafe-webgpu` vs `edge://flags/#enable-unsafe-webgpu`),
and a failure reason is annotated with the flag relevant to the browser that
hit it.

`window.webgpuProbe` is set on **every** boot attempt, success or failure —
check it first when a report says "the board never showed up."

## Fatal overlay

`src/webgpu/fatalBootOverlay.ts#showFatalWebgpuOverlay()` renders a full-page
blocking overlay (no board, no canvas) describing the probe. `createView()`
(`src/view/createView.ts`) shows it and throws a `WebgpuBootFailure` when the
active renderer's `create()` doesn't come back GPU-ready; `index.ts` catches
that, logs `window.webgpuProbe`, and returns without constructing the game.

## Guarding the cpp renderer the same way

`CppRendererLoader.init()` (`src/viewCpp/CppRendererLoader.ts`) applies the
identical guard:

- No `GPUDevice` from `requestGpuAdapterAndDevice()` → refuse before even
  instantiating the Emscripten module (no Canvas2D placeholder as a stand-in
  for "the WebGPU renderer").
- Module instantiated but its own backend query
  (`get_renderer_backend`) comes back anything other than `WEBGPU` (its
  internal Canvas2D fallback, or none) → also refused.

Either way, the device it *did* acquire (if any) is handed back via
`releaseGpuDevice()` before returning failure — the cpp path never hands off
to the TS WebGPU renderer as a rescue, so a session never runs two live
devices at once (`src/webgpu/gpuChores/deviceRegistry.ts`).

## CI

Headless CI runners without a GPU should **skip** WebGPU-dependent tests
(`navigator.gpu` absent → `requestGpuAdapterAndDevice()` returns `null`,
`getLastGpuAcquireDiagnostics().reason === 'navigator.gpu-unavailable'`), not
grow a GL code path to keep them green.
