/** FNV-1a hash of the locked playfield — used to verify replay determinism. */
export function hashPlayfield(playfield: Int8Array): number {
  let h = 2166136261;
  for (let i = 0; i < playfield.length; i++) {
    h ^= playfield[i] & 0xff;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Extended hash including score/lines for end-state checks. */
export function hashGameState(
  playfield: Int8Array,
  score: number,
  lines: number,
): number {
  let h = hashPlayfield(playfield);
  h ^= score >>> 0;
  h = Math.imul(h, 16777619);
  h ^= lines >>> 0;
  h = Math.imul(h, 16777619);
  return h >>> 0;
}
