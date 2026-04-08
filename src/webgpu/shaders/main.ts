/**
 * Main Block Shader
 * Primary 3D tetromino block renderer with texture atlas sampling, lighting,
 * ghost piece, and lock-percent effects.
 * 
 * Merge conflicts resolved (favoring polished "main" branch updates):
 * - Lock tension pulse: earlier start (0.25), smoothstep, dual-frequency heartbeat,
 *   progressive warning colors (orange → red → hot), scanline + edge effects.
 * - Ghost piece hologram: multi-band smoothstep scanlines, breathing alpha,
 *   finer grid, refined glitch/tension reactivity, landing beam, and sparkles.
 * 
 * All other sections (material split, iridescence, rim lighting, etc.) kept intact
 * with original performance-friendly chained multiplies where possible.
 */
import {
    BLOCK_TEXTURE_ATLAS_COLUMNS,
    BLOCK_TEXTURE_ATLAS_ROWS,
    BLOCK_TEXTURE_TILE_COLUMN,
    BLOCK_TEXTURE_TILE_ROW,
    BLOCK_TEXTURE_TILE_INSET,
} from '../renderMetrics.js';

export const Shaders = () => {
    let params: any = {};
    params.color = "(0.0, 1.0, 0.0)";
    params.ambientIntensity = "0.5";
    params.diffuseIntensity = "1.0";
    params.specularIntensity = "50.0";
    params.shininess = "1000.0";
    params.specularColor = "(1.0, 1.0, 1.0)";
    params.isPhong = "1";

    const vertex = `
            struct Uniforms {
                viewProjectionMatrix : mat4x4<f32>,
                modelMatrix : mat4x4<f32>,
                normalMatrix : mat4x4<f32>,
                colorVertex : vec4<f32>
            };
            @binding(0) @group(0) var<uniform> uniforms : Uniforms;
            struct Output {
                @builtin(position) Position : vec4<f32>,
                @location(0) vPosition : vec4<f32>,
                @location(1) vNormal : vec4<f32>,
                @location(2) vColor : vec4<f32>,
                @location(3) vUV : vec2<f32>
            };
         
            @vertex
            fn main(@location(0) position: vec4<f32>, @location(1) normal: vec4<f32>, @location(2) uv: vec2<f32>) -> Output {
                var output: Output;
                let mPosition:vec4<f32> = uniforms.modelMatrix * position;
                output.vPosition = mPosition;
                output.vNormal = uniforms.normalMatrix * normal;
                output.Position = uniforms.viewProjectionMatrix * mPosition;
                output.vColor = uniforms.colorVertex;
                output.vUV = uv;
                return output;
            }`;

    const fragment = `
            struct Uniforms {
                lightPosition : vec4<f32>,
                eyePosition : vec4<f32>,
                color : vec4<f32>,
                time : f32,
                useGlitch: f32,
                lockPercent: f32, // Offset 56
                level: f32, // Offset 60
            };
            @binding(1) @group(0) var<uniform> uniforms : Uniforms;
            @binding(2) @group(0) var blockTexture: texture_2d<f32>;
            @binding(3) @group(0) var blockSampler: sampler;
            // Material uniforms for PBR (binding 4)
            struct MaterialUniforms {
                metallic: f32,
                roughness: f32,
                transmission: f32,
                padding: f32
            };
            @binding(4) @group(0) var<uniform> materialUniforms : MaterialUniforms;
            @fragment
            fn main(@location(0) vPosition: vec4<f32>, @location(1) vNormal: vec4<f32>,@location(2) vColor: vec4<f32>, @location(3) vUV: vec2<f32>) -> @location(0) vec4<f32> {
                // Read the new material uniforms
                let metallic = materialUniforms.metallic;
                let roughness = materialUniforms.roughness;
                let transmission = materialUniforms.transmission;
                var N:vec3<f32> = normalize(vNormal.xyz);
                let L:vec3<f32> = normalize(uniforms.lightPosition.xyz - vPosition.xyz);
                let V:vec3<f32> = normalize(uniforms.eyePosition.xyz - vPosition.xyz);
                let H:vec3<f32> = normalize(L + V);
                // Lighting
                let diffuse:f32 = max(dot(N, L), 0.0);
                let dotNH = max(dot(N, H), 0.0);
                // Single tight specular highlight for polished surface
                // Optimized: Replace expensive pow(dotNH, 800.0) with chained multiplications
                // approximating a high exponent (256.0) to avoid ALU bloating/denormal stalls.
                let s2 = dotNH * dotNH;
                let s4 = s2 * s2;
                let s8 = s4 * s4;
                let s16 = s8 * s8;
                let s32 = s16 * s16;
                let s64 = s32 * s32;
                let s128 = s64 * s64;
                var specular:f32 = s128 * s128; // 256.0
                // --- TEXTURE SAMPLING ---
                // Flip Y for correct image orientation
                var texUV = vec2<f32>(vUV.x, 1.0 - vUV.y);
                // Glitch Offset
                var glitchColorMod = vec3<f32>(0.0);
                if (uniforms.useGlitch > 0.0) {
                     let glitchStrength = uniforms.useGlitch;
                     let glitchOffset = glitchStrength * 0.05 * sin(texUV.y * 50.0 + uniforms.time * 20.0);
                     texUV.x += glitchOffset;
                     // RGB Split (Chromatic Aberration) on the block texture
                     let noise = fract(sin(dot(texUV, vec2<f32>(12.9898, 78.233)) + uniforms.time) * 43758.5453);
                     if (noise > 0.9) {
                         glitchColorMod = vec3<f32>(1.0) * glitchStrength;
                     }
                }
                let atlasTiles = vec2<f32>(${BLOCK_TEXTURE_ATLAS_COLUMNS}.0, ${BLOCK_TEXTURE_ATLAS_ROWS}.0);
                let atlasTile = vec2<f32>(${BLOCK_TEXTURE_TILE_COLUMN}.0, ${BLOCK_TEXTURE_TILE_ROW}.0);
                let atlasInset = vec2<f32>(${BLOCK_TEXTURE_TILE_INSET}, ${BLOCK_TEXTURE_TILE_INSET});
                let atlasUV = (clamp(texUV, vec2<f32>(0.0), vec2<f32>(1.0)) * (vec2<f32>(1.0) - atlasInset * 2.0) + atlasInset + atlasTile) / atlasTiles;
                let texColor = textureSample(blockTexture, blockSampler, atlasUV);
                // The source texture is mostly warm gold metal plus cool frosted glass.
                // Bias toward red/green and suppress blue so the gold frame reads as metal,
                // then threshold that signal to split the material treatment.
                let goldSignal = texColor.r + texColor.g - texColor.b * 0.75;
                let metalMask = clamp((goldSignal - 0.95) / 0.5, 0.0, 1.0);
                let glassMask = 1.0 - metalMask;
                // Gold: very light warm push (8%) -- the texture is already gold
                let goldColor = mix(texColor.rgb, vec3<f32>(1.0, 0.84, 0.36), 0.08);
                // Glass: subtle theme-color tint (12%) so piece identity is visible
                let glassColor = mix(texColor.rgb, texColor.rgb * 0.88 + vColor.rgb * 0.12, 0.25);
                var baseColor = mix(glassColor, goldColor, metalMask);
                // Glass slightly translucent, gold opaque
                let materialAlpha = mix(0.82, 0.98, metalMask);
                // Tech pattern overlay removed to let the raw texture show through
                // --- Composition ---
                // so total light factor stays in [0.3, 1.0] and never blows out the texture.
                let lightFactor = 0.25 + diffuse * 0.65; // max = 0.9, leaves room for specular
                // Very subtle specular: just a glint on metal, barely visible on glass
                let specularStrength = mix(0.04, 0.12, metalMask);
                var finalColor:vec3<f32> = baseColor * lightFactor + vec3<f32>${params.specularColor} * specular * specularStrength;
                // Pre-compute dotNV for iridescence and fresnel
                let dotNV = max(dot(N, V), 0.0);
                // Subtle emissive: gentle breathing glow in the glass center only
                // Define time early for iridescence calculation
                let time = uniforms.time;
                // ENHANCED: Iridescent specular for glass blocks
                // Oil-slick rainbow effect on the glass surfaces
                if (glassMask > 0.5) {
                    let iridescence = sin(dotNV * 8.0 - time * 0.5) * 0.5 + 0.5;
                    let rainbow = vec3<f32>(
                        sin(iridescence * 6.28) * 0.5 + 0.5,
                        sin(iridescence * 6.28 + 2.09) * 0.5 + 0.5,
                        sin(iridescence * 6.28 + 4.18) * 0.5 + 0.5
                    );
                    finalColor += rainbow * specular * 0.15 * glassMask;
                }
                // Add Glitch Mod
                finalColor += glitchColorMod;
                let breath = sin(time * 1.5) * 0.03 + 0.03;
                let distCenter = distance(vUV, vec2<f32>(0.5));
                let centerGlow = clamp((0.45 - distCenter) / 0.35, 0.0, 1.0);
                finalColor += vColor.rgb * breath * centerGlow * glassMask * 0.5;
                // ENHANCED rim lighting -- more pronounced edge glow
                let rimFalloff = 1.0 - max(dot(N, V), 0.0);
                let rimFalloff2 = rimFalloff * rimFalloff;
                let rimFalloff4 = rimFalloff2 * rimFalloff2;
                let rimLight = rimFalloff4 * (15.0 + f32(uniforms.level) * 1.0); // Sharper, brighter rim
               
                // Color the rim based on piece color for glass, white for metal
                let rimColor = mix(vColor.rgb * 0.8, vec3<f32>(1.0), metalMask);
                finalColor += rimColor * rimLight * 0.08;
                // Simple fresnel (needed for ghost piece downstream)
                // dotNV already computed above for iridescence
                let fresnelBase = 1.0 - dotNV;
                let fresnelBase2 = fresnelBase * fresnelBase;
                let fresnelTerm = fresnelBase2 * fresnelBase2;
                // Edge distance (needed for ghost piece wireframe downstream)
                let uvEdgeDist = max(abs(vUV.x - 0.5), abs(vUV.y - 0.5)) * 2.0;

                // === LOCK TENSION PULSE (Heartbeat & Alarm) - ENHANCED ===
                // (Merged polished version: earlier activation + smoother progression)
                let lockPercent = uniforms.lockPercent;
                if (lockPercent > 0.25) {
                     // Start earlier for more tension build-up
                     let tension = smoothstep(0.25, 1.0, lockPercent);
                    
                     // Dual-frequency heartbeat: slow thump + fast panic
                     let slowBeat = sin(time * 6.0) * 0.5 + 0.5;
                     let fastBeat = sin(time * (15.0 + tension * 40.0)) * 0.5 + 0.5;
                     let pulse = mix(slowBeat, fastBeat, tension);
                    
                     // Sharpen the pulse
                     let sharpPulse = pulse * pulse * pulse;
                    
                     // Digital Grid Scan Effect
                     let scanY = fract(vUV.y * 12.0 + time * 4.0);
                     let scanLine = step(0.92, scanY) * tension * 0.7;
                    
                     // Warning colors: orange → red → white hot
                     let warnOrange = vec3<f32>(1.0, 0.5, 0.0);
                     let warnRed = vec3<f32>(1.0, 0.0, 0.15);
                     let warnHot = vec3<f32>(1.0, 0.3, 0.3);
                     var warningColor = mix(warnOrange, warnRed, tension);
                     warningColor = mix(warningColor, warnHot, sharpPulse * tension);
                    
                     // Apply with intensity that increases near lock
                     let intensity = tension * sharpPulse * 1.2;
                     finalColor = mix(finalColor, warningColor, intensity);
                    
                     // Add Scanline Emission
                     finalColor += warningColor * scanLine * 4.0 * (0.5 + sharpPulse * 0.5);
                    
                     // Edge warning pulse
                     let edgeDist = max(abs(vUV.x - 0.5), abs(vUV.y - 0.5)) * 2.0;
                     if (edgeDist > 0.85 && sharpPulse > 0.7) {
                         finalColor += warnHot * 0.5;
                     }
                }

                // Subtle Surface Noise (Texture)
                let noise = fract(sin(dot(vUV, vec2<f32>(12.9898, 78.233))) * 43758.5453);
                finalColor += vec3<f32>(noise) * 0.015;

                // === GHOST PIECE LOGIC - ENHANCED HOLOGRAM ===
                // (Merged polished version: multi-band scans, breathing, finer grid, tension-reactive glitch)
                if (vColor.w < 0.4) {
                    let scanSpeed = 35.0;
                    let scanY = fract(vUV.y * 90.0 - time * scanSpeed);
                    // Multi-band scanline for more tech feel
                    let scanline1 = smoothstep(0.0, 0.08, scanY) * (1.0 - smoothstep(0.92, 1.0, scanY));
                    let scanline2 = smoothstep(0.5, 0.54, scanY) * (1.0 - smoothstep(0.96, 1.0, scanY));
                    let scanline = (scanline1 + scanline2 * 0.5) * 8.0;

                    // Landing Beam (Vertical Highlight) - wider and more pronounced
                    let beam = smoothstep(0.7, 0.0, abs(vUV.x - 0.5)) * 1.2;

                    // Enhanced wireframe with depth
                    let wireframe = smoothstep(0.88, 0.98, uvEdgeDist);
                    let innerWire = smoothstep(0.75, 0.85, uvEdgeDist) * 0.4;

                    // Brighten original color further
                    let ghostColor = vColor.rgb * 3.5;

                    // Tension-based pulse (reacts to lockPercent for panic feel)
                    let tension = smoothstep(0.25, 1.0, lockPercent);
                    let pulseFreq = 12.0 + tension * 35.0;
                   
                    // Ghost alpha with more variation + breathing pattern
                    let baseAlpha = 0.55 + 0.35 * sin(time * pulseFreq);
                    let breath = sin(time * 2.5) * 0.1 + 0.9;
                    var ghostAlpha = baseAlpha * breath;

                    // Holographic scan effect
                    let scanEffect = sin(vUV.y * 70.0 + time * 10.0) * 0.12;
                    let horizontalScan = sin(vUV.x * 40.0 - time * 6.0) * 0.08;

                    // Ghost Grid Pattern - finer details
                    let gridX = step(0.92, fract(vUV.x * 6.0));
                    let gridY = step(0.92, fract(vUV.y * 6.0));
                    let gridPattern = max(gridX, gridY) * 0.6;

                    // Glitch effect (Reacts to tension)
                    let glitchAmp = 0.04 + tension * 0.12;
                    var ghostGlitch = sin(vUV.y * 60.0 + time * (25.0 + tension * 40.0)) * glitchAmp;
                    if (tension > 0.4 && fract(time * 12.0) > 0.85) {
                         ghostGlitch += 0.15;
                    }

                    // Flicker effect
                    let flickerNoise = fract(sin(dot(vUV, vec2<f32>(12.9898, 78.233)) + time * 20.0) * 43758.5453);
                    if (flickerNoise > 0.94) {
                        ghostAlpha *= 0.4;
                    }

                    // Combine all effects
                    var ghostFinal = ghostColor * (wireframe + innerWire) * 7.0 // Bright edges
                                   + ghostColor * scanline * 2.5 // Scanlines
                                   + ghostColor * beam * 0.8 // Landing Beam
                                   + vec3<f32>(0.4, 0.85, 1.0) * fresnelTerm * 4.0; // Cyan/Blue rim

                    ghostFinal += vec3<f32>(ghostGlitch); // Glitch
                    ghostFinal += vec3<f32>(scanEffect + horizontalScan); // Scan overlays
                    ghostFinal += vec3<f32>(gridPattern) * ghostColor * 0.6; // Grid pattern

                    // Digital noise sparkles
                    let sparkleNoise = fract(sin(dot(vUV, vec2<f32>(12.9898, 78.233)) + time * 3.0) * 43758.5453);
                    if (sparkleNoise > 0.96) {
                        ghostFinal += vec3<f32>(2.0); // Bright sparkle
                    }
                   
                    // Tension warning overlay
                    if (tension > 0.6) {
                        let warnOverlay = vec3<f32>(1.0, 0.2, 0.0) * tension * 0.3;
                        ghostFinal += warnOverlay;
                    }
                    
                    ghostFinal *= 4.5; // Boost brightness
                    return vec4<f32>(ghostFinal, ghostAlpha);
                }

                // Simple PBR mix (solid blocks only)
                // Re-read texture for base color
                baseColor = textureSample(blockTexture, blockSampler, atlasUV).rgb;
                let pbrColor = mix(baseColor, baseColor * materialUniforms.metallic, materialUniforms.metallic);
                pbrColor = mix(pbrColor, vec3<f32>(1.0), materialUniforms.transmission * 0.4); // glass highlight
               
                // Blend PBR with existing lighting
                finalColor = mix(finalColor, pbrColor, 0.3);
                // Combine material alpha with block type alpha (solid=0.85, ghost=0.3)
                let finalAlpha = materialAlpha * vColor.w;
                return vec4<f32>(clamp(finalColor, vec3<f32>(0.0), vec3<f32>(1.0)), finalAlpha);
            }`;

    return { vertex, fragment };
};