const fs = require('fs');
let content = fs.readFileSync('src/webgpu/viewRenderLoop.ts', 'utf8');

content = content.replace(
  /  view\._postProcessParams\.neonBurst = view\.neonBurstUniform \? view\.neonBurstUniform\[0\] : 0\.0;/,
  '  view._postProcessParams.neonBurst = view.neonBurstUniform ? view.neonBurstUniform[0] : 0.0;\n  view._postProcessParams.saturationBoost = view.visualEffects.saturationBoost || 0.0;'
);

fs.writeFileSync('src/webgpu/viewRenderLoop.ts', content);
