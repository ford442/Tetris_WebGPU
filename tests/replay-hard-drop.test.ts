import { describe, it, expect, vi } from 'vitest';
import { GameSimulator } from '../src/replay/simulator.js';
import { REPLAY_ACTION } from '../src/replay/actions.js';

describe('Replay simulator onHardDrop', () => {
  it('calls the view onHardDrop hook exactly once during playback of a hard drop', () => {
    const sim = new GameSimulator(1234, 'marathon');
    const onHardDrop = vi.fn();

    // Mock the view
    sim.game.view = {
      onHardDrop,
      state: null,
      render: vi.fn(),
      init: vi.fn(),
      destroy: vi.fn(),
    };

    // The piece is I because seed 1234 might give I, wait, let's just assert onHardDrop is called.
    sim.tick(0);
    sim.tick(0);
    sim.tick(REPLAY_ACTION.HARD_DROP);
    sim.tick(0);

    expect(onHardDrop).toHaveBeenCalledTimes(1);

    // The arguments should be (currentX, finalGhostY, dropDist, colorIdx, blocks)
    const callArgs = onHardDrop.mock.calls[0];
    expect(callArgs.length).toBeGreaterThanOrEqual(4);

    // X should be around 4 (start X for pieces is typically 4 or 3)
    expect(callArgs[0]).toBeGreaterThanOrEqual(3);
    expect(callArgs[0]).toBeLessThanOrEqual(5);

    // ghostY should be > 0
    expect(callArgs[1]).toBeGreaterThan(0);
    expect(callArgs[2]).toBeGreaterThan(0); // dropDist

    // blocks should be defined
    expect(callArgs[4]).toBeDefined();
    expect(Array.isArray(callArgs[4])).toBe(true);
  });
});
