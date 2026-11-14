#!/usr/bin/env node
/**
 * `npm run cpp:lint` — static checks for the hand-written C++ under cpp/src and cpp/tests.
 *
 *   1. clang-format --dry-run --Werror over every hand-written .cpp/.h (generated/ skipped)
 *   2. clang-tidy (.clang-tidy: bugprone, performance, a readability subset; every finding
 *      is an error) over the host-compilable code: the doctest suite and, through it, the
 *      pure headers (piece_state.h, board_metrics.h, math_utils.h, block_sampler.h).
 *
 * Not covered by clang-tidy: the Emscripten translation units (renderer.cpp,
 * gpu_renderer.cpp, playfield_draw.cpp). The emsdk ships no clang-tidy, and a stock
 * clang-tidy cannot parse the emsdk's own (much newer) libc++. Those files get the real
 * compiler's -Wall -Wextra -Wpedantic (-Werror under CI) on every build instead.
 *
 *   --fix        apply clang-format in place instead of checking
 *   --format     only the clang-format step
 *   --tidy       only the clang-tidy step
 *
 * Env: CLANG_FORMAT / CLANG_TIDY override the tool names.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listHandWrittenCpp } from './lib/cppBuildConfig.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NATIVE_BUILD = join(ROOT, 'build', 'cpp-native');
const args = new Set(process.argv.slice(2));
const FIX = args.has('--fix');
const onlyFormat = args.has('--format');
const onlyTidy = args.has('--tidy');

const CLANG_FORMAT = process.env.CLANG_FORMAT || 'clang-format';
const CLANG_TIDY = process.env.CLANG_TIDY || 'clang-tidy';

function run(cmd, cmdArgs, options = {}) {
  return spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...options });
}

function requireTool(cmd) {
  const probe = run(cmd, ['--version']);
  if (probe.error || probe.status !== 0) {
    console.error(`[cpp:lint] ${cmd} not found on PATH (set ${cmd === CLANG_TIDY ? 'CLANG_TIDY' : 'CLANG_FORMAT'} to override).`);
    process.exit(1);
  }
  return (probe.stdout || '').split('\n')[0];
}

function formatStep() {
  const version = requireTool(CLANG_FORMAT);
  const files = listHandWrittenCpp(ROOT).map((f) => relative(ROOT, f));
  console.log(`[cpp:lint] clang-format (${version.trim()}) — ${files.length} files${FIX ? ' (--fix)' : ''}`);
  const flags = FIX ? ['-i'] : ['--dry-run', '--Werror'];
  const res = run(CLANG_FORMAT, [...flags, ...files]);
  if (res.status !== 0) {
    process.stderr.write(res.stderr || res.stdout || '');
    console.error('[cpp:lint] clang-format found differences. Run: npm run cpp:format');
    return false;
  }
  return true;
}

/** (Re)configure + build the native suite so compile_commands.json and the generated header exist. */
function ensureNativeBuild() {
  const configure = run('cmake', ['-S', 'cpp', '-B', NATIVE_BUILD, '-DTETRIS_CPP_NATIVE_TESTS=ON']);
  if (configure.status !== 0) {
    process.stderr.write(configure.stderr || configure.stdout || '');
    console.error('[cpp:lint] cmake configure of the native test build failed (needs cmake + network for doctest on first run).');
    return false;
  }
  const build = run('cmake', ['--build', NATIVE_BUILD]);
  if (build.status !== 0) {
    process.stderr.write(build.stderr || build.stdout || '');
    return false;
  }
  return existsSync(join(NATIVE_BUILD, 'compile_commands.json'));
}

function tidyStep() {
  const version = requireTool(CLANG_TIDY);
  if (!ensureNativeBuild()) return false;
  const files = listHandWrittenCpp(ROOT)
    .filter((f) => f.includes(`${join('cpp', 'tests')}`) && f.endsWith('.cpp'))
    .map((f) => relative(ROOT, f));
  console.log(`[cpp:lint] clang-tidy (${version.split('\n')[0].trim()}) — ${files.length} translation units + the pure headers they include`);
  let ok = true;
  for (const file of files) {
    const res = run(CLANG_TIDY, ['-p', NATIVE_BUILD, '--quiet', file]);
    if (res.status !== 0) {
      ok = false;
      process.stderr.write(res.stdout || '');
      process.stderr.write(res.stderr || '');
    }
  }
  if (!ok) console.error('[cpp:lint] clang-tidy reported findings (see above).');
  return ok;
}

let ok = true;
if (!onlyTidy) ok = formatStep() && ok;
if (!onlyFormat && !FIX) ok = tidyStep() && ok;
if (!ok) process.exit(1);
console.log('[cpp:lint] OK');
