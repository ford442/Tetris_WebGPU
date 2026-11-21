/**
 * What the game asks the canvas context for: surface format, colour space, tone
 * mapping and texture usage. The single place `GPUCanvasContext.configure()` is
 * decided, used by initial acquisition and by resize.
 *
 * Two optional upgrades, both off by default so the default output is exactly what
 * it was before this module existed:
 *
 *  - **HDR output** (`?hdr=1`, or Settings → "HDR (if supported)"): `rgba16float` +
 *    `colorSpace: 'display-p3'` + `toneMapping: { mode: 'extended' }`, so highlights
 *    can exceed SDR white on an HDR display. Detected by capability, never by user
 *    agent: the display must report `(dynamic-range: high)` (skipped by `?hdr=1`,
 *    which means "try it anyway") **and** the browser must read the configuration
 *    back with `toneMapping.mode === 'extended'` — WebIDL silently ignores a
 *    dictionary member a browser doesn't know, so `getConfiguration()` is the only
 *    honest proof it was accepted. Anything else reconfigures SDR.
 *  - **Capture** (`?capture`): adds `COPY_SRC` so a frame can be read back (the
 *    screenshot action, and the E2E harness).
 *
 * Pure of the game: it needs a context, a device and a few strings, so it is
 * unit-tested with plain mocks.
 */

/**
 * Default HDR peak, in the canvas's *encoded* (sRGB-curve) units where 1.0 is SDR white: 1.4 is
 * ~2.2x SDR white in linear light, deliberately conservative so it suits laptop panels as well
 * as monitors. One value for both renderers (the C++ one receives it as a module option).
 */
export const DEFAULT_HDR_PEAK = 1.4;

/** Texture usage bits are fixed by the WebGPU spec; spelled out so this runs without the DOM globals. */
export const CANVAS_USAGE_COPY_SRC = 0x01;
export const CANVAS_USAGE_RENDER_ATTACHMENT = 0x10;

/** Why HDR output is (not) active — stable ids for bug reports. */
export type HdrStatus =
  | 'active'
  | 'off'
  | 'no-hdr-display'
  | 'configure-rejected'
  | 'tone-mapping-unsupported';

export type HdrSource = 'url' | 'settings' | 'default';

export interface HdrIntent {
  /** The player (or the URL) asked for HDR. */
  requested: boolean;
  /** `?hdr=1`: skip the display check and try anyway (for testing without an HDR monitor). */
  forced: boolean;
  source: HdrSource;
}

const TRUTHY = new Set(['1', 'true', 'on', 'yes']);
const FALSY = new Set(['0', 'false', 'off', 'no']);

function readParam(search: string | undefined, name: string): string | null {
  const source = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  try {
    return new URLSearchParams(source).get(name);
  } catch {
    return null;
  }
}

/** `?hdr=0|1` beats the persisted setting; with neither, HDR is off (opt-in). */
export function resolveHdrIntent(search?: string, settingValue?: boolean | null): HdrIntent {
  const raw = readParam(search, 'hdr')?.toLowerCase() ?? null;
  if (raw !== null && TRUTHY.has(raw)) return { requested: true, forced: true, source: 'url' };
  if (raw !== null && FALSY.has(raw)) return { requested: false, forced: false, source: 'url' };
  if (settingValue === true) return { requested: true, forced: false, source: 'settings' };
  return { requested: false, forced: false, source: settingValue === false ? 'settings' : 'default' };
}

/** `?capture` (or `?capture=1`) adds `COPY_SRC`; `?capture=0` is explicit off. */
export function resolveCaptureIntent(search?: string): boolean {
  const source = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(source);
  } catch {
    return false;
  }
  if (!params.has('capture')) return false;
  const raw = (params.get('capture') ?? '').toLowerCase();
  return !FALSY.has(raw);
}

/** True when the display reports high dynamic range. `matchMedia` is injectable for tests. */
export function detectHdrDisplay(
  matchMedia: ((query: string) => { matches: boolean }) | undefined =
    typeof window !== 'undefined' ? window.matchMedia?.bind(window) : undefined,
): boolean {
  if (typeof matchMedia !== 'function') return false;
  try {
    return matchMedia('(dynamic-range: high)').matches;
  } catch {
    return false;
  }
}

/** The shape recorded on `window.webgpuProbe.presentation` — JSON-serializable. */
export interface PresentationInfo {
  format: GPUTextureFormat;
  colorSpace: PredefinedColorSpace;
  toneMapping: 'standard' | 'extended';
  alphaMode: GPUCanvasAlphaMode;
  /** Human-readable usage flags of the canvas texture. */
  usage: string[];
  /** True only when the browser confirmed an extended-range configuration. */
  hdr: boolean;
  hdrRequested: boolean;
  hdrSource: HdrSource;
  hdrStatus: HdrStatus;
  /** `(dynamic-range: high)` at configure time. */
  displayHdr: boolean;
  /** `COPY_SRC` was added (`?capture`). */
  capture: boolean;
}

export interface PresentationState {
  info: PresentationInfo;
  /** The exact configuration applied — reuse it on resize so the two paths cannot drift. */
  configuration: GPUCanvasConfiguration;
}

export interface CanvasConfigurationExtras {
  usage?: number;
  colorSpace?: PredefinedColorSpace;
  toneMapping?: GPUCanvasToneMapping;
}

/**
 * The SDR configuration. `alphaMode: 'premultiplied'` is required for the video-portal
 * compositing (the DOM `<video>` shows through the transparent regions). With no
 * extras the result is exactly `{ device, format, alphaMode, viewFormats }`, as before.
 */
export function buildCanvasConfiguration(
  device: GPUDevice,
  format: GPUTextureFormat,
  extras: CanvasConfigurationExtras = {},
): GPUCanvasConfiguration {
  const config: GPUCanvasConfiguration = {
    device,
    format,
    alphaMode: 'premultiplied',
    viewFormats: [],
  };
  if (extras.usage !== undefined) config.usage = extras.usage;
  if (extras.colorSpace !== undefined) config.colorSpace = extras.colorSpace;
  if (extras.toneMapping !== undefined) config.toneMapping = extras.toneMapping;
  return config;
}

function usageNames(usage: number): string[] {
  const names: string[] = [];
  if (usage & CANVAS_USAGE_RENDER_ATTACHMENT) names.push('RENDER_ATTACHMENT');
  if (usage & CANVAS_USAGE_COPY_SRC) names.push('COPY_SRC');
  return names;
}

export interface PresentationOptions {
  /** `navigator.gpu.getPreferredCanvasFormat()` — the SDR format. */
  sdrFormat: GPUTextureFormat;
  /** Defaults to `window.location.search`. */
  search?: string;
  /** Persisted `GameSettings.hdrOutput`. */
  hdrSetting?: boolean | null;
  /** Override `?capture` (tests). */
  capture?: boolean;
  /** Override the `(dynamic-range: high)` query (tests). */
  displayHdr?: boolean;
}

type ReadableContext = Pick<GPUCanvasContext, 'configure'> & {
  getConfiguration?: () => GPUCanvasConfigurationOut | null;
};

/**
 * The C++ renderer configures its own surface, so its presentation is *reported*, not applied:
 * TS decides whether to ask (`?hdr` / Settings / display capability — {@link shouldRequestHdr}),
 * C++ answers with its surface state (0 off, 1 active, 2 rejected), and this turns the pair into
 * the same record the TS renderer produces for `window.webgpuProbe.presentation`.
 */
export interface CppPresentationInput {
  intent: HdrIntent;
  displayHdr: boolean;
  /** `get_surface_hdr_state()`: 0 off, 1 active, 2 requested but rejected. */
  surfaceState: number;
  sdrFormat: GPUTextureFormat;
}

/** True when HDR should be attempted: asked for, and (forced or the display reports HDR). */
export function shouldRequestHdr(intent: HdrIntent, displayHdr: boolean): boolean {
  return intent.requested && (intent.forced || displayHdr);
}

export function presentationFromCppState(input: CppPresentationInput): PresentationInfo {
  const { intent, displayHdr, surfaceState, sdrFormat } = input;
  const attempted = shouldRequestHdr(intent, displayHdr);
  const hdr = attempted && surfaceState === 1;
  let hdrStatus: HdrStatus;
  if (!intent.requested) hdrStatus = 'off';
  else if (!attempted) hdrStatus = 'no-hdr-display';
  else hdrStatus = hdr ? 'active' : 'tone-mapping-unsupported';
  return {
    format: hdr ? 'rgba16float' : sdrFormat,
    colorSpace: hdr ? 'display-p3' : 'srgb',
    toneMapping: hdr ? 'extended' : 'standard',
    alphaMode: 'premultiplied',
    usage: usageNames(CANVAS_USAGE_RENDER_ATTACHMENT),
    hdr,
    hdrRequested: intent.requested,
    hdrSource: intent.source,
    hdrStatus,
    displayHdr,
    capture: false,
  };
}

let lastPresentation: PresentationInfo | null = null;

/** The most recently applied presentation, for the boot probe; `null` before any boot. */
export function getLastPresentation(): PresentationInfo | null {
  return lastPresentation;
}

/** Record a presentation decided elsewhere (the C++ renderer configures its own surface). */
export function recordPresentation(info: PresentationInfo | null): void {
  lastPresentation = info;
}

/**
 * Decide and apply the canvas configuration. Never throws: any HDR failure falls back
 * to the SDR configuration, which is always applied last in that case.
 */
export function configurePresentation(
  context: ReadableContext,
  device: GPUDevice,
  options: PresentationOptions,
): PresentationState {
  const capture = options.capture ?? resolveCaptureIntent(options.search);
  const usage = capture ? CANVAS_USAGE_RENDER_ATTACHMENT | CANVAS_USAGE_COPY_SRC : undefined;
  const intent = resolveHdrIntent(options.search, options.hdrSetting);
  const displayHdr = options.displayHdr ?? detectHdrDisplay();

  let hdrStatus: HdrStatus = 'off';
  let applied: GPUCanvasConfiguration | null = null;

  if (intent.requested) {
    if (!intent.forced && !displayHdr) {
      hdrStatus = 'no-hdr-display';
    } else {
      const hdrConfig = buildCanvasConfiguration(device, 'rgba16float', {
        usage,
        colorSpace: 'display-p3',
        toneMapping: { mode: 'extended' },
      });
      try {
        context.configure(hdrConfig);
        const readBack = typeof context.getConfiguration === 'function' ? context.getConfiguration() : null;
        if (readBack?.toneMapping?.mode === 'extended' && readBack.format === 'rgba16float') {
          applied = hdrConfig;
          hdrStatus = 'active';
        } else {
          hdrStatus = 'tone-mapping-unsupported';
        }
      } catch {
        hdrStatus = 'configure-rejected';
      }
    }
  }

  const configuration = applied ?? buildCanvasConfiguration(device, options.sdrFormat, { usage });
  if (!applied) context.configure(configuration);

  const hdr = applied !== null;
  const info: PresentationInfo = {
    format: configuration.format,
    colorSpace: hdr ? 'display-p3' : 'srgb',
    toneMapping: hdr ? 'extended' : 'standard',
    alphaMode: configuration.alphaMode ?? 'opaque',
    usage: usageNames(usage ?? CANVAS_USAGE_RENDER_ATTACHMENT),
    hdr,
    hdrRequested: intent.requested,
    hdrSource: intent.source,
    hdrStatus,
    displayHdr,
    capture,
  };
  lastPresentation = info;
  return { info, configuration };
}

/** One line for the Settings panel under the "HDR (if supported)" toggle. */
export function describeHdrStatus(info: PresentationInfo | null): string {
  if (!info) return '';
  switch (info.hdrStatus) {
    case 'active':
      return 'Active (extended range, Display P3)';
    case 'no-hdr-display':
      return 'Not active: this display does not report HDR';
    case 'tone-mapping-unsupported':
      return 'Not active: this browser does not support extended tone mapping';
    case 'configure-rejected':
      return 'Not active: the browser rejected the HDR canvas configuration';
    default:
      return info.hdrRequested ? '' : 'Off';
  }
}
