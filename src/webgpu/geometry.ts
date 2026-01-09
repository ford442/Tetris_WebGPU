/**
 * WebGPU Geometry Data
 * Contains functions for generating geometry data used in rendering
 */

export const CubeData = () => {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  // Configuration for smoothness
  const segments = 16;
  const radius = 0.2; // Rounded corner radius
  const boxSize = 1.0 - radius;

  // Helper to add a single vertex
  // We now calculate UVs based on the Final projected position to avoid distortion
  const pushVertex = (x: number, y: number, z: number, uAxis: string, vAxis: string, uDir: number, vDir: number) => {
    // 1. Clamp point to the inner box
    const innerX = Math.max(-boxSize, Math.min(x, boxSize));
    const innerY = Math.max(-boxSize, Math.min(y, boxSize));
    const innerZ = Math.max(-boxSize, Math.min(z, boxSize));

    // 2. Calculate vector from inner box to the point
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

    positions.push(fx, fy, fz);
    normals.push(nx, ny, nz);

    // 5. Planar UV Mapping (Fixes distortion)
    // Extract the relevant coords for this face (e.g., x and y for Front face)
    // Map from roughly -1..1 to 0..1
    // We use the 'uAxis' and 'vAxis' strings to pick coordinates dynamically
    const p: any = { x: fx, y: fy, z: fz };

    // Normalize coordinates (-1 to 1) -> (0 to 1)
    // We divide by (boxSize + radius) which is 1.0, so just * 0.5 + 0.5
    let u = (p[uAxis] * uDir + 1.0) * 0.5;
    let v = (p[vAxis] * vDir + 1.0) * 0.5;

    uvs.push(u, v);
  };

  // Helper to generate a grid for a face
  const buildFace = (uAxis: string, vAxis: string, wAxis: string, wVal: number, uDir: number, vDir: number) => {
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < segments; j++) {
        // Grid coordinates (-1 to 1)
        const u0 = (i / segments) * 2 - 1;
        const u1 = ((i + 1) / segments) * 2 - 1;
        const v0 = (j / segments) * 2 - 1;
        const v1 = ((j + 1) / segments) * 2 - 1;

        // Apply direction flips for the grid generation
        const pa = u0 * uDir;
        const pb = u1 * uDir;
        const qa = v0 * vDir;
        const qb = v1 * vDir;

        const getP = (a: number, b: number) => {
           return { [uAxis]: a, [vAxis]: b, [wAxis]: wVal };
        }

        // Triangle 1
        let p = getP(pa, qa); pushVertex(p.x, p.y, p.z, uAxis, vAxis, uDir, vDir);
        p = getP(pb, qa);     pushVertex(p.x, p.y, p.z, uAxis, vAxis, uDir, vDir);
        p = getP(pb, qb);     pushVertex(p.x, p.y, p.z, uAxis, vAxis, uDir, vDir);

        // Triangle 2
        p = getP(pa, qa);     pushVertex(p.x, p.y, p.z, uAxis, vAxis, uDir, vDir);
        p = getP(pb, qb);     pushVertex(p.x, p.y, p.z, uAxis, vAxis, uDir, vDir);
        p = getP(pa, qb);     pushVertex(p.x, p.y, p.z, uAxis, vAxis, uDir, vDir);
      }
    }
  };

  // Generate 6 faces
  // Note: vDir is -1 for Front to map Top (+Y) to UV(0) and Bottom (-Y) to UV(1) if desired,
  // OR we fix it in the shader. Let's use standard Right-Hand Rule unwrap here.
  buildFace('x', 'y', 'z',  1,  1, 1); // Front
  buildFace('x', 'y', 'z', -1, -1, 1); // Back
  buildFace('z', 'y', 'x',  1, -1, 1); // Right
  buildFace('z', 'y', 'x', -1,  1, 1); // Left
  buildFace('x', 'z', 'y',  1,  1, -1); // Top
  buildFace('x', 'z', 'y', -1,  1, -1); // Bottom (Aligned to Top)

  return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs) };
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
    const yTop = 1.1;
    const yBottom = -42.9;
    for (let i = 1; i <= 9; i++) {
        const x = i * 2.2 - 1.1;
        positions.push(x, yTop, -0.5);
        positions.push(x, yBottom, -0.5);
    }
    const xLeft = -1.1;
    const xRight = 20.9;
    for (let j = 1; j <= 19; j++) {
        const y = j * -2.2 + 1.1;
        positions.push(xLeft, y, -0.5);
        positions.push(xRight, y, -0.5);
    }
    return new Float32Array(positions);
};
