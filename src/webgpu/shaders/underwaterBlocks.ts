/**
 * Underwater PBR Block Shaders
 * 
 * Features:
 * - Bioluminescent god ray lighting
 * - Caustic refraction patterns
 * - Glass refraction when sea creature swims past
 * - Gold/chrome catching underwater light shafts
 * - Configurable texture sampling supporting different image sources
 */

import { getSimpleTextureSamplingWGSL } from '../textureSampling.js';

// PBR Functions with underwater enhancements
export const UnderwaterPBRFunctions = `
// Standard PBR helpers
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
    let f = 1.0 - cosTheta;
    let f2 = f * f;
    let f5 = f2 * f2 * f;
    return F0 + (vec3f(1.0) - F0) * f5;
}

// ============================================================================
// UNDERWATER LIGHTING EFFECTS
// ============================================================================

// Caustic pattern based on wave interference
fn causticPattern(uv: vec2f, time: f32) -> f32 {
    let scale = 8.0;
    let wave1 = sin(uv.x * scale + time * 1.5);
    let wave2 = sin(uv.y * scale * 0.8 + time * 1.2);
    let wave3 = sin((uv.x + uv.y) * scale * 0.5 + time * 0.8);
    
    let interference = (wave1 + wave2 + wave3) / 3.0;
    let i = interference * 0.5 + 0.5;
    return i * i * i; // Sharpen the caustics
}

// God ray volumetric light shafts
fn godRays(worldPos: vec3f, time: f32, intensity: f32) -> vec3f {
    // Vertical light shafts from above
    let shaft = sin(worldPos.x * 0.3 + time * 0.5) * 
                sin(worldPos.z * 0.2 + time * 0.3);
    
    // Add some noise variation
    let noise = fract(sin(dot(worldPos.xz, vec2f(12.9898, 78.233))) * 43758.5453);
    
    let s = shaft * 0.5 + 0.5;
    let rayIntensity = (s * s) * intensity;
    let rayColor = vec3f(0.4, 0.8, 1.0); // Cyan-tinted underwater light
    
    return rayColor * rayIntensity * (0.8 + noise * 0.4);
}

// Bioluminescent glow from surfaces
fn bioluminescentGlow(normal: vec3f, viewDir: vec3f, baseColor: vec3f, intensity: f32) -> vec3f {
    let NdotV = max(dot(normal, viewDir), 0.0);
    let f = 1.0 - NdotV;
    let fresnel = f * f * f;
    
    // Cyan/blue bioluminescence
    let glowColor = vec3f(0.2, 0.9, 1.0);
    return glowColor * fresnel * intensity;
}

// Glass refraction when creature swims past
fn creatureRefraction(
    baseUV: vec2f, 
    worldPos: vec3f, 
    creatureIntensity: f32, 
    creatureOffset: f32,
    time: f32
) -> vec2f {
    if (creatureIntensity < 0.01) {
        return baseUV;
    }
    
    // Simulate creature swimming past - creates wave distortion
    let creatureX = sin(creatureOffset * 0.5) * 0.5 + 0.5;
    let distToCreature = abs(worldPos.x - creatureX * 20.0 + 10.0);
    
    // Refraction strength falls off with distance
    let refractionRadius = 5.0;
    let falloff = smoothstep(refractionRadius, 0.0, distToCreature);
    
    // Wave distortion
    let wave = sin(worldPos.y * 2.0 + time * 3.0 + creatureOffset);
    let distortion = wave * 0.03 * creatureIntensity * falloff;
    
    return baseUV + vec2f(distortion, distortion * 0.5);
}

// Subsurface scattering for underwater materials
fn underwaterSubsurface(NdotL: f32, depth: f32, color: vec3f) -> vec3f {
    // Light wraps around more underwater due to scattering
    let w = NdotL * 0.5 + 0.5;
    let wrap = w * w;
    let decay = 1.0 + (depth * 0.1);
    let absorption = 1.0 / (decay * decay); // Blue light penetrates deeper (Fast Beer-Lambert Approximation)
    
    return color * wrap * absorption * vec3f(0.8, 0.9, 1.0);
}
`;

export const UnderwaterBlockShaders = () => {
    const vertex = `
        struct VertexUniforms {
            viewProjectionMatrix : mat4x4f,
            modelMatrix : mat4x4f,
            normalMatrix : mat4x4f,
            colorVertex : vec4f
        };
        @binding(0) @group(0) var<uniform> vUniforms : VertexUniforms;

        struct Output {
            @builtin(position) Position : vec4f,
            @location(0) vWorldPos : vec4f,
            @location(1) vNormal : vec3f,
            @location(2) vColor : vec4f,
            @location(3) vUV : vec2f,
            @location(4) vViewDir : vec3f,
        };

        @vertex
        fn main(@location(0) position: vec4f, 
                @location(1) normal: vec4f, 
                @location(2) uv: vec2f) -> Output {
            var output: Output;
            let worldPos = vUniforms.modelMatrix * position;
            output.vWorldPos = worldPos;
            output.Position = vUniforms.viewProjectionMatrix * worldPos;
            output.vNormal = normalize((vUniforms.normalMatrix * normal).xyz);
            output.vColor = vUniforms.colorVertex;
            output.vUV = uv;
            
            let camPos = vec3f(0.0, 0.0, 75.0);
            output.vViewDir = normalize(camPos - worldPos.xyz);
            
            return output;
        }
    `;

    // Get configurable texture sampling code
    const textureSamplingCode = getSimpleTextureSamplingWGSL();

    const fragment = `
        // =========================================================================
        // FRAGMENT UNIFORMS - Enhanced for underwater effects
        // =========================================================================
        struct FragmentUniforms {
            // Standard PBR (offset 0-63)
            lightPosition : vec4f,   // 0-15
            eyePosition : vec4f,     // 16-31
            time : f32,              // 32
            useGlitch : f32,         // 36
            lockPercent : f32,       // 40
            level : f32,             // 44
            metallic : f32,          // 48
            roughness : f32,         // 52
            transmission : f32,      // 56
            ior : f32,               // 60
            
            // Extended PBR (offset 64-79)
            subsurface : f32,        // 64
            clearcoat : f32,         // 68
            anisotropic : f32,       // 72
            dispersion : f32,        // 76
            
            // Material type + interaction (offset 80-95)
            materialType : u32,      // 80
            particleIntensity : f32, // 84
            enablePBR : f32,         // 88
            textureMix : f32,        // 92
            
            // NEW: Underwater effects (offset 96-127)
            isUnderwater : f32,              // 96 - 1.0 if underwater level
            causticIntensity : f32,          // 100
            godRayStrength : f32,            // 104
            bioluminescence : f32,           // 108
            creatureIntensity : f32,         // 112
            creatureSwimOffset : f32,        // 116
            waterDepth : f32,                // 120
            padding : f32,                   // 124
            
            // Reserved (offset 128)
            reserved : vec4f,        // 128-143
        };
        
        @binding(1) @group(0) var<uniform> fUniforms : FragmentUniforms;
        @binding(2) @group(0) var blockTexture : texture_2d<f32>;
        @binding(3) @group(0) var blockSampler : sampler;

        ${UnderwaterPBRFunctions}
        
        // ============================================================================
        // CONFIGURABLE TEXTURE SAMPLING
        // ============================================================================
        ${textureSamplingCode}

        // Extract material mask from texture
        fn extractUnderwaterMaterialMask(texColor: vec3f) -> vec4f {
            // Use the configurable extraction as base
            let masks = extractMaterialMask(texColor);
            let metalMask = masks.x;
            let glassMask = masks.y;
            
            // Chrome: balanced high RGB
            let chromeSignal = (texColor.r + texColor.g + texColor.b) / 3.0;
            let chromeMask = smoothstep(0.7, 0.9, chromeSignal) * (1.0 - metalMask);
            
            // Rebalance glass
            let finalGlassMask = glassMask * (1.0 - chromeMask);
            
            return vec4f(metalMask, chromeMask, finalGlassMask, 0.0);
        }

        // ACES tone mapping
        fn acesToneMapping(color: vec3f) -> vec3f {
            let a = 2.51;
            let b = 0.03;
            let c = 2.43;
            let d = 0.59;
            let e = 0.14;
            return clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3f(0.0), vec3f(1.0));
        }

        @fragment
        fn main(@location(0) vWorldPos : vec4f,
                @location(1) vNormal : vec3f,
                @location(2) vColor : vec4f,
                @location(3) vUV : vec2f,
                @location(4) vViewDir : vec3f) -> @location(0) vec4f {
            
            let time = fUniforms.time;
            let N = normalize(vNormal);
            let V = vViewDir;
            let L = normalize(fUniforms.lightPosition.xyz - vWorldPos.xyz);
            let H = normalize(L + V);
            
            let NdotL = max(dot(N, L), 0.0);
            let NdotV = max(dot(N, V), 0.0);
            let NdotH = max(dot(N, H), 0.0);
            
            // Apply configurable texture sampling
            var texUV = transformUVForSampling(vUV);
            
            // Creature refraction on glass blocks
            if (fUniforms.isUnderwater > 0.5 && fUniforms.creatureIntensity > 0.01) {
                texUV = creatureRefraction(
                    texUV, vWorldPos.xyz, 
                    fUniforms.creatureIntensity, 
                    fUniforms.creatureSwimOffset,
                    time
                );
            }
            
            // Sample texture
            let texColor = textureSample(blockTexture, blockSampler, texUV);
            
            // Get material masks
            let masks = extractUnderwaterMaterialMask(texColor.rgb);
            let metalMask = masks.x;
            let chromeMask = masks.y;
            let glassMask = masks.z;
            let anyMetal = max(metalMask, chromeMask);
            
            // Base color with texture blend
            let textureMix = fUniforms.textureMix;
            var baseColor = mix(vColor.rgb, texColor.rgb, textureMix);
            
            // =========================================================================
            // UNDERWATER LIGHTING
            // =========================================================================
            
            var finalColor: vec3f;
            var causticAdd: vec3f = vec3f(0.0);
            var godRayAdd: vec3f = vec3f(0.0);
            var bioGlow: vec3f = vec3f(0.0);
            
            // Apply underwater effects if enabled
            if (fUniforms.isUnderwater > 0.5) {
                // Caustics - dancing light patterns on surfaces
                let caustic = causticPattern(vWorldPos.xz * 0.1, time);
                causticAdd = vec3f(0.6, 0.85, 1.0) * caustic * fUniforms.causticIntensity;
                
                // God rays - volumetric light shafts
                godRayAdd = godRays(vWorldPos.xyz, time, fUniforms.godRayStrength);
                
                // Materials catch god rays differently
                // Gold catches warm light
                let goldRay = godRayAdd * vec3f(1.2, 0.9, 0.6) * metalMask;
                // Chrome catches cool light
                let chromeRay = godRayAdd * vec3f(0.8, 0.9, 1.1) * chromeMask;
                // Glass refracts light
                let glassRay = godRayAdd * 0.5 * glassMask;
                
                godRayAdd = goldRay + chromeRay + glassRay;
                
                // Bioluminescent edge glow
                bioGlow = bioluminescentGlow(N, V, baseColor, fUniforms.bioluminescence);
            }
            
            // =========================================================================
            // PBR SHADING
            // =========================================================================
            
            if (fUniforms.enablePBR < 0.5) {
                // Classic mode
                let lightFactor = 0.4 + NdotL * 0.6;
                finalColor = baseColor * lightFactor + causticAdd * 0.5;
                
            } else {
                // Full PBR
                let metallic = fUniforms.metallic;
                let roughness = fUniforms.roughness;
                let transmission = fUniforms.transmission;
                
                // Fresnel
                let F0_dielectric = vec3f(0.04);
                let F0 = mix(F0_dielectric, baseColor, metallic * anyMetal);
                let F = fresnelSchlick(NdotV, F0);
                
                // Specular
                let D = distributionGGX(NdotH, roughness);
                let G = geometrySmith(NdotV, NdotL, roughness);
                let specular = (D * G) / max(4.0 * NdotV * NdotL, 0.001);
                
                // Diffuse
                let kd = (vec3f(1.0) - F) * (1.0 - metallic * anyMetal);
                let diffuse = baseColor * NdotL * kd / 3.14159;
                
                // Reflection
                let R = reflect(-V, N);
                
                // Underwater: reflection picks up caustics and god rays
                var envColor = vec3f(0.1, 0.2, 0.4); // Underwater ambient
                if (fUniforms.isUnderwater > 0.5) {
                    // Reflection shows caustic patterns
                    let reflectCaustic = causticPattern(R.xz * 0.5 + vWorldPos.xz * 0.05, time * 0.5);
                    envColor += vec3f(0.4, 0.7, 0.9) * reflectCaustic * 0.3;
                    envColor += godRays(vWorldPos.xyz + R * 5.0, time, fUniforms.godRayStrength * 0.5);
                }
                
                let reflection = envColor * F * metallic * anyMetal;
                
                // Compose
                finalColor = diffuse + vec3f(specular) * (0.5 + metallic * anyMetal);
                finalColor += reflection;
                
                // Glass transmission with underwater refraction
                if (transmission > 0.0 && glassMask > 0.1) {
                    let f = 1.0 - NdotV;
                    let fresnel = f * f * f;
                    let transmissionAlpha = mix(1.0 - transmission, 1.0, fresnel);
                    
                    // Underwater refraction with caustics
                    var refractDir = refract(-V, N, 1.0 / fUniforms.ior);
                    if (fUniforms.isUnderwater > 0.5) {
                        // Add creature swim distortion to refraction
                        let swimDistort = sin(time + vWorldPos.y) * fUniforms.creatureIntensity * 0.1;
                        refractDir.x += swimDistort;
                    }
                    
                    let refractionColor = vec3f(0.1, 0.3, 0.5); // Underwater tint
                    refractionColor += causticAdd * 0.3 * glassMask;
                    
                    finalColor = mix(refractionColor, finalColor, transmissionAlpha);
                }
            }
            
            // Add underwater lighting effects
            if (fUniforms.isUnderwater > 0.5) {
                // Caustics add to everything
                finalColor += causticAdd * (0.5 + anyMetal * 0.5);
                
                // God rays - metals catch them more
                finalColor += godRayAdd * (0.6 + anyMetal * 0.8);
                
                // Bioluminescent glow on edges
                finalColor += bioGlow * (1.0 + glassMask * 2.0);
                
                // Underwater color grading
                finalColor = mix(finalColor, finalColor * vec3f(0.9, 0.95, 1.1), 0.3);
            }
            
            // Rim lighting
            let rimPower = 1.0 - NdotV;
            rimPower = rimPower * rimPower;
            let rimColor = mix(vColor.rgb, vec3f(1.0), anyMetal * fUniforms.metallic);
            finalColor += rimColor * rimPower * 0.1;
            
            // Lock tension
            let lockPercent = fUniforms.lockPercent;
            if (lockPercent > 0.25) {
                let tension = smoothstep(0.25, 1.0, lockPercent);
                let pulse = sin(time * (10.0 + tension * 30.0)) * 0.5 + 0.5;
                pulse = pulse * pulse;
                
                let warnColor = mix(vec3f(1.0, 0.6, 0.0), vec3f(1.0, 0.1, 0.0), tension);
                finalColor = mix(finalColor, warnColor, tension * pulse * 0.3);
            }
            
            // Ghost piece
            if (vColor.w < 0.4) {
                let scanY = fract(vUV.y * 50.0 - time * 15.0);
                let scan = smoothstep(0.0, 0.1, scanY) * (1.0 - smoothstep(0.9, 1.0, scanY));
                let wire = smoothstep(0.9, 0.98, max(abs(vUV.x - 0.5), abs(vUV.y - 0.5)) * 2.0);
                
                var ghostColor = vColor.rgb * 3.0 * (wire + scan * 0.5);
                let f = 1.0 - NdotV;
                ghostColor += vec3f(0.4, 0.7, 1.0) * (f * f * f) * 1.5;
                
                // Underwater ghost has bioluminescence
                if (fUniforms.isUnderwater > 0.5) {
                    ghostColor += vec3f(0.2, 0.8, 1.0) * 0.5;
                }
                
                return vec4f(ghostColor, 0.35 + scan * 0.2);
            }
            
            // Tone mapping
            finalColor = acesToneMapping(finalColor);
            
            // Material alpha
            let materialAlpha = mix(0.85, 0.98, anyMetal);
            return vec4f(finalColor, materialAlpha * vColor.w);
        }
    `;

    return { vertex, fragment };
};

export default UnderwaterBlockShaders;
