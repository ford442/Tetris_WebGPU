import type { GameModeId } from '../game/modes/types.js';
import type { ReplayActionName } from './actions.js';
import { actionNameToMask } from './actions.js';
import type { FrameInputSink } from './frameStepper.js';
import {
  createReplayFile,
  REPLAY_TICK_MS,
  type ReplayFile,
  type ReplayInputEvent,
} from './format.js';

/** Highest set bit of a non-zero mask, as a single-bit mask. */
function highestBit(mask: number): number {
  return 1 << (31 - Math.clz32(mask));
}

/**
 * Records every input the FrameStepper applies, against the stepper's own frame clock
 * (attach it as `stepper.sink`). Several presses in one frame are kept in order: a press is
 * OR-ed into the frame's pending mask only while that cannot reorder it (all of its bits are
 * above the pending mask's highest bit, which is the order `applyActionMask` applies them);
 * otherwise the pending mask is emitted and a new one starts. Same-frame masks become
 * delta-0 entries of the existing `[u16 delta][u8 mask]` stream, so the format is unchanged.
 */
export class ReplayRecorder implements FrameInputSink {
  private recording = false;
  private seed = 0;
  private modeId: GameModeId = 'marathon';
  private frame = 0;
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
    this.pendingMask = 0;
    this.events = [];
    this.recording = true;
  }

  recordMask(mask: number): void {
    if (!this.recording || mask === 0) return;
    const lowestNew = mask & -mask;
    if (this.pendingMask !== 0 && lowestNew <= highestBit(this.pendingMask)) {
      this.flushPending();
    }
    this.pendingMask |= mask;
  }

  /** Close the current frame (called by FrameStepper.advance()). */
  endFrame(): void {
    if (!this.recording) return;
    this.flushPending();
    this.frame++;
  }

  recordAction(action: ReplayActionName): void {
    this.recordMask(actionNameToMask(action));
  }

  stop(): ReplayFile {
    // Inputs pressed after the last advance (e.g. the hard drop that topped out) belong to a
    // frame that never advanced; count it so playback applies them.
    const frames = this.pendingMask !== 0 ? this.frame + 1 : this.frame;
    this.flushPending();
    this.recording = false;
    return createReplayFile(
      {
        seed: this.seed,
        mode: this.modeId,
        tickMs: REPLAY_TICK_MS,
        frames,
      },
      this.events,
    );
  }

  private flushPending(): void {
    if (this.pendingMask === 0) return;
    this.events.push({ frame: this.frame, mask: this.pendingMask });
    this.pendingMask = 0;
  }
}

export function generateReplaySeed(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]! >>> 0;
  }
  return (Math.random() * 0x1_0000_0000) >>> 0;
}
