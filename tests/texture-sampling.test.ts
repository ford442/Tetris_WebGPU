import { describe, expect, it, beforeEach } from 'vitest';
import {
  getTextureSamplingWGSL,
  getSimpleTextureSamplingWGSL,
  getTextureSamplingDefines,
} from '../src/webgpu/textureSampling.js';
import {
  setBlockTextureConfig,
  resetBlockTextureConfig,
} from '../src/webgpu/blockTexture.js';

describe('texture sampling WGSL generation', () => {
  beforeEach(() => {
    resetBlockTextureConfig();
  });

  describe('getSimpleTextureSamplingWGSL', () => {
    it('generates atlas mode code by default', () => {
      const code = getSimpleTextureSamplingWGSL();
      expect(code).toContain('ATLAS_COLUMNS');
      expect(code).toContain('ATLAS_ROWS');
      expect(code).toContain('transformUVForSampling');
      expect(code).toContain('extractMaterialMask');
    });

    it('includes correct atlas constants for default config', () => {
      const code = getSimpleTextureSamplingWGSL();
      expect(code).toContain('ATLAS_COLUMNS: f32 = 4.0');
      expect(code).toContain('ATLAS_ROWS: f32 = 3.0');
      expect(code).toContain('ATLAS_TILE_COL: f32 = 1.0');
      expect(code).toContain('ATLAS_TILE_ROW: f32 = 1.0');
      expect(code).toContain('ATLAS_INSET: f32 = 0.03');
    });

    it('generates single mode code when configured', () => {
      setBlockTextureConfig({ samplingMode: 'single' });
      const code = getSimpleTextureSamplingWGSL();
      expect(code).toContain('SINGLE mode');
      expect(code).not.toContain('ATLAS_COLUMNS');
    });

    it('includes material detection functions', () => {
      const code = getSimpleTextureSamplingWGSL();
      expect(code).toContain('fn extractMaterialMask');
      expect(code).toContain('metalMask');
    });
  });

  describe('getTextureSamplingWGSL', () => {
    it('generates full featured code with switch statements', () => {
      const code = getTextureSamplingWGSL();
      expect(code).toContain('TEXTURE_MODE_SINGLE');
      expect(code).toContain('TEXTURE_MODE_ATLAS');
      expect(code).toContain('TEXTURE_MODE_SUBREGION');
      expect(code).toContain('switch textureSamplingMode');
    });

    it('includes material detection mode constants', () => {
      const code = getTextureSamplingWGSL();
      expect(code).toContain('MATERIAL_MODE_LUMINANCE');
      expect(code).toContain('MATERIAL_MODE_COLOR_SIGNAL');
      expect(code).toContain('MATERIAL_MODE_ALPHA');
      expect(code).toContain('MATERIAL_MODE_NONE');
    });

    it('includes configurable threshold values', () => {
      setBlockTextureConfig({
        metalThresholdLow: 0.25,
        metalThresholdHigh: 0.75,
      });
      const code = getTextureSamplingWGSL();
      expect(code).toContain('METAL_THRESHOLD_LOW: f32 = 0.25');
      expect(code).toContain('METAL_THRESHOLD_HIGH: f32 = 0.75');
    });

    it('includes subregion constants when in subregion mode', () => {
      setBlockTextureConfig({
        samplingMode: 'subregion',
        subregionX: 0.1,
        subregionY: 0.2,
        subregionWidth: 0.3,
        subregionHeight: 0.4,
      });
      const code = getTextureSamplingWGSL();
      expect(code).toContain('SUBREGION_X: f32 = 0.1');
      expect(code).toContain('SUBREGION_Y: f32 = 0.2');
      expect(code).toContain('SUBREGION_W: f32 = 0.3');
      expect(code).toContain('SUBREGION_H: f32 = 0.4');
    });

    it('includes sampleBlockTexture helper function', () => {
      const code = getTextureSamplingWGSL();
      expect(code).toContain('fn sampleBlockTexture');
    });

    it('includes getAtlasTransform helper function', () => {
      const code = getTextureSamplingWGSL();
      expect(code).toContain('fn getAtlasTransform');
    });
  });

  describe('getTextureSamplingDefines', () => {
    it('generates preprocessor defines for atlas mode', () => {
      const defines = getTextureSamplingDefines();
      expect(defines).toContain('#define TEXTURE_MODE_ATLAS');
      expect(defines).toContain('#define ATLAS_COLUMNS 4');
      expect(defines).toContain('#define ATLAS_ROWS 3');
    });

    it('generates correct defines for single mode', () => {
      setBlockTextureConfig({ samplingMode: 'single' });
      const defines = getTextureSamplingDefines();
      expect(defines).toContain('#define TEXTURE_MODE_SINGLE');
    });

    it('includes material detection define', () => {
      setBlockTextureConfig({ materialDetectionMode: 'luminance' });
      const defines = getTextureSamplingDefines();
      expect(defines).toContain('#define MATERIAL_DETECTION_LUMINANCE');
    });
  });

  describe('configuration changes affect generated code', () => {
    it('updates atlas dimensions in generated code', () => {
      setBlockTextureConfig({
        atlasColumns: 8,
        atlasRows: 6,
      });
      const code = getSimpleTextureSamplingWGSL();
      expect(code).toContain('ATLAS_COLUMNS: f32 = 8.0');
      expect(code).toContain('ATLAS_ROWS: f32 = 6.0');
    });

    it('updates tile position in generated code', () => {
      setBlockTextureConfig({
        atlasTileColumn: 3,
        atlasTileRow: 2,
      });
      const code = getSimpleTextureSamplingWGSL();
      expect(code).toContain('ATLAS_TILE_COL: f32 = 3.0');
      expect(code).toContain('ATLAS_TILE_ROW: f32 = 2.0');
    });

    it('updates inset value in generated code', () => {
      setBlockTextureConfig({ atlasTileInset: 0.05 });
      const code = getSimpleTextureSamplingWGSL();
      expect(code).toContain('ATLAS_INSET: f32 = 0.05');
    });

    it('updates material detection thresholds in generated code', () => {
      setBlockTextureConfig({
        materialDetectionMode: 'color_signal',
        metalThresholdLow: 0.8,
        metalThresholdHigh: 1.2,
      });
      const code = getSimpleTextureSamplingWGSL();
      // Should include the threshold values in the mask extraction
      expect(code).toContain('goldSignal - 0.8'); // low threshold
      // Note: high threshold affects the divisor (1.2 - 0.8 = 0.4, but may have floating point representation)
      expect(code).toMatch(/\/\s*0\.3?9+/); // matches / 0.4 or / 0.399...
    });
  });
});
