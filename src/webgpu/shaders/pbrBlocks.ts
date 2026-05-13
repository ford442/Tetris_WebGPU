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
    const vertex = `...`; // (unchanged — your original vertex shader)

    // Get configurable texture sampling code
    const textureSamplingCode = getSimpleTextureSamplingWGSL();

    const fragment = `
        // =========================================================================
        // FRAGMENT UNIFORMS - 128 bytes, aligned for WebGPU
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
            materialType  : u32,        // 80
            particleIntensity : f32,    // 84
            enablePBR     : f32,        // 88
            textureMix    : f32,        // 92
            reserved      : vec4f,      // 96-111
            reserved2     : vec4f,      // 112-127
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
            
            // Glitch effect
            if (fUniforms.useGlitch > 0.0) {
                let glitchOffset = fUniforms.useGlitch * 0.03 * sin(texUV.y * 40.0 + time * 15.0);
                texUV.x += glitchOffset;
            }

            // Sample texture with UVs
            let texColor = textureSample(blockTexture, blockSampler, texUV);
            
            // Extract material masks using configurable method
            let masks = extractMaterialMask(texColor.rgb);
            let metalMask = masks.x;
            let glassMask = masks.y;

            let textureMix = fUniforms.textureMix;
            var baseColor = mix(vColor.rgb, texColor.rgb, textureMix);

            let materialType = fUniforms.materialType;
            var finalColor: vec3f;

            if (fUniforms.enablePBR < 0.5 || materialType == 0u) {
                // Classic mode
                let lightFactor = 0.4 + NdotL * 0.6;
                finalColor = baseColor * lightFactor;
                let nh2 = NdotH * NdotH; let nh4 = nh2 * nh2; let nh16 = nh4 * nh4 * nh4 * nh4;
                let nh128 = nh16 * nh16 * nh16 * nh16 * nh16 * nh16 * nh16 * nh16;
                let specular = nh128 * metalMask * 0.5;
                finalColor += vec3f(specular);
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
                let reflection = envColor * F * metallic * metalMask;

                finalColor = diffuse + vec3f(specular) * (0.5 + metallic * metalMask);
                finalColor += reflection;

                // Glass transmission
                if (transmission > 0.0 && glassMask > 0.1) {
                    let f1 = 1.0 - NdotV; let fresnel = f1 * f1 * f1;
                    // Lower the minimum transmission opacity and preserve more of the base texture color
                    let transmissionAlpha = mix(max(0.0, 1.0 - transmission * 1.8), 1.0, fresnel);
                    let refractDir = refract(-V, N, 1.0 / fUniforms.ior);
                    let refractionColorBase = proceduralEnvReflect(refractDir, time);
                    // Less overpowering glass tint
                    let glassTint = mix(vec3f(1.0), vColor.rgb, 0.02);
                    let refractionColor = refractionColorBase * glassTint;

                    if (fUniforms.dispersion > 0.0) {
                        let ef = 1.0 - NdotV; let edgeFactor = ef * ef;
                        let rainbow = vec3f(
                            sin(time * 2.0) * 0.1 + 0.9,
                            sin(time * 2.0 + 2.09) * 0.1 + 0.9,
                            sin(time * 2.0 + 4.18) * 0.1 + 0.9
                        );
                        finalColor += (rainbow - 1.0) * fUniforms.dispersion * edgeFactor * glassMask;
                    }
                    finalColor = mix(refractionColor, finalColor, transmissionAlpha);
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
            finalColor += rimColor * rimPower4 * 2.5; // JUICE: Enhanced Fresnel Rim Lighting

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

            // Amplified emissive pulse for more visible pulsing effect
            let emissivePulse = sin(time * 3.0) * 0.5 + 0.5;
            finalColor += baseColor * emissivePulse * 1.2;

            finalColor = acesToneMapping(finalColor);
            let materialAlpha = mix(0.85, 0.98, metalMask);
            return vec4f(finalColor, materialAlpha * vColor.w);
        }
    `;

    return { vertex, fragment };
};

export default PBRBlockShaders;
