/**
 * Authoritative block shader factory.
 * All production themes use this single parametric path (PBR + premium materials).
 */

import { getSimpleTextureSamplingWGSL } from '../../textureSampling.js';
import { ParticleMaterialInteractionWGSL } from '../particleMaterialInteraction.js';
import { BLOCK_FRAGMENT_BINDINGS_WGSL } from './bindings.wgsl.js';
import { BLOCK_FRAGMENT_MAIN_WGSL } from './fragmentMain.wgsl.js';
import { BLOCK_PBR_FUNCTIONS_WGSL } from './pbrFunctions.wgsl.js';
import { BLOCK_VERTEX_SHADER_WGSL } from './vertex.wgsl.js';

export interface BlockShaderSources {
  vertex: string;
  fragment: string;
}

/**
 * Build production block vertex + fragment WGSL.
 * Theme/premium differences are driven by CPU uniforms, not duplicate shader factories.
 */
export function createBlockShaders(): BlockShaderSources {
  const textureSamplingCode = getSimpleTextureSamplingWGSL();

  const fragment = `
        ${BLOCK_FRAGMENT_BINDINGS_WGSL}

        ${BLOCK_PBR_FUNCTIONS_WGSL}
        ${ParticleMaterialInteractionWGSL}

        ${textureSamplingCode}

        struct MaterialProperties {
           metallic: f32,
        };

        ${BLOCK_FRAGMENT_MAIN_WGSL}
    `;

  return {
    vertex: BLOCK_VERTEX_SHADER_WGSL,
    fragment,
  };
}

/** @deprecated Use createBlockShaders — kept for existing imports */
export const PBRBlockShaders = createBlockShaders;

export default createBlockShaders;
