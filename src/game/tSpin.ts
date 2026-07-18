import type { Piece } from './pieces.js';

export interface TSpinCorner {
  x: number;
  y: number;
}

export function evaluateTSpin(
  piece: Piece,
  getCell: (x: number, y: number) => number,
  playfieldWidth: number,
  playfieldHeight: number,
  corners: TSpinCorner[],
): boolean {
  if (piece.type !== 'T') {
    return false;
  }

  const px = piece.x;
  const py = piece.y;

  corners[0].x = px;
  corners[0].y = py;
  corners[1].x = px + 2;
  corners[1].y = py;
  corners[2].x = px;
  corners[2].y = py + 2;
  corners[3].x = px + 2;
  corners[3].y = py + 2;

  let occupied = 0;
  for (let i = 0; i < 4; i++) {
    const c = corners[i];
    if (c.x < 0 || c.x >= playfieldWidth || c.y >= playfieldHeight) {
      occupied++;
    } else if (c.y >= 0) {
      if (getCell(c.x, c.y) !== 0) {
        occupied++;
      }
    }
  }

  return occupied >= 3;
}
