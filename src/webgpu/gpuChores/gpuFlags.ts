/**
 * WebGPU usage-flag constants with a non-browser fallback.
 *
 * The chore runner is exercised in Vitest against a fake device, where the
 * `GPUBufferUsage` / `GPUTextureUsage` / `GPUMapMode` namespace objects do not
 * exist. The spec fixes these values, so mirroring them keeps the runner
 * importable under Node without sprinkling `typeof` guards through the code.
 */

interface FlagBag { readonly [key: string]: number }

function bag(global: unknown, fallback: FlagBag): FlagBag {
  return (global as FlagBag | undefined) ?? fallback;
}

export const BufferUsage = bag(typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage : undefined, {
  MAP_READ: 0x0001,
  MAP_WRITE: 0x0002,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
  INDIRECT: 0x0100,
  QUERY_RESOLVE: 0x0200,
});

export const TextureUsage = bag(typeof GPUTextureUsage !== 'undefined' ? GPUTextureUsage : undefined, {
  COPY_SRC: 0x01,
  COPY_DST: 0x02,
  TEXTURE_BINDING: 0x04,
  STORAGE_BINDING: 0x08,
  RENDER_ATTACHMENT: 0x10,
});

export const MapMode = bag(typeof GPUMapMode !== 'undefined' ? GPUMapMode : undefined, {
  READ: 0x0001,
  WRITE: 0x0002,
});
