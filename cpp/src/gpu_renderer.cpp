/**
 * WebGPU instanced block renderer for the Emscripten C++ path.
 * Falls back to no-op stubs when not built with TETRIS_ENABLE_WEBGPU.
 */

#include "gpu_renderer.h"

#include "board_metrics.h"
#include "generated/shader_sources.h"
#include "math_utils.h"

#include <string.h>

#if defined(TETRIS_ENABLE_WEBGPU)

#include <emscripten/emscripten.h>
#include <webgpu/webgpu.h>

namespace {

using namespace tetris;

constexpr int kMaxInstances = kPlayfieldBytes;
constexpr float kPi = 3.14159265358979323846f;

struct BlockInstance {
  float pos[3];
  float color[4];
};

struct UniformData {
  float view_proj[16];
  float params0[4];  // halfSize, lockFlash, ambient, diffuse
  float params1[4];  // textureMix, pad...
  float light_dir[4];
  float eye_pos[4];
};

struct PostProcessUniformData {
  float time;
  float intensity;
  float aberration;
  float pad1;
};

struct GpuState {
  WGPUInstance instance = nullptr;
  WGPUDevice device = nullptr;
  WGPUQueue queue = nullptr;
  WGPUSurface surface = nullptr;
  WGPURenderPipeline pipeline = nullptr;
  WGPUBuffer vertex_buffer = nullptr;
  WGPUBuffer index_buffer = nullptr;
  WGPUBuffer instance_buffer = nullptr;
  WGPUBuffer uniform_buffer = nullptr;
  WGPUBindGroup bind_group = nullptr;
  WGPUBindGroupLayout bind_group_layout = nullptr;
  WGPUTexture block_texture = nullptr;
  WGPUTextureView block_texture_view = nullptr;
  WGPUSampler block_sampler = nullptr;
  WGPUTexture depth_texture = nullptr;
  WGPUTextureView depth_view = nullptr;

  WGPUTexture offscreen_texture = nullptr;
  WGPUTextureView offscreen_view = nullptr;

  WGPURenderPipeline post_pipeline = nullptr;
  WGPUBindGroup post_bind_group = nullptr;
  WGPUBindGroupLayout post_bind_group_layout = nullptr;
  WGPUSampler post_sampler = nullptr;
  WGPUBuffer post_uniform_buffer = nullptr;

  WGPUTextureFormat surface_format = WGPUTextureFormat_BGRA8Unorm;
  bool draw_blocks = false;
  bool texture_ready = false;
  char canvas_selector[64] = "canvaswebgpu";
  int width = 1;
  int height = 1;
  bool active = false;
};

static GpuState g_gpu;

/** Maps navigator.gpu.getPreferredCanvasFormat() → WGPUTextureFormat (via EM_JS). */
EM_JS(int, js_preferred_surface_format, (), {
  if (typeof navigator === 'undefined' || !navigator.gpu ||
      typeof navigator.gpu.getPreferredCanvasFormat !== 'function') {
    return 0;
  }
  const fmt = navigator.gpu.getPreferredCanvasFormat();
  return fmt === 'rgba8unorm' ? 1 : 0;
});

static WGPUTextureFormat preferred_surface_format() {
  return js_preferred_surface_format() ? WGPUTextureFormat_RGBA8Unorm
                                       : WGPUTextureFormat_BGRA8Unorm;
}

/** Transparent clear (alpha=0) so the DOM video portal shows through premultiplied surface. */
static const WGPUColor kClearColorTransparent = {0.0f, 0.0f, 0.0f, 0.0f};

static WGPUStringView make_stringview(const char* str) {
  WGPUStringView res = {};
  if (str) {
    res.data = str;
    res.length = strlen(str);
  }
  return res;
}

static WGPUShaderModule create_shader(const char* code) {
  WGPUShaderSourceWGSL wgsl = {};
  wgsl.chain.sType = WGPUSType_ShaderSourceWGSL;
  wgsl.code = make_stringview(code);

  WGPUShaderModuleDescriptor desc = {};
  desc.nextInChain = reinterpret_cast<WGPUChainedStruct*>(&wgsl);
  return wgpuDeviceCreateShaderModule(g_gpu.device, &desc);
}

static WGPUBuffer create_buffer(const void* data, size_t size, WGPUBufferUsage usage) {
  WGPUBufferDescriptor desc = {};
  desc.usage = WGPUBufferUsage_CopyDst | usage;
  desc.size = size;
  WGPUBuffer buffer = wgpuDeviceCreateBuffer(g_gpu.device, &desc);
  if (data && size > 0) {
    wgpuQueueWriteBuffer(g_gpu.queue, buffer, 0, data, size);
  }
  return buffer;
}

static void release_render_targets() {
  if (g_gpu.depth_view) {
    wgpuTextureViewRelease(g_gpu.depth_view);
    g_gpu.depth_view = nullptr;
  }
  if (g_gpu.depth_texture) {
    wgpuTextureRelease(g_gpu.depth_texture);
    g_gpu.depth_texture = nullptr;
  }
  if (g_gpu.offscreen_view) {
    wgpuTextureViewRelease(g_gpu.offscreen_view);
    g_gpu.offscreen_view = nullptr;
  }
  if (g_gpu.offscreen_texture) {
    wgpuTextureRelease(g_gpu.offscreen_texture);
    g_gpu.offscreen_texture = nullptr;
  }
}

static void create_render_targets() {
  release_render_targets();
  if (!g_gpu.device || g_gpu.width <= 0 || g_gpu.height <= 0) return;

  WGPUTextureDescriptor depth_desc = {};
  depth_desc.size = {static_cast<uint32_t>(g_gpu.width), static_cast<uint32_t>(g_gpu.height), 1};
  depth_desc.format = WGPUTextureFormat_Depth24Plus;
  depth_desc.usage = WGPUTextureUsage_RenderAttachment;
  g_gpu.depth_texture = wgpuDeviceCreateTexture(g_gpu.device, &depth_desc);
  g_gpu.depth_view = wgpuTextureCreateView(g_gpu.depth_texture, nullptr);

  WGPUTextureDescriptor offscreen_desc = {};
  offscreen_desc.size = {static_cast<uint32_t>(g_gpu.width), static_cast<uint32_t>(g_gpu.height), 1};
  offscreen_desc.format = g_gpu.surface_format;
  offscreen_desc.usage = WGPUTextureUsage_RenderAttachment | WGPUTextureUsage_TextureBinding;
  g_gpu.offscreen_texture = wgpuDeviceCreateTexture(g_gpu.device, &offscreen_desc);
  g_gpu.offscreen_view = wgpuTextureCreateView(g_gpu.offscreen_texture, nullptr);
}

static void configure_surface() {
  if (!g_gpu.device || !g_gpu.surface) return;

  WGPUSurfaceConfiguration surf_cfg = {};
  surf_cfg.device = g_gpu.device;
  surf_cfg.format = g_gpu.surface_format;
  surf_cfg.usage = WGPUTextureUsage_RenderAttachment;
  surf_cfg.width = static_cast<uint32_t>(g_gpu.width);
  surf_cfg.height = static_cast<uint32_t>(g_gpu.height);
  surf_cfg.presentMode = WGPUPresentMode_Fifo;
  surf_cfg.alphaMode = WGPUCompositeAlphaMode_Premultiplied;
  wgpuSurfaceConfigure(g_gpu.surface, &surf_cfg);
}

static void create_surface() {
  if (g_gpu.surface) {
    wgpuSurfaceRelease(g_gpu.surface);
    g_gpu.surface = nullptr;
  }
  if (!g_gpu.instance || !g_gpu.device) return;

  WGPUEmscriptenSurfaceSourceCanvasHTMLSelector from_canvas = {};
  from_canvas.chain.sType = WGPUSType_EmscriptenSurfaceSourceCanvasHTMLSelector;
  from_canvas.selector = make_stringview(g_gpu.canvas_selector);

  WGPUSurfaceDescriptor surf_desc = {};
  surf_desc.nextInChain = reinterpret_cast<WGPUChainedStruct*>(&from_canvas);
  g_gpu.surface = wgpuInstanceCreateSurface(g_gpu.instance, &surf_desc);
  configure_surface();
  create_render_targets();
}

static void get_piece_color(int index, float* rgba) {
  static const float palette[8][3] = {
      {0.30f, 0.30f, 0.30f}, // 0 garbage / unknown
      {0.95f, 0.98f, 1.00f}, // 1 I
      {0.92f, 0.95f, 1.00f}, // 2 J
      {1.00f, 0.96f, 0.92f}, // 3 L
      {1.00f, 1.00f, 0.95f}, // 4 O
      {0.92f, 1.00f, 0.95f}, // 5 S
      {0.96f, 0.92f, 1.00f}, // 6 T
      {1.00f, 0.94f, 0.96f}, // 7 Z
  };
  int i = index;
  if (i < 0) i = -i;
  if (i < 0 || i > 7) i = 0;
  rgba[0] = palette[i][0];
  rgba[1] = palette[i][1];
  rgba[2] = palette[i][2];
  rgba[3] = 1.0f;
}

static bool cell_is_active_piece(int col, int row, const PieceState* ps) {
  if (!ps || ps->piece_type <= 0) return false;
  return col >= ps->x && col < ps->x + 4 && row >= ps->y && row < ps->y + 4;
}

static int build_instances(const int8_t* playfield, int cols, int rows,
                           const PieceState* piece_state,
                           BlockInstance* out, int max_out) {
  int count = 0;
  for (int row = 0; row < rows; ++row) {
    for (int col = 0; col < cols; ++col) {
      const int8_t value = playfield[row * cols + col];
      if (value == 0) continue;
      if (count >= max_out) break;

      BlockInstance inst = {};
      inst.pos[0] = blockCenterX(col);
      inst.pos[1] = blockCenterY(row);
      inst.pos[2] = 0.0f;

      const int color_idx = value < 0 ? -value : value;
      get_piece_color(color_idx, inst.color);

      if (value < 0) {
        inst.color[3] = 0.35f; // ghost alpha
      }

      if (value > 0 && piece_state && piece_state->lock_flash > 0.0f &&
          cell_is_active_piece(col, row, piece_state)) {
        const float boost = 1.0f + piece_state->lock_flash * 0.65f;
        inst.color[0] = inst.color[0] * boost > 1.0f ? 1.0f : inst.color[0] * boost;
        inst.color[1] = inst.color[1] * boost > 1.0f ? 1.0f : inst.color[1] * boost;
        inst.color[2] = inst.color[2] * boost > 1.0f ? 1.0f : inst.color[2] * boost;
      }

      out[count++] = inst;
    }
  }
  return count;
}

static void update_uniforms(float dt) {
  (void)dt;

  const float aspect = g_gpu.height > 0 ? static_cast<float>(g_gpu.width) / static_cast<float>(g_gpu.height) : 1.0f;
  const float fov = kCameraFovDeg * kPi / 180.0f;

  Mat4 proj, view, vp;
  mat4_perspective(&proj, fov, aspect, kCameraNear, kCameraFar);

  const float cam_y = kBoardWorldCenterY + 2.0f;
  mat4_look_at(&view,
               0.0f, cam_y, kCameraZ,
               kBoardWorldCenterX, kBoardWorldCenterY, 0.0f,
               0.0f, 1.0f, 0.0f);
  mat4_multiply(&vp, &proj, &view);

  UniformData uniforms = {};
  memcpy(uniforms.view_proj, vp.m, sizeof(vp.m));
  uniforms.params0[0] = kBlockHalfWorldSize;
  uniforms.params0[1] = 0.0f;
  uniforms.params0[2] = 0.35f;  // ambient
  uniforms.params0[3] = 0.85f;  // diffuse
  uniforms.params1[0] = g_gpu.texture_ready ? 1.0f : 0.0f;
  uniforms.light_dir[0] = 0.35f;
  uniforms.light_dir[1] = 0.85f;
  uniforms.light_dir[2] = 0.45f;
  uniforms.eye_pos[0] = 0.0f;
  uniforms.eye_pos[1] = cam_y;
  uniforms.eye_pos[2] = kCameraZ;

  wgpuQueueWriteBuffer(g_gpu.queue, g_gpu.uniform_buffer, 0, &uniforms, sizeof(uniforms));

  static float time_acc = 0.0f;
  time_acc += dt;

  PostProcessUniformData post_uniforms = {};
  post_uniforms.time = time_acc;
  post_uniforms.intensity = 1.0f; // Could be mapped to a game state param later
  post_uniforms.aberration = 0.01f; // Base aberration

  if (g_gpu.post_uniform_buffer) {
    wgpuQueueWriteBuffer(g_gpu.queue, g_gpu.post_uniform_buffer, 0, &post_uniforms, sizeof(post_uniforms));
  }
}

// kBlockWgsl (tetris::shaders namespace) generated from cpp/src/shaders/block/block.wgsl
// by scripts/generate-cpp-shaders.mjs — see generated/shader_sources.h.
using tetris::shaders::kBlockWgsl;

static void release_block_texture() {
  if (g_gpu.block_texture_view) {
    wgpuTextureViewRelease(g_gpu.block_texture_view);
    g_gpu.block_texture_view = nullptr;
  }
  if (g_gpu.block_sampler) {
    wgpuSamplerRelease(g_gpu.block_sampler);
    g_gpu.block_sampler = nullptr;
  }
  if (g_gpu.block_texture) {
    wgpuTextureRelease(g_gpu.block_texture);
    g_gpu.block_texture = nullptr;
  }
  g_gpu.texture_ready = false;
}

static bool create_placeholder_block_texture() {
  release_block_texture();
  if (!g_gpu.device) return false;

  static const uint8_t white_rgba[4] = {255, 255, 255, 255};

  WGPUTextureDescriptor tex_desc = {};
  tex_desc.size = {1, 1, 1};
  tex_desc.format = WGPUTextureFormat_RGBA8Unorm;
  tex_desc.usage = WGPUTextureUsage_TextureBinding | WGPUTextureUsage_CopyDst;
  tex_desc.mipLevelCount = 1;
  g_gpu.block_texture = wgpuDeviceCreateTexture(g_gpu.device, &tex_desc);
  if (!g_gpu.block_texture) return false;

  WGPUTexelCopyTextureInfo dest = {};
  dest.texture = g_gpu.block_texture;
  WGPUTexelCopyBufferLayout layout = {};
  layout.bytesPerRow = 4;
  layout.rowsPerImage = 1;
  WGPUExtent3D size = {1, 1, 1};
  wgpuQueueWriteTexture(g_gpu.queue, &dest, white_rgba, 4, &layout, &size);

  g_gpu.block_texture_view = wgpuTextureCreateView(g_gpu.block_texture, nullptr);

  WGPUSamplerDescriptor samp_desc = {};
  samp_desc.magFilter = WGPUFilterMode_Linear;
  samp_desc.minFilter = WGPUFilterMode_Linear;
  samp_desc.mipmapFilter = WGPUMipmapFilterMode_Nearest;
  g_gpu.block_sampler = wgpuDeviceCreateSampler(g_gpu.device, &samp_desc);

  return g_gpu.block_texture_view && g_gpu.block_sampler;
}

static bool recreate_post_bind_group() {
  if (g_gpu.post_bind_group) {
    wgpuBindGroupRelease(g_gpu.post_bind_group);
    g_gpu.post_bind_group = nullptr;
  }
  if (!g_gpu.post_pipeline || !g_gpu.post_uniform_buffer || !g_gpu.offscreen_view) {
    return false;
  }

  if (!g_gpu.post_sampler) {
    WGPUSamplerDescriptor samp_desc = {};
    samp_desc.magFilter = WGPUFilterMode_Linear;
    samp_desc.minFilter = WGPUFilterMode_Linear;
    samp_desc.mipmapFilter = WGPUMipmapFilterMode_Nearest;
    g_gpu.post_sampler = wgpuDeviceCreateSampler(g_gpu.device, &samp_desc);
  }

  WGPUBindGroupLayout layout = g_gpu.post_bind_group_layout;
  if (!layout) {
    layout = wgpuRenderPipelineGetBindGroupLayout(g_gpu.post_pipeline, 0);
  }

  WGPUBindGroupEntry entries[3] = {};
  entries[0].binding = 0;
  entries[0].buffer = g_gpu.post_uniform_buffer;
  entries[0].size = sizeof(PostProcessUniformData);
  entries[1].binding = 1;
  entries[1].sampler = g_gpu.post_sampler;
  entries[2].binding = 2;
  entries[2].textureView = g_gpu.offscreen_view;

  WGPUBindGroupDescriptor bg_desc = {};
  bg_desc.layout = layout;
  bg_desc.entryCount = 3;
  bg_desc.entries = entries;
  g_gpu.post_bind_group = wgpuDeviceCreateBindGroup(g_gpu.device, &bg_desc);
  return g_gpu.post_bind_group != nullptr;
}

static bool recreate_bind_group() {
  if (g_gpu.bind_group) {
    wgpuBindGroupRelease(g_gpu.bind_group);
    g_gpu.bind_group = nullptr;
  }
  if (!g_gpu.pipeline || !g_gpu.uniform_buffer || !g_gpu.block_texture_view || !g_gpu.block_sampler) {
    return false;
  }

  WGPUBindGroupLayout layout = g_gpu.bind_group_layout;
  if (!layout) {
    layout = wgpuRenderPipelineGetBindGroupLayout(g_gpu.pipeline, 0);
  }

  WGPUBindGroupEntry entries[3] = {};
  entries[0].binding = 0;
  entries[0].buffer = g_gpu.uniform_buffer;
  entries[0].size = sizeof(UniformData);
  entries[1].binding = 1;
  entries[1].textureView = g_gpu.block_texture_view;
  entries[2].binding = 2;
  entries[2].sampler = g_gpu.block_sampler;

  WGPUBindGroupDescriptor bg_desc = {};
  bg_desc.layout = layout;
  bg_desc.entryCount = 3;
  bg_desc.entries = entries;
  g_gpu.bind_group = wgpuDeviceCreateBindGroup(g_gpu.device, &bg_desc);
  return g_gpu.bind_group != nullptr;
}

static bool create_post_pipeline() {
  if (g_gpu.post_pipeline) return true;

  WGPUShaderModule shader = create_shader(tetris::shaders::kPostprocessWgsl);
  if (!shader) return false;

  WGPUBindGroupLayoutEntry bgl_entries[3] = {};
  bgl_entries[0].binding = 0;
  bgl_entries[0].visibility = WGPUShaderStage_Fragment;
  bgl_entries[0].buffer.type = WGPUBufferBindingType_Uniform;

  bgl_entries[1].binding = 1;
  bgl_entries[1].visibility = WGPUShaderStage_Fragment;
  bgl_entries[1].sampler.type = WGPUSamplerBindingType_Filtering;

  bgl_entries[2].binding = 2;
  bgl_entries[2].visibility = WGPUShaderStage_Fragment;
  bgl_entries[2].texture.sampleType = WGPUTextureSampleType_Float;
  bgl_entries[2].texture.viewDimension = WGPUTextureViewDimension_2D;

  WGPUBindGroupLayoutDescriptor bgl_desc = {};
  bgl_desc.entryCount = 3;
  bgl_desc.entries = bgl_entries;
  g_gpu.post_bind_group_layout = wgpuDeviceCreateBindGroupLayout(g_gpu.device, &bgl_desc);

  WGPUPipelineLayoutDescriptor layout_desc = {};
  layout_desc.bindGroupLayoutCount = 1;
  layout_desc.bindGroupLayouts = &g_gpu.post_bind_group_layout;
  WGPUPipelineLayout layout = wgpuDeviceCreatePipelineLayout(g_gpu.device, &layout_desc);

  WGPUColorTargetState color_target = {};
  color_target.format = g_gpu.surface_format;
  color_target.writeMask = WGPUColorWriteMask_All;

  WGPUFragmentState fragment = {};
  fragment.module = shader;
  fragment.entryPoint = make_stringview("fs_main");
  fragment.targetCount = 1;
  fragment.targets = &color_target;

  WGPURenderPipelineDescriptor pipe_desc = {};
  pipe_desc.layout = layout;
  pipe_desc.vertex.module = shader;
  pipe_desc.vertex.entryPoint = make_stringview("vs_main");
  pipe_desc.primitive.topology = WGPUPrimitiveTopology_TriangleList;
  pipe_desc.multisample.count = 1;
  pipe_desc.fragment = &fragment;

  g_gpu.post_pipeline = wgpuDeviceCreateRenderPipeline(g_gpu.device, &pipe_desc);

  wgpuPipelineLayoutRelease(layout);
  wgpuShaderModuleRelease(shader);
  return g_gpu.post_pipeline != nullptr;
}

static bool create_pipeline() {
  WGPUShaderModule shader = create_shader(kBlockWgsl);

  WGPUVertexAttribute attrs[] = {
      {.format = WGPUVertexFormat_Float32x3, .offset = 0, .shaderLocation = 0},
      {.format = WGPUVertexFormat_Float32x3, .offset = 12, .shaderLocation = 1},
      {.format = WGPUVertexFormat_Float32x2, .offset = 24, .shaderLocation = 2},
      {.format = WGPUVertexFormat_Float32x3, .offset = 0, .shaderLocation = 3},
      {.format = WGPUVertexFormat_Float32x4, .offset = 12, .shaderLocation = 4},
  };

  WGPUVertexBufferLayout layouts[2] = {
      {
          .stepMode = WGPUVertexStepMode_Vertex,
          .arrayStride = 8 * sizeof(float),
          .attributeCount = 3,
          .attributes = &attrs[0],
      },
      {
          .stepMode = WGPUVertexStepMode_Instance,
          .arrayStride = sizeof(BlockInstance),
          .attributeCount = 2,
          .attributes = &attrs[3],
      },
  };

  WGPUBindGroupLayoutEntry bgl_entries[3] = {};
  bgl_entries[0].binding = 0;
  bgl_entries[0].visibility = WGPUShaderStage_Vertex | WGPUShaderStage_Fragment;
  bgl_entries[0].buffer.type = WGPUBufferBindingType_Uniform;
  bgl_entries[0].buffer.minBindingSize = sizeof(UniformData);
  bgl_entries[1].binding = 1;
  bgl_entries[1].visibility = WGPUShaderStage_Fragment;
  bgl_entries[1].texture.sampleType = WGPUTextureSampleType_Float;
  bgl_entries[1].texture.viewDimension = WGPUTextureViewDimension_2D;
  bgl_entries[2].binding = 2;
  bgl_entries[2].visibility = WGPUShaderStage_Fragment;
  bgl_entries[2].sampler.type = WGPUSamplerBindingType_Filtering;

  WGPUBindGroupLayoutDescriptor bgl_desc = {};
  bgl_desc.entryCount = 3;
  bgl_desc.entries = bgl_entries;
  g_gpu.bind_group_layout = wgpuDeviceCreateBindGroupLayout(g_gpu.device, &bgl_desc);

  WGPUPipelineLayoutDescriptor layout_desc = {};
  layout_desc.bindGroupLayoutCount = 1;
  layout_desc.bindGroupLayouts = &g_gpu.bind_group_layout;
  WGPUPipelineLayout layout = wgpuDeviceCreatePipelineLayout(g_gpu.device, &layout_desc);

  WGPUBlendState blend = {};
  blend.color.srcFactor = WGPUBlendFactor_One;
  blend.color.dstFactor = WGPUBlendFactor_OneMinusSrcAlpha;
  blend.color.operation = WGPUBlendOperation_Add;
  blend.alpha.srcFactor = WGPUBlendFactor_One;
  blend.alpha.dstFactor = WGPUBlendFactor_OneMinusSrcAlpha;
  blend.alpha.operation = WGPUBlendOperation_Add;

  WGPUDepthStencilState depth_state = {};
  depth_state.format = WGPUTextureFormat_Depth24Plus;
  depth_state.depthWriteEnabled = WGPUOptionalBool_True;
  depth_state.depthCompare = WGPUCompareFunction_Less;

  WGPUColorTargetState color_target = {};
  color_target.format = g_gpu.surface_format;
  color_target.blend = &blend;
  color_target.writeMask = WGPUColorWriteMask_All;

  WGPUFragmentState fragment = {};
  fragment.module = shader;
  fragment.entryPoint = make_stringview("fs_main");
  fragment.targetCount = 1;
  fragment.targets = &color_target;

  WGPURenderPipelineDescriptor pipe_desc = {};
  pipe_desc.layout = layout;
  pipe_desc.vertex.module = shader;
  pipe_desc.vertex.entryPoint = make_stringview("vs_main");
  pipe_desc.vertex.bufferCount = 2;
  pipe_desc.vertex.buffers = layouts;
  pipe_desc.primitive.topology = WGPUPrimitiveTopology_TriangleList;
  pipe_desc.primitive.cullMode = WGPUCullMode_Back;
  pipe_desc.primitive.frontFace = WGPUFrontFace_CCW;
  pipe_desc.depthStencil = &depth_state;
  pipe_desc.multisample.count = 1;
  pipe_desc.fragment = &fragment;

  g_gpu.pipeline = wgpuDeviceCreateRenderPipeline(g_gpu.device, &pipe_desc);

  wgpuPipelineLayoutRelease(layout);
  wgpuShaderModuleRelease(shader);
  return g_gpu.pipeline != nullptr;
}

static bool create_mesh_buffers() {
  // pos(3) + normal(3) + uv(2) per vertex — 24 verts (unique UVs per face)
  static const float cube_verts[] = {
      // +Z
      -0.5f,-0.5f, 0.5f,  0,0,1,  0,0,
       0.5f,-0.5f, 0.5f,  0,0,1,  1,0,
       0.5f, 0.5f, 0.5f,  0,0,1,  1,1,
      -0.5f, 0.5f, 0.5f,  0,0,1,  0,1,
      // -Z
       0.5f,-0.5f,-0.5f,  0,0,-1,  0,0,
      -0.5f,-0.5f,-0.5f,  0,0,-1,  1,0,
      -0.5f, 0.5f,-0.5f,  0,0,-1,  1,1,
       0.5f, 0.5f,-0.5f,  0,0,-1,  0,1,
      // +X
       0.5f,-0.5f, 0.5f,  1,0,0,  0,0,
       0.5f,-0.5f,-0.5f,  1,0,0,  1,0,
       0.5f, 0.5f,-0.5f,  1,0,0,  1,1,
       0.5f, 0.5f, 0.5f,  1,0,0,  0,1,
      // -X
      -0.5f,-0.5f,-0.5f, -1,0,0,  0,0,
      -0.5f,-0.5f, 0.5f, -1,0,0,  1,0,
      -0.5f, 0.5f, 0.5f, -1,0,0,  1,1,
      -0.5f, 0.5f,-0.5f, -1,0,0,  0,1,
      // +Y
      -0.5f, 0.5f, 0.5f,  0,1,0,  0,0,
       0.5f, 0.5f, 0.5f,  0,1,0,  1,0,
       0.5f, 0.5f,-0.5f,  0,1,0,  1,1,
      -0.5f, 0.5f,-0.5f,  0,1,0,  0,1,
      // -Y
      -0.5f,-0.5f,-0.5f,  0,-1,0,  0,0,
       0.5f,-0.5f,-0.5f,  0,-1,0,  1,0,
       0.5f,-0.5f, 0.5f,  0,-1,0,  1,1,
      -0.5f,-0.5f, 0.5f,  0,-1,0,  0,1,
  };
  static const uint16_t cube_indices[] = {
      0,1,2, 2,3,0,   4,5,6, 6,7,4,   8,9,10, 10,11,8,
      12,13,14, 14,15,12,  16,17,18, 18,19,16,  20,21,22, 22,23,20,
  };

  g_gpu.vertex_buffer = create_buffer(cube_verts, sizeof(cube_verts), WGPUBufferUsage_Vertex);
  g_gpu.index_buffer = create_buffer(cube_indices, sizeof(cube_indices), WGPUBufferUsage_Index);
  g_gpu.instance_buffer = create_buffer(nullptr, sizeof(BlockInstance) * kMaxInstances, WGPUBufferUsage_Vertex);
  g_gpu.uniform_buffer = create_buffer(nullptr, sizeof(UniformData), WGPUBufferUsage_Uniform);
  g_gpu.post_uniform_buffer = create_buffer(nullptr, sizeof(PostProcessUniformData), WGPUBufferUsage_Uniform);

  if (!create_placeholder_block_texture()) return false;
  return recreate_bind_group() && recreate_post_bind_group() &&
         g_gpu.vertex_buffer && g_gpu.index_buffer && g_gpu.instance_buffer && g_gpu.uniform_buffer && g_gpu.post_uniform_buffer;
}

} // namespace

extern "C" {

int gpu_renderer_is_active(void) {
  return g_gpu.active ? 1 : 0;
}

int gpu_renderer_init(const char* canvas_selector, int width, int height) {
  gpu_renderer_shutdown();

  if (canvas_selector && canvas_selector[0]) {
    strncpy(g_gpu.canvas_selector, canvas_selector, sizeof(g_gpu.canvas_selector) - 1);
  }

  g_gpu.width = width > 0 ? width : 1;
  g_gpu.height = height > 0 ? height : 1;
  g_gpu.surface_format = preferred_surface_format();

  g_gpu.instance = wgpuCreateInstance(nullptr);
  g_gpu.device = emscripten_webgpu_get_device();
  if (!g_gpu.device) {
    EM_ASM({ if (console.warn) console.warn('[cpp renderer] emscripten_webgpu_get_device() null - set preinitializedWebGPUDevice in TS'); });
    return 0;
  }
  g_gpu.queue = wgpuDeviceGetQueue(g_gpu.device);

  create_surface();
  if (!g_gpu.surface) return 0;

  // Surface + clear path is the minimum WebGPU milestone; block pipeline is optional.
  g_gpu.active = true;
  g_gpu.draw_blocks = false;

  if (create_pipeline() && create_post_pipeline() && create_mesh_buffers()) {
    g_gpu.draw_blocks = true;
    EM_ASM({ if (console.info) console.info('[cpp renderer] WebGPU instanced textured block pipeline ready'); });
  } else {
    EM_ASM({ if (console.info) console.info('[cpp renderer] WebGPU clear-only path (block pipeline skipped)'); });
  }

  EM_ASM({ if (console.info) console.info('[cpp renderer] WebGPU surface ready (preferred format, transparent clear for video portal)'); });
  return 1;
}

void gpu_renderer_resize(int width, int height) {
  if (!g_gpu.active) return;
  g_gpu.width = width > 0 ? width : 1;
  g_gpu.height = height > 0 ? height : 1;
  configure_surface();
  create_render_targets();
  recreate_post_bind_group();
}

void gpu_renderer_shutdown(void) {
  if (g_gpu.post_bind_group) wgpuBindGroupRelease(g_gpu.post_bind_group);
  if (g_gpu.post_bind_group_layout) wgpuBindGroupLayoutRelease(g_gpu.post_bind_group_layout);
  if (g_gpu.post_uniform_buffer) wgpuBufferRelease(g_gpu.post_uniform_buffer);
  if (g_gpu.post_pipeline) wgpuRenderPipelineRelease(g_gpu.post_pipeline);
  if (g_gpu.post_sampler) wgpuSamplerRelease(g_gpu.post_sampler);

  if (g_gpu.bind_group) wgpuBindGroupRelease(g_gpu.bind_group);
  if (g_gpu.bind_group_layout) wgpuBindGroupLayoutRelease(g_gpu.bind_group_layout);
  if (g_gpu.uniform_buffer) wgpuBufferRelease(g_gpu.uniform_buffer);
  if (g_gpu.instance_buffer) wgpuBufferRelease(g_gpu.instance_buffer);
  if (g_gpu.index_buffer) wgpuBufferRelease(g_gpu.index_buffer);
  if (g_gpu.vertex_buffer) wgpuBufferRelease(g_gpu.vertex_buffer);
  if (g_gpu.pipeline) wgpuRenderPipelineRelease(g_gpu.pipeline);
  release_block_texture();
  release_render_targets();
  if (g_gpu.surface) wgpuSurfaceRelease(g_gpu.surface);
  if (g_gpu.queue) wgpuQueueRelease(g_gpu.queue);
  if (g_gpu.device) wgpuDeviceRelease(g_gpu.device);
  if (g_gpu.instance) wgpuInstanceRelease(g_gpu.instance);
  g_gpu = {};
}

void gpu_renderer_render(const int8_t* playfield, int cols, int rows,
                         const PieceState* piece_state, float dt) {
  if (!g_gpu.active || !playfield || !g_gpu.surface) return;

  BlockInstance instances[kMaxInstances];
  const int instance_count = build_instances(playfield, cols, rows, piece_state, instances, kMaxInstances);
  if (instance_count > 0) {
    wgpuQueueWriteBuffer(g_gpu.queue, g_gpu.instance_buffer, 0, instances,
                         static_cast<size_t>(instance_count) * sizeof(BlockInstance));
  }
  update_uniforms(dt);

  WGPUSurfaceTexture surface_tex = {};
  wgpuSurfaceGetCurrentTexture(g_gpu.surface, &surface_tex);
  if (surface_tex.status != WGPUSurfaceGetCurrentTextureStatus_SuccessOptimal &&
      surface_tex.status != WGPUSurfaceGetCurrentTextureStatus_SuccessSuboptimal) {
    return;
  }

  WGPUTextureView color_view = wgpuTextureCreateView(surface_tex.texture, nullptr);
  WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(g_gpu.device, nullptr);

  // Pass 1: Render blocks to offscreen texture
  WGPURenderPassColorAttachment block_color_att = {};
  block_color_att.view = g_gpu.offscreen_view;
  block_color_att.loadOp = WGPULoadOp_Clear;
  block_color_att.storeOp = WGPUStoreOp_Store;
  block_color_att.clearValue = kClearColorTransparent;

  WGPURenderPassDepthStencilAttachment depth_att = {};
  depth_att.view = g_gpu.depth_view;
  depth_att.depthLoadOp = WGPULoadOp_Clear;
  depth_att.depthStoreOp = WGPUStoreOp_Store;
  depth_att.depthClearValue = 1.0f;

  WGPURenderPassDescriptor block_pass_desc = {};
  block_pass_desc.colorAttachmentCount = 1;
  block_pass_desc.colorAttachments = &block_color_att;
  block_pass_desc.depthStencilAttachment = g_gpu.depth_view ? &depth_att : nullptr;

  WGPURenderPassEncoder block_pass = wgpuCommandEncoderBeginRenderPass(encoder, &block_pass_desc);

  if (instance_count > 0 && g_gpu.draw_blocks && g_gpu.pipeline) {
    wgpuRenderPassEncoderSetPipeline(block_pass, g_gpu.pipeline);
    wgpuRenderPassEncoderSetBindGroup(block_pass, 0, g_gpu.bind_group, 0, nullptr);
    wgpuRenderPassEncoderSetVertexBuffer(block_pass, 0, g_gpu.vertex_buffer, 0, WGPU_WHOLE_SIZE);
    wgpuRenderPassEncoderSetVertexBuffer(block_pass, 1, g_gpu.instance_buffer, 0, WGPU_WHOLE_SIZE);
    wgpuRenderPassEncoderSetIndexBuffer(block_pass, g_gpu.index_buffer, WGPUIndexFormat_Uint16, 0, WGPU_WHOLE_SIZE);
    wgpuRenderPassEncoderDrawIndexed(block_pass, 36, static_cast<uint32_t>(instance_count), 0, 0, 0);
  }
  wgpuRenderPassEncoderEnd(block_pass);
  wgpuRenderPassEncoderRelease(block_pass);

  // Pass 2: Post-processing to surface texture
  WGPURenderPassColorAttachment post_color_att = {};
  post_color_att.view = color_view;
  post_color_att.loadOp = WGPULoadOp_Clear;
  post_color_att.storeOp = WGPUStoreOp_Store;
  post_color_att.clearValue = kClearColorTransparent;

  WGPURenderPassDescriptor post_pass_desc = {};
  post_pass_desc.colorAttachmentCount = 1;
  post_pass_desc.colorAttachments = &post_color_att;
  // No depth attachment for post-process pass

  WGPURenderPassEncoder post_pass = wgpuCommandEncoderBeginRenderPass(encoder, &post_pass_desc);

  if (g_gpu.post_pipeline && g_gpu.post_bind_group) {
    wgpuRenderPassEncoderSetPipeline(post_pass, g_gpu.post_pipeline);
    wgpuRenderPassEncoderSetBindGroup(post_pass, 0, g_gpu.post_bind_group, 0, nullptr);
    wgpuRenderPassEncoderDraw(post_pass, 3, 1, 0, 0);
  }

  wgpuRenderPassEncoderEnd(post_pass);
  wgpuRenderPassEncoderRelease(post_pass);

  WGPUCommandBuffer cmd = wgpuCommandEncoderFinish(encoder, nullptr);
  wgpuQueueSubmit(g_gpu.queue, 1, &cmd);

  wgpuCommandBufferRelease(cmd);
  wgpuCommandEncoderRelease(encoder);
  wgpuTextureViewRelease(color_view);
  wgpuTextureRelease(surface_tex.texture);
  wgpuSurfacePresent(g_gpu.surface);
}

int gpu_renderer_set_block_texture(const uint8_t* data, int width, int height, int byte_len) {
  if (!g_gpu.active || !g_gpu.device || !g_gpu.queue || !data || width <= 0 || height <= 0) {
    return 0;
  }

  const size_t expected = static_cast<size_t>(width) * static_cast<size_t>(height) * 4u;
  if (byte_len < 0 || static_cast<size_t>(byte_len) < expected) {
    return 0;
  }

  release_block_texture();

  WGPUTextureDescriptor tex_desc = {};
  tex_desc.size = {static_cast<uint32_t>(width), static_cast<uint32_t>(height), 1};
  tex_desc.format = WGPUTextureFormat_RGBA8Unorm;
  tex_desc.usage = WGPUTextureUsage_TextureBinding | WGPUTextureUsage_CopyDst;
  tex_desc.mipLevelCount = 1;
  g_gpu.block_texture = wgpuDeviceCreateTexture(g_gpu.device, &tex_desc);
  if (!g_gpu.block_texture) return 0;

  WGPUTexelCopyTextureInfo dest = {};
  dest.texture = g_gpu.block_texture;
  WGPUTexelCopyBufferLayout layout = {};
  layout.bytesPerRow = static_cast<uint32_t>(width) * 4u;
  layout.rowsPerImage = static_cast<uint32_t>(height);
  WGPUExtent3D size = {static_cast<uint32_t>(width), static_cast<uint32_t>(height), 1};
  wgpuQueueWriteTexture(g_gpu.queue, &dest, data, expected, &layout, &size);

  g_gpu.block_texture_view = wgpuTextureCreateView(g_gpu.block_texture, nullptr);
  if (!g_gpu.block_sampler) {
    WGPUSamplerDescriptor samp_desc = {};
    samp_desc.magFilter = WGPUFilterMode_Linear;
    samp_desc.minFilter = WGPUFilterMode_Linear;
    samp_desc.mipmapFilter = WGPUMipmapFilterMode_Nearest;
    g_gpu.block_sampler = wgpuDeviceCreateSampler(g_gpu.device, &samp_desc);
  }

  g_gpu.texture_ready = g_gpu.block_texture_view != nullptr && g_gpu.block_sampler != nullptr;
  if (g_gpu.texture_ready && !recreate_bind_group()) {
    g_gpu.texture_ready = false;
    return 0;
  }

  if (g_gpu.texture_ready) {
    EM_ASM({
      if (typeof console !== 'undefined' && console.info) {
        console.info('[cpp renderer] block.png uploaded to GPU texture');
      }
    });
  }
  return g_gpu.texture_ready ? 1 : 0;
}

} // extern "C"

#else // !TETRIS_ENABLE_WEBGPU

extern "C" {

int gpu_renderer_is_active(void) { return 0; }

int gpu_renderer_init(const char* canvas_selector, int width, int height) {
  (void)canvas_selector;
  (void)width;
  (void)height;
  return 0;
}

void gpu_renderer_resize(int width, int height) {
  (void)width;
  (void)height;
}

void gpu_renderer_shutdown(void) {}

void gpu_renderer_render(const int8_t* playfield, int cols, int rows,
                         const PieceState* piece_state, float dt) {
  (void)playfield;
  (void)cols;
  (void)rows;
  (void)piece_state;
  (void)dt;
}

int gpu_renderer_set_block_texture(const uint8_t* data, int width, int height, int byte_len) {
  (void)data;
  (void)width;
  (void)height;
  (void)byte_len;
  return 0;
}

} // extern "C"

#endif // TETRIS_ENABLE_WEBGPU
