/**
 * PBR helper functions injected into the block fragment shader.
 *
 * Two halves, both loaded raw with no transformation:
 *   - ../wgsl/block/pbrCore.wgsl      — binding-free; shared verbatim with the C++ renderer
 *   - ../wgsl/block/pbrFunctions.wgsl — reads IBL / backdrop @bindings, TS-only for now
 */
import core from '../wgsl/block/pbrCore.wgsl?raw';
import bindingDependent from '../wgsl/block/pbrFunctions.wgsl?raw';

/** Binding-free half, also embedded into cpp/src/generated/shader_sources.h. */
export const BLOCK_PBR_CORE_WGSL = core;

export const BLOCK_PBR_FUNCTIONS_WGSL = `${core}\n${bindingDependent}`;

/** @deprecated Re-export for tests that imported PBRFunctions from pbrBlocks */
export const PBRFunctions = BLOCK_PBR_FUNCTIONS_WGSL;
