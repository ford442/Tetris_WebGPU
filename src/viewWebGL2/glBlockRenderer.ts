import { CubeData } from '../webgpu/geometry.js';
import { resolveBlockTextureUrl } from '../webgpu/blockTexture.js';
import {
  BLOCK_TILE_EXTRACT_SCALE,
  extractBlockTileFromImage,
  loadBlockTextureImage,
} from '../webgpu/blockTextureExtract.js';
import { createBlockShaderSources } from './blockShadersGLSL.js';
import { textureLogger } from '../utils/logger.js';
import { getBlockTextureConfig, getGlassParams, applyBlockTextureConfigForImageDimensions } from '../webgpu/blockTexture.js';

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown';
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vertexSrc: string, fragmentSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown';
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }
  return program;
}

export class GLBlockRenderer {
  private gl: WebGL2RenderingContext;
  private program!: WebGLProgram;
  private vao!: WebGLVertexArrayObject;
  private vertexCount = 0;
  private texture!: WebGLTexture;
  private authoredTextureLoaded = false;

  private u_viewProjection!: WebGLUniformLocation;
  private u_model!: WebGLUniformLocation;
  private u_normalMatrix!: WebGLUniformLocation;
  private u_color!: WebGLUniformLocation;
  private u_lightPos!: WebGLUniformLocation;
  private u_eyePos!: WebGLUniformLocation;
  private u_materialType: WebGLUniformLocation | null = null;
  private u_glassMin!: WebGLUniformLocation;
  private u_glassMax!: WebGLUniformLocation;
  private u_glassFresnelPower!: WebGLUniformLocation;
  private u_authoredLoaded!: WebGLUniformLocation;
  private u_blockTexture!: WebGLUniformLocation;
  private u_blockMaskTexture!: WebGLUniformLocation;
  private colorSampler!: WebGLSampler;
  private maskSampler!: WebGLSampler;
  private tileWidth = 0;
  private tileHeight = 0;

  private _identity = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  async init(moduleUrl: string): Promise<boolean> {
    const gl = this.gl;
    const { vertex, fragment } = createBlockShaderSources();
    this.program = createProgram(gl, vertex, fragment);

    this.u_viewProjection = gl.getUniformLocation(this.program, 'u_viewProjection')!;
    this.u_model = gl.getUniformLocation(this.program, 'u_model')!;
    this.u_normalMatrix = gl.getUniformLocation(this.program, 'u_normalMatrix')!;
    this.u_color = gl.getUniformLocation(this.program, 'u_color')!;
    this.u_lightPos = gl.getUniformLocation(this.program, 'u_lightPos')!;
    this.u_eyePos = gl.getUniformLocation(this.program, 'u_eyePos')!;
    this.u_materialType = gl.getUniformLocation(this.program, 'u_materialType');
    this.u_glassMin = gl.getUniformLocation(this.program, 'u_glassMin')!;
    this.u_glassMax = gl.getUniformLocation(this.program, 'u_glassMax')!;
    this.u_glassFresnelPower = gl.getUniformLocation(this.program, 'u_glassFresnelPower')!;
    this.u_authoredLoaded = gl.getUniformLocation(this.program, 'u_authoredLoaded')!;
    this.u_blockTexture = gl.getUniformLocation(this.program, 'u_blockTexture')!;
    this.u_blockMaskTexture = gl.getUniformLocation(this.program, 'u_blockMaskTexture')!;

    const cube = CubeData();
    this.vertexCount = cube.positions.length / 3;

    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Failed to create VAO');
    this.vao = vao;
    gl.bindVertexArray(vao);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, cube.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const normalBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuf);
    gl.bufferData(gl.ARRAY_BUFFER, cube.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    const uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, cube.uvs, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);

    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.colorSampler = gl.createSampler()!;
    gl.samplerParameteri(this.colorSampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(this.colorSampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(this.colorSampler, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.samplerParameteri(this.colorSampler, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.maskSampler = gl.createSampler()!;
    gl.samplerParameteri(this.maskSampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(this.maskSampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(this.maskSampler, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.samplerParameteri(this.maskSampler, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    try {
      const url = resolveBlockTextureUrl(moduleUrl);
      textureLogger.info('[WebGL2] Loading block texture from:', url);
      const image = await loadBlockTextureImage(url);
      applyBlockTextureConfigForImageDimensions(image.width, image.height);
      const extracted = extractBlockTileFromImage(image, BLOCK_TILE_EXTRACT_SCALE, getBlockTextureConfig());
      this.tileWidth = extracted.width;
      this.tileHeight = extracted.height;

      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, extracted.canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.authoredTextureLoaded = true;
      textureLogger.info(
        '[WebGL2] Block tile extracted:',
        `${Math.round(extracted.sourceWidth)}×${Math.round(extracted.sourceHeight)}`,
        '→',
        `${extracted.width}×${extracted.height}`,
        `(${extracted.scale}×)`,
      );
    } catch (e) {
      textureLogger.error('[WebGL2] Block texture load failed:', e);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      const pixel = new Uint8Array([220, 220, 220, 255]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      this.authoredTextureLoaded = false;
    }

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    return this.authoredTextureLoaded;
  }

  get authoredLoaded(): boolean {
    return this.authoredTextureLoaded;
  }

  draw(
    viewProjection: Float32Array,
    eyePos: [number, number, number],
    lightPos: [number, number, number],
    _textureMix: number,
    materialType: number,
    instances: Array<{ modelMatrix: Float32Array; color: [number, number, number, number] }>,
  ): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.bindSampler(0, this.colorSampler);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.bindSampler(1, this.maskSampler);
    gl.uniform1i(this.u_blockTexture, 0);
    gl.uniform1i(this.u_blockMaskTexture, 1);

    gl.uniformMatrix4fv(this.u_viewProjection, false, viewProjection);
    gl.uniform3f(this.u_lightPos, lightPos[0], lightPos[1], lightPos[2]);
    gl.uniform3f(this.u_eyePos, eyePos[0], eyePos[1], eyePos[2]);
    if (this.u_materialType) gl.uniform1i(this.u_materialType, materialType);

    const glass = getGlassParams();
    gl.uniform1f(this.u_glassMin, glass.min);
    gl.uniform1f(this.u_glassMax, glass.max);
    gl.uniform1f(this.u_glassFresnelPower, glass.fresnelPower);
    gl.uniform1f(this.u_authoredLoaded, this.authoredTextureLoaded ? 1.0 : 0.0);

    for (const inst of instances) {
      gl.uniformMatrix4fv(this.u_model, false, inst.modelMatrix);
      gl.uniformMatrix4fv(this.u_normalMatrix, false, this._identity);
      gl.uniform4f(this.u_color, inst.color[0], inst.color[1], inst.color[2], inst.color[3]);
      gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    }

    gl.bindSampler(0, null);
    gl.bindSampler(1, null);
    gl.bindVertexArray(null);
  }
  get tileSize(): { width: number; height: number } {
    return { width: this.tileWidth, height: this.tileHeight };
  }
}
