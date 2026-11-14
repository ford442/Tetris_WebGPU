#!/usr/bin/env node
/**
 * Size report for the committed C++ renderer artifact (public/cpp/tetris_renderer.{js,wasm}).
 *
 *   node scripts/cpp-size-report.mjs [--base <git-ref>] [--out <dir>]
 *
 * Reads the current artifact from the working tree and, with --base, the same files as
 * committed at <git-ref> (e.g. `origin/main`) — the committed wasm IS the history, so no
 * external store is needed. Writes <out>/size-report.json and <out>/size-report.md
 * (default build/cpp-size/), prints the markdown, and appends it to $GITHUB_STEP_SUMMARY
 * when set. The markdown starts with MARKER so CI can update one sticky PR comment.
 *
 * Informational: it never fails the build. The hard guardrail is the budget in
 * cpp/build.config.json, enforced by scripts/build-cpp.mjs on release builds.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';

import { loadBuildConfig } from './lib/cppBuildConfig.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MARKER = '<!-- cpp-size-report -->';
const WASM_REL = 'public/cpp/tetris_renderer.wasm';
const JS_REL = 'public/cpp/tetris_renderer.js';

/** Raw / gzip -9 / brotli-11 sizes of one buffer. */
export function measureBuffer(buffer) {
  return {
    bytes: buffer.length,
    gzipBytes: gzipSync(buffer, { level: 9 }).length,
    brotliBytes: brotliCompressSync(buffer, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  };
}

function signed(n) {
  return `${n > 0 ? '+' : ''}${n}`;
}

function delta(current, base) {
  if (!base) return '—';
  const diff = current - base;
  if (diff === 0) return '±0';
  const pct = base > 0 ? ` (${signed(Number(((diff / base) * 100).toFixed(2)))}%)` : '';
  return `${signed(diff)} B${pct}`;
}

/**
 * @param {{ wasm: object, js: object }} current  measureBuffer() results
 * @param {{ wasm: object, js: object } | null} base
 * @param {{ budgetBytes: number, baseRef?: string | null, info?: object | null }} meta
 */
export function buildReport(current, base, meta) {
  const rows = [
    ['wasm (raw)', current.wasm.bytes, base?.wasm.bytes],
    ['wasm (gzip)', current.wasm.gzipBytes, base?.wasm.gzipBytes],
    ['wasm (brotli)', current.wasm.brotliBytes, base?.wasm.brotliBytes],
    ['js glue (raw)', current.js.bytes, base?.js.bytes],
    ['js glue (gzip)', current.js.gzipBytes, base?.js.gzipBytes],
  ];
  const headroom = meta.budgetBytes - current.wasm.bytes;
  const lines = [
    MARKER,
    '### C++ renderer size',
    '',
    `| artifact | this PR | ${meta.baseRef ? `\`${meta.baseRef}\`` : 'base'} | Δ |`,
    '| --- | ---: | ---: | ---: |',
    ...rows.map(([name, now, before]) => `| ${name} | ${now} B | ${before ?? '—'}${before ? ' B' : ''} | ${delta(now, before)} |`),
    '',
    `Release wasm budget: ${meta.budgetBytes} B — ${headroom >= 0 ? `${headroom} B headroom` : `**OVER by ${-headroom} B**`}.`,
  ];
  if (!base) lines.push('', '_No baseline available (first build, or the base ref has no committed artifact)._');
  if (meta.info?.emccVersion) lines.push('', `Built with emcc ${meta.info.emccVersion}, ${meta.info.webGpuBackend ?? 'unknown port'}.`);
  return {
    markdown: `${lines.join('\n')}\n`,
    json: {
      wasmBytes: current.wasm.bytes,
      jsBytes: current.js.bytes,
      current,
      base: base ?? null,
      baseRef: meta.baseRef ?? null,
      budgetBytes: meta.budgetBytes,
      wasmDeltaBytes: base ? current.wasm.bytes - base.wasm.bytes : null,
    },
  };
}

function gitShow(ref, rel) {
  try {
    return execFileSync('git', ['show', `${ref}:${rel}`], {
      cwd: ROOT,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function readBase(ref) {
  const wasm = gitShow(ref, WASM_REL);
  const js = gitShow(ref, JS_REL);
  if (!wasm || !js) return null;
  return { wasm: measureBuffer(wasm), js: measureBuffer(js) };
}

function parseArgs(argv) {
  const out = { base: null, outDir: join(ROOT, 'build', 'cpp-size') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') out.base = argv[++i];
    else if (argv[i] === '--out') out.outDir = resolve(ROOT, argv[++i]);
  }
  return out;
}

function main() {
  const { base: baseRef, outDir } = parseArgs(process.argv.slice(2));
  for (const rel of [WASM_REL, JS_REL]) {
    if (!existsSync(join(ROOT, rel))) {
      console.error(`[cpp-size] ${rel} is missing — run npm run cpp:release first.`);
      process.exit(1);
    }
  }
  const current = {
    wasm: measureBuffer(readFileSync(join(ROOT, WASM_REL))),
    js: measureBuffer(readFileSync(join(ROOT, JS_REL))),
  };
  const infoPath = join(ROOT, 'public', 'cpp', 'build-info.json');
  const info = existsSync(infoPath) ? JSON.parse(readFileSync(infoPath, 'utf8')) : null;
  const envBudget = Number.parseInt(process.env.TETRIS_CPP_WASM_BUDGET_BYTES ?? '', 10);
  const budgetBytes = Number.isFinite(envBudget) && envBudget > 0
    ? envBudget
    : loadBuildConfig(ROOT).wasmBudgetBytes;

  const base = baseRef ? readBase(baseRef) : null;
  if (baseRef && !base) console.warn(`[cpp-size] no committed artifact at ${baseRef} — reporting without a baseline.`);
  const report = buildReport(current, base, { budgetBytes, baseRef: base ? baseRef : null, info });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'size-report.json'), `${JSON.stringify(report.json, null, 2)}\n`);
  writeFileSync(join(outDir, 'size-report.md'), report.markdown);
  process.stdout.write(report.markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report.markdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
