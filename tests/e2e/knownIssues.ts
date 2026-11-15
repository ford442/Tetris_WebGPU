/**
 * Known-broken behaviour on `main`, recorded by the first E2E run, kept strict in both directions
 * (same contract as `tests/helpers/wgslBaseline.ts`): an unlisted console error fails the run, and a
 * *required* entry that stops occurring fails it too ("fixed — delete the entry").
 */

export type RendererId = 'webgpu' | 'webgl2' | 'webgpu-cpp';

export interface KnownConsoleIssue {
  /** Renderer(s) it occurs on. */
  renderers: readonly RendererId[];
  /** Matched against `console.error` text and uncaught page errors. */
  pattern: RegExp;
  why: string;
  /** Fail when it no longer occurs. False for environmental noise that is allowed to come and go. */
  required: boolean;
}

export const KNOWN_CONSOLE_ISSUES: readonly KnownConsoleIssue[] = [
  {
    renderers: ['webgpu'],
    pattern: /'dpdx' must only be called from uniform control flow/,
    why: 'ts/block.fragment does not compile in Chromium (tests/helpers/wgslBaseline.ts) — block pipeline is invalid',
    required: true,
  },
  {
    renderers: ['webgpu'],
    pattern: /is invalid due to a previous error/,
    why: 'cascade of the block and post-process pipeline failures: every draw using them is a validation error',
    required: true,
  },
  {
    renderers: ['webgpu'],
    pattern: /writeTimestamp.*chromium-experimental-timestamp-query-inside-passes/,
    why: 'gpuPassTimers calls writeTimestamp() on a compute pass; stock Chrome does not enable that feature',
    required: false,
  },
  {
    renderers: ['webgpu', 'webgl2', 'webgpu-cpp'],
    pattern: /Failed to load resource: the server responded with a status of 404/,
    why: 'a browser-initiated asset (favicon) 404s on every load',
    required: false,
  },
  {
    renderers: ['webgpu-cpp'],
    pattern: /Tetris boot failed — WebGPU unavailable/,
    why: 'the C++ renderer fails to init under the production base path / with invalid WGSL (see KNOWN_BROKEN_RENDERERS)',
    required: false,
  },
];

/**
 * Renderers whose board does not draw correctly today. The "board draws its blocks" test (and the
 * C++ boot test) positively assert the renderer is STILL broken, so the moment one is fixed they
 * fail with instructions: delete the entry, generate goldens (`UPDATE_GOLDENS=1 npm run e2e`),
 * and the golden / cross-renderer tests (skipped with this reason until then) become ordinary.
 */
export const KNOWN_BROKEN_RENDERERS: Partial<Record<RendererId, string>> = {
  webgpu:
    'block + post-process WGSL fail to compile in Chromium (see tests/helpers/wgslBaseline.ts): the board draws no blocks',
  'webgpu-cpp':
    'C++ renderer cannot init from the production build (CppRendererLoader ignores the Vite base; authored block WGSL also fails to compile)',
};

export function classifyConsole(
  renderer: RendererId,
  messages: readonly string[],
  known: readonly KnownConsoleIssue[] = KNOWN_CONSOLE_ISSUES,
): { unexpected: string[]; stale: KnownConsoleIssue[] } {
  const applicable = known.filter((k) => k.renderers.includes(renderer));
  const unexpected = messages.filter((m) => !applicable.some((k) => k.pattern.test(m)));
  const stale = applicable.filter((k) => k.required && !messages.some((m) => k.pattern.test(m)));
  return { unexpected, stale };
}
