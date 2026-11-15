/**
 * Active-piece collision / ghost queries, with the WASM fast path for standard 4-block
 * tetrominoes and the CPU CollisionDetector as fallback. Split out of game.ts.
 */

import type { Piece } from './pieces.js';
import type { CollisionDetector } from './collision.js';
import { WasmCore } from '../wasm/WasmCore.js';

export interface CollisionQueryHost {
  useWasmCollision: boolean;
  wasmBoardId: number;
  collisionDetector: CollisionDetector;
  /** Scratch buffer of the piece's 4 block coordinates (reused; never allocate per call). */
  collisionCoordsCache: { x: number; y: number }[];
}

export function hasCollisionPiece(host: CollisionQueryHost, piece: Piece): boolean {
    if (!host.useWasmCollision) {
      return host.collisionDetector.hasCollision(piece);
    }
    // --- WASM ACCELERATION ---
    let count = 0;
    
    const blocks = piece.blocks;
    for (let r = 0; r < blocks.length; r++) {
        for (let c = 0; c < blocks[r]!.length; c++) {
            if (blocks[r]![c] !== 0) {
                if (count < 4) {
                    host.collisionCoordsCache[count]!.x = c;
                    host.collisionCoordsCache[count]!.y = r;
                }
                count++;
            }
        }
    }
    
    // Only use WASM for standard tetrominoes (4 blocks)
    if (count === 4) {
        try {
            return WasmCore.get().checkCollision(host.collisionCoordsCache, piece.x, piece.y, host.wasmBoardId);
        } catch (_e) {
            // WASM not available or failed, fallback to JS
            return host.collisionDetector.hasCollision(piece);
        }
    }
    
    // Fallback for non-standard pieces
    return host.collisionDetector.hasCollision(piece);
}

export function getGhostY(host: CollisionQueryHost, piece: Piece): number {
    let count = 0;
    const blocks = piece.blocks;
    for (let r = 0; r < blocks.length; r++) {
      for (let c = 0; c < blocks[r]!.length; c++) {
        if (blocks[r]![c] !== 0) {
          if (count < 4) {
            host.collisionCoordsCache[count]!.x = c;
            host.collisionCoordsCache[count]!.y = r;
          }
          count++;
        }
      }
    }

    if (count === 4) {
      const core = WasmCore.get();
      if (core.hasHardDrop) {
        const dist = core.hardDropDistance(piece.x, piece.y, host.collisionCoordsCache, host.wasmBoardId);
        if (dist >= 0) return piece.y + dist;
      }
    }

    return host.collisionDetector.getGhostY(piece);
}
