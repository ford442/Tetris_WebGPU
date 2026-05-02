import { Piece } from './pieces.js';

interface PlayfieldProjectionParams {
  playfieldWidth: number;
  playfieldHeight: number;
  getCell: (x: number, y: number) => number;
  isGameOver: boolean;
  activePiece: Piece;
  ghostY: number;
  targetArray?: number[][];
}

export function buildPlayfieldProjection({
  playfieldWidth,
  playfieldHeight,
  getCell,
  isGameOver,
  activePiece,
  ghostY,
  targetArray
}: PlayfieldProjectionParams): number[][] {
  const playfield2D: number[][] = targetArray || [];

  // Initialize or reuse target array
  if (playfield2D.length !== playfieldHeight) {
    playfield2D.length = 0;
    for (let y = 0; y < playfieldHeight; y++) {
      playfield2D.push(new Array(playfieldWidth).fill(0));
    }
  } else {
    // Ensure inner arrays match length
    for (let y = 0; y < playfieldHeight; y++) {
      if (playfield2D[y].length !== playfieldWidth) {
        for(let x=0; x<playfieldWidth; x++){playfield2D[y][x]=0;}
      }
    }
  }

  for (let y = 0; y < playfieldHeight; y++) {
    for (let x = 0; x < playfieldWidth; x++) {
      playfield2D[y][x] = getCell(x, y);
    }
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
