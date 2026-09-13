// Binding-dependent PBR helpers: these read @binding resources (IBL textures,
// backdrop capture) and so cannot be shared with the C++ renderer as-is.
// The binding-free half lives in pbrCore.wgsl and is prepended by pbrFunctions.wgsl.ts.

fn sampleIblSpecular(R: vec3f, roughness: f32) -> vec3f {
    let uv = octEncodeDir(normalize(R));
    let levels = f32(textureNumLevels(iblSpecular));
    let mip = clamp(roughness, 0.0, 1.0) * max(levels - 1.0, 0.0);
    return decodeRGBM(textureSampleLevel(iblSpecular, iblSampler, uv, mip));
}
fn splitSumSpecular(N: vec3f, V: vec3f, F0: vec3f, roughness: f32, metalMask: f32) -> vec3f {
    let NdotV = max(dot(N, V), 0.001);
    let R = reflect(-V, N);
    let prefiltered = sampleIblSpecular(R, roughness);
    let brdf = textureSample(iblBrdfLut, iblSampler, vec2f(NdotV, roughness)).rg;
    let F = fresnelSchlickRoughness(NdotV, F0, roughness);
    return prefiltered * (F * brdf.x + brdf.y) * metalMask;
}
/**
 * Screen-space refraction of the captured scene backdrop (procedural background +
 * video portal + frosted backboard), with optional chromatic dispersion.
 *
 * The refracted direction is world-space, so it is projected onto a view-aligned
 * basis before being used as a UV offset — that is what makes the video actually
 * warp when the camera moves, instead of sliding like a screen-locked gradient.
 *
 * `thickness` is in UV units (0.02-0.06 reads as crystal at 1080p). Callers must
 * gate on glassMask: the metal frame is opaque and must not refract.
 */
fn refractBackdropUV(
    baseUV: vec2f,
    right: vec3f,
    up: vec3f,
    fwd: vec3f,
    N: vec3f,
    eta: f32,
    thickness: f32,
) -> vec2f {
    let rd = refract(fwd, N, eta);
    // refract() returns 0 on total internal reflection; keep the straight-through
    // sample in that case rather than collapsing the block to a single texel.
    if (dot(rd, rd) < 0.0001) {
        return baseUV;
    }
    let offset = vec2f(dot(rd, right), -dot(rd, up)) * thickness;
    return clamp(baseUV + offset, vec2f(0.0), vec2f(1.0));
}

fn refractBackdrop(
    clipPos: vec4f,
    N: vec3f,
    V: vec3f,
    ior: f32,
    thickness: f32,
    dispersion: f32,
) -> vec3f {
    let ndc = clipPos.xy / max(clipPos.w, 0.0001);
    // WebGPU clip space is y-up, textures are v-down.
    let baseUV = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);

    // View-aligned screen basis. `V` points from the surface to the eye, so `-V` is
    // the forward direction; the world up vector only picks the roll reference.
    let fwd = -V;
    let rightRaw = cross(vec3f(0.0, 1.0, 0.0), fwd);
    let rightLen = length(rightRaw);
    // Degenerate when looking straight up/down — fall back to the world x axis.
    let right = select(vec3f(1.0, 0.0, 0.0), rightRaw / max(rightLen, 0.0001), rightLen > 0.001);
    let up = cross(fwd, right);

    let eta = 1.0 / max(ior, 1.001);
    // Per-channel IOR spread: red bends least, blue most.
    let spread = clamp(dispersion, 0.0, 1.0) * 0.06;

    // textureSampleLevel (not textureSample) throughout: this runs inside glass-mask
    // branching, where implicit-derivative sampling is not uniform.
    let uvG = refractBackdropUV(baseUV, right, up, fwd, N, eta, thickness);
    if (spread < 0.0005) {
        return textureSampleLevel(backdropTexture, backdropSampler, uvG, 0.0).rgb;
    }

    let uvR = refractBackdropUV(baseUV, right, up, fwd, N, eta * (1.0 - spread), thickness);
    let uvB = refractBackdropUV(baseUV, right, up, fwd, N, eta * (1.0 + spread), thickness);
    return vec3f(
        textureSampleLevel(backdropTexture, backdropSampler, uvR, 0.0).r,
        textureSampleLevel(backdropTexture, backdropSampler, uvG, 0.0).g,
        textureSampleLevel(backdropTexture, backdropSampler, uvB, 0.0).b,
    );
}
