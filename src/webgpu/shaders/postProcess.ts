
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
        const FLASH_BLEND_STRENGTH: f32 = 0.6;

        struct Uniforms {
            time: f32,
            useGlitch: f32,
            shockwaveCenter: vec2<f32>,
            shockwaveTime: f32,
            aberrationStrength: f32,
            padding1: vec2<f32>,
            flashIntensity: f32,
            padding2: vec3<f32>,
            flashColor: vec3<f32>,
        };
        @binding(0) @group(0) var<uniform> uniforms : Uniforms;
        @binding(1) @group(0) var mySampler: sampler;
        @binding(2) @group(0) var myTexture: texture_2d<f32>;

        @fragment
        fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
            var finalUV = uv;

            // Shockwave
            let center = uniforms.shockwaveCenter;
            let time = uniforms.shockwaveTime;
            let useGlitch = uniforms.useGlitch;
            let aberrationStrength = uniforms.aberrationStrength;

            if (time > 0.0 && time < 1.0) {
                let dist = distance(uv, center);
                let radius = time * 1.5;
                let width = 0.15;
                let diff = dist - radius;

                if (abs(diff) < width) {
                    let angle = (diff / width) * 3.14159;
                    let distortion = cos(angle) * 0.03 * (1.0 - time);
                    let dir = normalize(uv - center);
                    finalUV -= dir * distortion;
                }
            }

            // Chromatic Aberration - distance-aware and less aggressive
            let distFromCenter = distance(uv, vec2<f32>(0.5));
            var aberration = distFromCenter * 0.01; // Passive lens distortion (mutable)
            aberration = select(aberration, aberration * 2.0, useGlitch > 0.5);
            let totalAberration = aberration + aberrationStrength;

            var r = textureSample(myTexture, mySampler, finalUV + vec2<f32>(totalAberration, 0.0)).r;
            var g = textureSample(myTexture, mySampler, finalUV).g;
            var b = textureSample(myTexture, mySampler, finalUV - vec2<f32>(totalAberration, 0.0)).b;
            let a = textureSample(myTexture, mySampler, finalUV).a;

            var color = vec3<f32>(r, g, b);

            // Add subtle sharpening filter when glitch is OFF
            if (useGlitch < 0.5) {
                let texSize = vec2<f32>(textureDimensions(myTexture));
                let texelSize = 1.0 / texSize;
                let center = color; // Reuse already sampled color
                let north = textureSample(myTexture, mySampler, finalUV + vec2<f32>(0.0, texelSize.y)).rgb;
                let south = textureSample(myTexture, mySampler, finalUV - vec2<f32>(0.0, texelSize.y)).rgb;
                let east = textureSample(myTexture, mySampler, finalUV + vec2<f32>(texelSize.x, 0.0)).rgb;
                let west = textureSample(myTexture, mySampler, finalUV - vec2<f32>(texelSize.x, 0.0)).rgb;

                // Simple Laplacian sharpen
                let sharpened = center * 5.0 - (north + south + east + west);
                color = mix(color, sharpened, 0.3);
            }

            var finalColor = color;

            // Calculate luminance for Bloom and Saturation
            let luminance = dot(color, vec3<f32>(0.299, 0.587, 0.114));

            // Enhanced Bloom: Quadratic response for smoother high-end boost
            let bloomThreshold = 0.6;
            let bloomStrength = 0.7; // Increased bloom
            let bloomFactor = max(0.0, luminance - bloomThreshold);
            finalColor += color * bloomFactor * bloomStrength;

            // Saturation boost for that "Neon" look
            let gray = vec3<f32>(luminance);
            finalColor = mix(gray, finalColor, 1.3); // Increased saturation

            // Vignette
            let distV = distance(uv, vec2<f32>(0.5));
            let vignette = smoothstep(0.8, 0.2, distV * 0.8);
            finalColor *= vignette;

            // Scanlines (Subtle retro feel)
            let scanline = sin(uv.y * 800.0) * 0.02;
            finalColor -= vec3<f32>(scanline);

            // Clamp to prevent negative values from subtractive scanlines
            finalColor = max(vec3<f32>(0.0), finalColor);

            // Apply flash overlay with gentle squared curve (color only)
            let flashAmount = uniforms.flashIntensity * uniforms.flashIntensity;
            finalColor = mix(finalColor, uniforms.flashColor, flashAmount * FLASH_BLEND_STRENGTH);

            // Preserve texture alpha so background video remains visible
            // Do NOT increase alpha during flash (avoids opaque 'purple mask')
            let finalAlpha = a;

            return vec4<f32>(finalColor, finalAlpha);
        }
    `;

    return { vertex, fragment };
};
