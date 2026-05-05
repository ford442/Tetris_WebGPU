# Block Texture Sampling Enhancement Plan

## Current Issues

1. **Washed out colors**: The white/silver marble texture (`block.png`) washes out block colors when multiplied
2. **No metal/glass distinction**: Current shader doesn't properly separate metal frame from glass center
3. **Transparency problems**: Glass centers don't show video background correctly
4. **UV mapping issues**: Texture scale and orientation may not be optimal for the marble texture

## Goals

1. Restore the metal frame + tinted glass appearance from the working version
2. Use high-resolution texture sampling for crisp detail
3. Proper alpha blending for glass transparency
4. Efficient GPU texture management

## Implementation Plan

### Phase 1: Texture Asset Analysis

**Current Asset**: `block.png` (2816x1536)
- White/silver marble centers
- Gold/silver metal borders
- Needs: Analysis of luminance distribution to separate frame from glass

**High Resolution Texture Acquisition**:
- [ ] Verify block.png is available in assets folder at 2816x1536 resolution
- [ ] If needed, create or obtain higher resolution version (e.g., 4K) for future-proofing
- [ ] Ensure texture loading code supports high resolution without memory issues

**Tasks**:
- [ ] Ensure block.png is loaded at full high resolution (2816x1536) without downsampling
- [ ] Create texture luminance histogram to identify frame vs glass threshold
- [ ] Verify mipmaps are generated correctly for all levels
- [ ] Check anisotropic filtering is active

### Phase 2: Shader Refactoring ✅ IMPLEMENTED

#### 2.1 New Fragment Shader Approach

**Implementation** in `shaders.ts`:

```wgsl
// --- HIGH-RESOLUTION TEXTURE SAMPLING ---
let texUV = vec2<f32>(vUV.x, 1.0 - vUV.y);
let texColor = textureSample(blockTexture, blockSampler, texUV);

// Material separation based on texture luminance
let texLuma = dot(texColor.rgb, vec3<f32>(0.299, 0.587, 0.114));

// Metal frame: high luminance (> 0.45) - keep silver/gold detail
// Glass center: low luminance (< 0.35) - tint with block color
let isMetal = smoothstep(0.35, 0.45, texLuma);

// Metal: use texture as-is for frame detail
// Glass: blend texture with block color for tinted glass effect
let metalColor = texColor.rgb * 1.1;
let glassColor = mix(texColor.rgb, vColor.rgb, 0.35);

var baseColor = mix(glassColor, metalColor, isMetal);
```

#### 2.2 Alpha Channel Strategy ✅

**Decision**: Material-based alpha with base opacity:
- Base solid: 0.85 (from CPU)
- Metal: 1.0 * base = 0.85 (nearly opaque)
- Glass: 0.75 * base = 0.64 (shows video through)
- Ghost: 0.30 (current behavior, hologram effect)

#### 2.3 High-Resolution Sampling Features

- [ ] Enable `mipmapFilter: 'linear'` for trilinear filtering ✓ (already done)
- [ ] Set `maxAnisotropy: 16` for angled surfaces ✓ (already done)
- [ ] Add texture LOD bias for sharper detail
- [ ] Consider texture array for different block types

### Phase 3: View (TypeScript) Changes ✅ IMPLEMENTED

#### 3.1 Alpha Values ✅

```typescript
// In renderPlayfild_WebGPU:
let alpha = value < 0 ? 0.3 : 0.85; // Ghost 30%, Solid 85%
```

**Note**: Alpha blending works with WebGPU canvas `alphaMode: 'premultiplied'`

#### 3.2 Texture Loading Verification ✅

Added console logging and error handling:
```typescript
console.log('[Texture] Loaded block.png:', imageBitmap.width, 'x', imageBitmap.height);
// ...
} catch (e) {
    console.error('[Texture] Failed to load block.png:', e);
    // Fallback white texture
}
```

#### 3.3 Bind Group Layout ✅

Texture bindings configured:
- Binding 2: `blockTexture` with explicit mipLevelCount
- Binding 3: `blockSampler` with anisotropic filtering (maxAnisotropy: 16)

### Phase 4: Geometry & UV Mapping ✅ IMPLEMENTED

#### 4.1 Optimized UV Generation ✅

In `geometry.ts`:
```typescript
const textureScale = 0.9; // Slight zoom to focus on marble tile detail
```

**Selected**: `0.9` - Slight zoom in to focus on single marble tile detail per block face

#### 4.2 Face-Based UV Mapping ✅

Each cube face uses planar projection:
- Front face: Standard 0..1 UVs
- Side faces: Consistent UV mapping via `uDir` and `vDir` parameters
- Texture scale applied uniformly via `(uv - 0.5) * scale + 0.5`

### Phase 5: Testing Checklist

#### 5.1 Visual Tests

- [ ] Metal frame shows gold/silver detail clearly
- [ ] Glass center has subtle block color tint
- [ ] Video background visible through glass (not solid)
- [ ] Ghost pieces are translucent
- [ ] No texture bleeding or artifacts

#### 5.2 Performance Tests

- [ ] Mipmap generation completes without errors
- [ ] No texture memory leaks
- [ ] Frame rate stable at 60fps

#### 5.3 Edge Cases

- [ ] Texture load failure (fallback)
- [ ] Window resize (texture recreation)
- [ ] Theme switching (color updates)

### Phase 6: Alternative Approaches

#### Option A: Texture Masking

Use texture as a mask rather than color source:
- R channel: Metal frame mask
- G channel: Glass detail
- B channel: Reflectivity
- A channel: Transparency

#### Option B: Procedural Texture

Generate block texture procedurally in shader:
```wgsl
// Gold border based on UV distance from edge
let edgeDist = min(abs(uv.x - 0.5), abs(uv.y - 0.5));
let isBorder = step(edgeDist, 0.15);
```

#### Option C: Dual Texture

Separate textures for frame and glass:
- Texture 1: Metal frame (RGBA)
- Texture 2: Glass normal/detail map

## Debugging Strategy

### Visual Debugging

Add shader visualization modes:
1. **Texture only**: Show `texColor.rgb` directly
2. **Luminance only**: Show `vec3(luma)` to see separation
3. **Mask only**: Show `vec3(isMetal)` to verify frame detection
4. **Final blend**: Show `baseColor` before lighting

### Console Logging

In `viewWebGPU.ts`:
```typescript
console.log('Texture loaded:', this.blockTexture.width, 'x', this.blockTexture.height);
console.log('Mip levels:', this.blockTexture.mipLevelCount);
```

## Implementation Status

✅ **COMPLETED** - New high-resolution sampling method implemented:

### What Was Changed

1. **Shader** (`src/webgpu/shaders.ts`):
   - Added material separation based on texture luminance
   - Metal frame (bright) uses texture detail
   - Glass center (dark) uses 35% block color tint
   - Material-based alpha: Metal 100%, Glass 75%

2. **View** (`src/viewWebGPU.ts`):
   - Added texture loading console logging
   - Alpha: 0.85 for solid blocks, 0.3 for ghosts

3. **Geometry** (`src/webgpu/geometry.ts`):
   - UV scale: 0.9 for better marble tile focus

4. **Debug Tools** (`src/webgpu/debug_shaders.ts`):
   - Created debug shaders for visualization

### Next Steps

Run `npm run dev` and verify:
- Metal frame shows gold/silver detail
- Glass centers have subtle color tint
- Video background visible through glass

## Success Criteria

1. Blocks look like the "before" screenshot: metal frames with tinted glass
2. Video background visible through glass centers
3. Colors match Tetris piece colors (cyan, blue, orange, yellow, green, purple, red)
4. No performance degradation
5. Works across all themes

## Notes

- The marble texture may need replacement if it can't achieve the desired look
- Consider creating a custom texture with proper alpha channels
- Test on both light and dark video backgrounds
