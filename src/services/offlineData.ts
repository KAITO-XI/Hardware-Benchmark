import type { BenchmarkConfig, CpuItem, GpuItem, LadderRow } from '../types/hardware';

type OfflineDatasetRaw = {
  cpus: CpuItem[];
  gpus: GpuItem[];
  meta?: {
    updatedAt?: string;
    sources?: Array<{
      id: string;
      type: string;
      url: string;
    }>;
  };
  defaults?: {
    cpuSingleBaseId?: string;
    cpuMultiBaseId?: string;
    gpuBaseId?: string;
  };
};

export type OfflineDataset = {
  cpus: CpuItem[];
  gpus: GpuItem[];
  meta: {
    updatedAt?: string;
    sources: Array<{
      id: string;
      type: string;
      url: string;
    }>;
  };
  cpuSingleLadder: LadderRow[];
  cpuMultiLadder: LadderRow[];
  gpuLadder: LadderRow[];
  defaultConfig: BenchmarkConfig;
};

const DEFAULT_WEIGHTS: BenchmarkConfig['weights'] = {
  cpuSingle: 0.5,
  cpuMulti: 0.5,
  gpu: 0,
};

function sortDesc<T>(items: T[], getValue: (item: T) => number): T[] {
  return [...items].sort((left, right) => getValue(right) - getValue(left));
}

function buildCpuLadderRows(cpus: CpuItem[], scoreKey: 'singleThreadMark' | 'cpuMark', baseScore: number): LadderRow[] {
  return sortDesc(cpus, (cpu) => cpu[scoreKey]).map((cpu, index) => ({
    id: cpu.id,
    model: cpu.model,
    rawScore: cpu[scoreKey],
    rank: index + 1,
    benchmarkScore: Math.round((cpu[scoreKey] / baseScore) * 100),
  }));
}

function buildGpuLadderRows(gpus: GpuItem[], baseScore: number): LadderRow[] {
  return sortDesc(gpus, (gpu) => gpu.g3dMark).map((gpu, index) => ({
    id: gpu.id,
    model: gpu.model,
    rawScore: gpu.g3dMark,
    rank: index + 1,
    benchmarkScore: Math.round((gpu.g3dMark / baseScore) * 100),
  }));
}

function pickValidBaseId<T extends { id: string }>(
  list: T[],
  preferredId: string | undefined,
  fallbackId: string | undefined,
): string {
  if (preferredId && list.some((item) => item.id === preferredId)) {
    return preferredId;
  }

  if (fallbackId && list.some((item) => item.id === fallbackId)) {
    return fallbackId;
  }

  return list[0]?.id ?? '';
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findByModelHints<T extends { model: string }>(items: T[], hints: string[]): T | undefined {
  for (const hint of hints) {
    const normalizedHint = normalizeText(hint);
    const found = items.find((item) => normalizeText(item.model).includes(normalizedHint));
    if (found) {
      return found;
    }
  }
  return undefined;
}

function pickClosestCpuByScore(cpus: CpuItem[], scoreKey: 'singleThreadMark' | 'cpuMark', target: number): CpuItem {
  return cpus.reduce((best, cpu) => {
    const bestGap = Math.abs(best[scoreKey] - target);
    const gap = Math.abs(cpu[scoreKey] - target);
    return gap < bestGap ? cpu : best;
  }, cpus[0]);
}

function pickClosestGpuByScore(gpus: GpuItem[], target: number): GpuItem {
  return gpus.reduce((best, gpu) => {
    const bestGap = Math.abs(best.g3dMark - target);
    const gap = Math.abs(gpu.g3dMark - target);
    return gap < bestGap ? gpu : best;
  }, gpus[0]);
}

export async function loadOfflineDataset(): Promise<OfflineDataset> {
  const response = await fetch('/data/hardware-data.json');
  if (!response.ok) {
    throw new Error(`离线数据加载失败: ${response.status}`);
  }

  const raw = (await response.json()) as OfflineDatasetRaw;
  const cpus = raw.cpus ?? [];
  const gpus = raw.gpus ?? [];

  if (cpus.length === 0 || gpus.length === 0) {
    throw new Error('离线数据为空：请检查 JSON 内容');
  }

  const cpuSingleFallback =
    findByModelHints(cpus, ['Core i7-10700']) ?? pickClosestCpuByScore(cpus, 'singleThreadMark', 2881);
  const cpuMultiFallback =
    findByModelHints(cpus, ['Core i7-10700']) ?? pickClosestCpuByScore(cpus, 'cpuMark', 16015);
  const gpuFallback =
    findByModelHints(gpus, ['GeForce GTX 1060', 'GTX 1060']) ?? pickClosestGpuByScore(gpus, 10046);

  const cpuSingleBaseId = pickValidBaseId(cpus, raw.defaults?.cpuSingleBaseId, cpuSingleFallback.id);
  const cpuMultiBaseId = pickValidBaseId(cpus, raw.defaults?.cpuMultiBaseId, cpuMultiFallback.id);
  const gpuBaseId = pickValidBaseId(gpus, raw.defaults?.gpuBaseId, gpuFallback.id);

  const cpuSingleBase = cpus.find((cpu) => cpu.id === cpuSingleBaseId)?.singleThreadMark ?? cpus[0].singleThreadMark;
  const cpuMultiBase = cpus.find((cpu) => cpu.id === cpuMultiBaseId)?.cpuMark ?? cpus[0].cpuMark;
  const gpuBase = gpus.find((gpu) => gpu.id === gpuBaseId)?.g3dMark ?? gpus[0].g3dMark;

  return {
    cpus,
    gpus,
    meta: {
      updatedAt: raw.meta?.updatedAt,
      sources: raw.meta?.sources ?? [],
    },
    cpuSingleLadder: buildCpuLadderRows(cpus, 'singleThreadMark', cpuSingleBase),
    cpuMultiLadder: buildCpuLadderRows(cpus, 'cpuMark', cpuMultiBase),
    gpuLadder: buildGpuLadderRows(gpus, gpuBase),
    defaultConfig: {
      cpuSingleBaseId,
      cpuMultiBaseId,
      gpuBaseId,
      weights: DEFAULT_WEIGHTS,
    },
  };
}
