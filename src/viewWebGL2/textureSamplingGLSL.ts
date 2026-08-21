/** GLSL body for single-tile UV transform matching textureSampling.ts */
export function getSubregionUVTransformGLSL(): string {
  return `
vec2 transformUVForSampling(vec2 uv) {
  return clamp(vec2(uv.x, 1.0 - uv.y), 0.0, 1.0);
}`;
}
