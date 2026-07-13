/**
 * Game mode strategy contracts — win/lose rules and HUD without forking core engine logic.
 */

export type GameModeId = 'marathon' | 'sprint' | 'ultra' | 'cheese' | 'zen' | 'versus';

export type ModeEndReason = 'continue' | 'victory' | 'defeat';

export interface ModeContext {
  lines: number;
  score: number;
  level: number;
  elapsedMs: number;
  gameOver: boolean;
  victory: boolean;
}

export interface ModeHudSnapshot {
  modeId: GameModeId;
  modeLabel: string;
  primaryLabel: string;
  primaryValue: string;
  secondaryLabel: string;
  secondaryValue: string;
  showSecondary: boolean;
  showLevel: boolean;
  highScoreLabel: string;
}

export interface ModeLeaderboardSave {
  score: number;
  lines: number;
  level: number;
  elapsedMs: number;
  victory: boolean;
  gameOver: boolean;
}

export interface GameMode {
  readonly id: GameModeId;
  readonly label: string;

  onReset(game: ModeGameHooks): void;
  onLineClear(linesCleared: number, ctx: ModeContext): void;
  onLock(ctx: ModeContext): void;
  onTick(dt: number, ctx: ModeContext): void;

  shouldEnd(ctx: ModeContext): ModeEndReason;
  getEffectiveLevel(lines: number, score: number): number | null;
  getHud(ctx: ModeContext): ModeHudSnapshot;

  shouldSaveLeaderboard(save: ModeLeaderboardSave): boolean;
  getLeaderboardMetric(): 'score' | 'time';
  getLeaderboardValue(save: ModeLeaderboardSave): number;
  getLeaderboardStorageKey(): string;
}

/** Narrow hooks modes use during reset without importing Game. */
export interface ModeGameHooks {
  setFixedScoringLevel(level: number | null): void;
  resetElapsedMs(): void;
}

export function formatMsAsClock(ms: number): string {
  const totalCs = Math.max(0, Math.floor(ms / 10));
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  return `${min}:${sec.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

export function formatCountdown(ms: number): string {
  return formatMsAsClock(Math.max(0, ms));
}
