import type { GameMode, ModeContext, ModeEndReason, ModeHudSnapshot, ModeLeaderboardSave } from './types.js';
import type { ModeGameHooks } from './types.js';

export const versusMode: GameMode = {
  id: 'versus',
  label: 'Local 2P',

  onReset(game: ModeGameHooks) {
    game.setFixedScoringLevel(5);
    game.resetElapsedMs();
  },

  onLineClear() {
    /* Attack handled by VersusController. */
  },

  onLock() {},

  onTick(dt: number, ctx: ModeContext) {
    ctx.elapsedMs += dt;
  },

  shouldEnd(ctx: ModeContext): ModeEndReason {
    if (ctx.gameOver) return 'defeat';
    return 'continue';
  },

  getEffectiveLevel() {
    return 5;
  },

  getHud(ctx: ModeContext): ModeHudSnapshot {
    return {
      modeId: 'versus',
      modeLabel: 'Local 2P',
      primaryLabel: 'ATTACK',
      primaryValue: 'Clear lines',
      secondaryLabel: 'TIME',
      secondaryValue: formatClock(ctx.elapsedMs),
      showSecondary: true,
      showLevel: false,
      showScore: true,
      showHighScore: true,
      highScoreLabel: 'WINS',
    };
  },

  shouldSaveLeaderboard() {
    return false;
  },

  getLeaderboardMetric() {
    return 'score' as const;
  },

  getLeaderboardValue(save: ModeLeaderboardSave) {
    return save.score;
  },

  getLeaderboardStorageKey() {
    return 'tetris_versus_wins';
  },
};

function formatClock(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
