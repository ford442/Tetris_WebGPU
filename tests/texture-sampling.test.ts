import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTextureSamplingWGSL,
  getSimpleTextureSamplingWGSL,
  getTextureSamplingDefines,
} from '../src/webgpu/textureSampling.js';
import { setBlockTextureConfig, resetBlockTextureConfig } from '../src/webgpu/blockTexture.js';

describe('Texture Sampling WGSL Generation', () => {
  beforeEach(() => {
    resetBlockTextureConfig();
  });

  describe('getSimpleTextureSamplingWGSL', () => {
    it('generates SINGLE mode code', () => {
      const code = getSimpleTextureSamplingWGSL();
      expect(code).toContain('SINGLE mode');
      expect(code).toContain('transformUVForSampling');
      expect(code).toContain('extractMaterialMask');
    });

    it('includes material detection functions', () => {
      const code = getSimpleTextureSamplingWGSL();
      expect(code).toContain('extractMaterialMask');
      expect(code).toContain('composeMaterialBaseColor');
    });

    it('uses color-signal-based gold/crystal separation by default', () => {
      const code = getSimpleTextureSamplingWGSL();
      expect(code).toContain('goldSignal');
      expect(code).toContain('smoothstep');
    });
  });

  describe('getTextureSamplingWGSL', () => {
    it('generates single-tile code without switch statements', () => {
      const code = getTextureSamplingWGSL();
      expect(code).toContain('MATERIAL_MODE_COLOR_SIGNAL');
      expect(code).not.toContain('switch textureSamplingMode');
    });

    it('includes material detection mode constants', () => {
      const code = getTextureSamplingWGSL();
      expect(code).toContain('MATERIAL_MODE_LUMINANCE');
      expect(code).toContain('MATERIAL_MODE_COLOR_SIGNAL');
      expect(code).toContain('materialDetectionMode');
    });

    it('includes configurable threshold values', () => {
      const code = getTextureSamplingWGSL();
      expect(code).toContain('METAL_THRESHOLD_LOW');
      expect(code).toContain('METAL_THRESHOLD_HIGH');
    });

    it('includes sampleBlockTexture helper function', () => {
      const code = getTextureSamplingWGSL();
      expect(code).toContain('fn sampleBlockTexture');
    });
  });

  describe('getTextureSamplingDefines', () => {
    it('generates TEXTURE_MODE_SINGLE defines', () => {
      const defines = getTextureSamplingDefines();
      expect(defines).toContain('#define TEXTURE_MODE_SINGLE');
    });

    it('includes material detection define', () => {
      const defines = getTextureSamplingDefines();
      expect(defines).toContain('#define MATERIAL_DETECTION_');
    });
  });

  describe('configuration changes affect generated code', () => {
    it('updates material detection thresholds in generated code', () => {
      setBlockTextureConfig({
        metalThresholdLow: 0.1,
        metalThresholdHigh: 0.9,
      });
      const code = getTextureSamplingWGSL();
      expect(code).toContain('METAL_THRESHOLD_LOW: f32 = 0.1');
      expect(code).toContain('METAL_THRESHOLD_HIGH: f32 = 0.9');
    });
  });
});
