/**
 * Debug shaders for testing texture sampling
 * Use these to visualize different aspects of the texture
 */

export const DebugTextureShaders = () => {
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

  // Debug mode 1: Show raw texture
  const fragmentRawTexture = `
            @binding(2) @group(0) var blockTexture: texture_2d<f32>;
            @binding(3) @group(0) var blockSampler: sampler;

            @fragment
            fn main(@location(0) vPosition: vec4<f32>, @location(1) vNormal: vec4<f32>,@location(2) vColor: vec4<f32>, @location(3) vUV: vec2<f32>) ->  @location(0) vec4<f32> {
                let texUV = vec2<f32>(vUV.x, 1.0 - vUV.y);
                let texColor = textureSample(blockTexture, blockSampler, texUV);
                
                // Show raw texture color
                return vec4<f32>(texColor.rgb, 1.0);
            }`;

  // Debug mode 2: Show luminance/brightness
  const fragmentLuminance = `
            @binding(2) @group(0) var blockTexture: texture_2d<f32>;
            @binding(3) @group(0) var blockSampler: sampler;

            @fragment
            fn main(@location(0) vPosition: vec4<f32>, @location(1) vNormal: vec4<f32>,@location(2) vColor: vec4<f32>, @location(3) vUV: vec2<f32>) ->  @location(0) vec4<f32> {
                let texUV = vec2<f32>(vUV.x, 1.0 - vUV.y);
                let texColor = textureSample(blockTexture, blockSampler, texUV);
                
                let luma = dot(texColor.rgb, vec3<f32>(0.299, 0.587, 0.114));
                
                // Show luminance as grayscale
                return vec4<f32>(vec3<f32>(luma), 1.0);
            }`;

  // Debug mode 3: Show metal/glass mask
  const fragmentMask = `
            @binding(2) @group(0) var blockTexture: texture_2d<f32>;
            @binding(3) @group(0) var blockSampler: sampler;

            @fragment
            fn main(@location(0) vPosition: vec4<f32>, @location(1) vNormal: vec4<f32>,@location(2) vColor: vec4<f32>, @location(3) vUV: vec2<f32>) ->  @location(0) vec4<f32> {
                let texUV = vec2<f32>(vUV.x, 1.0 - vUV.y);
                let texColor = textureSample(blockTexture, blockSampler, texUV);
                
                let luma = dot(texColor.rgb, vec3<f32>(0.299, 0.587, 0.114));
                let isMetal = smoothstep(0.4, 0.5, luma);
                
                // Metal = white, Glass = black
                return vec4<f32>(vec3<f32>(isMetal), 1.0);
            }`;

  // Debug mode 4: Show UV coordinates
  const fragmentUV = `
            @fragment
            fn main(@location(0) vPosition: vec4<f32>, @location(1) vNormal: vec4<f32>,@location(2) vColor: vec4<f32>, @location(3) vUV: vec2<f32>) ->  @location(0) vec4<f32> {
                // UV as red (U) and green (V)
                return vec4<f32>(vUV.x, vUV.y, 0.0, 1.0);
            }`;

  // Debug mode 5: Show block color only (no texture)
  const fragmentColorOnly = `
            @fragment
            fn main(@location(0) vPosition: vec4<f32>, @location(1) vNormal: vec4<f32>,@location(2) vColor: vec4<f32>, @location(3) vUV: vec2<f32>) ->  @location(0) vec4<f32> {
                // Just the block color
                return vec4<f32>(vColor.rgb, 1.0);
            }`;

  return { 
    vertex, 
    fragmentRawTexture, 
    fragmentLuminance, 
    fragmentMask, 
    fragmentUV,
    fragmentColorOnly
  };
};
