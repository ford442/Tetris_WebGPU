/**
 * Headless two-board versus match with the same attack routing as the LOCAL controller
 * (src/versus/VersusController.ts: clear -> attackRowsFromClear(lines, tSpin) -> opponent.queueGarbage),
 * driven purely by action masks. This is what CPU-vs-CPU and CPU-vs-scripted tests run on.
 *
 * Why not VersusLockstepSim? Its attack routing ignores T-spins (lines only) to stay wire-compatible
 * with online peers; local versus credits T-spins. Both step each board through the shared
 * FrameStepper, so the clocks are the same — only the attack table differs.
 */

import Game from '../game.js';
import { REPLAY_ACTION } from '../replay/actions.js';
import { FrameStepper } from '../replay/frameStepper.js';
import { attackRowsFromClear } from '../versus/garbage.js';
import type { TSpinResult } from '../game/tSpin.js';
import { createGarbageRngFactory } from '../versus/garbageRng.js';

export interface MatchTickResult {
  /** Garbage rows each side queued against the other this tick. */
  sent: [number, number];
}

export class VersusBotMatch {
  readonly games: [Game, Game];
  frame = 0;
  readonly garbageSent: [number, number] = [0, 0];
  readonly steppers: [FrameStepper, FrameStepper];

  constructor(seed: number) {
    this.games = [new Game(), new Game({ wasmBoardId: 1 })];
    for (const g of this.games) {
      g.view = null;
      g.setMode('versus');
    }
    this.steppers = [new FrameStepper(this.games[0]), new FrameStepper(this.games[1])];
    this.reset(seed);
  }

  reset(seed: number): void {
    // Seeded garbage holes (as the lockstep sim does), or two runs of one match would differ.
    const factories = [createGarbageRngFactory(seed, 0), createGarbageRngFactory(seed, 1)] as const;
    this.games[0].setGarbageRngFactory(() => factories[0].nextRng());
    this.games[1].setGarbageRngFactory(() => factories[1].nextRng());
    this.games[0].reset({ seed: seed >>> 0 });
    this.games[1].reset({ seed: (seed + 1) >>> 0 });
    this.frame = 0;
    this.steppers[0].reset();
    this.steppers[1].reset();
    this.garbageSent[0] = 0;
    this.garbageSent[1] = 0;
  }

  get over(): boolean {
    return this.games[0].isRunEnded || this.games[1].isRunEnded;
  }

  /** The side that is still alive when the other has topped out (null while undecided or on a double KO). */
  get winner(): 0 | 1 | null {
    const [a, b] = this.games;
    if (a.isRunEnded && !b.isRunEnded) return 1;
    if (b.isRunEnded && !a.isRunEnded) return 0;
    return null;
  }

  /** One 60 Hz tick for both boards (synchronous; async only for existing callers). */
  tick(masks: readonly [number, number]): Promise<MatchTickResult> {
    const sent: [number, number] = [0, 0];
    for (let i = 0; i < 2; i++) {
      const g = this.games[i as 0 | 1];
      if (g.isRunEnded) continue;
      const mask = masks[i]!;
      const linesBefore = g.lines;
      // T-spin credit only counts if the piece is already resting where it is dropped (see performHardDrop).
      let spin: TSpinResult = 'none';
      if (mask & REPLAY_ACTION.HARD_DROP && g.activPiece && g.activPiece.y === g.getGhostY()) spin = g.isTSpin;

      this.steppers[i as 0 | 1].tick(mask);

      const cleared = g.lines - linesBefore;
      if (cleared > 0) {
        const rows = attackRowsFromClear(cleared, spin);
        if (rows > 0) {
          this.games[(1 - i) as 0 | 1].queueGarbage(rows);
          sent[i]! += rows;
          this.garbageSent[i]! += rows;
        }
      }
    }
    this.frame++;
    return Promise.resolve({ sent });
  }
}
