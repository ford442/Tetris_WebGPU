import type { GameMode, ModeContext, ModeHudSnapshot, ModeLeaderboardSave } from './types.js';

export const ZEN_FIXED_LEVEL = 1;

function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}:${rem.toString().padStart(2, '0')}`;
}

export const zenMode: GameMode = {
  id: 'zen',
  label: 'Zen Practice',

  onReset(game) {
    game.setFixedScoringLevel(ZEN_FIXED_LEVEL);
    game.resetElapsedMs();
    game.setPracticeFlags({ infiniteHold: true, topOutRecovery: true });
  },

  onLineClear() {},
  onLock() {},
  onTick() {},

  shouldEnd(_ctx: ModeContext) {
    return 'continue';
  },

  getEffectiveLevel() {
    return ZEN_FIXED_LEVEL;
  },

  getHud(ctx: ModeContext): ModeHudSnapshot {
    return {
      modeId: 'zen',
      modeLabel: 'Zen Practice',
      primaryLabel: 'LINES',
      primaryValue: String(ctx.lines),
      secondaryLabel: 'TIME',
      secondaryValue: formatElapsed(ctx.elapsedMs),
      showSecondary: true,
      showLevel: false,
      showScore: false,
      showHighScore: false,
      highScoreLabel: '',
    };
  },

  shouldSaveLeaderboard(_save: ModeLeaderboardSave) {
    return false;
  },

  getLeaderboardMetric() {
    return 'time';
  },

  getLeaderboardValue(save: ModeLeaderboardSave) {
    return save.elapsedMs;
  },

  getLeaderboardStorageKey() {
    return 'tetris_highscores_zen';
  },
};
