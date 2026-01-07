
import { GPUContext } from './gpuContext';
import { FullScreenQuadData } from './geometry';
import { PostProcessShaders } from './shaders';

export class PostProcessor {
    private device: GPUDevice;
    private presentationFormat: GPUTextureFormat;

    // Post Processing
    private postProcessPipeline!: GPURenderPipeline;
    private postProcessBindGroup!: GPUBindGroup;
    public postProcessUniformBuffer!: GPUBuffer;
    public offscreenTexture!: GPUTexture;
    public msaaTexture!: GPUTexture;
    public depthTexture!: GPUTexture;
    public sampler!: GPUSampler;

    private quadVertexBuffer!: GPUBuffer;

    constructor(private gpuContext: GPUContext) {
        this.device = gpuContext.device;
        this.presentationFormat = gpuContext.presentationFormat;
    }

    public async initialize(): Promise<void> {
        const quadData = FullScreenQuadData();
        this.quadVertexBuffer = this.createGPUBuffer(this.device, quadData.positions);

        await this.createPostProcessPipeline();

        this.postProcessUniformBuffer = this.device.createBuffer({
            size: 80,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.sampler = this.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
        });

        this.resize(this.gpuContext.canvas.width, this.gpuContext.canvas.height);
    }

    private async createPostProcessPipeline() {
        const ppShader = PostProcessShaders();
        this.postProcessPipeline = await this.device.createRenderPipelineAsync({
            label: 'post process pipeline',
            layout: 'auto',
            vertex: {
                module: this.device.createShaderModule({ code: ppShader.vertex }),
                entryPoint: 'main',
                buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }] }]
            },
            fragment: {
                module: this.device.createShaderModule({ code: ppShader.fragment }),
                entryPoint: 'main',
                targets: [{ format: this.presentationFormat }]
            },
            primitive: { topology: 'triangle-list' }
        });
    }

    public resize(width: number, height: number): void {
        if (this.offscreenTexture) this.offscreenTexture.destroy();
        this.offscreenTexture = this.device.createTexture({
            size: [width, height, 1],
            format: 'rgba16float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });

        if (this.msaaTexture) this.msaaTexture.destroy();
        this.msaaTexture = this.device.createTexture({
            size: [width, height, 1],
            sampleCount: 4,
            format: 'rgba16float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        if (this.depthTexture) this.depthTexture.destroy();
        this.depthTexture = this.device.createTexture({
            size: [width, height, 1],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
            sampleCount: 4,
        });

        this.postProcessBindGroup = this.device.createBindGroup({
            layout: this.postProcessPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.postProcessUniformBuffer } },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: this.offscreenTexture.createView() }
            ]
        });
    }

    public draw(commandEncoder: GPUCommandEncoder): void {
        const textureViewScreen = this.gpuContext.context.getCurrentTexture().createView();
        const ppPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [{
                view: textureViewScreen,
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        };

        const ppPassEncoder = commandEncoder.beginRenderPass(ppPassDescriptor);
        ppPassEncoder.setPipeline(this.postProcessPipeline);
        ppPassEncoder.setBindGroup(0, this.postProcessBindGroup);
        ppPassEncoder.setVertexBuffer(0, this.quadVertexBuffer);
        ppPassEncoder.draw(6);
        ppPassEncoder.end();
    }

    private createGPUBuffer = (
        device: any,
        data: any,
        usageFlag = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
      ) => {
        const buffer = device.createBuffer({
          size: data.byteLength,
          usage: usageFlag,
          mappedAtCreation: true,
        });
        new Float32Array(buffer.getMappedRange()).set(data);
        buffer.unmap();
        return buffer;
      };
}
