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

                // Level Evolution
                let level = uniforms.level;
                let levelFactor = min(level * 0.1, 1.0); // 0 to 1 over 10 levels

                // Lighting
                let diffuse:f32 = max(dot(N, L), 0.0);

                // JUICE: Sharpness increases with level (Glassier)
                let shininessBoost = 1.0 + levelFactor * 2.0;
                let dotNH = max(dot(N, H), 0.0);
                var specular:f32 = pow(dotNH, ${params.shininess} * shininessBoost);
                specular += pow(dotNH, 64.0 * shininessBoost) * 0.4;
                let ambient:f32 = ${params.ambientIntensity};

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

                let goldColor = mix(texColor.rgb, vec3<f32>(1.0, 0.84, 0.36), 0.22);
                let glassColor = mix(
                    texColor.rgb,
                    texColor.rgb * 0.78 + vColor.rgb * 0.22 + vec3<f32>(0.06, 0.08, 0.1),
                    0.32
                );
                var baseColor = mix(glassColor, goldColor, metalMask);

                let materialAlpha = mix(0.72, 0.96, metalMask);

                // --- Tech Pattern Overlay (Optional - kept for style) ---
                let hexScale = 4.0;
                let uvHex = vUV * hexScale;
                let r = vec2<f32>(1.0, 1.73);
                let h = r * 0.5;
                let a = (uvHex - r * floor(uvHex / r)) - h;
                let b = ((uvHex - h) - r * floor((uvHex - h) / r)) - h;
                let guv = select(b, a, dot(a, a) < dot(b, b));
                let hexEdge = smoothstep(0.45, 0.5, length(guv));

                let uvScale = 3.0;
                let uvGrid = vUV * uvScale;
                let gridPos = fract(uvGrid);
                let gridThick = 0.05;
                let lineX = step(1.0 - gridThick, gridPos.x) + step(gridPos.x, gridThick);
                let lineY = step(1.0 - gridThick, gridPos.y) + step(gridPos.y, gridThick);
                let isTrace = max(lineX, lineY);

                if (hexEdge > 0.5) { baseColor *= mix(0.92, 0.98, metalMask); }
                if (isTrace > 0.5) { baseColor *= mix(0.75, 0.92, metalMask); }

                // --- Composition ---
                var finalColor:vec3<f32> = baseColor * (ambient + diffuse) + vec3<f32>${params.specularColor} * specular;

                // Add Glitch Mod
                finalColor += glitchColorMod;

                // Emissive
                let time = uniforms.time;
                let sineWave = sin(time * 3.0 + vPosition.y * 0.5 + vPosition.x * 0.5);
                let sineOff = sineWave * 0.5 + 0.5;
                let sine2 = sineOff * sineOff;
                let sine4 = sine2 * sine2;
                let pulsePos = sine4 * sine4;

                // Global breathing for all blocks
                let breath = sin(time * 2.0) * 0.1 + 0.1;
                // JUICE: Inner pulse frequency scales with level (Heartbeat)
                let pulseFreq = 5.0 + level * 0.5;
                // ENHANCED: Stronger, more vibrant inner pulse (Boosted)
                // Use a sharper sine wave (pow) for a heartbeat effect
                let rawPulse = sin(time * pulseFreq * 1.5 + level) * 0.5 + 0.5; // Added level to pulse
                let rawPulse2 = rawPulse * rawPulse;
                let sharpPulse = rawPulse2 * rawPulse2; // Sharper heartbeat pulse
                let innerPulse = sharpPulse * (1.2 + level * 0.3); // Stronger with level

                // Add a second, faster "jitter" pulse for high levels
                if (level > 5.0) {
                    innerPulse += sin(time * 20.0) * 0.1 * (level - 5.0) * 0.1;
                }

                // NEON BRICKLAYER: Volumetric Inner Plasma
                // Gaseous look inside the block
                let distCenter = distance(vUV, vec2<f32>(0.5));
                // ENHANCED: More complex noise for plasma effect
                let plasmaTime = time * 2.0;
                let plasmaNoise1 = sin(vUV.x * 10.0 + plasmaTime) * sin(vUV.y * 10.0 - plasmaTime);
                let plasmaNoise2 = sin(vUV.x * 20.0 - plasmaTime * 0.5) * sin(vUV.y * 20.0 + plasmaTime * 0.5);
                let plasmaNoise = (plasmaNoise1 + plasmaNoise2) * 0.25 + 0.5; // range 0..1

                let innerGlow = smoothstep(0.5, 0.0, distCenter) * (0.6 + plasmaNoise * 0.4);

                let emissiveStrength = mix(0.45, 0.18, metalMask);
                finalColor += vColor.rgb * (breath + innerPulse + innerGlow * 0.8) * emissiveStrength;

                // ENHANCED: Glass/Neon Rim Lighting
                // Sharper falloff (power 4.0) for a more distinct edge
                // BOOSTED: Increased base intensity from 15.0 to 18.0
                let rimFalloff = 1.0 - max(dot(N, V), 0.0);
                let rimFalloff2 = rimFalloff * rimFalloff;
                let rimLight = rimFalloff2 * rimFalloff2 * (18.0 + level * 1.0);

                // Rim Color Shift: Cyan tint on the rim
                let rimColor = mix(vColor.rgb, vec3<f32>(0.5, 1.0, 1.0), 0.6);
                let rimStrength = mix(0.18, 0.08, metalMask);
                finalColor += rimColor * rimLight * rimStrength;

                if (isTrace > 0.5) {
                    finalColor += vColor.rgb * pulsePos * 4.0;
                }

                // Fresnel (Boosted for Glass look)
                // JUICE: Sharper falloff for distinct neon rim
                // Clamp bases to 0.0 to avoid NaN in pow()
                let dotNV = max(dot(N, V), 0.0);
                // BOOSTED: Sharper fresnel curve (power 2.5 instead of 3.0)
                // Use chained multiplication where possible. For 2.5 we can use base2 * sqrt(base).
                let fresnelBase = 1.0 - dotNV;
                let fresnelBase2 = fresnelBase * fresnelBase;
                let baseFresnel = fresnelBase2 * sqrt(fresnelBase);
                let fresnelTerm = baseFresnel; // Alias for legacy code

                // NEON BRICKLAYER: Diamond Refraction (Real Dispersion)
                // Shift the fresnel curve for each channel based on level
                let dispersion = 0.8 * levelFactor;

                // Diamond refraction logic using dot(normal, view) modulated by level
                let dispR = max(0.0, 1.0 - dotNV * (1.0 - dispersion * 0.5));
                let dispR2 = dispR * dispR;
                let fR = dispR2 * dispR2;
                let fG = baseFresnel;
                let dispB = max(0.0, 1.0 - dotNV * (1.0 + dispersion * 0.5));
                let dispB2 = dispB * dispB;
                let fB = dispB2 * dispB2;

                var irid = vec3<f32>(fR, fG, fB);

                // Add iridescence (oil slick) on top
                irid += vec3<f32>(
                    sin(baseFresnel * 10.0 + time) * 0.5 + 0.5,
                    cos(baseFresnel * 10.0 + time) * 0.5 + 0.5,
                    sin(baseFresnel * 15.0 + time) * 0.5 + 0.5
                ) * 0.5;

                finalColor += irid * (0.5 + levelFactor * 0.8) * glassMask;

                // NEON BRICKLAYER: Beveled Edge Highlight
                // Simulates a rounded corner catching the light
                let uvEdgeDist = max(abs(vUV.x - 0.5), abs(vUV.y - 0.5)) * 2.0;
                let edgeGlow = smoothstep(0.85, 1.0, uvEdgeDist);

                // Add directional highlight on the bevel
                let lightDir2D = normalize(vec2<f32>(0.5, -1.0)); // Top-right light
                let edgeDir = normalize(vUV - 0.5);
                let bevelHighlight = max(dot(edgeDir, lightDir2D), 0.0) * edgeGlow;

                finalColor += vec3<f32>(1.0) * edgeGlow * (0.3 + levelFactor * 0.2 + metalMask * 0.15);
                finalColor += vec3<f32>(1.0) * bevelHighlight * mix(1.6, 0.9, metalMask);

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
                finalColor += vec3<f32>(noise) * 0.03;

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
                    let ghostAlpha = 0.6 + 0.4 * sin(time * pulseFreq); // More dynamic range

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
                    let ghostGlitch = sin(vUV.y * 50.0 + time * (20.0 + tension * 50.0)) * glitchAmp;
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
                return vec4<f32>(finalColor, finalAlpha);
            }`;

    return { vertex, fragment };
};
