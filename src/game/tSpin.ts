import type { Piece } from './pieces.js';

export interface TSpinCorner {
  x: number;
  y: number;
}

export type TSpinResult = 'none' | 'normal' | 'mini';

export function evaluateTSpin(
  piece: Piece,
  getCell: (x: number, y: number) => number,
  playfieldWidth: number,
  playfieldHeight: number,
  corners: TSpinCorner[],
  lastKickIndex: number = 0,
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

  let occupied = 0;
  let frontOccupied = 0;

  // Assuming corners 0 and 1 are "front" corners based on rotation state
  // We need to map rotation state to the correct front corners
  let front1 = 0, front2 = 1;
  switch (piece.rotation) {
    case 0: front1 = 0; front2 = 1; break; // A, B
    case 1: front1 = 1; front2 = 3; break; // B, D
    case 2: front1 = 3; front2 = 2; break; // D, C
    case 3: front1 = 2; front2 = 0; break; // C, A
  }

  for (let i = 0; i < 4; i++) {
    const c = corners[i];
    let isOccupied = false;
    if (c.x < 0 || c.x >= playfieldWidth || c.y >= playfieldHeight) {
      isOccupied = true;
    } else if (c.y >= 0) {
      if (getCell(c.x, c.y) !== 0) {
        isOccupied = true;
      }
    }

    if (isOccupied) {
      occupied++;
      if (i === front1 || i === front2) {
        frontOccupied++;
      }
    }
  }

  if (occupied >= 3) {
    if (frontOccupied >= 2 || lastKickIndex === 4) {
      return 'normal';
    } else {
      return 'mini';
    }
  }

  return 'none';
}
