/**
 * Render Loop Core Logic
 * Extracted from viewWebGPU.ts for modularity
 * Handles: frame updates, uniform management, particle updates, and render pass execution
 */

import * as Matrix from "gl-matrix";
import { updateFrameUniforms } from './viewUniforms.js';
import { postProcessUniforms } from './postProcessUniforms.js';
import { lineClearAnimator } from '../effects/lineClearAnimation.js';
import { BLOCK_WORLD_SIZE, BOARD_WORLD_CENTER_X, BOARD_WORLD_CENTER_Y } from './renderMetrics.js';
import { updateBorderAudioGlow } from './viewPlayfield.js';

const glMatrix = Matrix;

/**
 * Execute the main render pass for a single frame
 * @param view - The View instance containing all GPU state
 * @param dt - Delta time in seconds
 */
export function executeRenderLoop(view: any, dt: number) {
  if (!view.device) return;

  // Safety cap dt to prevent massive jumps on lag spikes
  const clampedDt = Math.min(dt, 0.1);

  // Smooth Piece Interpolation (Exponential Decay Lerp)
  updatePieceInterpolation(view, clampedDt);

  view.visualEffects.updateEffects(clampedDt);
  lineClearAnimator.update(clampedDt);
  const time = (performance.now() - view.startTime) / 1000.0;

  // Update camera and uniforms
  updateCameraAndUniforms(view, dt, time, clampedDt);

  // Particle upload
  uploadParticles(view);

  // Compute uniforms
  updateComputeUniforms(view, dt, time);

  const result = updateFrameUniforms(view, dt, time);
  const commandEncoder = result.commandEncoder;
  
  // Execute compute pass if particles are active
  if (result.hasActiveParticles) {
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(view.particleComputePipeline);
    computePass.setBindGroup(0, view.particleComputeBindGroup);
    computePass.dispatchWorkgroups(Math.ceil(view.particleSystem.maxParticles / 64));
    computePass.end();
  }

  // Update render uniforms
  updateRenderUniforms(view, time, result);

  // Refresh material slots (metallic@48, textureMix@92) — must run after frame uniforms
  // so stale viewRenderLoop writes cannot clobber them (see viewUniforms.ts offsets).
  view.updateMaterialUniforms?.();

  // Execute render passes
  executeRenderPasses(view, commandEncoder, result);

  view.device.queue.submit([commandEncoder.finish()]);
}

/**
 * Update piece visual interpolation for smooth movement
 */
function updatePieceInterpolation(view: any, clampedDt: number) {
  if (view.state && view.state.activePiece) {
    const targetX = view.state.activePiece.x;
    const targetY = view.state.activePiece.y;

    // If the active piece object reference changed (e.g. piece spawned or held), snap instantly
    if (view._previousActivePiece !== view.state.activePiece) {
      view.visualX = targetX;
      view.visualY = targetY;
      view._previousActivePiece = view.state.activePiece;
    } else {
      const smoothingFactor = 25.0; // Higher = Snappier, Lower = Smoother
      const expDecayPiece = 1.0 / (1.0 + clampedDt * smoothingFactor);
      view.visualX = targetX + (view.visualX - targetX) * expDecayPiece;
      view.visualY = targetY + (view.visualY - targetY) * expDecayPiece;
    }
  } else {
    view._previousActivePiece = null;
  }
}

/**
 * Update camera position and view matrix with shake
 */
function updateCameraAndUniforms(view: any, dt: number, time: number, clampedDt: number) {
  // Camera updates - Ethereal Floating Panel View
  let camX = 0.0 + Math.sin(time * 0.2) * 0.5;
  let camY = BOARD_WORLD_CENTER_Y + Math.cos(time * 0.3) * 0.25 + 2.0; // Slight downward tilt (+2.0 Y offset)

  // Dev/QA: force extreme oblique camera for transparency + mask debugging.
  // Toggle: localStorage.tetris_debug_extreme_camera = '1'
  if (typeof localStorage !== 'undefined' && localStorage.getItem('tetris_debug_extreme_camera') === '1') {
    camX = 7.0 + Math.sin(time * 0.15) * 0.25; // shift camera to the side
    camY = BOARD_WORLD_CENTER_Y + 0.7 + Math.cos(time * 0.12) * 0.15; // flatter angle
  }
  const shake = view.visualEffects.getShakeOffset();

  // Smooth Camera Shake Interpolation using exponential decay
  const shakeDecay = 1.0 / (1.0 + clampedDt * 10.0);
  view._shakeOffsetSmoothed.x = shake.x + (view._shakeOffsetSmoothed.x - shake.x) * shakeDecay;
  view._shakeOffsetSmoothed.y = shake.y + (view._shakeOffsetSmoothed.y - shake.y) * shakeDecay;

  camX += view._shakeOffsetSmoothed.x;
  camY += view._shakeOffsetSmoothed.y;

  view._camEye[0] = camX; 
  view._camEye[1] = camY; 
  view._camEye[2] = 75.0;
  
  glMatrix.mat4.lookAt(view.VIEWMATRIX, view._camEye, view._camTarget, view._camUp);
  glMatrix.mat4.multiply(view.vpMatrix, view.PROJMATRIX, view.VIEWMATRIX);
  view.device.queue.writeBuffer(view.fragmentUniformBuffer, 16, view._camEye);
}

/**
 * Upload pending particle data to GPU
 */
function uploadParticles(view: any) {
  if (view.particleSystem.pendingUploadCount > 0) {
    for (let i = 0; i < view.particleSystem.pendingUploadCount; i++) {
      const index = view.particleSystem.pendingUploadIndices[i];
      const offset = i * 16;
      const dataSlice = view.particleSystem.pendingUploads.subarray(offset, offset + 16);
      view.device.queue.writeBuffer(view.particleStorageBuffer, index * 64, dataSlice);
    }
    view.particleSystem.clearPending();
  }
}

/**
 * Update compute shader uniforms for particle physics
 */
function updateComputeUniforms(view: any, dt: number, time: number) {
  const swParams = view.visualEffects.getShockwaveParams();
  const swCenter = view.visualEffects.shockwaveCenter;
  const swTimer = view.visualEffects.shockwaveTimer;
  
  view._f32_12[0] = dt; 
  view._f32_12[1] = time; 
  view._f32_12[2] = swTimer; 
  view._f32_12[3] = 0.0;
  view._f32_12[4] = swCenter[0]; 
  view._f32_12[5] = swCenter[1]; 
  view._f32_12[6] = 0.0; 
  view._f32_12[7] = 0.0;
  view._f32_12[8] = swParams[0]; 
  view._f32_12[9] = swParams[1]; 
  view._f32_12[10] = swParams[2]; 
  view._f32_12[11] = swParams[3];
  
  view.device.queue.writeBuffer(view.particleComputeUniformBuffer, 0, view._f32_12);
}

/**
 * Update per-frame GPU uniforms for rendering
 */
function updateRenderUniforms(view: any, time: number, result: any) {
  // Particle uniforms
  view.device.queue.writeBuffer(view.particleUniformBuffer, 0, view.vpMatrix as Float32Array);
  view._f32_1[0] = time;
  view.device.queue.writeBuffer(view.particleUniformBuffer, 64, view._f32_1);

  // Ghost piece projection
  let ghostX = -100.0, ghostWidth = 0.0, ghostUVX = -1.0, ghostUVW = 0.0;
  if (view.state?.activePiece) {
    const widthInBlocks = view.state.activePiece.blocks[0].length;
    const gridCenterX = view.state.activePiece.x + widthInBlocks / 2.0;
    ghostX = gridCenterX * BLOCK_WORLD_SIZE;
    ghostWidth = widthInBlocks * BLOCK_WORLD_SIZE;
    const camZ = 75.0;
    const fov = (35 * Math.PI) / 180;
    const visibleHeight = 2.0 * Math.tan(fov / 2.0) * camZ;
    const visibleWidth = visibleHeight * (view.canvasWebGPU.width / view.canvasWebGPU.height);
    ghostUVX = 0.5 + (ghostX - BOARD_WORLD_CENTER_X) / visibleWidth;
    ghostUVW = ghostWidth / visibleWidth;
  }
  
  let lockPercent = 0.0;
  if (view.state?.lockTimer !== undefined && view.state?.lockDelayTime) {
    lockPercent = Math.min(view.state.lockTimer / view.state.lockDelayTime, 1.0);
  }

  view._f32_1[0] = ghostX;
  view.device.queue.writeBuffer(view.particleUniformBuffer, 68, view._f32_1);
  view._f32_1[0] = ghostWidth;
  view.device.queue.writeBuffer(view.particleUniformBuffer, 72, view._f32_1);
  view._f32_1[0] = view.visualEffects.warpSurge;
  view.device.queue.writeBuffer(view.particleUniformBuffer, 76, view._f32_1);
  view._f32_1[0] = lockPercent;
  view.device.queue.writeBuffer(view.particleUniformBuffer, 80, view._f32_1);

  // Grid radial ripple uniforms (epicenter + wave time for 500ms lock ripple)
  // Written to shared particleUniformBuffer (offsets 84/92 fit in 96B buffer)
  view._f32_2[0] = view.visualEffects.gridRippleCenter[0] || 0.0;
  view._f32_2[1] = view.visualEffects.gridRippleCenter[1] || 0.0;
  view.device.queue.writeBuffer(view.particleUniformBuffer, 84, view._f32_2);
  view._f32_1[0] = view.visualEffects.gridRippleTime || 0.0;
  view.device.queue.writeBuffer(view.particleUniformBuffer, 92, view._f32_1);

  // Background uniforms
  view._f32_1[0] = time;
  view.device.queue.writeBuffer(view.backgroundUniformBuffer, 0, view._f32_1);
  view._f32_1[0] = view.visualEffects.currentLevel;
  view.device.queue.writeBuffer(view.backgroundUniformBuffer, 4, view._f32_1);
  view._f32_2[0] = view.canvasWebGPU.width; 
  view._f32_2[1] = view.canvasWebGPU.height;
  view.device.queue.writeBuffer(view.backgroundUniformBuffer, 8, view._f32_2);
  view._f32_1[0] = lockPercent;
  view.device.queue.writeBuffer(view.backgroundUniformBuffer, 64, view._f32_1);
  view._f32_1[0] = view.visualEffects.warpSurge;
  view.device.queue.writeBuffer(view.backgroundUniformBuffer, 68, view._f32_1);
  view._f32_1[0] = ghostUVX;
  view.device.queue.writeBuffer(view.backgroundUniformBuffer, 72, view._f32_1);
  view._f32_1[0] = ghostUVW;
  view.device.queue.writeBuffer(view.backgroundUniformBuffer, 76, view._f32_1);

  // Fragment block uniforms (time@32, glitch@36, movementFlash@96, magnet@104, etc.)
  // are written in viewUniforms.updateFrameUniforms with pbrBlocks.ts layout.
  // Do NOT write time/glitch at byte 48 — that slot is metallic in FragmentUniforms.

  if (view.reactiveVideoBackground?.isSeaCreatureLevel) {
    view.jellyfishSystem.update(result.dt, result.time);
  }

  // Post-process uniforms
  updatePostProcessUniforms(view, time);
}

/**
 * Update post-process shader uniforms
 */
function updatePostProcessUniforms(view: any, time: number) {
  view._postProcessParams.time = time;
  view._postProcessParams.useGlitch = Math.max(view.useGlitch ? 1.0 : 0.0, view.visualEffects.glitchIntensity);
  view._postProcessParams.shockwaveCenter[0] = view.visualEffects.shockwaveCenter[0];
  view._postProcessParams.shockwaveCenter[1] = view.visualEffects.shockwaveCenter[1];
  view._postProcessParams.shockwaveTime = view.visualEffects.shockwaveTimer;
  
  const currentShockwaveParams = view.visualEffects.getShockwaveParams();
  view._postProcessParams.shockwaveParams[0] = currentShockwaveParams[0];
  view._postProcessParams.shockwaveParams[1] = currentShockwaveParams[1];
  view._postProcessParams.shockwaveParams[2] = currentShockwaveParams[2];
  view._postProcessParams.shockwaveParams[3] = currentShockwaveParams[3];
  
  view._postProcessParams.level = view.visualEffects.currentLevel;
  view._postProcessParams.warpSurge = view.visualEffects.warpSurge;
  view._postProcessParams.enableFXAA = view.useEnhancedPostProcess ? 1.0 : 0.0;
  
  // Update Bloom System with dynamic neon flash intensity
  if (view.bloomSystem && view.visualEffects.neonBloomIntensity > 0) {
    view.bloomSystem.setParameters({
      intensity: view.bloomIntensity + view.visualEffects.neonBloomIntensity
    });
  } else if (view.bloomSystem) {
    view.bloomSystem.setParameters({
      intensity: view.bloomIntensity
    });
  }

  const inShaderBloom = view.useEnhancedPostProcess && view.bloomEnabled && !view.useMultiPassBloom;
  view._postProcessParams.enableBloom = inShaderBloom ? 1.0 : 0.0;
  view._postProcessParams.enableFilmGrain = 1.0;
  view._postProcessParams.enableCRT = 0.0;
  view._postProcessParams.bloomIntensity = view.bloomIntensity + view.visualEffects.neonBloomIntensity;
  view._postProcessParams.bloomThreshold = 0.72;
  view._postProcessParams.materialAwareBloom = (view.useEnhancedPostProcess && !view.useMultiPassBloom) ? 1.0 : 0.0;
  view._postProcessParams.screenResolution[0] = view.canvasWebGPU.width;
  view._postProcessParams.screenResolution[1] = view.canvasWebGPU.height;
  view._postProcessParams.aberrationPulse = view.visualEffects.hardDropAberrationPulse || 0;

  // NEW: explicitly driven shockwave boost uniform mapping for Neon Bricklayer implementation
  view._postProcessParams.hardDropBoost = view.shockwaveParamsUniform ? view.shockwaveParamsUniform[0] : 0.0;

  // Compute board height fill ratio (0-1) for contracting danger vignette.
  // Uses highest occupied row (top = low index). No allocations in hot path.
  let dangerLevel = 0.0;
  const pf = view.state && view.state.playfield;
  if (pf && pf.length === 20) {
    let minRow = 20;
    for (let r = 0; r < 20; r++) {
      const row = pf[r];
      for (let c = 0; c < 10; c++) {
        if (row[c] !== 0) {
          if (r < minRow) minRow = r;
          break;
        }
      }
    }
    dangerLevel = (minRow < 20) ? (20 - minRow) / 20.0 : 0.0;
  }
  view._postProcessParams.dangerLevel = dangerLevel;

  // Game over kaleidoscope time (2s spin on final board in post-process kaleido UV)
  view._postProcessParams.gameOverKaleidoTime = view.visualEffects.gameOverKaleidoTimer || 0;

  // Line clear laser uniforms
  view._postProcessParams.lineClearLaserY[0] = view.visualEffects.lineClearLaserY[0];
  view._postProcessParams.lineClearLaserY[1] = view.visualEffects.lineClearLaserY[1];
  view._postProcessParams.lineClearLaserY[2] = view.visualEffects.lineClearLaserY[2];
  view._postProcessParams.lineClearLaserY[3] = view.visualEffects.lineClearLaserY[3];
  view._postProcessParams.lineClearLaserIntensity = view.visualEffects.lineClearLaserIntensity || 0;

  // Column heights (topmost row index per column, 0=top of board) for simple depth-based
  // soft shadows in pbrBlocks shader. Written directly here (per task) at 144+; no hot allocs
  // (reuse _f32_1). Reuses the pf already scanned above for dangerLevel.
  if (pf && pf.length === 20) {
    for (let c = 0; c < 10; c++) {
      let top = 20.0;
      for (let r = 0; r < 20; r++) {
        if (pf[r][c] !== 0) {
          top = r;  // row index as f32 for uniform array
          break;
        }
      }
      view._f32_1[0] = top;  // number (coerces to f32 on write)
      view.device.queue.writeBuffer(view.fragmentUniformBuffer, 144 + c * 4, view._f32_1);
    }
  }

  // Audio frequency bands (from reactiveMusic analyser) for border glow pulsing.
  // bass -> left/right, mid -> bottom, treble -> top. Written at 184+ (fits in 224B fragment buffer).
  if (view.reactiveMusicSystem && typeof view.reactiveMusicSystem.getFrequencyBands === 'function') {
    const bands = view.reactiveMusicSystem.getFrequencyBands();
    view._f32_1[0] = bands.bass || 0;
    view.device.queue.writeBuffer(view.fragmentUniformBuffer, 184, view._f32_1);
    view._f32_1[0] = bands.mid || 0;
    view.device.queue.writeBuffer(view.fragmentUniformBuffer, 188, view._f32_1);
    view._f32_1[0] = bands.treble || 0;
    view.device.queue.writeBuffer(view.fragmentUniformBuffer, 192, view._f32_1);
  }

  // Drive border glow (per-side pulsing) via the helper in viewPlayfield (uniforms + shader primary).
  updateBorderAudioGlow(view.vertexUniformBuffer_border || null, 0, 0, 0, view.device || null);

  const ppUniforms = postProcessUniforms.pack(view._postProcessParams);
  view.device.queue.writeBuffer(view.postProcessUniformBuffer, 0, ppUniforms);
}

/**
 * Execute all render passes (background, main, post-process)
 */
function executeRenderPasses(view: any, commandEncoder: any, result: any) {
  // 1. Background (Video or Shader)
  renderBackgroundPass(view, commandEncoder);

  // 2. Frosted Glass Backboard
  renderFrostedGlassPass(view, commandEncoder);

  // 3. Main scene (Blocks, Grid, Particles)
  renderMainPass(view, commandEncoder, result);

  // 4. Post-process
  renderPostProcessPass(view, commandEncoder);
}

/**
 * Render background pass (procedural or video)
 */
function renderBackgroundPass(view: any, commandEncoder: any) {
  const renderVideo = view.reactiveVideoBackground?.isVideoPlaying ?? false;
  const videoTex = renderVideo ? view.reactiveVideoBackground?.getExternalVideoTexture() : null;
  const clearColors = view.visualEffects.getClearColors();
  const colorAttachment0 = (view._backgroundPassDescriptor.colorAttachments as GPURenderPassColorAttachment[])[0];
  const clearValue = colorAttachment0.clearValue as GPUColorDict;
  clearValue.r = clearColors.r;
  clearValue.g = clearColors.g;
  clearValue.b = clearColors.b;
  clearValue.a = 0.0;

  const bgPassEncoder = commandEncoder.beginRenderPass(view._backgroundPassDescriptor);
  view.backgroundRenderer.draw(bgPassEncoder, renderVideo, videoTex);
  bgPassEncoder.end();
}

/**
 * Render frosted glass backboard pass
 */
function renderFrostedGlassPass(view: any, commandEncoder: any) {
  if (!view.useFrostedGlass || !view.frostedGlassPipeline) return;

  view.updateFrostedGlassUniforms();
  const glassPassEncoder = commandEncoder.beginRenderPass({
    colorAttachments: [{ 
      view: view._offscreenTextureView, 
      loadOp: 'load', 
      storeOp: 'store' 
    }],
    depthStencilAttachment: { 
      view: view._depthTextureView, 
      depthLoadOp: 'load', 
      depthStoreOp: 'store' 
    }
  });
  glassPassEncoder.setPipeline(view.frostedGlassPipeline);
  glassPassEncoder.setVertexBuffer(0, view.frostedGlassVertexBuffer);
  glassPassEncoder.setBindGroup(0, view.frostedGlassBindGroup);
  glassPassEncoder.draw(6);
  glassPassEncoder.end();
}

/**
 * Render main scene pass (blocks, grid, particles)
 */
function renderMainPass(view: any, commandEncoder: any, result: any) {
  view.blockRenderer.updateUniforms(view.state);
  const passEncoder = commandEncoder.beginRenderPass(view._mainPassDescriptor);
  
  // Grid
  passEncoder.setPipeline(view.gridPipeline);
  passEncoder.setBindGroup(0, view.gridBindGroup);
  passEncoder.setVertexBuffer(0, view.gridVertexBuffer);
  passEncoder.draw(view.gridVertexCount);

  view.blockRenderer.draw(passEncoder);

  // Particles (only if active)
  if (result.hasActiveParticles) {
    passEncoder.setPipeline(view.particlePipeline);
    passEncoder.setBindGroup(0, view.particleRenderBindGroup);
    passEncoder.setVertexBuffer(0, view.particleStorageBuffer);
    passEncoder.draw(6, view.particleSystem.maxParticles, 0, 0);
  }

  passEncoder.end();
}

/**
 * Render post-process pass
 */
function renderPostProcessPass(view: any, commandEncoder: any) {
  view.postProcessor.render(commandEncoder, view.vpMatrix as Float32Array);
}
