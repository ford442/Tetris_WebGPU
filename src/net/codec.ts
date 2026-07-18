import {
  NetMessageType,
  DisconnectReason,
  type DisconnectReasonId,
  type NetMessage,
} from './types.js';

const MATCH_START_SIZE = 1 + 4 + 4 + 4 + 1 + 4;
const INPUT_SIZE = 1 + 4 + 1 + 1;
const HASH_SIZE = 1 + 4 + 4 + 4;
const ROUND_END_SIZE = 1 + 1 + 1 + 1;
const REMATCH_SIZE = 1 + 1;
const DISCONNECT_SIZE = 1 + 1;

function decodeDisconnectReason(byte: number): DisconnectReasonId {
  switch (byte) {
    case DisconnectReason.Left:
    case DisconnectReason.Timeout:
    case DisconnectReason.Desync:
    case DisconnectReason.Error:
      return byte;
    default:
      return DisconnectReason.Error;
  }
}

export function encodeNetMessage(msg: NetMessage): Uint8Array {
  switch (msg.type) {
    case NetMessageType.MatchStart: {
      const buf = new Uint8Array(MATCH_START_SIZE);
      const view = new DataView(buf.buffer);
      let o = 0;
      buf[o++] = msg.type;
      view.setUint32(o, msg.payload.matchSeed >>> 0, true); o += 4;
      view.setUint32(o, msg.payload.p0Seed >>> 0, true); o += 4;
      view.setUint32(o, msg.payload.p1Seed >>> 0, true); o += 4;
      buf[o++] = msg.payload.inputDelay & 0xff;
      view.setUint32(o, msg.payload.startFrame >>> 0, true);
      return buf;
    }
    case NetMessageType.Input: {
      const buf = new Uint8Array(INPUT_SIZE);
      const view = new DataView(buf.buffer);
      buf[0] = msg.type;
      view.setUint32(1, msg.payload.frame >>> 0, true);
      buf[5] = msg.payload.playerId & 0xff;
      buf[6] = msg.payload.mask & 0xff;
      return buf;
    }
    case NetMessageType.HashCheckpoint: {
      const buf = new Uint8Array(HASH_SIZE);
      const view = new DataView(buf.buffer);
      buf[0] = msg.type;
      view.setUint32(1, msg.payload.frame >>> 0, true);
      view.setUint32(5, msg.payload.hash0 >>> 0, true);
      view.setUint32(9, msg.payload.hash1 >>> 0, true);
      return buf;
    }
    case NetMessageType.RoundEnd: {
      const buf = new Uint8Array(ROUND_END_SIZE);
      buf[0] = msg.type;
      buf[1] = msg.payload.winner & 0xff;
      buf[2] = msg.payload.wins0 & 0xff;
      buf[3] = msg.payload.wins1 & 0xff;
      return buf;
    }
    case NetMessageType.Rematch: {
      const buf = new Uint8Array(REMATCH_SIZE);
      buf[0] = msg.type;
      buf[1] = msg.payload.ready ? 1 : 0;
      return buf;
    }
    case NetMessageType.Disconnect: {
      const buf = new Uint8Array(DISCONNECT_SIZE);
      buf[0] = msg.type;
      buf[1] = msg.payload.reason & 0xff;
      return buf;
    }
    default: {
      const _exhaustive: never = msg;
      throw new Error(`unknown message type: ${String(_exhaustive)}`);
    }
  }
}

export function decodeNetMessage(data: ArrayBuffer | Uint8Array): NetMessage {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (buf.length < 1) throw new Error('empty net message');
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const type = buf[0];

  switch (type) {
    case NetMessageType.MatchStart: {
      if (buf.length < MATCH_START_SIZE) throw new Error('truncated MatchStart');
      return {
        type: NetMessageType.MatchStart,
        payload: {
          matchSeed: view.getUint32(1, true),
          p0Seed: view.getUint32(5, true),
          p1Seed: view.getUint32(9, true),
          inputDelay: buf[13]!,
          startFrame: view.getUint32(14, true),
        },
      };
    }
    case NetMessageType.Input: {
      if (buf.length < INPUT_SIZE) throw new Error('truncated Input');
      return {
        type: NetMessageType.Input,
        payload: {
          frame: view.getUint32(1, true),
          playerId: (buf[5]! & 1) as 0 | 1,
          mask: buf[6]!,
        },
      };
    }
    case NetMessageType.HashCheckpoint: {
      if (buf.length < HASH_SIZE) throw new Error('truncated HashCheckpoint');
      return {
        type: NetMessageType.HashCheckpoint,
        payload: {
          frame: view.getUint32(1, true),
          hash0: view.getUint32(5, true),
          hash1: view.getUint32(9, true),
        },
      };
    }
    case NetMessageType.RoundEnd: {
      if (buf.length < ROUND_END_SIZE) throw new Error('truncated RoundEnd');
      return {
        type: NetMessageType.RoundEnd,
        payload: {
          winner: (buf[1]! & 1) as 0 | 1,
          wins0: buf[2]!,
          wins1: buf[3]!,
        },
      };
    }
    case NetMessageType.Rematch: {
      if (buf.length < REMATCH_SIZE) throw new Error('truncated Rematch');
      return {
        type: NetMessageType.Rematch,
        payload: { ready: buf[1]! !== 0 },
      };
    }
    case NetMessageType.Disconnect: {
      if (buf.length < DISCONNECT_SIZE) throw new Error('truncated Disconnect');
      return {
        type: NetMessageType.Disconnect,
        payload: { reason: decodeDisconnectReason(buf[1]!) },
      };
    }
    default:
      throw new Error(`unknown net message type: ${type}`);
  }
}

export function netMessageToBase64(msg: NetMessage): string {
  const bytes = encodeNetMessage(msg);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function netMessageFromBase64(b64: string): NetMessage {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return decodeNetMessage(bytes);
}
