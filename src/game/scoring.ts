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

export class HighScoreManager {
  private readonly STORAGE_KEY = 'tetris_highscores';
  private readonly MAX_ENTRIES = 5;
  private highScores: HighScoreEntry[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = typeof window !== "undefined" && window.localStorage ? window.localStorage.getItem(this.STORAGE_KEY) : null;
      if (stored) {
        this.highScores = JSON.parse(stored);
      }
    } catch (e) {
      gameLogger.warn('Failed to load high scores from localStorage:', e);
      this.highScores = [];
    }
  }

  private saveToStorage(): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) window.localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.highScores));
    } catch (e) {
      gameLogger.warn('Failed to save high scores to localStorage:', e);
    }
  }

  addScore(score: number, lines: number, level: number): boolean {
    const entry: HighScoreEntry = {
      score,
      lines,
      level,
      date: new Date().toLocaleDateString()
    };

    // Check if this score qualifies for top scores
    if (this.highScores.length < this.MAX_ENTRIES || score > this.highScores[this.highScores.length - 1].score) {
      this.highScores.push(entry);
      this.highScores.sort((a, b) => b.score - a.score);
      this.highScores = this.highScores.slice(0, this.MAX_ENTRIES);
      this.saveToStorage();
      return true;
    }
    return false;
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

    // Combo Bonus
    if (this.combo > 0) {
        const comboBonus = 50 * this.combo * level;
        points += comboBonus;
        text += ` + COMBO x${this.combo}`;
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
  }

  // Save current score to high scores
  saveHighScore(): boolean {
    return this.highScoreManager.addScore(this.score, this.lines, this.level);
  }
}
