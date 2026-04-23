/**
 * WebGPU Geometry Data
 * Contains functions for generating geometry data used in rendering
 */

export const CubeData = () => {
  // --- CONFIGURATION ---
  const segments = 16;
  const radius = 0.2; // Size of the rounded corner
  const boxSize = 1.0 - radius; // The distance from center to the start of the bevel

  // 6 faces * (segments * segments) quads per face * 6 vertices per quad * 3 components per vertex
  const totalVertices = 6 * (segments * segments) * 6;
  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  const uvs = new Float32Array(totalVertices * 2);

  let pIndex = 0;
  let nIndex = 0;
  let uIndex = 0;

  // Keep the face UVs normalized because the shader now samples
  // a single tile from the texture atlas for each block face.
  const textureScale = 0.98; // Zoom in to avoid blurry tile edges

  const pushVertex = (x: number, y: number, z: number, uAxis: string, vAxis: string, uDir: number, vDir: number) => {
    // 1. Clamp to inner box
    const innerX = Math.max(-boxSize, Math.min(x, boxSize));
    const innerY = Math.max(-boxSize, Math.min(y, boxSize));
    const innerZ = Math.max(-boxSize, Math.min(z, boxSize));

    // 2. Vector to surface
    let dx = x - innerX;
    let dy = y - innerY;
    let dz = z - innerZ;

    // 3. Normalize
    const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
    let nx = 0, ny = 0, nz = 0;

    if (len < 0.0001) {
       const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
       if (ax >= ay && ax >= az) nx = Math.sign(x);
       else if (ay >= ax && ay >= az) ny = Math.sign(y);
       else nz = Math.sign(z);
    } else {
       nx = dx / len; ny = dy / len; nz = dz / len;
    }

    // 4. Final Position
    const fx = innerX + nx * radius;
    const fy = innerY + ny * radius;
    const fz = innerZ + nz * radius;

    positions[pIndex++] = fx;
    positions[pIndex++] = fy;
    positions[pIndex++] = fz;

    normals[nIndex++] = nx;
    normals[nIndex++] = ny;
    normals[nIndex++] = nz;

    // 5. UV Mapping with Scale
    const p: any = { x: fx, y: fy, z: fz };

    // Standard planar map (-1..1 -> 0..1)
    let u = (p[uAxis] * uDir + 1.0) * 0.5;
    let v = (p[vAxis] * vDir + 1.0) * 0.5;

    // Apply Scaling (Center the zoom)
    // Formula: (uv - 0.5) * scale + 0.5
    u = (u - 0.5) * textureScale + 0.5;
    v = (v - 0.5) * textureScale + 0.5;

    uvs[uIndex++] = u;
    uvs[uIndex++] = v;
  };

  const buildFace = (uAxis: string, vAxis: string, wAxis: string, wVal: number, uDir: number, vDir: number) => {
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < segments; j++) {
        // Grid coords (-1 to 1)
        const u0 = (i / segments) * 2 - 1;
        const u1 = ((i + 1) / segments) * 2 - 1;
        const v0 = (j / segments) * 2 - 1;
        const v1 = ((j + 1) / segments) * 2 - 1;

        const pa = u0 * uDir;
        const pb = u1 * uDir;
        const qa = v0 * vDir;
        const qb = v1 * vDir;

        const getP = (a: number, b: number) => {
           return { [uAxis]: a, [vAxis]: b, [wAxis]: wVal };
        }

        // Triangles
        let p = getP(pa, qa); pushVertex(p.x, p.y, p.z, uAxis, vAxis, uDir, vDir);
        p = getP(pb, qa);     pushVertex(p.x, p.y, p.z, uAxis, vAxis, uDir, vDir);
        p = getP(pb, qb);     pushVertex(p.x, p.y, p.z, uAxis, vAxis, uDir, vDir);

        p = getP(pa, qa);     pushVertex(p.x, p.y, p.z, uAxis, vAxis, uDir, vDir);
        p = getP(pb, qb);     pushVertex(p.x, p.y, p.z, uAxis, vAxis, uDir, vDir);
        p = getP(pa, qb);     pushVertex(p.x, p.y, p.z, uAxis, vAxis, uDir, vDir);
      }
    }
  };

  buildFace('x', 'y', 'z',  1,  1, 1);
  buildFace('x', 'y', 'z', -1, -1, 1);
  buildFace('z', 'y', 'x',  1, -1, 1);
  buildFace('z', 'y', 'x', -1,  1, 1);
  buildFace('x', 'z', 'y',  1,  1, -1);
  buildFace('x', 'z', 'y', -1,  1, -1);

  return { positions, normals, uvs };
};

let _fullScreenQuadData: Float32Array;
export const FullScreenQuadData = () => {
    if (!_fullScreenQuadData) _fullScreenQuadData = new Float32Array([
        -1.0, -1.0, 0.0,
         1.0, -1.0, 0.0,
        -1.0,  1.0, 0.0,
        -1.0,  1.0, 0.0,
         1.0, -1.0, 0.0,
         1.0,  1.0, 0.0,
    ]);
    return { positions: _fullScreenQuadData };
};

let _gridDataPositions: Float32Array;
export const GridData = () => {
    // 9 vertical lines * 2 points * 3 components = 54
    // 19 horizontal lines * 2 points * 3 components = 114
    // Total = 168
    if (!_gridDataPositions) _gridDataPositions = new Float32Array(168);
    const positions = _gridDataPositions;
    let index = 0;

    const yTop = 1.1;
    const yBottom = -42.9;
    for (let i = 1; i <= 9; i++) {
        const x = i * 2.2 - 1.1;
        positions[index++] = x;
        positions[index++] = yTop;
        positions[index++] = -0.5;
        positions[index++] = x;
        positions[index++] = yBottom;
        positions[index++] = -0.5;
    }
    const xLeft = -1.1;
    const xRight = 20.9;
    for (let j = 1; j <= 19; j++) {
        const y = j * -2.2 + 1.1;
        positions[index++] = xLeft;
        positions[index++] = y;
        positions[index++] = -0.5;
        positions[index++] = xRight;
        positions[index++] = y;
        positions[index++] = -0.5;
    }
    return positions;
};
