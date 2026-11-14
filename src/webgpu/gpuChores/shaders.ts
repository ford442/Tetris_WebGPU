/**
 * WGSL for the GPU chores.
 *
 * Three small compute kernels, no render state and no board state:
 *   - `luma_histogram`  — Rec. 709 luma of the composited frame into 64 bins
 *   - `downsample_2d`   — box downsample, the bloom pyramid's reduction step
 *   - `compact_indices` — dense spawn-index list from a 0/1 flag buffer
 *
 * Workgroup sizes are fixed by the rollout's shared shape: (8,8) for the 2D
 * bloom jobs, (64) for the 1D compaction. `tests/gpu-chores-shaders.test.ts`
 * pins them, since the dispatch math in the runner assumes exactly these.
 */

/** Bins in the luma histogram — must match `LUMA_HISTOGRAM_BINS` in lumaStats.ts. */
export const LUMA_HISTOGRAM_BINS = 64;

/** 2D chores dispatch 8x8 tiles. */
export const CHORE_WORKGROUP_2D = 8;

/** 1D chores dispatch 64-wide. */
export const CHORE_WORKGROUP_1D = 64;

/**
 * Luminance histogram.
 *
 * One workgroup (8x8 = 64 threads, one per bin) builds a private histogram in
 * workgroup memory and merges it into the storage buffer with a single atomic
 * per bin, so global atomic traffic is bins-per-workgroup rather than
 * one-per-pixel. Out-of-range texels are skipped instead of clamped; clamping
 * would double-count the edge and bias the bright tail.
 */
export const LumaHistogramShader = /* wgsl */ `
struct LumaUniforms {
  srcSize : vec2<u32>,
  maxLuma : f32,
  _pad    : f32,
};

@group(0) @binding(0) var src : texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> histogram : array<atomic<u32>, ${LUMA_HISTOGRAM_BINS}>;
@group(0) @binding(2) var<uniform> u : LumaUniforms;

var<workgroup> localHistogram : array<atomic<u32>, ${LUMA_HISTOGRAM_BINS}>;

fn luma709(c : vec3<f32>) -> f32 {
  return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

@compute @workgroup_size(${CHORE_WORKGROUP_2D}, ${CHORE_WORKGROUP_2D})
fn luma_histogram(
  @builtin(global_invocation_id) gid : vec3<u32>,
  @builtin(local_invocation_index) lid : u32,
) {
  // One thread per bin zeroes workgroup memory (64 threads, 64 bins).
  if (lid < ${LUMA_HISTOGRAM_BINS}u) {
    atomicStore(&localHistogram[lid], 0u);
  }
  workgroupBarrier();

  if (gid.x < u.srcSize.x && gid.y < u.srcSize.y) {
    let texel = textureLoad(src, vec2<i32>(gid.xy), 0);
    let l = max(luma709(texel.rgb), 0.0);
    let scaled = l / max(u.maxLuma, 0.0001);
    let bin = min(u32(floor(scaled * f32(${LUMA_HISTOGRAM_BINS}u))), ${LUMA_HISTOGRAM_BINS}u - 1u);
    atomicAdd(&localHistogram[bin], 1u);
  }
  workgroupBarrier();

  if (lid < ${LUMA_HISTOGRAM_BINS}u) {
    let count = atomicLoad(&localHistogram[lid]);
    if (count > 0u) {
      atomicAdd(&histogram[lid], count);
    }
  }
}
`;

/**
 * Box downsample into a storage texture.
 *
 * The reduction step of the bloom pyramid, and the histogram's input stage:
 * scanning a quarter-res copy costs a quarter of the texel loads and does not
 * change the shape of the distribution the threshold is derived from.
 */
export const Downsample2dShader = /* wgsl */ `
struct DownsampleUniforms {
  srcSize : vec2<u32>,
  dstSize : vec2<u32>,
};

@group(0) @binding(0) var src : texture_2d<f32>;
@group(0) @binding(1) var dst : texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> u : DownsampleUniforms;

@compute @workgroup_size(${CHORE_WORKGROUP_2D}, ${CHORE_WORKGROUP_2D})
fn downsample_2d(@builtin(global_invocation_id) gid : vec3<u32>) {
  if (gid.x >= u.dstSize.x || gid.y >= u.dstSize.y) {
    return;
  }

  // Ratio-driven so the same kernel serves 2:1 mips and the odd-size tail.
  let ratio = vec2<f32>(u.srcSize) / vec2<f32>(max(u.dstSize, vec2<u32>(1u, 1u)));
  let base = vec2<f32>(gid.xy) * ratio;
  let maxCoord = vec2<i32>(u.srcSize) - vec2<i32>(1, 1);

  var acc = vec4<f32>(0.0);
  for (var dy = 0u; dy < 2u; dy = dy + 1u) {
    for (var dx = 0u; dx < 2u; dx = dx + 1u) {
      let offset = vec2<f32>(f32(dx), f32(dy)) * ratio * 0.5;
      let coord = clamp(vec2<i32>(base + offset), vec2<i32>(0, 0), maxCoord);
      acc = acc + textureLoad(src, coord, 0);
    }
  }

  textureStore(dst, vec2<i32>(gid.xy), acc * 0.25);
}
`;

/**
 * Stable stream compaction of a 0/1 flag buffer.
 *
 * Each surviving thread derives its output slot from the number of set flags
 * before it rather than from an `atomicAdd`, so the result is ascending and
 * bit-identical to `compactIndicesCpu` — an atomically-bumped slot would be
 * order-dependent and could not be parity-tested against the CPU rung. The
 * O(n) scan per thread is fine at board scale (200 flags) and this kernel is
 * not meant for larger inputs.
 */
export const CompactIndicesShader = /* wgsl */ `
struct CompactUniforms {
  count  : u32,
  maxOut : u32,
  _pad   : vec2<u32>,
};

@group(0) @binding(0) var<storage, read>       flags   : array<u32>;
@group(0) @binding(1) var<storage, read_write> indices : array<u32>;
@group(0) @binding(2) var<storage, read_write> total   : atomic<u32>;
@group(0) @binding(3) var<uniform> u : CompactUniforms;

@compute @workgroup_size(${CHORE_WORKGROUP_1D})
fn compact_indices(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= u.count) {
    return;
  }
  if (flags[i] == 0u) {
    return;
  }

  var slot = 0u;
  for (var j = 0u; j < i; j = j + 1u) {
    if (flags[j] != 0u) {
      slot = slot + 1u;
    }
  }

  atomicAdd(&total, 1u);
  if (slot < u.maxOut) {
    indices[slot] = i;
  }
}
`;
