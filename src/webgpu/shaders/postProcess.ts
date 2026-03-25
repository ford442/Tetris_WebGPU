/**
 * Post-Processing Shader
 * Lens distortion, shockwave, bloom, chromatic aberration, glitch, scanlines.
 */

export const PostProcessShaders = () => {
    const vertex = `
        struct VertexOutput {
            @builtin(position) Position : vec4<f32>,
            @location(0) uv : vec2<f32>,
        };

        @vertex
        fn main(@location(0) position : vec3<f32>) -> VertexOutput {
            var output : VertexOutput;
            output.Position = vec4<f32>(position, 1.0);
            output.uv = position.xy * 0.5 + 0.5;
            output.uv.y = 1.0 - output.uv.y; // Flip Y for texture sampling
            return output;
        }
    `;

    const fragment = `
        struct Uniforms {
            time: f32,
            useGlitch: f32,
            shockwaveCenter: vec2<f32>,
            shockwaveTime: f32,
            // Align to 16 bytes for next field if needed, but here we just flow
            // offset 0: time(4), 4: useGlitch(4), 8: center(8) -> 16
            // offset 16: shockwaveTime(4), pad(12) -> 32
            // offset 32: shockwaveParams(16) -> 48
            // offset 48: level(4)
            shockwaveParams: vec4<f32>, // x: width, y: strength, z: aberration, w: speed
            level: f32,
            warpSurge: f32, // Offset 52
        };
        @binding(0) @group(0) var<uniform> uniforms : Uniforms;
        @binding(1) @group(0) var mySampler: sampler;
        @binding(2) @group(0) var myTexture: texture_2d<f32>;

        @fragment
        fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
            // Lens Distortion (Barrel)
            let centeredUV = uv - 0.5;
            let distSq = dot(centeredUV, centeredUV);
            let distortStrength = 0.1; // K factor
            let distortedUV = 0.5 + centeredUV * (1.0 + distSq * distortStrength);

            var finalUV = distortedUV;
            let inBounds = (distortedUV.x >= 0.0 && distortedUV.x <= 1.0 && distortedUV.y >= 0.0 && distortedUV.y <= 1.0);

            // Shockwave
            let center = uniforms.shockwaveCenter;
            let time = uniforms.shockwaveTime;
            let glitchStrength = uniforms.useGlitch; // Treated as intensity
            let params = uniforms.shockwaveParams;
            let level = uniforms.level;

            // Shockwave Logic
            var shockwaveAberration = 0.0;
            if (time > 0.0 && time < 1.0) {
                let dist = distance(uv, center);
                // NEON BRICKLAYER: Use speed from params.w
                let speed = max(params.w, 0.1);
                let radius = time * speed;
                let width = params.x * 1.5; // JUICE: Wider shockwave
                let strength = params.y * 1.5; // e.g. 0.05
                let diff = dist - radius;

                if (abs(diff) < width) {
                    // Cosine wave for smooth ripple
                    let angle = (diff / width) * 3.14159;
                    let distortion = cos(angle) * strength * (1.0 - time); // Fade out
                    let dir = normalize(uv - center);

                    finalUV -= dir * distortion;

                    // Add chromatic aberration at the edge of the shockwave
                    shockwaveAberration = params.z * (1.0 - abs(diff)/width) * (1.0 - time);
                }

                // Second ring (Echo) - NEON BRICKLAYER
                let echoRadius = radius * 0.8;
                let echoDiff = abs(dist - echoRadius);
                if (echoDiff < width * 0.5) {
                    let angle = (echoDiff / (width * 0.5)) * 3.14159;
                    let distortion = cos(angle) * strength * 0.5 * (1.0 - time);
                    let dir = normalize(uv - center);
                    finalUV -= dir * distortion;
                }

                // Third ring (Ripple)
                let echoRadius2 = radius * 0.6;
                let echoDiff2 = abs(dist - echoRadius2);
                if (echoDiff2 < width * 0.5) {
                    let angle = (echoDiff2 / (width * 0.5)) * 3.14159;
                    let distortion = cos(angle) * strength * 0.25 * (1.0 - time);
                    let dir = normalize(uv - center);
                    finalUV -= dir * distortion;
                }
            }

            // Global Chromatic Aberration (Glitch + Shockwave + Edge Vignette + Level Stress)
            let distFromCenter = distance(uv, vec2<f32>(0.5));
            // Subtle permanent aberration at edges for arcade feel
            // JUICE: Stronger lens distortion at edges for arcade CRT feel
            // ENHANCED: Increased base aberration
            let dist2 = distFromCenter * distFromCenter;
            let vignetteAberration = dist2 * dist2 * 0.08; // Sharper curve, more intense at far corners

            // Level based aberration: Starts calm, gets glitchy at high levels
            // Level 10+ = max stress
            let levelStress = clamp(level / 12.0, 0.0, 1.0);
            let levelAberration = levelStress * 0.008 * sin(uniforms.time * 2.0); // Breathing aberration

            // NEON BRICKLAYER: Enhanced Glitch Logic
            // Dynamic offset based on intensity, time, and Y position
            let glitchOffset = glitchStrength * 0.05 * sin(finalUV.y * 50.0 + uniforms.time * 20.0);
            // Tear effect: Random horizontal strips
            let tear = step(0.95, fract(finalUV.y * 2.0 + uniforms.time * 10.0)) * glitchStrength * 0.05;
            finalUV.x += tear;

            let baseAberration = vignetteAberration + levelAberration;
            // Add glitch aberration
            let glitchAberration = glitchStrength * 0.05;
            let totalAberration = baseAberration + shockwaveAberration + glitchAberration;

            // Chromatic Aberration with Glitch Offset
            // R and B channels get offset by the glitch wave in opposite directions
            // JUICE: Vertical aberration added for lens effect (scaled by UV y)
            let vertAberration = totalAberration * (uv.y - 0.5) * 0.2;

            var r = textureSample(myTexture, mySampler, finalUV + vec2<f32>(totalAberration + glitchOffset, vertAberration)).r;
            var g = textureSample(myTexture, mySampler, finalUV).g;
            var b = textureSample(myTexture, mySampler, finalUV - vec2<f32>(totalAberration + glitchOffset, vertAberration)).b;
            let a = textureSample(myTexture, mySampler, finalUV).a;

            // Bloom-ish boost (cheap but juicy)
            var color = vec3<f32>(r, g, b);

            // NEON BRICKLAYER: Enhanced Glow (Tent Filter + Wide Spread)
            // Sample 8 points for a smoother, wider halo
            // JUICE: Wider spread (Increased base offset)
            let offset = 0.008 * (1.0 + levelStress * 0.8);
            let offset2 = offset * 2.2; // Even wider outer ring
            var glow = vec3<f32>(0.0);

            // Inner Ring
            glow += textureSample(myTexture, mySampler, finalUV + vec2<f32>(offset, offset)).rgb;
            glow += textureSample(myTexture, mySampler, finalUV + vec2<f32>(-offset, offset)).rgb;
            glow += textureSample(myTexture, mySampler, finalUV + vec2<f32>(offset, -offset)).rgb;
            glow += textureSample(myTexture, mySampler, finalUV + vec2<f32>(-offset, -offset)).rgb;

            // Outer Ring (Diagonal)
            glow += textureSample(myTexture, mySampler, finalUV + vec2<f32>(0.0, offset2)).rgb;
            glow += textureSample(myTexture, mySampler, finalUV + vec2<f32>(0.0, -offset2)).rgb;
            glow += textureSample(myTexture, mySampler, finalUV + vec2<f32>(offset2, 0.0)).rgb;
            glow += textureSample(myTexture, mySampler, finalUV + vec2<f32>(-offset2, 0.0)).rgb;

            glow *= 0.125; // Average of 8 samples

            // Thresholding the glow
            let glowLum = dot(glow, vec3<f32>(0.299, 0.587, 0.114));
            // JUICE: Lower threshold (0.1) to catch more mid-tones, Higher Intensity (5.5)
            // ENHANCED: Even more aggressive bloom for that neon look
            let bloomThreshold = 0.1; // Cleaner threshold
            if (glowLum > bloomThreshold) {
                 color += glow * 8.0; // Tuned intensity (less blinding)
            }

            // High-pass boost for the core pixels
            let luminance = dot(color, vec3<f32>(0.299, 0.587, 0.114));
            if (luminance > 0.6) {
                 color += color * 0.4;
            }

            // Vignette darken (pulsing with beat)
            let beat = sin(uniforms.time * 8.0) * 0.5 + 0.5;
            let vignetteSize = 1.5 - (beat * 0.05 * levelStress);
            let vignette = 1.0 - clamp((distFromCenter - 0.5) / (vignetteSize - 0.5), 0.0, 1.0);
            color *= vignette;

            // NEON BRICKLAYER: Warp Surge Flash
            let warpSurge = uniforms.warpSurge;
            if (warpSurge > 0.01) {
                let invert = vec3<f32>(1.0) - color;
                color = mix(color, invert, clamp(warpSurge * 0.8, 0.0, 0.8));
            }

            // Scanlines
            let scanline = sin(finalUV.y * 800.0 + uniforms.time * 10.0) * 0.04;
            color -= vec3<f32>(scanline);

            if (!inBounds) {
                return vec4<f32>(0.0, 0.0, 0.0, 1.0);
            }

            return vec4<f32>(color, a);
        }
    `;

    return { vertex, fragment };
};

