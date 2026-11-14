/**
 * Luminance histogram → bloom threshold math (pure, unit-testable).
 *
 * The bloom threshold used to be a constant (0.72, or 1.05 on the HDR
 * playfield). A constant is wrong in both directions: on a dark board almost
 * nothing crosses it and the glow disappears, and on a bright level-up frame
 * *most of the frame* crosses it and the whole picture blooms into mush — the
 * washed-out class of bug from #265.
 *
 * The `luma_histogram` chore measures the frame instead of guessing at it, and
 * this module turns those bins into a threshold that keeps a roughly constant
 * *fraction* of the frame blooming. One invariant makes the fix safe:
 *
 *   the derived threshold is never lower than the static baseline
 *
 * so the auto path can only ever bloom *less* than today's tuning, never more.
 * The baseline stays the floor, the measurement supplies the headroom.
 */

/** Histogram bin count — matches `LUMA_HISTOGRAM_BINS` in the WGSL chore. */
export const LUMA_HISTOGRAM_BINS = 64;

/**
 * Luminance range the bins cover. Values above `LUMA_HISTOGRAM_MAX` land in the
 * top bin, which is what we want: everything that bright is "bloom" regardless.
 */
export const LUMA_HISTOGRAM_MAX = 2.0;

/** Rec. 709 luma weights — same coefficients the bloom threshold shader uses. */
export const LUMA_WEIGHTS: readonly [number, number, number] = [0.2126, 0.7152, 0.0722];

export interface LumaStats {
  /** Pixels accumulated into the histogram (0 when the scan has not landed). */
  sampleCount: number;
  /** Mean luminance of the scanned frame. */
  averageLuma: number;
  /** Brightest bin's luminance (bin centre, so quantized to the bin width). */
  peakLuma: number;
  /** Luminance at the configured bright percentile — the raw threshold candidate. */
  percentileLuma: number;
  /** Fraction of the frame at or above `percentileLuma`. */
  brightFraction: number;
}

export const EMPTY_LUMA_STATS: LumaStats = {
  sampleCount: 0,
  averageLuma: 0,
  peakLuma: 0,
  percentileLuma: 0,
  brightFraction: 0,
};

/** Luminance at the centre of bin `i`. */
export function binLuma(bin: number, bins = LUMA_HISTOGRAM_BINS, max = LUMA_HISTOGRAM_MAX): number {
  return ((bin + 0.5) / bins) * max;
}

/** Bin index a luminance falls into (clamped into range, matching the WGSL). */
export function lumaBin(luma: number, bins = LUMA_HISTOGRAM_BINS, max = LUMA_HISTOGRAM_MAX): number {
  if (!(luma > 0)) return 0;
  const idx = Math.floor((luma / max) * bins);
  return Math.min(bins - 1, Math.max(0, idx));
}

export interface HistogramStatsOptions {
  /**
   * Target share of the frame allowed to bloom (default 6%). The threshold is
   * placed so roughly this much of the frame sits above it.
   */
  brightFraction?: number;
  max?: number;
}

/**
 * Reduce raw bins to the handful of floats the renderer actually consumes.
 * Tolerates a short or over-long array so a partial readback can't throw.
 */
export function histogramToStats(
  histogram: ArrayLike<number>,
  options: HistogramStatsOptions = {},
): LumaStats {
  const bins = histogram.length || LUMA_HISTOGRAM_BINS;
  const max = options.max ?? LUMA_HISTOGRAM_MAX;
  const targetFraction = clamp(options.brightFraction ?? 0.06, 0.001, 0.5);

  let total = 0;
  let weighted = 0;
  let peakBin = 0;
  for (let i = 0; i < bins; i++) {
    const count = histogram[i] || 0;
    if (count <= 0) continue;
    total += count;
    weighted += count * binLuma(i, bins, max);
    peakBin = i;
  }
  if (total <= 0) return { ...EMPTY_LUMA_STATS };

  // Walk down from the brightest bin, taking whole bins while the running
  // share stays within budget. Stopping *before* the bin that would overshoot
  // is what keeps the threshold above the bulk of the frame: a frame with only
  // 5% highlights must not have its 90%-dim bin pulled in to reach a 6% target.
  // Empty bins are skipped so the result is always a bin that has pixels in it.
  const targetCount = total * targetFraction;
  let accumulated = 0;
  let percentileBin = peakBin;
  for (let i = bins - 1; i >= 0; i--) {
    const count = histogram[i] || 0;
    if (count <= 0) continue;
    if (accumulated > 0 && accumulated + count > targetCount) break;
    accumulated += count;
    percentileBin = i;
    if (accumulated >= targetCount) break;
  }

  return {
    sampleCount: total,
    averageLuma: weighted / total,
    peakLuma: binLuma(peakBin, bins, max),
    percentileLuma: binLuma(percentileBin, bins, max),
    brightFraction: accumulated / total,
  };
}

export interface BloomAutoOptions {
  /**
   * Static tuning the renderer would otherwise use. Doubles as the floor: the
   * derived threshold never drops below it, so auto-bloom cannot wash the
   * frame out relative to the hand-tuned look.
   */
  baselineThreshold: number;
  /** Hard ceiling, as a delta above the baseline (default +0.6). */
  maxThresholdRise?: number;
  /** Baseline knee; widened slightly on flat frames so the cut isn't harsh. */
  baselineKnee?: number;
}

export interface BloomAutoParams {
  threshold: number;
  knee: number;
  /** Multiplier on the configured bloom intensity, in (0, 1]. Never boosts. */
  intensityScale: number;
}

/**
 * Derive bloom parameters from measured stats.
 *
 * With no samples (scan not landed, chore disabled, CPU rung idle) this returns
 * exactly the static baseline, which is what makes the chore optional: the
 * renderer calls it unconditionally and gets today's tuning until real numbers
 * arrive.
 */
export function bloomParamsFromStats(stats: LumaStats, options: BloomAutoOptions): BloomAutoParams {
  const baseline = options.baselineThreshold;
  const knee = options.baselineKnee ?? 0.1;
  if (stats.sampleCount <= 0) {
    return { threshold: baseline, knee, intensityScale: 1 };
  }

  const ceiling = baseline + (options.maxThresholdRise ?? 0.6);
  const threshold = clamp(stats.percentileLuma, baseline, ceiling);

  // A frame that is bright nearly everywhere has no "highlights" to speak of;
  // widening the knee there turns a hard, shimmering cut into a soft rolloff.
  const flatness = clamp((stats.averageLuma - 0.35) / 0.45, 0, 1);
  return {
    threshold,
    knee: knee + flatness * 0.12,
    intensityScale: flashHeadroom(stats),
  };
}

/**
 * How much of an additive flash (line-clear neon bloom) the frame can still
 * take, in [0.55, 1]. This is the "few floats read back for HUD flash" use:
 * on an already-blown-out frame the flash is scaled down instead of stacking
 * on top of a frame that is nothing but highlights.
 */
export function flashHeadroom(stats: LumaStats): number {
  if (stats.sampleCount <= 0) return 1;
  const brightness = clamp((stats.averageLuma - 0.4) / 0.5, 0, 1);
  return 1 - brightness * 0.45;
}

/**
 * Exponential smoothing between frames. The threshold is applied every frame
 * while the scan lands every few frames, so an unsmoothed value visibly pumps.
 */
export function smoothBloomThreshold(previous: number, next: number, alpha = 0.12): number {
  if (!Number.isFinite(previous)) return next;
  const a = clamp(alpha, 0, 1);
  return previous + (next - previous) * a;
}

/**
 * CPU rung of the `luma_histogram` chore: same bins, same weights, over an
 * RGBA8 buffer. Used when WebGPU compute is unavailable or killed, and as the
 * parity oracle for the WGSL version in tests.
 *
 * `stride` samples every Nth pixel (a scan, not a survey) to keep the fallback
 * cheap enough for the overlay-FX path.
 */
export function cpuLumaHistogram(
  rgba: ArrayLike<number>,
  options: { bins?: number; max?: number; stride?: number } = {},
): Uint32Array {
  const bins = options.bins ?? LUMA_HISTOGRAM_BINS;
  const max = options.max ?? LUMA_HISTOGRAM_MAX;
  const stride = Math.max(1, Math.floor(options.stride ?? 1));
  const histogram = new Uint32Array(bins);
  const pixels = Math.floor(rgba.length / 4);
  for (let p = 0; p < pixels; p += stride) {
    const i = p * 4;
    const luma =
      (rgba[i] / 255) * LUMA_WEIGHTS[0] +
      (rgba[i + 1] / 255) * LUMA_WEIGHTS[1] +
      (rgba[i + 2] / 255) * LUMA_WEIGHTS[2];
    histogram[lumaBin(luma, bins, max)] += 1;
  }
  return histogram;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
