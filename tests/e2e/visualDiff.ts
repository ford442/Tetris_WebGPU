/**
 * Perceptual image comparison for the E2E suite: `pixelmatch` over `pngjs` buffers.
 *
 * Pure (no Playwright, no filesystem except where noted), so its behaviour is pinned by
 * `tests/visual-diff.test.ts` under plain Vitest.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface DiffOptions {
  /** pixelmatch colour-distance threshold, 0 (strict) .. 1 (lax). Default 0.1. */
  threshold?: number;
  /** Count anti-aliased pixels as differences. Default false (AA is ignored). */
  includeAA?: boolean;
}

export interface DiffResult {
  width: number;
  height: number;
  /** Pixels pixelmatch flagged. */
  diffPixels: number;
  /** diffPixels / (width*height), in 0..1. */
  ratio: number;
  /** A PNG with differing pixels in red over a faded copy of `a`. */
  diffPng: Buffer;
}

export class SizeMismatchError extends Error {
  constructor(readonly a: { width: number; height: number }, readonly b: { width: number; height: number }) {
    super(`image sizes differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
    this.name = 'SizeMismatchError';
  }
}

export function diffPngs(a: Buffer, b: Buffer, options: DiffOptions = {}): DiffResult {
  const imgA = PNG.sync.read(a);
  const imgB = PNG.sync.read(b);
  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    throw new SizeMismatchError(imgA, imgB);
  }
  const { width, height } = imgA;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(imgA.data, imgB.data, diff.data, width, height, {
    threshold: options.threshold ?? 0.1,
    includeAA: options.includeAA ?? false,
  });
  return { width, height, diffPixels, ratio: diffPixels / (width * height), diffPng: PNG.sync.write(diff) };
}

/** Fraction of pixels (0..1) a frame differs from another, as a convenience for assertions. */
export function diffRatio(a: Buffer, b: Buffer, options?: DiffOptions): number {
  return diffPngs(a, b, options).ratio;
}

export interface GoldenCheck {
  /** Absolute path of the golden PNG. */
  goldenPath: string;
  /** Directory the actual/diff PNGs are written to on a mismatch (uploaded as a CI artifact). */
  outDir: string;
  name: string;
  /** Allowed diff ratio, 0..1. */
  maxDiffRatio: number;
  options?: DiffOptions;
  /** Overwrite the golden with `actual` (UPDATE_GOLDENS=1). */
  update?: boolean;
}

export type GoldenOutcome =
  | { status: 'match'; ratio: number }
  | { status: 'updated' }
  | { status: 'missing'; message: string }
  | { status: 'mismatch'; ratio: number; message: string; actualPath: string; diffPath: string }
  | { status: 'size-mismatch'; message: string; actualPath: string };

/**
 * Compare `actual` to the golden on disk. Never passes silently: a missing golden is its own
 * outcome with the command that creates it, and a mismatch leaves the actual and diff images on
 * disk for the report.
 */
export function checkGolden(actual: Buffer, check: GoldenCheck): GoldenOutcome {
  const { goldenPath, outDir, name } = check;
  if (check.update) {
    mkdirSync(dirname(goldenPath), { recursive: true });
    writeFileSync(goldenPath, actual);
    return { status: 'updated' };
  }
  if (!existsSync(goldenPath)) {
    return {
      status: 'missing',
      message: `no golden for "${name}" at ${goldenPath} — create it with UPDATE_GOLDENS=1 npm run e2e`,
    };
  }
  mkdirSync(outDir, { recursive: true });
  const actualPath = join(outDir, `${name}-actual.png`);
  const golden = readFileSync(goldenPath);
  try {
    const result = diffPngs(golden, actual, check.options);
    if (result.ratio <= check.maxDiffRatio) return { status: 'match', ratio: result.ratio };
    const diffPath = join(outDir, `${name}-diff.png`);
    writeFileSync(actualPath, actual);
    writeFileSync(diffPath, result.diffPng);
    writeFileSync(join(outDir, `${name}-expected.png`), golden);
    return {
      status: 'mismatch',
      ratio: result.ratio,
      actualPath,
      diffPath,
      message:
        `"${name}" differs from its golden in ${(result.ratio * 100).toFixed(3)}% of pixels ` +
        `(limit ${(check.maxDiffRatio * 100).toFixed(3)}%); see ${diffPath}`,
    };
  } catch (err) {
    if (err instanceof SizeMismatchError) {
      writeFileSync(actualPath, actual);
      return { status: 'size-mismatch', actualPath, message: `"${name}": ${err.message}` };
    }
    throw err;
  }
}
