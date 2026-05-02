/**
 * Texture Sampling Utilities for WGSL Shaders
 * 
 * This module provides reusable WGSL code for sampling block textures
 * with support for different image source configurations:
 * - Single textures (use entire image as one block)
 * - Atlas textures (sample from a grid of tiles)
 * - Subregion textures (sample from a specific region)
 * 
 * The sampling functions handle:
 * - UV coordinate transformation based on mode
 * - Material mask extraction (metal vs glass)
 * - Edge inset to avoid atlas bleeding
 */

import { getBlockTextureConfig } from './blockTexture.js';

/**
 * Generate WGSL code for texture sampling based on current configuration
 * This function creates shader code that can sample different texture layouts
 */
export function getTextureSamplingWGSL(): string {
  const config = getBlockTextureConfig();
  
  return `
// ============================================================================
// TEXTURE SAMPLING CONFIGURATION
// Auto-generated based on BlockTextureConfig
// ============================================================================

// Sampling mode: ${config.samplingMode}
const TEXTURE_MODE_SINGLE = 0u;
const TEXTURE_MODE_ATLAS = 1u;
const TEXTURE_MODE_SUBREGION = 2u;

// Current texture sampling mode
const textureSamplingMode: u32 = ${getModeValue(config.samplingMode)}u;

// Atlas configuration (used when mode is ATLAS)
const ATLAS_COLUMNS: f32 = ${config.atlasColumns ?? 1}.0;
const ATLAS_ROWS: f32 = ${config.atlasRows ?? 1}.0;
const ATLAS_TILE_COL: f32 = ${config.atlasTileColumn ?? 0}.0;
const ATLAS_TILE_ROW: ${config.atlasTileRow ?? 0}.0;
const ATLAS_INSET: f32 = ${config.atlasTileInset ?? 0.0};

// Subregion configuration (used when mode is SUBREGION)
const SUBREGION_X: f32 = ${config.subregionX ?? 0.0};
const SUBREGION_Y: f32 = ${config.subregionY ?? 0.0};
const SUBREGION_W: f32 = ${config.subregionWidth ?? 1.0};
const SUBREGION_H: f32 = ${config.subregionHeight ?? 1.0};

// Material detection configuration
const MATERIAL_MODE_LUMINANCE = 0u;
const MATERIAL_MODE_COLOR_SIGNAL = 1u;
const MATERIAL_MODE_ALPHA = 2u;
const MATERIAL_MODE_NONE = 3u;
const materialDetectionMode: u32 = ${getMaterialModeValue(config.materialDetectionMode)}u;
const METAL_THRESHOLD_LOW: f32 = ${config.metalThresholdLow ?? 0.45};
const METAL_THRESHOLD_HIGH: f32 = ${config.metalThresholdHigh ?? 0.55};

// ============================================================================
// TEXTURE SAMPLING FUNCTIONS
// ============================================================================

/**
 * Transform UV coordinates based on the current sampling mode
 * - Single mode: use UVs as-is (with Y-flip for correct orientation)
 * - Atlas mode: map to specific tile within the atlas
 * - Subregion mode: map to specific subregion
 */
fn transformUVForSampling(uv: vec2<f32>) -> vec2<f32> {
    // Flip Y for correct image orientation (WebGPU vs image coordinates)
    var texUV = vec2<f32>(uv.x, 1.0 - uv.y);
    
    switch textureSamplingMode {
        case TEXTURE_MODE_SINGLE: {
            // Single texture: use as-is
            return texUV;
        }
        case TEXTURE_MODE_ATLAS: {
            // Atlas: map to specific tile with inset to avoid bleeding
            let atlasTiles = vec2<f32>(ATLAS_COLUMNS, ATLAS_ROWS);
            let atlasTile = vec2<f32>(ATLAS_TILE_COL, ATLAS_TILE_ROW);
            let atlasInset = vec2<f32>(ATLAS_INSET, ATLAS_INSET);
            return (clamp(texUV, vec2<f32>(0.0), vec2<f32>(1.0)) * 
                    (vec2<f32>(1.0) - atlasInset * 2.0) + atlasInset + atlasTile) / atlasTiles;
        }
        case TEXTURE_MODE_SUBREGION: {
            // Subregion: map to specific area
            return vec2<f32>(
                SUBREGION_X + texUV.x * SUBREGION_W,
                SUBREGION_Y + texUV.y * SUBREGION_H
            );
        }
        default: {
            return texUV;
        }
    }
}

/**
 * Sample the block texture with the current sampling configuration
 */
fn sampleBlockTexture(blockTexture: texture_2d<f32>, blockSampler: sampler, uv: vec2<f32>) -> vec4<f32> {
    let texUV = transformUVForSampling(uv);
    return textureSample(blockTexture, blockSampler, texUV);
}

/**
 * Extract material mask from texture color
 * Returns vec2<f32>(metalMask, glassMask) where metalMask + glassMask = 1.0
 */
fn extractMaterialMask(texColor: vec3<f32>) -> vec2<f32> {
    var metalMask: f32;
    
    switch materialDetectionMode {
        case MATERIAL_MODE_LUMINANCE: {
            // Luminance-based: bright areas = metal, dark = glass
            let luma = dot(texColor.rgb, vec3<f32>(0.299, 0.587, 0.114));
            metalMask = smoothstep(METAL_THRESHOLD_LOW, METAL_THRESHOLD_HIGH, luma);
        }
        case MATERIAL_MODE_COLOR_SIGNAL: {
            // Color signal: gold metal has high R+G, lower B
            let goldSignal = texColor.r + texColor.g - texColor.b * 0.5;
            metalMask = smoothstep(METAL_THRESHOLD_LOW, METAL_THRESHOLD_HIGH, goldSignal);
        }
        case MATERIAL_MODE_ALPHA: {
            // Alpha-based: would need alpha channel input
            metalMask = 0.5; // Neutral fallback
        }
        case MATERIAL_MODE_NONE: {
            // No detection: neutral 50/50 split
            metalMask = 0.5;
        }
        default: {
            metalMask = 0.5;
        }
    }
    
    return vec2<f32>(metalMask, 1.0 - metalMask);
}

/**
 * Get UV transform for atlas sampling (for manual UV manipulation)
 * Returns the transform parameters that can be applied to UVs
 */
fn getAtlasTransform() -> vec4<f32> {
    // Returns: vec4(scaleX, scaleY, offsetX, offsetY)
    if (textureSamplingMode == TEXTURE_MODE_ATLAS) {
        let scaleX = 1.0 / ATLAS_COLUMNS;
        let scaleY = 1.0 / ATLAS_ROWS;
        let offsetX = ATLAS_TILE_COL / ATLAS_COLUMNS;
        let offsetY = ATLAS_TILE_ROW / ATLAS_ROWS;
        return vec4<f32>(scaleX, scaleY, offsetX, offsetY);
    }
    return vec4<f32>(1.0, 1.0, 0.0, 0.0);
}
`;
}

/**
 * Get simplified texture sampling WGSL for basic shaders
 * This version includes just the essential sampling logic
 */
export function getSimpleTextureSamplingWGSL(): string {
  const config = getBlockTextureConfig();
  
  // For simple shaders, we inline the constants directly
  if (config.samplingMode === 'single') {
    return `
// Texture sampling: SINGLE mode
fn transformUVForSampling(uv: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(uv.x, 1.0 - uv.y);
}

fn extractMaterialMask(texColor: vec3<f32>) -> vec2<f32> {
    let luma = dot(texColor.rgb, vec3<f32>(0.299, 0.587, 0.114));
    let metalMask = smoothstep(${config.metalThresholdLow ?? 0.45}, ${config.metalThresholdHigh ?? 0.55}, luma);
    return vec2<f32>(metalMask, 1.0 - metalMask);
}
`;
  }
  
  // Atlas mode
  return `
// Texture sampling: ATLAS mode (${config.atlasColumns}x${config.atlasRows}, tile ${config.atlasTileColumn},${config.atlasTileRow})
const ATLAS_COLUMNS: f32 = ${config.atlasColumns ?? 4}.0;
const ATLAS_ROWS: f32 = ${config.atlasRows ?? 3}.0;
const ATLAS_TILE_COL: f32 = ${config.atlasTileColumn ?? 1}.0;
const ATLAS_TILE_ROW: f32 = ${config.atlasTileRow ?? 1}.0;
const ATLAS_INSET: f32 = ${config.atlasTileInset ?? 0.03};

fn transformUVForSampling(uv: vec2<f32>) -> vec2<f32> {
    let texUV = vec2<f32>(uv.x, 1.0 - uv.y);
    let atlasTiles = vec2<f32>(ATLAS_COLUMNS, ATLAS_ROWS);
    let atlasTile = vec2<f32>(ATLAS_TILE_COL, ATLAS_TILE_ROW);
    let atlasInset = vec2<f32>(ATLAS_INSET, ATLAS_INSET);
    return (clamp(texUV, vec2<f32>(0.0), vec2<f32>(1.0)) * 
            (vec2<f32>(1.0) - atlasInset * 2.0) + atlasInset + atlasTile) / atlasTiles;
}

fn extractMaterialMask(texColor: vec3<f32>) -> vec2<f32> {
    let goldSignal = texColor.r + texColor.g - texColor.b * 0.5;
    let metalMask = smoothstep(${config.metalThresholdLow ?? 0.75}, ${config.metalThresholdHigh ?? 1.15}, goldSignal);
    return vec2<f32>(metalMask, 1.0 - metalMask);
}
`;
}

// Helper functions
function getModeValue(mode: string): number {
  switch (mode) {
    case 'single': return 0;
    case 'atlas': return 1;
    case 'subregion': return 2;
    default: return 0;
  }
}

function getMaterialModeValue(mode?: string): number {
  switch (mode) {
    case 'luminance': return 0;
    case 'color_signal': return 1;
    case 'alpha': return 2;
    case 'none': return 3;
    default: return 1; // Default to color_signal
  }
}

/**
 * Get shader preprocessor defines for texture sampling
 * These can be used for conditional compilation in shaders
 */
export function getTextureSamplingDefines(): string {
  const config = getBlockTextureConfig();
  
  return `
// Texture sampling defines
#define TEXTURE_MODE_${config.samplingMode.toUpperCase()}
#define ATLAS_COLUMNS ${config.atlasColumns ?? 1}
#define ATLAS_ROWS ${config.atlasRows ?? 1}
#define ATLAS_TILE_COLUMN ${config.atlasTileColumn ?? 0}
#define ATLAS_TILE_ROW ${config.atlasTileRow ?? 0}
#define ATLAS_TILE_INSET ${config.atlasTileInset ?? 0.0}
#define MATERIAL_DETECTION_${(config.materialDetectionMode ?? 'color_signal').toUpperCase()}
`;
}

export default {
  getTextureSamplingWGSL,
  getSimpleTextureSamplingWGSL,
  getTextureSamplingDefines,
};
