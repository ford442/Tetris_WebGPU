#!/usr/bin/env node
/**
 * Embeds cpp/src/shaders/**\/*.wgsl into a generated C++ header so gpu_renderer.cpp
 * never hand-copies a WGSL string — each shader has exactly one real .wgsl file
 * as its source, same as the TS side (Vite `?raw`).
 *
 * Pure Node/fs, no emcc required — safe to run unconditionally from
 * build-cpp.mjs and CMakeLists.txt even when the emsdk toolchain is absent.
 *
 * Output: cpp/src/generated/shader_sources.h (gitignored, regenerated every run).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SHADERS_DIR = join(ROOT, 'cpp', 'src', 'shaders');
const OUT_DIR = join(ROOT, 'cpp', 'src', 'generated');
const OUT_HEADER = join(OUT_DIR, 'shader_sources.h');

function findWgslFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...findWgslFiles(full));
    } else if (entry.endsWith('.wgsl')) {
      out.push(full);
    }
  }
  return out.sort();
}

/** cpp/src/shaders/block/block.wgsl -> kBlockWgsl (basename, not full path — must stay unique). */
function identifierFor(filePath) {
  const base = filePath.split('/').pop().replace(/\.wgsl$/, '');
  const pascal = base
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return `k${pascal}Wgsl`;
}

function toRawStringLiteral(identifier, source) {
  if (source.includes(')WGSL"')) {
    throw new Error(`${identifier}: source contains the ')WGSL"' raw-string delimiter — pick a different one`);
  }
  return `constexpr const char* ${identifier} = R"WGSL(\n${source}\n)WGSL";`;
}

function main() {
  const files = findWgslFiles(SHADERS_DIR);
  const seen = new Map();
  const literals = [];

  for (const file of files) {
    const identifier = identifierFor(file);
    if (seen.has(identifier)) {
      throw new Error(
        `Duplicate generated identifier ${identifier}: ${seen.get(identifier)} and ${file} both produce it.`,
      );
    }
    seen.set(identifier, file);

    const source = readFileSync(file, 'utf8');
    const relPath = relative(ROOT, file);
    literals.push(`// Source: ${relPath}\n${toRawStringLiteral(identifier, source)}`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const header = `#pragma once
// GENERATED FILE — do not edit. Run \`node scripts/generate-cpp-shaders.mjs\`
// (or build via npm run cpp:release / CMake) to regenerate from cpp/src/shaders/**/*.wgsl.

namespace tetris {
namespace shaders {

${literals.join('\n\n')}

} // namespace shaders
} // namespace tetris
`;

  writeFileSync(OUT_HEADER, header);
  console.log(`[generate-cpp-shaders] Wrote ${OUT_HEADER} (${files.length} shader(s))`);
}

main();
