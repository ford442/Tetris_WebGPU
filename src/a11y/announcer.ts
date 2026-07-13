/**
 * Screen reader announcements for major game events.
 */

let announcerEl: HTMLElement | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

export function initAnnouncer(elementId = 'game-announcer'): void {
  announcerEl = document.getElementById(elementId);
}

export function announce(message: string, clearAfterMs = 3000): void {
  if (!announcerEl) announcerEl = document.getElementById('game-announcer');
  if (!announcerEl || !message) return;

  announcerEl.textContent = message;

  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    if (announcerEl) announcerEl.textContent = '';
  }, clearAfterMs);
}

export function announceLineClear(
  lineCount: number,
  score: number,
  combo: number,
  tSpin: boolean,
  prefix?: string,
): void {
  const lines =
    lineCount === 1
      ? 'Single'
      : lineCount === 2
        ? 'Double'
        : lineCount === 3
          ? 'Triple'
          : lineCount >= 4
            ? 'Tetris'
            : `${lineCount} lines`;
  const parts = [lines];
  if (tSpin) parts.push('T-Spin');
  if (combo > 1) parts.push(`combo ${combo}`);
  parts.push(`score ${score.toLocaleString()}`);
  const body = parts.join('. ') + '.';
  announce(prefix ? `${prefix}. ${body}` : body);
}

export function announceLevelUp(level: number): void {
  announce(`Level ${level}.`);
}

export function announceGameOver(score: number, victory: boolean): void {
  announce(victory ? `Victory. Score ${score.toLocaleString()}.` : `Game over. Score ${score.toLocaleString()}.`);
}
