/**
 * Parity guards between the TS WebGPU renderer and the Emscripten C++ renderer.
 *
 * These are the three places the two paths can silently diverge into different
 * materials: the shared WGSL, the bind-group numbering, and the uniform offsets.
 */
import { describe, expect, it } from 'vitest';
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
    const shared = read('src/webgpu/shaders/wgsl/block/authoredGlass.wgsl');
    const tsFragment = read('src/webgpu/shaders/wgsl/block/fragmentMain.wgsl');
    const cppFragment = read('cpp/src/shaders/block/authoredBlock.wgsl');

    for (const fn of ['gradeGoldMetalAlbedo', 'authoredBaseColor', 'authoredGlassOpacity']) {
      expect(shared).toContain(`fn ${fn}(`);
      expect(tsFragment).toContain(`${fn}(`);
      expect(cppFragment).toContain(`${fn}(`);
    }
    // The old C++ fork sampled a 4x3 atlas; the extracted tile makes that wrong.
    expect(cppFragment).not.toContain('ATLAS_COLUMNS');
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
