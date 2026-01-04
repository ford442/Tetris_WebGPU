/**
 * WebGPU Geometry Data
 * Contains functions for generating geometry data used in rendering
 */

export const CubeData = () => {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  // Configuration for smoothness
  const segments = 16;     // Increased for Gem Quality
  const radius = 0.2;      // Larger radius for rounded gem
  const boxSize = 1.0 - radius;
  const bevel = 0.02;      // Micro-bevel for flat faces

  // Helper to add a single vertex with "Spherified Box" logic
  const pushVertex = (x: number, y: number, z: number, u: number, v: number) => {
    // 1. Clamp point to the inner box (this defines the flat centers)
    const innerX = Math.max(-boxSize, Math.min(x, boxSize));
    const innerY = Math.max(-boxSize, Math.min(y, boxSize));
    const innerZ = Math.max(-boxSize, Math.min(z, boxSize));

    // 2. Calculate vector from inner box to the point
    let dx = x - innerX;
    let dy = y - innerY;
    let dz = z - innerZ;

    // 3. Normalize that vector to get the corner direction
    const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
    let nx = 0, ny = 0, nz = 0;

    // If length is 0, we are on a flat face, use axis direction
    if (len < 0.0001) {
       // Determine face based on max component
       const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
       if (ax >= ay && ax >= az) nx = Math.sign(x);
       else if (ay >= ax && ay >= az) ny = Math.sign(y);
       else nz = Math.sign(z);

       // Apply Micro-Bevel to flat faces for light catching
       // We slightly inset the "inner" point based on thickness?
       // Or just use the normal.
       // Actually, we are displacing "from inner box". If len=0, we are ON the inner box surface.
       // The "radius" is added below.
       // To bevel, we want flat faces to be slightly angled or the transition to be sharper?
       // For now, let's keep it simple as rounding provides good highlights.

    } else {
       // We are on a rounded corner/edge
       nx = dx / len; ny = dy / len; nz = dz / len;
    }

    // 4. Project new position: InnerBox + Normal * Radius
    positions.push(innerX + nx * radius, innerY + ny * radius, innerZ + nz * radius);
    normals.push(nx, ny, nz);
    uvs.push(u, v);
  };

  // Helper to generate a grid for a face
  const buildFace = (uAxis: string, vAxis: string, wAxis: string, wVal: number, uDir: number, vDir: number) => {
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < segments; j++) {
        // Calculate 0..1 UVs for the quad
        const u0 = i / segments;
        const u1 = (i + 1) / segments;
        const v0 = j / segments;
        const v1 = (j + 1) / segments;

        // Calculate -1..1 coordinates
        const pa = (u0 * 2 - 1) * uDir;
        const pb = (u1 * 2 - 1) * uDir;
        const qa = (v0 * 2 - 1) * vDir;
        const qb = (v1 * 2 - 1) * vDir;

        // Define the 4 corners of the quad
        const getP = (a: number, b: number) => {
           const p: any = { [uAxis]: a, [vAxis]: b, [wAxis]: wVal };
           return p;
        }

        // Triangle 1
        const p1 = getP(pa, qa); pushVertex(p1.x, p1.y, p1.z, u0, v0);
        const p2 = getP(pb, qa); pushVertex(p2.x, p2.y, p2.z, u1, v0);
        const p3 = getP(pb, qb); pushVertex(p3.x, p3.y, p3.z, u1, v1);

        // Triangle 2
        const p4 = getP(pa, qa); pushVertex(p4.x, p4.y, p4.z, u0, v0);
        const p5 = getP(pb, qb); pushVertex(p5.x, p5.y, p5.z, u1, v1);
        const p6 = getP(pa, qb); pushVertex(p6.x, p6.y, p6.z, u0, v1);
      }
    }
  };

  // Generate 6 faces
  buildFace('x', 'y', 'z',  1,  1, -1); // Front
  buildFace('x', 'y', 'z', -1, -1, -1); // Back (flipped U)
  buildFace('z', 'y', 'x',  1, -1, -1); // Right
  buildFace('z', 'y', 'x', -1,  1, -1); // Left
  buildFace('x', 'z', 'y',  1,  1,  1); // Top
  buildFace('x', 'z', 'y', -1,  1, -1); // Bottom

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
