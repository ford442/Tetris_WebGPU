/**
 * Material and theme management for the View renderer.
 * Extracted from viewWebGPU.ts to keep file sizes manageable.
 */

import { themes, Themes } from './themes.js';
import { getPieceMaterial } from './materials.js';
import { renderLogger } from '../utils/logger.js';

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
}

/**
 * Set a material-aware theme by name.
 */
export function setMaterialTheme(view: MaterialViewLike, themeName: string, pieceType: number = 1) {
  if (!view.device) return;

  const theme = themes[themeName as keyof Themes];
  if (!theme) {
    renderLogger.warn(`Unknown theme: ${themeName}`);
    return;
  }

  view.currentTheme = theme;

  const materialThemeName = (theme as any).materialTheme || 'classic';
  view.usePremiumMaterials = ['gold', 'chrome', 'glass', 'premium', 'cyber', 'imageSampled'].includes(materialThemeName);

  view.currentMaterial = getPieceMaterial(materialThemeName, pieceType);

  updateMaterialUniforms(view);

  const bgColors = (theme as any).backgroundColors;
  if (bgColors && view.backgroundUniformBuffer) {
    view._f32_3.set(bgColors[0]); view.device.queue.writeBuffer(view.backgroundUniformBuffer, 16, view._f32_3);
    view._f32_3.set(bgColors[1]); view.device.queue.writeBuffer(view.backgroundUniformBuffer, 32, view._f32_3);
    view._f32_3.set(bgColors[2]); view.device.queue.writeBuffer(view.backgroundUniformBuffer, 48, view._f32_3);
  }

  renderLogger.info(`Switched to ${themeName} with material ${materialThemeName}`);
}

// Maps material names to pbrBlocks.ts materialType indices
// 0=Classic, 1=Gold, 2=Chrome, 3=Glass, 4=Cyber, 5=Gem
function getMaterialTypeIndex(name: string): number {
  switch (name) {
    case 'Gold':    return 1;
    case 'Chrome':  return 2;
    case 'Glass':   return 3;
    case 'Cyber':   return 4;
    case 'Ruby': case 'Sapphire': case 'Emerald': return 5;
    default:        return 0;
  }
}

/**
 * Write material uniform data to the fragment uniform buffer.
 * Offsets match pbrBlocks.ts FragmentUniforms: metallic starts at byte 48,
 * materialType (u32) at byte 80, particleIntensity/enablePBR/textureMix at 84-92.
 */
export function updateMaterialUniforms(view: MaterialViewLike) {
  if (!view.device || !view.currentMaterial) return;

  const m = view.currentMaterial;

  // Floats: metallic(48) roughness(52) transmission(56) ior(60)
  //         subsurface(64) clearcoat(68) anisotropic(72) dispersion(76)
  view._materialUniforms[0] = m.metallic;
  view._materialUniforms[1] = m.roughness;
  view._materialUniforms[2] = m.transmission;
  view._materialUniforms[3] = m.ior;
  view._materialUniforms[4] = m.subsurface;
  view._materialUniforms[5] = m.clearcoat;
  view._materialUniforms[6] = m.anisotropic;
  view._materialUniforms[7] = m.dispersion;
  view.device.queue.writeBuffer(view.fragmentUniformBuffer, 48, view._materialUniforms.subarray(0, 8));

  // materialType as u32 at byte 80 — must use Uint32Array to write correct bit pattern
  const u32Scratch = new Uint32Array([getMaterialTypeIndex(m.name)]);
  view.device.queue.writeBuffer(view.fragmentUniformBuffer, 80, u32Scratch);

  // particleIntensity(84) enablePBR(88) textureMix(92)
  view._materialUniforms[0] = view.particleInteractionUniforms.particleInfluence;
  view._materialUniforms[1] = view.usePremiumMaterials ? 1.0 : 0.0;
  view._materialUniforms[2] = m.name === 'Image Sampled' ? 1.0 : 0.5;
  view.device.queue.writeBuffer(view.fragmentUniformBuffer, 84, view._materialUniforms.subarray(0, 3));
}

/**
 * Cycle through available themes.
 */
export function cycleTheme(view: MaterialViewLike) {
  const themeNames = Object.keys(themes);
  const currentIndex = themeNames.indexOf((view.currentTheme as any).materialTheme || 'neon');
  const nextIndex = (currentIndex + 1) % themeNames.length;
  setMaterialTheme(view, themeNames[nextIndex]);
}

/**
 * Render a piece preview onto a 2D canvas context (next piece / hold piece).
 */
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
  const themeColors = Object.values(currentTheme);

  const offsetX = (ctx.canvas.width - blocks[0].length * blockSize) / 2;
  const offsetY = (ctx.canvas.height - blocks.length * blockSize) / 2;

  blocks.forEach((row: number[], y: number) => {
    row.forEach((value: number, x: number) => {
      if (value > 0) {
        const color = themeColors[value] as number[];
        const px = offsetX + x * blockSize;
        const py = offsetY + y * blockSize;

        const r = Math.floor(color[0] * 255);
        const g = Math.floor(color[1] * 255);
        const b = Math.floor(color[2] * 255);
        const cssColor = `rgb(${r}, ${g}, ${b})`;
        const brightColor = `rgb(${Math.min(r + 50, 255)}, ${Math.min(g + 50, 255)}, ${Math.min(b + 50, 255)})`;

        ctx.save();
        ctx.shadowColor = cssColor;
        ctx.shadowBlur = 30;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
        ctx.fillRect(px + 2, py + 2, blockSize - 4, blockSize - 4);

        ctx.shadowColor = cssColor;
        ctx.shadowBlur = 15;
        ctx.strokeStyle = brightColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 2, blockSize - 4, blockSize - 4);

        ctx.shadowColor = 'white';
        ctx.shadowBlur = 5;
        ctx.fillStyle = `rgba(255, 255, 255, 0.4)`;
        ctx.fillRect(px + 4, py + 4, blockSize - 8, blockSize - 8);

        ctx.restore();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.moveTo(px + 2, py + blockSize - 2);
        ctx.lineTo(px + 2, py + 2);
        ctx.lineTo(px + blockSize - 2, py + 2);
        ctx.lineTo(px + blockSize - 6, py + 6);
        ctx.lineTo(px + 6, py + 6);
        ctx.lineTo(px + 6, py + blockSize - 6);
        ctx.closePath();
        ctx.fill();
      }
    });
  });
}
