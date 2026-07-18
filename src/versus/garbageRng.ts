import type { Rng } from '../game/pieces.js';
import { createSeededRng } from '../game/pieces.js';

/** Deterministic hole column for garbage row injection (lockstep-safe). */
export function holeColumnForGarbageRow(
  matchSeed: number,
  boardId: 0 | 1,
  eventIndex: number,
  rowIndex: number,
  width: number,
): number {
  let h = matchSeed >>> 0;
  h ^= boardId * 0x9e3779b9;
  h ^= eventIndex * 0x85ebca6b;
  h ^= rowIndex * 0xc2b2ae35;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  return (h >>> 0) % width;
}

/**
 * Build an RNG for injectGarbageRows that yields deterministic holes per board.
 * Event index increments on each applyPendingGarbage call.
 */
export function createGarbageRng(
  matchSeed: number,
  boardId: 0 | 1,
  getEventIndex: () => number,
): Rng {
  let rowIndex = 0;
  const width = 10;
  return () => {
    const col = holeColumnForGarbageRow(matchSeed, boardId, getEventIndex(), rowIndex, width);
    rowIndex++;
    return (col + 0.5) / width;
  };
}

/** Reset row counter before each garbage injection batch. */
export function createGarbageRngFactory(matchSeed: number, boardId: 0 | 1): {
  nextRng(): Rng;
} {
  let eventIndex = 0;
  return {
    nextRng(): Rng {
      const idx = eventIndex++;
      let rowIndex = 0;
      const width = 10;
      return () => {
        const col = holeColumnForGarbageRow(matchSeed, boardId, idx, rowIndex, width);
        rowIndex++;
        return (col + 0.5) / width;
      };
    },
  };
}

/** Mulberry32 stream keyed by match seed (used for auxiliary deterministic rolls). */
export function createMatchRng(matchSeed: number): Rng {
  return createSeededRng(matchSeed);
}
