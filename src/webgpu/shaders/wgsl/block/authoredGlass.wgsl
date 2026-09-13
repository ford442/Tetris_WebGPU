// Authored block look — the *shared* source of truth for gold frame + transmissive
// crystal. Both the TypeScript WebGPU renderer (src/webgpu/shaders/block) and the
// Emscripten C++ renderer (cpp/src/shaders/block/authoredBlock.wgsl, embedded via
// scripts/generate-cpp-shaders.mjs) compose this file verbatim.
//
// Rules for anything added here:
//   * No bindings, no uniform reads — every input is a function parameter, so the
//     two renderers can keep different bind-group layouts without forking the look.
//   * No texture sampling — callers sample and pass the resulting colors in.
// That keeps "what the material looks like" in one file while "where the data comes
// from" stays renderer-specific.
//
// Composition order: authoredMaterial.wgsl must be prepended BEFORE this file — the
// gold grade below delegates to gradeGoldMetalAlbedoTinted() declared there.

/// Reference jewelry grade — the shipped go.1ink.us gold. Kept as named constants so
/// the hard-coded default and the authored `gold.*` contract cannot drift apart.
const kGoldJewelryAlbedo = vec3f(0.90, 0.68, 0.22);
const kGoldGradeMix = 0.78;
const kGoldShadeMin = 0.38;
const kGoldShadeMax = 1.23;

/// Atlas metal is often silver-chrome; grade toward jewelry gold while keeping hinge luma.
/// Callers with an authored material should use `gradeGoldMetalAlbedoTinted`
/// (authoredMaterial.wgsl) so block-material.json can reskin the frame; this wrapper is
/// the untinted default and the two must stay numerically identical at the defaults.
fn gradeGoldMetalAlbedo(texRgb: vec3f) -> vec3f {
    return gradeGoldMetalAlbedoTinted(
        texRgb, kGoldJewelryAlbedo, kGoldGradeMix, kGoldShadeMin, kGoldShadeMax,
    );
}

/// Stained-glass crystal albedo: authored tile detail tinted by the piece color.
fn authoredGlassAlbedo(texRgb: vec3f, pieceRgb: vec3f) -> vec3f {
    let luma = dot(texRgb, vec3f(0.299, 0.587, 0.114));
    let crystalBright = smoothstep(0.15, 0.90, luma);
    let crystalHi = max(luma - 0.55, 0.0) * 3.0;
    return texRgb * (0.60 + crystalBright * 0.40)
         + pieceRgb * 0.35 * crystalBright
         + vec3f(crystalHi * 0.50);
}

/// Authored base color: glass interior vs gold frame, driven by the baked alpha mask.
/// `metalRgb` is the already-graded frame color, so the caller decides whether the
/// grade is the untinted default or the authored tint from block-material.json.
fn authoredBaseColor(texRgb: vec3f, pieceRgb: vec3f, metalRgb: vec3f, metalMask: f32) -> vec3f {
    return mix(authoredGlassAlbedo(texRgb, pieceRgb), metalRgb, metalMask);
}

/// pow(1 - NdotV, power) with fast paths for the two powers the CPU actually ships.
fn authoredGlassFresnel(NdotV: f32, fresnelPower: f32) -> f32 {
    let edgeFresnel = 1.0 - NdotV;
    let edge2 = edgeFresnel * edgeFresnel;
    let edge4 = edge2 * edge2;
    let power = max(fresnelPower, 0.001);
    if (abs(power - 2.0) < 0.001) {
        return edge2;
    }
    if (abs(power - 5.0) < 0.001) {
        return edge4 * edgeFresnel;
    }
    return pow(edgeFresnel, power);
}

/// Face-on to grazing glass opacity: mix(min, max, fresnel). Gold stays opaque elsewhere.
fn authoredGlassOpacity(NdotV: f32, glassMin: f32, glassMax: f32, fresnelPower: f32) -> f32 {
    let glassFresnel = authoredGlassFresnel(NdotV, fresnelPower);
    return mix(glassMin, glassMax, glassFresnel);
}

/// Direct lighting term for the authored path (Lambert wrap + tight metal-biased spec).
fn authoredDirectLighting(baseColor: vec3f, NdotL: f32, tightSpec: f32, metalMask: f32) -> vec3f {
    let lightFactor = 0.38 + NdotL * 0.62;
    let specularStrength = mix(0.04, 0.18, metalMask);
    return baseColor * lightFactor + vec3f(tightSpec * specularStrength);
}
