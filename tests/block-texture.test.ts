import { describe, expect, it, beforeEach } from 'vitest';
import {
  getProceduralBlockTextureGradientStops,
  getTextureMipLevelCount,
  paintProceduralBlockTexture,
  resolveBlockTextureUrl,
  setBlockTextureConfig,
  getBlockTextureConfig,
  resetBlockTextureConfig,
  getAtlasSamplingParams,
  DEFAULT_BLOCK_TEXTURE_CONFIG,
  SINGLE_TILE_TEXTURE_CONFIG,
  type BlockTextureGradient,
  type BlockTexturePainter,
} from '../src/webgpu/blockTexture.js';

class MockGradient implements BlockTextureGradient {
  stops: Array<{ offset: number; color: string }> = [];

  addColorStop(offset: number, color: string): void {
    this.stops.push({ offset, color });
  }
}

class MockPainter implements BlockTexturePainter {
  fillStyle: string | BlockTextureGradient | CanvasGradient = '';
  strokeStyle = '';
  lineWidth = 1;
  readonly gradient = new MockGradient();
  gradientArgs: [number, number, number, number] | null = null;
  readonly fillRects: Array<[number, number, number, number]> = [];
  readonly strokeRects: Array<{ strokeStyle: string; lineWidth: number; rect: [number, number, number, number] }> = [];

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): BlockTextureGradient {
    this.gradientArgs = [x0, y0, x1, y1];
    return this.gradient;
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    this.fillRects.push([x, y, width, height]);
  }

  strokeRect(x: number, y: number, width: number, height: number): void {
    this.strokeRects.push({
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      rect: [x, y, width, height],
    });
  }
}

describe('block texture helpers', () => {
  beforeEach(() => {
    // Reset to default config before each test
    resetBlockTextureConfig();
  });

  it('resolves the block texture asset from the deployment base', () => {
    expect(
      resolveBlockTextureUrl('https://example.com/src/webgpu/blockTexture.ts')
    ).toBe('./block.png');
  });

  it('computes mip levels from the largest texture dimension', () => {
    expect(getTextureMipLevelCount(256, 256)).toBe(9);
    expect(getTextureMipLevelCount(2816, 1536)).toBe(12);
  });

  it('paints a glass-and-metal fallback texture layout', () => {
    const painter = new MockPainter();
    const size = 256;

    paintProceduralBlockTexture(painter, size);

    expect(painter.fillStyle).toBe(painter.gradient);
    expect(painter.gradientArgs).toEqual([0, 0, size, size]);
    expect(painter.fillRects).toEqual([[0, 0, size, size]]);
    expect(painter.gradient.stops).toEqual(getProceduralBlockTextureGradientStops());
    expect(painter.strokeRects).toEqual([
      { strokeStyle: '#d4af37', lineWidth: 8, rect: [4, 4, size - 8, size - 8] },
      { strokeStyle: '#f0e68c', lineWidth: 2, rect: [12, 12, size - 24, size - 24] },
      { strokeStyle: 'rgba(255, 255, 255, 0.45)', lineWidth: 6, rect: [20, 20, size - 40, size * 0.34] },
      { strokeStyle: 'rgba(110, 180, 255, 0.22)', lineWidth: 3, rect: [28, size * 0.44, size - 56, size * 0.34] },
    ]);
  });
});

describe('block texture configuration', () => {
  beforeEach(() => {
    resetBlockTextureConfig();
  });

  it('has correct default configuration', () => {
    const config = getBlockTextureConfig();
    expect(config.url).toBe('./block.png');
    expect(config.samplingMode).toBe('atlas');
    expect(config.atlasColumns).toBe(4);
    expect(config.atlasRows).toBe(3);
    expect(config.atlasTileColumn).toBe(1);
    expect(config.atlasTileRow).toBe(1);
    expect(config.atlasTileInset).toBe(0.03);
    expect(config.materialDetectionMode).toBe('color_signal');
  });

  it('has correct single tile configuration preset', () => {
    expect(SINGLE_TILE_TEXTURE_CONFIG.samplingMode).toBe('single');
    expect(SINGLE_TILE_TEXTURE_CONFIG.materialDetectionMode).toBe('luminance');
    expect(SINGLE_TILE_TEXTURE_CONFIG.atlasColumns).toBeUndefined();
  });

  it('can update configuration partially', () => {
    setBlockTextureConfig({ url: './custom.png' });
    const config = getBlockTextureConfig();
    expect(config.url).toBe('./custom.png');
    // Other values should remain unchanged
    expect(config.samplingMode).toBe('atlas');
  });

  it('can switch to single tile mode', () => {
    setBlockTextureConfig({
      samplingMode: 'single',
      materialDetectionMode: 'luminance',
    });
    const config = getBlockTextureConfig();
    expect(config.samplingMode).toBe('single');
    expect(config.materialDetectionMode).toBe('luminance');
  });

  it('can configure atlas parameters', () => {
    setBlockTextureConfig({
      atlasColumns: 8,
      atlasRows: 4,
      atlasTileColumn: 3,
      atlasTileRow: 2,
      atlasTileInset: 0.05,
    });
    const config = getBlockTextureConfig();
    expect(config.atlasColumns).toBe(8);
    expect(config.atlasRows).toBe(4);
    expect(config.atlasTileColumn).toBe(3);
    expect(config.atlasTileRow).toBe(2);
    expect(config.atlasTileInset).toBe(0.05);
  });

  it('can configure subregion mode', () => {
    setBlockTextureConfig({
      samplingMode: 'subregion',
      subregionX: 0.25,
      subregionY: 0.25,
      subregionWidth: 0.5,
      subregionHeight: 0.5,
    });
    const config = getBlockTextureConfig();
    expect(config.samplingMode).toBe('subregion');
    expect(config.subregionX).toBe(0.25);
    expect(config.subregionY).toBe(0.25);
    expect(config.subregionWidth).toBe(0.5);
    expect(config.subregionHeight).toBe(0.5);
  });

  it('can configure material detection thresholds', () => {
    setBlockTextureConfig({
      materialDetectionMode: 'luminance',
      metalThresholdLow: 0.3,
      metalThresholdHigh: 0.7,
    });
    const config = getBlockTextureConfig();
    expect(config.materialDetectionMode).toBe('luminance');
    expect(config.metalThresholdLow).toBe(0.3);
    expect(config.metalThresholdHigh).toBe(0.7);
  });

  it('resets to defaults correctly', () => {
    setBlockTextureConfig({ url: './changed.png', samplingMode: 'single' });
    resetBlockTextureConfig();
    const config = getBlockTextureConfig();
    expect(config.url).toBe('./block.png');
    expect(config.samplingMode).toBe('atlas');
  });

  it('returns correct atlas sampling params', () => {
    setBlockTextureConfig({
      atlasColumns: 6,
      atlasRows: 5,
      atlasTileColumn: 2,
      atlasTileRow: 3,
      atlasTileInset: 0.04,
    });
    const params = getAtlasSamplingParams();
    expect(params.columns).toBe(6);
    expect(params.rows).toBe(5);
    expect(params.tileColumn).toBe(2);
    expect(params.tileRow).toBe(3);
    expect(params.inset).toBe(0.04);
  });

  it('uses previous atlas values when not specified', () => {
    // Default config has atlas values, so they persist when switching modes
    setBlockTextureConfig({ samplingMode: 'single' });
    const params = getAtlasSamplingParams();
    // Should keep the default atlas values even in single mode
    expect(params.columns).toBe(4);
    expect(params.rows).toBe(3);
    expect(params.inset).toBe(0.03);
  });

  it('uses fallback defaults when atlas params are undefined', () => {
    // Start with a fresh single-tile config
    setBlockTextureConfig({
      url: './single.png',
      samplingMode: 'single',
      atlasColumns: undefined,
      atlasRows: undefined,
      atlasTileColumn: undefined,
      atlasTileRow: undefined,
      atlasTileInset: undefined,
    });
    const params = getAtlasSamplingParams();
    // Should use fallback defaults (1 for dimensions, 0 for inset)
    expect(params.columns).toBe(1);
    expect(params.rows).toBe(1);
    expect(params.tileColumn).toBe(0);
    expect(params.tileRow).toBe(0);
    expect(params.inset).toBe(0);
  });

  it('resolveBlockTextureUrl returns configured URL', () => {
    setBlockTextureConfig({ url: './new-texture.png' });
    expect(resolveBlockTextureUrl()).toBe('./new-texture.png');
  });
});
