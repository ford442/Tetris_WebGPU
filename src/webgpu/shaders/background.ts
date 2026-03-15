/**
 * Background Shaders
 * Procedural animated backgrounds and video background rendering.
 */

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
            output.vUV = position.xy * 0.5 + 0.5; // Map -1..1 to 0..1
            return output;
        }
    `;

    const fragment = `
        struct Uniforms {
            time: f32,
            level: f32, // Offset 4
            resolution: vec2<f32>, // Offset 8 (align 8)
            color1: vec3<f32>, // Offset 16 (align 16)
            color2: vec3<f32>, // Offset 32
            color3: vec3<f32>, // Offset 48
            lockPercent: f32, // Offset 64
            warpSurge: f32, // Offset 68
            ghostX: f32, // Offset 72 (UV space)
            ghostWidth: f32, // Offset 76 (UV width)
        };
        @binding(0) @group(0) var<uniform> uniforms: Uniforms;

        @fragment
        fn main(@location(0) vUV: vec2<f32>) -> @location(0) vec4<f32> {
          let time = uniforms.time * 0.3; // Slower, calmer animation
          let level = uniforms.level;
          let lockPercent = uniforms.lockPercent;
          let warpSurge = uniforms.warpSurge;
          var uv = vUV;

          // Modify parameters based on level
          // Level 1: Calm blue
          // Level 10: Chaotic red
          // JUICE: Faster ramp up to "danger" colors (max at level 8)
          let levelFactor = min(level * 0.125, 1.0);

          // Base deep space color - shifts to red as level increases
          // NEON BRICKLAYER: More dramatic shift from Calm Blue to Chaotic Red/Purple
          let deepSpace = mix(vec3<f32>(0.05, 0.0, 0.15), vec3<f32>(0.25, 0.0, 0.05), levelFactor);

          // NEON BRICKLAYER: HYPERSPACE TUNNEL DISTORTION
          // Warps the UVs towards the center as level increases
          if (levelFactor > 0.0 || warpSurge > 0.0) {
              let center = vec2<f32>(0.5, 0.5);
              let dist = distance(uv, center);
              // JUICE: Increased warp strength for higher levels
              // Stronger wobble at high levels
              let wobble = sin(uniforms.time * (2.0 + levelFactor * 5.0));

              // BOOSTED: Add rotation to the tunnel for more disorientation/speed feel
              if (warpSurge > 0.0) {
                  let angle = warpSurge * 0.1 * sin(time * 5.0);
                  let c = cos(angle);
                  let s = sin(angle);
                  let centered = uv - center;
                  uv = center + vec2<f32>(centered.x * c - centered.y * s, centered.x * s + centered.y * c);
              }

              // Smoothed and clamped warp strength to prevent nausea
              // BOOSTED: Increased max warp
              let warpStrength = clamp((levelFactor * 0.5 + warpSurge * 0.25) * wobble, -0.4, 0.4);
              uv -= normalize(uv - center) * warpStrength * dist * dist; // Quadratic warp for "tunnel" feel
          }

          // NEON BRICKLAYER: Parallax Starfield
          var stars = 0.0;
          for (var i: i32 = 0; i < 3; i++) {
              let fi = f32(i);
              let scale = 40.0 + fi * 20.0; // Different scales for depth
              let speed = (0.2 + fi * 0.1) * (1.0 + level * 0.5 + warpSurge * 2.0); // Speed scales with level

              // Shift UVs over time
              let shift = vec2<f32>(0.0, -time * speed * 0.1);
              let starUV = uv * scale + shift;

              // Random noise
              let noise = fract(sin(dot(starUV, vec2<f32>(12.9898 + fi, 78.233 + fi))) * 43758.5453);

              // High threshold for sparse stars
              let threshold = 0.98;
              if (noise > threshold) {
                  let brightness = (noise - threshold) / (1.0 - threshold);
                  // Twinkle
                  let twinkle = sin(time * 5.0 + noise * 100.0) * 0.5 + 0.5;

                  // ENHANCED: Star Streaks at high warp
                  if (warpSpeed > 5.0) {
                       brightness *= (1.0 + (warpSpeed - 5.0) * 0.2); // Brighter
                  }

                  stars += brightness * twinkle * (0.5 + fi * 0.2);
              }
          }

          // --- Multi-layer perspective grid ---
          var grid = 0.0;
          // Four layers of grids at different scales for depth
          for (var layer: i32 = 0; layer < 4; layer++) {
            let layer_f = f32(layer);
            let scale = exp2(layer_f); // 1.0, 2.0, 4.0, 8.0

            // NEON BRICKLAYER: WARP SPEED
            // Speed increases significantly with level to simulate warp acceleration
            // JUICE: Uncapped speed based on raw level (Boosted)
            let warpSpeed = 1.0 + level * 2.0 + warpSurge * 8.0;
            let speed = (0.1 + layer_f * 0.05) * warpSpeed;

            // Perspective offset for each layer
            let perspectiveOffset = vec2<f32>(
              sin(time * speed) * (0.05 + layer_f * 0.02),
              cos(time * speed * 0.8) * (0.05 + layer_f * 0.02)
            );

            // NEON BRICKLAYER: Grid Distortion from Warp Surge (Doubled intensity)
            let surgeDistortion = sin(uv.y * 20.0 + time * 15.0) * warpSurge * 0.1;
            let gridUV = (uv - 0.5 + vec2<f32>(surgeDistortion, 0.0)) * scale + perspectiveOffset;

            // Smooth grid lines that get thinner with distance, but thicker with warp surge
            let lineWidth = (0.04 + warpSurge * 0.1) / scale;
            let gridX = smoothstep(0.5 - lineWidth, 0.5, abs(fract(gridUV.x) - 0.5));
            let gridY = smoothstep(0.5 - lineWidth, 0.5, abs(fract(gridUV.y) - 0.5));

            // Combine X and Y lines, fade distant layers
            let layerGrid = (1.0 - gridX * gridY) * (1.0 - layer_f * 0.2);
            grid = max(grid, layerGrid);
          }

          // --- Dynamic neon color palette ---
          // Cycle through cyberpunk colors
          let colorCycle = sin(time * 0.5) * 0.5 + 0.5;

          // Bias colors towards red/purple at high levels
          var neonCyan = uniforms.color1;
          var neonPurple = uniforms.color2;
          var neonBlue = uniforms.color3;

          // Manual mix for level influence (mix towards red/orange) (ENHANCED)
          let dangerColor = vec3<f32>(1.0, 0.0, 0.2); // Cyberpunk Red
          let warningColor = vec3<f32>(1.0, 0.5, 0.0); // Orange

          // Shift aggressively with level
          // Level 0-5: Blue/Cyan -> Purple
          // Level 5-10: Purple -> Red/Orange

          if (level > 5.0) {
               // High Level: Shift to Red/Orange
               let highLevelFactor = min((level - 5.0) * 0.2, 1.0);
               neonCyan = mix(neonCyan, dangerColor, highLevelFactor);
               neonBlue = mix(neonBlue, vec3<f32>(0.3, 0.0, 0.0), highLevelFactor); // Dark Red
               neonPurple = mix(neonPurple, warningColor, highLevelFactor * 0.7);
          } else {
               // Low Level: Shift to Purple
               let lowLevelFactor = min(level * 0.2, 1.0);
               // ENHANCED: More vibrant shift
               neonCyan = mix(neonCyan, vec3<f32>(0.0, 0.8, 1.0), lowLevelFactor); // Brighter cyan
               neonBlue = mix(neonBlue, vec3<f32>(0.4, 0.0, 1.0), lowLevelFactor); // Brighter purple/blue
          }

          let gridColor = mix(neonCyan, mix(neonPurple, neonBlue, colorCycle), colorCycle);

          // --- Multiple orbiting light sources ---
          var lights = vec3<f32>(0.0);
          for (var i: i32 = 0; i < 3; i++) {
            let idx = f32(i);
            let angle = time * (0.3 + idx * 0.2) + idx * 2.094; // 120° separation
            let radius = 0.25 + idx * 0.1;
            let lightPos = vec2<f32>(
              0.5 + cos(angle) * radius,
              0.5 + sin(angle) * radius
            );

            // Quadratic falloff for realistic lighting
            let dist = length(uv - lightPos);
            let intensity = 0.08 / (dist * dist + 0.01);

            // Each light has a different color
            let lightColor = mix(neonCyan, neonPurple, sin(time + idx) * 0.5 + 0.5);
            lights += lightColor * intensity;
          }

          // --- Global pulse effect ---
          // Pulse faster at higher levels
          let pulseSpeed = 2.0 + levelFactor * 4.0;
          let pulse = sin(time * pulseSpeed) * 0.15 + 0.85;

          // Combine all elements
          var finalColor = deepSpace;
          finalColor += vec3<f32>(stars); // NEON BRICKLAYER: Add stars
          finalColor = mix(finalColor, gridColor * pulse, grid * 0.6);
          finalColor += lights;

          // --- Lock Tension (Pulse Red) ---
          // Pulse gets faster and more intense as lockPercent approaches 1.0
          if (lockPercent > 0.0) {
             let tensionPulse = sin(time * (10.0 + lockPercent * 20.0)) * 0.5 + 0.5;
             let redFlash = vec3<f32>(1.0, 0.0, 0.0) * lockPercent * tensionPulse * 0.3;
             finalColor += redFlash;
          }

          // --- Vignette effect to focus on center ---
          let vignette = 1.0 - smoothstep(0.4, 1.2, length(uv - 0.5));
          finalColor *= vignette;

          // --- Subtle film grain for texture ---
          let noise = fract(sin(dot(uv, vec2<f32>(12.9898, 78.233))) * 43758.5453);
          finalColor += (noise - 0.5) * 0.03;

          // Warp Surge Flash
          finalColor += vec3<f32>(1.0) * warpSurge * 0.1;

          // NEON BRICKLAYER: Hyper-Inversion
          finalColor = mix(finalColor, vec3<f32>(1.0) - finalColor, clamp(warpSurge * 0.5, 0.0, 1.0));

          // NEON BRICKLAYER: Ghost Projection Beam
          // Vertical beam indicating the drop zone
          let ghostX = uniforms.ghostX;
          let ghostW = uniforms.ghostWidth;

          if (ghostW > 0.0) {
              // Calculate distance to beam center
              let distToBeam = abs(uv.x - ghostX);
              let beamWidth = ghostW * 0.6; // Slightly wider than the piece

              if (distToBeam < beamWidth) {
                  // Soft edge for the beam
                  let beamEdge = smoothstep(beamWidth, 0.0, distToBeam);

                  // Vertical scan effect within the beam
                  let beamScan = sin(uv.y * 50.0 - time * 20.0) * 0.1 + 0.9;

                  // Pulse with tension/time
                  let beamPulse = sin(time * 5.0) * 0.1 + 0.9;

                  // Intensity fades at the top
                  let beamFade = smoothstep(0.0, 0.8, uv.y);

                  // Combine
                  var beamColor = vec3<f32>(0.0, 1.0, 1.0); // Cyan
                  // Mix with warning color if lockPercent is high
                  if (lockPercent > 0.5) {
                      beamColor = mix(beamColor, vec3<f32>(1.0, 0.0, 0.2), (lockPercent - 0.5) * 2.0);
                  }

                  // BOOSTED Intensity
                  let beamIntensity = 0.25 * beamEdge * beamScan * beamPulse * beamFade;
                  finalColor += beamColor * beamIntensity;
              }
          }

          return vec4<f32>(finalColor, 1.0);
        }
    `;

    return { vertex, fragment };
};
