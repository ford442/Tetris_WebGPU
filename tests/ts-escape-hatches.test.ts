import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ratchet: the number of `as any` / `@ts-ignore` / `@ts-expect-error` escape hatches
 * under src/ may only go DOWN.
 *
 *  - Adding one fails this test: type it properly, or (rarely) justify it in review and
 *    raise the baseline in the same PR.
 *  - Removing one also fails it until BASELINE is lowered to match, so the win is locked in.
 */
const BASELINE = 13;

const ROOT = process.cwd();
const ESCAPE_HATCH = /\bas any\b|@ts-ignore|@ts-expect-error/g;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(name)) yield full;
  }
}

function countEscapeHatches(): { total: number; byFile: Map<string, number> } {
  const byFile = new Map<string, number>();
  let total = 0;
  for (const file of walk(join(ROOT, 'src'))) {
    const n = readFileSync(file, 'utf8').match(ESCAPE_HATCH)?.length ?? 0;
    if (n > 0) byFile.set(file.slice(ROOT.length + 1), n);
    total += n;
  }
  return { total, byFile };
}

describe('type-safety ratchet', () => {
  it('src/ has no more `as any` / @ts-ignore / @ts-expect-error than the baseline', () => {
    const { total, byFile } = countEscapeHatches();
    const detail = [...byFile].map(([f, n]) => `  ${n}  ${f}`).join('\n');
    expect(total, `escape hatches in src/ (baseline ${BASELINE}):\n${detail}`).toBeLessThanOrEqual(BASELINE);
  });

  it('the baseline is tight (lower BASELINE when you remove one)', () => {
    expect(countEscapeHatches().total).toBe(BASELINE);
  });
});

describe('typecheck surface', () => {
  const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

  it('the root tsconfig references every project (src, tests, node, workers)', () => {
    const root = read('tsconfig.json');
    for (const project of ['src', 'tests', 'node', 'workers']) {
      expect(root).toContain(`./tsconfig.${project}.json`);
    }
  });

  it('npm run typecheck runs the project build and the noUncheckedIndexedAccess ratchet', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts.typecheck).toContain('tsc -b');
    expect(pkg.scripts.typecheck).toContain('tsconfig.index-access.json');
  });

  it('uses Bundler resolution and noImplicitOverride everywhere', () => {
    const base = read('tsconfig.base.json');
    expect(base).toMatch(/"moduleResolution":\s*"Bundler"/);
    expect(base).toMatch(/"noImplicitOverride":\s*true/);
  });

  it('the index-access ratchet only grows (src/game and src/wasm stay listed)', () => {
    const cfg = read('tsconfig.index-access.json');
    expect(cfg).toMatch(/"noUncheckedIndexedAccess":\s*true/);
    expect(cfg).toContain('"src/game"');
    expect(cfg).toContain('"src/wasm"');
  });
});
