/**
 * Optional KTX2 (BC-compressed) upgrade path for authored block maps.
 *
 * Rationale, since this is a deliberately small amount of code: a 1364x1343 RGBA
 * albedo plus a packed material map is ~14 MB of VRAM per brick set, and a content
 * pack (#449-style) ships several. BC7 cuts that ~4x with no sampling change. But the
 * PNG path stays canonical — this is an *upgrade*, taken only when the adapter
 * actually exposes `texture-compression-bc`, and any parse failure silently falls back.
 *
 * No dependency: a KTX2 container is a fixed header plus a level index, and we only
 * need "which BC format, what size, where are the bytes". Pulling `ktx-parse` (let
 * alone Three.js) to read 80 bytes of little-endian integers would be a worse trade.
 * Basis-universal *transcoding* is explicitly out of scope — ship the BC payload.
 */

const KTX2_IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

/** KTX2 header is 80 bytes: 12-byte identifier + 17 fields, then the level index. */
export const KTX2_HEADER_BYTES = 80;
export const KTX2_LEVEL_INDEX_ENTRY_BYTES = 24;

/** The BC VkFormat values worth supporting for block maps. */
export const VK_FORMAT = {
  BC3_UNORM_BLOCK: 137,
  BC3_SRGB_BLOCK: 138,
  BC5_UNORM_BLOCK: 141,
  BC7_UNORM_BLOCK: 145,
  BC7_SRGB_BLOCK: 146,
} as const;

const VK_FORMAT_TO_GPU: Record<number, GPUTextureFormat> = {
  [VK_FORMAT.BC3_UNORM_BLOCK]: 'bc3-rgba-unorm',
  [VK_FORMAT.BC3_SRGB_BLOCK]: 'bc3-rgba-unorm-srgb',
  [VK_FORMAT.BC5_UNORM_BLOCK]: 'bc5-rg-unorm',
  [VK_FORMAT.BC7_UNORM_BLOCK]: 'bc7-rgba-unorm',
  [VK_FORMAT.BC7_SRGB_BLOCK]: 'bc7-rgba-unorm-srgb',
};

export interface Ktx2Level {
  byteOffset: number;
  byteLength: number;
  uncompressedByteLength: number;
}

export interface Ktx2File {
  vkFormat: number;
  /** WebGPU format, or null when the payload is not a BC format we can bind. */
  gpuFormat: GPUTextureFormat | null;
  width: number;
  height: number;
  levelCount: number;
  /** 0 = none. Anything else (Basis, Zstd) needs a transcoder we intentionally lack. */
  supercompressionScheme: number;
  levels: Ktx2Level[];
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

/** u64 read as a Number — level offsets in a block texture never exceed 2^53. */
function readU64(view: DataView, offset: number): number {
  const lo = view.getUint32(offset, true);
  const hi = view.getUint32(offset + 4, true);
  return hi * 0x1_0000_0000 + lo;
}

export function isKtx2(buffer: ArrayBuffer | Uint8Array): boolean {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < KTX2_HEADER_BYTES) return false;
  return KTX2_IDENTIFIER.every((byte, i) => bytes[i] === byte);
}

/**
 * Parse the container. Throws on a malformed file; callers treat that as "use the
 * PNG" rather than as a fatal error.
 */
export function parseKtx2(buffer: ArrayBuffer | Uint8Array): Ktx2File {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (!isKtx2(bytes)) throw new Error('not a KTX2 file');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vkFormat = readU32(view, 12);
  const width = readU32(view, 20);
  const height = readU32(view, 24);
  const levelCount = Math.max(1, readU32(view, 40));
  const supercompressionScheme = readU32(view, 44);

  if (width === 0 || height === 0) throw new Error('KTX2 has zero dimensions');
  const indexEnd = KTX2_HEADER_BYTES + levelCount * KTX2_LEVEL_INDEX_ENTRY_BYTES;
  if (bytes.byteLength < indexEnd) throw new Error('KTX2 level index is truncated');

  const levels: Ktx2Level[] = [];
  for (let level = 0; level < levelCount; level++) {
    const base = KTX2_HEADER_BYTES + level * KTX2_LEVEL_INDEX_ENTRY_BYTES;
    const byteOffset = readU64(view, base);
    const byteLength = readU64(view, base + 8);
    const uncompressedByteLength = readU64(view, base + 16);
    if (byteOffset + byteLength > bytes.byteLength) {
      throw new Error(`KTX2 level ${level} extends past the end of the file`);
    }
    levels.push({ byteOffset, byteLength, uncompressedByteLength });
  }

  return {
    vkFormat,
    gpuFormat: VK_FORMAT_TO_GPU[vkFormat] ?? null,
    width,
    height,
    levelCount,
    supercompressionScheme,
    levels,
  };
}

/** True when this file can be uploaded as-is (BC format, no supercompression). */
export function canUploadKtx2(file: Ktx2File, deviceFeatures?: ReadonlySet<string>): boolean {
  if (file.gpuFormat === null) return false;
  if (file.supercompressionScheme !== 0) return false;
  if (deviceFeatures && !deviceFeatures.has('texture-compression-bc')) return false;
  return true;
}

/** BC blocks are 4x4; a row of blocks is ceil(width / 4) * bytesPerBlock. */
export function bcBytesPerRow(format: GPUTextureFormat, width: number): number {
  const bytesPerBlock = format.startsWith('bc1') || format.startsWith('bc4') ? 8 : 16;
  return Math.ceil(width / 4) * bytesPerBlock;
}

/**
 * Fetch + upload a `.ktx2` block map. Returns null (never throws) when the adapter
 * lacks BC support, the fetch 404s, or the container is something we do not decode —
 * the caller then uses the PNG, exactly as before.
 */
export async function tryLoadKtx2Texture(
  device: GPUDevice,
  url: string,
  label = 'ktx2 block map',
): Promise<GPUTexture | null> {
  try {
    if (!device.features.has('texture-compression-bc')) return null;
    const response = await fetch(url);
    if (!response.ok) return null;

    const bytes = new Uint8Array(await response.arrayBuffer());
    const file = parseKtx2(bytes);
    if (!canUploadKtx2(file, device.features as unknown as ReadonlySet<string>)) return null;

    const format = file.gpuFormat as GPUTextureFormat;
    const texture = device.createTexture({
      label,
      size: [file.width, file.height, 1],
      format,
      mipLevelCount: file.levelCount,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    for (let level = 0; level < file.levelCount; level++) {
      const { byteOffset, byteLength } = file.levels[level];
      const width = Math.max(1, file.width >> level);
      const height = Math.max(1, file.height >> level);
      device.queue.writeTexture(
        { texture, mipLevel: level },
        bytes.subarray(byteOffset, byteOffset + byteLength),
        { bytesPerRow: bcBytesPerRow(format, width), rowsPerImage: Math.ceil(height / 4) },
        [width, height, 1],
      );
    }
    return texture;
  } catch {
    return null;
  }
}
