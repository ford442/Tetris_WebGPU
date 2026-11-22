import Game from '../game.js';
import { FrameStepper } from '../replay/frameStepper.js';
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
  hardDropped0: boolean;
  hardDropped1: boolean;
  hardDropDist0: number;
  hardDropDist1: number;
  hardDropColorIdx0: number;
  hardDropColorIdx1: number;
  hardDropX0: number;
  hardDropX1: number;
  hardDropGhostY0: number;
  hardDropGhostY1: number;
}

/**
 * Fixed-step dual-board versus simulator for online lockstep.
 * Both peers run identical instances with the same seeds and inputs. Each board advances through
 * the shared FrameStepper, so board N of a match is the same frame sequence as a GameSimulator
 * replay of board N's masks (as long as it receives no garbage).
 */
export class VersusLockstepSim {
  readonly g0: Game;
  readonly g1: Game;
  frame = 0;
  readonly stepper0: FrameStepper;
  readonly stepper1: FrameStepper;
  private garbageFactory0: ReturnType<typeof createGarbageRngFactory>;
  private garbageFactory1: ReturnType<typeof createGarbageRngFactory>;

  constructor(matchSeed: number) {
    this.g0 = new Game();
    this.g1 = new Game({ wasmBoardId: 1 });
    this.g0.view = null;
    this.g1.view = null;
    this.g0.setMode('versus');
    this.g1.setMode('versus');
    this.stepper0 = new FrameStepper(this.g0);
    this.stepper1 = new FrameStepper(this.g1);
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
    this.stepper0.reset();
    this.stepper1.reset();
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

    const r0 = this.stepper0.press(p0Mask);
    const hardDropped0 = r0.hardDropped;
    const hardDropX0 = r0.dropX;
    const hardDropGhostY0 = r0.dropGhostY;
    const hardDropDist0 = r0.dropDist;
    const hardDropColorIdx0 = r0.dropColorIdx;
    this.stepper0.advance();

    const r1 = this.stepper1.press(p1Mask);
    const hardDropped1 = r1.hardDropped;
    const hardDropX1 = r1.dropX;
    const hardDropGhostY1 = r1.dropGhostY;
    const hardDropDist1 = r1.dropDist;
    const hardDropColorIdx1 = r1.dropColorIdx;
    this.stepper1.advance();

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
      hardDropped0,
      hardDropped1,
      hardDropDist0,
      hardDropDist1,
      hardDropColorIdx0,
      hardDropColorIdx1,
      hardDropX0,
      hardDropX1,
      hardDropGhostY0,
      hardDropGhostY1,
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
