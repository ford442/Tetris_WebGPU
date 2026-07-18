export interface PeerConnectionCallbacks {
  onDataChannelMessage?(data: ArrayBuffer): void;
  onDataChannelOpen?(): void;
  onIceCandidate?(candidate: RTCIceCandidateInit): void;
  onConnectionFailed?(): void;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

/**
 * Native RTCPeerConnection wrapper — ordered reliable data channel for game messages.
 */
export class TetrisPeerConnection {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private callbacks: PeerConnectionCallbacks;

  constructor(isHost: boolean, callbacks: PeerConnectionCallbacks) {
    this.callbacks = callbacks;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.callbacks.onIceCandidate?.(ev.candidate.toJSON());
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        this.callbacks.onConnectionFailed?.();
      }
    };

    if (isHost) {
      this.channel = this.pc.createDataChannel('game', { ordered: true });
      this.wireChannel(this.channel);
    } else {
      this.pc.ondatachannel = (ev) => {
        this.channel = ev.channel;
        this.wireChannel(this.channel);
      };
    }
  }

  private wireChannel(ch: RTCDataChannel): void {
    ch.binaryType = 'arraybuffer';
    ch.onopen = () => this.callbacks.onDataChannelOpen?.();
    ch.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        this.callbacks.onDataChannelMessage?.(ev.data);
      }
    };
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async setRemoteDescription(sdp: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(sdp);
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    try {
      await this.pc.addIceCandidate(candidate);
    } catch {
      /* stale candidates are ok */
    }
  }

  send(data: Uint8Array): boolean {
    if (!this.channel || this.channel.readyState !== 'open') return false;
    this.channel.send(data);
    return true;
  }

  get isOpen(): boolean {
    return this.channel?.readyState === 'open';
  }

  close(): void {
    this.channel?.close();
    this.pc.close();
  }
}
