/**
 * Scoring and Line Clearing
 * Handles line clearing logic and score calculation
 */

import { gameLogger } from '../utils/logger.js';

export interface ScoreEvent {
  points: number;
  text: string; // e.g., "TETRIS", "COMBO x3"
  combo: number;
  backToBack: boolean;
  isAllClear: boolean;
  levelUp?: boolean;
}

export interface HighScoreEntry {
  score: number;
  lines: number;
  level: number;
  date: string;
}

/** Compact localStorage representation (minimizes quota usage). */
interface StoredHighScoreEntry {
  s: number;
  l: number;
  v: number;
  d: number;
}

function isQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.code === 22)
  );
}

function normalizeStoredEntry(raw: unknown): HighScoreEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  const score =
    typeof record.score === 'number' ? record.score :
    typeof record.s === 'number' ? record.s : NaN;
  const lines =
    typeof record.lines === 'number' ? record.lines :
    typeof record.l === 'number' ? record.l : NaN;
  const level =
    typeof record.level === 'number' ? record.level :
    typeof record.v === 'number' ? record.v : NaN;

  if (!Number.isFinite(score) || !Number.isFinite(lines) || !Number.isFinite(level)) {
    return null;
  }

  if (score < 0 || lines < 0 || level < 1) return null;

  let date = '';
  if (typeof record.date === 'string' && record.date.length > 0 && record.date.length <= 32) {
    date = record.date;
  } else if (typeof record.d === 'number' && Number.isFinite(record.d)) {
    date = new Date(record.d).toLocaleDateString();
  } else {
    date = new Date().toLocaleDateString();
  }

  return {
    score: Math.floor(score),
    lines: Math.floor(lines),
    level: Math.floor(level),
    date,
  };
}

function toStoredEntry(entry: HighScoreEntry): StoredHighScoreEntry {
  const parsed = Date.parse(entry.date);
  return {
    s: entry.score,
    l: entry.lines,
    v: entry.level,
    d: Number.isFinite(parsed) ? parsed : Date.now(),
  };
}

export class HighScoreManager {
  private readonly STORAGE_KEY = 'tetris_highscores';
  private readonly MAX_ENTRIES = 5;
  private highScores: HighScoreEntry[] = [];
  private lastSerializedPayload: string | null = null;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = typeof window !== 'undefined' && window.localStorage
        ? window.localStorage.getItem(this.STORAGE_KEY)
        : null;
      if (!stored) {
        this.highScores = [];
        return;
      }

      const parsed: unknown = JSON.parse(stored);
      const source = Array.isArray(parsed) ? parsed : [];
      const normalized: HighScoreEntry[] = [];
      for (const item of source) {
        const entry = normalizeStoredEntry(item);
        if (entry) normalized.push(entry);
      }

      normalized.sort((a, b) => b.score - a.score);
      this.highScores = normalized.slice(0, this.MAX_ENTRIES);
      this.lastSerializedPayload = this.serialize(this.highScores);

      // Rewrite bloated/legacy payloads with the compact format.
      if (stored.length > this.lastSerializedPayload.length + 16) {
        this.saveToStorage();
      }
    } catch (e) {
      gameLogger.warn('Failed to load high scores from localStorage:', e);
      this.highScores = [];
      this.lastSerializedPayload = null;
    }
  }

  private serialize(entries: HighScoreEntry[]): string {
    return JSON.stringify(entries.map(toStoredEntry));
  }

  private writePayload(payload: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(this.STORAGE_KEY, payload);
    this.lastSerializedPayload = payload;
  }

  private saveToStorage(): void {
    const payload = this.serialize(this.highScores);
    if (payload === this.lastSerializedPayload) return;

    try {
      this.writePayload(payload);
      return;
    } catch (e) {
      if (!isQuotaExceededError(e)) {
        gameLogger.warn('Failed to save high scores to localStorage:', e);
        return;
      }
    }

    // Quota recovery: drop our key (may be bloated) and retry compact payload.
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(this.STORAGE_KEY);
        this.writePayload(payload);
        gameLogger.warn('High scores recovered after localStorage quota error.');
      }
      return;
    } catch (e) {
      if (!isQuotaExceededError(e)) {
        gameLogger.warn('Failed to save high scores to localStorage:', e);
        return;
      }
    }

    // Last resort: persist only the top score.
    try {
      const minimal = this.serialize(this.highScores.slice(0, 1));
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(this.STORAGE_KEY);
        this.writePayload(minimal);
        this.highScores = this.highScores.slice(0, 1);
        gameLogger.warn('High scores reduced to top entry due to localStorage quota.');
      }
    } catch (e) {
      gameLogger.warn('Failed to save high scores to localStorage:', e);
    }
  }

  addScore(score: number, lines: number, level: number): boolean {
    if (score <= 0) return false;

    const entry: HighScoreEntry = {
      score,
      lines,
      level,
      date: new Date().toLocaleDateString()
    };

    const lowestQualifying =
      this.highScores.length < this.MAX_ENTRIES
        ? -1
        : this.highScores[this.highScores.length - 1].score;

    if (score <= lowestQualifying) return false;

    this.highScores.push(entry);
    this.highScores.sort((a, b) => b.score - a.score);
    this.highScores = this.highScores.slice(0, this.MAX_ENTRIES);
    this.saveToStorage();
    return true;
  }

  getHighScores(): HighScoreEntry[] {
    return [...this.highScores];
  }

  getHighestScore(): HighScoreEntry | null {
    return this.highScores.length > 0 ? this.highScores[0] : null;
  }

  clearScores(): void {
    this.highScores = [];
    this.saveToStorage();
  }
}

export class ScoringSystem {
  score: number = 0;
  lines: number = 0;
  combo: number = -1; // -1 means no combo
  backToBack: boolean = false;
  private highScoreManager: HighScoreManager;
  private highScoreSavedThisGame = false;

  constructor() {
    this.highScoreManager = new HighScoreManager();
  }

  get level(): number {
    return Math.floor(this.lines / 10) + 1;
  }

  getHighScoreManager(): HighScoreManager {
    return this.highScoreManager;
  }

  // Pure logic to clear lines from a 2D array (for fallback/simulation)
  clearLines(playfield: number[][]): number[] {
    let clearedLines: number[] = [];

    for (let y = playfield.length - 1; y >= 0; y--) {
      const line = playfield[y];
      let linesFull = true;

      for (let x = 0; x < line.length; x++) {
        if (line[x] === 0) {
          linesFull = false;
          break;
        }
      }
      
      if (linesFull) {
        clearedLines.unshift(y);
      }
    }

    // Remove cleared lines and add new empty lines at the top
    for (let index = 0; index < clearedLines.length; index++) {
      const element = clearedLines[index];
      playfield.splice(element, 1);
      const arr = new Array(10);
      arr.fill(0);
      playfield.unshift(arr);
      this.lines += 1;
    }

    return clearedLines;
  }

  // Updates score based on action and returns a ScoreEvent for visuals
  updateScore(linesCleared: number, tSpin: boolean = false, isAllClear: boolean = false): ScoreEvent | null {
    if (linesCleared === 0) {
      this.combo = -1;
      return null;
    }

    // Check level before adding lines
    const previousLevel = this.level;

    this.lines += linesCleared;
    this.combo++;

    // Check if level increased
    const levelUp = this.level > previousLevel;

    let baseScore = 0;
    let text = "";
    const level = this.level;
    const isDifficult = tSpin || linesCleared === 4;

    // Back-to-Back check
    let b2bMultiplier = 1.0;
    if (isDifficult) {
        if (this.backToBack) {
            b2bMultiplier = 1.5;
            text += "B2B ";
        }
        this.backToBack = true;
    } else {
        this.backToBack = false;
    }

    // T-Spin Scoring
    if (tSpin) {
        switch (linesCleared) {
            case 0: baseScore = 400 * level; text += "T-SPIN"; break;
            case 1: baseScore = 800 * level; text += "T-SPIN SINGLE"; break;
            case 2: baseScore = 1200 * level; text += "T-SPIN DOUBLE"; break;
            case 3: baseScore = 1600 * level; text += "T-SPIN TRIPLE"; break;
        }
    } else {
        // Standard Scoring
        switch (linesCleared) {
            case 1: baseScore = 100 * level; text = "SINGLE"; break;
            case 2: baseScore = 300 * level; text = "DOUBLE"; break;
            case 3: baseScore = 500 * level; text = "TRIPLE"; break;
            case 4: baseScore = 800 * level; text += "TETRIS"; break;
        }
    }

    // Apply B2B
    let points = baseScore * b2bMultiplier;

    // Combo Multiplier (new)
    const comboMultiplier = 1 + (this.combo * 0.3);  // 1.0 → 1.3 → 1.6 → etc.
    points = Math.floor(points * comboMultiplier);

    // Combo Bonus text (keep for floating score display)
    if (this.combo > 0) {
        text += ` + COMBO x${this.combo} (×${comboMultiplier.toFixed(1)})`;
    }

    // All Clear Bonus
    if (isAllClear) {
        const allClearBonus = 2000 * level;
        points += allClearBonus;
        text += " ALL CLEAR!";
    }

    this.score += Math.floor(points);
    gameLogger.debug(`Score: ${this.score} (${text})`);

    return {
        points: Math.floor(points),
        text: text,
        combo: this.combo,
        backToBack: this.backToBack && isDifficult && b2bMultiplier > 1.0,
        isAllClear: isAllClear,
        levelUp: levelUp
    };
  }

  resetCombo(): void {
      this.combo = -1;
  }

  reset(): void {
    this.score = 0;
    this.lines = 0;
    this.combo = -1;
    this.backToBack = false;
    this.highScoreSavedThisGame = false;
  }

  // Save current score to high scores (once per game)
  saveHighScore(): boolean {
    if (this.highScoreSavedThisGame) return false;
    this.highScoreSavedThisGame = true;
    return this.highScoreManager.addScore(this.score, this.lines, this.level);
  }
}
