/**
 * Premium PBR Block Shaders
 * Gold, Chrome, Glass, Gem materials with environment mapping
 */

import { Material } from './materials.js';

// WGSL PBR Functions (injected into fragment shader)
export const PBRFunctions = `
// Fast inverse square root approximation
fn fastInvSqrt(x: f32) -> f32 {
    return 1.0 / sqrt(x);
}

// Trowbridge-Reitz GGX Distribution (simplified)
fn distributionGGX(NdotH: f32, roughness: f32) -> f32 {
    let a = roughness * roughness;
    let a2 = a * a;
    let NdotH2 = NdotH * NdotH;
    let denom = NdotH2 * (a2 - 1.0) + 1.0;
    return a2 / (3.14159 * denom * denom);
}

// Smith Schlick-GGX Geometry Function
fn geometrySmith(NdotV: f32, NdotL: f32, roughness: f32) -> f32 {
    let r = roughness + 1.0;
    let k = (r * r) / 8.0;
    let ggx1 = NdotV / (NdotV * (1.0 - k) + k);
    let ggx2 = NdotL / (NdotL * (1.0 - k) + k);
    return ggx1 * ggx2;
}

// Schlick Fresnel approximation
fn fresnelSchlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
    return F0 + (vec3<f32>(1.0) - F0) * pow(1.0 - cosTheta, 5.0);
}

// Fresnel with color tint for metals
fn fresnelSchlickTint(cosTheta: f32, F0: vec3<f32>, tint: vec3<f32>) -> vec3<f32> {
    return F0 + (tint - F0) * pow(1.0 - cosTheta, 5.0);
}

// Anisotropic specular (for brushed metals)
fn anisotropicSpecular(V: vec3<f32>, L: vec3<f32>, N: vec3<f32>, 
                       roughness: f32, aniso: f32) -> f32 {
    let H = normalize(V + L);
    let T = vec3<f32>(1.0, 0.0, 0.0); // Tangent
    let B = vec3<f32>(0.0, 1.0, 0.0); // Bitangent
    
    let ToH = dot(T, H);
    let BoH = dot(B, H);
    let NoH = dot(N, H);
    
    let a2 = roughness * roughness;
    let aspect = sqrt(1.0 - aniso * 0.9);
    let ax = max(a2 / aspect, 0.001);
    let ay = max(a2 * aspect, 0.001);
    
    let X = ToH * ToH / ax;
    let Y = BoH * BoH / ay;
    
    return 1.0 / (3.14159 * ax * ay * NoH * NoH * NoH * NoH);
}

// Procedural environment reflection (no texture needed)
fn proceduralEnvReflect(R: vec3<f32>, time: f32) -> vec3<f32> {
    // Create synthetic environment from direction
    let up = R.y * 0.5 + 0.5;
    let horizon = 1.0 - abs(R.y);
    
    // Sky gradient
    var env = mix(vec3<f32>(0.1, 0.15, 0.3), vec3<f32>(0.4, 0.5, 0.7), up);
    
    // Horizon glow
    env += vec3<f32>(0.3, 0.4, 0.5) * pow(horizon, 4.0);
    
    // Subtle animated lights
    let light1 = sin(R.x * 3.0 + time * 0.5) * sin(R.y * 2.0) * 0.5 + 0.5;
    let light2 = sin(R.z * 4.0 - time * 0.3) * sin(R.x * 3.0) * 0.5 + 0.5;
    env += vec3<f32>(0.2, 0.15, 0.1) * light1 * light1;
    env += vec3<f32>(0.1, 0.15, 0.2) * light2 * light2;
    
    return env;
}

// Refraction with chromatic dispersion
fn refractDispersion(I: vec3<f32>, N: vec3<f32>, ior: f32, dispersion: f32) -> vec3<f32> {
    let eta = 1.0 / ior;
    let c1 = dot(N, I);
    let cs2 = 1.0 - eta * eta * (1.0 - c1 * c1);
    
    if (cs2 < 0.0) {
        return vec3<f32>(0.0);
    }
    
    let refract = normalize(eta * I - (eta * c1 + sqrt(cs2)) * N);
    
    // Apply dispersion per-channel
    let dispersionShift = dispersion * 0.1;
    return refract * vec3<f32>(
        1.0 - dispersionShift,
        1.0,
        1.0 + dispersionShift
    );
}

// Subsurface scattering approximation
fn subsurfaceScattering(NdotL: f32, subsurface: f32, color: vec3<f32>) -> vec3<f32> {
    // Wrap lighting for subsurface
    let wrap = pow(NdotL * 0.5 + 0.5, 2.0);
    let scatter = color * wrap * subsurface;
    return scatter;
}

// Faceted gem shading
fn facetedShading(N: vec3<f32>, V: vec3<f32>, facetSize: f32) -> f32 {
    // Quantize normals for faceted look
    let facetN = normalize(floor(N / facetSize) * facetSize);
    let R = reflect(-V, facetN);
    let spec = max(dot(R, V), 0.0);
    return spec;
}

// ========== PARTICLE-MATERIAL INTERACTION FUNCTIONS ==========

// Glass refraction distortion from particle hits
fn particleGlassRefraction(
    baseColor: vec3<f32>,
    N: vec3<f32>,
    V: vec3<f32>,
    particleIntensity: f32,
    time: f32
) -> vec3<f32> {
    // Calculate refraction offset based on view angle
    let refractFactor = 1.0 - abs(dot(N, V));
    let distortion = refractFactor * particleIntensity * 0.5;
    
    // Add chromatic aberration for particle hit
    let r = baseColor.r * (1.0 + distortion * 0.8);
    let g = baseColor.g * (1.0 + distortion * 0.2);
    let b = baseColor.b * (1.0 - distortion * 0.4);
    
    // Add ripple effect
    let ripple = sin(distortion * 10.0 + time * 5.0) * 0.1 * particleIntensity;
    
    return vec3<f32>(r, g, b) * (1.0 + particleIntensity * 0.3 + ripple);
}

// Gold/Chrome specular flash from particle hits
fn particleSpecularFlash(
    baseColor: vec3<f32>,
    N: vec3<f32>,
    L: vec3<f32>,
    V: vec3<f32>,
    flashColor: vec3<f32>,
    intensity: f32
) -> vec3<f32> {
    // Calculate intense specular highlight
    let H = normalize(L + V);
    let specAngle = max(dot(N, H), 0.0);
    let specular = pow(specAngle, 64.0) * intensity * 3.0;
    
    // Add bloom-like glow
    let glow = flashColor * intensity * 0.8;
    
    // Sparkle effect
    let sparkle = step(0.98, fract(specAngle * 10.0)) * intensity * 2.0;
    
    return baseColor + (flashColor * specular) + glow + (flashColor * sparkle);
}

// Cyber neon burst from particle hits
fn particleNeonBurst(
    baseColor: vec3<f32>,
    emission: vec3<f32>,
    intensity: f32,
    time: f32
) -> vec3<f32> {
    // Intense cyan/magenta emission
    let burstColor = vec3<f32>(0.0, 1.0, 1.0); // Cyan
    let burst = burstColor * intensity * 4.0;
    
    // Pulse effect synced to time
    let pulse = sin(intensity * 15.0 + time * 8.0) * 0.4 + 0.6;
    
    // Ring expansion effect
    let ring = smoothstep(0.3, 0.0, abs(intensity * 0.5 - 0.25)) * 2.0;
    
    return baseColor + (burst * pulse) + (emission * intensity * 2.0) + (burstColor * ring);
}

// Main particle interaction dispatcher
fn applyParticleInteraction(
    materialType: u32,  // 0=none, 1=glass, 2=gold, 3=chrome, 4=cyber, 5=gem
    baseColor: vec3<f32>,
    N: vec3<f32>,
    L: vec3<f32>,
    V: vec3<f32>,
    particleIntensity: f32,
    time: f32
) -> vec3<f32> {
    if (particleIntensity <= 0.0) {
        return baseColor;
    }
    
    switch (materialType) {
        case 1u: { // Glass - refraction
            return particleGlassRefraction(baseColor, N, V, particleIntensity, time);
        }
        case 2u: { // Gold - specular flash
            return particleSpecularFlash(baseColor, N, L, V, vec3<f32>(1.0, 0.84, 0.0), particleIntensity);
        }
        case 3u: { // Chrome - specular flash (white/blue)
            return particleSpecularFlash(baseColor, N, L, V, vec3<f32>(0.9, 0.95, 1.0), particleIntensity);
        }
        case 4u: { // Cyber - neon burst
            return particleNeonBurst(baseColor, baseColor * 0.2, particleIntensity, time);
        }
        case 5u: { // Gem - combination of refraction and flash
            let refract = particleGlassRefraction(baseColor, N, V, particleIntensity * 0.6, time);
            return particleSpecularFlash(refract, N, L, V, vec3<f32>(1.0, 0.2, 0.8), particleIntensity * 0.8);
        }
        default: {
            return baseColor;
        }
    }
}
`;

export const PremiumBlockShaders = () => {
    const vertex = `
        struct VertexUniforms {
            viewProjectionMatrix : mat4x4<f32>,
            modelMatrix : mat4x4<f32>,
            normalMatrix : mat4x4<f32>,
            colorVertex : vec4<f32>
        };
        @binding(0) @group(0) var<uniform> vUniforms : VertexUniforms;

        struct Output {
            @builtin(position) Position : vec4<f32>,
            @location(0) vWorldPos : vec4<f32>,
            @location(1) vNormal : vec3<f32>,
            @location(2) vColor : vec4<f32>,
            @location(3) vUV : vec2<f32>,
            @location(4) vViewDir : vec3<f32>,
        };

        @vertex
        fn main(@location(0) position: vec4<f32>, 
                @location(1) normal: vec4<f32>, 
                @location(2) uv: vec2<f32>) -> Output {
            var output: Output;
            let worldPos = vUniforms.modelMatrix * position;
            output.vWorldPos = worldPos;
            output.Position = vUniforms.viewProjectionMatrix * worldPos;
            output.vNormal = normalize((vUniforms.normalMatrix * normal).xyz);
            output.vColor = vUniforms.colorVertex;
            output.vUV = uv;
            
            // Calculate view direction for specular/reflection
            let camPos = vec3<f32>(0.0, 0.0, 75.0); // Approximate
            output.vViewDir = normalize(camPos - worldPos.xyz);
            
            return output;
        }
    `;

    const fragment = `
        struct FragmentUniforms {
            lightPosition : vec4<f32>,
            eyePosition : vec4<f32>,
            time : f32,
            useGlitch : f32,
            lockPercent : f32,
            level : f32,
            // Material properties packed
            metallic : f32,
            roughness : f32,
            transmission : f32,
            ior : f32,
            subsurface : f32,
            clearcoat : f32,
            anisotropic : f32,
            dispersion : f32,
            // NEW: Particle interaction
            particleMaterialType : u32,  // 0=none, 1=glass, 2=gold, 3=chrome, 4=cyber, 5=gem
            particleIntensity : f32,
            pad1 : f32,
            pad2 : f32,
        };
        @binding(1) @group(0) var<uniform> fUniforms : FragmentUniforms;
        @binding(2) @group(0) var blockTexture : texture_2d<f32>;
        @binding(3) @group(0) var blockSampler : sampler;

        ${PBRFunctions}

        @fragment
        fn main(@location(0) vWorldPos : vec4<f32>,
                @location(1) vNormal : vec3<f32>,
                @location(2) vColor : vec4<f32>,
                @location(3) vUV : vec2<f32>,
                @location(4) vViewDir : vec3<f32>) -> @location(0) vec4<f32> {
            
            let time = fUniforms.time;
            let N = normalize(vNormal);
            let V = vViewDir;
            let L = normalize(fUniforms.lightPosition.xyz - vWorldPos.xyz);
            let H = normalize(L + V);
            
            let NdotL = max(dot(N, L), 0.0);
            let NdotV = max(dot(N, V), 0.0);
            let NdotH = max(dot(N, H), 0.0);
            let VdotH = max(dot(V, H), 0.0);
            
            // Sample base texture (for noise/detail)
            let texUV = vec2<f32>(vUV.x, 1.0 - vUV.y);
            let texColor = textureSample(blockTexture, blockSampler, texUV);
            
            // Material properties from uniforms
            let metallic = fUniforms.metallic;
            let roughness = fUniforms.roughness;
            let transmission = fUniforms.transmission;
            let ior = fUniforms.ior;
            let subsurface = fUniforms.subsurface;
            let clearcoat = fUniforms.clearcoat;
            let anisotropic = fUniforms.anisotropic;
            let dispersion = fUniforms.dispersion;
            
            // Base color mixed with piece color
            var baseColor = vColor.rgb * texColor.rgb;
            
            // PBR Fresnel (F0 calculation)
            let F0_dielectric = vec3<f32>(0.04);
            let F0 = mix(F0_dielectric, baseColor, metallic);
            let F = fresnelSchlick(NdotV, F0);
            
            // Reflection vector for environment
            let R = reflect(-V, N);
            let envColor = proceduralEnvReflect(R, time);
            
            // SPECULAR (GGX)
            var specular = 0.0;
            if (anisotropic > 0.0) {
                specular = anisotropicSpecular(V, L, N, roughness, anisotropic);
            } else {
                let D = distributionGGX(NdotH, roughness);
                let G = geometrySmith(NdotV, NdotL, roughness);
                specular = (D * G) / max(4.0 * NdotV * NdotL, 0.001);
            }
            
            // DIFFUSE (Lambert, only for non-metals)
            let kd = (vec3<f32>(1.0) - F) * (1.0 - metallic);
            let diffuse = baseColor * NdotL * kd / 3.14159;
            
            // REFLECTION (metallic and clearcoat)
            let fresnelReflect = fresnelSchlick(NdotV, F0);
            let reflection = envColor * fresnelReflect * metallic;
            
            // CLEARCOAT layer
            var clearcoatSpecular = 0.0;
            if (clearcoat > 0.0) {
                let ccD = distributionGGX(NdotH, 0.03); // Very smooth
                let ccG = geometrySmith(NdotV, NdotL, 0.03);
                clearcoatSpecular = (ccD * ccG) / max(4.0 * NdotV * NdotL, 0.001);
            }
            
            // TRANSMISSION / REFRACTION (glass)
            var refractionColor = vec3<f32>(0.0);
            var transmissionAlpha = 1.0;
            if (transmission > 0.0) {
                // Fresnel-based opacity
                let fresnel = pow(1.0 - NdotV, 3.0);
                transmissionAlpha = mix(1.0 - transmission, 1.0, fresnel);
                
                // Procedural refraction color shift
                let refractDir = refract(-V, N, 1.0 / ior);
                refractionColor = proceduralEnvReflect(refractDir, time);
                
                // Chromatic dispersion at edges
                if (dispersion > 0.0) {
                    let edgeFactor = pow(1.0 - NdotV, 2.0);
                    refractionColor += vec3<f32>(
                        sin(time * 2.0) * 0.1,
                        cos(time * 1.5) * 0.1,
                        sin(time * 2.5) * 0.1
                    ) * dispersion * edgeFactor;
                }
            }
            
            // SUBSURFACE SCATTERING (gems)
            var scatterColor = vec3<f32>(0.0);
            if (subsurface > 0.0) {
                scatterColor = subsurfaceScattering(NdotL, subsurface, baseColor);
                // Add internal glow
                scatterColor += baseColor * vColor.rgb * subsurface * 0.3;
            }
            
            // FACETED SHADING (gems)
            var facetSpec = 0.0;
            if (dispersion > 0.05) {
                facetSpec = facetedShading(N, V, 0.15);
                facetSpec = pow(facetSpec, 30.0);
            }
            
            // COMPOSITION
            var finalColor = vec3<f32>(0.0);
            
            // Base lighting
            finalColor = diffuse + vec3<f32>(specular);
            finalColor += reflection;
            finalColor += clearcoatSpecular * clearcoat * vec3<f32>(1.0);
            
            // Add transmission
            if (transmission > 0.0) {
                finalColor = mix(refractionColor, finalColor, transmissionAlpha);
            }
            
            // Add subsurface
            finalColor += scatterColor;
            finalColor += vec3<f32>(facetSpec) * baseColor;
            
            // Rim lighting (enhanced for all materials)
            let rimPower = 1.0 - NdotV;
            rimPower = rimPower * rimPower * rimPower * rimPower;
            let rimColor = mix(vColor.rgb, vec3<f32>(1.0), metallic);
            finalColor += rimColor * rimPower * 0.5;
            
            // Emissive (for cyber/neon)
            let emissiveStrength = vColor.a > 0.8 ? 0.0 : 1.0; // Only for full blocks
            finalColor += vColor.rgb * 0.5 * emissiveStrength;
            
            // Lock Tension Effect
            let lockPercent = fUniforms.lockPercent;
            if (lockPercent > 0.25) {
                let tension = smoothstep(0.25, 1.0, lockPercent);
                let pulse = sin(time * (8.0 + tension * 50.0)) * 0.5 + 0.5;
                pulse = pulse * pulse * pulse;
                
                let warnColor = mix(
                    vec3<f32>(1.0, 0.5, 0.0),
                    vec3<f32>(1.0, 0.0, 0.0),
                    tension
                );
                finalColor = mix(finalColor, warnColor, tension * pulse * 0.4);
            }
            
            // Ghost piece handling
            if (vColor.w < 0.4) {
                let scanY = fract(vUV.y * 60.0 - time * 20.0);
                let scan = smoothstep(0.0, 0.1, scanY) * (1.0 - smoothstep(0.9, 1.0, scanY));
                let wire = smoothstep(0.9, 0.98, max(abs(vUV.x - 0.5), abs(vUV.y - 0.5)) * 2.0);
                
                var ghostCol = vColor.rgb * 4.0 * wire;
                ghostCol += vColor.rgb * scan * 2.0;
                ghostCol += vec3<f32>(0.5, 0.8, 1.0) * pow(1.0 - NdotV, 3.0) * 2.0;
                
                return vec4<f32>(ghostCol, 0.4 + scan * 0.3);
            }
            
            // NEW: Apply particle-material interaction
            let matType = fUniforms.particleMaterialType;
            let particleIntensity = fUniforms.particleIntensity;
            if (matType > 0u && particleIntensity > 0.0) {
                finalColor = applyParticleInteraction(matType, finalColor, N, L, V, particleIntensity, time);
            }
            
            // HDR tone mapping (simple Reinhard)
            finalColor = finalColor / (finalColor + vec3<f32>(1.0));
            finalColor = pow(finalColor, vec3<f32>(1.0 / 2.2)); // Gamma correction
            
            return vec4<f32>(finalColor, vColor.w);
        }
    `;

    return { vertex, fragment };
};

export default PremiumBlockShaders;
