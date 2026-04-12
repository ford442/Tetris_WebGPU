/**
 * WebGPU texture utility functions for the View renderer.
 * Extracted from viewWebGPU.ts to keep file sizes manageable.
 */

import {
  PROCEDURAL_BLOCK_TEXTURE_SIZE,
  getTextureMipLevelCount,
  paintProceduralBlockTexture,
} from './blockTexture.js';

/**
 * Generate mipmaps for a given GPU texture using a blit shader.
 */
export function generateMipmaps(
  device: GPUDevice,
  texture: GPUTexture,
  width: number,
  height: number,
  mipLevelCount: number
) {
  const blitShader = `
    @group(0) @binding(0) var srcTexture: texture_2d<f32>;
    @group(0) @binding(1) var srcSampler: sampler;
    struct VertexOutput {
      @builtin(position) position: vec4<f32>,
      @location(0) uv: vec2<f32>,
    };
    @vertex
    fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
      var pos = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
        vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
      );
      var uv = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0),
        vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(1.0, 0.0)
      );
      var output: VertexOutput;
      output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
      output.uv = uv[vertexIndex];
      return output;
    }
    @fragment
    fn fragmentMain(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
      return textureSample(srcTexture, srcSampler, uv);
    }
  `;

  const shaderModule = device.createShaderModule({ code: blitShader });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: shaderModule, entryPoint: 'vertexMain' },
    fragment: { module: shaderModule, entryPoint: 'fragmentMain', targets: [{ format: 'rgba8unorm' }] },
  });

  const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
  const commandEncoder = device.createCommandEncoder();

  for (let i = 1; i < mipLevelCount; i++) {
    const srcView = texture.createView({ baseMipLevel: i - 1, mipLevelCount: 1 });
    const dstView = texture.createView({ baseMipLevel: i, mipLevelCount: 1 });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: srcView }, { binding: 1, resource: sampler }],
    });
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{ view: dstView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
    });
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(6, 1, 0, 0);
    passEncoder.end();
  }
  device.queue.submit([commandEncoder.finish()]);
}

/**
 * Create a solid white 1x1 fallback texture.
 */
let _solidFallbackData: Uint8Array;

export function createSolidFallbackTexture(device: GPUDevice): GPUTexture {
  const texture = device.createTexture({
    size: [1, 1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    _solidFallbackData || (_solidFallbackData = new Uint8Array([255, 255, 255, 255])),
    { bytesPerRow: 4 },
    [1, 1, 1]
  );
  return texture;
}

/**
 * Create a procedural block texture with mipmaps.
 */
export function createProceduralFallbackTexture(device: GPUDevice): GPUTexture {
  const size = PROCEDURAL_BLOCK_TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create procedural fallback texture context');
  }

  paintProceduralBlockTexture(ctx, size);

  const mipLevelCount = getTextureMipLevelCount(size, size);
  const texture = device.createTexture({
    size: [size, size, 1],
    format: 'rgba8unorm',
    mipLevelCount,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  device.queue.copyExternalImageToTexture(
    { source: canvas },
    { texture },
    [size, size]
  );
  generateMipmaps(device, texture, size, size, mipLevelCount);

  return texture;
}

/**
 * Recreate offscreen + depth textures after a canvas resize, and update
 * all render pass descriptors and bind groups to reference the new views.
 * `view` is cast as `any` to avoid a circular import.
 */
export function recreateRenderTargets(view: any) {
  const device: GPUDevice = view.device;
  if (!device) return;
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  if (view.offscreenTexture) view.offscreenTexture.destroy();
  view.offscreenTexture = device.createTexture({
    size: [view.canvasWebGPU.width, view.canvasWebGPU.height, 1],
    format: presentationFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  view._offscreenTextureView = view.offscreenTexture.createView();

  if (view.depthTexture) view.depthTexture.destroy();
  view.depthTexture = device.createTexture({
    size: [view.canvasWebGPU.width, view.canvasWebGPU.height, 1],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  view._depthTextureView = view.depthTexture.createView();

  if (view._backgroundPassDescriptor?.colorAttachments) {
    (view._backgroundPassDescriptor.colorAttachments as GPURenderPassColorAttachment[])[0].view =
      view._offscreenTextureView;
  }
  if (view._mainPassDescriptor?.colorAttachments) {
    (view._mainPassDescriptor.colorAttachments as GPURenderPassColorAttachment[])[0].view =
      view._offscreenTextureView;
  }
  if (view._mainPassDescriptor?.depthStencilAttachment) {
    view._mainPassDescriptor.depthStencilAttachment.view = view._depthTextureView;
  }

  if (view.postProcessPipeline) {
    view.postProcessBindGroup = device.createBindGroup({
      layout: view.postProcessPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: view.postProcessUniformBuffer } },
        { binding: 1, resource: view.sampler },
        { binding: 2, resource: view.offscreenTexture.createView() },
      ],
    });
  }
}
