// The slice of the Cloudflare Workers runtime that workers/signaling uses. Declared here
// instead of depending on all of @cloudflare/workers-types.

declare class WebSocketPair {
  0: WebSocket & { accept(): void };
  1: WebSocket;
}

interface ResponseInit {
  /** Workers-only: the client end of a WebSocketPair, returned with status 101. */
  webSocket?: WebSocket;
}
