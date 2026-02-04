# Consolidation Plan — visual & gameplay features

Last updated: 2026-02-04
Author: GitHub Copilot

Purpose
- Provide a concrete, low-risk plan to consolidate feature branches into `main` so `master` becomes the canonical, enhanced gameplay + renderer baseline.
- Make merges incremental, reviewable, and verifiable with clear rollback and testing steps.

Goals
1. Merge gameplay improvements (scoring, combos, T-Spin, All-Clear) with minimum regressions.
2. Consolidate rendering/visuals (textures, shaders, particles) while preserving WebGPU validation.
3. Keep large binary/assets in a separate PR to keep history clean and reviews fast.
4. Produce a reproducible verification artifact (screenshots + short playthrough notes).

High-level summary of branches (priority & short rationale)
- origin/visual-improvements-8476822499048169183 — small visual polish, low risk. (2–4h)
- origin/texture — texture/UV/mipmap work; foundational for visuals. (4–8h)
- origin/visual-and-gameplay-improvements-15949978759208709991 — gameplay + visuals, canonical if `master` unavailable. (6–12h)
- origin/webgpu-glass-fix-multipass-2774866934709663994 — multi-pass glass/refraction; optional toggle. (8–16h)
- origin/master2 — UI/testing (STYLE button, Playwright), cherry-pick after core merges. (1–3h)
- origin/master — aggregate of many improvements; treat as a source-of-truth for gameplay when resolving conflicts, but do not merge whole aggregate directly. (12–24h)
- restore-0126 — docs only; merge at end. (trivial)

Primary merge sequence (safe → risky)
1. `visual-improvements-8476822499048169183` (quick win; smoke & visual check)
2. `texture` (bring in high-quality textures and UV fixes)
3. `visual-and-gameplay-improvements-15949978759208709991` (gameplay + visuals)
4. `webgpu-glass-fix-multipass-2774866934709663994` (multi-pass renderer)
5. Cherry-pick UI/testing/docs from `master2` and `restore-0126`
6. Reconcile `origin/master` aggregate (final integration/cleanup)

Conflict-resolution policy (canonical decisions)
- Gameplay / scoring / sound conflicts: prefer implementation from `origin/master` (as requested). Document any deviations in the PR.
- Shader / renderer conflicts: preserve code that passes WebGPU validation and keeps performance parity. If both versions valid, prefer the more modular/clear implementation.
- Assets: do NOT merge large binary images in the same PR as code; split into an `assets/*` PR.

Branching & PR strategy
- Work on a consolidation branch: `consolidate/visual-gameplay` (incremental merges, squashed conflict-resolution commits).
- Produce one main PR from `consolidate/visual-gameplay` to `main` with the following structure:
  - Commit history: keep original commits where possible, but group conflict resolutions into clearly-labeled commits.
  - Supplemental PRs: `assets/add-high-res-textures`, `chore/playwright-snapshots` for large files & test scripts.

Exact commands (copy/paste)
- Create consolidation branch:

  git fetch origin --prune
  git checkout -b consolidate/visual-gameplay origin/main

- Merge sequence (example for step 1–4):

  git merge --no-ff origin/visual-improvements-8476822499048169183 -m "merge: visual improvements (polish)"
  git merge --no-ff origin/texture -m "feat: texture + UV/mipmap support"              # split asset files if prompted
  git merge --no-ff origin/visual-and-gameplay-improvements-15949978759208709991 -m "feat: visuals + gameplay improvements"
  git merge --no-ff origin/webgpu-glass-fix-multipass-2774866934709663994 -m "feat: glass multipass (optional)"

- If a large asset appears during a merge, immediately do:

  git restore --staged public/block.png public/block-2.png || true
  git commit -m "merge: keep code changes, defer large assets to assets PR"
  git checkout --theirs -- public/block.png || true    # only if you intend to accept theirs into asset PR

Verification steps (local)
1. Install & test
   - npm ci
   - npm test
2. Dev smoke + manual gameplay
   - npm run dev
   - Open in WebGPU-enabled browser: $BROWSER http://localhost:5173
   - Play 3 short sessions: verify scoring (T-Spin, B2B, combo), All-Clear, piece spawn
3. Visual verification
   - Run existing Playwright scripts (if present)
   - Capture 4 canonical screenshots: title, gameplay mid, Tetris clear, T-Spin clear
   - Compare against baseline (store under `verification/`)
4. Performance & validation
   - Inspect console for WebGPU validation warnings
   - Test on at least two Chromium-based browsers (Chrome/Edge Canary) with WebGPU enabled

Automated checks to include in PR
- npm ci && npm test (unit)
- Playwright screenshot job (optional) — add new expectations when visuals change
- A11y smoke (if present in CI)

Acceptance criteria (before merge)
- All unit tests pass
- No WebGPU validation errors in the dev console for at least two browsers
- Scoring regressions: verified (T-Spin, combo, B2B, All-Clear) + unit test for any changed logic
- Visual diffs: reviewed and approved (screenshots included in PR)
- Large assets are in a separate PR or explicitly approved

Rollback plan
- If merge causes regression: create a revert PR using `git revert -m 1 <merge-commit>` on `consolidate/visual-gameplay`, run CI, and push the revert to main.
- If failure discovered pre-merge: reset consolidation branch to origin/main and re-open a focused PR for the problematic feature.

PR description template (short)
- Title: consolidate: visuals + gameplay (textures, particles, scoring)
- Summary: what changed, branches merged, files/highlights
- Testing: list of manual checks and automated jobs run
- Screenshots: attach 4 canonical shots (Tetris, T-Spin, All-Clear, UI)
- Known issues: list regressions or outstanding TODOs
- Follow-ups: asset PR link, perf follow-up, cross-browser matrix

Risk matrix (short)
- High: `src/viewWebGPU.ts`, `src/webgpu/shaders.ts`, `src/webgpu/geometry.ts` (shader/validation + merge conflicts)
- Medium: `src/game/scoring.ts`, `src/sound.ts` (behavioral regressions)
- Low: CSS/UI, docs, verification scripts

Estimated effort (approx)
- Quick consolidation (merge small visual branch + smoke): 1–3 hours
- Core consolidation (textures + gameplay + testing): 8–16 hours
- Full integration including multi-pass glass + cross-browser validation: 16–32 hours

Deliverables
- `consolidate/visual-gameplay` branch with incremental, well-documented merges
- PR(s): main consolidation PR + `assets/*` and `tests/*` supplemental PRs
- Verification artifacts: Playwright screenshots, list of manual checks, browser matrix
- Post-merge TODOs: perf tuning, split large assets, add unit tests for scoring edge-cases

Who should review
- Primary reviewer: maintainer(s) familiar with renderer (`src/viewWebGPU.ts`) and gameplay (`src/game/*`)
- Secondary reviewer: contributor who authored the feature branch (where available)

Next actions (choose one)
- Option A — Quick start (recommended): create `consolidate/visual-gameplay`, merge `visual-improvements-8476822499048169183`, run tests, and open a draft PR. (≈1h)
- Option B — Full incremental run: merge the top 3 branches, resolve conflicts, produce PR draft + screenshots. (≈4–12h)
- Option C — Produce line-level conflict map for `src/viewWebGPU.ts` and `src/webgpu/shaders.ts` before merging. (≈1–2h)

If you confirm a choice I will proceed and attach the merge branch + PR draft and verification artifacts.
