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
  // Optional snapshot of block colors (by column) for the cleared row.
  // Used by shard particle burst so shards carry "the color of the block it came from".
  blockColors?: number[]; // length 10, 0 for empty, 1-7 for tetromino color index
}

export class LineClearAnimator {
  private activeEffects: LineClearEffect[] = [];
  private static readonly FLASH_DURATION = 300; // ms
  private static readonly SEQUENCE_DELAY = 100; // ms between lines

  triggerLineClear(rows: number[], onComplete?: () => void, rowColorSnapshots?: number[][]): void {
    const now = performance.now();
    
    rows.forEach((row, index) => {
      const effect: LineClearEffect = {
        row,
        startTime: now + index * LineClearAnimator.SEQUENCE_DELAY,
        duration: LineClearAnimator.FLASH_DURATION,
        progress: 0,
        isComplete: false
      };
      if (rowColorSnapshots && rowColorSnapshots[index]) {
        effect.blockColors = rowColorSnapshots[index];
      }
      this.activeEffects.push(effect);
    });

    // Call completion callback after all animations
    if (onComplete) {
      const totalDuration = rows.length * LineClearAnimator.SEQUENCE_DELAY + LineClearAnimator.FLASH_DURATION;
      setTimeout(onComplete, totalDuration);
    }
  }

  update(_dt: number): void {
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

  /**
   * Helper for the shard particle system: given the just-triggered rows,
   * return a parallel array of color snapshots (or nulls) that can be fed to
   * ParticleSystem.emitLineClearShards so each shard carries authentic block color.
   */
  getColorSnapshotsForRows(rows: number[]): (number[] | null)[] {
    const result: (number[] | null)[] = [];
    for (const row of rows) {
      const match = this.activeEffects.find(e => e.row === row && e.blockColors);
      result.push(match && match.blockColors ? [...match.blockColors] : null);
    }
    return result;
  }
}

// Singleton instance
export const lineClearAnimator = new LineClearAnimator();
export default lineClearAnimator;
