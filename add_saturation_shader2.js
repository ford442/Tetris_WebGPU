const fs = require('fs');

function updateShader(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  // Let's just find the end of the main fragment function and insert the saturation boost right before the return statement
  // All 3 shaders return vec4<f32>(color, 1.0); or similar. Let's look for return vec4

  content = content.replace(
    /(return vec4<f32>\(color, 1\.0\);)/g,
    '// NEON BRICKLAYER: Line Clear Escalation Saturation Boost\n            let satBoost = uniforms.saturationBoost;\n            if (satBoost > 0.001) {\n                let luma = dot(color, vec3<f32>(0.299, 0.587, 0.114));\n                color = mix(vec3<f32>(luma), color, 1.0 + satBoost);\n            }\n            $1'
  );

  fs.writeFileSync(filepath, content);
}

updateShader('src/webgpu/shaders/materialAwarePostProcess.ts');
updateShader('src/webgpu/shaders/enhancedPostProcess.ts');
updateShader('src/webgpu/shaders/postProcess.ts');
