import * as Matrix from "gl-matrix";
// @ts-ignore
const glMatrix = Matrix;

////

// Type definitions for themes
interface ThemeColors {
  [key: number]: number[];
  border: number[];
  levelVideos?: string[];
  backgroundColors: number[][]; // [color1, color2, color3]
}

interface Themes {
  pastel: ThemeColors;
  neon: ThemeColors;
  future: ThemeColors;
}

// Default level videos used across all themes
const DEFAULT_LEVEL_VIDEOS = [
  './assets/video/bg1.mp4',
  './assets/video/bg2.mp4',
  './assets/video/bg3.mp4',
  './assets/video/bg4.mp4',
  './assets/video/bg5.mp4',
  './assets/video/bg6.mp4',
  './assets/video/bg7.mp4'
];

interface Particle {
    position: Float32Array; // x, y, z
    velocity: Float32Array; // vx, vy, vz
    color: Float32Array;    // r, g, b, a
    life: number;           // remaining life (0-1)
    scale: number;
}

const ParticleShaders = () => {
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
            let intensity = exp(-dist * 4.0); // Sharper core

            // Sparkle shape (star)
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

            // Add a slight hue shift based on life for variety
            let hueShift = color.rgb * (1.0 + 0.2 * sin(uv.x * 10.0));

            return vec4<f32>(hueShift * 2.5, finalAlpha); // Boost brightness
        }
    `;

    return { vertex, fragment };
}

const CubeData = () => {
  const positions = new Float32Array([
    // Front face
    -1, -1,  1,   1, -1,  1,   1,  1,  1,   1,  1,  1,  -1,  1,  1,  -1, -1,  1,
    // Right face
     1, -1,  1,   1, -1, -1,   1,  1, -1,   1,  1, -1,   1,  1,  1,   1, -1,  1,
    // Back face
    -1, -1, -1,  -1,  1, -1,   1,  1, -1,   1,  1, -1,   1, -1, -1,  -1, -1, -1,
    // Left face
    -1, -1,  1,  -1,  1,  1,  -1,  1, -1,  -1,  1, -1,  -1, -1, -1,  -1, -1,  1,
    // Top face
    -1,  1,  1,   1,  1,  1,   1,  1, -1,   1,  1, -1,  -1,  1, -1,  -1,  1,  1,
    // Bottom face
    -1, -1,  1,  -1, -1, -1,   1, -1, -1,   1, -1, -1,   1, -1,  1,  -1, -1,  1,
  ]);

  const normals = new Float32Array([
    // Front
    0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
    // Right
    1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
    // Back
    0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
    // Left
    -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,
    // Top
    0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
    // Bottom
    0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,
  ]);

  // Add UV coordinates for texture mapping
  const uvs = new Float32Array([
    // Front
    0, 0,  1, 0,  1, 1,  1, 1,  0, 1,  0, 0,
    // Right
    0, 0,  1, 0,  1, 1,  1, 1,  0, 1,  0, 0,
    // Back
    0, 0,  1, 0,  1, 1,  1, 1,  0, 1,  0, 0,
    // Left
    0, 0,  1, 0,  1, 1,  1, 1,  0, 1,  0, 0,
    // Top
    0, 0,  1, 0,  1, 1,  1, 1,  0, 1,  0, 0,
    // Bottom
    0, 0,  1, 0,  1, 1,  1, 1,  0, 1,  0, 0,
  ]);

  return { positions, normals, uvs };
};

const FullScreenQuadData = () => {
    const positions = new Float32Array([
        -1.0, -1.0, 0.0,
         1.0, -1.0, 0.0,
        -1.0,  1.0, 0.0,
        -1.0,  1.0, 0.0,
         1.0, -1.0, 0.0,
         1.0,  1.0, 0.0,
    ]);
    return { positions };
};

const GridData = () => {
    const positions: number[] = [];
    // Vertical lines
    const yTop = 1.1;
    const yBottom = -42.9;
    for (let i = 1; i <= 9; i++) {
        const x = i * 2.2 - 1.1;
        positions.push(x, yTop, -0.5); // Slightly behind blocks
        positions.push(x, yBottom, -0.5);
    }
    // Horizontal lines
    const xLeft = -1.1;
    const xRight = 20.9;
    for (let j = 1; j <= 19; j++) {
        const y = j * -2.2 + 1.1;
        positions.push(xLeft, y, -0.5);
        positions.push(xRight, y, -0.5);
    }
    return new Float32Array(positions);
};

const GridShader = () => {
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
            return vec4<f32>(1.0, 1.0, 1.0, 0.08); // Very faint white
        }
    `;
    return { vertex, fragment };
};

const PostProcessShaders = () => {
    const vertex = `
        struct Output {
            @builtin(position) Position : vec4<f32>,
            @location(0) vUV : vec2<f32>,
        };

        @vertex
        fn main(@builtin(vertex_index) VertexIndex : u32) -> Output {
            var pos = array<vec2<f32>, 3>(
                vec2<f32>(-1.0, -1.0),
                vec2<f32>( 3.0, -1.0),
                vec2<f32>(-1.0,  3.0)
            );
            var output : Output;
            output.Position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
            output.vUV = pos[VertexIndex] * 0.5 + 0.5;
            output.vUV.y = 1.0 - output.vUV.y;
            return output;
        }
    `;

    const fragment = `
        @group(0) @binding(0) var sceneTexture : texture_2d<f32>;
        @group(0) @binding(1) var sceneSampler : sampler;

        struct Uniforms {
            time: f32,
            useGlitch: f32,
            shockwaveCenter: vec2<f32>,
            shockwaveTime: f32,
        };
        @group(0) @binding(2) var<uniform> uniforms : Uniforms;

        @fragment
        fn main(@location(0) vUV : vec2<f32>) -> @location(0) vec4<f32> {
            var uv = vUV;
            let time = uniforms.time;

            // --- Shockwave Distortion ---
            let shockDist = distance(uv, uniforms.shockwaveCenter);
            if (uniforms.shockwaveTime > 0.0) {
                let center = uniforms.shockwaveCenter;
                let force = 0.08 * (1.0 - uniforms.shockwaveTime); // Decay
                let diff = (uv - center);
                let dist = length(diff);
                let waveRadius = (1.0 - uniforms.shockwaveTime) * 1.5;

                if (abs(dist - waveRadius) < 0.1) {
                   let falloff = 1.0 - abs(dist - waveRadius) / 0.1;
                   uv -= normalize(diff) * force * falloff;
                }
            }

            // --- Chromatic Aberration ---
            let center = vec2<f32>(0.5, 0.5);
            let dist = length(uv - center);

            // Base aberration
            var aberration = dist * 0.015;

            // Glitch boost
            if (uniforms.useGlitch > 0.0) {
                aberration += sin(time * 50.0) * 0.01;
                // Horizontal tear
                if (abs(uv.y - sin(time * 10.0) * 0.5 - 0.5) < 0.05) {
                    uv.x += 0.05 * sin(uv.y * 100.0);
                }
            }

            let r = textureSample(sceneTexture, sceneSampler, uv + vec2<f32>(aberration, 0.0)).r;
            let g = textureSample(sceneTexture, sceneSampler, uv).g;
            let b = textureSample(sceneTexture, sceneSampler, uv - vec2<f32>(aberration, 0.0)).b;

            var color = vec3<f32>(r, g, b);

            // --- Scanlines ---
            let scanline = sin(uv.y * 1200.0 + time * 10.0) * 0.03;
            color -= scanline;

            // --- Vignette ---
            let vignette = 1.0 - smoothstep(0.4, 1.4, dist);
            color *= vignette;

            // --- Contrast / Brightness ---
            color = pow(color, vec3<f32>(1.2)); // Slight contrast boost

            return vec4<f32>(color, 1.0);
        }
    `;
    return { vertex, fragment };
}


const BackgroundShaders = () => {
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
            resolution: vec2<f32>,
            color1: vec3<f32>,
            color2: vec3<f32>,
            color3: vec3<f32>,
        };
        @binding(0) @group(0) var<uniform> uniforms: Uniforms;

        @fragment
        fn main(@location(0) vUV: vec2<f32>) -> @location(0) vec4<f32> {
          let time = uniforms.time * 0.3; // Slower, calmer animation
          let uv = vUV;

          // Base deep space color
          let deepSpace = vec3<f32>(0.02, 0.01, 0.08);

          // --- Multi-layer perspective grid ---
          var grid = 0.0;
          for (var layer: i32 = 0; layer < 3; layer++) {
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

          return vec4<f32>(finalColor, 1.0);
        }
    `;

    return { vertex, fragment };
};


const Shaders = () => {
  let params: any = {};
  params.ambientIntensity = "0.5";
  params.specularIntensity = "3.5"; // Higher
  params.shininess = "128.0";
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
                time : f32,
            };
            @binding(1) @group(0) var<uniform> uniforms : Uniforms;

            @fragment
            fn main(@location(0) vPosition: vec4<f32>, @location(1) vNormal: vec4<f32>,@location(2) vColor: vec4<f32>, @location(3) vUV: vec2<f32>) ->  @location(0) vec4<f32> {
               
                var N:vec3<f32> = normalize(vNormal.xyz);

                // --- Beveled Normal Logic ---
                var tangent = vec3<f32>(1.0, 0.0, 0.0);
                if (abs(N.x) > 0.9) { tangent = vec3<f32>(0.0, 1.0, 0.0); }
                let bitangent = cross(N, tangent);
                tangent = cross(bitangent, N);

                let bevelSize = 0.10;
                let bevelStrength = 1.0;

                let dx = (vUV.x - 0.5) * 2.0;
                let dy = (vUV.y - 0.5) * 2.0;

                if (abs(dx) > (1.0 - bevelSize)) {
                    let signX = sign(dx);
                    let dist = (abs(dx) - (1.0 - bevelSize)) / bevelSize;
                    N = normalize(N + tangent * signX * bevelStrength * dist);
                }
                if (abs(dy) > (1.0 - bevelSize)) {
                    let signY = sign(dy);
                    let dist = (abs(dy) - (1.0 - bevelSize)) / bevelSize;
                    N = normalize(N - bitangent * signY * bevelStrength * dist);
                }

                let L:vec3<f32> = normalize(uniforms.lightPosition.xyz - vPosition.xyz);
                let V:vec3<f32> = normalize(uniforms.eyePosition.xyz - vPosition.xyz);
                let H:vec3<f32> = normalize(L + V);

                let diffuse:f32 = max(dot(N, L), 0.0);
                var specular:f32 = pow(max(dot(N, H), 0.0), ${params.shininess});
                specular += pow(max(dot(N, H), 0.0), 32.0) * 0.3;

                let ambient:f32 = ${params.ambientIntensity};
                var baseColor = vColor.xyz;

                // --- Premium Tech Pattern ---
                let hexScale = 4.0;
                let uvHex = vUV * hexScale;
                let r = vec2<f32>(1.0, 1.73);
                let h = r * 0.5;
                let a = mod(uvHex, r) - h;
                let b = mod(uvHex - h, r) - h;
                // manual mod implementation for float if needed? WGSL supports mod for f32
                let guv = dot(a, a) < dot(b, b) ? a : b;
                let hexDist = length(guv);
                let hexEdge = smoothstep(0.45, 0.5, hexDist);

                let uvScale = 3.0;
                let uvGrid = vUV * uvScale;
                let gridPos = fract(uvGrid);
                let gridThick = 0.05;
                let lineX = step(1.0 - gridThick, gridPos.x) + step(gridPos.x, gridThick);
                let lineY = step(1.0 - gridThick, gridPos.y) + step(gridPos.y, gridThick);
                let isTrace = max(lineX, lineY);

                let time = uniforms.time;
                let pulsePos = sin(time * 2.0 + vPosition.y * 1.0 + vPosition.x * 1.0) * 0.5 + 0.5;

                if (hexEdge > 0.5) { baseColor *= 0.9; }
                if (isTrace > 0.5) { baseColor *= 0.6; }

                var finalColor:vec3<f32> = baseColor * (ambient + diffuse) + vec3<f32>${params.specularColor} * specular;

                // --- Emissive Glows ---
                if (isTrace > 0.5) {
                    let traceGlow = pulsePos * 4.0;
                    finalColor += vColor.rgb * traceGlow * 0.5;
                }

                // --- Fresnel Rim Light ---
                let fresnelTerm = pow(1.0 - max(dot(N, V), 0.0), 2.5);
                let rimColor = vec3<f32>(0.2, 0.9, 1.0);
                finalColor += rimColor * fresnelTerm * 2.0;

                // --- Edge Highlight ---
                let uvEdgeDist = max(abs(vUV.x - 0.5), abs(vUV.y - 0.5)) * 2.0;
                let edgeGlow = smoothstep(0.9, 1.0, uvEdgeDist);
                finalColor += vec3<f32>(1.0) * edgeGlow * 0.6;

                // --- GHOST PIECE RENDERING ---
                if (vColor.w < 0.9) {
                    // Wireframe Style
                    let wire = edgeGlow + isTrace;
                    let scanY = fract(vUV.y * 20.0 - time * 3.0);
                    let scanline = smoothstep(0.4, 0.6, scanY) * (1.0 - smoothstep(0.6, 0.8, scanY));

                    let ghostBase = mix(vColor.rgb, vec3<f32>(0.5, 1.0, 1.0), 0.5);
                    var ghostFinal = ghostBase * wire * 3.0;
                    ghostFinal += ghostBase * scanline * 2.0;

                    let flicker = 0.8 + 0.2 * step(0.9, sin(time * 40.0));
                    return vec4<f32>(ghostFinal * flicker, 0.6); // Higher alpha but additive-like
                }

                return vec4<f32>(finalColor, vColor.w);
            }`;

  return { vertex, fragment };
};

export default class View {
  element: HTMLElement;
  width: number;
  height: number;
  nextPieceContext: CanvasRenderingContext2D;
  holdPieceContext: CanvasRenderingContext2D;
  canvasWebGPU: HTMLCanvasElement;
  ctxWebGPU: GPUCanvasContext;
  isWebGPU: { result: boolean; description: string };
  playfildBorderWidth: number;
  playfildX: number;
  playfildY: number;
  playfildWidth: number;
  playfildHeight: number;
  playfildInnerWidth: number;
  playfildInnerHeight: number;
  blockWidth: number;
  blockHeight: number;
  panelX: number;
  panelY: number;
  panelWidth: number;
  panelHeight: number;
  state: { playfield: number[][] };
  blockData: any;
  device!: GPUDevice;
  numberOfVertices!: number;
  vertexBuffer!: GPUBuffer;
  normalBuffer!: GPUBuffer;
  uvBuffer!: GPUBuffer;
  pipeline!: GPURenderPipeline;
  fragmentUniformBuffer!: GPUBuffer;
  MODELMATRIX: any;
  NORMALMATRIX: any;
  VIEWMATRIX: any;
  PROJMATRIX: any;
  vpMatrix: any;
  renderPassDescription!: GPURenderPassDescriptor;
  vertexUniformBuffer!: GPUBuffer;
  vertexUniformBuffer_border!: GPUBuffer;
  uniformBindGroup_ARRAY: GPUBindGroup[] = [];
  uniformBindGroup_CACHE: GPUBindGroup[] = [];
  uniformBindGroup_ARRAY_border: GPUBindGroup[] = [];
  x: number = 0;

  // Grid
  gridPipeline!: GPURenderPipeline;
  gridVertexBuffer!: GPUBuffer;
  gridVertexCount!: number;
  gridBindGroup!: GPUBindGroup;

  // Background specific
  backgroundPipeline!: GPURenderPipeline;
  backgroundVertexBuffer!: GPUBuffer;
  backgroundUniformBuffer!: GPUBuffer;
  backgroundBindGroup!: GPUBindGroup;
  startTime: number;

  // Particles
  particles: Particle[] = [];
  particlePipeline!: GPURenderPipeline;
  particleVertexBuffer!: GPUBuffer;
  particleUniformBuffer!: GPUBuffer;
  particleBindGroup!: GPUBindGroup;
  maxParticles: number = 4000;

  // Video Background
  videoElement: HTMLVideoElement;
  isVideoPlaying: boolean = false;
  currentLevel: number = 0;
  currentVideoSrc: string = '';

  // Visual Effects
  flashTimer: number = 0;
  lockTimer: number = 0;
  shakeTimer: number = 0;
  shakeMagnitude: number = 0;

  // Post Processing
  postProcessPipeline!: GPURenderPipeline;
  postProcessBindGroup!: GPUBindGroup;
  postProcessUniformBuffer!: GPUBuffer;
  offscreenTexture!: GPUTexture;
  depthTexture!: GPUTexture;
  useGlitch: boolean = false;
  shockwaveTime: number = 0;
  shockwaveCenter: number[] = [0.5, 0.5];

  themes: Themes = {
    pastel: {
      0: [0.3, 0.3, 0.3],
      1: [0.69, 0.92, 0.95],
      2: [0.73, 0.87, 0.98],
      3: [1.0, 0.8, 0.74],
      4: [1.0, 0.98, 0.77],
      5: [0.78, 0.9, 0.79],
      6: [0.88, 0.75, 0.91],
      7: [1.0, 0.8, 0.82],
      border: [0.82, 0.77, 0.91],
      levelVideos: DEFAULT_LEVEL_VIDEOS,
      backgroundColors: [
        [1.0, 0.8, 0.82],   // Pink
        [0.69, 0.92, 0.95], // Mint
        [0.88, 0.75, 0.91]  // Lavender
      ]
    },
    neon: {
      0: [0.1, 0.1, 0.1],
      1: [0.0, 1.0, 1.0],
      2: [0.0, 0.0, 1.0],
      3: [1.0, 0.5, 0.0],
      4: [1.0, 1.0, 0.0],
      5: [0.0, 1.0, 0.0],
      6: [0.5, 0.0, 1.0],
      7: [1.0, 0.0, 0.0],
      border: [1.0, 1.0, 1.0],
      levelVideos: DEFAULT_LEVEL_VIDEOS,
      backgroundColors: [
        [0.0, 0.9, 1.0],
        [0.8, 0.3, 1.0],
        [0.2, 0.5, 1.0]
      ]
    },
    future: {
      0: [0.1, 0.1, 0.1],
      1: [0.0, 0.9, 0.9],
      2: [0.0, 0.2, 0.9],
      3: [0.9, 0.4, 0.0],
      4: [0.9, 0.9, 0.0],
      5: [0.0, 0.9, 0.0],
      6: [0.6, 0.0, 0.9],
      7: [0.9, 0.0, 0.0],
      border: [0.5, 0.8, 1.0],
      levelVideos: DEFAULT_LEVEL_VIDEOS,
      backgroundColors: [
        [0.0, 0.9, 0.9],
        [0.6, 0.0, 0.9],
        [0.0, 0.2, 0.9]
      ]
    }
  };

  currentTheme = this.themes.future;

  constructor(element: HTMLElement, width: number, height: number, rows: number, coloms: number, nextPieceContext: CanvasRenderingContext2D, holdPieceContext: CanvasRenderingContext2D) {
    this.element = element;
    this.width = width;
    this.height = height;
    this.nextPieceContext = nextPieceContext;
    this.holdPieceContext = holdPieceContext;
    this.startTime = performance.now();

    this.videoElement = document.createElement('video');
    this.videoElement.autoplay = true;
    this.videoElement.loop = true;
    this.videoElement.muted = true;
    this.videoElement.style.position = 'absolute';
    this.videoElement.style.zIndex = '-1';
    this.videoElement.style.display = 'none';
    this.videoElement.style.objectFit = 'contain';

    this.videoElement.addEventListener('error', () => {
        console.warn('Video background failed to load. Falling back to shader.');
        this.isVideoPlaying = false;
        this.videoElement.style.display = 'none';
    });
    this.videoElement.addEventListener('playing', () => {
        this.isVideoPlaying = true;
        this.videoElement.style.display = 'block';
    });

    this.element.appendChild(this.videoElement);

    this.canvasWebGPU = document.createElement("canvas");
    this.canvasWebGPU.id = "canvaswebgpu";
    this.canvasWebGPU.style.position = 'absolute';
    this.canvasWebGPU.style.top = '0';
    this.canvasWebGPU.style.left = '0';
    this.canvasWebGPU.style.pointerEvents = 'none';
    this.canvasWebGPU.width = this.width;
    this.canvasWebGPU.height = this.height;

    this.ctxWebGPU = this.canvasWebGPU.getContext("webgpu") as GPUCanvasContext;
    this.isWebGPU = this.CheckWebGPU();

    this.playfildBorderWidth = 4;
    this.playfildX = this.playfildBorderWidth + 1;
    this.playfildY = this.playfildBorderWidth + 1;
    this.playfildWidth = (this.width * 2) / 3;
    this.playfildHeight = this.height;
    this.playfildInnerWidth = this.playfildWidth - this.playfildBorderWidth * 2;
    this.playfildInnerHeight =
      this.playfildHeight - this.playfildBorderWidth * 2 - 2;

    this.blockWidth = this.playfildInnerWidth / coloms;
    this.blockHeight = this.playfildInnerHeight / rows;

    this.panelX = this.playfildWidth + 10;
    this.panelY = 0;
    this.panelWidth = this.width / 3;
    this.panelHeight = this.height;

    this.updateVideoPosition();

    this.state = {
      playfield: Array(20).fill(0).map(() => Array(10).fill(0)),
    };
    this.blockData = {};
    if (this.isWebGPU.result) {
      this.element.appendChild(this.canvasWebGPU);
      this.preRender();
      window.addEventListener('resize', this.resize.bind(this));
    } else {
      let divError = document.createElement("div");
      divError.innerText = this.isWebGPU.description;
      this.element.appendChild(divError);
    }
  }

  updateVideoPosition() {
    const portalHeight = this.height * 0.9;
    const portalWidth = portalHeight * 0.5;
    const centerX = (this.width - portalWidth) / 2;
    const centerY = (this.height - portalHeight) / 2;

    this.videoElement.style.left = `${centerX}px`;
    this.videoElement.style.top = `${centerY}px`;
    this.videoElement.style.width = `${portalWidth}px`;
    this.videoElement.style.height = `${portalHeight}px`;
    this.videoElement.style.objectFit = 'cover';
    this.videoElement.style.boxShadow = '0 0 50px rgba(0, 200, 255, 0.2)';
    this.videoElement.style.borderRadius = '4px';
  }

  updateVideoForLevel(level: number) {
    const levelVideos = this.currentTheme.levelVideos;
    if (!levelVideos || levelVideos.length === 0) {
      this.videoElement.pause();
      this.videoElement.src = "";
      this.videoElement.style.display = 'none';
      this.isVideoPlaying = false;
      return;
    }
    const videoIndex = Math.min(level, levelVideos.length - 1);
    const videoSrc = levelVideos[videoIndex];
    if (this.currentVideoSrc === videoSrc) return;

    this.currentVideoSrc = videoSrc;
    this.isVideoPlaying = false;
    if (videoSrc) {
      this.videoElement.src = videoSrc;
      this.videoElement.play().catch(e => {
        console.log("Video autoplay failed", e);
        this.isVideoPlaying = false;
        this.videoElement.style.display = 'none';
      });
    } else {
      this.videoElement.pause();
      this.videoElement.src = "";
      this.videoElement.style.display = 'none';
    }
  }

  resize() {
    if (!this.device) return;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvasWebGPU.width = this.width;
    this.canvasWebGPU.height = this.height;

    this.playfildWidth = (this.width * 2) / 3;
    this.playfildHeight = this.height;
    this.playfildInnerWidth = this.playfildWidth - this.playfildBorderWidth * 2;
    this.playfildInnerHeight = this.playfildHeight - this.playfildBorderWidth * 2 - 2;

    this.updateVideoPosition();

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this.ctxWebGPU.configure({
      device: this.device,
      format: presentationFormat,
      alphaMode: 'premultiplied',
    });

    // Re-create offscreen texture and depth texture on resize
    this.offscreenTexture = this.device.createTexture({
        size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1],
        format: presentationFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });

    this.depthTexture = this.device.createTexture({
      size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    // Update Post-Process BindGroup with new Texture View
    this.postProcessBindGroup = this.device.createBindGroup({
        layout: this.postProcessPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: this.offscreenTexture.createView() },
            { binding: 1, resource: this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) },
            { binding: 2, resource: { buffer: this.postProcessUniformBuffer } }
        ]
    });

    Matrix.mat4.identity(this.PROJMATRIX);
    let fovy = (35 * Math.PI) / 180;
    Matrix.mat4.perspective(
      this.PROJMATRIX,
      fovy,
      this.canvasWebGPU.width / this.canvasWebGPU.height,
      1,
      150
    );

    this.vpMatrix = Matrix.mat4.create();
    Matrix.mat4.identity(this.vpMatrix);
    Matrix.mat4.multiply(this.vpMatrix, this.PROJMATRIX, this.VIEWMATRIX);
  }

  setTheme(themeName: keyof Themes) {
    this.currentTheme = this.themes[themeName];
    this.currentLevel = 0;
    this.updateVideoForLevel(0);
    if (this.device) {
        this.renderPlayfild_Border_WebGPU();
        const bgColors = this.currentTheme.backgroundColors;
        this.device.queue.writeBuffer(this.backgroundUniformBuffer, 16, new Float32Array(bgColors[0]));
        this.device.queue.writeBuffer(this.backgroundUniformBuffer, 32, new Float32Array(bgColors[1]));
        this.device.queue.writeBuffer(this.backgroundUniformBuffer, 48, new Float32Array(bgColors[2]));
    }
  }

  renderPiece(ctx: CanvasRenderingContext2D, piece: any) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (!piece) return;

    const { blocks } = piece;
    const blockSize = 20;
    // @ts-ignore
    const themeColors = Object.values(this.currentTheme);
    const offsetX = (ctx.canvas.width - blocks[0].length * blockSize) / 2;
    const offsetY = (ctx.canvas.height - blocks.length * blockSize) / 2;

    blocks.forEach((row: number[], y: number) => {
      row.forEach((value: number, x: number) => {
        if (value > 0) {
          const color = themeColors[value] as number[];
          const px = offsetX + x * blockSize;
          const py = offsetY + y * blockSize;

          // Gradient fill
          const grad = ctx.createLinearGradient(px, py, px, py + blockSize);
          grad.addColorStop(0, `rgb(${color[0]*255}, ${color[1]*255}, ${color[2]*255})`);
          grad.addColorStop(1, `rgb(${color[0]*200}, ${color[1]*200}, ${color[2]*200})`);
          ctx.fillStyle = grad;
          ctx.fillRect(px, py, blockSize, blockSize);

          // Bevels
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.beginPath();
          ctx.moveTo(px, py + blockSize);
          ctx.lineTo(px, py);
          ctx.lineTo(px + blockSize, py);
          ctx.lineTo(px + blockSize - 3, py + 3);
          ctx.lineTo(px + 3, py + 3);
          ctx.lineTo(px + 3, py + blockSize - 3);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = 1;
          ctx.strokeRect(px, py, blockSize, blockSize);
        }
      });
    });
  }

  onLineClear(lines: number[]) {
      this.flashTimer = 1.0;
      this.shakeTimer = 0.5;
      this.shakeMagnitude = 0.5;
      lines.forEach(y => {
          const worldY = y * -2.2;
          for (let c=0; c<10; c++) {
              const worldX = c * 2.2;
              const isTetris = lines.length === 4;
              const color = isTetris ? [1.0, 0.8, 0.0, 1.0] : [0.0, 1.0, 1.0, 1.0];
              const count = isTetris ? 40 : 20;
              this.emitParticles(worldX, worldY, 0.0, count, color);
          }
      });
      // Trigger glitch
      this.useGlitch = true;
      setTimeout(() => this.useGlitch = false, 200);
  }

  onLock() {
      this.lockTimer = 0.3;
      this.shakeTimer = 0.15;
      this.shakeMagnitude = 0.2;
  }

  onHold() {
      this.flashTimer = 0.2;
      this.emitParticles(4.5 * 2.2, -10.0 * 2.2, 0.0, 30, [0.5, 0.0, 1.0, 1.0]);
  }

  onHardDrop(x: number, y: number, distance: number) {
      const worldX = x * 2.2;
      const startRow = y - distance;

      // Trail
      for(let i=0; i<distance; i++) {
          const r = startRow + i;
          const worldY = r * -2.2;
          this.emitParticles(worldX, worldY, 0.0, 5, [0.4, 0.8, 1.0, 0.8]);
      }
      // Impact
      const impactY = y * -2.2;
      for (let i=0; i<40; i++) {
          const angle = (i / 40) * Math.PI * 2;
          this.emitParticlesRadial(worldX, impactY, 0.0, angle, 15.0, [0.8, 1.0, 1.0, 1.0]);
      }
      this.shakeTimer = 0.2;
      this.shakeMagnitude = 1.2;

      // Shockwave
      this.shockwaveTime = 1.0;
      // Map world coords to 0..1 UV (approximate)
      // Playfield is roughly center screen.
      // Logic coordinate: X(0..9), Y(0..19)
      // Viewport projection is complex, so we approximate shockwave to center for now or hardcode mapping if needed.
      // Center of screen is roughly logic X=4.5, Y=10.
      this.shockwaveCenter = [
          0.5 + (x - 4.5) * 0.03, // Slight offset based on column
          0.5 + (10 - y) * 0.03 // Inverted Y roughly
      ];
  }

  emitParticlesRadial(x: number, y: number, z: number, angle: number, speed: number, color: number[]) {
        if (this.particles.length >= this.maxParticles) return;
        this.particles.push({
            position: new Float32Array([x, y, z]),
            velocity: new Float32Array([
                Math.cos(angle)*speed,
                Math.sin(angle)*speed * 0.5,
                (Math.random()-0.5)*5.0
            ]),
            color: new Float32Array(color),
            life: 0.5 + Math.random() * 0.3,
            scale: Math.random() * 0.3 + 0.2
        });
  }

  emitParticles(x: number, y: number, z: number, count: number, color: number[]) {
      for(let i=0; i<count; i++) {
          if (this.particles.length >= this.maxParticles) break;
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 12.0 + 2.0;
          this.particles.push({
              position: new Float32Array([x, y, z]),
              velocity: new Float32Array([
                  Math.cos(angle)*speed,
                  Math.sin(angle)*speed + 8.0,
                  (Math.random()-0.5)*15.0
              ]),
              color: new Float32Array(color),
              life: 0.8 + Math.random() * 0.6,
              scale: Math.random() * 0.3 + 0.15
          });
      }
  }

  renderMainScreen(state: any) {
    if (state.level !== this.currentLevel) {
      this.currentLevel = state.level;
      this.updateVideoForLevel(this.currentLevel);
    }
    this.renderPlayfild_WebGPU(state);
    this.renderPiece(this.nextPieceContext, state.nextPiece);
    this.renderPiece(this.holdPieceContext, state.holdPiece);

    const scoreEl = document.getElementById('score');
    if (scoreEl) scoreEl.textContent = state.score;
    const linesEl = document.getElementById('lines');
    if (linesEl) linesEl.textContent = state.lines;
    const levelEl = document.getElementById('level');
    if (levelEl) levelEl.textContent = state.level;
  }

  clearScreen({ lines, score }: any) {}
  renderStartScreen() {}
  renderPauseScreen() {}
  renderEndScreen({ score }: any) {
    const el = document.getElementById('game-over');
    if (el) el.style.display = 'block';
  }

  //// ***** WEBGPU ***** ////

  async preRender() {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    this.device = await adapter.requestDevice();

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this.ctxWebGPU.configure({
      device: this.device,
      format: presentationFormat,
      alphaMode: 'premultiplied',
    });

    // --- Resources Init ---
    // 1. Offscreen Texture & Depth (for Post Processing)
    this.offscreenTexture = this.device.createTexture({
        size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1],
        format: presentationFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });

    this.depthTexture = this.device.createTexture({
      size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    // --- Main Block Pipeline ---
    const shader = Shaders();
    const cubeData = CubeData();

    this.numberOfVertices = cubeData.positions.length / 3;
    this.vertexBuffer = this.CreateGPUBuffer(this.device, cubeData.positions);
    this.normalBuffer = this.CreateGPUBuffer(this.device, cubeData.normals);
    this.uvBuffer = this.CreateGPUBuffer(this.device, cubeData.uvs);

    this.pipeline = this.device.createRenderPipeline({
      label: 'main pipeline',
      layout: "auto",
      vertex: {
        module: this.device.createShaderModule({ code: shader.vertex }),
        entryPoint: "main",
        buffers: [
          {
            arrayStride: 12,
            attributes: [{ shaderLocation: 0, format: "float32x3", offset: 0 }],
          },
          {
            arrayStride: 12,
            attributes: [{ shaderLocation: 1, format: "float32x3", offset: 0 }],
          },
          {
            arrayStride: 8,
            attributes: [{ shaderLocation: 2, format: "float32x2", offset: 0 }],
          },
        ],
      },
      fragment: {
        module: this.device.createShaderModule({ code: shader.fragment }),
        entryPoint: "main",
        targets: [{
            format: presentationFormat,
            blend: {
              color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            },
        }],
      },
      primitive: { topology: "triangle-list" },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });

    // --- Background Pipeline ---
    const backgroundShader = BackgroundShaders();
    const bgData = FullScreenQuadData();
    this.backgroundVertexBuffer = this.CreateGPUBuffer(this.device, bgData.positions);

    this.backgroundPipeline = this.device.createRenderPipeline({
        label: 'background pipeline',
        layout: 'auto',
        vertex: {
            module: this.device.createShaderModule({ code: backgroundShader.vertex }),
            entryPoint: 'main',
            buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }] }]
        },
        fragment: {
            module: this.device.createShaderModule({ code: backgroundShader.fragment }),
            entryPoint: 'main',
            targets: [{ format: presentationFormat }]
        },
        primitive: { topology: 'triangle-list' }
    });

    this.backgroundUniformBuffer = this.device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.backgroundBindGroup = this.device.createBindGroup({
        layout: this.backgroundPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: this.backgroundUniformBuffer } }]
    });

    // Init background colors
    const bgColors = this.currentTheme.backgroundColors;
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 16, new Float32Array(bgColors[0]));
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 32, new Float32Array(bgColors[1]));
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 48, new Float32Array(bgColors[2]));

    // --- Grid Pipeline ---
    const gridShader = GridShader();
    const gridData = GridData();
    this.gridVertexCount = gridData.length / 3;
    this.gridVertexBuffer = this.CreateGPUBuffer(this.device, gridData);

    this.gridPipeline = this.device.createRenderPipeline({
        label: 'grid pipeline',
        layout: 'auto',
        vertex: {
            module: this.device.createShaderModule({ code: gridShader.vertex }),
            entryPoint: 'main',
            buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }] }]
        },
        fragment: {
            module: this.device.createShaderModule({ code: gridShader.fragment }),
            entryPoint: 'main',
            targets: [{
                format: presentationFormat,
                blend: {
                    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
                }
            }]
        },
        primitive: { topology: 'line-list' },
        depthStencil: {
            format: "depth24plus",
            depthWriteEnabled: false,
            depthCompare: "less",
        }
    });


    // --- Particle Pipeline ---
    const particleShader = ParticleShaders();
    this.particlePipeline = this.device.createRenderPipeline({
        label: 'particle pipeline',
        layout: 'auto',
        vertex: {
            module: this.device.createShaderModule({ code: particleShader.vertex }),
            entryPoint: 'main',
            buffers: [
                {
                    arrayStride: 32,
                    stepMode: 'instance',
                    attributes: [
                        { shaderLocation: 0, format: 'float32x3', offset: 0 },
                        { shaderLocation: 1, format: 'float32x4', offset: 12 },
                        { shaderLocation: 2, format: 'float32',   offset: 28 },
                    ]
                }
            ]
        },
        fragment: {
            module: this.device.createShaderModule({ code: particleShader.fragment }),
            entryPoint: 'main',
            targets: [{
                format: presentationFormat,
                blend: {
                    color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
                    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
                }
            }]
        },
        primitive: { topology: 'triangle-list' },
        depthStencil: {
            format: 'depth24plus',
            depthWriteEnabled: false,
            depthCompare: 'less',
        }
    });

    this.particleVertexBuffer = this.device.createBuffer({
        size: 32 * this.maxParticles,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.particleUniformBuffer = this.device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.particleBindGroup = this.device.createBindGroup({
        layout: this.particlePipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: this.particleUniformBuffer } }]
    });

    this.gridBindGroup = this.device.createBindGroup({
        layout: this.gridPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: this.particleUniformBuffer } }]
    });


    // --- Post Process Pipeline ---
    const ppShader = PostProcessShaders();
    this.postProcessPipeline = this.device.createRenderPipeline({
        label: 'post process pipeline',
        layout: 'auto',
        vertex: {
            module: this.device.createShaderModule({ code: ppShader.vertex }),
            entryPoint: 'main',
        },
        fragment: {
            module: this.device.createShaderModule({ code: ppShader.fragment }),
            entryPoint: 'main',
            targets: [{ format: presentationFormat }]
        },
        primitive: { topology: 'triangle-list' }
    });

    this.postProcessUniformBuffer = this.device.createBuffer({
        size: 32, // time(4)+glitch(4)+center(8)+shockTime(4)+pad(12) = 32
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.postProcessBindGroup = this.device.createBindGroup({
        layout: this.postProcessPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: this.offscreenTexture.createView() },
            { binding: 1, resource: this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) },
            { binding: 2, resource: { buffer: this.postProcessUniformBuffer } }
        ]
    });


    // --- Global Uniforms ---
    this.fragmentUniformBuffer = this.device.createBuffer({
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.MODELMATRIX = Matrix.mat4.create();
    this.NORMALMATRIX = Matrix.mat4.create();
    this.VIEWMATRIX = Matrix.mat4.create();
    this.PROJMATRIX = Matrix.mat4.create();

    let eyePosition = [0.0, -20.0, 75.0];
    let lightPosition = new Float32Array([-5.0, 0.0, 0.0]);

    Matrix.mat4.identity(this.VIEWMATRIX);
    Matrix.mat4.lookAt(this.VIEWMATRIX, eyePosition, [9.0, -20.0, 0.0], [0.0, 1.0, 0.0]);

    Matrix.mat4.identity(this.PROJMATRIX);
    let fovy = (35 * Math.PI) / 180;
    Matrix.mat4.perspective(this.PROJMATRIX, fovy, this.canvasWebGPU.width / this.canvasWebGPU.height, 1, 150);

    this.vpMatrix = Matrix.mat4.create();
    Matrix.mat4.identity(this.vpMatrix);
    Matrix.mat4.multiply(this.vpMatrix, this.PROJMATRIX, this.VIEWMATRIX);

    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 0, lightPosition);
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 16, new Float32Array(eyePosition));
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 32, new Float32Array(this.currentTheme[5]));

    this.renderPlayfild_Border_WebGPU();

    this.vertexUniformBuffer = this.device.createBuffer({
      size: this.state.playfield.length * 10 * 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Cache BindGroups
    const maxBlocks = 200;
    this.uniformBindGroup_CACHE = [];
    for (let i = 0; i < maxBlocks; i++) {
        const bindGroup = this.device.createBindGroup({
            label: `block_bindgroup_${i}`,
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.vertexUniformBuffer,
                        offset: i * 256,
                        size: 208,
                    },
                },
                {
                    binding: 1,
                    resource: {
                        buffer: this.fragmentUniformBuffer,
                        offset: 0,
                        size: 80,
                    },
                },
            ],
        });
        this.uniformBindGroup_CACHE.push(bindGroup);
    }

    this.Frame();
  }

  CreateGPUBuffer = (
    device: any,
    data: any,
    usageFlag = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  ) => {
    const buffer = device.createBuffer({
      size: data.byteLength,
      usage: usageFlag,
      mappedAtCreation: true,
    });
    new Float32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();
    return buffer;
  };

  Frame = () => {
    if (!this.device) return;
    const dt = 1.0/60.0;

    // Update timers
    if (this.flashTimer > 0) this.flashTimer = Math.max(0, this.flashTimer - dt);
    if (this.lockTimer > 0) this.lockTimer = Math.max(0, this.lockTimer - dt);
    if (this.shakeTimer > 0) this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    if (this.shockwaveTime > 0) this.shockwaveTime = Math.max(0, this.shockwaveTime - dt * 2.0);

    const time = (performance.now() - this.startTime) / 1000.0;

    // --- Camera Logic ---
    let camX = 0.0;
    let camY = -20.0;
    let camZ = 75.0;

    camX += Math.sin(time * 0.2) * 2.0;
    camY += Math.cos(time * 0.3) * 1.0;

    if (this.shakeTimer > 0) {
        camX += (Math.random() - 0.5) * this.shakeMagnitude;
        camY += (Math.random() - 0.5) * this.shakeMagnitude;
    }

    const eyePosition = new Float32Array([camX, camY, camZ]);
    Matrix.mat4.lookAt(this.VIEWMATRIX, eyePosition, [9.0, -20.0, 0.0], [0.0, 1.0, 0.0]);
    Matrix.mat4.multiply(this.vpMatrix, this.PROJMATRIX, this.VIEWMATRIX);
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 16, eyePosition);

    // --- Particle Logic ---
    const activeParticles: number[] = [];
    for(let i=this.particles.length-1; i>=0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life > 0) {
            p.position[0] += p.velocity[0] * dt;
            p.position[1] += p.velocity[1] * dt;
            p.position[2] += p.velocity[2] * dt;
            p.velocity[1] -= 9.8 * dt; // Gravity
            p.velocity[0] *= 0.98;
            p.velocity[2] *= 0.98;
            p.velocity[0] += (Math.random() - 0.5) * 2.0 * dt;
            p.velocity[2] += (Math.random() - 0.5) * 2.0 * dt;
        } else {
            this.particles.splice(i, 1);
        }
    }

    if (this.particles.length > 0) {
        const data = new Float32Array(this.particles.length * 8);
        for(let i=0; i<this.particles.length; i++) {
            const p = this.particles[i];
            const offset = i * 8;
            data[offset+0] = p.position[0];
            data[offset+1] = p.position[1];
            data[offset+2] = p.position[2];
            data[offset+3] = p.color[0];
            data[offset+4] = p.color[1];
            data[offset+5] = p.color[2];
            data[offset+6] = p.color[3] * p.life;
            data[offset+7] = p.scale * p.life;
        }
        this.device.queue.writeBuffer(this.particleVertexBuffer, 0, data);
    }
    this.device.queue.writeBuffer(this.particleUniformBuffer, 0, this.vpMatrix as Float32Array);

    // Update Uniforms
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 0, new Float32Array([time]));
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 8, new Float32Array([this.canvasWebGPU.width, this.canvasWebGPU.height]));
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 48, new Float32Array([time]));

    // Post Process Uniforms
    const ppData = new Float32Array([
        time,
        this.useGlitch ? 1.0 : 0.0,
        this.shockwaveCenter[0], this.shockwaveCenter[1],
        this.shockwaveTime,
        0.0, 0.0 // Padding
    ]);
    this.device.queue.writeBuffer(this.postProcessUniformBuffer, 0, ppData);

    // --- Render Passes ---
    const commandEncoder = this.device.createCommandEncoder();

    // We render to offscreenTexture
    const textureView = this.offscreenTexture.createView();
    const depthView = this.depthTexture.createView();

    let clearR = 0.0, clearG = 0.0, clearB = 0.0;
    if (this.flashTimer > 0) {
        clearR = this.flashTimer * 0.5;
        clearG = this.flashTimer * 0.5;
        clearB = this.flashTimer * 0.2;
    } else if (this.lockTimer > 0) {
        clearB = this.lockTimer * 0.2;
    }

    // Pass 1: Background & Game Scene
    const renderVideo = this.isVideoPlaying;

    const backgroundPass: GPURenderPassDescriptor = {
        colorAttachments: [{
            view: textureView,
            clearValue: { r: clearR, g: clearG, b: clearB, a: 0.0 },
            loadOp: 'clear',
            storeOp: 'store'
        }]
    };

    if (!renderVideo) {
        const bgPassEncoder = commandEncoder.beginRenderPass(backgroundPass);
        bgPassEncoder.setPipeline(this.backgroundPipeline);
        bgPassEncoder.setVertexBuffer(0, this.backgroundVertexBuffer);
        bgPassEncoder.setBindGroup(0, this.backgroundBindGroup);
        bgPassEncoder.draw(6);
        bgPassEncoder.end();
    } else {
        const bgPassEncoder = commandEncoder.beginRenderPass(backgroundPass);
        bgPassEncoder.end();
    }

    // Render Playfield & Grid & Particles
    this.renderPlayfild_WebGPU(this.state);

    const scenePass: GPURenderPassDescriptor = {
      colorAttachments: [{
          view: textureView,
          loadOp: 'load',
          storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: depthView,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store'
      },
    };

    const passEncoder = commandEncoder.beginRenderPass(scenePass);

    // Draw Grid
    passEncoder.setPipeline(this.gridPipeline);
    passEncoder.setBindGroup(0, this.gridBindGroup);
    passEncoder.setVertexBuffer(0, this.gridVertexBuffer);
    passEncoder.draw(this.gridVertexCount);

    // Draw Blocks
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setVertexBuffer(0, this.vertexBuffer);
    passEncoder.setVertexBuffer(1, this.normalBuffer);
    passEncoder.setVertexBuffer(2, this.uvBuffer);

    let length_border = this.uniformBindGroup_ARRAY_border.length;
    for (let index = 0; index < length_border; index++) {
      passEncoder.setBindGroup(0, this.uniformBindGroup_ARRAY_border[index]);
      passEncoder.draw(this.numberOfVertices);
    }

    let length_blocks = this.uniformBindGroup_ARRAY.length;
    for (let index = 0; index < length_blocks; index++) {
      passEncoder.setBindGroup(0, this.uniformBindGroup_ARRAY[index]);
      passEncoder.draw(this.numberOfVertices);
    }

    // Draw Particles
    if (this.particles.length > 0) {
        passEncoder.setPipeline(this.particlePipeline);
        passEncoder.setBindGroup(0, this.particleBindGroup);
        passEncoder.setVertexBuffer(0, this.particleVertexBuffer);
        passEncoder.draw(6, this.particles.length, 0, 0);
    }
    passEncoder.end();

    // Pass 2: Post Process to Screen
    const finalPass: GPURenderPassDescriptor = {
        colorAttachments: [{
            view: this.ctxWebGPU.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store'
        }]
    };

    const ppEncoder = commandEncoder.beginRenderPass(finalPass);
    ppEncoder.setPipeline(this.postProcessPipeline);
    ppEncoder.setBindGroup(0, this.postProcessBindGroup);
    ppEncoder.draw(3); // Full screen triangle
    ppEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
    requestAnimationFrame(this.Frame);
  };

  async renderPlayfild_WebGPU({ playfield }: any) {
    if (!this.device) return;

    this.x += 0.01;
    const playfield_length = playfield.length;

    this.uniformBindGroup_ARRAY = [];
    let blockIndex = 0;

    for (let row = 0; row < playfield_length; row++) {
      for (let colom = 0; colom < playfield[row].length; colom++) {
        if (!playfield[row][colom]) {
          continue;
        }
        if (blockIndex >= this.uniformBindGroup_CACHE.length) break;

        let value = playfield[row][colom];
        let colorBlockindex = Math.abs(value);
        let alpha = value < 0 ? 0.3 : 1.0;

        let color = this.currentTheme[colorBlockindex];
        if (!color) color = this.currentTheme[0];

        let uniformBindGroup_next = this.uniformBindGroup_CACHE[blockIndex];
        const offset_ARRAY = blockIndex * 256;

        Matrix.mat4.identity(this.MODELMATRIX);
        Matrix.mat4.identity(this.NORMALMATRIX);

        Matrix.mat4.translate(this.MODELMATRIX, this.MODELMATRIX, [
          colom * 2.2,
          row * -2.2,
          0.0,
        ]);

        Matrix.mat4.identity(this.NORMALMATRIX);
        Matrix.mat4.invert(this.NORMALMATRIX, this.MODELMATRIX);
        Matrix.mat4.transpose(this.NORMALMATRIX, this.NORMALMATRIX);

        this.device.queue.writeBuffer(this.vertexUniformBuffer, offset_ARRAY + 0, this.vpMatrix);
        this.device.queue.writeBuffer(this.vertexUniformBuffer, offset_ARRAY + 64, this.MODELMATRIX);
        this.device.queue.writeBuffer(this.vertexUniformBuffer, offset_ARRAY + 128, this.NORMALMATRIX);
        this.device.queue.writeBuffer(this.vertexUniformBuffer, offset_ARRAY + 192, new Float32Array([...color, alpha]));

        this.uniformBindGroup_ARRAY.push(uniformBindGroup_next);
        blockIndex++;
      }
    }
  }

  async renderPlayfild_Border_WebGPU() {
    if (!this.device) return;
    const state_Border = {
      playfield: [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      ],
    };

    this.x += 0.01;
    const playfield_length = state_Border.playfield.length;
    const vertexUniformSizeBuffer = 200 * 256;

    this.vertexUniformBuffer_border = this.device.createBuffer({
      size: vertexUniformSizeBuffer,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.uniformBindGroup_ARRAY_border = [];
    let offset_ARRAY = 0;

    for (let row = 0; row < playfield_length; row++) {
      for (let colom = 0; colom < state_Border.playfield[row].length; colom++) {
        if (!state_Border.playfield[row][colom]) {
          continue;
        }

        let uniformBindGroup_next = this.device.createBindGroup({
          label : "uniformBindGroup_next 635",
          layout: this.pipeline.getBindGroupLayout(0),
          entries: [
            {
              binding: 0,
              resource: {
                buffer: this.vertexUniformBuffer_border,
                offset: offset_ARRAY,
                size: 208,
              },
            },
            {
              binding: 1,
              resource: {
                buffer: this.fragmentUniformBuffer,
                offset: 0,
                size: 80, // Size matched to shader expectation
              },
            },
          ],
        });

        Matrix.mat4.identity(this.MODELMATRIX);
        Matrix.mat4.identity(this.NORMALMATRIX);

        Matrix.mat4.translate(this.MODELMATRIX, this.MODELMATRIX, [
          colom * 2.2 - 2.2,
          row * -2.2 + 2.2,
          0.0,
        ]);

        Matrix.mat4.identity(this.NORMALMATRIX);
        Matrix.mat4.invert(this.NORMALMATRIX, this.MODELMATRIX);
        Matrix.mat4.transpose(this.NORMALMATRIX, this.NORMALMATRIX);

        this.device.queue.writeBuffer(this.vertexUniformBuffer_border, offset_ARRAY + 0, this.vpMatrix);
        this.device.queue.writeBuffer(this.vertexUniformBuffer_border, offset_ARRAY + 64, this.MODELMATRIX);
        this.device.queue.writeBuffer(this.vertexUniformBuffer_border, offset_ARRAY + 128, this.NORMALMATRIX);
        this.device.queue.writeBuffer(this.vertexUniformBuffer_border, offset_ARRAY + 192, new Float32Array([...this.currentTheme.border, 1.0]));

        this.uniformBindGroup_ARRAY_border.push(uniformBindGroup_next);
        offset_ARRAY += 256;
      }
    }
  }

  CheckWebGPU = () => {
    let description = "Great, your current browser supports WebGPU!";
    let result = true;
    if (!navigator.gpu) {
      description = `Your current browser does not support WebGPU! Make sure you are on a system 
                         with WebGPU enabled. Currently, SPIR-WebGPU is only supported in  
                         <a href="https://www.google.com/chrome/canary/">Chrome canary</a>
                         with the flag "enable-unsafe-webgpu" enabled. See the 
                         <a href="https://github.com/gpuweb/gpuweb/wiki/Implementation-Status"> 
                         Implementation Status</a> page for more details.                   
                        `;
      result = false;
    }
    return { result, description };
  };
}
