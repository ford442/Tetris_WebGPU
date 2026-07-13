/**
 * Per-mode leaderboards in localStorage (score or time metric).
 */

import { gameLogger } from '../utils/logger.js';
import type { GameMode } from './modes/types.js';

export interface ModeLeaderboardEntry {
  value: number;
  metric: 'score' | 'time';
  lines: number;
  level: number;
  date: string;
}

interface StoredModeEntry {
  v: number;
  m: 'score' | 'time';
  l: number;
  lv: number;
  d: number;
}

export class ModeLeaderboard {
  private entries: ModeLeaderboardEntry[] = [];
  private readonly maxEntries = 5;

  constructor(
    private readonly storageKey: string,
    private readonly metric: 'score' | 'time',
    private readonly higherIsBetter: boolean,
  ) {
    this.load();
  }

  private load(): void {
    try {
      const stored = typeof window !== 'undefined' && window.localStorage
        ? window.localStorage.getItem(this.storageKey)
        : null;
      if (!stored) {
        this.entries = [];
        return;
      }
      const parsed: unknown = JSON.parse(stored);
      if (!Array.isArray(parsed)) {
        this.entries = [];
        return;
      }
      const normalized: ModeLeaderboardEntry[] = [];
      for (const item of parsed) {
        const entry = this.normalize(item);
        if (entry) normalized.push(entry);
      }
      this.sortEntries(normalized);
      this.entries = normalized.slice(0, this.maxEntries);
    } catch (e) {
      gameLogger.warn(`Failed to load mode leaderboard ${this.storageKey}:`, e);
      this.entries = [];
    }
  }

  private normalize(raw: unknown): ModeLeaderboardEntry | null {
    if (!raw || typeof raw !== 'object') return null;
    const record = raw as Record<string, unknown>;
    const compact = record as StoredModeEntry;
    const value = typeof record.value === 'number' ? record.value : compact.v;
    const metric = record.metric === 'time' || record.metric === 'score'
      ? record.metric
      : compact.m;
    const lines = typeof record.lines === 'number' ? record.lines : compact.l;
    const level = typeof record.level === 'number' ? record.level : compact.lv;
    if (!Number.isFinite(value) || value < 0) return null;
    if (metric !== 'score' && metric !== 'time') return null;
    let date = '';
    if (typeof record.date === 'string') {
      date = record.date;
    } else if (typeof compact.d === 'number') {
      date = new Date(compact.d).toLocaleDateString();
    } else {
      date = new Date().toLocaleDateString();
    }
    return {
      value: Math.floor(value),
      metric,
      lines: Math.floor(lines || 0),
      level: Math.floor(level || 1),
      date,
    };
  }

  private sortEntries(entries: ModeLeaderboardEntry[]): void {
    entries.sort((a, b) => this.higherIsBetter ? b.value - a.value : a.value - b.value);
  }

  private serialize(entries: ModeLeaderboardEntry[]): string {
    const compact: StoredModeEntry[] = entries.map((e) => ({
      v: e.value,
      m: e.metric,
      l: e.lines,
      lv: e.level,
      d: Date.parse(e.date) || Date.now(),
    }));
    return JSON.stringify(compact);
  }

  private save(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(this.storageKey, this.serialize(this.entries));
    } catch (e) {
      gameLogger.warn(`Failed to save mode leaderboard ${this.storageKey}:`, e);
    }
  }

  addEntry(value: number, lines: number, level: number): boolean {
    const entry: ModeLeaderboardEntry = {
      value: Math.floor(value),
      metric: this.metric,
      lines: Math.floor(lines),
      level: Math.floor(level),
      date: new Date().toLocaleDateString(),
    };

    const isBetter = this.entries.length < this.maxEntries || (
      this.higherIsBetter
        ? entry.value > this.entries[this.entries.length - 1].value
        : entry.value < this.entries[this.entries.length - 1].value
    );
    if (!isBetter && this.entries.some((e) => e.value === entry.value)) {
      return false;
    }
    if (!isBetter) return false;

    this.entries.push(entry);
    this.sortEntries(this.entries);
    this.entries = this.entries.slice(0, this.maxEntries);
    this.save();
    return this.entries[0].value === entry.value;
  }

  getBest(): ModeLeaderboardEntry | null {
    return this.entries.length > 0 ? this.entries[0] : null;
  }

  getEntries(): ModeLeaderboardEntry[] {
    return [...this.entries];
  }

  formatBestValue(): string {
    const best = this.getBest();
    if (!best) return '—';
    if (best.metric === 'time') {
      const totalCs = Math.floor(best.value / 10);
      const cs = totalCs % 100;
      const sec = Math.floor(totalCs / 100) % 60;
      const min = Math.floor(totalCs / 6000);
      return `${min}:${sec.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
    }
    return best.value.toLocaleString();
  }
}

const leaderboardCache = new Map<string, ModeLeaderboard>();

export function getModeLeaderboard(mode: GameMode): ModeLeaderboard {
  const key = mode.getLeaderboardStorageKey();
  const metric = mode.getLeaderboardMetric();
  const higherIsBetter = metric === 'score';
  const cached = leaderboardCache.get(key);
  if (cached) return cached;
  const board = new ModeLeaderboard(key, metric, higherIsBetter);
  leaderboardCache.set(key, board);
  return board;
}

export function clearModeLeaderboardCache(): void {
  leaderboardCache.clear();
}
