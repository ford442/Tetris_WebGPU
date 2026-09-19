import { describe, expect, it } from 'vitest';
import {
  EMPTY_LUMA_STATS,
  LUMA_HISTOGRAM_BINS,
  binLuma,
  bloomParamsFromStats,
  cpuLumaHistogram,
  flashHeadroom,
  histogramToStats,
  lumaBin,
  smoothBloomThreshold,
} from '../src/webgpu/gpuChores/lumaStats.js';
import { AutoBloomController, baselineBloomThreshold } from '../src/webgpu/gpuChores/autoBloom.js';

function histogramFrom(samples: number[]): Uint32Array {
  const bins = new Uint32Array(LUMA_HISTOGRAM_BINS);
  for (const luma of samples) bins[lumaBin(luma)] += 1;
  return bins;
}

describe('histogramToStats', () => {
  it('reports nothing for an empty histogram', () => {
    expect(histogramToStats(new Uint32Array(LUMA_HISTOGRAM_BINS))).toEqual(EMPTY_LUMA_STATS);
  });

  it('averages within one bin width of the true mean', () => {
    const samples = Array.from({ length: 400 }, (_, i) => (i / 400) * 1.2);
    const stats = histogramToStats(histogramFrom(samples));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(stats.sampleCount).toBe(400);
    expect(Math.abs(stats.averageLuma - mean)).toBeLessThan(binLuma(1) - binLuma(0));
  });

  it('places the percentile so only the target share is above it', () => {
    // 95% dim, 5% blazing.
    const samples = [...Array(950).fill(0.1), ...Array(50).fill(1.4)];
    const stats = histogramToStats(histogramFrom(samples), { brightFraction: 0.06 });
    expect(stats.percentileLuma).toBeGreaterThan(1.0);
    expect(stats.brightFraction).toBeLessThan(0.1);
    expect(stats.peakLuma).toBeGreaterThan(1.3);
  });

  it('tolerates a short readback instead of throwing', () => {
    expect(() => histogramToStats(new Uint32Array(8))).not.toThrow();
  });
});

describe('bloomParamsFromStats', () => {
  const baseline = { baselineThreshold: 0.72, baselineKnee: 0.1 };

  it('returns the static tuning when no scan has landed', () => {
    const params = bloomParamsFromStats(EMPTY_LUMA_STATS, baseline);
    expect(params.threshold).toBe(0.72);
    expect(params.knee).toBe(0.1);
    expect(params.intensityScale).toBe(1);
  });

  it('never lowers the threshold below the hand-tuned baseline (#265 guard)', () => {
    // A frame that is almost entirely black: the measured percentile is near
    // zero, and honoring it would bloom the whole picture.
    const stats = histogramToStats(histogramFrom(Array(1000).fill(0.02)));
    expect(stats.percentileLuma).toBeLessThan(0.2);
    expect(bloomParamsFromStats(stats, baseline).threshold).toBe(0.72);
  });

  it('raises the threshold on a bright frame instead of blooming everything', () => {
    const stats = histogramToStats(histogramFrom([
      ...Array(600).fill(0.85),
      ...Array(400).fill(1.3),
    ]));
    const params = bloomParamsFromStats(stats, baseline);
    expect(params.threshold).toBeGreaterThan(0.72);
    expect(params.threshold).toBeLessThanOrEqual(0.72 + 0.6);
  });

  it('honors the HDR baseline as its own floor', () => {
    const stats = histogramToStats(histogramFrom(Array(500).fill(0.5)));
    expect(bloomParamsFromStats(stats, { baselineThreshold: 1.05 }).threshold).toBe(1.05);
  });
});

describe('flashHeadroom', () => {
  it('is full with no measurement', () => {
    expect(flashHeadroom(EMPTY_LUMA_STATS)).toBe(1);
  });

  it('pulls the additive flash back on an already blown-out frame', () => {
    const dim = histogramToStats(histogramFrom(Array(500).fill(0.15)));
    const blown = histogramToStats(histogramFrom(Array(500).fill(1.5)));
    expect(flashHeadroom(dim)).toBe(1);
    expect(flashHeadroom(blown)).toBeLessThan(1);
    expect(flashHeadroom(blown)).toBeGreaterThanOrEqual(0.55);
  });
});

describe('smoothBloomThreshold', () => {
  it('adopts the first value outright, then eases', () => {
    expect(smoothBloomThreshold(Number.NaN, 0.9)).toBe(0.9);
    const eased = smoothBloomThreshold(0.7, 1.2, 0.5);
    expect(eased).toBeCloseTo(0.95, 6);
  });
});

describe('cpuLumaHistogram', () => {
  it('bins mid grey where the weights say it should', () => {
    const rgba = new Uint8Array([128, 128, 128, 255]);
    const bins = cpuLumaHistogram(rgba);
    expect(bins[lumaBin(128 / 255)]).toBe(1);
  });

  it('honors the sampling stride', () => {
    const rgba = new Uint8Array(4 * 100).fill(255);
    expect(cpuLumaHistogram(rgba, { stride: 4 }).reduce((a, b) => a + b, 0)).toBe(25);
  });
});

describe('AutoBloomController', () => {
  it('passes the static tuning through untouched without stats', () => {
    const controller = new AutoBloomController();
    const out = controller.update(null, { baselineThreshold: 0.72 }, 0.4, 1.6);
    expect(out.threshold).toBe(0.72);
    // Flash is added unscaled — identical to the pre-chore behavior.
    expect(out.intensity).toBeCloseTo(2.0, 6);
    expect(out.flashScale).toBe(1);
  });

  it('eases toward a measured threshold without ever dipping under the floor', () => {
    const controller = new AutoBloomController(0.5);
    const stats = histogramToStats(histogramFrom([
      ...Array(900).fill(0.8),
      ...Array(100).fill(1.6),
    ]));
    const baseline = { baselineThreshold: 0.72 };
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const out = controller.update(stats, baseline, 0.4, 0);
      expect(out.threshold).toBeGreaterThanOrEqual(0.72);
      last = out.threshold;
    }
    expect(last).toBeGreaterThan(0.72);
  });

  it('snaps rather than eases when the baseline itself changes', () => {
    const controller = new AutoBloomController(0.05);
    controller.update(EMPTY_LUMA_STATS, { baselineThreshold: 0.72 }, 0.4);
    const out = controller.update(EMPTY_LUMA_STATS, { baselineThreshold: 1.05 }, 0.4);
    expect(out.threshold).toBe(1.05);
  });
});

describe('baselineBloomThreshold', () => {
  it('matches the renderer presets', () => {
    expect(baselineBloomThreshold(false)).toBe(0.72);
    expect(baselineBloomThreshold(true)).toBe(1.05);
  });
});
