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
            warpSurge: f32, // Offset 52
        };
        @binding(0) @group(0) var<uniform> uniforms : Uniforms;
        @binding(1) @group(0) var mySampler: sampler;
        @binding(2) @group(0) var myTexture: texture_2d<f32>;

        @fragment
        fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
            // Lens Distortion (Barrel)
            let centeredUV = uv - 0.5;
            let distSq = dot(centeredUV, centeredUV);
            let distortStrength = 0.1; // K factor
            let distortedUV = 0.5 + centeredUV * (1.0 + distSq * distortStrength);

            var finalUV = distortedUV;
            let inBounds = (distortedUV.x >= 0.0 && distortedUV.x <= 1.0 && distortedUV.y >= 0.0 && distortedUV.y <= 1.0);

            // Shockwave
            let center = uniforms.shockwaveCenter;
            let time = uniforms.shockwaveTime;
            let glitchStrength = uniforms.useGlitch; // Treated as intensity
            let params = uniforms.shockwaveParams;
            let level = uniforms.level;

            // Shockwave Logic
            var shockwaveAberration = 0.0;
            if (time > 0.0 && time < 1.0) {
                let dist = distance(uv, center);
                // NEON BRICKLAYER: Use speed from params.w
                let speed = max(params.w, 0.1);
                let radius = time * speed;
                let width = params.x * 1.5; // JUICE: Wider shockwave
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

                // Second ring (Echo) - NEON BRICKLAYER
                let echoRadius = radius * 0.8;
                let echoDiff = abs(dist - echoRadius);
                if (echoDiff < width * 0.5) {
                    let angle = (echoDiff / (width * 0.5)) * 3.14159;
                    let distortion = cos(angle) * strength * 0.5 * (1.0 - time);
                    let dir = normalize(uv - center);
                    finalUV -= dir * distortion;
                }

                // Third ring (Ripple)
                let echoRadius2 = radius * 0.6;
                let echoDiff2 = abs(dist - echoRadius2);
                if (echoDiff2 < width * 0.5) {
                    let angle = (echoDiff2 / (width * 0.5)) * 3.14159;
                    let distortion = cos(angle) * strength * 0.25 * (1.0 - time);
                    let dir = normalize(uv - center);
                    finalUV -= dir * distortion;
                }
            }

            // Global Chromatic Aberration (Glitch + Shockwave + Edge Vignette + Level Stress)
            let distFromCenter = distance(uv, vec2<f32>(0.5));
            // Subtle permanent aberration at edges for arcade feel
            // JUICE: Increased lens distortion at edges
            let vignetteAberration = pow(distFromCenter, 2.5) * 0.02;

            // Level based aberration: Starts calm, gets glitchy at high levels
            // Level 10+ = max stress
            let levelStress = clamp(level / 12.0, 0.0, 1.0);
            let levelAberration = levelStress * 0.008 * sin(uniforms.time * 2.0); // Breathing aberration

            // NEON BRICKLAYER: Enhanced Glitch Logic
            // Dynamic offset based on intensity, time, and Y position
            let glitchOffset = glitchStrength * 0.05 * sin(finalUV.y * 50.0 + uniforms.time * 20.0);
            // Tear effect: Random horizontal strips
            let tear = step(0.95, fract(finalUV.y * 2.0 + uniforms.time * 10.0)) * glitchStrength * 0.05;
            finalUV.x += tear;

            let baseAberration = vignetteAberration + levelAberration;
            // Add glitch aberration
            let glitchAberration = glitchStrength * 0.03;
            let totalAberration = baseAberration + shockwaveAberration + glitchAberration;

            // Chromatic Aberration with Glitch Offset
            // R and B channels get offset by the glitch wave in opposite directions
            // JUICE: Vertical aberration added for lens effect (scaled by UV y)
            let vertAberration = totalAberration * (uv.y - 0.5) * 0.2;

            var r = textureSample(myTexture, mySampler, finalUV + vec2<f32>(totalAberration + glitchOffset, vertAberration)).r;
            var g = textureSample(myTexture, mySampler, finalUV).g;
            var b = textureSample(myTexture, mySampler, finalUV - vec2<f32>(totalAberration + glitchOffset, vertAberration)).b;
            let a = textureSample(myTexture, mySampler, finalUV).a;

            // Bloom-ish boost (cheap but juicy)
            var color = vec3<f32>(r, g, b);

            // NEON BRICKLAYER: Enhanced Glow (Tent Filter + Wide Spread)
            // Sample 8 points for a smoother, wider halo
            // JUICE: Wider spread (Increased base offset)
            let offset = 0.008 * (1.0 + levelStress * 0.8);
            let offset2 = offset * 2.2; // Even wider outer ring
            var glow = vec3<f32>(0.0);

            // Inner Ring
            glow += textureSample(myTexture, mySampler, finalUV + vec2<f32>(offset, offset)).rgb;
            glow += textureSample(myTexture, mySampler, finalUV + vec2<f32>(-offset, offset)).rgb;
            glow += textureSample(myTexture, mySampler, finalUV + vec2<f32>(offset, -offset)).rgb;
            glow += textureSample(myTexture, mySampler, finalUV + vec2<f32>(-offset, -offset)).rgb;

            // Outer Ring (Diagonal)
            glow += textureSample(myTexture, mySampler, finalUV + vec2<f32>(0.0, offset2)).rgb;
            glow += textureSample(myTexture, mySampler, finalUV + vec2<f32>(0.0, -offset2)).rgb;
            glow += textureSample(myTexture, mySampler, finalUV + vec2<f32>(offset2, 0.0)).rgb;
            glow += textureSample(myTexture, mySampler, finalUV + vec2<f32>(-offset2, 0.0)).rgb;

            glow *= 0.125; // Average of 8 samples

            // Thresholding the glow
            let glowLum = dot(glow, vec3<f32>(0.299, 0.587, 0.114));
            let bloomThreshold = 0.20; // JUICE: Even lower threshold for maximum neon
            if (glowLum > bloomThreshold) {
                 color += glow * 4.0; // JUICE: Maximum bloom intensity
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

            // NEON BRICKLAYER: Warp Surge Flash
            let warpSurge = uniforms.warpSurge;
            if (warpSurge > 0.01) {
                let invert = vec3<f32>(1.0) - color;
                color = mix(color, invert, clamp(warpSurge * 0.8, 0.0, 0.8));
            }

            // Scanlines
            let scanline = sin(finalUV.y * 800.0 + uniforms.time * 10.0) * 0.04;
            color -= vec3<f32>(scanline);

            if (!inBounds) {
                return vec4<f32>(0.0, 0.0, 0.0, 1.0);
            }

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
            @location(2) lifeRatio : f32,
        };

        @vertex
        fn main(
            @location(0) particlePos : vec3<f32>,
            @location(1) particleColor : vec4<f32>,
            @location(2) particleScale : f32,
            @location(3) particleLife : f32,
            @location(4) particleMaxLife : f32,
            @location(5) particleVel : vec3<f32>,
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

            // Velocity Stretching (Neon Sparks)
            // If particle is moving fast, stretch it along the velocity vector
            let speed = length(particleVel);
            var vOffset = vec3<f32>(pos * particleScale, 0.0);

            if (speed > 0.5) { // JUICE: Threshold lowered
                 let dir = normalize(particleVel);
                 let right = normalize(cross(dir, vec3<f32>(0.0, 0.0, 1.0)));
                 let stretch = 1.0 + speed * 0.1; // JUICE: More stretch
                 vOffset = (right * pos.x * particleScale * 0.5) + (dir * pos.y * particleScale * stretch);
            }

            let worldPos = particlePos + vOffset;

            output.Position = uniforms.viewProjectionMatrix * vec4<f32>(worldPos, 1.0);
            output.color = particleColor;
            output.uv = uv;
            // Calculate normalized life (1.0 = born, 0.0 = dead)
            output.lifeRatio = clamp(particleLife / max(particleMaxLife, 0.001), 0.0, 1.0);

            return output;
        }
    `;

    const fragment = `
        struct Uniforms {
            viewProjectionMatrix : mat4x4<f32>,
            time : f32,
        };
        @binding(0) @group(0) var<uniform> uniforms : Uniforms;

        @fragment
        fn main(@location(0) color : vec4<f32>, @location(1) uv : vec2<f32>, @location(2) lifeRatio : f32) -> @location(0) vec4<f32> {
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
            // Fade out as life decreases (lifeRatio goes 1 -> 0)
            // But keep core bright until the very end
            let alpha = intensity + core * 0.5 + sparkle * 0.8;
            let finalAlpha = clamp(alpha * color.a * smoothstep(0.0, 0.2, lifeRatio), 0.0, 1.0);

            // Color Shift:
            // Hot White/Yellow at birth -> Theme Color -> Darker/Cooler at death
            let hotColor = vec3<f32>(1.0, 1.0, 0.8); // Hot white-yellow
            let baseColor = color.rgb;

            // Mix based on life
            // lifeRatio 1.0 -> 0.8 : Hot -> Base
            // lifeRatio 0.8 -> 0.0 : Base
            let mixFactor = smoothstep(0.8, 1.0, lifeRatio);
            var finalColor = mix(baseColor, hotColor, mixFactor);

            // JUICE: Pulse alpha for "alive" particles, sped up by low life
            // Pulse faster when dying
            let pulseSpeed = 20.0 + (1.0 - lifeRatio) * 30.0;
            let pulse = 0.8 + 0.2 * sin(uv.x * pulseSpeed);

            // Neon Flicker (JUICE)
            // High frequency chaos for electrical look
            let flicker = 0.5 + 0.5 * sin(uniforms.time * 120.0 + uv.x * 20.0);

            // Boost brightness for neon effect
            return vec4<f32>(finalColor * 5.0 * lifeRatio, finalAlpha * pulse * flicker);
        }
    `;

    return { vertex, fragment };
};

export const GridShader = () => {
    const vertex = `
        struct Uniforms {
            viewProjectionMatrix : mat4x4<f32>,
            time : f32, // Offset 64
            ghostX : f32, // Offset 68
            ghostWidth : f32, // Offset 72
            warpSurge : f32, // Offset 76
        };
        @binding(0) @group(0) var<uniform> uniforms : Uniforms;

        struct VertexOutput {
            @builtin(position) Position : vec4<f32>,
            @location(0) vPos : vec3<f32>,
        };

        @vertex
        fn main(@location(0) position : vec3<f32>) -> VertexOutput {
            var output : VertexOutput;
            var pos = position;

            // NEON BRICKLAYER: Grid Ripple on Impact (Boosted)
            if (uniforms.warpSurge > 0.01) {
                let wave = sin(pos.x * 0.8 + uniforms.time * 15.0) * uniforms.warpSurge * 2.5;
                pos.y += wave;
            }

            output.Position = uniforms.viewProjectionMatrix * vec4<f32>(pos, 1.0);
            output.vPos = pos;
            return output;
        }
    `;
    const fragment = `
        struct Uniforms {
            viewProjectionMatrix : mat4x4<f32>,
            time : f32,
            ghostX : f32,
            ghostWidth : f32,
            warpSurge : f32,
        };
        @binding(0) @group(0) var<uniform> uniforms : Uniforms;

        @fragment
        fn main(@location(0) vPos : vec3<f32>) -> @location(0) vec4<f32> {
            // Pulse the grid lines (ENHANCED)
            let pulse = sin(uniforms.time * 3.0) * 0.5 + 0.5;
            var alpha = 0.2 + pulse * 0.3; // Stronger, more visible pulse
            var color = vec3<f32>(1.0, 1.0, 1.0);

            // Distance Fade (Fog)
            let center = vec2<f32>(10.0, -20.0);
            let distFromCenter = length(vPos.xy - center);
            let fade = 1.0 - smoothstep(15.0, 30.0, distFromCenter);
            alpha *= fade;

            // NEON BRICKLAYER: Ghost Landing Zone
            // Check if we are within the ghost width range
            let dist = abs(vPos.x - uniforms.ghostX);
            let halfWidth = uniforms.ghostWidth * 0.5;

            // Highlight zone
            if (dist < halfWidth) {
                 // Pulse the landing zone
                 let zonePulse = sin(uniforms.time * 15.0) * 0.5 + 0.5;
                 alpha += 1.0 + zonePulse * 0.5; // More dynamic pulse
                 // Add a subtle gradient to the zone
                 let zoneGrad = 1.0 - (dist / halfWidth);
                 alpha *= (0.5 + zoneGrad * 0.5);

                 color = vec3<f32>(0.0, 1.0, 1.0); // Cyan glow
            }

            return vec4<f32>(color, alpha);
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
              let warpStrength = (levelFactor * 0.3 + warpSurge * 0.15) * sin(uniforms.time * 2.0);
              uv -= normalize(uv - center) * warpStrength * dist;
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
            let warpSpeed = 1.0 + level * 1.0 + warpSurge * 3.0;
            let speed = (0.1 + layer_f * 0.05) * warpSpeed;

            // Perspective offset for each layer
            let perspectiveOffset = vec2<f32>(
              sin(time * speed) * (0.05 + layer_f * 0.02),
              cos(time * speed * 0.8) * (0.05 + layer_f * 0.02)
            );

            // NEON BRICKLAYER: Grid Distortion from Warp Surge
            let surgeDistortion = sin(uv.y * 20.0 + time * 10.0) * warpSurge * 0.05;
            let gridUV = (uv - 0.5 + vec2<f32>(surgeDistortion, 0.0)) * scale + perspectiveOffset;

            // Smooth grid lines that get thinner with distance
            let lineWidth = 0.03 / scale;
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
          let dangerColor = vec3<f32>(1.0, 0.0, 0.3); // Neon Red
          // Shift aggressively with level
          neonCyan = mix(neonCyan, dangerColor, min(levelFactor * 1.5, 1.0));
          neonBlue = mix(neonBlue, vec3<f32>(0.4, 0.0, 0.6), min(levelFactor * 1.2, 1.0)); // Deep Purple

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

export const Shaders = () => {
    let params: any = {};
    params.color = "(0.0, 1.0, 0.0)";
    params.ambientIntensity = "0.5";
    params.diffuseIntensity = "1.0";
    params.specularIntensity = "50.0";
    params.shininess = "1000.0";
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
                level: f32,       // Offset 60
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

                // Level Evolution
                let level = uniforms.level;
                let levelFactor = min(level * 0.1, 1.0); // 0 to 1 over 10 levels

                // Lighting
                let diffuse:f32 = max(dot(N, L), 0.0);

                // JUICE: Sharpness increases with level (Glassier)
                let shininessBoost = 1.0 + levelFactor * 2.0;
                var specular:f32 = pow(max(dot(N, H), 0.0), ${params.shininess} * shininessBoost);
                specular += pow(max(dot(N, H), 0.0), 32.0 * shininessBoost) * 0.2;
                let ambient:f32 = ${params.ambientIntensity};

                // --- TEXTURE SAMPLING ---
                // Flip Y for correct image orientation
                var texUV = vec2<f32>(vUV.x, 1.0 - vUV.y);

                // Glitch Offset
                if (uniforms.useGlitch > 0.0) {
                     let glitchStrength = uniforms.useGlitch;
                     let glitchOffset = glitchStrength * 0.05 * sin(texUV.y * 50.0 + uniforms.time * 20.0);
                     texUV.x += glitchOffset;
                }

                let texColor = textureSample(blockTexture, blockSampler, texUV);
                
                // Simple approach: show texture with very subtle color influence
                // 80% texture, 20% block color tint
                var baseColor = mix(texColor.rgb, vColor.rgb * texColor.rgb, 0.2);
                
                // Fixed alpha for now - solid blocks
                let materialAlpha = 0.9;

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
                // JUICE: Inner pulse frequency scales with level (Heartbeat)
                let pulseFreq = 5.0 + level * 0.5;
                // ENHANCED: Stronger, more vibrant inner pulse (Boosted)
                let innerPulse = sin(time * pulseFreq * 1.2) * (0.8 + level * 0.08);
                finalColor += vColor.rgb * (breath + innerPulse);

                // ENHANCED: Rim Lighting for better definition (Wider and Brighter)
                let rimLight = pow(1.0 - max(dot(N, V), 0.0), 5.0) * 3.0;
                finalColor += vColor.rgb * rimLight;

                if (isTrace > 0.5) {
                    finalColor += vColor.rgb * pulsePos * 4.0;
                }

                // Fresnel (Boosted for Glass look)
                // JUICE: Sharper falloff for distinct neon rim
                // Clamp bases to 0.0 to avoid NaN in pow()
                let dotNV = max(dot(N, V), 0.0);
                let baseFresnel = pow(1.0 - dotNV, 4.0);
                let fresnelTerm = baseFresnel; // Alias for legacy code

                // NEON BRICKLAYER: Diamond Refraction (Real Dispersion)
                // Shift the fresnel curve for each channel based on level
                let dispersion = 0.3 * levelFactor;

                let fR = pow(max(0.0, 1.0 - dotNV * (1.0 - dispersion)), 4.0);
                let fG = baseFresnel;
                let fB = pow(max(0.0, 1.0 - dotNV * (1.0 + dispersion)), 4.0);

                var irid = vec3<f32>(fR, fG, fB);

                // Add iridescence (oil slick) on top
                irid += vec3<f32>(
                    sin(baseFresnel * 10.0 + time) * 0.5 + 0.5,
                    cos(baseFresnel * 10.0 + time) * 0.5 + 0.5,
                    sin(baseFresnel * 15.0 + time) * 0.5 + 0.5
                ) * 0.5;

                finalColor += irid * (3.0 + levelFactor * 4.0); // JUICE: Stronger rim

                // Edge Glow
                let uvEdgeDist = max(abs(vUV.x - 0.5), abs(vUV.y - 0.5)) * 2.0;
                let edgeGlow = smoothstep(0.85, 1.0, uvEdgeDist); // Wider edge
                finalColor += vec3<f32>(1.0) * edgeGlow * (1.0 + levelFactor);

                // Lock Tension Pulse (Heartbeat & Alarm)
                let lockPercent = uniforms.lockPercent;
                if (lockPercent > 0.0) {
                     // NEON BRICKLAYER: Full range pulse, but subtle at first
                     let tension = smoothstep(0.0, 1.0, lockPercent);

                     // Heartbeat rhythm: faster as it gets closer to 1.0
                     let beatSpeed = 4.0 + tension * 60.0; // JUICE: Even faster panic mode
                     let pulse = sin(time * beatSpeed) * 0.5 + 0.5;
                     let sharpPulse = pow(pulse, 2.0 + tension * 4.0); // Sharper as it gets critical

                     // Digital Grid Scan Effect (Digitizing in/out)
                     // Scanline that moves up/down based on pulse
                     let scanY = fract(vUV.y * 10.0 + time * 5.0);
                     let scanLine = step(0.9, scanY) * tension * sharpPulse;

                     // Mix to Warning Red
                     let warningColor = vec3<f32>(1.0, 0.0, 0.2); // Cyberpunk Red
                     finalColor = mix(finalColor, warningColor, tension * sharpPulse * 1.0);

                     // Add Scanline Emission
                     finalColor += warningColor * scanLine * 3.0;
                }

                // Subtle Surface Noise (Texture)
                let noise = fract(sin(dot(vUV, vec2<f32>(12.9898, 78.233))) * 43758.5453);
                finalColor += vec3<f32>(noise) * 0.03;

                // Ghost Piece Logic
                if (vColor.w < 0.4) {
                    // Hologram Effect - High Tech (ENHANCED)
                    let scanSpeed = 8.0;
                    // INCREASED Frequency: 20.0 -> 30.0
                    let scanY = fract(vUV.y * 30.0 - time * scanSpeed);
                    // ENHANCED: Sharper, more visible scanline
                    let scanline = smoothstep(0.0, 0.1, scanY) * (1.0 - smoothstep(0.9, 1.0, scanY)) * 2.0;

                    // Landing Beam (Vertical Highlight)
                    let beam = smoothstep(0.5, 0.0, abs(vUV.x - 0.5));

                    // Wireframe logic (from edgeGlow)
                    let wireframe = smoothstep(0.9, 0.95, uvEdgeDist);

                    let ghostColor = vColor.rgb * 1.5; // Brighten original color

                    // NEON BRICKLAYER: Tension-based pulse
                    let tension = smoothstep(0.5, 1.0, lockPercent);
                    let pulseFreq = 8.0 + tension * 15.0; // Speed up significantly when locking

                    // ENHANCED Pulse: Slower, fuller
                    let ghostAlpha = 0.6 + 0.2 * sin(time * pulseFreq);

                    // Holographic Scanline
                    let scanEffect = sin(vUV.y * 50.0 + time * 5.0) * 0.1;

                    // NEW Glitch effect (Reacts to tension)
                    let glitchAmp = 0.02 + tension * 0.05;
                    let ghostGlitch = sin(vUV.y * 50.0 + time * (20.0 + tension * 50.0)) * glitchAmp;

                    var ghostFinal = ghostColor * wireframe * 5.0  // Bright edges
                                   + ghostColor * scanline * 0.5   // Scanlines
                                   + ghostColor * beam * 0.5       // Landing Beam
                                   + vec3<f32>(0.5, 0.8, 1.0) * fresnelTerm * 2.0; // Blue-ish rim

                    ghostFinal += vec3<f32>(ghostGlitch); // Add glitch to color
                    ghostFinal += vec3<f32>(scanEffect); // Add scanline overlay

                    // Digital noise/flicker
                    let noise = fract(sin(dot(vUV, vec2<f32>(12.9898, 78.233)) + time) * 43758.5453);
                    if (noise > 0.95) {
                        ghostFinal += vec3<f32>(1.0); // Sparkle
                    }

                    return vec4<f32>(ghostFinal, ghostAlpha);
                }

                // Combine material alpha with block type alpha (solid=0.85, ghost=0.3)
                let finalAlpha = materialAlpha * vColor.w;
                return vec4<f32>(finalColor, finalAlpha);
            }`;

    return { vertex, fragment };
};
