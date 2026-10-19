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
  kickIndex: number = 0,
): TSpinResult {
  if (piece.type !== 'T') {
    return 'none';
  }

  const px = piece.x;
  const py = piece.y;

  // A-B
  // | |
  // C-D
  // 0: top-left, 1: top-right, 2: bottom-left, 3: bottom-right
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

  if (occupied < 3) {
    return 'none';
  }

  // T-Spin Mini rules
  // 3 corners must be filled.
  // Both front corners -> 'normal'
  // 1 front + 2 back corners -> 'mini'
  // Special exception: if the last kick used was kick test 5 (index 4), it promotes to 'normal'

  if (kickIndex === 4) {
    return 'normal';
  }

  let front1, front2;
  switch (piece.rotation) {
    case 0: // Spawn state (flat side up) - A & B are front
      front1 = 0; front2 = 1; break;
    case 1: // Right state - B & D are front
      front1 = 1; front2 = 3; break;
    case 2: // Double rotation (flat side down) - C & D are front
      front1 = 2; front2 = 3; break;
    case 3: // Left state - A & C are front
      front1 = 0; front2 = 2; break;
    default:
      front1 = 0; front2 = 1; break;
  }

  let frontCornersFilled = 0;
  for (const f of [front1, front2]) {
    const c = corners[f];
    if (c.x < 0 || c.x >= playfieldWidth || c.y >= playfieldHeight) {
      frontCornersFilled++;
    } else if (c.y >= 0 && getCell(c.x, c.y) !== 0) {
      frontCornersFilled++;
    }
  }

  if (frontCornersFilled === 2) {
    return 'normal';
  } else {
    return 'mini';
  }
}
