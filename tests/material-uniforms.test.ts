import { describe, expect, it } from 'vitest';
import { BLOCK_FRAGMENT_UNIFORM_OFFSETS } from '../src/webgpu/shaders/block/bindings.js';
import { updateMaterialUniforms } from '../src/webgpu/viewMaterials.js';
import { Materials } from '../src/webgpu/materials.js';

describe('updateMaterialUniforms', () => {
  it('writes textureMix and enablePBR at the authoritative fragment uniform offsets', () => {
    const writes: Array<{ offset: number; data: ArrayBufferView }> = [];
    const view = {
      device: {
        queue: {
          writeBuffer: (_buf: unknown, offset: number, data: ArrayBufferView) => {
            const clone =
              data instanceof Float32Array
                ? new Float32Array(data)
                : new Uint32Array(data as Uint32Array);
            writes.push({ offset, data: clone });
          },
        },
      },
      currentMaterial: Materials.imageSampled,
      usePremiumMaterials: true,
      authoredBlockTextureLoaded: true,
      fragmentUniformBuffer: {},
      materialUniformBuffer: {},
      backgroundUniformBuffer: {},
      _f32_3: new Float32Array(3),
      _materialUniforms: new Float32Array(16),
      particleInteractionUniforms: {
        particleInfluence: 0,
        glassDistortion: 0,
        goldSpecularBoost: 0,
        cyberEmissivePulse: 0,
      },
      useWireframe: false,
    };

    updateMaterialUniforms(view as any);

    const textureMixWrite = writes.find((w) => w.offset === BLOCK_FRAGMENT_UNIFORM_OFFSETS.textureMix);
    const enablePbrWrite = writes.find((w) => w.offset === BLOCK_FRAGMENT_UNIFORM_OFFSETS.enablePBR);

    expect(textureMixWrite).toBeDefined();
    expect((textureMixWrite!.data as Float32Array)[0]).toBeCloseTo(0.94, 5);

    expect(enablePbrWrite).toBeDefined();
    expect((enablePbrWrite!.data as Float32Array)[0]).toBeCloseTo(1.0, 5);
  });

  it('uses reduced textureMix when authored block texture failed to load', () => {
    const writes: Array<{ offset: number; data: ArrayBufferView }> = [];
    const view = {
      device: {
        queue: {
          writeBuffer: (_buf: unknown, offset: number, data: ArrayBufferView) => {
            const clone =
              data instanceof Float32Array
                ? new Float32Array(data)
                : new Uint32Array(data as Uint32Array);
            writes.push({ offset, data: clone });
          },
        },
      },
      currentMaterial: Materials.imageSampled,
      usePremiumMaterials: true,
      authoredBlockTextureLoaded: false,
      fragmentUniformBuffer: {},
      materialUniformBuffer: {},
      backgroundUniformBuffer: {},
      _f32_3: new Float32Array(3),
      _materialUniforms: new Float32Array(16),
      particleInteractionUniforms: {
        particleInfluence: 0,
        glassDistortion: 0,
        goldSpecularBoost: 0,
        cyberEmissivePulse: 0,
      },
      useWireframe: false,
    };

    updateMaterialUniforms(view as any);

    const textureMixWrite = writes.find((w) => w.offset === BLOCK_FRAGMENT_UNIFORM_OFFSETS.textureMix);
    expect(textureMixWrite).toBeDefined();
    expect((textureMixWrite!.data as Float32Array)[0]).toBeCloseTo(0.55, 5);
  });
});
