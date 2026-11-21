// assembly/bot/moves.ts
//
// Move generator: every position a piece can LOCK in, reachable from a start state by the five inputs a
// player has (left, right, one soft-drop step, rotate cw, rotate ccw), found by breadth-first search so
// each placement carries a SHORTEST input path (for the finesse trainer / humanized input emission).
//
// A state is (x, y, rot, spin) where `spin` is the T-spin class the game would currently hold:
// the game stores `isTSpin` when a rotation succeeds and clears it on any successful move, so a T only
// scores a spin if its LAST input was a rotation and nothing moved it afterwards. Tracking the class in
// the state reproduces that exactly (and lets the same cells appear both as a spin and as a plain drop).

import { GEN, HT_KEYS, HT_STAMP, HT_VAL, BFS_VIS, BFS_PARENT, BFS_MOVE, BFS_QUEUE, BFS_STATES, MAX_PLACEMENTS, PL_SIZE, PATH, PATH_CAP, SHAPES, SPAWN_X, SPAWN_Y } from './layout';
import { fits, allCellsVisible, tryRotate, rotX, rotY, tSpinClass, T_O, T_T } from './shapes';

// Input codes written to PATH. Match REPLAY_ACTION order in src/replay/actions.ts after mapping in BotCore.
export const M_LEFT: i32 = 1;
export const M_RIGHT: i32 = 2;
export const M_DOWN: i32 = 3;
export const M_CW: i32 = 4;
export const M_CCW: i32 = 5;

const XOFF: i32 = 3;
const XN: i32 = 14;
const YOFF: i32 = 6;
const YN: i32 = 26;
const NO_PARENT: i32 = 0xffff;

// Placement struct (PL_SIZE bytes) field offsets, shared by the GEN list and the search ROOT list.
export const PL_X: i32 = 0; // i8
export const PL_Y: i32 = 1; // i8
export const PL_ROT: i32 = 2; // u8
export const PL_SPIN: i32 = 3; // u8 0 none, 1 mini, 2 full
export const PL_TYPE: i32 = 4; // u8
export const PL_HOLD: i32 = 5; // u8 1 when reached through a hold swap
export const PL_LINES: i32 = 6; // u8 lines this lock clears (filled by the search)
export const PL_STATE: i32 = 8; // u16 BFS state index (valid until the next BFS)

let stamp: i32 = 0;
let placementCount: i32 = 0;
export let bfsRuns: i32 = 0;

@inline function stateIndex(spin: i32, rot: i32, x: i32, y: i32): i32 {
  return ((spin * 4 + rot) * YN + (y + YOFF)) * XN + (x + XOFF);
}

function nextStamp(): void {
  stamp++;
  if (stamp > 255) {
    for (let i: i32 = 0; i < BFS_STATES; i++) store<u8>(BFS_VIS + i, 0);
    for (let i: i32 = 0; i < 128; i++) store<u8>(HT_STAMP + i, 0);
    stamp = 1;
  }
}

function pack(spin: i32, rot: i32, x: i32, y: i32): i32 {
  return spin | (rot << 2) | ((x + XOFF) << 4) | ((y + YOFF) << 8);
}

/** Sorted-cell key of a lock: identical cell sets (S/Z/I rotate onto themselves) collapse to one entry. */
function cellsKey(t: i32, rot: i32, x: i32, y: i32): u32 {
  const sp: i32 = SHAPES + (t * 4 + rot) * 8;
  let a: i32 = (y + <i32>load<i8>(sp + 1)) * 10 + x + <i32>load<i8>(sp);
  let b: i32 = (y + <i32>load<i8>(sp + 3)) * 10 + x + <i32>load<i8>(sp + 2);
  let c: i32 = (y + <i32>load<i8>(sp + 5)) * 10 + x + <i32>load<i8>(sp + 4);
  let d: i32 = (y + <i32>load<i8>(sp + 7)) * 10 + x + <i32>load<i8>(sp + 6);
  let tmp: i32 = 0;
  if (a > b) { tmp = a; a = b; b = tmp; }
  if (c > d) { tmp = c; c = d; d = tmp; }
  if (a > c) { tmp = a; a = c; c = tmp; }
  if (b > d) { tmp = b; b = d; d = tmp; }
  if (b > c) { tmp = b; b = c; c = tmp; }
  return <u32>(((a * 200 + b) * 200 + c) * 200 + d);
}

function record(t: i32, rot: i32, x: i32, y: i32, spin: i32, state: i32): void {
  const key: u32 = cellsKey(t, rot, x, y);
  let slot: i32 = <i32>((key * 2654435761) >>> 25);
  while (load<u8>(HT_STAMP + slot) == <u8>stamp && load<u32>(HT_KEYS + (slot << 2)) != key) {
    slot = (slot + 1) & 127;
  }
  if (load<u8>(HT_STAMP + slot) == <u8>stamp) {
    // Same cells reached again: keep the better spin (the BFS reached the earlier one by a shorter path).
    const p: i32 = GEN + <i32>load<u8>(HT_VAL + slot) * PL_SIZE;
    if (spin > <i32>load<u8>(p + PL_SPIN)) {
      store<u8>(p + PL_SPIN, <u8>spin);
      store<u16>(p + PL_STATE, <u16>state);
    }
    return;
  }
  if (placementCount >= MAX_PLACEMENTS) return;
  store<u8>(HT_STAMP + slot, <u8>stamp);
  store<u32>(HT_KEYS + (slot << 2), key);
  store<u8>(HT_VAL + slot, <u8>placementCount);
  const p: i32 = GEN + placementCount * PL_SIZE;
  store<i8>(p + PL_X, <i8>x);
  store<i8>(p + PL_Y, <i8>y);
  store<u8>(p + PL_ROT, <u8>rot);
  store<u8>(p + PL_SPIN, <u8>spin);
  store<u8>(p + PL_TYPE, <u8>t);
  store<u8>(p + PL_HOLD, 0);
  store<u8>(p + PL_LINES, 0);
  store<u16>(p + PL_STATE, <u16>state);
  placementCount++;
}

/** true when the piece falls from y straight to ty (every intermediate row free; ty itself already known to fit). */
function dropsTo(t: i32, rot: i32, x: i32, y: i32, ty: i32): bool {
  for (let yy: i32 = y + 1; yy <= ty; yy++) {
    if (!fits(t, rot, x, yy)) return false;
  }
  return true;
}

/**
 * Breadth-first search over the board set with useBoard().
 *
 * mode 0 (collect): fill the GEN list with every lock placement; returns how many.
 * mode 1 (path):    stop at the first state from which the piece reaches (tx, ty, trot) with its hard drop, write its
 *                   input path to PATH, return the length (0 = hard-drop right now, -1 = unreachable). The final
 *                   straight drop is FREE (a player hard-drops; it is not 20 soft-drop presses). A spin target
 *                   (tspin > 0) must be matched exactly: a T-spin needs the LAST input to be the rotation, so
 *                   no drop may follow it.
 */
function bfs(t: i32, sx: i32, sy: i32, srot: i32, sspin: i32, mode: i32, tx: i32, ty: i32, trot: i32, tspin: i32): i32 {
  bfsRuns++;
  nextStamp();
  placementCount = 0;
  if (!fits(t, srot, sx, sy)) return mode == 0 ? 0 : -1;

  const isT: bool = t == T_T;
  let head: i32 = 0;
  let tail: i32 = 0;
  const startSpin: i32 = isT ? sspin : 0;
  const startIdx: i32 = stateIndex(startSpin, srot, sx, sy);
  store<u8>(BFS_VIS + startIdx, <u8>stamp);
  store<u16>(BFS_PARENT + (startIdx << 1), <u16>NO_PARENT);
  store<u16>(BFS_QUEUE + (tail << 1), <u16>pack(startSpin, srot, sx, sy));
  tail++;

  while (head < tail) {
    const q: i32 = <i32>load<u16>(BFS_QUEUE + (head << 1));
    head++;
    const spin: i32 = q & 3;
    const rot: i32 = (q >> 2) & 3;
    const x: i32 = ((q >> 4) & 15) - XOFF;
    const y: i32 = ((q >> 8) & 31) - YOFF;
    const cur: i32 = stateIndex(spin, rot, x, y);

    if (mode == 1 && x == tx && rot == trot && y <= ty && (tspin > 0 ? (y == ty && spin == tspin) : dropsTo(t, rot, x, y, ty))) {
      // Reconstruct: walk parents back to the start, then reverse into PATH.
      let len: i32 = 0;
      let s: i32 = cur;
      while (<i32>load<u16>(BFS_PARENT + (s << 1)) != NO_PARENT) {
        len++;
        s = <i32>load<u16>(BFS_PARENT + (s << 1));
      }
      if (len > PATH_CAP) return -1;
      s = cur;
      let w: i32 = len - 1;
      while (<i32>load<u16>(BFS_PARENT + (s << 1)) != NO_PARENT) {
        store<u8>(PATH + w, load<u8>(BFS_MOVE + s));
        w--;
        s = <i32>load<u16>(BFS_PARENT + (s << 1));
      }
      return len;
    }

    const resting: bool = !fits(t, rot, x, y + 1);
    if (mode == 0 && resting && allCellsVisible(t, rot, y)) {
      record(t, rot, x, y, spin, cur);
    }

    for (let m: i32 = 1; m <= 5; m++) {
      let nx: i32 = x;
      let ny: i32 = y;
      let nrot: i32 = rot;
      let nspin: i32 = 0;
      if (m == M_LEFT) {
        nx = x - 1;
        if (!fits(t, rot, nx, ny)) continue;
      } else if (m == M_RIGHT) {
        nx = x + 1;
        if (!fits(t, rot, nx, ny)) continue;
      } else if (m == M_DOWN) {
        if (resting) continue;
        ny = y + 1;
      } else {
        if (t == T_O) continue; // rotateActivePiece returns immediately for O
        nrot = m == M_CW ? (rot + 1) & 3 : (rot + 3) & 3;
        const kick: i32 = tryRotate(t, rot, nrot, x, y);
        if (kick == -2) continue;
        nx = rotX;
        ny = rotY;
        if (isT) nspin = tSpinClass(nx, ny, nrot, kick == 4);
      }
      if (ny < -YOFF) continue;
      const ni: i32 = stateIndex(nspin, nrot, nx, ny);
      if (load<u8>(BFS_VIS + ni) == <u8>stamp) continue;
      store<u8>(BFS_VIS + ni, <u8>stamp);
      store<u16>(BFS_PARENT + (ni << 1), <u16>cur);
      store<u8>(BFS_MOVE + ni, <u8>m);
      store<u16>(BFS_QUEUE + (tail << 1), <u16>pack(nspin, nrot, nx, ny));
      tail++;
    }
  }
  return mode == 0 ? placementCount : -1;
}

/** Every lockable placement of piece `t` from the given start state on the current useBoard(). */
export function generateFrom(t: i32, sx: i32, sy: i32, srot: i32, sspin: i32): i32 {
  return bfs(t, sx, sy, srot, sspin, 0, 0, 0, 0, 0);
}

/** Every lockable placement of a freshly spawned piece. */
export function generateSpawn(t: i32): i32 {
  return bfs(t, SPAWN_X, SPAWN_Y, 0, 0, 0, 0, 0, 0, 0);
}

/** Shortest input path from a start state to a target lock state; writes PATH, returns its length or -1. */
export function planPath(t: i32, sx: i32, sy: i32, srot: i32, sspin: i32, tx: i32, ty: i32, trot: i32, tspin: i32): i32 {
  return bfs(t, sx, sy, srot, sspin, 1, tx, ty, trot, tspin);
}
