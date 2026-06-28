#include "playfield_draw.h"

#include <emscripten/emscripten.h>

EM_JS(void, js_draw_playfield, (const int8_t* cells, int cols, int rows, int canvas_w, int canvas_h), {
  var canvas = Module.canvas;
  if (!canvas) {
    canvas = document.getElementById('canvaswebgpu');
  }
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Distinctive full-canvas tint — visible proof the wasm draw path ran.
  ctx.fillStyle = '#071812';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  var heap = HEAP8;
  var offset = cells >> 0;

  var cellPx = Math.floor(Math.min(canvas.width / (cols + 2), canvas.height / (rows + 2)));
  if (cellPx < 4) cellPx = 4;

  var boardW = cellPx * cols;
  var boardH = cellPx * rows;
  var originX = Math.floor((canvas.width - boardW) * 0.5);
  var originY = Math.floor((canvas.height - boardH) * 0.5);
  var gap = Math.max(1, Math.floor(cellPx * 0.06));

  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(originX - gap, originY - gap, boardW + gap * 2, boardH + gap * 2);

  // Lime frame marks output as C++ / wasm (not TS placeholder).
  ctx.strokeStyle = 'rgba(0, 255, 140, 0.9)';
  ctx.lineWidth = 3;
  ctx.strokeRect(originX - gap - 5, originY - gap - 5, boardW + gap * 2 + 10, boardH + gap * 2 + 10);

  ctx.fillStyle = 'rgba(0, 255, 140, 0.95)';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('C++ wasm', 10, canvas.height - 10);

  var palette = [
    [77, 77, 77],
    [242, 250, 255],
    [235, 242, 255],
    [255, 245, 235],
    [255, 255, 242],
    [235, 255, 242],
    [245, 235, 255],
    [255, 240, 245],
  ];

  for (var row = 0; row < rows; row++) {
    for (var col = 0; col < cols; col++) {
      var value = heap[offset + row * cols + col];
      if (value === 0) continue;

      var colorIndex = value < 0 ? -value : value;
      if (colorIndex < 0 || colorIndex > 7) colorIndex = 0;
      var rgb = palette[colorIndex];
      var alpha = value < 0 ? 0.35 : 1.0;

      var x = originX + col * cellPx + gap;
      var y = originY + row * cellPx + gap;
      var size = cellPx - gap * 2;

      ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
      ctx.fillRect(x, y, size, size);

      ctx.strokeStyle = 'rgba(255, 255, 255, ' + (alpha * 0.35) + ')';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    }
  }
});

void canvas_draw_playfield(const int8_t* playfield, int cols, int rows, int canvas_w, int canvas_h) {
  js_draw_playfield(playfield, cols, rows, canvas_w, canvas_h);
}
