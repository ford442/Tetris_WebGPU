import type { GameModeId } from '../game/modes/types.js';
import type { ReplayActionName } from './actions.js';
import { actionNameToMask } from './actions.js';

export const REPLAY_TICK_MS = 1000 / 60;
export const REPLAY_FORMAT_VERSION = 1 as const;
export const REPLAY_STORAGE_KEY = 'tetris_last_replay';

/** Sparse frame → action mask entry. */
export interface ReplayInputEvent {
  frame: number;
  mask: number;
}

/** On-disk / shareable replay document (.ttr JSON). */
export interface ReplayFile {
  v: typeof REPLAY_FORMAT_VERSION;
  seed: number;
  mode: GameModeId;
  tickMs: number;
  frames: number;
  /** Delta-encoded input stream (base64). */
  inputs: string;
}

export interface ReplayHeader {
  seed: number;
  mode: GameModeId;
  tickMs: number;
  frames: number;
}

/** Encode sparse events as [u16 deltaFrame][u8 mask]… */
export function encodeInputStream(events: ReplayInputEvent[]): string {
  if (events.length === 0) return '';
  const sorted = [...events].sort((a, b) => a.frame - b.frame);
  const bytes = new Uint8Array(sorted.length * 3);
  let prev = 0;
  let offset = 0;
  for (const ev of sorted) {
    const delta = ev.frame - prev;
    if (delta < 0 || delta > 0xffff) {
      throw new RangeError(`frame delta out of range: ${delta}`);
    }
    bytes[offset++] = delta & 0xff;
    bytes[offset++] = (delta >> 8) & 0xff;
    bytes[offset++] = ev.mask & 0xff;
    prev = ev.frame;
  }
  return bytesToBase64(bytes.subarray(0, offset));
}

export function decodeInputStream(b64: string): ReplayInputEvent[] {
  if (!b64) return [];
  const bytes = base64ToBytes(b64);
  const events: ReplayInputEvent[] = [];
  let frame = 0;
  for (let i = 0; i + 2 < bytes.length; i += 3) {
    const delta = bytes[i] | (bytes[i + 1] << 8);
    frame += delta;
    events.push({ frame, mask: bytes[i + 2] });
  }
  return events;
}

export function inputEventsToMap(events: ReplayInputEvent[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const ev of events) {
    map.set(ev.frame, (map.get(ev.frame) ?? 0) | ev.mask);
  }
  return map;
}

export function createReplayFile(
  header: ReplayHeader,
  events: ReplayInputEvent[],
): ReplayFile {
  return {
    v: REPLAY_FORMAT_VERSION,
    seed: header.seed >>> 0,
    mode: header.mode,
    tickMs: header.tickMs,
    frames: header.frames,
    inputs: encodeInputStream(events),
  };
}

export function parseReplayFile(raw: unknown): ReplayFile {
  if (!raw || typeof raw !== 'object') {
    throw new TypeError('replay must be an object');
  }
  const o = raw as Record<string, unknown>;
  if (o.v !== REPLAY_FORMAT_VERSION) {
    throw new Error(`unsupported replay version: ${String(o.v)}`);
  }
  if (typeof o.seed !== 'number' || typeof o.inputs !== 'string') {
    throw new TypeError('invalid replay header');
  }
  const mode = o.mode;
  if (
    mode !== 'marathon' &&
    mode !== 'sprint' &&
    mode !== 'ultra' &&
    mode !== 'versus'
  ) {
    throw new TypeError('invalid replay mode');
  }
  return {
    v: REPLAY_FORMAT_VERSION,
    seed: o.seed >>> 0,
    mode,
    tickMs: typeof o.tickMs === 'number' ? o.tickMs : REPLAY_TICK_MS,
    frames: typeof o.frames === 'number' ? o.frames : 0,
    inputs: o.inputs,
  };
}

/** Compact share code: base64(JSON) with short keys. */
export function toShareCode(file: ReplayFile): string {
  const compact = {
    v: file.v,
    s: file.seed,
    m: file.mode,
    t: file.tickMs,
    f: file.frames,
    i: file.inputs,
  };
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(compact)));
}

export function fromShareCode(code: string): ReplayFile {
  const json = new TextDecoder().decode(base64ToBytes(code.trim()));
  const o = JSON.parse(json) as Record<string, unknown>;
  return parseReplayFile({
    v: o.v,
    seed: o.s,
    mode: o.m,
    tickMs: o.t,
    frames: o.f,
    inputs: o.i,
  });
}

export function eventsFromActionNames(
  pairs: Array<{ frame: number; action: ReplayActionName }>,
): ReplayInputEvent[] {
  const merged = new Map<number, number>();
  for (const { frame, action } of pairs) {
    merged.set(frame, (merged.get(frame) ?? 0) | actionNameToMask(action));
  }
  return [...merged.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([frame, mask]) => ({ frame, mask }));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
