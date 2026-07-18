import { VersusLockstepSim, type VersusTickResult } from '../versus/VersusLockstepSim.js';
import {
  DEFAULT_INPUT_DELAY,
  HASH_CHECK_INTERVAL,
  INPUT_TIMEOUT_FRAMES,
  NetMessageType,
  type InputPayload,
  type MatchStartPayload,
} from './types.js';
import type { NetMessage } from './types.js';

export interface LockstepCallbacks {
  onTick?(result: VersusTickResult): void;
  onDesync?(frame: number, local: { hash0: number; hash1: number }, remote: { hash0: number; hash1: number }): void;
  onRoundEnd?(winner: 0 | 1): void;
  onInputNeeded?(frame: number, playerId: 0 | 1): void;
  onSendMessage?(msg: NetMessage): void;
}

/**
 * Fixed 60 Hz lockstep engine with input delay and periodic hash checks.
 */
export class LockstepEngine {
  readonly sim: VersusLockstepSim;
  phase: 'idle' | 'countdown' | 'playing' | 'ended' = 'idle';

  simFrame = 0;
  inputDelay = DEFAULT_INPUT_DELAY;
  startFrame = 0;
  matchSeed = 0;

  readonly localPlayerId: 0 | 1;
  readonly isSpectator: boolean;

  private p0Inputs = new Map<number, number>();
  private p1Inputs = new Map<number, number>();
  private remoteHashes = new Map<number, { hash0: number; hash1: number }>();
  private framesWithoutAdvance = 0;
  private wins: [number, number] = [0, 0];
  private callbacks: LockstepCallbacks;

  constructor(localPlayerId: 0 | 1, callbacks: LockstepCallbacks, isSpectator = false) {
    this.localPlayerId = localPlayerId;
    this.isSpectator = isSpectator;
    this.callbacks = callbacks;
    this.sim = new VersusLockstepSim(0);
  }

  startMatch(payload: MatchStartPayload): void {
    this.matchSeed = payload.matchSeed >>> 0;
    this.inputDelay = payload.inputDelay;
    this.startFrame = payload.startFrame;
    this.simFrame = 0;
    this.p0Inputs.clear();
    this.p1Inputs.clear();
    this.remoteHashes.clear();
    this.framesWithoutAdvance = 0;
    this.sim.reset(this.matchSeed);
    this.phase = this.simFrame >= this.startFrame ? 'playing' : 'countdown';
  }

  get countdownFramesRemaining(): number {
    return Math.max(0, this.startFrame - this.simFrame);
  }

  submitLocalInput(frame: number, mask: number): void {
    if (this.isSpectator) return;
    const map = this.localPlayerId === 0 ? this.p0Inputs : this.p1Inputs;
    map.set(frame, (map.get(frame) ?? 0) | (mask & 0xff));
    this.callbacks.onSendMessage?.({
      type: NetMessageType.Input,
      payload: { frame, playerId: this.localPlayerId, mask: mask & 0xff },
    });
  }

  receiveMessage(msg: NetMessage): void {
    switch (msg.type) {
      case NetMessageType.MatchStart:
        this.startMatch(msg.payload);
        break;
      case NetMessageType.Input:
        this.receiveInput(msg.payload);
        break;
      case NetMessageType.HashCheckpoint:
        this.receiveHash(msg.payload.frame, msg.payload.hash0, msg.payload.hash1);
        break;
      case NetMessageType.RoundEnd:
        this.phase = 'ended';
        this.wins = [msg.payload.wins0, msg.payload.wins1];
        break;
      default:
        break;
    }
  }

  receiveInput(payload: InputPayload): void {
    const map = payload.playerId === 0 ? this.p0Inputs : this.p1Inputs;
    map.set(payload.frame, (map.get(payload.frame) ?? 0) | (payload.mask & 0xff));
  }

  receiveHash(frame: number, hash0: number, hash1: number): void {
    this.remoteHashes.set(frame, { hash0, hash1 });
    const local = this.sim.bothHashes();
    const remote = this.remoteHashes.get(frame);
    if (remote && (remote.hash0 !== local.hash0 || remote.hash1 !== local.hash1)) {
      this.phase = 'ended';
      this.callbacks.onDesync?.(frame, local, remote);
    }
  }

  /** Advance simulation by one frame if inputs are ready. Returns tick result or null. */
  tick(): VersusTickResult | null {
    if (this.phase === 'idle' || this.phase === 'ended') return null;

    if (this.phase === 'countdown') {
      if (this.simFrame >= this.startFrame) {
        this.phase = 'playing';
      } else {
        this.simFrame++;
        return null;
      }
    }

    const frame = this.simFrame;
    const p0 = this.p0Inputs.get(frame) ?? 0;
    const p1 = this.p1Inputs.get(frame) ?? 0;

    const needP0 = !this.p0Inputs.has(frame);
    const needP1 = !this.p1Inputs.has(frame);

    if (needP0 || needP1) {
      this.framesWithoutAdvance++;
      if (needP0) this.callbacks.onInputNeeded?.(frame, 0);
      if (needP1) this.callbacks.onInputNeeded?.(frame, 1);
      if (this.framesWithoutAdvance > INPUT_TIMEOUT_FRAMES) {
        this.phase = 'ended';
      }
      return null;
    }

    this.framesWithoutAdvance = 0;
    const result = this.sim.tick(p0, p1);
    this.simFrame++;

    if (this.simFrame % HASH_CHECK_INTERVAL === 0) {
      const hashes = this.sim.bothHashes();
      this.callbacks.onSendMessage?.({
        type: NetMessageType.HashCheckpoint,
        payload: { frame: this.simFrame, hash0: hashes.hash0, hash1: hashes.hash1 },
      });
      this.receiveHash(this.simFrame, hashes.hash0, hashes.hash1);
    }

    this.callbacks.onTick?.(result);

    if (result.gameOver0 || result.gameOver1) {
      let winner: 0 | 1 = 0;
      if (result.gameOver0 && !result.gameOver1) winner = 1;
      else if (result.gameOver1 && !result.gameOver0) winner = 0;
      else winner = result.gameOver0 ? 1 : 0;

      this.wins[winner]++;
      this.phase = 'ended';
      this.callbacks.onRoundEnd?.(winner);
      if (!this.isSpectator) {
        this.callbacks.onSendMessage?.({
          type: NetMessageType.RoundEnd,
          payload: { winner, wins0: this.wins[0], wins1: this.wins[1] },
        });
      }
    }

    return result;
  }

  /** Frame index to tag outgoing local inputs (current sim frame + delay). */
  get outboundInputFrame(): number {
    return this.simFrame + this.inputDelay;
  }

  getWins(): [number, number] {
    return this.wins;
  }
}
