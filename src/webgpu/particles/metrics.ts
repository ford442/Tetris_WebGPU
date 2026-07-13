/**
 * Lightweight particle dispatch / emit metrics (no GPU timestamp-query dependency).
 */

export interface ParticleMetricsSnapshot {
  aliveEstimate: number;
  pendingEmits: number;
  lastDispatchMs: number;
  dispatchCount: number;
  skipCount: number;
  droppedEmits: number;
}

export class ParticleMetrics {
  aliveEstimate = 0;
  pendingEmits = 0;
  lastDispatchMs = 0;
  dispatchCount = 0;
  skipCount = 0;
  droppedEmits = 0;

  private _dispatchStart = 0;

  recordEmit(count = 1, life = 0.4): void {
    this.pendingEmits += count;
    this.aliveEstimate = Math.min(
      this.aliveEstimate + count,
      this.aliveEstimate + count,
    );
    // Decay estimate each emit batch (rough upper bound)
    this.aliveEstimate = Math.min(this.aliveEstimate + count, 99999);
    void life;
  }

  recordDropped(count: number): void {
    this.droppedEmits += count;
  }

  beginDispatch(): void {
    this._dispatchStart = performance.now();
  }

  endDispatch(ran: boolean, pendingAfter: number): void {
    if (ran) {
      this.dispatchCount++;
      this.lastDispatchMs = performance.now() - this._dispatchStart;
      this.pendingEmits = pendingAfter;
      // Heuristic decay — alive particles expire over ~1s
      this.aliveEstimate = Math.max(0, Math.floor(this.aliveEstimate * 0.92));
    } else {
      this.skipCount++;
    }
  }

  snapshot(): ParticleMetricsSnapshot {
    return {
      aliveEstimate: this.aliveEstimate,
      pendingEmits: this.pendingEmits,
      lastDispatchMs: this.lastDispatchMs,
      dispatchCount: this.dispatchCount,
      skipCount: this.skipCount,
      droppedEmits: this.droppedEmits,
    };
  }
}
