export function VideoBackgroundShaders() {
  return {
    vertex: `
      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) uv: vec2<f32>
      };

      @vertex
      fn main(@location(0) position: vec3<f32>) -> VertexOutput {
        var output: VertexOutput;
        output.position = vec4<f32>(position, 1.0);
        output.uv = position.xy * 0.5 + vec2<f32>(0.5, 0.5);
        return output;
      }
    `,
    fragment: `
      @group(0) @binding(0) var videoSampler: sampler;
      @group(0) @binding(1) var videoTex: texture_external;

      struct FragmentInput {
        @location(0) uv: vec2<f32>
      };

      @fragment
      fn main(input: FragmentInput) -> @location(0) vec4<f32> {
        let color = textureSampleBaseClampToEdge(videoTex, videoSampler, input.uv);
        return color;
      }
    `
  };
}
