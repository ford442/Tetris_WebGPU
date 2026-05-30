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
};

export class PostProcessor {
  constructor(private readonly view: PostProcessView) {}

  resize(width: number, height: number) {
    this.view.canvasWebGPU.width = width;
    this.view.canvasWebGPU.height = height;
    this.view.recreateRenderTargets();
  }

  render(commandEncoder: GPUCommandEncoder, viewMatrix?: Float32Array) {
    if (viewMatrix) {
      void viewMatrix;
    }

    if (this.view.useMultiPassBloom && this.view.bloomEnabled && this.view._bloomInputTexture) {
      const ppColorAttachment0 = (this.view._ppPassDescriptor.colorAttachments as GPURenderPassColorAttachment[])[0];
      ppColorAttachment0.view = this.view._bloomInputTexture.createView();

      const ppPassEncoder = commandEncoder.beginRenderPass(this.view._ppPassDescriptor);
      ppPassEncoder.setPipeline(this.view.postProcessPipeline);
      ppPassEncoder.setBindGroup(0, this.view.postProcessBindGroup);
      ppPassEncoder.setVertexBuffer(0, this.view.backgroundVertexBuffer);
      ppPassEncoder.draw(6);
      ppPassEncoder.end();

      const textureViewScreen = this.view.ctxWebGPU.getCurrentTexture().createView();
      this.view.bloomSystem.render(
        this.view._bloomInputTexture.createView(),
        textureViewScreen,
        commandEncoder,
      );
      return;
    }

    const textureViewScreen = this.view.ctxWebGPU.getCurrentTexture().createView();
    const ppColorAttachment0 = (this.view._ppPassDescriptor.colorAttachments as GPURenderPassColorAttachment[])[0];
    ppColorAttachment0.view = textureViewScreen;

    const ppPassEncoder = commandEncoder.beginRenderPass(this.view._ppPassDescriptor);
    ppPassEncoder.setPipeline(this.view.postProcessPipeline);
    ppPassEncoder.setBindGroup(0, this.view.postProcessBindGroup);
    ppPassEncoder.setVertexBuffer(0, this.view.backgroundVertexBuffer);
    ppPassEncoder.draw(6);
    ppPassEncoder.end();
  }
}
