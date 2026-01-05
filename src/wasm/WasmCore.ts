// src/wasm/WasmCore.ts

export class WasmCore {
  private static instance: WasmCore;
  private wasmMemory!: WebAssembly.Memory;
  private exports!: any;
  
  // SHARED MEMORY VIEW: Direct link to WASM linear memory
  public playfieldView!: Int8Array;

  private constructor() {}

  static async init(): Promise<void> {
    if (this.instance) return;

    this.instance = new WasmCore();

    const imports = {
      env: {
        abort: (_msg: number, _file: number, line: number, column: number) => {
          console.error(`WASM Abort at ${line}:${column}`);
        },
        seed: () => Math.random() // For random generator if moved to WASM
      }
    };

    try {
        // Fetch and instantiate the WASM module
        const response = await fetch('build/release.wasm');
        const buffer = await response.arrayBuffer();
        const module = await WebAssembly.instantiate(buffer, imports);
    
        this.instance.exports = module.instance.exports;
        this.instance.wasmMemory = module.instance.exports.memory as WebAssembly.Memory;
        
        // CRITICAL: Create a view on the first 200 bytes (10x20 grid)
        // This MUST NOT be recreated frequently, but if the WASM memory grows, 
        // the buffer detaches and this must be refreshed. 
        // (For Tetris, memory won't grow, so this is safe).
        this.instance.playfieldView = new Int8Array(this.instance.wasmMemory.buffer, 0, 200);
        
        console.log("WASM Physics Core Initialized");
    } catch (e) {
        console.warn("WASM failed to load, using fallback JS implementation:", e);
        // Fallback: create a JS-backed memory and a simple checkPieceCollision implementation
        this.instance.wasmMemory = new WebAssembly.Memory({ initial: 1 });
        this.instance.playfieldView = new Int8Array(this.instance.wasmMemory.buffer, 0, 200);

        // Very small JS implementation that mirrors the intended WASM behavior
        this.instance.exports = {
            checkPieceCollision: (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) => {
                const view = this.instance.playfieldView;
                const WIDTH = 10;
                const HEIGHT = 20;
                function isOccupied(x: number, y: number): boolean {
                    if (x < 0 || x >= WIDTH || y >= HEIGHT) return true;
                    if (y < 0) return false;
                    return view[y * WIDTH + x] !== 0;
                }
                return (isOccupied(x1, y1) || isOccupied(x2, y2) || isOccupied(x3, y3) || isOccupied(x4, y4)) ? 1 : 0;
            }
        } as any;
    }
  }

  static get(): WasmCore {
    if (!this.instance) throw new Error("WasmCore not initialized!");
    return this.instance;
  }

  // --- API Wrappers ---

  checkCollision(coords: {x: number, y: number}[], offsetX: number, offsetY: number): boolean {
    // Unroll the loop for standard 4-block tetromino
    // Passing integers is much faster than passing arrays/objects to WASM
    return this.exports.checkPieceCollision(
      coords[0].x + offsetX, coords[0].y + offsetY,
      coords[1].x + offsetX, coords[1].y + offsetY,
      coords[2].x + offsetX, coords[2].y + offsetY,
      coords[3].x + offsetX, coords[3].y + offsetY
    ) === 1; // WASM returns 1 for true
  }
}