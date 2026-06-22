import {
  type BlockTextureConfig,
  SINGLE_TILE_TEXTURE_CONFIG,
} from '../webgpu/blockTexture.js';
import { extractBlockTileFromImage } from '../webgpu/blockTextureExtract.js';

type MaskLabParams = {
  // Extraction controls
  materialDetectionMode: BlockTextureConfig['materialDetectionMode'];
  maskOuterForce: number;
  maskFeatherPx: number;
  warmthLumaBandA0: number;
  warmthLumaBandA1: number;
  warmthLumaBandB0: number;
  warmthLumaBandB1: number;
  warmthSignalClampMin?: number;
  warmthSignalClampMax?: number;

  // Glass opacity controls (authoring curve)
  glassMin: number;
  glassMax: number;
  glassFresnelPower: number;

  // Preview controls
  previewScale: number;

  // Piece tint (optional)
  pieceTint: string;

  // Crop controls (minimal; extractor uses subregion when samplingMode='subregion')
  samplingMode: BlockTextureConfig['samplingMode'];
  subregionX: number;
  subregionY: number;
  subregionW: number;
  subregionH: number;
  subregionInset: number;
};

function isLocalhostHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname.endsWith('.local');
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return { r: 1, g: 1, b: 1 };
  const v = m[1];
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  return { r, g, b };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function debounce<T extends (...args: any[]) => void>(fn: T, waitMs: number): T {
  let t: any = null;
  return ((...args: any[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), waitMs);
  }) as T;
}

async function loadImageFromFile(file: File): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(file);
  return bitmap;
}

async function downloadCanvas(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function renderMaskOverlay(
  baseCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  outCanvas: HTMLCanvasElement,
  overlay: { r: number; g: number; b: number },
  metalOrGlass: 'metal' | 'glass',
): void {
  const w = outCanvas.width;
  const h = outCanvas.height;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return;

  outCtx.clearRect(0, 0, w, h);

  // Render at output resolution for correct per-pixel sampling.
  outCtx.drawImage(baseCanvas, 0, 0, w, h);
  const base = outCtx.getImageData(0, 0, w, h);

  const tmpMask = makeCanvas(w, h);
  const tmpMaskCtx = tmpMask.getContext('2d');
  if (!tmpMaskCtx) return;
  tmpMaskCtx.drawImage(maskCanvas, 0, 0, w, h);
  const maskData = tmpMaskCtx.getImageData(0, 0, w, h).data;
  const d = base.data;

  for (let i = 0; i < w * h; i++) {
    const a = maskData[i * 4] / 255; // grayscale (r=g=b)
    const metal = a;
    const glass = 1 - a;
    const t = metalOrGlass === 'metal' ? metal : glass;

    // Overlay intensity. Keeps visualization clear without destroying base detail.
    const k = Math.pow(t, 0.85) * 0.85;
    const idx = i * 4;
    d[idx + 0] = d[idx + 0] * (1 - k) + overlay.r * 255 * k;
    d[idx + 1] = d[idx + 1] * (1 - k) + overlay.g * 255 * k;
    d[idx + 2] = d[idx + 2] * (1 - k) + overlay.b * 255 * k;
  }

  outCtx.putImageData(base, 0, 0);
}

function renderFinalAlphaPreview(
  tileCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  outCanvas: HTMLCanvasElement,
  params: Pick<MaskLabParams, 'glassMin' | 'glassMax' | 'glassFresnelPower' | 'pieceTint'>,
): void {
  const w = outCanvas.width;
  const h = outCanvas.height;
  const ctx = outCanvas.getContext('2d');
  if (!ctx) return;

  const tmpTile = makeCanvas(w, h);
  const tmpTileCtx = tmpTile.getContext('2d');
  if (!tmpTileCtx) return;
  tmpTileCtx.drawImage(tileCanvas, 0, 0, w, h);

  const tmpMask = makeCanvas(w, h);
  const tmpMaskCtx = tmpMask.getContext('2d');
  if (!tmpMaskCtx) return;
  tmpMaskCtx.drawImage(maskCanvas, 0, 0, w, h);

  const tile = tmpTileCtx.getImageData(0, 0, w, h).data;
  const mask = tmpMaskCtx.getImageData(0, 0, w, h).data;
  const outImage = ctx.createImageData(w, h);

  const tint = parseHexColor(params.pieceTint);

  // Match shader constants used in authored path:
  // metalOpaque = smoothstep(0.45, 0.65, metalSoftBaked)
  const metalEdge0 = 0.45;
  const metalEdge1 = 0.65;

  for (let i = 0; i < w * h; i++) {
    const u = (i % w) / Math.max(1, w - 1);
    const v = Math.floor(i / w) / Math.max(1, h - 1);
    const uvEdgeDist = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2.0;
    const edgeFresnel = clamp01(uvEdgeDist);

    const metalSoft = mask[i * 4] / 255;
    const metalOpaque = smoothstep(metalEdge0, metalEdge1, metalSoft);
    const glassMaskAlpha = 1 - metalOpaque;

    const glassFactor = Math.pow(edgeFresnel, Math.max(0.001, params.glassFresnelPower));
    const glassOpacity = params.glassMin + (params.glassMax - params.glassMin) * glassFactor;

    // Shader: finalAlpha = mix(1.0, glassOpacity, glassMaskAlpha)
    const outAlpha = 1 + (glassOpacity - 1) * glassMaskAlpha;

    const idx = i * 4;
    const baseR = tile[idx + 0] / 255;
    const baseG = tile[idx + 1] / 255;
    const baseB = tile[idx + 2] / 255;

    // Gentle piece tint in the glass region only.
    const glassTintStrength = 0.22 * (1 - metalOpaque);
    const r = baseR * (1 - glassTintStrength) + tint.r * glassTintStrength;
    const g = baseG * (1 - glassTintStrength) + tint.g * glassTintStrength;
    const b = baseB * (1 - glassTintStrength) + tint.b * glassTintStrength;

    outImage.data[idx + 0] = Math.round(clamp01(r) * 255);
    outImage.data[idx + 1] = Math.round(clamp01(g) * 255);
    outImage.data[idx + 2] = Math.round(clamp01(b) * 255);
    outImage.data[idx + 3] = Math.round(clamp01(outAlpha) * 255);
  }

  // Checkerboard video portal hint behind alpha.
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0b0b12';
  ctx.fillRect(0, 0, w, h);
  const s = 8;
  for (let y = 0; y < h; y += s) {
    for (let x = 0; x < w; x += s) {
      const isOdd = ((x / s) ^ (y / s)) & 1;
      ctx.fillStyle = isOdd ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.0)';
      ctx.fillRect(x, y, s, s);
    }
  }

  // Composite block over background via drawImage (so alpha blends properly).
  const blockCanvas = makeCanvas(w, h);
  const blockCtx = blockCanvas.getContext('2d');
  if (!blockCtx) return;
  blockCtx.putImageData(outImage, 0, 0);
  ctx.drawImage(blockCanvas, 0, 0);
}

export async function maybeInitTextureMaskLab(uiContainer: HTMLElement): Promise<void> {
  if (typeof window === 'undefined') return;
  const enabledKey = localStorage.getItem('tetris_texture_mask_lab');
  const enabled = enabledKey === '1' || new URLSearchParams(window.location.search).get('masklab') === '1';
  if (!enabled) return;
  if (!isLocalhostHost(window.location.hostname)) return;

  const styles = document.createElement('style');
  styles.textContent = `
    .masklab-root{
      position:absolute; top:10px; right:10px; z-index:9999;
      width:min(980px, calc(100vw - 20px));
      max-height: calc(100vh - 20px);
      overflow:auto;
      background: rgba(10,10,18,0.88);
      color: #e8ecff;
      border: 1px solid rgba(120,140,255,0.35);
      border-radius: 10px;
      padding: 10px;
      backdrop-filter: blur(6px);
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
    }
    .masklab-grid{
      display:grid;
      grid-template-columns: 1fr;
      gap:10px;
    }
    .masklab-panels{
      display:grid;
      grid-template-columns: repeat(4, minmax(140px, 1fr));
      gap:10px;
      align-items:start;
    }
    .masklab-panel{
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 8px;
    }
    .masklab-canvas{
      width: 100%;
      height: auto;
      display:block;
      background: rgba(0,0,0,0.15);
      border-radius: 4px;
    }
    .masklab-controls{
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap:10px;
    }
    .masklab-control{
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 8px;
    }
    .masklab-row{
      display:flex; align-items:center; justify-content:space-between;
      gap:10px; margin: 6px 0;
    }
    .masklab-row label{
      font-size: 12px; opacity:0.9;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }
    .masklab-row input[type="range"]{ flex:1; }
    .masklab-row input[type="text"]{ width:120px; }
    .masklab-row select{ width:160px; }
    .masklab-actions{
      display:flex; gap:10px; flex-wrap:wrap;
      padding-top: 4px;
    }
    .masklab-btn{
      cursor:pointer;
      background: rgba(120,140,255,0.2);
      color: #e8ecff;
      border: 1px solid rgba(120,140,255,0.6);
      border-radius: 8px;
      padding: 8px 10px;
      font-weight: 600;
    }
    .masklab-textarea{
      width:100%; min-height: 96px;
      resize: vertical;
      background: rgba(0,0,0,0.25);
      color:#dbe2ff;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 8px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 12px;
    }
  `;
  document.head.appendChild(styles);

  const root = document.createElement('div');
  root.className = 'masklab-root';
  root.innerHTML = `
    <div class="masklab-grid">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div>
          <div style="font-weight:900; font-size:16px; letter-spacing:0.2px;">Texture Mask Lab</div>
          <div style="font-size:12px; opacity:0.85;">CPU extraction preview + side-by-side mask visualizations. localhost-only.</div>
        </div>
        <button class="masklab-btn" id="masklab-close">Close</button>
      </div>

      <div class="masklab-controls">
        <div class="masklab-control">
          <div style="font-weight:800; margin-bottom:6px; font-size:13px;">Inputs</div>
          <div class="masklab-row">
            <label>Texture PNG</label>
            <input id="masklab-texture" type="file" accept="image/png"/>
          </div>
          <div class="masklab-row">
            <label>Companion mask (optional)</label>
            <input id="masklab-mask" type="file" accept="image/png"/>
          </div>
          <div class="masklab-row">
            <label>Sampling mode</label>
            <select id="masklab-sampling">
              <option value="single" selected>single (full image)</option>
              <option value="subregion">subregion (manual crop)</option>
            </select>
          </div>
          <div class="masklab-row">
            <label>Subregion inset</label>
            <input id="masklab-inset" type="range" min="0" max="0.12" step="0.001" value="0.04"/>
          </div>
          <div style="font-size:12px; opacity:0.85; margin-top:8px; margin-bottom:6px;">Subregion (normalized)</div>
          <div class="masklab-row">
            <label>X</label><input id="masklab-subX" type="range" min="0" max="1" step="0.001" value="0.368"/>
          </div>
          <div class="masklab-row">
            <label>Y</label><input id="masklab-subY" type="range" min="0" max="1" step="0.001" value="0.193"/>
          </div>
          <div class="masklab-row">
            <label>W</label><input id="masklab-subW" type="range" min="0.01" max="1" step="0.001" value="0.247"/>
          </div>
          <div class="masklab-row">
            <label>H</label><input id="masklab-subH" type="range" min="0.01" max="1" step="0.001" value="0.446"/>
          </div>
          <div class="masklab-row">
            <label>Piece tint</label>
            <input id="masklab-tint" type="text" value="#ffd37a" />
          </div>
        </div>

        <div class="masklab-control">
          <div style="font-weight:800; margin-bottom:6px; font-size:13px;">Extraction + Mask</div>
          <div class="masklab-row">
            <label>Preview scale</label>
            <input id="masklab-scale" type="range" min="0.6" max="1" step="0.05" value="0.75"/>
          </div>
          <div class="masklab-row">
            <label>maskOuterForce</label>
            <input id="masklab-outerForce" type="range" min="0.05" max="0.22" step="0.005" value="0.13"/>
          </div>
          <div class="masklab-row">
            <label>maskFeatherPx</label>
            <input id="masklab-feather" type="range" min="1" max="6" step="1" value="1"/>
          </div>
          <div style="font-size:12px; opacity:0.85; margin-top:8px; margin-bottom:6px;">Warmth luma gate</div>
          <div class="masklab-row">
            <label>A0</label><input id="masklab-a0" type="range" min="0" max="0.6" step="0.005" value="0.25"/>
          </div>
          <div class="masklab-row">
            <label>A1</label><input id="masklab-a1" type="range" min="0" max="0.8" step="0.005" value="0.55"/>
          </div>
          <div class="masklab-row">
            <label>B0</label><input id="masklab-b0" type="range" min="0" max="1.0" step="0.005" value="0.82"/>
          </div>
          <div class="masklab-row">
            <label>B1</label><input id="masklab-b1" type="range" min="0.2" max="1.0" step="0.005" value="0.95"/>
          </div>
          <div class="masklab-row">
            <label>glassMin</label><input id="masklab-glassMin" type="range" min="0.1" max="0.9" step="0.005" value="0.38"/>
          </div>
          <div class="masklab-row">
            <label>glassMax</label><input id="masklab-glassMax" type="range" min="0.2" max="1.0" step="0.005" value="0.78"/>
          </div>
          <div class="masklab-row">
            <label>glassFresnelPower</label><input id="masklab-glassPow" type="range" min="0.5" max="6" step="0.05" value="2"/>
          </div>
        </div>
      </div>

      <div class="masklab-actions">
        <button class="masklab-btn" id="masklab-bake">Bake / Update</button>
        <button class="masklab-btn" id="masklab-autoOuter">Auto-propose outerForce</button>
        <button class="masklab-btn" id="masklab-export2x">Export 2x tile + mask</button>
        <button class="masklab-btn" id="masklab-bakeCfg">Bake suggested config</button>
      </div>

      <div class="masklab-panels">
        <div class="masklab-panel">
          <div style="font-weight:800; font-size:12px; margin-bottom:6px;">Original texture</div>
          <canvas id="masklab-original" class="masklab-canvas" width="256" height="256"></canvas>
        </div>
        <div class="masklab-panel">
          <div style="font-weight:800; font-size:12px; margin-bottom:6px;">Metal mask (red)</div>
          <canvas id="masklab-metal" class="masklab-canvas" width="256" height="256"></canvas>
        </div>
        <div class="masklab-panel">
          <div style="font-weight:800; font-size:12px; margin-bottom:6px;">Glass mask (blue)</div>
          <canvas id="masklab-glass" class="masklab-canvas" width="256" height="256"></canvas>
        </div>
        <div class="masklab-panel">
          <div style="font-weight:800; font-size:12px; margin-bottom:6px;">Final (alpha preview)</div>
          <canvas id="masklab-final" class="masklab-canvas" width="256" height="256"></canvas>
        </div>
      </div>

      <div>
        <div style="font-weight:800; font-size:13px; margin: 8px 0 6px;">Suggested BlockTextureConfig (copy/paste)</div>
        <textarea id="masklab-configOut" class="masklab-textarea" spellcheck="false"></textarea>
        <div style="font-size:12px; opacity:0.8; margin-top:6px;">
          Tip: if you exported a mask PNG, set maskUrl to it and use maskChannel:'alpha' (or your chosen channel).
        </div>
      </div>
    </div>
  `;

  const closeBtn = root.querySelector('#masklab-close') as HTMLButtonElement | null;
  closeBtn?.addEventListener('click', () => {
    root.remove();
    styles.remove();
  });

  uiContainer.appendChild(root);

  const elTexture = root.querySelector('#masklab-texture') as HTMLInputElement;
  const elMask = root.querySelector('#masklab-mask') as HTMLInputElement;
  const elSampling = root.querySelector('#masklab-sampling') as HTMLSelectElement;

  const elOuterForce = root.querySelector('#masklab-outerForce') as HTMLInputElement;
  const elFeather = root.querySelector('#masklab-feather') as HTMLInputElement;
  const elScale = root.querySelector('#masklab-scale') as HTMLInputElement;
  const elSubX = root.querySelector('#masklab-subX') as HTMLInputElement;
  const elSubY = root.querySelector('#masklab-subY') as HTMLInputElement;
  const elSubW = root.querySelector('#masklab-subW') as HTMLInputElement;
  const elSubH = root.querySelector('#masklab-subH') as HTMLInputElement;
  const elA0 = root.querySelector('#masklab-a0') as HTMLInputElement;
  const elA1 = root.querySelector('#masklab-a1') as HTMLInputElement;
  const elB0 = root.querySelector('#masklab-b0') as HTMLInputElement;
  const elB1 = root.querySelector('#masklab-b1') as HTMLInputElement;
  const elGlassMin = root.querySelector('#masklab-glassMin') as HTMLInputElement;
  const elGlassMax = root.querySelector('#masklab-glassMax') as HTMLInputElement;
  const elGlassPow = root.querySelector('#masklab-glassPow') as HTMLInputElement;
  const elTint = root.querySelector('#masklab-tint') as HTMLInputElement;
  const elInset = root.querySelector('#masklab-inset') as HTMLInputElement;

  const cOriginal = root.querySelector('#masklab-original') as HTMLCanvasElement;
  const cMetal = root.querySelector('#masklab-metal') as HTMLCanvasElement;
  const cGlass = root.querySelector('#masklab-glass') as HTMLCanvasElement;
  const cFinal = root.querySelector('#masklab-final') as HTMLCanvasElement;
  const cfgOut = root.querySelector('#masklab-configOut') as HTMLTextAreaElement;

  // Defaults
  const params: MaskLabParams = {
    materialDetectionMode: 'warmth',
    maskOuterForce: Number(elOuterForce.value),
    maskFeatherPx: Number(elFeather.value),
    warmthLumaBandA0: Number(elA0.value),
    warmthLumaBandA1: Number(elA1.value),
    warmthLumaBandB0: Number(elB0.value),
    warmthLumaBandB1: Number(elB1.value),
    glassMin: Number(elGlassMin.value),
    glassMax: Number(elGlassMax.value),
    glassFresnelPower: Number(elGlassPow.value),
    previewScale: Number(elScale.value),
    pieceTint: elTint.value,

    samplingMode: 'single',
    subregionX: 0,
    subregionY: 0,
    subregionW: 1,
    subregionH: 1,
    subregionInset: Number(elInset.value),
  };

  let originalBitmap: ImageBitmap | null = null;
  let maskBitmap: ImageBitmap | null = null;

  function syncParamsFromUI(): void {
    params.maskOuterForce = Number(elOuterForce.value);
    params.maskFeatherPx = Number(elFeather.value);
    params.previewScale = Number(elScale.value);
    params.warmthLumaBandA0 = Number(elA0.value);
    params.warmthLumaBandA1 = Number(elA1.value);
    params.warmthLumaBandB0 = Number(elB0.value);
    params.warmthLumaBandB1 = Number(elB1.value);
    params.glassMin = Number(elGlassMin.value);
    params.glassMax = Number(elGlassMax.value);
    params.glassFresnelPower = Number(elGlassPow.value);
    params.pieceTint = elTint.value.trim() || '#ffffff';
    params.subregionInset = Number(elInset.value);
    params.samplingMode = (elSampling.value as any) ?? 'single';

    params.subregionX = Number(elSubX.value);
    params.subregionY = Number(elSubY.value);
    params.subregionW = Number(elSubW.value);
    params.subregionH = Number(elSubH.value);
  }

  async function bakeAndRender(): Promise<void> {
    if (!originalBitmap) return;
    syncParamsFromUI();

    // Recreate a minimal config focused on extraction controls.
    const baseCfg: BlockTextureConfig = {
      ...SINGLE_TILE_TEXTURE_CONFIG,
      samplingMode: params.samplingMode,
      materialDetectionMode: params.materialDetectionMode,
      maskOuterForce: params.maskOuterForce,
      maskFeatherPx: params.maskFeatherPx,
      warmthLumaBandA0: params.warmthLumaBandA0,
      warmthLumaBandA1: params.warmthLumaBandA1,
      warmthLumaBandB0: params.warmthLumaBandB0,
      warmthLumaBandB1: params.warmthLumaBandB1,
      warmthSignalClampMin: params.warmthSignalClampMin,
      warmthSignalClampMax: params.warmthSignalClampMax,
      authoredGlassMin: params.glassMin,
      authoredGlassMax: params.glassMax,
      authoredGlassFresnelPower: params.glassFresnelPower,
    };

    // Allow subregion crop only when user switched to subregion.
    if (params.samplingMode === 'subregion') {
      // Manual crop: mirrors extractBlockTileFromImage's subregionX/Y/W/H usage.
      baseCfg.subregionX = params.subregionX;
      baseCfg.subregionY = params.subregionY;
      baseCfg.subregionWidth = params.subregionW;
      baseCfg.subregionHeight = params.subregionH;
      baseCfg.subregionInset = params.subregionInset;
    } else {
      // Full-image single mode: use full normalized extents.
      baseCfg.subregionX = 0;
      baseCfg.subregionY = 0;
      baseCfg.subregionWidth = 1;
      baseCfg.subregionHeight = 1;
      baseCfg.subregionInset = params.subregionInset;
    }

    // Preview scale: user controls *relative* to the extractor's internal 2× default.
    // extractBlockTileFromImage uses "scale" to multiply output size.
    const extracted = extractBlockTileFromImage(originalBitmap, 2.0 * params.previewScale, baseCfg, maskBitmap);

    // Resize output canvases to extracted size for accurate pixel previews.
    const w = Math.min(384, extracted.width);
    const h = Math.round((w / extracted.width) * extracted.height);
    cOriginal.width = w;
    cOriginal.height = h;
    cMetal.width = w;
    cMetal.height = h;
    cGlass.width = w;
    cGlass.height = h;
    cFinal.width = w;
    cFinal.height = h;

    const scaleBase = makeCanvas(extracted.width, extracted.height);
    // Draw extracted.canvas into a temp of exact extracted size (avoid extractor scale weirdness).
    scaleBase.getContext('2d')?.drawImage(extracted.canvas, 0, 0);

    const tileForRender = scaleBase;

    const maskCanvas = extracted.maskCanvas;
    if (!maskCanvas) return;

    const metalOverlayTmp = makeCanvas(w, h);
    const glassOverlayTmp = makeCanvas(w, h);
    renderMaskOverlay(tileForRender, maskCanvas, metalOverlayTmp, { r: 1, g: 0.25, b: 0.25 }, 'metal');
    renderMaskOverlay(tileForRender, maskCanvas, glassOverlayTmp, { r: 0.25, g: 0.45, b: 1 }, 'glass');

    cOriginal.getContext('2d')?.drawImage(tileForRender, 0, 0, w, h);
    cMetal.getContext('2d')?.drawImage(metalOverlayTmp, 0, 0);
    cGlass.getContext('2d')?.drawImage(glassOverlayTmp, 0, 0);

    // Final alpha preview
    renderFinalAlphaPreview(tileForRender, maskCanvas, cFinal, {
      glassMin: params.glassMin,
      glassMax: params.glassMax,
      glassFresnelPower: params.glassFresnelPower,
      pieceTint: params.pieceTint,
    });
  }

  const scheduleBake = debounce(() => {
    void bakeAndRender();
  }, 150);

  const sliderInputs = [
    elOuterForce,
    elFeather,
    elScale,
    elA0,
    elA1,
    elB0,
    elB1,
    elGlassMin,
    elGlassMax,
    elGlassPow,
    elInset,
    elSubX,
    elSubY,
    elSubW,
    elSubH,
  ];
  for (const inp of sliderInputs) {
    inp.addEventListener('input', scheduleBake);
  }
  elTint.addEventListener('change', scheduleBake);
  elSampling.addEventListener('change', scheduleBake);

  elTexture.addEventListener('change', async () => {
    const file = elTexture.files?.[0];
    if (!file) return;
    originalBitmap?.close?.();
    originalBitmap = await loadImageFromFile(file);
    // Clear companion mask if a new texture is loaded (optional).
    scheduleBake();
  });

  elMask.addEventListener('change', async () => {
    const file = elMask.files?.[0];
    if (!file) return;
    maskBitmap?.close?.();
    maskBitmap = await loadImageFromFile(file);
    scheduleBake();
  });

  const bakeBtn = root.querySelector('#masklab-bake') as HTMLButtonElement;
  bakeBtn.addEventListener('click', () => void bakeAndRender());

  const bakeCfgBtn = root.querySelector('#masklab-bakeCfg') as HTMLButtonElement;
  bakeCfgBtn.addEventListener('click', async () => {
    syncParamsFromUI();
    const textureName = elTexture.files?.[0]?.name ?? 'your-texture.png';
      const obj: Partial<BlockTextureConfig> = {
        url: textureName,
        samplingMode: params.samplingMode,
        // Extractor uses this for "warmth" heuristic strength when no companion mask is provided.
        materialDetectionMode: params.materialDetectionMode,
        maskOuterForce: params.maskOuterForce,
        maskFeatherPx: params.maskFeatherPx,
        warmthLumaBandA0: params.warmthLumaBandA0,
        warmthLumaBandA1: params.warmthLumaBandA1,
        warmthLumaBandB0: params.warmthLumaBandB0,
        warmthLumaBandB1: params.warmthLumaBandB1,

        // Authored glass curve (used in pbrBlocks.ts / viewWebGL2 paths)
        authoredGlassMin: params.glassMin,
        authoredGlassMax: params.glassMax,
        authoredGlassFresnelPower: params.glassFresnelPower,
      };

      // Include crop parameters when the user is in subregion mode.
      if (params.samplingMode === 'subregion') {
        obj.subregionX = params.subregionX;
        obj.subregionY = params.subregionY;
        obj.subregionWidth = params.subregionW;
        obj.subregionHeight = params.subregionH;
        obj.subregionInset = params.subregionInset;
      }

      // If user uploaded a companion mask, suggest wiring it into runtime too.
      if (maskBitmap) {
        obj.maskUrl = 'your-mask.png';
        obj.maskChannel = 'alpha';
        obj.maskThreshold = 0.5;
        obj.maskFeatherPx = params.maskFeatherPx;
      }

      const snippet = `// Copy/paste into code\n${JSON.stringify(obj, null, 2)};\n`;
      cfgOut.value = snippet;
    try {
      await navigator.clipboard.writeText(snippet);
    } catch {
      // ignore
    }
  });

  const export2xBtn = root.querySelector('#masklab-export2x') as HTMLButtonElement;
  export2xBtn.addEventListener('click', async () => {
    if (!originalBitmap) return;
    syncParamsFromUI();
    const baseCfg: BlockTextureConfig = {
      ...SINGLE_TILE_TEXTURE_CONFIG,
      samplingMode: params.samplingMode,
      materialDetectionMode: params.materialDetectionMode,
      maskOuterForce: params.maskOuterForce,
      maskFeatherPx: params.maskFeatherPx,
      warmthLumaBandA0: params.warmthLumaBandA0,
      warmthLumaBandA1: params.warmthLumaBandA1,
      warmthLumaBandB0: params.warmthLumaBandB0,
      warmthLumaBandB1: params.warmthLumaBandB1,
      authoredGlassMin: params.glassMin,
      authoredGlassMax: params.glassMax,
      authoredGlassFresnelPower: params.glassFresnelPower,
      url: elTexture.files?.[0]?.name ?? 'your-texture.png',
    };

    const extracted2x = extractBlockTileFromImage(originalBitmap, 2.0, baseCfg, maskBitmap);
    if (!extracted2x.maskCanvas) return;

    const baseName = (elTexture.files?.[0]?.name ?? 'block').replace(/\.(png|jpg|jpeg)$/i, '');
    await downloadCanvas(extracted2x.canvas, `${baseName}_tile_2x.png`);
    await downloadCanvas(extracted2x.maskCanvas, `${baseName}_metalMask_2x.png`);
  });

  const autoOuterBtn = root.querySelector('#masklab-autoOuter') as HTMLButtonElement;
  autoOuterBtn.addEventListener('click', async () => {
    if (!originalBitmap) return;
    // Lightweight search on the preview scale to avoid freezing the UI too hard.
    syncParamsFromUI();
    const candidates: number[] = [];
    for (let t = 0; t <= 10; t++) candidates.push(0.08 + t * 0.014);

    let best = params.maskOuterForce;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const c of candidates) {
      params.maskOuterForce = c;
      elOuterForce.value = String(c);
      try {
        const baseCfg: BlockTextureConfig = {
          ...SINGLE_TILE_TEXTURE_CONFIG,
          samplingMode: params.samplingMode,
          materialDetectionMode: params.materialDetectionMode,
          maskOuterForce: params.maskOuterForce,
          maskFeatherPx: params.maskFeatherPx,
          warmthLumaBandA0: params.warmthLumaBandA0,
          warmthLumaBandA1: params.warmthLumaBandA1,
          warmthLumaBandB0: params.warmthLumaBandB0,
          warmthLumaBandB1: params.warmthLumaBandB1,
          authoredGlassMin: params.glassMin,
          authoredGlassMax: params.glassMax,
          authoredGlassFresnelPower: params.glassFresnelPower,
          url: 'dev',
        };

        const extracted = extractBlockTileFromImage(originalBitmap, 2.0 * params.previewScale, baseCfg, maskBitmap);
        const mc = extracted.maskCanvas;
        if (!mc) continue;

        // Score: prefer "metal stays metal at the borders" by minimizing low-metal pixels
        // near the outer ring while not collapsing glass entirely.
        const w = extracted.width;
        const h = extracted.height;
        const maskCtx = mc.getContext('2d');
        if (!maskCtx) continue;
        const md = maskCtx.getImageData(0, 0, w, h).data;
        let borderGlass = 0;
        let glassTotal = 0;
        const uDen = Math.max(1, w - 1);
        const vDen = Math.max(1, h - 1);

        for (let y = 0; y < h; y++) {
          const vv = y / vDen;
          const distY = Math.min(vv, 1 - vv);
          for (let x = 0; x < w; x++) {
            const uu = x / uDen;
            const distX = Math.min(uu, 1 - uu);
            const distEdge = Math.min(distX, distY);
            const idx = (y * w + x) * 4;
            const metal = md[idx] / 255;
            const glass = 1 - metal;
            glassTotal += glass;
            if (distEdge < c * 0.9) {
              borderGlass += glass;
            }
          }
        }

        const borderGlassNorm = borderGlass / (w * h * 0.1);
        const glassNorm = glassTotal / (w * h);
        const score = borderGlassNorm + glassNorm * 0.25;
        if (score < bestScore) {
          bestScore = score;
          best = c;
        }
      } catch {
        // ignore and keep best
      }
    }

    params.maskOuterForce = best;
    elOuterForce.value = String(best);
    await bakeAndRender();
  });
}

