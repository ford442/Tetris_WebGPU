import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CppRendererLoader, PLAYFIELD_BYTES, WASM_CANDIDATES, JS_CANDIDATES } from '../src/viewCpp/CppRendererLoader.js';

describe('CppRendererLoader paths', () => {
  it('probes relative and root artifact paths like WasmCore', () => {
    expect(JS_CANDIDATES).toContain('./cpp/tetris_renderer.js');
    expect(JS_CANDIDATES).toContain('/cpp/tetris_renderer.js');
    expect(WASM_CANDIDATES).toContain('./cpp/tetris_renderer.wasm');
    expect(WASM_CANDIDATES).toContain('/cpp/tetris_renderer.wasm');
  });

  it('playfield buffer is 200 bytes (10×20)', () => {
    expect(PLAYFIELD_BYTES).toBe(200);
  });

  it('exports GPU status helpers', () => {
    const src = readFileSync(join(process.cwd(), 'src/viewCpp/CppRendererLoader.ts'), 'utf8');
    expect(src).toContain('getRendererBackend');
    expect(src).toContain('RendererBackend');
    expect(src).toContain('get_renderer_backend');
    expect(src).toContain('preinitializedWebGPUDevice');
  });

  it('uses shared gpuContext device policy (no ad-hoc requestAdapter)', () => {
    const src = readFileSync(join(process.cwd(), 'src/viewCpp/CppRendererLoader.ts'), 'utf8');
    expect(src).toContain("from '../webgpu/gpuContext.js'");
    expect(src).toContain('requestGpuAdapterAndDevice');
    expect(src).toContain('attachDeviceLifecycleHandlers');
    expect(src).not.toMatch(/navigator\.gpu\.requestAdapter\s*\(/);
  });

  it('uploads block.png via set_block_texture_rgba', () => {
    const src = readFileSync(join(process.cwd(), 'src/viewCpp/CppRendererLoader.ts'), 'utf8');
    expect(src).toContain('set_block_texture_rgba');
    expect(src).toContain('uploadBlockTexture');
    expect(src).toContain('resolveBlockTextureUrl');
    expect(src).toContain('hasBlockTexture');
  });

  it('exposes no live-device state until init() runs', () => {
    expect(CppRendererLoader.isLoaded()).toBe(false);
    expect(CppRendererLoader.getLastFailureReason()).toBeNull();
  });

  it('hard-fails instead of accepting a non-WebGPU backend or a deviceless module (#485)', () => {
    const src = readFileSync(join(process.cwd(), 'src/viewCpp/CppRendererLoader.ts'), 'utf8');
    // No device acquired -> refuse before even instantiating the wasm module.
    expect(src).toMatch(/if \(!webgpuDevice\)/);
    // A cpp module that fell back to its own Canvas2D (or no) backend is a
    // hard failure too, never accepted as "the WebGPU renderer".
    expect(src).toMatch(/this\.backend !== RendererBackend\.WEBGPU/);
    expect(src).toContain('getLastFailureReason');
  });

  it('committed tetris_renderer.{js,wasm} provide every function CppRendererLoader cwraps', async () => {
    // Behavioural, not a binary-layout check: a release build minifies the wasm's own
    // export names (`WebAssembly.Module.exports()` would say `M,N,O,…`); the emitted JS
    // glue maps them back. So load the module the way the loader does — glue + wasm,
    // real instantiation — and ask it for each cwrap'd symbol.
    const loaderSrc = readFileSync(join(process.cwd(), 'src/viewCpp/CppRendererLoader.ts'), 'utf8');
    const cwrapped = [...loaderSrc.matchAll(/\.cwrap\(\s*'([^']+)'/g)].map((m) => m[1]);
    // Guard the extraction itself: a refactor that changes how the loader calls cwrap
    // must not turn this into a vacuous pass.
    expect(cwrapped.length).toBeGreaterThanOrEqual(10);
    expect(cwrapped).toContain('init_renderer');
    expect(cwrapped).toContain('render_dual_frame');

    const mod = await loadCommittedCppModule();
    const missing = cwrapped.filter((fn) => typeof mod[`_${fn}`] !== 'function');
    expect(missing, `committed public/cpp artifact lacks: ${missing.join(', ')} — rebuild with \`npm run cpp:release\` and commit it`).toEqual([]);

    // cwrap itself must resolve each one (this is the call the loader makes).
    for (const fn of cwrapped) {
      expect(typeof (mod as unknown as CppModule).cwrap(fn, null, [])).toBe('function');
    }
  });
});

type CppModule = {
  cwrap(name: string, ret: string | null, args: string[]): unknown;
  [key: string]: unknown;
};

/**
 * Instantiate public/cpp/tetris_renderer.js + .wasm in Node with inert stand-ins for the
 * browser. Nothing is initialised (no init_renderer call, no GPU) — we only need the
 * module to come up far enough to expose its exports.
 *
 * - The glue is an ES module (-sEXPORT_ES6=1: `export default <factory>`, wasm located
 *   via `import.meta.url`) — exactly what the browser `import()`s. Node cannot import it
 *   from a string with web stubs, so the two ES-only constructs are rewritten and the body
 *   evaluated with `document`/`window` stubs because its top level reads them
 *   (ENVIRONMENT=web).
 * - Wasm imports (emdawnwebgpu's JS library, compiled to the minified module `a`) are
 *   wrapped so a call into a missing browser API returns 0 instead of throwing.
 */
async function loadCommittedCppModule(): Promise<CppModule> {
  const dir = join(process.cwd(), 'public/cpp');
  const source = readFileSync(join(dir, 'tetris_renderer.js'), 'utf8');
  expect(source, 'glue must be an ES module (-sEXPORT_ES6=1) so the loader can import() it').toMatch(
    /export default createTetrisRendererModule;\s*$/,
  );
  const glue = source
    .replace(/export default (createTetrisRendererModule);\s*$/, 'module.exports = $1;')
    .replaceAll('import.meta.url', '"file:///cpp/tetris_renderer.js"');
  const wasmModule = await WebAssembly.compile(readFileSync(join(dir, 'tetris_renderer.wasm')));
  const wasmImports = WebAssembly.Module.imports(wasmModule);

  const holder: { exports: unknown } = { exports: {} };
  new Function('module', 'exports', 'document', 'window', glue)(holder, holder.exports, {}, {});
  const create = holder.exports as (arg: object) => Promise<CppModule>;
  expect(typeof create).toBe('function');

  // emscripten's instantiateWasm hook has no error channel; surface a failed
  // instantiate as a rejection instead of a create() that never settles.
  let failInstantiate: (err: unknown) => void = () => {};
  const instantiateFailed = new Promise<never>((_, reject) => { failInstantiate = reject; });

  const ready = create({
    print: () => {},
    printErr: () => {},
    instantiateWasm(
      info: Record<string, Record<string, unknown>>,
      receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
    ) {
      const imports: WebAssembly.Imports = {};
      for (const imp of wasmImports) {
        const real = info[imp.module]?.[imp.name];
        const ns = (imports[imp.module] ??= {}) as Record<string, unknown>;
        ns[imp.name] = typeof real === 'function'
          ? (...args: unknown[]) => {
              try { return (real as (...a: unknown[]) => unknown)(...args); } catch { return 0; }
            }
          : real ?? (() => 0);
      }
      WebAssembly.instantiate(wasmModule, imports)
        .then((instance) => receive(instance, wasmModule))
        .catch(failInstantiate);
      return {};
    },
  });
  return Promise.race([ready, instantiateFailed]);
}
