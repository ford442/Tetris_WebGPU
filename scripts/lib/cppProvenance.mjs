/**
 * Provenance for the committed C++ renderer artifact (public/cpp/tetris_renderer.*).
 *
 * `public/cpp/build-info.json` is written by scripts/build-cpp.mjs and COMMITTED next
 * to the wasm it describes. It records the toolchain, the linked WebGPU port, the
 * flags, a hash of every input that is compiled into the module, and the sha256 of
 * the emitted files. verifyProvenance() re-derives all of that from the working tree
 * with plain Node (no emcc), so it runs in `npm test` and in every CI job.
 *
 * What it can prove without a toolchain: the committed wasm/js are the files the
 * build-info describes, they came from the pinned emcc and a real WebGPU port, and
 * none of the compiled inputs changed since. What it cannot prove is that the bytes
 * are what the pinned emsdk produces today — the cpp-renderer workflow rebuilds and
 * `git diff --exit-code`s for that.
 *
 * No timestamps and no absolute paths go in the file: it must be byte-identical
 * across rebuilds so a rebuild-and-diff check is meaningful.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const BUILD_INFO_SCHEMA_VERSION = 1;
export const BUILD_INFO_REL = 'public/cpp/build-info.json';
export const ARTIFACT_RELS = {
  js: 'public/cpp/tetris_renderer.js',
  wasm: 'public/cpp/tetris_renderer.wasm',
};
/** Tracked mirror copies (build/cpp) that must stay byte-identical to public/cpp. */
export const MIRROR_RELS = {
  js: 'build/cpp/tetris_renderer.js',
  wasm: 'build/cpp/tetris_renderer.wasm',
};

/**
 * Everything compiled into the module, besides cpp/src/** (walked, `generated/` skipped
 * because it is derived from the files below). Keep in sync with the generators:
 *   generate-cpp-shaders.mjs  → SHARED_TS_SHADERS (the three wgsl files)
 *   generate-cpp-uniforms.mjs → shared/authoredBlockUniforms.json
 *   generate-cpp-material.mjs → public/block-material.json + its schema + validator
 * tests/cpp-artifact-provenance.test.ts pins the shader list against the generator.
 */
export const EXTRA_SOURCE_RELS = [
  '.emsdk-version',
  'public/block-material.json',
  'shared/authoredBlockUniforms.json',
  'shared/blockMaterialSchema.json',
  'src/webgpu/shaders/wgsl/block/authoredGlass.wgsl',
  'src/webgpu/shaders/wgsl/block/authoredMaterial.wgsl',
  'src/webgpu/shaders/wgsl/block/pbrCore.wgsl',
  'scripts/build-cpp.mjs',
  'scripts/generate-cpp-material.mjs',
  'scripts/generate-cpp-shaders.mjs',
  'scripts/generate-cpp-uniforms.mjs',
  'scripts/lib/blockMaterialSchema.mjs',
];

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'generated') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
}

/** Sorted, root-relative, forward-slash paths of every hashed source input. */
export function listSourceInputs(root = DEFAULT_ROOT) {
  const files = [];
  walk(join(root, 'cpp', 'src'), files);
  const rels = files.map((f) => relative(root, f).split('\\').join('/'));
  for (const rel of EXTRA_SOURCE_RELS) {
    if (!existsSync(join(root, rel))) {
      throw new Error(`cppProvenance: source input ${rel} is missing — EXTRA_SOURCE_RELS is stale.`);
    }
    rels.push(rel);
  }
  return rels.sort();
}

/** CRLF → LF so a Windows autocrlf checkout hashes like Linux. */
function normalizedBytes(path) {
  const text = readFileSync(path, 'utf8');
  return Buffer.from(text.replace(/\r\n/g, '\n'), 'utf8');
}

export function computeSourceHash(root = DEFAULT_ROOT) {
  const rels = listSourceInputs(root);
  const h = createHash('sha256');
  for (const rel of rels) {
    h.update(`${rel}\0`);
    h.update(createHash('sha256').update(normalizedBytes(join(root, rel))).digest('hex'));
    h.update('\n');
  }
  return { sourceHash: h.digest('hex'), sourceFileCount: rels.length };
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function readPinnedEmsdk(root = DEFAULT_ROOT) {
  const file = join(root, '.emsdk-version');
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8').trim().split('\n')[0].trim() || null;
}

/** Hash + size of the emitted js/wasm, as recorded in build-info.json. */
export function describeArtifacts(root = DEFAULT_ROOT) {
  const out = {};
  for (const [kind, rel] of Object.entries(ARTIFACT_RELS)) {
    const full = join(root, rel);
    out[kind] = { bytes: statSync(full).size, sha256: sha256File(full) };
  }
  return out;
}

/**
 * @returns {{ ok: boolean, errors: string[], info: object | null }}
 */
export function verifyProvenance(root = DEFAULT_ROOT) {
  const errors = [];
  const infoPath = join(root, BUILD_INFO_REL);
  if (!existsSync(infoPath)) {
    return {
      ok: false,
      info: null,
      errors: [`${BUILD_INFO_REL} is missing — the committed C++ artifact has no provenance. Run \`npm run cpp:release\` with the pinned emsdk and commit the result.`],
    };
  }

  let info;
  try {
    info = JSON.parse(readFileSync(infoPath, 'utf8'));
  } catch (err) {
    return { ok: false, info: null, errors: [`${BUILD_INFO_REL} is not valid JSON: ${err.message}`] };
  }

  const pinned = readPinnedEmsdk(root);
  if (info.schemaVersion !== BUILD_INFO_SCHEMA_VERSION) {
    errors.push(`schemaVersion ${JSON.stringify(info.schemaVersion)} != ${BUILD_INFO_SCHEMA_VERSION} (rebuild with the current scripts/build-cpp.mjs)`);
  }
  if (info.mode !== 'release') {
    errors.push(`committed artifact must be a release build, got mode ${JSON.stringify(info.mode)} (a cpp:debug run overwrote it? \`git checkout public/cpp build/cpp\`, then rebuild release)`);
  }
  if (!pinned) {
    errors.push('.emsdk-version is missing or empty');
  } else {
    if (info.emccVersion !== pinned) {
      errors.push(`built with emcc ${JSON.stringify(info.emccVersion)} but .emsdk-version pins ${pinned}`);
    }
    if (info.pinnedEmsdkVersion !== pinned) {
      errors.push(`build-info pinnedEmsdkVersion ${JSON.stringify(info.pinnedEmsdkVersion)} != .emsdk-version ${pinned}`);
    }
  }
  if (info.webGpuBackendId !== 'emdawn') {
    errors.push(`webGpuBackendId must be "emdawn" (a Canvas2D-only module cannot boot), got ${JSON.stringify(info.webGpuBackendId)}`);
  }

  const { sourceHash } = computeSourceHash(root);
  if (info.sourceHash !== sourceHash) {
    errors.push(
      'sourceHash is stale: cpp/src, shared uniforms/material, shared WGSL or the build scripts changed since the committed wasm was built. ' +
      `recorded ${info.sourceHash}, tree ${sourceHash}. Run \`npm run cpp:release\` with emsdk ${pinned ?? '(pinned)'} and commit public/cpp + build/cpp.`,
    );
  }

  for (const [kind, rel] of Object.entries(ARTIFACT_RELS)) {
    const full = join(root, rel);
    if (!existsSync(full)) {
      errors.push(`${rel} is missing`);
      continue;
    }
    const actual = sha256File(full);
    const recorded = info.artifacts?.[kind];
    if (!recorded || recorded.sha256 !== actual) {
      errors.push(`${rel} does not match build-info (sha256 ${actual}, recorded ${recorded?.sha256 ?? 'none'}) — artifact and build-info were not committed together`);
    } else if (recorded.bytes !== statSync(full).size) {
      errors.push(`${rel} size ${statSync(full).size} != recorded ${recorded.bytes}`);
    }
    const mirror = join(root, MIRROR_RELS[kind]);
    if (!existsSync(mirror) || sha256File(mirror) !== actual) {
      errors.push(`${MIRROR_RELS[kind]} differs from ${rel} (build-cpp mirrors both; commit them together)`);
    }
  }

  return { ok: errors.length === 0, errors, info };
}
