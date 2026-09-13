/**
 * WebGL2 block shaders — dual-sample the extracted block.png tile plus the packed
 * authored material map (R=normal.x, G=normal.y, B=roughness, A=metallic).
 *
 * RGB: linear albedo. A: nearest baked metal mask (no halo).
 * Glass opacity, gold grade, TBN and roughness are hand-ports of the shared WGSL
 * modules (src/webgpu/shaders/wgsl/block/authoredMaterial.wgsl and authoredGlass.wgsl)
 * that the TS and C++ renderers compose verbatim. GLSL cannot include WGSL, so these
 * are the one place the look is duplicated — tests/block-material-parity.test.ts pins
 * the constants and the function bodies against the WGSL source so a change to one
 * without the other fails the suite.
 */

export function createBlockShaderSources(): { vertex: string; fragment: string } {
  const vertex = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;

uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat4 u_normalMatrix;
uniform vec4 u_color;

out vec3 vNormal;
out vec4 vColor;
out vec2 vUV;
out vec3 vWorldPos;

void main() {
  vec4 worldPos = u_model * vec4(aPosition, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = u_viewProjection * worldPos;
  vNormal = mat3(u_normalMatrix) * aNormal;
  vColor = u_color;
  vUV = aUV;
}`;

  const fragment = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec4 vColor;
in vec2 vUV;
in vec3 vWorldPos;

uniform vec3 u_lightPos;
uniform vec3 u_eyePos;
uniform float u_glassMin;
uniform float u_glassMax;
uniform float u_glassFresnelPower;
uniform float u_authoredLoaded;
uniform sampler2D u_blockTexture;
uniform sampler2D u_blockMaskTexture;
uniform sampler2D u_blockMaterialMap;
// The visual contract (block-material.json), mirroring AuthoredMaterialParams.
uniform vec4 u_goldTint;   // rgb = jewelry tint, w = grade mix
uniform vec4 u_goldShade;  // x = shadeMin, y = shadeMax, z = metal rough, w = glass rough
uniform vec4 u_mapParams;  // x = normal strength, y = map enable, z = rough detail, w = unused

out vec4 outColor;

vec2 transformUVForSampling(vec2 uv) {
  return clamp(vec2(uv.x, 1.0 - uv.y), 0.0, 1.0);
}

// Port of gradeGoldMetalAlbedoTinted (authoredMaterial.wgsl).
vec3 gradeGoldMetalAlbedoTinted(vec3 texRgb, vec3 tint, float gradeMix, float shadeMin, float shadeMax) {
  float luma = dot(texRgb, vec3(0.299, 0.587, 0.114));
  vec3 gold = tint * mix(shadeMin, shadeMax, clamp(luma, 0.0, 1.0));
  return mix(texRgb, gold, clamp(gradeMix, 0.0, 1.0));
}

// Port of blockTangentBasis (authoredMaterial.wgsl) — screen-space TBN (Mikkelsen).
mat3 blockTangentBasis(vec3 N, vec3 worldPos, vec2 uv) {
  vec3 dp1 = dFdx(worldPos);
  vec3 dp2 = dFdy(worldPos);
  vec2 duv1 = dFdx(uv);
  vec2 duv2 = dFdy(uv);

  vec3 dp2perp = cross(dp2, N);
  vec3 dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;

  float maxLen = max(dot(T, T), dot(B, B));
  if (maxLen < 1.0e-12) {
    return mat3(vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), N);
  }
  float invmax = inversesqrt(maxLen);
  return mat3(T * invmax, B * invmax, N);
}

// Port of applyAuthoredNormal (authoredMaterial.wgsl).
vec3 applyAuthoredNormal(vec3 N, vec3 worldPos, vec2 uv, vec2 packedNormalXY, float strength) {
  if (strength <= 0.001) {
    return N;
  }
  vec2 nxy = (packedNormalXY * 2.0 - vec2(1.0)) * strength;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 1.0e-4));
  return normalize(blockTangentBasis(N, worldPos, uv) * vec3(nxy, nz));
}

// Port of authoredRoughnessFallback / authoredRoughness (authoredMaterial.wgsl).
float authoredRoughnessFallback(float metalMask, float detail, float metalRough, float glassRough, float detailScale) {
  if (metalMask < 0.5) {
    return clamp(glassRough, 0.02, 0.08);
  }
  return clamp(metalRough * (1.0 - detailScale * detail), 0.04, 1.0);
}

float authoredRoughness(float packedRough, float mapEnabled, float metalMask, float detail,
                        float metalRough, float glassRough, float detailScale) {
  float baked = clamp(packedRough, 0.02, 1.0);
  float fallback = authoredRoughnessFallback(metalMask, detail, metalRough, glassRough, detailScale);
  return mapEnabled > 0.5 ? baked : fallback;
}

float extractTextureMetalMask(vec3 rgb) {
  float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
  float warmth = rgb.r - rgb.b;
  float lumaBand = smoothstep(0.25, 0.55, luma) * (1.0 - smoothstep(0.82, 0.95, luma));
  float warmthSignal = smoothstep(0.05, 0.20, warmth);
  return clamp(lumaBand * warmthSignal * 3.0, 0.0, 1.0);
}

void main() {
  vec3 faceN = normalize(vNormal);
  vec3 V = normalize(u_eyePos - vWorldPos);
  vec3 L = normalize(u_lightPos - vWorldPos);

  vec2 texUV = transformUVForSampling(vUV);
  vec3 texRgb = texture(u_blockTexture, texUV).rgb;
  float texMaskA = texture(u_blockMaskTexture, texUV).a;

  // Packed authored material map: normal.xy / roughness / metallic.
  vec4 materialPacked = texture(u_blockMaterialMap, texUV);
  float mapEnabled = u_mapParams.y;

  vec3 N = applyAuthoredNormal(faceN, vWorldPos, vUV, materialPacked.rg, u_mapParams.x * mapEnabled);
  vec3 H = normalize(L + V);
  float NdotL = max(dot(N, L), 0.0);
  float NdotV = max(dot(N, V), 0.0);
  float NdotH = max(dot(N, H), 0.0);

  float metalMask;
  if (u_authoredLoaded > 0.5) {
    metalMask = clamp(texMaskA, 0.0, 1.0);
  } else {
    metalMask = extractTextureMetalMask(texRgb);
  }
  float glassMask = 1.0 - metalMask;
  float metalOpaque = step(0.5, metalMask);
  float glassMaskAlpha = 1.0 - metalOpaque;

  float luma = dot(texRgb, vec3(0.299, 0.587, 0.114));
  float crystalBright = smoothstep(0.15, 0.90, luma);
  float crystalHi = max(luma - 0.65, 0.0) * 2.5;

  vec3 metalColor = gradeGoldMetalAlbedoTinted(
    texRgb, u_goldTint.rgb, u_goldTint.w, u_goldShade.x, u_goldShade.y);
  vec3 glassColor = texRgb * (0.70 + crystalBright * 0.30)
                  + vColor.rgb * 0.22 * crystalBright
                  + vec3(crystalHi * 0.40);
  vec3 baseColor = mix(glassColor, metalColor, metalMask);

  float lightFactor = mix(0.42 + NdotL * 0.58, 0.50 + NdotL * 0.42, metalMask);
  float nh2 = NdotH * NdotH;
  float nh4 = nh2 * nh2;
  float nh16 = nh4 * nh4;
  float tightSpec = nh16 * nh16 * nh16 * nh16;
  // Authored roughness drives highlight tightness: the polished hinge detail the
  // packed map encodes is what makes the frame read as jewelry rather than plastic.
  float detail = clamp(length(texRgb - vec3(luma)) * 2.0, 0.0, 1.0);
  float roughness = authoredRoughness(materialPacked.b, mapEnabled, metalMask, detail,
                                      u_goldShade.z, u_goldShade.w, u_mapParams.z);
  float specularStrength = mix(0.06, 0.22, metalMask) * (1.0 - roughness * 0.5);
  vec3 specColor = mix(vec3(1.0), vec3(1.0, 0.88, 0.50), metalMask);
  vec3 finalColor = baseColor * lightFactor + specColor * (tightSpec * specularStrength);

  if (glassMask > 0.15) {
    float iridescence = sin(NdotV * 7.0) * 0.5 + 0.5;
    vec3 rainbow = vec3(
      sin(iridescence * 6.28) * 0.5 + 0.5,
      sin(iridescence * 6.28 + 2.09) * 0.5 + 0.5,
      sin(iridescence * 6.28 + 4.18) * 0.5 + 0.5
    );
    finalColor += rainbow * tightSpec * 0.12 * glassMask;
  }

  float edgeFresnel = 1.0 - NdotV;
  float glassPower = max(u_glassFresnelPower, 0.001);
  float glassFresnel = pow(edgeFresnel, glassPower);
  float glassOpacity = mix(u_glassMin, u_glassMax, glassFresnel);
  float finalAlpha = mix(1.0, glassOpacity, glassMaskAlpha);
  float materialAlpha = mix(finalAlpha, 1.0, metalOpaque);
  float outAlpha = materialAlpha * vColor.a;

  // Premultiply for canvas premultipliedAlpha: true (matches TS WebGPU path).
  outColor = vec4(clamp(finalColor, 0.0, 1.0) * outAlpha, outAlpha);
}`;

  return { vertex, fragment };
}
