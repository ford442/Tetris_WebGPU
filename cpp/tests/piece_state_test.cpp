#include <doctest.h>

#include <stddef.h>

#include "generated/parity_vectors.h"
#include "piece_state.h"

TEST_CASE("PieceState layout matches the TS HEAP view") {
  CHECK(sizeof(PieceState) == static_cast<size_t>(parity::kPieceStateSize));
  CHECK(offsetof(PieceState, piece_type) == static_cast<size_t>(parity::kOffsetPieceType));
  CHECK(offsetof(PieceState, rotation) == static_cast<size_t>(parity::kOffsetRotation));
  CHECK(offsetof(PieceState, x) == static_cast<size_t>(parity::kOffsetX));
  CHECK(offsetof(PieceState, y) == static_cast<size_t>(parity::kOffsetY));
  CHECK(offsetof(PieceState, ghost_y) == static_cast<size_t>(parity::kOffsetGhostY));
  CHECK(offsetof(PieceState, lock_flash) == static_cast<size_t>(parity::kOffsetLockFlash));
}

TEST_CASE("PieceState value-initializes to an empty piece") {
  const PieceState state = {};
  CHECK(state.piece_type == 0);
  CHECK(state.lock_flash == doctest::Approx(0.0f));
}
