/**
 * Bloom System WGSL Shaders
 *
 * All shader code for the multi-pass bloom post-processing effect:
 * - Luminance threshold extraction
 * - Downsample with Karis averaging
 * - Separable Gaussian blur (horizontal + vertical)
 * - Upsample & combine with scatter
 * - Final composite blend
 */

// MODIFIED: Changed from 9-tap to 5-tap kernel for sharper block rendering
// Previous 9-tap kernel with sigma=2.0 spread blur over 8 texels, causing blurry blocks
// New 5-tap kernel with sigma=1.0 spreads over only 4 texels for 50% tighter blur
// Center weight increased from 8.7% to 40.3% for more defined bloom
export const GAUSSIAN_WEIGHTS_5 = [
  0.054489,
  0.244201,
  0.402620,
  0.244201,
  0.054489
];
// Weights sum to 1.000000 (properly normalized)

// Offsets for 5-tap kernel (in texel units, centered around 0)
export const GAUSSIAN_OFFSETS_5 = [-2, -1, 0, 1, 2];

// DEPRECATED: Old 9-tap weights kept for reference (not used)
// export const GAUSSIAN_WEIGHTS_9 = [0.051505, 0.093853, 0.139965, 0.171355, 0.086644, 0.171355, 0.139965, 0.093853, 0.051505];
// export const GAUSSIAN_OFFSETS_9 = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

/**
 * Luminance Threshold Shader
 * Extracts pixels above luminance threshold with smooth knee
 */
export const ThresholdShader = `
struct Params {
  threshold: f32,
  knee: f32,
  intensity: f32,
  scatter: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var srcTexture: texture_2d<f32>;
@group(0) @binding(2) var srcSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
  );
  var uv = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(1.0, 0.0)
  );

  var output: VertexOutput;
  output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
  output.uv = uv[vertexIndex];
  return output;
}

@fragment
fn fsMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let color = textureSample(srcTexture, srcSampler, input.uv).rgb;

  // Calculate luminance using standard weights
  let luminance = dot(color, vec3<f32>(0.299, 0.587, 0.114));

  // Apply threshold with smooth knee for gradual falloff
  // This prevents harsh cutoff artifacts
  let threshold = params.threshold;
  let knee = params.knee;

  // Quadratic curve for smooth transition
  let curve = vec3<f32>(
    smoothstep(threshold - knee, threshold + knee, color.r),
    smoothstep(threshold - knee, threshold + knee, color.g),
    smoothstep(threshold - knee, threshold + knee, color.b)
  );

  // Apply threshold to each channel individually for better color preservation
  var result = color * curve;

  // Apply intensity
  result *= params.intensity;

  return vec4<f32>(result, 1.0);
}
`;

/**
 * Downsample Shader with 4-tap bilinear filtering
 * Uses Karis average for better energy conservation
 */
export const DownsampleShader = `
@group(0) @binding(0) var srcTexture: texture_2d<f32>;
@group(0) @binding(1) var srcSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) texelSize: vec2<f32>,
};

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
  );
  var uv = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(1.0, 0.0)
  );

  var output: VertexOutput;
  output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
  output.uv = uv[vertexIndex];

  // Calculate texel size for this mip level
  let srcSize = vec2<f32>(textureDimensions(srcTexture, 0));
  output.texelSize = 1.0 / srcSize;

  return output;
}

// Karis average: reduces fireflies and preserves energy during downsampling
fn karisAverage(color: vec4<f32>) -> vec4<f32> {
  let luminance = dot(color.rgb, vec3<f32>(0.299, 0.587, 0.114));
  // Weight by luminance to prevent bright pixels from dominating
  let weight = 1.0 / (1.0 + luminance);
  return color * weight;
}

@fragment
fn fsMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let texelSize = input.texelSize;
  let uv = input.uv;

  // Sample 4 corners with bilinear filtering
  // Offset by 0.5 texels to sample between pixels
  let offset = texelSize * 0.5;

  var sum = vec4<f32>(0.0);
  var totalWeight = 0.0;

  // Top-left quadrant
  var sample = textureSample(srcTexture, srcSampler, uv + vec2<f32>(-offset.x, -offset.y));
  sum += karisAverage(sample);

  // Top-right quadrant
  sample = textureSample(srcTexture, srcSampler, uv + vec2<f32>(offset.x, -offset.y));
  sum += karisAverage(sample);

  // Bottom-left quadrant
  sample = textureSample(srcTexture, srcSampler, uv + vec2<f32>(-offset.x, offset.y));
  sum += karisAverage(sample);

  // Bottom-right quadrant
  sample = textureSample(srcTexture, srcSampler, uv + vec2<f32>(offset.x, offset.y));
  sum += karisAverage(sample);

  // Normalize by the weights
  let avgLuminance = dot(sum.rgb / 4.0, vec3<f32>(0.299, 0.587, 0.114));
  let normalizeFactor = 4.0 / (1.0 + avgLuminance);

  return sum / 4.0 * normalizeFactor;
}
`;

/**
 * Gaussian Blur - Horizontal Pass
 * 9-tap separable Gaussian blur
 */
export const BlurHorizontalShader = `
struct Params {
  texelSize: vec2<f32>,
  mipLevel: f32,
  padding: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var srcTexture: texture_2d<f32>;
@group(0) @binding(2) var srcSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
  );
  var uv = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(1.0, 0.0)
  );

  var output: VertexOutput;
  output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
  output.uv = uv[vertexIndex];
  return output;
}

@fragment
fn fsMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let uv = input.uv;
  let texelSizeX = params.texelSize.x;

  // MODIFIED: 5-tap Gaussian blur with sigma=1.0 for sharper results
  // Reduced from 9-tap to minimize blur spread (4 texels vs 8 texels)
  // This fixes the blurry block rendering issue while maintaining pleasant bloom
  let weights = array<f32, 5>(
    0.054489, 0.244201, 0.402620, 0.244201, 0.054489
  );

  let offsets = array<i32, 5>(-2, -1, 0, 1, 2);

  var result = vec3<f32>(0.0);

  for (var i = 0; i < 5; i = i + 1) {
    let offsetUV = uv + vec2<f32>(f32(offsets[i]) * texelSizeX, 0.0);
    result += textureSample(srcTexture, srcSampler, offsetUV).rgb * weights[i];
  }

  return vec4<f32>(result, 1.0);
}
`;

/**
 * Gaussian Blur - Vertical Pass
 * 9-tap separable Gaussian blur
 */
export const BlurVerticalShader = `
struct Params {
  texelSize: vec2<f32>,
  mipLevel: f32,
  padding: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var srcTexture: texture_2d<f32>;
@group(0) @binding(2) var srcSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
  );
  var uv = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(1.0, 0.0)
  );

  var output: VertexOutput;
  output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
  output.uv = uv[vertexIndex];
  return output;
}

@fragment
fn fsMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let uv = input.uv;
  let texelSizeY = params.texelSize.y;

  // MODIFIED: 5-tap Gaussian blur with sigma=1.0 for sharper results
  // Reduced from 9-tap to minimize blur spread (4 texels vs 8 texels)
  // This fixes the blurry block rendering issue while maintaining pleasant bloom
  let weights = array<f32, 5>(
    0.054489, 0.244201, 0.402620, 0.244201, 0.054489
  );

  let offsets = array<i32, 5>(-2, -1, 0, 1, 2);

  var result = vec3<f32>(0.0);

  for (var i = 0; i < 5; i = i + 1) {
    let offsetUV = uv + vec2<f32>(0.0, f32(offsets[i]) * texelSizeY);
    result += textureSample(srcTexture, srcSampler, offsetUV).rgb * weights[i];
  }

  return vec4<f32>(result, 1.0);
}
`;

/**
 * Upsample & Combine Shader
 * Bilinear upsample with additive blend and scatter
 */
export const UpsampleCombineShader = `
struct Params {
  scatter: f32,
  intensity: f32,
  clamp: f32,
  mipLevel: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var lowResTexture: texture_2d<f32>;
@group(0) @binding(2) var lowResSampler: sampler;
@group(0) @binding(3) var highResTexture: texture_2d<f32>;
@group(0) @binding(4) var highResSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
  );
  var uv = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(1.0, 0.0)
  );

  var output: VertexOutput;
  output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
  output.uv = uv[vertexIndex];
  return output;
}

@fragment
fn fsMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let uv = input.uv;

  // Sample from lower resolution (upsampled)
  let lowRes = textureSample(lowResTexture, lowResSampler, uv).rgb;

  // Sample from higher resolution
  let highRes = textureSample(highResTexture, highResSampler, uv).rgb;

  // Blend with scatter for nicer glow effect
  // Formula: 0.5 * a + 0.5 * b + scatter * a * b
  // This provides both additive and lerp blending
  var result = 0.5 * highRes + 0.5 * lowRes + params.scatter * highRes * lowRes;

  // Apply intensity
  result *= params.intensity;

  // Clamp to prevent overflow
  result = min(result, vec3<f32>(params.clamp));

  return vec4<f32>(result, 1.0);
}
`;

/**
 * Composite Shader
 * Final blend of bloom with original image
 */
export const CompositeShader = `
struct Params {
  intensity: f32,
  clamp: f32,
  padding1: f32,
  padding2: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var originalTexture: texture_2d<f32>;
@group(0) @binding(2) var originalSampler: sampler;
@group(0) @binding(3) var bloomTexture: texture_2d<f32>;
@group(0) @binding(4) var bloomSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
  );
  var uv = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(1.0, 0.0)
  );

  var output: VertexOutput;
  output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
  output.uv = uv[vertexIndex];
  return output;
}

@fragment
fn fsMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let uv = input.uv;

  // Sample original color
  let original = textureSample(originalTexture, originalSampler, uv).rgb;

  // Sample bloom (already upsampled to full res)
  let bloom = textureSample(bloomTexture, bloomSampler, uv).rgb;

  // Additive blend: original + bloom * intensity
  var result = original + bloom * params.intensity;

  // Clamp to prevent overflow
  result = min(result, vec3<f32>(params.clamp));

  return vec4<f32>(result, 1.0);
}
`;
