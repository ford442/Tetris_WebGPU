import { describe, it, expect } from 'vitest';
import { columnToPan, movePan } from '../src/audio/spatial.js';
import { stemForLevel } from '../src/audio/musicEngine.js';

describe('spatial pan', () => {
  it('maps playfield columns to stereo pan', () => {
    expect(columnToPan(0)).toBeCloseTo(-1, 5);
    expect(columnToPan(9)).toBeCloseTo(1, 5);
    expect(columnToPan(4.5)).toBeCloseTo(0, 5);
  });

  it('offsets pan for lateral moves', () => {
    expect(movePan('left', 5)).toBeLessThan(movePan('right', 5));
  });
});

describe('music stems', () => {
  it('selects intro / build / peak by level', () => {
    expect(stemForLevel(0)).toBe('intro');
    expect(stemForLevel(5)).toBe('build');
    expect(stemForLevel(12)).toBe('peak');
  });
});
