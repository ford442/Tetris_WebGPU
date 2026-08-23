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
    let key = pow(max(dot(Rn, normalize(vec3f(0.28, 0.62, 0.72))), 0.0), 48.0);
    let fill = pow(max(dot(Rn, normalize(vec3f(-0.55, 0.35, 0.55))), 0.0), 14.0);
    let rim = pow(max(dot(Rn, normalize(vec3f(0.1, 0.05, -0.9))), 0.0), 10.0);
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
