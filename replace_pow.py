import os

files = [
    'src/webgpu/shaders/materialAwarePostProcess.ts',
    'src/webgpu/shaders/enhancedPostProcess.ts',
    'src/webgpu/shaders/postProcess.ts'
]

for file in files:
    with open(file, 'r') as f:
        content = f.read()

    content = content.replace('pow(bhTime, 0.4)', 'sqrt(bhTime)')

    with open(file, 'w') as f:
        f.write(content)
