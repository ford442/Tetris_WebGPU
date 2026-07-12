import { describe, expect, it } from 'vitest';
import {
  resolvePowerPreference,
  selectOptionalFeatures,
  DESIRED_OPTIONAL_FEATURES,
} from '../src/webgpu/gpuContext.js';

describe('resolvePowerPreference', () => {
  it('defaults to high-performance', () => {
    expect(resolvePowerPreference('', null)).toBe('high-performance');
  });

  it('honors ?gpu=low', () => {
    expect(resolvePowerPreference('?gpu=low', null)).toBe('low-power');
    expect(resolvePowerPreference('?gpu=low-power', null)).toBe('low-power');
  });

  it('honors ?gpu=high', () => {
    expect(resolvePowerPreference('?gpu=high', null)).toBe('high-performance');
  });

  it('falls back to storage when query absent', () => {
    expect(resolvePowerPreference('', 'low')).toBe('low-power');
    expect(resolvePowerPreference('', 'high')).toBe('high-performance');
  });

  it('query overrides storage', () => {
    expect(resolvePowerPreference('?gpu=low', 'high')).toBe('low-power');
  });
});

describe('selectOptionalFeatures', () => {
  it('returns only features the adapter advertises', () => {
    const adapterFeatures = new Set<string>(['shader-f16', 'timestamp-query']);
    const selected = selectOptionalFeatures(adapterFeatures);
    expect(selected).toContain('shader-f16');
    expect(selected).toContain('timestamp-query');
    expect(selected).not.toContain('texture-compression-astc');
  });

  it('returns empty for null adapter features', () => {
    expect(selectOptionalFeatures(null)).toEqual([]);
    expect(selectOptionalFeatures(undefined)).toEqual([]);
  });

  it('never returns a feature outside the candidate list', () => {
    const adapterFeatures = new Set<string>([...DESIRED_OPTIONAL_FEATURES, 'depth-clip-control']);
    const selected = selectOptionalFeatures(adapterFeatures);
    expect(selected).not.toContain('depth-clip-control');
  });

  it('tolerates a throwing has()', () => {
    const bad = { has() { throw new Error('boom'); } };
    expect(selectOptionalFeatures(bad)).toEqual([]);
  });
});
