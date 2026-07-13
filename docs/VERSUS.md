# Local 2P Versus (Phase A)

Split-screen local multiplayer on one keyboard with garbage attacks. Phase B (WebRTC) is planned separately.

## Play

1. Select **Local 2P** in the mode dropdown.
2. Click **START**.
3. **P1:** Arrow keys, Space (hard drop), C/Shift (hold), X/Z (rotate).
4. **P2:** WASD, W (hard drop), Tab (hold), Q/E or K/L (rotate).
5. Clear 2+ lines to send garbage rows to your opponent.

## Garbage rules

| Lines cleared | Garbage sent |
|---------------|--------------|
| Single        | 0            |
| Double        | 1 row        |
| Triple        | 2 rows       |
| Tetris        | 4 rows       |

Garbage rows rise from the bottom with one random hole per row. Overflow at the top is a knockout.

## Performance

- Split view pulls the camera back and skips the single-board grid pass.
- Particle cap is **800** per session in 2P (see `SPLIT_PARTICLE_CAP`).
- Use **Medium** quality in Settings for mid-range GPUs.

## Architecture

| Module | Role |
|--------|------|
| `src/versus/VersusController.ts` | Dual game loop, input, attacks |
| `src/versus/garbage.ts` | Attack math + playfield injection |
| `src/versus/inputMaps.ts` | P1/P2 key maps |
| `src/versus/splitScreen.ts` | Board world offsets, particle budget |
| `src/webgpu/viewRenderLoop.ts` | Dual playfield passes, shared post-process |

Player 2 uses a **private playfield** (`Game({ dedicatedPlayfield: true })`) because WASM collision memory is single-board.

## Phase B (not implemented)

- Ephemeral WebRTC rooms + lockstep delay
- Spectator view
- Evaluate minimal WS signaling or PeerJS — no heavy netcode libs
