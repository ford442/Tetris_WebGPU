struct Uniforms {
  viewProj: mat4x4<f32>,
  params0: vec4<f32>,
  params1: vec4<f32>,
  lightDir: vec4<f32>,
  eyePos: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var blockTex: texture_2d<f32>;
@group(0) @binding(2) var blockSamp: sampler;

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) color: vec4<f32>,
  @location(3) uv: vec2<f32>,
};

@vertex
fn vs_main(
  @location(0) localPos: vec3<f32>,
  @location(1) localNormal: vec3<f32>,
  @location(2) localUv: vec2<f32>,
  @location(3) instPos: vec3<f32>,
  @location(4) instColor: vec4<f32>,
) -> VSOut {
  var out: VSOut;
  let halfSize = u.params0.x;
  let world = localPos * halfSize * 2.0 + instPos;
  out.position = u.viewProj * vec4<f32>(world, 1.0);
  out.worldPos = world;
  out.normal = localNormal;
  out.color = instColor;
  out.uv = localUv;
  return out;
}

const ATLAS_COLUMNS: f32 = 4.0;
const ATLAS_ROWS: f32 = 3.0;
const ATLAS_TILE_COL: f32 = 1.0;
const ATLAS_TILE_ROW: f32 = 1.0;
const ATLAS_INSET: f32 = 0.03;

fn transformAtlasUV(uv: vec2<f32>) -> vec2<f32> {
  let texUV = clamp(vec2<f32>(uv.x, 1.0 - uv.y), vec2<f32>(0.0), vec2<f32>(1.0));
  let atlasTiles = vec2<f32>(ATLAS_COLUMNS, ATLAS_ROWS);
  let atlasTile = vec2<f32>(ATLAS_TILE_COL, ATLAS_TILE_ROW);
  let inset = vec2<f32>(ATLAS_INSET, ATLAS_INSET);
  return (texUV * (vec2<f32>(1.0) - inset * 2.0) + inset + atlasTile) / atlasTiles;
}

fn metalMask(texColor: vec3<f32>) -> f32 {
  let luma = dot(texColor, vec3<f32>(0.299, 0.587, 0.114));
  let warmth = texColor.r - texColor.b;
  let lumaBand = smoothstep(0.25, 0.55, luma) * (1.0 - smoothstep(0.82, 0.95, luma));
  return clamp(lumaBand * smoothstep(0.45, 0.55, warmth) * 3.0, 0.0, 1.0);
}

fn composeBase(texColor: vec3<f32>, pieceColor: vec3<f32>, metal: f32) -> vec3<f32> {
  let luma = dot(texColor, vec3<f32>(0.299, 0.587, 0.114));
  let crystalBrightness = smoothstep(0.15, 0.90, luma);
  let glassColor = pieceColor * (0.58 + crystalBrightness * 0.52);
  let metalColor = texColor * 1.12 + vec3<f32>(0.025, 0.010, 0.0);
  return mix(glassColor, metalColor, metal);
}

@fragment
fn fs_main(
  @location(0) worldPos: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) color: vec4<f32>,
  @location(3) uv: vec2<f32>,
) -> @location(0) vec4<f32> {
  let N = normalize(normal);
  let L = normalize(u.lightDir.xyz);
  let V = normalize(u.eyePos.xyz - worldPos);
  let H = normalize(L + V);
  let NdotL = max(dot(N, L), 0.0);
  let NdotH = max(dot(N, H), 0.0);

  var base = color.rgb;
  var alpha = color.a;

  if (u.params1.x > 0.5) {
    let texUV = transformAtlasUV(uv);
    let texColor = textureSampleLevel(blockTex, blockSamp, texUV, 0.0);
    let metal = metalMask(texColor.rgb);
    base = composeBase(texColor.rgb, color.rgb, metal);
    alpha = color.a * mix(0.92, 1.0, metal);
  }

  let lighting = u.params0.z + u.params0.w * NdotL;
  let lit = base * lighting;
  let spec = pow(NdotH, 32.0) * 0.12;
  let rgb = clamp(lit + vec3<f32>(spec), vec3<f32>(0.0), vec3<f32>(1.0));
  return vec4<f32>(rgb * alpha, alpha);
}
