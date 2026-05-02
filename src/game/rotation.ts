/**
 * SRS Rotation System
 * Implements the Super Rotation System with wall kicks
 */

import { Piece } from './pieces.js';

// SRS Wall Kick Data for J, L, S, T, Z pieces
export const SRS_KICKS_JLSTZ: { [key: string]: number[][] } = {
  '0-1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1-0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1-2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2-1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2-3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3-2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3-0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0-3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]
};

// SRS Wall Kick Data for I piece
export const SRS_KICKS_I: { [key: string]: number[][] } = {
  '0-1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1-0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1-2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2-1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2-3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3-2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3-0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0-3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]]
};

export function rotatePieceBlocks(blocks: number[][], clockwise: boolean, targetArray?: number[][]): number[][] {
  const length = blocks.length;
  const temp: number[][] = targetArray || [];

  // Initialize or resize target array avoiding GC if possible
  if (temp.length !== length) {
    temp.length = 0;
    for (let i = 0; i < length; i++) {
      temp.push(new Array(length).fill(0));
    }
  } else {
    // Ensure inner arrays match length
    for (let i = 0; i < length; i++) {
      if (temp[i].length !== length) {
        temp[i].length = length;
        for(let j=0; j<length; j++) temp[i][j] = 0;
      }
    }
  }

  // Perform basic rotation
  if (clockwise) {
    for (let y = 0; y < length; y++) {
      for (let x = 0; x < length; x++) {
        temp[x][y] = blocks[length - 1 - y][x];
      }
    }
  } else {
    for (let y = 0; y < length; y++) {
      for (let x = 0; x < length; x++) {
        temp[x][y] = blocks[y][length - 1 - x];
      }
    }
  }

  return temp;
}

export function getWallKicks(pieceType: string, fromRotation: number, toRotation: number): number[][] {
  const key = `${fromRotation}-${toRotation}`;
  
  if (pieceType === 'I') {
    return SRS_KICKS_I[key] || [];
  } else {
    return SRS_KICKS_JLSTZ[key] || [];
  }
}
