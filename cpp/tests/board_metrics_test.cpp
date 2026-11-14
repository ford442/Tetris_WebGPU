#include <doctest.h>

#include "board_metrics.h"
#include "generated/parity_vectors.h"

using namespace tetris;

namespace {
const double kTol = parity::kTolerance;
}

TEST_CASE("board dimensions and block size match the shared vectors") {
  CHECK(kBoardCols == parity::kCols);
  CHECK(kBoardRows == parity::kRows);
  CHECK(kPlayfieldBytes == parity::kPlayfieldBytes);
  CHECK(static_cast<double>(kBlockWorldSize) ==
        doctest::Approx(parity::kBlockWorldSize).epsilon(kTol));
}

TEST_CASE("board world center matches the shared vectors") {
  CHECK(static_cast<double>(kBoardWorldCenterX) == doctest::Approx(parity::kCenterX).epsilon(kTol));
  CHECK(static_cast<double>(kBoardWorldCenterY) == doctest::Approx(parity::kCenterY).epsilon(kTol));
}

TEST_CASE("boardWorldX / boardWorldY match the shared vectors") {
  for (int i = 0; i < parity::kWorldXCount; ++i) {
    const auto& c = parity::kWorldX[i];
    CAPTURE(c.index);
    CHECK(static_cast<double>(boardWorldX(c.index)) == doctest::Approx(c.value).epsilon(kTol));
  }
  for (int i = 0; i < parity::kWorldYCount; ++i) {
    const auto& c = parity::kWorldY[i];
    CAPTURE(c.index);
    CHECK(static_cast<double>(boardWorldY(c.index)) == doctest::Approx(c.value).epsilon(kTol));
  }
}

TEST_CASE("blockCenterX / blockCenterY match the shared vectors") {
  for (int i = 0; i < parity::kBlockCenterXCount; ++i) {
    const auto& c = parity::kBlockCenterX[i];
    CAPTURE(c.index);
    CHECK(static_cast<double>(blockCenterX(c.index)) == doctest::Approx(c.value).epsilon(kTol));
  }
  for (int i = 0; i < parity::kBlockCenterYCount; ++i) {
    const auto& c = parity::kBlockCenterY[i];
    CAPTURE(c.index);
    CHECK(static_cast<double>(blockCenterY(c.index)) == doctest::Approx(c.value).epsilon(kTol));
  }
}

TEST_CASE("the board is centered on its own world center") {
  CHECK(static_cast<double>((boardWorldX(0) + boardWorldX(kBoardCols - 1)) * 0.5f) ==
        doctest::Approx(static_cast<double>(kBoardWorldCenterX)).epsilon(kTol));
  CHECK(static_cast<double>((boardWorldY(0) + boardWorldY(kBoardRows - 1)) * 0.5f) ==
        doctest::Approx(static_cast<double>(kBoardWorldCenterY)).epsilon(kTol));
}

TEST_CASE("camera constants match the shared vectors") {
  CHECK(static_cast<double>(kCameraZ) == doctest::Approx(parity::kCameraZ));
  CHECK(static_cast<double>(kCameraFovDeg) == doctest::Approx(parity::kCameraFovDeg));
  CHECK(static_cast<double>(kCameraNear) == doctest::Approx(parity::kCameraNear));
  CHECK(static_cast<double>(kCameraFar) == doctest::Approx(parity::kCameraFar));
}
