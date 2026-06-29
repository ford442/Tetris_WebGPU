import * as Matrix from 'gl-matrix';
import { renderPlayfieldBlocks, renderPlayfieldBorder } from '../viewPlayfield.js';

type BlockView = {
  device: GPUDevice;
  blockTexture: GPUTexture;
  currentTheme: any;
  visualEffects: any;
  visualX: number;
  visualY: number;
  vpMatrix: Float32Array | Matrix.mat4;
  uniformBindGroup_CACHE: GPUBindGroup[];
  uniformBindGroup_ARRAY: GPUBindGroup[];
  vertexUniformBuffer: GPUBuffer;
  _uniformBatchBuffer: Float32Array;
  _f32_3: Float32Array;
  _f32_4: Float32Array;
  MODELMATRIX: Matrix.mat4;
  NORMALMATRIX: Matrix.mat4;
  pipeline: GPURenderPipeline;
  fragmentUniformBuffer: GPUBuffer;
  blockSampler: GPUSampler;
  numberOfVertices: number;
  vertexBuffer: GPUBuffer;
  normalBuffer: GPUBuffer;
  uvBuffer: GPUBuffer;
  uniformBindGroup_ARRAY_border: GPUBindGroup[];
  vertexUniformBuffer_border: GPUBuffer;
  dissolveBuffer: GPUBuffer;
  fresnelParamsUniform: GPUBuffer;
};

export class BlockRenderer {
  constructor(private readonly view: BlockView) {}

  updateUniforms(state: any) {
    if (!this.view.device || !this.view.blockTexture) return;
    renderPlayfieldBlocks(
      this.view.device, state, this.view.currentTheme, this.view.visualEffects,
      this.view.visualX, this.view.visualY, this.view.vpMatrix as Float32Array,
      this.view.uniformBindGroup_CACHE, this.view.uniformBindGroup_ARRAY,
      this.view.vertexUniformBuffer, this.view._uniformBatchBuffer,
      this.view._f32_3, this.view._f32_4, this.view.MODELMATRIX, this.view.NORMALMATRIX,
    );
  }

  refreshBorder() {
    if (!this.view.device) return;
    const result = renderPlayfieldBorder(
      this.view.device, this.view.pipeline, this.view.fragmentUniformBuffer,
      this.view.blockTexture, this.view.blockSampler,
      this.view.vpMatrix as Float32Array, this.view.currentTheme,
      this.view._f32_3, this.view._f32_4, this.view.MODELMATRIX, this.view.NORMALMATRIX,
      this.view.dissolveBuffer, this.view.fresnelParamsUniform,
    );
    this.view.vertexUniformBuffer_border = result.vertexUniformBuffer;
    this.view.uniformBindGroup_ARRAY_border = result.bindGroups;
  }

  draw(passEncoder: GPURenderPassEncoder) {
    passEncoder.setPipeline(this.view.pipeline);
    passEncoder.setVertexBuffer(0, this.view.vertexBuffer);
    passEncoder.setVertexBuffer(1, this.view.normalBuffer);
    passEncoder.setVertexBuffer(2, this.view.uvBuffer);

    for (let index = 0; index < this.view.uniformBindGroup_ARRAY_border.length; index++) {
      passEncoder.setBindGroup(0, this.view.uniformBindGroup_ARRAY_border[index]);
      passEncoder.draw(this.view.numberOfVertices);
    }

    for (let index = 0; index < this.view.uniformBindGroup_ARRAY.length; index++) {
      passEncoder.setBindGroup(0, this.view.uniformBindGroup_ARRAY[index]);
      passEncoder.draw(this.view.numberOfVertices);
    }
  }
}
