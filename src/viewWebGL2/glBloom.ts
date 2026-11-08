/**
 * WebGL2 bloom post-pass (the fallback renderer's counterpart to the WebGPU
 * bloom). Scene → offscreen target → bright-pass → separable blur at half
 * resolution → additive composite onto the canvas.
 *
 * RGBA8 targets only, so it needs no float-texture extensions. The canvas is
 * `premultipliedAlpha`, so the composite keeps colour <= alpha and lets the glow
 * contribute coverage — otherwise it would vanish over the video backdrop.
 */

export interface BloomParams {
  /** Bright-pass cut-off on the brightest channel (0..1). */
  threshold: number;
  /** Glow strength multiplier at composite time. */
  intensity: number;
}

const BASE_THRESHOLD = 0.55;
const BASE_INTENSITY = 0.55;
const MAX_FLASH_INTENSITY = 3.0; // VisualEffects caps neonBloomIntensity at 3.0

/**
 * Bloom strength for a frame. `neonFlash` is `VisualEffects.neonBloomIntensity`
 * (decays to 0 after line clears / hard drops), so the glow pulses with the
 * same events the WebGPU path reacts to. Pure: unit-testable without GL.
 */
export function computeBloomParams(neonFlash: number): BloomParams {
  const flash = Math.min(Math.max(Number.isFinite(neonFlash) ? neonFlash : 0, 0), MAX_FLASH_INTENSITY);
  return {
    // A flash also lowers the threshold slightly so more of the scene glows.
    threshold: BASE_THRESHOLD - 0.12 * (flash / MAX_FLASH_INTENSITY),
    intensity: BASE_INTENSITY + 0.45 * flash,
  };
}

const FULLSCREEN_VERTEX = `#version 300 es
precision highp float;
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const BRIGHT_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D u_src;
uniform float u_threshold;
out vec4 outColor;
void main() {
  vec3 c = texture(u_src, vUV).rgb;
  float peak = max(c.r, max(c.g, c.b));
  float k = smoothstep(u_threshold, u_threshold + 0.25, peak);
  outColor = vec4(c * k, 1.0);
}`;

export const BLUR_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D u_src;
uniform vec2 u_step; // one texel along the blur axis
out vec4 outColor;
void main() {
  vec3 sum = texture(u_src, vUV).rgb * 0.227027;
  sum += texture(u_src, vUV + u_step * 1.3846154).rgb * 0.3162162;
  sum += texture(u_src, vUV - u_step * 1.3846154).rgb * 0.3162162;
  sum += texture(u_src, vUV + u_step * 3.2307692).rgb * 0.0702703;
  sum += texture(u_src, vUV - u_step * 3.2307692).rgb * 0.0702703;
  outColor = vec4(sum, 1.0);
}`;

export const COMPOSITE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_intensity;
out vec4 outColor;
void main() {
  vec4 scene = texture(u_scene, vUV);
  vec3 glow = texture(u_bloom, vUV).rgb * u_intensity;
  float a = clamp(scene.a + max(glow.r, max(glow.g, glow.b)), 0.0, 1.0);
  outColor = vec4(min(scene.rgb + glow, vec3(a)), a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('bloom: createShader failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? 'unknown';
    gl.deleteShader(sh);
    throw new Error(`bloom shader compile error: ${log}`);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, fragmentSrc: string): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, FULLSCREEN_VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSrc);
  const prog = gl.createProgram();
  if (!prog) throw new Error('bloom: createProgram failed');
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? 'unknown';
    gl.deleteProgram(prog);
    throw new Error(`bloom program link error: ${log}`);
  }
  return prog;
}

interface Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  width: number;
  height: number;
  depth: WebGLRenderbuffer | null;
}

type SceneTarget = Target;

export class GLBloom {
  private readonly gl: WebGL2RenderingContext;
  private bright!: WebGLProgram;
  private blur!: WebGLProgram;
  private composite!: WebGLProgram;
  private vao!: WebGLVertexArrayObject;
  private scene: SceneTarget | null = null;
  private ping: Target | null = null;
  private pong: Target | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  init(): void {
    const gl = this.gl;
    this.bright = link(gl, BRIGHT_FRAGMENT);
    this.blur = link(gl, BLUR_FRAGMENT);
    this.composite = link(gl, COMPOSITE_FRAGMENT);
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('bloom: createVertexArray failed');
    this.vao = vao;
  }

  private makeTarget(width: number, height: number, withDepth: boolean): Target {
    const gl = this.gl;
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) throw new Error('bloom: failed to allocate render target');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    let depth: WebGLRenderbuffer | null = null;
    if (withDepth) {
      depth = gl.createRenderbuffer();
      if (!depth) throw new Error('bloom: failed to allocate depth buffer');
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    }
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`bloom: framebuffer incomplete (0x${status.toString(16)})`);
    }
    return { fbo, tex, width, height, depth };
  }

  private freeTarget(t: Target | null): void {
    if (!t) return;
    const gl = this.gl;
    gl.deleteFramebuffer(t.fbo);
    gl.deleteTexture(t.tex);
    if (t.depth) gl.deleteRenderbuffer(t.depth);
  }

  /** (Re)allocate targets for a canvas size. Cheap no-op when unchanged. */
  resize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (this.scene && this.scene.width === w && this.scene.height === h) return;
    this.freeTarget(this.scene);
    this.freeTarget(this.ping);
    this.freeTarget(this.pong);
    const bw = Math.max(1, w >> 1);
    const bh = Math.max(1, h >> 1);
    this.scene = this.makeTarget(w, h, true);
    this.ping = this.makeTarget(bw, bh, false);
    this.pong = this.makeTarget(bw, bh, false);
  }

  /** Direct subsequent draws into the offscreen scene target. */
  beginScene(width: number, height: number): void {
    this.resize(width, height);
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene!.fbo);
    gl.viewport(0, 0, this.scene!.width, this.scene!.height);
  }

  private pass(program: WebGLProgram, target: Target | null, width: number, height: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(program);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private bindTex(unit: number, tex: WebGLTexture): void {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
  }

  /**
   * Finish the scene, build the glow and write the composite to the canvas.
   * Leaves GL state ready for the next frame's scene pass (depth test + the
   * premultiplied blend the block renderer relies on).
   */
  endSceneAndComposite(params: BloomParams, canvasWidth: number, canvasHeight: number): void {
    const gl = this.gl;
    const scene = this.scene!;
    const ping = this.ping!;
    const pong = this.pong!;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);

    // 1) bright-pass: scene -> ping (half res)
    gl.useProgram(this.bright);
    this.bindTex(0, scene.tex);
    gl.uniform1i(gl.getUniformLocation(this.bright, 'u_src'), 0);
    gl.uniform1f(gl.getUniformLocation(this.bright, 'u_threshold'), params.threshold);
    this.pass(this.bright, ping, ping.width, ping.height);

    // 2) separable blur, two iterations: ping -> pong (H), pong -> ping (V)
    gl.useProgram(this.blur);
    gl.uniform1i(gl.getUniformLocation(this.blur, 'u_src'), 0);
    const stepLoc = gl.getUniformLocation(this.blur, 'u_step');
    for (let i = 0; i < 2; i++) {
      this.bindTex(0, ping.tex);
      gl.uniform2f(stepLoc, 1 / ping.width, 0);
      this.pass(this.blur, pong, pong.width, pong.height);
      this.bindTex(0, pong.tex);
      gl.uniform2f(stepLoc, 0, 1 / ping.height);
      this.pass(this.blur, ping, ping.width, ping.height);
    }

    // 3) composite onto the canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvasWidth, canvasHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.composite);
    this.bindTex(0, scene.tex);
    this.bindTex(1, ping.tex);
    gl.uniform1i(gl.getUniformLocation(this.composite, 'u_scene'), 0);
    gl.uniform1i(gl.getUniformLocation(this.composite, 'u_bloom'), 1);
    gl.uniform1f(gl.getUniformLocation(this.composite, 'u_intensity'), params.intensity);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Restore what the block renderer expects.
    gl.bindVertexArray(null);
    this.bindTex(1, null as unknown as WebGLTexture);
    this.bindTex(0, null as unknown as WebGLTexture);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  dispose(): void {
    this.freeTarget(this.scene);
    this.freeTarget(this.ping);
    this.freeTarget(this.pong);
    this.scene = this.ping = this.pong = null;
  }
}
