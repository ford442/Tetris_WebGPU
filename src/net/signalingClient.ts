import type { SignalingMessage } from './types.js';

export type SignalingHandler = (msg: SignalingMessage) => void;

export function getSignalingUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
  return env?.VITE_SIGNALING_URL ?? 'ws://localhost:8787';
}

export class SignalingClient {
  private ws: WebSocket | null = null;
  private handler: SignalingHandler;
  private url: string;

  onOpen: (() => void) | null = null;
  onClose: (() => void) | null = null;

  constructor(handler: SignalingHandler, url?: string) {
    this.handler = handler;
    this.url = url ?? getSignalingUrl();
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (e) {
        reject(e);
        return;
      }

      this.ws.onopen = () => {
        this.onOpen?.();
        resolve();
      };
      this.ws.onerror = () => reject(new Error('WebSocket connection failed'));
      this.ws.onclose = () => this.onClose?.();
      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as SignalingMessage;
          this.handler(msg);
        } catch {
          /* ignore malformed */
        }
      };
    });
  }

  send(msg: SignalingMessage): void {
    this.ws?.send(JSON.stringify(msg));
  }

  createRoom(): void {
    this.send({ type: 'create' });
  }

  joinRoom(code: string, role: 'guest' | 'spectator' = 'guest'): void {
    this.send({ type: 'join', code, role });
  }

  relaySignal(to: string, data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }): void {
    this.send({ type: 'signal', to, from: '', ...data });
  }

  relayPayload(payload: string): void {
    this.send({ type: 'relay', from: '', payload });
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
