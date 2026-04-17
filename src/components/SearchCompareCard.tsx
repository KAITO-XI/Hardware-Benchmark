import { useState } from 'react';
import { getScopedPrimaryScore, getSingleCpuBenchmarks, getSingleGpuBenchmark } from '../services/benchmark';
import { searchByKeyword } from '../services/matcher';
import { CompareTable } from './CompareTable';
import { ScoreChartGroup } from './ScoreChart';
import type { BenchmarkConfig, CompareScope, CpuItem, FilledDevice, GpuItem } from '../types/hardware';

type SearchCompareCardProps = {
  devices: FilledDevice[];
  cpus: CpuItem[];
  gpus: GpuItem[];
  config: BenchmarkConfig;
  compareScope: CompareScope;
  onConfigChange: (config: BenchmarkConfig) => void;
  onRemoveSlot: (slotId: string) => void;
  onAddHardwareToCompare: (kind: 'cpu' | 'gpu', hardwareId: string) => void;
};

function formatValue(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : '--';
}

function getBaselineSuggestions<T extends { id: string; model: string; aliases: string[] }>(
  items: T[],
  query: string,
  selectedId: string,
  fallbackItems: T[],
): T[] {
  const selected = items.find((item) => item.id === selectedId);
  const keyword = query.trim();

  if (keyword) {
    const searched = searchByKeyword(items, keyword, 12);
    if (!selected || searched.some((item) => item.id === selected.id)) {
      return searched;
    }
    return [selected, ...searched].slice(0, 12);
  }

  const seeded = [...fallbackItems];
  if (selected && !seeded.some((item) => item.id === selected.id)) {
    seeded.unshift(selected);
  }
  return seeded.slice(0, 10);
}

function isConsumerCpuModel(model: string): boolean {
  const text = model.toLowerCase();
  if (/xeon|epyc|opteron|threadripper\s*pro|itanium|embedded/.test(text)) {
    return false;
  }
  return /core\s+i[3579]|ryzen|athlon|pentium|celeron|apple\s+m|snapdragon|ultra/.test(text);
}

function isConsumerGpuModel(model: string): boolean {
  const text = model.toLowerCase();
  if (/tesla|quadro|firepro|radeon\s+pro|pro\s+wx|workstation/.test(text)) {
    return false;
  }
  return /rtx|gtx|rx\s|radeon\s+rx|arc|uhd|iris|hd\s+graphics|vega/.test(text);
}

function getCommonCpuSuggestions(cpus: CpuItem[], limit: number): CpuItem[] {
  const pool = cpus.filter((cpu) => isConsumerCpuModel(cpu.model));
  const sorted = [...pool].sort((left, right) => {
    const leftGap = Math.abs(left.cpuMark - 26000);
    const rightGap = Math.abs(right.cpuMark - 26000);
    return leftGap - rightGap;
  });
  return sorted.slice(0, limit);
}

function getCommonGpuSuggestions(gpus: GpuItem[], limit: number): GpuItem[] {
  const pool = gpus.filter((gpu) => isConsumerGpuModel(gpu.model));
  const sorted = [...pool].sort((left, right) => {
    const leftGap = Math.abs(left.g3dMark - 12000);
    const rightGap = Math.abs(right.g3dMark - 12000);
    return leftGap - rightGap;
  });
  return sorted.slice(0, limit);
}

function BaselinePicker<T extends { id: string; model: string; aliases: string[] }>({
  pickerId,
  label,
  query,
  selectedId,
  items,
  fallbackItems,
  onQueryChange,
  onPick,
}: {
  pickerId: string;
  label: string;
  query: string;
  selectedId: string;
  items: T[];
  fallbackItems: T[];
  onQueryChange: (value: string) => void;
  onPick: (id: string) => void;
}) {
  const selected = items.find((item) => item.id === selectedId);
  const suggestions = getBaselineSuggestions(items, query, selectedId, fallbackItems);

  return (
    <div className="baseline-picker">
      <span>{label}</span>
      <input
        type="text"
        value={query}
        list={`baseline-${pickerId}`}
        placeholder={`输入关键字检索${label}`}
        onChange={(event) => {
          const value = event.target.value;
          onQueryChange(value);
          const exact = items.find((item) => item.model.toLowerCase() === value.trim().toLowerCase());
          if (exact) {
            onPick(exact.id);
          }
        }}
      />
      <datalist id={`baseline-${pickerId}`}>
        {suggestions.map((item) => (
          <option key={item.id} value={item.model} />
        ))}
      </datalist>
      <div className="baseline-current">当前: {selected?.model ?? '--'}</div>
    </div>
  );
}

function SummaryCard({
  device,
  colorIndex,
  compareScope,
  config,
  onRemove,
}: {
  device: FilledDevice;
  colorIndex: number;
  compareScope: CompareScope;
  config: BenchmarkConfig;
  onRemove: (slotId: string) => void;
}) {
  const primaryScore = getScopedPrimaryScore(device, compareScope, config);
  const title = compareScope === 'cpu' ? device.cpu?.model : device.gpu?.model;

  return (
    <div className={`summary-card summary-color-${colorIndex}`}>
      <div className="summary-card-header">
        <div className="summary-name">{title ?? '--'}</div>
        <button type="button" className="icon-button icon-button-danger" onClick={() => onRemove(device.id)}>
          删除
        </button>
      </div>
      <div className="summary-score">{primaryScore ?? '--'}</div>
    </div>
  );
}

export function SearchCompareCard({
  devices,
  cpus,
  gpus,
  config,
  compareScope,
  onConfigChange,
  onRemoveSlot,
  onAddHardwareToCompare,
}: SearchCompareCardProps) {
  const [lookupKind, setLookupKind] = useState<'cpu' | 'gpu'>('cpu');
  const [lookupQuery, setLookupQuery] = useState('');
  const [selectedLookupId, setSelectedLookupId] = useState<string>();
  const [showBaseline, setShowBaseline] = useState(false);
  const [cpuSingleBaseQuery, setCpuSingleBaseQuery] = useState('');
  const [cpuMultiBaseQuery, setCpuMultiBaseQuery] = useState('');
  const [gpuBaseQuery, setGpuBaseQuery] = useState('');
  const commonCpuOptions = getCommonCpuSuggestions(cpus, 10);
  const commonGpuOptions = getCommonGpuSuggestions(gpus, 10);

  const lookupSuggestions =
    lookupQuery.trim().length > 0
      ? lookupKind === 'cpu'
        ? searchByKeyword(cpus, lookupQuery)
        : searchByKeyword(gpus, lookupQuery)
      : lookupKind === 'cpu'
        ? getCommonCpuSuggestions(cpus, 8)
        : getCommonGpuSuggestions(gpus, 8);

  const selectedCpu = lookupKind === 'cpu' ? cpus.find((item) => item.id === selectedLookupId) : undefined;
  const selectedGpu = lookupKind === 'gpu' ? gpus.find((item) => item.id === selectedLookupId) : undefined;
  const lookupCpuBenchmarks = getSingleCpuBenchmarks(selectedCpu, config, cpus);
  const lookupGpuBenchmarks = getSingleGpuBenchmark(selectedGpu, config, gpus);
  const cpuSingleBaseModel = cpus.find((item) => item.id === config.cpuSingleBaseId)?.model ?? '--';
  const cpuMultiBaseModel = cpus.find((item) => item.id === config.cpuMultiBaseId)?.model ?? '--';
  const gpuBaseModel = gpus.find((item) => item.id === config.gpuBaseId)?.model ?? '--';
  const chartBaselineInfo =
    compareScope === 'cpu'
      ? `基准（CPU）：单核 ${cpuSingleBaseModel} ｜ 多核 ${cpuMultiBaseModel}`
      : `基准（GPU）：${gpuBaseModel}`;
  return (
    <section className="card">
      <div className="card-header">
        <button
          type="button"
          className={`action-button action-button-secondary baseline-toggle${showBaseline ? ' baseline-toggle-active' : ''}`}
          onClick={() => setShowBaseline((v) => !v)}
        >
          ⚙ 配置基准
        </button>
      </div>

      {showBaseline ? (
        <div className="panel baseline-panel">
          <div className="base-grid">
            <BaselinePicker
              pickerId="cpu-single"
              label="CPU 单核基准"
              query={cpuSingleBaseQuery}
              selectedId={config.cpuSingleBaseId}
              items={cpus}
              fallbackItems={commonCpuOptions}
              onQueryChange={setCpuSingleBaseQuery}
              onPick={(id) => onConfigChange({ ...config, cpuSingleBaseId: id })}
            />
            <BaselinePicker
              pickerId="cpu-multi"
              label="CPU 多核基准"
              query={cpuMultiBaseQuery}
              selectedId={config.cpuMultiBaseId}
              items={cpus}
              fallbackItems={commonCpuOptions}
              onQueryChange={setCpuMultiBaseQuery}
              onPick={(id) => onConfigChange({ ...config, cpuMultiBaseId: id })}
            />
            <BaselinePicker
              pickerId="gpu-base"
              label="GPU 基准"
              query={gpuBaseQuery}
              selectedId={config.gpuBaseId}
              items={gpus}
              fallbackItems={commonGpuOptions}
              onQueryChange={setGpuBaseQuery}
              onPick={(id) => onConfigChange({ ...config, gpuBaseId: id })}
            />
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">单项检索</div>
          <div className="segmented">
            <button
              type="button"
              className={lookupKind === 'cpu' ? 'is-active' : ''}
              onClick={() => {
                setLookupKind('cpu');
                setLookupQuery('');
                setSelectedLookupId(undefined);
              }}
            >
              CPU
            </button>
            <button
              type="button"
              className={lookupKind === 'gpu' ? 'is-active' : ''}
              onClick={() => {
                setLookupKind('gpu');
                setLookupQuery('');
                setSelectedLookupId(undefined);
              }}
            >
              GPU
            </button>
          </div>
        </div>
        <div className="lookup-toolbar">
          <div className="search-field lookup-search-field">
            <label>{lookupKind === 'cpu' ? 'CPU 型号检索' : 'GPU 型号检索'}</label>
            <input
              type="text"
              value={lookupQuery}
              placeholder={lookupKind === 'cpu' ? '例如 i5-12400F / Ryzen 5 5600' : '例如 GTX 1060 / RTX 2060'}
              onChange={(event) => setLookupQuery(event.target.value)}
            />
          </div>
        </div>

        <div className="suggestion-list">
          <div className="suggestion-list-title">
            {lookupQuery.trim().length > 0 ? '检索结果' : '常用型号（消费级优先）'}
          </div>
          {lookupSuggestions.map((item) => (
            <button
              type="button"
              key={item.id}
              className={selectedLookupId === item.id ? 'selected-chip' : ''}
              onClick={() => {
                setSelectedLookupId(item.id);
                setLookupQuery(item.model);
              }}
            >
              <span>{item.model}</span>
              <small>
                {lookupKind === 'cpu'
                  ? `单核 ${(item as CpuItem).singleThreadMark} / 多核 ${(item as CpuItem).cpuMark}`
                  : `GPU ${(item as GpuItem).g3dMark}`}
              </small>
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">相对性能与参数</div>
          {selectedLookupId ? (
            <button
              type="button"
              className="action-button"
              onClick={() => onAddHardwareToCompare(lookupKind, selectedLookupId)}
            >
              加入对比
            </button>
          ) : null}
        </div>

        {lookupKind === 'cpu' && selectedCpu ? (
          <div className="detail-grid">
            <div className="detail-card">
              <div className="detail-label">CPU 型号</div>
              <div className="detail-value">{selectedCpu.model}</div>
            </div>
            <div className="detail-card">
              <div className="detail-label">原始参数</div>
              <div className="detail-dual-row">
                <span>单核</span>
                <strong>{formatValue(selectedCpu.singleThreadMark)}</strong>
              </div>
              <div className="detail-dual-row">
                <span>多核</span>
                <strong>{formatValue(selectedCpu.cpuMark)}</strong>
              </div>
            </div>
            <div className="detail-card">
              <div className="detail-label">相对基准</div>
              <div className="detail-dual-row">
                <span>单核</span>
                <strong>{formatValue(lookupCpuBenchmarks.cpuSingleBenchmark)}</strong>
              </div>
              <div className="detail-dual-row">
                <span>多核</span>
                <strong>{formatValue(lookupCpuBenchmarks.cpuMultiBenchmark)}</strong>
              </div>
            </div>
          </div>
        ) : null}

        {lookupKind === 'gpu' && selectedGpu ? (
          <div className="detail-grid">
            <div className="detail-card">
              <div className="detail-label">GPU 型号</div>
              <div className="detail-value">{selectedGpu.model}</div>
            </div>
            <div className="detail-card">
              <div className="detail-label">原始参数</div>
              <div className="detail-value">G3D {selectedGpu.g3dMark}</div>
              <div className="detail-meta">综合 GPU 分数</div>
            </div>
            <div className="detail-card">
              <div className="detail-label">相对基准</div>
              <div className="detail-value">Benchmark {lookupGpuBenchmarks.gpuBenchmark ?? '--'}</div>
              <div className="detail-meta">相对当前 GPU 基准卡</div>
            </div>
          </div>
        ) : null}

        {!selectedCpu && lookupKind === 'cpu' ? <div className="empty-state">先从上方检索并选择一个 CPU。</div> : null}
        {!selectedGpu && lookupKind === 'gpu' ? <div className="empty-state">先从上方检索并选择一个 GPU。</div> : null}
      </div>

      {devices.length > 0 ? (
        <>
          <div className="panel">
            <div className="panel-title">汇总结果</div>
            <div className="summary-grid">
              {devices.map((device, index) => (
                <SummaryCard
                  device={device}
                  colorIndex={index + 1}
                  compareScope={compareScope}
                  config={config}
                  onRemove={onRemoveSlot}
                  key={device.id}
                />
              ))}
            </div>
          </div>

          <CompareTable devices={devices} scope={compareScope} config={config} />
          <ScoreChartGroup devices={devices} scope={compareScope} config={config} baselineInfo={chartBaselineInfo} />
        </>
      ) : null}
    </section>
  );
}
