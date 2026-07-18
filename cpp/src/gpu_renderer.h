#pragma once

#include <stdint.h>

#include "piece_state.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Returns 1 when the WebGPU instanced draw path initialized successfully. */
int gpu_renderer_is_active(void);

/** Initialize WebGPU surface + pipeline. canvas_selector is the HTML canvas id (no #). */
int gpu_renderer_init(const char* canvas_selector, int width, int height);

void gpu_renderer_resize(int width, int height);
void gpu_renderer_shutdown(void);

/** Draw locked + active + ghost blocks from playfield + optional piece state. */
void gpu_renderer_render(const int8_t* playfield, int cols, int rows,
                         const PieceState* piece_state, float dt);

/** Upload RGBA8 block atlas pixels (e.g. block.png). Returns 1 on success. */
int gpu_renderer_set_block_texture(const uint8_t* data, int width, int height, int byte_len);

#ifdef __cplusplus
}
#endif
