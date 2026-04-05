/**
 * Frosted Glass Backboard Shader
 * Creates an ethereal frosted glass panel behind the playfield
 * Samples background with blur for that premium hardware look
 */

export const FrostedGlassShaders = () => {
    const vertex = `
        struct Uniforms {
            viewProjectionMatrix: mat4x4<f32>,
            modelMatrix: mat4x4<f32>,
            tintColor: vec4<f32>,
            frostAmount: f32,
            opacity: f32,
        };
        @binding(0) @group(0) var<uniform> uniforms: Uniforms;

        struct Output {
            @builtin(position) Position: vec4<f32>,
            @location(0) vUV: vec2<f32>,
            @location(1) vWorldPos: vec3<f32>,
        };

        @vertex
        fn main(@location(0) position: vec3<f32>) -> Output {
            var output: Output;
            let worldPos = (uniforms.modelMatrix * vec4<f32>(position, 1.0)).xyz;
            output.Position = uniforms.viewProjectionMatrix * vec4<f32>(worldPos, 1.0);
            output.vUV = position.xy * 0.5 + 0.5;
            output.vWorldPos = worldPos;
            return output;
        }
    `;

    const fragment = `
        struct Uniforms {
            viewProjectionMatrix: mat4x4<f32>,
            modelMatrix: mat4x4<f32>,
            tintColor: vec4<f32>,
            frostAmount: f32,
            opacity: f32,
        };
        @binding(0) @group(0) var<uniform> uniforms: Uniforms;
        @binding(1) @group(0) var backgroundSampler: sampler;
        @binding(2) @group(0) var backgroundTexture: texture_2d<f32>;

        // Simple pseudo-random for noise
        fn random(uv: vec2<f32>) -> f32 {
            return fract(sin(dot(uv, vec2<f32>(12.9898, 78.233))) * 43758.5453);
        }

        // 9-tap box blur for frosted effect (cheaper than Gaussian)
        fn sampleFrosted(uv: vec2<f32>, amount: f32) -> vec3<f32> {
            let texelSize = 1.0 / vec2<f32>(textureDimensions(backgroundTexture, 0));
            let offset = amount * texelSize * 8.0;
            
            var color = vec3<f32>(0.0);
            let weight = 1.0 / 9.0;
            
            // 3x3 kernel
            for(var y: i32 = -1; y <= 1; y++) {
                for(var x: i32 = -1; x <= 1; x++) {
                    let sampleUV = uv + vec2<f32>(f32(x), f32(y)) * offset;
                    color += textureSample(backgroundTexture, backgroundSampler, sampleUV).rgb * weight;
                }
            }
            
            return color;
        }

        // Subtle surface noise for glass texture
        fn surfaceNoise(uv: vec2<f32>) -> f32 {
            let scale = 200.0;
            let n1 = random(uv * scale);
            let n2 = random(uv * scale * 2.0 + 0.5);
            return (n1 + n2 * 0.5) / 1.5;
        }

        @fragment
        fn main(@location(0) vUV: vec2<f32>, @location(1) vWorldPos: vec3<f32>) -> @location(0) vec4<f32> {
            // Sample background with frost blur
            let backgroundColor = sampleFrosted(vUV, uniforms.frostAmount);
            
            // Apply theme tint
            let tinted = mix(backgroundColor, uniforms.tintColor.rgb, uniforms.tintColor.a * 0.3);
            
            // Add subtle surface texture
            let noise = surfaceNoise(vUV);
            let textured = mix(tinted, tinted * (0.95 + noise * 0.1), 0.15);
            
            // Edge darkening for glass thickness illusion
            let edgeDist = abs(vUV - 0.5) * 2.0;
            let edgeFactor = max(edgeDist.x, edgeDist.y);
            let edgeDarken = 1.0 - edgeFactor * edgeFactor * 0.15;
            
            // Final color with opacity
            let finalColor = textured * edgeDarken * uniforms.opacity;
            
            return vec4<f32>(finalColor, uniforms.opacity);
        }
    `;

    return { vertex, fragment };
};

export default FrostedGlassShaders;
