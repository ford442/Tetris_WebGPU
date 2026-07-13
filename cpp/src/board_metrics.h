#pragma once

/**
 * World-space board metrics — must stay aligned with:
 *   src/webgpu/renderMetrics.ts
 *   src/config/renderConfig.ts (BLOCK_CONFIG.WORLD_SIZE)
 */

namespace tetris {

constexpr int kBoardCols = 10;
constexpr int kBoardRows = 20;
constexpr int kPlayfieldBytes = kBoardCols * kBoardRows;

constexpr float kBlockWorldSize = 2.2f;
constexpr float kBlockHalfWorldSize = kBlockWorldSize * 0.5f;

constexpr float kBoardWorldCenterX = ((kBoardCols - 1) * kBlockWorldSize) * 0.5f;
constexpr float kBoardWorldCenterY = -((kBoardRows - 1) * kBlockWorldSize) * 0.5f;

constexpr float kCameraZ = 75.0f;
constexpr float kCameraFovDeg = 42.0f;
constexpr float kCameraNear = 1.0f;
constexpr float kCameraFar = 150.0f;

inline float boardWorldX(int col) { return static_cast<float>(col) * kBlockWorldSize; }
inline float boardWorldY(int row) { return static_cast<float>(row) * -kBlockWorldSize; }

inline float blockCenterX(int col) { return boardWorldX(col) + kBlockHalfWorldSize; }
inline float blockCenterY(int row) { return boardWorldY(row) - kBlockHalfWorldSize; }

} // namespace tetris
