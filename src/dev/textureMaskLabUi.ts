/**
 * Texture Mask Lab (?masklab) — static markup and styles, split out of textureMaskLab.ts so
 * the behaviour module stays under the repo's file-size cap. Pure strings: no logic here.
 */

export const MASKLAB_CSS = `
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

export const MASKLAB_HTML = `
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
            <input id="masklab-inset" type="range" min="0" max="0.12" step="0.001" value="0.01"/>
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
            <label>glassMin</label><input id="masklab-glassMin" type="range" min="0" max="1.0" step="0.005" value="0.80"/>
          </div>
          <div class="masklab-row">
            <label>glassMax</label><input id="masklab-glassMax" type="range" min="0.2" max="1.0" step="0.005" value="0.88"/>
          </div>
          <div class="masklab-row">
            <label>glassFresnelPower</label><input id="masklab-glassPow" type="range" min="0.5" max="6" step="0.05" value="2"/>
          </div>
          <div class="masklab-row">
            <label>glassIor</label><input id="masklab-glassIor" type="range" min="1.01" max="2.0" step="0.01" value="1.22"/>
          </div>
          <div class="masklab-row">
            <label>glassThickness</label><input id="masklab-glassThick" type="range" min="0" max="0.15" step="0.002" value="0.035"/>
          </div>
        </div>
      </div>

      <div class="masklab-actions">
        <button class="masklab-btn" id="masklab-bake">Bake / Update</button>
        <button class="masklab-btn" id="masklab-autoOuter">Auto-propose outerForce</button>
        <button class="masklab-btn" id="masklab-export2x">Export 2x tile + mask</button>
        <button class="masklab-btn" id="masklab-exportMaps">Export material pack</button>
        <button class="masklab-btn" id="masklab-bakeCfg">Bake suggested config</button>
        <button class="masklab-btn" id="masklab-downloadJson">Download JSON</button>
        <label class="masklab-btn" for="masklab-loadJson" style="display:inline-block;cursor:pointer;">Load JSON</label>
        <input id="masklab-loadJson" type="file" accept="application/json,.json" style="display:none"/>
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
