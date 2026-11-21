/**
 * A CPU player bolted onto a live `Game`: owns the pilot, a searcher and a path planner, converts real
 * frame time into fixed 60 Hz pilot ticks, and hands each non-zero action mask to a callback. The caller
 * (VersusController) applies the mask however a human's input would be applied, so the CPU goes through
 * exactly the same game methods — sound, effects, garbage routing — as the person on the other keyboard.
 */

import type Game from '../game.js';
import { REPLAY_TICK_MS } from '../replay/format.js';
import { BotPlayer } from './BotPlayer.js';
import { parseBotDifficulty, type BotDifficulty } from './difficulty.js';
import { createBotSnapshot, readGameSnapshot, type BotSnapshot } from './gameSnapshot.js';
import { createBotRuntime, type BotRuntime } from './searchers.js';

/** Never run more than this many pilot ticks for one rendered frame (a tab that was away must not burst). */
const MAX_TICKS_PER_FRAME = 4;

export class CpuOpponent {
  readonly difficulty: BotDifficulty;
  private readonly player: BotPlayer;
  private readonly snap: BotSnapshot = createBotSnapshot();
  private accumMs = 0;

  private constructor(private readonly runtime: BotRuntime, difficulty: BotDifficulty, seed: number) {
    this.difficulty = difficulty;
    this.player = new BotPlayer(runtime.planner, runtime.searcher, difficulty, seed);
  }

  static async create(difficulty: BotDifficulty | string | null | undefined, seed = 1): Promise<CpuOpponent> {
    return CpuOpponent.fromRuntime(await createBotRuntime(), difficulty, seed);
  }

  /** Build around an existing runtime (tests inject stubs; production goes through create()). */
  static fromRuntime(runtime: BotRuntime, difficulty: BotDifficulty | string | null | undefined, seed = 1): CpuOpponent {
    const d = typeof difficulty === 'object' && difficulty ? difficulty : parseBotDifficulty(difficulty);
    return new CpuOpponent(runtime, d, seed);
  }

  get backend(): 'worker' | 'sliced' | 'sync' {
    return this.runtime.backend();
  }

  /** Forget the current piece (new game). */
  reset(seed: number): void {
    this.accumMs = 0;
    this.player.reset(seed);
  }

  /**
   * Advance by `dtMs` of real time; `apply(mask)` is called for every tick that produced an input.
   * Stops early if the mask ended the run.
   */
  advance(dtMs: number, game: Game, apply: (mask: number) => void): void {
    this.accumMs += dtMs;
    let ticks = 0;
    while (this.accumMs >= REPLAY_TICK_MS && ticks < MAX_TICKS_PER_FRAME) {
      this.accumMs -= REPLAY_TICK_MS;
      ticks++;
      const mask = this.player.nextMask(readGameSnapshot(game, this.snap));
      if (mask !== 0) apply(mask);
      if (game.isRunEnded) break;
    }
    if (ticks === MAX_TICKS_PER_FRAME) this.accumMs = 0;
  }

  dispose(): void {
    this.runtime.searcher.dispose();
  }
}
