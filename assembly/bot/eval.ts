// assembly/bot/eval.ts
//
// Board evaluator + the rules-faithful scoring helpers the search rewards come from.
//
// The board is 20 occupancy rows, one u16 per row (bit x = column x, row 0 = top), the same orientation
// as the game's playfield. A bitboard keeps the evaluator branch-light and a whole position at 40 bytes,
// which is what lets the beam search hold hundreds of candidate boards in one 64 KiB memory page.

import { WEIGHTS, HEIGHTS, COUNTS, SHAPES } from './layout';
import { W_HEIGHT_AGG, W_MAX_HEIGHT, W_HOLES, W_HOLE_ROWS, W_COVERED, W_BUMPINESS, W_WELL_SUM, W_ROW_TRANS, W_COL_TRANS, W_T_SLOT, W_TETRIS_READY, W_DANGER, attackNone, attackTSpinMini, attackTSpin } from './generated';

const FULL: i32 = 0x3ff;
/** Stack height at which incoming garbage starts to count as dangerous. */
const DANGER_LINE: i32 = 14;

@inline export function weight(i: i32): f32 {
  return load<f32>(WEIGHTS + (i << 2));
}

@inline function row(rows: i32, y: i32): i32 {
  return <i32>load<u16>(rows + (y << 1));
}

/**
 * Lock a piece into `dst` (a copy of `src`), clear full rows, and return how many cleared.
 * The cells must already be known to fit and be on-board (the move generator guarantees both).
 */
export function placePiece(src: i32, dst: i32, t: i32, rot: i32, x: i32, y: i32): i32 {
  for (let i: i32 = 0; i < 20; i++) store<u16>(dst + (i << 1), load<u16>(src + (i << 1)));
  const sp: i32 = SHAPES + (t * 4 + rot) * 8;
  for (let i: i32 = 0; i < 4; i++) {
    const cy: i32 = y + <i32>load<i8>(sp + i * 2 + 1);
    const cx: i32 = x + <i32>load<i8>(sp + i * 2);
    store<u16>(dst + (cy << 1), <u16>(row(dst, cy) | (1 << cx)));
  }
  let lines: i32 = 0;
  let w: i32 = 19;
  for (let r: i32 = 19; r >= 0; r--) {
    const v: i32 = row(dst, r);
    if (v == FULL) {
      lines++;
    } else {
      if (w != r) store<u16>(dst + (w << 1), <u16>v);
      w--;
    }
  }
  for (; w >= 0; w--) store<u16>(dst + (w << 1), 0);
  return lines;
}

export function isBoardEmpty(rows: i32): bool {
  for (let y: i32 = 0; y < 20; y++) if (row(rows, y) != 0) return false;
  return true;
}

/** Garbage rows sent for a clear; reads the table generated from shared/versusAttack.json. */
export function attackRows(lines: i32, spin: i32): i32 {
  if (lines <= 0) return 0;
  const l: i32 = lines > 4 ? 4 : lines;
  if (spin == 2) return attackTSpin(l);
  if (spin == 1) return attackTSpinMini(l);
  return attackNone(l);
}

/**
 * Points ScoringSystem.updateScore() awards at level 1, so search rewards use the REAL scoring rules.
 * `comboBefore` is the combo counter before this clear (-1 = none); `b2bBefore` whether a chain is live.
 */
export function scorePoints(lines: i32, spin: i32, comboBefore: i32, b2bBefore: bool, allClear: bool): i32 {
  if (lines <= 0) return 0;
  const combo: i32 = comboBefore + 1;
  const difficult: bool = lines == 4 || spin != 0;
  let base: i32 = 0;
  if (spin == 2) {
    if (lines == 1) base = 800;
    else if (lines == 2) base = 1200;
    else if (lines == 3) base = 1600;
  } else if (spin == 1) {
    if (lines == 1) base = 200;
    else if (lines == 2) base = 400;
  } else {
    if (lines == 1) base = 100;
    else if (lines == 2) base = 300;
    else if (lines == 3) base = 500;
    else if (lines == 4) base = 800;
  }
  const b2bMult: f64 = difficult && b2bBefore ? 1.5 : 1.0;
  const comboMult: f64 = 1.0 + <f64>combo * 0.3;
  let total: i32 = <i32>Math.floor(<f64>base * b2bMult * comboMult);
  if (allClear) total += 2000;
  return total;
}

/** Number of T-spin-double shaped slots (TSD overhang + supported notch) on the board, capped at 2. */
function tSlots(rows: i32): i32 {
  let count: i32 = 0;
  for (let y: i32 = 0; y < 18; y++) {
    const a: i32 = row(rows, y + 2); // shoulders + notch
    const b: i32 = row(rows, y + 1); // must be open for the T
    const c: i32 = row(rows, y); // exactly one overhang corner
    const support: i32 = y + 3 < 20 ? row(rows, y + 3) : FULL;
    for (let x: i32 = 0; x < 8; x++) {
      if (((a >> x) & 7) != 5) continue;
      if (((b >> x) & 7) != 0) continue;
      const corner: i32 = (c >> x) & 5;
      if (corner != 1 && corner != 4) continue;
      if (((support >> (x + 1)) & 1) == 0) continue;
      count++;
    }
  }
  return count > 2 ? 2 : count;
}

/** Weighted evaluation of a post-lock board. `incoming` = garbage rows queued against it. */
export function evalBoard(rows: i32, incoming: i32): f32 {
  let seen: i32 = 0;
  let holes: i32 = 0;
  let holeRows: i32 = 0;
  let covered: i32 = 0;
  let colTrans: i32 = 0;
  let rowTrans: i32 = 0;
  let prev: i32 = 0;
  let top: i32 = 20;
  for (let i: i32 = 0; i < 10; i++) {
    store<u8>(HEIGHTS + i, 0);
    store<u8>(COUNTS + i, 0);
  }

  for (let y: i32 = 0; y < 20; y++) {
    const r: i32 = row(rows, y);
    if (r != 0 && top == 20) top = y;
    let fresh: i32 = r & ~seen;
    while (fresh != 0) {
      const c: i32 = ctz<i32>(fresh);
      fresh &= fresh - 1;
      store<u8>(HEIGHTS + c, <u8>(20 - y));
    }
    const holeMask: i32 = ~r & seen & FULL;
    if (holeMask != 0) {
      holeRows++;
      let hm: i32 = holeMask;
      while (hm != 0) {
        const c: i32 = ctz<i32>(hm);
        hm &= hm - 1;
        holes++;
        covered += <i32>load<u8>(COUNTS + c);
      }
    }
    let filled: i32 = r;
    while (filled != 0) {
      const c: i32 = ctz<i32>(filled);
      filled &= filled - 1;
      store<u8>(COUNTS + c, load<u8>(COUNTS + c) + 1);
    }
    seen |= r;
    colTrans += popcnt<i32>(prev ^ r);
    prev = r;
    if (top != 20) {
      const ext: i32 = (1 << 11) | (r << 1) | 1;
      rowTrans += popcnt<i32>((ext ^ (ext >> 1)) & 0x7ff);
    }
  }
  colTrans += popcnt<i32>(~prev & FULL); // the floor counts as filled

  let heightAgg: i32 = 0;
  let bump: i32 = 0;
  let wells: i32 = 0;
  let maxH: i32 = 0;
  for (let c: i32 = 0; c < 10; c++) {
    const h: i32 = <i32>load<u8>(HEIGHTS + c);
    heightAgg += h;
    if (h > maxH) maxH = h;
    if (c < 9) {
      const d: i32 = h - <i32>load<u8>(HEIGHTS + c + 1);
      bump += d < 0 ? -d : d;
    }
    const l: i32 = c == 0 ? 20 : <i32>load<u8>(HEIGHTS + c - 1);
    const rr: i32 = c == 9 ? 20 : <i32>load<u8>(HEIGHTS + c + 1);
    const m: i32 = l < rr ? l : rr;
    const depth: i32 = m - h;
    if (depth > 0) wells += depth * (depth + 1) / 2;
  }

  // Rows that are full except for one edge column: the "tetris well" is built.
  let readyR: i32 = 0;
  let readyL: i32 = 0;
  for (let y: i32 = 0; y < 20; y++) {
    const r: i32 = row(rows, y);
    if (r == 0x1ff) readyR++;
    else if (r == 0x3fe) readyL++;
  }
  let ready: i32 = readyR > readyL ? readyR : readyL;
  if (ready > 4) ready = 4;

  let danger: i32 = maxH + incoming - DANGER_LINE;
  if (danger < 0) danger = 0;

  let s: f32 = 0;
  s += weight(W_HEIGHT_AGG) * <f32>heightAgg;
  s += weight(W_MAX_HEIGHT) * <f32>maxH;
  s += weight(W_HOLES) * <f32>holes;
  s += weight(W_HOLE_ROWS) * <f32>holeRows;
  s += weight(W_COVERED) * <f32>covered;
  s += weight(W_BUMPINESS) * <f32>bump;
  s += weight(W_WELL_SUM) * <f32>wells;
  s += weight(W_ROW_TRANS) * <f32>rowTrans;
  s += weight(W_COL_TRANS) * <f32>colTrans;
  s += weight(W_T_SLOT) * <f32>tSlots(rows);
  s += weight(W_TETRIS_READY) * <f32>ready;
  s += weight(W_DANGER) * <f32>danger;
  return s;
}
