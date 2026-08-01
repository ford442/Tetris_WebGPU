import fs from 'fs';
let code = fs.readFileSync('src/webgpu/shaders/wgsl/block/fragmentMain.wgsl', 'utf8');
code = code.replace(/let fresnel = pow\(rimPower, fresnelParams.fresnelPower\);/g, 'let f2 = rimPower * rimPower; let fresnel = f2 * f2 * rimPower; // approximated pow(rimPower, 5.0)');
fs.writeFileSync('src/webgpu/shaders/wgsl/block/fragmentMain.wgsl', code);
