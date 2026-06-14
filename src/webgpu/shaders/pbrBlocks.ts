/**
 * PBR Block Shader with Configurable Texture Sampling
 *
 * Features:
 * - Full PBR material model (metallic, roughness, transmission, etc.)
 * - Configurable texture sampling supporting single textures, atlases, or subregions
 * - Material-aware lighting that preserves metal frame + glass detail
 * - Per-piece material variation support
 * - Integration with particle-material interaction system
 *
 * Material Types:
 * 0: Classic (basic lighting, no PBR)
 * 1: Gold (anisotropic metal, warm reflections)
 * 2: Chrome (mirror-like, cool reflections)
 * 3: Glass (transmission, refraction, dispersion)
 * 4: Cyber (emissive, neon edges)
 * 5: Gem (subsurface scattering, faceted)
 */

import { getSimpleTextureSamplingWGSL } from '../textureSampling.js';

// PBR Functions shared with premiumBlocks.ts
export const PBRFunctions = `
// PBR Helper Functions
fn distributionGGX(NdotH: f32, roughness: f32) -> f32 {
    let a = roughness * roughness;
    let a2 = a * a;
    let NdotH2 = NdotH * NdotH;
    let denom = NdotH2 * (a2 - 1.0) + 1.0;
    return a2 / (3.14159 * denom * denom);
}
fn geometrySmith(NdotV: f32, NdotL: f32, roughness: f32) -> f32 {
    let r = roughness + 1.0;
    let k = (r * r) / 8.0;
    let ggx1 = NdotV / (NdotV * (1.0 - k) + k);
    let ggx2 = NdotL / (NdotL * (1.0 - k) + k);
    return ggx1 * ggx2;
}
fn fresnelSchlick(cosTheta: f32, F0: vec3f) -> vec3f {
    let c1 = 1.0 - cosTheta;
    let c2 = c1 * c1;
    return F0 + (vec3f(1.0) - F0) * (c2 * c2 * c1);
}
fn anisotropicSpecular(V: vec3f, L: vec3f, N: vec3f, roughness: f32, aniso: f32) -> f32 {
    let H = normalize(V + L);
    let T = vec3f(1.0, 0.0, 0.0);
    let B = vec3f(0.0, 1.0, 0.0);
    let ToH = dot(T, H);
    let BoH = dot(B, H);
    let NoH = dot(N, H);
    let a2 = roughness * roughness;
    let aspect = sqrt(1.0 - aniso * 0.9);
    let ax = max(a2 / aspect, 0.001);
    let ay = max(a2 * aspect, 0.001);
    return 1.0 / (3.14159 * ax * ay * NoH * NoH * NoH * NoH);
}
fn proceduralEnvReflect(R: vec3f, time: f32) -> vec3f {
    let up = R.y * 0.5 + 0.5;
    let horizon = 1.0 - abs(R.y);
    var env = mix(vec3f(0.1, 0.15, 0.3), vec3f(0.4, 0.5, 0.7), up);
    let h2 = horizon * horizon; env += vec3f(0.3, 0.4, 0.5) * h2 * h2;
    let light1 = sin(R.x * 3.0 + time * 0.5) * sin(R.y * 2.0) * 0.5 + 0.5;
    let light2 = sin(R.z * 4.0 - time * 0.3) * sin(R.x * 3.0) * 0.5 + 0.5;
    env += vec3f(0.2, 0.15, 0.1) * light1 * light1;
    env += vec3f(0.1, 0.15, 0.2) * light2 * light2;
    return env;
}
fn subsurfaceScattering(NdotL: f32, subsurface: f32, color: vec3f) -> vec3f {
    let w = NdotL * 0.5 + 0.5; let wrap = w * w;
    return color * wrap * subsurface;
}
`;

export const PBRBlockShaders = () => {
    const vertex = `
        struct VertexUniforms {
            viewProjectionMatrix : mat4x4<f32>,
            modelMatrix          : mat4x4<f32>,
            normalMatrix         : mat4x4<f32>,
            colorVertex          : vec4<f32>
        };
        @binding(0) @group(0) var<uniform> vUniforms : VertexUniforms;

        struct VertexOutput {
            @builtin(position) Position : vec4f,
            @location(0) vWorldPos      : vec4f,
            @location(1) vNormal        : vec3f,
            @location(2) vColor         : vec4f,
            @location(3) vUV            : vec2f
        };

        @vertex
        fn main(
            @location(0) position : vec4<f32>,
            @location(1) normal   : vec4<f32>,
            @location(2) uv       : vec2<f32>
        ) -> VertexOutput {
            var out: VertexOutput;
            let worldPos         = vUniforms.modelMatrix * position;
            out.vWorldPos        = worldPos;
            out.vNormal          = (vUniforms.normalMatrix * normal).xyz;
            out.Position         = vUniforms.viewProjectionMatrix * worldPos;
            out.vColor           = vUniforms.colorVertex;
            out.vUV              = uv;
            return out;
        }
    `;

    // Get configurable texture sampling code
    const textureSamplingCode = getSimpleTextureSamplingWGSL();

    const fragment = `
        // =========================================================================
        // FRAGMENT UNIFORMS - 224 bytes (audio bands at 184+, WGSL struct tail padding)
        // =========================================================================
        struct FragmentUniforms {
            lightPosition : vec4f,      // 0-15
            eyePosition   : vec4f,      // 16-31
            time          : f32,        // 32
            useGlitch     : f32,        // 36
            lockPercent   : f32,        // 40
            level         : f32,        // 44
            metallic      : f32,        // 48
            roughness     : f32,        // 52
            transmission  : f32,        // 56
            ior           : f32,        // 60
            subsurface    : f32,        // 64
            clearcoat     : f32,        // 68
            anisotropic   : f32,        // 72
            dispersion    : f32,        // 76
            materialType  : u32,        // 80 (0=classic,6=lava,7=hologram)
            particleIntensity : f32,    // 84
            enablePBR     : f32,        // 88
            textureMix    : f32,        // 92
            movementFlash : f32,        // 96
            lineClearFlash: f32,        // 100
            magnetWorldX  : f32,        // 104 (for subtle placed-block UV lean toward active piece)
            magnetWorldY  : f32,        // 108
            magnetStrength: f32,        // 112 (first of reserved2; 1.0 when active, 0 on lock)
            pad2          : f32,        // 116
            reserved2     : vec4f,      // 120-127 (remaining)
            padHeights    : vec4f,      // 128-143 (preserve 128/132 for underwater flash timers)
            columnHeights : array<f32, 10>, // 144 (10*4=40B; per-col top row for depth shadows)
            bassLevel     : f32,        // 184 (audio reactive border glow: bass -> L/R sides)
            midLevel      : f32,        // 188 (mid -> bottom)
            trebleLevel   : f32,        // 192 (treble -> top)
            padAudio      : f32,        // 196
            _structPad    : vec2f,      // 200 (WGSL pads struct to 224B minBindingSize)
        };
        @binding(1) @group(0) var<uniform> fUniforms : FragmentUniforms;
        @binding(2) @group(0) var blockTexture : texture_2d<f32>;
        @binding(3) @group(0) var blockSampler : sampler;

        ${PBRFunctions}
        
        // ============================================================================
        // CONFIGURABLE TEXTURE SAMPLING
        // ============================================================================
        ${textureSamplingCode}

        fn acesToneMapping(color: vec3f) -> vec3f {
            let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
            return clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3f(0.0), vec3f(1.0));
        }

        @fragment
        fn main(@location(0) vWorldPos : vec4f,
                @location(1) vNormal : vec3f,
                @location(2) vColor : vec4f,
                @location(3) vUV : vec2f) -> @location(0) vec4f {

            let time = fUniforms.time;
            let N = normalize(vNormal);
            let V = normalize(fUniforms.eyePosition.xyz - vWorldPos.xyz);
            let L = normalize(fUniforms.lightPosition.xyz - vWorldPos.xyz);
            let H = normalize(L + V);
            let NdotL = max(dot(N, L), 0.0);
            let NdotV = max(dot(N, V), 0.0);
            let NdotH = max(dot(N, H), 0.0);

            // Apply configurable texture sampling
            var texUV = transformUVForSampling(vUV);
            
            // Glitch effect
            if (fUniforms.useGlitch > 0.0) {
                let glitchOffset = fUniforms.useGlitch * 0.03 * sin(texUV.y * 40.0 + time * 15.0);
                texUV.x += glitchOffset;
            }

            // Subtle magnetic UV wobble on placed blocks within ~2 rows of active piece.
            // "Lean toward" the falling piece via small signed UV offset proportional to horiz world distance.
            // Stash + strength computed in viewPlayfield.ts each frame; zeroed on lock (no activePiece).
            if (fUniforms.magnetStrength > 0.01) {
                let dx = vWorldPos.x - fUniforms.magnetWorldX;
                let dy = abs(vWorldPos.y - fUniforms.magnetWorldY);
                let rowDist = dy * 0.45; // approx world-units-per-row (BLOCK_WORLD_SIZE ~2.2)
                if (rowDist < 2.3) {
                    let proximity = 1.0 - (rowDist / 2.3);
                    let lean = dx * 0.009 * proximity * fUniforms.magnetStrength; // subtle, signed for lean direction
                    texUV.x += lean;
                    texUV.y += lean * 0.12 * proximity; // tiny vertical for volume/3D feel
                }
            }

            // Sample the authored block image from its sharpest mip. The 3D block faces
            // are small enough on screen that implicit LOD selection can soften the gold/glass detail.
            let texColor = textureSampleLevel(blockTexture, blockSampler, texUV, 0.0);
            
            // Per-pixel warmth masks (used for low-mix / PBR fallback paths).
            let textureMasks = extractMaterialMask(texColor.rgb);
            let textureMetalMask = textureMasks.x;
            let textureGlassMask = textureMasks.y;

            // Geometric frame mask — matches the reference go.1ink.us build.
            // Gold frame lives on the UV perimeter; stained-glass window is the interior.
            // Per-pixel warmth detection is unreliable on block.png edge pixels.
            let distX = min(vUV.x, 1.0 - vUV.x);
            let distY = min(vUV.y, 1.0 - vUV.y);
            let distEdge = min(distX, distY);
            let borderThickness = 0.15;
            let glassMaskGeo = smoothstep(borderThickness - 0.02, borderThickness, distEdge);
            let metalMaskGeo = 1.0 - glassMaskGeo;

            let textureMix = fUniforms.textureMix;
            // Border frame always samples block.png gold/crystal detail at full strength
            let isBorderBlock = vWorldPos.x < -0.8 || vWorldPos.x > 21.0
                             || vWorldPos.y > 1.5 || vWorldPos.y < -44.5;
            let effectiveTextureMix = max(textureMix, select(0.0, 0.94, isBorderBlock));
            let useAuthoredSampling = effectiveTextureMix > 0.45;

            // Blend geometric frame with texture warmth (gold hinges read from block.png pixels).
            let combinedMetalMask = clamp(
                max(metalMaskGeo, textureMetalMask * 0.92),
                0.0, 1.0
            );
            let combinedGlassMask = 1.0 - combinedMetalMask;

            let metalMask = select(textureMetalMask, combinedMetalMask, useAuthoredSampling);
            let glassMask = select(textureGlassMask, combinedGlassMask, useAuthoredSampling);

            let luma = dot(texColor.rgb, vec3f(0.299, 0.587, 0.114));
            let crystalBright = smoothstep(0.15, 0.90, luma);
            let crystalHi = max(luma - 0.65, 0.0) * 2.5;
            let metalColor = texColor.rgb * 1.38 + vec3f(0.04, 0.018, 0.0);
            let glassColor = texColor.rgb * (0.70 + crystalBright * 0.30)
                           + vColor.rgb * 0.22 * crystalBright
                           + vec3f(crystalHi * 0.40);
            let authoredBase = mix(glassColor, metalColor, combinedMetalMask);
            let textureBase = composeMaterialBaseColor(texColor.rgb, vColor.rgb, textureMetalMask);

            var baseColor: vec3f;
            if (useAuthoredSampling) {
                baseColor = authoredBase;
            } else {
                baseColor = mix(vColor.rgb, textureBase, clamp(effectiveTextureMix, 0.0, 1.0));
            }

            let materialType = fUniforms.materialType;
            var finalColor: vec3f;
            var finalAlpha = 1.0;

            // Tight specular (shared across paths)
            let nh2 = NdotH * NdotH;
            let nh4 = nh2 * nh2;
            let nh16 = nh4 * nh4 * nh4 * nh4;
            let nh128 = nh16 * nh16 * nh16 * nh16 * nh16 * nh16 * nh16 * nh16;
            let tightSpec = nh128;

            if (useAuthoredSampling) {
                // Authored block.png path: gold frame + stained-glass crystal (reference build)
                let lightFactor = 0.38 + NdotL * 0.62;
                let specularStrength = mix(0.04, 0.18, metalMask);
                finalColor = baseColor * lightFactor + vec3f(tightSpec * specularStrength);

                if (metalMask > 0.2 && fUniforms.metallic > 0.3) {
                    let R = reflect(-V, N);
                    let warmEnv = proceduralEnvReflect(R, time) * vec3f(1.15, 0.92, 0.55);
                    let fresnel = 1.0 - NdotV;
                    let fresnel3 = fresnel * fresnel * fresnel;
                    finalColor += warmEnv * fresnel3 * metalMask * fUniforms.metallic * 0.85;
                    let metalRough = max(fUniforms.roughness, 0.08);
                    let D = distributionGGX(NdotH, metalRough);
                    let G = geometrySmith(NdotV, NdotL, metalRough);
                    let metalSpec = (D * G) / max(4.0 * NdotV * NdotL, 0.001);
                    finalColor += vec3f(metalSpec) * metalMask * 0.35;
                }

                if (glassMask > 0.2) {
                    let iridescence = sin(NdotV * 8.0 - time * 0.5) * 0.5 + 0.5;
                    let rainbow = vec3f(
                        sin(iridescence * 6.28) * 0.5 + 0.5,
                        sin(iridescence * 6.28 + 2.09) * 0.5 + 0.5,
                        sin(iridescence * 6.28 + 4.18) * 0.5 + 0.5
                    );
                    finalColor += rainbow * tightSpec * 0.22 * glassMask;
                    let diffCenter = vUV - vec2f(0.5);
                    let centerGlow = clamp((0.2025 - dot(diffCenter, diffCenter)) / 0.1225, 0.0, 1.0);
                    let breath = sin(time * 1.5) * 0.03 + 0.03;
                    finalColor += vColor.rgb * breath * centerGlow * glassMask * 0.8;
                    let edgeFresnel = 1.0 - NdotV;
                    let edge3 = edgeFresnel * edgeFresnel * edgeFresnel;
                    finalColor += vec3f(0.4, 0.65, 0.95) * edge3 * glassMask * 0.35;
                }

                // Opaque gold frame; stained-glass window stays readable over the video portal.
                let edgeFresnel = 1.0 - NdotV;
                let fresnelSq = edgeFresnel * edgeFresnel;
                let glassOpacity = mix(0.82, 0.97, fresnelSq);
                finalAlpha = mix(1.0, glassOpacity, combinedGlassMask);
            } else if (fUniforms.enablePBR < 0.5 || materialType == 0u) {
                // Classic mode
                let lightFactor = 0.4 + NdotL * 0.6;
                finalColor = baseColor * lightFactor;
                finalColor += vec3f(tightSpec * metalMask * 0.5);
            } else {
                // Full PBR
                let metallic = fUniforms.metallic;
                let roughness = fUniforms.roughness;
                let transmission = fUniforms.transmission;

                let F0_dielectric = vec3f(0.04);
                let F0 = mix(F0_dielectric, baseColor, metallic * metalMask);
                let F = fresnelSchlick(NdotV, F0);

                var specular = 0.0;
                if (fUniforms.anisotropic > 0.0 && metalMask > 0.5) {
                    specular = anisotropicSpecular(V, L, N, roughness, fUniforms.anisotropic);
                } else {
                    let D = distributionGGX(NdotH, roughness);
                    let G = geometrySmith(NdotV, NdotL, roughness);
                    specular = (D * G) / max(4.0 * NdotV * NdotL, 0.001);
                }

                let kd = (vec3f(1.0) - F) * (1.0 - metallic * metalMask);
                let diffuse = baseColor * NdotL * kd / 3.14159;

                let R = reflect(-V, N);
                let envColor = proceduralEnvReflect(R, time);
                // Warm environment tint on gold frame — avoids cold blue static on metal
                let warmEnv = envColor * vec3f(1.18, 0.94, 0.52);
                let metalEnv = mix(envColor, warmEnv, metalMask);
                let reflection = metalEnv * F * metallic * metalMask;

                finalColor = diffuse + vec3f(specular) * (0.5 + metallic * metalMask);
                finalColor += reflection;

                // Glass transmission: refraction + edge reflection (not raw texture noise)
                if (transmission > 0.0 && glassMask > 0.1) {
                    let f1 = 1.0 - NdotV;
                    let fresnel = f1 * f1 * f1;
                    let glassOpacity = mix(0.12, 0.92, fresnel);
                    finalAlpha = mix(1.0, glassOpacity, transmission * glassMask);

                    let refractDir = refract(-V, N, 1.0 / max(fUniforms.ior, 1.01));
                    let refractEnv = proceduralEnvReflect(refractDir, time);
                    let glassTint = mix(vec3f(0.92, 0.96, 1.0), vColor.rgb, 0.22);
                    let refractedColor = refractEnv * glassTint;
                    let glassReflect = envColor * fresnel * 0.28 * glassMask;
                    let glassBody = mix(refractedColor, finalColor, 0.38 * glassMask);
                    finalColor = mix(finalColor, glassBody + glassReflect, transmission * glassMask);

                    if (fUniforms.dispersion > 0.0) {
                        let edgeFactor = f1 * f1;
                        finalColor += vec3f(
                            fUniforms.dispersion * edgeFactor * glassMask * 0.06,
                            fUniforms.dispersion * edgeFactor * glassMask * 0.03,
                            -fUniforms.dispersion * edgeFactor * glassMask * 0.04
                        );
                    }
                }

                // Gem subsurface
                if (fUniforms.subsurface > 0.0 && materialType == 5u) {
                    let scatter = subsurfaceScattering(NdotL, fUniforms.subsurface, baseColor);
                    finalColor += scatter * vColor.rgb;
                }

                // Clearcoat
                if (fUniforms.clearcoat > 0.0) {
                    let ccD = distributionGGX(NdotH, 0.03);
                    let ccG = geometrySmith(NdotV, NdotL, 0.03);
                    let ccSpec = (ccD * ccG) / max(4.0 * NdotV * NdotL, 0.001);
                    finalColor += vec3f(ccSpec) * fUniforms.clearcoat;
                }
            }

            // Rim lighting - Fresnel Schlick approximation (rimPower^4) for brighter edge glow
            let rimPower = 1.0 - NdotV;
            let rimPower2 = rimPower * rimPower;
            let rimPower4 = rimPower2 * rimPower2;
            let rimColor = mix(vColor.rgb, vec3f(1.0), metalMask * fUniforms.metallic);
            let dynamicRim = 5.0 + (fUniforms.movementFlash * 3.0) + (fUniforms.lineClearFlash * 10.0);
            finalColor += rimColor * rimPower4 * dynamicRim; // JUICE: Enhanced Fresnel Rim Lighting + Dynamic Flash

            // Lock tension effect
            let lockPercent = fUniforms.lockPercent;
            if (lockPercent > 0.25) {
                let tension = smoothstep(0.25, 1.0, lockPercent);
                let pulse = sin(time * (10.0 + tension * 30.0)) * 0.5 + 0.5;
                let warnColor = mix(vec3f(1.0, 0.6, 0.0), vec3f(1.0, 0.1, 0.0), tension);
                finalColor = mix(finalColor, warnColor, tension * pulse * pulse * 0.3);
            }

            // Ghost piece - use pre-sampled texture (textureSample called outside conditional for uniform control flow)
            let isGhost = vColor.w < 0.4;
            if (isGhost) {
                let scanY = fract(vUV.y * 50.0 - time * 15.0);
                let scan = smoothstep(0.0, 0.1, scanY) * (1.0 - smoothstep(0.9, 1.0, scanY));
                let wire = smoothstep(0.9, 0.98, max(abs(vUV.x - 0.5), abs(vUV.y - 0.5)) * 2.0);
                let ghostColor = vColor.rgb * 3.0 * (wire + scan * 0.5);
                let g1 = 1.0 - NdotV;
                let ghostColorFinal = ghostColor + vec3f(0.4, 0.7, 1.0) * (g1 * g1 * g1) * 1.5;
                return vec4f(ghostColorFinal, 0.35 + scan * 0.2);
            }

            // Gentle emissive pulse (main.ts uses 0.25 scale to avoid washout)
            let idlePulse = sin(time * 3.0) * 0.5 + 0.5;
            let emissivePulse = idlePulse * 0.25 + fUniforms.movementFlash * 0.4 + fUniforms.lineClearFlash * 0.8;
            finalColor += finalColor * emissivePulse;

            // Lava-specific magma glow: slow pulsing + bubbling variation (cooling magma look)
            if (materialType == 6u) {
                let magmaSlow = sin(time * 1.6) * 0.5 + 0.5;
                let magmaFast = sin(time * 5.3 + vWorldPos.x * 7.0) * 0.35 + 0.65;
                let magmaPulse = magmaSlow * 0.7 + magmaFast * 0.3;
                // Extra intensity on lava (high emissive values from material)
                finalColor += baseColor * magmaPulse * 2.1;
            }

            // Hologram material: animated horizontal scanline overlay for holographic projection
            if (materialType == 7u) {
                let scanDensity = 42.0;
                let scrollSpeed = 0.75; // slow downward scroll
                // Use vUV.y for consistent horizontal lines across the block face
                let scanPos = vUV.y * scanDensity - time * scrollSpeed;
                let scan = fract(scanPos);
                let lineWidth = 0.07;
                // Soft bright horizontal lines (classic holo scan)
                let scanIntensity = smoothstep(0.0, lineWidth, scan) *
                                    smoothstep(lineWidth * 2.2, lineWidth, scan);
                // Flicker frequency increases with level (tied to fUniforms.level)
                let flickerFreq = 5.5 + fUniforms.level * 3.2;
                let flicker = 0.65 + 0.35 * sin(time * flickerFreq + vUV.x * 7.0);
                let holoAlpha = 0.28 * scanIntensity * flicker;
                // Cool holographic cyan tint, additive for projection "glow"
                let holoTint = vec3f(0.55, 0.82, 1.0);
                finalColor += holoTint * holoAlpha * 2.8;
                // Slight desaturation/base reduction for see-through holo effect
                finalColor *= (0.78 + holoAlpha * 0.25);
            }

            // Depth-based soft shadow: each block casts downward onto lower blocks in same column.
            // columnHeights[c] = topmost row (0=top) or 20; vertical dist in rows from vWorldPos (2.2 hardcoded).
            // Additional darkening term, subtle, only for solid placed blocks (ghosts early-return before).
            {
                let colF = floor(vWorldPos.x / 2.2 + 0.0001);
                let col = i32(clamp(colF, 0.0, 9.0));
                let topRow = fUniforms.columnHeights[col];
                let myRow = floor(-vWorldPos.y / 2.2 + 0.0001);
                let vDepth = myRow - topRow;
                if (topRow >= 0.0 && vDepth > 0.5) {
                    let shadow = clamp(vDepth / 9.0, 0.0, 0.28); // soft max ~28% darken deep in stack
                    finalColor *= (1.0 - shadow);
                }
            }

            // Audio-reactive border glow pulsing driven by bands written from viewRenderLoop.
            // bassLevel pulses left/right outer frame, trebleLevel top, midLevel bottom.
            // Detects border via vWorldPos ranges (outside main board rect); boosts emissive.
            {
                var borderBoost = 0.0;
                if (vWorldPos.x < -0.8 || vWorldPos.x > 21.0) {
                    borderBoost = fUniforms.bassLevel * 0.55; // L/R sides
                } else if (vWorldPos.y > 1.5) {
                    borderBoost = fUniforms.trebleLevel * 0.55; // top
                } else if (vWorldPos.y < -44.5) {
                    borderBoost = fUniforms.midLevel * 0.55; // bottom
                }
                finalColor += vec3f(borderBoost);
            }

            finalColor = clamp(finalColor, vec3f(0.0), vec3f(1.0));
            let materialAlpha = mix(finalAlpha, 1.0, metalMask);
            return vec4f(finalColor, materialAlpha * vColor.w);
        }
    `;

    return { vertex, fragment };
};

export default PBRBlockShaders;
