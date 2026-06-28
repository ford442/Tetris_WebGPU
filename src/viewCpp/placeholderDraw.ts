import type { ThemeColors } from '../webgpu/themes.js';

const COLS = 10;
const ROWS = 20;

const PIECE_RGB: [number, number, number][] = [
  [77, 77, 77],
  [242, 250, 255],
  [235, 242, 255],
  [255, 245, 235],
  [255, 255, 242],
  [235, 255, 242],
  [245, 235, 255],
  [255, 240, 245],
];

function pieceRgb(index: number, theme: ThemeColors): [number, number, number] {
  const abs = Math.abs(index);
  const themeColor = theme[abs];
  if (themeColor && themeColor.length >= 3) {
    return [
      Math.round(themeColor[0] * 255),
      Math.round(themeColor[1] * 255),
      Math.round(themeColor[2] * 255),
    ];
  }
  return PIECE_RGB[abs] ?? PIECE_RGB[0];
}

/** Draw the projected playfield grid (locked, ghost, active piece). */
export function drawPlayfield2D(
  ctx: CanvasRenderingContext2D,
  playfield: number[][] | undefined,
  theme: ThemeColors,
  canvasW: number,
  canvasH: number,
): void {
  if (!playfield) return;

  const cellPx = Math.floor(Math.min(canvasW / (COLS + 2), canvasH / (ROWS + 4)));
  if (cellPx < 4) return;

  const boardW = cellPx * COLS;
  const boardH = cellPx * ROWS;
  const originX = Math.floor((canvasW - boardW) * 0.5);
  const originY = Math.floor((canvasH - boardH) * 0.5) + Math.floor(cellPx * 1.2);
  const gap = Math.max(1, Math.floor(cellPx * 0.06));

  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(originX - gap * 2, originY - gap * 2, boardW + gap * 4, boardH + gap * 4);

  for (let row = 0; row < ROWS; row++) {
    const line = playfield[row];
    if (!line) continue;
    for (let col = 0; col < COLS; col++) {
      const value = line[col] ?? 0;
      if (!value) continue;

      const rgb = pieceRgb(value, theme);
      const alpha = value < 0 ? 0.35 : 1.0;

      const x = originX + col * cellPx + gap;
      const y = originY + row * cellPx + gap;
      const size = cellPx - gap * 2;

      ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
      ctx.fillRect(x, y, size, size);

      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.3})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    }
  }
}

/** WIP banner so testers know which renderer is active. */
export function drawWipBanner(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  cppLoaded: boolean,
): void {
  const label = 'C++ Emscripten WebGPU (WIP)';
  const sub = cppLoaded ? 'wasm module loaded — TS placeholder overlay' : 'TS Canvas2D bootstrap';

  ctx.save();
  const fontSize = Math.max(12, Math.floor(canvasW * 0.018));
  ctx.font = `${fontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const y = Math.floor(canvasH * 0.04);
  const metrics = ctx.measureText(label);
  const padX = 14;
  const padY = 8;
  const boxW = metrics.width + padX * 2;
  const boxH = fontSize * 2 + padY * 2 + 4;
  const x = (canvasW - boxW) * 0.5;

  ctx.fillStyle = 'rgba(8, 8, 16, 0.72)';
  ctx.fillRect(x, y, boxW, boxH);

  ctx.fillStyle = '#f8c8ff';
  ctx.fillText(label, canvasW * 0.5, y + padY);
  ctx.font = `${Math.max(10, Math.floor(canvasW * 0.012))}px monospace`;
  ctx.fillStyle = 'rgba(248, 200, 255, 0.75)';
  ctx.fillText(sub, canvasW * 0.5, y + padY + fontSize + 2);
  ctx.restore();
}
