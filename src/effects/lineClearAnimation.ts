/**
 * Line Clear Animation System
 * Handles visual effects when lines are cleared
 */

export interface LineClearEffect {
  row: number;
  startTime: number;
  duration: number;
  progress: number;
  isComplete: boolean;
}

export class LineClearAnimator {
  private activeEffects: LineClearEffect[] = [];
  private static readonly FLASH_DURATION = 300; // ms
  private static readonly SEQUENCE_DELAY = 100; // ms between lines

  triggerLineClear(rows: number[], onComplete?: () => void): void {
    const now = performance.now();
    
    rows.forEach((row, index) => {
      this.activeEffects.push({
        row,
        startTime: now + index * LineClearAnimator.SEQUENCE_DELAY,
        duration: LineClearAnimator.FLASH_DURATION,
        progress: 0,
        isComplete: false
      });
    });

    // Call completion callback after all animations
    if (onComplete) {
      const totalDuration = rows.length * LineClearAnimator.SEQUENCE_DELAY + LineClearAnimator.FLASH_DURATION;
      setTimeout(onComplete, totalDuration);
    }
  }

  update(dt: number): void {
    const now = performance.now();
    
    this.activeEffects.forEach(effect => {
      if (now < effect.startTime) {
        effect.progress = 0;
        return;
      }
      
      const elapsed = now - effect.startTime;
      effect.progress = Math.min(elapsed / effect.duration, 1);
      effect.isComplete = effect.progress >= 1;
    });

    // Remove completed effects
    this.activeEffects = this.activeEffects.filter(e => !e.isComplete);
  }

  getActiveEffects(): LineClearEffect[] {
    return this.activeEffects;
  }

  isAnimating(): boolean {
    return this.activeEffects.length > 0;
  }

  clear(): void {
    this.activeEffects = [];
  }
}

// Singleton instance
export const lineClearAnimator = new LineClearAnimator();
export default lineClearAnimator;
