
export const BackgroundShaders = () => {
    const vertex = `
        struct Output {
            @builtin(position) Position : vec4<f32>,
            @location(0) vUV : vec2<f32>,
        };

        @vertex
        fn main(@location(0) position: vec3<f32>) -> Output {
            var output: Output;
            output.Position = vec4<f32>(position, 1.0);
            output.vUV = position.xy * 0.5 + 0.5;
            return output;
        }
    `;

    const fragment = `
        struct Uniforms {
            time: f32,
            level: f32,
            padding: vec2<f32>,
            resolution: vec2<f32>,
            color1: vec3<f32>,
            color2: vec3<f32>,
            color3: vec3<f32>,
        };
        @binding(0) @group(0) var<uniform> uniforms: Uniforms;

        @fragment
        fn main(@location(0) vUV: vec2<f32>) -> @location(0) vec4<f32> {
          let levelFactor = clamp(uniforms.level / 20.0, 0.0, 1.0);
          // Speed increases with level
          let time = uniforms.time * (0.3 + levelFactor * 0.5);
          let uv = vUV;
          let deepSpace = vec3<f32>(0.02, 0.01, 0.08);

          var grid = 0.0;
          for (var layer: i32 = 0; layer < 4; layer++) {
            let layer_f = f32(layer);
            let scale = exp2(layer_f);

            // Grid moves faster and more chaotically at higher levels
            let speed = (0.1 + layer_f * 0.05) * (1.0 + levelFactor * 1.5);

            let perspectiveOffset = vec2<f32>(
              sin(time * speed) * (0.05 + layer_f * 0.02),
              cos(time * speed * 0.8) * (0.05 + layer_f * 0.02)
            );

            let gridUV = (uv - 0.5) * scale + perspectiveOffset;

            let lineWidth = 0.02 / scale;
            let gridX = smoothstep(0.5 - lineWidth, 0.5, abs(fract(gridUV.x) - 0.5));
            let gridY = smoothstep(0.5 - lineWidth, 0.5, abs(fract(gridUV.y) - 0.5));

            let layerGrid = (1.0 - gridX * gridY) * (1.0 - layer_f * 0.2);
            grid = max(grid, layerGrid);
          }

          let colorCycle = sin(time * 0.5) * 0.5 + 0.5;
          let neonCyan = uniforms.color1;
          let neonPurple = uniforms.color2;
          let neonBlue = uniforms.color3;

          var gridColor = mix(neonCyan, mix(neonPurple, neonBlue, colorCycle), colorCycle);

          // Inject "Danger" Red as level increases
          let dangerColor = vec3<f32>(1.0, 0.0, 0.2);
          gridColor = mix(gridColor, dangerColor, levelFactor * 0.6);

          var lights = vec3<f32>(0.0);
          for (var i: i32 = 0; i < 3; i++) {
            let idx = f32(i);
            let angle = time * (0.3 + idx * 0.2) + idx * 2.094;
            let radius = 0.25 + idx * 0.1;
            let lightPos = vec2<f32>(
              0.5 + cos(angle) * radius,
              0.5 + sin(angle) * radius
            );

            let dist = length(uv - lightPos);
            let intensity = 0.08 / (dist * dist + 0.01);
            let lightColor = mix(neonCyan, neonPurple, sin(time + idx) * 0.5 + 0.5);
            lights += lightColor * intensity;
          }

          let pulse = sin(time * 1.5) * 0.15 + 0.85;

          var finalColor = deepSpace;
          finalColor = mix(finalColor, gridColor * pulse, grid * 0.6);
          finalColor += lights;

          let vignette = 1.0 - smoothstep(0.4, 1.2, length(uv - 0.5));
          finalColor *= vignette;

          let noise = fract(sin(dot(uv, vec2<f32>(12.9898, 78.233))) * 43758.5453);
          finalColor += (noise - 0.5) * 0.03;

          return vec4<f32>(finalColor, 1.0);
        }
    `;

    return { vertex, fragment };
};
