import { describe, expect, it } from 'vitest';
import { buildPlayfieldInstances } from '../src/view/playfieldInstances.js';
import { themes } from '../src/webgpu/themes.js';

describe('buildPlayfieldInstances', () => {
  it('creates one instance per occupied cell', () => {
    const playfield = Array(20).fill(null).map(() => Array(10).fill(0));
    playfield[5][3] = 2;
    playfield[5][4] = 2;
    const instances = buildPlayfieldInstances(
      { playfield, activePiece: null },
      themes.imageSampled,
      0,
      0,
    );
    expect(instances).toHaveLength(2);
    expect(instances[0].color[3]).toBeCloseTo(1.0);
  });
});
