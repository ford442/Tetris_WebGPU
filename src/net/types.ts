/** Binary game message types (data channel / WS relay). */
export const NetMessageType = {
  MatchStart: 1,
  Input: 2,
  HashCheckpoint: 3,
  RoundEnd: 4,
  Rematch: 5,
  Disconnect: 6,
} as const;

export type NetMessageTypeId = (typeof NetMessageType)[keyof typeof NetMessageType];

export const DEFAULT_INPUT_DELAY = 3;
export const HASH_CHECK_INTERVAL = 60;
export const INPUT_TIMEOUT_FRAMES = 120;

export type SessionPhase =
  | 'idle'
  | 'connecting'
  | 'waiting'
  | 'countdown'
  | 'playing'
  | 'ended'
  | 'desynced'
  | 'disconnected';

export type PeerRole = 'host' | 'guest' | 'spectator';

export type TransportMode = 'none' | 'webrtc' | 'relay';

export interface MatchStartPayload {
  matchSeed: number;
  p0Seed: number;
  p1Seed: number;
  inputDelay: number;
  startFrame: number;
}

export interface InputPayload {
  frame: number;
  playerId: 0 | 1;
  mask: number;
}

export interface HashCheckpointPayload {
  frame: number;
  hash0: number;
  hash1: number;
}

export interface RoundEndPayload {
  winner: 0 | 1;
  wins0: number;
  wins1: number;
}

export interface RematchPayload {
  ready: boolean;
}

export interface DisconnectPayload {
  reason: DisconnectReasonId;
}

export const DisconnectReason = {
  Left: 0,
  Timeout: 1,
  Desync: 2,
  Error: 3,
} as const;

export type DisconnectReasonId = (typeof DisconnectReason)[keyof typeof DisconnectReason];

export type NetMessage =
  | { type: typeof NetMessageType.MatchStart; payload: MatchStartPayload }
  | { type: typeof NetMessageType.Input; payload: InputPayload }
  | { type: typeof NetMessageType.HashCheckpoint; payload: HashCheckpointPayload }
  | { type: typeof NetMessageType.RoundEnd; payload: RoundEndPayload }
  | { type: typeof NetMessageType.Rematch; payload: RematchPayload }
  | { type: typeof NetMessageType.Disconnect; payload: DisconnectPayload };

/** Signaling messages (JSON over WebSocket). */
export type SignalingMessage =
  | { type: 'create' }
  | { type: 'join'; code: string; role?: 'guest' | 'spectator' }
  | { type: 'created'; code: string; peerId: string }
  | { type: 'joined'; code: string; peerId: string; role: PeerRole; isHost: boolean; hostPeerId?: string }
  | { type: 'peer_joined'; peerId: string; role: PeerRole }
  | { type: 'peer_left'; peerId: string }
  | { type: 'signal'; to: string; from: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
  | { type: 'relay'; from: string; payload: string }
  | { type: 'error'; message: string };
