# CPU opponent

A computer player that plays by the same rules and with the same inputs as a person: it looks at the board,
the held piece and the next queue, picks the best place to lock the current piece, and then **presses keys**
(`REPLAY_ACTION` masks) to get it there. It powers:

| Feature | How |
|---|---|
| **vs CPU** (`?mode=versus-cpu[&cpu=easy\|normal\|hard\|expert]`, menu entry) | the CPU owns player 2's board in `VersusController` |
| **Hint overlay** (**H** in a single-player mode) | the best placement, then the top 3, drawn with the existing ghost renderer; off on the third press |
| Headless self-play / regression / tuning | `src/bot/selfPlay.ts`, `src/bot/versusMatch.ts`, `npm run bot:selfplay` |

No network, no GPU and no clock are needed for any of the logic — it is testable in plain Node.

## How it decides

```
Game ──snapshot──▶ BotPosition ──▶ [Worker | sliced main thread | sync]  ──▶ ranked placements
                                       assembly/bot (release.wasm)
                                       generate → evaluate → beam search
BotPlayer ◀── best placement ── closed-loop re-plan every tick ──▶ one action mask per 60 Hz tick
```

### 1. Move generator — `assembly/bot/moves.ts`
Breadth-first search over `(x, y, rotation, spin)` using the five inputs a player has (left, right, one soft-drop
step, rotate cw, rotate ccw). Every *resting* state whose four cells are on the board is a lock candidate; because
the search is breadth-first, each candidate carries a **shortest input path** (this is what the finesse trainer
will read). Cell sets reached twice (S/Z/I rotate onto themselves) are de-duplicated, keeping the better spin.

The rules are a **bit-exact port of the TypeScript game**, quirks included:

* SRS kick tables come from `src/game/rotation.ts`; the loop reproduces `rotateFlow.ts`'s documented "`kickIndex`
  advances twice" behaviour (only kick tests 0, 2, 4 are tried) — otherwise the bot would plan rotations the game
  rejects.
* The T-spin class (none / mini / full, with "kick test 5 promotes a mini") is `evaluateTSpin()` ported to bit
  operations. The game keeps the spin only if the **last input was the rotation** and nothing moved the piece
  afterwards, so the spin class is part of the search state: a T can lock the same cells as a spin *and* as a plain
  drop, and the generator reports the better one.
* Planned paths exclude the final hard drop (a player hard-drops; it is not 20 soft-drop presses). A spin
  placement must be matched exactly (no drop may follow the rotation).

`tests/bot-parity.test.ts` re-derives all of this from the real engine: collision vs the shared-memory kernel,
rotation + spin class vs `Game.rotatePiece`, the full placement set vs a brute-force search that drives the real
`Game`, and every planned path replayed on the engine. Change a rule in TS without the port and it fails.

### 2. Evaluator — `assembly/bot/eval.ts`
Boards are 20 `u16` row bitmasks (40 bytes), so the beam can hold hundreds of candidate positions in one page. Features
(each is a weight in `shared/botWeights.json`; `tests/bot-eval-search.test.ts` checks every one against an
independent loop-based reference):

| Feature | Meaning |
|---|---|
| `heightAgg`, `maxHeight`, `bumpiness` | stack shape |
| `holes`, `holeRows`, `covered` | holes, rows containing one, blocks piled above them |
| `wellSum` | Σ d(d+1)/2 over wells (depth below the lower neighbour; walls count as tall) |
| `rowTrans`, `colTrans` | row / column filled↔empty transitions |
| `tSlot` | TSD-shaped slots (overhang + open notch + supported floor), capped at 2 |
| `tetrisReady` | rows full except one edge column (≤ 4) |
| `danger` | `max(0, maxHeight + incomingGarbage − 14)` |

Rewards for the lock itself: `line1..line4`, `attack` × garbage rows (from the **shared** attack table), `spinMini` /
`spinNormal`, `combo` × combo level, `b2b`, `allClear`, `score` × real score points (`scoring.ts` rules at level 1,
checked against `ScoringSystem.updateScore`), plus leaf bonuses `b2bKeep` / `comboKeep` for holding a chain.

### 3. Search — `assembly/bot/search.ts`
Level-synchronous **beam search** over *hold + the visible next queue*: each node plays the current piece or swaps
with hold (including "hold with an empty hold slot consumes the next piece"), every placement is locked, scored, and
the best `beam` children survive (transpositions keep the better line). Properties that are tested:

* **Resumable** — `searchStep(maxBfs)` does at most `maxBfs` generator runs; the result after *any* step is valid
  (after level 1 it is the greedy answer). A sliced run equals a one-shot run bit for bit.
* **Node budget** — one node = one generator run; an expansion is ≤ 2 runs, so a slice never overshoots by more than 2.
* **Deterministic** — no randomness; identical results across runs and wasm instances.
* Ranked output: root candidates whose line of play survives to the deepest level first, then the rest by one-move score.

### Memory
Everything lives in one 64 KiB page, above the board region (`assembly/bot/layout.ts`; `botMemoryEnd()` = 51 840):
input cells/params, weights, shape + kick tables, bitboards, BFS tables (4 368 states × spin/rot/row/col), placement and
root lists, and 8 beam levels × 32 nodes × 64 B. **There is no heap and no static data.** AssemblyScript places array
literals at offset 12 — on top of the shared boards — so every table is built into the layout by `botInit()`;
`tests/bot-wasm-core.test.ts` instantiates the module into a pattern-filled memory and fails if a single byte changes.

## The pilot — `src/bot/BotPlayer.ts`
Once per 60 Hz tick: new piece → wait the **reaction delay** (and the **PPS cap**) → ask the searcher → pick the
placement (with probability `mistakeRate`, the runner-up) → every tick **re-plan the shortest path from the piece's
actual pose** and press its first key (with probability `finesseErrorRate`, a fumbled key instead). Re-planning every
tick makes it closed-loop: gravity, a fumble or a lock-delay nudge just changes the next plan. One action per tick;
hold gets its own tick; hard drop only when the plan is empty. Because the output is the replay mask language, a bot
game records, encodes (`createReplayFile`) and replays like a human one (`tests/bot-selfplay.test.ts`).

| | depth | beam | node budget | reaction | key gap | fumble | runner-up | max PPS |
|---|---|---|---|---|---|---|---|---|
| Easy | 1 | 1 | 16 | 30 t | 9 t | 10 % | 25 % | 0.8 |
| Normal | 2 | 6 | 64 | 18 t | 5 t | 4 % | 10 % | 1.5 |
| Hard | 4 | 12 | 192 | 10 t | 3 t | 1.5 % | 3 % | 2.5 |
| Expert | 6 | 16 | 480 | 4 t | 2 t | 0 | 0 | 4 |

(`t` = 60 Hz ticks.) The evaluator weights are the same for every level: strength comes from depth and from *not*
making deliberate errors.

## Where the search runs — `src/bot/searchers.ts`
`BotSearcher` is a non-blocking `request()` / `poll()` interface with three implementations:

* **`WorkerSearcher`** — a module Worker (`botWorker.ts`) with its own wasm instance; the main thread hands it an
  absolute wasm URL (a Worker cannot resolve the page's relative URLs). This is the normal path.
* **`SlicedSearcher`** — single-thread fallback: the resumable search in 10-node slices from `requestIdleCallback`
  (`setTimeout` where there is none).
* **`SyncSearcher`** — immediate; tests and deterministic self-play.

`AutoSearcher` starts on the Worker and, if it fails at runtime (CSP, 404, no Worker), re-issues the request in
flight on the sliced searcher. The pilot's per-tick path planning always uses a separate main-thread `BotCore`
(one tiny BFS ≈ 60 µs — far cheaper than a message round trip).

## Hint overlay — `src/bot/hint.ts`
**H** cycles off → best placement → top 3 → off. Cells go into `Game.hintCells`; `buildPlayfieldProjection` draws
them like the ghost (negative colour index) — no new shader. It recomputes only when the position changes. Using a
hint sets `Game.assistUsed`, which keeps the run off the leaderboards (`leaderboardSave.ts`). Hints are generator
placements by construction; `tests/bot-hint.test.ts` asserts every hinted placement is in the generator's output.

## Shared data
| File | Read by |
|---|---|
| `shared/versusAttack.json` | `src/versus/garbage.ts` (`attackRowsFromClear`) **and** the wasm (via `generated.ts`) |
| `shared/botWeights.json` | `src/bot/botData.ts` (shipped into every `BotCore`) **and** the wasm defaults |
| `shared/botDataSchema.json` | `scripts/lib/botData.mjs` (generator, build gate) **and** `src/bot/botData.ts` (runtime) |

`npm run bot:generate` rewrites `assembly/bot/generated.ts` (weight indices, default weights, attack functions);
`asbuild:*` runs it first; CI runs `bot:generate -- --check` before building so a forgotten commit fails.
The numbers in `garbage.ts` were *moved*, not changed: `bot-parity.test.ts` checks the shared table against the
original if-chain for every (lines, spin).

## Tuning
```bash
npm run bot:selfplay                                   # all difficulties, 8 seeds × 150 pieces
npm run bot:selfplay -- --difficulty expert --seeds 20 --pieces 300
npm run bot:selfplay -- --weights /tmp/candidate.json  # try a weight set without touching shared/
npm run bot:bench                                      # decision latency per difficulty
```
Edit `shared/botWeights.json`, run `npm run asbuild:release`, then `npm test` — the 200-piece regression
(`tests/bot-selfplay.test.ts`) fails if survival or efficiency regresses. Measured reference (this repo, 8 seeds ×
150 pieces): mean score easy ≈ 26 k, normal ≈ 31 k, hard ≈ 41 k, expert ≈ 60 k, ~58–59 lines everywhere, 0 top-outs.

## Numbers
* **Wasm size** (`public/release.wasm`): 1 453 B → 12 320 B (+10.9 KB; gzip 830 B → 6 031 B). Guarded by
  `tests/bot-performance.test.ts` (< 32 KiB). The Worker chunk is 7 KB (3 KB gzip), precached by the service worker.
* **Decision latency** (typical dev machine, mid-game boards, 5-piece preview): depth 1 ≈ 0.11 ms, **depth 2 ≈ 0.45 ms
  median** (budget: < 2 ms, asserted), depth 3 ≈ 1 ms, Hard ≈ 2.5 ms, Expert ≈ 4.4 ms. A 10-node slice ≈ 0.5 ms.
* **Strength**: seeded 200-piece games clear 78–79 of a possible 80 lines at every difficulty; Expert beats Easy in
  every seeded match (`bot-selfplay.test.ts`).

## Deviations from the original design, and why
* **Bitboards instead of the byte collision kernels.** The search needs thousands of scratch positions, which cannot
  live in board slots 0/1, and a 40-byte bitboard is also ~10× faster to evaluate. The byte kernels
  (`checkPieceCollisionBoard`) stay the engine's truth: `bot-parity.test.ts` compares the bitboard collision against them
  on random boards.
* **SRS tables are ported, not "exposed".** `assembly/index.ts` never contained SRS data (only collision, line clear,
  hard drop), so the tables are ported and pinned by tests.
* **Greedy + beam were built together** (depth 1 / beam 1 *is* the greedy baseline, pinned by the Easy rows of the
  regression) rather than in two steps.
* **Attack value** uses the shared garbage table. The game's garbage has no combo/B2B/all-clear bonus, so those appear
  as evaluator *rewards* (they raise score and keep chains alive), not as extra garbage.

## Known limits / follow-ups
* The queue beyond the visible pieces is not modelled (no chance nodes over the 7-bag).
* Finesse-trainer and "why did I lose" UIs are not built; the data they need exists (`BotCore.plan()` returns the
  shortest input path for any placement; `search()` returns ranked alternatives with values).
* No "assist" auto-on in Zen yet — the H overlay is available in every single-player mode.
* **Sim stepping (#561):** `Game.hardDrop()` completes one microtask late, so a synchronous `GameSimulator` /
  `VersusLockstepSim` loop never finishes a hard drop inside its tick (the lockstep sim therefore never sends garbage
  under sync stepping). The bot drivers flush a microtask and keep their own attack accounting; see
  [ARCHITECTURE.md → Known hazards](ARCHITECTURE.md). The lockstep sim itself is untouched.
* A tiny neural evaluator on WASM SIMD remains an optional follow-up if heuristic play plateaus.
