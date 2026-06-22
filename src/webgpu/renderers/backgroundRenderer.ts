type BackgroundView = {
  backgroundPipeline: GPURenderPipeline;
  videoBackgroundPipeline: GPURenderPipeline;
  backgroundVertexBuffer: GPUBuffer;
  backgroundBindGroup: GPUBindGroup;
  backgroundUniformBuffer: GPUBuffer;
  videoCoverScaleUniformBuffer: GPUBuffer;
  sampler: GPUSampler;
  useReactiveVideo: boolean;
  device: GPUDevice;
  canvasWebGPU: HTMLCanvasElement;
  reactiveVideoBackground?: { videoElement?: HTMLVideoElement };
};

export class BackgroundRenderer {
  constructor(private readonly view: BackgroundView) {}

  setThemeColors(backgroundColors: [number, number, number][]) {
    const color = new Float32Array(3);
    color.set(backgroundColors[0]);
    this.view.device.queue.writeBuffer(this.view.backgroundUniformBuffer, 16, color);
    color.set(backgroundColors[1]);
    this.view.device.queue.writeBuffer(this.view.backgroundUniformBuffer, 32, color);
    color.set(backgroundColors[2]);
    this.view.device.queue.writeBuffer(this.view.backgroundUniformBuffer, 48, color);
  }

  draw(passEncoder: GPURenderPassEncoder, isVideoPlaying: boolean, videoTexture: GPUExternalTexture | null) {
    if (isVideoPlaying && videoTexture && this.view.useReactiveVideo) {
      this.updateCoverScale();
      passEncoder.setPipeline(this.view.videoBackgroundPipeline);
      passEncoder.setVertexBuffer(0, this.view.backgroundVertexBuffer);
      passEncoder.setBindGroup(0, this.createVideoBindGroup(videoTexture));
      passEncoder.draw(6);
      return;
    }

    passEncoder.setPipeline(this.view.backgroundPipeline);
    passEncoder.setVertexBuffer(0, this.view.backgroundVertexBuffer);
    passEncoder.setBindGroup(0, this.view.backgroundBindGroup);
    passEncoder.draw(6);
  }

  /** Computes an object-fit:cover UV scale so the video fills the canvas without stretching. */
  private updateCoverScale() {
    const video = this.view.reactiveVideoBackground?.videoElement;
    const videoWidth = video?.videoWidth || 0;
    const videoHeight = video?.videoHeight || 0;
    if (!videoWidth || !videoHeight) return;

    const canvasAspect = this.view.canvasWebGPU.width / this.view.canvasWebGPU.height;
    const videoAspect = videoWidth / videoHeight;
    const ratio = canvasAspect / videoAspect;

    const scaleX = ratio >= 1 ? 1 : ratio;
    const scaleY = ratio >= 1 ? 1 / ratio : 1;

    this.view.device.queue.writeBuffer(this.view.videoCoverScaleUniformBuffer, 0, new Float32Array([scaleX, scaleY, 0, 0]));
  }

  private createVideoBindGroup(videoTexture: GPUExternalTexture): GPUBindGroup {
    return this.view.device.createBindGroup({
      layout: this.view.videoBackgroundPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.view.sampler },
        { binding: 1, resource: videoTexture },
        { binding: 2, resource: { buffer: this.view.videoCoverScaleUniformBuffer } },
      ],
    });
  }
}
