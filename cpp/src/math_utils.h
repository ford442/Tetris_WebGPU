#pragma once

#include <cmath>

namespace tetris {

struct Mat4 {
  float m[16]; // column-major (gl-matrix / WGSL mat4x4)
};

inline void mat4_identity(Mat4* out) {
  for (int i = 0; i < 16; ++i) out->m[i] = 0.0f;
  out->m[0] = out->m[5] = out->m[10] = out->m[15] = 1.0f;
}

inline void mat4_perspective(Mat4* out, float fovYRad, float aspect, float nearZ, float farZ) {
  const float f = 1.0f / std::tan(fovYRad * 0.5f);
  for (int i = 0; i < 16; ++i) out->m[i] = 0.0f;
  out->m[0] = f / aspect;
  out->m[5] = f;
  out->m[10] = farZ / (nearZ - farZ);
  out->m[11] = -1.0f;
  out->m[14] = (farZ * nearZ) / (nearZ - farZ);
}

inline void mat4_look_at(Mat4* out, float ex, float ey, float ez,
                         float tx, float ty, float tz,
                         float ux, float uy, float uz) {
  float zx = ex - tx, zy = ey - ty, zz = ez - tz;
  float len = std::sqrt(zx * zx + zy * zy + zz * zz);
  if (len > 0.0f) { zx /= len; zy /= len; zz /= len; }

  float xx = uy * zz - uz * zy;
  float xy = uz * zx - ux * zz;
  float xz = ux * zy - uy * zx;
  len = std::sqrt(xx * xx + xy * xy + xz * xz);
  if (len > 0.0f) { xx /= len; xy /= len; xz /= len; }

  float yx = zy * xz - zz * xy;
  float yy = zz * xx - zx * xz;
  float yz = zx * xy - zy * xx;

  out->m[0] = xx; out->m[1] = yx; out->m[2] = zx; out->m[3] = 0.0f;
  out->m[4] = xy; out->m[5] = yy; out->m[6] = zy; out->m[7] = 0.0f;
  out->m[8] = xz; out->m[9] = yz; out->m[10] = zz; out->m[11] = 0.0f;
  out->m[12] = -(xx * ex + xy * ey + xz * ez);
  out->m[13] = -(yx * ex + yy * ey + yz * ez);
  out->m[14] = -(zx * ex + zy * ey + zz * ez);
  out->m[15] = 1.0f;
}

inline void mat4_multiply(Mat4* out, const Mat4* a, const Mat4* b) {
  Mat4 r;
  for (int c = 0; c < 4; ++c) {
    for (int row = 0; row < 4; ++row) {
      r.m[c * 4 + row] =
          a->m[row] * b->m[c * 4 + 0] +
          a->m[4 + row] * b->m[c * 4 + 1] +
          a->m[8 + row] * b->m[c * 4 + 2] +
          a->m[12 + row] * b->m[c * 4 + 3];
    }
  }
  *out = r;
}

} // namespace tetris
