import Game from '../game.js';
import { applyActionMask } from '../replay/actions.js';
import { REPLAY_TICK_MS } from '../replay/format.js';
import { hashPlayfield } from '../replay/boardHash.js';
import { attackRowsFromClear } from './garbage.js';
import { createGarbageRngFactory } from './garbageRng.js';

export interface VersusTickResult {
  frame: number;
  linesCleared0: number;
  linesCleared1: number;
  gameOver0: boolean;
  gameOver1: boolean;
  hash0: number;
  hash1: number;
  locked0: boolean;
  locked1: boolean;
}

function stepGravity(game: Game, gravityTimer: number): number {
  const level = game.getEffectiveLevel();
  let speedMs = 1000 * Math.pow(0.85, level - 1);
  if (speedMs < 0.5) speedMs = 0.5;

  gravityTimer += REPLAY_TICK_MS;
  let steps = 0;
  while (gravityTimer > speedMs && steps < 20 && !game.isRunEnded) {
    game.movePieceDown();
    gravityTimer -= speedMs;
    steps++;
  }
  if (steps >= 20) gravityTimer = 0;
  return gravityTimer;
}

/**
 * Fixed-step dual-board versus simulator for online lockstep.
 * Both peers run identical instances with the same seeds and inputs.
 */
export class VersusLockstepSim {
  readonly g0: Game;
  readonly g1: Game;
  frame = 0;
  private gravityTimer0 = 0;
  private gravityTimer1 = 0;
  private garbageFactory0: ReturnType<typeof createGarbageRngFactory>;
  private garbageFactory1: ReturnType<typeof createGarbageRngFactory>;

  constructor(matchSeed: number) {
    this.g0 = new Game();
    this.g1 = new Game({ wasmBoardId: 1 });
    this.g0.view = null;
    this.g1.view = null;
    this.g0.setMode('versus');
    this.g1.setMode('versus');
    this.garbageFactory0 = createGarbageRngFactory(matchSeed, 0);
    this.garbageFactory1 = createGarbageRngFactory(matchSeed, 1);
    this.reset(matchSeed);
  }

  reset(matchSeed: number): void {
    this.garbageFactory0 = createGarbageRngFactory(matchSeed, 0);
    this.garbageFactory1 = createGarbageRngFactory(matchSeed, 1);
    this.g0.reset({ seed: matchSeed >>> 0 });
    this.g1.reset({ seed: (matchSeed + 1) >>> 0 });
    this.g0.setGarbageRngFactory(() => this.garbageFactory0.nextRng());
    this.g1.setGarbageRngFactory(() => this.garbageFactory1.nextRng());
    this.frame = 0;
    this.gravityTimer0 = 0;
    this.gravityTimer1 = 0;
  }

  private sendAttack(from: 0 | 1, linesCleared: number): void {
    const rows = attackRowsFromClear(linesCleared);
    if (rows > 0) {
      const target = from === 0 ? this.g1 : this.g0;
      target.queueGarbage(rows);
    }
  }

  tick(p0Mask = 0, p1Mask = 0): VersusTickResult {
    const linesBefore0 = this.g0.lines;
    const linesBefore1 = this.g1.lines;

    if (!this.g0.isRunEnded) {
      applyActionMask(this.g0, p0Mask);
      this.gravityTimer0 = stepGravity(this.g0, this.gravityTimer0);
      this.g0.update(REPLAY_TICK_MS);
      this.g0.tickMode(REPLAY_TICK_MS);
    }

    if (!this.g1.isRunEnded) {
      applyActionMask(this.g1, p1Mask);
      this.gravityTimer1 = stepGravity(this.g1, this.gravityTimer1);
      this.g1.update(REPLAY_TICK_MS);
      this.g1.tickMode(REPLAY_TICK_MS);
    }

    const linesCleared0 = this.g0.lines - linesBefore0;
    const linesCleared1 = this.g1.lines - linesBefore1;

    if (linesCleared0 > 0) this.sendAttack(0, linesCleared0);
    if (linesCleared1 > 0) this.sendAttack(1, linesCleared1);

    const result: VersusTickResult = {
      frame: this.frame,
      linesCleared0,
      linesCleared1,
      gameOver0: this.g0.gameOver,
      gameOver1: this.g1.gameOver,
      hash0: hashPlayfield(this.g0.playfield),
      hash1: hashPlayfield(this.g1.playfield),
      locked0: false,
      locked1: false,
    };

    this.frame++;
    return result;
  }

  runFrames(
    inputs: Map<number, { p0: number; p1: number }>,
    maxFrames: number,
  ): VersusTickResult | null {
    let last: VersusTickResult | null = null;
    for (let f = 0; f < maxFrames; f++) {
      const inp = inputs.get(f);
      last = this.tick(inp?.p0 ?? 0, inp?.p1 ?? 0);
      if (last.gameOver0 || last.gameOver1) break;
    }
    return last;
  }

  bothHashes(): { hash0: number; hash1: number } {
    return {
      hash0: hashPlayfield(this.g0.playfield),
      hash1: hashPlayfield(this.g1.playfield),
    };
  }
}
