import { describe, expect, it } from 'vitest';
import {
  CHORE_WORKGROUP_1D,
  CHORE_WORKGROUP_2D,
  CompactIndicesShader,
  Downsample2dShader,
  LumaHistogramShader,
} from '../src/webgpu/gpuChores/shaders.js';
import { LUMA_HISTOGRAM_BINS } from '../src/webgpu/gpuChores/lumaStats.js';

const ALL = {
  luma_histogram: LumaHistogramShader,
  downsample_2d: Downsample2dShader,
  compact_indices: CompactIndicesShader,
};

describe('chore workgroup shape', () => {
  it('uses (8,8) for the 2D bloom jobs', () => {
    expect(CHORE_WORKGROUP_2D).toBe(8);
    expect(LumaHistogramShader).toContain('@workgroup_size(8, 8)');
    expect(Downsample2dShader).toContain('@workgroup_size(8, 8)');
  });

  it('uses (64) for the 1D compaction', () => {
    expect(CHORE_WORKGROUP_1D).toBe(64);
    expect(CompactIndicesShader).toContain('@workgroup_size(64)');
  });

  it('names each entry point after its job', () => {
    for (const [entry, code] of Object.entries(ALL)) {
      expect(code).toContain(`fn ${entry}(`);
    }
  });
});

describe('chore shader scope', () => {
  it('keeps the histogram bin count in step with the CPU stats module', () => {
    expect(LUMA_HISTOGRAM_BINS).toBe(64);
    expect(LumaHistogramShader).toContain(`array<atomic<u32>, ${LUMA_HISTOGRAM_BINS}>`);
  });

  it('uses Rec. 709 luma, matching the CPU rung', () => {
    expect(LumaHistogramShader).toContain('vec3<f32>(0.2126, 0.7152, 0.0722)');
  });

  it('touches no board, piece or gravity state', () => {
    for (const code of Object.values(ALL)) {
      expect(code).not.toMatch(/\bboard\b/);
      expect(code).not.toMatch(/\bpiece\b/i);
      expect(code).not.toMatch(/\bgravity\b/i);
      expect(code).not.toMatch(/\bcollision\b/i);
    }
  });

  it('writes only to its own outputs — nothing renders from a chore', () => {
    for (const code of Object.values(ALL)) {
      expect(code).not.toContain('@vertex');
      expect(code).not.toContain('@fragment');
    }
  });

  it('merges the histogram through workgroup memory, not one global atomic per pixel', () => {
    expect(LumaHistogramShader).toContain('var<workgroup> localHistogram');
    expect(LumaHistogramShader).toContain('workgroupBarrier()');
  });
});
