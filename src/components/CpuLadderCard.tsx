import { useMemo, useState } from 'react';
import type { LadderRow, ScoreMode } from '../types/hardware';

type CpuLadderCardProps = {
  singleRows: LadderRow[];
  multiRows: LadderRow[];
  highlightedIds: string[];
  onPickCpu: (cpuId: string) => void;
};

const DEFAULT_VISIBLE_ROWS = 100;
const SEARCH_VISIBLE_ROWS = 200;

function filterRows(rows: LadderRow[], keyword: string): LadderRow[] {
  const query = keyword.trim().toLowerCase();
  if (!query) {
    return rows;
  }

  return rows.filter((row) => row.model.toLowerCase().includes(query));
}

function LadderPanel({
  title,
  rows,
  highlightedIds,
  mode,
  onPick,
}: {
  title: string;
  rows: LadderRow[];
  highlightedIds: string[];
  mode: ScoreMode;
  onPick: (id: string) => void;
}) {
  return (
    <div className="ladder-panel">
      <div className="ladder-panel-title">{title}</div>
      <div className="ladder-table">
        {rows.map((row) => (
          <button
            type="button"
            key={row.id}
            className={`ladder-row ${highlightedIds.includes(row.id) ? 'ladder-row-active' : ''}`}
            onClick={() => onPick(row.id)}
          >
            <span className="ladder-rank">#{row.rank}</span>
            <span className="ladder-model">{row.model}</span>
            <span className="ladder-score">{mode === 'raw' ? row.rawScore : row.benchmarkScore}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function CpuLadderCard({
  singleRows,
  multiRows,
  highlightedIds,
  onPickCpu,
}: CpuLadderCardProps) {
  const [keyword, setKeyword] = useState('');
  const [mode, setMode] = useState<ScoreMode>('benchmark');
  const hasKeyword = keyword.trim().length > 0;

  const filteredSingleRows = useMemo(() => filterRows(singleRows, keyword), [singleRows, keyword]);
  const filteredMultiRows = useMemo(() => filterRows(multiRows, keyword), [multiRows, keyword]);
  const visibleSingleRows = useMemo(
    () => filteredSingleRows.slice(0, hasKeyword ? SEARCH_VISIBLE_ROWS : DEFAULT_VISIBLE_ROWS),
    [filteredSingleRows, hasKeyword],
  );
  const visibleMultiRows = useMemo(
    () => filteredMultiRows.slice(0, hasKeyword ? SEARCH_VISIBLE_ROWS : DEFAULT_VISIBLE_ROWS),
    [filteredMultiRows, hasKeyword],
  );

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>CPU 天梯图</h2>
        </div>
        <div className="toolbar">
          <input
            type="text"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索 CPU 型号"
          />
          <div className="segmented">
            <button
              type="button"
              className={mode === 'benchmark' ? 'is-active' : ''}
              onClick={() => setMode('benchmark')}
            >
              Benchmark
            </button>
            <button type="button" className={mode === 'raw' ? 'is-active' : ''} onClick={() => setMode('raw')}>
              原始分数
            </button>
          </div>
        </div>
      </div>

      <div className="cpu-ladder-grid">
        <LadderPanel
          title="单核 Top100"
          rows={visibleSingleRows}
          highlightedIds={highlightedIds}
          mode={mode}
          onPick={onPickCpu}
        />
        <LadderPanel
          title="多核 Top100"
          rows={visibleMultiRows}
          highlightedIds={highlightedIds}
          mode={mode}
          onPick={onPickCpu}
        />
      </div>
    </section>
  );
}
