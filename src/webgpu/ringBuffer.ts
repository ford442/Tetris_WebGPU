/**
 * Fixed-capacity ring buffer for numeric samples (no per-push allocations).
 */
export class RingBuffer {
  private readonly data: Float64Array;
  private head = 0;
  private count = 0;

  constructor(private readonly capacity: number) {
    this.data = new Float64Array(capacity);
  }

  push(value: number): void {
    this.data[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  size(): number {
    return this.count;
  }

  /** Arithmetic mean of stored samples (0 when empty). */
  average(): number {
    if (this.count === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.count; i++) {
      sum += this.data[i];
    }
    return sum / this.count;
  }

  /** Exponential moving average over push order (most recent last). */
  ema(alpha: number): number {
    if (this.count === 0) return 0;
    const start = this.count < this.capacity ? 0 : this.head;
    let value = this.data[start];
    for (let i = 1; i < this.count; i++) {
      const idx = (start + i) % this.capacity;
      value = value * (1 - alpha) + this.data[idx] * alpha;
    }
    return value;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}
