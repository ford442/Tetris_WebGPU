const fs = require('fs');

function updateShader(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  content = content.replace(
    /(\/\/ HDR tone mapping)/g,
    '// NEON BRICKLAYER: Line Clear Escalation Saturation Boost\n            let satBoost = uniforms.saturationBoost;\n            if (satBoost > 0.001) {\n                let luma = dot(color, vec3<f32>(0.299, 0.587, 0.114));\n                color = mix(vec3<f32>(luma), color, 1.0 + satBoost);\n            }\n\n            $1'
  );

  fs.writeFileSync(filepath, content);
}

updateShader('src/webgpu/shaders/materialAwarePostProcess.ts');
updateShader('src/webgpu/shaders/enhancedPostProcess.ts');
updateShader('src/webgpu/shaders/postProcess.ts');
