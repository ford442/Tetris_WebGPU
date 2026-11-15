/**
 * Every WGSL module the game compiles, in the exact form it is handed to
 * `device.createShaderModule` — one entry per module.
 *
 * Sources come from four places and all four are collected here:
 *   - the 12-odd TS template-string modules under `src/webgpu/` (factories + constants),
 *   - the `.wgsl` files under `src/webgpu/shaders/wgsl/` (composed by `createBlockShaders`),
 *   - two private blit shaders scraped from their `const` (no rendering-code change),
 *   - the C++ renderer's shaders, read back from the *generated* `shader_sources.h` and
 *     composed in the order `compose_authored_block_wgsl()` documents.
 *
 * `expectEntries` mirrors the `entryPoint:` each pipeline creation site passes, so a rename in
 * a shader that its pipeline still points at fails here instead of in a browser.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PostProcessShaders } from '../../src/webgpu/shaders/postProcess.js';
import { EnhancedPostProcessShaders } from '../../src/webgpu/shaders/enhancedPostProcess.js';
import { MaterialAwarePostProcessShaders } from '../../src/webgpu/shaders/materialAwarePostProcess.js';
import { createBlockShaders } from '../../src/webgpu/shaders/block/blockShader.js';
import { ParticleShaders } from '../../src/webgpu/shaders/particle.js';
import { GridShader } from '../../src/webgpu/shaders/grid.js';
import { BackgroundShaders } from '../../src/webgpu/shaders/background.js';
import { VideoBackgroundShaders } from '../../src/webgpu/shaders/videoBackground.js';
import { AuroraBackgroundShaders } from '../../src/webgpu/shaders/auroraBackground.js';
import { FrostedGlassShaders } from '../../src/webgpu/shaders/frostedGlass.js';
import { DebugTextureShaders } from '../../src/webgpu/debug_shaders.js';
import {
  ThresholdShader,
  DownsampleShader,
  BlurHorizontalShader,
  BlurVerticalShader,
  UpsampleCombineShader,
  CompositeShader,
} from '../../src/webgpu/bloomShaders.js';
import { LineClearComputeShader, ParticleComputeShader } from '../../src/webgpu/compute.js';
import { CompactIndicesShader, Downsample2dShader, LumaHistogramShader } from '../../src/webgpu/gpuChores/shaders.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, '..', '..');

export type EntryStage = 'vertex' | 'fragment' | 'compute';

export interface ExpectedEntry {
  stage: EntryStage;
  name: string;
}

export interface ShaderEntry {
  /** Stable id, e.g. `ts/grid.vertex` or `cpp/authoredBlock`. */
  id: string;
  /** Repo-relative file the text mainly comes from (for the error message). */
  origin: string;
  /** Other repo-relative files whose text is part of `code`, searched when mapping a line back. */
  parts?: string[];
  /** Which renderer compiles it. */
  renderer: 'ts-webgpu' | 'cpp-webgpu';
  code: string;
  expectEntries: ExpectedEntry[];
}

const v = (name: string): ExpectedEntry => ({ stage: 'vertex', name });
const f = (name: string): ExpectedEntry => ({ stage: 'fragment', name });
const c = (name: string): ExpectedEntry => ({ stage: 'compute', name });

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

/** Every `.wgsl` file under a repo-relative dir, as repo-relative paths. */
export function listWgslFiles(rel: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
      const next = join(dir, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (entry.name.endsWith('.wgsl')) out.push(next);
    }
  };
  walk(rel);
  return out.sort();
}

/**
 * Pull a template-literal `const NAME = \`...\`` out of a source file. Used for the two private
 * blit shaders so the catalog needs no edit to rendering code. Throws if the const moved, or if
 * the literal interpolates (`${}`), because then the text is not what the browser compiles.
 */
export function scrapeTemplateConst(rel: string, name: string): string {
  const src = read(rel);
  const m = new RegExp(`const\\s+${name}\\s*=\\s*\`([\\s\\S]*?)\``).exec(src);
  if (!m) throw new Error(`${rel}: could not find \`const ${name} = \`...\`\` — update tests/helpers/shaderCatalog.ts`);
  if (m[1].includes('${')) throw new Error(`${rel}: ${name} interpolates; scrape it from a built module instead`);
  return m[1];
}

interface Factory {
  /** Id prefix. */
  id: string;
  origin: string;
  build: () => Record<string, string>;
  entries: Record<string, ExpectedEntry[]>;
}

const BLOCK_PARTS = listWgslFiles('src/webgpu/shaders/wgsl');

function tsEntries(): ShaderEntry[] {
  const out: ShaderEntry[] = [];

  const factories: Factory[] = [
    { id: 'block', origin: 'src/webgpu/shaders/block/blockShader.ts', build: () => ({ ...createBlockShaders() }),
      entries: { vertex: [v('main')], fragment: [f('main')] } },
    { id: 'grid', origin: 'src/webgpu/shaders/grid.ts', build: () => ({ ...GridShader() }),
      entries: { vertex: [v('main')], fragment: [f('main')] } },
    { id: 'particle', origin: 'src/webgpu/shaders/particle.ts', build: () => ({ ...ParticleShaders() }),
      entries: { vertex: [v('main')], fragment: [f('main')] } },
    { id: 'postProcess', origin: 'src/webgpu/shaders/postProcess.ts', build: () => ({ ...PostProcessShaders() }),
      entries: { vertex: [v('main')], fragment: [f('main')] } },
    { id: 'materialAwarePostProcess', origin: 'src/webgpu/shaders/materialAwarePostProcess.ts',
      build: () => ({ ...MaterialAwarePostProcessShaders() }),
      entries: { vertex: [v('main')], fragment: [f('main')] } },
    { id: 'background', origin: 'src/webgpu/shaders/background.ts', build: () => ({ ...BackgroundShaders() }),
      entries: { vertex: [v('main')], fragment: [f('main')] } },
    { id: 'videoBackground', origin: 'src/webgpu/shaders/videoBackground.ts', build: () => ({ ...VideoBackgroundShaders() }),
      entries: { vertex: [v('main')], fragment: [f('main')] } },
    { id: 'frostedGlass', origin: 'src/webgpu/shaders/frostedGlass.ts', build: () => ({ ...FrostedGlassShaders() }),
      entries: { vertex: [v('main')], fragment: [f('main')] } },
    // Not wired into a pipeline today, but shipped in the bundle and exported; keep it compiling.
    { id: 'enhancedPostProcess', origin: 'src/webgpu/shaders/enhancedPostProcess.ts',
      build: () => ({ ...EnhancedPostProcessShaders() }), entries: { vertex: [v('main')], fragment: [f('main')] } },
    { id: 'auroraBackground', origin: 'src/webgpu/shaders/auroraBackground.ts',
      build: () => ({ ...AuroraBackgroundShaders() }), entries: { vertex: [v('main')], fragment: [f('main')] } },
  ];

  for (const fac of factories) {
    const built = fac.build();
    for (const [key, code] of Object.entries(built)) {
      if (typeof code !== 'string') continue;
      out.push({
        id: `ts/${fac.id}.${key}`,
        origin: fac.origin,
        parts: fac.id === 'block' ? BLOCK_PARTS : undefined,
        renderer: 'ts-webgpu',
        code,
        expectEntries: fac.entries[key] ?? [],
      });
    }
  }

  // ?debug texture visualisers: one vertex module + six fragment modules, all entry `main`.
  const dbg = DebugTextureShaders() as Record<string, string>;
  for (const [key, code] of Object.entries(dbg)) {
    if (typeof code !== 'string') continue;
    out.push({
      id: `ts/debug.${key}`,
      origin: 'src/webgpu/debug_shaders.ts',
      renderer: 'ts-webgpu',
      code,
      expectEntries: [key === 'vertex' ? v('main') : f('main')],
    });
  }

  const constants: Array<[string, string, string, ExpectedEntry[]]> = [
    ['bloom.threshold', 'src/webgpu/bloomShaders.ts', ThresholdShader, [v('vsMain'), f('fsMain')]],
    ['bloom.downsample', 'src/webgpu/bloomShaders.ts', DownsampleShader, [v('vsMain'), f('fsMain')]],
    ['bloom.blurHorizontal', 'src/webgpu/bloomShaders.ts', BlurHorizontalShader, [v('vsMain'), f('fsMain')]],
    ['bloom.blurVertical', 'src/webgpu/bloomShaders.ts', BlurVerticalShader, [v('vsMain'), f('fsMain')]],
    ['bloom.upsampleCombine', 'src/webgpu/bloomShaders.ts', UpsampleCombineShader, [v('vsMain'), f('fsMain')]],
    ['bloom.composite', 'src/webgpu/bloomShaders.ts', CompositeShader, [v('vsMain'), f('fsMain')]],
    ['compute.particles', 'src/webgpu/compute.ts', ParticleComputeShader, [c('main')]],
    ['compute.lineClear', 'src/webgpu/compute.ts', LineClearComputeShader, [c('detect_lines')]],
    ['chore.luma_histogram', 'src/webgpu/gpuChores/shaders.ts', LumaHistogramShader, [c('luma_histogram')]],
    ['chore.downsample_2d', 'src/webgpu/gpuChores/shaders.ts', Downsample2dShader, [c('downsample_2d')]],
    ['chore.compact_indices', 'src/webgpu/gpuChores/shaders.ts', CompactIndicesShader, [c('compact_indices')]],
  ];
  for (const [id, origin, code, expectEntries] of constants) {
    out.push({ id: `ts/${id}`, origin, renderer: 'ts-webgpu', code, expectEntries });
  }

  out.push({
    id: 'ts/backdropCapture.blit',
    origin: 'src/webgpu/backdropCapture.ts',
    renderer: 'ts-webgpu',
    code: scrapeTemplateConst('src/webgpu/backdropCapture.ts', 'BLIT_WGSL'),
    expectEntries: [v('vertexMain'), f('fragmentMain')],
  });
  out.push({
    id: 'ts/viewTextures.mipBlit',
    origin: 'src/webgpu/viewTextures.ts',
    renderer: 'ts-webgpu',
    code: scrapeTemplateConst('src/webgpu/viewTextures.ts', 'blitShader'),
    expectEntries: [v('vertexMain'), f('fragmentMain')],
  });

  return out;
}

// ---------------------------------------------------------------------------
// C++ renderer
// ---------------------------------------------------------------------------

const GENERATED_DIR = 'cpp/src/generated';

/** `kName` -> raw WGSL text, from a generated header's `R"WGSL(\n...\n)WGSL"` literals. */
export function parseWgslLiterals(header: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /constexpr const char\* (k\w+) = R"WGSL\(\n([\s\S]*?)\n?\)WGSL";/g;
  for (let m = re.exec(header); m; m = re.exec(header)) out.set(m[1], m[2]);
  return out;
}

/**
 * Regenerate (idempotent, gitignored output) and read back what the C++ build embeds.
 * Same generators `cpp:release` and CMake run; no emsdk needed. Memoized.
 */
export function loadCppGenerated(): CppGenerated {
  cppGenerated ??= readCppGenerated();
  return cppGenerated;
}

interface CppGenerated {
  literals: Map<string, string>;
  sharedSources: Map<string, string>;
}
let cppGenerated: CppGenerated | null = null;

function readCppGenerated(): CppGenerated {
  for (const script of ['generate-cpp-shaders.mjs', 'generate-cpp-uniforms.mjs']) {
    execFileSync(process.execPath, [join(REPO_ROOT, 'scripts', script)], { cwd: REPO_ROOT, stdio: 'pipe' });
  }
  const literals = new Map<string, string>();
  for (const file of ['shader_sources.h', 'authored_block_uniforms.h']) {
    for (const [k, val] of parseWgslLiterals(read(join(GENERATED_DIR, file)))) literals.set(k, val);
  }
  const sharedSources = new Map<string, string>([
    ['kSharedPbrCoreWgsl', 'src/webgpu/shaders/wgsl/block/pbrCore.wgsl'],
    ['kSharedAuthoredMaterialWgsl', 'src/webgpu/shaders/wgsl/block/authoredMaterial.wgsl'],
    ['kSharedAuthoredGlassWgsl', 'src/webgpu/shaders/wgsl/block/authoredGlass.wgsl'],
  ]);
  return { literals, sharedSources };
}

/** Order `compose_authored_block_wgsl()` concatenates, joined with "\n". Drift-checked in the test. */
export const CPP_BLOCK_COMPOSE_ORDER = [
  'kAuthoredBlockUniformsWgsl',
  'kSharedPbrCoreWgsl',
  'kSharedAuthoredMaterialWgsl',
  'kSharedAuthoredGlassWgsl',
  'kAuthoredBlockWgsl',
] as const;

function cppEntries(): ShaderEntry[] {
  const { literals } = loadCppGenerated();
  const get = (k: string): string => {
    const text = literals.get(k);
    if (text === undefined) throw new Error(`generated C++ headers have no ${k}`);
    return text;
  };
  return [
    {
      id: 'cpp/authoredBlock',
      origin: 'cpp/src/shaders/block/authoredBlock.wgsl',
      parts: [
        'src/webgpu/shaders/wgsl/block/pbrCore.wgsl',
        'src/webgpu/shaders/wgsl/block/authoredMaterial.wgsl',
        'src/webgpu/shaders/wgsl/block/authoredGlass.wgsl',
        'scripts/generate-cpp-uniforms.mjs',
      ],
      renderer: 'cpp-webgpu',
      code: CPP_BLOCK_COMPOSE_ORDER.map(get).join('\n'),
      expectEntries: [v('vs_main'), f('fs_main')],
    },
    {
      id: 'cpp/postprocess',
      origin: 'cpp/src/shaders/postprocess/postprocess.wgsl',
      renderer: 'cpp-webgpu',
      code: get('kPostprocessWgsl'),
      expectEntries: [v('vs_main'), f('fs_main')],
    },
  ];
}

export function buildShaderCatalog(): ShaderEntry[] {
  return [...tsEntries(), ...cppEntries()];
}

export function repoRelative(abs: string): string {
  return relative(REPO_ROOT, abs);
}
