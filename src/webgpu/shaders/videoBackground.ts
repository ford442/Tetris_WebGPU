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
        // Flip Y: NDC has +1 at top, textures have 0 at top
        output.uv = vec2<f32>(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
        return output;
      }
    `,
    fragment: `
      @group(0) @binding(0) var videoSampler: sampler;
      @group(0) @binding(1) var videoTex: texture_external;
      // xy = UV scale that crops the video to a "cover" fit (preserves aspect ratio).
      @group(0) @binding(2) var<uniform> coverScale: vec4<f32>;

      struct FragmentInput {
        @location(0) uv: vec2<f32>
      };

      @fragment
      fn main(input: FragmentInput) -> @location(0) vec4<f32> {
        let uv = (input.uv - 0.5) * coverScale.xy + 0.5;
        let color = textureSampleBaseClampToEdge(videoTex, videoSampler, uv);
        return color;
      }
    `
  };
}
