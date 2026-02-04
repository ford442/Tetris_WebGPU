/**
 * Scoring and Line Clearing
 * Handles line clearing logic and score calculation
 */

export interface ScoreEvent {
  points: number;
  text: string; // e.g., "TETRIS", "COMBO x3"
  combo: number;
  backToBack: boolean;
  isAllClear: boolean;
}

export class ScoringSystem {
  score: number = 0;
  lines: number = 0;
  combo: number = -1; // -1 means no combo
  backToBack: boolean = false;

  get level(): number {
    return Math.floor(this.lines / 10) + 1;
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
    }

    return clearedLines;
  }

  // Updates score based on action and returns a ScoreEvent for visuals
  updateScore(linesCleared: number, tSpin: boolean = false, isMini: boolean = false, isAllClear: boolean = false): ScoreEvent | null {
    if (linesCleared === 0 && !tSpin) {
      this.combo = -1;
      return null;
    }

    this.lines += linesCleared;
    this.combo++;

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
            case 0: baseScore = isMini ? 100 * level : 400 * level; text += "T-SPIN"; break;
            case 1: baseScore = isMini ? 200 * level : 800 * level; text += "T-SPIN SINGLE"; break;
            case 2: baseScore = isMini ? 400 * level : 1200 * level; text += "T-SPIN DOUBLE"; break;
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
    console.log(`Score: ${this.score} (${text})`);

    return {
        points: Math.floor(points),
        text: text,
        combo: this.combo,
        backToBack: this.backToBack && isDifficult && b2bMultiplier > 1.0,
        isAllClear: isAllClear
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
}
