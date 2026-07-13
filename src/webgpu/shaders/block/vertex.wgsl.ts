/**
 * Block vertex shader — shared across all production themes.
 */

export const BLOCK_VERTEX_SHADER_WGSL = `
struct VertexUniforms {
    viewProjectionMatrix : mat4x4<f32>,
    modelMatrix          : mat4x4<f32>,
    normalMatrix         : mat4x4<f32>,
    colorVertex          : vec4<f32>
};
@binding(0) @group(0) var<uniform> vUniforms : VertexUniforms;

struct VertexOutput {
    @builtin(position) Position : vec4f,
    @location(0) vWorldPos      : vec4f,
    @location(1) vNormal        : vec3f,
    @location(2) vColor         : vec4f,
    @location(3) vUV            : vec2f
};

@vertex
fn main(
    @location(0) position : vec4<f32>,
    @location(1) normal   : vec4<f32>,
    @location(2) uv       : vec2<f32>
) -> VertexOutput {
    var out: VertexOutput;
    let worldPos         = vUniforms.modelMatrix * position;
    out.vWorldPos        = worldPos;
    out.vNormal          = (vUniforms.normalMatrix * normal).xyz;
    out.Position         = vUniforms.viewProjectionMatrix * worldPos;
    out.vColor           = vUniforms.colorVertex;
    out.vUV              = uv;
    return out;
}
`;
