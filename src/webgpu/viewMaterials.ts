/**
 * Material and theme management for the View renderer.
 */

import { themes } from './themes.js';
import { Materials } from './materials.js';
import { renderLogger } from '../utils/logger.js';
import { getBlockTextureConfig } from './blockTexture.js';

export interface MaterialViewLike {
  device: GPUDevice;
  currentTheme: any;
  usePremiumMaterials: boolean;
  currentMaterial: any;
  fragmentUniformBuffer: GPUBuffer;
  materialUniformBuffer: GPUBuffer;
  backgroundUniformBuffer: GPUBuffer;
  _f32_3: Float32Array;
  _materialUniforms: Float32Array;
  particleInteractionUniforms: {
    particleInfluence: number;
    glassDistortion: number;
    goldSpecularBoost: number;
    cyberEmissivePulse: number;
  };
  useWireframe: boolean;
  authoredBlockTextureLoaded?: boolean;
}

export function setMaterialTheme(view: MaterialViewLike, _themeName?: string, _pieceType = 1) {
  if (!view.device) return;

  view.currentTheme = themes.imageSampled;
  view.usePremiumMaterials = true;
  view.currentMaterial = Materials.imageSampled;
  updateMaterialUniforms(view);

  const bgColors = view.currentTheme.backgroundColors;
  if (bgColors && view.backgroundUniformBuffer) {
    view._f32_3.set(bgColors[0]); view.device.queue.writeBuffer(view.backgroundUniformBuffer, 16, view._f32_3);
    view._f32_3.set(bgColors[1]); view.device.queue.writeBuffer(view.backgroundUniformBuffer, 32, view._f32_3);
    view._f32_3.set(bgColors[2]); view.device.queue.writeBuffer(view.backgroundUniformBuffer, 48, view._f32_3);
  }

  renderLogger.info('Using imageSampled material (block.png)');
}

function getMaterialTypeIndex(): number {
  return 0;
}

export function updateMaterialUniforms(view: MaterialViewLike) {
  if (!view.device || !view.currentMaterial) return;

  const m = view.currentMaterial;

  view._materialUniforms[0] = m.metallic;
  view._materialUniforms[1] = m.roughness;
  view._materialUniforms[2] = m.transmission;
  view._materialUniforms[3] = m.ior;
  view._materialUniforms[4] = m.subsurface;
  view._materialUniforms[5] = m.clearcoat;
  view._materialUniforms[6] = m.anisotropic;
  view._materialUniforms[7] = m.dispersion;
  view.device.queue.writeBuffer(view.fragmentUniformBuffer, 48, view._materialUniforms.subarray(0, 8));

  const u32Scratch = new Uint32Array([getMaterialTypeIndex()]);
  view.device.queue.writeBuffer(view.fragmentUniformBuffer, 80, u32Scratch);

  view._materialUniforms[0] = view.particleInteractionUniforms.particleInfluence;
  view._materialUniforms[1] = 1.0;
  const authoredLoaded = view.authoredBlockTextureLoaded !== false;
  view._materialUniforms[2] = authoredLoaded ? 0.94 : 0.55;

  view.device.queue.writeBuffer(view.fragmentUniformBuffer, 84, view._materialUniforms.subarray(0, 3));

  // Authored imageSampled glass opacity curve params.
  // Stored in FragmentUniforms.reserved2 (vec4f at byte offset 120).
  // x=glassMin, y=glassMax, z=glassFresnelPower, w unused.
  const cfg = getBlockTextureConfig();
  // Priority:
  // 1) texture config overrides (artist-friendly per-texture tuning)
  // 2) material defaults (imageSampled)
  // 3) hardcoded reference fallback
  const glassMin = cfg.authoredGlassMin ?? m.authoredGlassMin ?? 0.38;
  const glassMax = cfg.authoredGlassMax ?? m.authoredGlassMax ?? 0.78;
  const glassPower = cfg.authoredGlassFresnelPower ?? m.authoredGlassFresnelPower ?? 2.0;

  const glassParams = new Float32Array([glassMin, glassMax, glassPower, 0.0]);
  view.device.queue.writeBuffer(view.fragmentUniformBuffer, 120, glassParams);
}

export function cycleTheme(view: MaterialViewLike) {
  setMaterialTheme(view);
}

export function setWireframe(view: MaterialViewLike, enabled: boolean) {
  view.useWireframe = !!enabled;
  if (view.device && view.fragmentUniformBuffer) {
    const scratch = new Float32Array([enabled ? 1.0 : 0.0]);
    view.device.queue.writeBuffer(view.fragmentUniformBuffer, 104, scratch);
  }
}

export function renderPiece(
  ctx: CanvasRenderingContext2D,
  piece: any,
  currentTheme: any,
  blockSize: number = 20
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  const gridSize = blockSize;

  ctx.beginPath();
  for (let x = 0; x <= ctx.canvas.width; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ctx.canvas.height);
  }
  for (let y = 0; y <= ctx.canvas.height; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(ctx.canvas.width, y);
  }
  ctx.stroke();

  if (!piece) return;

  const { blocks } = piece;
  const themeColors = Object.values(currentTheme).filter(
    (v): v is number[] => Array.isArray(v) && v.length >= 3
  );

  const offsetX = (ctx.canvas.width - blocks[0].length * blockSize) / 2;
  const offsetY = (ctx.canvas.height - blocks.length * blockSize) / 2;

  blocks.forEach((row: number[], y: number) => {
    row.forEach((value: number, x: number) => {
      if (value > 0) {
        const color = themeColors[value] as number[] | undefined;
        if (!color) return;
        const px = offsetX + x * blockSize;
        const py = offsetY + y * blockSize;

        const r = Math.floor(color[0] * 255);
        const g = Math.floor(color[1] * 255);
        const b = Math.floor(color[2] * 255);
        const cssColor = `rgb(${r}, ${g}, ${b})`;

        ctx.save();
        ctx.strokeStyle = cssColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 2, blockSize - 4, blockSize - 4);
        ctx.restore();
      }
    });
  });
}
