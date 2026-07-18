import type Game from '../game.js';
import type { IView } from '../view/IView.js';
import type { ReplayRecorder } from '../replay/recorder.js';
import type { SubliminalReinforcement } from '../effects/subliminalReinforcement.js';
import type SoundManager from '../sound.js';
import { announceGameOver, announceLevelUp, announceLineClear } from '../a11y/announcer.js';
import {
  updateComboDisplay,
  updateHighScoreDisplay,
  updateModeHud,
} from './hudBridge.js';

export interface ControllerLoopHost {
  isPlaying: boolean;
  isPaused: boolean;
  gameLoopID: number | null;
  game: Game;
  view: IView;
  viewWebGPU: IView;
  soundManager: SoundManager;
  replayRecorder: ReplayRecorder;
  subliminal: SubliminalReinforcement | null;
  lastTime: number;
  lastLevel: number;
  playTimeMs: number;
  gravityTimer: number;
  processBufferedAction(currentTime: number): void;
  handleInput(dt: number): void;
  playScoringAudio(
    result: { linesCleared: number[]; locked: boolean; tSpin: boolean },
    pieceType: string,
    pieceCol: number,
  ): void;
  audioPieceType(): string;
  audioColumn(): number;
  finishReplayRecording(): void;
}

export function stopGameLoop(host: ControllerLoopHost): void {
  if (host.gameLoopID) {
    cancelAnimationFrame(host.gameLoopID);
    host.gameLoopID = null;
  }
}

export function startGameLoop(host: ControllerLoopHost): void {
  const animate = (time: number) => {
    if (!host.isPlaying || host.isPaused) {
      return;
    }

    void runControllerFrame(host, time).then((shouldContinue) => {
      if (shouldContinue) {
        host.gameLoopID = requestAnimationFrame(animate);
      }
    });
  };

  host.gameLoopID = requestAnimationFrame(animate);
}

export function stepGravity(
  game: Game,
  gravityTimer: number,
  dt: number,
): number {
  const level = game.getEffectiveLevel();
  let speedMs = 1000 * Math.pow(0.85, level - 1);
  if (speedMs < 0.5) speedMs = 0.5;

  let timer = gravityTimer || 0;
  timer += dt;

  let steps = 0;
  const maxSteps = 20;
  while (timer > speedMs && steps < maxSteps) {
    game.movePieceDown();
    timer -= speedMs;
    steps++;
  }

  if (steps >= maxSteps) {
    timer = 0;
  }

  return timer;
}

export async function runControllerFrame(
  host: ControllerLoopHost,
  time: number,
): Promise<boolean> {
  if (!host.isPlaying || host.isPaused) {
    return false;
  }

  const dt = time - host.lastTime;
  host.lastTime = time;
  host.replayRecorder.advanceClock(dt);

  if (host.isPlaying && !host.isPaused) {
    host.playTimeMs += dt;
    host.subliminal?.checkBackgroundReinforcement(host.playTimeMs);
    host.game.tickMode(dt);
  }

  host.processBufferedAction(time);
  host.handleInput(dt);
  host.gravityTimer = stepGravity(host.game, host.gravityTimer, dt);

  const lockPieceType = host.audioPieceType();
  const lockPieceCol = host.audioColumn();
  const result = await host.game.updateAsync(dt);

  if (host.game.level > host.lastLevel) {
    host.soundManager.playLevelUp(host.game.level);
    announceLevelUp(host.game.level);
    host.lastLevel = host.game.level;
    host.subliminal?.triggerReinforcement('levelUp', 'strong');
  }

  const pieceType = lockPieceType;
  const pieceCol = lockPieceCol;

  if (result.linesCleared.length > 0) {
    const scoreEvent = host.game.scoreEvent;
    const combo = scoreEvent ? scoreEvent.combo : 0;
    const b2b = scoreEvent ? scoreEvent.backToBack : false;
    const isAllClear = scoreEvent ? scoreEvent.isAllClear : false;

    host.playScoringAudio(result, pieceType, pieceCol);
    host.viewWebGPU.onLineClear?.(result.linesCleared, result.tSpin, combo, b2b, isAllClear);
    announceLineClear(result.linesCleared.length, host.game.score, combo, result.tSpin);

    updateComboDisplay(combo, host.view);

    if (host.subliminal) {
      const intensity = (combo >= 4 || result.tSpin) ? 'strong' : 'normal';
      host.subliminal.triggerReinforcement('lineClear', intensity);
    }
  } else if (result.locked) {
    host.playScoringAudio(result, pieceType, pieceCol);
    host.viewWebGPU.onLock?.(result.tSpin);
    if (host.game.scoringSystem.combo < 0) {
      updateComboDisplay(0, host.view);
    }
    if (result.tSpin && host.subliminal) {
      host.subliminal.triggerReinforcement('tspin', 'strong');
    }
  }

  if (result.gameOver || host.game.victory) {
    host.finishReplayRecording();
    host.soundManager.playGameOver();
    host.isPlaying = false;
    const endState = host.game.getState();
    announceGameOver(endState.score, endState.isVictory);
    host.view.renderEndScreen(endState);
    const isNewHigh = host.game.saveModeLeaderboard();
    updateHighScoreDisplay(host.game);
    if (isNewHigh && host.subliminal) {
      host.subliminal.triggerReinforcement('highScore', 'strong');
    }
    return false;
  }

  const state = host.game.getState();
  updateModeHud(state);
  host.view.renderMainScreen(state);
  host.viewWebGPU.state = state;
  host.viewWebGPU.render(dt / 1000.0);

  return true;
}
