/**
 * The live hard-drop flow split out of controller.ts: press HARD_DROP through the shared
 * FrameStepper (sync lock + clear, recorded like any other input), then the sound / view / a11y
 * reactions to the result. Game over is handled by the frame loop (gameLoop.ts endRun), once.
 */

import type Game from '../game.js';
import type { IView } from '../view/IView.js';
import type SoundManager from '../sound.js';
import type { TSpinResult } from '../game/tSpin.js';
import { announceLineClear } from '../a11y/announcer.js';
import { REPLAY_ACTION } from '../replay/actions.js';
import type { FrameStepper } from '../replay/frameStepper.js';

export interface HardDropHost {
  game: Game;
  viewWebGPU: IView;
  soundManager: SoundManager;
  stepper: FrameStepper;
  audioPieceType(): string;
  audioColumn(): number;
  playScoringAudio(
    result: { linesCleared: number[]; locked: boolean; tSpin: TSpinResult },
    pieceType: string,
    pieceCol: number,
  ): void;
}

export function runHardDrop(host: HardDropHost): void {
  const pieceType = host.audioPieceType();
  const pieceCol = host.audioColumn();

  const result = host.stepper.press(REPLAY_ACTION.HARD_DROP);
  if (!result.hardDropped) return;
  host.soundManager.playHardDrop();

  const snap = host.game.getHardDropSnapshot?.();
  host.viewWebGPU.onHardDrop?.(result.dropX, result.dropGhostY, result.dropDist, result.dropColorIdx, snap?.blocks);

  if (result.linesCleared.length > 0) {
    const scoreEvent = host.game.scoreEvent;
    const combo = scoreEvent ? scoreEvent.combo : 0;
    const b2b = scoreEvent ? scoreEvent.backToBack : false;
    const isAllClear = scoreEvent ? scoreEvent.isAllClear : false;

    host.playScoringAudio(result, pieceType, pieceCol);
    host.viewWebGPU.onLineClear?.(result.linesCleared, result.tSpin, combo, b2b, isAllClear);
    announceLineClear(result.linesCleared.length, host.game.score, combo, result.tSpin);
  } else if (result.locked) {
    host.playScoringAudio(result, pieceType, pieceCol);
    if (snap && host.viewWebGPU.onLock) {
      host.viewWebGPU.onLock(result.tSpin, snap.blocks, result.dropX, result.dropGhostY);
    } else {
      host.viewWebGPU.onLock?.(result.tSpin);
    }
  }
}
