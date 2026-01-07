
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
    // Note: ambientIntensity is now hardcoded in shader for optimal contrast (0.3)
    params.diffuseIntensity = "1.2"; // Slightly brighter diffuse
    params.specularIntensity = "4.0"; // Even glossier
    params.shininess = "350.0"; // Sharp highlights
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
                screenSize: vec2<f32>,
            };
            @binding(1) @group(0) var<uniform> uniforms : Uniforms;
            // NOTE: Sampler and Texture bindings are present in layout but unused here

            @fragment
            fn main(@builtin(position) fragCoord: vec4<f32>, @location(0) vPosition: vec4<f32>, @location(1) @interpolate(flat) vNormal: vec4<f32>, @location(2) vColor: vec4<f32>, @location(3) vUV: vec2<f32>) ->  @location(0) vec4<f32> {

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
                   baseColor *= 0.9; // Deeper hex pattern indentation
                }

                if (isTrace > 0.5) {
                    baseColor *= 0.4; // Deeper grooves
                } else {
                    // Crystalline noise sparkle
                    let sparkle = step(0.98, noise) * 0.6 * (sin(time * 5.0 + vPosition.x * 10.0) * 0.5 + 0.5);
                    baseColor += vec3<f32>(sparkle);
                }

                // --- Composition ---
                var finalColor:vec3<f32> = baseColor * (ambient + diffuse * 0.9) + vec3<f32>${params.specularColor} * (specularSharp + specularClear);

                // --- Emissive Elements ---
                // Traces glow intensely
                if (isTrace > 0.5) {
                    let traceGlow = pulsePos * 5.0; // Stronger glow
                    finalColor += vColor.rgb * traceGlow;
                    finalColor += vec3<f32>(1.0) * traceGlow * 0.8; // Brighter core
                }
                // Hex corners glow slightly
                if (hexDist < 0.1) {
                    finalColor += vColor.rgb * 1.0 * pulsePos;
                }

                // --- Fresnel Rim Light (Enhanced) ---
                let fresnelTerm = pow(1.0 - max(dot(N, V), 0.0), 3.0); // Sharper
                let rimColor = vec3<f32>(0.2, 0.8, 1.0); // Cyan/Ice rim

                // Chromatic Aberration on Rim
                let rimR = rimColor.r * (1.0 + 0.1 * sin(time + vPosition.y));
                let rimG = rimColor.g;
                let rimB = rimColor.b * (1.0 + 0.1 * cos(time + vPosition.y));

                finalColor += vec3<f32>(rimR, rimG, rimB) * fresnelTerm * 3.5; // Stronger rim

                // --- Geometric Edge Highlight (Fresnel-based) ---
                const EDGE_THRESHOLD = 0.6; // Sharp threshold for edge detection
                const SILHOUETTE_THRESHOLD = 0.2; // Threshold for silhouette detection

                let edgeFresnel = pow(1.0 - max(dot(N, V), 0.0), 5.0);
                let edgeGlow = edgeFresnel * step(EDGE_THRESHOLD, edgeFresnel);

                // Only apply to silhouette edges, not internal faces
                let isSilhouette = step(SILHOUETTE_THRESHOLD, abs(dot(N, V)));
                finalColor += vec3<f32>(1.0) * edgeGlow * isSilhouette * 3.5;

                // --- Active Piece Lock Pulse ---
                // If lockPercent > 0, we pulse the color
                let lockP = uniforms.lockPercent;
                if (lockP > 0.0 && vColor.w > 0.8) {
                   let pulseSpeed = 10.0 + lockP * 20.0; // Gets faster
                   let whiteFlash = sin(uniforms.time * pulseSpeed) * 0.5 + 0.5;
                   // Mix white based on lock progress (0 at start, up to 0.5 at end)
                   let intensity = lockP * 0.6 * whiteFlash;
                   finalColor = mix(finalColor, vec3<f32>(1.0, 1.0, 1.0), intensity);
                }

                // --- GHOST PIECE RENDERING ---
                // If alpha is low, use ghost logic (hologram)
                if (vColor.w < 0.4) {
                    let time = uniforms.time;
                    // Scrolling digital rain effect
                    let scanY = fract(vUV.y * 30.0 - time * 3.0);
                    let scanline = smoothstep(0.1, 0.3, scanY) * (1.0 - smoothstep(0.7, 0.9, scanY));

                    // Hex pattern for ghost
                    let ghostHex = hexEdge;

                    // Wireframe style base - reduce filled color
                    let ghostBase = vColor.rgb * 0.5;

                    // Wireframe edges - make them POP
                    var ghostFinal = vColor.rgb * edgeGlow * 8.0;

                    // Add scrolling scanlines (additive)
                    ghostFinal += vec3<f32>(0.5, 0.8, 1.0) * scanline * 2.0;

                    // Add hex pattern
                    ghostFinal += ghostBase * ghostHex * 1.5;

                    // Hologram flicker
                    let noise = fract(sin(dot(vUV, vec2<f32>(12.9898, 78.233))) * 43758.5453);
                    let flicker = 0.85 + 0.15 * sin(time * 40.0 + noise * 20.0);

                    // Pulse alpha
                    let pulse = 0.2 + 0.1 * sin(time * 5.0);

                    // Ensure it's additive
                    return vec4<f32>(ghostFinal * flicker, pulse);
                }

                // --- Smart Transparency for Blocks ---
                // Keep base material semi-transparent (0.85), but make features opaque (1.0)
                let baseAlpha = vColor.w;
                // Use UV-based edge for feature opacity (not the same as highlight)
                let uvEdgeDist = max(abs(vUV.x - 0.5), abs(vUV.y - 0.5)) * 2.0;
                let uvEdgeFeature = smoothstep(0.9, 1.0, uvEdgeDist);
                let featureAlpha = max(isTrace, max(uvEdgeFeature, hexEdge));

                // Prevent disappearing blocks: if computed finalColor is almost black, force opacity and fallback to baseColor
                let lumin = dot(finalColor, vec3<f32>(0.299, 0.587, 0.114));
                if (lumin < 0.05) {
                    finalColor = baseColor;
                    return vec4<f32>(finalColor, 1.0);
                }

                let finalAlpha = clamp(max(baseAlpha, featureAlpha), 0.0, 1.0);

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
