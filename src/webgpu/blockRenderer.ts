
import { GPUContext } from './gpuContext';
import { CubeData } from './geometry';
import { getBlockShader } from './shaders';
import { GameState } from '../game';
import { ThemeColors } from './themes';
import * as Matrix from "gl-matrix";

const glMatrix = Matrix;

export class BlockRenderer {
    private device: GPUDevice;

    // Geometry
    private vertexBuffer!: GPUBuffer;
    private normalBuffer!: GPUBuffer;
    private uvBuffer!: GPUBuffer;
    private numberOfVertices!: number;

    // Pipelines and Layouts
    private pipeline!: GPURenderPipeline;
    private blockBindGroupLayout!: GPUBindGroupLayout;
    private pipelineCache: Map<string, GPURenderPipeline> = new Map();
    public currentBlockStyle: string = 'tech';

    // Uniform Buffers
    private vertexUniformBuffer!: GPUBuffer;
    private vertexUniformBuffer_border!: GPUBuffer;
    private fragmentUniformBuffer!: GPUBuffer;

    // Bind Groups
    private blockBindGroup!: GPUBindGroup;
    private borderBindGroup!: GPUBindGroup;

    // Data cache
    private borderCount: number = 0;
    private readonly MAX_BLOCKS = 250;
    private readonly BLOCK_UNIFORM_SIZE = 256;
    private blockUniformData: ArrayBuffer;
    private borderUniformData: ArrayBuffer;
    private MODELMATRIX: Matrix.mat4;
    private NORMALMATRIX: Matrix.mat4;


    constructor(private gpuContext: GPUContext, private offscreenTextureView: GPUTextureView, private sampler: GPUSampler) {
        this.device = gpuContext.device;
        this.blockUniformData = new ArrayBuffer(this.MAX_BLOCKS * this.BLOCK_UNIFORM_SIZE);
        this.borderUniformData = new ArrayBuffer(100 * this.BLOCK_UNIFORM_SIZE);
        this.MODELMATRIX = Matrix.mat4.create();
        this.NORMALMATRIX = Matrix.mat4.create();
    }

    public async initialize(currentTheme: ThemeColors): Promise<void> {
        const cubeData = CubeData();
        this.numberOfVertices = cubeData.positions.length / 3;
        this.vertexBuffer = this.createGPUBuffer(this.device, cubeData.positions);
        this.normalBuffer = this.createGPUBuffer(this.device, cubeData.normals);
        this.uvBuffer = this.createGPUBuffer(this.device, cubeData.uvs);

        this.blockBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 208 } },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
                { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } }
            ]
        });

        this.pipeline = await this._createMainPipeline(this.currentBlockStyle);
        this.pipelineCache.set(this.currentBlockStyle, this.pipeline);

        this.fragmentUniformBuffer = this.device.createBuffer({
            size: 96,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.createBorderBuffers(Matrix.mat4.create(), currentTheme);

        this.vertexUniformBuffer = this.device.createBuffer({
            size: this.MAX_BLOCKS * 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.blockBindGroup = this.device.createBindGroup({
            layout: this.blockBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.vertexUniformBuffer, offset: 0, size: 208 } },
                { binding: 1, resource: { buffer: this.fragmentUniformBuffer } },
                { binding: 2, resource: this.sampler },
                { binding: 3, resource: this.offscreenTextureView }
            ]
        });

        this.borderBindGroup = this.device.createBindGroup({
            layout: this.blockBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.vertexUniformBuffer_border, offset: 0, size: 208 } },
                { binding: 1, resource: { buffer: this.fragmentUniformBuffer } },
                { binding: 2, resource: this.sampler },
                { binding: 3, resource: this.offscreenTextureView }
            ]
        });
    }

    public draw(passEncoder: GPURenderPassEncoder, blockCount: number): void {
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setVertexBuffer(0, this.vertexBuffer);
        passEncoder.setVertexBuffer(1, this.normalBuffer);
        passEncoder.setVertexBuffer(2, this.uvBuffer);

        let borderOffset = 0;
        for (let i = 0; i < this.borderCount; i++) {
            passEncoder.setBindGroup(0, this.borderBindGroup, [borderOffset]);
            passEncoder.draw(this.numberOfVertices);
            borderOffset += 256;
        }

        let blockOffset = 0;
        for (let i = 0; i < blockCount; i++) {
            passEncoder.setBindGroup(0, this.blockBindGroup, [blockOffset]);
            passEncoder.draw(this.numberOfVertices);
            blockOffset += 256;
        }
    }

    public updateBlockUniforms(state: GameState, vpMatrix: Matrix.mat4, currentTheme: ThemeColors): number {
        if (!this.device) return 0;

        let blockIndex = 0;
        const { playfield } = state;
        const playfield_length = playfield.length;

        const floatView = new Float32Array(this.blockUniformData);

        for (let row = 0; row < playfield_length; row++) {
          for (let colom = 0; colom < playfield[row].length; colom++) {
            if (!playfield[row][colom]) continue;
            if (blockIndex >= this.MAX_BLOCKS) break;

            let value = playfield[row][colom];
            let colorBlockindex = Math.abs(value);
            let alpha = value < 0 ? 0.3 : 0.85;

            let color = currentTheme[colorBlockindex];
            if (!color) color = currentTheme[0];

            const offsetFloats = blockIndex * 64;

            Matrix.mat4.identity(this.MODELMATRIX);
            Matrix.mat4.translate(this.MODELMATRIX, this.MODELMATRIX, [colom * 2.2, row * -2.2, 0.0]);

            Matrix.mat4.identity(this.NORMALMATRIX);
            Matrix.mat4.invert(this.NORMALMATRIX, this.MODELMATRIX);
            Matrix.mat4.transpose(this.NORMALMATRIX, this.NORMALMATRIX);

            floatView.set(vpMatrix, offsetFloats + 0);
            floatView.set(this.MODELMATRIX, offsetFloats + 16);
            floatView.set(this.NORMALMATRIX, offsetFloats + 32);

            floatView[offsetFloats + 48] = color[0];
            floatView[offsetFloats + 49] = color[1];
            floatView[offsetFloats + 50] = color[2];
            floatView[offsetFloats + 51] = alpha;

            blockIndex++;
          }
        }

        if (blockIndex > 0) {
            this.device.queue.writeBuffer(
                this.vertexUniformBuffer,
                0,
                this.blockUniformData,
                0,
                blockIndex * 256
            );
        }

        return blockIndex;
    }

    public updateFragmentUniforms(time: number, eyePosition: Float32Array, state: GameState, canvasWidth: number, canvasHeight: number) {
        let lockPercent = 0.0;
        if (state && (state as any).lockTimer !== undefined && (state as any).lockDelayTime > 0) {
            lockPercent = (state as any).lockTimer / (state as any).lockDelayTime;
        }

        const lightPosition = new Float32Array([-5.0, 0.0, 0.0]);
        this.device.queue.writeBuffer(this.fragmentUniformBuffer, 0, lightPosition);
        this.device.queue.writeBuffer(this.fragmentUniformBuffer, 16, eyePosition);
        this.device.queue.writeBuffer(this.fragmentUniformBuffer, 48, new Float32Array([time]));
        this.device.queue.writeBuffer(this.fragmentUniformBuffer, 56, new Float32Array([lockPercent]));

        const w = Math.max(1.0, canvasWidth);
        const h = Math.max(1.0, canvasHeight);
        this.device.queue.writeBuffer(this.fragmentUniformBuffer, 64, new Float32Array([w, h]));
    }

    public setTheme(currentTheme: ThemeColors) {
        const color = new Float32Array([...currentTheme.border, 0.5]);
        const view = new Float32Array(this.borderUniformData);

        for (let i = 0; i < this.borderCount; i++) {
             const offsetFloats = (i * 256 + 192) / 4;
             view.set(color, offsetFloats);
        }
        this.device.queue.writeBuffer(this.vertexUniformBuffer_border, 0, this.borderUniformData, 0, this.borderCount * 256);
    }

    public resize(offscreenTextureView: GPUTextureView) {
        this.offscreenTextureView = offscreenTextureView;
        this.blockBindGroup = this.device.createBindGroup({
            layout: this.blockBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.vertexUniformBuffer, offset: 0, size: 208 } },
                { binding: 1, resource: { buffer: this.fragmentUniformBuffer } },
                { binding: 2, resource: this.sampler },
                { binding: 3, resource: this.offscreenTextureView }
            ]
        });
        this.borderBindGroup = this.device.createBindGroup({
            layout: this.blockBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.vertexUniformBuffer_border, offset: 0, size: 208 } },
                { binding: 1, resource: { buffer: this.fragmentUniformBuffer } },
                { binding: 2, resource: this.sampler },
                { binding: 3, resource: this.offscreenTextureView }
            ]
        });
    }

    private async _createMainPipeline(style: string): Promise<GPURenderPipeline> {
        const shader = getBlockShader(style);
        return this.device.createRenderPipelineAsync({
            label: `main pipeline [${style}]`,
            layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.blockBindGroupLayout] }),
            vertex: {
                module: this.device.createShaderModule({ code: shader.vertex }),
                entryPoint: "main",
                buffers: [
                    { arrayStride: 12, attributes: [{ shaderLocation: 0, format: "float32x3", offset: 0 }] },
                    { arrayStride: 12, attributes: [{ shaderLocation: 1, format: "float32x3", offset: 0 }] },
                    { arrayStride: 8,  attributes: [{ shaderLocation: 2, format: "float32x2", offset: 0 }] },
                ],
            },
            fragment: {
                module: this.device.createShaderModule({ code: shader.fragment }),
                entryPoint: "main",
                targets: [
                    {
                        format: 'rgba16float',
                        blend: {
                            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
                            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
                        },
                    }
                ],
            },
            primitive: { topology: "triangle-list" },
            depthStencil: {
                format: "depth24plus",
                depthWriteEnabled: true,
                depthCompare: "less",
            },
            multisample: {
                count: 4,
            },
        });
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

      private createBorderBuffers(vpMatrix: Matrix.mat4, currentTheme: ThemeColors) {
        const state_Border = {
          playfield: [
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
          ],
        };

        const vertexUniformSizeBuffer = 256 * 100;

        this.vertexUniformBuffer_border = this.device.createBuffer({
          size: vertexUniformSizeBuffer,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const floatView = new Float32Array(this.borderUniformData);
        let borderIndex = 0;

        for (let row = 0; row < state_Border.playfield.length; row++) {
          for (let colom = 0; colom < state_Border.playfield[row].length; colom++) {
            if (!state_Border.playfield[row][colom]) continue;

            Matrix.mat4.identity(this.MODELMATRIX);
            Matrix.mat4.translate(this.MODELMATRIX, this.MODELMATRIX, [colom * 2.2 - 2.2, row * -2.2 + 2.2, 0.0]);

            Matrix.mat4.identity(this.NORMALMATRIX);
            Matrix.mat4.invert(this.NORMALMATRIX, this.MODELMATRIX);
            Matrix.mat4.transpose(this.NORMALMATRIX, this.NORMALMATRIX);

            const offsetFloats = borderIndex * 64;
            floatView.set(vpMatrix, offsetFloats + 0);
            floatView.set(this.MODELMATRIX, offsetFloats + 16);
            floatView.set(this.NORMALMATRIX, offsetFloats + 32);

            const color = [...currentTheme.border, 0.5];
            floatView[offsetFloats + 48] = color[0];
            floatView[offsetFloats + 49] = color[1];
            floatView[offsetFloats + 50] = color[2];
            floatView[offsetFloats + 51] = 0.5;

            borderIndex++;
          }
        }

        this.borderCount = borderIndex;
        this.device.queue.writeBuffer(this.vertexUniformBuffer_border, 0, this.borderUniformData, 0, borderIndex * 256);
      }

      public async setBlockStyle(style: 'tech' | 'glass') {
        if (this.currentBlockStyle === style || !this.device) {
          return;
        }

        const cachedPipeline = this.pipelineCache.get(style);
        if (cachedPipeline) {
          this.pipeline = cachedPipeline;
          this.currentBlockStyle = style;
          console.log(`Switched to cached block style: ${style}`);
          return;
        }

        console.log(`Creating new pipeline for block style: ${style}`);
        const newPipeline = await this._createMainPipeline(style);

        this.pipeline = newPipeline;
        this.pipelineCache.set(style, newPipeline);
        this.currentBlockStyle = style;
      }
}
