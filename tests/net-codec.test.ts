import { describe, expect, it } from 'vitest';
import { encodeNetMessage, decodeNetMessage, netMessageToBase64, netMessageFromBase64 } from '../src/net/codec.js';
import { NetMessageType } from '../src/net/types.js';

describe('net codec', () => {
  it('round-trips MatchStart', () => {
    const msg = {
      type: NetMessageType.MatchStart as const,
      payload: {
        matchSeed: 0xdeadbeef,
        p0Seed: 0xdeadbeef,
        p1Seed: 0xdeadbef0,
        inputDelay: 3,
        startFrame: 180,
      },
    };
    const decoded = decodeNetMessage(encodeNetMessage(msg));
    expect(decoded).toEqual(msg);
  });

  it('round-trips Input', () => {
    const msg = {
      type: NetMessageType.Input as const,
      payload: { frame: 42, playerId: 1 as const, mask: 0x7f },
    };
    expect(decodeNetMessage(encodeNetMessage(msg))).toEqual(msg);
  });

  it('round-trips HashCheckpoint', () => {
    const msg = {
      type: NetMessageType.HashCheckpoint as const,
      payload: { frame: 60, hash0: 123, hash1: 456 },
    };
    expect(decodeNetMessage(encodeNetMessage(msg))).toEqual(msg);
  });

  it('round-trips via base64', () => {
    const msg = {
      type: NetMessageType.RoundEnd as const,
      payload: { winner: 0 as const, wins0: 2, wins1: 1 },
    };
    expect(netMessageFromBase64(netMessageToBase64(msg))).toEqual(msg);
  });
});
