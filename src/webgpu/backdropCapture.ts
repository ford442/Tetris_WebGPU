/**
 * Scene-backdrop capture for screen-space glass refraction.
 *
 * The block pipeline cannot sample the offscreen scene texture it is rendering
 * into, so after the background + frosted-glass passes we blit that texture into
 * a small, separate one. The glass path in `fragmentMain.wgsl` then samples it in
 * screen space, which is what makes the crystal bend the actual video portal /
 * procedural background instead of a painted-on gradient.
 *
 * The capture is deliberately a **fixed size**, not canvas-sized: block bind
 * groups are built once at init (200+ of them) and are never rebuilt on resize,
 * so the texture view bound at @binding(11) has to stay valid for the lifetime of
 * the device. Sampling is by normalized screen UV, so a fixed size resamples
 * correctly at any canvas aspect — and the downscale doubles as the cheap blur
 * that reads as glass thickness.
 */

/** Capture resolution — ~1/9 of 1080p, enough detail once refracted and blurred. */
export const BACKDROP_CAPTURE_WIDTH = 640;
export const BACKDROP_CAPTURE_HEIGHT = 360;

/**
 * Always-renderable, always-filterable format. The scene target may be
 * `rg11b10ufloat` (HDR playfield); the capture does not need that range because
 * it only feeds a tinted refraction mix.
 */
export const BACKDROP_CAPTURE_FORMAT: GPUTextureFormat = 'rgba8unorm';

const BLIT_WGSL = `
struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
  // Fullscreen triangle — one less vertex than a quad, no seam down the middle.
  var pos = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out : VertexOutput;
  let p = pos[vertexIndex];
  out.position = vec4f(p, 0.0, 1.0);
  out.uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return out;
}

@group(0) @binding(0) var srcTexture : texture_2d<f32>;
@group(0) @binding(1) var srcSampler : sampler;
@group(0) @binding(2) var<uniform> texelStep : vec4f;

@fragment
fn fragmentMain(@location(0) uv : vec2f) -> @location(0) vec4f {
  // 4-tap box around the destination texel: a single bilinear tap aliases badly
  // when downscaling 1080p to 640x360, and the extra taps cost nothing at this size.
  let o = texelStep.xy;
  return (textureSample(srcTexture, srcSampler, uv + vec2f(-o.x, -o.y))
        + textureSample(srcTexture, srcSampler, uv + vec2f( o.x, -o.y))
        + textureSample(srcTexture, srcSampler, uv + vec2f(-o.x,  o.y))
        + textureSample(srcTexture, srcSampler, uv + vec2f( o.x,  o.y))) * 0.25;
}
`;

/**
 * Owns the capture texture and the blit pipeline that fills it.
 * One instance per device; recreated by the device-loss recovery path along with
 * every other GPU resource.
 */
export class BackdropCapture {
  readonly texture: GPUTexture;
  readonly textureView: GPUTextureView;
  readonly sampler: GPUSampler;

  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly blitSampler: GPUSampler;
  private readonly texelStepBuffer: GPUBuffer;
  private readonly passDescriptor: GPURenderPassDescriptor;
  /** Bind group keyed by source view — the scene view changes on every resize. */
  private cachedSourceView: GPUTextureView | null = null;
  private cachedBindGroup: GPUBindGroup | null = null;
  private lastSourceWidth = -1;
  private lastSourceHeight = -1;

  constructor(device: GPUDevice) {
    this.device = device;

    this.texture = device.createTexture({
      label: 'backdrop-capture',
      size: [BACKDROP_CAPTURE_WIDTH, BACKDROP_CAPTURE_HEIGHT, 1],
      format: BACKDROP_CAPTURE_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.textureView = this.texture.createView();

    // Clamp so a refraction offset that walks off-screen repeats the edge pixel
    // rather than wrapping the background around to the other side of the board.
    this.sampler = device.createSampler({
      label: 'backdrop-capture-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    this.blitSampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    this.texelStepBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const module = device.createShaderModule({ label: 'backdrop-capture-blit', code: BLIT_WGSL });
    this.pipeline = device.createRenderPipeline({
      label: 'backdrop-capture-blit',
      layout: 'auto',
      vertex: { module, entryPoint: 'vertexMain' },
      fragment: {
        module,
        entryPoint: 'fragmentMain',
        targets: [{ format: BACKDROP_CAPTURE_FORMAT }],
      },
      primitive: { topology: 'triangle-list' },
    });

    this.passDescriptor = {
      label: 'backdrop-capture-pass',
      colorAttachments: [{
        view: this.textureView,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    };
  }

  /**
   * Blit the current scene colour into the capture texture.
   * Call after the background + frosted-glass passes and before the main pass.
   *
   * `sourceWidth/Height` are the scene texture's dimensions, used only to size
   * the box-filter taps.
   */
  capture(
    commandEncoder: GPUCommandEncoder,
    sourceView: GPUTextureView,
    sourceWidth: number,
    sourceHeight: number,
  ): void {
    if (this.cachedSourceView !== sourceView || !this.cachedBindGroup) {
      this.cachedBindGroup = this.device.createBindGroup({
        label: 'backdrop-capture-bindgroup',
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sourceView },
          { binding: 1, resource: this.blitSampler },
          { binding: 2, resource: { buffer: this.texelStepBuffer } },
        ],
      });
      this.cachedSourceView = sourceView;
    }

    // Half a source texel in each direction; only rewritten when the size changes.
    if (sourceWidth !== this.lastSourceWidth || sourceHeight !== this.lastSourceHeight) {
      this.device.queue.writeBuffer(
        this.texelStepBuffer,
        0,
        new Float32Array([
          sourceWidth > 0 ? 0.5 / sourceWidth : 0,
          sourceHeight > 0 ? 0.5 / sourceHeight : 0,
          0,
          0,
        ]),
      );
      this.lastSourceWidth = sourceWidth;
      this.lastSourceHeight = sourceHeight;
    }

    const pass = commandEncoder.beginRenderPass(this.passDescriptor);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.cachedBindGroup);
    pass.draw(3);
    pass.end();
  }

  destroy(): void {
    this.texture.destroy();
    this.texelStepBuffer.destroy();
    this.cachedBindGroup = null;
    this.cachedSourceView = null;
  }
}
