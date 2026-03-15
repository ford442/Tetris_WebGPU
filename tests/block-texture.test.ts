import { describe, expect, it } from 'vitest';
import {
  getProceduralBlockTextureGradientStops,
  getTextureMipLevelCount,
  paintProceduralBlockTexture,
  resolveBlockTextureUrl,
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
