import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScoringSystem } from '../src/game/scoring.js';

function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe('ScoringSystem.saveHighScore', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: createStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('only attempts persistence once per game', () => {
    const scoring = new ScoringSystem();
    scoring.score = 5000;
    scoring.lines = 20;

    expect(scoring.saveHighScore()).toBe(true);
    expect(scoring.saveHighScore()).toBe(false);
  });

  it('allows saving again after reset', () => {
    const scoring = new ScoringSystem();
    scoring.score = 3000;
    scoring.lines = 12;

    expect(scoring.saveHighScore()).toBe(true);
    scoring.reset();
    scoring.score = 6000;
    scoring.lines = 25;
    expect(scoring.saveHighScore()).toBe(true);
  });
});
