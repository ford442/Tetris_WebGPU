/**
 * Shared game→view state contracts.
 * Single source for controller, all renderers, and projection helpers.
 */

import type { Piece } from './pieces.js';
import type { ScoreEvent } from './scoring.js';
import type { GameModeId } from './modes/types.js';

/** 10×20 playfield with ghost cells as negative piece color indices. */
export type ProjectedPlayfield = number[][];

/**
 * Snapshot passed from Game.getState() to views each frame.
 * `playfield` includes locked cells, ghost, and active piece projection.
 */
export interface GameState {
  score: number;
  level: number;
  lines: number;
  nextPiece: Piece;
  holdPiece: Piece | null;
  activePiece: Piece;
  isGameOver: boolean;
  isVictory: boolean;
  modeId: GameModeId;
  modeLabel: string;
  modePrimaryLabel: string;
  modePrimaryValue: string;
  modeSecondaryLabel: string;
  modeSecondaryValue: string;
  modeShowSecondary: boolean;
  modeShowLevel: boolean;
  modeHighScoreLabel: string;
  elapsedMs: number;
  playfield: ProjectedPlayfield;
  lockTimer: number;
  lockDelayTime: number;
  effectEvent: string | null;
  effectCounter: number;
  effectFlag?: boolean;
  neonBurstFlag?: boolean;
  lastDropPos: { x: number; y: number } | null;
  lastDropDistance: number;
  scoreEvent: ScoreEvent | null;
  isTSpinReady: boolean;
}

/** Alias emphasizing the playfield projection step (buildPlayfieldProjection). */
export type ProjectedState = GameState;

/** Placeholder state for view init before the first game tick. */
export function createEmptyGameState(): GameState {
  const emptyPiece: Piece = { blocks: [[0]], x: 0, y: 0, rotation: 0, type: 'I' };
  return {
    score: 0,
    level: 1,
    lines: 0,
    nextPiece: emptyPiece,
    holdPiece: null,
    activePiece: emptyPiece,
    isGameOver: false,
    isVictory: false,
    modeId: 'marathon',
    modeLabel: 'Marathon',
    modePrimaryLabel: 'GOAL',
    modePrimaryValue: 'Survive',
    modeSecondaryLabel: 'TIME',
    modeSecondaryValue: '0:00',
    modeShowSecondary: true,
    modeShowLevel: true,
    modeHighScoreLabel: 'HIGH SCORE',
    elapsedMs: 0,
    playfield: Array.from({ length: 20 }, () => Array(10).fill(0)),
    lockTimer: 0,
    lockDelayTime: 500,
    effectEvent: null,
    effectCounter: 0,
    lastDropPos: null,
    lastDropDistance: 0,
    scoreEvent: null,
    isTSpinReady: false,
  };
}
