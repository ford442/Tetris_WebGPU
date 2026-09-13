// Non-authored block shading: the classic flat look and the generic PBR material
// path. Reached only when the authored tile is missing (textureMix <= 0.8) or a
// premium material type is selected, so the authored contract cannot regress
// through here. Split out of fragmentMain.wgsl.

struct FallbackShading {
    color : vec3f,
    alpha : f32,
};

fn shadeFallbackBlock(
    baseColor: vec3f,
    metalMask: f32,
    glassMask: f32,
    N: vec3f,
    V: vec3f,
    L: vec3f,
    NdotL: f32,
    NdotV: f32,
    NdotH: f32,
    tightSpec: f32,
    vWorldPos: vec4f,
    vUV: vec2f,
    vClipPos: vec4f,
    vColor: vec4f,
    materialType: u32,
    time: f32,
) -> FallbackShading {
    var finalColor : vec3f;
    var finalAlpha = 1.0;

            if (fUniforms.enablePBR < 0.5 || materialType == 0u) {
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
                    specular = anisotropicSpecular(V, L, N, roughness, fUniforms.anisotropic, vWorldPos.xyz, vUV);
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
                    let glassOpacity = mix(0.15, 0.60, fresnel);
                    finalAlpha = mix(1.0, glassOpacity, transmission * glassMask);

                    var refractEnv: vec3f;
                    if (fUniforms.refractEnable > 0.5) {
                        refractEnv = refractBackdrop(
                            vClipPos, N, V,
                            max(fUniforms.ior, 1.01),
                            fUniforms.glassThickness,
                            fUniforms.dispersion,
                        );
                    } else {
                        refractEnv = proceduralEnvReflect(refract(-V, N, 1.0 / max(fUniforms.ior, 1.01)), time);
                    }
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

    return FallbackShading(finalColor, finalAlpha);
}
