/**
 * Tetris C++ renderer (Emscripten + WebGPU scaffolding).
 *
 * Bootstrap draw path: Canvas2D colored quads via EM_JS.
 *
 * TODO(#362): Acquire a real wgpu::Device / wgpu::Surface from the browser.
 * TODO(#362): Replace canvas_draw_playfield with WGSL quad pipeline.
 * TODO(later): Composite background video portal from C++ side.
 */

#include <emscripten/emscripten.h>
#include <emscripten/html5.h>
#include <stdint.h>
#include <string.h>

// #include <webgpu/webgpu_cpp.h>  // available when USE_WEBGPU / emdawnwebgpu port is linked

#include "playfield_draw.h"

static const int COLS = 10;
static const int ROWS = 20;
static const int PLAYFIELD_BYTES = COLS * ROWS;

static int g_width = 0;
static int g_height = 0;
static int8_t g_playfield[PLAYFIELD_BYTES];

extern "C" {

EMSCRIPTEN_KEEPALIVE
int init_renderer(int width, int height) {
  g_width = width > 0 ? width : 1;
  g_height = height > 0 ? height : 1;
  memset(g_playfield, 0, sizeof(g_playfield));

  // TODO(#362): wgpu::CreateInstance / RequestAdapter / RequestDevice here.

  EM_ASM({
    if (typeof console !== 'undefined' && console.info) {
      console.info('[cpp renderer] init_renderer — Canvas2D bootstrap (WebGPU WIP)');
    }
  });

  return 1;
}

EMSCRIPTEN_KEEPALIVE
void resize_renderer(int width, int height) {
  g_width = width > 0 ? width : 1;
  g_height = height > 0 ? height : 1;
}

EMSCRIPTEN_KEEPALIVE
void render_frame(float dt) {
  (void)dt;
  // TODO(#362): WebGPU render pass (clear + draw indexed quads).
  canvas_draw_playfield(g_playfield, COLS, ROWS, g_width, g_height);
}

EMSCRIPTEN_KEEPALIVE
void update_playfield(const uint8_t* data, int len) {
  if (!data || len <= 0) return;
  if (len > PLAYFIELD_BYTES) len = PLAYFIELD_BYTES;
  memcpy(g_playfield, data, (size_t)len);
}

/** Zero-copy playfield view for TS (optional fast path). */
EMSCRIPTEN_KEEPALIVE
int8_t* get_playfield_ptr() {
  return g_playfield;
}

EMSCRIPTEN_KEEPALIVE
int get_playfield_len() {
  return PLAYFIELD_BYTES;
}

} // extern "C"
