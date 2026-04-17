import { useMemo, useState } from 'react';
import type { LadderRow, ScoreMode } from '../types/hardware';

type GpuLadderCardProps = {
  rows: LadderRow[];
  highlightedIds: string[];
  onPickGpu: (gpuId: string) => void;
};

const DEFAULT_VISIBLE_ROWS = 100;
const SEARCH_VISIBLE_ROWS = 200;

export function GpuLadderCard({ rows, highlightedIds, onPickGpu }: GpuLadderCardProps) {
  const [keyword, setKeyword] = useState('');
  const [mode, setMode] = useState<ScoreMode>('benchmark');
  const hasKeyword = keyword.trim().length > 0;

  const filteredRows = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) {
      return rows;
    }

    return rows.filter((row) => row.model.toLowerCase().includes(query));
  }, [rows, keyword]);
  const visibleRows = useMemo(
    () => filteredRows.slice(0, hasKeyword ? SEARCH_VISIBLE_ROWS : DEFAULT_VISIBLE_ROWS),
    [filteredRows, hasKeyword],
  );

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>GPU 天梯图</h2>
        </div>
        <div className="toolbar">
          <input
            type="text"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索 GPU 型号"
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

      <div className="ladder-table">
        {visibleRows.map((row) => (
          <button
            type="button"
            key={row.id}
            className={`ladder-row ${highlightedIds.includes(row.id) ? 'ladder-row-active' : ''}`}
            onClick={() => onPickGpu(row.id)}
          >
            <span className="ladder-rank">#{row.rank}</span>
            <span className="ladder-model">{row.model}</span>
            <span className="ladder-score">{mode === 'raw' ? row.rawScore : row.benchmarkScore}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
