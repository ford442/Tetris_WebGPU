#!/usr/bin/env node
/**
 * Local WebSocket signaling server mirroring workers/signaling/index.ts logic.
 * Usage: node scripts/dev-signaling-server.mjs [--port 8787]
 */

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.argv.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 8787);
const ROOM_TTL_MS = 30 * 60 * 1000;
const CODE_LENGTH = 6;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** @type {Map<string, { code: string; host: any; guest: any; spectator: any; createdAt: number }>} */
const rooms = new Map();

function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return rooms.has(code) ? generateCode() : code;
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, except) {
  for (const p of [room.host, room.guest, room.spectator]) {
    if (p && p.id !== except) send(p.ws, msg);
  }
}

function removePeer(room, peerId) {
  if (room.guest?.id === peerId) room.guest = null;
  if (room.spectator?.id === peerId) room.spectator = null;
  if (room.host.id === peerId) {
    rooms.delete(room.code);
    return;
  }
  if (!room.guest && !room.spectator) rooms.delete(room.code);
  else broadcast(room, { type: 'peer_left', peerId });
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Tetris signaling — connect via WebSocket\n');
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  const peerId = crypto.randomUUID();
  /** @type {typeof rooms extends Map<string, infer R> ? R : never | null} */
  let room = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(String(data));

      if (msg.type === 'create') {
        const code = generateCode();
        const host = { id: peerId, ws, role: 'host' };
        room = { code, host, guest: null, spectator: null, createdAt: Date.now() };
        rooms.set(code, room);
        send(ws, { type: 'created', code, peerId });
        return;
      }

      if (msg.type === 'join') {
        const code = String(msg.code ?? '').toUpperCase();
        room = rooms.get(code) ?? null;
        if (!room) {
          send(ws, { type: 'error', message: 'Room not found' });
          return;
        }
        const wantRole = msg.role === 'spectator' ? 'spectator' : 'guest';
        if (wantRole === 'guest' && room.guest) {
          send(ws, { type: 'error', message: 'Room full' });
          return;
        }
        if (wantRole === 'spectator' && room.spectator) {
          send(ws, { type: 'error', message: 'Spectator slot taken' });
          return;
        }
        const peer = { id: peerId, ws, role: wantRole };
        if (wantRole === 'guest') room.guest = peer;
        else room.spectator = peer;
        send(ws, { type: 'joined', code, peerId, role: wantRole, isHost: false, hostPeerId: room.host.id });
        broadcast(room, { type: 'peer_joined', peerId, role: wantRole }, peerId);
        send(room.host.ws, { type: 'peer_joined', peerId, role: wantRole });
        return;
      }

      if (msg.type === 'signal' && room) {
        const peers = [room.host, room.guest, room.spectator].filter(Boolean);
        const target = peers.find((p) => p.id === msg.to);
        if (target) send(target.ws, { type: 'signal', from: peerId, to: msg.to, sdp: msg.sdp, candidate: msg.candidate });
        return;
      }

      if (msg.type === 'relay' && room) {
        broadcast(room, { type: 'relay', from: peerId, payload: msg.payload }, peerId);
      }
    } catch {
      send(ws, { type: 'error', message: 'Invalid message' });
    }
  });

  ws.on('close', () => {
    if (room) removePeer(room, peerId);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (now - r.createdAt > ROOM_TTL_MS) rooms.delete(code);
  }
}, 60_000);

httpServer.listen(PORT, () => {
  console.log(`Signaling server ws://localhost:${PORT}`);
});
