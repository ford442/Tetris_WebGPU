import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MARKER, buildReport, measureBuffer } from '../scripts/cpp-size-report.mjs';

const ROOT = join(__dirname, '..');

const sized = (wasm: number, js: number) => ({
  wasm: { bytes: wasm, gzipBytes: Math.floor(wasm / 2), brotliBytes: Math.floor(wasm / 3) },
  js: { bytes: js, gzipBytes: Math.floor(js / 3), brotliBytes: Math.floor(js / 4) },
});

describe('cpp size report', () => {
  it('measures raw, gzip and brotli sizes', () => {
    const buf = Buffer.alloc(4096, 7);
    const m = measureBuffer(buf);
    expect(m.bytes).toBe(4096);
    expect(m.gzipBytes).toBeLessThan(m.bytes);
    expect(m.brotliBytes).toBeLessThan(m.bytes);
  });

  it('reports the wasm delta against the base ref and starts with the sticky-comment marker', () => {
    const r = buildReport(sized(55000, 51000), sized(59852, 52771), {
      budgetBytes: 262144,
      baseRef: 'origin/main',
    });
    expect(r.markdown.startsWith(MARKER)).toBe(true);
    expect(r.markdown).toContain('| wasm (raw) | 55000 B | 59852 B | -4852 B (-8.11%) |');
    expect(r.markdown).toContain('207144 B headroom');
    expect(r.json.wasmDeltaBytes).toBe(-4852);
    expect(r.json.baseRef).toBe('origin/main');
  });

  it('marks growth with a plus sign and flags a blown budget', () => {
    const r = buildReport(sized(300000, 51000), sized(250000, 51000), { budgetBytes: 262144, baseRef: 'main' });
    expect(r.markdown).toContain('+50000 B (+20%)');
    expect(r.markdown).toContain('**OVER by 37856 B**');
  });

  it('says so when there is no baseline', () => {
    const r = buildReport(sized(55000, 51000), null, { budgetBytes: 262144 });
    expect(r.markdown).toContain('No baseline available');
    expect(r.json.wasmDeltaBytes).toBeNull();
  });

  it('runs end to end on the committed artifact and writes json + markdown', () => {
    const out = mkdtempSync(join(tmpdir(), 'cpp-size-'));
    try {
      execFileSync(process.execPath, [join(ROOT, 'scripts/cpp-size-report.mjs'), '--out', out], {
        cwd: ROOT,
        stdio: 'pipe',
      });
      const json = JSON.parse(readFileSync(join(out, 'size-report.json'), 'utf8'));
      const info = JSON.parse(readFileSync(join(ROOT, 'public/cpp/build-info.json'), 'utf8'));
      expect(json.wasmBytes).toBe(info.wasmBytes);
      expect(readFileSync(join(out, 'size-report.md'), 'utf8')).toContain(MARKER);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
