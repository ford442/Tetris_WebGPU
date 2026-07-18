# Versus Mode

## Local 2P (Phase A)

Split-screen local multiplayer on one keyboard with garbage attacks.

### Play

1. Select **Local 2P** in the mode dropdown.
2. Click **START**.
3. **P1:** Arrow keys, Space (hard drop), C/Shift (hold), X/Z (rotate).
4. **P2:** WASD, W (hard drop), Tab (hold), Q/E or K/L (rotate).
5. Clear 2+ lines to send garbage rows to your opponent.

## Online 2P (Phase B)

Ephemeral room-based online versus with lockstep simulation. No accounts.

### Play

1. Select **Online 2P** in the mode dropdown.
2. Click **START** — room overlay appears.
3. **Create Room** — share the 6-character code or copy link.
4. **Join** — enter room code on a second browser/device.
5. Both players use **arrow keys** (P1 = host, P2 = guest).
6. Match starts after WebRTC connects (or WS relay fallback).

### Share URLs

| URL | Role |
|-----|------|
| `?mode=online-versus&room=ABC123` | Auto-join as guest |
| `?mode=online-versus&spectate=ABC123` | Read-only spectator |

### Connection status

Badge top-right: **Connecting** → **P2P** (WebRTC) or **Relay** (WS fallback).

### Disconnect / rematch

- Opponent disconnect → overlay shows error; close to exit.
- Round end → click **Rematch** in pause menu (both must ready).
- Desync → hash mismatch pauses match; rematch recommended.

### Dev setup

```bash
# Terminal 1 — signaling server
npm run signaling:dev

# Terminal 2 — Vite
VITE_SIGNALING_URL=ws://localhost:8787 npm run dev
```

Deploy signaling Worker: see `workers/signaling/README.md`.

## Garbage rules (local + online)

| Lines cleared | Garbage sent |
|---------------|--------------|
| Single        | 0            |
| Double        | 1 row        |
| Triple        | 2 rows       |
| Tetris        | 4 rows       |

Garbage rows rise from the bottom with one random hole per row (deterministic seed online). Overflow at the top is a knockout.

## Performance

- Split view pulls the camera back and skips the single-board grid pass.
- Particle cap is **800** per session in 2P (see `SPLIT_PARTICLE_CAP`).
- Use **Medium** quality in Settings for mid-range GPUs.

## Architecture

| Module | Role |
|--------|------|
| `src/versus/VersusController.ts` | Local dual game loop, input, attacks |
| `src/versus/OnlineVersusController.ts` | Online lockstep + transport + render |
| `src/versus/VersusLockstepSim.ts` | Fixed 60 Hz dual-board simulation |
| `src/versus/garbageRng.ts` | Deterministic garbage hole columns |
| `src/versus/garbage.ts` | Attack math + playfield injection |
| `src/net/` | Signaling, WebRTC, codec, lockstep engine |
| `workers/signaling/` | Ephemeral WS room broker (CF Worker) |
| `src/webgpu/viewRenderLoop.ts` | Dual playfield passes, shared post-process |

Player 2 uses **WASM board 1** (`Game({ wasmBoardId: 1 })`) in the same shared memory as P1 (board 0).

### Lockstep model

- Both peers run identical `VersusLockstepSim` at 60 Hz.
- Exchange input bitmasks per frame (3-frame input delay default).
- Board hash checkpoint every 60 frames for desync detection.
- Garbage attacks computed locally from line clears (same rules as local).

## Manual test matrix (online)

- [ ] Host create → guest join → full match to knockout
- [ ] ICE blocked → relay fallback connects
- [ ] Guest disconnect mid-match → host sees overlay
- [ ] Spectator URL → read-only split view tracks match
- [ ] Rematch flow after round end
- [ ] Desync injection (dev) → overlay + pause
