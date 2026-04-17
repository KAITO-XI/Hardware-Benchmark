import { getMetricMax, getPrimaryScoreMax, getScopedPrimaryScore } from '../services/benchmark';
import type { BenchmarkConfig, CompareMetrics, CompareScope, FilledDevice } from '../types/hardware';

type MetricConfig = {
  key: keyof CompareMetrics;
  label: string;
};

const METRICS: MetricConfig[] = [
  { key: 'cpuSingleBenchmark', label: 'CPU 单核' },
  { key: 'cpuMultiBenchmark', label: 'CPU 多核' },
  { key: 'gpuBenchmark', label: 'GPU' },
];

type ScoreChartGroupProps = {
  devices: FilledDevice[];
  scope: CompareScope;
  config: BenchmarkConfig;
  baselineInfo: string;
};

function getChartLabel(device: FilledDevice, scope: CompareScope): string {
  if (scope === 'cpu') {
    return device.cpu?.model ?? '--';
  }

  return device.gpu?.model ?? '--';
}

export function ScoreChartGroup({ devices, scope, config, baselineInfo }: ScoreChartGroupProps) {
  const metrics = METRICS.filter((metric) =>
    scope === 'cpu' ? metric.key !== 'gpuBenchmark' : metric.key === 'gpuBenchmark',
  );

  return (
    <div className="panel">
      <div className="panel-title">对比图表</div>
      <div className="chart-baseline-info">{baselineInfo}</div>
      <div className="chart-grid">
        {metrics.map((metric) => {
          const max = getMetricMax(devices, metric.key);

          return (
            <div className="mini-chart" key={metric.key}>
              <div className="mini-chart-title">{metric.label}</div>
              <div className="bar-list">
                {devices.map((device, index) => {
                  const value = device[metric.key];
                  const width = typeof value === 'number' ? `${(value / max) * 100}%` : '0%';

                  return (
                    <div className="bar-row" key={`${device.id}-${metric.key}`}>
                      <div className="bar-label">{getChartLabel(device, scope)}</div>
                      <div className="bar-track">
                        <div className={`bar-fill bar-color-${index + 1}`} style={{ width }} />
                      </div>
                      <div className="bar-value">{typeof value === 'number' ? value : '--'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="mini-chart">
          <div className="mini-chart-title">{scope === 'cpu' ? 'CPU 汇总' : 'GPU 汇总'}</div>
          <div className="bar-list">
            {devices.map((device, index) => {
              const value = getScopedPrimaryScore(device, scope, config);
              const max = getPrimaryScoreMax(devices, scope, config);
              const width = typeof value === 'number' ? `${(value / max) * 100}%` : '0%';

              return (
                <div className="bar-row" key={`${device.id}-primary`}>
                  <div className="bar-label">{getChartLabel(device, scope)}</div>
                  <div className="bar-track">
                    <div className={`bar-fill bar-color-${index + 1}`} style={{ width }} />
                  </div>
                  <div className="bar-value">{typeof value === 'number' ? value : '--'}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
