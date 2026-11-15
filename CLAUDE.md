# CLAUDE.md

**Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** — the single source of truth for the stack,
project structure, rendering/boot policy, authored-material contract, conventions, pitfalls, TypeScript
configuration, build base path (`VITE_BASE`) and CI. Do not duplicate architecture facts here; update
that file instead.

## Claude-specific notes

- **Before you call a change done:** `npm run typecheck && npm run lint && npm test` (and `npm run build`
  for anything touching `vite.config.ts`, `index.html`, assets or shaders). CI runs the same set.
- **Keep every file under 1000 lines** (aim for ~700). Split by responsibility, following the existing
  host-interface pattern in `src/game/` and `src/controller/` (a function that takes a narrow `…Host`
  interface, with the class delegating to it).
- **Type escape hatches are ratcheted** (`tests/ts-escape-hatches.test.ts`) — don't add `as any` /
  `@ts-ignore`; lower the baseline when you remove one.
- **Generated/committed binaries:** `public/release.wasm` and `public/cpp/*` are committed on purpose;
  `build/` is scratch and untracked. Don't hand-edit `public/cpp/build-info.json` — rebuild with the
  pinned emsdk (`npm run cpp:release`) and commit `public/cpp`.
- **Block look is data** (`public/block-material.json` + PNG), never a shader edit — see
  `docs/block-material-contract.md`.
- Hot paths are allocation-free; don't introduce per-frame objects in `Game`, `Controller` or the view loop.
