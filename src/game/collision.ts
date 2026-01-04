/**
 * Collision Detection
 * Handles collision detection for pieces with the playfield and boundaries
 */

import { Piece } from './pieces.js';

export class CollisionDetector {
  private playfieldWidth: number;
  private playfieldHeight: number;

  constructor(private playfield: Int8Array | number[][]) {
    // Detect dimensions if it's a number[][] (legacy) or assume standard if Int8Array
    // Since we are transitioning, let's support both but prioritize Int8Array logic
    if (playfield instanceof Int8Array) {
        this.playfieldWidth = 10;
        this.playfieldHeight = 20;
    } else {
        this.playfieldHeight = playfield.length;
        this.playfieldWidth = playfield[0].length;
    }
  }

  updatePlayfield(playfield: Int8Array | number[][]): void {
    this.playfield = playfield;
  }

  // Helper to get cell value regardless of array type
  private getCell(x: number, y: number): number {
      if (this.playfield instanceof Int8Array) {
          return this.playfield[y * this.playfieldWidth + x];
      } else {
          return (this.playfield as number[][])[y][x];
      }
  }

  hasCollision(piece: Piece): boolean {
    const { x: pieceX, y: pieceY, blocks } = piece;

    // Optimization: Use bounds if available
    let bounds;
    if (piece.getBounds) {
        bounds = piece.getBounds();
    } else {
        // Fallback calculation
        let minX = blocks[0].length, maxX = 0;
        let minY = blocks.length, maxY = 0;
        for (let y = 0; y < blocks.length; y++) {
            for (let x = 0; x < blocks[y].length; x++) {
                if (blocks[y][x]) {
                    minX = Math.min(minX, x);
                    maxX = Math.max(maxX, x);
                    minY = Math.min(minY, y);
                    maxY = Math.max(maxY, y);
                }
            }
        }
        bounds = { minX, maxX, minY, maxY };
    }

    // Only iterate within bounds
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        if (blocks[y][x]) {
          const targetX = pieceX + x;
          const targetY = pieceY + y;

          // Check bounds
          if (targetX < 0 || targetX >= this.playfieldWidth || targetY >= this.playfieldHeight) {
            return true;
          }

          // Overlap with existing blocks
          // Note: targetY can be negative (above board), which is valid for non-overlap checks unless there are blocks there?
          // Usually playfield indices must be >= 0.
          if (targetY >= 0) {
              if (this.getCell(targetX, targetY) !== 0) {
                  return true;
              }
          }
        }
      }
    }
    return false;
  }

  getGhostY(piece: Piece): number {
    const originalY = piece.y;
    while (!this.hasCollision(piece)) {
      piece.y++;
    }
    const ghostY = piece.y - 1;
    piece.y = originalY;
    return ghostY;
  }
}
