/**
 * KTX2 container parsing. The point of these tests is the *fallback*: the PNG path is
 * canonical, so every way a .ktx2 can be wrong must end in "use the PNG", never in a
 * thrown error that takes the renderer down or a wrong-format texture upload.
 */

import { describe, expect, it } from 'vitest';
import {
  bcBytesPerRow,
  canUploadKtx2,
  isKtx2,
  KTX2_HEADER_BYTES,
  KTX2_LEVEL_INDEX_ENTRY_BYTES,
  parseKtx2,
  VK_FORMAT,
} from '../src/webgpu/ktx2.js';

const IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

interface FakeOptions {
  vkFormat?: number;
  width?: number;
  height?: number;
  levelCount?: number;
  supercompressionScheme?: number;
  payloadBytes?: number;
  truncateIndex?: boolean;
}

/** Synthesise a minimal, valid KTX2 container (header + level index + payload). */
function fakeKtx2(options: FakeOptions = {}): Uint8Array {
  const {
    vkFormat = VK_FORMAT.BC7_UNORM_BLOCK,
    width = 64,
    height = 64,
    levelCount = 1,
    supercompressionScheme = 0,
    payloadBytes = 1024,
    truncateIndex = false,
  } = options;

  const indexBytes = levelCount * KTX2_LEVEL_INDEX_ENTRY_BYTES;
  const total = KTX2_HEADER_BYTES + indexBytes + payloadBytes;
  const bytes = new Uint8Array(total);
  bytes.set(IDENTIFIER, 0);

  const view = new DataView(bytes.buffer);
  view.setUint32(12, vkFormat, true);
  view.setUint32(16, 1, true); // typeSize
  view.setUint32(20, width, true);
  view.setUint32(24, height, true);
  view.setUint32(40, levelCount, true);
  view.setUint32(44, supercompressionScheme, true);

  let offset = KTX2_HEADER_BYTES + indexBytes;
  const perLevel = Math.floor(payloadBytes / levelCount);
  for (let level = 0; level < levelCount; level++) {
    const base = KTX2_HEADER_BYTES + level * KTX2_LEVEL_INDEX_ENTRY_BYTES;
    view.setUint32(base, offset, true);
    view.setUint32(base + 8, perLevel, true);
    view.setUint32(base + 16, perLevel, true);
    offset += perLevel;
  }

  return truncateIndex ? bytes.subarray(0, KTX2_HEADER_BYTES + 4) : bytes;
}

describe('KTX2 parsing', () => {
  it('recognises the KTX2 identifier', () => {
    expect(isKtx2(fakeKtx2())).toBe(true);
    expect(isKtx2(new Uint8Array(80))).toBe(false);
    expect(isKtx2(new Uint8Array(4))).toBe(false);
  });

  it('reads format, size and the level index', () => {
    const file = parseKtx2(fakeKtx2({ width: 256, height: 128, levelCount: 3 }));
    expect(file.gpuFormat).toBe('bc7-rgba-unorm');
    expect(file.width).toBe(256);
    expect(file.height).toBe(128);
    expect(file.levels).toHaveLength(3);
    expect(file.levels[0].byteOffset).toBeGreaterThanOrEqual(KTX2_HEADER_BYTES);
  });

  it('maps the BC formats block maps actually use', () => {
    expect(parseKtx2(fakeKtx2({ vkFormat: VK_FORMAT.BC7_SRGB_BLOCK })).gpuFormat)
      .toBe('bc7-rgba-unorm-srgb');
    expect(parseKtx2(fakeKtx2({ vkFormat: VK_FORMAT.BC3_UNORM_BLOCK })).gpuFormat)
      .toBe('bc3-rgba-unorm');
    expect(parseKtx2(fakeKtx2({ vkFormat: VK_FORMAT.BC5_UNORM_BLOCK })).gpuFormat)
      .toBe('bc5-rg-unorm');
  });

  it('refuses an unknown format instead of guessing', () => {
    const file = parseKtx2(fakeKtx2({ vkFormat: 37 /* R8G8B8A8_UNORM */ }));
    expect(file.gpuFormat).toBeNull();
    expect(canUploadKtx2(file)).toBe(false);
  });

  it('refuses supercompressed payloads (no transcoder by design)', () => {
    const file = parseKtx2(fakeKtx2({ supercompressionScheme: 1 /* BasisLZ */ }));
    expect(canUploadKtx2(file)).toBe(false);
  });

  it('requires texture-compression-bc when features are known', () => {
    const file = parseKtx2(fakeKtx2());
    expect(canUploadKtx2(file, new Set(['texture-compression-bc']))).toBe(true);
    expect(canUploadKtx2(file, new Set())).toBe(false);
  });

  it('throws on a truncated level index rather than reading past the buffer', () => {
    expect(() => parseKtx2(fakeKtx2({ truncateIndex: true }))).toThrow(/truncated/);
  });

  it('throws when a level points past the end of the file', () => {
    const bytes = fakeKtx2();
    new DataView(bytes.buffer).setUint32(KTX2_HEADER_BYTES + 8, 1 << 30, true);
    expect(() => parseKtx2(bytes)).toThrow(/past the end/);
  });

  it('throws on zero dimensions', () => {
    expect(() => parseKtx2(fakeKtx2({ width: 0 }))).toThrow(/zero dimensions/);
  });

  it('computes BC bytes-per-row from 4x4 blocks', () => {
    expect(bcBytesPerRow('bc7-rgba-unorm', 64)).toBe(16 * 16);
    expect(bcBytesPerRow('bc7-rgba-unorm', 63)).toBe(16 * 16);
    expect(bcBytesPerRow('bc1-rgba-unorm', 64)).toBe(16 * 8);
  });
});
