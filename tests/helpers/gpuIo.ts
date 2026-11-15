/**
 * Small CPU<->GPU plumbing for the Dawn parity tests: IEEE half conversion (to build
 * `rgba16float` inputs and decode `rgba16float` outputs, and to emulate the rounding the GPU
 * applies when it stores them) and texture upload / readback with the 256-byte row alignment
 * `copyTextureToBuffer` demands.
 */

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** float -> IEEE binary16 bits, round-to-nearest-even, saturating to +-Inf. */
export function toHalfBits(value: number): number {
  f32[0] = value;
  const x = u32[0];
  const sign = (x >>> 16) & 0x8000;
  const expRaw = (x >>> 23) & 0xff;
  let mant = x & 0x7fffff;
  if (expRaw === 0xff) return sign | 0x7c00 | (mant ? 0x200 : 0);
  const exp = expRaw - 127 + 15;
  if (exp >= 31) return sign | 0x7c00;
  if (exp <= 0) {
    if (exp < -10) return sign;
    mant |= 0x800000;
    const shift = 14 - exp;
    let half = mant >> shift;
    const rem = mant & ((1 << shift) - 1);
    const halfway = 1 << (shift - 1);
    if (rem > halfway || (rem === halfway && (half & 1))) half++;
    return sign | half;
  }
  let half = sign | (exp << 10) | (mant >> 13);
  const rem = mant & 0x1fff;
  if (rem > 0x1000 || (rem === 0x1000 && (half & 1))) half++;
  return half;
}

export function fromHalfBits(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const mant = h & 0x3ff;
  if (exp === 0) return sign * mant * 2 ** -24;
  if (exp === 31) return mant ? NaN : sign * Infinity;
  return sign * (1 + mant / 1024) * 2 ** (exp - 15);
}

/** The value a float takes after a round trip through `rgba16float` storage. */
export function roundToHalf(value: number): number {
  return fromHalfBits(toHalfBits(value));
}

export function createTexture2d(
  device: GPUDevice,
  width: number,
  height: number,
  format: GPUTextureFormat,
  usage: GPUTextureUsageFlags,
): GPUTexture {
  return device.createTexture({ size: [width, height, 1], format, usage });
}

/** Upload tightly-packed texels (any format whose texel size is `bytesPerTexel`). */
export function uploadTexture(
  device: GPUDevice,
  texture: GPUTexture,
  data: ArrayBufferView,
  width: number,
  height: number,
  bytesPerTexel: number,
): void {
  device.queue.writeTexture(
    { texture },
    data as unknown as GPUAllowSharedBufferSource,
    { bytesPerRow: width * bytesPerTexel, rowsPerImage: height },
    [width, height, 1],
  );
}

/** Read an `rgba16float` texture back as `width*height*4` floats. */
export async function readRgba16Float(
  device: GPUDevice,
  texture: GPUTexture,
  width: number,
  height: number,
): Promise<Float32Array> {
  const bytesPerRow = Math.ceil((width * 8) / 256) * 256;
  const staging = device.createBuffer({
    size: bytesPerRow * height,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const enc = device.createCommandEncoder();
  enc.copyTextureToBuffer({ texture }, { buffer: staging, bytesPerRow, rowsPerImage: height }, [width, height, 1]);
  device.queue.submit([enc.finish()]);
  await staging.mapAsync(GPUMapMode.READ);
  const halves = new Uint16Array(staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();

  const out = new Float32Array(width * height * 4);
  const perRow = bytesPerRow / 2;
  for (let y = 0; y < height; y++) {
    for (let i = 0; i < width * 4; i++) out[y * width * 4 + i] = fromHalfBits(halves[y * perRow + i]);
  }
  return out;
}

/** Deterministic PRNG so fixtures never change between runs or machines. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
