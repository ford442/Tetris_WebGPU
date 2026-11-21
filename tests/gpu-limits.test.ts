import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DESIRED_OPTIONAL_FEATURES, REQUIRED_GPU_LIMITS, resolveRequiredLimits } from '../src/webgpu/gpuContext.js';
import {
  DEFAULT_MAX_TEXTURE_DIMENSION_2D,
  REPORTED_LIMIT_KEYS,
  buildLimitsReport,
  desiredDisplayLimits,
  readLimits,
} from '../src/webgpu/gpuLimits.js';

const ROOT = join(__dirname, '..');

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'generated') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

describe('requested features are all used', () => {
  const sources = [
    ...walk(join(ROOT, 'src'), ['.ts', '.wgsl']),
    ...walk(join(ROOT, 'cpp', 'src'), ['.cpp', '.h', '.wgsl']),
  ].filter((f) => !f.endsWith('src/webgpu/gpuContext.ts'));

  it.each(DESIRED_OPTIONAL_FEATURES.map((f) => [f]))('%s is read by something outside gpuContext.ts', (feature) => {
    const users = sources.filter((f) => readFileSync(f, 'utf8').includes(feature));
    expect(users, `nothing reads "${feature}" — remove it from DESIRED_OPTIONAL_FEATURES`).not.toEqual([]);
  });

  it('does not request the two features that nothing used', () => {
    expect(DESIRED_OPTIONAL_FEATURES).not.toContain('shader-f16');
    expect(DESIRED_OPTIONAL_FEATURES).not.toContain('float32-filterable');
    // …and indeed no shader enables f16.
    const wgslUsers = sources.filter((f) => /enable\s+f16\s*;/.test(readFileSync(f, 'utf8')));
    expect(wgslUsers).toEqual([]);
  });
});

describe('required limits are derived from what shaders bind', () => {
  it('every shader binds @group(0) only, which is what maxBindGroups: 1 asserts', () => {
    const files = [
      ...walk(join(ROOT, 'src'), ['.ts', '.wgsl']),
      ...walk(join(ROOT, 'cpp', 'src'), ['.cpp', '.h', '.wgsl']),
    ];
    const offenders = files.filter((f) => /@group\(\s*[1-9]/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
    expect(REQUIRED_GPU_LIMITS.maxBindGroups).toBe(1);
  });

  it('keeps the compute floor', () => {
    expect(REQUIRED_GPU_LIMITS).toMatchObject({
      maxStorageBuffersPerShaderStage: 4,
      maxComputeWorkgroupSizeX: 64,
      maxComputeInvocationsPerWorkgroup: 64,
    });
  });
});

describe('desiredDisplayLimits', () => {
  it('asks for nothing on screens the default 8192 covers', () => {
    expect(desiredDisplayLimits({ width: 1920, height: 1080, devicePixelRatio: 2 })).toEqual({});
    expect(desiredDisplayLimits({ width: 3840, height: 2160, devicePixelRatio: 1 })).toEqual({});
    expect(desiredDisplayLimits(null)).toEqual({});
  });

  it('asks for nothing even on a 32:9 or 8K panel: the pixel budget bounds the backing store', () => {
    expect(desiredDisplayLimits({ width: 5120, height: 1440, devicePixelRatio: 2 })).toEqual({});
    expect(desiredDisplayLimits({ width: 7680, height: 4320, devicePixelRatio: 2 })).toEqual({});
  });

  it('raises maxTextureDimension2D only when the policy can need more (extreme aspect ratio)', () => {
    const limits = desiredDisplayLimits({ width: 12000, height: 1000, devicePixelRatio: 1 });
    expect(limits.maxTextureDimension2D).toBeGreaterThan(DEFAULT_MAX_TEXTURE_DIMENSION_2D);
  });

  it('is clamped to the adapter by resolveRequiredLimits', () => {
    const adapter = { limits: { maxTextureDimension2D: 8192, maxStorageBuffersPerShaderStage: 8 } };
    const resolved = resolveRequiredLimits(adapter, { maxTextureDimension2D: 12000 });
    expect(resolved.maxTextureDimension2D).toBe(8192);
  });
});

describe('limits report', () => {
  it('reads getter-style limits (prototype properties, not own keys)', () => {
    class Limits {
      get maxTextureDimension2D() { return 16384; }
      get maxBindGroups() { return 4; }
    }
    expect(readLimits(new Limits(), ['maxTextureDimension2D', 'maxBindGroups', 'nope'])).toEqual({
      maxTextureDimension2D: 16384,
      maxBindGroups: 4,
    });
  });

  it('records requested vs adapter vs granted, always including the headline limits', () => {
    const report = buildLimitsReport(
      { maxStorageBuffersPerShaderStage: 4 },
      { maxStorageBuffersPerShaderStage: 10, maxTextureDimension2D: 16384, maxBindGroups: 4 },
      { maxStorageBuffersPerShaderStage: 4, maxTextureDimension2D: 8192, maxBindGroups: 1 },
    );
    expect(report.requested).toEqual({ maxStorageBuffersPerShaderStage: 4 });
    expect(report.adapter).toMatchObject({ maxStorageBuffersPerShaderStage: 10, maxTextureDimension2D: 16384, maxBindGroups: 4 });
    expect(report.granted).toMatchObject({ maxStorageBuffersPerShaderStage: 4, maxTextureDimension2D: 8192, maxBindGroups: 1 });
    expect(REPORTED_LIMIT_KEYS).toContain('maxTextureDimension2D');
  });
});
