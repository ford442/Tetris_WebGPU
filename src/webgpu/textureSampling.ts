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

import { getBlockTextureConfig, type BlockTextureConfig } from './blockTexture.js';

/** WGSL body for extractMaterialMask — separates gold frame from cool crystal glass */
function getMaterialMaskLogicWGSL(config: BlockTextureConfig): string {
  const low = config.metalThresholdLow ?? 0.45;
  const high = config.metalThresholdHigh ?? 0.55;

  if (config.materialDetectionMode === 'warmth') {
    return `
    // Gold frame: mid-luminance AND warm hue (R > B).
    // Crystal interior: cool/neutral (B >= R) — pixel analysis of block.png.
    let luma = dot(texColor.rgb, vec3<f32>(0.299, 0.587, 0.114));
    let warmth = texColor.r - texColor.b;
    let lumaBand = smoothstep(0.25, 0.55, luma) * (1.0 - smoothstep(0.82, 0.95, luma));
    let warmthSignal = smoothstep(${low}, ${high}, warmth);
    let metalMask = clamp(lumaBand * warmthSignal * 3.0, 0.0, 1.0);
    `;
  }

  if (config.materialDetectionMode === 'color_signal') {
    return `
    let goldSignal = texColor.r + texColor.g - texColor.b * 0.5;
    let metalMask = smoothstep(${low}, ${high}, goldSignal);
    `;
  }

  if (config.materialDetectionMode === 'luminance' && config.samplingMode === 'atlas') {
    return `
    let luma = dot(texColor.rgb, vec3<f32>(0.299, 0.587, 0.114));
    let metalMask = smoothstep(${low}, ${high}, luma);
    `;
  }

  return `
    let luma = dot(texColor.rgb, vec3<f32>(0.299, 0.587, 0.114));
    let metalMask = smoothstep(${low}, ${high}, luma);
  `;
}

/** Shared WGSL helper that builds tinted glass + preserved gold frame colours */
const MATERIAL_COMPOSE_WGSL = `
fn composeMaterialBaseColor(texColor: vec3<f32>, pieceColor: vec3<f32>, metalMask: f32) -> vec3<f32> {
    let luma = dot(texColor.rgb, vec3<f32>(0.299, 0.587, 0.114));
    let crystalBrightness = smoothstep(0.15, 0.90, luma);
    let crystalHighlight = max(luma - 0.70, 0.0) * 3.0;
    let glassColor = pieceColor * (0.58 + crystalBrightness * 0.52)
                   + vec3<f32>(1.0) * crystalHighlight * 0.45;
    let metalColor = texColor.rgb * 1.12 + vec3<f32>(0.025, 0.010, 0.0);
    return mix(glassColor, metalColor, metalMask);
}
`;

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

// Material detection configuration
const MATERIAL_MODE_LUMINANCE = 0u;
const MATERIAL_MODE_COLOR_SIGNAL = 1u;
const MATERIAL_MODE_ALPHA = 2u;
const MATERIAL_MODE_NONE = 3u;
const MATERIAL_MODE_WARMTH = 4u;
const materialDetectionMode: u32 = ${getMaterialModeValue(config.materialDetectionMode)}u;
const METAL_THRESHOLD_LOW: f32 = ${config.metalThresholdLow ?? 0.45};
const METAL_THRESHOLD_HIGH: f32 = ${config.metalThresholdHigh ?? 0.55};

// ============================================================================
// TEXTURE SAMPLING FUNCTIONS
// ============================================================================

/**
 * Transform UV coordinates based on the single tile sampling mode
 * Tile extraction and scaling is strictly handled on the CPU side during init.
 */
fn transformUVForSampling(uv: vec2<f32>) -> vec2<f32> {
    // Flip Y for correct image orientation (WebGPU vs image coordinates)
    return clamp(vec2<f32>(uv.x, 1.0 - uv.y), vec2<f32>(0.0), vec2<f32>(1.0));
}

/**
 * Sample the block texture with the current sampling configuration
 */
fn sampleBlockTexture(blockTexture: texture_2d<f32>, blockSampler: sampler, uv: vec2<f32>) -> vec4<f32> {
    let texUV = transformUVForSampling(uv);
    return textureSampleLevel(blockTexture, blockSampler, texUV, 0.0);
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
            metalMask = smoothstep(0.40, 1.0, goldSignal);
        }
        case MATERIAL_MODE_WARMTH: {
            let luma = dot(texColor.rgb, vec3<f32>(0.299, 0.587, 0.114));
            let warmth = texColor.r - texColor.b;
            let lumaBand = smoothstep(0.25, 0.55, luma) * (1.0 - smoothstep(0.82, 0.95, luma));
            let warmthSignal = smoothstep(METAL_THRESHOLD_LOW, METAL_THRESHOLD_HIGH, warmth);
            metalMask = clamp(lumaBand * warmthSignal * 3.0, 0.0, 1.0);
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
    // Legacy stub - extraction handled by CPU now
    return vec4<f32>(1.0, 1.0, 0.0, 0.0);
}
`;
}


export function getSimpleTextureSamplingWGSL(): string {
  const config = getBlockTextureConfig();
  const materialMaskLogic = getMaterialMaskLogicWGSL(config);

  return `
// Texture sampling: SINGLE mode (CPU extracted tile)
fn transformUVForSampling(uv: vec2<f32>) -> vec2<f32> {
    return clamp(vec2<f32>(uv.x, 1.0 - uv.y), vec2<f32>(0.0), vec2<f32>(1.0));
}

fn extractMaterialMask(texColor: vec3<f32>) -> vec2<f32> {${materialMaskLogic}
    return vec2<f32>(metalMask, 1.0 - metalMask);
}

${MATERIAL_COMPOSE_WGSL}
`;
}


// Helper functions
function getMaterialModeValue(mode?: string): number {
  switch (mode) {
    case 'luminance': return 0;
    case 'color_signal': return 1;
    case 'alpha': return 2;
    case 'none': return 3;
    case 'warmth': return 4;
    default: return 4; // Default to warmth (block.png gold/crystal split)
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
#define TEXTURE_MODE_SINGLE
#define MATERIAL_DETECTION_${(config.materialDetectionMode ?? 'color_signal').toUpperCase()}
`;
}

export default {
  getTextureSamplingWGSL,
  getSimpleTextureSamplingWGSL,
  getTextureSamplingDefines,
};
