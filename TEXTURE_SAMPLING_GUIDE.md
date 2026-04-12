# Block Texture Sampling Guide

This guide explains how to use the improved texture sampling system in tetris_webgpu, which supports different image sources and configurations.

## Overview

The new texture sampling system allows you to:

1. Use different texture image sources (URLs)
2. Configure how the texture is sampled (single texture, atlas, or subregion)
3. Customize material detection (how metal vs glass is determined)
4. Adjust atlas parameters (columns, rows, tile position, insets)

## Quick Start

### Using a Single Tile Texture

If you have a single 256x256 or 512x512 block texture (not an atlas):

```typescript
import { setBlockTextureConfig, SINGLE_TILE_TEXTURE_CONFIG } from './src/webgpu/blockTexture.js';

// Configure for single tile mode
setBlockTextureConfig({
  url: './my-block-texture.png',
  samplingMode: 'single',
  materialDetectionMode: 'luminance',
  metalThresholdLow: 0.45,
  metalThresholdHigh: 0.55,
});

// Then create the view as normal
const view = await View.create(element, width, height, rows, cols, nextCtx, holdCtx);
```

### Using an Atlas Texture

If you have a texture atlas with multiple block variations:

```typescript
import { setBlockTextureConfig } from './src/webgpu/blockTexture.js';

// Configure for atlas mode (e.g., 4x3 atlas)
setBlockTextureConfig({
  url: './block-atlas.png',
  samplingMode: 'atlas',
  atlasColumns: 4,
  atlasRows: 3,
  atlasTileColumn: 2,  // Use tile at column 2 (0-indexed)
  atlasTileRow: 1,     // Use tile at row 1 (0-indexed)
  atlasTileInset: 0.03, // 3% inset to avoid edge bleeding
  materialDetectionMode: 'color_signal',
  metalThresholdLow: 0.95,
  metalThresholdHigh: 1.45,
});
```

### Using a Subregion

If you want to sample from a specific region of a texture:

```typescript
setBlockTextureConfig({
  url: './large-texture.png',
  samplingMode: 'subregion',
  subregionX: 0.25,      // Start at 25% from left
  subregionY: 0.25,      // Start at 25% from top
  subregionWidth: 0.5,   // Use 50% of width
  subregionHeight: 0.5,  // Use 50% of height
});
```

## Configuration Options

### Sampling Modes

- **`'single'`**: Use the entire texture as a single block tile
- **`'atlas'`**: Sample from a grid-based texture atlas
- **`'subregion'`**: Sample from a specific normalized region

### Material Detection Modes

- **`'luminance'`**: Bright areas = metal, dark areas = glass
- **`'color_signal'`**: Use color channels to detect gold metal (R+G-B)
- **`'alpha'`**: Use alpha channel (if texture has alpha)
- **`'none'`**: No detection, equal 50/50 split

### Threshold Values

- **`metalThresholdLow`**: Below this value = glass
- **`metalThresholdHigh`**: Above this value = metal
- Values in between are smoothly interpolated

## Runtime Configuration

You can change the texture configuration at runtime (requires shader recompilation):

```typescript
// Update configuration
setBlockTextureConfig({
  url: './new-texture.png',
  samplingMode: 'single',
});

// Reset to default
resetBlockTextureConfig();

// Get current configuration
const config = getBlockTextureConfig();
```

## Default Configurations

The system provides two pre-configured setups:

```typescript
import { 
  DEFAULT_BLOCK_TEXTURE_CONFIG,  // For block.png atlas
  SINGLE_TILE_TEXTURE_CONFIG,     // For single tile textures
} from './src/webgpu/blockTexture.js';

// Use as starting point
setBlockTextureConfig({
  ...SINGLE_TILE_TEXTURE_CONFIG,
  url: './custom-block.png',
});
```

## Shader Integration

The texture sampling functions are automatically integrated into the shaders. The shader code is generated at runtime based on the current configuration.

### For Custom Shaders

If writing custom shaders, you can use the texture sampling utilities:

```typescript
import { getSimpleTextureSamplingWGSL } from './src/webgpu/textureSampling.js';

const fragmentShader = `
  ${getSimpleTextureSamplingWGSL()}
  
  @fragment
  fn main(@location(0) vUV: vec2<f32>) -> @location(0) vec4<f32> {
    // Sample texture using configured sampling
    let texUV = transformUVForSampling(vUV);
    let texColor = textureSample(blockTexture, blockSampler, texUV);
    
    // Extract material masks
    let masks = extractMaterialMask(texColor.rgb);
    let metalMask = masks.x;
    let glassMask = masks.y;
    
    // ... rest of shader
  }
`;
```

## Advanced: Custom Atlas Layout

For complex texture layouts, you can provide all atlas parameters:

```typescript
setBlockTextureConfig({
  url: './complex-atlas.png',
  samplingMode: 'atlas',
  atlasColumns: 8,
  atlasRows: 4,
  atlasTileColumn: 3,
  atlasTileRow: 2,
  atlasTileInset: 0.02,
  materialDetectionMode: 'color_signal',
  metalThresholdLow: 0.8,
  metalThresholdHigh: 1.2,
});
```

## Migration from Old System

The old hardcoded constants in `renderMetrics.ts` are still available for backward compatibility:

```typescript
// Old way (still works)
import { 
  BLOCK_TEXTURE_ATLAS_COLUMNS,
  BLOCK_TEXTURE_ATLAS_ROWS,
} from './src/webgpu/renderMetrics.js';

// New way (recommended)
import { getAtlasConfig } from './src/webgpu/renderMetrics.js';
const atlas = getAtlasConfig();
console.log(atlas.columns, atlas.rows);
```

## Troubleshooting

### Texture Bleeding (Edge Artifacts)

If you see colors bleeding from adjacent atlas tiles, increase the inset:

```typescript
setBlockTextureConfig({
  atlasTileInset: 0.05, // Increase from default 0.03
});
```

### Wrong Material Detection

If metal/glass regions aren't correctly identified:

```typescript
// For dark metal frames on light glass
setBlockTextureConfig({
  materialDetectionMode: 'luminance',
  metalThresholdLow: 0.3,
  metalThresholdHigh: 0.5,
});

// For gold-colored metal
setBlockTextureConfig({
  materialDetectionMode: 'color_signal',
  metalThresholdLow: 0.8,
  metalThresholdHigh: 1.2,
});
```

### Single Texture Not Working

Make sure to set the mode to `'single'`:

```typescript
setBlockTextureConfig({
  url: './single-tile.png',
  samplingMode: 'single', // Important!
});
```

## Examples

### Example 1: Minimal Custom Texture

```typescript
import { setBlockTextureConfig } from './src/webgpu/blockTexture.js';

// Before creating the view
setBlockTextureConfig({
  url: 'https://example.com/block.png',
  samplingMode: 'single',
});
```

### Example 2: High-Resolution Atlas

```typescript
setBlockTextureConfig({
  url: './hd-blocks-4k.png',
  samplingMode: 'atlas',
  atlasColumns: 6,
  atlasRows: 4,
  atlasTileColumn: 1,
  atlasTileRow: 1,
  atlasTileInset: 0.01, // Smaller inset for high-res
});
```

### Example 3: Procedural Fallback Only

```typescript
setBlockTextureConfig({
  url: './block.png',
  samplingMode: 'single',
  useProceduralFallback: true,
});
```

If the texture fails to load, the procedural fallback will be used automatically.
