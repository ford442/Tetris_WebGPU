import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  ARTIFACT_RELS, BUILD_INFO_REL, EXTRA_SOURCE_RELS, MIRROR_RELS,
  listSourceInputs, verifyProvenance,
} from '../scripts/lib/cppProvenance.mjs';

const ROOT = process.cwd();

describe('committed C++ artifact provenance', () => {
  it('public/cpp/build-info.json is committed (not gitignored) and verifies against the tree', () => {
    const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
    expect(gitignore).not.toMatch(/^public\/cpp\/build-info\.json$/m);

    const { ok, errors } = verifyProvenance(ROOT);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });

  it('was built by the pinned emcc with a real WebGPU port (not Canvas2D-only)', () => {
    const pinned = readFileSync(join(ROOT, '.emsdk-version'), 'utf8').trim();
    const info = JSON.parse(readFileSync(join(ROOT, BUILD_INFO_REL), 'utf8'));
    expect(info.emccVersion).toBe(pinned);
    expect(info.pinnedEmsdkVersion).toBe(pinned);
    expect(info.mode).toBe('release');
    expect(info.webGpuBackendId).toBe('emdawn');
  });

  it('has no timestamp or absolute path, so a rebuild reproduces it byte-for-byte', () => {
    const raw = readFileSync(join(ROOT, BUILD_INFO_REL), 'utf8');
    expect(raw).not.toMatch(/builtAt/);
    expect(raw).not.toMatch(/"(\/|[A-Za-z]:\\)(home|Users|tmp|runner)/);
  });

  it('hashes the shared WGSL exactly as generate-cpp-shaders.mjs embeds it', () => {
    const gen = readFileSync(join(ROOT, 'scripts/generate-cpp-shaders.mjs'), 'utf8');
    const embedded = [...gen.matchAll(/'wgsl', 'block', '([A-Za-z]+\.wgsl)'/g)].map(
      (m) => `src/webgpu/shaders/wgsl/block/${m[1]}`,
    );
    expect(embedded.length).toBeGreaterThan(0);
    for (const rel of embedded) expect(EXTRA_SOURCE_RELS).toContain(rel);
  });

  it('covers the C++ sources and skips derived headers', () => {
    const inputs = listSourceInputs(ROOT);
    expect(inputs).toContain('cpp/src/gpu_renderer.cpp');
    expect(inputs).toContain('cpp/src/shaders/block/authoredBlock.wgsl');
    expect(inputs.some((f) => f.includes('/generated/'))).toBe(false);
  });
});

describe('verifyProvenance detects drift (on a scratch copy of the tree)', () => {
  let scratch: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'cpp-prov-'));
    const rels = [
      ...listSourceInputs(ROOT), BUILD_INFO_REL,
      ...Object.values(ARTIFACT_RELS), ...Object.values(MIRROR_RELS),
    ];
    for (const rel of rels) {
      mkdirSync(dirname(join(scratch, rel)), { recursive: true });
      cpSync(join(ROOT, rel), join(scratch, rel));
    }
  });
  afterEach(() => rmSync(scratch, { recursive: true, force: true }));

  const errorsFor = () => verifyProvenance(scratch).errors.join('\n');

  it('passes on an untouched copy', () => {
    expect(verifyProvenance(scratch).ok).toBe(true);
  });

  it('flags a changed C++ source', () => {
    const f = join(scratch, 'cpp/src/gpu_renderer.cpp');
    writeFileSync(f, `${readFileSync(f, 'utf8')}\n// edit\n`);
    expect(errorsFor()).toMatch(/sourceHash is stale/);
  });

  it('flags a changed block material (compiled into the module)', () => {
    const f = join(scratch, 'public/block-material.json');
    writeFileSync(f, `${readFileSync(f, 'utf8')}\n`);
    expect(errorsFor()).toMatch(/sourceHash is stale/);
  });

  it('flags a wasm that is not the one build-info describes', () => {
    const f = join(scratch, ARTIFACT_RELS.wasm);
    writeFileSync(f, Buffer.concat([readFileSync(f), Buffer.from([0])]));
    expect(errorsFor()).toMatch(/tetris_renderer\.wasm does not match build-info/);
  });

  it('flags a stale build/cpp mirror', () => {
    writeFileSync(join(scratch, MIRROR_RELS.js), '// stale');
    expect(errorsFor()).toMatch(/build\/cpp\/tetris_renderer\.js differs/);
  });

  it('flags an emsdk pin bump that the artifact was not rebuilt for', () => {
    writeFileSync(join(scratch, '.emsdk-version'), '9.9.9\n');
    const errs = errorsFor();
    expect(errs).toMatch(/pins 9\.9\.9/);
  });

  it('flags a Canvas2D-only or debug artifact', () => {
    const f = join(scratch, BUILD_INFO_REL);
    const info = JSON.parse(readFileSync(f, 'utf8'));
    writeFileSync(f, JSON.stringify({ ...info, webGpuBackendId: 'none', mode: 'debug' }));
    const errs = errorsFor();
    expect(errs).toMatch(/webGpuBackendId must be "emdawn"/);
    expect(errs).toMatch(/must be a release build/);
  });

  it('reports a missing build-info as a hard failure', () => {
    rmSync(join(scratch, BUILD_INFO_REL));
    const res = verifyProvenance(scratch);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toMatch(/no provenance/);
  });
});

// A fake `emcc` lets us exercise build-cpp.mjs's failure paths without a toolchain.
// It runs with the real repo root as cwd but exits before writing any artifact.
describe.skipIf(process.platform === 'win32')('scripts/build-cpp.mjs failure modes', () => {
  let bin: string;

  beforeEach(() => {
    bin = mkdtempSync(join(tmpdir(), 'cpp-fake-emcc-'));
  });
  afterEach(() => rmSync(bin, { recursive: true, force: true }));

  function fakeEmcc(body: string) {
    const file = join(bin, 'emcc');
    writeFileSync(file, `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "emcc (fake) 5.0.7"; exit 0; fi\n${body}\n`);
    chmodSync(file, 0o755);
  }

  function runBuild(mode: string, env: Record<string, string> = {}) {
    return spawnSync(process.execPath, ['scripts/build-cpp.mjs', mode], {
      cwd: ROOT,
      encoding: 'utf8',
      // PATH holds only the fake emcc: `node` is invoked by absolute path.
      env: { PATH: bin, HOME: process.env.HOME ?? '', ...env },
    });
  }

  const portMissing = 'echo "emcc: error: unknown port emdawnwebgpu" >&2; exit 1';

  it('release + auto exits non-zero when no WebGPU port links (no silent Canvas2D-only artifact)', () => {
    // Fails the emdawn link; succeeds for anything else — i.e. a Canvas2D-only link
    // WOULD succeed, and must not be attempted.
    fakeEmcc(`case "$*" in *emdawnwebgpu*) ${portMissing};; esac\nexit 0`);
    const before = readFileSync(join(ROOT, BUILD_INFO_REL), 'utf8');

    const res = runBuild('release');

    expect(res.status).not.toBe(0);
    expect(`${res.stdout}${res.stderr}`).toMatch(/no WebGPU port linked/);
    expect(`${res.stdout}${res.stderr}`).toMatch(/TETRIS_CPP_WEBGPU=none/);
    expect(readFileSync(join(ROOT, BUILD_INFO_REL), 'utf8')).toBe(before);
  });

  it('release + emdawn/legacy also refuse the Canvas2D fallback', () => {
    fakeEmcc(`case "$*" in *emdawnwebgpu*|*USE_WEBGPU*) ${portMissing};; esac\nexit 0`);
    for (const mode of ['emdawn', 'legacy']) {
      expect(runBuild('release', { TETRIS_CPP_WEBGPU: mode }).status).not.toBe(0);
    }
  });

  it('a genuine compile error is reported as-is, not masked by a fallback', () => {
    fakeEmcc('echo "gpu_renderer.cpp:1: error: expected ;" >&2; exit 1');
    const res = runBuild('release');
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/expected ;/);
  });

  it('a missing emcc skips by default but fails with TETRIS_CPP_REQUIRE_EMCC=1', () => {
    // `bin` has no emcc at all.
    expect(runBuild('release').status).toBe(0);
    const strict = runBuild('release', { TETRIS_CPP_REQUIRE_EMCC: '1' });
    expect(strict.status).toBe(1);
    expect(strict.stderr).toMatch(/TETRIS_CPP_REQUIRE_EMCC=1/);
  });

  it('the strict paths left the committed artifact untouched', () => {
    expect(existsSync(join(ROOT, ARTIFACT_RELS.wasm))).toBe(true);
    expect(verifyProvenance(ROOT).ok).toBe(true);
  });
});
