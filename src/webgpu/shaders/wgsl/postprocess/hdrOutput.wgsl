// HDR output helpers — binding-free, shared verbatim by the TS bloom composite
// (bloomShaders.ts) and the C++ post pass (cpp/src/shaders/postprocess). Never add
// a @binding here; scripts/generate-cpp-shaders.mjs refuses a shared file that has one.
//
// Context: with HDR output the canvas is rgba16float + colorSpace 'display-p3' +
// toneMapping 'extended'. The canvas takes *encoded* values (the sRGB transfer
// function, mirrored below 0 and continued above 1), where 1.0 is SDR white and
// anything larger is brighter than SDR white up to the display's headroom.

// sRGB transfer functions, extended: sign-mirrored and continued past [0, 1].
fn srgbEotfExtended(x: vec3<f32>) -> vec3<f32> {
  let m = abs(x);
  let lo = m / 12.92;
  let hi = pow((m + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4));
  return sign(x) * select(hi, lo, m <= vec3<f32>(0.04045));
}

fn srgbOetfExtended(x: vec3<f32>) -> vec3<f32> {
  let m = abs(x);
  let lo = m * 12.92;
  let hi = 1.055 * pow(m, vec3<f32>(1.0 / 2.4)) - 0.055;
  return sign(x) * select(hi, lo, m <= vec3<f32>(0.0031308));
}

// The scene is authored against sRGB primaries; the canvas is declared Display P3.
// Re-express sRGB-encoded colour in P3 primaries so SDR-range colour looks the same as
// the SDR path (encoded in, encoded out).
fn srgbToDisplayP3(encoded: vec3<f32>) -> vec3<f32> {
  // mat3x3 is column-major: these columns are the rows of the usual linear sRGB -> Display P3 matrix.
  let toP3 = mat3x3<f32>(
    vec3<f32>(0.8224621, 0.0331941, 0.0170827),
    vec3<f32>(0.1775380, 0.9668058, 0.0723974),
    vec3<f32>(0.0000000, 0.0000000, 0.9105199)
  );
  return srgbOetfExtended(toP3 * srgbEotfExtended(encoded));
}

// Soft shoulder for energy beyond SDR white. `over` is max(value - 1, 0). The result is 0 at
// over == 0 (so the SDR range is untouched and the curve is continuous at white) and
// approaches peak - 1 as over grows, so the output never exceeds `peak`.
fn hdrShoulder(over: vec3<f32>, peak: f32) -> vec3<f32> {
  return max(peak - 1.0, 0.0) * (vec3<f32>(1.0) - exp(-over));
}
