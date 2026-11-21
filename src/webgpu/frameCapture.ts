/**
 * Frame capture: read the presented canvas texture back to a PNG.
 *
 * Needs `COPY_SRC` on the canvas texture, which `presentation.ts` adds only behind
 * `?capture` — the default configuration (RENDER_ATTACHMENT only) is untouched, so a
 * normal session pays nothing. A canvas texture is only valid for the frame it was
 * acquired in, so the copy is encoded into that frame's command encoder right after
 * the final pass (`PostProcessor`), and mapped after submit. Used by the pause-menu
 * "Save screenshot" action and by the E2E harness via `window.__tetrisCaptureFrame`.
 *
 * The pixel conversion is pure and tested without a GPU.
 */

export type CaptureFormat = 'bgra8unorm' | 'rgba8unorm' | 'rgba16float';

const BYTES_PER_PIXEL: Record<CaptureFormat, number> = {
  bgra8unorm: 4,
  rgba8unorm: 4,
  rgba16float: 8,
};

export function isCaptureFormat(format: string): format is CaptureFormat {
  return format in BYTES_PER_PIXEL;
}

/** `copyTextureToBuffer` rows must be 256-byte aligned. */
export function alignedBytesPerRow(width: number, format: CaptureFormat): number {
  const raw = width * BYTES_PER_PIXEL[format];
  return Math.ceil(raw / 256) * 256;
}

/** IEEE half → float. */
export function halfToFloat(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const frac = h & 0x3ff;
  if (exp === 0) return sign * 2 ** -14 * (frac / 1024);
  if (exp === 0x1f) return frac ? Number.NaN : sign * Infinity;
  return sign * 2 ** (exp - 15) * (1 + frac / 1024);
}

/**
 * Convert a padded readback into tightly packed, straight-alpha RGBA8 for a PNG.
 * `rgba16float` (HDR output) is clamped to [0, 1]: a PNG is an SDR container, so
 * highlights past SDR white clip — fine for a thumbnail, and the clip is the
 * honest SDR rendering of that frame. The canvas is premultiplied, so colour is
 * divided by alpha.
 */
export function convertCaptureToRgba8(
  src: Uint8Array,
  width: number,
  height: number,
  bytesPerRow: number,
  format: CaptureFormat,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  const view = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const bpp = BYTES_PER_PIXEL[format];
  let o = 0;
  for (let y = 0; y < height; y++) {
    const row = y * bytesPerRow;
    for (let x = 0; x < width; x++) {
      const i = row + x * bpp;
      let r: number;
      let g: number;
      let b: number;
      let a: number;
      if (format === 'rgba16float') {
        r = halfToFloat(view.getUint16(i, true));
        g = halfToFloat(view.getUint16(i + 2, true));
        b = halfToFloat(view.getUint16(i + 4, true));
        a = halfToFloat(view.getUint16(i + 6, true));
      } else {
        const c0 = view.getUint8(i) / 255;
        const c1 = view.getUint8(i + 1) / 255;
        const c2 = view.getUint8(i + 2) / 255;
        a = view.getUint8(i + 3) / 255;
        if (format === 'bgra8unorm') {
          b = c0; g = c1; r = c2;
        } else {
          r = c0; g = c1; b = c2;
        }
      }
      const inv = a > 0 ? 1 / a : 0;
      out[o++] = Math.max(0, Math.min(1, r * inv)) * 255;
      out[o++] = Math.max(0, Math.min(1, g * inv)) * 255;
      out[o++] = Math.max(0, Math.min(1, b * inv)) * 255;
      out[o++] = Math.max(0, Math.min(1, a)) * 255;
    }
  }
  return out;
}

interface Pending {
  resolve: (blob: Blob) => void;
  reject: (err: Error) => void;
}

interface InFlight extends Pending {
  buffer: GPUBuffer;
  width: number;
  height: number;
  bytesPerRow: number;
  format: CaptureFormat;
}

export type PngEncoder = (rgba: Uint8ClampedArray<ArrayBuffer>, width: number, height: number) => Promise<Blob>;

export class FrameCapture {
  private pending: Pending | null = null;
  private inFlight: InFlight | null = null;

  /** `encodePng` is injectable so the readback can be tested without a canvas. */
  constructor(
    private readonly device: GPUDevice,
    private readonly encodePng: PngEncoder = rgbaToPng,
  ) {}

  /** Ask for the next presented frame as a PNG. One request at a time. */
  request(): Promise<Blob> {
    if (this.pending || this.inFlight) return Promise.reject(new Error('capture-busy'));
    return new Promise<Blob>((resolve, reject) => {
      this.pending = { resolve, reject };
    });
  }

  /** Encode the readback copy into this frame's encoder. No-op unless a request is pending. */
  encode(encoder: GPUCommandEncoder, texture: GPUTexture): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    if (!isCaptureFormat(texture.format)) {
      pending.reject(new Error(`capture-unsupported-format:${texture.format}`));
      return;
    }
    const format = texture.format;
    const bytesPerRow = alignedBytesPerRow(texture.width, format);
    const buffer = this.device.createBuffer({
      label: 'frame capture readback',
      size: bytesPerRow * texture.height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow }, [texture.width, texture.height]);
    this.inFlight = { ...pending, buffer, width: texture.width, height: texture.height, bytesPerRow, format };
  }

  /** Call after `queue.submit`: maps the readback and resolves the request with a PNG. */
  afterSubmit(): void {
    const job = this.inFlight;
    if (!job) return;
    this.inFlight = null;
    void job.buffer
      .mapAsync(GPUMapMode.READ)
      .then(async () => {
        const bytes = new Uint8Array(job.buffer.getMappedRange());
        const rgba = convertCaptureToRgba8(bytes, job.width, job.height, job.bytesPerRow, job.format);
        job.buffer.unmap();
        job.buffer.destroy();
        job.resolve(await this.encodePng(rgba, job.width, job.height));
      })
      .catch((err: unknown) => {
        job.buffer.destroy();
        job.reject(err instanceof Error ? err : new Error(String(err)));
      });
  }

  destroy(): void {
    this.pending?.reject(new Error('capture-destroyed'));
    this.pending = null;
  }
}

async function rgbaToPng(rgba: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): Promise<Blob> {
  const image = new ImageData(rgba, width, height);
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d')?.putImageData(image, 0, 0);
    return canvas.convertToBlob({ type: 'image/png' });
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.putImageData(image, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png-encode-failed'))), 'image/png');
  });
}

/** Offer a blob as a file download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
