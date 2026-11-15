/**
 * The hard-drop flow split out of controller.ts: snapshot, async drop, then the sound / view /
 * leaderboard reactions to the result.
 */

import type Game from '../game.js';
import type { IView } from '../view/IView.js';
import type SoundManager from '../sound.js';
import type { TSpinResult } from '../game/tSpin.js';
import type { SubliminalReinforcement } from '../effects/subliminalReinforcement.js';
import { announceLineClear } from '../a11y/announcer.js';

export interface HardDropHost {
  game: Game;
  viewWebGPU: IView;
  soundManager: SoundManager;
  subliminal: SubliminalReinforcement | null;
  audioPieceType(): string;
  audioColumn(): number;
  playScoringAudio(
    result: { linesCleared: number[]; locked: boolean; tSpin: TSpinResult },
    pieceType: string,
    pieceCol: number,
  ): void;
  updateHighScoreDisplay(): void;
}

export async function runHardDrop(host: HardDropHost): Promise<void> {
      host.game.runStats.recordHardDrop();
      const ghostY = host.game.getGhostY();
      const dropDist = ghostY - host.game.activPiece.y;
      const currentX = host.game.activPiece.x;

      // NEON BRICKLAYER: Get Color Index for visual flair
      // Map piece type to theme color index
      const type = host.game.activPiece.type;
      let colorIdx = 1;
      // Map standard pieces to index 1-7 (I,J,L,O,S,T,Z)
      // This mapping assumes standard order or theme alignment
      if (type === 'I') colorIdx = 1;
      else if (type === 'J') colorIdx = 2;
      else if (type === 'L') colorIdx = 3;
      else if (type === 'O') colorIdx = 4;
      else if (type === 'S') colorIdx = 5;
      else if (type === 'T') colorIdx = 6;
      else if (type === 'Z') colorIdx = 7;

      const pieceType = host.audioPieceType();
      const pieceCol = host.audioColumn();

      const result = await host.game.hardDropAsync();
      host.soundManager.playHardDrop();

      // Prefer the lock coordinate written by performHardDrop (host.lastDropPos).
      // gameStateCache.lastDropPos is the same object after the first getState(),
      // but the host field is updated immediately and does not depend on a cache sync.
      const finalGhostY = host.game.lastDropPos?.y
        ?? host.game.gameStateCache.lastDropPos?.y
        ?? ghostY;

      const snap = host.game.getHardDropSnapshot?.();
      host.viewWebGPU.onHardDrop?.(currentX, finalGhostY, dropDist, colorIdx, snap?.blocks);

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
              host.viewWebGPU.onLock(result.tSpin, snap.blocks, currentX, finalGhostY);
          } else {
              host.viewWebGPU.onLock?.(result.tSpin);
          }
      }
      if (result.gameOver || host.game.victory) {
          host.soundManager.playGameOver();
          // Save leaderboard on run end
          const isNewHigh = host.game.saveModeLeaderboard();
          host.updateHighScoreDisplay();
          if (isNewHigh && host.subliminal) {
            host.subliminal.triggerReinforcement('highScore', 'strong');
          }
      }
}
