import { getSubregionUVTransformGLSL } from './textureSamplingGLSL.js';

export function createBlockShaderSources(): { vertex: string; fragment: string } {
  const uvTransform = getSubregionUVTransformGLSL();

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
uniform float u_textureMix;
uniform int u_materialType;
uniform sampler2D u_blockTexture;

out vec4 outColor;

${uvTransform}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(u_eyePos - vWorldPos);
  vec3 L = normalize(u_lightPos - vWorldPos);
  vec3 H = normalize(L + V);
  float NdotL = max(dot(N, L), 0.0);
  float NdotV = max(dot(N, V), 0.0);
  float NdotH = max(dot(N, H), 0.0);

  vec2 texUV = transformUVForSampling(vUV);
  vec4 texColor = texture(u_blockTexture, texUV);

  float distX = min(vUV.x, 1.0 - vUV.x);
  float distY = min(vUV.y, 1.0 - vUV.y);
  float distEdge = min(distX, distY);
  float borderThickness = 0.15;
  float glassMask = smoothstep(borderThickness - 0.02, borderThickness, distEdge);

  vec3 frameColor = texColor.rgb * 1.2;
  vec3 windowColor = texColor.rgb * (vColor.rgb * 1.25 + vec3(0.18));
  vec3 authoredBase = mix(frameColor, windowColor, glassMask);
  vec3 baseColor = mix(vColor.rgb, authoredBase, clamp(u_textureMix, 0.0, 1.0));

  float lightFactor = 0.38 + NdotL * 0.62;
  float nh2 = NdotH * NdotH;
  float nh4 = nh2 * nh2;
  float nh16 = nh4 * nh4;
  float tightSpec = nh16 * nh16 * nh16 * nh16;
  float metalMask = 1.0 - glassMask;
  float specularStrength = mix(0.04, 0.18, metalMask);
  vec3 finalColor = baseColor * lightFactor + vec3(tightSpec * specularStrength);

  if (glassMask > 0.2) {
    float diffCenter = length(vUV - vec2(0.5));
    float centerGlow = clamp((0.2025 - diffCenter * diffCenter) / 0.1225, 0.0, 1.0);
    finalColor += vColor.rgb * 0.06 * centerGlow * glassMask;
  }

  float edgeFresnel = 1.0 - NdotV;
  float fresnelSq = edgeFresnel * edgeFresnel;
  float glassMin = 0.58;
  float glassMax = 0.90;
  if (u_materialType == 1) {
    glassMin = 0.78;
    glassMax = 0.98;
  } else if (u_materialType == 3) {
    glassMin = 0.48;
    glassMax = 0.82;
  } else if (u_materialType == 2) {
    glassMin = 0.72;
    glassMax = 0.96;
  }
  float glassOpacity = mix(glassMin, glassMax, fresnelSq);
  float alpha = mix(1.0, glassOpacity, glassMask) * vColor.a;

  outColor = vec4(clamp(finalColor, 0.0, 1.0), alpha);
}`;

  return { vertex, fragment };
}
