/**
 * Frosted Glass Backboard initialization and uniform updates.
 * Extracted from viewWebGPU.ts to keep file sizes manageable.
 */

import * as Matrix from 'gl-matrix';
import { FrostedGlassShaders } from './shaders.js';
import { FullScreenQuadData } from './geometry.js';

export interface FrostedGlassResources {
  frostedGlassPipeline: GPURenderPipeline;
  frostedGlassVertexBuffer: GPUBuffer;
  frostedGlassUniformBuffer: GPUBuffer;
  frostedGlassTexture: GPUTexture;
  frostedGlassTextureView: GPUTextureView;
  frostedGlassBindGroup: GPUBindGroup;
}

/**
 * Initialize the frosted glass backboard pipeline and resources.
 */
export async function initFrostedGlassBackboard(
  device: GPUDevice,
  canvas: HTMLCanvasElement,
  createGPUBuffer: (device: GPUDevice, data: Float32Array) => GPUBuffer
): Promise<FrostedGlassResources> {
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  const frostedShader = FrostedGlassShaders();

  const frostedGlassPipeline = device.createRenderPipeline({
    label: 'frosted glass pipeline', layout: 'auto',
    vertex: {
      module: device.createShaderModule({ code: frostedShader.vertex }),
      entryPoint: 'main',
      buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, format: 'float32x3' as GPUVertexFormat, offset: 0 }] }]
    },
    fragment: {
      module: device.createShaderModule({ code: frostedShader.fragment }),
      entryPoint: 'main',
      targets: [{ format: presentationFormat, blend: {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      }}]
    },
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' }
  });

  const quadData = FullScreenQuadData();
  const frostedGlassVertexBuffer = createGPUBuffer(device, quadData.positions);

  const frostedGlassUniformBuffer = device.createBuffer({
    size: 160,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  const frostedGlassTexture = device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: presentationFormat,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
  });
  const frostedGlassTextureView = frostedGlassTexture.createView();

  console.log('[FrostedGlass] Backboard initialized');

  return {
    frostedGlassPipeline,
    frostedGlassVertexBuffer,
    frostedGlassUniformBuffer,
    frostedGlassTexture,
    frostedGlassTextureView,
    frostedGlassBindGroup: null as any, // Created during uniform update
  };
}

/**
 * Update frosted glass uniforms and bind group.
 */
let _frostedGlassUniformData: Float32Array;

export function updateFrostedGlassUniforms(
  device: GPUDevice,
  pipeline: GPURenderPipeline,
  uniformBuffer: GPUBuffer,
  sampler: GPUSampler,
  textureView: GPUTextureView,
  vpMatrix: Float32Array,
  borderColor: number[]
): GPUBindGroup {
  const modelMatrix = Matrix.mat4.create();
  Matrix.mat4.identity(modelMatrix);
  Matrix.mat4.translate(modelMatrix, modelMatrix, [0, 0, -1.0]);
  Matrix.mat4.scale(modelMatrix, modelMatrix, [12.0, 24.0, 1.0]);

  if (!_frostedGlassUniformData) _frostedGlassUniformData = new Float32Array(40);
  const uniformData = _frostedGlassUniformData;
  uniformData.set(vpMatrix, 0);
  uniformData.set(modelMatrix as Float32Array, 16);
  const tint = borderColor || [0.5, 0.5, 0.5, 0.3];
  uniformData.set(tint, 32);
  uniformData[36] = 0.5; // frostAmount
  uniformData[37] = 0.85; // opacity

  device.queue.writeBuffer(uniformBuffer, 0, uniformData);

  return device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: sampler },
      { binding: 2, resource: textureView }
    ]
  });
}
