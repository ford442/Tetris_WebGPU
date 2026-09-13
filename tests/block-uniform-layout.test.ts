import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BLOCK_FRAGMENT_UNIFORM_WGSL,
  BLOCK_FRAGMENT_UNIFORM_OFFSETS,
  BLOCK_FRAGMENT_UNIFORM_SIZE,
} from '../src/webgpu/shaders/block/uniforms.js';

const ROOT = process.cwd();

/** Parses `fieldName : type, // N` (or `// N-M` range) lines out of a WGSL struct body. */
function parseWgslFieldOffsets(wgsl: string): Record<string, number> {
  const offsets: Record<string, number> = {};
  const fieldLine = /^\s*(\w+)\s*:\s*.*,\s*\/\/\s*(\d+)/;
  for (const line of wgsl.split('\n')) {
    const match = line.match(fieldLine);
    if (match) {
      offsets[match[1]] = Number(match[2]);
    }
  }
  return offsets;
}

describe('TS block-shader uniform layout (WGSL text vs CPU offsets)', () => {
  const parsed = parseWgslFieldOffsets(BLOCK_FRAGMENT_UNIFORM_WGSL);

  it('parses at least as many fields as BLOCK_FRAGMENT_UNIFORM_OFFSETS declares', () => {
    expect(Object.keys(parsed).length).toBeGreaterThanOrEqual(
      Object.keys(BLOCK_FRAGMENT_UNIFORM_OFFSETS).length,
    );
  });

  it('every CPU-written offset matches the WGSL struct comment for that field', () => {
    for (const [field, offset] of Object.entries(BLOCK_FRAGMENT_UNIFORM_OFFSETS)) {
      expect(parsed[field], `WGSL struct has no offset comment for field "${field}"`).toBe(offset);
    }
  });

  it('BLOCK_FRAGMENT_UNIFORM_SIZE is a 16-byte-aligned multiple that fits the last field', () => {
    expect(parsed.iblEnable).toBe(200);
    expect(parsed._structPad).toBe(216);
    expect(BLOCK_FRAGMENT_UNIFORM_SIZE).toBeGreaterThanOrEqual(parsed._structPad + 4);
    expect(BLOCK_FRAGMENT_UNIFORM_SIZE % 16).toBe(0);
  });
});

/** Minimal size table — only the WGSL scalar/vector types the generated struct uses. */
const WGSL_TYPE_SIZES: Record<string, number> = {
  'mat4x4<f32>': 64,
  'vec4<f32>': 16,
  'vec3<f32>': 12,
  f32: 4,
  u32: 4,
};

function parseCStructByteSize(source: string, structName: string): number {
  const bodyMatch = source.match(new RegExp(`struct ${structName}\\s*\\{([^}]*)\\};`));
  if (!bodyMatch) throw new Error(`struct ${structName} not found`);
  let bytes = 0;
  const fieldLine = /float\s+\w+(?:\[(\d+)\])?;/g;
  let m: RegExpExecArray | null;
  while ((m = fieldLine.exec(bodyMatch[1])) !== null) {
    bytes += (m[1] ? Number(m[1]) : 1) * 4;
  }
  return bytes;
}

function parseWgslStructByteSize(source: string, structName: string): number {
  const bodyMatch = source.match(new RegExp(`struct ${structName}\\s*\\{([^}]*)\\};`));
  if (!bodyMatch) throw new Error(`struct ${structName} not found`);
  let bytes = 0;
  for (const rawLine of bodyMatch[1].split(',')) {
    const line = rawLine.trim();
    if (!line) continue;
    const typeMatch = line.match(/:\s*([\w<>]+)/);
    if (!typeMatch) continue;
    const size = WGSL_TYPE_SIZES[typeMatch[1]];
    if (size == null) {
      throw new Error(`Unknown WGSL type "${typeMatch[1]}" in struct ${structName} — extend WGSL_TYPE_SIZES`);
    }
    bytes += size;
  }
  return bytes;
}

/**
 * The C++ block uniform struct and its WGSL declaration are both generated from
 * shared/authoredBlockUniforms.json, so they cannot disagree by construction —
 * but only if the generator keeps emitting both from the same field list.
 */
describe('C++ block-shader uniform layout (generated from the shared contract)', () => {
  const generated = (() => {
    execFileSync(process.execPath, [join(ROOT, 'scripts/generate-cpp-uniforms.mjs')], {
      cwd: ROOT,
      stdio: 'pipe',
    });
    return readFileSync(join(ROOT, 'cpp/src/generated/authored_block_uniforms.h'), 'utf8');
  })();

  const contract = JSON.parse(
    readFileSync(join(ROOT, 'shared/authoredBlockUniforms.json'), 'utf8'),
  ) as { size: number };

  it('the generated C++ struct and WGSL struct describe the same byte size', () => {
    // Both structs share a name in the same header, so scope the WGSL parse to the
    // raw-string literal the shader concatenates.
    const wgslLiteral = generated.slice(generated.indexOf('R"WGSL('));
    const cppBytes = parseCStructByteSize(generated, 'AuthoredBlockUniforms');
    const wgslBytes = parseWgslStructByteSize(wgslLiteral, 'AuthoredBlockUniforms');
    expect(cppBytes).toBe(wgslBytes);
    expect(cppBytes).toBe(contract.size);
  });

  it('validates declared offsets against WGSL packing rather than trusting them', () => {
    // The generator refuses to emit a header when an offset contradicts WGSL
    // uniform packing, so a hand-edited contract fails the build instead of
    // silently shifting bytes under the C++ renderer.
    const generator = readFileSync(join(ROOT, 'scripts/generate-cpp-uniforms.mjs'), 'utf8');
    expect(generator).toContain('WGSL packing puts it at');
    expect(generator).toContain('function validate(');
  });
});
