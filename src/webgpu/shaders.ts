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
            time: f32, // 0
            useGlitch: f32, // 4
            shockwaveCenter: vec2<f32>, // 8
            shockwaveTime: f32, // 16
            flashIntensity: f32, // 20
            padding: vec2<f32>, // 24
            shockwaveParams: vec4<f32>, // 32
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
                let radius = time * 1.5; // Slightly slower expansion for weight
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
            let vignetteAberration = pow(distFromCenter, 3.0) * 0.005; // Reduced static aberration
            let baseAberration = select(vignetteAberration, distFromCenter * 0.05, useGlitch > 0.5); // Stronger glitch
            let totalAberration = baseAberration + shockwaveAberration;

            // Permanent subtle Chromatic Aberration (Retro Lens)
            let caStrength = 0.003;
            let caOffset = (uv - 0.5) * caStrength;

            // RGB Shift
            var r = textureSample(myTexture, mySampler, finalUV + vec2<f32>(totalAberration, 0.0) - caOffset).r;
            var g = textureSample(myTexture, mySampler, finalUV).g;
            var b = textureSample(myTexture, mySampler, finalUV - vec2<f32>(totalAberration, 0.0) + caOffset).b;
            let a = textureSample(myTexture, mySampler, finalUV).a;

            // Bloom-ish boost (cheap)
            var color = vec3<f32>(r, g, b);
            let luminance = dot(color, vec3<f32>(0.299, 0.587, 0.114));

            // Enhanced Bloom: smoother threshold and tint
            if (luminance > 0.6) {
                let bloom = (luminance - 0.6) * 3.0; // Lower threshold, stronger bloom
                color += color * bloom;
            }

            // Vignette darken
            let vignette = 1.0 - smoothstep(0.5, 1.5, distFromCenter);
            color *= vignette;

            // Scanline effect (subtle)
            let scanline = sin(uv.y * 1200.0) * 0.03;
            color -= vec3<f32>(scanline);

            // Noise (Film grain)
            let noise = fract(sin(dot(uv, vec2<f32>(12.9898, 78.233))) * 43758.5453);
            color += (noise - 0.5) * 0.02;

            // Flash Effect
            color += vec3<f32>(uniforms.flashIntensity);

            return vec4<f32>(color, a);
        }
    `;

    return { vertex, fragment };
};

export const ParticleShaders = () => {
    const vertex = `
        struct Uniforms {
            viewProjectionMatrix : mat4x4<f32>,
            time : f32, // Offset 64
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

            // Dynamic Hue Shift
            let r = color.r;
            let g = color.g;
            let b = color.b;

            // Boost brightness for "HDR" look
            let boost = 1.5;

            return vec4<f32>(vec3<f32>(r,g,b) * boost, finalAlpha);
        }
    `;

    return { vertex, fragment };
};

export const GridShader = () => {
    const vertex = `
        struct Uniforms {
            viewProjectionMatrix : mat4x4<f32>,
            time : f32, // Offset 64
        };
        @binding(0) @group(0) var<uniform> uniforms : Uniforms;

        struct Output {
            @builtin(position) Position : vec4<f32>,
            @location(0) vPos : vec2<f32>,
        }

        @vertex
        fn main(@location(0) position : vec3<f32>) -> Output {
            var output: Output;
            output.Position = uniforms.viewProjectionMatrix * vec4<f32>(position, 1.0);
            output.vPos = position.xy;
            return output;
        }
    `;
    const fragment = `
        struct Uniforms {
            viewProjectionMatrix : mat4x4<f32>,
            time : f32, // Offset 64
            lockPercent: f32, // Offset 68
        };
        @binding(0) @group(0) var<uniform> uniforms : Uniforms;

        @fragment
        fn main(@location(0) vPos: vec2<f32>) -> @location(0) vec4<f32> {
             let time = uniforms.time;
             let lock = uniforms.lockPercent;

             // Base color - Electric Blue, shifts to Red with lock tension
             var color = mix(vec3<f32>(0.0, 0.9, 1.0), vec3<f32>(1.0, 0.0, 0.2), lock);

             // 1. Digital Scanline Pulse
             // Moves down the grid periodically
             // Speed increases with lock tension
             let scanSpeed = 0.5 + lock * 5.0;
             // Add a secondary pulse
             let pulseTime = time * scanSpeed;
             let scanPos = (vPos.y + 20.0) / 30.0 - fract(pulseTime); // Normalize 0..1
             let scan = exp(-pow(abs(scanPos), 2.0) * 100.0); // Sharp peak

             // Secondary fainter pulse
             let scanPos2 = (vPos.y + 20.0) / 30.0 - fract(pulseTime + 0.5);
             let scan2 = exp(-pow(abs(scanPos2), 2.0) * 50.0) * 0.5;

             // 2. Data Flow Effect
             // Small packets moving along lines
             let packet = sin(vPos.y * 1.0 + time * 5.0) * sin(vPos.x * 2.0) * 0.5 + 0.5;
             let flow = pow(packet, 8.0) * 2.0; // Isolate bright spots

             // 3. Vertical Fade
             let yNorm = (vPos.y + 20.0) / 30.0;
             let fade = smoothstep(0.0, 0.1, yNorm) * (1.0 - smoothstep(0.9, 1.0, yNorm));

             // 4. Floor Glow (Enhanced Retrowave)
             let floorGlow = smoothstep(0.7, 1.0, (vPos.y + 20.0) / 30.0); // Wider glow
             // Color shift for floor
             let floorColor = mix(vec3<f32>(0.0, 0.5, 1.0), vec3<f32>(1.0, 0.0, 1.0), sin(time * 0.5) * 0.5 + 0.5);
             color += floorColor * floorGlow * 1.5;

             // Combine
             let alpha = (0.1 + scan * 1.5 + scan2 * 0.8 + flow * 0.6) * fade;

             // Boost color where bright
             color += vec3<f32>(1.0) * (scan + scan2 + flow);

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
        };
        @binding(0) @group(0) var<uniform> uniforms: Uniforms;

        @fragment
        fn main(@location(0) vUV: vec2<f32>) -> @location(0) vec4<f32> {
          let time = uniforms.time * 0.5; // Slightly faster baseline
          let level = uniforms.level;
          let uv = vUV;

          // Intensity Ramping (Max intensity at Level 10)
          let levelFactor = min(level * 0.1, 1.0);

          // Deep Space Base
          let deepSpace = vec3<f32>(0.02, 0.01, 0.05);

          // --- Warp Tunnel Effect ---
          // Use radial coordinates
          let center = vec2<f32>(0.5);
          let dist = length(uv - center);
          let angle = atan2(uv.y - center.y, uv.x - center.x);

          // Spiral logic
          // Speed scales heavily with level
          let speed = 2.0 + levelFactor * 10.0;
          let spiral = sin(dist * 20.0 - time * speed + angle * 5.0);

          // Tunnel depth
          let tunnel = 1.0 / (dist + 0.1); // Gets bright in center

          // --- Dynamic Color Palette ---
          let c1 = uniforms.color1; // Cyan
          let c2 = uniforms.color2; // Purple
          let c3 = uniforms.color3; // Blue

          // Mix based on spiral
          var tunnelColor = mix(c1, c2, spiral * 0.5 + 0.5);

          // Shift to Red (Danger) as level increases
          let danger = vec3<f32>(1.0, 0.1, 0.1);
          tunnelColor = mix(tunnelColor, danger, levelFactor * 0.8);

          // Apply tunnel depth brightness
          let brightness = pow(tunnel * 0.05, 1.5);

          // --- Starfield (Warp Speed) ---
          // Radial stars coming from center
          let dir = normalize(uv - center);
          let starTime = time * (5.0 + levelFactor * 15.0); // Very fast at high levels
          // Simple trick: sample noise at dist + time
          let starNoise = fract(sin(dot(dir, vec2<f32>(12.9, 78.2))) * 43758.5);

          // Create "streaks"
          let streakLen = 0.1 + levelFactor * 0.3; // Longer streaks at speed
          let starPos = fract(dist * 2.0 - starTime); // Move outwards

          var stars = 0.0;
          if (abs(starPos - starNoise) < 0.01 && starNoise > 0.9) {
              stars = 1.0 * (dist * 2.0); // Brighter at edges
          }

          // --- Nebula Layer ---
          // Procedural noise for cloud-like structure
          let nTime = time * 0.2;
          let nUV = uv * 2.0;
          let noise1 = sin(nUV.x * 5.0 + nTime) * sin(nUV.y * 5.0 - nTime);
          let noise2 = cos(nUV.x * 3.0 - nTime * 0.5) * cos(nUV.y * 3.0 + nTime * 0.5);
          let nebulaMask = (noise1 + noise2) * 0.5 + 0.5; // 0..1

          // Deep purple/blue nebula color
          let nebulaColor = mix(vec3<f32>(0.2, 0.0, 0.4), vec3<f32>(0.0, 0.2, 0.5), uv.y);
          let nebula = nebulaColor * nebulaMask * 0.3 * (1.0 + levelFactor); // Brighter at higher levels

          // Combine
          var finalColor = deepSpace + tunnelColor * brightness * 2.0;
          finalColor += nebula;
          finalColor += vec3<f32>(stars);

          // Soft Vignette
          finalColor *= smoothstep(0.8, 0.2, dist);

          return vec4<f32>(finalColor, 1.0);
        }
    `;

    return { vertex, fragment };
};

export const Shaders = () => {
  let params: any = {};
  // define default input values:
  params.color = "(0.0, 1.0, 0.0)";
  params.ambientIntensity = "1.0"; // Even brighter ambient for neon look
  params.diffuseIntensity = "1.0";
  params.specularIntensity = "25.0"; // Increased specular for wet/glassy look
  params.shininess = "1000.0"; // Razor sharp
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

        struct GlobalUniforms {
            lightPosition : vec4<f32>,
            eyePosition : vec4<f32>,
            color : vec4<f32>, // Theme color?
            time : f32, // Offset 48
            useGlitch: f32, // Offset 52
            lockPercent: f32, // Offset 56
            flashIntensity: f32, // Offset 60
        };
        @binding(1) @group(0) var<uniform> global : GlobalUniforms;

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

                // Add vibration on lock
                var pos = position;
            let lock = global.lockPercent;
                if (lock > 0.0) {
                   // Vibrate x/z
               let time = global.time;
                   pos.x += sin(time * 50.0 + pos.y) * 0.05 * lock;
                   pos.z += cos(time * 40.0 + pos.x) * 0.05 * lock;
                }

                let mPosition:vec4<f32> = uniforms.modelMatrix * pos;
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
                flashIntensity: f32, // Offset 60
            };
            @binding(1) @group(0) var<uniform> uniforms : Uniforms;

            @fragment
            fn main(@location(0) vPosition: vec4<f32>, @location(1) vNormal: vec4<f32>,@location(2) vColor: vec4<f32>, @location(3) vUV: vec2<f32>) ->  @location(0) vec4<f32> {
               
                var N:vec3<f32> = normalize(vNormal.xyz);
                let L:vec3<f32> = normalize(uniforms.lightPosition.xyz - vPosition.xyz);
                let V:vec3<f32> = normalize(uniforms.eyePosition.xyz - vPosition.xyz);
                let H:vec3<f32> = normalize(L + V);
                let time = uniforms.time;

                // --- GHOST PIECE RENDERING (Early Exit) ---
                if (vColor.w < 0.4) {
                     // Holographic wireframe aesthetic
                    let uvEdgeDistX = abs(vUV.x - 0.5) * 2.0;
                    let uvEdgeDistY = abs(vUV.y - 0.5) * 2.0;
                    let edge = max(uvEdgeDistX, uvEdgeDistY);

                    // Sharp glowing edge
                    let wire = smoothstep(0.85, 0.95, edge);

                    // Scanline effect (Enhanced)
                    let scanPos = vPosition.y * 50.0 + time * 20.0; // Faster, denser
                    let scanline = sin(scanPos) * 0.5 + 0.5;

                    // Vertical "Landing Beam"
                    let beam = max(0.0, 1.0 - abs(vPosition.x - round(vPosition.x)) * 4.0);

                    // Glitch displacement
                    var glitchOffset = 0.0;
                    if (fract(time * 5.0) > 0.9) {
                        glitchOffset = sin(vPosition.y * 80.0) * 0.1;
                    }

                    // Base Ghost Color (Cyan/Blue tint)
                    let ghostBase = mix(vColor.rgb, vec3<f32>(0.0, 1.0, 1.0), 0.5);

                    // Add Digital Grid to Ghost
                    let gridScale = 10.0;
                    let gridX = abs(fract(vPosition.x * gridScale) - 0.5);
                    let gridY = abs(fract(vPosition.y * gridScale) - 0.5);
                    let grid = max(step(0.45, gridX), step(0.45, gridY));

                    var finalGhost = ghostBase * wire * 8.0; // Brighter edge
                    finalGhost += ghostBase * 0.8 * scanline; // Stronger scanline fill
                    finalGhost += ghostBase * 0.5 * grid; // Add grid
                    finalGhost += vec3<f32>(1.0) * beam * 0.5; // Landing beam
                    finalGhost += ghostBase * 0.2; // Base fill for better visibility

                    // Pulse opacity with digital flicker
                    let pulse = 0.6 + 0.4 * sin(time * 15.0); // Faster pulse, higher base opacity
                    let flicker = select(1.0, 0.8, sin(time * 60.0) > 0.0); // High frequency flicker

                    // Glitch flash
                    let noise = fract(sin(dot(vUV + time + glitchOffset, vec2<f32>(12.9, 78.2))) * 43758.5);
                    if (noise > 0.97) {
                        finalGhost = vec3<f32>(1.0);
                    }

                    return vec4<f32>(finalGhost, pulse * 0.6 * flicker);
                }


                // --- SOLID BLOCK RENDERING ---

                // --- Lighting ---
                let diffuse:f32 = max(dot(N, L), 0.0);

                // Sharp primary specular (Gem-like)
                var specular:f32 = pow(max(dot(N, H), 0.0), ${params.shininess});

                // Secondary "gloss" specular (Plastic/Glass coating)
                specular += pow(max(dot(N, H), 0.0), 64.0) * 0.5;

                let ambient:f32 = ${params.ambientIntensity};

                // --- Material Effects ---

                // 1. Inner Core Glow (Diamond shape)
                let centerDist = length(vUV - 0.5);
                let coreGlow = smoothstep(0.5, 0.0, centerDist); // Brightest at center

                // 2. Edge/Bevel Highlight
                let uvEdgeDistX = abs(vUV.x - 0.5) * 2.0;
                let uvEdgeDistY = abs(vUV.y - 0.5) * 2.0;
                let edgeMax = max(uvEdgeDistX, uvEdgeDistY);
                let bevel = smoothstep(0.8, 0.95, edgeMax);
                let rim = smoothstep(0.95, 1.0, edgeMax); // Very edge

                // 3. Surface Noise/Texture (Subtle frosted glass)
                let noise = fract(sin(dot(vUV, vec2<f32>(12.9898, 78.233))) * 43758.5453);

                // 4. Beat Pulse (reacts to time)
                let beat = sin(time * 3.0) * 0.5 + 0.5;
                let pulsingEmission = vColor.rgb * beat * 0.3;

                // --- Color Composition ---
                var baseColor = vColor.rgb;

                // Add inner pulse
                let innerPulse = sin(time * 2.0) * 0.1 + 0.1;
                baseColor += vec3<f32>(innerPulse);

                // Add inner glow
                baseColor += vColor.rgb * coreGlow * 0.8;

                // Apply lighting
                var finalColor:vec3<f32> = baseColor * (ambient + diffuse * 0.8) + vec3<f32>${params.specularColor} * specular;

                // Add Bevel
                finalColor += vec3<f32>(1.0) * bevel * 0.6;
                finalColor += vec3<f32>(1.0) * rim * 0.8; // Sharp white edge

                // --- Chromatic Dispersion / Refraction ---
                // Approximate dispersion by calculating Fresnel with slight offsets for R, G, B
                let viewAngle = max(dot(N, V), 0.0);
                let fR = pow(1.0 - viewAngle, 3.0);
                let fG = pow(1.0 - viewAngle, 3.1); // Slightly different power
                let fB = pow(1.0 - viewAngle, 3.2);

                let dispersionColor = vec3<f32>(fR, fG, fB);

                // Add pure white rim from average fresnel
                finalColor += dispersionColor * 2.0;

                // --- Lock Warning (Critical Tension) ---
                let lockPercent = uniforms.lockPercent;
                if (lockPercent > 0.0) {
                    // Flash frequency increases with tension
                    let flashFreq = 5.0 + lockPercent * 20.0;
                    let flash = sin(time * flashFreq) * 0.5 + 0.5;

                    // Mix to Red/White
                    let warningColor = mix(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(1.0, 1.0, 1.0), lockPercent * flash);

                    // Strength grows with lockPercent
                    let strength = smoothstep(0.0, 1.0, lockPercent) * flash;

                    finalColor = mix(finalColor, warningColor, strength * 1.0); // Stronger warning override
                }

                // --- Flash Intensity (Impact) ---
                let flashIntensity = uniforms.flashIntensity;
                if (flashIntensity > 0.0) {
                    finalColor = mix(finalColor, vec3<f32>(1.0, 1.0, 1.0), flashIntensity);
                }

                // Final alpha
                let finalAlpha = max(vColor.w, rim); // Rim is always opaque

                return vec4<f32>(finalColor, finalAlpha);
            }`;

  return {
    vertex,
    fragment,
  };
};
