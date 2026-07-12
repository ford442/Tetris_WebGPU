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

```bash
npm ci                   # install dependencies
npm run dev              # start the Vite dev server
npm test                 # run the Vitest suite (auto-builds release WASM)
npm run build            # production bundle (dist/)
npm run build:all        # AssemblyScript WASM + C++ renderer + Vite build
```

### Continuous Integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`.
It installs dependencies with `npm ci`, builds the release WASM, runs `npm test`,
and produces the production build across a Node LTS matrix (20 and 22). PRs must
be green before merge.

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
