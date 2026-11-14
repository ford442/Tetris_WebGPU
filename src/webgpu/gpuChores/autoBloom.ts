/**
 * Auto-bloom controller: measured luma stats -> BloomSystem parameters.
 *
 * Holds the one piece of state the pure math in `lumaStats.ts` cannot: the
 * smoothed threshold carried between frames. The scan lands every few frames
 * and the parameters are pushed every frame, so applying raw percentile values
 * would make the glow pump visibly on scene changes.
 *
 * Feeding it nothing (no stats yet, chore on the CPU rung, kill switch on)
 * yields the renderer's static baseline verbatim — that is what lets the
 * render loop call it unconditionally.
 */

import {
  bloomParamsFromStats,
  flashHeadroom,
  smoothBloomThreshold,
  EMPTY_LUMA_STATS,
  type BloomAutoOptions,
  type LumaStats,
} from './lumaStats.js';

/**
 * Hand-tuned static thresholds, kept in one place because they are also the
 * floor the auto path clamps to (`viewPipelines` seeds the BloomSystem with
 * them, `viewRenderLoop` passes them in as the baseline every frame).
 */
export const STATIC_BLOOM_THRESHOLD = { sdr: 0.72, hdr: 1.05 } as const;

/** Static bloom threshold for the active playfield color format. */
export function baselineBloomThreshold(hdrPlayfield?: boolean): number {
  return hdrPlayfield ? STATIC_BLOOM_THRESHOLD.hdr : STATIC_BLOOM_THRESHOLD.sdr;
}

export interface AutoBloomOutput {
  threshold: number;
  knee: number;
  /** Bloom intensity after the frame-brightness headroom scale. */
  intensity: number;
  /** Headroom applied to the additive line-clear flash, in [0.55, 1]. */
  flashScale: number;
}

export class AutoBloomController {
  private smoothedThreshold = Number.NaN;
  private lastBaseline = Number.NaN;

  constructor(private readonly smoothing = 0.12) {}

  /**
   * @param stats       latest measured stats (all-zero is fine)
   * @param baseline    the static tuning, which is also the threshold floor
   * @param intensity   configured bloom intensity before headroom scaling
   * @param flash       additive flash intensity (line-clear neon bloom)
   */
  update(
    stats: LumaStats | null | undefined,
    baseline: BloomAutoOptions,
    intensity: number,
    flash = 0,
  ): AutoBloomOutput {
    const measured = stats ?? EMPTY_LUMA_STATS;
    const target = bloomParamsFromStats(measured, baseline);

    // A baseline change (HDR playfield toggle, quality preset) must land
    // immediately rather than being eased into from the old preset's value.
    if (this.lastBaseline !== baseline.baselineThreshold) {
      this.lastBaseline = baseline.baselineThreshold;
      this.smoothedThreshold = target.threshold;
    } else {
      this.smoothedThreshold = smoothBloomThreshold(this.smoothedThreshold, target.threshold, this.smoothing);
    }

    const scale = flashHeadroom(measured);
    return {
      // Never dip below the hand-tuned floor, even mid-ease.
      threshold: Math.max(baseline.baselineThreshold, this.smoothedThreshold),
      knee: target.knee,
      intensity: intensity + flash * scale,
      flashScale: scale,
    };
  }

  /** Forget the smoothed state (device re-init, renderer swap). */
  reset(): void {
    this.smoothedThreshold = Number.NaN;
    this.lastBaseline = Number.NaN;
  }
}
