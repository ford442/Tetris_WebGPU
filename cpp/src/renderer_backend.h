#pragma once

/** Active C++ draw backend — returned by get_renderer_backend(). */
enum RendererBackend {
  RENDERER_BACKEND_NONE = 0,
  RENDERER_BACKEND_CANVAS2D = 1,
  RENDERER_BACKEND_WEBGPU = 2,
};
