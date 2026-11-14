/**
 * GPU chores — post/juice compute helpers that ride the active renderer's
 * device. See `docs/gpu-chores.md` for the rollout contract.
 */

export {
  GpuChoreRunner,
  DEFAULT_SCAN_INTERVAL_FRAMES,
  DEFAULT_SCAN_MAX_EDGE,
  type ChoreStatus,
  type GpuChoreRunnerOptions,
} from './runner.js';
export {
  AutoBloomController,
  baselineBloomThreshold,
  STATIC_BLOOM_THRESHOLD,
  type AutoBloomOutput,
} from './autoBloom.js';
export {
  resolveChorePolicy,
  isGpuComputeKilled,
  readKillSwitchStorage,
  CHORE_BACKEND_ORDER,
  NO_GPU_COMPUTE_STORAGE_KEY,
  type ChoreBackend,
  type ChorePolicy,
  type ChorePolicyInput,
} from './policy.js';
export {
  bloomParamsFromStats,
  cpuLumaHistogram,
  flashHeadroom,
  histogramToStats,
  smoothBloomThreshold,
  binLuma,
  lumaBin,
  EMPTY_LUMA_STATS,
  LUMA_HISTOGRAM_BINS,
  LUMA_HISTOGRAM_MAX,
  LUMA_WEIGHTS,
  type BloomAutoOptions,
  type BloomAutoParams,
  type LumaStats,
} from './lumaStats.js';
export {
  buildSpawnFlags,
  cellToRowCol,
  compactIndicesCpu,
  spawnLookup,
  spawnStride,
  BOARD_CELLS,
  BOARD_COLS,
  BOARD_ROWS,
  type SpawnFlagOptions,
} from './compact.js';
export {
  activeGpuDevice,
  activeGpuDeviceOwner,
  gpuDeviceRegistrationCount,
  registerGpuDevice,
  releaseGpuDevice,
  resetGpuDeviceRegistry,
  type DeviceOwner,
} from './deviceRegistry.js';
export {
  clearChoreBreadcrumbs,
  exposeChoreDebugHandle,
  getChoreBreadcrumbs,
  lastChoreBreadcrumb,
  recordChoreBreadcrumb,
  type ChoreBreadcrumb,
} from './breadcrumbs.js';
export {
  CompactIndicesShader,
  Downsample2dShader,
  LumaHistogramShader,
  CHORE_WORKGROUP_1D,
  CHORE_WORKGROUP_2D,
} from './shaders.js';
