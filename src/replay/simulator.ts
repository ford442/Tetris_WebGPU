import Game from '../game.js';
import type { GameModeId } from '../game/modes/types.js';
import {
  decodeInputStream,
  inputEventsToFrames,
  type ReplayFile,
  type ReplayInputEvent,
} from './format.js';
import { hashGameState } from './boardHash.js';
import { FrameStepper, type AdvanceResult } from './frameStepper.js';

const NO_MASKS: readonly number[] = [];

/**
 * Headless replay simulator: a view-less `Game` driven by the shared FrameStepper — the same step
 * live play and the lockstep peer use — so a recorded run re-simulates to the same board.
 */
export class GameSimulator {
  readonly game: Game;
  readonly stepper: FrameStepper;

  constructor(seed: number, modeId: GameModeId = 'marathon') {
    this.game = new Game();
    this.game.view = null;
    this.stepper = new FrameStepper(this.game);
    this.reset(seed, modeId);
  }

  get frame(): number {
    return this.stepper.frame;
  }

  reset(seed: number, modeId: GameModeId = 'marathon'): void {
    if (this.game.modeId !== modeId) {
      this.game.setMode(modeId);
    }
    this.game.reset({ seed });
    this.stepper.reset();
  }

  /** Apply one input mask to the current frame (forwarding a hard drop to the view, if any). */
  press(mask: number): void {
    const r = this.stepper.press(mask);
    const view = this.game.view;
    if (r.hardDropped && view?.onHardDrop) {
      const snap = this.game.getHardDropSnapshot?.();
      view.onHardDrop(r.dropX, r.dropGhostY, r.dropDist, r.dropColorIdx, snap?.blocks);
    }
  }

  /** One frame with a single input mask. */
  tick(actionMask = 0): AdvanceResult {
    if (actionMask !== 0) this.press(actionMask);
    return this.stepper.advance();
  }

  /** One frame with the frame's masks in recorded order (see ReplayRecorder). */
  tickFrame(masks: readonly number[]): AdvanceResult {
    for (let i = 0; i < masks.length; i++) this.press(masks[i]!);
    return this.stepper.advance();
  }

  boardHash(): number {
    return hashGameState(this.game.playfield, this.game.score, this.game.lines);
  }
}

/** Re-simulate `frames` frames of a per-frame input list. */
export function simulateFrames(
  sim: GameSimulator,
  inputs: ReadonlyMap<number, readonly number[]>,
  frames: number,
): GameSimulator {
  for (let f = 0; f < frames && !sim.game.isRunEnded; f++) {
    sim.tickFrame(inputs.get(f) ?? NO_MASKS);
  }
  return sim;
}

export function runSimulation(
  seed: number,
  events: ReplayInputEvent[],
  maxFrames?: number,
  modeId: GameModeId = 'marathon',
): GameSimulator {
  let limit = maxFrames ?? 0;
  if (maxFrames === undefined) {
    for (const e of events) limit = Math.max(limit, e.frame + 1);
  }
  return simulateFrames(new GameSimulator(seed, modeId), inputEventsToFrames(events), limit);
}

export function runReplayFile(file: ReplayFile): GameSimulator {
  const events = decodeInputStream(file.inputs);
  return runSimulation(file.seed, events, file.frames || undefined, file.mode);
}
