// Authored block shading — the reference go.1ink.us look: jewelry gold frame,
// transmissive crystal well, video readable through the glass.
//
// Split out of fragmentMain.wgsl. The *material* decisions (gold grading, glass
// albedo, Fresnel opacity curve, normal/roughness decode) all live in the shared
// binding-free modules (authoredGlass.wgsl, authoredMaterial.wgsl) that the C++
// renderer embeds verbatim; this file is the TS-only composition of them with the
// bindings TS has and C++ does not (IBL prefilter, backdrop capture).

struct AuthoredShading {
    color : vec3f,
    alpha : f32,
};

fn shadeAuthoredBlock(
    baseColor: vec3f,
    metalColor: vec3f,
    metalMask: f32,
    glassMask: f32,
    glassMaskAlpha: f32,
    /// Authored roughness (baked material map, or the contract fallback).
    pixelRough: f32,
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
    time: f32,
) -> AuthoredShading {
    var finalColor : vec3f;
    var finalAlpha = 1.0;

                // Authored block.png path: gold frame + stained-glass crystal (reference build)
                finalColor = authoredDirectLighting(baseColor, NdotL, tightSpec, metalMask);

                if (metalMask > 0.05) {
                    let metalAmt = max(fUniforms.metallic, metalMask);
                    let F0 = mix(vec3f(0.04), metalColor, metalMask * metalAmt);
                    let anisoAmt = max(fUniforms.anisotropic, 0.4) * metalMask;
                    let NdotHcl = max(NdotH, 0.0);
                    var specDirect = 0.0;
                    if (anisoAmt > 0.05) {
                        specDirect = anisotropicSpecular(V, L, N, pixelRough, anisoAmt, vWorldPos.xyz, vUV);
                    } else {
                        let D = distributionGGX(NdotHcl, pixelRough);
                        let G = geometrySmith(NdotV, NdotL, pixelRough);
                        specDirect = (D * G) / max(4.0 * NdotV * NdotL, 0.001);
                    }
                    let F = fresnelSchlick(NdotV, F0);
                    finalColor += specDirect * F * NdotL * metalMask;

                    let iblOn = fUniforms.iblEnable;
                    let R = reflect(-V, N);
                    var envSpec: vec3f;
                    if (iblOn > 0.5) {
                        envSpec = splitSumSpecular(N, V, F0, pixelRough, metalMask);
                    } else {
                        envSpec = proceduralEnvReflect(R, time) * F * metalMask * metalAmt;
                    }
                    finalColor += envSpec;

                    let coatAmt = max(fUniforms.clearcoat, 0.3) * metalMask;
                    if (coatAmt > 0.01) {
                        finalColor += clearcoatSpecular(NdotHcl, NdotV, NdotL, coatAmt);
                    }
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

                    // Refraction of the *real* background through the crystal.
                    // When the backdrop capture is available we bend the captured
                    // scene (procedural bg + video portal); otherwise we fall back
                    // to the procedural studio env so the look degrades, not breaks.
                    let glassTint = mix(vec3f(0.92, 0.96, 1.0), vColor.rgb, 0.22);
                    var refractEnv: vec3f;
                    if (fUniforms.refractEnable > 0.5) {
                        refractEnv = refractBackdrop(
                            vClipPos, N, V,
                            fUniforms.glassIor,
                            fUniforms.glassThickness,
                            fUniforms.dispersion,
                        );
                    } else {
                        refractEnv = proceduralEnvReflect(refract(-V, N, 1.0 / max(fUniforms.glassIor, 1.01)), time);
                    }
                    let refractedColor = refractEnv * glassTint;
                    finalColor = mix(finalColor, refractedColor, glassMask * 0.45); // Mix in refraction

                }

                // Gold frame opaque; glass center from CPU GlassParams (min/max/fresnelPower).
                let glassOpacity = authoredGlassOpacity(
                    NdotV,
                    fUniforms.glassParams.min,
                    fUniforms.glassParams.max,
                    fUniforms.glassParams.fresnelPower,
                );
                finalAlpha = mix(1.0, glassOpacity, glassMaskAlpha);

    return AuthoredShading(finalColor, finalAlpha);
}
