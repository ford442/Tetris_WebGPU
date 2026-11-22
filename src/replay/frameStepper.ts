/**
 * The one rules step. Live play (src/controller/gameLoop.ts), replay (GameSimulator /
 * ReplayPlayback), online lockstep (VersusLockstepSim), local versus and the headless bot match
 * all advance a `Game` through a `FrameStepper`, so one match is one sequence of 60 Hz frames
 * no matter which driver ran it.
 *
 * A frame is: zero or more `press(mask)` calls (inputs, in order), then one `advance()` (gravity,
 * lock delay, mode clock). Presses may land at any time before the frame's `advance()` — a key
 * event between two rAFs is the same as a press at the start of the next tick, because no rules run
 * in between. Everything here is synchronous CPU/WASM work: no GPU line-clear, no device, no
 * microtask, so a headless tick and a peer's tick produce the same board.
 */

import type Game from '../game.js';
import type { TSpinResult } from '../game/tSpin.js';
import { applyActionMask, REPLAY_ACTION } from './actions.js';
import { REPLAY_TICK_MS } from './format.js';

/** Rules tick length. Every driver advances the rules in quanta of exactly this. */
export const SIM_TICK_MS = REPLAY_TICK_MS;
/** Gravity rows one tick may apply before the remainder is dropped (20G cap). */
export const MAX_GRAVITY_STEPS = 20;
/** Ticks a presentation frame may catch up on before the backlog is discarded. */
export const MAX_CATCHUP_TICKS = 20;

/** Bits applied before / after a hard drop inside one mask (applyActionMask order). */
const PRE_DROP_BITS =
  REPLAY_ACTION.LEFT | REPLAY_ACTION.RIGHT | REPLAY_ACTION.DOWN |
  REPLAY_ACTION.ROTATE_CW | REPLAY_ACTION.ROTATE_CCW;

/** Gravity interval for a level: `1000 * 0.85^(level-1)` ms, floored at 0.5 ms. */
export function gravityIntervalMs(level: number): number {
  const ms = 1000 * Math.pow(0.85, level - 1);
  return ms < 0.5 ? 0.5 : ms;
}

/** Theme colour index (1..7) for a tetromino type, as the hard-drop particles expect. */
export function pieceColorIndex(type: string | undefined): number {
  switch (type) {
    case 'J': return 2;
    case 'L': return 3;
    case 'O': return 4;
    case 'S': return 5;
    case 'T': return 6;
    case 'Z': return 7;
    default: return 1;
  }
}

/** Receives every applied input and every frame boundary (the replay recorder). */
export interface FrameInputSink {
  recordMask(mask: number): void;
  endFrame(): void;
}

/** What a single `press()` did. Reused between calls — copy what you keep. */
export interface PressResult {
  hardDropped: boolean;
  /** Pre-drop column, landing row, rows fallen and colour of a hard drop (presentation). */
  dropX: number;
  dropGhostY: number;
  dropDist: number;
  dropColorIdx: number;
  /** Lock outcome of the hard drop. */
  locked: boolean;
  linesCleared: number[];
  tSpin: TSpinResult;
  gameOver: boolean;
}

/** What `advance()` did (lock-delay lock, if any). Reused between calls. */
export interface AdvanceResult {
  locked: boolean;
  linesCleared: number[];
  tSpin: TSpinResult;
  gameOver: boolean;
}

function clearPress(r: PressResult): void {
  r.hardDropped = false;
  r.dropX = 0;
  r.dropGhostY = 0;
  r.dropDist = 0;
  r.dropColorIdx = 1;
  r.locked = false;
  r.linesCleared.length = 0;
  r.tSpin = 'none';
  r.gameOver = false;
}

export class FrameStepper {
  readonly game: Game;
  /** Frames advanced since `reset()` — the replay frame index of the next `advance()`. */
  frame = 0;
  /** Gravity accumulator (ms). The only gravity integrator in the codebase. */
  gravityMs = 0;
  /** Optional observer of inputs and frame boundaries (ReplayRecorder). */
  sink: FrameInputSink | null = null;

  private readonly pressResult: PressResult = {
    hardDropped: false,
    dropX: 0,
    dropGhostY: 0,
    dropDist: 0,
    dropColorIdx: 1,
    locked: false,
    linesCleared: [],
    tSpin: 'none',
    gameOver: false,
  };

  private readonly idleResult: AdvanceResult = {
    locked: false,
    linesCleared: [],
    tSpin: 'none',
    gameOver: false,
  };

  constructor(game: Game) {
    this.game = game;
  }

  /** Back to frame 0. Call alongside `game.reset()`. */
  reset(): void {
    this.frame = 0;
    this.gravityMs = 0;
  }

  /**
   * Apply one input mask to the current frame. Call any number of times per frame; masks apply
   * in call order and bits within a mask in `applyActionMask` order.
   */
  press(mask: number): PressResult {
    const r = this.pressResult;
    clearPress(r);
    const g = this.game;
    if (mask === 0 || g.isRunEnded) return r;

    this.sink?.recordMask(mask);
    applyActionMask(g, mask & PRE_DROP_BITS);

    if (mask & REPLAY_ACTION.HARD_DROP) {
      const piece = g.activPiece;
      const ghostY = g.getGhostY();
      r.hardDropped = true;
      r.dropX = piece.x;
      r.dropDist = ghostY - piece.y;
      r.dropColorIdx = pieceColorIndex(piece.type);
      const res = g.hardDrop();
      r.dropGhostY = g.lastDropPos?.y ?? ghostY;
      r.locked = res.locked;
      for (let i = 0; i < res.linesCleared.length; i++) r.linesCleared.push(res.linesCleared[i]!);
      r.tSpin = res.tSpin;
      r.gameOver = res.gameOver || g.isRunEnded;
    }

    if (mask & REPLAY_ACTION.HOLD) applyActionMask(g, REPLAY_ACTION.HOLD);
    return r;
  }

  /** Run the rules for the current frame and close it. No-op once the run has ended. */
  advance(): AdvanceResult {
    const g = this.game;
    if (g.isRunEnded) return this.idleResult;

    const interval = gravityIntervalMs(g.getEffectiveLevel());
    this.gravityMs += SIM_TICK_MS;
    let steps = 0;
    while (this.gravityMs > interval && steps < MAX_GRAVITY_STEPS) {
      g.movePieceDown();
      this.gravityMs -= interval;
      steps++;
    }
    if (steps >= MAX_GRAVITY_STEPS) this.gravityMs = 0;

    const result = g.update(SIM_TICK_MS);
    g.tickMode(SIM_TICK_MS);
    this.frame++;
    this.sink?.endFrame();
    return result;
  }

  /** One whole frame: `press(mask)` (when non-zero) then `advance()`. */
  tick(mask = 0): AdvanceResult {
    if (mask !== 0) this.press(mask);
    return this.advance();
  }
}
