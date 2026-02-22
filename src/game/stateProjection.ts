import { Piece } from './pieces.js';

interface PlayfieldProjectionParams {
  playfieldWidth: number;
  playfieldHeight: number;
  getCell: (x: number, y: number) => number;
  isGameOver: boolean;
  activePiece: Piece;
  ghostY: number;
}

export function buildPlayfieldProjection({
  playfieldWidth,
  playfieldHeight,
  getCell,
  isGameOver,
  activePiece,
  ghostY,
}: PlayfieldProjectionParams): number[][] {
  const playfield2D: number[][] = [];
  for (let y = 0; y < playfieldHeight; y++) {
    const row = new Array(playfieldWidth);
    for (let x = 0; x < playfieldWidth; x++) {
      row[x] = getCell(x, y);
    }
    playfield2D.push(row);
  }

  if (!isGameOver) {
    const { x: pieceX, blocks } = activePiece;

    for (let y = 0; y < blocks.length; y++) {
      for (let x = 0; x < blocks[y].length; x++) {
        if (blocks[y][x]) {
          const targetY = ghostY + y;
          const targetX = pieceX + x;
          if (targetY >= 0 && targetY < playfieldHeight &&
            targetX >= 0 && targetX < playfieldWidth) {
            if (playfield2D[targetY][targetX] === 0) {
              playfield2D[targetY][targetX] = -blocks[y][x];
            }
          }
        }
      }
    }

    const { y: pY, x: pX } = activePiece;
    for (let y = 0; y < blocks.length; y++) {
      for (let x = 0; x < blocks[y].length; x++) {
        if (blocks[y][x]) {
          const targetY = pY + y;
          const targetX = pX + x;
          if (targetY >= 0 && targetY < playfieldHeight &&
            targetX >= 0 && targetX < playfieldWidth) {
            playfield2D[targetY][targetX] = blocks[y][x];
          }
        }
      }
    }
  }

  return playfield2D;
}
