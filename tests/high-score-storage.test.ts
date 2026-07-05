import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HighScoreManager } from '../src/game/scoring.js';

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

describe('HighScoreManager localStorage', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createStorage();
    vi.stubGlobal('window', { localStorage: storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores scores in a compact format', () => {
    const manager = new HighScoreManager();
    expect(manager.addScore(12000, 42, 5)).toBe(true);

    const raw = storage.getItem('tetris_highscores');
    expect(raw).toBeTruthy();
    expect(raw).toContain('"s":12000');
    expect(raw).not.toContain('"score"');
  });

  it('migrates legacy verbose entries and trims to top 5', () => {
    const legacy = Array.from({ length: 8 }, (_, i) => ({
      score: (i + 1) * 1000,
      lines: i,
      level: 1,
      date: '1/1/2026',
    }));
    storage.setItem('tetris_highscores', JSON.stringify(legacy));

    const manager = new HighScoreManager();
    const scores = manager.getHighScores();

    expect(scores).toHaveLength(5);
    expect(scores[0].score).toBe(8000);
    expect(scores[4].score).toBe(4000);
  });

  it('recovers from QuotaExceededError by clearing the key and retrying', () => {
    const manager = new HighScoreManager();
    const originalSetItem = storage.setItem.bind(storage);
    let attempts = 0;

    storage.setItem = (key: string, value: string) => {
      if (key === 'tetris_highscores') {
        attempts += 1;
        if (attempts === 1) {
          const err = new DOMException('quota', 'QuotaExceededError');
          throw err;
        }
      }
      originalSetItem(key, value);
    };

    expect(manager.addScore(9000, 10, 2)).toBe(true);
    expect(attempts).toBe(2);
    expect(JSON.parse(storage.getItem('tetris_highscores')!)[0].s).toBe(9000);
  });

  it('ignores zero scores', () => {
    const manager = new HighScoreManager();
    expect(manager.addScore(0, 0, 1)).toBe(false);
    expect(storage.getItem('tetris_highscores')).toBeNull();
  });
});
