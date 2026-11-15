/**
 * Known WGSL compile failures on `main`, recorded by the first run of the Layer 1 validator.
 *
 * Each one was cross-checked against real Chromium (HeadlessChrome 153, SwiftShader), which
 * rejects the same module with the same message — these are not Dawn-vs-Chrome strictness
 * differences, they are shaders a current browser will not compile.
 *
 * The baseline exists so the gate can be switched on without first changing rendering code
 * (a stated non-goal of the test-infrastructure work). It is deliberately strict in both
 * directions:
 *   - an error that is *not* listed here fails the build (a new break);
 *   - a listed error that no longer occurs also fails the build ("fixed — delete the entry"),
 *     so the list can only shrink.
 * Fixing a shader means deleting its entry here in the same change.
 */

import type { Diagnostic } from './wgslValidate.js';

export interface KnownFailure {
  /** Catalog id. */
  id: string;
  /** Substring of the Tint message. */
  message: string;
  /** Where it is, and the shape of the fix. */
  note: string;
}

export const KNOWN_WGSL_FAILURES: readonly KnownFailure[] = [
  {
    id: 'ts/block.fragment',
    message: "'dpdx' must only be called from uniform control flow",
    note: 'authoredMaterial.wgsl blockTangentBasis(): derivatives are reached from non-uniform control flow in fragmentMain.wgsl; hoist the dpdx/dpdy calls above the divergent branch.',
  },
  {
    id: 'ts/postProcess.fragment',
    message: "cannot assign to 'let dangerOpacity'",
    note: 'postProcess.ts danger vignette: `let dangerOpacity` is later `*=`-assigned; make it `var`.',
  },
  {
    id: 'ts/materialAwarePostProcess.fragment',
    message: "cannot assign to 'let dangerOpacity'",
    note: 'materialAwarePostProcess.ts danger vignette: same `let` -> `var` fix.',
  },
  {
    id: 'ts/enhancedPostProcess.fragment',
    message: "cannot assign to 'let dangerOpacity'",
    note: 'enhancedPostProcess.ts danger vignette: same `let` -> `var` fix (module is exported but not wired to a pipeline).',
  },
  {
    id: 'cpp/authoredBlock',
    message: "'dpdx' must only be called from uniform control flow",
    note: 'pbrCore.wgsl tangentFromUv(), shared with the TS block shader; same hoisting fix as ts/block.fragment.',
  },
  {
    id: 'cpp/postprocess',
    message: "'textureSample' must only be called from uniform control flow",
    note: 'cpp/src/shaders/postprocess/postprocess.wgsl: textureSample after a non-uniform branch; sample before the branch or use textureSampleLevel.',
  },
];

export interface Classified {
  /** Errors not covered by the baseline — these fail the build. */
  unexpected: Diagnostic[];
  /** Errors covered by the baseline. */
  known: Diagnostic[];
  /** Baseline entries for this module that did not occur — these fail the build. */
  stale: KnownFailure[];
}

export function classify(id: string, diagnostics: readonly Diagnostic[], baseline = KNOWN_WGSL_FAILURES): Classified {
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const entries = baseline.filter((b) => b.id === id);
  const known: Diagnostic[] = [];
  const unexpected: Diagnostic[] = [];
  for (const d of errors) {
    (entries.some((b) => d.message.includes(b.message)) ? known : unexpected).push(d);
  }
  const stale = entries.filter((b) => !errors.some((d) => d.message.includes(b.message)));
  return { unexpected, known, stale };
}
