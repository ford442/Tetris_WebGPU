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

    // Create memory in JS and pass into WASM (ensures at least 1 page exists)
    this.instance.wasmMemory = new WebAssembly.Memory({ initial: 1 }); // 64KB
    // Attach memory to imports in a type-safe way
    (imports as any).env = { ...(imports as any).env, memory: this.instance.wasmMemory };

    try {
        // Fetch and instantiate the WASM module (try root and relative paths)
        const candidates = [
            './release.wasm',
            '/release.wasm'
        ];
        let buffer: ArrayBuffer | null = null;
        let fetchedUrl = '';
        for (const url of candidates) {
            try {
                const res = await fetch(url);
                if (!res.ok) {
                    console.warn(`WASM fetch ${url} failed: ${res.status}`);
                    continue;
                }
                const ab = await res.arrayBuffer();
                const magic = new Uint8Array(ab.slice(0, 4));
                if (magic[0] === 0x00 && magic[1] === 0x61 && magic[2] === 0x73 && magic[3] === 0x6d) {
                    buffer = ab;
                    fetchedUrl = url;
                    break;
                } else {
                    console.warn(`WASM fetch ${url} returned non-wasm content (magic: ${Array.from(magic).map(b => b.toString(16)).join(' ')})`);
                }
            } catch (e) {
                console.warn(`WASM fetch ${url} failed:`, e);
            }
        }

        if (!buffer) {
            throw new Error('WASM module not found or invalid');
        }

        const module = await WebAssembly.instantiate(buffer, imports);

        // Capture exports
        this.instance.exports = module.instance.exports || {};

        // Safety check: our JS-created memory should have a usable buffer
        if (!this.instance.wasmMemory || this.instance.wasmMemory.buffer.byteLength === 0) {
            throw new Error("WASM memory is 0 bytes after instantiation");
        }

        // Create the view on the memory we created
        this.instance.playfieldView = new Int8Array(this.instance.wasmMemory.buffer, 0, 200);

        console.log(`WASM Physics Core Initialized (memory=${this.instance.wasmMemory.buffer.byteLength} bytes) from`, fetchedUrl);
    } catch (e) {
        // Log detailed diagnostics and continue so the application can use the JS fallback
        console.warn("WASM Init Failed (Using JS Fallback):", e);
        // Swallow the error intentionally - Game.ts will fallback to JS memory if needed
    }
  }

  static get(): WasmCore {
    if (!this.instance) this.instance = new WasmCore();
    return this.instance;
  }

  // --- API Wrappers ---

  checkCollision(coords: {x: number, y: number}[], offsetX: number, offsetY: number): boolean {
    const core = WasmCore.instance;
    if (!core || !core.exports || !core.exports.checkPieceCollision) return false;

    return core.exports.checkPieceCollision(
      coords[0].x + offsetX, coords[0].y + offsetY,
      coords[1].x + offsetX, coords[1].y + offsetY,
      coords[2].x + offsetX, coords[2].y + offsetY,
      coords[3].x + offsetX, coords[3].y + offsetY
    ) === 1; // WASM returns 1 for true
  }
}