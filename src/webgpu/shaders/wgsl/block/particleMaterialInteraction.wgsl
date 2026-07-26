// ========== PARTICLE-MATERIAL INTERACTION FUNCTIONS ==========

// Glass refraction distortion from particle hits
fn particleGlassRefraction(
    baseColor: vec3<f32>,
    N: vec3<f32>,
    V: vec3<f32>,
    particleIntensity: f32,
    time: f32
) -> vec3<f32> {
    // Calculate refraction offset based on view angle
    let refractFactor = 1.0 - abs(dot(N, V));
    let distortion = refractFactor * particleIntensity * 0.5;

    // Add chromatic aberration for particle hit
    let r = baseColor.r * (1.0 + distortion * 0.8);
    let g = baseColor.g * (1.0 + distortion * 0.2);
    let b = baseColor.b * (1.0 - distortion * 0.4);

    // Add ripple effect
    let ripple = sin(distortion * 10.0 + time * 5.0) * 0.1 * particleIntensity;

    return vec3<f32>(r, g, b) * (1.0 + particleIntensity * 0.3 + ripple);
}

// Gold/Chrome specular flash from particle hits
fn particleSpecularFlash(
    baseColor: vec3<f32>,
    N: vec3<f32>,
    L: vec3<f32>,
    V: vec3<f32>,
    flashColor: vec3<f32>,
    intensity: f32
) -> vec3<f32> {
    // Calculate intense specular highlight
    let H = normalize(L + V);
    let specAngle = max(dot(N, H), 0.0);
    let s2 = specAngle * specAngle;
    let s4 = s2 * s2;
    let s8 = s4 * s4;
    let s16 = s8 * s8;
    let s32 = s16 * s16;
    let specular = (s32 * s32) * intensity * 3.0;

    // Add bloom-like glow
    let glow = flashColor * intensity * 0.8;

    // Sparkle effect
    let sparkle = step(0.98, fract(specAngle * 10.0)) * intensity * 2.0;

    return baseColor + (flashColor * specular) + glow + (flashColor * sparkle);
}

// Cyber neon burst from particle hits
fn particleNeonBurst(
    baseColor: vec3<f32>,
    emission: vec3<f32>,
    intensity: f32,
    time: f32
) -> vec3<f32> {
    // Intense cyan/magenta emission
    let burstColor = vec3<f32>(0.0, 1.0, 1.0); // Cyan
    let burst = burstColor * intensity * 4.0;

    // Pulse effect synced to time
    let pulse = sin(intensity * 15.0 + time * 8.0) * 0.4 + 0.6;

    // Ring expansion effect
    let ring = smoothstep(0.3, 0.0, abs(intensity * 0.5 - 0.25)) * 2.0;

    return baseColor + (burst * pulse) + (emission * intensity * 2.0) + (burstColor * ring);
}

// Main particle interaction dispatcher
fn applyParticleInteraction(
    materialType: u32,  // 0=none, 1=glass, 2=gold, 3=chrome, 4=cyber, 5=gem
    baseColor: vec3<f32>,
    N: vec3<f32>,
    L: vec3<f32>,
    V: vec3<f32>,
    particleIntensity: f32,
    time: f32
) -> vec3<f32> {
    if (particleIntensity <= 0.0) {
        return baseColor;
    }

    switch (materialType) {
        case 1u: { // Glass - refraction
            return particleGlassRefraction(baseColor, N, V, particleIntensity, time);
        }
        case 2u: { // Gold - specular flash
            return particleSpecularFlash(baseColor, N, L, V, vec3<f32>(1.0, 0.84, 0.0), particleIntensity);
        }
        case 3u: { // Chrome - specular flash (white/blue)
            return particleSpecularFlash(baseColor, N, L, V, vec3<f32>(0.9, 0.95, 1.0), particleIntensity);
        }
        case 4u: { // Cyber - neon burst
            return particleNeonBurst(baseColor, baseColor * 0.2, particleIntensity, time);
        }
        case 5u: { // Gem - combination of refraction and flash
            let refract = particleGlassRefraction(baseColor, N, V, particleIntensity * 0.6, time);
            return particleSpecularFlash(refract, N, L, V, vec3<f32>(1.0, 0.2, 0.8), particleIntensity * 0.8);
        }
        default: {
            return baseColor;
        }
    }
}
