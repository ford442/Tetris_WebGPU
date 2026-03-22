/**
 * Main Block Shader
 * Primary 3D tetromino block renderer with texture atlas sampling, lighting,
 * ghost piece, and lock-percent effects.
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
                output.vNormal   = uniforms.normalMatrix * normal;
                output.Position  = uniforms.viewProjectionMatrix * mPosition;
                output.vColor    = uniforms.colorVertex;
                output.vUV       = uv;
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
                level: f32,       // Offset 60
            };
            @binding(1) @group(0) var<uniform> uniforms : Uniforms;
            @binding(2) @group(0) var blockTexture: texture_2d<f32>;
            @binding(3) @group(0) var blockSampler: sampler;

            @fragment
            fn main(@location(0) vPosition: vec4<f32>, @location(1) vNormal: vec4<f32>,@location(2) vColor: vec4<f32>, @location(3) vUV: vec2<f32>) ->  @location(0) vec4<f32> {
               
                var N:vec3<f32> = normalize(vNormal.xyz);
                let L:vec3<f32> = normalize(uniforms.lightPosition.xyz - vPosition.xyz);
                let V:vec3<f32> = normalize(uniforms.eyePosition.xyz - vPosition.xyz);
                let H:vec3<f32> = normalize(L + V);

                // Lighting
                let diffuse:f32 = max(dot(N, L), 0.0);

                let dotNH = max(dot(N, H), 0.0);
                // Single tight specular highlight for polished surface
                var specular:f32 = pow(dotNH, 800.0);

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
                let metalMask = smoothstep(0.95, 1.45, goldSignal);
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
                // Energy-conserving: ambient provides floor (0.3), diffuse scales remaining (0.7)
                // so total light factor stays in [0.3, 1.0] and never blows out the texture.
                let lightFactor = 0.25 + diffuse * 0.65; // max = 0.9, leaves room for specular
                // Very subtle specular: just a glint on metal, barely visible on glass
                let specularStrength = mix(0.04, 0.12, metalMask);
                var finalColor:vec3<f32> = baseColor * lightFactor + vec3<f32>${params.specularColor} * specular * specularStrength;

                // Add Glitch Mod
                finalColor += glitchColorMod;

                // Subtle emissive: gentle breathing glow in the glass center only
                let time = uniforms.time;
                let breath = sin(time * 1.5) * 0.03 + 0.03;
                let distCenter = distance(vUV, vec2<f32>(0.5));
                let centerGlow = smoothstep(0.45, 0.1, distCenter);
                finalColor += vColor.rgb * breath * centerGlow * glassMask * 0.5;

                // Gentle rim lighting -- just enough to outline the block shape
                let rimFalloff = 1.0 - max(dot(N, V), 0.0);
                let rimFalloff2 = rimFalloff * rimFalloff;
                let rimLight = rimFalloff2 * rimFalloff2 * 4.0;
                finalColor += vec3<f32>(1.0) * rimLight * 0.04;

                // Simple fresnel (needed for ghost piece downstream)
                let dotNV = max(dot(N, V), 0.0);
                let fresnelBase = 1.0 - dotNV;
                let fresnelBase2 = fresnelBase * fresnelBase;
                let fresnelTerm = fresnelBase2 * fresnelBase2;

                // Edge distance (needed for ghost piece wireframe downstream)
                let uvEdgeDist = max(abs(vUV.x - 0.5), abs(vUV.y - 0.5)) * 2.0;

                // Lock Tension Pulse (Heartbeat & Alarm)
                let lockPercent = uniforms.lockPercent;
                if (lockPercent > 0.3) {
                     // NEON BRICKLAYER: Only active when > 30% locked (Panic Mode starts earlier)
                     let tension = smoothstep(0.3, 1.0, lockPercent); // Remap 0.3->1.0 to 0.0->1.0

                     // Heartbeat rhythm: faster as it gets closer to 1.0
                     let beatSpeed = 8.0 + tension * 80.0; // JUICE: Even faster panic mode
                     let pulse = sin(time * beatSpeed) * 0.5 + 0.5;

                     // Optimization: Replace pow with chained multiplication where possible.
                     // The power is between 2.0 and 6.0 based on tension. We can approximate or use pow.
                     // Actually, since pow is somewhat expensive and the tension is [0..1],
                     // an integer power like 2, 4 or 6 through chained multiplication is faster.
                     // A mix between 2 and 6:
                     let pulse2 = pulse * pulse;
                     let pulse4 = pulse2 * pulse2;
                     let pulse6 = pulse4 * pulse2;
                     let sharpPulse = mix(pulse2, pulse6, tension);

                     // Digital Grid Scan Effect (Digitizing in/out)
                     // Scanline that moves up/down based on pulse
                     let scanY = fract(vUV.y * 10.0 + time * 5.0);
                     let scanLine = step(0.9, scanY) * tension * sharpPulse;

                     // Mix to Warning Red
                     let warningColor = vec3<f32>(1.0, 0.0, 0.2); // Cyberpunk Red
                     finalColor = mix(finalColor, warningColor, tension * sharpPulse * 1.5);

                     // Add Scanline Emission
                     finalColor += warningColor * scanLine * 3.0;
                }

                // Subtle Surface Noise (Texture)
                let noise = fract(sin(dot(vUV, vec2<f32>(12.9898, 78.233))) * 43758.5453);
                finalColor += vec3<f32>(noise) * 0.015;

                // Ghost Piece Logic
                if (vColor.w < 0.4) {
                    // Hologram Effect - High Tech (ENHANCED)
                    // Faster scanlines for more energy
                    let scanSpeed = 30.0; // Faster scan speed
                    // INCREASED Frequency: 60.0 -> 80.0 (Finer lines)
                    let scanY = fract(vUV.y * 80.0 - time * scanSpeed);
                    // ENHANCED: Sharper, more visible scanline
                    let scanline = smoothstep(0.0, 0.1, scanY) * (1.0 - smoothstep(0.9, 1.0, scanY)) * 10.0; // Boosted intensity

                    // Landing Beam (Vertical Highlight)
                    let beam = smoothstep(0.6, 0.0, abs(vUV.x - 0.5)) * 0.8;

                    // Wireframe logic (from edgeGlow)
                    let wireframe = smoothstep(0.9, 0.98, uvEdgeDist);

                    let ghostColor = vColor.rgb * 3.0; // Brighten original color further

                    // NEON BRICKLAYER: Tension-based pulse
                    let tension = smoothstep(0.3, 1.0, lockPercent); // Start reacting earlier
                    let pulseFreq = 10.0 + tension * 40.0; // Speed up significantly when locking

                    // ENHANCED Pulse: Slower, fuller, reacts to lock
                    var ghostAlpha = 0.6 + 0.4 * sin(time * pulseFreq); // More dynamic range

                    // Holographic Scanline
                    let scanEffect = sin(vUV.y * 80.0 + time * 8.0) * 0.15;

                    // NEON BRICKLAYER: Ghost Grid Pattern
                    // Adds a wireframe feel to the hologram
                    let gridX = step(0.9, fract(vUV.x * 4.0));
                    let gridY = step(0.9, fract(vUV.y * 4.0));
                    let gridPattern = max(gridX, gridY) * 0.5;

                    // NEW Glitch effect (Reacts to tension)
                    let glitchAmp = 0.03 + tension * 0.1;
                    // Chaotic glitch
                    var ghostGlitch = sin(vUV.y * 50.0 + time * (20.0 + tension * 50.0)) * glitchAmp;
                    if (tension > 0.5 && fract(time * 10.0) > 0.8) {
                         ghostGlitch += 0.1; // Big glitch jump
                    }

                    // Added Flicker
                    if (fract(time * 30.0) > 0.95) {
                        ghostAlpha *= 0.5;
                    }

                    var ghostFinal = ghostColor * wireframe * 6.0  // Bright edges
                                   + ghostColor * scanline * 2.0   // Scanlines (Boosted)
                                   + ghostColor * beam * 0.6       // Landing Beam
                                   + vec3<f32>(0.5, 0.9, 1.0) * fresnelTerm * 3.0; // Cyan/Blue rim

                    ghostFinal += vec3<f32>(ghostGlitch); // Add glitch to color
                    ghostFinal += vec3<f32>(scanEffect); // Add scanline overlay
                    ghostFinal += vec3<f32>(gridPattern) * ghostColor * 0.5; // Add grid pattern (Boosted)

                    // Digital noise/flicker
                    let noise = fract(sin(dot(vUV, vec2<f32>(12.9898, 78.233)) + time) * 43758.5453);
                    if (noise > 0.92) {
                        ghostFinal += vec3<f32>(1.5); // Sparkle
                    }

                    ghostFinal *= 5.0; // Boost brightness

                    return vec4<f32>(ghostFinal, ghostAlpha);
                }

                // Combine material alpha with block type alpha (solid=0.85, ghost=0.3)
                let finalAlpha = materialAlpha * vColor.w;
                return vec4<f32>(clamp(finalColor, vec3<f32>(0.0), vec3<f32>(1.0)), finalAlpha);
            }`;

    return { vertex, fragment };
};
