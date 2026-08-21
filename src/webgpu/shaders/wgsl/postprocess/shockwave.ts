export const ShockwaveWGSL = `
struct ShockwaveResult {
    uv: vec2<f32>,
    aberration: f32,
    glassOverlay: f32,
}

fn applyShockwave(
    uv: vec2<f32>,
    center: vec2<f32>,
    time: f32,
    params: vec4<f32>,
    hardDropBoostFromBuffer: f32,
    blockTexture: texture_2d<f32>,
    mySampler: sampler
) -> ShockwaveResult {
    var finalUV = uv;
    var shockwaveAberration = 0.0;
    var glassOverlay = 0.0;

    if (params.y > 0.0) {
        shockwaveAberration += params.z * 0.5;
    }
    if (time > 0.0 && time < 1.0) {
        let dist = sqrt(dot(uv - center, uv - center));
        let speed = max(params.w, 0.1);
        let radius = time * speed;
        let width = params.x * 1.5;
        let strength = (params.y * 1.55) * (1.0 + hardDropBoostFromBuffer * 0.6);
        let diff = dist - radius;

        let dir = normalize(uv - center);

        if (abs(diff) < width) {
            let angle = (diff / width) * 3.14159;
            let distortion = cos(angle) * strength * (1.0 - time);

            finalUV -= dir * distortion;

            shockwaveAberration = params.z * 3.0 * (1.0 - abs(diff)/width) * (1.0 - time);

            if (hardDropBoostFromBuffer > 0.0 && time < 0.5) {
                let glassUV = (uv - center) * 4.0 + vec2<f32>(0.5);
                let texColor = textureSampleLevel(blockTexture, mySampler, glassUV, 0.0).rgb;

                if (glassUV.x >= 0.0 && glassUV.x <= 1.0 && glassUV.y >= 0.0 && glassUV.y <= 1.0) {
                    let crackIntensity = max(texColor.r, max(texColor.g, texColor.b));
                    let blend = cos(angle) * strength * (1.0 - time * 2.0) * hardDropBoostFromBuffer * 2.0;
                    glassOverlay = clamp(crackIntensity * blend, 0.0, 1.0);
                }
            }
        }

        // Echo rings
        for (var i: i32 = 1; i <= 2; i++) {
            let echoRadius = radius * (0.9 - f32(i) * 0.15);
            let echoDiff = abs(dist - echoRadius);
            if (echoDiff < width * 0.5) {
                let angle = (echoDiff / (width * 0.5)) * 3.14159;
                let distortion = cos(angle) * strength * (0.5 - f32(i) * 0.15) * (1.0 - time);
                finalUV -= dir * distortion;
            }
        }
    }

    var result: ShockwaveResult;
    result.uv = finalUV;
    result.aberration = shockwaveAberration;
    result.glassOverlay = glassOverlay;
    return result;
}
`;
