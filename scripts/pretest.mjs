#!/usr/bin/env node
/**
 * `npm test` prerequisite: rebuild the AssemblyScript collision wasm
 * (public/release.wasm) so tests never run against a stale binary.
 *
 * A failing build fails the test run. `asc` ships as an npm devDependency, so there is
 * no legitimate "toolchain missing" case after `npm ci` — if it fails, something is
 * broken and swallowing that (the old `|| true`) just tests a stale artifact.
 *
 * Documented escape hatch for environments that cannot build (read-only checkout,
 * no node_modules for asc): TETRIS_SKIP_ASBUILD=1 npm test
 *   → skips the rebuild, loudly, and tests run against the committed public/release.wasm.
 *
 * The C++ renderer is deliberately NOT built here (it needs emsdk); its committed
 * artifact is checked by tests/cpp-artifact-provenance.test.ts instead.
 */

import { spawnSync } from 'node:child_process';

if (process.env.TETRIS_SKIP_ASBUILD === '1') {
  console.warn('[pretest] TETRIS_SKIP_ASBUILD=1 — skipping asbuild:release; testing against the committed public/release.wasm.');
  process.exit(0);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['run', 'asbuild:release'], { stdio: 'inherit' });
if (result.status !== 0) {
  console.error('[pretest] asbuild:release failed. Fix the AssemblyScript build, or set TETRIS_SKIP_ASBUILD=1 to test against the committed public/release.wasm.');
  process.exit(result.status ?? 1);
}
