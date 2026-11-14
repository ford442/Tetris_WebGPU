#include <doctest.h>

#include <cmath>

#include "generated/parity_vectors.h"
#include "math_utils.h"

using namespace tetris;

namespace {

constexpr float kPi = 3.14159265358979323846f;

Mat4 from_doubles(const double (&src)[16]) {
  Mat4 out;
  for (int i = 0; i < 16; ++i) out.m[i] = static_cast<float>(src[i]);
  return out;
}

void check_matrix(const Mat4& actual, const double (&expected)[16]) {
  for (int i = 0; i < 16; ++i) {
    CAPTURE(i);
    CHECK(static_cast<double>(actual.m[i]) ==
          doctest::Approx(expected[i]).epsilon(parity::kTolerance));
  }
}

}  // namespace

TEST_CASE("mat4_identity writes a column-major identity") {
  Mat4 m;
  for (float& v : m.m) v = 42.0f;
  mat4_identity(&m);
  for (int c = 0; c < 4; ++c) {
    for (int r = 0; r < 4; ++r) {
      CAPTURE(c);
      CAPTURE(r);
      CHECK(m.m[c * 4 + r] == doctest::Approx(c == r ? 1.0f : 0.0f));
    }
  }
}

TEST_CASE("mat4_perspective matches gl-matrix perspectiveZO") {
  Mat4 m;
  mat4_perspective(&m, static_cast<float>(parity::kPerspectiveFovYDeg) * kPi / 180.0f,
                   static_cast<float>(parity::kPerspectiveAspect),
                   static_cast<float>(parity::kPerspectiveNear),
                   static_cast<float>(parity::kPerspectiveFar));
  check_matrix(m, parity::kPerspectiveExpected);
}

TEST_CASE("mat4_look_at matches gl-matrix lookAt") {
  for (int i = 0; i < parity::kLookAtCaseCount; ++i) {
    const auto& c = parity::kLookAtCases[i];
    CAPTURE(i);
    Mat4 m;
    mat4_look_at(&m, static_cast<float>(c.eye[0]), static_cast<float>(c.eye[1]),
                 static_cast<float>(c.eye[2]), static_cast<float>(c.target[0]),
                 static_cast<float>(c.target[1]), static_cast<float>(c.target[2]),
                 static_cast<float>(c.up[0]), static_cast<float>(c.up[1]),
                 static_cast<float>(c.up[2]));
    check_matrix(m, c.expected);
  }
}

TEST_CASE("mat4_multiply matches gl-matrix multiply (projection * view)") {
  const Mat4 a = from_doubles(parity::kMultiplyA);
  const Mat4 b = from_doubles(parity::kMultiplyB);
  Mat4 out;
  mat4_multiply(&out, &a, &b);
  check_matrix(out, parity::kMultiplyExpected);
}

TEST_CASE("mat4_multiply tolerates out aliasing an input") {
  Mat4 a = from_doubles(parity::kMultiplyA);
  const Mat4 b = from_doubles(parity::kMultiplyB);
  mat4_multiply(&a, &a, &b);
  check_matrix(a, parity::kMultiplyExpected);
}

TEST_CASE("mat4_multiply by identity is a no-op") {
  const Mat4 a = from_doubles(parity::kMultiplyB);
  Mat4 id;
  mat4_identity(&id);
  Mat4 out;
  mat4_multiply(&out, &a, &id);
  for (int i = 0; i < 16; ++i) CHECK(out.m[i] == doctest::Approx(a.m[i]));
}

TEST_CASE("mat4_look_at survives a degenerate eye == target") {
  Mat4 m;
  mat4_look_at(&m, 1.0f, 2.0f, 3.0f, 1.0f, 2.0f, 3.0f, 0.0f, 1.0f, 0.0f);
  for (float v : m.m) CHECK(std::isfinite(v));
}
