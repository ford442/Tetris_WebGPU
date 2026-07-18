/**
 * Cloudflare Worker — ephemeral WebSocket signaling for online versus.
 * Deploy: npx wrangler deploy (see README.md)
 */

const ROOM_TTL_MS = 30 * 60 * 1000;
const CODE_LENGTH = 6;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

interface Peer {
  id: string;
  ws: WebSocket;
  role: 'host' | 'guest' | 'spectator';
}

interface Room {
  code: string;
  host: Peer;
  guest: Peer | null;
  spectator: Peer | null;
  createdAt: number;
}

/** @type {Map<string, Room>} */
const rooms = new Map();

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return rooms.has(code) ? generateCode() : code;
}

function generatePeerId(): string {
  return crypto.randomUUID();
}

function send(ws: WebSocket, msg: unknown): void {
  ws.send(JSON.stringify(msg));
}

function broadcast(room: Room, msg: unknown, except?: string): void {
  const peers = [room.host, room.guest, room.spectator].filter(Boolean) as Peer[];
  for (const p of peers) {
    if (p.id !== except) send(p.ws, msg);
  }
}

function cleanupExpired(): void {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > ROOM_TTL_MS) rooms.delete(code);
  }
}

function removePeer(room: Room, peerId: string): void {
  if (room.guest?.id === peerId) room.guest = null;
  if (room.spectator?.id === peerId) room.spectator = null;
  const remaining = [room.guest, room.spectator].filter(Boolean);
  if (room.host.id === peerId || remaining.length === 0) {
    rooms.delete(room.code);
  } else {
    broadcast(room, { type: 'peer_left', peerId });
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('ok');
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('WebSocket expected', { status: 426 });
    }

    cleanupExpired();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    let peerId = generatePeerId();
    let room: Room | null = null;

    server.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as Record<string, unknown>;

        if (msg.type === 'create') {
          const code = generateCode();
          const host: Peer = { id: peerId, ws: server, role: 'host' };
          room = { code, host, guest: null, spectator: null, createdAt: Date.now() };
          rooms.set(code, room);
          send(server, { type: 'created', code, peerId });
          return;
        }

        if (msg.type === 'join') {
          const code = String(msg.code ?? '').toUpperCase();
          room = rooms.get(code) ?? null;
          if (!room) {
            send(server, { type: 'error', message: 'Room not found' });
            return;
          }

          const wantRole = msg.role === 'spectator' ? 'spectator' : 'guest';
          if (wantRole === 'guest' && room.guest) {
            send(server, { type: 'error', message: 'Room full' });
            return;
          }
          if (wantRole === 'spectator' && room.spectator) {
            send(server, { type: 'error', message: 'Spectator slot taken' });
            return;
          }

          const peer: Peer = { id: peerId, ws: server, role: wantRole };
          if (wantRole === 'guest') room.guest = peer;
          else room.spectator = peer;

          send(server, {
            type: 'joined',
            code,
            peerId,
            role: wantRole,
            isHost: false,
            hostPeerId: room.host.id,
          });
          broadcast(room, { type: 'peer_joined', peerId, role: wantRole }, peerId);
          send(room.host.ws, { type: 'peer_joined', peerId, role: wantRole });
          return;
        }

        if (msg.type === 'signal' && room) {
          const to = String(msg.to ?? '');
          const peers = [room.host, room.guest, room.spectator].filter(Boolean) as Peer[];
          const target = peers.find((p) => p.id === to);
          if (target) {
            send(target.ws, {
              type: 'signal',
              from: peerId,
              to,
              sdp: msg.sdp,
              candidate: msg.candidate,
            });
          }
          return;
        }

        if (msg.type === 'relay' && room) {
          broadcast(room, { type: 'relay', from: peerId, payload: msg.payload }, peerId);
          return;
        }
      } catch {
        send(server, { type: 'error', message: 'Invalid message' });
      }
    });

    server.addEventListener('close', () => {
      if (room) removePeer(room, peerId);
    });

    return new Response(null, { status: 101, webSocket: client });
  },
};
