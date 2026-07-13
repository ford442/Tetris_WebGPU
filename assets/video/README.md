# Level background videos

Reactive video backgrounds (`src/webgpu/reactiveVideo.ts`) map **game level → `bgN.mp4`** inside the board portal. When clips are missing, the **procedural GPU background** (`BackgroundShaders`) is always drawn underneath — the game still looks intentional on fresh clones and CI.

## Required clip set

| File | Game level | Theme tier (library) |
|------|------------|----------------------|
| `bg1.mp4` | 0 | Cyber Liquid Metal |
| `bg2.mp4` | 1 | Abstract Data Stream |
| `bg3.mp4` | 2 | Neon Grid |
| `bg4.mp4` | 3 | Volumetric Fog |
| `bg5.mp4` | 4 | Plasma Storm |
| `bg6.mp4` | 5 | Crystal Void |
| `bg7.mp4` | 6 | Glitch Field |
| `bg8.mp4` | 7 | Solar Flare |
| `bg9.mp4` | 8 | Nebula Drift |
| `bg10.mp4` | 9 | Quantum Foam |
| `bg11.mp4` | 10 | Void Fracture |
| `bg12.mp4` | 11 | Aurora Surge |
| `bg13.mp4` | 12 | Holographic Particles |
| `bg14.mp4` | 13 | Cosmic Rift |
| `bg15.mp4` | 14+ | Bioluminescent Cave |

Levels ≥14 keep using `bg15.mp4`.

## Authoring spec

| Property | Value |
|----------|--------|
| Resolution | **720×1280** (portrait portal; scale down if needed) |
| Container | **MP4** |
| Video codec | **H.264** (`libx264`) |
| Pixel format | **yuv420p** |
| Audio | **None** (muted loop) |
| Duration | **8–30 s** seamless loop |
| Max bitrate | **~2.5 Mbps** at 720p (authoring guideline) |
| Loop | Must loop cleanly (`video.loop = true` in game) |

Example ffmpeg export:

```bash
ffmpeg -i source.mov -an -c:v libx264 -pix_fmt yuv420p -b:v 2500k -movflags +faststart bg5.mp4
```

## Where files live

| Path | Purpose |
|------|---------|
| `public/assets/video/bgN.mp4` | **Served at runtime** (`./assets/video/bgN.mp4`) |
| `assets/video/` | Docs + `create-placeholder-videos.sh` (authoring helpers) |
| `public/assets/video/manifest.json` | Build-time inventory (see below) |

`*.mp4` is **gitignored** globally — large clips are optional per clone. Commit **`manifest.json`** only.

## Build / validate

```bash
# Write manifest from files present in public/assets/video/
npm run video:validate

# Generate solid-color placeholder loops (requires ffmpeg) for all missing bg1–bg15
npm run video:placeholders
```

`npm run build` runs validation automatically (`prebuild`).

## CDN / large asset hosting

Set a base URL so MP4s load from a CDN instead of the app origin:

```bash
# .env.local (Vite)
VITE_VIDEO_CDN_BASE=https://cdn.example.com/tetris-webgpu
```

Or at runtime in the browser console:

```js
localStorage.setItem('tetris_video_cdn', 'https://cdn.example.com/tetris-webgpu');
location.reload();
```

Paths are still `./assets/video/bgN.mp4` relative to that base.

## Fallback behavior

1. **Procedural shader** is always rendered as an underlay (no black flash).
2. If `bgN.mp4` is missing but `bg1.mp4` exists, level *N* reuses `bg1.mp4`.
3. If **no** MP4s respond, video is disabled and procedural + theme colors only.
4. **Aurora** procedural mode activates for the `future` theme (`auroraBackground.ts`).
5. Next-level clip is **preloaded** during play to reduce level-up hitches.

## Adding a new level video

1. Author `bgN.mp4` to the spec above (pick the level row in the table).
2. Copy to `public/assets/video/bgN.mp4`.
3. Run `npm run video:validate` to refresh `manifest.json`.
4. Add license row in [`LICENSE.md`](LICENSE.md) if the footage is third-party.
5. Play to level *N−1* and confirm the portal crossfades within ~100 ms (preload + procedural underlay).

Optional: add a descriptive entry in `VIDEO_BACKGROUNDS` inside `reactiveVideo.ts` for effect presets (brightness/contrast/saturation).

## Licenses

See [`LICENSE.md`](LICENSE.md) for third-party footage attribution.
