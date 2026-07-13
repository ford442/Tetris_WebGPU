import { describe, expect, it } from 'vitest';
import { REPLAY_ACTION } from '../src/replay/actions.js';
import { hashGameState } from '../src/replay/boardHash.js';
import {
  createReplayFile,
  decodeInputStream,
  encodeInputStream,
  eventsFromActionNames,
  fromShareCode,
  toShareCode,
  type ReplayInputEvent,
} from '../src/replay/format.js';
import { runSimulation } from '../src/replay/simulator.js';

describe('replay determinism', () => {
  const seed = 0xdecafbad;
  const events: ReplayInputEvent[] = eventsFromActionNames([
    { frame: 30, action: 'left' },
    { frame: 31, action: 'left' },
    { frame: 45, action: 'rotateCW' },
    { frame: 60, action: 'down' },
    { frame: 61, action: 'down' },
    { frame: 62, action: 'hardDrop' },
    { frame: 120, action: 'rotateCCW' },
    { frame: 150, action: 'hold' },
    { frame: 200, action: 'right' },
    { frame: 201, action: 'right' },
    { frame: 250, action: 'hardDrop' },
  ]);
  const maxFrame = 400;

  it('same seed + inputs yields identical board hash', () => {
    const a = runSimulation(seed, events, maxFrame);
    const b = runSimulation(seed, events, maxFrame);
    const hashA = hashGameState(a.game.playfield, a.game.score, a.game.lines);
    const hashB = hashGameState(b.game.playfield, b.game.score, b.game.lines);
    expect(hashB).toBe(hashA);
    expect(hashA).not.toBe(0);
  });

  it('encodes and decodes input stream losslessly', () => {
    const b64 = encodeInputStream(events);
    const decoded = decodeInputStream(b64);
    expect(decoded).toEqual(events);
  });

  it('share code round-trips seed and inputs', () => {
    const file = createReplayFile(
      { seed, mode: 'marathon', tickMs: 1000 / 60, frames: maxFrame },
      events,
    );
    const code = toShareCode(file);
    const parsed = fromShareCode(code);
    expect(parsed.seed).toBe(seed);
    expect(decodeInputStream(parsed.inputs)).toEqual(events);
  });

  it('action bitfield composes on the same frame', () => {
    const merged = eventsFromActionNames([
      { frame: 10, action: 'left' },
      { frame: 10, action: 'rotateCW' },
    ]);
    expect(merged).toEqual([
      { frame: 10, mask: REPLAY_ACTION.LEFT | REPLAY_ACTION.ROTATE_CW },
    ]);
  });
});
