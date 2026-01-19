/**
 * WebGPU Shader Modules
 * Contains all shader code for the Tetris WebGPU renderer
 */

export const PostProcessShaders = () => {
    const vertex = `
        struct VertexOutput {
            @builtin(position) Position : vec4<f32>,
            @location(0) uv : vec2<f32>,
        };

        @vertex
        fn main(@location(0) position : vec3<f32>) -> VertexOutput {
            var output : VertexOutput;
            output.Position = vec4<f32>(position, 1.0);
            output.uv = position.xy * 0.5 + 0.5;
            output.uv.y = 1.0 - output.uv.y; // Flip Y for texture sampling
            return output;
        }
    `;

    const fragment = `
        struct Uniforms {
            time: f32,
            useGlitch: f32,
            shockwaveCenter: vec2<f32>,
            shockwaveTime: f32,
            // Align to 16 bytes for next field if needed, but here we just flow
            // offset 0: time(4), 4: useGlitch(4), 8: center(8) -> 16
            // offset 16: shockwaveTime(4), pad(12) -> 32
            // offset 32: shockwaveParams(16) -> 48
            // offset 48: level(4)
            shockwaveParams: vec4<f32>, // x: width, y: strength, z: aberration, w: speed
            level: f32,
        };
        @binding(0) @group(0) var<uniform> uniforms : Uniforms;
        @binding(1) @group(0) var mySampler: sampler;
        @binding(2) @group(0) var myTexture: texture_2d<f32>;

        @fragment
        fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
            var finalUV = uv;

            // Shockwave
            let center = uniforms.shockwaveCenter;
            let time = uniforms.shockwaveTime;
            let useGlitch = uniforms.useGlitch;
            let params = uniforms.shockwaveParams;
            let level = uniforms.level;

            // Shockwave Logic
            var shockwaveAberration = 0.0;
            if (time > 0.0 && time < 1.0) {
                let dist = distance(uv, center);
                let radius = time * 2.0; // Faster expansion for snap
                let width = params.x; // e.g. 0.1
                let strength = params.y; // e.g. 0.05
                let diff = dist - radius;

                if (abs(diff) < width) {
                    // Cosine wave for smooth ripple
                    let angle = (diff / width) * 3.14159;
                    let distortion = cos(angle) * strength * (1.0 - time); // Fade out
                    let dir = normalize(uv - center);

                    finalUV -= dir * distortion;

                    // Add chromatic aberration at the edge of the shockwave
                    shockwaveAberration = params.z * (1.0 - abs(diff)/width) * (1.0 - time);
                }
            }

            // Global Chromatic Aberration (Glitch + Shockwave + Edge Vignette + Level Stress)
            let distFromCenter = distance(uv, vec2<f32>(0.5));
            // Subtle permanent aberration at edges for arcade feel
            let vignetteAberration = pow(distFromCenter, 3.0) * 0.015;

            // Level based aberration: Starts calm, gets glitchy at high levels
            // Level 10+ = max stress
            let levelStress = clamp(level / 12.0, 0.0, 1.0);
            let levelAberration = levelStress * 0.008 * sin(uniforms.time * 2.0); // Breathing aberration

            let baseAberration = select(vignetteAberration + levelAberration, distFromCenter * 0.03, useGlitch > 0.5);
            let totalAberration = baseAberration + shockwaveAberration;

            var r = textureSample(myTexture, mySampler, finalUV + vec2<f32>(totalAberration, 0.0)).r;
            var g = textureSample(myTexture, mySampler, finalUV).g;
            var b = textureSample(myTexture, mySampler, finalUV - vec2<f32>(totalAberration, 0.0)).b;
            let a = textureSample(myTexture, mySampler, finalUV).a;

            // Bloom-ish boost (cheap but juicy)
            var color = vec3<f32>(r, g, b);

            // NEON BRICKLAYER: "Tent Filter" Blur for cheap single-pass glow
            // Sample 4 diagonals to create a soft halo
            let offset = 0.003 * (1.0 + levelStress * 0.5); // Blur radius increases with stress
            var glow = vec3<f32>(0.0);
            glow += textureSample(myTexture, mySampler, finalUV + vec2<f32>(offset, offset)).rgb;
            glow += textureSample(myTexture, mySampler, finalUV + vec2<f32>(-offset, offset)).rgb;
            glow += textureSample(myTexture, mySampler, finalUV + vec2<f32>(offset, -offset)).rgb;
            glow += textureSample(myTexture, mySampler, finalUV + vec2<f32>(-offset, -offset)).rgb;
            glow *= 0.25;

            // Thresholding the glow
            let glowLum = dot(glow, vec3<f32>(0.299, 0.587, 0.114));
            let bloomThreshold = 0.5;
            if (glowLum > bloomThreshold) {
                 color += glow * 0.6; // Add glow on top
            }

            // High-pass boost for the core pixels
            let luminance = dot(color, vec3<f32>(0.299, 0.587, 0.114));
            if (luminance > 0.6) {
                 color += color * 0.4;
            }

            // Vignette darken (pulsing with beat)
            let beat = sin(uniforms.time * 8.0) * 0.5 + 0.5;
            let vignetteSize = 1.5 - (beat * 0.05 * levelStress);
            let vignette = 1.0 - smoothstep(0.5, vignetteSize, distFromCenter);
            color *= vignette;

            return vec4<f32>(color, a);
        }
    `;

    return { vertex, fragment };
};

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
        };

        @vertex
        fn main(
            @location(0) particlePos : vec3<f32>,
            @location(1) particleColor : vec4<f32>,
            @location(2) particleScale : f32,
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

            // Billboarding: Align with camera plane (simple XY approximation for this fixed view)
            // For a true billboard in a perspective camera, we'd need the camera Up/Right vectors,
            // but since the camera is mostly fixed looking at Z, this works reasonably well.
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
            let dist = length(uv - 0.5) * 2.0; // 0 at center, 1 at edge
            if (dist > 1.0) {
                discard;
            }

            // "Hot Core" effect
            // Intense center, rapid falloff
            let intensity = exp(-dist * 4.0); // Sharper core

            // Sparkle shape (star)
            let uvCentered = abs(uv - 0.5);
            // Rotate UV 45 degrees for second cross
            let rot = 0.7071;
            let uvr = vec2<f32>(
                uvCentered.x * rot - uvCentered.y * rot,
                uvCentered.x * rot + uvCentered.y * rot
            );
            let uvrCentered = abs(uvr);

            // Create a soft glowing core
            let core = exp(-length(uv - 0.5) * 5.0);

            // Create sharp rays
            let cross1 = max(1.0 - smoothstep(0.0, 0.1, uvCentered.x), 1.0 - smoothstep(0.0, 0.1, uvCentered.y));
            let cross2 = max(1.0 - smoothstep(0.0, 0.1, uvrCentered.x), 1.0 - smoothstep(0.0, 0.1, uvrCentered.y));

            let sparkle = max(cross1, cross2 * 0.5);

            // Combine
            let alpha = intensity + core * 0.5 + sparkle * 0.8;
            let finalAlpha = clamp(alpha * color.a, 0.0, 1.0);

            // Add a slight hue shift based on life for variety
            let hueShift = color.rgb * (1.0 + 0.2 * sin(uv.x * 10.0));

            // JUICE: Pulse alpha for "alive" particles
            let pulse = 0.8 + 0.2 * sin(uv.x * 20.0); // Reverted to avoid uniform dependency issue

            return vec4<f32>(hueShift * 3.0, finalAlpha * pulse); // Boost brightness
        }
    `;

    return { vertex, fragment };
};

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
            return vec4<f32>(1.0, 1.0, 1.0, 0.15); // Increased visibility for neon look
        }
    `;
    return { vertex, fragment };
};

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
        };
        @binding(0) @group(0) var<uniform> uniforms: Uniforms;

        @fragment
        fn main(@location(0) vUV: vec2<f32>) -> @location(0) vec4<f32> {
          let time = uniforms.time * 0.3; // Slower, calmer animation
          let level = uniforms.level;
          let lockPercent = uniforms.lockPercent;
          let uv = vUV;

          // Modify parameters based on level
          // Level 1: Calm blue
          // Level 10: Chaotic red
          // JUICE: Faster ramp up to "danger" colors (max at level 8)
          let levelFactor = min(level * 0.125, 1.0);

          // Base deep space color - shifts to red as level increases
          // JUICE: More dramatic shift from Calm Blue to Chaotic Red
          let deepSpace = mix(vec3<f32>(0.0, 0.05, 0.15), vec3<f32>(0.1, 0.0, 0.0), levelFactor);

          // --- Multi-layer perspective grid ---
          var grid = 0.0;
          // Four layers of grids at different scales for depth
          for (var layer: i32 = 0; layer < 4; layer++) {
            let layer_f = f32(layer);
            let scale = exp2(layer_f); // 1.0, 2.0, 4.0, 8.0

            // NEON BRICKLAYER: WARP SPEED
            // Speed increases significantly with level to simulate warp acceleration
            let warpSpeed = 1.0 + levelFactor * 8.0;
            let speed = (0.1 + layer_f * 0.05) * warpSpeed;

            // Perspective offset for each layer
            let perspectiveOffset = vec2<f32>(
              sin(time * speed) * (0.05 + layer_f * 0.02),
              cos(time * speed * 0.8) * (0.05 + layer_f * 0.02)
            );

            let gridUV = (uv - 0.5) * scale + perspectiveOffset;

            // Smooth grid lines that get thinner with distance
            let lineWidth = 0.02 / scale;
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

          // Manual mix for level influence (mix towards red/orange)
          let dangerColor = vec3<f32>(1.0, 0.2, 0.0);
          neonCyan = mix(neonCyan, dangerColor, levelFactor * 0.5);
          neonBlue = mix(neonBlue, vec3<f32>(0.5, 0.0, 0.0), levelFactor * 0.8);

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
          let pulseSpeed = 1.5 + levelFactor * 3.0;
          let pulse = sin(time * pulseSpeed) * 0.15 + 0.85;

          // Combine all elements
          var finalColor = deepSpace;
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

          return vec4<f32>(finalColor, 1.0);
        }
    `;

    return { vertex, fragment };
};

export const Shaders = () => {
  let params: any = {};
  params.color = "(0.0, 1.0, 0.0)";
  params.ambientIntensity = "0.5";
  params.diffuseIntensity = "1.0";
  params.specularIntensity = "2.5";
  params.shininess = "256.0";
  params.specularColor = "(1.0, 1.0, 1.0)";
  params.isPhong = "1";

  const vertex = `
            struct Uniforms {
                viewProjectionMatrix : mat4x4<f32>,
                modelMatrix : mat4x4<f32>,
                normalMatrix : mat4x4<f32>,  
                colorVertex : vec4<f32>              
            };
            @binding(0) @group(0) var<uniform> uniforms : Uniforms;

            struct Output {
                @builtin(position) Position : vec4<f32>,
                @location(0) vPosition : vec4<f32>,
                @location(1) vNormal : vec4<f32>,
                @location(2) vColor : vec4<f32>,
                @location(3) vUV : vec2<f32>
            };
          
            @vertex
            fn main(@location(0) position: vec4<f32>, @location(1) normal: vec4<f32>, @location(2) uv: vec2<f32>) -> Output {
                var output: Output;
                let mPosition:vec4<f32> = uniforms.modelMatrix * position;
                output.vPosition = mPosition;
                output.vNormal   = uniforms.normalMatrix * normal;
                output.Position  = uniforms.viewProjectionMatrix * mPosition;
                output.vColor    = uniforms.colorVertex;
                output.vUV       = uv;
                return output;
            }`;

  const fragment = `
            struct Uniforms {
                lightPosition : vec4<f32>,
                eyePosition : vec4<f32>,
                color : vec4<f32>,
                time : f32,
                useGlitch: f32,
                lockPercent: f32, // Offset 56
            };
            @binding(1) @group(0) var<uniform> uniforms : Uniforms;
            @binding(2) @group(0) var blockTexture: texture_2d<f32>;
            @binding(3) @group(0) var blockSampler: sampler;

            @fragment
            fn main(@location(0) vPosition: vec4<f32>, @location(1) vNormal: vec4<f32>,@location(2) vColor: vec4<f32>, @location(3) vUV: vec2<f32>) ->  @location(0) vec4<f32> {
               
                var N:vec3<f32> = normalize(vNormal.xyz);
                let L:vec3<f32> = normalize(uniforms.lightPosition.xyz - vPosition.xyz);
                let V:vec3<f32> = normalize(uniforms.eyePosition.xyz - vPosition.xyz);
                let H:vec3<f32> = normalize(L + V);

                // Lighting
                let diffuse:f32 = max(dot(N, L), 0.0);
                var specular:f32 = pow(max(dot(N, H), 0.0), ${params.shininess});
                specular += pow(max(dot(N, H), 0.0), 32.0) * 0.2;
                let ambient:f32 = ${params.ambientIntensity};

                // --- TEXTURE SAMPLING ---
                // Flip Y for correct image orientation
                let texUV = vec2<f32>(vUV.x, 1.0 - vUV.y);
                let texColor = textureSample(blockTexture, blockSampler, texUV);

                // Multiply texture with block color (modulate)
                // Use the texture's alpha if needed, or assume opaque
                var baseColor = vColor.rgb * texColor.rgb;

                // --- Tech Pattern Overlay (Optional - kept for style) ---
                let hexScale = 4.0;
                let uvHex = vUV * hexScale;
                let r = vec2<f32>(1.0, 1.73);
                let h = r * 0.5;
                let a = (uvHex - r * floor(uvHex / r)) - h;
                let b = ((uvHex - h) - r * floor((uvHex - h) / r)) - h;
                let guv = select(b, a, dot(a, a) < dot(b, b));
                let hexEdge = smoothstep(0.45, 0.5, length(guv));

                let uvScale = 3.0;
                let uvGrid = vUV * uvScale;
                let gridPos = fract(uvGrid);
                let gridThick = 0.05;
                let lineX = step(1.0 - gridThick, gridPos.x) + step(gridPos.x, gridThick);
                let lineY = step(1.0 - gridThick, gridPos.y) + step(gridPos.y, gridThick);
                let isTrace = max(lineX, lineY);

                if (hexEdge > 0.5) { baseColor *= 0.8; } // JUICE: More contrast
                if (isTrace > 0.5) { baseColor *= 0.5; }

                // --- Composition ---
                var finalColor:vec3<f32> = baseColor * (ambient + diffuse) + vec3<f32>${params.specularColor} * specular;

                // Emissive
                let time = uniforms.time;
                let sineWave = sin(time * 3.0 + vPosition.y * 0.5 + vPosition.x * 0.5);
                let pulsePos = pow(sineWave * 0.5 + 0.5, 8.0);

                // Global breathing for all blocks
                let breath = sin(time * 2.0) * 0.1 + 0.1;
                finalColor += vColor.rgb * breath;

                if (isTrace > 0.5) {
                    finalColor += vColor.rgb * pulsePos * 4.0;
                }

                // Fresnel (Boosted for Glass look)
                // JUICE: Softer falloff (2.5) for wider rim
                let fresnelTerm = pow(1.0 - max(dot(N, V), 0.0), 2.5);
                // Iridescent fresnel
                let irid = vec3<f32>(
                    sin(fresnelTerm * 10.0 + time) * 0.5 + 0.5,
                    cos(fresnelTerm * 10.0 + time) * 0.5 + 0.5,
                    1.0
                );
                finalColor += irid * fresnelTerm * 4.0; // JUICE: Stronger rim (3.0 -> 4.0)

                // Edge Glow
                let uvEdgeDist = max(abs(vUV.x - 0.5), abs(vUV.y - 0.5)) * 2.0;
                let edgeGlow = smoothstep(0.85, 1.0, uvEdgeDist); // Wider edge
                finalColor += vec3<f32>(1.0) * edgeGlow * 1.0;

                // Lock Tension Pulse (Heartbeat & Alarm)
                let lockPercent = uniforms.lockPercent;
                if (lockPercent > 0.0) {
                     // NEON BRICKLAYER: Full range pulse, but subtle at first
                     let tension = smoothstep(0.0, 1.0, lockPercent);

                     // Heartbeat rhythm: faster as it gets closer to 1.0
                     let beatSpeed = 4.0 + tension * 40.0;
                     let pulse = sin(time * beatSpeed) * 0.5 + 0.5;
                     let sharpPulse = pow(pulse, 2.0 + tension * 4.0); // Sharper as it gets critical

                     // Digital Grid Scan Effect (Digitizing in/out)
                     // Scanline that moves up/down based on pulse
                     let scanY = fract(vUV.y * 10.0 + time * 5.0);
                     let scanLine = step(0.9, scanY) * tension * sharpPulse;

                     // Mix to Warning Red
                     let warningColor = vec3<f32>(1.0, 0.0, 0.2); // Cyberpunk Red
                     finalColor = mix(finalColor, warningColor, tension * sharpPulse * 0.6);

                     // Add Scanline Emission
                     finalColor += warningColor * scanLine * 2.0;
                }

                // Ghost Piece Logic
                if (vColor.w < 0.4) {
                    // Hologram Effect - High Tech
                    let scanSpeed = 8.0;
                    let scanY = fract(vUV.y * 20.0 - time * scanSpeed);
                    let scanline = smoothstep(0.0, 0.2, scanY) * (1.0 - smoothstep(0.8, 1.0, scanY));

                    // Wireframe logic (from edgeGlow)
                    let wireframe = smoothstep(0.9, 0.95, uvEdgeDist);

                    let ghostColor = vColor.rgb * 1.5; // Brighten original color

                    // Pulsing Alpha
                    let ghostAlpha = 0.3 + 0.2 * sin(time * 10.0);

                    var ghostFinal = ghostColor * wireframe * 5.0  // Bright edges
                                   + ghostColor * scanline * 0.5   // Scanlines
                                   + vec3<f32>(0.5, 0.8, 1.0) * fresnelTerm * 2.0; // Blue-ish rim

                    // Digital noise/flicker
                    let noise = fract(sin(dot(vUV, vec2<f32>(12.9898, 78.233)) + time) * 43758.5453);
                    if (noise > 0.95) {
                        ghostFinal += vec3<f32>(1.0); // Sparkle
                    }

                    return vec4<f32>(ghostFinal, ghostAlpha);
                }

                return vec4<f32>(finalColor, 1.0);
            }`;

  return { vertex, fragment };
};
