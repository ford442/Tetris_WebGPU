#!/usr/bin/env node
/**
 * Generates the C++ authored-block uniform struct from the shared contract
 * (shared/authoredBlockUniforms.json) so the WGSL struct and the C++ struct can
 * never drift apart — offset drift between the two sides is a documented footgun.
 *
 * Emits cpp/src/generated/authored_block_uniforms.h containing:
 *   - `struct AuthoredBlockUniforms` with explicit fields in contract order
 *   - `static_assert`s pinning every field offset and the total size
 *   - `kAuthoredBlockUniformsWgsl`, the matching WGSL struct declaration the C++
 *     block shader concatenates, generated from the same field list
 *
 * Pure Node/fs, no emcc required — safe to run unconditionally from
 * build-cpp.mjs and CMakeLists.txt even when the emsdk toolchain is absent.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONTRACT = join(ROOT, 'shared', 'authoredBlockUniforms.json');
const OUT_DIR = join(ROOT, 'cpp', 'src', 'generated');
const OUT_HEADER = join(OUT_DIR, 'authored_block_uniforms.h');

/** WGSL uniform-address-space size/alignment for the types this contract uses. */
const WGSL_TYPES = {
  'f32': { size: 4, align: 4 },
  'vec4<f32>': { size: 16, align: 16 },
  'mat4x4<f32>': { size: 64, align: 16 },
};

/** Validate offsets against WGSL uniform packing so a hand-edited JSON can't lie. */
function validate(contract) {
  let cursor = 0;
  let maxAlign = 4;
  for (const field of contract.fields) {
    const layout = WGSL_TYPES[field.type];
    if (!layout) throw new Error(`${field.name}: unsupported WGSL type ${field.type}`);
    maxAlign = Math.max(maxAlign, layout.align);
    const aligned = Math.ceil(cursor / layout.align) * layout.align;
    if (field.offset !== aligned) {
      throw new Error(
        `${field.name}: offset ${field.offset} but WGSL packing puts it at ${aligned}`,
      );
    }
    cursor = field.offset + layout.size;
  }
  const size = Math.ceil(cursor / maxAlign) * maxAlign;
  if (contract.size !== size) {
    throw new Error(`size ${contract.size} declared but WGSL packing yields ${size}`);
  }
}

function cppField(field) {
  return field.cppCount > 1
    ? `  ${field.cppType} ${field.name}[${field.cppCount}];`
    : `  ${field.cppType} ${field.name};`;
}

function main() {
  const contract = JSON.parse(readFileSync(CONTRACT, 'utf8'));
  validate(contract);

  const name = contract.structName;
  const cppFields = contract.fields.map(cppField).join('\n');
  const asserts = contract.fields
    .map((f) => `static_assert(offsetof(${name}, ${f.name}) == ${f.offset}, "${f.name} offset drifted from shared/authoredBlockUniforms.json");`)
    .join('\n');
  const wgslFields = contract.fields
    .map((f) => `  ${f.name}: ${f.type},`)
    .join('\n');

  const header = `#pragma once
// GENERATED FILE — do not edit. Run \`node scripts/generate-cpp-uniforms.mjs\`
// (or build via npm run cpp:release / CMake) to regenerate from
// shared/authoredBlockUniforms.json — the contract shared with the TS renderer.

#include <stddef.h>

namespace tetris {

struct ${name} {
${cppFields}
};

static_assert(sizeof(${name}) == ${contract.size}, "${name} size drifted from shared/authoredBlockUniforms.json");
${asserts}

// WGSL declaration of the same struct, concatenated into the C++ block shader.
constexpr const char* kAuthoredBlockUniformsWgsl = R"WGSL(
struct ${contract.wgslStruct} {
${wgslFields}
};
)WGSL";

} // namespace tetris
`;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_HEADER, header);
  console.log(`[generate-cpp-uniforms] Wrote ${OUT_HEADER} (${contract.fields.length} field(s), ${contract.size}B)`);
}

main();
