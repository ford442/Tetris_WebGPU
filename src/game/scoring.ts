/**
 * Scoring and Line Clearing
 * Handles line clearing logic and score calculation
 */

export class ScoringSystem {
  score: number = 0;
  lines: number = 0;

  get level(): number {
    return Math.floor(this.lines * 0.1);
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

  updateScore(linesCleared: number): void {
    this.score += linesCleared * linesCleared * 10;
    console.log('score = ' + this.score);
  }

  reset(): void {
    this.score = 0;
    this.lines = 0;
  }
}
