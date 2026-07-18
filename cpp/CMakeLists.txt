# Optional CMake / Ninja path for the C++ renderer (Emscripten).
#
# Requires emsdk on PATH (source emsdk_env.sh) or EMSDK env var.
#
#   emcmake cmake -S cpp -B build/cpp-cmake -G Ninja \
#     -DTETRIS_CPP_WEBGPU_BACKEND=emdawn
#   cmake --build build/cpp-cmake
#
# compile_commands.json is emitted at build/cpp-cmake/compile_commands.json
# (symlink or copy to build/cpp/ if you prefer a single clangd database).
#
# TETRIS_CPP_WEBGPU_BACKEND: auto | emdawn | legacy | none

cmake_minimum_required(VERSION 3.20)
project(TetrisCppRenderer LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

set(TETRIS_CPP_WEBGPU_BACKEND "auto" CACHE STRING "WebGPU backend: auto|emdawn|legacy|none")

set(TETRIS_CPP_SOURCES
  src/renderer.cpp
  src/playfield_draw.cpp
  src/gpu_renderer.cpp
)

set(TETRIS_CPP_ROOT "${CMAKE_CURRENT_SOURCE_DIR}")
set(TETRIS_REPO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/..")
set(TETRIS_OUT_JS "${TETRIS_REPO_ROOT}/public/cpp/tetris_renderer.js")

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR
    "This CMake project targets Emscripten. Use: emcmake cmake -S cpp -B build/cpp-cmake -G Ninja")
endif()

add_executable(tetris_renderer ${TETRIS_CPP_SOURCES})
target_include_directories(tetris_renderer PRIVATE src)

target_compile_options(tetris_renderer PRIVATE -O3)
target_link_options(tetris_renderer PRIVATE
  "-sMODULARIZE=1"
  "-sEXPORT_NAME=createTetrisRendererModule"
  "-sENVIRONMENT=web"
  "-sALLOW_MEMORY_GROWTH=1"
  "-sEXPORTED_FUNCTIONS=[_init_renderer,_resize_renderer,_render_frame,_update_playfield,_get_playfield_ptr,_get_playfield_len,_get_piece_state_ptr,_update_piece_state,_get_renderer_backend,_is_gpu_renderer_active,_is_canvas_fallback_active,_set_block_texture_rgba,_malloc,_free]"
  "-sEXPORTED_RUNTIME_METHODS=[ccall,cwrap,HEAP8,HEAPU8]"
)

set_property(TARGET tetris_renderer PROPERTY OUTPUT_NAME "tetris_renderer.js")
set_target_properties(tetris_renderer PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${TETRIS_REPO_ROOT}/public/cpp"
  SUFFIX ".js"
)

if(TETRIS_CPP_WEBGPU_BACKEND STREQUAL "legacy")
  target_compile_definitions(tetris_renderer PRIVATE TETRIS_ENABLE_WEBGPU=1)
  target_link_options(tetris_renderer PRIVATE "-sUSE_WEBGPU=1")
elseif(TETRIS_CPP_WEBGPU_BACKEND STREQUAL "emdawn")
  target_compile_definitions(tetris_renderer PRIVATE TETRIS_ENABLE_WEBGPU=1)
  target_link_options(tetris_renderer PRIVATE "--use-port=emdawnwebgpu")
elseif(TETRIS_CPP_WEBGPU_BACKEND STREQUAL "none")
  # Canvas2D stubs only
elseif(TETRIS_CPP_WEBGPU_BACKEND STREQUAL "auto")
  target_compile_definitions(tetris_renderer PRIVATE TETRIS_ENABLE_WEBGPU=1)
  target_link_options(tetris_renderer PRIVATE "--use-port=emdawnwebgpu")
else()
  message(FATAL_ERROR "Unknown TETRIS_CPP_WEBGPU_BACKEND=${TETRIS_CPP_WEBGPU_BACKEND}")
endif()

message(STATUS "Tetris C++ renderer: Emscripten backend=${TETRIS_CPP_WEBGPU_BACKEND}")
