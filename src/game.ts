import { type Piece, PieceGenerator } from './game/pieces.js';
import { rotatePieceBlocks, getWallKicks } from './game/rotation.js';
import { CollisionDetector } from './game/collision.js';
import { ScoringSystem, type ScoreEvent, type HighScoreManager } from './game/scoring.js';
import { compactClearedRows, isPlayfieldEmpty, countGarbageCells, clearTopRows } from './game/lineUtils.js';
import { buildPlayfieldProjection } from './game/stateProjection.js';
import type { GameState } from './game/gameState.js';
import { RunStats } from './game/runStats.js';
import { NEXT_QUEUE_CONFIG } from './config/gameConfig.js';
import { loadGameSettings } from './config/gameSettings.js';
import { createGameMode, parseGameModeId } from './game/modes/createGameMode.js';
import type { GameMode, GameModeId, ModeContext, ModeGameHooks } from './game/modes/types.js';
import { getModeLeaderboard } from './game/modeLeaderboard.js';
import { WasmCore } from './wasm/WasmCore.js';
import { wasmLogger } from './utils/logger.js';
import { injectGarbageRows } from './versus/garbage.js';
import type { IView } from './view/IView.js';
import {
  handleMoveReset as applyMoveReset,
  resetLockDelayResult,
  tickLockDelay,
  tickLockDelaySync,
  type LockDelayHost,
} from './game/lockDelay.js';
import { evaluateTSpin } from './game/tSpin.js';
import {
  performHold as applyHold,
  refillNextQueue as refillNextQueueHost,
  spawnNextPiece,
  type SpawnHoldHost,
} from './game/spawnHold.js';
import { performHardDrop } from './game/hardDrop.js';

export type { GameState } from './game/gameState.js';
export type { GameModeId } from './game/modes/types.js';

export interface GameOptions {
  /** Shared WASM playfield index (0 = single-player default, 1 = versus P2). */
  wasmBoardId?: 0 | 1;
}

export default class Game implements ModeGameHooks {
  gameOver!: boolean;
  victory: boolean = false;
  modeElapsedMs: number = 0;
  playfield!: Int8Array; // Optimized
  readonly playfieldWidth = 10;
  readonly playfieldHeight = 20;

  activPiece!: Piece;
  nextPiece!: Piece;
  nextQueue: Piece[] = [];
  nextQueueDepth: number = NEXT_QUEUE_CONFIG.DEFAULT_DEPTH;
  holdPieceObj: Piece | null = null;
  canHold: boolean = true;
  readonly runStats = new RunStats();

  // Lock Delay
  lockTimer: number = 0;
  readonly lockDelayTime: number = 500; // ms (Standard: 500)

  // Extended Placement (Infinity-like behavior)
  lockResets: number = 0;
  // NEON BRICKLAYER: Verified Infinity Mechanics (15 resets)
  readonly maxLockResets: number = 15;

  // Visual Effects
  effectEvent: string | null = null;
  effectCounter: number = 0;
  lastDropPos: { x: number, y: number } | null = null;
  lastDropDistance: number = 0;
  scoreEvent: ScoreEvent | null = null;

  // T-Spin Tracking
  isTSpin: boolean = false;

  // Subsystems
  private pieceGenerator: PieceGenerator;
  private collisionDetector: CollisionDetector;
  scoringSystem: ScoringSystem;
  private mode: GameMode;
  private projectedPlayfield: number[][] = [];

  // Bound methods to prevent per-frame garbage collection
  private boundGetCell: (x: number, y: number) => number;

  // Pre-allocated array for WASM collision checks to avoid GC
  private collisionCoordsCache: {x: number, y: number}[] = [
      {x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}
  ];

  // Pre-allocated result object for update loop to avoid GC
  private _updateResult: { linesCleared: number[], locked: boolean, gameOver: boolean, tSpin: boolean } = {
      linesCleared: [], locked: false, gameOver: false, tSpin: false
  };

  // Pre-allocated temporary piece for rotation checks to avoid GC
  private _tempPiece: Piece = { blocks: [], x: 0, y: 0, rotation: 0, type: '' };
  private _tempBlocks: number[][] = [];

  // Pre-allocated corners for T-Spin checks to avoid GC
  private _tSpinCorners: { x: number, y: number }[] = [
      { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }
  ];

  private _linesClearedCache: number[] = [];

  hardDropSnapshot: { blocks: number[][]; x: number } | null = null;

  /** Incoming garbage rows from opponent (applied on next lock). */
  pendingGarbageRows = 0;

  /** Deterministic garbage hole RNG for lockstep (optional). */
  private garbageRngFactory: (() => () => number) | null = null;

  private practiceInfiniteHold = false;
  practiceTopOutRecovery = false;
  private static readonly ZEN_RECOVERY_ROWS = 4;

  get infiniteHold(): boolean {
    return this.practiceInfiniteHold;
  }

  private useWasmCollision = true;
  private wasmBoardId = 0;
  private neonHyperInversionFlag = false;

  private _hardDropResult: { linesCleared: number[], locked: boolean, gameOver: boolean, tSpin: boolean } = {
      linesCleared: [], locked: false, gameOver: false, tSpin: false
  };

  readonly gameStateCache: GameState = {
    score: 0,
    level: 1,
    lines: 0,
    nextPiece: { blocks: [], x: 0, y: 0, rotation: 0, type: '' },
    nextQueue: [],
    holdPiece: null,
    activePiece: { blocks: [], x: 0, y: 0, rotation: 0, type: '' },
    isGameOver: false,
    isVictory: false,
    modeId: 'marathon',
    modeLabel: 'Marathon',
    modePrimaryLabel: 'GOAL',
    modePrimaryValue: 'Survive',
    modeSecondaryLabel: 'TIME',
    modeSecondaryValue: '0:00',
    modeShowSecondary: true,
    modeShowLevel: true,
    modeShowScore: true,
    modeShowHighScore: true,
    modeHighScoreLabel: 'HIGH SCORE',
    elapsedMs: 0,
    playfield: [],
    lockTimer: 0,
    lockDelayTime: 0,
    effectEvent: null,
    effectCounter: 0,
    effectFlag: false,
    neonBurstFlag: false,
    neonHyperInversionFlag: false,
    lastDropPos: null,
    lastDropDistance: 0,
    scoreEvent: null,
    isTSpinReady: false,
    runStats: {
      piecesPlaced: 0,
      moves: 0,
      rotations: 0,
      hardDrops: 0,
      finesseFaults: 0,
      peakCombo: 0,
      peakB2BChain: 0,
      elapsedMs: 0,
      pps: 0,
      apm: 0,
    },
  };

  // View reference for reactive system hooks
  view: IView | null = null;

  constructor(options?: GameOptions) {
    this.pieceGenerator = new PieceGenerator();
    this.wasmBoardId = options?.wasmBoardId ?? 0;
    // --- WASM INTEGRATION ---
    try {
        const core = WasmCore.get();
        if (core.isReady) {
          this.playfield = core.getPlayfieldView(this.wasmBoardId);
          if (this.playfield.length !== this.playfieldWidth * this.playfieldHeight) {
              wasmLogger.error("Memory View mismatch");
              this.playfield = new Int8Array(this.playfieldWidth * this.playfieldHeight);
              this.useWasmCollision = false;
          } else {
              this.useWasmCollision = true;
          }
        } else {
          this.playfield = new Int8Array(this.playfieldWidth * this.playfieldHeight);
          this.useWasmCollision = false;
        }
    } catch (_e) {
        wasmLogger.warn("Not loaded, using fallback memory");
        this.playfield = new Int8Array(this.playfieldWidth * this.playfieldHeight);
        this.useWasmCollision = false;
    }
    // ------------------------
    this.collisionDetector = new CollisionDetector(this.playfield);
    this.scoringSystem = new ScoringSystem();
    this.mode = createGameMode(parseGameModeId(
      typeof localStorage !== 'undefined' ? localStorage.getItem('tetris_game_mode') : null
    ));
    this.boundGetCell = this.getCell.bind(this);
    this.reset();
  }

  get modeId(): GameModeId {
    return this.mode.id;
  }

  get isRunEnded(): boolean {
    return this.gameOver || this.victory;
  }

  setMode(id: GameModeId): void {
    this.mode = createGameMode(id);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('tetris_game_mode', id);
    }
    this.reset();
  }

  getMode(): GameMode {
    return this.mode;
  }

  getEffectiveLevel(): number {
    const override = this.mode.getEffectiveLevel(this.lines, this.score);
    return override ?? this.level;
  }

  setFixedScoringLevel(level: number | null): void {
    this.scoringSystem.setFixedLevel(level);
  }

  resetElapsedMs(): void {
    this.modeElapsedMs = 0;
  }

  injectCheeseRows(rowCount: number, rng: () => number = Math.random): void {
    if (rowCount <= 0) return;
    injectGarbageRows(
      this.playfield,
      this.playfieldWidth,
      this.playfieldHeight,
      rowCount,
      rng,
    );
    this.collisionDetector.updatePlayfield(this.playfield);
  }

  countGarbageCells(): number {
    return countGarbageCells(this.playfield);
  }

  setPracticeFlags(flags: { infiniteHold?: boolean; topOutRecovery?: boolean }): void {
    this.practiceInfiniteHold = flags.infiniteHold ?? false;
    this.practiceTopOutRecovery = flags.topOutRecovery ?? false;
  }

  recoverFromTopOut(): boolean {
    if (!this.practiceTopOutRecovery) return false;
    clearTopRows(
      this.playfield,
      this.playfieldWidth,
      this.playfieldHeight,
      Game.ZEN_RECOVERY_ROWS,
    );
    this.collisionDetector.updatePlayfield(this.playfield);
    this.view?.syncBoardToGPU?.(this.playfield);
    return true;
  }

  private buildModeContext(): ModeContext {
    return {
      lines: this.lines,
      score: this.score,
      level: this.level,
      elapsedMs: this.modeElapsedMs,
      gameOver: this.gameOver,
      victory: this.victory,
      garbageCellsRemaining: this.countGarbageCells(),
    };
  }

  tickMode(dt: number): void {
    if (this.isRunEnded) return;
    this.modeElapsedMs += dt;
    this.runStats.tick(dt);
    this.mode.onTick(dt, this.buildModeContext());
    this.evaluateModeEnd();
  }

  setNextQueueDepth(depth: number): void {
    this.nextQueueDepth = Math.max(
      NEXT_QUEUE_CONFIG.MIN_DEPTH,
      Math.min(NEXT_QUEUE_CONFIG.MAX_DEPTH, Math.floor(depth)),
    );
    while (this.nextQueue.length > this.nextQueueDepth) {
      this.nextQueue.pop();
    }
    this.refillNextQueue();
  }

  /** Preview types from bag — validates UI matches generator order. */
  peekUpcomingTypes(count = this.nextQueueDepth): string[] {
    const fromQueue = this.nextQueue.slice(0, count).map((p) => p.type);
    const need = count - fromQueue.length;
    if (need <= 0) return fromQueue.slice(0, count);
    return [...fromQueue, ...this.pieceGenerator.peekTypes(need)];
  }

  private applyUxSettings(): void {
    if (typeof localStorage === 'undefined') return;
    const settings = loadGameSettings();
    this.nextQueueDepth = settings.nextQueueDepth;
  }

  private refillNextQueue(): void {
    refillNextQueueHost(this as SpawnHoldHost);
  }

  private evaluateModeEnd(): void {
    if (this.isRunEnded) return;
    const outcome = this.mode.shouldEnd(this.buildModeContext());
    if (outcome === 'victory') {
      this.victory = true;
      if (this.view?.onGameOverReactive) {
        this.view.onGameOverReactive();
      }
    }
  }

  notifyModeLineClear(linesCleared: number): void {
    if (linesCleared > 0) {
      this.mode.onLineClear(linesCleared, this.buildModeContext());
      this.evaluateModeEnd();
    }
  }

  notifyModeLock(): void {
    this.mode.onLock(this.buildModeContext());
    this.evaluateModeEnd();
  }

  get score(): number {
    return this.scoringSystem.score;
  }

  get lines(): number {
    return this.scoringSystem.lines;
  }

  get level(): number {
    return this.scoringSystem.level;
  }

  get combo(): number {
    return Math.max(0, this.scoringSystem.combo);
  }

  // Helper for TypedArray access
  getCell(x: number, y: number): number {
      if (x < 0 || x >= this.playfieldWidth || y < 0 || y >= this.playfieldHeight) return 0;
      return this.playfield[y * this.playfieldWidth + x];
  }

  setCell(x: number, y: number, value: number): void {
      if (x < 0 || x >= this.playfieldWidth || y < 0 || y >= this.playfieldHeight) return;
      this.playfield[y * this.playfieldWidth + x] = value;
  }

  // Helper to reset piece position based on its type
  resetPiecePosition(piece: Piece): void {
      this.pieceGenerator.resetPiecePosition(piece);
  }

  createPiece(): Piece {
    return this.pieceGenerator.createPiece();
  }

  getHighScoreManager(): HighScoreManager {
    return this.scoringSystem.getHighScoreManager();
  }

  getModeLeaderboardDisplay(): string {
    return getModeLeaderboard(this.mode).formatBestValue();
  }

  saveHighScore(): boolean {
    return this.saveModeLeaderboard();
  }

  saveModeLeaderboard(): boolean {
    const save = {
      score: this.score,
      lines: this.lines,
      level: this.level,
      elapsedMs: this.modeElapsedMs,
      victory: this.victory,
      gameOver: this.gameOver,
    };

    if (!this.mode.shouldSaveLeaderboard(save)) {
      return false;
    }

    const board = getModeLeaderboard(this.mode);
    const metricValue = this.mode.getLeaderboardValue(save);
    const isNewBest = board.addEntry(metricValue, save.lines, save.level);

    if (this.mode.id === 'marathon') {
      this.scoringSystem.saveHighScore();
    }

    return isNewBest;
  }

  // Set view reference for reactive events
  // ==================== REACTIVE EVENT HOOKS ====================
  triggerLineClearReactive(linesCleared: number, combo: number, isTSpin: boolean, isAllClear: boolean): void {
    this.view?.onLineClearReactive?.(linesCleared, combo, isTSpin, isAllClear);
  }

  triggerLevelUpReactive(newLevel: number): void {
    this.view?.onLevelUpReactive?.(newLevel);
  }

  private triggerTSpinReactive(type: 'normal' | 'mini'): void {
    this.view?.onTSpinReactive?.(type);
  }

  getState(): GameState {
    const playfield2D = buildPlayfieldProjection({
      playfieldWidth: this.playfieldWidth,
      playfieldHeight: this.playfieldHeight,
      getCell: this.boundGetCell,
      isGameOver: this.gameOver,
      activePiece: this.activPiece,
      ghostY: this.gameOver ? this.activPiece.y : this.getGhostY(),
      targetArray: this.projectedPlayfield
    });

    this.gameStateCache.score = this.score;
    this.gameStateCache.level = this.level;
    this.gameStateCache.lines = this.lines;
    this.gameStateCache.nextPiece = this.nextPiece;
    if (this.gameStateCache.nextQueue.length !== this.nextQueue.length) {
      this.gameStateCache.nextQueue.length = this.nextQueue.length;
    }
    for (let i = 0; i < this.nextQueue.length; i++) {
      this.gameStateCache.nextQueue[i] = this.nextQueue[i];
    }
    this.gameStateCache.holdPiece = this.holdPieceObj;
    this.gameStateCache.activePiece = this.activPiece;
    this.gameStateCache.isGameOver = this.gameOver;
    this.gameStateCache.isVictory = this.victory;

    const hud = this.mode.getHud(this.buildModeContext());
    this.gameStateCache.modeId = hud.modeId;
    this.gameStateCache.modeLabel = hud.modeLabel;
    this.gameStateCache.modePrimaryLabel = hud.primaryLabel;
    this.gameStateCache.modePrimaryValue = hud.primaryValue;
    this.gameStateCache.modeSecondaryLabel = hud.secondaryLabel;
    this.gameStateCache.modeSecondaryValue = hud.secondaryValue;
    this.gameStateCache.modeShowSecondary = hud.showSecondary;
    this.gameStateCache.modeShowLevel = hud.showLevel;
    this.gameStateCache.modeShowScore = hud.showScore;
    this.gameStateCache.modeShowHighScore = hud.showHighScore;
    this.gameStateCache.modeHighScoreLabel = hud.highScoreLabel;
    this.gameStateCache.elapsedMs = this.modeElapsedMs;

    this.gameStateCache.playfield = playfield2D;
    this.gameStateCache.lockTimer = this.lockTimer;
    this.gameStateCache.lockDelayTime = this.lockDelayTime;
    this.gameStateCache.effectEvent = this.effectEvent;
    this.gameStateCache.effectCounter = this.effectCounter;
    this.gameStateCache.effectFlag = this.effectEvent === 'hardDrop';
    this.gameStateCache.neonBurstFlag = this.effectEvent === 'hardDrop';
    this.gameStateCache.neonHyperInversionFlag = this.neonHyperInversionFlag;
    this.neonHyperInversionFlag = false; // Reset after sending to view
    this.gameStateCache.lastDropPos = this.lastDropPos;
    this.gameStateCache.lastDropDistance = this.lastDropDistance;
    this.gameStateCache.scoreEvent = this.scoreEvent;
    this.gameStateCache.isTSpinReady = this.isTSpin && this.activPiece?.type === 'T';
    this.gameStateCache.runStats = this.runStats.snapshot(this.modeElapsedMs);

    return this.gameStateCache;
  }

  getGhostY(): number {
    const piece = this.activPiece;
    let count = 0;
    const blocks = piece.blocks;
    for (let r = 0; r < blocks.length; r++) {
      for (let c = 0; c < blocks[r].length; c++) {
        if (blocks[r][c] !== 0) {
          if (count < 4) {
            this.collisionCoordsCache[count].x = c;
            this.collisionCoordsCache[count].y = r;
          }
          count++;
        }
      }
    }

    if (count === 4) {
      const core = WasmCore.get();
      if (core.hasHardDrop) {
        const dist = core.hardDropDistance(piece.x, piece.y, this.collisionCoordsCache, this.wasmBoardId);
        if (dist >= 0) return piece.y + dist;
      }
    }

    return this.collisionDetector.getGhostY(piece);
  }

  hardDrop(): { linesCleared: number[], locked: boolean, gameOver: boolean, tSpin: boolean } {
    this.gameStateCache.effectFlag = true;
    void performHardDrop(this, () => this.clearLine(), this._hardDropResult);
    return this._hardDropResult;
  }

  async hardDropAsync(): Promise<{ linesCleared: number[], locked: boolean, gameOver: boolean, tSpin: boolean }> {
    await performHardDrop(this, () => this.clearLineAsync(), this._hardDropResult);
    return this._hardDropResult;
  }

  applyLineClearScoring(
    linesScore: number[],
    wasTSpin: boolean,
    result: { linesCleared: number[], tSpin: boolean },
  ): void {
    if (linesScore.length > 0) {
        const isAllClear = this.isPlayfieldEmpty();
        this.scoreEvent = this.scoringSystem.updateScore(linesScore.length, wasTSpin, isAllClear);
        result.linesCleared.length = 0;
        for (let i = 0; i < linesScore.length; i++) {
            result.linesCleared.push(linesScore[i]);
        }
        result.tSpin = wasTSpin;
        if (linesScore.length >= 4) {
            this.neonHyperInversionFlag = true;
        }
        this.triggerLineClearReactive(linesScore.length, this.combo, wasTSpin, isAllClear);
        if (wasTSpin) this.triggerTSpinReactive('normal');
        if (isAllClear) this.view?.onPerfectClearReactive?.();
        this.notifyModeLineClear(linesScore.length);
        if (this.scoreEvent) {
          this.runStats.onLineClear(this.scoreEvent.combo, this.scoreEvent.backToBack);
        }
    } else {
        this.scoringSystem.resetCombo();
        this.scoreEvent = null;
    }
  }

  reset(options?: { seed?: number }): void {
    if (options?.seed !== undefined) {
      this.pieceGenerator.setSeed(options.seed);
    }
    this.scoringSystem.reset();
    this.gameOver = false;
    this.victory = false;
    this.modeElapsedMs = 0;
    this.runStats.reset();
    this.applyUxSettings();
    this.mode.onReset(this);
    this.playfield.fill(0);
    this.collisionDetector.updatePlayfield(this.playfield);
    this.mode.onBoardReady?.(this);
    this.holdPieceObj = null;
    this.canHold = true;
    this.lockTimer = 0;
    this.isTSpin = false;

    this.nextQueue.length = 0;
    this.activPiece = this.createPiece();
    this.refillNextQueue();
  }

  getReplaySeed(): number | null {
    return this.pieceGenerator.getSeed();
  }

  getHardDropSnapshot(): { blocks: number[][]; x: number } | null {
    return this.hardDropSnapshot;
  }

  // Called every frame (CPU line detection — used by unit tests)
  update(dt: number): { linesCleared: number[], locked: boolean, gameOver: boolean, tSpin: boolean } {
      resetLockDelayResult(this._updateResult);
      if (this.isRunEnded) return this._updateResult;
      tickLockDelaySync(this as LockDelayHost, dt, () => this.clearLine(), this._updateResult);
      return this._updateResult;
  }

  /** Game loop entry — GPU line detection when the view pipeline is ready. */
  async updateAsync(dt: number): Promise<{ linesCleared: number[], locked: boolean, gameOver: boolean, tSpin: boolean }> {
      resetLockDelayResult(this._updateResult);
      if (this.isRunEnded) return this._updateResult;
      await tickLockDelay(
        this as LockDelayHost,
        dt,
        () => this.clearLineAsync(),
        this._updateResult,
      );
      return this._updateResult;
  }

  movePieceLeft(): void {
    this.activPiece.x -= 1;
    if (this.hasCollision()) {
      this.activPiece.x += 1;
    } else {
        this.isTSpin = false; // Reset T-Spin on move
        this.handleMoveReset();
    }
  }

  movePieceRight(): void {
    this.activPiece.x += 1;
    if (this.hasCollision()) {
      this.activPiece.x -= 1;
    } else {
        this.isTSpin = false; // Reset T-Spin on move
        this.handleMoveReset();
    }
  }

  movePieceDown(): void {
    this.activPiece.y += 1;
    if (this.hasCollision()) {
      this.activPiece.y -= 1;
    } else {
        this.isTSpin = false; // Reset T-Spin on move
        this.lockTimer = 0;
    }
  }

  dropPiece(): void {
    const ghostY = this.getGhostY();
    const moved = this.activPiece.y !== ghostY;
    this.activPiece.y = ghostY;
    if (moved) this.isTSpin = false;

    this.lockPiece();
    const linesScore = this.clearLine();
    if (linesScore.length > 0) {
      // Correctly pass tSpin status captured before lock
      const isAllClear = this.isPlayfieldEmpty();
      this.scoreEvent = this.scoringSystem.updateScore(linesScore.length, this.isTSpin, isAllClear);
    } else {
      this.scoringSystem.resetCombo();
      this.scoreEvent = null;
    }
    this.updatePieces();
  }

  isPlayfieldEmpty(): boolean {
      return isPlayfieldEmpty(this.playfield);
  }

  checkTSpin(): void {
      this.isTSpin = evaluateTSpin(
        this.activPiece,
        this.boundGetCell,
        this.playfieldWidth,
        this.playfieldHeight,
        this._tSpinCorners,
      );
  }

  rotatePiece(rightRurn: boolean = true): void {
    const blocks = this.activPiece.blocks;
    const type = this.activPiece.type;
    const currentRotation = this.activPiece.rotation;
    let nextRotation = rightRurn ? (currentRotation + 1) % 4 : (currentRotation + 3) % 4;

    if (type === 'O') return;

    // Use temp piece for testing rotation to avoid mutation
    // Replace Object.assign with explicit assignments to avoid GC overhead
    this._tempPiece.x = this.activPiece.x;
    this._tempPiece.y = this.activPiece.y;
    this._tempPiece.type = this.activPiece.type;
    // getBounds isn't strictly needed for the temp piece if hasCollisionPiece uses fallback
    // or WASM uses exact blocks array. We copy the exact blocks anyway.
    this._tempPiece.blocks = rotatePieceBlocks(blocks, rightRurn, this._tempBlocks);
    this._tempPiece.rotation = nextRotation;

    if (!this.hasCollisionPiece(this._tempPiece)) {
      // Create a copy of the blocks array for the active piece, because _tempBlocks will be overwritten in the next rotation

      // Create a copy of the blocks array for the active piece, because _tempBlocks will be overwritten in the next rotation
      for (let i = 0; i < this._tempPiece.blocks.length; i++) {
        if (!this.activPiece.blocks[i] || this.activPiece.blocks[i].length !== this._tempPiece.blocks[i].length) {
            if (!this.activPiece.blocks[i]) this.activPiece.blocks[i] = [];
            this.activPiece.blocks[i].length = this._tempPiece.blocks[i].length;
        }
        for (let j = 0; j < this._tempPiece.blocks[i].length; j++) {
            this.activPiece.blocks[i][j] = this._tempPiece.blocks[i][j];
        }
      }
      // Trim excess rows if any (should not happen for tetrominoes)
      if (this.activPiece.blocks.length > this._tempPiece.blocks.length) {
          this.activPiece.blocks.length = this._tempPiece.blocks.length;
      }

      this.activPiece.rotation = this._tempPiece.rotation;
      this.handleMoveReset();
      this.checkTSpin(); // Check T-Spin after rotation
      // Trigger T-Spin reactive if detected
      if (this.isTSpin && this.activPiece.type === 'T') {
        this.triggerTSpinReactive('normal');
      }
      return;
    }

    // Wall Kicks
    const kicks = getWallKicks(type, currentRotation, nextRotation);
    if (!kicks || kicks.length === 0) return;

    for (const [ox, oy] of kicks) {
        this._tempPiece.x = this.activPiece.x + ox;
        this._tempPiece.y = this.activPiece.y + oy;

        if (!this.hasCollisionPiece(this._tempPiece)) {
            // Apply successful kick
            this.activPiece.x = this._tempPiece.x;
            this.activPiece.y = this._tempPiece.y;
            // Create a copy of the blocks array for the active piece, because _tempBlocks will be overwritten in the next rotation

      // Create a copy of the blocks array for the active piece, because _tempBlocks will be overwritten in the next rotation
      for (let i = 0; i < this._tempPiece.blocks.length; i++) {
        if (!this.activPiece.blocks[i] || this.activPiece.blocks[i].length !== this._tempPiece.blocks[i].length) {
            if (!this.activPiece.blocks[i]) this.activPiece.blocks[i] = [];
            this.activPiece.blocks[i].length = this._tempPiece.blocks[i].length;
        }
        for (let j = 0; j < this._tempPiece.blocks[i].length; j++) {
            this.activPiece.blocks[i][j] = this._tempPiece.blocks[i][j];
        }
      }
      // Trim excess rows if any (should not happen for tetrominoes)
      if (this.activPiece.blocks.length > this._tempPiece.blocks.length) {
          this.activPiece.blocks.length = this._tempPiece.blocks.length;
      }

            this.activPiece.rotation = this._tempPiece.rotation;
            this.handleMoveReset();
            this.checkTSpin(); // Check T-Spin after kick
            // Trigger T-Spin reactive if detected
            if (this.isTSpin && this.activPiece.type === 'T') {
              this.triggerTSpinReactive('normal');
            }
            return;
        }
    }
  }

  handleMoveReset(): void {
      applyMoveReset(this as LockDelayHost);
  }

  hasCollision(): boolean {
    return this.hasCollisionPiece(this.activPiece);
  }

  hasCollisionPiece(piece: Piece): boolean {
    if (!this.useWasmCollision) {
      return this.collisionDetector.hasCollision(piece);
    }
    // --- WASM ACCELERATION ---
    let count = 0;
    
    const blocks = piece.blocks;
    for (let r = 0; r < blocks.length; r++) {
        for (let c = 0; c < blocks[r].length; c++) {
            if (blocks[r][c] !== 0) {
                if (count < 4) {
                    this.collisionCoordsCache[count].x = c;
                    this.collisionCoordsCache[count].y = r;
                }
                count++;
            }
        }
    }
    
    // Only use WASM for standard tetrominoes (4 blocks)
    if (count === 4) {
        try {
            return WasmCore.get().checkCollision(this.collisionCoordsCache, piece.x, piece.y, this.wasmBoardId);
        } catch (_e) {
            // WASM not available or failed, fallback to JS
            return this.collisionDetector.hasCollision(piece);
        }
    }
    
    // Fallback for non-standard pieces
    return this.collisionDetector.hasCollision(piece);
  }

  lockPiece(): void {
    const { y: pieceY, x: pieceX, blocks } = this.activPiece;

    for (let y = 0; y < blocks.length; y++) {
      for (let x = 0; x < blocks[y].length; x++) {
        if (blocks[y][x]) {
            if (pieceY + y < 0) {
                if (this.practiceTopOutRecovery) {
                    continue;
                }
                this.gameOver = true;
                return;
            }
            this.setCell(pieceX + x, pieceY + y, blocks[y][x]);
        }
      }
    }
  }

  updatePieces(): void {
    spawnNextPiece(this as SpawnHoldHost);
  }

  clearLine(): number[] {
    const linesCleared = WasmCore.get().clearFullLines(
      this.playfield,
      this.playfieldWidth,
      this.playfieldHeight,
      this.boundGetCell,
      this._linesClearedCache
    );
    if (linesCleared.length > 0) {
      this.collisionDetector.updatePlayfield(this.playfield);
    }
    return linesCleared;
  }

  /** GPU line detection + CPU compaction (falls back to clearLine when GPU unavailable). */
  async clearLineAsync(): Promise<number[]> {
    if (this.view?.gpuLineClearReady && this.view.detectLinesGpu && this.useWasmCollision) {
      const lines = await this.view.detectLinesGpu(this.playfield);
      if (lines.length > 0) {
        compactClearedRows(
          this.playfield,
          this.playfieldWidth,
          this.playfieldHeight,
          lines,
          this._linesClearedCache,
        );
        this.collisionDetector.updatePlayfield(this.playfield);
        this.view?.syncBoardToGPU?.(this.playfield);
      }
      return lines;
    }
    return this.clearLine();
  }

  /** Queue garbage rows from opponent (applied before next piece spawns). */
  queueGarbage(rows: number): void {
    if (rows > 0) this.pendingGarbageRows += rows;
  }

  setGarbageRngFactory(factory: () => () => number): void {
    this.garbageRngFactory = factory;
  }

  applyPendingGarbage(): void {
    const rng = this.garbageRngFactory ? this.garbageRngFactory() : Math.random;
    this.applyPendingGarbageWithRng(rng);
  }

  applyPendingGarbageWithRng(rng: () => number): void {
    if (this.pendingGarbageRows <= 0 || this.gameOver) return;
    const rows = this.pendingGarbageRows;
    this.pendingGarbageRows = 0;
    const overflow = injectGarbageRows(
      this.playfield,
      this.playfieldWidth,
      this.playfieldHeight,
      rows,
      rng,
    );
    this.collisionDetector.updatePlayfield(this.playfield);
    if (overflow) {
      this.gameOver = true;
      this.view?.onGameOverReactive?.();
    }
  }

  hold(): void {
      applyHold(this as SpawnHoldHost);
  }
}
