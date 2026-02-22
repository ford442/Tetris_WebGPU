import { describe, it, expect } from 'vitest';
import { clearFullLines, isPlayfieldEmpty } from '../src/game/lineUtils';
import { buildPlayfieldProjection } from '../src/game/stateProjection';

describe('game utility helpers', () => {
  it('clears full rows and shifts remaining blocks down', () => {
    const width = 4;
    const height = 4;
    const playfield = new Int8Array([
      0, 0, 0, 0,
      0, 0, 0, 0,
      2, 0, 0, 0,
      1, 1, 1, 1,
    ]);

    const lines = clearFullLines(
      playfield,
      width,
      height,
      (x, y) => playfield[y * width + x],
    );

    expect(lines).toEqual([3]);
    expect(Array.from(playfield)).toEqual([
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      2, 0, 0, 0,
    ]);
    expect(isPlayfieldEmpty(playfield)).toBe(false);
  });

  it('projects playfield with ghost and active piece overlay', () => {
    const width = 4;
    const height = 4;
    const cells = new Int8Array(width * height);
    const activePiece = {
      x: 1,
      y: 1,
      blocks: [
        [1, 1],
        [1, 1],
      ],
    } as any;

    const projected = buildPlayfieldProjection({
      playfieldWidth: width,
      playfieldHeight: height,
      getCell: (x, y) => cells[y * width + x],
      isGameOver: false,
      activePiece,
      ghostY: 2,
    });

    expect(projected[2][1]).toBe(1);
    expect(projected[2][2]).toBe(1);
    expect(projected[3][1]).toBe(-1);
    expect(projected[3][2]).toBe(-1);
    expect(projected[1][1]).toBe(1);
    expect(projected[1][2]).toBe(1);
  });
});
