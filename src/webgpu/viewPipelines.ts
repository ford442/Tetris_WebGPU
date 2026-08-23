/**
 * WebGPU pipeline, buffer, and bind-group setup for the View renderer.
 * Extracted from viewWebGPU.ts to keep the orchestrator thin.
 *
 * These functions operate on the `View` instance (typed loosely as `any` to
 * avoid a circular import) and mutate its GPU-resource fields in place.
 */
import * as Matrix from 'gl-matrix';
import {
  PostProcessShaders,
  MaterialAwarePostProcessShaders,
  PBRBlockShaders,
  ParticleShaders,
  GridShader,
  BackgroundShaders,
  VideoBackgroundShaders,
} from './shaders.js';
import { ParticleComputeShader, LineClearComputeShader, LINE_CLEAR_RESULTS_BYTE_SIZE } from './compute.js';
import { CubeData, FullScreenQuadData, GridData } from './geometry.js';
import { BOARD_WORLD_CENTER_X, BOARD_WORLD_CENTER_Y } from './renderMetrics.js';
import {
  resolveBlockTextureUrl,
  getTextureMipLevelCount,
  createBlockTextureSamplerDescriptor,
  setBlockTextureConfig,
  getBlockTextureConfig,
  applyBlockTextureConfigForImageDimensions,
} from './blockTexture.js';
import {
  BLOCK_TILE_EXTRACT_SCALE,
  extractBlockTileFromImage,
  loadBlockTextureImage,
} from './blockTextureExtract.js';
import { UNIFORM_BUFFER_SIZES } from '../config/renderConfig.js';
import { textureLogger, shaderLogger, isDebugEnabled } from '../utils/logger.js';
import { DebugTextureShaders } from './debug_shaders.js';
import { BloomSystem } from './bloomSystem.js';
import { createBlockBindGroupEntries } from './shaders/block/bindings.js';
import {
  loadIblResources,
  resolvePlayfieldColorFormat,
  shouldEnableHdrPlayfield,
  shouldEnableIbl,
} from './ibl/iblResources.js';
import { adaptiveDisablesIbl } from './adaptiveQuality.js';
import {
  generateMipmaps as generateMipmapsUtil,
  createSolidFallbackTexture,
  createProceduralFallbackTexture,
  createPostProcessBindGroupEntries,
} from './viewTextures.js';

/**
 * Load the authored block texture (block.png), extracting the tile and
 * generating mipmaps. Falls back to a procedural then solid texture on error.
 */
export async function loadBlockTexture(view: any): Promise<void> {
  view.blockSampler = view.device.createSampler(createBlockTextureSamplerDescriptor());

  try {
    const textureUrl = resolveBlockTextureUrl(import.meta.url);
    textureLogger.info('Loading from:', textureUrl);
    const textureLoadTimeoutMs = 10000;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = textureUrl;

    await new Promise<void>((resolve, reject) => {
      let timeoutId = 0;
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        img.onload = null;
        img.onerror = null;
      };
      timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out loading ${textureUrl} after ${textureLoadTimeoutMs}ms`));
      }, textureLoadTimeoutMs);
      img.onload = () => {
        cleanup();
        resolve();
      };
      img.onerror = () => {
        cleanup();
        reject(new Error(`Failed to load ${textureUrl}`));
      };
    });

    applyBlockTextureConfigForImageDimensions(img.width, img.height);

    // Authored tile is uploaded as a SINGLE texture, so the shader uses SINGLE mode.
    setBlockTextureConfig({ samplingMode: 'single' });

    const cfg = getBlockTextureConfig();
    let maskImg: HTMLImageElement | null = null;
    if (cfg.maskUrl) {
      const resolvedMaskUrl = resolveBlockTextureUrl(cfg.maskUrl);
      try {
        maskImg = await loadBlockTextureImage(resolvedMaskUrl, textureLoadTimeoutMs);
      } catch (maskErr) {
        textureLogger.warn('Failed to load block mask; using heuristic mask bake', maskErr);
        maskImg = null;
      }
    }

    const extracted = extractBlockTileFromImage(img, BLOCK_TILE_EXTRACT_SCALE, cfg, maskImg);

    const imageBitmap = await createImageBitmap(extracted.canvas, {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    });
    view.blockTexture = view.device.createTexture({
      size: [imageBitmap.width, imageBitmap.height, 1],
      format: 'rgba8unorm',
      mipLevelCount: getTextureMipLevelCount(imageBitmap.width, imageBitmap.height),
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    view.device.queue.copyExternalImageToTexture({ source: imageBitmap }, { texture: view.blockTexture }, [imageBitmap.width, imageBitmap.height]);
    generateMipmapsUtil(view.device, view.blockTexture, imageBitmap.width, imageBitmap.height, view.blockTexture.mipLevelCount);
    await view.device.queue.onSubmittedWorkDone();
    view.authoredBlockTextureLoaded = true;
    textureLogger.info(
      'Loaded extracted tile:',
      Math.round(extracted.sourceWidth), 'x', Math.round(extracted.sourceHeight),
      '→', imageBitmap.width, 'x', imageBitmap.height,
      `(${extracted.scale}×) with`, view.blockTexture.mipLevelCount, 'mips',
    );
  } catch (e) {
    view.authoredBlockTextureLoaded = false;
    textureLogger.error('Failed to load block texture:', e);
    try {
      view.blockTexture = createProceduralFallbackTexture(view.device);
      textureLogger.warn('Using procedural fallback texture');
    } catch (fallbackError) {
      textureLogger.error('Procedural fallback failed, using solid texture:', fallbackError);
      view.blockTexture = createSolidFallbackTexture(view.device);
    }
  }
}

/**
 * Create all render/compute pipelines, GPU buffers, render targets, bind-group
 * caches, and camera matrices. Assumes the device, context, and block texture
 * are already initialized.
 */
export async function initGpuResources(view: any, presentationFormat: GPUTextureFormat): Promise<void> {
  const device: GPUDevice = view.device;
  const quality = view.userGameSettings?.quality as string | undefined;
  const hdr = shouldEnableHdrPlayfield({
    powerPreference: view.gpuPowerPreference,
    quality,
  });
  view.hdrPlayfield = hdr;
  view.sceneColorFormat = resolvePlayfieldColorFormat(device, hdr, presentationFormat);
  const sceneFormat = view.sceneColorFormat as GPUTextureFormat;
  view.iblEnabled = shouldEnableIbl({
    powerPreference: view.gpuPowerPreference,
    quality,
    adaptiveDisableIbl: adaptiveDisablesIbl(view.adaptiveState?.stepIndex ?? 0),
  });
  const ibl = await loadIblResources(device);
  view.iblSpecularTexture = ibl.specularTexture;
  view.iblBrdfLutTexture = ibl.brdfLutTexture;
  view.iblSampler = ibl.sampler;

  const shaderMain = PBRBlockShaders();
  let vertexCode = shaderMain.vertex;
  let fragmentCode = shaderMain.fragment;

  if (isDebugEnabled()) {
    // When debugging, visualize baked mask channels instead of full PBR.
    const dbg = DebugTextureShaders();
    const modeRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('tetris_debug_mode') : null;
    const mode = modeRaw ? Number(modeRaw) : 3;

    // Modes: 0 raw texture, 1 luminance, 2 metal/glass heuristic,
    // 3 baked metal alpha, 4 glass mask, 5 final alpha approx.
    switch (mode) {
      case 0: fragmentCode = dbg.fragmentRawTexture; break;
      case 1: fragmentCode = dbg.fragmentLuminance; break;
      case 2: fragmentCode = dbg.fragmentMask; break;
      case 3: fragmentCode = dbg.fragmentBakedMetalAlpha; break;
      case 4: fragmentCode = dbg.fragmentGlassMask; break;
      case 5: fragmentCode = dbg.fragmentFinalAlphaApprox; break;
      default: fragmentCode = dbg.fragmentBakedMetalAlpha; break;
    }
    vertexCode = dbg.vertex;
    textureLogger.info('Debug mode: using texture mask visualization', { mode });
  }

  const cubeData = CubeData();
  view.numberOfVertices = cubeData.positions.length / 3;
  view.vertexBuffer = view.CreateGPUBuffer(device, cubeData.positions);
  view.normalBuffer = view.CreateGPUBuffer(device, cubeData.normals);
  view.uvBuffer = view.CreateGPUBuffer(device, cubeData.uvs);

  const vertexModule = device.createShaderModule({ code: vertexCode });
  const fragmentModule = device.createShaderModule({ code: fragmentCode });

  void vertexModule.getCompilationInfo().then(info => { if (info.messages.length > 0) shaderLogger.warn('Vertex:', info.messages); });
  void fragmentModule.getCompilationInfo().then(info => { if (info.messages.length > 0) shaderLogger.warn('Fragment:', info.messages); });

  view.pipeline = device.createRenderPipeline({
    label: 'main pipeline', layout: 'auto',
    vertex: { module: vertexModule, entryPoint: 'main', buffers: [
      { arrayStride: 12, attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }] },
      { arrayStride: 12, attributes: [{ shaderLocation: 1, format: 'float32x3', offset: 0 }] },
      { arrayStride: 8, attributes: [{ shaderLocation: 2, format: 'float32x2', offset: 0 }] },
    ]},
    fragment: { module: fragmentModule, entryPoint: 'main', targets: [{ format: sceneFormat, blend: {
      // Canvas uses alphaMode='premultiplied', so blocks must output premultiplied RGB.
      color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    }}]},
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });

  const backgroundShader = BackgroundShaders();
  const bgData = FullScreenQuadData();
  view.backgroundVertexBuffer = view.CreateGPUBuffer(device, bgData.positions);
  view.backgroundPipeline = device.createRenderPipeline({
    label: 'background pipeline', layout: 'auto',
    vertex: { module: device.createShaderModule({ code: backgroundShader.vertex }), entryPoint: 'main', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }] }] },
    fragment: { module: device.createShaderModule({ code: backgroundShader.fragment }), entryPoint: 'main', targets: [{ format: sceneFormat }] },
    primitive: { topology: 'triangle-list' },
  });

  view.backgroundUniformBuffer = device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  view.backgroundBindGroup = device.createBindGroup({ layout: view.backgroundPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: view.backgroundUniformBuffer } }] });

  const videoBgShader = VideoBackgroundShaders();
  view.videoBackgroundPipeline = device.createRenderPipeline({
    label: 'video background pipeline', layout: 'auto',
    vertex: { module: device.createShaderModule({ code: videoBgShader.vertex }), entryPoint: 'main', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }] }] },
    fragment: { module: device.createShaderModule({ code: videoBgShader.fragment }), entryPoint: 'main', targets: [{ format: sceneFormat }] },
    primitive: { topology: 'triangle-list' },
  });
  view.videoCoverScaleUniformBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(view.videoCoverScaleUniformBuffer, 0, new Float32Array([1, 1, 0, 0]));

  // Initialize Frosted Glass Backboard.
  await view.initFrostedGlassBackboard();

  const bgColors = view.currentTheme.backgroundColors;
  view.backgroundRenderer.setThemeColors(bgColors);

  const gridShader = GridShader();
  const gridData = GridData();
  view.gridVertexCount = gridData.length / 3;
  view.gridVertexBuffer = view.CreateGPUBuffer(device, gridData);
  view.gridPipeline = device.createRenderPipeline({
    label: 'grid pipeline', layout: 'auto',
    vertex: { module: device.createShaderModule({ code: gridShader.vertex }), entryPoint: 'main', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }] }] },
    fragment: { module: device.createShaderModule({ code: gridShader.fragment }), entryPoint: 'main', targets: [{ format: sceneFormat, blend: {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    }}]},
    primitive: { topology: 'line-list' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' },
  });

  view.particleStorageBuffer = device.createBuffer({
    size: 64 * view.particleSystem.maxParticles,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  view.particleComputeUniformBuffer = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  view.particleComputePipeline = device.createComputePipeline({
    label: 'particle compute pipeline', layout: 'auto',
    compute: { module: device.createShaderModule({ code: ParticleComputeShader }), entryPoint: 'main' },
  });
  view.particleComputeBindGroup = device.createBindGroup({
    layout: view.particleComputePipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: view.particleStorageBuffer } }, { binding: 1, resource: { buffer: view.particleComputeUniformBuffer } }],
  });

  const particleShader = ParticleShaders();
  view.particlePipeline = device.createRenderPipeline({
    label: 'particle pipeline', layout: 'auto',
    vertex: { module: device.createShaderModule({ code: particleShader.vertex }), entryPoint: 'main', buffers: [{
      arrayStride: 64, stepMode: 'instance',
      attributes: [
        { shaderLocation: 0, format: 'float32x3', offset: 0 },
        { shaderLocation: 1, format: 'float32x4', offset: 32 },
        { shaderLocation: 2, format: 'float32', offset: 48 },
        { shaderLocation: 3, format: 'float32', offset: 52 },
        { shaderLocation: 4, format: 'float32', offset: 56 },
        { shaderLocation: 5, format: 'float32x3', offset: 16 },
      ],
    }]},
    fragment: { module: device.createShaderModule({ code: particleShader.fragment }), entryPoint: 'main', targets: [{ format: sceneFormat, blend: {
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    }}]},
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' },
  });

  view.particleUniformBuffer = device.createBuffer({ size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  view.particleRenderBindGroup = device.createBindGroup({ layout: view.particlePipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: view.particleUniformBuffer } }] });
  view.gridBindGroup = device.createBindGroup({ layout: view.gridPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: view.particleUniformBuffer } }] });

  const ppShader = view.useEnhancedPostProcess ? MaterialAwarePostProcessShaders() : PostProcessShaders();
  view.postProcessPipeline = device.createRenderPipeline({
    label: 'post process pipeline', layout: 'auto',
    vertex: { module: device.createShaderModule({ code: ppShader.vertex }), entryPoint: 'main', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }] }] },
    fragment: { module: device.createShaderModule({ code: ppShader.fragment }), entryPoint: 'main', targets: [{ format: sceneFormat }] },
    primitive: { topology: 'triangle-list' },
  });

  view.postProcessUniformBuffer = device.createBuffer({ size: UNIFORM_BUFFER_SIZES.POST_PROCESS, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  view.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

  view.offscreenTexture = device.createTexture({
    size: [view.canvasWebGPU.width, view.canvasWebGPU.height, 1],
    format: sceneFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  view._offscreenTextureView = view.offscreenTexture.createView();
  view.depthTexture = device.createTexture({ size: [view.canvasWebGPU.width, view.canvasWebGPU.height, 1], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
  view._bloomInputTexture = device.createTexture({
    size: [view.canvasWebGPU.width, view.canvasWebGPU.height, 1],
    format: sceneFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  view._depthTextureView = view.depthTexture.createView();

  // Initialize Pass Descriptors once - GC optimized.
  view._backgroundPassDescriptor = {
    colorAttachments: [{ view: view._offscreenTextureView, clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 }, loadOp: 'clear', storeOp: 'store' }],
  };
  view._mainPassDescriptor = {
    colorAttachments: [{ view: view._offscreenTextureView, loadOp: 'load', storeOp: 'store' }],
    depthStencilAttachment: { view: view._depthTextureView, depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store' },
  };
  view._ppPassDescriptor = {
    colorAttachments: [{ view: undefined as any, clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 }, loadOp: 'clear', storeOp: 'store' }],
  };

  view.postProcessBindGroup = device.createBindGroup({
    layout: view.postProcessPipeline.getBindGroupLayout(0),
    entries: createPostProcessBindGroupEntries(view),
  });

  // Initialize multi-pass bloom system.
  view.bloomSystem = new BloomSystem(device, view.canvasWebGPU.width, view.canvasWebGPU.height);
  // Conservative values to prevent block washout.
  view.bloomSystem.setParameters({
    threshold: view.hdrPlayfield ? 1.05 : 0.72,
    intensity: view.bloomIntensity,
    scatter: 0.52,
    clamp: 65472,
    knee: 0.1,
  });

  // 224 bytes — WGSL minBindingSize for FragmentUniforms (audio bands at 184+, struct tail padding).
  view.fragmentUniformBuffer = device.createBuffer({ size: UNIFORM_BUFFER_SIZES.FRAGMENT, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  view.fresnelParamsUniform = device.createBuffer({
    size: 16, // vec4<f32> aligned
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    mappedAtCreation: false,
  });

  const eyePosition = [0.0, BOARD_WORLD_CENTER_Y, 75.0];
  const lightPosition = view._f32_3;
  lightPosition.set([-5.0, 0.0, 0.0]);

  Matrix.mat4.identity(view.VIEWMATRIX);
  Matrix.mat4.lookAt(view.VIEWMATRIX, eyePosition, [BOARD_WORLD_CENTER_X, BOARD_WORLD_CENTER_Y, 0.0], [0.0, 1.0, 0.0]);
  Matrix.mat4.identity(view.PROJMATRIX);
  // Increased FOV (42° vs 35°) for more dramatic depth on floating panel.
  Matrix.mat4.perspective(view.PROJMATRIX, (42 * Math.PI) / 180, view.canvasWebGPU.width / view.canvasWebGPU.height, 1, 150);
  Matrix.mat4.identity(view.vpMatrix);
  Matrix.mat4.multiply(view.vpMatrix, view.PROJMATRIX, view.VIEWMATRIX);

  device.queue.writeBuffer(view.fragmentUniformBuffer, 0, lightPosition);
  view._f32_3.set(eyePosition);
  device.queue.writeBuffer(view.fragmentUniformBuffer, 16, view._f32_3);
  // Bytes 32-47 are time/useGlitch/lockPercent/level — zeroed here, updated each frame.

  // Create material uniform buffer for PBR (binding 4) - MUST be before renderPlayfield_Border_WebGPU.
  view.materialUniformBuffer = device.createBuffer({
    size: 16, // metallic, roughness, transmission, padding
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const materialDefaults = new Float32Array([0.5, 0.3, 0.0, 0.0]);
  device.queue.writeBuffer(view.materialUniformBuffer, 0, materialDefaults);

  // --- GPU line-clear + dissolve field (compute writes, block fragment reads) ---
  view.dissolveBuffer = device.createBuffer({
    size: 200 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  view.boardBuffer = device.createBuffer({
    size: 200 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
  view.clearFlagsBuffer = device.createBuffer({
    size: 20 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  view.lineClearResultsBuffer = device.createBuffer({
    size: LINE_CLEAR_RESULTS_BYTE_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  view.lineClearResultsStaging = device.createBuffer({
    size: LINE_CLEAR_RESULTS_BYTE_SIZE,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  view.lineClearUniformBuffer = device.createBuffer({
    size: 16, // dt + decayRate + pad(8)
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  view.lineClearComputePipeline = device.createComputePipeline({
    label: 'line-clear compute pipeline', layout: 'auto',
    compute: {
      module: device.createShaderModule({ code: LineClearComputeShader }),
      entryPoint: 'detect_lines',
    },
  });
  view.lineClearComputeBindGroup = device.createBindGroup({
    layout: view.lineClearComputePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: view.boardBuffer } },
      { binding: 1, resource: { buffer: view.dissolveBuffer } },
      { binding: 2, resource: { buffer: view.clearFlagsBuffer } },
      { binding: 3, resource: { buffer: view.lineClearResultsBuffer } },
      { binding: 4, resource: { buffer: view.lineClearUniformBuffer } },
    ],
  });
  view.gpuLineClearReady = true;

  view.renderPlayfield_Border_WebGPU();

  view.vertexUniformBuffer = device.createBuffer({
    size: view.state.playfield.length * 10 * 256,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const maxBlocks = 200;
  view.uniformBindGroup_CACHE = [];
  for (let i = 0; i < maxBlocks; i++) {
    const bindGroup = device.createBindGroup({
      label: `block_bindgroup_${i}`, layout: view.pipeline.getBindGroupLayout(0),
      entries: createBlockBindGroupEntries({
        vertexUniformBuffer: view.vertexUniformBuffer,
        vertexUniformOffset: i * 256,
        fragmentUniformBuffer: view.fragmentUniformBuffer,
        blockTexture: view.blockTexture,
        blockSampler: view.blockSampler,
        dissolveBuffer: view.dissolveBuffer,
        fresnelParamsUniform: view.fresnelParamsUniform,
        iblSpecularTexture: view.iblSpecularTexture,
        iblBrdfLutTexture: view.iblBrdfLutTexture,
        iblSampler: view.iblSampler,
      }),
    });
    view.uniformBindGroup_CACHE.push(bindGroup);
  }
}
