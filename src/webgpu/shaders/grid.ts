
export const GridShader = () => {
    const vertex = `
        struct Uniforms {
            viewProjectionMatrix : mat4x4<f32>,
        };
        @binding(0) @group(0) var<uniform> uniforms : Uniforms;

        @vertex
        fn main(@location(0) position : vec3<f32>) -> @builtin(position) vec4<f32> {
            return uniforms.viewProjectionMatrix * vec4<f32>(position, 1.0);
        }
    `;
    const fragment = `
        @fragment
        fn main() -> @location(0) vec4<f32> {
            return vec4<f32>(1.0, 1.0, 1.0, 0.08);
        }
    `;
    return { vertex, fragment };
};
