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
fn fresnelSchlickRoughness(cosTheta: f32, F0: vec3f, roughness: f32) -> vec3f {
    let c1 = 1.0 - cosTheta;
    let c2 = c1 * c1;
    let oneMinusR = vec3f(1.0 - roughness);
    return F0 + (max(oneMinusR, F0) - F0) * (c2 * c2 * c1);
}
fn tangentFromUv(worldPos: vec3f, uv: vec2f, N: vec3f) -> vec3f {
    let dp1 = dpdx(worldPos);
    let dp2 = dpdy(worldPos);
    let duv1 = dpdx(uv);
    let duv2 = dpdy(uv);
    let det = duv1.x * duv2.y - duv1.y * duv2.x;
    var T: vec3f;
    if (abs(det) > 1e-8) {
        T = (dp1 * duv2.y - dp2 * duv1.y) * sign(det);
    } else {
        T = dp1;
    }
    T = T - N * dot(N, T);
    let tlen = length(T);
    if (tlen < 1e-5) {
        var axis = vec3f(0.0, 1.0, 0.0);
        if (abs(dot(N, axis)) > 0.95) {
            axis = vec3f(1.0, 0.0, 0.0);
        }
        T = normalize(cross(axis, N));
    } else {
        T = T / tlen;
    }
    return T;
}
fn anisotropicSpecular(V: vec3f, L: vec3f, N: vec3f, roughness: f32, aniso: f32, worldPos: vec3f, uv: vec2f) -> f32 {
    let H = normalize(V + L);
    let T = tangentFromUv(worldPos, uv, N);
    let B = normalize(cross(N, T));
    let ToH = dot(T, H);
    let BoH = dot(B, H);
    let NoH = max(dot(N, H), 0.0001);
    let a2 = roughness * roughness;
    let aspect = sqrt(1.0 - clamp(aniso, 0.0, 0.95) * 0.9);
    let ax = max(a2 / aspect, 0.001);
    let ay = max(a2 * aspect, 0.001);
    let d = ToH * ToH / ax + BoH * BoH / ay + NoH * NoH;
    return 1.0 / max(3.14159 * ax * ay * d * d, 0.001);
}
fn proceduralEnvReflect(R: vec3f, time: f32) -> vec3f {
    // Warm studio fallback (used when IBL cubemap is disabled on low-power GPUs).
    let Rn = normalize(R);
    let up = Rn.y * 0.5 + 0.5;
    var env = mix(vec3f(0.20, 0.11, 0.045), vec3f(1.25, 0.98, 0.62), up);

    let k_dot = max(dot(Rn, normalize(vec3f(0.28, 0.62, 0.72))), 0.0);
    let k2 = k_dot * k_dot;
    let k4 = k2 * k2;
    let k8 = k4 * k4;
    let k16 = k8 * k8;
    let key = k16 * k16 * k16;

    let f_dot = max(dot(Rn, normalize(vec3f(-0.55, 0.35, 0.55))), 0.0);
    let f2 = f_dot * f_dot;
    let f4 = f2 * f2;
    let fill = f4 * f4 * f4 * f2;

    let r_dot = max(dot(Rn, normalize(vec3f(0.1, 0.05, -0.9))), 0.0);
    let r2 = r_dot * r_dot;
    let r4 = r2 * r2;
    let rim = r4 * r4 * r2;

    env += vec3f(5.8, 4.6, 2.8) * key;
    env += vec3f(1.6, 1.05, 0.5) * fill;
    env += vec3f(1.1, 0.8, 0.45) * rim;
    env += vec3f(0.08, 0.05, 0.02) * (0.5 + 0.5 * sin(time * 0.15));
    return env;
}
fn octDecodeDir(uv: vec2f) -> vec3f {
    var f = uv * 2.0 - 1.0;
    var n = vec3f(f.x, f.y, 1.0 - abs(f.x) - abs(f.y));
    let t = clamp(-n.z, 0.0, 1.0);
    n.x += select(-t, t, n.x >= 0.0);
    n.y += select(-t, t, n.y >= 0.0);
    return normalize(n);
}
fn octEncodeDir(n: vec3f) -> vec2f {
    let l1 = abs(n.x) + abs(n.y) + abs(n.z);
    var o = n.xy / max(l1, 1e-5);
    if (n.z < 0.0) {
        let ox = o.x;
        o.x = (1.0 - abs(o.y)) * select(-1.0, 1.0, ox >= 0.0);
        o.y = (1.0 - abs(ox)) * select(-1.0, 1.0, o.y >= 0.0);
    }
    return o * 0.5 + 0.5;
}
fn decodeRGBM(c: vec4f) -> vec3f {
    return c.rgb * c.a * 6.0;
}
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
fn clearcoatSpecular(NdotH: f32, NdotV: f32, NdotL: f32, amount: f32) -> vec3f {
    let D = distributionGGX(NdotH, 0.03);
    let G = geometrySmith(NdotV, NdotL, 0.03);
    let spec = (D * G) / max(4.0 * NdotV * NdotL, 0.001);
    let F = fresnelSchlick(NdotV, vec3f(0.04));
    return F * spec * amount;
}
fn subsurfaceScattering(NdotL: f32, subsurface: f32, color: vec3f) -> vec3f {
    let w = NdotL * 0.5 + 0.5; let wrap = w * w;
    return color * wrap * subsurface;
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
