import { generateReplaySeed } from '../replay/recorder.js';
import {
  DEFAULT_INPUT_DELAY,
  NetMessageType,
  type DisconnectReasonId,
  type MatchStartPayload,
  type PeerRole,
  type SessionPhase,
  type SignalingMessage,
  type TransportMode,
} from './types.js';
import { LockstepEngine, type LockstepCallbacks } from './lockstepEngine.js';
import type { NetMessage } from './types.js';

export interface SessionCallbacks extends LockstepCallbacks {
  onPhaseChange?(phase: SessionPhase): void;
  onRoomCode?(code: string): void;
  onTransportMode?(mode: TransportMode): void;
  onPeerJoined?(peerId: string, role: PeerRole): void;
  onError?(message: string): void;
}

export interface GameTransport {
  send(msg: NetMessage): void;
  close(): void;
}

/**
 * Room lifecycle: idle → connecting → waiting → countdown → playing → ended.
 */
export class OnlineSession {
  phase: SessionPhase = 'idle';
  roomCode = '';
  peerId = '';
  role: PeerRole = 'host';
  transportMode: TransportMode = 'none';

  readonly lockstep: LockstepEngine;
  private transport: GameTransport | null = null;
  private callbacks: SessionCallbacks;
  private guestReady = false;
  private hostReady = false;

  constructor(role: PeerRole, callbacks: SessionCallbacks, isSpectator = false) {
    this.role = role;
    const playerId: 0 | 1 = role === 'guest' ? 1 : 0;
    this.lockstep = new LockstepEngine(isSpectator ? 0 : playerId, {
      ...callbacks,
      onSendMessage: (msg) => this.send(msg),
    }, isSpectator);
    this.callbacks = callbacks;
  }

  setTransport(transport: GameTransport, mode: TransportMode): void {
    this.transport = transport;
    this.transportMode = mode;
    this.callbacks.onTransportMode?.(mode);
  }

  private setPhase(phase: SessionPhase): void {
    this.phase = phase;
    this.callbacks.onPhaseChange?.(phase);
  }

  handleSignaling(msg: SignalingMessage): void {
    switch (msg.type) {
      case 'created':
        this.roomCode = msg.code;
        this.peerId = msg.peerId;
        this.setPhase('waiting');
        this.callbacks.onRoomCode?.(msg.code);
        break;
      case 'joined':
        this.roomCode = msg.code;
        this.peerId = msg.peerId;
        this.role = msg.role;
        this.setPhase('waiting');
        this.callbacks.onRoomCode?.(msg.code);
        break;
      case 'peer_joined':
        this.callbacks.onPeerJoined?.(msg.peerId, msg.role);
        if (this.role === 'host' && msg.role === 'guest') {
          this.guestReady = true;
        }
        break;
      case 'peer_left':
        this.setPhase('disconnected');
        break;
      case 'error':
        this.callbacks.onError?.(msg.message);
        break;
      default:
        break;
    }
  }

  receiveGameMessage(msg: NetMessage): void {
    this.lockstep.receiveMessage(msg);
    if (msg.type === NetMessageType.MatchStart) {
      this.setPhase('countdown');
    }
    if (msg.type === NetMessageType.RoundEnd) {
      this.setPhase('ended');
    }
  }

  send(msg: NetMessage): void {
    this.transport?.send(msg);
  }

  /** Host starts match after guest connected. */
  beginMatch(countdownFrames = 180): void {
    if (this.role !== 'host') return;
    this.hostReady = false;
    this.guestReady = false;
    const matchSeed = generateReplaySeed();
    const payload: MatchStartPayload = {
      matchSeed,
      p0Seed: matchSeed >>> 0,
      p1Seed: (matchSeed + 1) >>> 0,
      inputDelay: DEFAULT_INPUT_DELAY,
      startFrame: countdownFrames,
    };
    const msg: NetMessage = { type: NetMessageType.MatchStart, payload };
    this.lockstep.startMatch(payload);
    this.send(msg);
    this.setPhase('countdown');
  }

  requestRematch(): void {
    this.send({ type: NetMessageType.Rematch, payload: { ready: true } });
    if (this.role === 'host') {
      this.hostReady = true;
      if (this.guestReady) this.beginMatch();
    } else {
      this.guestReady = true;
    }
  }

  handleRematch(msg: Extract<NetMessage, { type: typeof NetMessageType.Rematch }>): void {
    if (msg.payload.ready) {
      if (this.role === 'host') {
        this.guestReady = true;
        if (this.hostReady) this.beginMatch();
      } else {
        this.hostReady = true;
      }
    }
  }

  disconnect(reason: DisconnectReasonId): void {
    this.send({ type: NetMessageType.Disconnect, payload: { reason } });
    this.transport?.close();
    this.setPhase('disconnected');
  }

  tick(): void {
    this.lockstep.tick();
    if (this.phase === 'countdown' && this.lockstep.phase === 'playing') {
      this.setPhase('playing');
    }
  }
}
