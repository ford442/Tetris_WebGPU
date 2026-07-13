import type { GameMode, ModeContext, ModeHudSnapshot, ModeLeaderboardSave } from './types.js';
import { formatCountdown } from './types.js';

export const ULTRA_DURATION_MS = 120_000;

export const ultraMode: GameMode = {
  id: 'ultra',
  label: 'Ultra 2:00',

  onReset(game) {
    game.setFixedScoringLevel(null);
    game.resetElapsedMs();
  },

  onLineClear() {},
  onLock() {},
  onTick() {},

  shouldEnd(ctx: ModeContext) {
    if (ctx.elapsedMs >= ULTRA_DURATION_MS) return 'victory';
    if (ctx.gameOver && !ctx.victory) return 'defeat';
    return 'continue';
  },

  getEffectiveLevel() {
    return null;
  },

  getHud(ctx: ModeContext): ModeHudSnapshot {
    const remaining = Math.max(0, ULTRA_DURATION_MS - ctx.elapsedMs);
    return {
      modeId: 'ultra',
      modeLabel: 'Ultra 2:00',
      primaryLabel: 'TIME LEFT',
      primaryValue: formatCountdown(remaining),
      secondaryLabel: 'SCORE',
      secondaryValue: ctx.score.toLocaleString(),
      showSecondary: true,
      showLevel: true,
      highScoreLabel: 'BEST SCORE',
    };
  },

  shouldSaveLeaderboard(save: ModeLeaderboardSave) {
    return (save.victory || save.gameOver) && save.score > 0;
  },

  getLeaderboardMetric() {
    return 'score';
  },

  getLeaderboardValue(save: ModeLeaderboardSave) {
    return save.score;
  },

  getLeaderboardStorageKey() {
    return 'tetris_highscores_ultra';
  },
};
