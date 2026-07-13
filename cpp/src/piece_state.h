#pragma once

#include <stdint.h>

/** Extended piece state — 16 bytes, shared with TypeScript HEAP view. */
struct PieceState {
  int8_t piece_type;   /**< 0 = none, 1–7 = color index */
  int8_t rotation;     /**< 0–3 SRS rotation index */
  int8_t x;            /**< board column (piece origin) */
  int8_t y;            /**< board row (piece origin) */
  int8_t ghost_y;      /**< ghost piece origin row */
  int8_t _pad0[3];
  float lock_flash;    /**< 0–1 lock delay pulse (offset 8) */
};

static_assert(sizeof(PieceState) == 12, "PieceState must be 12 bytes for TS HEAP layout");
