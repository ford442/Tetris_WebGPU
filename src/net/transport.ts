import { encodeNetMessage, decodeNetMessage, netMessageToBase64, netMessageFromBase64 } from './codec.js';
import type { NetMessage } from './types.js';
import type { GameTransport } from './session.js';
import { type SignalingClient } from './signalingClient.js';
import { TetrisPeerConnection } from './peerConnection.js';
import type { SignalingMessage } from './types.js';

export type TransportMessageHandler = (msg: NetMessage) => void;

export interface CombinedTransportOptions {
  signaling: SignalingClient;
  isHost: boolean;
  remotePeerId: string;
  onMessage: TransportMessageHandler;
  onModeChange: (mode: 'webrtc' | 'relay') => void;
}

/**
 * WebRTC data channel primary, WS relay fallback via signaling server.
 */
export class CombinedTransport implements GameTransport {
  private signaling: SignalingClient;
  private peer: TetrisPeerConnection | null = null;
  private onMessage: TransportMessageHandler;
  private onModeChange: (mode: 'webrtc' | 'relay') => void;
  private remotePeerId: string;
  private isHost: boolean;
  private mode: 'none' | 'webrtc' | 'relay' = 'none';
  private iceTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: CombinedTransportOptions) {
    this.signaling = opts.signaling;
    this.isHost = opts.isHost;
    this.remotePeerId = opts.remotePeerId;
    this.onMessage = opts.onMessage;
    this.onModeChange = opts.onModeChange;
  }

  async startWebRTC(): Promise<void> {
    this.peer = new TetrisPeerConnection(this.isHost, {
      onDataChannelMessage: (data) => {
        try {
          this.onMessage(decodeNetMessage(data));
        } catch {
          /* ignore */
        }
      },
      onDataChannelOpen: () => {
        if (this.iceTimeout) clearTimeout(this.iceTimeout);
        this.mode = 'webrtc';
        this.onModeChange('webrtc');
      },
      onIceCandidate: (candidate) => {
        this.signaling.relaySignal(this.remotePeerId, { candidate });
      },
      onConnectionFailed: () => this.fallbackToRelay(),
    });

    this.iceTimeout = setTimeout(() => {
      if (this.mode !== 'webrtc') this.fallbackToRelay();
    }, 8000);

    if (this.isHost) {
      const offer = await this.peer.createOffer();
      this.signaling.relaySignal(this.remotePeerId, { sdp: offer });
    }
  }

  handleSignal(msg: Extract<SignalingMessage, { type: 'signal' }>): void {
    if (!this.peer) return;
    void (async () => {
      if (msg.sdp) {
        await this.peer!.setRemoteDescription(msg.sdp);
        if (!this.isHost && msg.sdp.type === 'offer') {
          const answer = await this.peer!.createAnswer();
          this.signaling.relaySignal(msg.from, { sdp: answer });
        }
      }
      if (msg.candidate) {
        await this.peer!.addIceCandidate(msg.candidate);
      }
    })();
  }

  handleRelay(msg: Extract<SignalingMessage, { type: 'relay' }>): void {
    if (this.mode === 'webrtc') return;
    try {
      this.onMessage(netMessageFromBase64(msg.payload));
    } catch {
      /* ignore */
    }
  }

  private fallbackToRelay(): void {
    if (this.mode === 'relay') return;
    this.mode = 'relay';
    this.onModeChange('relay');
  }

  send(msg: NetMessage): void {
    const bytes = encodeNetMessage(msg);
    if (this.mode === 'webrtc' && this.peer?.send(bytes)) return;
    this.signaling.relayPayload(netMessageToBase64(msg));
  }

  close(): void {
    if (this.iceTimeout) clearTimeout(this.iceTimeout);
    this.peer?.close();
    this.signaling.close();
  }
}

/** Simple relay-only transport (spectators, forced fallback). */
export class RelayTransport implements GameTransport {
  constructor(
    private signaling: SignalingClient,
    private onMessage: TransportMessageHandler,
  ) {
    /* relay handled externally via handleRelay */
  }

  send(msg: NetMessage): void {
    this.signaling.relayPayload(netMessageToBase64(msg));
  }

  handleRelay(payload: string): void {
    try {
      this.onMessage(netMessageFromBase64(payload));
    } catch {
      /* ignore */
    }
  }

  close(): void {
    this.signaling.close();
  }
}
