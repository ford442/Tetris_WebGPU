/**
 * Compile one catalog entry with Tint (inside Dawn) and report problems as
 * `file:line:col` diagnostics. Shared by `tests/wgsl-compile.test.ts` and
 * `scripts/validate-wgsl.ts` so the CLI and CI say exactly the same thing.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, type ExpectedEntry, type ShaderEntry } from './shaderCatalog.js';

export interface Diagnostic {
  id: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** 1-based line inside the composed module text. */
  line: number;
  col: number;
  /** The offending source line, trimmed. */
  sourceLine: string;
  /** Best-effort repo file + line the text came from (module-relative line is always right). */
  file: string;
  fileLine: number | null;
}

/** `file:line:col — message`, the shape editors and CI annotations understand. */
export function formatDiagnostic(d: Diagnostic): string {
  const where = d.fileLine ? `${d.file}:${d.fileLine}` : d.file;
  return `${where} [${d.id} module ${d.line}:${d.col}] ${d.severity}: ${d.message}${d.sourceLine ? `\n    ${d.sourceLine}` : ''}`;
}

const fileCache = new Map<string, string[]>();
function fileLines(rel: string): string[] {
  let lines = fileCache.get(rel);
  if (!lines) {
    try {
      lines = readFileSync(join(REPO_ROOT, rel), 'utf8').split('\n');
    } catch {
      lines = [];
    }
    fileCache.set(rel, lines);
  }
  return lines;
}

/** Find which repo file (and line) holds `text`; origin first, then the parts. */
function locate(entry: ShaderEntry, text: string): { file: string; line: number | null } {
  const needle = text.trim();
  if (needle) {
    for (const rel of [entry.origin, ...(entry.parts ?? [])]) {
      const idx = fileLines(rel).findIndex((l) => l.trim() === needle);
      if (idx >= 0) return { file: rel, line: idx + 1 };
    }
  }
  return { file: entry.origin, line: null };
}

const STAGE_ATTR: Record<ExpectedEntry['stage'], RegExp> = {
  vertex: /@vertex\b[^{;]*?\bfn\s+(\w+)/g,
  fragment: /@fragment\b[^{;]*?\bfn\s+(\w+)/g,
  compute: /@compute\b[^{;]*?\bfn\s+(\w+)/g,
};

/** Entry points a module declares for a stage (attribute may sit on the line above `fn`). */
export function declaredEntryPoints(code: string, stage: ExpectedEntry['stage']): string[] {
  const names: string[] = [];
  const stripped = code.replace(/\/\/[^\n]*/g, '');
  for (let m = STAGE_ATTR[stage].exec(stripped); m; m = STAGE_ATTR[stage].exec(stripped)) names.push(m[1]);
  return names;
}

/** Dawn-node objects must not be finalized by the GC mid-run (see tests/helpers/dawn.ts). */
const keepAlive: unknown[] = [];

export async function validateEntry(device: GPUDevice, entry: ShaderEntry): Promise<Diagnostic[]> {
  const out: Diagnostic[] = [];
  const lines = entry.code.split('\n');

  const push = (severity: Diagnostic['severity'], message: string, line: number, col: number): void => {
    const sourceLine = line > 0 ? (lines[line - 1] ?? '') : '';
    const where = locate(entry, sourceLine);
    out.push({
      id: entry.id,
      severity,
      message,
      line,
      col,
      sourceLine: sourceLine.trim(),
      file: where.file,
      fileLine: where.line,
    });
  };

  device.pushErrorScope('validation');
  const module = device.createShaderModule({ label: entry.id, code: entry.code });
  keepAlive.push(module);
  const info = await module.getCompilationInfo();
  await device.popErrorScope(); // already reported through compilation messages
  for (const m of info.messages) push(m.type, m.message, m.lineNum, m.linePos);
  const failed = info.messages.some((m) => m.type === 'error');

  // Entry points the pipeline creation site asks for must exist, with the right stage.
  if (!failed) {
    for (const want of entry.expectEntries) {
      if (!declaredEntryPoints(entry.code, want.stage).includes(want.name)) {
        push('error', `missing @${want.stage} entry point "${want.name}" (a pipeline asks for it)`, 0, 0);
      }
    }
    // Compute modules get a real pipeline: catches binding conflicts / limit violations that
    // module compilation alone accepts.
    for (const want of entry.expectEntries.filter((e) => e.stage === 'compute')) {
      device.pushErrorScope('validation');
      device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: want.name } });
      const err = await device.popErrorScope();
      if (err) push('error', `compute pipeline "${want.name}": ${err.message.split('\n')[0]}`, 0, 0);
    }
  }
  return out;
}
