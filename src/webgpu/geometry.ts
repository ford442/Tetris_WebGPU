/**
 * WebGPU Geometry Data
 * Contains functions for generating geometry data used in rendering
 */

export const CubeData = () => {
  const positions = new Float32Array([
    // Front face
    -1, -1,  1,   1, -1,  1,   1,  1,  1,   1,  1,  1,  -1,  1,  1,  -1, -1,  1,
    // Right face
     1, -1,  1,   1, -1, -1,   1,  1, -1,   1,  1, -1,   1,  1,  1,   1, -1,  1,
    // Back face
    -1, -1, -1,  -1,  1, -1,   1,  1, -1,   1,  1, -1,   1, -1, -1,  -1, -1, -1,
    // Left face
    -1, -1,  1,  -1,  1,  1,  -1,  1, -1,  -1,  1, -1,  -1, -1, -1,  -1, -1,  1,
    // Top face
    -1,  1,  1,   1,  1,  1,   1,  1, -1,   1,  1, -1,  -1,  1, -1,  -1,  1,  1,
    // Bottom face
    -1, -1,  1,  -1, -1, -1,   1, -1, -1,   1, -1, -1,   1, -1,  1,  -1, -1,  1,
  ]);

  const normals = new Float32Array([
    // Front
    0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
    // Right
    1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
    // Back
    0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
    // Left
    -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,
    // Top
    0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
    // Bottom
    0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,
  ]);

  // Add UV coordinates for texture mapping
  const uvs = new Float32Array([
    // Front
    0, 0,  1, 0,  1, 1,  1, 1,  0, 1,  0, 0,
    // Right
    0, 0,  1, 0,  1, 1,  1, 1,  0, 1,  0, 0,
    // Back
    0, 0,  1, 0,  1, 1,  1, 1,  0, 1,  0, 0,
    // Left
    0, 0,  1, 0,  1, 1,  1, 1,  0, 1,  0, 0,
    // Top
    0, 0,  1, 0,  1, 1,  1, 1,  0, 1,  0, 0,
    // Bottom
    0, 0,  1, 0,  1, 1,  1, 1,  0, 1,  0, 0,
  ]);

  return { positions, normals, uvs };
};

export const FullScreenQuadData = () => {
    const positions = new Float32Array([
        -1.0, -1.0, 0.0,
         1.0, -1.0, 0.0,
        -1.0,  1.0, 0.0,
        -1.0,  1.0, 0.0,
         1.0, -1.0, 0.0,
         1.0,  1.0, 0.0,
    ]);
    return { positions };
};

export const GridData = () => {
    const positions: number[] = [];
    // Vertical lines
    const yTop = 1.1;
    const yBottom = -42.9;
    for (let i = 1; i <= 9; i++) {
        const x = i * 2.2 - 1.1;
        positions.push(x, yTop, -0.5); // Slightly behind blocks
        positions.push(x, yBottom, -0.5);
    }
    // Horizontal lines
    const xLeft = -1.1;
    const xRight = 20.9;
    for (let j = 1; j <= 19; j++) {
        const y = j * -2.2 + 1.1;
        positions.push(xLeft, y, -0.5);
        positions.push(xRight, y, -0.5);
    }
    return new Float32Array(positions);
};
