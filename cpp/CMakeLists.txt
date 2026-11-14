# CMake / Ninja path for the C++ renderer. Two modes:
#
#  1. Emscripten (default): builds public/cpp/tetris_renderer.{js,wasm}
#       emcmake cmake -S cpp -B build/cpp-cmake -G Ninja -DCMAKE_BUILD_TYPE=Release \
#         -DTETRIS_CPP_WEBGPU_BACKEND=emdawn
#       cmake --build build/cpp-cmake
#
#  2. Host unit tests for the pure headers (no emsdk, host compiler, doctest):
#       cmake -S cpp -B build/cpp-native -DTETRIS_CPP_NATIVE_TESTS=ON
#       cmake --build build/cpp-native && ctest --test-dir build/cpp-native --output-on-failure
#
# Sources, flags, exports and WebGPU port flags come from cpp/build.config.json — the
# same file scripts/build-cpp.mjs reads. Never hand-copy any of them here.
#
# TETRIS_CPP_WEBGPU_BACKEND: auto | emdawn | legacy | none
#   `auto` is the FIRST rung of build-cpp.mjs's ladder (emdawn) and nothing else: CMake
#   has no try-link ladder, so it fails instead of silently degrading to a Canvas2D-only
#   module the loader refuses to boot.
#
# compile_commands.json is emitted at <build dir>/compile_commands.json.

cmake_minimum_required(VERSION 3.20)
project(TetrisCppRenderer LANGUAGES CXX)

option(TETRIS_CPP_NATIVE_TESTS "Build the host-side doctest suite for the pure headers (no Emscripten)" OFF)

# Optimization/debug flags come from build.config.json only. CMake's per-config
# defaults (-O3 -DNDEBUG / -g) would make this path emit a different wasm than
# build-cpp.mjs (-DNDEBUG strips asserts), so they are emptied.
set(CMAKE_CXX_FLAGS_RELEASE "")
set(CMAKE_CXX_FLAGS_DEBUG "")
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF) # -std=c++17, not gnu++17 — same as build-cpp.mjs
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

set(TETRIS_CPP_ROOT "${CMAKE_CURRENT_SOURCE_DIR}")
set(TETRIS_REPO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/..")

# ---- cpp/build.config.json ---------------------------------------------------
set(TETRIS_BUILD_CONFIG "${TETRIS_CPP_ROOT}/build.config.json")
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${TETRIS_BUILD_CONFIG}")
file(READ "${TETRIS_BUILD_CONFIG}" TETRIS_CFG)

# tetris_json_list(<out> <json> <key>...): JSON array of strings -> CMake list.
function(tetris_json_list out json)
  string(JSON len LENGTH "${json}" ${ARGN})
  set(items "")
  if(len GREATER 0)
    math(EXPR last "${len} - 1")
    foreach(i RANGE ${last})
      string(JSON item GET "${json}" ${ARGN} ${i})
      list(APPEND items "${item}")
    endforeach()
  endif()
  set(${out} "${items}" PARENT_SCOPE)
endfunction()

# tetris_json_settings(<out> <json> <key>...): {"K": "V"} object -> list of -sK=V.
function(tetris_json_settings out json)
  string(JSON len LENGTH "${json}" ${ARGN})
  set(items "")
  if(len GREATER 0)
    math(EXPR last "${len} - 1")
    foreach(i RANGE ${last})
      string(JSON key MEMBER "${json}" ${ARGN} ${i})
      string(JSON value GET "${json}" ${ARGN} ${key})
      list(APPEND items "-s${key}=${value}")
    endforeach()
  endif()
  set(${out} "${items}" PARENT_SCOPE)
endfunction()

string(JSON TETRIS_STD GET "${TETRIS_CFG}" std)
string(REGEX REPLACE "^c\\+\\+" "" TETRIS_STD_NUM "${TETRIS_STD}")
set(CMAKE_CXX_STANDARD "${TETRIS_STD_NUM}")

tetris_json_list(TETRIS_WARNING_FLAGS "${TETRIS_CFG}" compile warnings)
if("$ENV{CI}" STREQUAL "1" OR "$ENV{CI}" STREQUAL "true")
  list(APPEND TETRIS_WARNING_FLAGS -Werror)
endif()

# ---- Host unit tests (no Emscripten) ----------------------------------------
if(TETRIS_CPP_NATIVE_TESTS)
  if(EMSCRIPTEN)
    message(FATAL_ERROR "TETRIS_CPP_NATIVE_TESTS builds with the host compiler — run plain `cmake`, not `emcmake`.")
  endif()
  enable_testing()
  add_subdirectory(tests)
  return()
endif()

# ---- Emscripten renderer -----------------------------------------------------
if(NOT EMSCRIPTEN)
  message(FATAL_ERROR
    "This CMake project targets Emscripten. Use: emcmake cmake -S cpp -B build/cpp-cmake -G Ninja\n"
    "For the host unit tests use: cmake -S cpp -B build/cpp-native -DTETRIS_CPP_NATIVE_TESTS=ON")
endif()

set(TETRIS_CPP_WEBGPU_BACKEND "auto" CACHE STRING "WebGPU backend: auto|emdawn|legacy|none")
set(TETRIS_OUT_DIR "${TETRIS_REPO_ROOT}/public/cpp" CACHE PATH "Where tetris_renderer.{js,wasm} are written (override to keep public/cpp untouched)")

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

tetris_json_list(TETRIS_SOURCES "${TETRIS_CFG}" sources)
tetris_json_list(TETRIS_INCLUDE_DIRS "${TETRIS_CFG}" includeDirs)
tetris_json_list(TETRIS_LANGUAGE_FLAGS "${TETRIS_CFG}" compile language)
tetris_json_list(TETRIS_RUNTIME_METHODS "${TETRIS_CFG}" link exportedRuntimeMethods)
tetris_json_list(TETRIS_EXPORTS_LOADER "${TETRIS_CFG}" exports loader)
tetris_json_list(TETRIS_EXPORTS_EXTRA "${TETRIS_CFG}" exports extra)
tetris_json_settings(TETRIS_LINK_SETTINGS "${TETRIS_CFG}" link settings)

if(CMAKE_BUILD_TYPE STREQUAL "Debug")
  tetris_json_list(TETRIS_OPT_FLAGS "${TETRIS_CFG}" optimize debug)
  tetris_json_settings(TETRIS_DEBUG_SETTINGS "${TETRIS_CFG}" link debugSettings)
  list(APPEND TETRIS_LINK_SETTINGS ${TETRIS_DEBUG_SETTINGS})
else()
  tetris_json_list(TETRIS_OPT_FLAGS "${TETRIS_CFG}" optimize release)
  # Opt-in experiments (e.g. TETRIS_CPP_SIMD=1 -> -msimd128), same env vars as build-cpp.mjs.
  string(JSON n_optional LENGTH "${TETRIS_CFG}" optionalFlags)
  math(EXPR last_optional "${n_optional} - 1")
  foreach(i RANGE ${last_optional})
    string(JSON opt_key MEMBER "${TETRIS_CFG}" optionalFlags ${i})
    if(NOT opt_key MATCHES "^\\$")
      string(JSON opt_env GET "${TETRIS_CFG}" optionalFlags ${opt_key} env)
      if("$ENV{${opt_env}}" STREQUAL "1")
        tetris_json_list(opt_flags "${TETRIS_CFG}" optionalFlags ${opt_key} flags)
        list(APPEND TETRIS_OPT_FLAGS ${opt_flags})
      endif()
    endif()
  endforeach()
endif()

set(TETRIS_EXPORTS ${TETRIS_EXPORTS_LOADER} ${TETRIS_EXPORTS_EXTRA})
list(JOIN TETRIS_EXPORTS "," TETRIS_EXPORTS_CSV)
list(JOIN TETRIS_RUNTIME_METHODS "," TETRIS_RUNTIME_METHODS_CSV)

set(TETRIS_SOURCE_PATHS "")
foreach(src IN LISTS TETRIS_SOURCES)
  list(APPEND TETRIS_SOURCE_PATHS "${TETRIS_CPP_ROOT}/${src}")
endforeach()

# Generate cpp/src/generated/: the embedded WGSL (cpp/src/shaders/**/*.wgsl plus
# the modules shared with the TS renderer) and the block uniform struct derived
# from shared/authoredBlockUniforms.json, so gpu_renderer.cpp never hand-copies a
# WGSL string or a byte offset. Pure Node, no emcc needed; always re-run (ALL) so
# a stale header can't get compiled by accident.
find_program(NODE_EXECUTABLE node REQUIRED)
add_custom_target(generate_cpp_shaders ALL
  COMMAND "${NODE_EXECUTABLE}" "${TETRIS_REPO_ROOT}/scripts/generate-cpp-shaders.mjs"
  COMMAND "${NODE_EXECUTABLE}" "${TETRIS_REPO_ROOT}/scripts/generate-cpp-uniforms.mjs"
  COMMAND "${NODE_EXECUTABLE}" "${TETRIS_REPO_ROOT}/scripts/generate-cpp-material.mjs"
  WORKING_DIRECTORY "${TETRIS_REPO_ROOT}"
  COMMENT "Generating cpp/src/generated/ (embedded WGSL + block uniform struct)"
  VERBATIM
)

add_executable(tetris_renderer ${TETRIS_SOURCE_PATHS})
add_dependencies(tetris_renderer generate_cpp_shaders)
foreach(dir IN LISTS TETRIS_INCLUDE_DIRS)
  target_include_directories(tetris_renderer PRIVATE "${TETRIS_CPP_ROOT}/${dir}")
endforeach()

target_compile_options(tetris_renderer PRIVATE ${TETRIS_LANGUAGE_FLAGS} ${TETRIS_WARNING_FLAGS} ${TETRIS_OPT_FLAGS})
# LTO (and any -m flag) must reach the link step too, so the optimize flags go to both.
target_link_options(tetris_renderer PRIVATE
  ${TETRIS_OPT_FLAGS}
  ${TETRIS_LINK_SETTINGS}
  "-sEXPORTED_FUNCTIONS=[${TETRIS_EXPORTS_CSV}]"
  "-sEXPORTED_RUNTIME_METHODS=[${TETRIS_RUNTIME_METHODS_CSV}]"
)

set_property(TARGET tetris_renderer PROPERTY OUTPUT_NAME "tetris_renderer")
set_target_properties(tetris_renderer PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${TETRIS_OUT_DIR}"
  SUFFIX ".js"
)

# WebGPU port flags come from build.config.json (webgpuPorts). They go to compile AND
# link: --use-port also supplies the <webgpu/webgpu.h> include path.
if(TETRIS_CPP_WEBGPU_BACKEND STREQUAL "auto" OR TETRIS_CPP_WEBGPU_BACKEND STREQUAL "emdawn")
  set(TETRIS_PORT_RUNG EMDAWN)
elseif(TETRIS_CPP_WEBGPU_BACKEND STREQUAL "legacy")
  set(TETRIS_PORT_RUNG USE_WEBGPU)
elseif(TETRIS_CPP_WEBGPU_BACKEND STREQUAL "none")
  set(TETRIS_PORT_RUNG NONE)
else()
  message(FATAL_ERROR "Unknown TETRIS_CPP_WEBGPU_BACKEND=${TETRIS_CPP_WEBGPU_BACKEND}")
endif()
tetris_json_list(TETRIS_PORT_ARGS "${TETRIS_CFG}" webgpuPorts ${TETRIS_PORT_RUNG} args)
if(TETRIS_PORT_ARGS)
  target_compile_options(tetris_renderer PRIVATE ${TETRIS_PORT_ARGS})
  target_link_options(tetris_renderer PRIVATE ${TETRIS_PORT_ARGS})
endif()

message(STATUS "Tetris C++ renderer: Emscripten backend=${TETRIS_CPP_WEBGPU_BACKEND} (${TETRIS_PORT_RUNG}), ${CMAKE_BUILD_TYPE}")
