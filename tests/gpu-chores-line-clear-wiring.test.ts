import { describe, expect, it, vi } from 'vitest';
import { onLineClear } from '../src/webgpu/viewGameEvents.js';
import { GpuChoreRunner } from '../src/webgpu/gpuChores/runner.js';
import { BOARD_COLS } from '../src/webgpu/gpuChores/compact.js';
import type { ViewEventHost } from '../src/view/viewTypes.js';

/** Accepts every `trigger*` call and every field read onLineClear makes. */
function stubVisualEffects(): Record<string, unknown> {
  const store: Record<string, unknown> = {};
  return new Proxy(store, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return vi.fn();
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  });
}

function stubView(options: { maxParticles?: number; chores?: GpuChoreRunner } = {}) {
  const emits: Array<{ x: number; y: number; count: number }> = [];
  const playfield = Array.from({ length: 20 }, () => Array(BOARD_COLS).fill(2));
  const view = {
    visualEffects: stubVisualEffects(),
    particleSystem: {
      maxParticles: options.maxParticles ?? 5000,
      emitParticles: (x: number, y: number, _z: number, count: number) => {
        emits.push({ x, y, count });
      },
      emitParticlesRadial: vi.fn(),
      emitLineClearShards: vi.fn(),
    },
    currentTheme: Array.from({ length: 8 }, () => [0.2, 0.6, 0.9]),
    state: { playfield },
    showFloatingText: vi.fn(),
    gpuChores: options.chores,
  } as unknown as ViewEventHost;
  return { view, emits, playfield };
}

describe('line-clear burst uses the compaction chore', () => {
  it('emits one burst per cell of every cleared row at the full budget', () => {
    const { view, emits } = stubView();
    onLineClear(view, [18, 19]);
    expect(emits.length).toBe(BOARD_COLS * 2);
  });

  it('behaves identically with no chore runner attached', () => {
    const withChore = stubView({ chores: GpuChoreRunner.create({ device: null }) });
    const withoutChore = stubView();
    onLineClear(withChore.view, [17, 18, 19]);
    onLineClear(withoutChore.view, [17, 18, 19]);
    expect(withChore.emits).toEqual(withoutChore.emits);
  });

  it('thins the burst evenly under a squeezed particle budget', () => {
    const full = stubView({ maxParticles: 5000 });
    const squeezed = stubView({ maxParticles: 800 });
    onLineClear(full.view, [19]);
    onLineClear(squeezed.view, [19]);

    expect(squeezed.emits.length).toBeLessThan(full.emits.length);
    expect(squeezed.emits.length).toBeGreaterThan(0);
    // Thinned, not truncated: the surviving cells still span the whole row.
    const xs = squeezed.emits.map((e) => e.x);
    expect(Math.max(...xs)).toBeGreaterThan(Math.min(...xs) + 4);
  });

  it('still bursts when the snapshot has already been emptied', () => {
    const { view, emits, playfield } = stubView();
    for (const row of playfield) row.fill(0);
    onLineClear(view, [19]);
    expect(emits.length).toBe(BOARD_COLS);
  });

  it('leaves per-cell counts and positions to the game, not the chore', () => {
    const single = stubView();
    const tetris = stubView();
    onLineClear(single.view, [19]);
    onLineClear(tetris.view, [16, 17, 18, 19]);
    // A Tetris still spends far more particles per cell than a single.
    expect(tetris.emits[0].count).toBeGreaterThan(single.emits[0].count);
  });
});
