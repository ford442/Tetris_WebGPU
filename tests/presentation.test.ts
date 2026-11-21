import { describe, expect, it, vi } from 'vitest';
import {
  CANVAS_USAGE_COPY_SRC,
  CANVAS_USAGE_RENDER_ATTACHMENT,
  buildCanvasConfiguration,
  configurePresentation,
  describeHdrStatus,
  detectHdrDisplay,
  getLastPresentation,
  resolveCaptureIntent,
  resolveHdrIntent,
} from '../src/webgpu/presentation.js';

const device = { label: 'test' } as GPUDevice;

type Ctx = Parameters<typeof configurePresentation>[0];

/** A canvas context that "accepts" whatever it was last configured with, as a conforming browser would. */
function acceptingContext(): { ctx: Ctx; configure: ReturnType<typeof vi.fn> } {
  let applied: GPUCanvasConfiguration | null = null;
  const configure = vi.fn((c: GPUCanvasConfiguration): undefined => { applied = c; return undefined; });
  const ctx: Ctx = {
    configure,
    getConfiguration: () => applied as unknown as GPUCanvasConfigurationOut,
  };
  return { ctx, configure };
}

describe('resolveHdrIntent', () => {
  it('is off by default (HDR is opt-in)', () => {
    expect(resolveHdrIntent('', undefined)).toEqual({ requested: false, forced: false, source: 'default' });
    expect(resolveHdrIntent('', null).requested).toBe(false);
  });

  it('follows the persisted setting without forcing', () => {
    expect(resolveHdrIntent('', true)).toEqual({ requested: true, forced: false, source: 'settings' });
    expect(resolveHdrIntent('', false)).toEqual({ requested: false, forced: false, source: 'settings' });
  });

  it('?hdr=1 forces, ?hdr=0 disables, and the URL beats the setting', () => {
    expect(resolveHdrIntent('?hdr=1', false)).toEqual({ requested: true, forced: true, source: 'url' });
    expect(resolveHdrIntent('?hdr=true', false).requested).toBe(true);
    expect(resolveHdrIntent('?hdr=0', true)).toEqual({ requested: false, forced: false, source: 'url' });
    expect(resolveHdrIntent('?hdr=off', true).requested).toBe(false);
  });

  it('ignores junk values and falls back to the setting', () => {
    expect(resolveHdrIntent('?hdr=banana', true)).toEqual({ requested: true, forced: false, source: 'settings' });
  });
});

describe('resolveCaptureIntent', () => {
  it('is opt-in via ?capture', () => {
    expect(resolveCaptureIntent('')).toBe(false);
    expect(resolveCaptureIntent('?capture')).toBe(true);
    expect(resolveCaptureIntent('?capture=1')).toBe(true);
    expect(resolveCaptureIntent('?capture=0')).toBe(false);
  });
});

describe('detectHdrDisplay', () => {
  it('reads (dynamic-range: high)', () => {
    const mm = vi.fn((q: string) => ({ matches: q === '(dynamic-range: high)' }));
    expect(detectHdrDisplay(mm)).toBe(true);
    expect(mm).toHaveBeenCalledWith('(dynamic-range: high)');
    expect(detectHdrDisplay(() => ({ matches: false }))).toBe(false);
  });

  it('is false without matchMedia or when it throws', () => {
    expect(detectHdrDisplay(undefined)).toBe(false);
    expect(detectHdrDisplay(() => { throw new Error('nope'); })).toBe(false);
  });
});

describe('buildCanvasConfiguration', () => {
  it('SDR default has exactly the pre-HDR shape', () => {
    expect(buildCanvasConfiguration(device, 'bgra8unorm')).toEqual({
      device,
      format: 'bgra8unorm',
      alphaMode: 'premultiplied',
      viewFormats: [],
    });
  });

  it('adds only the extras it is given', () => {
    const config = buildCanvasConfiguration(device, 'rgba16float', {
      usage: CANVAS_USAGE_RENDER_ATTACHMENT | CANVAS_USAGE_COPY_SRC,
      colorSpace: 'display-p3',
      toneMapping: { mode: 'extended' },
    });
    expect(config.usage).toBe(0x11);
    expect(config.colorSpace).toBe('display-p3');
    expect(config.toneMapping).toEqual({ mode: 'extended' });
    expect(config.alphaMode).toBe('premultiplied');
  });
});

describe('configurePresentation — SDR (default)', () => {
  it('configures exactly the SDR config once and reports it', () => {
    const { ctx, configure } = acceptingContext();
    const state = configurePresentation(ctx, device, { sdrFormat: 'bgra8unorm', search: '', hdrSetting: null, displayHdr: true });
    expect(configure).toHaveBeenCalledTimes(1);
    expect(configure).toHaveBeenCalledWith({ device, format: 'bgra8unorm', alphaMode: 'premultiplied', viewFormats: [] });
    expect(state.info).toMatchObject({
      format: 'bgra8unorm',
      colorSpace: 'srgb',
      toneMapping: 'standard',
      hdr: false,
      hdrRequested: false,
      hdrStatus: 'off',
      capture: false,
      usage: ['RENDER_ATTACHMENT'],
    });
    expect(getLastPresentation()).toBe(state.info);
  });
});

describe('configurePresentation — HDR', () => {
  it('activates rgba16float / display-p3 / extended when the browser reads it back', () => {
    const { ctx, configure } = acceptingContext();
    const state = configurePresentation(ctx, device, { sdrFormat: 'bgra8unorm', search: '', hdrSetting: true, displayHdr: true });
    expect(configure).toHaveBeenCalledTimes(1);
    expect(state.configuration).toMatchObject({
      format: 'rgba16float',
      colorSpace: 'display-p3',
      toneMapping: { mode: 'extended' },
      alphaMode: 'premultiplied',
    });
    expect(state.info).toMatchObject({
      hdr: true,
      hdrStatus: 'active',
      hdrSource: 'settings',
      format: 'rgba16float',
      colorSpace: 'display-p3',
      toneMapping: 'extended',
    });
  });

  it('stays SDR, without touching the context, when the display is not HDR', () => {
    const { ctx, configure } = acceptingContext();
    const state = configurePresentation(ctx, device, { sdrFormat: 'bgra8unorm', search: '', hdrSetting: true, displayHdr: false });
    expect(state.info.hdr).toBe(false);
    expect(state.info.hdrStatus).toBe('no-hdr-display');
    expect(configure).toHaveBeenCalledTimes(1);
    expect(configure.mock.calls[0]?.[0]).toMatchObject({ format: 'bgra8unorm' });
  });

  it('?hdr=1 tries anyway on an SDR display', () => {
    const { ctx } = acceptingContext();
    const state = configurePresentation(ctx, device, { sdrFormat: 'bgra8unorm', search: '?hdr=1', hdrSetting: false, displayHdr: false });
    expect(state.info.hdr).toBe(true);
    expect(state.info.hdrSource).toBe('url');
  });

  it('?hdr=0 beats an enabled setting', () => {
    const { ctx } = acceptingContext();
    const state = configurePresentation(ctx, device, { sdrFormat: 'bgra8unorm', search: '?hdr=0', hdrSetting: true, displayHdr: true });
    expect(state.info.hdr).toBe(false);
    expect(state.info.hdrStatus).toBe('off');
  });

  it('falls back to SDR when the browser ignores toneMapping (no readback proof)', () => {
    // A browser that doesn't know `toneMapping` drops the member: readback has no tone mapping.
    const configure = vi.fn();
    const ctx: Ctx = {
      configure,
      getConfiguration: () => ({ format: 'rgba16float' }) as unknown as GPUCanvasConfigurationOut,
    };
    const state = configurePresentation(ctx, device, { sdrFormat: 'bgra8unorm', search: '', hdrSetting: true, displayHdr: true });
    expect(state.info.hdr).toBe(false);
    expect(state.info.hdrStatus).toBe('tone-mapping-unsupported');
    expect(configure).toHaveBeenCalledTimes(2); // the HDR attempt, then SDR
    expect(configure.mock.calls[1]?.[0]).toMatchObject({ format: 'bgra8unorm' });
    expect(state.configuration.format).toBe('bgra8unorm');
  });

  it('falls back to SDR when getConfiguration does not exist', () => {
    const configure = vi.fn();
    const state = configurePresentation({ configure }, device, { sdrFormat: 'rgba8unorm', search: '', hdrSetting: true, displayHdr: true });
    expect(state.info.hdrStatus).toBe('tone-mapping-unsupported');
    expect(state.info.format).toBe('rgba8unorm');
  });

  it('falls back to SDR when configure throws on the HDR config', () => {
    const configure = vi.fn((c: GPUCanvasConfiguration): undefined => {
      if (c.format === 'rgba16float') throw new TypeError('bad format');
      return undefined;
    });
    const state = configurePresentation({ configure }, device, { sdrFormat: 'bgra8unorm', search: '', hdrSetting: true, displayHdr: true });
    expect(state.info.hdr).toBe(false);
    expect(state.info.hdrStatus).toBe('configure-rejected');
    expect(state.info.format).toBe('bgra8unorm');
  });
});

describe('configurePresentation — capture', () => {
  it('adds COPY_SRC only behind ?capture', () => {
    const plain = configurePresentation(acceptingContext().ctx, device, { sdrFormat: 'bgra8unorm', search: '' });
    expect(plain.configuration.usage).toBeUndefined();

    const { ctx, configure } = acceptingContext();
    const cap = configurePresentation(ctx, device, { sdrFormat: 'bgra8unorm', search: '?capture' });
    expect(cap.configuration.usage).toBe(CANVAS_USAGE_RENDER_ATTACHMENT | CANVAS_USAGE_COPY_SRC);
    expect(cap.info.usage).toEqual(['RENDER_ATTACHMENT', 'COPY_SRC']);
    expect(cap.info.capture).toBe(true);
    expect(configure.mock.calls[0]?.[0]).toMatchObject({ usage: 0x11 });
  });

  it('keeps COPY_SRC on the HDR configuration too', () => {
    const state = configurePresentation(acceptingContext().ctx, device, {
      sdrFormat: 'bgra8unorm', search: '?capture&hdr=1', displayHdr: true,
    });
    expect(state.info.hdr).toBe(true);
    expect(state.configuration.usage).toBe(0x11);
  });
});

describe('describeHdrStatus', () => {
  it('explains each outcome', () => {
    expect(describeHdrStatus(null)).toBe('');
    const base = configurePresentation(acceptingContext().ctx, device, { sdrFormat: 'bgra8unorm', search: '' }).info;
    expect(describeHdrStatus(base)).toBe('Off');
    expect(describeHdrStatus({ ...base, hdrRequested: true, hdrStatus: 'no-hdr-display' })).toContain('display');
    expect(describeHdrStatus({ ...base, hdr: true, hdrRequested: true, hdrStatus: 'active' })).toContain('Active');
  });
});
