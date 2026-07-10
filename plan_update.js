const fs = require('fs');

const path = 'src/webgpu/postProcessUniforms.ts';
let content = fs.readFileSync(path, 'utf8');

// Replace WGSL struct to add saturationBoost
content = content.replace(
  /neonBurst: f32,               \/\/ 176 - hard-drop radial glow\/distortion\n    _padTail0: f32,               \/\/ 180\n    _padTail1: f32,               \/\/ 184\n    _padTail2: f32,               \/\/ 188/,
  'neonBurst: f32,               // 176 - hard-drop radial glow/distortion\n    saturationBoost: f32,         // 180 - Line Clear Escalation\n    _padTail1: f32,               // 184\n    _padTail2: f32,               // 188'
);

content = content.replace(
  /  neonBurst\?: number;\n}/,
  '  neonBurst?: number;\n  saturationBoost?: number;\n}'
);

content = content.replace(
  /    blackHoleCenter: \[0\.5, 0\.5\],\n  };/,
  '    blackHoleCenter: [0.5, 0.5],\n    saturationBoost: 0,\n  };'
);

content = content.replace(
  /    this\.data\[45\] = 0; \/\/ _padTail0\n    this\.data\[46\] = 0; \/\/ _padTail1\n    this\.data\[47\] = 0; \/\/ _padTail2/,
  '    this.data[45] = v.saturationBoost ?? 0; // saturationBoost @ 180\n    this.data[46] = 0; // _padTail1\n    this.data[47] = 0; // _padTail2'
);

fs.writeFileSync(path, content);
