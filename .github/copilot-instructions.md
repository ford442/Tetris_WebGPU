# Copilot instructions for `tetris_webgpu`

Architecture, conventions, pitfalls, TypeScript configuration, build base path and CI are documented once,
in [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) — read it first and keep it as the single place to
update. This file only holds Copilot-specific notes.

## Commands

- `npm run dev` — Vite dev server.
- `npm run asbuild:release` — compile the collision WASM (`build/release.wasm`, copied to the committed `public/release.wasm`). Required after any change in `assembly/`; `npm test`'s `pretest` runs it.
- `npm run typecheck` — `tsc -b` over `src`, `tests`, scripts and workers, plus the `noUncheckedIndexedAccess` ratchet.
- `npm run lint` — ESLint (typescript-eslint for TS, Node rules for `scripts/`).
- `npm test` — full Vitest suite; `npm test -- tests/game.test.ts` runs one file (co-located tests such as `src/webgpu/materials.test.ts` work the same way).
- `npm run build` / `npm run build:all` — frontend build / WASM + cpp + frontend. `VITE_BASE=./` for relative asset URLs (`npm run build:desktop`).

## Copilot-specific notes

- Local imports use `.js` suffixes (`import Game from './game.js'`).
- Don't add `as any` / `@ts-ignore` (`tests/ts-escape-hatches.test.ts` ratchets the count down).
- Keep files under 1000 lines; split using the existing host-interface modules in `src/game/` and `src/controller/`.
- Don't commit tool or local state (`.idea/`, `.playwright-mcp/`, `*.pid`, `diff.txt`, `build/`).
