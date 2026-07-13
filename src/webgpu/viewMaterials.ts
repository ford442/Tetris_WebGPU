/**
 * Material and theme management for the View renderer.
 */

import type { Piece } from '../game/pieces.js';
import { themes, type ThemeColors } from './themes.js';
import { Materials } from './materials.js';
import { renderLogger } from '../utils/logger.js';
import { getBlockTextureConfig } from './blockTexture.js';

export interface MaterialViewLike {
  device: GPUDevice;
  currentTheme: ThemeColors;
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

  // Write particleMaterialType to offset 116 (previously pad2)
  const particleMaterialScratch = new Uint32Array([getMaterialTypeIndex()]);
  view.device.queue.writeBuffer(view.fragmentUniformBuffer, 116, particleMaterialScratch);

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
  piece: Piece | null,
  currentTheme: ThemeColors,
  blockSize: number = 20
) {
  renderMaterialBlock(ctx, piece, currentTheme, blockSize, 1);
}

/** Draw hold / next preview with beveled blocks matching board material colors. */
export function renderMaterialBlock(
  ctx: CanvasRenderingContext2D,
  piece: Piece | null,
  currentTheme: ThemeColors,
  blockSize: number,
  slotScale = 1,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(8, 12, 24, 0.55)';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(120, 180, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

  if (!piece) return;

  const { blocks } = piece;
  const bs = blockSize * slotScale;
  const offsetX = (w - blocks[0].length * bs) / 2;
  const offsetY = (h - blocks.length * bs) / 2;

  blocks.forEach((row: number[], y: number) => {
    row.forEach((value: number, x: number) => {
      if (value <= 0) return;
      const color = currentTheme[value] as number[] | undefined;
      if (!color || color.length < 3) return;
      const px = offsetX + x * bs;
      const py = offsetY + y * bs;
      const r = Math.floor(color[0] * 255);
      const g = Math.floor(color[1] * 255);
      const b = Math.floor(color[2] * 255);

      const grad = ctx.createLinearGradient(px, py, px + bs, py + bs);
      grad.addColorStop(0, `rgba(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)}, 1)`);
      grad.addColorStop(0.45, `rgb(${r}, ${g}, ${b})`);
      grad.addColorStop(1, `rgb(${Math.floor(r * 0.55)}, ${Math.floor(g * 0.55)}, ${Math.floor(b * 0.55)})`);

      ctx.fillStyle = grad;
      ctx.fillRect(px + 1, py + 1, bs - 2, bs - 2);

      ctx.strokeStyle = `rgba(255, 255, 255, 0.35)`;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 1.5, py + 1.5, bs - 3, bs - 3);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(px + 2, py + 2, bs * 0.45, bs * 0.18);
    });
  });
}

/** Stack multiple upcoming pieces in one side-panel canvas. */
export function renderNextQueue(
  ctx: CanvasRenderingContext2D,
  queue: Piece[],
  currentTheme: ThemeColors,
  blockSize = 18,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(8, 12, 24, 0.55)';
  ctx.fillRect(0, 0, w, h);

  if (!queue.length) return;

  const slotH = h / queue.length;
  for (let i = 0; i < queue.length; i++) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, i * slotH, w, slotH);
    ctx.clip();
    const piece = queue[i];
    const rows = piece.blocks.length;
    const cols = piece.blocks[0]?.length ?? 0;
    const bs = Math.min(blockSize, Math.floor(Math.min(w / (cols + 1), slotH / (rows + 1))));
    const offsetX = (w - cols * bs) / 2;
    const offsetY = i * slotH + (slotH - rows * bs) / 2;

    const themeColors = Object.values(currentTheme).filter(
      (v): v is number[] => Array.isArray(v) && v.length >= 3,
    );

    piece.blocks.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value <= 0) return;
        const color = themeColors[value];
        if (!color) return;
        const px = offsetX + x * bs;
        const py = offsetY + y * bs;
        const r = Math.floor(color[0] * 255);
        const g = Math.floor(color[1] * 255);
        const b = Math.floor(color[2] * 255);
        const grad = ctx.createLinearGradient(px, py, px + bs, py + bs);
        grad.addColorStop(0, `rgba(${Math.min(255, r + 35)}, ${Math.min(255, g + 35)}, ${Math.min(255, b + 35)}, 1)`);
        grad.addColorStop(1, `rgb(${Math.floor(r * 0.6)}, ${Math.floor(g * 0.6)}, ${Math.floor(b * 0.6)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(px + 1, py + 1, bs - 2, bs - 2);
      });
    });
    ctx.restore();

    if (i < queue.length - 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.moveTo(4, (i + 1) * slotH);
      ctx.lineTo(w - 4, (i + 1) * slotH);
      ctx.stroke();
    }
  }
}
