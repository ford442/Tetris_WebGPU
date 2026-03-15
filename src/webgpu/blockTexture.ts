export const PROCEDURAL_BLOCK_TEXTURE_SIZE = 256;

export type GradientStop = {
  offset: number;
  color: string;
};

export interface BlockTextureGradient {
  addColorStop(offset: number, color: string): void;
}

export interface BlockTexturePainter {
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): BlockTextureGradient;
  fillStyle: string | BlockTextureGradient | CanvasGradient;
  strokeStyle: string;
  lineWidth: number;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
}

export function resolveBlockTextureUrl(_moduleUrl: string): string {
  return import.meta.env.BASE_URL + 'block.png';
}

export function getTextureMipLevelCount(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

export function getProceduralBlockTextureGradientStops(): GradientStop[] {
  return [
    { offset: 0, color: '#d9dde5' },
    { offset: 0.24, color: '#f7fbff' },
    { offset: 0.5, color: '#ffffff' },
    { offset: 0.76, color: '#c3ccd9' },
    { offset: 1, color: '#8c96a6' },
  ];
}

export function paintProceduralBlockTexture(ctx: BlockTexturePainter, size = PROCEDURAL_BLOCK_TEXTURE_SIZE): void {
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  for (const stop of getProceduralBlockTextureGradientStops()) {
    gradient.addColorStop(stop.offset, stop.color);
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, size - 8, size - 8);

  ctx.strokeStyle = '#f0e68c';
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, size - 24, size - 24);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 6;
  ctx.strokeRect(20, 20, size - 40, size * 0.34);

  ctx.strokeStyle = 'rgba(110, 180, 255, 0.22)';
  ctx.lineWidth = 3;
  ctx.strokeRect(28, size * 0.44, size - 56, size * 0.34);
}
