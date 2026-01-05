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
            aberrationStrength: f32,
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
            let aberration = select(0.0, distFromCenter * 0.008, useGlitch > 0.5); // Reduced from 0.015
            let totalAberration = aberration + aberrationStrength * 0.02;

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
            // Enhanced Bloom: Quadratic response for smoother high-end boost
            let bloomThreshold = 0.6;
            let bloomStrength = 0.5;
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

            // PRESERVE ALPHA: Mask final color by alpha to ensure we don't draw on transparent background
            // Since we are in premultiplied alpha mode, we should ensure color is 0 where alpha is 0.
            // Also clamp to prevent negative values from subtractive scanlines.
            finalColor = max(vec3<f32>(0.0), finalColor) * ceil(a);

            return vec4<f32>(finalColor, a);
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

            let intensity = exp(-dist * 4.0);

            let uvCentered = abs(uv - 0.5);
            let rot = 0.7071;
            let uvr = vec2<f32>(
                uvCentered.x * rot - uvCentered.y * rot,
                uvCentered.x * rot + uvCentered.y * rot
            );
            let uvrCentered = abs(uvr);

            let core = exp(-length(uv - 0.5) * 5.0);

            let cross1 = max(1.0 - smoothstep(0.0, 0.1, uvCentered.x), 1.0 - smoothstep(0.0, 0.1, uvCentered.y));
            let cross2 = max(1.0 - smoothstep(0.0, 0.1, uvrCentered.x), 1.0 - smoothstep(0.0, 0.1, uvrCentered.y));

            let sparkle = max(cross1, cross2 * 0.5);

            let alpha = intensity + core * 0.5 + sparkle * 0.8;
            let finalAlpha = clamp(alpha * color.a, 0.0, 1.0);

            let hueShift = color.rgb * (1.0 + 0.2 * sin(uv.x * 10.0));

            return vec4<f32>(hueShift * 2.5, finalAlpha);
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
            resolution: vec2<f32>,
            color1: vec3<f32>,
            color2: vec3<f32>,
            color3: vec3<f32>,
        };
        @binding(0) @group(0) var<uniform> uniforms: Uniforms;

        @fragment
        fn main(@location(0) vUV: vec2<f32>) -> @location(0) vec4<f32> {
          let time = uniforms.time * 0.3;
          let uv = vUV;
          let deepSpace = vec3<f32>(0.02, 0.01, 0.08);

          var grid = 0.0;
          for (var layer: i32 = 0; layer < 4; layer++) {
            let layer_f = f32(layer);
            let scale = exp2(layer_f);
            let speed = 0.1 + layer_f * 0.05;

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

          let gridColor = mix(neonCyan, mix(neonPurple, neonBlue, colorCycle), colorCycle);

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

export const Shaders = () => {
  let params: any = {};
  // define default input values:
  params.color = "(0.0, 1.0, 0.0)";
  // Note: ambientIntensity is now hardcoded in shader for optimal contrast (0.3)
  params.diffuseIntensity = "1.0";
  params.specularIntensity = "2.5"; // Very glossy
  params.shininess = "256.0"; // Extremely sharp, like polished gemstone
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

                // Construct vec4 with w=1.0 for Position (Point)
                let mPosition:vec4<f32> = uniforms.modelMatrix * vec4<f32>(position, 1.0);

                output.vPosition = mPosition;

                // Construct vec4 with w=0.0 for Normal (Direction) - Critical Fix!
                output.vNormal   = uniforms.normalMatrix * vec4<f32>(normal, 0.0);

                output.Position  = uniforms.viewProjectionMatrix * mPosition;
                output.vColor    = uniforms.colorVertex;
                output.vUV = uv;
                return output;
            }`;

  // TECH GEMS: Merged Tech Lattice + Gem Physics
  const fragment = `
            struct Uniforms {
                lightPosition : vec4<f32>,
                eyePosition : vec4<f32>,
                color : vec4<f32>,
                time : f32,
                useGlitch: f32,
                lockPercent: f32,
            };
            @binding(1) @group(0) var<uniform> uniforms : Uniforms;

            @fragment
            fn main(@location(0) vPosition: vec4<f32>, @location(1) @interpolate(flat) vNormal: vec4<f32>, @location(2) vColor: vec4<f32>, @location(3) vUV: vec2<f32>) ->  @location(0) vec4<f32> {
               
                var N:vec3<f32> = normalize(vNormal.xyz);
                let L:vec3<f32> = normalize(uniforms.lightPosition.xyz - vPosition.xyz);
                let V:vec3<f32> = normalize(uniforms.eyePosition.xyz - vPosition.xyz);
                let H:vec3<f32> = normalize(L + V);

                // --- Improved Lighting Model ---
                let diffuse:f32 = max(dot(N, L), 0.0);

                // Primary sharp specular (polished)
                let specularSharp:f32 = pow(max(dot(N, H), 0.0), ${params.shininess}) * 3.0;

                // Secondary broad specular (clear coat)
                let specularClear:f32 = pow(max(dot(N, H), 0.0), 16.0) * 0.5;

                // Enhanced ambient with darker base for more contrast
                let ambient:f32 = 0.3;

                var baseColor = vColor.xyz;

                // --- Premium Tech Pattern ---
                // Subtle hexagonal grid overlay
                let hexScale = 4.0;
                let uvHex = vUV * hexScale;
                let r = vec2<f32>(1.0, 1.73);
                let h = r * 0.5;
                let a = (uvHex - r * floor(uvHex / r)) - h;
                let b = ((uvHex - h) - r * floor((uvHex - h) / r)) - h;
                let guv = select(b, a, dot(a, a) < dot(b, b));
                let hexDist = length(guv);
                let hexEdge = smoothstep(0.45, 0.5, hexDist);

                // Circuit Traces
                let uvScale = 3.0;
                let uvGrid = vUV * uvScale;
                let gridPos = fract(uvGrid);
                let gridThick = 0.05;
                let lineX = step(1.0 - gridThick, gridPos.x) + step(gridPos.x, gridThick);
                let lineY = step(1.0 - gridThick, gridPos.y) + step(gridPos.y, gridThick);
                let isTrace = max(lineX, lineY);

                // Pulse effect
                let time = uniforms.time;
                let pulsePos = sin(time * 1.5 + vPosition.y * 0.8 + vPosition.x * 0.8) * 0.5 + 0.5;

                // Surface finish
                let noise = fract(sin(dot(vUV, vec2<f32>(12.9898, 78.233))) * 43758.5453);

                // Apply texture
                if (hexEdge > 0.5) {
                   baseColor *= 0.95; // Subtle hex pattern indentation
                }

                if (isTrace > 0.5) {
                    baseColor *= 0.5; // Deep grooves
                } else {
                    // Crystalline noise sparkle
                    let sparkle = step(0.98, noise) * 0.5 * (sin(time * 5.0 + vPosition.x * 10.0) * 0.5 + 0.5);
                    baseColor += vec3<f32>(sparkle);
                }

                // --- Composition ---
                var finalColor:vec3<f32> = baseColor * (ambient + diffuse * 0.8) + vec3<f32>${params.specularColor} * (specularSharp + specularClear);

                // --- Emissive Elements ---
                // Traces glow intensely
                if (isTrace > 0.5) {
                    let traceGlow = pulsePos * 3.0;
                    finalColor += vColor.rgb * traceGlow;
                    finalColor += vec3<f32>(1.0) * traceGlow * 0.5; // White hot core
                }
                // Hex corners glow slightly
                if (hexDist < 0.1) {
                    finalColor += vColor.rgb * 0.5 * pulsePos;
                }

                // --- Fresnel Rim Light (Enhanced) ---
                let fresnelTerm = pow(1.0 - max(dot(N, V), 0.0), 3.0); // Sharper
                let rimColor = vec3<f32>(0.2, 0.8, 1.0); // Cyan/Ice rim

                // Chromatic Aberration on Rim
                let rimR = rimColor.r * (1.0 + 0.1 * sin(time + vPosition.y));
                let rimG = rimColor.g;
                let rimB = rimColor.b * (1.0 + 0.1 * cos(time + vPosition.y));

                finalColor += vec3<f32>(rimR, rimG, rimB) * fresnelTerm * 2.5;

                // --- Geometric Edge Highlight (Fresnel-based) ---
                const EDGE_THRESHOLD = 0.7; // Sharp threshold for edge detection
                const SILHOUETTE_THRESHOLD = 0.3; // Threshold for silhouette detection
                
                let edgeFresnel = pow(1.0 - max(dot(N, V), 0.0), 6.0);
                let edgeGlow = edgeFresnel * step(EDGE_THRESHOLD, edgeFresnel);
                
                // Only apply to silhouette edges, not internal faces
                let isSilhouette = step(SILHOUETTE_THRESHOLD, abs(dot(N, V)));
                finalColor += vec3<f32>(1.0) * edgeGlow * isSilhouette * 2.0;

                // --- GHOST PIECE RENDERING ---
                // If alpha is low, use ghost logic (hologram)
                if (vColor.w < 0.4) {
                    let time = uniforms.time;
                    let scanY = fract(vUV.y * 30.0 - time * 5.0);
                    let scanline = smoothstep(0.4, 0.6, scanY) * (1.0 - smoothstep(0.6, 0.8, scanY));

                    // Wireframe - use fresnel for ghost as well
                    let ghostFresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
                    let wire = ghostFresnel;

                    // Internal grid
                    let internalGrid = isTrace;

                    let ghostBase = mix(vColor.rgb, vec3<f32>(0.5, 1.0, 1.0), 0.6);
                    var ghostFinal = ghostBase * edgeGlow * 4.0;
                    ghostFinal += ghostBase * isTrace * 2.0;
                    ghostFinal += ghostBase * scanline * 1.5;

                    let flickerBase = 0.9 + 0.1 * step(0.9, sin(time * 60.0));
                    let flicker = select(1.0, flickerBase, uniforms.useGlitch > 0.5);
                    let pulse = 0.35 + 0.15 * sin(time * 6.0);

                    return vec4<f32>(ghostFinal * flicker, pulse);
                }

                // --- Smart Transparency for Blocks ---
                // Keep base material semi-transparent (0.85), but make features opaque (1.0)
                let baseAlpha = vColor.w;
                // Use UV-based edge for feature opacity (not the same as highlight)
                let uvEdgeDist = max(abs(vUV.x - 0.5), abs(vUV.y - 0.5)) * 2.0;
                let uvEdgeFeature = smoothstep(0.9, 1.0, uvEdgeDist);
                let featureAlpha = max(isTrace, max(uvEdgeFeature, hexEdge));
                let finalAlpha = clamp(max(baseAlpha, featureAlpha), 0.0, 1.0);

                return vec4<f32>(finalColor, finalAlpha);
            }`;

  return {
    vertex,
    fragment,
  };
};
