
export const ParticleShaders = () => {
    const vertex = `
        struct Uniforms {
            viewProjectionMatrix : mat4x4<f32>,
        };
        @binding(0) @group(0) var<uniform> uniforms : Uniforms;

        struct VertexOutput {
            @builtin(position) Position : vec4<f32>,
            @location(0) color : vec4<f32>,
            @location(1) uv : vec2<f32>,
        };

        @vertex
        fn main(
            @location(0) particlePos : vec3<f32>,
            @location(1) particleColor : vec4<f32>,
            @location(2) particleScale : f32,
            @builtin(vertex_index) vertexIndex : u32
        ) -> VertexOutput {
            var output : VertexOutput;

            let cornerIdx = vertexIndex % 6u;

            var pos = vec2<f32>(0.0);
            var uv = vec2<f32>(0.0);

            if (cornerIdx == 0u) { pos = vec2<f32>(-1.0, -1.0); uv = vec2<f32>(0.0, 0.0); }
            else if (cornerIdx == 1u) { pos = vec2<f32>( 1.0, -1.0); uv = vec2<f32>(1.0, 0.0); }
            else if (cornerIdx == 2u) { pos = vec2<f32>(-1.0,  1.0); uv = vec2<f32>(0.0, 1.0); }
            else if (cornerIdx == 3u) { pos = vec2<f32>(-1.0,  1.0); uv = vec2<f32>(0.0, 1.0); }
            else if (cornerIdx == 4u) { pos = vec2<f32>( 1.0, -1.0); uv = vec2<f32>(1.0, 0.0); }
            else if (cornerIdx == 5u) { pos = vec2<f32>( 1.0,  1.0); uv = vec2<f32>(1.0, 1.0); }

            let worldPos = particlePos + vec3<f32>(pos * particleScale, 0.0);

            output.Position = uniforms.viewProjectionMatrix * vec4<f32>(worldPos, 1.0);
            output.color = particleColor;
            output.uv = uv;

            return output;
        }
    `;

    const fragment = `
        @fragment
        fn main(@location(0) color : vec4<f32>, @location(1) uv : vec2<f32>) -> @location(0) vec4<f32> {
            let dist = length(uv - 0.5) * 2.0;
            if (dist > 1.0) {
                discard;
            }

            // Soft Particle Look
            let glow = exp(-dist * 2.5); // Softer falloff
            let core = exp(-dist * 5.0); // Bright center

            let alpha = glow * 0.8 + core * 0.5;
            let finalAlpha = clamp(alpha * color.a, 0.0, 1.0);

            // Boost color for emissive look
            let finalColor = color.rgb * (1.5 + core * 2.0);

            return vec4<f32>(finalColor, finalAlpha);
        }
    `;

    return { vertex, fragment };
};
