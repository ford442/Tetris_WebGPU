/**
 * Parity guards between the TS WebGPU renderer and the Emscripten C++ renderer.
 *
 * These are the three places the two paths can silently diverge into different
 * materials: the shared WGSL, the bind-group numbering, and the uniform offsets.
 */
import { describe, expect, it } from 'vitest';
import { createBlockShaders } from '../src/webgpu/shaders/block/blockShader.js';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BLOCK_FRAGMENT_UNIFORM_OFFSETS } from '../src/webgpu/shaders/block/uniforms.js';
import { BLOCK_PIPELINE_BINDING_SPECS } from '../src/webgpu/shaders/block/bindings.wgsl.js';

const ROOT = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const CONTRACT = JSON.parse(read('shared/authoredBlockUniforms.json')) as {
  size: number;
  fields: Array<{ name: string; type: string; offset: number; tsField?: string }>;
};

describe('shared authored-material WGSL', () => {
  const sharedFiles = [
    'src/webgpu/shaders/wgsl/block/authoredGlass.wgsl',
    'src/webgpu/shaders/wgsl/block/pbrCore.wgsl',
  ];

  it.each(sharedFiles)('%s declares no @binding (both renderers embed it)', (file) => {
    expect(read(file)).not.toMatch(/@binding\s*\(/);
  });

  it('is listed in the C++ shader generator', () => {
    const generator = read('scripts/generate-cpp-shaders.mjs');
    for (const file of sharedFiles) {
      expect(generator).toContain(file.split('/').pop());
    }
  });

  it('supplies the look functions both fragment shaders call', () => {
    const glass = read('src/webgpu/shaders/wgsl/block/authoredGlass.wgsl');
    const material = read('src/webgpu/shaders/wgsl/block/authoredMaterial.wgsl');
    // The TS entry point dispatches to split modules, so parity is asserted against
    // the composed fragment the renderer actually compiles, not one source file.
    const tsFragment = createBlockShaders().fragment;
    const cppFragment = read('cpp/src/shaders/block/authoredBlock.wgsl');

    const sharedFns: Array<[string, string]> = [
      ['authoredBaseColor', glass],
      ['authoredGlassOpacity', glass],
      ['authoredDirectLighting', glass],
      ['gradeGoldMetalAlbedoTinted', material],
      ['applyAuthoredNormal', material],
      ['authoredRoughness', material],
      ['decodeAuthoredMaterial', material],
    ];
    for (const [fn, source] of sharedFns) {
      expect(source, `${fn} must be declared in a shared module`).toContain(`fn ${fn}(`);
      expect(tsFragment, `TS fragment must call ${fn}`).toContain(`${fn}(`);
      expect(cppFragment, `C++ fragment must call ${fn}`).toContain(`${fn}(`);
    }
    // authoredGlassAlbedo is reached through authoredBaseColor rather than called
    // directly by both, so assert it is shared and that the TS path still uses it for
    // the ghost piece (which composes the crystal albedo on its own).
    expect(glass).toContain('fn authoredGlassAlbedo(');
    expect(tsFragment).toContain('authoredGlassAlbedo(');

    // The old C++ fork sampled a 4x3 atlas; the extracted tile makes that wrong.
    expect(cppFragment).not.toContain('ATLAS_COLUMNS');
  });

  it('binds the packed material map at the same index in both renderers', () => {
    const cppFragment = read('cpp/src/shaders/block/authoredBlock.wgsl');
    const tsBindings = read('src/webgpu/shaders/block/bindings.wgsl.ts');
    expect(tsBindings).toContain('@binding(13) @group(0) var blockMaterialMap');
    expect(cppFragment).toContain('@binding(13) @group(0) var blockMaterialMap');
    expect(read('cpp/src/block_bindings.h')).toContain('kBlockBindingMaterialMap = 13');
  });

  it('takes the authored gold/glass numbers from block-material.json, not C++ constants', () => {
    const renderer = read('cpp/src/gpu_renderer.cpp');
    // These used to be hardcoded here (0.28f/0.92f) against the TS renderer's values.
    expect(renderer).not.toMatch(/constexpr float kAuthoredGlassMin\s*=/);
    expect(renderer).toContain('fill_authored_material_uniforms(');
    expect(renderer).toContain('generated/authored_block_material.h');
  });
});

describe('C++ block bind-group numbering', () => {
  const cppShader = read('cpp/src/shaders/block/authoredBlock.wgsl');
  const bindingsHeader = read('cpp/src/block_bindings.h');

  /** binding -> TS resource name, e.g. 2 -> 'blockTexture'. */
  const tsNames = new Map(
    BLOCK_PIPELINE_BINDING_SPECS.map((spec) => [
      spec.binding,
      spec.wgsl.split(/\s+/).pop() as string,
    ]),
  );

  const cppBindings = [...cppShader.matchAll(/@binding\((\d+)\)\s+@group\(0\)\s+var(?:<[^>]*>)?\s+(\w+)/g)].map(
    (m) => ({ binding: Number(m[1]), name: m[2] }),
  );

  it('declares exactly the bindings the C++ header documents', () => {
    const declared = [...bindingsHeader.matchAll(/kBlockBinding\w+ = (\d+)/g)].map((m) => Number(m[1]));
    expect(cppBindings.map((b) => b.binding).sort((a, b) => a - b)).toEqual(
      declared.sort((a, b) => a - b),
    );
  });

  it('never renumbers a binding the TS renderer already uses', () => {
    for (const { binding, name } of cppBindings) {
      // Binding 0 is the documented uniform merge: TS splits vertex/fragment
      // uniforms, the single instanced C++ draw does not.
      if (binding === 0) continue;
      expect(tsNames.get(binding), `binding ${binding} is not a TS binding`).toBe(name);
    }
  });
});

describe('authored block uniform contract', () => {
  it('generates a header whose offsets match the contract', () => {
    execFileSync(process.execPath, [join(ROOT, 'scripts/generate-cpp-uniforms.mjs')], {
      cwd: ROOT,
      stdio: 'pipe',
    });
    const header = read('cpp/src/generated/authored_block_uniforms.h');
    expect(header).toContain(`sizeof(AuthoredBlockUniforms) == ${CONTRACT.size}`);
    for (const field of CONTRACT.fields) {
      expect(header).toContain(`offsetof(AuthoredBlockUniforms, ${field.name}) == ${field.offset}`);
    }
  });

  it('declares every field the C++ shader reads', () => {
    const cppShader = read('cpp/src/shaders/block/authoredBlock.wgsl');
    const used = new Set([...cppShader.matchAll(/\bu\.(\w+)/g)].map((m) => m[1]));
    const declared = new Set(CONTRACT.fields.map((f) => f.name));
    for (const name of used) {
      expect(declared, `u.${name} is not in shared/authoredBlockUniforms.json`).toContain(name);
    }
  });

  it('only borrows TS field names that actually exist in FragmentUniforms', () => {
    const tsFields = Object.keys(BLOCK_FRAGMENT_UNIFORM_OFFSETS);
    for (const field of CONTRACT.fields) {
      if (!field.tsField) continue;
      expect(tsFields, `${field.name} claims TS field ${field.tsField}`).toContain(field.tsField);
    }
  });
});
