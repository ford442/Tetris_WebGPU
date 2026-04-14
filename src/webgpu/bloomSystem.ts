interface BloomSystem {
  _thresholdData?: Float32Array;
  _blurData?: Float32Array;
  _upsampleData?: Float32Array;
  _compositeData?: Float32Array;
}
/**
 * BloomSystem - Professional Multi-Pass Bloom Effect for WebGPU
 *
 * Implements a high-quality bloom post-processing effect using:
 * 1. Luminance threshold pass (extracts bright pixels)
 * 2. Downsample passes (3 levels: 1/2, 1/4, 1/8)
 * 3. Gaussian blur passes (separable horizontal + vertical)
 * 4. Upsample & combine passes (additive blending with scatter)
 * 5. Final composite pass (blend bloom with original image)
 *
 * Uses half-precision (rgba16float) textures for efficiency and
 * supports dynamic resizing and parameter adjustment.
 */

import {
  ThresholdShader,
  DownsampleShader,
  BlurHorizontalShader,
  BlurVerticalShader,
  UpsampleCombineShader,
  CompositeShader,
} from './bloomShaders.js';

export interface BloomParameters {
  /** Luminance threshold (0.0 - 1.0), default 0.35 */
  threshold: number;
  /** Bloom intensity (0.0 - 2.0), default 1.0 */
  intensity: number;
  /** How much bloom spreads (0.5 - 1.0), default 0.7 */
  scatter: number;
  /** Max bloom brightness to prevent HDR overflow, default 65472 */
  clamp: number;
  /** Smooth knee for threshold falloff, default 0.1 */
  knee: number;
}

const DEFAULT_BLOOM_PARAMS: BloomParameters = {
  // MODIFIED: Raised from 0.35 to 0.75 - only top 25% brightest pixels bloom
  // Normal Tetris blocks have moderate brightness (~0.4-0.6), won't trigger bloom
  // Only special effects, line clears, and very bright elements will glow
  threshold: 0.75,

  // MODIFIED: Reduced from 1.0 to 0.4 - 60% reduction in glow strength
  // Prevents washout while maintaining pleasant accent glow
  intensity: 0.4,

  // MODIFIED: Reduced from 0.7 to 0.55 - 21% tighter blur radius
  // Works optimally with 5-tap Gaussian kernel for sharp block edges
  scatter: 0.55,

  // Unchanged: Max bloom brightness prevents extreme HDR overflow
  clamp: 65472,

  // Unchanged: Smooth knee for gradual threshold falloff
  knee: 0.1
};

// Number of mip levels for the bloom pyramid
const BLOOM_MIP_LEVELS = 3;

// ============================================================================
// BLOOM SYSTEM CLASS
// ============================================================================

export class BloomSystem {
  private device: GPUDevice;
  private width: number;
  private height: number;
  
  // Parameters
  private params: BloomParameters;
  
  // Pipelines
  private thresholdPipeline!: GPURenderPipeline;
  private downsamplePipeline!: GPURenderPipeline;
  private blurHorizontalPipeline!: GPURenderPipeline;
  private blurVerticalPipeline!: GPURenderPipeline;
  private upsampleCombinePipeline!: GPURenderPipeline;
  private compositePipeline!: GPURenderPipeline;
  
  // Render targets for each mip level
  // Level 0: 1/2 resolution, Level 1: 1/4, Level 2: 1/8
  private bloomTextures: GPUTexture[] = [];
  private bloomTextureViews: GPUTextureView[] = [];
  
  // Ping-pong textures for blur (horizontal -> vertical)
  private blurTempTextures: GPUTexture[] = [];
  private blurTempTextureViews: GPUTextureView[] = [];
  
  // Uniform buffers
  private thresholdUniformBuffer!: GPUBuffer;
  private blurUniformBuffers: GPUBuffer[] = [];
  private upsampleUniformBuffers: GPUBuffer[] = [];
  private compositeUniformBuffer!: GPUBuffer;
  
  // Bind groups
  private thresholdBindGroup!: GPUBindGroup;
  private downsampleBindGroups: GPUBindGroup[] = [];
  private blurHorizontalBindGroups: GPUBindGroup[] = [];
  private blurVerticalBindGroups: GPUBindGroup[] = [];
  private upsampleCombineBindGroups: GPUBindGroup[] = [];
  private compositeBindGroup!: GPUBindGroup;
  
  // Samplers
  private linearSampler!: GPUSampler;
  private linearClampSampler!: GPUSampler;
  
  // Fullscreen quad vertex buffer (shared)
  private vertexBuffer!: GPUBuffer;
  
  constructor(device: GPUDevice, width: number, height: number) {
    this.device = device;
    this.width = width;
    this.height = height;
    this.params = { ...DEFAULT_BLOOM_PARAMS };
    
    this.initialize();
  }
  
  /**
   * Initialize all WebGPU resources
   */
  private initialize(): void {
    this.createSamplers();
    this.createVertexBuffer();
    this.createPipelines();
    this.createTextures();
    this.createUniformBuffers();
    this.updateBindGroups();
  }
  
  /**
   * Create texture samplers
   */
  private createSamplers(): void {
    this.linearSampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });
    
    this.linearClampSampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });
  }
  
  /**
   * Create fullscreen quad vertex buffer
   */
  private createVertexBuffer(): void {
    // 6 vertices for a fullscreen quad (2 triangles)
    // We use vertex shader to generate positions, so this is just a placeholder
    const vertices = new Float32Array([
      -1, -1, 0,  1, -1, 0,  -1, 1, 0,
      -1,  1, 0,  1, -1, 0,   1, 1, 0
    ]);
    
    this.vertexBuffer = this.device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
    this.vertexBuffer.unmap();
  }
  
  /**
   * Create all render pipelines
   */
  private createPipelines(): void {
    // Common vertex state
    const vertexState: GPUVertexState = {
      module: this.device.createShaderModule({ code: ThresholdShader }),
      entryPoint: 'vsMain',
      buffers: [{
        arrayStride: 12,
        attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }]
      }]
    };
    
    // Threshold pipeline
    this.thresholdPipeline = this.device.createRenderPipeline({
      label: 'Bloom Threshold Pipeline',
      layout: 'auto',
      vertex: vertexState,
      fragment: {
        module: this.device.createShaderModule({ code: ThresholdShader }),
        entryPoint: 'fsMain',
        targets: [{ format: 'rgba16float' }]
      },
      primitive: { topology: 'triangle-list' }
    });
    
    // Downsample pipeline
    this.downsamplePipeline = this.device.createRenderPipeline({
      label: 'Bloom Downsample Pipeline',
      layout: 'auto',
      vertex: {
        module: this.device.createShaderModule({ code: DownsampleShader }),
        entryPoint: 'vsMain',
        buffers: [{
          arrayStride: 12,
          attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }]
        }]
      },
      fragment: {
        module: this.device.createShaderModule({ code: DownsampleShader }),
        entryPoint: 'fsMain',
        targets: [{ format: 'rgba16float' }]
      },
      primitive: { topology: 'triangle-list' }
    });
    
    // Blur horizontal pipeline
    this.blurHorizontalPipeline = this.device.createRenderPipeline({
      label: 'Bloom Blur Horizontal Pipeline',
      layout: 'auto',
      vertex: {
        module: this.device.createShaderModule({ code: BlurHorizontalShader }),
        entryPoint: 'vsMain',
        buffers: [{
          arrayStride: 12,
          attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }]
        }]
      },
      fragment: {
        module: this.device.createShaderModule({ code: BlurHorizontalShader }),
        entryPoint: 'fsMain',
        targets: [{ format: 'rgba16float' }]
      },
      primitive: { topology: 'triangle-list' }
    });
    
    // Blur vertical pipeline
    this.blurVerticalPipeline = this.device.createRenderPipeline({
      label: 'Bloom Blur Vertical Pipeline',
      layout: 'auto',
      vertex: {
        module: this.device.createShaderModule({ code: BlurVerticalShader }),
        entryPoint: 'vsMain',
        buffers: [{
          arrayStride: 12,
          attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }]
        }]
      },
      fragment: {
        module: this.device.createShaderModule({ code: BlurVerticalShader }),
        entryPoint: 'fsMain',
        targets: [{ format: 'rgba16float' }]
      },
      primitive: { topology: 'triangle-list' }
    });
    
    // Upsample & combine pipeline
    this.upsampleCombinePipeline = this.device.createRenderPipeline({
      label: 'Bloom Upsample Combine Pipeline',
      layout: 'auto',
      vertex: {
        module: this.device.createShaderModule({ code: UpsampleCombineShader }),
        entryPoint: 'vsMain',
        buffers: [{
          arrayStride: 12,
          attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }]
        }]
      },
      fragment: {
        module: this.device.createShaderModule({ code: UpsampleCombineShader }),
        entryPoint: 'fsMain',
        targets: [{ format: 'rgba16float' }]
      },
      primitive: { topology: 'triangle-list' }
    });
    
    // Composite pipeline
    this.compositePipeline = this.device.createRenderPipeline({
      label: 'Bloom Composite Pipeline',
      layout: 'auto',
      vertex: {
        module: this.device.createShaderModule({ code: CompositeShader }),
        entryPoint: 'vsMain',
        buffers: [{
          arrayStride: 12,
          attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }]
        }]
      },
      fragment: {
        module: this.device.createShaderModule({ code: CompositeShader }),
        entryPoint: 'fsMain',
        targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }]  // Output to screen format
      },
      primitive: { topology: 'triangle-list' }
    });
  }
  
  /**
   * Create bloom textures for each mip level
   */
  private createTextures(): void {
    // Clean up existing textures
    this.destroyTextures();
    
    const mipSizes = [
      { w: Math.max(1, Math.floor(this.width / 2)), h: Math.max(1, Math.floor(this.height / 2)) },
      { w: Math.max(1, Math.floor(this.width / 4)), h: Math.max(1, Math.floor(this.height / 4)) },
      { w: Math.max(1, Math.floor(this.width / 8)), h: Math.max(1, Math.floor(this.height / 8)) }
    ];
    
    for (let i = 0; i < BLOOM_MIP_LEVELS; i++) {
      // Main bloom texture for this mip level
      const texture = this.device.createTexture({
        label: `Bloom Texture Mip ${i}`,
        size: [mipSizes[i].w, mipSizes[i].h, 1],
        format: 'rgba16float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
      });
      
      this.bloomTextures.push(texture);
      this.bloomTextureViews.push(texture.createView());
      
      // Temporary texture for blur ping-pong
      const tempTexture = this.device.createTexture({
        label: `Bloom Temp Texture Mip ${i}`,
        size: [mipSizes[i].w, mipSizes[i].h, 1],
        format: 'rgba16float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
      });
      
      this.blurTempTextures.push(tempTexture);
      this.blurTempTextureViews.push(tempTexture.createView());
    }
  }
  
  /**
   * Create uniform buffers for each pass
   */
  private createUniformBuffers(): void {
    // Threshold uniform buffer (16 bytes aligned)
    this.thresholdUniformBuffer = this.device.createBuffer({
      label: 'Bloom Threshold Uniforms',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    
    // Blur uniform buffers (one per mip level)
    this.blurUniformBuffers = [];
    for (let i = 0; i < BLOOM_MIP_LEVELS; i++) {
      const buffer = this.device.createBuffer({
        label: `Bloom Blur Uniforms Mip ${i}`,
        size: 16,  // vec2 texelSize + float mipLevel + padding
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      this.blurUniformBuffers.push(buffer);
    }
    
    // Upsample uniform buffers (one per mip level pair)
    this.upsampleUniformBuffers = [];
    for (let i = 0; i < BLOOM_MIP_LEVELS; i++) {
      const buffer = this.device.createBuffer({
        label: `Bloom Upsample Uniforms Mip ${i}`,
        size: 16,  // float scatter + intensity + clamp + mipLevel
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      this.upsampleUniformBuffers.push(buffer);
    }
    
    // Composite uniform buffer
    this.compositeUniformBuffer = this.device.createBuffer({
      label: 'Bloom Composite Uniforms',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    
    this.updateUniforms();
  }
  
  /**
   * Update all uniform values
   */
  private updateUniforms(): void {
    // Threshold uniforms: threshold, knee, intensity, scatter
    if(!this._thresholdData) this._thresholdData = new Float32Array(4);
    this._thresholdData.set([
      this.params.threshold,
      this.params.knee,
      this.params.intensity,
      this.params.scatter
    ]);
    this.device.queue.writeBuffer(this.thresholdUniformBuffer, 0, this._thresholdData);
    
    // Blur uniforms: texelSize (vec2), mipLevel (f32), padding (f32)
    const mipSizes = [
      { w: Math.max(1, Math.floor(this.width / 2)), h: Math.max(1, Math.floor(this.height / 2)) },
      { w: Math.max(1, Math.floor(this.width / 4)), h: Math.max(1, Math.floor(this.height / 4)) },
      { w: Math.max(1, Math.floor(this.width / 8)), h: Math.max(1, Math.floor(this.height / 8)) }
    ];
    
    for (let i = 0; i < BLOOM_MIP_LEVELS; i++) {
      if(!this._blurData) this._blurData = new Float32Array(4);
      this._blurData.set([
        1.0 / mipSizes[i].w,
        1.0 / mipSizes[i].h,
        i,
        0.0  // padding
      ]);
      this.device.queue.writeBuffer(this.blurUniformBuffers[i], 0, this._blurData);
    }
    
    // Upsample uniforms: scatter, intensity, clamp, mipLevel
    for (let i = 0; i < BLOOM_MIP_LEVELS; i++) {
      if(!this._upsampleData) this._upsampleData = new Float32Array(4);
      this._upsampleData.set([
        this.params.scatter,
        this.params.intensity,
        this.params.clamp,
        i
      ]);
      this.device.queue.writeBuffer(this.upsampleUniformBuffers[i], 0, this._upsampleData);
    }
    
    // Composite uniforms: intensity, clamp, padding x2
    if(!this._compositeData) this._compositeData = new Float32Array(4);
    this._compositeData.set([
      this.params.intensity,
      this.params.clamp,
      0.0,
      0.0
    ]);
    this.device.queue.writeBuffer(this.compositeUniformBuffer, 0, this._compositeData);
  }
  
  /**
   * Update bind groups after textures or uniform buffers change
   */
  private updateBindGroups(): void {
    // Note: Threshold bind group depends on input texture, created per-frame
    // Downsample bind groups depend on source texture, created per-frame
    // Blur bind groups depend on source texture, created per-frame
    // Upsample bind groups depend on textures, created per-frame
    // Composite bind group depends on input textures, created per-frame
  }
  
  /**
   * Extract bright pixels above threshold
   */
  threshold(inputTextureView: GPUTextureView, commandEncoder: GPUCommandEncoder): void {
    // Create threshold bind group with input texture
    const thresholdBindGroup = this.device.createBindGroup({
      label: 'Bloom Threshold Bind Group',
      layout: this.thresholdPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.thresholdUniformBuffer } },
        { binding: 1, resource: inputTextureView },
        { binding: 2, resource: this.linearSampler }
      ]
    });
    
    const passEncoder = commandEncoder.beginRenderPass({
      label: 'Bloom Threshold Pass',
      colorAttachments: [{
        view: this.bloomTextureViews[0],
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 0 }
      }]
    });
    
    passEncoder.setPipeline(this.thresholdPipeline);
    passEncoder.setBindGroup(0, thresholdBindGroup);
    passEncoder.setVertexBuffer(0, this.vertexBuffer);
    passEncoder.draw(6);
    passEncoder.end();
  }
  
  /**
   * Downsample to lower resolutions
   */
  downsample(commandEncoder: GPUCommandEncoder): void {
    // Downsample from mip 0 -> 1, 1 -> 2
    for (let i = 1; i < BLOOM_MIP_LEVELS; i++) {
      const srcView = this.bloomTextureViews[i - 1];
      const dstView = this.bloomTextureViews[i];
      
      const bindGroup = this.device.createBindGroup({
        label: `Bloom Downsample Bind Group Mip ${i}`,
        layout: this.downsamplePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: srcView },
          { binding: 1, resource: this.linearSampler }
        ]
      });
      
      const passEncoder = commandEncoder.beginRenderPass({
        label: `Bloom Downsample Pass Mip ${i}`,
        colorAttachments: [{
          view: dstView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 }
        }]
      });
      
      passEncoder.setPipeline(this.downsamplePipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.setVertexBuffer(0, this.vertexBuffer);
      passEncoder.draw(6);
      passEncoder.end();
    }
  }
  
  /**
   * Blur each mip level (separable gaussian)
   */
  blur(commandEncoder: GPUCommandEncoder): void {
    for (let i = 0; i < BLOOM_MIP_LEVELS; i++) {
      // Horizontal blur: bloomTexture[i] -> blurTempTexture[i]
      const horizontalBindGroup = this.device.createBindGroup({
        label: `Bloom Blur Horizontal Bind Group Mip ${i}`,
        layout: this.blurHorizontalPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.blurUniformBuffers[i] } },
          { binding: 1, resource: this.bloomTextureViews[i] },
          { binding: 2, resource: this.linearClampSampler }
        ]
      });
      
      const horizontalPass = commandEncoder.beginRenderPass({
        label: `Bloom Blur Horizontal Pass Mip ${i}`,
        colorAttachments: [{
          view: this.blurTempTextureViews[i],
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 }
        }]
      });
      
      horizontalPass.setPipeline(this.blurHorizontalPipeline);
      horizontalPass.setBindGroup(0, horizontalBindGroup);
      horizontalPass.setVertexBuffer(0, this.vertexBuffer);
      horizontalPass.draw(6);
      horizontalPass.end();
      
      // Vertical blur: blurTempTexture[i] -> bloomTexture[i]
      const verticalBindGroup = this.device.createBindGroup({
        label: `Bloom Blur Vertical Bind Group Mip ${i}`,
        layout: this.blurVerticalPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.blurUniformBuffers[i] } },
          { binding: 1, resource: this.blurTempTextureViews[i] },
          { binding: 2, resource: this.linearClampSampler }
        ]
      });
      
      const verticalPass = commandEncoder.beginRenderPass({
        label: `Bloom Blur Vertical Pass Mip ${i}`,
        colorAttachments: [{
          view: this.bloomTextureViews[i],
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 }
        }]
      });
      
      verticalPass.setPipeline(this.blurVerticalPipeline);
      verticalPass.setBindGroup(0, verticalBindGroup);
      verticalPass.setVertexBuffer(0, this.vertexBuffer);
      verticalPass.draw(6);
      verticalPass.end();
    }
  }
  
  /**
   * Upsample and combine mip levels
   * Starts from lowest resolution and works up
   */
  upsampleAndCombine(commandEncoder: GPUCommandEncoder): void {
    // Process from lowest mip (2) to highest (0)
    for (let i = BLOOM_MIP_LEVELS - 1; i > 0; i--) {
      const lowResView = this.bloomTextureViews[i];
      const highResView = this.bloomTextureViews[i - 1];
      const dstView = this.blurTempTextureViews[i - 1]; // Use temp as output
      
      const bindGroup = this.device.createBindGroup({
        label: `Bloom Upsample Bind Group Mip ${i}`,
        layout: this.upsampleCombinePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.upsampleUniformBuffers[i] } },
          { binding: 1, resource: lowResView },
          { binding: 2, resource: this.linearSampler },
          { binding: 3, resource: highResView },
          { binding: 4, resource: this.linearSampler }
        ]
      });
      
      const passEncoder = commandEncoder.beginRenderPass({
        label: `Bloom Upsample Pass Mip ${i}`,
        colorAttachments: [{
          view: dstView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 }
        }]
      });
      
      passEncoder.setPipeline(this.upsampleCombinePipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.setVertexBuffer(0, this.vertexBuffer);
      passEncoder.draw(6);
      passEncoder.end();
      
      // Copy result back to bloom texture for next iteration
      // Use a simple render pass to blit
      const blitBindGroup = this.device.createBindGroup({
        label: `Bloom Blit Bind Group Mip ${i - 1}`,
        layout: this.downsamplePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: dstView },
          { binding: 1, resource: this.linearSampler }
        ]
      });
      
      const blitPass = commandEncoder.beginRenderPass({
        label: `Bloom Blit Pass Mip ${i - 1}`,
        colorAttachments: [{
          view: highResView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 }
        }]
      });
      
      blitPass.setPipeline(this.downsamplePipeline);
      blitPass.setBindGroup(0, blitBindGroup);
      blitPass.setVertexBuffer(0, this.vertexBuffer);
      blitPass.draw(6);
      blitPass.end();
    }
  }
  
  /**
   * Composite bloom with original image
   */
  composite(
    originalTexture: GPUTextureView,
    outputTexture: GPUTextureView,
    commandEncoder: GPUCommandEncoder
  ): void {
    const bindGroup = this.device.createBindGroup({
      label: 'Bloom Composite Bind Group',
      layout: this.compositePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.compositeUniformBuffer } },
        { binding: 1, resource: originalTexture },
        { binding: 2, resource: this.linearSampler },
        { binding: 3, resource: this.bloomTextureViews[0] },
        { binding: 4, resource: this.linearSampler }
      ]
    });
    
    const passEncoder = commandEncoder.beginRenderPass({
      label: 'Bloom Composite Pass',
      colorAttachments: [{
        view: outputTexture,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 }
      }]
    });
    
    passEncoder.setPipeline(this.compositePipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.setVertexBuffer(0, this.vertexBuffer);
    passEncoder.draw(6);
    passEncoder.end();
  }
  
  /**
   * Execute the complete bloom pipeline
   * Convenience method that runs all passes in sequence
   */
  render(
    inputTexture: GPUTextureView,
    outputTexture: GPUTextureView,
    commandEncoder: GPUCommandEncoder
  ): void {
    // 1. Extract bright pixels
    this.threshold(inputTexture, commandEncoder);
    
    // 2. Downsample to create mip pyramid
    this.downsample(commandEncoder);
    
    // 3. Blur each mip level
    this.blur(commandEncoder);
    
    // 4. Upsample and combine
    this.upsampleAndCombine(commandEncoder);
    
    // 5. Composite with original
    this.composite(inputTexture, outputTexture, commandEncoder);
  }
  
  /**
   * Set bloom parameters
   */
  setParameters(params: Partial<BloomParameters>): void {
    this.params = { ...this.params, ...params };
    this.updateUniforms();
  }
  
  /**
   * Get current bloom parameters
   */
  getParameters(): BloomParameters {
    return { ...this.params };
  }
  
  /**
   * Resize textures when viewport changes.
   * Awaits GPU completion before destroying old textures to avoid
   * "destroyed texture used in submit" validation errors.
   */
  async resize(width: number, height: number): Promise<void> {
    this.width = width;
    this.height = height;

    await this.device.queue.onSubmittedWorkDone();

    // Recreate textures with new size
    this.createTextures();

    // Update uniform buffers with new texel sizes
    this.updateUniforms();
  }
  
  /**
   * Clean up textures
   */
  private destroyTextures(): void {
    for (const texture of this.bloomTextures) {
      texture.destroy();
    }
    this.bloomTextures = [];
    this.bloomTextureViews = [];
    
    for (const texture of this.blurTempTextures) {
      texture.destroy();
    }
    this.blurTempTextures = [];
    this.blurTempTextureViews = [];
  }
  
  /**
   * Clean up uniform buffers
   */
  private destroyUniformBuffers(): void {
    this.thresholdUniformBuffer?.destroy();
    
    for (const buffer of this.blurUniformBuffers) {
      buffer.destroy();
    }
    this.blurUniformBuffers = [];
    
    for (const buffer of this.upsampleUniformBuffers) {
      buffer.destroy();
    }
    this.upsampleUniformBuffers = [];
    
    this.compositeUniformBuffer?.destroy();
  }
  
  /**
   * Clean up all resources
   */
  destroy(): void {
    this.destroyTextures();
    this.destroyUniformBuffers();
    this.vertexBuffer?.destroy();
  }
}

export { DEFAULT_BLOOM_PARAMS };
