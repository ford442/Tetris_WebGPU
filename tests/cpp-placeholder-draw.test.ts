import { describe, it, expect } from 'vitest';
import { flattenPlayfieldGrid } from '../src/viewCpp/cppPlayfieldSync.js';
import { drawPlayfield2D, drawWipBanner } from '../src/viewCpp/placeholderDraw.js';
import { themes } from '../src/webgpu/themes.js';

describe('placeholderDraw', () => {
  it('drawPlayfield2D and drawWipBanner run without throwing on a mock context', () => {
    const calls: string[] = [];
    const ctx = {
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      fillRect: () => calls.push('fillRect'),
      strokeRect: () => calls.push('strokeRect'),
      measureText: (t: string) => ({ width: t.length * 8 }),
      fillText: () => calls.push('fillText'),
      font: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      textAlign: 'left',
      textBaseline: 'alphabetic',
    } as unknown as CanvasRenderingContext2D;

    const grid = Array.from({ length: 20 }, () => Array(10).fill(0));
    grid[5][3] = 4;
    grid[5][4] = -4;

    drawPlayfield2D(ctx, grid, themes.imageSampled, 800, 600);
    drawWipBanner(ctx, 800, 600, false);

    expect(calls.length).toBeGreaterThan(0);
    expect(flattenPlayfieldGrid(grid)[5 * 10 + 4]).toBe(-4);
  });
});
