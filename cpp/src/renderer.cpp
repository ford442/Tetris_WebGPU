/**
 * Tetris C++ renderer (Emscripten + WebGPU instanced blocks).
 *
 * WebGPU path: instanced colored cubes aligned to TS renderMetrics.
 * Fallback: minimal Canvas2D draw when WebGPU device/surface unavailable.
 */

#include <emscripten/emscripten.h>
#include <stdint.h>
#include <string.h>

#include "board_metrics.h"
#include "gpu_renderer.h"
#include "piece_state.h"
#include "playfield_draw.h"
#include "renderer_backend.h"

#if defined(TETRIS_ENABLE_WEBGPU)
#include <webgpu/webgpu.h>
#endif

using namespace tetris;

static int g_width = 0;
static int g_height = 0;
static int8_t g_playfield[kPlayfieldBytes];
static PieceState g_piece_state = {};
static int g_backend = RENDERER_BACKEND_NONE;

extern "C" {

EMSCRIPTEN_KEEPALIVE
int init_renderer(int width, int height) {
  g_width = width > 0 ? width : 1;
  g_height = height > 0 ? height : 1;
  memset(g_playfield, 0, sizeof(g_playfield));
  memset(&g_piece_state, 0, sizeof(g_piece_state));

  const int gpu_ok = gpu_renderer_init("canvaswebgpu", g_width, g_height);
  g_backend = gpu_ok ? RENDERER_BACKEND_WEBGPU : RENDERER_BACKEND_CANVAS2D;

  if (gpu_ok) {
    EM_ASM({
      if (typeof console !== 'undefined' && console.info) {
        console.info('[cpp renderer] init_renderer — WebGPU (clear + instanced blocks when pipeline ready)');
      }
    });
  } else {
    EM_ASM({
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[cpp renderer] init_renderer — Canvas2D fallback (WebGPU unavailable)');
      }
    });
  }

  return 1;
}

EMSCRIPTEN_KEEPALIVE
void resize_renderer(int width, int height) {
  g_width = width > 0 ? width : 1;
  g_height = height > 0 ? height : 1;
  if (gpu_renderer_is_active()) {
    gpu_renderer_resize(g_width, g_height);
  }
}

EMSCRIPTEN_KEEPALIVE
void render_frame(float dt) {
  if (gpu_renderer_is_active()) {
    gpu_renderer_render(g_playfield, kBoardCols, kBoardRows, &g_piece_state, dt);
    return;
  }
  canvas_draw_playfield(g_playfield, kBoardCols, kBoardRows, g_width, g_height, 1);
}

EMSCRIPTEN_KEEPALIVE
void update_playfield(const uint8_t* data, int len) {
  if (!data || len <= 0) return;
  if (len > kPlayfieldBytes) len = kPlayfieldBytes;
  memcpy(g_playfield, data, static_cast<size_t>(len));
}

EMSCRIPTEN_KEEPALIVE
int8_t* get_playfield_ptr() {
  return g_playfield;
}

EMSCRIPTEN_KEEPALIVE
int get_playfield_len() {
  return kPlayfieldBytes;
}

EMSCRIPTEN_KEEPALIVE
PieceState* get_piece_state_ptr() {
  return &g_piece_state;
}

EMSCRIPTEN_KEEPALIVE
void update_piece_state(int8_t piece_type, int8_t rotation, int8_t x, int8_t y,
                        int8_t ghost_y, float lock_flash) {
  g_piece_state.piece_type = piece_type;
  g_piece_state.rotation = rotation;
  g_piece_state.x = x;
  g_piece_state.y = y;
  g_piece_state.ghost_y = ghost_y;
  g_piece_state.lock_flash = lock_flash;
}

EMSCRIPTEN_KEEPALIVE
int get_renderer_backend() {
  return g_backend;
}

EMSCRIPTEN_KEEPALIVE
int is_gpu_renderer_active() {
  return g_backend == RENDERER_BACKEND_WEBGPU ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int is_canvas_fallback_active() {
  return g_backend == RENDERER_BACKEND_CANVAS2D ? 1 : 0;
}

} // extern "C"
