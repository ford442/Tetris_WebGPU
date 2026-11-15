/**
 * The E2E frame fixture is derived data: `tests/e2e/fixtures/frame.json` must equal what the
 * replay simulator produces. Regenerate with `UPDATE_E2E_FIXTURES=1 npm test -- e2e-frame-fixture`.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildFrameFixture, FRAME_COUNT } from './e2e/frameFixture.js';

const FIXTURE = join(import.meta.dirname, 'e2e', 'fixtures', 'frame.json');

describe('E2E frame fixture', () => {
  const built = buildFrameFixture();

  it('is reproducible: two simulator runs agree', () => {
    expect(buildFrameFixture()).toEqual(built);
  });

  it('describes a board worth drawing', () => {
    expect(built.frames).toBe(FRAME_COUNT);
    const filled = built.playfield.filter((c) => c !== 0).length;
    expect(filled).toBeGreaterThanOrEqual(12); // three settled pieces at least
    expect(built.playfield).toHaveLength(200);
    expect(built.piece.blocks.flat().some((c) => c !== 0)).toBe(true);
  });

  it('matches the committed fixture', () => {
    if (process.env.UPDATE_E2E_FIXTURES === '1') {
      writeFileSync(FIXTURE, JSON.stringify(built, null, 2) + '\n');
    }
    expect(existsSync(FIXTURE), `missing ${FIXTURE} — run with UPDATE_E2E_FIXTURES=1`).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE, 'utf8'))).toEqual(built);
  });
});
