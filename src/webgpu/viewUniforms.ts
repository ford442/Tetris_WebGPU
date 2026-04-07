/**
 * Per-frame GPU uniform update logic.
 * Extracted from viewWebGPU.ts to keep file sizes manageable.
 *
 * Writes all GPU buffer uniforms for one render frame and returns the
 * computed per-frame values needed by the render pass section.
 */

import {
  BLOCK_WORLD_SIZE,
  BOARD_WORLD_CENTER_X,
} from './renderMetrics.js';
import { postProcessUniforms } from './postProcessUniforms.js';

export interface FrameUniforms {
  lockPercent: number;
  ghostUVX: number;
  ghostUVW: number;
  hasActiveParticles: boolean;
  commandEncoder: GPUCommandEncoder;
}

/**
 * Write all per-frame uniform buffers and return derived frame values.
 * `view` is cast as `any` to avoid a circular import with viewWebGPU.ts.
 */
export function updateFrameUniforms(view: any, dt: number, time: number): FrameUniforms {
  const device: GPUDevice = view.device;

  // Compute uniforms
  const swParams = view.visualEffects.getShockwaveParams();
  const swCenter = view.visualEffects.shockwaveCenter;
  const swTimer  = view.visualEffects.shockwaveTimer;
  view._f32_12[0] = dt;           view._f32_12[1] = time;
  view._f32_12[2] = swTimer;      view._f32_12[3] = 0.0;
  view._f32_12[4] = swCenter[0];  view._f32_12[5] = swCenter[1];
  view._f32_12[6] = 0.0;          view._f32_12[7] = 0.0;
  view._f32_12[8]  = swParams[0]; view._f32_12[9]  = swParams[1];
  view._f32_12[10] = swParams[2]; view._f32_12[11] = swParams[3];
  device.queue.writeBuffer(view.particleComputeUniformBuffer, 0, view._f32_12);

  const commandEncoder = device.createCommandEncoder();

  // Dispatch compute only when particles are active
  const timeSinceLastEmit = time - (view.particleSystem.lastEmitTime || 0);
  const hasActiveParticles =
    view.particleSystem.pendingUploadCount > 0 || swTimer > 0.0 || timeSinceLastEmit < 3.0;
  if (hasActiveParticles) {
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(view.particleComputePipeline);
    computePass.setBindGroup(0, view.particleComputeBindGroup);
    computePass.dispatchWorkgroups(Math.ceil(view.particleSystem.maxParticles / 64));
    computePass.end();
  }

  // Particle render uniforms
  device.queue.writeBuffer(view.particleUniformBuffer, 0, view.vpMatrix);
  view._f32_1[0] = time;
  device.queue.writeBuffer(view.particleUniformBuffer, 64, view._f32_1);

  // Ghost piece UV values
  let ghostX = -100.0, ghostWidth = 0.0, ghostUVX = -1.0, ghostUVW = 0.0;
  if (view.state?.activePiece) {
    const widthInBlocks = view.state.activePiece.blocks[0].length;
    const gridCenterX   = view.state.activePiece.x + widthInBlocks / 2.0;
    ghostX     = gridCenterX * BLOCK_WORLD_SIZE;
    ghostWidth = widthInBlocks * BLOCK_WORLD_SIZE;
    const camZ         = 75.0;
    const fov          = (35 * Math.PI) / 180;
    const visibleHeight = 2.0 * Math.tan(fov / 2.0) * camZ;
    const visibleWidth  = visibleHeight * (view.canvasWebGPU.width / view.canvasWebGPU.height);
    ghostUVX = 0.5 + (ghostX - BOARD_WORLD_CENTER_X) / visibleWidth;
    ghostUVW = ghostWidth / visibleWidth;
  }

  // Lock percent
  let lockPercent = 0.0;
  if (view.state?.lockTimer !== undefined && view.state?.lockDelayTime) {
    lockPercent = Math.min(view.state.lockTimer / view.state.lockDelayTime, 1.0);
  }

  // Particle uniform tail
  view._f32_1[0] = ghostX;     device.queue.writeBuffer(view.particleUniformBuffer, 68, view._f32_1);
  view._f32_1[0] = ghostWidth; device.queue.writeBuffer(view.particleUniformBuffer, 72, view._f32_1);
  view._f32_1[0] = view.visualEffects.warpSurge;
  device.queue.writeBuffer(view.particleUniformBuffer, 76, view._f32_1);
  view._f32_1[0] = lockPercent;
  device.queue.writeBuffer(view.particleUniformBuffer, 80, view._f32_1);

  // Background uniforms
  view._f32_1[0] = time;
  device.queue.writeBuffer(view.backgroundUniformBuffer, 0, view._f32_1);
  view._f32_1[0] = view.visualEffects.currentLevel;
  device.queue.writeBuffer(view.backgroundUniformBuffer, 4, view._f32_1);
  view._f32_2[0] = view.canvasWebGPU.width;
  view._f32_2[1] = view.canvasWebGPU.height;
  device.queue.writeBuffer(view.backgroundUniformBuffer, 8, view._f32_2);
  view._f32_1[0] = lockPercent;
  device.queue.writeBuffer(view.backgroundUniformBuffer, 64, view._f32_1);
  view._f32_1[0] = view.visualEffects.warpSurge;
  device.queue.writeBuffer(view.backgroundUniformBuffer, 68, view._f32_1);
  view._f32_1[0] = ghostUVX;
  device.queue.writeBuffer(view.backgroundUniformBuffer, 72, view._f32_1);
  view._f32_1[0] = ghostUVW;
  device.queue.writeBuffer(view.backgroundUniformBuffer, 76, view._f32_1);

  // Block (fragment) uniforms
  view._f32_1[0] = time;
  device.queue.writeBuffer(view.fragmentUniformBuffer, 48, view._f32_1);
  view._f32_1[0] = view.useGlitch ? 1.0 : 0.0;
  device.queue.writeBuffer(view.fragmentUniformBuffer, 52, view._f32_1);
  view._f32_1[0] = lockPercent;
  device.queue.writeBuffer(view.fragmentUniformBuffer, 56, view._f32_1);
  view._f32_1[0] = view.visualEffects.currentLevel;
  device.queue.writeBuffer(view.fragmentUniformBuffer, 60, view._f32_1);

  // Underwater / bioluminescent uniforms
  const isUnderwaterLevel = view.reactiveVideoBackground?.isSeaCreatureLevel ?? false;
  if (isUnderwaterLevel && view.reactiveVideoBackground) {
    const underwaterValues = [1.0, 0.6, 0.8, 0.5,
      view.reactiveVideoBackground.seaCreatureIntensity,
      view.reactiveVideoBackground.creatureSwimOffset,
      5.0];
    for (let i = 0; i < underwaterValues.length; i++) {
      view._f32_1[0] = underwaterValues[i];
      device.queue.writeBuffer(view.fragmentUniformBuffer, 96 + i * 4, view._f32_1);
    }
    view.chaosMode.setUnderwaterMode(true);
    view.jellyfishSystem.update(dt, time);
  } else {
    view._f32_1[0] = 0.0;
    for (let offset = 96; offset <= 120; offset += 4) {
      device.queue.writeBuffer(view.fragmentUniformBuffer, offset, view._f32_1);
    }
    view.chaosMode.setUnderwaterMode(false);
  }

  // Post-process uniforms
  const ppUniforms = postProcessUniforms.pack({
    time,
    useGlitch: Math.max(view.useGlitch ? 1.0 : 0.0, view.visualEffects.glitchIntensity),
    shockwaveCenter: view.visualEffects.shockwaveCenter as [number, number],
    shockwaveTime: view.visualEffects.shockwaveTimer,
    shockwaveParams: view.visualEffects.getShockwaveParams() as [number, number, number, number],
    level: view.visualEffects.currentLevel,
    warpSurge: view.visualEffects.warpSurge,
    enableFXAA: view.useEnhancedPostProcess ? 1.0 : 0.0,
    enableBloom: (view.useEnhancedPostProcess && view.bloomEnabled) ? 1.0 : 0.0,
    enableFilmGrain: 1.0,
    enableCRT: 0.0,
    bloomIntensity: view.bloomIntensity,
    bloomThreshold: 0.35,
    materialAwareBloom: view.useEnhancedPostProcess ? 1.0 : 0.0,
    screenResolution: [view.canvasWebGPU.width, view.canvasWebGPU.height],
  });
  device.queue.writeBuffer(view.postProcessUniformBuffer, 0, ppUniforms);

  return { lockPercent, ghostUVX, ghostUVW, hasActiveParticles, commandEncoder };
}
