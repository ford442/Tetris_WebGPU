import { describe, expect, it } from 'vitest';

import { DEFAULT_DETERMINISTIC_SEED, installDeterministicRuntime, parseDeterministic, type DeterministicHost } from '../src/deterministic.js';

describe('parseDeterministic', () => {
  it('is off without the flag', () => {
    expect(parseDeterministic('')).toEqual({ enabled: false, seed: DEFAULT_DETERMINISTIC_SEED });
    expect(parseDeterministic('?renderer=webgl2&seed=9').enabled).toBe(false);
  });

  it('turns on with a bare flag and defaults the seed', () => {
    expect(parseDeterministic('?deterministic')).toEqual({ enabled: true, seed: DEFAULT_DETERMINISTIC_SEED });
    expect(parseDeterministic('?deterministic=1').enabled).toBe(true);
  });

  it('honours an explicit non-negative integer seed and rejects junk', () => {
    expect(parseDeterministic('?deterministic&seed=42').seed).toBe(42);
    expect(parseDeterministic('?deterministic&seed=0').seed).toBe(0);
    expect(parseDeterministic('?deterministic&seed=-3').seed).toBe(DEFAULT_DETERMINISTIC_SEED);
    expect(parseDeterministic('?deterministic&seed=abc').seed).toBe(DEFAULT_DETERMINISTIC_SEED);
    expect(parseDeterministic('?deterministic&seed=1.5').seed).toBe(DEFAULT_DETERMINISTIC_SEED);
  });

  it('can be switched off explicitly', () => {
    expect(parseDeterministic('?deterministic=0').enabled).toBe(false);
    expect(parseDeterministic('?deterministic=false').enabled).toBe(false);
  });
});

function makeHost() {
  const listeners: Array<{ type: string; fn: (e: { target: unknown }) => void; capture: boolean }> = [];
  const original = (): number => 0.123;
  const host: DeterministicHost = {
    Math: { random: original },
    document: {
      documentElement: { dataset: {} },
      addEventListener: (type, fn, capture) => { listeners.push({ type, fn, capture }); },
    },
  };
  return { host, listeners, original };
}

describe('installDeterministicRuntime', () => {
  it('touches nothing when the flag is absent', () => {
    const { host, listeners, original } = makeHost();
    expect(installDeterministicRuntime(host, '?renderer=webgpu')).toBeNull();
    expect(host.Math.random).toBe(original);
    expect(listeners).toHaveLength(0);
  });

  it('replaces Math.random with a repeatable stream per seed', () => {
    const a = makeHost();
    const b = makeHost();
    const c = makeHost();
    installDeterministicRuntime(a.host, '?deterministic&seed=7');
    installDeterministicRuntime(b.host, '?deterministic&seed=7');
    installDeterministicRuntime(c.host, '?deterministic&seed=8');
    const take = (h: DeterministicHost): number[] => Array.from({ length: 5 }, () => h.Math.random());
    const sa = take(a.host);
    expect(take(b.host)).toEqual(sa);
    expect(take(c.host)).not.toEqual(sa);
    for (const v of sa) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('freezes videos on frame 0 via capture-phase play listeners', () => {
    const { host, listeners } = makeHost();
    installDeterministicRuntime(host, '?deterministic');
    expect(host.document!.documentElement!.dataset!.deterministic).toBe('1');
    expect(listeners.map((l) => l.type).sort()).toEqual(['play', 'playing']);
    expect(listeners.every((l) => l.capture)).toBe(true);

    const video = { paused: false, currentTime: 4.2, pause() { this.paused = true; } };
    for (const l of listeners) l.fn({ target: video });
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBe(0);

    // A non-media target (a button's `play` event, say) is left alone.
    const other = { currentTime: 9 };
    for (const l of listeners) l.fn({ target: other });
    expect(other.currentTime).toBe(9);
  });
});
