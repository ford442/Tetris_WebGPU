#!/usr/bin/env node
/**
 * Verifies the committed C++ renderer artifact against its committed provenance
 * (public/cpp/build-info.json) and .emsdk-version. Pure Node — no emcc needed — so
 * it runs in the main CI job and in `npm test`.
 *
 *   node scripts/verify-cpp-artifact.mjs
 *
 * Exit 0: artifact is release-built by the pinned emcc with emdawnwebgpu, from the
 * current sources. Exit 1: lists exactly what drifted.
 *
 * The complementary byte-level check (rebuild with the pinned emsdk and diff) lives
 * in .github/workflows/cpp-renderer.yml.
 */

import { verifyProvenance } from './lib/cppProvenance.mjs';

const { ok, errors, info } = verifyProvenance();

if (ok) {
  console.log(
    `[verify-cpp-artifact] ok — emcc ${info.emccVersion}, ${info.webGpuBackend}, ` +
    `wasm ${info.artifacts.wasm.bytes}B, source ${info.sourceHash.slice(0, 12)}…`,
  );
  process.exit(0);
}

console.error('[verify-cpp-artifact] committed C++ renderer artifact is out of date:');
for (const e of errors) console.error(`  - ${e}`);
process.exit(1);
