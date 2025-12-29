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

            let cross1 = max(1.0 - smoothstep(0.0, 0.3, uvCentered.x), 1.0 - smoothstep(0.0, 0.3, uvCentered.y));
            let cross2 = max(1.0 - smoothstep(0.0, 0.3, uvrCentered.x), 1.0 - smoothstep(0.0, 0.3, uvrCentered.y));

            let sparkle = max(cross1, cross2 * 0.7); // Main cross + smaller diagonal cross

            // Combine
            let alpha = intensity + sparkle * 0.6;
            let finalAlpha = clamp(alpha * color.a, 0.0, 1.0);

            return vec4<f32>(color.rgb * 2.0, finalAlpha); // Boost brightness
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
          // Four layers of grids at different scales for depth
          for (var layer: i32 = 0; layer < 4; layer++) {
            let layer_f = f32(layer);
            let scale = exp2(layer_f); // 1.0, 2.0, 4.0, 8.0
            let speed = 0.1 + layer_f * 0.05;

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
          let neonCyan = uniforms.color1;
          let neonPurple = uniforms.color2;
          let neonBlue = uniforms.color3;

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
          let pulse = sin(time * 1.5) * 0.15 + 0.85;

          // Combine all elements
          var finalColor = deepSpace;
          finalColor = mix(finalColor, gridColor * pulse, grid * 0.6);
          finalColor += lights;

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


const Shaders = () => {
  let params: any = {};
  // define default input values:
  params.color = "(0.0, 1.0, 0.0)";
  params.ambientIntensity = "0.4"; // Slightly brighter ambient
  params.diffuseIntensity = "0.9";
  params.specularIntensity = "2.0"; // High specular for glass/crystal
  params.shininess = "128.0"; // Very sharp highlights
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
                time : f32, // Added time
            };
            @binding(1) @group(0) var<uniform> uniforms : Uniforms;

            @fragment
            fn main(@location(0) vPosition: vec4<f32>, @location(1) vNormal: vec4<f32>,@location(2) vColor: vec4<f32>, @location(3) vUV: vec2<f32>) ->  @location(0) vec4<f32> {
               
                // --- Fake Beveling ---
                // Perturb normal based on UV edge distance
                var N:vec3<f32> = normalize(vNormal.xyz);

                // Approximate tangent space basis from normal
                // (Assumes axis-aligned cubes mostly)
                var tangent = vec3<f32>(1.0, 0.0, 0.0);
                if (abs(N.x) > 0.9) { tangent = vec3<f32>(0.0, 1.0, 0.0); }
                let bitangent = cross(N, tangent);
                tangent = cross(bitangent, N);

                let bevelSize = 0.1;
                let bevelStrength = 0.5;

                // Simple UV based perturbation
                let dx = (vUV.x - 0.5) * 2.0; // -1 to 1
                let dy = (vUV.y - 0.5) * 2.0; // -1 to 1

                // Tilt normal at edges
                if (abs(dx) > (1.0 - bevelSize)) {
                    let signX = sign(dx);
                    // This is rough approximation, assuming tangent aligns with U
                    N = normalize(N + tangent * signX * bevelStrength * (abs(dx) - (1.0-bevelSize))/bevelSize);
                }
                if (abs(dy) > (1.0 - bevelSize)) {
                    let signY = sign(dy);
                    // This is rough approximation, assuming bitangent aligns with V
                    // Note: UV orientation varies by face in CubeData, this might be flipped on some faces but gives visual interest regardless
                    N = normalize(N - bitangent * signY * bevelStrength * (abs(dy) - (1.0-bevelSize))/bevelSize);
                }


                let L:vec3<f32> = normalize(uniforms.lightPosition.xyz - vPosition.xyz);
                let V:vec3<f32> = normalize(uniforms.eyePosition.xyz - vPosition.xyz);
                let H:vec3<f32> = normalize(L + V);

                // --- Lighting ---
                let diffuse:f32 = 0.9 * max(dot(N, L), 0.0);

                var specular:f32;
                // Blinn-Phong
                specular = ${params.specularIntensity} * pow(max(dot(N, H),0.0), ${params.shininess});

                let ambient:f32 = ${params.ambientIntensity};

                // --- Base Color Calculation ---
                var baseColor = vColor.xyz;

                // Make colors a bit more vibrant
                // baseColor = pow(baseColor, vec3<f32>(0.8));

                var finalColor:vec3<f32> = baseColor * (ambient + diffuse) + vec3<f32>${params.specularColor}*specular;

                // --- Fresnel Effect (Iridescent Rim Light) ---
                let fresnelPower = 3.0;
                let fresnelTerm = pow(1.0 - max(dot(N, V), 0.0), fresnelPower);

                // Chromatic Aberration for Fresnel
                let offset = 0.05;
                let iriColorR = 0.5 + 0.5 * sin(uniforms.time + vPosition.x * 0.5);
                let iriColorG = 0.5 + 0.5 * sin(uniforms.time + vPosition.x * 0.5 + offset);
                let iriColorB = 0.5 + 0.5 * sin(uniforms.time + vPosition.x * 0.5 + offset * 2.0);

                let iriColor = vec3<f32>(iriColorR, iriColorG, iriColorB);

                finalColor += iriColor * fresnelTerm * 2.5;

                // --- Inner Tech Lattice / Grid ---
                let uvScale = 4.0;
                let gridUV = fract(vUV * uvScale);
                let gridThickness = 0.05;

                // Secondary finer grid
                let subGridUV = fract(vUV * uvScale * 4.0);
                let subGridLineX = smoothstep(0.0, 0.02, subGridUV.x) * (1.0 - smoothstep(1.0 - 0.02, 1.0, subGridUV.x));
                let subGridLineY = smoothstep(0.0, 0.02, subGridUV.y) * (1.0 - smoothstep(1.0 - 0.02, 1.0, subGridUV.y));
                let subGridLines = 1.0 - (subGridLineX * subGridLineY);

                let gridLineX = smoothstep(0.0, gridThickness, gridUV.x) * (1.0 - smoothstep(1.0 - gridThickness, 1.0, gridUV.x));
                let gridLineY = smoothstep(0.0, gridThickness, gridUV.y) * (1.0 - smoothstep(1.0 - gridThickness, 1.0, gridUV.y));
                let gridLines = 1.0 - (gridLineX * gridLineY);

                // Pulsing energy in the grid
                let energyPulse = sin(uniforms.time * 3.0 - vPosition.y) * 0.5 + 0.5;
                if (gridLines > 0.5) {
                   // Add a "deep" glow to the grid lines
                   finalColor += baseColor * energyPulse * 1.2;
                   finalColor += vec3<f32>(0.8, 0.9, 1.0) * energyPulse * 0.5; // White hot core
                }

                if (subGridLines > 0.5 && gridLines < 0.5) {
                    // Faint subgrid
                    finalColor += baseColor * 0.2;
                }

                // --- Edge Glow ---
                let uvCentered = abs(vUV - 0.5) * 2.0;
                let edgeWidth = 0.08; // Slightly thicker
                let edgeFactorX = smoothstep(1.0 - edgeWidth, 1.0, uvCentered.x);
                let edgeFactorY = smoothstep(1.0 - edgeWidth, 1.0, uvCentered.y);
                let edgeFactor = max(edgeFactorX, edgeFactorY);

                if (edgeFactor > 0.0) {
                     let glowColor = vec3<f32>(1.0, 1.0, 1.0);
                     finalColor = mix(finalColor, glowColor, edgeFactor * 0.9);
                }

                // --- Ghost Piece Rendering (Alpha < 0.9) ---
                if (vColor.w < 0.9) {
                    // Holographic Wireframe
                    let ghostPulse = sin(uniforms.time * 8.0) * 0.3 + 0.5;

                    // Scanline effect
                    let scanline = step(0.5, sin(vUV.y * 50.0 + uniforms.time * 5.0));

                    // Glitch offset
                    let glitch = step(0.98, sin(uniforms.time * 20.0 + vUV.y * 10.0));

                    let ghostColor = mix(vColor.xyz, vec3<f32>(0.0, 1.0, 1.0), 0.5); // Cyan tint

                    // Only edges + scanlines
                    var finalGhost = ghostColor * (edgeFactor + scanline * 0.2);

                    if (glitch > 0.5) {
                        finalGhost += vec3<f32>(1.0); // White flash
                    }

                    return vec4<f32>(finalGhost, 0.4 * ghostPulse);
                }

                return vec4<f32>(finalColor, vColor.w);
            }`;

  return {
    vertex,
    fragment,
  };
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
  uvBuffer!: GPUBuffer; // Add UV buffer
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
  uniformBindGroup_ARRAY_border: GPUBindGroup[] = [];
  x: number = 0;

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
  maxParticles: number = 4000; // Increased limit

  // Video Background
  videoElement: HTMLVideoElement;
  isVideoPlaying: boolean = false;
  currentLevel: number = 0;
  currentVideoSrc: string = ''; // Track current video source for comparison

  // Visual Effects
  flashTimer: number = 0;
  lockTimer: number = 0;
  shakeTimer: number = 0;
  shakeMagnitude: number = 0;

  themes: Themes = {
    pastel: {
      0: [0.3, 0.3, 0.3],
      1: [0.69, 0.92, 0.95], // I
      2: [0.73, 0.87, 0.98], // J
      3: [1.0, 0.8, 0.74],   // L
      4: [1.0, 0.98, 0.77], // O
      5: [0.78, 0.9, 0.79],  // S
      6: [0.88, 0.75, 0.91], // T
      7: [1.0, 0.8, 0.82],   // Z
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
      1: [0.0, 1.0, 1.0], // Cyan for I
      2: [0.0, 0.0, 1.0], // Blue for J
      3: [1.0, 0.5, 0.0], // Orange for L
      4: [1.0, 1.0, 0.0], // Yellow for O
      5: [0.0, 1.0, 0.0], // Green for S
      6: [0.5, 0.0, 1.0], // Purple for T
      7: [1.0, 0.0, 0.0], // Red for Z
      border: [1.0, 1.0, 1.0],
      levelVideos: DEFAULT_LEVEL_VIDEOS,
      backgroundColors: [
        [0.0, 0.9, 1.0], // Neon Cyan
        [0.8, 0.3, 1.0], // Neon Purple
        [0.2, 0.5, 1.0]  // Neon Blue
      ]
    },
    future: {
      0: [0.1, 0.1, 0.1],
      1: [0.0, 0.9, 0.9], // Cyan
      2: [0.0, 0.2, 0.9], // Blue
      3: [0.9, 0.4, 0.0], // Orange
      4: [0.9, 0.9, 0.0], // Yellow
      5: [0.0, 0.9, 0.0], // Green
      6: [0.6, 0.0, 0.9], // Purple
      7: [0.9, 0.0, 0.0], // Red
      border: [0.5, 0.8, 1.0],
      levelVideos: DEFAULT_LEVEL_VIDEOS,
      backgroundColors: [
        [0.0, 0.9, 0.9], // Cyan
        [0.6, 0.0, 0.9], // Purple
        [0.0, 0.2, 0.9]  // Deep Blue
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

    // Setup Video Element
    this.videoElement = document.createElement('video');
    this.videoElement.autoplay = true;
    this.videoElement.loop = true;
    this.videoElement.muted = true;
    this.videoElement.style.position = 'absolute';
    this.videoElement.style.zIndex = '-1'; // Behind canvas
    this.videoElement.style.display = 'none';
    this.videoElement.style.objectFit = 'contain';

    // Fallback detection
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

    // Position video element to match playfield inner area
    this.updateVideoPosition();

    this.state = {
      playfield: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ],
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
    // 1. Calculate a "Portal" size that matches the Tetris aspect ratio (10 cols x 20 rows = 1:2)
    // We base it on height to ensure it fits on screen
    const portalHeight = this.height * 0.9; // 90% of screen height
    const portalWidth = portalHeight * 0.5; // Aspect ratio 0.5 (10/20)

    // 2. Center the video container on the screen
    const centerX = (this.width - portalWidth) / 2;
    const centerY = (this.height - portalHeight) / 2;

    this.videoElement.style.left = `${centerX}px`;
    this.videoElement.style.top = `${centerY}px`;
    this.videoElement.style.width = `${portalWidth}px`;
    this.videoElement.style.height = `${portalHeight}px`;

    // 3. Ensure the video fills this portal completely
    this.videoElement.style.objectFit = 'cover';

    // 4. Optional: Add a border/glow to the video to frame the portal
    this.videoElement.style.boxShadow = '0 0 50px rgba(0, 200, 255, 0.2)';
    this.videoElement.style.borderRadius = '4px';
  }

  updateVideoForLevel(level: number) {
    const levelVideos = this.currentTheme.levelVideos;
    
    if (!levelVideos || levelVideos.length === 0) {
      // No videos configured for this theme
      this.videoElement.pause();
      this.videoElement.src = "";
      this.videoElement.style.display = 'none';
      this.isVideoPlaying = false;
      return;
    }

    // Cap level to available videos (uses last video for levels exceeding array length)
    const videoIndex = Math.min(level, levelVideos.length - 1);
    const videoSrc = levelVideos[videoIndex];

    // Only update if the source is different from what we're tracking
    if (this.currentVideoSrc === videoSrc) {
      return; // Already playing the correct video
    }

    this.currentVideoSrc = videoSrc;
    this.isVideoPlaying = false; // Reset state
    if (videoSrc) {
      this.videoElement.src = videoSrc;
      // Don't show immediately, wait for 'playing' event
      this.videoElement.play().catch(e => {
        console.log("Video autoplay failed", e);
        // Fallback handled by catch + error listener
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

    // Recalculate playfield dimensions
    this.playfildWidth = (this.width * 2) / 3;
    this.playfildHeight = this.height;
    this.playfildInnerWidth = this.playfildWidth - this.playfildBorderWidth * 2;
    this.playfildInnerHeight = this.playfildHeight - this.playfildBorderWidth * 2 - 2;

    // Update video position with new dimensions
    this.updateVideoPosition();

    const devicePixelRatio = window.devicePixelRatio || 1;
    const presentationSize = [
      this.canvasWebGPU.width * devicePixelRatio,
      this.canvasWebGPU.height * devicePixelRatio,
    ];
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    this.ctxWebGPU.configure({
      device: this.device,
      format: presentationFormat,
      alphaMode: 'premultiplied',
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
    this.currentLevel = 0; // Reset to level 0 when theme changes

    // Handle Video Background - start with level 0 video
    this.updateVideoForLevel(0);

    // Re-render border if possible, but borders are static buffers.
    // We need to re-create border buffers or update them.
    // renderPlayfild_Border_WebGPU handles re-creation of uniformBindGroup_ARRAY_border?
    // It creates new buffers. So calling it is fine, but we must clear old ones ideally.
    // For now JS GC will handle it, but WebGPU resources might leak if not careful.
    // Given the scope, it's fine.
    if (this.device) {
        this.renderPlayfild_Border_WebGPU();
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

          // Main fill
          ctx.fillStyle = `rgb(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255})`;
          ctx.fillRect(px, py, blockSize, blockSize);

          // Top/Left Highlight (Bevel)
          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.beginPath();
          ctx.moveTo(px, py + blockSize);
          ctx.lineTo(px, py);
          ctx.lineTo(px + blockSize, py);
          ctx.lineTo(px + blockSize - 4, py + 4);
          ctx.lineTo(px + 4, py + 4);
          ctx.lineTo(px + 4, py + blockSize - 4);
          ctx.closePath();
          ctx.fill();

          // Bottom/Right Shadow (Bevel)
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.beginPath();
          ctx.moveTo(px + blockSize, py);
          ctx.lineTo(px + blockSize, py + blockSize);
          ctx.lineTo(px, py + blockSize);
          ctx.lineTo(px + 4, py + blockSize - 4);
          ctx.lineTo(px + blockSize - 4, py + blockSize - 4);
          ctx.lineTo(px + blockSize - 4, py + 4);
          ctx.closePath();
          ctx.fill();

          // Center Highlight
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.fillRect(px + 5, py + 5, blockSize - 10, blockSize - 10);
        }
      });
    });
  }

  onLineClear(lines: number[]) {
      this.flashTimer = 1.0;
      this.shakeTimer = 0.5; // Shake on line clear
      this.shakeMagnitude = 0.5;

      // Emit particles for each cleared line
      lines.forEach(y => {
          const worldY = y * -2.2;
          const worldX = 4.5 * 2.2; // Center horizontally

          // More particles, gold/white explosion
          this.emitParticles(worldX, worldY, 0.0, 100, [1.0, 0.9, 0.5, 1.0]);
      });
  }

  onLock() {
      this.lockTimer = 0.3;
      this.shakeTimer = 0.1;
      this.shakeMagnitude = 0.1;
  }

  onHardDrop(x: number, y: number, distance: number) {
      // Create a vertical trail of particles
      const worldX = x * 2.2;
      // Start from top of drop
      const startRow = y - distance;

      for(let i=0; i<distance; i++) {
          const r = startRow + i;
          const worldY = r * -2.2;
          // More particles per block, blue/cyan trail
          this.emitParticles(worldX, worldY, 0.0, 8, [0.4, 0.8, 1.0, 0.8]);
      }

      // Impact particles at bottom
      this.emitParticles(worldX, y * -2.2, 0.0, 20, [0.8, 0.9, 1.0, 1.0]);

      // Increase shake
      this.shakeTimer = 0.4;
      this.shakeMagnitude = 0.8; // Stronger shake
  }

  emitParticles(x: number, y: number, z: number, count: number, color: number[]) {
      for(let i=0; i<count; i++) {
          if (this.particles.length >= this.maxParticles) break;

          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 8.0 + 2.0;

          this.particles.push({
              position: new Float32Array([x, y, z]),
              velocity: new Float32Array([
                  Math.cos(angle)*speed,
                  Math.sin(angle)*speed + 5.0, // Upward bias
                  (Math.random()-0.5)*10.0
              ]),
              color: new Float32Array(color),
              life: 1.0 + Math.random() * 0.5,
              scale: Math.random() * 0.4 + 0.1
          });
      }
  }

  renderMainScreen(state: any) {
    // Check if level has changed and update video accordingly
    if (state.level !== this.currentLevel) {
      this.currentLevel = state.level;
      this.updateVideoForLevel(this.currentLevel);
    }

    // this.clearScreen(state);
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

  clearScreen({ lines, score }: any) {
    // Deprecated DOM manipulation
  }

  renderStartScreen() {
      // Handled by UI overlay
  }

  renderPauseScreen() {
      // Handled by UI overlay
  }

  renderEndScreen({ score }: any) {
    const el = document.getElementById('game-over');
    if (el) el.style.display = 'block';
  }

  //// ***** WEBGPU ***** ////

  async preRender() {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return; // Should handle error
    this.device = await adapter.requestDevice();

    const devicePixelRatio = window.devicePixelRatio || 1;
    const presentationSize = [
      this.canvasWebGPU.width * devicePixelRatio,
      this.canvasWebGPU.height * devicePixelRatio,
    ];
   // const presentationFormat = this.ctxWebGPU.getPreferredFormat(adapter);
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    this.ctxWebGPU.configure({
      device: this.device,
      format: presentationFormat,
      alphaMode: 'premultiplied',
    });

    // --- Main Block Pipeline ---
    const shader = Shaders();
    const cubeData = CubeData();

    this.numberOfVertices = cubeData.positions.length / 3;
    this.vertexBuffer = this.CreateGPUBuffer(this.device, cubeData.positions);
    this.normalBuffer = this.CreateGPUBuffer(this.device, cubeData.normals);
    this.uvBuffer = this.CreateGPUBuffer(this.device, cubeData.uvs); // Create UV buffer

    this.pipeline = this.device.createRenderPipeline({
      label: 'main pipeline',
      layout: "auto",
      vertex: {
        module: this.device.createShaderModule({
          code: shader.vertex,
        }),
        entryPoint: "main",
        buffers: [
          {
            arrayStride: 12,
            attributes: [
              {
                shaderLocation: 0,
                format: "float32x3",
                offset: 0,
              },
            ],
          },
          {
            arrayStride: 12,
            attributes: [
              {
                shaderLocation: 1,
                format: "float32x3",
                offset: 0,
              },
            ],
          },
          {
            arrayStride: 8, // vec2<f32>
            attributes: [
              {
                shaderLocation: 2,
                format: "float32x2",
                offset: 0,
              },
            ],
          },
        ],
      },
      fragment: {
        module: this.device.createShaderModule({
          code: shader.fragment,
        }),
        entryPoint: "main",
        targets: [
          {
            format: presentationFormat,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
      },
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
            buffers: [{
                arrayStride: 12,
                attributes: [{ shaderLocation: 0, format: 'float32x3', offset: 0 }]
            }]
        },
        fragment: {
            module: this.device.createShaderModule({ code: backgroundShader.fragment }),
            entryPoint: 'main',
            targets: [{ format: presentationFormat }]
        },
        primitive: { topology: 'triangle-list' }
    });

    // Background Uniforms
    this.backgroundUniformBuffer = this.device.createBuffer({
        size: 64, // time(4)+pad(4)+res(8) + 3*colors(16*3=48) = 64
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.backgroundBindGroup = this.device.createBindGroup({
        layout: this.backgroundPipeline.getBindGroupLayout(0),
        entries: [{
            binding: 0,
            resource: { buffer: this.backgroundUniformBuffer }
        }]
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
                // Interleaved buffer: pos(3) + color(4) + scale(1) = 8 floats = 32 bytes
                {
                    arrayStride: 32,
                    stepMode: 'instance', // We are drawing quads (6 verts) per instance
                    attributes: [
                        { shaderLocation: 0, format: 'float32x3', offset: 0 },  // pos
                        { shaderLocation: 1, format: 'float32x4', offset: 12 }, // color
                        { shaderLocation: 2, format: 'float32',   offset: 28 }, // scale
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
                    color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' }, // Additive blending for glow
                    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
                }
            }]
        },
        primitive: { topology: 'triangle-list' },
        depthStencil: {
            format: 'depth24plus',
            depthWriteEnabled: false, // Particles don't write to depth
            depthCompare: 'less',
        }
    });

    // Create initial particle buffer (enough for max particles)
    // 32 bytes per particle * maxParticles
    this.particleVertexBuffer = this.device.createBuffer({
        size: 32 * this.maxParticles,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.particleUniformBuffer = this.device.createBuffer({
        size: 64, // Mat4 for ViewProjection
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.particleBindGroup = this.device.createBindGroup({
        layout: this.particlePipeline.getBindGroupLayout(0),
        entries: [{
            binding: 0,
            resource: { buffer: this.particleUniformBuffer }
        }]
    });


    //create uniform buffer and layout
    this.fragmentUniformBuffer = this.device.createBuffer({
      size: 80, // Need more space for time (offset 48) + padding
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.MODELMATRIX = Matrix.mat4.create();
    this.NORMALMATRIX = Matrix.mat4.create();
    this.VIEWMATRIX = Matrix.mat4.create();
    this.PROJMATRIX = Matrix.mat4.create();

    let eyePosition = [0.0, -20.0, 75.0];
    // Apply shake
    if (this.shakeTimer > 0) {
        const shakeX = (Math.random() - 0.5) * this.shakeMagnitude;
        const shakeY = (Math.random() - 0.5) * this.shakeMagnitude;
        eyePosition[0] += shakeX;
        eyePosition[1] += shakeY;
    }

    let lightPosition = new Float32Array([-5.0, 0.0, 0.0]);

    Matrix.mat4.identity(this.VIEWMATRIX);
    Matrix.mat4.lookAt(
      this.VIEWMATRIX,
      eyePosition,
      [9.0, -20.0, 0.0], // target
      [0.0, 1.0, 0.0] // up
    );

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

    this.device.queue.writeBuffer(
      this.fragmentUniformBuffer,
      0,
      lightPosition
    );
    this.device.queue.writeBuffer(
      this.fragmentUniformBuffer,
      16,
      new Float32Array(eyePosition)
    );
    this.device.queue.writeBuffer(
      this.fragmentUniformBuffer,
      32,
      new Float32Array(this.currentTheme[5])
    );

    this.renderPlayfild_Border_WebGPU();

    this.vertexUniformBuffer = this.device.createBuffer({
      size: this.state.playfield.length * 10 * 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
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
    const dt = 1.0/60.0; // Approx dt

    // Update visual effects
    if (this.flashTimer > 0) this.flashTimer -= dt;
    if (this.flashTimer < 0) this.flashTimer = 0;

    if (this.lockTimer > 0) this.lockTimer -= dt;
    if (this.lockTimer < 0) this.lockTimer = 0;

    if (this.shakeTimer > 0) this.shakeTimer -= dt;
    if (this.shakeTimer < 0) this.shakeTimer = 0;

    // Update particles
    const activeParticles: number[] = [];
    for(let i=this.particles.length-1; i>=0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life > 0) {
            // Update pos
            p.position[0] += p.velocity[0] * dt;
            p.position[1] += p.velocity[1] * dt;
            p.position[2] += p.velocity[2] * dt;

            // Gravity with some turbulence
            p.velocity[1] -= 9.8 * dt;

            // Simple drag
            p.velocity[0] *= 0.98;
            p.velocity[2] *= 0.98;

            // Add turbulence
            p.velocity[0] += (Math.random() - 0.5) * 2.0 * dt;
            p.velocity[2] += (Math.random() - 0.5) * 2.0 * dt;

            // Build buffer data
            activeParticles.push(i);
        } else {
            this.particles.splice(i, 1);
        }
    }

    // Write particle buffer
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
            data[offset+6] = p.color[3] * p.life; // Fade out

            data[offset+7] = p.scale * p.life; // Shrink
        }
        this.device.queue.writeBuffer(this.particleVertexBuffer, 0, data);

        // Update uniforms for particles (sharing VP matrix)
        this.device.queue.writeBuffer(this.particleUniformBuffer, 0, this.vpMatrix as Float32Array);
    }

    // Update time for background and blocks
    const currentTime = (performance.now() - this.startTime) / 1000.0;

    // Background time
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 0, new Float32Array([currentTime]));
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 8, new Float32Array([this.canvasWebGPU.width, this.canvasWebGPU.height]));

    // Block shader time (global update once per frame)
    // 48 is the offset for 'time' in fragmentUniformBuffer
    this.device.queue.writeBuffer(this.fragmentUniformBuffer, 48, new Float32Array([currentTime]));

    let textureView = this.ctxWebGPU.getCurrentTexture().createView();
    const depthTexture = this.device.createTexture({
      size: [this.canvasWebGPU.width, this.canvasWebGPU.height, 1],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    // 1. Render Background
    // Only render procedural background if video is not active (or create a transparent pass)
    // We use actual playback state to decide
    const renderVideo = this.isVideoPlaying;

    // Flash effect color
    let clearR = 0.0;
    let clearG = 0.0;
    let clearB = 0.0;

    if (this.flashTimer > 0) {
        // Flash white/gold on line clear
        clearR = this.flashTimer * 0.5;
        clearG = this.flashTimer * 0.5;
        clearB = this.flashTimer * 0.2;
    } else if (this.lockTimer > 0) {
        // Slight blue flash on lock
        clearB = this.lockTimer * 0.2;
    }

    const backgroundPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [{
            view: textureView,
            clearValue: { r: clearR, g: clearG, b: clearB, a: 0.0 }, // Transparent clear with effect
            loadOp: 'clear',
            storeOp: 'store'
        }]
    };

    const commandEncoder = this.device.createCommandEncoder();

    if (!renderVideo) {
        const bgPassEncoder = commandEncoder.beginRenderPass(backgroundPassDescriptor);
        bgPassEncoder.setPipeline(this.backgroundPipeline);
        bgPassEncoder.setVertexBuffer(0, this.backgroundVertexBuffer);
        bgPassEncoder.setBindGroup(0, this.backgroundBindGroup);
        bgPassEncoder.draw(6); // 2 triangles
        bgPassEncoder.end();
    } else {
        // Video is playing, just clear transparency
        const bgPassEncoder = commandEncoder.beginRenderPass(backgroundPassDescriptor);
        bgPassEncoder.end();
    }


    // 2. Render Playfield
    this.renderPlayfild_WebGPU(this.state);

    this.renderPassDescription = {
      colorAttachments: [
        {
          view: textureView,
          loadOp: 'load', // Load the background
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store'
      },
    };

    const passEncoder = commandEncoder.beginRenderPass(
      this.renderPassDescription
    );

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setVertexBuffer(0, this.vertexBuffer);
    passEncoder.setVertexBuffer(1, this.normalBuffer);
    passEncoder.setVertexBuffer(2, this.uvBuffer);

    let length_of_uniformBindGroup_boder =
      this.uniformBindGroup_ARRAY_border.length;
    for (let index = 0; index < length_of_uniformBindGroup_boder; index++) {
      passEncoder.setBindGroup(0, this.uniformBindGroup_ARRAY_border[index]);
      passEncoder.draw(this.numberOfVertices);
    }

    let length_of_uniformBindGroup = this.uniformBindGroup_ARRAY.length;
    for (let index = 0; index < length_of_uniformBindGroup; index++) {
      passEncoder.setBindGroup(0, this.uniformBindGroup_ARRAY[index]);
      passEncoder.draw(this.numberOfVertices);
    }

    // Draw particles
    if (this.particles.length > 0) {
        passEncoder.setPipeline(this.particlePipeline);
        passEncoder.setBindGroup(0, this.particleBindGroup);
        passEncoder.setVertexBuffer(0, this.particleVertexBuffer);
        passEncoder.draw(6, this.particles.length, 0, 0); // 6 vertices per instance, N instances
    }

    passEncoder.end();
    this.device.queue.submit([commandEncoder.finish()]);
    requestAnimationFrame(this.Frame);
  };

  async renderPlayfild_WebGPU({ playfield }: any) {
    if (!this.device) return;

    // Подготовить буфер юниформов.
    // данный буфер будет перезаписан в каждом кадре
    //

    this.x += 0.01;
    // Размер буфера нужен тольок для тех ячеен в которых значение отлично от ноль
    // но для просто ты Я беру обший размер массива
    const playfield_length = playfield.length;

    this.uniformBindGroup_ARRAY = [];
    let offset_ARRAY = 0;

    for (let row = 0; row < playfield_length; row++) {
      for (let colom = 0; colom < playfield[row].length; colom++) {
        if (!playfield[row][colom]) {
          continue;
        }
        let value = playfield[row][colom];
        let colorBlockindex = Math.abs(value);
        let alpha = value < 0 ? 0.3 : 1.0;

        let color = this.currentTheme[colorBlockindex];
        // If it's a ghost piece, we might want to ensure it has a color even if the index is somehow weird
        if (!color) color = this.currentTheme[0];

        let uniformBindGroup_next = this.device.createBindGroup({
          label : 'uniformBindGroup_next',
          layout: this.pipeline.getBindGroupLayout(0),
          entries: [
            {
              binding: 0,
              resource: {
                buffer: this.vertexUniformBuffer,
                offset: offset_ARRAY,
                size: 208,
              },
            },
            {
              binding: 1,
              resource: {
                buffer: this.fragmentUniformBuffer,
                offset: 0,
                size: 64, // Updated size to include time
              },
            },
          ],
        });

        Matrix.mat4.identity(this.MODELMATRIX);
        Matrix.mat4.identity(this.NORMALMATRIX);

        Matrix.mat4.translate(this.MODELMATRIX, this.MODELMATRIX, [
          colom * 2.2, // выравниваю по размеру модельки одного блока
          row * -2.2,
          0.0,
        ]);

        Matrix.mat4.identity(this.NORMALMATRIX);
        Matrix.mat4.invert(this.NORMALMATRIX, this.MODELMATRIX);
        Matrix.mat4.transpose(this.NORMALMATRIX, this.NORMALMATRIX);

        this.device.queue.writeBuffer(
          this.vertexUniformBuffer,
          offset_ARRAY + 0,
          this.vpMatrix
        );

        this.device.queue.writeBuffer(
          this.vertexUniformBuffer,
          offset_ARRAY + 64,
          this.MODELMATRIX
        );

        this.device.queue.writeBuffer(
          this.vertexUniformBuffer,
          offset_ARRAY + 128,
          this.NORMALMATRIX
        );
        this.device.queue.writeBuffer(
          this.vertexUniformBuffer,
          offset_ARRAY + 192,
          new Float32Array([...color, alpha])
        );

        this.uniformBindGroup_ARRAY.push(uniformBindGroup_next);

        offset_ARRAY += 256;
      }
    }
  }

  async renderPlayfild_Border_WebGPU() {
    if (!this.device) return;

    // Подготовить буфер юниформов.
    // Для рамки игрового поля
    // данный буфер будет записан один раз и не меняеться в каждом кадре

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
    // create uniform buffer and layout
    // Расчитываем необходимый размер буфера
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
                size: 64,
              },
            },
          ],
        });

        Matrix.mat4.identity(this.MODELMATRIX);
        Matrix.mat4.identity(this.NORMALMATRIX);

        Matrix.mat4.translate(this.MODELMATRIX, this.MODELMATRIX, [
          colom * 2.2 - 2.2, // выравниваю по размеру модельки одного блока
          row * -2.2 + 2.2,
          0.0,
        ]);

        Matrix.mat4.identity(this.NORMALMATRIX);
        Matrix.mat4.invert(this.NORMALMATRIX, this.MODELMATRIX);
        Matrix.mat4.transpose(this.NORMALMATRIX, this.NORMALMATRIX);

        this.device.queue.writeBuffer(
          this.vertexUniformBuffer_border,
          offset_ARRAY + 0,
          this.vpMatrix
        );

        this.device.queue.writeBuffer(
          this.vertexUniformBuffer_border,
          offset_ARRAY + 64,
          this.MODELMATRIX
        ); //

        this.device.queue.writeBuffer(
          this.vertexUniformBuffer_border,
          offset_ARRAY + 128,
          this.NORMALMATRIX
        );
        this.device.queue.writeBuffer(
          this.vertexUniformBuffer_border,
          offset_ARRAY + 192,
          new Float32Array([...this.currentTheme.border, 1.0])
        );

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
