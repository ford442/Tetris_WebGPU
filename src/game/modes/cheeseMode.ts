import type { GameMode, ModeContext, ModeHudSnapshot, ModeLeaderboardSave } from './types.js';
import { formatMsAsClock } from './types.js';

export const CHEESE_DEFAULT_ROWS = 7;
export const CHEESE_MIN_ROWS = 5;
export const CHEESE_MAX_ROWS = 10;
const CHEESE_FIXED_LEVEL = 1;

let cachedCheeseRows: number | null = null;

export function parseCheeseRowCount(search: string = typeof window !== 'undefined' ? window.location.search : ''): number {
  if (cachedCheeseRows !== null) return cachedCheeseRows;
  try {
    const raw = new URLSearchParams(search).get('cheeseRows');
    if (raw !== null) {
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed)) {
        cachedCheeseRows = Math.max(CHEESE_MIN_ROWS, Math.min(CHEESE_MAX_ROWS, parsed));
        return cachedCheeseRows;
      }
    }
  } catch {
    /* ignore invalid URL */
  }
  cachedCheeseRows = CHEESE_DEFAULT_ROWS;
  return cachedCheeseRows;
}

/** Test helper — reset cached row count from URL. */
export function resetCheeseRowCountCache(): void {
  cachedCheeseRows = null;
}

export const cheeseMode: GameMode = {
  id: 'cheese',
  label: 'Cheese Race',

  onReset(game) {
    game.setFixedScoringLevel(CHEESE_FIXED_LEVEL);
    game.resetElapsedMs();
    game.setPracticeFlags({});
  },

  onBoardReady(game) {
    game.injectCheeseRows(parseCheeseRowCount());
  },

  onLineClear() {},
  onLock() {},
  onTick() {},

  shouldEnd(ctx: ModeContext) {
    if (ctx.garbageCellsRemaining === 0) return 'victory';
    if (ctx.gameOver && !ctx.victory) return 'defeat';
    return 'continue';
  },

  getEffectiveLevel() {
    return CHEESE_FIXED_LEVEL;
  },

  getHud(ctx: ModeContext): ModeHudSnapshot {
    return {
      modeId: 'cheese',
      modeLabel: 'Cheese Race',
      primaryLabel: 'CHEESE LEFT',
      primaryValue: String(ctx.garbageCellsRemaining),
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
    return 'tetris_highscores_cheese';
  },
};
