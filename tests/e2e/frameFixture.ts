/**
 * The board every visual E2E frame is drawn from, produced by the replay simulator.
 *
 * "Frame N of a recorded input list" is reproducible because `GameSimulator` is a fixed-step,
 * seeded, view-less re-simulation (it is what replay verification already trusts). This module
 * runs it in Node and flattens the result into `fixtures/frame.json`, which the Playwright specs
 * inject into the page's live `Game`. `tests/e2e-frame-fixture.test.ts` fails if the committed
 * JSON stops matching the simulator, so a change to game rules shows up as a fixture diff, not
 * as a mystery screenshot diff.
 */

import { REPLAY_ACTION } from '../../src/replay/actions.js';
import { GameSimulator } from '../../src/replay/simulator.js';
import type { ReplayInputEvent } from '../../src/replay/format.js';

export const FRAME_SEED = 7;
/** Stop here: the active piece is mid-fall above a few settled pieces. */
export const FRAME_COUNT = 420;

/** Sparse input list: (frame, action mask). Three hard drops, then the fourth piece falls. */
export const FRAME_INPUTS: ReplayInputEvent[] = [
  { frame: 5, mask: REPLAY_ACTION.LEFT },
  { frame: 8, mask: REPLAY_ACTION.LEFT },
  { frame: 12, mask: REPLAY_ACTION.HARD_DROP },
  { frame: 40, mask: REPLAY_ACTION.RIGHT },
  { frame: 44, mask: REPLAY_ACTION.RIGHT },
  { frame: 47, mask: REPLAY_ACTION.ROTATE_CW },
  { frame: 60, mask: REPLAY_ACTION.HARD_DROP },
  { frame: 100, mask: REPLAY_ACTION.ROTATE_CCW },
  { frame: 105, mask: REPLAY_ACTION.RIGHT },
  { frame: 108, mask: REPLAY_ACTION.RIGHT },
  { frame: 111, mask: REPLAY_ACTION.RIGHT },
  { frame: 120, mask: REPLAY_ACTION.HARD_DROP },
  { frame: 200, mask: REPLAY_ACTION.LEFT },
  { frame: 203, mask: REPLAY_ACTION.LEFT },
  { frame: 206, mask: REPLAY_ACTION.LEFT },
  { frame: 215, mask: REPLAY_ACTION.HARD_DROP },
  { frame: 300, mask: REPLAY_ACTION.RIGHT },
];

export interface FrameFixture {
  seed: number;
  frames: number;
  inputs: ReplayInputEvent[];
  /** 10x20 row-major cell values, as `Game.playfield`. */
  playfield: number[];
  piece: { type: string; x: number; y: number; rotation: number; blocks: number[][] };
  score: number;
  lines: number;
}

export function buildFrameFixture(): FrameFixture {
  const sim = new GameSimulator(FRAME_SEED);
  const byFrame = new Map(FRAME_INPUTS.map((e) => [e.frame, e.mask]));
  for (let f = 0; f < FRAME_COUNT && !sim.game.isRunEnded; f++) sim.tick(byFrame.get(f) ?? 0);
  const piece = sim.game.activPiece;
  return {
    seed: FRAME_SEED,
    frames: sim.frame,
    inputs: FRAME_INPUTS,
    playfield: Array.from(sim.game.playfield),
    piece: { type: piece.type, x: piece.x, y: piece.y, rotation: piece.rotation, blocks: piece.blocks.map((r) => [...r]) },
    score: sim.game.score,
    lines: sim.game.lines,
  };
}
