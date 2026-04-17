export type CpuItem = {
  id: string;
  vendor: string;
  model: string;
  aliases: string[];
  singleThreadMark: number;
  cpuMark: number;
  category: string[];
  cores: number;
  threads: number;
  baseClockGHz: number;
  boostClockGHz: number;
  l3CacheMB: number;
  tdpW: number;
};

export type GpuItem = {
  id: string;
  vendor: string;
  model: string;
  aliases: string[];
  g3dMark: number;
  category: string[];
  vramGB: number;
  boostClockMHz: number;
  memoryBusBit: number;
  memoryBandwidthGBs: number;
  tdpW: number;
};

export type DeviceSlot = {
  id: string;
  label: string;
  cpuId?: string;
  gpuId?: string;
};

export type BenchmarkWeights = {
  cpuSingle: number;
  cpuMulti: number;
  gpu: number;
};

export type BenchmarkConfig = {
  cpuSingleBaseId: string;
  cpuMultiBaseId: string;
  gpuBaseId: string;
  weights: BenchmarkWeights;
};

export type ScoreMode = 'raw' | 'benchmark';

export type PageView = 'search' | 'cpu-ladder' | 'gpu-ladder';

export type CompareScope = 'cpu' | 'gpu';

export type LadderRow = {
  id: string;
  rank: number;
  model: string;
  rawScore: number;
  benchmarkScore: number;
};

export type CompareMetrics = {
  cpuSingleBenchmark?: number;
  cpuMultiBenchmark?: number;
  gpuBenchmark?: number;
  overallBenchmark?: number;
};

export type FilledDevice = DeviceSlot &
  CompareMetrics & {
    cpu?: CpuItem;
    gpu?: GpuItem;
  };

export type ActiveField =
  | {
      slotId: string;
      kind: 'cpu' | 'gpu';
    }
  | undefined;
