/**
 * Authoritative block shader factory.
 * All production themes use this single parametric path (PBR + premium materials).
 *
 * Composition order matters: the shared binding-free material modules come first
 * (authoredMaterial declares the tinted gold grade that authoredGlass delegates to),
 * then the shading modules, then the thin fragment entry point.
 */

import { getSimpleTextureSamplingWGSL } from '../../textureSampling.js';
import { ParticleMaterialInteractionWGSL } from '../particleMaterialInteraction.js';
import { BLOCK_AUTHORED_GLASS_WGSL } from './authoredGlass.wgsl.js';
import { BLOCK_AUTHORED_MATERIAL_WGSL } from './authoredMaterial.wgsl.js';
import { BLOCK_AUTHORED_PATH_WGSL } from './authoredPath.wgsl.js';
import { BLOCK_FALLBACK_PATH_WGSL } from './fallbackPath.wgsl.js';
import { BLOCK_FX_WGSL } from './blockFx.wgsl.js';
import { BLOCK_GHOST_WGSL } from './ghost.wgsl.js';
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

        ${BLOCK_AUTHORED_MATERIAL_WGSL}
        ${BLOCK_AUTHORED_GLASS_WGSL}
        ${BLOCK_PBR_FUNCTIONS_WGSL}
        ${ParticleMaterialInteractionWGSL}

        ${textureSamplingCode}

        ${BLOCK_GHOST_WGSL}
        ${BLOCK_AUTHORED_PATH_WGSL}
        ${BLOCK_FALLBACK_PATH_WGSL}
        ${BLOCK_FX_WGSL}

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
