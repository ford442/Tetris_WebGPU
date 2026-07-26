/**
 * PBR helper functions injected into the block fragment shader.
 * Source of truth: ../wgsl/block/pbrFunctions.wgsl (loaded raw, no transformation).
 */
import wgsl from '../wgsl/block/pbrFunctions.wgsl?raw';

export const BLOCK_PBR_FUNCTIONS_WGSL = wgsl;

/** @deprecated Re-export for tests that imported PBRFunctions from pbrBlocks */
export const PBRFunctions = BLOCK_PBR_FUNCTIONS_WGSL;
