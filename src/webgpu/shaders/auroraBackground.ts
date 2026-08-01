/**
 * Aurora Background Shader
 * Procedural moving aurora curtains using layered sine waves (green/cyan/violet).
 * Fullscreen quad for use as background in future theme.
 */

export function AuroraBackgroundShaders() {
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
        // Standard fullscreen mapping, Y flipped for texture-like UV
        output.uv = vec2<f32>(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
        return output;
      }
    `,
    fragment: `
      struct Uniforms {
        time: f32,
        // Additional params can be added later (e.g. intensity, speed multipliers)
      };
      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      @fragment
      fn main(@location(0) uvIn: vec2<f32>) -> @location(0) vec4<f32> {
        var uv = uvIn;
        let t = uniforms.time * 0.4;

        // Gentle overall vertical drift for the whole aurora
        uv.y += t * 0.03;

        var color = vec3<f32>(0.02, 0.03, 0.06); // Very dark night sky base

        // Layered aurora curtains - 4 sine layers with different freq/speed/phase/color
        // Colors: green -> cyan -> violet
        let layers = 4;
        for (var i: i32 = 0; i < layers; i++) {
          let fi = f32(i);
          // Horizontal frequency (curtain folds)
          let freqX = 1.8 + fi * 1.7;
          // Vertical "height" of the curtain band
          let freqY = 2.5 + fi * 0.8;

          // Animation speeds (different per layer for parallax/organic motion)
          let speed = 0.35 + fi * 0.22;

          // Amplitude of horizontal wave (how much the curtain "flows")
          let amp = 0.045 + fi * 0.012;

          // Phase offset per layer
          let phase = fi * 2.3;

          // Compute waving curtain position
          let wave = sin(uv.x * freqX + t * speed + phase) * amp +
                     sin(uv.x * (freqX * 0.6) - t * (speed * 1.3) + phase * 0.7) * (amp * 0.6);

          // Vertical position in the curtain stack
          let y = uv.y * freqY + wave + fi * 0.35 + t * (0.08 + fi * 0.03);

          // Thin bright bands + soft falloff = classic aurora "curtain" look
          let band = fract(y);
          let thickness = 0.22 - fi * 0.025;
          let intensity = smoothstep(0.0, thickness * 0.5, band) *
                          smoothstep(thickness, thickness * 0.4, band);

          // Color per layer (green -> cyan -> violet)
          var layerColor: vec3<f32>;
          if (i == 0) {
            layerColor = vec3<f32>(0.15, 0.72, 0.38); // Rich green
          } else if (i == 1) {
            layerColor = vec3<f32>(0.18, 0.78, 0.65); // Cyan-green
          } else if (i == 2) {
            layerColor = vec3<f32>(0.32, 0.55, 0.82); // Cyan-blue
          } else {
            layerColor = vec3<f32>(0.58, 0.28, 0.78); // Violet
          }

          // Add brightness variation along the wave for "living" feel
          let brightness = 0.7 + 0.3 * sin(uv.x * 7.0 + t * 2.5 + fi);
          color += layerColor * intensity * brightness * (0.9 - fi * 0.12);
        }

        // Subtle vertical streaking / rays for extra curtain realism
        let ray = abs(sin(uv.x * 35.0 + t * 1.8)) * 0.08 + 0.92;
        color *= ray;

        // Soft horizontal gradient (brighter near "horizon" / center of screen)
        let fade_val = abs(uv.x - 0.5) * 1.6;
        let horizFade = 1.0 - sqrt(fade_val * fade_val * fade_val);
        color *= 0.75 + horizFade * 0.5;

        // Very gentle vignette so aurora doesn't fight the playfield edges too much
        let centered_vig = uv - vec2<f32>(0.5, 0.5);
        let vig = 1.0 - sqrt(dot(centered_vig, centered_vig)) * 0.6;
        color *= clamp(vig, 0.65, 1.0);

        // Return with alpha so it can composite nicely over the dark clear or other elements
        return vec4<f32>(color, 0.72);
      }
    `
  };
}
