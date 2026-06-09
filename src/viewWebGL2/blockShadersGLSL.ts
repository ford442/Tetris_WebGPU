/**
 * WebGL2 block shaders — samples a 2× extracted block.png tile at mip 0.
 * Gold frame + stained glass colours come from the texture (warmth mask)
 * blended with a geometric UV frame for stable edges.
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
uniform int u_materialType;
uniform sampler2D u_blockTexture;

out vec4 outColor;

vec2 transformUVForSampling(vec2 uv) {
  return clamp(vec2(uv.x, 1.0 - uv.y), 0.0, 1.0);
}

float extractTextureMetalMask(vec3 rgb) {
  float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
  float warmth = rgb.r - rgb.b;
  float lumaBand = smoothstep(0.25, 0.55, luma) * (1.0 - smoothstep(0.82, 0.95, luma));
  float warmthSignal = smoothstep(0.05, 0.20, warmth);
  return clamp(lumaBand * warmthSignal * 3.0, 0.0, 1.0);
}

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
  float glassMaskGeo = smoothstep(borderThickness - 0.02, borderThickness, distEdge);

  float textureMetal = extractTextureMetalMask(texColor.rgb);
  float metalMask = clamp(max(1.0 - glassMaskGeo, textureMetal * 0.92), 0.0, 1.0);
  float glassMask = 1.0 - metalMask;

  float luma = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
  float crystalBright = smoothstep(0.15, 0.90, luma);
  float crystalHi = max(luma - 0.65, 0.0) * 2.5;

  vec3 metalColor = texColor.rgb * 1.38 + vec3(0.04, 0.018, 0.0);
  vec3 glassColor = texColor.rgb * (0.70 + crystalBright * 0.30)
                  + vColor.rgb * 0.22 * crystalBright
                  + vec3(crystalHi * 0.40);
  vec3 baseColor = mix(glassColor, metalColor, metalMask);

  float lightFactor = 0.42 + NdotL * 0.58;
  float nh2 = NdotH * NdotH;
  float nh4 = nh2 * nh2;
  float nh16 = nh4 * nh4;
  float tightSpec = nh16 * nh16 * nh16 * nh16;
  float specularStrength = mix(0.06, 0.22, metalMask);
  vec3 finalColor = baseColor * lightFactor + vec3(tightSpec * specularStrength);

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
