import { describe, expect, it } from 'vitest';
import { REPLAY_ACTION } from '../src/replay/actions.js';
import { decodeInputStream } from '../src/replay/format.js';
import { ReplayRecorder } from '../src/replay/recorder.js';

const { LEFT, RIGHT, DOWN, ROTATE_CW, HARD_DROP, HOLD } = REPLAY_ACTION;

function record(frames: number[][]): { frame: number; mask: number }[] {
  const r = new ReplayRecorder();
  r.start(1, 'marathon');
  for (const masks of frames) {
    for (const m of masks) r.recordMask(m);
    r.endFrame();
  }
  return decodeInputStream(r.stop().inputs);
}

describe('ReplayRecorder', () => {
  it('merges presses into one mask only when apply order is preserved', () => {
    expect(record([[LEFT, ROTATE_CW, HARD_DROP]])).toEqual([{ frame: 0, mask: LEFT | ROTATE_CW | HARD_DROP }]);
  });

  it('keeps out-of-order and repeated presses as same-frame (delta-0) entries', () => {
    expect(record([[], [ROTATE_CW, LEFT], [DOWN, DOWN, DOWN]])).toEqual([
      { frame: 1, mask: ROTATE_CW },
      { frame: 1, mask: LEFT },
      { frame: 2, mask: DOWN },
      { frame: 2, mask: DOWN },
      { frame: 2, mask: DOWN },
    ]);
  });

  it('starts a new entry when a mask overlaps the pending one', () => {
    expect(record([[LEFT | RIGHT, RIGHT | HOLD]])).toEqual([
      { frame: 0, mask: LEFT | RIGHT },
      { frame: 0, mask: RIGHT | HOLD },
    ]);
  });

  it('counts a frame whose inputs were pressed but never advanced (the topping-out drop)', () => {
    const r = new ReplayRecorder();
    r.start(1, 'marathon');
    r.endFrame();
    r.endFrame();
    r.recordMask(HARD_DROP);
    const file = r.stop();
    expect(file.frames).toBe(3);
    expect(decodeInputStream(file.inputs)).toEqual([{ frame: 2, mask: HARD_DROP }]);
  });

  it('ignores input while not recording', () => {
    const r = new ReplayRecorder();
    r.recordMask(LEFT);
    r.endFrame();
    expect(r.currentFrame).toBe(0);
  });
});
