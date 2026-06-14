import { getBlockTextureConfig } from '../webgpu/blockTexture.js';

/** GLSL body for subregion UV transform matching textureSampling.ts */
export function getSubregionUVTransformGLSL(): string {
  const config = getBlockTextureConfig();
  const sx = config.subregionX ?? 0;
  const sy = config.subregionY ?? 0;
  const sw = config.subregionWidth ?? 1;
  const sh = config.subregionHeight ?? 1;
  const inset = config.subregionInset ?? 0;

  if (config.samplingMode === 'single') {
    return `
vec2 transformUVForSampling(vec2 uv) {
  return clamp(vec2(uv.x, 1.0 - uv.y), 0.0, 1.0);
}`;
  }

  if (config.samplingMode === 'atlas') {
    const cols = config.atlasColumns ?? 4;
    const rows = config.atlasRows ?? 3;
    const tileCol = config.atlasTileColumn ?? 1;
    const tileRow = config.atlasTileRow ?? 1;
    const atlasInset = config.atlasTileInset ?? 0.03;
    return `
vec2 transformUVForSampling(vec2 uv) {
  vec2 texUV = clamp(vec2(uv.x, 1.0 - uv.y), 0.0, 1.0);
  vec2 atlasTiles = vec2(${cols}.0, ${rows}.0);
  vec2 atlasTile = vec2(${tileCol}.0, ${tileRow}.0);
  vec2 atlasInset = vec2(${atlasInset}, ${atlasInset});
  return (texUV * (vec2(1.0) - atlasInset * 2.0) + atlasInset + atlasTile) / atlasTiles;
}`;
  }

  return `
vec2 transformUVForSampling(vec2 uv) {
  vec2 texUV = clamp(vec2(uv.x, 1.0 - uv.y), 0.0, 1.0);
  float inset = ${inset};
  vec2 innerUV = texUV * (1.0 - inset * 2.0) + inset;
  return vec2(${sx} + innerUV.x * ${sw}, ${sy} + innerUV.y * ${sh});
}`;
}
