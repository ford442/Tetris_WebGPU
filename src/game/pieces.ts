/**
 * Tetromino Pieces
 * Defines piece types, creation, and bag generation system
 */

export interface Piece {
  blocks: number[][];
  x: number;
  y: number;
  rotation: number; // 0: Spawn, 1: Right, 2: 180, 3: Left
  type: string;
  getBounds?(): { minX: number, maxX: number, minY: number, maxY: number };
}

export class PieceGenerator {
  private bag: string[] = [];

  createPieceByType(type: string): Piece {
    const piece: Piece = { blocks: [], x: 0, y: 0, rotation: 0, type };
    switch (type) {
      case 'I':
        piece.blocks = [
          [0, 0, 0, 0],
          [1, 1, 1, 1],
          [0, 0, 0, 0],
          [0, 0, 0, 0]
        ];
        break;
      case 'J':
        piece.blocks = [
          [2, 0, 0],
          [2, 2, 2],
          [0, 0, 0]
        ];
        break;
      case 'L':
        piece.blocks = [
          [0, 0, 3],
          [3, 3, 3],
          [0, 0, 0]
        ];
        break;
      case 'O':
        piece.blocks = [
          [0, 0, 0, 0],
          [0, 4, 4, 0],
          [0, 4, 4, 0],
          [0, 0, 0, 0]
        ];
        break;
      case 'S':
        piece.blocks = [
          [0, 5, 5],
          [5, 5, 0],
          [0, 0, 0]
        ];
        break;
      case 'T':
        piece.blocks = [
          [0, 6, 0],
          [6, 6, 6],
          [0, 0, 0]
        ];
        break;
      case 'Z':
        piece.blocks = [
          [7, 7, 0],
          [0, 7, 7],
          [0, 0, 0]
        ];
        break;
      default:
        throw new Error('Something went wrong!');
    }
    piece.x = Math.floor((10 - piece.blocks[0].length) / 2);
    piece.y = -2;

    // Attach getBounds method
    piece.getBounds = function() {
      let minX = this.blocks[0].length, maxX = 0;
      let minY = this.blocks.length, maxY = 0;

      for (let y = 0; y < this.blocks.length; y++) {
        for (let x = 0; x < this.blocks[y].length; x++) {
          if (this.blocks[y][x]) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
      return { minX, maxX, minY, maxY };
    };

    return piece;
  }

  createPiece(): Piece {
    if (this.bag.length === 0) {
      this.generateBag();
    }
    const type = this.bag.shift()!;
    return this.createPieceByType(type);
  }

  generateBag(): void {
    const pieces = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    // Shuffle
    for (let i = pieces.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    this.bag.push(...pieces);
  }

  resetPiecePosition(piece: Piece): void {
    piece.x = Math.floor((10 - piece.blocks[0].length) / 2);
    piece.y = -2;
    piece.rotation = 0;

    // Re-create blocks based on type to reset rotation
    const freshPiece = this.createPieceByType(piece.type);
    piece.blocks = freshPiece.blocks;
    // ensure method is attached to reused object if needed, or just copy blocks
    if (freshPiece.getBounds) {
        piece.getBounds = freshPiece.getBounds;
    }
  }
}
