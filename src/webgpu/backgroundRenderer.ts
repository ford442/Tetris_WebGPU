
import { GPUContext } from './gpuContext';
import { FullScreenQuadData } from './geometry';
import { BackgroundShaders, VideoBackgroundShader } from './shaders';
import { ThemeColors } from './themes';
import { GameState } from '../game';
import { VisualEffects } from './effects';

export class BackgroundRenderer {
    private device: GPUDevice;
    private presentationFormat: GPUTextureFormat;

    // Background specific
    private backgroundPipeline!: GPURenderPipeline;
    private backgroundVertexBuffer!: GPUBuffer;
    public backgroundUniformBuffer!: GPUBuffer;
    private backgroundBindGroup!: GPUBindGroup;

    // Video Background
    private videoPipeline!: GPURenderPipeline;
    public videoUniformBuffer!: GPUBuffer;
    private sampler!: GPUSampler;


    constructor(private gpuContext: GPUContext, private visualEffects: VisualEffects) {
        this.device = gpuContext.device;
        this.presentationFormat = gpuContext.presentationFormat;
        this.sampler = this.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
        });
    }

    public async initialize(currentTheme: ThemeColors): Promise<void> {
        const bgData = FullScreenQuadData();
        this.backgroundVertexBuffer = this.createGPUBuffer(this.device, bgData.positions);

        await this.createProceduralBackgroundPipeline();
        await this.createVideoBackgroundPipeline();

        this.backgroundUniformBuffer = this.device.createBuffer({
            size: 128,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.backgroundBindGroup = this.device.createBindGroup({
            layout: this.backgroundPipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: { buffer: this.backgroundUniformBuffer } }]
        });

        const bgColors = currentTheme.backgroundColors;
        this.device.queue.writeBuffer(this.backgroundUniformBuffer, 32, new Float32Array(bgColors[0]));
        this.device.queue.writeBuffer(this.backgroundUniformBuffer, 48, new Float32Array(bgColors[1]));
        this.device.queue.writeBuffer(this.backgroundUniformBuffer, 64, new Float32Array(bgColors[2]));

        this.videoUniformBuffer = this.device.createBuffer({
            size: 4096,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }

    private async createProceduralBackgroundPipeline() {
        const backgroundShader = BackgroundShaders();
        this.backgroundPipeline = await this.device.createRenderPipelineAsync({
            label: 'background pipeline',
            layout: 'auto',
            vertex: {
                module: this.device.createShaderModule({ code: backgroundShader.vertex }),
                entryPoint: 'main',
                buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }] }]
            },
            fragment: {
                module: this.device.createShaderModule({ code: backgroundShader.fragment }),
                entryPoint: 'main',
                targets: [{ format: 'rgba16float' }]
            },
            primitive: { topology: 'triangle-list' },
            multisample: { count: 4 },
            depthStencil: {
                format: "depth24plus",
                depthWriteEnabled: false,
                depthCompare: "always"
            }
        });
    }

    private async createVideoBackgroundPipeline() {
        const videoShader = VideoBackgroundShader();
        this.videoPipeline = await this.device.createRenderPipelineAsync({
            label: 'video pipeline',
            layout: 'auto',
            vertex: {
                module: this.device.createShaderModule({ code: videoShader.vertex }),
                entryPoint: 'main',
                buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }] }]
            },
            fragment: {
                module: this.device.createShaderModule({ code: videoShader.fragment }),
                entryPoint: 'main',
                targets: [{ format: 'rgba16float' }]
            },
            primitive: { topology: 'triangle-list' },
            multisample: { count: 4 },
            depthStencil: {
                format: "depth24plus",
                depthWriteEnabled: false,
                depthCompare: "always"
            }
        });
    }

    public draw(passEncoder: GPURenderPassEncoder): void {
        const renderVideo = this.visualEffects.isVideoPlaying;
        if (renderVideo && this.visualEffects.videoElement) {
            const externalTexture = this.device.importExternalTexture({
                source: this.visualEffects.videoElement
            });

            const videoBindGroup = this.device.createBindGroup({
                layout: this.videoPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: this.videoUniformBuffer } },
                    { binding: 1, resource: this.sampler },
                    { binding: 2, resource: externalTexture }
                ]
            });

            passEncoder.setPipeline(this.videoPipeline);
            passEncoder.setVertexBuffer(0, this.backgroundVertexBuffer);
            passEncoder.setBindGroup(0, videoBindGroup);
            passEncoder.draw(6);
        } else {
            passEncoder.setPipeline(this.backgroundPipeline);
            passEncoder.setVertexBuffer(0, this.backgroundVertexBuffer);
            passEncoder.setBindGroup(0, this.backgroundBindGroup);
            passEncoder.draw(6);
        }
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
