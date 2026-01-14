/**
 * Scoring and Line Clearing
 * Handles line clearing logic and score calculation
 */

export class ScoringSystem {
  score: number = 0;
  lines: number = 0;
  combo: number = -1;
  backToBack: boolean = false;

  get level(): number {
    return Math.floor(this.lines / 10) + 1;
  }

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

  updateScore(linesCleared: number, tSpin: boolean = false, isMini: boolean = false): void {
    if (linesCleared === 0) {
      this.combo = -1;
      return;
    }

    this.combo++;
    const level = this.level;
    let baseScore = 0;
    let difficult = false;

    if (tSpin) {
      difficult = true;
      if (linesCleared === 1) {
        baseScore = isMini ? 200 : 800;
      } else if (linesCleared === 2) {
        baseScore = isMini ? 400 : 1200; // T-Spin Double
      } else if (linesCleared === 3) {
        baseScore = 1600; // T-Spin Triple
      } else {
        baseScore = isMini ? 100 : 400; // T-Spin No Lines
      }
    } else {
      switch (linesCleared) {
        case 1: baseScore = 100; break;
        case 2: baseScore = 300; break;
        case 3: baseScore = 500; break;
        case 4: baseScore = 800; difficult = true; break;
      }
    }

    // Back-to-Back Bonus
    if (difficult) {
      if (this.backToBack) {
        baseScore = Math.floor(baseScore * 1.5);
        console.log("Back-to-Back!");
      }
      this.backToBack = true;
    } else {
      if (linesCleared > 0) {
          this.backToBack = false;
      }
    }

    let moveScore = baseScore * level;

    // Combo Bonus
    if (this.combo > 0) {
      moveScore += 50 * this.combo * level;
      console.log(`Combo ${this.combo}!`);
    }

    this.lines += linesCleared;
    this.score += moveScore;
    console.log('score = ' + this.score);
  }

  reset(): void {
    this.score = 0;
    this.lines = 0;
    this.combo = -1;
    this.backToBack = false;
  }
}
