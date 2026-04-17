import type {
  BenchmarkConfig,
  CompareScope,
  CompareMetrics,
  CpuItem,
  DeviceSlot,
  FilledDevice,
  GpuItem,
} from '../types/hardware';

function getRatio(value: number | undefined, base: number | undefined): number | undefined {
  if (!value || !base) {
    return undefined;
  }

  return Math.round((value / base) * 100);
}

export function buildFilledDevices(
  slots: DeviceSlot[],
  cpus: CpuItem[],
  gpus: GpuItem[],
  config: BenchmarkConfig,
): FilledDevice[] {
  const cpuMap = new Map(cpus.map((cpu) => [cpu.id, cpu]));
  const gpuMap = new Map(gpus.map((gpu) => [gpu.id, gpu]));

  const cpuSingleBase = cpuMap.get(config.cpuSingleBaseId)?.singleThreadMark;
  const cpuMultiBase = cpuMap.get(config.cpuMultiBaseId)?.cpuMark;
  const gpuBase = gpuMap.get(config.gpuBaseId)?.g3dMark;

  return slots.map((slot) => {
    const cpu = slot.cpuId ? cpuMap.get(slot.cpuId) : undefined;
    const gpu = slot.gpuId ? gpuMap.get(slot.gpuId) : undefined;

    const cpuSingleBenchmark = getRatio(cpu?.singleThreadMark, cpuSingleBase);
    const cpuMultiBenchmark = getRatio(cpu?.cpuMark, cpuMultiBase);
    const gpuBenchmark = getRatio(gpu?.g3dMark, gpuBase);

    const overallBenchmark =
      cpuSingleBenchmark && cpuMultiBenchmark && gpuBenchmark
        ? Math.round(
            cpuSingleBenchmark * config.weights.cpuSingle +
              cpuMultiBenchmark * config.weights.cpuMulti +
              gpuBenchmark * config.weights.gpu,
          )
        : undefined;

    return {
      ...slot,
      cpu,
      gpu,
      cpuSingleBenchmark,
      cpuMultiBenchmark,
      gpuBenchmark,
      overallBenchmark,
    };
  });
}

export function getSingleCpuBenchmarks(cpu: CpuItem | undefined, config: BenchmarkConfig, cpus: CpuItem[]) {
  const cpuMap = new Map(cpus.map((item) => [item.id, item]));
  const cpuSingleBase = cpuMap.get(config.cpuSingleBaseId)?.singleThreadMark;
  const cpuMultiBase = cpuMap.get(config.cpuMultiBaseId)?.cpuMark;

  return {
    cpuSingleBenchmark: getRatio(cpu?.singleThreadMark, cpuSingleBase),
    cpuMultiBenchmark: getRatio(cpu?.cpuMark, cpuMultiBase),
  };
}

export function getSingleGpuBenchmark(gpu: GpuItem | undefined, config: BenchmarkConfig, gpus: GpuItem[]) {
  const gpuMap = new Map(gpus.map((item) => [item.id, item]));
  const gpuBase = gpuMap.get(config.gpuBaseId)?.g3dMark;

  return {
    gpuBenchmark: getRatio(gpu?.g3dMark, gpuBase),
  };
}

export function getScopedPrimaryScore(device: FilledDevice, scope: CompareScope, config: BenchmarkConfig) {
  if (scope === 'gpu') {
    return device.gpuBenchmark;
  }

  if (!device.cpuSingleBenchmark || !device.cpuMultiBenchmark) {
    return undefined;
  }

  const cpuWeightSum = config.weights.cpuSingle + config.weights.cpuMulti;
  if (!cpuWeightSum) {
    return undefined;
  }

  return Math.round(
    (device.cpuSingleBenchmark * config.weights.cpuSingle +
      device.cpuMultiBenchmark * config.weights.cpuMulti) /
      cpuWeightSum,
  );
}

export function formatDelta(value: number | undefined, bestValue: number | undefined): string {
  if (!value || !bestValue) {
    return '待补全';
  }

  if (value >= bestValue) {
    return '当前领先';
  }

  const percent = Math.round(((bestValue - value) / bestValue) * 100);
  return `落后 ${percent}%`;
}

export function getMetricMax(devices: FilledDevice[], key: keyof CompareMetrics): number {
  return Math.max(
    ...devices.map((device) => {
      const value = device[key];
      return typeof value === 'number' ? value : 0;
    }),
    1,
  );
}

export function getPrimaryScoreMax(
  devices: FilledDevice[],
  scope: CompareScope,
  config: BenchmarkConfig,
): number {
  return Math.max(...devices.map((device) => getScopedPrimaryScore(device, scope, config) ?? 0), 1);
}
