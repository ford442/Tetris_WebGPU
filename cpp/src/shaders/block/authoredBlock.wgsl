// Authored block pipeline for the Emscripten C++ renderer.
//
// This file owns only the *plumbing* — bind-group declarations, the instanced
// vertex stage, and the fragment stage's sampling/compositing order. Every line
// that decides how gold and crystal actually look comes from WGSL shared verbatim
// with the TypeScript renderer and prepended at build time by gpu_renderer.cpp:
//
//   1. kAuthoredBlockUniformsWgsl  (generated from shared/authoredBlockUniforms.json)
//   2. kSharedPbrCoreWgsl          (src/webgpu/shaders/wgsl/block/pbrCore.wgsl)
//   3. kSharedAuthoredGlassWgsl    (src/webgpu/shaders/wgsl/block/authoredGlass.wgsl)
//   4. this file
//
// Bind-group numbering follows cpp/src/block_bindings.h, which documents where the
// C++ layout matches the TS layout and where it deliberately differs.
//
// The texture is the *extracted authored tile* uploaded by CppRendererLoader — the
// same post-extract RGBA the TS path binds, with the metal frame baked into alpha.
// There is no atlas UV transform here on purpose: the 4x3 atlas is an input to the
// CPU-side extractor, not a shader concern.

@binding(0) @group(0) var<uniform> u : AuthoredBlockUniforms;
@binding(2) @group(0) var blockTexture : texture_2d<f32>;
@binding(3) @group(0) var blockSamplerColor : sampler;
@binding(9) @group(0) var blockTextureMask : texture_2d<f32>;
@binding(10) @group(0) var blockSamplerMask : sampler;

struct VSOut {
  @builtin(position) position : vec4f,
  @location(0) worldPos : vec3f,
  @location(1) normal : vec3f,
  @location(2) color : vec4f,
  @location(3) uv : vec2f,
};

@vertex
fn vs_main(
  @location(0) localPos : vec3f,
  @location(1) localNormal : vec3f,
  @location(2) localUv : vec2f,
  @location(3) instPos : vec3f,
  @location(4) instColor : vec4f,
) -> VSOut {
  var out : VSOut;
  let world = localPos * u.blockHalfSize * 2.0 + instPos;
  out.position = u.viewProjection * vec4f(world, 1.0);
  out.worldPos = world;
  out.normal = localNormal;
  out.color = instColor;
  out.uv = localUv;
  return out;
}

@fragment
fn fs_main(
  @location(0) worldPos : vec3f,
  @location(1) normal : vec3f,
  @location(2) color : vec4f,
  @location(3) uv : vec2f,
) -> @location(0) vec4f {
  let N = normalize(normal);
  let V = normalize(u.eyePosition.xyz - worldPos);
  let L = normalize(u.lightPosition.xyz - worldPos);
  let H = normalize(L + V);
  let NdotL = max(dot(N, L), 0.0);
  let NdotV = max(dot(N, V), 0.0);
  let NdotH = max(dot(N, H), 0.0);

  // Tight specular, same exponent ladder as the TS authored path (NdotH^128).
  let nh2 = NdotH * NdotH;
  let nh4 = nh2 * nh2;
  let nh16 = nh4 * nh4 * nh4 * nh4;
  let tightSpec = nh16 * nh16 * nh16 * nh16 * nh16 * nh16 * nh16 * nh16;

  // No atlas transform: the uploaded tile is already the extracted block face.
  // Flip V to match the TS tile orientation.
  let texUV = clamp(vec2f(uv.x, 1.0 - uv.y), vec2f(0.0), vec2f(1.0));

  // Dual sample of the same RGBA tile, mirroring the TS authored path:
  //   RGB — linear anisotropic;  A — nearest mip 0 (baked metal mask, no halo).
  let texRgb = textureSample(blockTexture, blockSamplerColor, texUV).rgb;
  let texMaskA = textureSampleLevel(blockTextureMask, blockSamplerMask, texUV, 0.0).a;

  // Only the extracted authored tile has baked-alpha mask semantics. Until the
  // upload lands (textureMix stays 0) fall back to the flat piece color rather
  // than reading alpha as a mask.
  let useAuthoredSampling = u.textureMix > 0.8;
  let metalMask = select(0.0, clamp(texMaskA, 0.0, 1.0), useAuthoredSampling);
  let glassMask = 1.0 - metalMask;
  let metalOpaque = step(0.5, metalMask);
  let glassMaskAlpha = 1.0 - metalOpaque;

  let metalColor = gradeGoldMetalAlbedo(texRgb);
  let baseColor = select(
    color.rgb,
    authoredBaseColor(texRgb, color.rgb, metalMask),
    useAuthoredSampling
  );

  var finalColor = authoredDirectLighting(baseColor, NdotL, tightSpec, metalMask);
  var finalAlpha = 1.0;

  if (metalMask > 0.05) {
    // Gold frame: GGX direct + procedural studio env + clearcoat. The C++ path has
    // no IBL prefilter yet, so it takes the same `iblEnable == 0` branch the TS
    // shader falls back to on low-power GPUs.
    let pixelRough = clamp(mix(0.12, 0.35, 1.0 - metalMask), 0.08, 0.45);
    let metalAmt = max(u.metallic, metalMask);
    let F0 = mix(vec3f(0.04), metalColor, metalMask * metalAmt);
    let anisoAmt = max(u.anisotropic, 0.4) * metalMask;

    var specDirect = 0.0;
    if (anisoAmt > 0.05) {
      specDirect = anisotropicSpecular(V, L, N, pixelRough, anisoAmt, worldPos, uv);
    } else {
      let D = distributionGGX(NdotH, pixelRough);
      let G = geometrySmith(NdotV, NdotL, pixelRough);
      specDirect = (D * G) / max(4.0 * NdotV * NdotL, 0.001);
    }
    let F = fresnelSchlick(NdotV, F0);
    finalColor += specDirect * F * NdotL * metalMask;
    finalColor += proceduralEnvReflect(reflect(-V, N), u.time) * F * metalMask * metalAmt;

    let coatAmt = max(u.clearcoat, 0.3) * metalMask;
    if (coatAmt > 0.01) {
      finalColor += clearcoatSpecular(NdotH, NdotV, NdotL, coatAmt);
    }
  }

  if (glassMask > 0.2) {
    let iridescence = sin(NdotV * 8.0 - u.time * 0.5) * 0.5 + 0.5;
    let rainbow = vec3f(
      sin(iridescence * 6.28) * 0.5 + 0.5,
      sin(iridescence * 6.28 + 2.09) * 0.5 + 0.5,
      sin(iridescence * 6.28 + 4.18) * 0.5 + 0.5
    );
    finalColor += rainbow * tightSpec * 0.22 * glassMask;

    let diffCenter = uv - vec2f(0.5);
    let centerGlow = clamp((0.2025 - dot(diffCenter, diffCenter)) / 0.1225, 0.0, 1.0);
    let breath = sin(u.time * 1.5) * 0.03 + 0.03;
    finalColor += color.rgb * breath * centerGlow * glassMask * 0.8;

    let edgeFresnel = 1.0 - NdotV;
    let edge3 = edgeFresnel * edgeFresnel * edgeFresnel;
    finalColor += vec3f(0.4, 0.65, 0.95) * edge3 * glassMask * 0.35;

    // Refraction through the crystal. The C++ path has no backdrop capture yet, so
    // it always takes the TS `refractEnable == 0` branch (procedural studio env).
    let glassTint = mix(vec3f(0.92, 0.96, 1.0), color.rgb, 0.22);
    let refracted = proceduralEnvReflect(
      refract(-V, N, 1.0 / max(u.glassIor, 1.01)),
      u.time
    ) * glassTint;
    finalColor = mix(finalColor, refracted, glassMask * 0.45);
  }

  if (useAuthoredSampling) {
    // Gold frame opaque; glass center from the shared GlassParams curve.
    let glassOpacity = authoredGlassOpacity(
      NdotV,
      u.glassParams.x,
      u.glassParams.y,
      u.glassParams.z
    );
    finalAlpha = mix(1.0, glassOpacity, glassMaskAlpha);
  }

  // Gold hinges stay alpha 1.0 (no video bleed). Hard threshold, not the soft mask.
  let materialAlpha = mix(finalAlpha, 1.0, metalOpaque);
  let outAlpha = clamp(materialAlpha * color.a, 0.0, 1.0);
  // Premultiply RGB for premultiplied-alpha blending (matches the canvas alphaMode).
  return vec4f(max(finalColor, vec3f(0.0)) * outAlpha, outAlpha);
}
