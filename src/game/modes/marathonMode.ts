import type { GameMode, ModeContext, ModeHudSnapshot, ModeLeaderboardSave } from './types.js';

export const marathonMode: GameMode = {
  id: 'marathon',
  label: 'Marathon',

  onReset(game) {
    game.setFixedScoringLevel(null);
    game.resetElapsedMs();
  },

  onLineClear() {},
  onLock() {},
  onTick() {},

  shouldEnd(ctx: ModeContext) {
    if (ctx.gameOver && !ctx.victory) return 'defeat';
    return 'continue';
  },

  getEffectiveLevel() {
    return null;
  },

  getHud(ctx: ModeContext): ModeHudSnapshot {
    return {
      modeId: 'marathon',
      modeLabel: 'Marathon',
      primaryLabel: 'GOAL',
      primaryValue: 'Survive',
      secondaryLabel: 'TIME',
      secondaryValue: formatElapsed(ctx.elapsedMs),
      showSecondary: true,
      showLevel: true,
      showScore: true,
      showHighScore: true,
      highScoreLabel: 'HIGH SCORE',
    };
  },

  shouldSaveLeaderboard(save: ModeLeaderboardSave) {
    return save.gameOver && !save.victory && save.score > 0;
  },

  getLeaderboardMetric() {
    return 'score';
  },

  getLeaderboardValue(save: ModeLeaderboardSave) {
    return save.score;
  },

  getLeaderboardStorageKey() {
    return 'tetris_highscores_marathon';
  },
};

function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}:${rem.toString().padStart(2, '0')}`;
}
