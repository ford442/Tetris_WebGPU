import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';

import { checkGolden, diffPngs, diffRatio, SizeMismatchError } from './e2e/visualDiff.js';

function solid(width: number, height: number, rgba: [number, number, number, number], paint?: (png: PNG) => void): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) png.data.set(rgba, i * 4);
  paint?.(png);
  return PNG.sync.write(png);
}

const setPx = (png: PNG, x: number, y: number, rgba: [number, number, number, number]): void => {
  png.data.set(rgba, (y * png.width + x) * 4);
};

describe('diffPngs', () => {
  it('reports zero for identical images', () => {
    const a = solid(20, 10, [10, 20, 30, 255]);
    const r = diffPngs(a, a);
    expect(r.diffPixels).toBe(0);
    expect(r.ratio).toBe(0);
  });

  it('counts a changed block and names it in the diff image', () => {
    const a = solid(20, 10, [10, 20, 30, 255]);
    const b = solid(20, 10, [10, 20, 30, 255], (p) => {
      for (let y = 0; y < 5; y++) for (let x = 0; x < 4; x++) setPx(p, x, y, [250, 240, 10, 255]);
    });
    const r = diffPngs(a, b);
    expect(r.diffPixels).toBe(20);
    expect(r.ratio).toBeCloseTo(20 / 200, 6);
    const diff = PNG.sync.read(r.diffPng);
    expect(Array.from(diff.data.slice(0, 3))).toEqual([255, 0, 0]); // pixelmatch paints diffs red
  });

  it('ignores differences under the colour threshold and flags them above it', () => {
    const a = solid(8, 8, [100, 100, 100, 255]);
    const slight = solid(8, 8, [102, 100, 100, 255]);
    expect(diffRatio(a, slight, { threshold: 0.1 })).toBe(0);
    expect(diffRatio(a, slight, { threshold: 0 })).toBe(1);
  });

  it('rejects images of different size rather than guessing', () => {
    expect(() => diffPngs(solid(4, 4, [0, 0, 0, 255]), solid(4, 5, [0, 0, 0, 255]))).toThrow(SizeMismatchError);
  });
});

describe('checkGolden', () => {
  const dirs: string[] = [];
  const tmp = (): string => {
    const d = mkdtempSync(join(tmpdir(), 'golden-'));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  const base = Object.freeze({ name: 'frame', maxDiffRatio: 0.01 });

  it('is never a silent pass when the golden is missing', () => {
    const d = tmp();
    const out = checkGolden(solid(4, 4, [1, 2, 3, 255]), { ...base, goldenPath: join(d, 'g.png'), outDir: join(d, 'out') });
    expect(out.status).toBe('missing');
    if (out.status === 'missing') expect(out.message).toContain('UPDATE_GOLDENS=1');
  });

  it('writes the golden on update, then matches it', () => {
    const d = tmp();
    const img = solid(6, 6, [9, 9, 9, 255]);
    const goldenPath = join(d, 'sub', 'g.png');
    expect(checkGolden(img, { ...base, goldenPath, outDir: d, update: true }).status).toBe('updated');
    expect(readFileSync(goldenPath).equals(img)).toBe(true);
    expect(checkGolden(img, { ...base, goldenPath, outDir: d })).toEqual({ status: 'match', ratio: 0 });
  });

  it('leaves actual, expected and diff images on a mismatch', () => {
    const d = tmp();
    const goldenPath = join(d, 'g.png');
    checkGolden(solid(10, 10, [0, 0, 0, 255]), { ...base, goldenPath, outDir: d, update: true });
    const out = checkGolden(solid(10, 10, [255, 255, 255, 255]), { ...base, goldenPath, outDir: join(d, 'out') });
    expect(out.status).toBe('mismatch');
    if (out.status === 'mismatch') {
      expect(out.ratio).toBe(1);
      expect(existsSync(out.actualPath)).toBe(true);
      expect(existsSync(out.diffPath)).toBe(true);
      expect(existsSync(join(d, 'out', 'frame-expected.png'))).toBe(true);
    }
  });

  it('tolerates a diff under the limit', () => {
    const d = tmp();
    const goldenPath = join(d, 'g.png');
    checkGolden(solid(100, 10, [0, 0, 0, 255]), { ...base, goldenPath, outDir: d, update: true });
    const noisy = solid(100, 10, [0, 0, 0, 255], (p) => setPx(p, 3, 3, [255, 255, 255, 255]));
    const out = checkGolden(noisy, { ...base, goldenPath, outDir: d });
    expect(out.status).toBe('match');
  });

  it('reports a size change as its own outcome', () => {
    const d = tmp();
    const goldenPath = join(d, 'g.png');
    checkGolden(solid(10, 10, [0, 0, 0, 255]), { ...base, goldenPath, outDir: d, update: true });
    expect(checkGolden(solid(11, 10, [0, 0, 0, 255]), { ...base, goldenPath, outDir: join(d, 'o') }).status).toBe('size-mismatch');
  });
});
