export const BlackholeWGSL = `
fn applyBlackholeDistortion(
    uv: vec2<f32>,
    bhCenter: vec2<f32>,
    bhTime: f32
) -> vec2<f32> {
    var finalUV = uv;
    if (bhTime > 0.001) {
        let bhDiff = finalUV - bhCenter;
        let bhDistSq = dot(bhDiff, bhDiff);

        let bhRadius = 0.6 * (1.0 - sqrt(bhTime));
        let bhRadiusSq = bhRadius * bhRadius;

        if (bhDistSq < bhRadiusSq && bhDistSq > 0.0) {
            let bhDist = sqrt(bhDistSq);
            let angle = atan2(bhDiff.y, bhDiff.x);
            let spin = bhTime * 10.0 * (1.0 - bhDist / bhRadius);
            let newAngle = angle + spin;

            let suck = pow(1.0 - bhDist / bhRadius, 2.0) * bhTime * 0.2;
            let newDist = max(0.001, bhDist - suck);

            finalUV = bhCenter + vec2<f32>(cos(newAngle), sin(newAngle)) * newDist;
        }
    }
    return finalUV;
}

fn applyBlackholeColor(
    color: vec3<f32>,
    uv: vec2<f32>,
    bhCenter: vec2<f32>,
    bhTime: f32
) -> vec3<f32> {
    var finalColor = color;
    if (bhTime > 0.001) {
        let bhDiff = uv - bhCenter;
        let bhDistSq = dot(bhDiff, bhDiff);

        let bhRadius = 0.6 * (1.0 - sqrt(bhTime));
        let bhRadiusSq = bhRadius * bhRadius;

        if (bhDistSq < bhRadiusSq) {
            let bhDist = sqrt(bhDistSq);
            let darkFactor = smoothstep(0.0, bhRadius * 0.5, bhDist);
            finalColor *= darkFactor;
            let ring = smoothstep(bhRadius * 0.8, bhRadius, bhDist) * (1.0 - smoothstep(bhRadius, bhRadius * 1.2, bhDist));
            finalColor += vec3<f32>(0.2, 0.8, 1.0) * ring * 2.0 * (1.0 - bhTime);
        }
    }
    return finalColor;
}
`;
