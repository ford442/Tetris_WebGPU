import type { GameModeId } from '../game/modes/types.js';
import type { ReplayActionName } from './actions.js';
import { actionNameToMask } from './actions.js';
import {
  createReplayFile,
  REPLAY_TICK_MS,
  type ReplayFile,
  type ReplayInputEvent,
} from './format.js';

/** Records discrete actions against a fixed 60 Hz frame clock. */
export class ReplayRecorder {
  private recording = false;
  private seed = 0;
  private modeId: GameModeId = 'marathon';
  private frame = 0;
  private accumMs = 0;
  private pendingMask = 0;
  private events: ReplayInputEvent[] = [];

  get isRecording(): boolean {
    return this.recording;
  }

  get currentFrame(): number {
    return this.frame;
  }

  start(seed: number, modeId: GameModeId): void {
    this.seed = seed >>> 0;
    this.modeId = modeId;
    this.frame = 0;
    this.accumMs = 0;
    this.pendingMask = 0;
    this.events = [];
    this.recording = true;
  }

  /** Advance the replay frame clock (call once per rAF with dt). */
  advanceClock(dtMs: number): void {
    if (!this.recording) return;
    this.accumMs += dtMs;
    while (this.accumMs >= REPLAY_TICK_MS) {
      this.flushFrame();
      this.accumMs -= REPLAY_TICK_MS;
      this.frame++;
    }
  }

  recordAction(action: ReplayActionName): void {
    if (!this.recording) return;
    this.pendingMask |= actionNameToMask(action);
  }

  stop(): ReplayFile {
    this.flushFrame();
    this.recording = false;
    return createReplayFile(
      {
        seed: this.seed,
        mode: this.modeId,
        tickMs: REPLAY_TICK_MS,
        frames: this.frame,
      },
      this.events,
    );
  }

  private flushFrame(): void {
    if (this.pendingMask === 0) return;
    this.events.push({ frame: this.frame, mask: this.pendingMask });
    this.pendingMask = 0;
  }
}

export function generateReplaySeed(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] >>> 0;
  }
  return (Math.random() * 0x1_0000_0000) >>> 0;
}
