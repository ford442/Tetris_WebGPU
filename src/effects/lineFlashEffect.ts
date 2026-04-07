/**
 * Line Flash Effect
 * Creates screen-space flash effects for cleared lines
 */

export class LineFlashEffect {
  private container: HTMLElement | null = null;
  private flashes: Map<number, HTMLElement> = new Map();

  constructor() {
    this.ensureContainer();
  }

  private ensureContainer(): void {
    if (!this.container) {
      this.container = document.getElementById('line-flash-container');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'line-flash-container';
        this.container.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 50;
          overflow: hidden;
        `;
        document.body.appendChild(this.container);
      }
    }
  }

  flashLine(row: number, totalRows: number, delay: number = 0): void {
    this.ensureContainer();
    if (!this.container) return;

    // Calculate position (Tetris board is 20 rows, centered)
    // Row 0 is at top, Row 19 is at bottom
    const boardHeightPercent = 80; // Board takes ~80% of screen height
    const rowHeightPercent = boardHeightPercent / 20;
    const topOffset = 10 + (row * rowHeightPercent); // 10% top padding

    const flash = document.createElement('div');
    flash.className = 'line-flash';
    flash.style.cssText = `
      position: absolute;
      left: 50%;
      top: ${topOffset}%;
      transform: translateX(-50%) scaleX(0);
      width: 300px;
      height: ${rowHeightPercent * 0.8}vh;
      background: linear-gradient(90deg, 
        transparent 0%, 
        rgba(255, 255, 255, 0.9) 20%, 
        rgba(255, 255, 255, 1) 50%, 
        rgba(255, 255, 255, 0.9) 80%, 
        transparent 100%
      );
      box-shadow: 
        0 0 30px rgba(255, 255, 255, 0.8),
        0 0 60px rgba(255, 255, 255, 0.5),
        0 0 100px rgba(255, 255, 255, 0.3);
      border-radius: 4px;
      opacity: 0;
      animation: lineFlashBurst 0.4s ease-out ${delay}ms forwards;
    `;

    this.container.appendChild(flash);
    this.flashes.set(row, flash);

    // Clean up after animation
    setTimeout(() => {
      flash.remove();
      this.flashes.delete(row);
    }, 400 + delay);
  }

  flashLines(rows: number[]): void {
    rows.forEach((row, index) => {
      this.flashLine(row, rows.length, index * 80);
    });
  }

  clear(): void {
    this.flashes.forEach(flash => flash.remove());
    this.flashes.clear();
  }
}

export const lineFlashEffect = new LineFlashEffect();
export default lineFlashEffect;
