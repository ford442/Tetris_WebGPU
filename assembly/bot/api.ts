// assembly/bot/api.ts
//
// The flat, allocation-free export surface of the CPU opponent (re-exported by assembly/index.ts).
// Typical host sequence (src/bot/BotCore.ts):
//   write cells + params  ->  botSetup()  ->  botSearchBegin()  ->  botSearchStep(n) … until 1  ->  botSearchFinish()
// and, once a placement is chosen, botPlan() for the input path to execute.

import { BOT_END, IN_CELLS, IN_PARAMS, WEIGHTS, ROOT_ROWS, PATH, RESULT, GEN, ROOT, SHAPES, ROOT_SIZE, PL_SIZE, P_START_X, P_START_Y, P_START_ROT, P_START_SPIN, P_COMBO, P_INCOMING } from './layout';
import { WEIGHT_CAPACITY, WEIGHT_COUNT, loadDefaultWeights } from './generated';
import { initShapes, useBoard, fits, kickOffset, tSpinClass, tryRotate, rotX, rotY } from './shapes';
import { generateFrom, planPath, bfsRuns } from './moves';
import { evalBoard, placePiece, attackRows, scorePoints } from './eval';
import { searchBegin, searchStep, searchIsDone, searchDepthReached, searchRootCount, searchFinish, rootValue } from './search';

let inited: bool = false;

function ensureInit(): void {
  if (inited) return;
  inited = true;
  initShapes();
  botResetWeights();
}

export function botInit(): void {
  ensureInit();
}

/** Restore the compiled-in weights (shared/botWeights.json) over whatever the host loaded. */
export function botResetWeights(): void {
  for (let i: i32 = 0; i < WEIGHT_CAPACITY; i++) store<f32>(WEIGHTS + (i << 2), 0);
  loadDefaultWeights(WEIGHTS);
}

// ---- layout ------------------------------------------------------------------------------------
export function botCellsPtr(): i32 { return IN_CELLS; }
export function botParamsPtr(): i32 { return IN_PARAMS; }
export function botWeightsPtr(): i32 { return WEIGHTS; }
export function botRootRowsPtr(): i32 { return ROOT_ROWS; }
export function botPathPtr(): i32 { return PATH; }
export function botResultPtr(): i32 { return RESULT; }
export function botGenPtr(): i32 { return GEN; }
export function botRootPtr(): i32 { return ROOT; }
export function botShapesPtr(): i32 { return SHAPES; }
export function botMemoryEnd(): i32 { return BOT_END; }
export function botWeightCount(): i32 { return WEIGHT_COUNT; }
export function botRootStride(): i32 { return ROOT_SIZE; }
export function botPlacementStride(): i32 { return PL_SIZE; }

/** Pack the 200 host-written playfield cells into the bitboard the search uses. */
export function botSetup(): void {
  ensureInit();
  for (let y: i32 = 0; y < 20; y++) {
    let bits: i32 = 0;
    for (let x: i32 = 0; x < 10; x++) {
      if (load<i8>(IN_CELLS + y * 10 + x) != 0) bits |= 1 << x;
    }
    store<u16>(ROOT_ROWS + (y << 1), <u16>bits);
  }
  useBoard(ROOT_ROWS);
}

// ---- move generation / path planning ------------------------------------------------------------
/** Placements of piece `t` from the start state in the params (defaults: spawn). Results at botGenPtr(). */
export function botGenerate(t: i32): i32 {
  ensureInit();
  useBoard(ROOT_ROWS);
  return generateFrom(
    t,
    load<i32>(IN_PARAMS + (P_START_X << 2)),
    load<i32>(IN_PARAMS + (P_START_Y << 2)),
    load<i32>(IN_PARAMS + (P_START_ROT << 2)),
    load<i32>(IN_PARAMS + (P_START_SPIN << 2)),
  );
}

/** Shortest input path (final hard drop free) from the params' start state to a lock state. Path at botPathPtr(); returns length or -1. */
export function botPlan(t: i32, tx: i32, ty: i32, trot: i32, tspin: i32): i32 {
  ensureInit();
  useBoard(ROOT_ROWS);
  return planPath(
    t,
    load<i32>(IN_PARAMS + (P_START_X << 2)),
    load<i32>(IN_PARAMS + (P_START_Y << 2)),
    load<i32>(IN_PARAMS + (P_START_ROT << 2)),
    load<i32>(IN_PARAMS + (P_START_SPIN << 2)),
    tx, ty, trot, tspin,
  );
}

// ---- search --------------------------------------------------------------------------------------
export function botSearchBegin(): void {
  ensureInit();
  useBoard(ROOT_ROWS);
  searchBegin();
}
export function botSearchStep(maxBfs: i32): i32 { return searchStep(maxBfs); }
export function botSearchDone(): i32 { return searchIsDone(); }
export function botSearchDepth(): i32 { return searchDepthReached(); }
export function botSearchRoots(): i32 { return searchRootCount(); }
export function botSearchFinish(): i32 { return searchFinish(); }
export function botRootValue(i: i32): f32 { return rootValue(i); }
export function botBfsRuns(): i32 { return bfsRuns; }

// ---- test hooks (cheap, pure; used by tests/bot-parity.test.ts) -----------------------------------
/** 1 when the piece collides on the board loaded by botSetup() (mirror of checkPieceCollisionBoard). */
export function botCollides(t: i32, rot: i32, x: i32, y: i32): i32 {
  ensureInit();
  useBoard(ROOT_ROWS);
  return fits(t, rot, x, y) ? 0 : 1;
}
export function botKick(t: i32, from: i32, to: i32, k: i32, axis: i32): i32 { return kickOffset(t, from, to, k, axis); }
/** Rotation as the game performs it. Returns -2 blocked / -1 plain / kick index; botRotX/Y hold the result. */
export function botRotate(t: i32, rot: i32, cw: i32, x: i32, y: i32): i32 {
  ensureInit();
  useBoard(ROOT_ROWS);
  return tryRotate(t, rot, cw != 0 ? (rot + 1) & 3 : (rot + 3) & 3, x, y);
}
export function botRotX(): i32 { return rotX; }
export function botRotY(): i32 { return rotY; }
export function botTSpinClass(x: i32, y: i32, rot: i32, kick4: i32): i32 {
  useBoard(ROOT_ROWS);
  return tSpinClass(x, y, rot, kick4 != 0);
}
export function botAttackRows(lines: i32, spin: i32): i32 { return attackRows(lines, spin); }
export function botScorePoints(lines: i32, spin: i32, comboBefore: i32, b2b: i32, allClear: i32): i32 {
  return scorePoints(lines, spin, comboBefore, b2b != 0, allClear != 0);
}
/** Evaluate the board loaded by botSetup(), with the params' incoming-garbage count. */
export function botEval(): f32 {
  ensureInit();
  return evalBoard(ROOT_ROWS, load<i32>(IN_PARAMS + (P_INCOMING << 2)));
}
/** Lock a piece on a copy of the loaded board; returns lines cleared (rows left at botRootRowsPtr()+48). */
export function botApply(t: i32, rot: i32, x: i32, y: i32): i32 {
  ensureInit();
  return placePiece(ROOT_ROWS, ROOT_ROWS + 48, t, rot, x, y);
}
export function botComboParam(): i32 { return load<i32>(IN_PARAMS + (P_COMBO << 2)); }
