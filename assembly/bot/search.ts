// assembly/bot/search.ts
//
// Level-synchronous BEAM search over hold + the visible next queue.
//
//   level 0            the current position (one node)
//   level k            the best `beam` positions after placing k pieces
//   expansion of node  for each piece option (play the current piece / swap with hold): run the move
//                      generator, lock every placement, score it, keep the best `beam` children
//
// It is RESUMABLE: searchStep(maxBfs) does at most `maxBfs` move-generator runs of work and returns whether
// the search finished, so a caller can slice one decision over several idle callbacks (the single-thread
// fallback) or run it to completion in a Worker. Results are available after ANY step — after level 1 it is
// the greedy answer, each further level refines it — so a deadline never leaves the bot without a move.
// Everything is deterministic (no randomness; ties go to the first-generated placement).

import { IN_PARAMS, ROOT_ROWS, SCRATCH_ROWS, LV_COUNT, LV_WORST, TMP_NODE, ROOT, ROOT_CAP, ROOT_SIZE, RESULT, RANK_MAX, GEN, PL_SIZE, LEVELS, BEAM_MAX, NODE_SIZE, MAX_DEPTH, P_ACTIVE, P_HOLD, P_CAN_HOLD, P_COMBO, P_B2B, P_INCOMING, P_NEXT_COUNT, P_NEXT0, P_DEPTH, P_BEAM, MAX_NEXT } from './layout';
import { useBoard } from './shapes';
import { generateSpawn, bfsRuns, PL_X, PL_Y, PL_ROT, PL_SPIN, PL_TYPE, PL_HOLD, PL_LINES } from './moves';
import { evalBoard, placePiece, isBoardEmpty, attackRows, scorePoints, weight } from './eval';
import { W_LINE1, W_ATTACK, W_SPIN_MINI, W_SPIN_NORMAL, W_COMBO, W_B2B, W_ALL_CLEAR, W_SCORE, W_B2B_KEEP, W_COMBO_KEEP } from './generated';

// Node layout (NODE_SIZE bytes): 40 B of rows, then:
const N_HOLD: i32 = 40; // i8   held type id or -1
const N_QPOS: i32 = 41; // u8   index of the piece to play next in [active, next0, next1, ...]
const N_COMBO: i32 = 42; // i8
const N_B2B: i32 = 43; // u8
const N_ROOT: i32 = 44; // u16  index into the ROOT candidate list that this line of play started with
const N_CUM: i32 = 48; // f32  accumulated rewards
const N_SCORE: i32 = 52; // f32  cum + evaluation of the board (what the beam ranks by)
const N_HASH: i32 = 56; // u32  transposition key

// ROOT candidate fields beyond the shared placement struct.
const R_LVL1: i32 = 12; // f32 score right after this first move
const R_DEEP: i32 = 16; // f32 best score of any surviving line of play from it, at the deepest level
const R_FLAG: i32 = 7; // u8 bit0 = has a surviving descendant

const NO_ROOT: i32 = 0xffff;
const NEG_INF: f32 = -1.0e30;

let sDepth: i32 = 1;
let sBeam: i32 = 8;
let sLevel: i32 = 0;
let sExp: i32 = 0;
let sDone: bool = true;
let sRootCount: i32 = 0;
let sSeqLen: i32 = 1;
let sIncoming: i32 = 0;
let sRootCanHold: bool = true;

@inline function nodePtr(level: i32, i: i32): i32 {
  return LEVELS + (level * BEAM_MAX + i) * NODE_SIZE;
}

@inline function param(slot: i32): i32 {
  return load<i32>(IN_PARAMS + (slot << 2));
}

function seqAt(i: i32): i32 {
  return i == 0 ? param(P_ACTIVE) : param(P_NEXT0 + i - 1);
}

function copyNode(dst: i32, src: i32): void {
  for (let i: i32 = 0; i < NODE_SIZE; i += 8) store<u64>(dst + i, load<u64>(src + i));
}

function nodeHash(n: i32): u32 {
  let h: u32 = 2166136261;
  for (let i: i32 = 0; i < 44; i += 4) {
    h = (h ^ load<u32>(n + i)) * 16777619;
  }
  return h;
}

function recomputeWorst(level: i32): void {
  let worst: i32 = 0;
  let ws: f32 = load<f32>(nodePtr(level, 0) + N_SCORE);
  const cnt: i32 = load<i32>(LV_COUNT + (level << 2));
  for (let i: i32 = 1; i < cnt; i++) {
    const s: f32 = load<f32>(nodePtr(level, i) + N_SCORE);
    if (s < ws) {
      ws = s;
      worst = i;
    }
  }
  store<i32>(LV_WORST + (level << 2), worst);
}

/** Offer TMP_NODE to a level's beam. */
function offer(level: i32): void {
  const hash: u32 = nodeHash(TMP_NODE);
  store<u32>(TMP_NODE + N_HASH, hash);
  const score: f32 = load<f32>(TMP_NODE + N_SCORE);
  const cnt: i32 = load<i32>(LV_COUNT + (level << 2));
  for (let i: i32 = 0; i < cnt; i++) {
    const p: i32 = nodePtr(level, i);
    if (load<u32>(p + N_HASH) == hash) {
      // Transposition: same board/hold/queue position reached another way — keep the better line.
      if (score > load<f32>(p + N_SCORE)) {
        copyNode(p, TMP_NODE);
        if (cnt == sBeam) recomputeWorst(level);
      }
      return;
    }
  }
  if (cnt < sBeam) {
    copyNode(nodePtr(level, cnt), TMP_NODE);
    store<i32>(LV_COUNT + (level << 2), cnt + 1);
    if (cnt + 1 == sBeam) recomputeWorst(level);
    return;
  }
  const w: i32 = load<i32>(LV_WORST + (level << 2));
  if (score > load<f32>(nodePtr(level, w) + N_SCORE)) {
    copyNode(nodePtr(level, w), TMP_NODE);
    recomputeWorst(level);
  }
}

/** Lock every placement of piece `t` from node `np` and offer the children to level+1. */
function expandPiece(np: i32, level: i32, t: i32, newQpos: i32, newHold: i32, usedHold: bool): void {
  useBoard(np);
  const n: i32 = generateSpawn(t);
  const combo: i32 = <i32>load<i8>(np + N_COMBO);
  const b2b: bool = load<u8>(np + N_B2B) != 0;
  const cum: f32 = load<f32>(np + N_CUM);
  const parentRoot: i32 = <i32>load<u16>(np + N_ROOT);

  for (let i: i32 = 0; i < n; i++) {
    const g: i32 = GEN + i * PL_SIZE;
    const x: i32 = <i32>load<i8>(g + PL_X);
    const y: i32 = <i32>load<i8>(g + PL_Y);
    const rot: i32 = <i32>load<u8>(g + PL_ROT);
    const spin: i32 = <i32>load<u8>(g + PL_SPIN);

    const lines: i32 = placePiece(np, SCRATCH_ROWS, t, rot, x, y);
    let reward: f32 = 0;
    let nCombo: i32 = -1;
    let nB2b: bool = b2b;
    if (lines > 0) {
      nCombo = combo + 1;
      const allClear: bool = isBoardEmpty(SCRATCH_ROWS);
      const difficult: bool = lines == 4 || spin != 0;
      reward += weight(W_LINE1 + lines - 1);
      reward += weight(W_ATTACK) * <f32>attackRows(lines, spin);
      if (spin == 2) reward += weight(W_SPIN_NORMAL);
      else if (spin == 1) reward += weight(W_SPIN_MINI);
      const comboCap: i32 = nCombo > 6 ? 6 : nCombo;
      reward += weight(W_COMBO) * <f32>comboCap;
      if (difficult) {
        if (b2b) reward += weight(W_B2B);
        nB2b = true;
      } else {
        nB2b = false;
      }
      if (allClear) reward += weight(W_ALL_CLEAR);
      reward += weight(W_SCORE) * <f32>scorePoints(lines, spin, combo, b2b, allClear) * 0.01;
    }

    let leaf: f32 = evalBoard(SCRATCH_ROWS, sIncoming);
    if (nB2b) leaf += weight(W_B2B_KEEP);
    if (nCombo > 0) {
      const keepCap: i32 = nCombo > 4 ? 4 : nCombo;
      leaf += weight(W_COMBO_KEEP) * <f32>keepCap;
    }

    const childCum: f32 = cum + reward;
    const score: f32 = childCum + leaf;

    let root: i32 = parentRoot;
    if (level == 0) {
      if (sRootCount >= ROOT_CAP) continue;
      root = sRootCount++;
      const r: i32 = ROOT + root * ROOT_SIZE;
      store<i8>(r + PL_X, <i8>x);
      store<i8>(r + PL_Y, <i8>y);
      store<u8>(r + PL_ROT, <u8>rot);
      store<u8>(r + PL_SPIN, <u8>spin);
      store<u8>(r + PL_TYPE, <u8>t);
      store<u8>(r + PL_HOLD, usedHold ? 1 : 0);
      store<u8>(r + PL_LINES, <u8>lines);
      store<u8>(r + R_FLAG, 0);
      store<f32>(r + R_LVL1, score);
      store<f32>(r + R_DEEP, NEG_INF);
    }

    for (let k: i32 = 0; k < 40; k += 8) store<u64>(TMP_NODE + k, load<u64>(SCRATCH_ROWS + k));
    store<i8>(TMP_NODE + N_HOLD, <i8>newHold);
    store<u8>(TMP_NODE + N_QPOS, <u8>newQpos);
    store<i8>(TMP_NODE + N_COMBO, <i8>nCombo);
    store<u8>(TMP_NODE + N_B2B, nB2b ? 1 : 0);
    store<u16>(TMP_NODE + N_ROOT, <u16>root);
    store<f32>(TMP_NODE + N_CUM, childCum);
    store<f32>(TMP_NODE + N_SCORE, score);
    offer(level + 1);
  }
}

function expandNode(level: i32, idx: i32): void {
  const np: i32 = nodePtr(level, idx);
  const qpos: i32 = <i32>load<u8>(np + N_QPOS);
  const hold: i32 = <i32>load<i8>(np + N_HOLD);
  const canHold: bool = level == 0 ? sRootCanHold : true;

  if (qpos < sSeqLen) expandPiece(np, level, seqAt(qpos), qpos + 1, hold, false);

  if (canHold && qpos < sSeqLen) {
    const cur: i32 = seqAt(qpos);
    if (hold >= 0) {
      if (hold != cur) expandPiece(np, level, hold, qpos + 1, cur, true);
    } else if (qpos + 1 < sSeqLen) {
      expandPiece(np, level, seqAt(qpos + 1), qpos + 2, cur, true);
    }
  }
}

export function searchBegin(): void {
  let depth: i32 = param(P_DEPTH);
  depth = depth < 1 ? 1 : depth > MAX_DEPTH ? MAX_DEPTH : depth;
  let beam: i32 = param(P_BEAM);
  beam = beam < 1 ? 1 : beam > BEAM_MAX ? BEAM_MAX : beam;
  let nextCount: i32 = param(P_NEXT_COUNT);
  nextCount = nextCount < 0 ? 0 : nextCount > MAX_NEXT ? MAX_NEXT : nextCount;

  sDepth = depth;
  sBeam = beam;
  sSeqLen = 1 + nextCount;
  sIncoming = param(P_INCOMING);
  sRootCanHold = param(P_CAN_HOLD) != 0;
  sLevel = 0;
  sExp = 0;
  sDone = false;
  sRootCount = 0;
  for (let l: i32 = 0; l < 8; l++) {
    store<i32>(LV_COUNT + (l << 2), 0);
    store<i32>(LV_WORST + (l << 2), 0);
  }

  const root: i32 = nodePtr(0, 0);
  for (let k: i32 = 0; k < 40; k += 8) store<u64>(root + k, load<u64>(ROOT_ROWS + k));
  store<i8>(root + N_HOLD, <i8>param(P_HOLD));
  store<u8>(root + N_QPOS, 0);
  store<i8>(root + N_COMBO, <i8>param(P_COMBO));
  store<u8>(root + N_B2B, param(P_B2B) != 0 ? 1 : 0);
  store<u16>(root + N_ROOT, <u16>NO_ROOT);
  store<f32>(root + N_CUM, 0);
  store<f32>(root + N_SCORE, 0);
  store<u32>(root + N_HASH, 0);
  store<i32>(LV_COUNT, 1);
}

/** Do up to `maxBfs` move-generator runs of search work. @returns 1 when the search is finished. */
export function searchStep(maxBfs: i32): i32 {
  const start: i32 = bfsRuns;
  while (!sDone) {
    if (sLevel >= sDepth) {
      sDone = true;
      break;
    }
    if (sExp >= load<i32>(LV_COUNT + (sLevel << 2))) {
      if (load<i32>(LV_COUNT + ((sLevel + 1) << 2)) == 0) {
        sDone = true;
        break;
      }
      sLevel++;
      sExp = 0;
      continue;
    }
    if (bfsRuns - start >= maxBfs) break;
    expandNode(sLevel, sExp);
    sExp++;
  }
  return sDone ? 1 : 0;
}

export function searchIsDone(): i32 {
  return sDone ? 1 : 0;
}

/** Deepest level that has at least one node (0 = nothing found: the board has no safe placement). */
export function searchDepthReached(): i32 {
  let l: i32 = 0;
  for (let i: i32 = 1; i < 8; i++) {
    if (load<i32>(LV_COUNT + (i << 2)) > 0) l = i;
  }
  return l;
}

export function searchRootCount(): i32 {
  return sRootCount;
}

/**
 * Rank the root candidates and publish the best RANK_MAX to RESULT (u16 count, then root indices).
 * Candidates whose line of play survives to the deepest level come first, ordered by how well that line
 * scored; the rest follow ordered by their one-move score. @returns how many were ranked.
 */
export function searchFinish(): i32 {
  const dl: i32 = searchDepthReached();
  for (let i: i32 = 0; i < sRootCount; i++) {
    const r: i32 = ROOT + i * ROOT_SIZE;
    store<u8>(r + R_FLAG, 0);
    store<f32>(r + R_DEEP, NEG_INF);
  }
  if (dl > 0) {
    const cnt: i32 = load<i32>(LV_COUNT + (dl << 2));
    for (let i: i32 = 0; i < cnt; i++) {
      const p: i32 = nodePtr(dl, i);
      const root: i32 = <i32>load<u16>(p + N_ROOT);
      if (root >= sRootCount) continue;
      const r: i32 = ROOT + root * ROOT_SIZE;
      const s: f32 = load<f32>(p + N_SCORE);
      if (load<u8>(r + R_FLAG) == 0 || s > load<f32>(r + R_DEEP)) {
        store<u8>(r + R_FLAG, 1);
        store<f32>(r + R_DEEP, s);
      }
    }
  }

  let ranked: i32 = 0;
  // Selection by repeated scan: RANK_MAX is tiny, sRootCount <= ROOT_CAP.
  for (let k: i32 = 0; k < RANK_MAX; k++) {
    let best: i32 = -1;
    let bestFlag: i32 = -1;
    let bestScore: f32 = 0;
    for (let i: i32 = 0; i < sRootCount; i++) {
      let taken: bool = false;
      for (let j: i32 = 0; j < ranked; j++) {
        if (<i32>load<u16>(RESULT + 2 + (j << 1)) == i) {
          taken = true;
          break;
        }
      }
      if (taken) continue;
      const r: i32 = ROOT + i * ROOT_SIZE;
      const flag: i32 = <i32>load<u8>(r + R_FLAG);
      const s: f32 = flag != 0 ? load<f32>(r + R_DEEP) : load<f32>(r + R_LVL1);
      if (best < 0 || flag > bestFlag || (flag == bestFlag && s > bestScore)) {
        best = i;
        bestFlag = flag;
        bestScore = s;
      }
    }
    if (best < 0) break;
    store<u16>(RESULT + 2 + (ranked << 1), <u16>best);
    ranked++;
  }
  store<u16>(RESULT, <u16>ranked);
  return ranked;
}

/** The value a ranked root candidate was ranked by (deep line score when it survived, else one-move score). */
export function rootValue(i: i32): f32 {
  const r: i32 = ROOT + i * ROOT_SIZE;
  return load<u8>(r + R_FLAG) != 0 ? load<f32>(r + R_DEEP) : load<f32>(r + R_LVL1);
}
