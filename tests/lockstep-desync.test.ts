import { describe, expect, it } from 'vitest';
import { LockstepEngine } from '../src/net/lockstepEngine.js';
import { REPLAY_ACTION } from '../src/replay/actions.js';

describe('lockstep desync detection', () => {
  it('detects hash mismatch from remote checkpoint', () => {
    let desynced = false;
    const engine = new LockstepEngine(0, {
      onDesync: () => { desynced = true; },
    });

    engine.startMatch({
      matchSeed: 999,
      p0Seed: 999,
      p1Seed: 1000,
      inputDelay: 0,
      startFrame: 0,
    });

    engine.receiveInput({ frame: 0, playerId: 0, mask: 0 });
    engine.receiveInput({ frame: 0, playerId: 1, mask: 0 });
    engine.tick();

    const local = engine.sim.bothHashes();
    engine.receiveHash(1, local.hash0 ^ 1, local.hash1);
    expect(desynced).toBe(true);
  });

  it('advances when both inputs present', () => {
    const engine = new LockstepEngine(0, {});
    engine.startMatch({
      matchSeed: 1,
      p0Seed: 1,
      p1Seed: 2,
      inputDelay: 0,
      startFrame: 0,
    });

    engine.receiveInput({ frame: 0, playerId: 0, mask: REPLAY_ACTION.LEFT });
    engine.receiveInput({ frame: 0, playerId: 1, mask: REPLAY_ACTION.RIGHT });

    const result = engine.tick();
    expect(result).not.toBeNull();
    expect(engine.simFrame).toBe(1);
  });
});
