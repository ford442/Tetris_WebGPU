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
            shockwaveParams: vec4<f32>, // x: width, y: strength, z: aberration, w: speed
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

            // Shockwave Logic
            var shockwaveAberration = 0.0;
            if (time > 0.0 && time < 1.0) {
                let dist = distance(uv, center);
                let radius = time * 1.5; // Expanding radius
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

            // Global Chromatic Aberration (Glitch + Shockwave + Edge Vignette)
            let distFromCenter = distance(uv, vec2<f32>(0.5));
            // Subtle permanent aberration at edges for arcade feel
            let vignetteAberration = pow(distFromCenter, 3.0) * 0.015;
            let baseAberration = select(vignetteAberration, distFromCenter * 0.03, useGlitch > 0.5);
            let totalAberration = baseAberration + shockwaveAberration;

            var r = textureSample(myTexture, mySampler, finalUV + vec2<f32>(totalAberration, 0.0)).r;
            var g = textureSample(myTexture, mySampler, finalUV).g;
            var b = textureSample(myTexture, mySampler, finalUV - vec2<f32>(totalAberration, 0.0)).b;
            let a = textureSample(myTexture, mySampler, finalUV).a;

            // Bloom-ish boost (cheap)
            var color = vec3<f32>(r, g, b);
            let luminance = dot(color, vec3<f32>(0.299, 0.587, 0.114));
            // Lower threshold slightly and boost intensity for neon pop
            // Threshold lowered to 0.6 to catch more block colors, intensity boosted
            if (luminance > 0.6) {
                color += color * 0.4;
            }

            // Vignette darken
            let vignette = 1.0 - smoothstep(0.5, 1.5, distFromCenter);
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
        };
        @binding(0) @group(0) var<uniform> uniforms : Uniforms;

        struct VertexOutput {
            @builtin(position) Position : vec4<f32>,
            @location(0) color : vec4<f32>,
            @location(1) uv : vec2<f32>,
        };

        @vertex
        fn main(
            @location(0) particlePosRot : vec4<f32>, // xyz + rot
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

            // Rotate the quad logic
            let angle = particlePosRot.w;
            let c = cos(angle);
            let s = sin(angle);
            let rotatedPos = vec2<f32>(
                pos.x * c - pos.y * s,
                pos.x * s + pos.y * c
            );

            // Billboarding
            let worldPos = particlePosRot.xyz + vec3<f32>(rotatedPos * particleScale, 0.0);

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

            return vec4<f32>(hueShift * 2.5, finalAlpha); // Boost brightness
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
            return vec4<f32>(1.0, 1.0, 1.0, 0.15); // Slightly more visible grid
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
        };
        @binding(0) @group(0) var<uniform> uniforms: Uniforms;

        @fragment
        fn main(@location(0) vUV: vec2<f32>) -> @location(0) vec4<f32> {
          let time = uniforms.time * 0.3; // Slower, calmer animation
          let level = uniforms.level;
          let uv = vUV;

          // Modify parameters based on level
          // Level 1: Calm blue
          // Level 10: Chaotic red
          let levelFactor = min(level * 0.1, 1.0);

          // Base deep space color - shifts to red as level increases
          let deepSpace = mix(vec3<f32>(0.02, 0.01, 0.08), vec3<f32>(0.05, 0.0, 0.0), levelFactor);

          // --- Multi-layer perspective grid ---
          var grid = 0.0;
          // Four layers of grids at different scales for depth
          for (var layer: i32 = 0; layer < 4; layer++) {
            let layer_f = f32(layer);
            let scale = exp2(layer_f); // 1.0, 2.0, 4.0, 8.0
            // Speed increases with level
            let speed = (0.1 + layer_f * 0.05) * (1.0 + levelFactor * 2.0);

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

          // --- Vignette effect to focus on center ---
          let vignette = 1.0 - smoothstep(0.4, 1.2, length(uv - 0.5));
          finalColor *= vignette;

          // --- Starfield ---
          // Simple procedural stars
          let starPos = uv * 2.0; // Scale up
          // Parallax movement for stars
          let starScroll = vec2<f32>(time * 0.1, time * 0.05);
          let starNoise = fract(sin(dot(starPos + starScroll, vec2<f32>(12.9898, 78.233))) * 43758.5453);
          var star = 0.0;
          if (starNoise > 0.99) {
             // Blink
             let blink = sin(time * 5.0 + starNoise * 100.0) * 0.5 + 0.5;
             star = (starNoise - 0.99) * 100.0 * blink;
          }

          // --- Subtle film grain for texture ---
          let noise = fract(sin(dot(uv, vec2<f32>(12.9898, 78.233))) * 43758.5453);
          finalColor += (noise - 0.5) * 0.03;

          finalColor += vec3<f32>(star);

          return vec4<f32>(finalColor, 1.0);
        }
    `;

    return { vertex, fragment };
};

export const Shaders = () => {
  let params: any = {};
  // define default input values:
  params.color = "(0.0, 1.0, 0.0)";
  params.ambientIntensity = "0.6"; // Brighter ambient for better visibility
  params.diffuseIntensity = "1.0";
  params.specularIntensity = "3.0"; // Very glossy
  params.shininess = "300.0"; // Extremely sharp, like polished gemstone
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
                output.vNormal   =  uniforms.normalMatrix*normal;
                output.Position  = uniforms.viewProjectionMatrix * mPosition;
                output.vColor   =  uniforms.colorVertex;
                output.vUV = uv;
                return output;
            }`;

  const fragment = `
            struct Uniforms {
                lightPosition : vec4<f32>,
                eyePosition : vec4<f32>,
                color : vec4<f32>,
                time : f32, // Offset 48
                useGlitch: f32, // Offset 52
                lockPercent: f32, // Offset 56 (Lock Delay visual feedback)
            };
            @binding(1) @group(0) var<uniform> uniforms : Uniforms;

            @fragment
            fn main(@location(0) vPosition: vec4<f32>, @location(1) vNormal: vec4<f32>,@location(2) vColor: vec4<f32>, @location(3) vUV: vec2<f32>) ->  @location(0) vec4<f32> {
               
                var N:vec3<f32> = normalize(vNormal.xyz);
                let L:vec3<f32> = normalize(uniforms.lightPosition.xyz - vPosition.xyz);
                let V:vec3<f32> = normalize(uniforms.eyePosition.xyz - vPosition.xyz);
                let H:vec3<f32> = normalize(L + V);

                // --- Improved Lighting Model ---
                let diffuse:f32 = max(dot(N, L), 0.0);

                // Sharp specular for "glassy" look
                var specular:f32 = pow(max(dot(N, H), 0.0), ${params.shininess});

                // Add secondary broad specular for "glossy plastic"
                specular += pow(max(dot(N, H), 0.0), 32.0) * 0.2;

                let ambient:f32 = ${params.ambientIntensity};

                var baseColor = vColor.xyz;

                // --- Clean Modern Glass Style ---

                // Pulse effect
                let time = uniforms.time;
                let sineWave = sin(time * 2.0 + vPosition.y * 0.5 + vPosition.x * 0.5);
                let pulsePos = pow(sineWave * 0.5 + 0.5, 4.0); // Softer pulse

                // Surface finish (Frosted Glass Noise) - Reduced noise for cleaner look
                let noise = fract(sin(dot(vUV, vec2<f32>(12.9898, 78.233))) * 43758.5453);

                // Bevel/Edge detection
                let uvEdgeDistX = abs(vUV.x - 0.5) * 2.0;
                let uvEdgeDistY = abs(vUV.y - 0.5) * 2.0;
                let uvEdgeDist = max(uvEdgeDistX, uvEdgeDistY);

                // Smooth rounded bevel
                let bevel = smoothstep(0.8, 0.95, uvEdgeDist);

                // Inner "Core" Glow
                let coreGlow = 1.0 - smoothstep(0.0, 0.6, length(vUV - 0.5));

                // Apply texture/finish
                // Add subtle grain to base color (Reduced)
                baseColor += (noise - 0.5) * 0.05;

                // Add inner glow (Boosted)
                baseColor += vColor.rgb * coreGlow * 0.8;

                // Add self-emission (based on color brightness) - Boosted
                let emission = vColor.rgb * 0.4 + vColor.rgb * pulsePos * 0.2; // Pulsing emission
                baseColor += emission;

                // --- Composition ---
                var finalColor:vec3<f32> = baseColor * (ambient + diffuse) + vec3<f32>${params.specularColor} * specular;

                // Add bevel highlight
                finalColor += vec3<f32>(1.0) * bevel * 0.5;

                // --- Fresnel Rim Light (Glassy Look with Chromatism) ---
                let fresnelTerm = pow(1.0 - max(dot(N, V), 0.0), 3.0); // Sharper Fresnel for glass

                // Chromatic/Iridescent rim shift
                // Shift color slightly based on view angle for crystal effect
                let iridAngle = dot(N, V) * 3.14159;
                let iridColor = vec3<f32>(
                    sin(iridAngle) * 0.5 + 0.5,
                    sin(iridAngle + 2.09) * 0.5 + 0.5,
                    sin(iridAngle + 4.18) * 0.5 + 0.5
                );

                let rimColor = mix(vColor.rgb, iridColor, 0.3); // Subtle iridescence

                finalColor += rimColor * fresnelTerm * 2.5;

                // --- Edge Highlight (Sharp Wireframe feel) ---
                let edgeGlow = smoothstep(0.92, 0.98, uvEdgeDist);
                finalColor += vec3<f32>(1.0) * edgeGlow * 0.8;

                // --- Lock Warning Effect ---
                // Pulse Red when lock percent > 0.5
                let lockPercent = uniforms.lockPercent;
                if (lockPercent > 0.5) {
                    let warningPulse = sin(time * 20.0) * 0.5 + 0.5;
                    let warningColor = vec3<f32>(1.0, 0.0, 0.0);
                    let warningStrength = (lockPercent - 0.5) * 2.0 * warningPulse * 0.5;
                    finalColor = mix(finalColor, warningColor, warningStrength);
                }

                // --- GHOST PIECE RENDERING ---
                // Ghost piece alpha < 0.4
                if (vColor.w < 0.4) {
                    // Simple, clean ghost
                    let wire = edgeGlow;

                    // Holographic scanline effect
                    let scanPos = vPosition.y * 15.0 + time * 8.0;
                    let scanline = sin(scanPos) * 0.5 + 0.5;
                    // Sharp lines
                    scanline = pow(scanline, 4.0);

                    // Vertical Glitch
                    var glitchOffset = 0.0;
                    if (fract(time * 2.0) > 0.95) {
                        glitchOffset = sin(vPosition.y * 50.0) * 0.02;
                    }

                    // Landing Beam Effect (Vertical highlight in center)
                    let beam = max(0.0, 1.0 - abs(vPosition.x - round(vPosition.x)) * 4.0);

                    // Add a filled body with low alpha
                    let body = 0.05 + scanline * 0.3 + beam * 0.2; // Brighter on scanline & beam

                    let ghostColor = mix(vColor.rgb, vec3<f32>(0.4, 0.9, 1.0), 0.6); // Cyber Cyan tint

                    var finalGhost = ghostColor * wire * 3.0; // Bright wireframe (Boosted)
                    finalGhost += vColor.rgb * body; // Subtle body fill

                    // Pulse
                    let pulse = 0.8 + 0.2 * sin(time * 4.0);

                    // Add digital glitch noise to ghost
                    let ghostNoise = fract(sin(dot(vUV + time + glitchOffset, vec2<f32>(12.9898, 78.233))) * 43758.5453);
                    if (ghostNoise > 0.97) {
                        finalGhost += vec3<f32>(0.6); // Glitch flash
                    }

                    return vec4<f32>(finalGhost, pulse * 0.6); // Slightly clearer
                }

                // --- Transparency ---
                // Base alpha is high for "Solid Glass" feel
                let baseAlpha = vColor.w;
                // Edges are fully opaque
                let finalAlpha = max(baseAlpha, edgeGlow);

                return vec4<f32>(finalColor, finalAlpha);
            }`;

  return {
    vertex,
    fragment,
  };
};
