/**
 * Collision Detection
 * Handles collision detection for pieces with the playfield and boundaries
 */

import { Piece } from './pieces.js';

export class CollisionDetector {
  constructor(private playfield: number[][]) {}

  updatePlayfield(playfield: number[][]): void {
    this.playfield = playfield;
  }

  hasCollision(piece: Piece): boolean {
    const { x: pieceX, y: pieceY, blocks } = piece;
    for (let y = 0; y < blocks.length; y++) {
      for (let x = 0; x < blocks[y].length; x++) {
        if (blocks[y][x]) {
          const targetX = pieceX + x;
          const targetY = pieceY + y;

          // Check bounds
          // Left/Right
          if (targetX < 0 || targetX >= this.playfield[0].length) {
            return true;
          }
          // Bottom
          if (targetY >= this.playfield.length) {
            return true;
          }

          // Overlap with existing blocks
          if (targetY >= 0 && this.playfield[targetY][targetX]) {
            return true;
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
