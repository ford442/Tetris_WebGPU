import * as Matrix from "gl-matrix";
// @ts-ignore
const glMatrix = Matrix;

////

// Type definitions for themes
interface ThemeColors {
  [key: number]: number[];
  border: number[];
  levelVideos?: string[];
}

interface Themes {
  pastel: ThemeColors;
  neon: ThemeColors;
  future: ThemeColors;
}

const CubeData = () => {
  const positions = new Float32Array([
    // front
    -1, -1, 1, 1, -1, 1, 1, 1, 1, 1, 1, 1, -1, 1, 1, -1, -1, 1,

    // right
    1, -1, 1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1,

    // back
    -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, 1, -1, 1, -1, -1, -1, -1, -1,

    // left
    -1, -1, 1, -1, 1, 1, -1, 1, -1, -1, 1, -1, -1, -1, -1, -1, -1, 1,

    // top
    -1, 1, 1, 1, 1, 1, 1, 1, -1, 1, 1, -1, -1, 1, -1, -1, 1, 1,

    // bottom
    -1, -1, 1, -1, -1, -1, 1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1,
  ]);
  const normals = new Float32Array([
    // front
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,

    // right
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,

    // back
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,

    // left
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,

    // top
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,

    // bottom
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
  ]);

  return {
    positions,
    normals,
  };
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
            time : f32,
            resolution : vec2<f32>,
        };
        @binding(0) @group(0) var<uniform> uniforms : Uniforms;

        @fragment
        fn main(@location(0) vUV: vec2<f32>) -> @location(0) vec4<f32> {
            var color = vec3<f32>(0.0);

            // Grid effect
            let uv = vUV * 20.0;
            let time = uniforms.time * 0.5;

            // Animated grid
            let val = sin(uv.x + time) + cos(uv.y + time);

            // "Plasma" like background
            let r = sin(vUV.x * 10.0 + time) * 0.5 + 0.5;
            let g = cos(vUV.y * 10.0 + time * 0.8) * 0.5 + 0.5;
            let b = sin((vUV.x + vUV.y) * 10.0 - time) * 0.5 + 0.5;

            // Deep space / futuristic grid look
            let gridX = abs(fract(vUV.x * 20.0 + time * 0.1) - 0.5);
            let gridY = abs(fract(vUV.y * 20.0 + time * 0.05) - 0.5);
            let grid = 1.0 - step(0.02, min(gridX, gridY));

            let deepColor = vec3<f32>(0.05, 0.0, 0.1);
            let gridColor = vec3<f32>(0.0, 0.8, 1.0) * 0.5;

            color = mix(deepColor, gridColor, grid);

            // Add some moving lights/glows
            let light1 = 0.05 / length(vUV - vec2<f32>(0.5 + sin(time)*0.3, 0.5 + cos(time*0.7)*0.3));
            color += vec3<f32>(0.8, 0.2, 0.5) * light1;

            return vec4<f32>(color, 1.0);
        }
    `;

    return { vertex, fragment };
};


const Shaders = () => {
  let params: any = {};
  // define default input values:
  params.color = "(0.0, 1.0, 0.0)";
  params.ambientIntensity = "0.3"; // Slightly brighter ambient
  params.diffuseIntensity = "0.9";
  params.specularIntensity = "1.5"; // Much higher specular for glassy look
  params.shininess = "64.0"; // Very sharp highlights
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
            fn main(@location(0) position: vec4<f32>, @location(1) normal: vec4<f32>) -> Output {
                var output: Output;
                let mPosition:vec4<f32> = uniforms.modelMatrix * position;
                output.vPosition = mPosition;
                output.vNormal   =  uniforms.normalMatrix*normal;
                output.Position  = uniforms.viewProjectionMatrix * mPosition;
                output.vColor   =  uniforms.colorVertex;
                // Simple UV mapping for cube faces based on position
                output.vUV = position.xy * 0.5 + 0.5;
                return output;
            }`;

  const fragment = `
            struct Uniforms {
                lightPosition : vec4<f32>,
                eyePosition : vec4<f32>,
                color : vec4<f32>
            };
            @binding(1) @group(0) var<uniform> uniforms : Uniforms;

            @fragment
            fn main(@location(0) vPosition: vec4<f32>, @location(1) vNormal: vec4<f32>,@location(2) vColor: vec4<f32>, @location(3) vUV: vec2<f32>) ->  @location(0) vec4<f32> {
               
              let N:vec3<f32> = normalize(vNormal.xyz);
                let L:vec3<f32> = normalize(uniforms.lightPosition.xyz - vPosition.xyz);
                let V:vec3<f32> = normalize(uniforms.eyePosition.xyz - vPosition.xyz);
                let H:vec3<f32> = normalize(L + V);
                let diffuse:f32 = 0.8 * max(dot(N, L), 0.0);
                var specular:f32;
                var isp:i32 = ${params.isPhong};
                if(isp == 1){
                    specular = ${params.specularIntensity} * pow(max(dot(V, reflect(-L, N)),0.0), ${params.shininess});
                } else {
                    specular = ${params.specularIntensity} * pow(max(dot(N, H),0.0), ${params.shininess});
                }
                let ambient:f32 = ${params.ambientIntensity};

                // Futuristic Edge Glow
                // Use UV coordinates to determine if we are near the edge of the face
                let uvCentered = abs(vUV - 0.5) * 2.0;
                let edgeWidth = 0.1;
                let edgeFactorX = smoothstep(1.0 - edgeWidth, 1.0, uvCentered.x);
                let edgeFactorY = smoothstep(1.0 - edgeWidth, 1.0, uvCentered.y);
                let edgeFactor = max(edgeFactorX, edgeFactorY);

                var finalColor:vec3<f32> = vColor.xyz * (ambient + diffuse) + vec3<f32>${params.specularColor}*specular;

                // Add rim lighting / fresnel effect for glassy look
                let fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
                finalColor += vec3<f32>(0.2, 0.4, 0.8) * fresnel * 0.5;

                // Mix in emission for edge (smooth glow)
                if (edgeFactor > 0.0) {
                     let glowColor = mix(vColor.xyz, vec3<f32>(1.0), 0.8);
                     finalColor = mix(finalColor, glowColor * 2.0, edgeFactor);
                }

                // Inner glow
                // let d = length(vUV - 0.5);
                // finalColor += vColor.xyz * (1.0 - d*2.0) * 0.2;

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
  heigh: number;
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

  // Video Background
  videoElement: HTMLVideoElement;
  isVideoPlaying: boolean = false;
  currentLevel: number = 0;

  // Visual Effects
  flashTimer: number = 0;
  lockTimer: number = 0;

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
      levelVideos: [
        './assets/video/bg1.mp4',
        './assets/video/bg2.mp4',
        './assets/video/bg3.mp4',
        './assets/video/bg4.mp4',
        './assets/video/bg5.mp4',
        './assets/video/bg6.mp4',
        './assets/video/bg7.mp4'
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
      levelVideos: [
        './assets/video/bg1.mp4',
        './assets/video/bg2.mp4',
        './assets/video/bg3.mp4',
        './assets/video/bg4.mp4',
        './assets/video/bg5.mp4',
        './assets/video/bg6.mp4',
        './assets/video/bg7.mp4'
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
      levelVideos: [
        './assets/video/bg1.mp4',
        './assets/video/bg2.mp4',
        './assets/video/bg3.mp4',
        './assets/video/bg4.mp4',
        './assets/video/bg5.mp4',
        './assets/video/bg6.mp4',
        './assets/video/bg7.mp4'
      ]
    }
  };

  currentTheme = this.themes.future;

  constructor(element: HTMLElement, width: number, heigh: number, rows: number, coloms: number, nextPieceContext: CanvasRenderingContext2D, holdPieceContext: CanvasRenderingContext2D) {
    this.element = element;
    this.width = width;
    this.heigh = heigh;
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
    this.canvasWebGPU.height = this.heigh;

    this.ctxWebGPU = this.canvasWebGPU.getContext("webgpu") as GPUCanvasContext;
    this.isWebGPU = this.CheckWebGPU();

    this.playfildBorderWidth = 4;
    this.playfildX = this.playfildBorderWidth + 1;
    this.playfildY = this.playfildBorderWidth + 1;
    this.playfildWidth = (this.width * 2) / 3;
    this.playfildHeight = this.heigh;
    this.playfildInnerWidth = this.playfildWidth - this.playfildBorderWidth * 2;
    this.playfildInnerHeight =
      this.playfildHeight - this.playfildBorderWidth * 2 - 2;

    this.blockWidth = this.playfildInnerWidth / coloms;
    this.blockHeight = this.playfildInnerHeight / rows;

    this.panelX = this.playfildWidth + 10;
    this.panelY = 0;
    this.panelWidth = this.width / 3;
    this.panelHeight = this.heigh;

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
    // Position and size video to fit within the playfield inner area
    this.videoElement.style.left = `${this.playfildX}px`;
    this.videoElement.style.top = `${this.playfildY}px`;
    this.videoElement.style.width = `${this.playfildInnerWidth}px`;
    this.videoElement.style.height = `${this.playfildInnerHeight}px`;
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

    // Only update if the source is different
    if (this.videoElement.src && this.videoElement.src.endsWith(videoSrc)) {
      return; // Already playing the correct video
    }

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
    this.heigh = window.innerHeight;
    this.canvasWebGPU.width = this.width;
    this.canvasWebGPU.height = this.heigh;

    // Recalculate playfield dimensions
    this.playfildWidth = (this.width * 2) / 3;
    this.playfildHeight = this.heigh;
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
    let fovy = (40 * Math.PI) / 180;
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

    // Center the piece in the 4x4 or 3x3 grid
    // Usually pieces are 3x3 or 4x4.
    // Canvas is 80x80 (4 blocks).
    const offsetX = (ctx.canvas.width - blocks[0].length * blockSize) / 2;
    const offsetY = (ctx.canvas.height - blocks.length * blockSize) / 2;

    blocks.forEach((row: number[], y: number) => {
      row.forEach((value: number, x: number) => {
        if (value > 0) {
          const color = themeColors[value] as number[];
          // Draw with gradient/bevel
          const px = offsetX + x * blockSize;
          const py = offsetY + y * blockSize;

          const grd = ctx.createLinearGradient(px, py, px + blockSize, py + blockSize);
          grd.addColorStop(0, `rgb(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255})`);
          grd.addColorStop(1, `rgb(${color[0] * 150}, ${color[1] * 150}, ${color[2] * 150})`);

          ctx.fillStyle = grd;
          ctx.fillRect(px, py, blockSize, blockSize);

          // Inner highlight
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.fillRect(px + 2, py + 2, blockSize - 4, blockSize - 4);

          // Add a border for style
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.strokeRect(px, py, blockSize, blockSize);
        }
      });
    });
  }

  onLineClear(lines: number) {
      this.flashTimer = 1.0;
  }

  onLock() {
      this.lockTimer = 0.5;
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
        size: 16, // time(f32) + padding(f32) + resolution(vec2<f32>) = 4+4+8 = 16
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.backgroundBindGroup = this.device.createBindGroup({
        layout: this.backgroundPipeline.getBindGroupLayout(0),
        entries: [{
            binding: 0,
            resource: { buffer: this.backgroundUniformBuffer }
        }]
    });


    //create uniform buffer and layout
    this.fragmentUniformBuffer = this.device.createBuffer({
      size: 64, // Increased size to be safe, though we only use 48 bytes currently
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.MODELMATRIX = Matrix.mat4.create();
    this.NORMALMATRIX = Matrix.mat4.create();
    this.VIEWMATRIX = Matrix.mat4.create();
    this.PROJMATRIX = Matrix.mat4.create();

    let eyePosition = [0.0, -20.0, 75.0];
    let lightPosition = new Float32Array([-5.0, 0.0, 0.0]);

    Matrix.mat4.identity(this.VIEWMATRIX);
    Matrix.mat4.lookAt(
      this.VIEWMATRIX,
      eyePosition,
      [9.0, -20.0, 0.0], // target
      [0.0, 1.0, 0.0] // up
    );

    Matrix.mat4.identity(this.PROJMATRIX);
    let fovy = (40 * Math.PI) / 180;
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
      new Float32Array(eyePosition)
    );
    this.device.queue.writeBuffer(
      this.fragmentUniformBuffer,
      16,
      lightPosition
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

    // Update visual effects
    if (this.flashTimer > 0) this.flashTimer -= 0.05;
    if (this.flashTimer < 0) this.flashTimer = 0;

    if (this.lockTimer > 0) this.lockTimer -= 0.05;
    if (this.lockTimer < 0) this.lockTimer = 0;

    // Update time for background
    const currentTime = (performance.now() - this.startTime) / 1000.0;
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 0, new Float32Array([currentTime]));
    this.device.queue.writeBuffer(this.backgroundUniformBuffer, 8, new Float32Array([this.canvasWebGPU.width, this.canvasWebGPU.height]));

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
                size: 48,
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
                size: 48,
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
