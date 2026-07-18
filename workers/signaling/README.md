# Tetris Signaling Worker

Ephemeral WebSocket room broker for online versus (Phase B).

## Deploy

```bash
cd workers/signaling
npm install -g wrangler   # once
wrangler deploy
```

Set `VITE_SIGNALING_URL=wss://your-worker.workers.dev` in `.env` or production build env.

## Local dev

From repo root:

```bash
node scripts/dev-signaling-server.mjs
# ws://localhost:8787
```

Run Vite with:

```bash
VITE_SIGNALING_URL=ws://localhost:8787 npm run dev
```

## Protocol

JSON messages over WebSocket — see `src/net/types.ts` (`SignalingMessage`).

- `create` — host creates room, receives `{ code, peerId }`
- `join { code, role? }` — guest or spectator joins
- `signal { to, sdp | candidate }` — WebRTC signaling relay
- `relay { payload }` — base64 game message fallback

Rooms expire after 30 minutes. Max 1 guest + 1 spectator per room.
