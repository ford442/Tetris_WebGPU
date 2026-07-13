# Native Renderer Research — emdawnwebgpu vs wgpu-native vs Current Stack

**Status:** Research spike (July 2026)  
**Scope:** Inform Phase 2–5 of the C++ renderer roadmap (`cpp/README.md`). **No production code changes** required to close this issue.

---

## Executive summary

| Question | Answer |
|----------|--------|
| Should we keep **C++ + Emscripten + emdawnwebgpu** for the browser showcase? | **Yes** — best fit for “high-performance web graphics” *in the browser* today. |
| Is **wgpu-native** a browser competitor to emdawnwebgpu? | **No** — upstream explicitly declined Emscripten support; browser targets should use emdawnwebgpu (or `wgpu` Rust → `web_sys` WebGPU). |
| Is a **Rust `wgpu` + wasm-bindgen** path viable? | **Yes for greenfield / Rust teams**, but wasm binaries are **~40–50× larger** than emdawnwebgpu for equivalent GPU init work, with a heavier debug story. |
| Desktop shell recommendation? | **Tauri or Electron loading the same web assets** for fastest path; **native `wgpu` window** only when bypassing the webview is worth the dual-runtime cost. |

**Recommendation:** Continue the cpp roadmap on **emdawnwebgpu**. Treat **Rust `wgpu`** as a parallel research track for a future *native-first* renderer (desktop / Steam / tooling), not as a replacement for the Emscripten browser module. Do **not** invest in wgpu-native-for-wasm.

---

## 1. Context — what Tetris WebGPU ships today

| Layer | Technology | Notes |
|-------|------------|-------|
| Default browser renderer | TypeScript WebGPU (`src/viewWebGPU.ts`) | Zero wasm for rendering; full PBR, particles, post-process |
| Opt-in C++ renderer | Emscripten → `public/cpp/tetris_renderer.wasm` | `?renderer=webgpu-cpp`; `IView` adapter in TS |
| WebGPU C++ binding | **`--use-port=emdawnwebgpu`** (Dawn-maintained `webgpu.h`) | Pinned emsdk in `.emsdk-version`; legacy `-sUSE_WEBGPU=1` deprecated |
| Collision | AssemblyScript wasm | Independent of renderer |
| Game logic | TypeScript | Stays in TS for all renderer prefs |

The C++ path already uses the **`preinitializedWebGPUDevice`** pattern: TypeScript calls `requestAdapter` / `requestDevice`, then passes the device into the Emscripten module. This avoids ASYNCIFY/JSPI and matches Dawn’s recommended browser init flow (`cpp/README.md`).

---

## 2. Spike methodology

Research combined **literature review**, **upstream issue/PR history**, and **local triangle spikes** (throwaway `/tmp` builds — not committed).

### 2.1 emdawnwebgpu triangle (C + emcc)

- **Toolchain:** emsdk 5.0.7, `--use-port=emdawnwebgpu`, `-O3 -flto`
- **Pattern:** `WGPUEmscriptenSurfaceSourceCanvasHTMLSelector`, `WGPUShaderSourceWGSL`, `preinitializedWebGPUDevice` (same API surface as `cpp/src/gpu_renderer.cpp`)
- **Artifact sizes:**

| Artifact | Size |
|----------|------|
| `triangle.wasm` | **18 KB** |
| `triangle.js` (MODULARIZE glue) | **42 KB** |

### 2.2 This repo’s C++ renderer (release)

Built with `TETRIS_CPP_WEBGPU=emdawn npm run cpp:release`:

| Artifact | Debug (prior build) | **Release** |
|----------|---------------------|-------------|
| `tetris_renderer.wasm` | ~2.0 MB (`-O0 -g -sASSERTIONS=2 -sSAFE_HEAP=1`) | **28 KB** |
| `tetris_renderer.js` | ~2.8 MB | **50 KB** |

**Lesson:** wasm size comparisons must use **release** flags. Debug + assertions inflate cpp wasm by **~70×** and are misleading for roadmap decisions.

### 2.3 Rust `wgpu` triangle (wasm32-unknown-unknown)

- **Crate:** minimal `wgpu = "24"`, `pollster`, `RUSTFLAGS='--cfg=web_sys_unstable_apis'`
- **Code path:** `Instance` → `request_adapter` → `request_device` → WGSL shader module → render pipeline (no surface/swapchain loop)

| Build | `spike-triangle.wasm` |
|-------|------------------------|
| Empty `main()` | 22 KB |
| Full device + pipeline init | **1.2 MB** |

`libwgpu-*.rlib` alone is **~11 MB** (compile artifact); the linked wasm retains a large fraction of **Naga** (WGSL front-end + validation) and **wgpu-core** even when targeting the browser WebGPU backend.

### 2.4 wgpu-native triangle (native desktop)

- **Upstream example:** `gfx-rs/wgpu-native/examples/triangle` — GLFW + native surface (Metal/Vulkan/DX12)
- **Emscripten:** [PR #171 closed](https://github.com/gfx-rs/wgpu-native/pull/171) — maintainers: *on web/wasm, use Emscripten’s `webgpu.h` (emdawnwebgpu); wgpu-native is for native platforms.*
- **Native binary size (literature):** “Hello triangle” with Dawn statically linked ≈ **4–5 MB** executable (sokol-gfx comparison, [HN discussion](https://news.ycombinator.com/item?id=23079200)); validation/translation dominates. wgpu-native is in the same class.

---

## 3. Technology comparison

### 3.1 emdawnwebgpu (Emscripten port)

**What it is:** Dawn-maintained implementation of **`webgpu.h`** that forwards to the **browser’s WebGPU JavaScript API**. Not a second GPU implementation in wasm.

**Pros**

- **Smallest wasm footprint** for C/C++ WebGPU in our spikes (18 KB triangle; 28 KB Tetris renderer module).
- **Same WGSL/shaders** as native Dawn mental model; `webgpu.h` tracks the standard.
- **Official Emscripten direction** — `-sUSE_WEBGPU=1` deprecated in favor of `--use-port=emdawnwebgpu` ([emscripten#24220](https://github.com/emscripten-core/emscripten/pull/24220), removal [emscripten#25398](https://github.com/emscripten-core/emscripten/issues/24265)).
- **Already integrated** in this repo: build matrix, CI, `gpu_renderer.cpp`, TS loader, fallback chain.
- **Init latency:** GPU work delegates to the browser; wasm only loads thin bindings. Device creation stays in TS (one async hop before `init_renderer`).

**Cons**

- **C ABI churn:** `webgpu.h` moved to `WGPUStringView`, `WGPUShaderSourceWGSL`, `WGPUEmscriptenSurfaceSourceCanvasHTMLSelector` — spikes fail if copied from old tutorials.
- **Async device** must be handled in JS (or ASYNCIFY) — we already solved this with `preinitializedWebGPUDevice`.
- **Debugging:** C++ in wasm + browser GPU capture (Chrome WebGPU inspector); no native RenderDoc on the C++ path in browser.
- **emsdk pin drift:** active emcc 5.0.7 vs pinned `.emsdk-version` 4.0.10 — CI/local should align pins.

### 3.2 wgpu-native (C API → native GPU)

**What it is:** C bindings to the Rust **wgpu** stack for **desktop** (Metal/Vulkan/DX12/OpenGL).

**Pros**

- Single **native** renderer for Windows/macOS/Linux.
- Rich **logging/report** APIs (`wgpuGenerateReport`) for adapter/device diagnostics.
- Same **WGSL** ecosystem as Rust wgpu.

**Cons for *this* project**

- **Not a browser path** — no Emscripten support by design.
- **Large native binaries** when statically linked (validation/Naga-class code).
- **Second renderer codebase** if we also keep emdawnwebgpu for web — unless we abandon wasm cpp entirely on web.

**Verdict:** Useful for a **desktop-only native shell**, not as emdawnwebgpu’s web competitor.

### 3.3 Rust `wgpu` + wasm-bindgen (browser)

**What it is:** `wgpu`’s **web** backend — calls browser WebGPU via `web-sys` (same underlying API as emdawnwebgpu).

**Pros**

- **Memory-safe** renderer code; strong ecosystem (examples, `trunk`, wgpu.rs).
- **One language** for web wasm *and* native desktop (`cfg(target_arch = "wasm32")`).
- Active **cross-platform** story (see community templates: wgpu-triangle, wgpu-example).

**Cons**

- **~1.2 MB wasm** for modest init in our spike vs **~18 KB** emdawnwebgpu triangle — dominated by Naga + wgpu-core ([gfx-rs/wgpu#2278](https://github.com/gfx-rs/wgpu/discussions/2278)).
- **Toolchain:** `wasm-bindgen`, `web_sys_unstable_apis`, separate web build pipeline vs existing Vite + emcc.
- **Duplication:** TS renderer is already ~3k lines of WGSL/TS; a Rust port is a **rewrite**, not a port of cpp stubs.
- **Debug:** `wasm-bindgen` stack traces + browser GPU tools; Rust debug wasm is large/slow.

**Verdict:** Strong **alternative greenfield** stack; poor **incremental** fit for Tetris WebGPU’s current architecture.

### 3.4 TypeScript WebGPU (status quo)

| Metric | TS WebGPU | emdawnwebgpu cpp | wgpu wasm |
|--------|-----------|------------------|-----------|
| Rendering wasm | **0** | **28 KB** (release) | **~1.2 MB+** |
| Feature completeness | **Full** | Bootstrap blocks | N/A (spike only) |
| Iteration speed | **HMR (Vite)** | Rebuild emcc | `cargo` + wasm-bindgen |
| Debug | Chrome DevTools + TS source maps | C++ source maps + wasm; GPU inspector | Rust wasm maps; heavier |

For the **public demo**, TS WebGPU remains the quality bar. C++ is opt-in **showcase / research**, not the default.

---

## 4. Binary size summary

| Spike / artifact | wasm | JS glue | Notes |
|------------------|------|---------|-------|
| emdawnwebgpu triangle | 18 KB | 42 KB | `-O3 -flto`, full draw loop |
| **Tetris cpp renderer (release)** | **28 KB** | **50 KB** | Instanced blocks + stubs |
| Tetris cpp renderer (debug) | 2.0 MB | 2.8 MB | **Do not use for planning** |
| wgpu-rs empty main | 22 KB | — | Dead-code eliminated |
| wgpu-rs device + pipeline | **1.2 MB** | + wasm-bindgen if shipped | No surface/present |
| wgpu-native (native, literature) | N/A | N/A | ~4–5 MB exe (Dawn-class) |

**Takeaway:** For browser wasm, emdawnwebgpu is the only path that keeps the renderer module **on par with collision wasm** (~1 KB release). Rust wgpu wasm is appropriate when the **entire app** is Rust and size is acceptable (games, tools).

---

## 5. Init latency (qualitative)

| Path | Cold path | Notes |
|------|-----------|-------|
| TS WebGPU | `requestAdapter` → `requestDevice` → pipeline creation in JS | Already optimized in `gpuContext.ts`; device-loss recovery built-in |
| emdawnwebgpu cpp | **Same** device preinit in TS → `init_renderer()` sync in wasm → surface configure | No extra GPU implementation load; wasm parse **<30 KB** |
| wgpu wasm | Parse **~1.2 MB** wasm → instantiate → Rust runtime → then same browser WebGPU calls | Strictly heavier before first frame |
| wgpu-native desktop | Native instance/adapter/device/surface | Fast after OS loader; no wasm parse |

No formal millisecond benchmarks were run in this spike (research-only scope). Relative ordering above is sufficient for roadmap prioritization.

---

## 6. Debug story

| Tooling | emdawnwebgpu + Emscripten | wgpu wasm | wgpu-native desktop |
|---------|---------------------------|-----------|---------------------|
| CPU debugger | Chrome DWARF wasm debugging (`-g`) | Same + rust demangling | lldb / Visual Studio |
| GPU capture | Chrome **WebGPU** panel / RenderDoc (browser limits) | Same (browser backend) | RenderDoc, vendor tools |
| Shader errors | Browser validation messages + `wgpuDeviceCreateShaderModule` fail | Naga diagnostics in console | Naga + native validation |
| CI headless | Puppeteer + `?renderer=webgpu-cpp` | wasm + headless Chrome | OS GPU required |
| Sanitizers | `TETRIS_CPP_SANITIZE=1` (experimental) | Limited wasm ASan support | ASan/UBSan on native |

**Practical note:** Most Tetris rendering bugs today are **WGSL/uniform layout** issues — TS renderer is easier to iterate. C++ debug pays off when porting **hot draw paths**, not for UI/game logic.

---

## 7. Desktop shell options (exploratory vision)

### 7.1 Browser (current)

- **Ship:** Vite build + wasm artifacts (`npm run build:all`).
- **Renderer:** TS WebGPU default; cpp opt-in.

### 7.2 Tauri / Electron (same assets)

| Shell | WebGPU source | Pros | Cons |
|-------|---------------|------|------|
| **Electron** | Chromium embedded | Mature WebGPU; same JS/wasm as web | ~100 MB+ runtime |
| **Tauri 2** | OS WebView (WebKit/WebView2) | Small binary; same web bundle | WebGPU maturity varies by OS WebView; may lag Chrome |

**Recommendation:** Lowest friction desktop ship = **package existing `dist/`** in Tauri/Electron. No cpp/wgpu change required.

### 7.3 Pure native wgpu (desktop shell)

- **Pattern A:** Tauri backend + **sidecar** `winit`/`wgpu` window ([common in production apps](https://news.ycombinator.com/item?id=43652476)).
- **Pattern B:** Tauri 2 **raw window + wgpu surface** with transparent webview overlay ([experiments exist](https://github.com/clearlysid/tauri-wgpu-cam); macOS Metal threading constraints).
- **Pattern C:** Full Rust binary (`wgpu` + `winit`) — **no webview**; reuse game logic only if ported to Rust.

Native wgpu does **not** load emdawnwebgpu wasm — it is a **separate binary** with shared WGSL *concepts* but different build/link pipeline.

---

## 8. Implications for cpp roadmap (Phase 2–5)

Phases from `cpp/README.md`:

| Phase | Goal | emdawnwebgpu fit | wgpu-native / Rust fit |
|-------|------|------------------|------------------------|
| **2 — Playfield draw** | Textured/lighted blocks in C++ | ✅ Continue `gpu_renderer.cpp` + emdawnwebgpu | ❌ Browser N/A |
| **3 — WGSL in cpp build** | Own shader pipeline | ✅ Same port; bundle WGSL strings | Parallel native-only if desktop fork |
| **4 — Particles** | GPU compute | ✅ `webgpu.h` compute + TS handoff | Rust wgpu if full rewrite |
| **5 — Post-process + video** | Full frame ownership | ✅ Long-term win for cpp path | Native wgpu for desktop-only SKU |

**Suggested Phase 2–5 adjustments (docs only):**

1. **Keep emdawnwebgpu** as the sole browser WebGPU C API; remove references to legacy `USE_WEBGPU` in new code.
2. **Align emsdk** CI/local to `.emsdk-version` to reduce header/API surprises.
3. **Always cite release wasm sizes** in perf docs (28 KB, not debug 2 MB).
4. **Defer Rust wgpu** until a explicit “native desktop SKU” issue is opened — treat as sibling renderer, not cpp replacement.
5. **Desktop:** open a separate spike for **Tauri + same dist** before investing in native wgpu shell.

---

## 9. Decision matrix

| Criterion (weight for *web showcase*) | TS WebGPU | C++ emdawnwebgpu | Rust wgpu wasm | wgpu-native desktop |
|---------------------------------------|-----------|------------------|----------------|---------------------|
| Browser shipping today | ★★★★★ | ★★★★☆ (WIP) | ★★★☆☆ | — |
| Wasm size | ★★★★★ (0) | ★★★★★ | ★★☆☆☆ | — |
| Incremental adoption | ★★★★★ | ★★★★☆ | ★★☆☆☆ | ★☆☆☆☆ |
| Native desktop perf | ★★☆☆☆ | — | ★★★☆☆ | ★★★★★ |
| Debug / iteration | ★★★★★ | ★★★☆☆ | ★★★☆☆ | ★★★★☆ |
| Single codebase web+desktop | ★★★★★ | ★★★★☆ (C++ wasm web + native cpp later) | ★★★★☆ | ★★☆☆☆ (desktop only) |

---

## 10. Final recommendation

1. **Keep C++ Emscripten + emdawnwebgpu** as the browser-native renderer bet for the cpp roadmap. It is officially endorsed, already wired in this repo, and an order of magnitude smaller than Rust wgpu wasm for equivalent work.

2. **Do not pursue wgpu-native for wasm** — upstream agrees with using emdawnwebgpu in the browser.

3. **Treat Rust `wgpu` as a future native/desktop track**, not a near-term replacement — only reconsider if the team commits to a Rust-first renderer rewrite.

4. **Desktop:** prefer **Tauri/Electron + existing web assets** for Phase 1 desktop; evaluate **native wgpu shell** only when WebView WebGPU or performance ceilings block the product.

5. **TypeScript WebGPU** remains the reference renderer for visuals and effect work; cpp catches up on draw-path ownership per roadmap, not via stack churn.

---

## References

- [Dawn emdawnwebgpu pkg README](https://dawn.googlesource.com/dawn/+/refs/heads/main/src/emdawnwebgpu/pkg/README.md)
- [Emscripten: deprecate USE_WEBGPU](https://github.com/emscripten-core/emscripten/issues/24265)
- [wgpu-native: Emscripten support declined](https://github.com/gfx-rs/wgpu-native/pull/171)
- [wgpu wasm size discussion](https://github.com/gfx-rs/wgpu/discussions/2278)
- [wgpu on the web (wiki)](https://github.com/gfx-rs/wgpu/wiki/Running-on-the-Web-with-WebGPU-and-WebGL)
- Project: `cpp/README.md`, `scripts/build-cpp.mjs`, `.emsdk-version`

---

*Spike artifacts were built locally in `/tmp` (July 2026) and are intentionally not checked into the repository.*
