/**
 * Particle Shaders
 * GPU-driven particle rendering with velocity stretching and sparkle effects.
 */

export const ParticleShaders = () => {
    const vertex = `
        struct Uniforms {
            viewProjectionMatrix : mat4x4<f32>,
            time : f32, // Added time
        };
        @binding(0) @group(0) var<uniform> uniforms : Uniforms;

        struct VertexOutput {
            @builtin(position) Position : vec4<f32>,
            @location(0) color : vec4<f32>,
            @location(1) uv : vec2<f32>,
            @location(2) lifeRatio : f32,
        };

        @vertex
        fn main(
            @location(0) particlePos : vec3<f32>,
            @location(1) particleColor : vec4<f32>,
            @location(2) particleScale : f32,
            @location(3) particleLife : f32,
            @location(4) particleMaxLife : f32,
            @location(5) particleVel : vec3<f32>,
            @builtin(vertex_index) vertexIndex : u32
        ) -> VertexOutput {
            var output : VertexOutput;

            // 6 vertices per particle (quad)
            let cornerIdx = vertexIndex % 6u;

            var pos = vec2<f32>(0.0);
            var uv = vec2<f32>(0.0);

            if (cornerIdx == 0u) { pos = vec2<f32>(-1.0, -1.0); uv = vec2<f32>(0.0, 0.0); }
            else if (cornerIdx == 1u) { pos = vec2<f32>( 1.0, -1.0); uv = vec2<f32>(1.0, 0.0); }
            else if (cornerIdx == 2u) { pos = vec2<f32>(-1.0,  1.0); uv = vec2<f32>(0.0, 1.0); }
            else if (cornerIdx == 3u) { pos = vec2<f32>(-1.0,  1.0); uv = vec2<f32>(0.0, 1.0); }
            else if (cornerIdx == 4u) { pos = vec2<f32>( 1.0, -1.0); uv = vec2<f32>(1.0, 0.0); }
            else if (cornerIdx == 5u) { pos = vec2<f32>( 1.0,  1.0); uv = vec2<f32>(1.0, 1.0); }

            // Velocity Stretching (Neon Sparks)
            // If particle is moving fast, stretch it along the velocity vector
            let speed = length(particleVel);
            var vOffset = vec3<f32>(pos * particleScale, 0.0);

            if (speed > 0.5) { // JUICE: Threshold lowered
                 let dir = normalize(particleVel);
                 let right = normalize(cross(dir, vec3<f32>(0.0, 0.0, 1.0)));
                 let stretch = 1.0 + speed * 0.1; // JUICE: More stretch
                 vOffset = (right * pos.x * particleScale * 0.5) + (dir * pos.y * particleScale * stretch);
            }

            let worldPos = particlePos + vOffset;

            output.Position = uniforms.viewProjectionMatrix * vec4<f32>(worldPos, 1.0);
            output.color = particleColor;
            output.uv = uv;
            // Calculate normalized life (1.0 = born, 0.0 = dead)
            output.lifeRatio = clamp(particleLife / max(particleMaxLife, 0.001), 0.0, 1.0);

            return output;
        }
    `;

    const fragment = `
        struct Uniforms {
            viewProjectionMatrix : mat4x4<f32>,
            time : f32,
        };
        @binding(0) @group(0) var<uniform> uniforms : Uniforms;

        @fragment
        fn main(@location(0) color : vec4<f32>, @location(1) uv : vec2<f32>, @location(2) lifeRatio : f32) -> @location(0) vec4<f32> {
            let dist = length(uv - 0.5) * 2.0; // 0 at center, 1 at edge
            if (dist > 1.0) {
                discard;
            }

            // "Hot Core" effect
            // Intense center, rapid falloff
            let intensity = exp(-dist * 4.0); // Sharper core

            // Sparkle shape (star)
            let uvCentered = abs(uv - 0.5);
            // Rotate UV 45 degrees for second cross
            let rot = 0.7071;
            let uvr = vec2<f32>(
                uvCentered.x * rot - uvCentered.y * rot,
                uvCentered.x * rot + uvCentered.y * rot
            );
            let uvrCentered = abs(uvr);

            // Create a soft glowing core
            let core = exp(-length(uv - 0.5) * 5.0);

            // Create sharp rays
            let cross1 = max(1.0 - smoothstep(0.0, 0.1, uvCentered.x), 1.0 - smoothstep(0.0, 0.1, uvCentered.y));
            let cross2 = max(1.0 - smoothstep(0.0, 0.1, uvrCentered.x), 1.0 - smoothstep(0.0, 0.1, uvrCentered.y));

            let sparkle = max(cross1, cross2 * 0.5);

            // Combine
            // Fade out as life decreases (lifeRatio goes 1 -> 0)
            // But keep core bright until the very end
            let alpha = intensity + core * 0.5 + sparkle * 0.8;
            let finalAlpha = clamp(alpha * color.a * smoothstep(0.0, 0.2, lifeRatio), 0.0, 1.0);

            // Color Shift:
            // Hot White/Yellow at birth -> Theme Color -> Darker/Cooler at death
            let hotColor = vec3<f32>(1.0, 1.0, 0.8); // Hot white-yellow
            let baseColor = color.rgb;

            // Mix based on life
            // lifeRatio 1.0 -> 0.8 : Hot -> Base
            // lifeRatio 0.8 -> 0.0 : Base
            let mixFactor = smoothstep(0.8, 1.0, lifeRatio);
            var finalColor = mix(baseColor, hotColor, mixFactor);

            // JUICE: Pulse alpha for "alive" particles, sped up by low life
            // Pulse faster when dying
            let pulseSpeed = 20.0 + (1.0 - lifeRatio) * 30.0;
            let pulse = 0.8 + 0.2 * sin(uv.x * pulseSpeed);

            // Neon Flicker (JUICE)
            // High frequency chaos for electrical look
            // Use pseudo-random noise for flicker
            let noise = fract(sin(dot(uv, vec2<f32>(12.9898 + uniforms.time, 78.233))) * 43758.5453);
            var flicker = 0.8 + 0.2 * sin(uniforms.time * 60.0);
            if (noise > 0.9) { flicker *= 1.5; } // Random bright sparks

            // Boost brightness significantly for small particles (sparkle)
            var brightness = 4.0;
            if (lifeRatio > 0.8) { brightness = 12.0; } // Initial burst is super bright

            return vec4<f32>(finalColor * brightness * lifeRatio, finalAlpha * pulse * flicker);
        }
    `;

    return { vertex, fragment };
};
