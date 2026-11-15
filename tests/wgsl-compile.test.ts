/**
 * Layer 1: every WGSL module the game ships must compile.
 *
 * Runs Tint (via Dawn's Node bindings, on a software Vulkan driver) over each module in
 * `shaderCatalog.ts`: all TS template-string shaders, the `.wgsl` block stages as
 * `createBlockShaders()` composes them, and the C++ renderer's generated
 * `shader_sources.h` composed the way `compose_authored_block_wgsl()` does.
 *
 * Without an adapter the suite is *skipped with a printed reason*; with
 * `TETRIS_REQUIRE_GPU=1` (CI) it fails instead. A broken shader fails with `file:line`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { acquireDawn, gpuRequired, skipMessage } from './helpers/dawn.js';
import { run as compileAll } from './helpers/jobs/wgslCompile.js';
import {
  buildShaderCatalog,
  CPP_BLOCK_COMPOSE_ORDER,
  listWgslFiles,
  loadCppGenerated,
  REPO_ROOT,
  scrapeTemplateConst,
} from './helpers/shaderCatalog.js';
import { classify, KNOWN_WGSL_FAILURES } from './helpers/wgslBaseline.js';
import { declaredEntryPoints, formatDiagnostic, type Diagnostic } from './helpers/wgslValidate.js';

const catalog = buildShaderCatalog();
const dawn = await acquireDawn();
const required = gpuRequired();
const available = dawn.ok;
const results: Map<string, Diagnostic[]> = dawn.ok ? await compileAll(dawn.gpu.device) : new Map();

if (!dawn.ok && !required) console.warn(skipMessage('wgsl-compile', dawn.reason));
if (dawn.ok) console.info(`[wgsl-compile] ${catalog.length} modules on ${dawn.gpu.description}`);

describe('WGSL catalog (no GPU needed)', () => {
  it('covers both renderers and every shader source family', () => {
    const ids = catalog.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const prefix of ['ts/block.', 'ts/grid.', 'ts/particle.', 'ts/postProcess.', 'ts/bloom.', 'ts/compute.', 'ts/chore.', 'cpp/']) {
      expect(ids.some((id) => id.startsWith(prefix)), `no catalog entry for ${prefix}*`).toBe(true);
    }
    expect(catalog.filter((e) => e.renderer === 'cpp-webgpu')).toHaveLength(2);
  });

  it('every .wgsl file under src/webgpu/shaders/wgsl reaches a compiled module', () => {
    const modules = catalog.filter((e) => e.renderer === 'ts-webgpu').map((e) => e.code).join('\n');
    for (const rel of listWgslFiles('src/webgpu/shaders/wgsl')) {
      const text = readFileSync(join(REPO_ROOT, rel), 'utf8').trim();
      if (!text) continue; // wgsl/postprocess/common.wgsl is an empty placeholder
      expect(modules.includes(text), `${rel} is not part of any compiled module`).toBe(true);
    }
  });

  it('scraped blit shaders still parse out of their source files', () => {
    expect(scrapeTemplateConst('src/webgpu/backdropCapture.ts', 'BLIT_WGSL')).toContain('fn fragmentMain');
    expect(scrapeTemplateConst('src/webgpu/viewTextures.ts', 'blitShader')).toContain('fn fragmentMain');
  });

  it('entry-point detection sees stage attributes on the preceding line', () => {
    const src = '@vertex\nfn a() {}\n@fragment fn b() {}\n// @compute fn nope() {}\n@compute @workgroup_size(1)\nfn c() {}';
    expect(declaredEntryPoints(src, 'vertex')).toEqual(['a']);
    expect(declaredEntryPoints(src, 'fragment')).toEqual(['b']);
    expect(declaredEntryPoints(src, 'compute')).toEqual(['c']);
  });
});

describe('C++ renderer shaders are the TS shaders (checked, not promised)', () => {
  const { literals, sharedSources } = loadCppGenerated();

  it.each([...sharedSources])('%s in shader_sources.h is byte-identical to %s', (identifier, file) => {
    const onDisk = readFileSync(join(REPO_ROOT, file), 'utf8');
    expect(literals.get(identifier)).toBe(onDisk);
  });

  it('TS fragment shader embeds the same shared modules the C++ renderer does', () => {
    const tsFragment = catalog.find((e) => e.id === 'ts/block.fragment')!.code;
    for (const identifier of ['kSharedAuthoredMaterialWgsl', 'kSharedAuthoredGlassWgsl']) {
      expect(tsFragment, `${identifier} missing from the TS block fragment`).toContain(literals.get(identifier)!.trim());
    }
    // pbrCore reaches TS through pbrFunctions.wgsl.ts; compare on a function body, not whole-file.
    const core = literals.get('kSharedPbrCoreWgsl')!.trim();
    expect(tsFragment).toContain(core);
  });

  it('compose order in gpu_renderer.cpp matches the order the catalog compiles', () => {
    const cpp = readFileSync(join(REPO_ROOT, 'cpp/src/gpu_renderer.cpp'), 'utf8');
    const fn = cpp.slice(cpp.indexOf('compose_authored_block_wgsl()'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    const found = [...body.matchAll(/\b(k\w+Wgsl)\b/g)].map((m) => m[1]);
    expect(found).toEqual([...CPP_BLOCK_COMPOSE_ORDER]);
  });
});

describe.skipIf(!available && !required)('WGSL modules compile (Tint)', () => {
  it('has a software WebGPU adapter', () => {
    if (!dawn.ok) throw new Error(`TETRIS_REQUIRE_GPU=1 but no adapter: ${dawn.reason}`);
    expect(results.size).toBe(catalog.length);
  });

  it.skipIf(!available).each(catalog.map((e) => [e.id] as const))('%s', (id) => {
    const { unexpected, stale } = classify(id, results.get(id) ?? []);
    expect(unexpected.map(formatDiagnostic).join('\n'), 'WGSL errors').toBe('');
    expect(
      stale.map((k) => `${k.id}: "${k.message}" no longer occurs — delete it from tests/helpers/wgslBaseline.ts`).join('\n'),
      'stale baseline',
    ).toBe('');
  });

  it('every baseline entry names a real catalog module', () => {
    const ids = new Set(catalog.map((e) => e.id));
    for (const k of KNOWN_WGSL_FAILURES) expect(ids.has(k.id), `${k.id} is not in the catalog`).toBe(true);
  });
});
