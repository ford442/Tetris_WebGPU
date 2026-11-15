/**
 * Persists a finished run to the mode's leaderboard (and the legacy marathon high-score).
 * Split out of game.ts.
 */

import type { GameMode } from './modes/types.js';
import type { ScoringSystem } from './scoring.js';
import { getModeLeaderboard } from './modeLeaderboard.js';

export interface LeaderboardSaveHost {
  score: number;
  lines: number;
  level: number;
  modeElapsedMs: number;
  victory: boolean;
  gameOver: boolean;
  mode: GameMode;
  scoringSystem: ScoringSystem;
}

/** @returns true when the run set a new best for the mode. */
export function saveModeLeaderboard(host: LeaderboardSaveHost): boolean {
    const save = {
      score: host.score,
      lines: host.lines,
      level: host.level,
      elapsedMs: host.modeElapsedMs,
      victory: host.victory,
      gameOver: host.gameOver,
    };

    if (!host.mode.shouldSaveLeaderboard(save)) {
      return false;
    }

    const board = getModeLeaderboard(host.mode);
    const metricValue = host.mode.getLeaderboardValue(save);
    const isNewBest = board.addEntry(metricValue, save.lines, save.level);

    if (host.mode.id === 'marathon') {
      host.scoringSystem.saveHighScore();
    }

    return isNewBest;
}
