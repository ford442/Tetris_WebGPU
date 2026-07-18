import { describe, expect, it } from 'vitest';
import { VersusLockstepSim } from '../src/versus/VersusLockstepSim.js';
import { holeColumnForGarbageRow } from '../src/versus/garbageRng.js';
import { REPLAY_ACTION } from '../src/replay/actions.js';

describe('VersusLockstepSim', () => {
  it('produces identical hashes from two instances with same seed and inputs', () => {
    const seed = 0xdeadbeef;
    const inputs = new Map<number, { p0: number; p1: number }>();
    inputs.set(10, { p0: REPLAY_ACTION.LEFT, p1: REPLAY_ACTION.RIGHT });
    inputs.set(11, { p0: REPLAY_ACTION.LEFT, p1: 0 });
    inputs.set(50, { p0: REPLAY_ACTION.HARD_DROP, p1: 0 });

    const a = new VersusLockstepSim(seed);
    const b = new VersusLockstepSim(seed);

    for (let f = 0; f < 120; f++) {
      const inp = inputs.get(f);
      a.tick(inp?.p0 ?? 0, inp?.p1 ?? 0);
      b.tick(inp?.p0 ?? 0, inp?.p1 ?? 0);
    }

    expect(a.bothHashes()).toEqual(b.bothHashes());
    expect(a.bothHashes().hash0).not.toBe(0);
  });

  it('deterministic garbage hole columns from match seed', () => {
    const col0 = holeColumnForGarbageRow(12345, 0, 0, 0, 10);
    const col1 = holeColumnForGarbageRow(12345, 0, 0, 0, 10);
    expect(col0).toBe(col1);
    expect(col0).toBeGreaterThanOrEqual(0);
    expect(col0).toBeLessThan(10);
  });

  it('both simulators stay in sync through garbage attacks', () => {
    const seed = 42;
    const simA = new VersusLockstepSim(seed);
    const simB = new VersusLockstepSim(seed);

    for (let f = 0; f < 300; f++) {
      const p0 = f % 30 === 0 ? REPLAY_ACTION.HARD_DROP : 0;
      const p1 = f % 35 === 0 ? REPLAY_ACTION.HARD_DROP : 0;
      simA.tick(p0, p1);
      simB.tick(p0, p1);
      expect(simA.bothHashes()).toEqual(simB.bothHashes());
      if (simA.g0.gameOver || simA.g1.gameOver) break;
    }
  });
});
