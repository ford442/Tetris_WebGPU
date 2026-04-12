/**
 * Playfield and border rendering logic.
 * Extracted from viewWebGPU.ts to keep file sizes manageable.
 */

import * as Matrix from 'gl-matrix';
import {
  boardWorldX,
  boardWorldY,
  borderWorldX,
  borderWorldY,
} from './renderMetrics.js';

/**
 * Render the playfield blocks, building uniform batches for all visible blocks.
 * Returns the number of blocks written to uniformBindGroup_ARRAY.
 */
export function renderPlayfieldBlocks(
  device: GPUDevice,
  state: any,
  currentTheme: any,
  visualEffects: any,
  visualX: number,
  visualY: number,
  vpMatrix: Float32Array | Matrix.mat4,
  uniformBindGroup_CACHE: GPUBindGroup[],
  uniformBindGroup_ARRAY: GPUBindGroup[],
  vertexUniformBuffer: GPUBuffer,
  batchBuffer: Float32Array,
  _f32_3: Float32Array,
  _f32_4: Float32Array,
  MODELMATRIX: Matrix.mat4,
  NORMALMATRIX: Matrix.mat4,
): number {
  const { playfield, activePiece } = state;
  let arrayLength = 0;
  let blockIndex = 0;
  let batchOffset = 0;

  for (let row = 0; row < playfield.length; row++) {
    for (let colom = 0; colom < playfield[row].length; colom++) {
      if (!playfield[row][colom]) continue;
      if (blockIndex >= uniformBindGroup_CACHE.length) break;

      let value = playfield[row][colom];
      let colorBlockindex = Math.abs(value);
      let alpha = value < 0 ? 0.3 : 0.9;
      let color = currentTheme[colorBlockindex] || currentTheme[0];

      _f32_4[0] = color[0]; _f32_4[1] = color[1]; _f32_4[2] = color[2]; _f32_4[3] = alpha;

      let isSolidActivePieceBlock = false;

      if (activePiece) {
        const relX = colom - activePiece.x;
        const relY = row - activePiece.y;
        if (relY >= 0 && relY < activePiece.blocks.length && relX >= 0 && relX < activePiece.blocks[0].length) {
          if (activePiece.blocks[relY][relX] !== 0 && value > 0) {
            isSolidActivePieceBlock = true;

            if (visualEffects.rotationFlashTimer > 0) {
              const flash = visualEffects.rotationFlashTimer * 3.0;
              _f32_4[0] = Math.min(color[0] + flash, 1.0);
              _f32_4[1] = Math.min(color[1] + flash, 1.0);
              _f32_4[2] = Math.min(color[2] + flash, 1.0);
            }
          }
        }
      }

      const uniformBindGroup_next = uniformBindGroup_CACHE[blockIndex];

      Matrix.mat4.identity(MODELMATRIX);
      Matrix.mat4.identity(NORMALMATRIX);

      if (isSolidActivePieceBlock) {
        const relX = colom - activePiece.x;
        const relY = row - activePiece.y;
        _f32_3[0] = boardWorldX(visualX + relX);
        _f32_3[1] = boardWorldY(visualY + relY);
        _f32_3[2] = 0.0;
      } else {
        _f32_3[0] = boardWorldX(colom);
        _f32_3[1] = boardWorldY(row);
        _f32_3[2] = 0.0;
      }
      Matrix.mat4.translate(MODELMATRIX, MODELMATRIX, _f32_3);

      batchBuffer.set(vpMatrix as Float32Array, batchOffset);
      batchBuffer.set(MODELMATRIX as Float32Array, batchOffset + 16);
      batchBuffer.set(NORMALMATRIX as Float32Array, batchOffset + 32);
      batchBuffer.set(_f32_4, batchOffset + 48);
      // Clear padding
      batchBuffer[batchOffset + 52] = 0; batchBuffer[batchOffset + 53] = 0;
      batchBuffer[batchOffset + 54] = 0; batchBuffer[batchOffset + 55] = 0;
      batchBuffer[batchOffset + 56] = 0; batchBuffer[batchOffset + 57] = 0;
      batchBuffer[batchOffset + 58] = 0; batchBuffer[batchOffset + 59] = 0;
      batchBuffer[batchOffset + 60] = 0; batchBuffer[batchOffset + 61] = 0;
      batchBuffer[batchOffset + 62] = 0; batchBuffer[batchOffset + 63] = 0;

      uniformBindGroup_ARRAY[arrayLength++] = uniformBindGroup_next;
      blockIndex++;
      batchOffset += 64;
    }
  }

  // Single large buffer write instead of many small ones
  if (batchOffset > 0) {
    device.queue.writeBuffer(vertexUniformBuffer, 0, batchBuffer.subarray(0, batchOffset));
  }

  uniformBindGroup_ARRAY.length = arrayLength;
  return arrayLength;
}

/**
 * Initialize border rendering: creates uniform buffer and bind groups for the
 * static playfield border frame.
 */
export function renderPlayfieldBorder(
  device: GPUDevice,
  pipeline: GPURenderPipeline,
  fragmentUniformBuffer: GPUBuffer,
  blockTexture: GPUTexture,
  blockSampler: GPUSampler,
  materialUniformBuffer: GPUBuffer,
  vpMatrix: Float32Array | Matrix.mat4,
  currentTheme: any,
  _f32_3: Float32Array,
  _f32_4: Float32Array,
  MODELMATRIX: Matrix.mat4,
  NORMALMATRIX: Matrix.mat4,
): { vertexUniformBuffer: GPUBuffer; bindGroups: GPUBindGroup[] } {
  const state_Border = {
    playfield: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      ...Array(20).fill([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
  };

  const vertexUniformSizeBuffer = 200 * 256;
  const vertexUniformBuffer = device.createBuffer({ size: vertexUniformSizeBuffer, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bindGroups: GPUBindGroup[] = [];
  let offset_ARRAY = 0;

  for (let row = 0; row < state_Border.playfield.length; row++) {
    for (let colom = 0; colom < state_Border.playfield[row].length; colom++) {
      if (!state_Border.playfield[row][colom]) continue;

      const uniformBindGroup_next = device.createBindGroup({
        label: "uniformBindGroup_next 635", layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: vertexUniformBuffer, offset: offset_ARRAY, size: 208 } },
          { binding: 1, resource: { buffer: fragmentUniformBuffer, offset: 0, size: 144 } },
          { binding: 2, resource: blockTexture.createView({ format: 'rgba8unorm', dimension: '2d', baseMipLevel: 0, mipLevelCount: blockTexture.mipLevelCount }) },
          { binding: 3, resource: blockSampler },
          { binding: 4, resource: { buffer: materialUniformBuffer, offset: 0, size: 16 } }
        ],
      });

      Matrix.mat4.identity(MODELMATRIX);
      Matrix.mat4.identity(NORMALMATRIX);
      _f32_3[0] = borderWorldX(colom); _f32_3[1] = borderWorldY(row); _f32_3[2] = 0.0;
      Matrix.mat4.translate(MODELMATRIX, MODELMATRIX, _f32_3);

      device.queue.writeBuffer(vertexUniformBuffer, offset_ARRAY + 0, vpMatrix as Float32Array);
      device.queue.writeBuffer(vertexUniformBuffer, offset_ARRAY + 64, MODELMATRIX as Float32Array);
      device.queue.writeBuffer(vertexUniformBuffer, offset_ARRAY + 128, NORMALMATRIX as Float32Array);
      _f32_4.set(currentTheme.border);
      _f32_4[3] = 1.0;
      device.queue.writeBuffer(vertexUniformBuffer, offset_ARRAY + 192, _f32_4);

      bindGroups.push(uniformBindGroup_next);
      offset_ARRAY += 256;
    }
  }

  return { vertexUniformBuffer, bindGroups };
}
