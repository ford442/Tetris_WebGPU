# Host-side unit tests for the pure headers (piece_state.h, board_metrics.h,
# math_utils.h, block_sampler.h). Built with the host compiler — no emsdk.
# Configure with: cmake -S cpp -B build/cpp-native -DTETRIS_CPP_NATIVE_TESTS=ON
#
# doctest is a single header, fetched at configure time and verified against a pinned
# SHA-256. It is test-only: nothing here is ever linked into the wasm.

include(FetchContent)

FetchContent_Declare(doctest_header
  URL https://raw.githubusercontent.com/doctest/doctest/v2.4.11/doctest/doctest.h
  URL_HASH SHA256=44faa038e9c3f9728efbda143748d01124ea0a27f4bf78f35a15d8fab2e039fb
  DOWNLOAD_NO_EXTRACT TRUE
)
FetchContent_MakeAvailable(doctest_header)

# The expected numbers come from shared/cppParityVectors.json (also asserted by
# tests/cpp-parity-vectors.test.ts); the generated header is rebuilt on every build.
find_program(NODE_EXECUTABLE node REQUIRED)
set(TETRIS_VECTORS_HEADER "${CMAKE_CURRENT_SOURCE_DIR}/generated/parity_vectors.h")
add_custom_command(
  OUTPUT "${TETRIS_VECTORS_HEADER}"
  COMMAND "${NODE_EXECUTABLE}" "${TETRIS_REPO_ROOT}/scripts/generate-cpp-test-vectors.mjs"
  DEPENDS "${TETRIS_REPO_ROOT}/shared/cppParityVectors.json"
          "${TETRIS_REPO_ROOT}/scripts/generate-cpp-test-vectors.mjs"
  WORKING_DIRECTORY "${TETRIS_REPO_ROOT}"
  COMMENT "Generating cpp/tests/generated/parity_vectors.h"
  VERBATIM
)

add_executable(tetris_cpp_tests
  main.cpp
  board_metrics_test.cpp
  math_utils_test.cpp
  piece_state_test.cpp
  block_sampler_test.cpp
  "${TETRIS_VECTORS_HEADER}"
)
target_include_directories(tetris_cpp_tests PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}"            # generated/parity_vectors.h
  "${CMAKE_CURRENT_SOURCE_DIR}/stubs"      # <webgpu/webgpu.h> subset
  "${TETRIS_CPP_ROOT}/src"                 # the headers under test
)
# doctest.h was downloaded under its own name; it is included as <doctest.h>.
target_include_directories(tetris_cpp_tests SYSTEM PRIVATE "${doctest_header_SOURCE_DIR}")
# Same warning set as the wasm build; exceptions stay ON (doctest uses them).
target_compile_options(tetris_cpp_tests PRIVATE ${TETRIS_WARNING_FLAGS})

add_test(NAME tetris_cpp_tests COMMAND tetris_cpp_tests)
