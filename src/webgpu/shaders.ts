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
        const FLASH_BLEND_STRENGTH: f32 = 0.6;

        struct Uniforms {
            time: f32,
            useGlitch: f32,
            shockwaveCenter: vec2<f32>,
            shockwaveTime: f32,
            aberrationStrength: f32,
            padding1: vec2<f32>,
            flashIntensity: f32,
            padding2: vec3<f32>,
            flashColor: vec3<f32>,
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
            let aberrationStrength = uniforms.aberrationStrength;

            if (time > 0.0 && time < 1.0) {
                let dist = distance(uv, center);
                let radius = time * 1.5;
                let width = 0.15;
                let diff = dist - radius;

                if (abs(diff) < width) {
                    let angle = (diff / width) * 3.14159;
                    let distortion = cos(angle) * 0.03 * (1.0 - time);
                    let dir = normalize(uv - center);
                    finalUV -= dir * distortion;
                }
            }

            // Chromatic Aberration - distance-aware and less aggressive
            let distFromCenter = distance(uv, vec2<f32>(0.5));
            var aberration = distFromCenter * 0.01; // Passive lens distortion (mutable)
            aberration = select(aberration, aberration * 2.0, useGlitch > 0.5);
            let totalAberration = aberration + aberrationStrength;

            var r = textureSample(myTexture, mySampler, finalUV + vec2<f32>(totalAberration, 0.0)).r;
            var g = textureSample(myTexture, mySampler, finalUV).g;
            var b = textureSample(myTexture, mySampler, finalUV - vec2<f32>(totalAberration, 0.0)).b;
            let a = textureSample(myTexture, mySampler, finalUV).a;

            var color = vec3<f32>(r, g, b);

            // Add subtle sharpening filter when glitch is OFF
            if (useGlitch < 0.5) {
                let texSize = vec2<f32>(textureDimensions(myTexture));
                let texelSize = 1.0 / texSize;
                let center = color; // Reuse already sampled color
                let north = textureSample(myTexture, mySampler, finalUV + vec2<f32>(0.0, texelSize.y)).rgb;
                let south = textureSample(myTexture, mySampler, finalUV - vec2<f32>(0.0, texelSize.y)).rgb;
                let east = textureSample(myTexture, mySampler, finalUV + vec2<f32>(texelSize.x, 0.0)).rgb;
                let west = textureSample(myTexture, mySampler, finalUV - vec2<f32>(texelSize.x, 0.0)).rgb;

                // Simple Laplacian sharpen
                let sharpened = center * 5.0 - (north + south + east + west);
                color = mix(color, sharpened, 0.3);
            }

            var finalColor = color;

            // Calculate luminance for Bloom and Saturation
            let luminance = dot(color, vec3<f32>(0.299, 0.587, 0.114));

            // Enhanced Bloom: Quadratic response for smoother high-end boost
            let bloomThreshold = 0.6;
            let bloomStrength = 0.7; // Increased bloom
            let bloomFactor = max(0.0, luminance - bloomThreshold);
            finalColor += color * bloomFactor * bloomStrength;

            // Saturation boost for that "Neon" look
            let gray = vec3<f32>(luminance);
            finalColor = mix(gray, finalColor, 1.3); // Increased saturation

            // Vignette
            let distV = distance(uv, vec2<f32>(0.5));
            let vignette = smoothstep(0.8, 0.2, distV * 0.8);
            finalColor *= vignette;

            // Scanlines (Subtle retro feel)
            let scanline = sin(uv.y * 800.0) * 0.02;
            finalColor -= vec3<f32>(scanline);

            // Clamp to prevent negative values from subtractive scanlines
            finalColor = max(vec3<f32>(0.0), finalColor);

            // Apply flash overlay with gentle squared curve (color only)
            let flashAmount = uniforms.flashIntensity * uniforms.flashIntensity;
            finalColor = mix(finalColor, uniforms.flashColor, flashAmount * FLASH_BLEND_STRENGTH);

            // Preserve texture alpha so background video remains visible
            // Do NOT increase alpha during flash (avoids opaque 'purple mask')
            let finalAlpha = a;

            return vec4<f32>(finalColor, finalAlpha);
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
            @location(0) particlePos : vec3<f32>,
            @location(1) particleColor : vec4<f32>,
            @location(2) particleScale : f32,
            @builtin(vertex_index) vertexIndex : u32
        ) -> VertexOutput {
            var output : VertexOutput;

            let cornerIdx = vertexIndex % 6u;

            var pos = vec2<f32>(0.0);
            var uv = vec2<f32>(0.0);

            if (cornerIdx == 0u) { pos = vec2<f32>(-1.0, -1.0); uv = vec2<f32>(0.0, 0.0); }
            else if (cornerIdx == 1u) { pos = vec2<f32>( 1.0, -1.0); uv = vec2<f32>(1.0, 0.0); }
            else if (cornerIdx == 2u) { pos = vec2<f32>(-1.0,  1.0); uv = vec2<f32>(0.0, 1.0); }
            else if (cornerIdx == 3u) { pos = vec2<f32>(-1.0,  1.0); uv = vec2<f32>(0.0, 1.0); }
            else if (cornerIdx == 4u) { pos = vec2<f32>( 1.0, -1.0); uv = vec2<f32>(1.0, 0.0); }
            else if (cornerIdx == 5u) { pos = vec2<f32>( 1.0,  1.0); uv = vec2<f32>(1.0, 1.0); }

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
            let dist = length(uv - 0.5) * 2.0;
            if (dist > 1.0) {
                discard;
            }

            // Soft Particle Look
            let glow = exp(-dist * 2.5); // Softer falloff
            let core = exp(-dist * 5.0); // Bright center

            let alpha = glow * 0.8 + core * 0.5;
            let finalAlpha = clamp(alpha * color.a, 0.0, 1.0);

            // Boost color for emissive look
            let finalColor = color.rgb * (1.5 + core * 2.0);

            return vec4<f32>(finalColor, finalAlpha);
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
            return vec4<f32>(1.0, 1.0, 1.0, 0.08);
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

// Helper to select shader based on style
export const getBlockShader = (style: string) => {
    if (style === 'glass') {
        return HolographicGlassShader();
    }
    return TechGemsShader();
};

export const TechGemsShader = () => {
    let params: any = {};
    // define default input values:
    params.color = "(0.0, 1.0, 0.0)";
    params.diffuseIntensity = "1.2";
    params.specularIntensity = "4.0";
    params.shininess = "350.0";
    params.specularColor = "(1.0, 1.0, 1.0)";

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
                @location(1) @interpolate(flat) vNormal : vec4<f32>,
                @location(2) vColor : vec4<f32>,
                @location(3) vUV : vec2<f32>
            };

            @vertex
            fn main(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>, @location(2) uv: vec2<f32>) -> Output {
                var output: Output;
                let mPosition:vec4<f32> = uniforms.modelMatrix * vec4<f32>(position, 1.0);
                output.vPosition = mPosition;
                output.vNormal   = uniforms.normalMatrix * vec4<f32>(normal, 0.0);
                output.Position  = uniforms.viewProjectionMatrix * mPosition;
                output.vColor    = uniforms.colorVertex;
                output.vUV = uv;
                return output;
            }`;

    const fragment = `
            struct Uniforms {
                lightPosition : vec4<f32>,
                eyePosition : vec4<f32>,
                color : vec4<f32>,
                time : f32,
                useGlitch: f32,
                lockPercent: f32,
                screenSize: vec2<f32>,
            };
            @binding(1) @group(0) var<uniform> uniforms : Uniforms;
            @binding(2) @group(0) var mySampler: sampler;
            @binding(3) @group(0) var myTexture: texture_2d<f32>;

            @fragment
            fn main(@builtin(position) fragCoord: vec4<f32>, @location(0) vPosition: vec4<f32>, @location(1) @interpolate(flat) vNormal: vec4<f32>, @location(2) vColor: vec4<f32>, @location(3) vUV: vec2<f32>) ->  @location(0) vec4<f32> {

                var N:vec3<f32> = normalize(vNormal.xyz);
                let L:vec3<f32> = normalize(uniforms.lightPosition.xyz - vPosition.xyz);
                let V:vec3<f32> = normalize(uniforms.eyePosition.xyz - vPosition.xyz);
                let H:vec3<f32> = normalize(L + V);

                // --- Lighting Model ---
                let diffuse:f32 = max(dot(N, L), 0.0);
                let specularSharp:f32 = pow(max(dot(N, H), 0.0), ${params.shininess}) * 3.0;
                let specularClear:f32 = pow(max(dot(N, H), 0.0), 16.0) * 0.5;
                let ambient:f32 = 0.3;

                // --- Texture Sampling ---
                // Sample the block texture using standard UVs
                let texColor = textureSample(myTexture, mySampler, vUV).rgb;

                // Blend: Multiply vertex color (e.g., Cyan) with texture (Gray/White pattern)
                var baseColor = vColor.xyz * texColor;

                // --- Circuit Traces / Emissive Logic ---
                // We keep the circuit trace logic for extra "tech" feel, but overlay it on the texture
                let uvScale = 3.0;
                let uvGrid = vUV * uvScale;
                let gridPos = fract(uvGrid);
                let gridThick = 0.05;
                let lineX = step(1.0 - gridThick, gridPos.x) + step(gridPos.x, gridThick);
                let lineY = step(1.0 - gridThick, gridPos.y) + step(gridPos.y, gridThick);
                let isTrace = max(lineX, lineY);

                if (isTrace > 0.5) {
                    baseColor *= 0.6; // Darken traces slightly
                }

                // --- Composition ---
                var finalColor:vec3<f32> = baseColor * (ambient + diffuse * 0.9) + vec3<f32>${params.specularColor} * (specularSharp + specularClear);

                // --- Emissive Elements ---
                let pulsePos = sin(uniforms.time * 1.5 + vPosition.y * 0.8 + vPosition.x * 0.8) * 0.5 + 0.5;
                if (isTrace > 0.5) {
                    let traceGlow = pulsePos * 5.0;
                    finalColor += vColor.rgb * traceGlow * 0.5;
                }

                // --- Fresnel Rim Light ---
                let fresnelTerm = pow(1.0 - max(dot(N, V), 0.0), 3.0);
                let rimColor = vec3<f32>(0.2, 0.8, 1.0);
                finalColor += rimColor * fresnelTerm * 2.0;

                // --- Edge Highlight ---
                const EDGE_THRESHOLD = 0.6;
                const SILHOUETTE_THRESHOLD = 0.2;
                let edgeFresnel = pow(1.0 - max(dot(N, V), 0.0), 5.0);
                let edgeGlow = edgeFresnel * step(EDGE_THRESHOLD, edgeFresnel);
                let isSilhouette = step(SILHOUETTE_THRESHOLD, abs(dot(N, V)));
                finalColor += vec3<f32>(1.0) * edgeGlow * isSilhouette * 3.5;

                // --- Lock Pulse ---
                let lockP = uniforms.lockPercent;
                if (lockP > 0.0 && vColor.w > 0.8) {
                   let pulseSpeed = 10.0 + lockP * 20.0;
                   let whiteFlash = sin(uniforms.time * pulseSpeed) * 0.5 + 0.5;
                   let intensity = lockP * 0.6 * whiteFlash;
                   finalColor = mix(finalColor, vec3<f32>(1.0, 1.0, 1.0), intensity);
                }

                // --- Ghost Piece ---
                if (vColor.w < 0.4) {
                    // Simple Ghost Logic
                    return vec4<f32>(vColor.rgb * 2.0, 0.3);
                }

                // --- Final Alpha ---
                let finalAlpha = vColor.w;

                return vec4<f32>(finalColor, finalAlpha);
            }`;

    return {
        vertex,
        fragment,
    };
};

export const HolographicGlassShader = () => {
    // Reuse the same vertex shader as TechGems
    const { vertex } = TechGemsShader();

    const fragment = `
        struct Uniforms {
            lightPosition : vec4<f32>,
            eyePosition : vec4<f32>,
            color : vec4<f32>,
            time : f32,
            useGlitch: f32,
            lockPercent: f32,
            screenSize: vec2<f32>,
        };
        @binding(1) @group(0) var<uniform> uniforms : Uniforms;
        @binding(2) @group(0) var screenSampler: sampler;
        @binding(3) @group(0) var screenTexture: texture_2d<f32>;

        @fragment
        fn main(@builtin(position) fragCoord: vec4<f32>, @location(0) vPosition: vec4<f32>, @location(1) @interpolate(flat) vNormal: vec4<f32>, @location(2) vColor: vec4<f32>, @location(3) vUV: vec2<f32>) ->  @location(0) vec4<f32> {

            var N:vec3<f32> = normalize(vNormal.xyz);
            let L:vec3<f32> = normalize(uniforms.lightPosition.xyz - vPosition.xyz);
            let V:vec3<f32> = normalize(uniforms.eyePosition.xyz - vPosition.xyz);
            let H:vec3<f32> = normalize(L + V);

            // --- Screen-space UVs for Refraction ---
            // Normalize fragment coordinates to 0-1 range
            let screenUV = fragCoord.xy / uniforms.screenSize;

            // Refraction effect: offset UVs based on normal and view direction
            // A simplified IOR (Index of Refraction) effect
            let ior = 1.1; // Index of Refraction for glass-like effect
            let refraction = refract(-V, N, 1.0 / ior);
            let refractionUV = screenUV + refraction.xy * 0.05; // Adjust strength of effect

            // Sample the background texture
            let bgColor = textureSample(screenTexture, screenSampler, refractionUV).rgb;

            // --- Glass Lighting ---
            let diffuse:f32 = max(dot(N, L), 0.0);
            let specular:f32 = pow(max(dot(N, H), 0.0), 300.0); // Sharp highlight for glass
            let ambient:f32 = 0.1; // Glass is mostly transparent, low ambient

            // --- Fresnel Effect for Edge Highlights ---
            // Controls how reflective the surface is based on the viewing angle
            let fresnelTerm = pow(1.0 - max(dot(N, V), 0.0), 4.0);

            // --- Ghost Piece ---
            if (vColor.a < 0.4) {
                 let time = uniforms.time;
                 let scanY = fract(vUV.y * 20.0 - time * 2.0);
                 let scanline = smoothstep(0.4, 0.5, scanY) - smoothstep(0.5, 0.6, scanY);
                 let fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.0);
                 let flicker = 0.5 + sin(time * 30.0 + vUV.y * 10.0) * 0.2;
                 return vec4<f32>(vColor.rgb * fresnel * 8.0 * flicker + vec3<f32>(scanline * 0.5), 0.1 * flicker);
            }

            // --- Composition ---
            // Base color is a mix of the block's color and the refracted background
            let baseColor = mix(bgColor, vColor.rgb, 0.3); // 30% block color, 70% background

            // Combine lighting components
            var finalColor = baseColor * (ambient + diffuse * 0.8) + vec3<f32>(1.0) * specular * 3.0;

            // Additive fresnel rim light - makes it glow at the edges
            finalColor += vec3<f32>(0.8, 0.9, 1.0) * fresnelTerm * 2.0;

            // Transparency: controlled by fresnel and base alpha
            let finalAlpha = clamp(fresnelTerm + (1.0 - vColor.a), 0.1, 0.9);

            return vec4<f32>(finalColor, finalAlpha);
        }`;

    return {
        vertex,
        fragment,
    };
};

export const VideoBackgroundShader = () => {
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
            output.uv.y = 1.0 - output.uv.y; // Correct standard video orientation
            return output;
        }
    `;

    const fragment = `
        struct GameState {
            screen_size: vec2<f32>,
            time: f32,
            dt: f32,

            // Active Piece
            piece_pos: vec2<f32>,

            // NEW: Video Size for Aspect Ratio Correction
            video_size: vec2<f32>,

            piece_color: vec4<f32>,

            // Line Clears (Packed into vec4 for alignment)
            cleared_lines: vec4<f32>,
            line_clear_params: vec4<f32>, // x=count, y=progress, z=padding, w=padding

            // Stats
            stats: vec4<f32>, // x=level, y=score, z=quality(LOD), w=debug_mode

            // Locked Pieces Ring Buffer
            // We use vec4 for alignment: x,y = pos, z = fade_strength, w = padding
            locked_pieces: array<vec4<f32>, 200>,
        };

        @group(0) @binding(0) var<uniform> game: GameState;
        @group(0) @binding(1) var videoSampler: sampler;
        @group(0) @binding(2) var videoTexture: texture_external;

        @fragment
        fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
            var finalUV = uv;
            var finalColor = vec4<f32>(0.0);

            // --- ASPECT RATIO CORRECTION (Cover Mode) ---
            let screenW = game.screen_size.x;
            let screenH = game.screen_size.y;
            let vidW = select(1920.0, game.video_size.x, game.video_size.x > 1.0);
            let vidH = select(1080.0, game.video_size.y, game.video_size.y > 1.0);

            let screenRatio = screenW / max(1.0, screenH);
            let videoRatio = vidW / max(1.0, vidH);

            // Calculate scale to cover the screen
            var scale = vec2<f32>(1.0, 1.0);

            if (screenRatio > videoRatio) {
                // Screen is wider: Fit Width, Crop Height
                scale.y = videoRatio / screenRatio;
            } else {
                // Screen is taller: Fit Height, Crop Width
                scale.x = screenRatio / videoRatio;
            }

            // Center the crop
            let coverUV = (finalUV - 0.5) * scale + 0.5;

            // Calculate screen pos for distance checks (approximate aspect ratio correction)
            let aspect = game.screen_size.x / game.screen_size.y;
            let screenUV = uv * vec2<f32>(aspect, 1.0);

            // --- 1. GHOST PIECE BURN-IN ---
            var totalDistortion = vec2<f32>(0.0);
            let max_pieces = u32(200.0 * game.stats.z);

            for (var i = 0u; i < max_pieces; i++) {
                let data = game.locked_pieces[i];
                if (data.z <= 0.001) { continue; }

                let pieceUV = vec2<f32>(data.x / 10.0, 1.0 - (data.y / 20.0));
                let pieceScreenUV = pieceUV * vec2<f32>(aspect, 1.0);

                let dist = distance(screenUV, pieceScreenUV);
                let radius = 0.15;
                let influence = smoothstep(radius, 0.0, dist) * data.z;

                totalDistortion += (screenUV - pieceScreenUV) * influence * 0.05;
            }

            // Apply distortion to our corrected UVs
            let distortedUV = coverUV + totalDistortion;

            // --- 2. ACTIVE PIECE GRAVITY WELL ---
            let activePos = vec2<f32>(game.piece_pos.x / 10.0, 1.0 - (game.piece_pos.y / 20.0));
            let activeDist = distance(screenUV, activePos * vec2<f32>(aspect, 1.0));
            let activeInfluence = smoothstep(0.3, 0.0, activeDist) * 0.03;
            let pulse = sin(game.time * 5.0) * 0.005;

            let finalSampleUV = distortedUV + (screenUV - (activePos * vec2<f32>(aspect, 1.0))) * (activeInfluence + pulse);

            // SAMPLE VIDEO
            var videoColor = textureSampleBaseClampToEdge(videoTexture, videoSampler, finalSampleUV);

            // --- 3. MULTI-LINE CASCADE ---
            let lineCount = u32(game.line_clear_params.x);
            if (lineCount > 0u) {
                let progress = game.line_clear_params.y;
                var celebration = vec3<f32>(0.0);
                if (lineCount >= 4u) {
                     let flash = sin(game.time * 15.0) * (1.0 - progress);
                     celebration = vec3<f32>(flash * 0.2, flash * 0.1, flash * 0.3);
                }

                for (var i = 0u; i < lineCount; i++) {
                    let lineY_raw = game.cleared_lines[i];
                    let lineUV_Y = 1.0 - (lineY_raw / 20.0);
                    let distToLine = abs(uv.y - lineUV_Y); // Use original UV for line position logic
                    let stagger = f32(i) * 0.15;
                    let wavePos = progress * (1.0 + stagger);
                    let waveDist = abs(distToLine - wavePos * 0.5);
                    let waveIntensity = smoothstep(0.1, 0.0, waveDist) * (1.0 - progress) * 2.0;

                    videoColor.r += waveIntensity * 0.3;
                    videoColor.b -= waveIntensity * 0.3;
                    videoColor = vec4<f32>(videoColor.rgb + celebration, videoColor.a);
                }
            }

            // --- 4. DEBUG VISUALIZATION ---
            if (game.stats.w > 0.5) {
                let distLen = length(totalDistortion) * 20.0;
                videoColor.g += distLen;
                if (activeDist < 0.3) { videoColor.r += 0.1; }
            }

            let levelBoost = 1.0 + game.stats.x * 0.05;
            let gray = dot(videoColor.rgb, vec3<f32>(0.299, 0.587, 0.114));
            videoColor = mix(vec4<f32>(vec3<f32>(gray), 1.0), videoColor, 1.0 + levelBoost * 0.2);

            return videoColor;
        }
    `;
    return { vertex, fragment };
};
