const fs = require('fs');
function updateShader(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  // Add the saturation step near the end of the post-process pipeline before the final tone mapping or return
  // I will look for // JUICE: Supernova Line Clear Laser and append to it.
  content = content.replace(
    /(\/\/ JUICE: Supernova Line Clear Laser.*?\n(.*\n){14}            })/,
    '$1\n\n            // NEON BRICKLAYER: Line Clear Escalation Saturation Boost\n            let satBoost = uniforms.saturationBoost;\n            if (satBoost > 0.001) {\n                let luma = dot(color, vec3<f32>(0.299, 0.587, 0.114));\n                color = mix(vec3<f32>(luma), color, 1.0 + satBoost);\n            }'
  );

  // Update WGSL struct
  content = content.replace(
    /neonBurst: f32,\n    _padTail0: f32,\n    _padTail1: f32,\n    _padTail2: f32,/,
    'neonBurst: f32,\n    saturationBoost: f32,\n    _padTail1: f32,\n    _padTail2: f32,'
  );

  fs.writeFileSync(filepath, content);
}

updateShader('src/webgpu/shaders/materialAwarePostProcess.ts');
updateShader('src/webgpu/shaders/enhancedPostProcess.ts');
updateShader('src/webgpu/shaders/postProcess.ts');
