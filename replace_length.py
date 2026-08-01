import os

files = [
    'src/webgpu/shaders/materialAwarePostProcess.ts',
    'src/webgpu/shaders/enhancedPostProcess.ts',
    'src/webgpu/shaders/postProcess.ts'
]

for file in files:
    with open(file, 'r') as f:
        content = f.read()

    content = content.replace('length(centered)', 'sqrt(dot(centered, centered))')
    content = content.replace('length(bhDiff)', 'sqrt(dot(bhDiff, bhDiff))')
    content = content.replace('length(p)', 'sqrt(dot(p, p))')
    content = content.replace('length(uv - center)', 'sqrt(dot(uv - center, uv - center))')
    content = content.replace('length(uv - vec2<f32>(0.5, 0.5))', 'sqrt(dot(uv - vec2<f32>(0.5, 0.5), uv - vec2<f32>(0.5, 0.5)))')

    with open(file, 'w') as f:
        f.write(content)
