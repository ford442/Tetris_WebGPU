import type { GpuChoreRunner } from '../gpuChores/runner.js';

type PostProcessView = {
  useMultiPassBloom: boolean;
  bloomEnabled: boolean;
  _bloomInputTexture: GPUTexture | null;
  _ppPassDescriptor: GPURenderPassDescriptor;
  postProcessPipeline: GPURenderPipeline;
  postProcessBindGroup: GPUBindGroup;
  backgroundVertexBuffer: GPUBuffer;
  ctxWebGPU: GPUCanvasContext;
  bloomSystem: {
    render: (
      source: GPUTextureView,
      destination: GPUTextureView,
      commandEncoder: GPUCommandEncoder,
    ) => void;
  };
  canvasWebGPU: HTMLCanvasElement;
  recreateRenderTargets: () => void;
  hdrPlayfield?: boolean;
  /** Optional post/juice compute helpers; absent means the static tuning. */
  gpuChores?: Pick<GpuChoreRunner, 'encodeLumaScan'>;
};

type PassTimerLike = {
  beginRegion(
    encoder: GPUCommandEncoder | GPUComputePassEncoder | GPURenderPassEncoder,
    region: 'postProcess' | 'bloom',
  ): void;
  endRegion(
    encoder: GPUCommandEncoder | GPUComputePassEncoder | GPURenderPassEncoder,
    region: 'postProcess' | 'bloom',
  ): void;
};

export class PostProcessor {
  constructor(private readonly view: PostProcessView) {}

  resize(width: number, height: number) {
    this.view.canvasWebGPU.width = width;
    this.view.canvasWebGPU.height = height;
    this.view.recreateRenderTargets();
  }

  render(commandEncoder: GPUCommandEncoder, viewMatrix?: Float32Array, passTimers?: PassTimerLike) {
    if (viewMatrix) {
      void viewMatrix;
    }

    if ((this.view.useMultiPassBloom && this.view.bloomEnabled && this.view._bloomInputTexture)
      || (this.view.hdrPlayfield && this.view._bloomInputTexture)) {
      const ppColorAttachment0 = (this.view._ppPassDescriptor.colorAttachments as GPURenderPassColorAttachment[])[0];
      ppColorAttachment0.view = this.view._bloomInputTexture.createView();

      const ppPassEncoder = commandEncoder.beginRenderPass(this.view._ppPassDescriptor);
      passTimers?.beginRegion(ppPassEncoder, 'postProcess');
      ppPassEncoder.setPipeline(this.view.postProcessPipeline);
      ppPassEncoder.setBindGroup(0, this.view.postProcessBindGroup);
      ppPassEncoder.setVertexBuffer(0, this.view.backgroundVertexBuffer);
      ppPassEncoder.draw(6);
      passTimers?.endRegion(ppPassEncoder, 'postProcess');
      ppPassEncoder.end();

      const bloomInputView = this.view._bloomInputTexture.createView();

      // Measure the composited frame *before* bloom consumes it: the luma chore
      // is what the bloom threshold is derived from, so it has to see the same
      // pixels the threshold pass will. Read-only, self-throttled, and it
      // encodes into this same encoder — no second submit, no extra device.
      this.view.gpuChores?.encodeLumaScan(
        commandEncoder,
        bloomInputView,
        this.view._bloomInputTexture.width,
        this.view._bloomInputTexture.height,
      );

      const textureViewScreen = this.view.ctxWebGPU.getCurrentTexture().createView();
      passTimers?.beginRegion(commandEncoder, 'bloom');
      this.view.bloomSystem.render(
        bloomInputView,
        textureViewScreen,
        commandEncoder,
      );
      passTimers?.endRegion(commandEncoder, 'bloom');
      return;
    }

    const textureViewScreen = this.view.ctxWebGPU.getCurrentTexture().createView();
    const ppColorAttachment0 = (this.view._ppPassDescriptor.colorAttachments as GPURenderPassColorAttachment[])[0];
    ppColorAttachment0.view = textureViewScreen;

    const ppPassEncoder = commandEncoder.beginRenderPass(this.view._ppPassDescriptor);
    passTimers?.beginRegion(ppPassEncoder, 'postProcess');
    ppPassEncoder.setPipeline(this.view.postProcessPipeline);
    ppPassEncoder.setBindGroup(0, this.view.postProcessBindGroup);
    ppPassEncoder.setVertexBuffer(0, this.view.backgroundVertexBuffer);
    ppPassEncoder.draw(6);
    passTimers?.endRegion(ppPassEncoder, 'postProcess');
    ppPassEncoder.end();
  }
}
