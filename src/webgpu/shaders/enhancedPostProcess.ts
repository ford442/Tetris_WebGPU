/**
 * Enhanced Post-Processing Shader
 * FXAA Antialiasing + Film Grain + CRT Effects + Supersampling + Enhanced Bloom
 */

import { PostProcessUniformsWGSL } from '../postProcessUniforms.js';

export const EnhancedPostProcessShaders = () => {
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
            output.uv.y = 1.0 - output.uv.y;
            return output;
        }
    `;

    const fragment = `
        ${PostProcessUniformsWGSL}
        @binding(0) @group(0) var<uniform> uniforms : PostProcessUniforms;
        @binding(1) @group(0) var mySampler: sampler;
        @binding(2) @group(0) var myTexture: texture_2d<f32>;

        // FXAA 3.11 implementation (simplified)
        // Restructured to avoid non-uniform control flow with textureSample
        fn fxaa(uv: vec2<f32>, texColor: vec3<f32>) -> vec3<f32> {
            let texelSize = 1.0 / vec2<f32>(uniforms.screenWidth, uniforms.screenHeight);

            // Sample neighboring pixels (all sampling done unconditionally)
            let nw = textureSample(myTexture, mySampler, uv + vec2<f32>(-texelSize.x, -texelSize.y)).rgb;
            let ne = textureSample(myTexture, mySampler, uv + vec2<f32>( texelSize.x, -texelSize.y)).rgb;
            let sw = textureSample(myTexture, mySampler, uv + vec2<f32>(-texelSize.x,  texelSize.y)).rgb;
            let se = textureSample(myTexture, mySampler, uv + vec2<f32>( texelSize.x,  texelSize.y)).rgb;

            // Convert to luminance
            let lumaM = dot(texColor, vec3<f32>(0.299, 0.587, 0.114));
            let lumaNW = dot(nw, vec3<f32>(0.299, 0.587, 0.114));
            let lumaNE = dot(ne, vec3<f32>(0.299, 0.587, 0.114));
            let lumaSW = dot(sw, vec3<f32>(0.299, 0.587, 0.114));
            let lumaSE = dot(se, vec3<f32>(0.299, 0.587, 0.114));

            // Edge detection
            let lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
            let lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
            let lumaRange = lumaMax - lumaMin;

            // Blend direction
            let dirX = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
            let dirY =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));
            let dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * 0.25 * (1.0 / 8.0), 1.0 / 128.0);
            let rcpDirMin = 1.0 / (min(abs(dirX), abs(dirY)) + dirReduce);
            let dir = vec2<f32>(
                min(uniforms.screenWidth, max(-uniforms.screenWidth, dirX * rcpDirMin)) * texelSize.x,
                min(uniforms.screenHeight, max(-uniforms.screenHeight, dirY * rcpDirMin)) * texelSize.y
            ) * 0.5;

            // Sample along gradient (unconditional - avoids non-uniform control flow)
            let rgbA = 0.5 * (
                textureSample(myTexture, mySampler, uv + dir * (1.0 / 3.0 - 0.5)).rgb +
                textureSample(myTexture, mySampler, uv + dir * (2.0 / 3.0 - 0.5)).rgb
            );
            let rgbB = rgbA * 0.5 + 0.25 * (
                textureSample(myTexture, mySampler, uv + dir * -0.5).rgb +
                textureSample(myTexture, mySampler, uv + dir * 0.5).rgb
            );
            let lumaB = dot(rgbB, vec3<f32>(0.299, 0.587, 0.114));

            // Select result without branching
            let needsAA = lumaRange >= max(0.0312, lumaMax * 0.125);
            let aaResult = select(rgbB, rgbA, lumaB < lumaMin || lumaB > lumaMax);
            return select(texColor, aaResult, needsAA);
        }

        // Film grain
        fn filmGrain(uv: vec2<f32>, color: vec3<f32>) -> vec3<f32> {
            let time = uniforms.time;
            let grain = fract(sin(dot(uv * time, vec2<f32>(12.9898, 78.233))) * 43758.5453);
            let grainAmount = 0.03;
            let grainSize = 1.5;
            let noise = (grain - 0.5) * grainAmount;
            return color + noise * (1.0 - color) * grainSize;
        }

        // CRT scanlines + curvature + vignette
        fn crtEffect(uv: vec2<f32>, color: vec3<f32>) -> vec3<f32> {
            // Curvature
            let centered = uv * 2.0 - 1.0;
            let dist = length(centered);
            let curvature = 0.05;
            let curvedUV = centered * (1.0 + dist * dist * curvature) * 0.5 + 0.5;
            
            if (curvedUV.x < 0.0 || curvedUV.x > 1.0 || curvedUV.y < 0.0 || curvedUV.y > 1.0) {
                return vec3<f32>(0.0);
            }
            
            // Scanlines
            let scanlineY = curvedUV.y * uniforms.screenHeight;
            var scanline = sin(scanlineY * 3.14159) * 0.5 + 0.5;
            scanline = scanline * sqrt(scanline); // pow(scanline, 1.5)
            scanline = 0.9 + scanline * 0.1;
            
            // RGB pixel separation (mask effect)
            let maskX = curvedUV.x * uniforms.screenWidth;
            var mask = vec3<f32>(
                sin(maskX * 3.14159) * 0.5 + 0.5,
                sin((maskX + 0.33) * 3.14159) * 0.5 + 0.5,
                sin((maskX + 0.66) * 3.14159) * 0.5 + 0.5
            );
            mask = 0.85 + mask * 0.15;
            
            // CRT vignette
            let vignette = 1.0 - dist * dist * 0.4;
            
            return color * scanline * mask * vignette;
        }

        // Enhanced bloom with threshold
        fn enhancedBloom(uv: vec2<f32>, color: vec3<f32>) -> vec3<f32> {
            let texelSize = 1.0 / vec2<f32>(uniforms.screenWidth, uniforms.screenHeight);
            let spread = 0.008 * uniforms.bloomIntensity;
            
            var bloom = vec3<f32>(0.0);
            let weight = 1.0 / 13.0;
            
            // 13-tap bloom (center + 12 samples)
            bloom += textureSample(myTexture, mySampler, uv).rgb * weight;
            bloom += textureSample(myTexture, mySampler, uv + vec2<f32>( spread, 0.0)).rgb * weight;
            bloom += textureSample(myTexture, mySampler, uv + vec2<f32>(-spread, 0.0)).rgb * weight;
            bloom += textureSample(myTexture, mySampler, uv + vec2<f32>(0.0,  spread)).rgb * weight;
            bloom += textureSample(myTexture, mySampler, uv + vec2<f32>(0.0, -spread)).rgb * weight;
            bloom += textureSample(myTexture, mySampler, uv + vec2<f32>( spread,  spread) * 0.7).rgb * weight;
            bloom += textureSample(myTexture, mySampler, uv + vec2<f32>(-spread,  spread) * 0.7).rgb * weight;
            bloom += textureSample(myTexture, mySampler, uv + vec2<f32>( spread, -spread) * 0.7).rgb * weight;
            bloom += textureSample(myTexture, mySampler, uv + vec2<f32>(-spread, -spread) * 0.7).rgb * weight;
            bloom += textureSample(myTexture, mySampler, uv + vec2<f32>( spread * 1.5, 0.0)).rgb * weight * 0.5;
            bloom += textureSample(myTexture, mySampler, uv + vec2<f32>(-spread * 1.5, 0.0)).rgb * weight * 0.5;
            bloom += textureSample(myTexture, mySampler, uv + vec2<f32>(0.0,  spread * 1.5)).rgb * weight * 0.5;
            bloom += textureSample(myTexture, mySampler, uv + vec2<f32>(0.0, -spread * 1.5)).rgb * weight * 0.5;
            
            // Threshold bloom
            let bloomLum = dot(bloom, vec3<f32>(0.299, 0.587, 0.114));
            let threshold = 0.3;
            let knee = 0.2;
            let contrib = max(bloomLum - threshold + knee, 0.0);
            let intensity = smoothstep(0.0, knee * 2.0, contrib) * uniforms.bloomIntensity;
            
            return color + bloom * intensity;
        }

        @fragment
        fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
            // Lens Distortion (Barrel)
            let centeredUV = uv - 0.5;
            let distSq = dot(centeredUV, centeredUV);
            let distortStrength = 0.08;
            let distortedUV = 0.5 + centeredUV * (1.0 + distSq * distortStrength);
            var finalUV = distortedUV;
            
            let inBounds = (distortedUV.x >= 0.0 && distortedUV.x <= 1.0 && 
                           distortedUV.y >= 0.0 && distortedUV.y <= 1.0);

            // Shockwave Effect
            let center = uniforms.shockwaveCenter;
            let time = uniforms.shockwaveTime;
            let glitchStrength = uniforms.useGlitch;
            let params = uniforms.shockwaveParams;
            let level = uniforms.level;

            var shockwaveAberration = 0.0;
            if (time > 0.0 && time < 1.0) {
                let dir = normalize(uv - center);
                let dist = length(uv - center);
                let speed = max(params.w, 0.1);
                let radius = time * speed;
                let width = params.x;
                let strength = params.y;
                let diff = dist - radius;

                if (abs(diff) < width) {
                    let angle = (diff / width) * 3.14159;
                    let distortion = cos(angle) * strength * (1.0 - time);
                    finalUV -= dir * distortion;
                    shockwaveAberration = params.z * (1.0 - abs(diff)/width) * (1.0 - time);
                }

                // Echo rings
                for (var i: i32 = 1; i <= 2; i++) {
                    let echoRadius = radius * (0.9 - f32(i) * 0.15);
                    let echoDiff = abs(dist - echoRadius);
                    if (echoDiff < width * 0.5) {
                        let angle = (echoDiff / (width * 0.5)) * 3.14159;
                        let distortion = cos(angle) * strength * (0.5 - f32(i) * 0.15) * (1.0 - time);
                        finalUV -= dir * distortion;
                    }
                }
            }

            // Chromatic Aberration
            let centeredFromCenter = uv - vec2<f32>(0.5);
            let distFromCenterSq = dot(centeredFromCenter, centeredFromCenter);
            let distFromCenter = sqrt(distFromCenterSq);
            let levelStress = clamp(level / 12.0, 0.0, 1.0);
            let d2 = distFromCenterSq;
            let vignetteAberration = (d2 * d2) * 0.12;
            let levelAberration = levelStress * 0.005 * sin(uniforms.time * 2.0);
            let glitchAberration = glitchStrength * 0.03;
            let totalAberration = vignetteAberration + levelAberration + shockwaveAberration + glitchAberration;

            // Glitch offset
            let glitchOffset = glitchStrength * 0.03 * sin(finalUV.y * 50.0 + uniforms.time * 20.0);
            let tear = step(0.97, fract(finalUV.y * 2.0 + uniforms.time * 10.0)) * glitchStrength * 0.04;
            finalUV.x += tear;

            // Sample with chromatic aberration
            let baseSample = textureSample(myTexture, mySampler, finalUV);
            var r = textureSample(myTexture, mySampler, finalUV + vec2<f32>(totalAberration + glitchOffset, 0.0)).r;
            var g = baseSample.g;
            var b = textureSample(myTexture, mySampler, finalUV - vec2<f32>(totalAberration + glitchOffset, 0.0)).b;
            var color = vec3<f32>(r, g, b);
            let sampledAlpha = baseSample.a;

            // FXAA - always call to maintain uniform control flow
            let fxaaResult = fxaa(finalUV, color);
            color = select(color, fxaaResult, uniforms.enableFXAA > 0.5);

            // Enhanced Bloom
            if (uniforms.enableBloom > 0.5) {
                color = enhancedBloom(finalUV, color);
            }

            // CRT Effect
            if (uniforms.enableCRT > 0.5) {
                color = crtEffect(finalUV, color);
            }

            // Film Grain
            if (uniforms.enableFilmGrain > 0.5) {
                color = filmGrain(finalUV, color);
            }

            // High-pass boost for bright areas
            let luminance = dot(color, vec3<f32>(0.299, 0.587, 0.114));
            if (luminance > 0.5) {
                color += color * 0.3;
            }

            // Vignette
            let beat = sin(uniforms.time * 8.0) * 0.5 + 0.5;
            let vignetteSize = 1.5 - (beat * 0.05 * levelStress);
            let vignetteInnerRadiusSq = 0.25; // 0.25 = 0.5^2 (inner vignette radius squared)
            let vignetteEpsilon = 0.0001;
            let vignetteOuterSq = max(vignetteSize * vignetteSize, vignetteInnerRadiusSq + vignetteEpsilon);
            let vignette = 1.0 - clamp((distFromCenterSq - vignetteInnerRadiusSq) / (vignetteOuterSq - vignetteInnerRadiusSq), 0.0, 1.0);
            color *= vignette;

            // Warp Surge Flash
            if (uniforms.warpSurge > 0.01) {
                let invert = vec3<f32>(1.0) - color;
                color = mix(color, invert, clamp(uniforms.warpSurge * 0.6, 0.0, 0.6));
            }

            // Simple scanlines overlay
            let scanline = sin(finalUV.y * 600.0 + uniforms.time * 10.0) * 0.02;
            color -= vec3<f32>(scanline);

            // HDR tone mapping
            color = color / (color + vec3<f32>(1.0));
            color = sqrt(color); // Fast gamma approx

            if (!inBounds) {
                return vec4<f32>(0.0, 0.0, 0.0, 0.0);
            }

            return vec4<f32>(color, sampledAlpha);
        }
    `;

    return { vertex, fragment };
};

export default EnhancedPostProcessShaders;
