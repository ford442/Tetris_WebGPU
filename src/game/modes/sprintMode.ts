import type { GameMode, ModeContext, ModeHudSnapshot, ModeLeaderboardSave } from './types.js';
import { formatMsAsClock } from './types.js';

export const SPRINT_LINE_GOAL = 40;
const SPRINT_FIXED_LEVEL = 1;

export const sprintMode: GameMode = {
  id: 'sprint',
  label: 'Sprint 40L',

  onReset(game) {
    game.setFixedScoringLevel(SPRINT_FIXED_LEVEL);
    game.resetElapsedMs();
  },

  onLineClear() {},
  onLock() {},
  onTick() {},

  shouldEnd(ctx: ModeContext) {
    if (ctx.lines >= SPRINT_LINE_GOAL) return 'victory';
    if (ctx.gameOver && !ctx.victory) return 'defeat';
    return 'continue';
  },

  getEffectiveLevel() {
    return SPRINT_FIXED_LEVEL;
  },

  getHud(ctx: ModeContext): ModeHudSnapshot {
    const remaining = Math.max(0, SPRINT_LINE_GOAL - ctx.lines);
    return {
      modeId: 'sprint',
      modeLabel: 'Sprint 40L',
      primaryLabel: 'LINES LEFT',
      primaryValue: String(remaining),
      secondaryLabel: 'TIME',
      secondaryValue: formatMsAsClock(ctx.elapsedMs),
      showSecondary: true,
      showLevel: false,
      showScore: true,
      showHighScore: true,
      highScoreLabel: 'BEST TIME',
    };
  },

  shouldSaveLeaderboard(save: ModeLeaderboardSave) {
    return save.victory && save.elapsedMs > 0;
  },

  getLeaderboardMetric() {
    return 'time';
  },

  getLeaderboardValue(save: ModeLeaderboardSave) {
    return save.elapsedMs;
  },

  getLeaderboardStorageKey() {
    return 'tetris_highscores_sprint';
  },
};
