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
            let centered = uv - 0.5;
            let distSq = dot(centered, centered) * 4.0; // 0 at center, 1 at edge squared
            if (distSq > 1.0) {
                discard;
            }
            let dist = sqrt(distSq);

            // OPTIMIZED: "Hot Core" with single exp() using distance squared
            // exp(-dist * 4.0) -> exp(-sqrt(distSq) * 4.0)
            // Approximate with polynomial for speed: (1 - dist^2)^3
            let oneMinusDistSq = 1.0 - distSq;
            let intensity = oneMinusDistSq * oneMinusDistSq * oneMinusDistSq;

            // OPTIMIZED: Sparkle shape using cheaper math
            // Instead of smoothstep, use sharp threshold with smooth falloff
            let uvAbs = abs(centered);
            let rot = 0.7071;
            let uvrAbs = abs(vec2<f32>(
                uvAbs.x * rot - uvAbs.y * rot,
                uvAbs.x * rot + uvAbs.y * rot
            ));

            // Create sharp rays using step for main ray, smooth for glow
            // (1.0 - threshold * 10.0) clamped gives sharp line with soft edge
            let cross1 = max(1.0 - uvAbs.x * 12.0, 1.0 - uvAbs.y * 12.0);
            let cross2 = max(1.0 - uvrAbs.x * 12.0, 1.0 - uvrAbs.y * 12.0) * 0.5;
            let sparkle = max(cross1, cross2);

            // OPTIMIZED: Softer core using same polynomial
            let core = oneMinusDistSq * oneMinusDistSq;

            // Combine with cheaper alpha calculation
            let alpha = intensity * 0.7 + core * 0.3 + sparkle * 0.5;
            // Fast smoothstep approximation for fade-in: t * t * (3 - 2t)
            let fadeInT = clamp(lifeRatio * 5.0, 0.0, 1.0);
            let fadeIn = fadeInT * fadeInT * (3.0 - 2.0 * fadeInT);
            let finalAlpha = clamp(alpha * color.a * fadeIn, 0.0, 1.0);

            // OPTIMIZED: Color shift - simplified hot core blending
            let hotColor = vec3<f32>(1.0, 0.95, 0.7);
            // Fast smoothstep: t < 0.2 ? 0 : t > 0.8 ? 1 : smooth
            let t = (lifeRatio - 0.8) * 5.0;
            let mixFactor = clamp(t, 0.0, 1.0);
            var finalColor = mix(color.rgb, hotColor, mixFactor);

            // OPTIMIZED: Faster pulse using fract instead of sin where possible
            let pulseSpeed = 20.0 + (1.0 - lifeRatio) * 30.0;
            let pulsePhase = uv.x * pulseSpeed + uniforms.time * 10.0;
            let pulse = 0.85 + 0.15 * sin(pulsePhase);

            // OPTIMIZED: Cheaper flicker using fract hash
            let hash = fract(dot(uv, vec2<f32>(12.9898, 78.233)) * 43758.5453 + uniforms.time);
            var flicker = 0.9 + 0.1 * sin(uniforms.time * 45.0);
            if (hash > 0.92) { flicker *= 1.3; }

            // Brightness boost based on life phase
            var brightness = 3.5;
            if (lifeRatio > 0.8) { brightness = 8.0; }

            return vec4<f32>(finalColor * brightness * lifeRatio, finalAlpha * pulse * flicker);
        }
    `;

    return { vertex, fragment };
};
