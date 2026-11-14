import type { Piece } from './pieces.js';

export interface TSpinCorner {
  x: number;
  y: number;
}

export type TSpinResult = 'none' | 'mini' | 'normal';

export function evaluateTSpin(
  piece: Piece,
  getCell: (x: number, y: number) => number,
  playfieldWidth: number,
  playfieldHeight: number,
  corners: TSpinCorner[],
  kickIndex: number = -1,
): TSpinResult {
  if (piece.type !== 'T') {
    return 'none';
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

  const isCornerOccupied = (x: number, y: number) => {
    if (x < 0 || x >= playfieldWidth || y >= playfieldHeight) return true;
    if (y < 0) return false;
    return getCell(x, y) !== 0;
  };

  const c0 = isCornerOccupied(corners[0].x, corners[0].y); // Top-Left
  const c1 = isCornerOccupied(corners[1].x, corners[1].y); // Top-Right
  const c2 = isCornerOccupied(corners[2].x, corners[2].y); // Bottom-Left
  const c3 = isCornerOccupied(corners[3].x, corners[3].y); // Bottom-Right

  let occupied = 0;
  if (c0) occupied++;
  if (c1) occupied++;
  if (c2) occupied++;
  if (c3) occupied++;

  if (occupied < 3) {
    return 'none';
  }

  let frontOccupied = 0;
  switch (piece.rotation) {
    case 0: // Pointing Up, Top corners are front
      if (c0) frontOccupied++;
      if (c1) frontOccupied++;
      break;
    case 1: // Pointing Right, Right corners are front (Top Right, Bottom Right)
      if (c1) frontOccupied++;
      if (c3) frontOccupied++;
      break;
    case 2: // Pointing Down, Bottom corners are front
      if (c2) frontOccupied++;
      if (c3) frontOccupied++;
      break;
    case 3: // Pointing Left, Left corners are front
      if (c0) frontOccupied++;
      if (c2) frontOccupied++;
      break;
  }

  if (frontOccupied === 2) {
    return 'normal';
  } else if (frontOccupied === 1 && occupied >= 3) {
    if (kickIndex === 4) { // Kick test 5 (index 4) promotes to normal
      return 'normal';
    }
    return 'mini';
  }

  return 'none';
}
