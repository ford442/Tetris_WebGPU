/**
 * The build gate itself. `npm run build` runs this script, so its exit codes are the
 * contract: a valid material passes, a material that breaks the look fails with a
 * message that names the number, and a missing file is not an error (the renderers
 * fall back to the built-in reference material).
 */

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readPngHeader } from '../scripts/lib/png.mjs';

const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts/validate-block-material.mjs');

function runInFixture(material: unknown | null): { status: number; output: string } {
  // The script reads <root>/public/block-material.json, so the fixture is a temp root
  // with a symlink-free copy of the bits it touches.
  const dir = mkdtempSync(join(tmpdir(), 'block-material-'));
  try {
    mkdirSync(join(dir, 'public'));
    mkdirSync(join(dir, 'scripts', 'lib'), { recursive: true });
    mkdirSync(join(dir, 'shared'));
    copyFileSync(SCRIPT, join(dir, 'scripts/validate-block-material.mjs'));
    copyFileSync(join(ROOT, 'scripts/lib/png.mjs'), join(dir, 'scripts/lib/png.mjs'));
    copyFileSync(
      join(ROOT, 'scripts/lib/blockMaterialSchema.mjs'),
      join(dir, 'scripts/lib/blockMaterialSchema.mjs'),
    );
    copyFileSync(
      join(ROOT, 'shared/blockMaterialSchema.json'),
      join(dir, 'shared/blockMaterialSchema.json'),
    );
    copyFileSync(join(ROOT, 'public/block.png'), join(dir, 'public/block.png'));
    if (material !== null) {
      writeFileSync(join(dir, 'public/block-material.json'), JSON.stringify(material, null, 2));
    }

    try {
      const output = execFileSync(
        process.execPath,
        [join(dir, 'scripts/validate-block-material.mjs')],
        { cwd: dir, encoding: 'utf8', stdio: 'pipe' },
      );
      return { status: 0, output };
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return { status: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function reference(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, 'public/block-material.json'), 'utf8'));
}

describe('validate-block-material.mjs', () => {
  it('passes on the checked-in material', () => {
    const result = runInFixture(reference());
    expect(result.status).toBe(0);
    expect(result.output).toContain('OK');
  });

  it('is wired into prebuild so a broken material cannot ship', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.prebuild).toContain('validate-block-material.mjs');
  });

  it('treats a missing material as "use the reference", not as a failure', () => {
    const result = runInFixture(null);
    expect(result.status).toBe(0);
    expect(result.output).toMatch(/absent/);
  });

  it('fails on a schema violation and names the field', () => {
    const bad = reference();
    (bad.glass as Record<string, number>).fresnelPower = 99;
    const result = runInFixture(bad);
    expect(result.status).toBe(1);
    expect(result.output).toContain('glass.fresnelPower');
  });

  it('fails when a referenced map is missing from public/', () => {
    const bad = reference();
    (bad.maps as Record<string, string>).metalMask = 'not-shipped.png';
    const result = runInFixture(bad);
    expect(result.status).toBe(1);
    expect(result.output).toContain('does not exist');
  });

  it('fails on a non-PNG, non-KTX2 map', () => {
    const bad = reference();
    (bad.maps as Record<string, string>).albedo = 'block.webp';
    const result = runInFixture(bad);
    expect(result.status).toBe(1);
  });

  it('reports the albedo dimensions it validated', () => {
    const header = readPngHeader(readFileSync(join(ROOT, 'public/block.png')));
    const result = runInFixture(reference());
    expect(result.output).toContain(`${header.width}x${header.height}`);
  });
});

describe('PNG reader used by the gate', () => {
  it('decodes the authored atlas', () => {
    const header = readPngHeader(readFileSync(join(ROOT, 'public/block.png')));
    expect(header.width).toBeGreaterThan(0);
    expect(header.bitDepth).toBe(8);
    expect(header.interlace).toBe(0);
  });

  it('rejects a file that is not a PNG', () => {
    expect(() => readPngHeader(Buffer.from('definitely not a png, but long enough to pass length'))).toThrow();
  });
});
