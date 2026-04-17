import { useEffect, useMemo, useState } from 'react';
import { CpuLadderCard } from './components/CpuLadderCard';
import { GpuLadderCard } from './components/GpuLadderCard';
import { SearchCompareCard } from './components/SearchCompareCard';
import { buildFilledDevices } from './services/benchmark';
import { loadOfflineDataset, type OfflineDataset } from './services/offlineData';
import type { BenchmarkConfig, CompareScope, DeviceSlot, PageView } from './types/hardware';

function findEmptySlotId(slots: DeviceSlot[], kind: 'cpu' | 'gpu'): string | undefined {
  return slots.find((slot) => (kind === 'cpu' ? !slot.cpuId : !slot.gpuId))?.id;
}

function getNextSlotLabel(count: number): string {
  return `设备 ${String.fromCharCode(65 + count)}`;
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageView>('search');
  const [dataset, setDataset] = useState<OfflineDataset>();
  const [slots, setSlots] = useState<DeviceSlot[]>([]);
  const [config, setConfig] = useState<BenchmarkConfig>();
  const [compareScope, setCompareScope] = useState<CompareScope>('cpu');
  const [loadError, setLoadError] = useState<string>();

  useEffect(() => {
    let isMounted = true;

    loadOfflineDataset()
      .then((loaded) => {
        if (!isMounted) {
          return;
        }
        setDataset(loaded);
        setConfig(loaded.defaultConfig);
      })
      .catch((error: unknown) => {
        if (!isMounted) {
          return;
        }
        const message = error instanceof Error ? error.message : '离线数据加载失败';
        setLoadError(message);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const devices = useMemo(
    () => (dataset && config ? buildFilledDevices(slots, dataset.cpus, dataset.gpus, config) : []),
    [slots, config, dataset],
  );

  const highlightedCpuIds = devices.map((device) => device.cpu?.id).filter(Boolean) as string[];
  const highlightedGpuIds = devices.map((device) => device.gpu?.id).filter(Boolean) as string[];

  const removeSlot = (slotId: string) => {
    setSlots((current) => current.filter((slot) => slot.id !== slotId));
  };

  const addHardwareToCompare = (kind: 'cpu' | 'gpu', hardwareId: string) => {
    const isScopeChanged = compareScope !== kind;
    setCompareScope(kind);

    setSlots((current) => {
      if (current.length > 0 && isScopeChanged) {
        return [
          {
            id: 'slot-1',
            label: '设备 A',
            [kind === 'cpu' ? 'cpuId' : 'gpuId']: hardwareId,
          },
        ];
      }

      const existingId = current.find((slot) => (kind === 'cpu' ? slot.cpuId === hardwareId : slot.gpuId === hardwareId))?.id;
      if (existingId) {
        return current;
      }

      const targetId = findEmptySlotId(current, kind);

      if (targetId) {
        return current.map((slot) =>
          slot.id === targetId
            ? {
                ...slot,
                [kind === 'cpu' ? 'cpuId' : 'gpuId']: hardwareId,
              }
            : slot,
        );
      }

      if (current.length >= 4) {
        return current;
      }

      const nextIndex = current.length;
      const newSlot: DeviceSlot = {
        id: `slot-${nextIndex + 1}`,
        label: getNextSlotLabel(nextIndex),
        [kind === 'cpu' ? 'cpuId' : 'gpuId']: hardwareId,
      };

      return [...current, newSlot];
    });
  };

  const pickCpuFromLadder = (cpuId: string) => {
    addHardwareToCompare('cpu', cpuId);
  };

  const pickGpuFromLadder = (gpuId: string) => {
    addHardwareToCompare('gpu', gpuId);
  };

  if (loadError) {
    return (
      <div className="app-shell">
        <header className="page-header">
          <div>
            <div className="eyebrow">Offline Hardware Benchmark</div>
            <h1>CPU / GPU 性能比较工具</h1>
          </div>
        </header>
        <main className="page-grid">
          <section className="card">
            <div className="empty-state">离线数据加载失败：{loadError}</div>
          </section>
        </main>
      </div>
    );
  }

  if (!dataset || !config) {
    return (
      <div className="app-shell">
        <header className="page-header">
          <div>
            <div className="eyebrow">Offline Hardware Benchmark</div>
            <h1>CPU / GPU 性能比较工具</h1>
          </div>
        </header>
        <main className="page-grid">
          <section className="card">
            <div className="empty-state">正在加载离线硬件数据...</div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="page-header">
        <div>
          <div className="eyebrow">Offline Hardware Benchmark</div>
          <h1>CPU / GPU 性能比较工具</h1>
        </div>
      </header>

      <div className="view-switcher">
        <button
          type="button"
          className={`view-card ${currentPage === 'search' ? 'view-card-active' : ''}`}
          onClick={() => setCurrentPage('search')}
        >
          <span className="view-card-title">检索和比较</span>
        </button>
        <button
          type="button"
          className={`view-card ${currentPage === 'cpu-ladder' ? 'view-card-active' : ''}`}
          onClick={() => setCurrentPage('cpu-ladder')}
        >
          <span className="view-card-title">CPU 天梯图</span>
        </button>
        <button
          type="button"
          className={`view-card ${currentPage === 'gpu-ladder' ? 'view-card-active' : ''}`}
          onClick={() => setCurrentPage('gpu-ladder')}
        >
          <span className="view-card-title">GPU 天梯图</span>
        </button>
      </div>

      <main className="page-grid">
        {currentPage === 'search' ? (
          <SearchCompareCard
            devices={devices}
            cpus={dataset.cpus}
            gpus={dataset.gpus}
            config={config}
            compareScope={compareScope}
            onConfigChange={setConfig}
            onRemoveSlot={removeSlot}
            onAddHardwareToCompare={addHardwareToCompare}
          />
        ) : null}

        {currentPage === 'cpu-ladder' ? (
          <CpuLadderCard
            singleRows={dataset.cpuSingleLadder}
            multiRows={dataset.cpuMultiLadder}
            highlightedIds={highlightedCpuIds}
            onPickCpu={pickCpuFromLadder}
          />
        ) : null}

        {currentPage === 'gpu-ladder' ? (
          <GpuLadderCard rows={dataset.gpuLadder} highlightedIds={highlightedGpuIds} onPickGpu={pickGpuFromLadder} />
        ) : null}
      </main>
    </div>
  );
}
