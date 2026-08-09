import { describe, it, expect } from 'vitest';
import { RingBuffer } from '../src/webgpu/ringBuffer.js';

describe('RingBuffer', () => {
  it('computes average over capacity', () => {
    const buf = new RingBuffer(4);
    buf.push(10);
    buf.push(20);
    buf.push(30);
    expect(buf.average()).toBe(20);
  });

  it('overwrites oldest samples at capacity', () => {
    const buf = new RingBuffer(2);
    buf.push(10);
    buf.push(20);
    buf.push(30);
    expect(buf.size()).toBe(2);
    expect(buf.average()).toBe(25);
  });
});
