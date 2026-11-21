// assembly/bot/layout.ts
//
// Memory map of the CPU opponent. Everything lives in the SAME imported 1-page (64 KiB) memory the
// collision code uses, ABOVE the board/scratch region (offsets 0..479, see assembly/index.ts), so the
// bot can run inside the main-thread WasmCore memory or in its own instance inside a Worker.
//
// No heap, no GC: every buffer below is a fixed offset, written with load<T>/store<T> exactly like the
// collision kernels. The host (src/bot/BotCore.ts) reads the pointers back through the botXxxPtr()
// exports instead of hard-coding them; tests/bot-wasm-core.test.ts pins the TS mirror of the constants
// that ARE shared (slot indices, struct strides).
//
// The module has NO static data (AssemblyScript would put it at offset 12, on top of the boards): every table
// is built into the regions below by botInit(). tests/bot-wasm-core.test.ts proves instantiation writes nothing.

export const BOT_BASE: i32 = 2048;

// ---- host-writable input ----------------------------------------------------------------------
export const IN_CELLS: i32 = BOT_BASE; // 200 × i8 playfield cells, row-major, row 0 = top (same as the game)
export const IN_PARAMS: i32 = IN_CELLS + 208; // PARAM_SLOTS × i32, see P_* below
export const PARAM_SLOTS: i32 = 32;
export const WEIGHTS: i32 = IN_PARAMS + PARAM_SLOTS * 4; // WEIGHT_CAPACITY × f32
export const SHAPES: i32 = WEIGHTS + 128; // 7 types × 4 rotations × 4 cells × (cx,cy) i8 = 224 B
export const KICK_TBL: i32 = SHAPES + 224; // 2 piece classes × 16 (from*4+to) × i32 of packed kick offsets = 128 B

// Parameter slot indices (i32 each, relative to IN_PARAMS).
export const P_ACTIVE: i32 = 0; // active piece type id 0..6 (I,J,L,O,S,T,Z)
export const P_HOLD: i32 = 1; // held piece type id, -1 = empty
export const P_CAN_HOLD: i32 = 2; // 1 when a hold is still allowed this piece
export const P_COMBO: i32 = 3; // scoring combo counter (-1 = none), same convention as ScoringSystem
export const P_B2B: i32 = 4; // 1 when the next difficult clear continues a back-to-back chain
export const P_INCOMING: i32 = 5; // garbage rows queued against this board
export const P_NEXT_COUNT: i32 = 6; // known upcoming pieces (0..MAX_NEXT)
export const P_DEPTH: i32 = 7; // plies to search (1..MAX_DEPTH)
export const P_BEAM: i32 = 8; // beam width (1..BEAM_MAX)
export const P_START_X: i32 = 9; // generate/plan start state
export const P_START_Y: i32 = 10;
export const P_START_ROT: i32 = 11;
export const P_START_SPIN: i32 = 12; // T-spin class already pending on the start state (0 none, 1 mini, 2 full)
export const P_NEXT0: i32 = 13; // MAX_NEXT slots of upcoming type ids
export const MAX_NEXT: i32 = 8;

export const SPAWN_X: i32 = 3;
export const SPAWN_Y: i32 = -2;

// ---- working buffers ---------------------------------------------------------------------------
export const ROOT_ROWS: i32 = KICK_TBL + 128; // 20 × u16 occupancy rows of the position being decided
export const ROWS_BYTES: i32 = 48; // 40 used, padded
export const SCRATCH_ROWS: i32 = ROOT_ROWS + ROWS_BYTES; // 4 scratch row buffers
export const PATH: i32 = SCRATCH_ROWS + ROWS_BYTES * 4; // 128 move codes (see M_* in moves.ts)
export const PATH_CAP: i32 = 128;
export const RESULT: i32 = PATH + PATH_CAP; // u16 count, then RANK_MAX u16 root-move indices
export const RANK_MAX: i32 = 8;
export const GEN: i32 = RESULT + 64; // MAX_PLACEMENTS × PL_SIZE: placements of the last botGenerate
export const MAX_PLACEMENTS: i32 = 80;
export const PL_SIZE: i32 = 16;
export const ROOT: i32 = GEN + MAX_PLACEMENTS * PL_SIZE; // ROOT_CAP × ROOT_SIZE root candidates
export const ROOT_CAP: i32 = 160;
export const ROOT_SIZE: i32 = 24;
export const HT_KEYS: i32 = ROOT + ROOT_CAP * ROOT_SIZE; // 128 × u32 dedupe keys
export const HT_STAMP: i32 = HT_KEYS + 512; // 128 × u8
export const HT_VAL: i32 = HT_STAMP + 128; // 128 × u8
export const HEIGHTS: i32 = HT_VAL + 128; // 16 B column scratch for eval
export const COUNTS: i32 = HEIGHTS + 16; // 16 B column scratch for eval
export const LV_COUNT: i32 = COUNTS + 16; // 8 × i32 nodes per search level
export const LV_WORST: i32 = LV_COUNT + 32; // 8 × i32 index of the lowest-scoring node when full
export const TMP_NODE: i32 = LV_WORST + 32; // 64 B child under construction

// BFS tables for the move generator (see moves.ts).
export const BFS_STATES: i32 = 4368; // 3 spin classes × 4 rotations × 26 rows × 14 cols
export const BFS_VIS: i32 = TMP_NODE + 64; // u8 stamp per state
export const BFS_PARENT: i32 = BFS_VIS + 4384; // u16 parent state
export const BFS_MOVE: i32 = BFS_PARENT + BFS_STATES * 2; // u8 move that reached the state
export const BFS_QUEUE: i32 = BFS_MOVE + 4384; // u16 packed states

// Beam search levels: LEVEL_COUNT levels × BEAM_MAX nodes × NODE_SIZE bytes.
export const LEVELS: i32 = BFS_QUEUE + BFS_STATES * 2;
export const LEVEL_COUNT: i32 = 8;
export const BEAM_MAX: i32 = 32;
export const NODE_SIZE: i32 = 64;
export const MAX_DEPTH: i32 = 7;

export const BOT_END: i32 = LEVELS + LEVEL_COUNT * BEAM_MAX * NODE_SIZE;
