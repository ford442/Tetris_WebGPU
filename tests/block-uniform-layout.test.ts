import { describe, expect, it } from 'vitest';
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
    expect(parsed._structPad).toBe(204);
    expect(BLOCK_FRAGMENT_UNIFORM_SIZE).toBeGreaterThanOrEqual(parsed._structPad + 4);
    expect(BLOCK_FRAGMENT_UNIFORM_SIZE % 16).toBe(0);
  });
});

/** Minimal size table — only the WGSL scalar/vector types actually used in cpp/src/shaders/block/block.wgsl. */
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
  const fieldLine = /float\s+\w+\[(\d+)\];/g;
  let m: RegExpExecArray | null;
  while ((m = fieldLine.exec(bodyMatch[1])) !== null) {
    bytes += Number(m[1]) * 4;
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

describe('C++ block-shader uniform layout (UniformData struct vs Uniforms WGSL struct)', () => {
  const cppSource = readFileSync(join(ROOT, 'cpp/src/gpu_renderer.cpp'), 'utf8');
  const wgslSource = readFileSync(join(ROOT, 'cpp/src/shaders/block/block.wgsl'), 'utf8');

  it('UniformData (C++) and Uniforms (WGSL) describe the same byte size', () => {
    const cppBytes = parseCStructByteSize(cppSource, 'UniformData');
    const wgslBytes = parseWgslStructByteSize(wgslSource, 'Uniforms');
    expect(cppBytes).toBe(wgslBytes);
    expect(cppBytes).toBe(128);
  });
});
