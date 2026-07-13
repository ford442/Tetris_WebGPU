#pragma once

#include <stdint.h>

/** Draw playfield via Canvas2D (fallback when WebGPU path is unavailable). */
void canvas_draw_playfield(const int8_t* playfield, int cols, int rows, int canvas_w, int canvas_h,
                           int show_fallback_badge);
