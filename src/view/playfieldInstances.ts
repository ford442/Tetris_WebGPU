import * as Matrix from 'gl-matrix';
import { boardWorldX, boardWorldY } from '../webgpu/renderMetrics.js';

export interface BlockInstance {
  modelMatrix: Float32Array;
  color: [number, number, number, number];
}

const _pos = Matrix.vec3.create();
const _model = Matrix.mat4.create();

/**
 * Build world-space block instances for the playfield + interpolated active piece.
 * Shared by WebGPU and WebGL2 renderers.
 */
export function buildPlayfieldInstances(
  state: any,
  currentTheme: any,
  visualX: number,
  visualY: number,
): BlockInstance[] {
  const instances: BlockInstance[] = [];
  const { playfield, activePiece } = state;
  if (!playfield) return instances;

  for (let row = 0; row < playfield.length; row++) {
    for (let col = 0; col < playfield[row].length; col++) {
      const value = playfield[row][col];
      if (!value) continue;

      const colorIndex = Math.abs(value);
      const alpha = value < 0 ? 0.3 : 0.9;
      const color = currentTheme[colorIndex] || currentTheme[0];
      const rgba: [number, number, number, number] = [color[0], color[1], color[2], alpha];

      let useVisual = false;
      if (activePiece) {
        const relX = col - activePiece.x;
        const relY = row - activePiece.y;
        if (
          relY >= 0 &&
          relY < activePiece.blocks.length &&
          relX >= 0 &&
          relX < activePiece.blocks[0].length &&
          activePiece.blocks[relY][relX] !== 0 &&
          value > 0
        ) {
          useVisual = true;
        }
      }

      Matrix.mat4.identity(_model);
      if (useVisual && activePiece) {
        const relX = col - activePiece.x;
        const relY = row - activePiece.y;
        _pos[0] = boardWorldX(visualX + relX);
        _pos[1] = boardWorldY(visualY + relY);
      } else {
        _pos[0] = boardWorldX(col);
        _pos[1] = boardWorldY(row);
      }
      _pos[2] = 0;
      Matrix.mat4.translate(_model, _model, _pos);

      instances.push({
        modelMatrix: new Float32Array(_model),
        color: rgba,
      });
    }
  }

  return instances;
}
