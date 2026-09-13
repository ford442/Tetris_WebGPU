// Authored material maps — shared, binding-free half of the visual contract.
//
// Like authoredGlass.wgsl, this file is composed verbatim by the TypeScript WebGPU
// renderer AND the Emscripten C++ renderer (scripts/generate-cpp-shaders.mjs embeds
// it), and hand-ported line-for-line into GLSL for the WebGL2 fallback. The CPU
// bakers in src/webgpu/blockMaterialMaps.ts are the other half: what is baked there
// must be decoded here, which is why both carry the channel layout in their docs.
//
// Packed material map (one rgba8unorm texture):
//   R = tangent normal.x   (0.5 = flat)
//   G = tangent normal.y   (0.5 = flat)
//   B = roughness
//   A = metallic
//
// Rules, same as authoredGlass.wgsl: no bindings, no uniform reads, no texture
// sampling. Callers sample and pass values in, so the three renderers can keep
// different bind-group layouts without forking the look.

struct AuthoredMaterialSample {
    normalXY  : vec2f,
    roughness : f32,
    metallic  : f32,
};

/// Decode one texel of the packed material map.
fn decodeAuthoredMaterial(packed: vec4f) -> AuthoredMaterialSample {
    var out : AuthoredMaterialSample;
    out.normalXY = packed.rg;
    out.roughness = packed.b;
    out.metallic = packed.a;
    return out;
}

/// Grade atlas metal toward an authored jewelry tint, keeping hinge luma as shading.
/// `gradeMix` 0 keeps the tile untouched; 1 fully replaces the hue.
fn gradeGoldMetalAlbedoTinted(
    texRgb: vec3f,
    tint: vec3f,
    gradeMix: f32,
    shadeMin: f32,
    shadeMax: f32,
) -> vec3f {
    let luma = dot(texRgb, vec3f(0.299, 0.587, 0.114));
    let gold = tint * mix(shadeMin, shadeMax, clamp(luma, 0.0, 1.0));
    return mix(texRgb, gold, clamp(gradeMix, 0.0, 1.0));
}

/// Screen-space TBN (Mikkelsen): correct for any geometry, and identical in WGSL and
/// GLSL, so a cube face gets the same tangent frame in all three renderers without
/// shipping per-face tangent attributes.
fn blockTangentBasis(N: vec3f, worldPos: vec3f, uv: vec2f) -> mat3x3<f32> {
    let dp1 = dpdx(worldPos);
    let dp2 = dpdy(worldPos);
    let duv1 = dpdx(uv);
    let duv2 = dpdy(uv);

    let dp2perp = cross(dp2, N);
    let dp1perp = cross(N, dp1);
    let T = dp2perp * duv1.x + dp1perp * duv2.x;
    let B = dp2perp * duv1.y + dp1perp * duv2.y;

    // Degenerate UVs (a face with no UV gradient) must fall back to a flat frame
    // instead of producing NaNs that paint the block black.
    let maxLen = max(dot(T, T), dot(B, B));
    if (maxLen < 1.0e-12) {
        return mat3x3<f32>(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), N);
    }
    let invmax = inverseSqrt(maxLen);
    return mat3x3<f32>(T * invmax, B * invmax, N);
}

/// Perturb the face normal by a packed tangent-space normal.
/// `strength` scales XY only — hinges must stay readable at playfield size, so the
/// shipped default is deliberately low (see AuthoredBlockMaterial.normal.strength).
fn applyAuthoredNormal(
    N: vec3f,
    worldPos: vec3f,
    uv: vec2f,
    packedNormalXY: vec2f,
    strength: f32,
) -> vec3f {
    if (strength <= 0.001) {
        return N;
    }
    let nxy = (packedNormalXY * 2.0 - vec2f(1.0)) * strength;
    let nz = sqrt(max(1.0 - dot(nxy, nxy), 1.0e-4));
    let tbn = blockTangentBasis(N, worldPos, uv);
    return normalize(tbn * vec3f(nxy, nz));
}

/// Roughness when no baked map is bound. Mirrors bakeRoughnessValue() in
/// blockMaterialMaps.ts so the authored and fallback paths agree on the look.
fn authoredRoughnessFallback(
    metalMask: f32,
    detail: f32,
    metalRough: f32,
    glassRough: f32,
    detailScale: f32,
) -> f32 {
    if (metalMask < 0.5) {
        return clamp(glassRough, 0.02, 0.08);
    }
    return clamp(metalRough * (1.0 - detailScale * detail), 0.04, 1.0);
}

/// Authored roughness: the baked B channel when a material map is bound, else the
/// contract-driven fallback above.
fn authoredRoughness(
    packedRough: f32,
    mapEnabled: f32,
    metalMask: f32,
    detail: f32,
    metalRough: f32,
    glassRough: f32,
    detailScale: f32,
) -> f32 {
    let baked = clamp(packedRough, 0.02, 1.0);
    let fallback = authoredRoughnessFallback(metalMask, detail, metalRough, glassRough, detailScale);
    return select(fallback, baked, mapEnabled > 0.5);
}
