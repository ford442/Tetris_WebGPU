/**
 * Copies the live Game fields into the reused GameState cache (see Game.getState()).
 * Split out of game.ts; field-for-field the same assignments.
 */

import type { Piece } from './pieces.js';
import type { GameState } from './gameState.js';
import type { GameMode, ModeContext } from './modes/types.js';
import type { RunStats } from './runStats.js';
import type { ScoreEvent } from './scoring.js';
import type { TSpinResult } from './tSpin.js';

export interface StateSnapshotHost {
  readonly gameStateCache: GameState;
  score: number;
  level: number;
  lines: number;
  nextPiece: Piece;
  nextQueue: Piece[];
  holdPieceObj: Piece | null;
  activPiece: Piece;
  gameOver: boolean;
  victory: boolean;
  mode: GameMode;
  modeElapsedMs: number;
  pendingGarbageRows: number;
  lockTimer: number;
  lockDelayTime: number;
  effectEvent: string | null;
  effectCounter: number;
  neonHyperInversionFlag: boolean;
  lastDropPos: { x: number; y: number } | null;
  lastDropDistance: number;
  scoreEvent: ScoreEvent | null;
  isTSpin: TSpinResult;
  runStats: RunStats;
  buildModeContext(): ModeContext;
}

export function fillGameStateCache(host: StateSnapshotHost, playfield2D: number[][]): void {
    host.gameStateCache.score = host.score;
    host.gameStateCache.level = host.level;
    host.gameStateCache.lines = host.lines;
    host.gameStateCache.nextPiece = host.nextPiece;
    if (host.gameStateCache.nextQueue.length !== host.nextQueue.length) {
      host.gameStateCache.nextQueue.length = host.nextQueue.length;
    }
    for (let i = 0; i < host.nextQueue.length; i++) {
      host.gameStateCache.nextQueue[i] = host.nextQueue[i]!;
    }
    host.gameStateCache.holdPiece = host.holdPieceObj;
    host.gameStateCache.activePiece = host.activPiece;
    host.gameStateCache.isGameOver = host.gameOver;
    host.gameStateCache.isVictory = host.victory;

    const hud = host.mode.getHud(host.buildModeContext());
    host.gameStateCache.modeId = hud.modeId;
    host.gameStateCache.modeLabel = hud.modeLabel;
    host.gameStateCache.modePrimaryLabel = hud.primaryLabel;
    host.gameStateCache.modePrimaryValue = hud.primaryValue;
    host.gameStateCache.modeSecondaryLabel = hud.secondaryLabel;
    host.gameStateCache.modeSecondaryValue = hud.secondaryValue;
    host.gameStateCache.modeShowSecondary = hud.showSecondary;
    host.gameStateCache.modeShowLevel = hud.showLevel;
    host.gameStateCache.modeShowScore = hud.showScore;
    host.gameStateCache.modeShowHighScore = hud.showHighScore;
    host.gameStateCache.modeHighScoreLabel = hud.highScoreLabel;
    host.gameStateCache.elapsedMs = host.modeElapsedMs;
    host.gameStateCache.pendingGarbageRows = host.pendingGarbageRows;

    host.gameStateCache.playfield = playfield2D;
    host.gameStateCache.lockTimer = host.lockTimer;
    host.gameStateCache.lockDelayTime = host.lockDelayTime;
    host.gameStateCache.effectEvent = host.effectEvent;
    host.gameStateCache.effectCounter = host.effectCounter;
    host.gameStateCache.neonHyperInversionFlag = host.neonHyperInversionFlag;
    host.neonHyperInversionFlag = false; // Reset after sending to view
    host.gameStateCache.lastDropPos = host.lastDropPos;
    host.gameStateCache.lastDropDistance = host.lastDropDistance;
    host.gameStateCache.scoreEvent = host.scoreEvent;
    host.gameStateCache.isTSpinReady = host.activPiece?.type === 'T' ? host.isTSpin : 'none';
    host.gameStateCache.runStats = host.runStats.snapshot(host.modeElapsedMs);
}
