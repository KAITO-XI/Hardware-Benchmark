import { getScopedPrimaryScore } from '../services/benchmark';
import type { BenchmarkConfig, CompareScope, FilledDevice } from '../types/hardware';

type CompareTableProps = {
  devices: FilledDevice[];
  scope: CompareScope;
  config: BenchmarkConfig;
};

function renderMetric(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : '--';
}

function renderCpuClock(base: number | undefined, boost: number | undefined): string {
  if (!base || !boost) {
    return '--';
  }

  return `${base.toFixed(1)} / ${boost.toFixed(1)} GHz`;
}

function renderGpuClock(boost: number | undefined): string {
  return boost ? `${boost} MHz` : '--';
}

function renderCpuThreads(cores: number | undefined, threads: number | undefined): string {
  if (!cores || !threads || cores <= 0 || threads <= 0) {
    return '--';
  }
  return `${cores}C / ${threads}T`;
}

export function CompareTable({ devices, scope, config }: CompareTableProps) {
  const showCpu = scope === 'cpu';
  const showGpu = scope === 'gpu';

  return (
    <div className="panel">
      <div className="panel-title">对比表格</div>
      <div className="table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th>指标</th>
              {devices.map((device) => (
                <th key={device.id}>{scope === 'cpu' ? device.cpu?.model ?? '--' : device.gpu?.model ?? '--'}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {showCpu ? (
              <tr>
                <td>CPU</td>
                {devices.map((device) => (
                  <td key={`${device.id}-cpu`}>{device.cpu?.model ?? '--'}</td>
                ))}
              </tr>
            ) : null}
            {showGpu ? (
              <tr>
                <td>GPU</td>
                {devices.map((device) => (
                  <td key={`${device.id}-gpu`}>{device.gpu?.model ?? '--'}</td>
                ))}
              </tr>
            ) : null}
            {showCpu ? (
              <tr>
                <td>CPU 汇总</td>
                {devices.map((device) => (
                  <td key={`${device.id}-cpu-primary`}>{renderMetric(getScopedPrimaryScore(device, scope, config))}</td>
                ))}
              </tr>
            ) : null}
            {showCpu ? (
              <tr>
                <td>CPU 单核</td>
                {devices.map((device) => (
                  <td key={`${device.id}-single`}>{renderMetric(device.cpuSingleBenchmark)}</td>
                ))}
              </tr>
            ) : null}
            {showCpu ? (
              <tr>
                <td>CPU 多核</td>
                {devices.map((device) => (
                  <td key={`${device.id}-multi`}>{renderMetric(device.cpuMultiBenchmark)}</td>
                ))}
              </tr>
            ) : null}
            {showGpu ? (
              <tr>
                <td>原始多核</td>
                {devices.map((device) => (
                  <td key={`${device.id}-cpu-raw`}>{device.cpu?.cpuMark ?? '--'}</td>
                ))}
              </tr>
            ) : null}
            {showCpu ? (
              <tr>
                <td>核心 / 线程</td>
                {devices.map((device) => (
                  <td key={`${device.id}-threads`}>{renderCpuThreads(device.cpu?.cores, device.cpu?.threads)}</td>
                ))}
              </tr>
            ) : null}
            {showCpu ? (
              <tr>
                <td>主频 / 加速</td>
                {devices.map((device) => (
                  <td key={`${device.id}-clock`}>
                    {renderCpuClock(device.cpu?.baseClockGHz, device.cpu?.boostClockGHz)}
                  </td>
                ))}
              </tr>
            ) : null}
            {showCpu ? (
              <tr>
                <td>L3 缓存</td>
                {devices.map((device) => (
                  <td key={`${device.id}-cache`}>{device.cpu?.l3CacheMB ? `${device.cpu.l3CacheMB} MB` : '--'}</td>
                ))}
              </tr>
            ) : null}
            {showCpu ? (
              <tr>
                <td>TDP</td>
                {devices.map((device) => (
                  <td key={`${device.id}-cpu-tdp`}>{device.cpu?.tdpW ? `${device.cpu.tdpW} W` : '--'}</td>
                ))}
              </tr>
            ) : null}
            {showGpu ? (
              <tr>
                <td>GPU</td>
                {devices.map((device) => (
                  <td key={`${device.id}-gpu`}>{device.gpu?.model ?? '--'}</td>
                ))}
              </tr>
            ) : null}
            {showGpu ? (
              <tr>
                <td>GPU 汇总</td>
                {devices.map((device) => (
                  <td key={`${device.id}-gpu-primary`}>{renderMetric(getScopedPrimaryScore(device, scope, config))}</td>
                ))}
              </tr>
            ) : null}
            {showGpu ? (
              <tr>
                <td>原始 G3D</td>
                {devices.map((device) => (
                  <td key={`${device.id}-g3d-raw`}>{device.gpu?.g3dMark ?? '--'}</td>
                ))}
              </tr>
            ) : null}
            {showGpu ? (
              <tr>
                <td>显存</td>
                {devices.map((device) => (
                  <td key={`${device.id}-vram`}>{device.gpu?.vramGB ? `${device.gpu.vramGB} GB` : '--'}</td>
                ))}
              </tr>
            ) : null}
            {showGpu ? (
              <tr>
                <td>加速频率</td>
                {devices.map((device) => (
                  <td key={`${device.id}-gpu-clock`}>{renderGpuClock(device.gpu?.boostClockMHz)}</td>
                ))}
              </tr>
            ) : null}
            {showGpu ? (
              <tr>
                <td>显存位宽</td>
                {devices.map((device) => (
                  <td key={`${device.id}-gpu-bus`}>
                    {device.gpu?.memoryBusBit ? `${device.gpu.memoryBusBit} bit` : '--'}
                  </td>
                ))}
              </tr>
            ) : null}
            {showGpu ? (
              <tr>
                <td>显存带宽</td>
                {devices.map((device) => (
                  <td key={`${device.id}-gpu-bandwidth`}>
                    {device.gpu?.memoryBandwidthGBs ? `${device.gpu.memoryBandwidthGBs} GB/s` : '--'}
                  </td>
                ))}
              </tr>
            ) : null}
            {showGpu ? (
              <tr>
                <td>TDP</td>
                {devices.map((device) => (
                  <td key={`${device.id}-gpu-tdp`}>{device.gpu?.tdpW ? `${device.gpu.tdpW} W` : '--'}</td>
                ))}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
