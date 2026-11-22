import type Game from '../game.js';
import type { IView } from '../view/IView.js';
import {
  MAX_CATCHUP_TICKS,
  SIM_TICK_MS,
  type AdvanceResult,
  type FrameStepper,
} from '../replay/frameStepper.js';
import type { TSpinResult } from '../game/tSpin.js';
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
  /** The shared rules step; its sink is the replay recorder. */
  stepper: FrameStepper;
  subliminal: SubliminalReinforcement | null;
  lastTime: number;
  lastLevel: number;
  playTimeMs: number;
  /** Real time (ms) not yet consumed by SIM_TICK_MS rules ticks. */
  simAccumMs: number;
  hitStopFrames: number;
  processBufferedAction(currentTime: number): void;
  handleInput(dt: number): void;
  playScoringAudio(
    result: { linesCleared: number[]; locked: boolean; tSpin: TSpinResult },
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

/**
 * A frame threw: report it instead of letting it escape the rAF callback, and let the caller stop
 * the loop. Same outcome as the old async frame (a rejected promise ended the loop and was reported
 * as unhandled) — one bad render must not take the page's timer queue with it.
 */
export function reportFrameError(err: unknown): void {
  if (typeof reportError === 'function') reportError(err);
  else console.error(err);
}

export function startGameLoop(host: ControllerLoopHost): void {
  const animate = (time: number) => {
    if (!host.isPlaying || host.isPaused) {
      return;
    }
    let keepGoing = false;
    try {
      keepGoing = runControllerFrame(host, time);
    } catch (err) {
      reportFrameError(err);
    }
    if (keepGoing) {
      host.gameLoopID = requestAnimationFrame(animate);
    }
  };

  host.gameLoopID = requestAnimationFrame(animate);
}

export function clampDt(dt: number, maxDt = 100): number {
  return Math.min(dt, maxDt);
}

/** Game over / victory: stop the recorder, show the end screen, save the leaderboard. */
function endRun(host: ControllerLoopHost): false {
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

/** Sound / view / a11y reactions to a tick's lock-delay result. */
function presentAdvance(
  host: ControllerLoopHost,
  result: AdvanceResult,
  pieceType: string,
  pieceCol: number,
  reducedMotion: boolean,
): void {
  if (host.game.level > host.lastLevel) {
    host.soundManager.playLevelUp(host.game.level);
    announceLevelUp(host.game.level);
    host.lastLevel = host.game.level;
    host.subliminal?.triggerReinforcement('levelUp', 'strong');
  }

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
      const intensity = (combo >= 4 || result.tSpin !== 'none') ? 'strong' : 'normal';
      host.subliminal.triggerReinforcement('lineClear', intensity);
    }

    if (result.locked && !reducedMotion) {
      host.hitStopFrames = (host.game.effectEvent === 'hardDrop') ? 2 : 1;
    }
  } else if (result.locked) {
    host.playScoringAudio(result, pieceType, pieceCol);

    const snap = host.game.getHardDropSnapshot?.();
    if (snap && host.viewWebGPU.onLock) {
      host.viewWebGPU.onLock(result.tSpin, snap.blocks, snap.x, host.game.lastDropPos?.y || 0);
    } else {
      host.viewWebGPU.onLock?.(result.tSpin);
    }

    if (!reducedMotion) {
      host.hitStopFrames = (host.game.effectEvent === 'hardDrop') ? 2 : 1;
    }
    if (host.game.scoringSystem.combo < 0) {
      updateComboDisplay(0, host.view);
    }
    if (result.tSpin !== 'none' && host.subliminal) {
      host.subliminal.triggerReinforcement('tspin', 'strong');
    }
  }
}

/**
 * One fixed rules tick of live play: sample input once (buffered retries, DAS/ARR), then the shared
 * FrameStepper.advance(). Every input lands in the same mask stream the recorder stores, so a replay
 * of this run is this run. Returns false to stop draining ticks this frame.
 */
function runLiveTick(host: ControllerLoopHost, time: number, reducedMotion: boolean): boolean {
  host.playTimeMs += SIM_TICK_MS;
  host.subliminal?.checkBackgroundReinforcement(host.playTimeMs);

  host.processBufferedAction(time);
  host.handleInput(SIM_TICK_MS);
  if (host.game.isRunEnded) return false;

  const pieceType = host.audioPieceType();
  const pieceCol = host.audioColumn();
  const result = host.stepper.advance();
  presentAdvance(host, result, pieceType, pieceCol, reducedMotion);

  if (host.game.isRunEnded) return false;
  return reducedMotion || host.hitStopFrames === 0;
}

/**
 * One presentation frame. Rendering (hit-stop, particles, the view) follows the real, clamped `dt`;
 * the rules only move in SIM_TICK_MS ticks. Hit-stop freezes the rules clock (no time accrues), so
 * it pauses the match rather than changing it.
 */
export function runControllerFrame(
  host: ControllerLoopHost,
  time: number,
): boolean {
  if (!host.isPlaying || host.isPaused) {
    return false;
  }

  const dt = clampDt(time - host.lastTime);
  host.lastTime = time;

  // Render unconditionally so that hit-stop flashes and particles continue playing
  host.viewWebGPU.render?.(dt);

  // A hard drop pressed between frames can end the run.
  if (host.game.isRunEnded) return endRun(host);

  // If in hit-stop, freeze the simulation but let animations run
  const reducedMotion = host.viewWebGPU.visualEffects?.reducedMotion ?? false;
  if (!reducedMotion && host.hitStopFrames > 0) {
    host.hitStopFrames--;
    return true; // skip input and state updates this frame
  }

  // Consume real time in SIM_TICK_MS quanta; a backlog past MAX_CATCHUP_TICKS is dropped.
  host.simAccumMs += dt;
  let ticks = 0;
  while (host.simAccumMs >= SIM_TICK_MS && ticks < MAX_CATCHUP_TICKS) {
    host.simAccumMs -= SIM_TICK_MS;
    ticks++;
    if (!runLiveTick(host, time, reducedMotion)) break;
  }
  if (ticks >= MAX_CATCHUP_TICKS && host.simAccumMs >= SIM_TICK_MS) host.simAccumMs = 0;

  if (host.game.isRunEnded) return endRun(host);

  const state = host.game.getState();
  updateModeHud(state);
  host.view.renderMainScreen(state);
  host.viewWebGPU.state = state;
  host.viewWebGPU.render(dt / 1000.0);

  // Clear transient game events after all views have seen them
  host.game.clearEffects();

  return true;
}
