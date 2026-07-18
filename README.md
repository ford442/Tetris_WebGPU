# Tetris_WebGPU

live demo : https://konstantin84ukr.github.io/Tetris_WebGPU/


Test on Google Chrome Canary  v96.0.4648.2
chrome://flags/  
Unsafe WebGPU  = Enabled

## Experimental Features

**Positive Reinforcement Subliminal System** (visual cues)

An optional, research-oriented feature that flashes short positive words (e.g. "Flow", "Precision", "Momentum", "Zenith") for 25–45 ms during meaningful gameplay moments (line clears, T-spins, level-ups, new high scores) plus gentle background reinforcement every ~45–90 seconds of active play.

- Toggle: Pause menu → "EXPERIMENTAL" section → "Positive Reinforcement"
- Default: Enabled (clearly labeled experimental; disable instantly)
- Styling: Gold glowing text matching the project's neon/glass aesthetic
- Performance: Negligible (event-driven, long cooldown)
- Future: Audio chimes, customization, self-experiment A/B logging (see GitHub issues)

This is **entirely optional** and designed for transparency. It has zero effect on scoring or core mechanics.

See the pause menu during play to enable/disable.

## Development

**Requires Node.js 20+** (CI tests Node 20 and 22).

```bash
npm ci                   # install dependencies
npm run dev              # start the Vite dev server
npm test                 # run the Vitest suite (auto-builds release WASM)
npm run typecheck        # tsc --noEmit (src/ only)
npm run lint             # ESLint (typescript-eslint, minimal ruleset)
npm run lint:fix         # auto-fix import style where possible
npm run build            # production bundle (dist/)
npm run build:all        # AssemblyScript WASM + C++ renderer + Vite build
```

**Lint rules:** `@typescript-eslint/no-floating-promises`, `consistent-type-imports`, and `no-unused-vars` (aligned with `tsc` underscore-ignore convention). Config: [`eslint.config.js`](eslint.config.js).

**C++ renderer:** match [`.emsdk-version`](.emsdk-version) locally; `scripts/build-cpp.mjs` warns on emsdk drift. See [`cpp/README.md`](cpp/README.md).

### Level background videos

Reactive video portals load `./assets/video/bg1.mp4` … `bg15.mp4` by level. **MP4 files are gitignored**; fresh clones use the **procedural GPU background** automatically.

```bash
npm run video:validate      # refresh public/assets/video/manifest.json
npm run video:placeholders  # generate solid-color loops via ffmpeg (optional)
```

Authoring spec, CDN config, and how to add a new clip: [`assets/video/README.md`](assets/video/README.md).

Optional CDN (Vite): set `VITE_VIDEO_CDN_BASE=https://your-cdn.example/tetris-webgpu` in `.env.local`.

### Progressive Web App (mobile / offline)

Installable on Chromium with a versioned service worker (shell, WASM, textures). Offline marathon uses procedural backgrounds when video assets are unavailable.

```bash
npm run build:all    # includes pwa icons (prebuild) + sw.js (postbuild)
npm run preview      # test offline in DevTools Network → Offline
```

Touch controls, safe-area layout, swipe gestures, and fullscreen: see [`docs/MOBILE_PWA.md`](docs/MOBILE_PWA.md).

### Game modes

Select a mode from the left panel before **START**. Mode rules also appear in the pause menu.

| Mode | Goal | Win | Lose | Leaderboard |
|------|------|-----|------|-------------|
| **Marathon** | Survive and climb levels | — | Top-out | High score |
| **Sprint 40L** | Clear 40 lines fast | 40 lines cleared | Top-out | Best time |
| **Ultra 2:00** | Max score in 2 minutes | Timer ends | Top-out | Best score |
| **Cheese Race** | Clear all cheese blocks | No garbage cells remain | Top-out | Best time |
| **Zen Practice** | Relaxed practice | — (no end) | Never | None |
| **Local 2P** | Beat opponent | Opponent tops out | Top-out | — |

**Cheese Race** starts with 7 rows of garbage (one hole per row). Clear every gray cheese block to win; your own piece colors can stay on the board. Customize row count with `?cheeseRows=5` through `?cheeseRows=10`.

**Zen Practice** uses fixed slow gravity (level 1), infinite hold, and no game over — if spawn is blocked, the top four rows are cleared automatically. The HUD tracks lines and time only (no score pressure). Pairs well with reduced-motion settings in the pause menu.

### Local 2P versus

Split-screen on one keyboard with garbage attacks. Select **Local 2P** → **START**. See [`docs/VERSUS.md`](docs/VERSUS.md).

### Continuous Integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`.
It installs dependencies with `npm ci`, builds the release WASM, runs `npm run typecheck`,
`npm run lint`, `npm test`, and produces the production build across a Node LTS matrix
(20 and 22). PRs must be green before merge.

### Screenshots / diagnostics

Capture scripts live under `scripts/` and write PNGs into `screenshots/` (which
is git-ignored):

```bash
node scripts/capture-screenshot.mjs   # local render capture
node scripts/live-diagnose.mjs        # capture + diagnostics against a live URL
```

## Deployment

`deploy.py` zips `dist/` and uploads it to the Contabo storage manager. It reads
**all secrets from the environment** — nothing is hardcoded:

```bash
npm run build
export DEPLOY_TOKEN="<token-from-vps-env>"   # required by the deploy endpoint
python deploy.py
```

Never commit credentials. Set `DEPLOY_TOKEN` (and any future SFTP credentials such
as `SFTP_PASSWORD`) via your shell environment or a secret store / CI secret.
