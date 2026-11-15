/**
 * Visual regression: one deterministic frame per renderer, from a board produced by the replay
 * simulator (tests/e2e/frameFixture.ts).
 *
 *   1. the board draws blocks at all   (golden-free, renderer-agnostic)
 *   2. the frame matches its golden    (pixelmatch; goldens live in tests/e2e/goldens/<renderer>/)
 *   3. renderers agree with each other (TS WebGPU <-> C++ tight, WebGL2 looser)
 *
 * Renderers listed in KNOWN_BROKEN_RENDERERS: check 1 asserts they STILL draw no blocks (so a fix
 * fails loudly and prompts removing the entry); checks 2-3 are skipped with the reason. See knownIssues.ts. Diffs land in test-results/visual/ for the CI artifact.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { captureFrame } from './app.js';
import { KNOWN_BROKEN_RENDERERS, type RendererId } from './knownIssues.js';
import { checkGolden, diffPngs } from './visualDiff.js';

const GOLDENS = join(import.meta.dirname, 'goldens');
const OUT = join(process.cwd(), 'test-results', 'visual');
const UPDATE = process.env.UPDATE_GOLDENS === '1';

const RENDERERS: readonly RendererId[] = ['webgpu', 'webgl2', 'webgpu-cpp'];

/** A board with ~4 pieces on it covers a few percent of the canvas; anything less is "no blocks". */
const MIN_BLOCK_DIFF_RATIO = 0.02;
/** Same renderer, same software rasterizer, same Chromium: only anti-aliasing noise is allowed. */
const GOLDEN_MAX_DIFF_RATIO = 0.002;
/** TS WebGPU vs C++ are the same shaders: near-identical. WebGL2 is a hand-port: looser. */
const TS_VS_CPP_MAX_DIFF_RATIO = 0.01;
const WEBGL2_VS_TS_MAX_DIFF_RATIO = 0.12;

for (const renderer of RENDERERS) {
  const broken = KNOWN_BROKEN_RENDERERS[renderer];

  test.describe(`visual: ${renderer}`, () => {
    test('the board draws its blocks', async ({ context }) => {
      const filled = await captureFrame(context, renderer, 'fixture');

      if (filled === null) {
        // The renderer hard-failed to boot. Only acceptable if that is on record.
        expect(broken, `${renderer} failed to boot and is not listed in KNOWN_BROKEN_RENDERERS`).toBeTruthy();
        return;
      }
      const empty = (await captureFrame(context, renderer, 'empty'))!;
      const { ratio, diffPng } = diffPngs(empty, filled);
      const draws = ratio > MIN_BLOCK_DIFF_RATIO;
      if (draws === !!broken) {
        mkdirSync(OUT, { recursive: true });
        writeFileSync(join(OUT, `${renderer}-blocks-diff.png`), diffPng);
        writeFileSync(join(OUT, `${renderer}-blocks-filled.png`), filled);
        writeFileSync(join(OUT, `${renderer}-blocks-empty.png`), empty);
      }
      const pct = `${(ratio * 100).toFixed(3)}%`;
      if (broken) {
        // Strict flip: this must keep failing until someone fixes the renderer and updates the list.
        expect(
          draws,
          `${renderer} is in KNOWN_BROKEN_RENDERERS (${broken}) but its filled board now differs from an empty one in ${pct} of pixels ` +
            '- it draws blocks. Delete the entry in tests/e2e/knownIssues.ts, then UPDATE_GOLDENS=1 npm run e2e.',
        ).toBe(false);
      } else {
        expect(draws, `filled board differs from the empty board in only ${pct} of pixels - are blocks being drawn?`).toBe(true);
      }
    });

    test('frame matches its golden', async ({ context }) => {
      test.skip(!!broken, `${renderer} is known-broken (tests/e2e/knownIssues.ts): ${broken}`);
      const frame = await captureFrame(context, renderer, 'fixture');
      expect(frame, `${renderer} failed to boot`).not.toBeNull();
      const outcome = checkGolden(frame!, {
        name: `${renderer}-frame`,
        goldenPath: join(GOLDENS, renderer, 'frame.png'),
        outDir: OUT,
        maxDiffRatio: GOLDEN_MAX_DIFF_RATIO,
        update: UPDATE,
      });
      if (outcome.status === 'match' || outcome.status === 'updated') return;
      throw new Error(outcome.message);
    });
  });
}

test.describe('renderers agree', () => {
  test('TS WebGPU and C++ draw the same frame; WebGL2 is close', async ({ context }) => {
    test.skip(
      !!(KNOWN_BROKEN_RENDERERS.webgpu || KNOWN_BROKEN_RENDERERS['webgpu-cpp']),
      'needs both WebGPU renderers working — see KNOWN_BROKEN_RENDERERS in tests/e2e/knownIssues.ts',
    );
    const ts = await captureFrame(context, 'webgpu', 'fixture');
    const cpp = await captureFrame(context, 'webgpu-cpp', 'fixture');
    const gl2 = await captureFrame(context, 'webgl2', 'fixture');
    expect(ts, 'TS WebGPU failed to boot').not.toBeNull();
    expect(cpp, 'C++ renderer failed to boot').not.toBeNull();
    expect(gl2, 'WebGL2 failed to boot').not.toBeNull();

    expect(diffPngs(ts!, cpp!).ratio, 'TS WebGPU vs C++').toBeLessThanOrEqual(TS_VS_CPP_MAX_DIFF_RATIO);
    expect(diffPngs(ts!, gl2!).ratio, 'WebGL2 vs TS WebGPU').toBeLessThanOrEqual(WEBGL2_VS_TS_MAX_DIFF_RATIO);
  });
});
