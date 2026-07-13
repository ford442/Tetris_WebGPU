import { describe, expect, it } from 'vitest';
import { attackRowsFromClear, injectGarbageRows, GARBAGE_CELL } from '../src/versus/garbage.js';

describe('versus garbage', () => {
  it('maps line clears to attack rows', () => {
    expect(attackRowsFromClear(0)).toBe(0);
    expect(attackRowsFromClear(1)).toBe(0);
    expect(attackRowsFromClear(2)).toBe(1);
    expect(attackRowsFromClear(3)).toBe(2);
    expect(attackRowsFromClear(4)).toBe(4);
  });

  it('injects garbage rows with one hole each', () => {
    const pf = new Int8Array(200);
    pf.fill(0);
    pf[190] = 1;
    const overflow = injectGarbageRows(pf, 10, 20, 1, () => 0.5);
    expect(overflow).toBe(false);
    let holes = 0;
    let garbage = 0;
    for (let x = 0; x < 10; x++) {
      const v = pf[190 + x];
      if (v === 0) holes++;
      if (v === GARBAGE_CELL) garbage++;
    }
    expect(holes).toBe(1);
    expect(garbage).toBe(9);
    expect(pf[180]).toBe(1);
  });

  it('detects overflow when garbage reaches the top', () => {
    const pf = new Int8Array(200);
    for (let y = 0; y < 19; y++) {
      for (let x = 0; x < 10; x++) pf[y * 10 + x] = 2;
    }
    const overflow = injectGarbageRows(pf, 10, 20, 1, () => 0);
    expect(overflow).toBe(true);
  });
});
