/**
 * Playfield and border rendering logic.
 * Extracted from viewWebGPU.ts to keep file sizes manageable.
 * Includes ghost/shadow vertical light-trail (fading bright quads after moves).
 */

import * as Matrix from 'gl-matrix';
import {
  boardWorldX,
  boardWorldY,
  borderWorldX,
  borderWorldY,
} from './renderMetrics.js';
import { UNIFORM_BUFFER_SIZES } from '../config/renderConfig.js';
import { createBlockTextureBindingView } from './blockTexture.js';

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

  // Subtle magnetic UV wobble for placed blocks within ~2 rows of the falling piece.
  // Computes world-space center of active piece (using smoothed visualX/Y) and stashes on visualEffects
  // so the block shader (pbrBlocks) can apply a small signed UV offset proportional to horiz distance.
  // Effect vanishes automatically when the piece locks (state.activePiece becomes null).
  if (visualEffects) {
    if (activePiece) {
      const pw = (activePiece.blocks && activePiece.blocks[0]) ? activePiece.blocks[0].length : 1;
      const ph = (activePiece.blocks) ? activePiece.blocks.length : 1;
      const centerLX = (typeof activePiece.x === 'number' ? activePiece.x : 0) + pw * 0.5;
      const centerLY = (typeof activePiece.y === 'number' ? activePiece.y : 0) + ph * 0.5;
      visualEffects.magnetWorldX = boardWorldX(visualX + (centerLX - (activePiece.x || 0)));
      visualEffects.magnetWorldY = boardWorldY(visualY + (centerLY - (activePiece.y || 0)));
      visualEffects.magnetStrength = 1.0;
    } else {
      visualEffects.magnetStrength = 0.0;
    }
  }

  for (let row = 0; row < playfield.length; row++) {
    for (let colom = 0; colom < playfield[row].length; colom++) {
      if (!playfield[row][colom]) continue;
      if (blockIndex >= uniformBindGroup_CACHE.length) break;

      let value = playfield[row][colom];
      let colorBlockindex = Math.abs(value);
      let alpha = value < 0 ? 0.35 : 1.0;
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

  // =========================================================================
  // GHOST LIGHT-TRAIL EFFECT
  // Vertical series of fading bright quads between (visual) active piece and
  // its ghost landing position. Uses active color, additive-like overbright,
  // animates for ~200ms after each move/rotate (timer managed in VisualEffects).
  // Appends to the same batch + bindgroup list so it renders with blocks.
  // =========================================================================
  const activePieceForTrail = (state as any)?.activePiece;
  if (activePieceForTrail && visualEffects && visualEffects.ghostTrailTimer > 0 &&
      blockIndex < uniformBindGroup_CACHE.length - 8) {

    // Detect move/rotate this frame and (re)arm the 200ms animation window
    const curY = typeof activePieceForTrail.y === 'number' ? activePieceForTrail.y : -999;
    const curRot = typeof activePieceForTrail.rotation === 'number' ? activePieceForTrail.rotation : -999;
    const ve: any = visualEffects;
    if (Math.abs(curY - ve._lastActiveY) > 0.01 || curRot !== ve._lastActiveRot) {
      ve.ghostTrailTimer = 0.2;
      ve._lastActiveY = curY;
      ve._lastActiveRot = curRot;
    }

    const progress = Math.max(0.0, Math.min(1.0, ve.ghostTrailTimer / 0.2));

    // Find ghost top Y by scanning for negative (ghost) cells in the columns occupied by active piece
    let ghostTopY = -1;
    const pieceW = activePieceForTrail.blocks?.[0]?.length || 0;
    const pieceH = activePieceForTrail.blocks?.length || 0;
    const cols = new Set<number>();
    if (pieceW > 0 && pieceH > 0) {
      for (let ly = 0; ly < pieceH; ly++) {
        for (let lx = 0; lx < pieceW; lx++) {
          if (activePieceForTrail.blocks[ly][lx] !== 0) {
            cols.add(activePieceForTrail.x + lx);
          }
        }
      }
      for (let r = 0; r < playfield.length; r++) {
        for (const c of cols) {
          if (c >= 0 && c < 10 && playfield[r][c] < 0) {
            if (ghostTopY < 0 || r < ghostTopY) ghostTopY = r;
            break;
          }
        }
        if (ghostTopY >= 0) break; // topmost is enough
      }
    }

    const gap = (ghostTopY >= 0) ? (ghostTopY - activePieceForTrail.y) : 0;
    if (gap > 0.6 && pieceW > 0 && pieceH > 0) {
      // Derive active piece color from its block data (1-7)
      let colorIdx = 4;
      for (let ly = 0; ly < pieceH && colorIdx === 4; ly++) {
        for (let lx = 0; lx < pieceW; lx++) {
          if (activePieceForTrail.blocks[ly][lx] > 0) {
            colorIdx = activePieceForTrail.blocks[ly][lx];
            break;
          }
        }
      }
      const baseCol = currentTheme[colorIdx] || currentTheme[1] || [0.9, 0.9, 0.9];

      // Number of fading samples (shape copies) between active visual pos and ghost
      const numSamples = Math.min(5, Math.max(2, Math.floor(gap * 0.6)));
      const startX = visualX; // smoothed active origin for X alignment
      const startY = visualY;

      for (let s = 0; s < numSamples; s++) {
        const t = (numSamples <= 1) ? 0.5 : (s / (numSamples - 1));
        // Decreasing alpha + overbright near the active piece (light source), fade toward ghost
        const fade = 1.0 - (t * 0.85);
        const alpha = 0.55 + fade * 0.30; // keep >= ~0.42 so shader doesn't treat as ghost wireframe
        const brightness = 1.0 + fade * 2.2; // light-trail "glow" overbright (tonemapped + bloom helps)

        const r = Math.min(2.0, baseCol[0] * brightness);
        const g = Math.min(2.0, baseCol[1] * brightness);
        const b = Math.min(2.0, baseCol[2] * brightness);

        // Interp base Y for this sample (visual active -> logical ghost)
        const baseRow = startY + t * gap;

        // Draw the piece shape at this interpolated height (vertical trail of fading copies)
        for (let ly = 0; ly < pieceH; ly++) {
          for (let lx = 0; lx < pieceW; lx++) {
            if (activePieceForTrail.blocks[ly][lx] === 0) continue;
            if (blockIndex >= uniformBindGroup_CACHE.length) break;

            _f32_4[0] = r; _f32_4[1] = g; _f32_4[2] = b; _f32_4[3] = alpha * progress;

            Matrix.mat4.identity(MODELMATRIX);
            Matrix.mat4.identity(NORMALMATRIX);
            _f32_3[0] = boardWorldX(startX + lx);
            _f32_3[1] = boardWorldY(baseRow + ly);
            _f32_3[2] = 0.0;
            Matrix.mat4.translate(MODELMATRIX, MODELMATRIX, _f32_3);

            const trailBindGroup = uniformBindGroup_CACHE[blockIndex];
            batchBuffer.set(vpMatrix as Float32Array, batchOffset);
            batchBuffer.set(MODELMATRIX as Float32Array, batchOffset + 16);
            batchBuffer.set(NORMALMATRIX as Float32Array, batchOffset + 32);
            batchBuffer.set(_f32_4, batchOffset + 48);
            // padding
            batchBuffer[batchOffset + 52] = 0; batchBuffer[batchOffset + 53] = 0;
            batchBuffer[batchOffset + 54] = 0; batchBuffer[batchOffset + 55] = 0;
            batchBuffer[batchOffset + 56] = 0; batchBuffer[batchOffset + 57] = 0;
            batchBuffer[batchOffset + 58] = 0; batchBuffer[batchOffset + 59] = 0;
            batchBuffer[batchOffset + 60] = 0; batchBuffer[batchOffset + 61] = 0;
            batchBuffer[batchOffset + 62] = 0; batchBuffer[batchOffset + 63] = 0;

            uniformBindGroup_ARRAY[arrayLength++] = trailBindGroup;
            blockIndex++;
            batchOffset += 64;
          }
        }
      }
    }
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
  vpMatrix: Float32Array | Matrix.mat4,
  currentTheme: any,
  _f32_3: Float32Array,
  _f32_4: Float32Array,
  MODELMATRIX: Matrix.mat4,
  NORMALMATRIX: Matrix.mat4,
  dissolveBuffer: GPUBuffer,
  fresnelParamsUniform: GPUBuffer,
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
          { binding: 1, resource: { buffer: fragmentUniformBuffer, offset: 0, size: UNIFORM_BUFFER_SIZES.FRAGMENT } },
          { binding: 2, resource: createBlockTextureBindingView(blockTexture) },
          { binding: 3, resource: blockSampler },
          { binding: 5, resource: { buffer: dissolveBuffer } },
          { binding: 6, resource: { buffer: fresnelParamsUniform } },
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

/**
 * Per-frame hook to drive border glow intensity using audio bands (bass L/R, mid bottom, treble top).
 * In practice the pulsing is achieved via the u_bassLevel/u_midLevel/u_trebleLevel uniforms
 * (written each frame in viewRenderLoop from reactiveMusic.getFrequencyBands and used in
 * pbrBlocks shader for side-specific emissive/brightness boost on border quads via vWorldPos).
 * This function is provided per the task for any direct vertex color modulation of the border
 * if direct buffer updates are preferred over shader uniforms.
 */
export function updateBorderAudioGlow(
  _borderVertexUniformBuffer: GPUBuffer | null,
  _bassLevel: number,
  _midLevel: number,
  _trebleLevel: number,
  _device: GPUDevice | null
): void {
  // No-op by default (shader uniforms provide the reactive glow for the border rendered here).
  // If direct pulsing of static border colors is needed, implement writes to the color slots
  // (offset 192 in each 256-byte slot) for the left/right/top/bottom border quads here.
}
