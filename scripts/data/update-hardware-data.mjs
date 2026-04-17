import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CURRENT_FILE = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(CURRENT_FILE), '..', '..');
const SOURCE_CONFIG_PATH = path.join(ROOT_DIR, 'scripts', 'data', 'sources.json');
const OUTPUT_PATH = path.join(ROOT_DIR, 'public', 'data', 'hardware-data.json');

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
  };
}

function toNumber(raw) {
  if (!raw) {
    return undefined;
  }
  const cleaned = String(raw).replace(/,/g, '').trim();
  if (!cleaned || cleaned.toUpperCase() === 'NA') {
    return undefined;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function stripHtml(input) {
  return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function detectVendor(model) {
  const m = model.toLowerCase();
  if (m.includes('intel')) return 'Intel';
  if (m.includes('amd') || m.includes('ryzen') || m.includes('radeon')) return 'AMD';
  if (m.includes('nvidia') || m.includes('geforce') || m.includes('quadro') || m.includes('rtx') || m.includes('gtx')) return 'NVIDIA';
  if (m.includes('apple') || m.includes('m1') || m.includes('m2') || m.includes('m3') || m.includes('m4')) return 'Apple';
  if (m.includes('qualcomm') || m.includes('snapdragon')) return 'Qualcomm';
  return 'Unknown';
}

function buildAliases(model) {
  const base = model
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const aliases = new Set([base]);
  const compact = base.replace(/[^a-z0-9]+/g, ' ').trim();
  if (compact) aliases.add(compact);
  const noVendor = compact
    .replace(/\b(intel|amd|nvidia|geforce|radeon|apple|qualcomm|core|ryzen)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (noVendor) aliases.add(noVendor);
  return [...aliases];
}

function parseHtmlTableRows(html) {
  const rows = [];
  const trMatches = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const tr of trMatches) {
    const tdMatches = tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
    if (tdMatches.length === 0) continue;
    const cols = tdMatches.map((td) => stripHtml(td));
    rows.push(cols);
  }
  return rows;
}

function decodeHtmlEntities(input) {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'hardware-benchmark-offline-updater/1.0',
    },
  });
  if (!response.ok) {
    throw new Error(`抓取失败 ${url} (${response.status})`);
  }
  return response.text();
}

function normalizeModelName(model) {
  return decodeHtmlEntities(model)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\(R\)|\(TM\)|\(C\)/gi, ' ')
    .replace(/®|™|©/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function estimateSingleThreadFromCpuMark(cpuMark) {
  return Math.max(200, Math.round(Math.sqrt(cpuMark) * 11));
}

function parsePassmarkCpuList(html, singleThreadScoreMap) {
  const rows = parseHtmlTableRows(html);
  const cpus = [];

  for (const cols of rows) {
    if (cols.length < 2) continue;
    const model = decodeHtmlEntities(cols[0]);
    const cpuMark = toNumber(cols[1]);
    if (!model || !cpuMark) continue;
    if (/^CPU Name$/i.test(model) || /^name$/i.test(model)) continue;

    const singleThreadMark =
      singleThreadScoreMap.get(normalizeModelName(model)) ?? estimateSingleThreadFromCpuMark(cpuMark);

    const id = `cpu-${slugify(model)}`;
    cpus.push({
      id,
      vendor: detectVendor(model),
      model,
      aliases: buildAliases(model),
      singleThreadMark,
      cpuMark,
      category: ['unknown'],
      cores: 0,
      threads: 0,
      baseClockGHz: 0,
      boostClockGHz: 0,
      l3CacheMB: 0,
      tdpW: 0,
    });
  }

  return cpus;
}

function parseSingleThreadScores(html) {
  const map = new Map();
  const liMatches = html.match(/<li id="rk[\s\S]*?<\/li>/gi) || [];

  for (const li of liMatches) {
    const nameMatch = li.match(/<span class="prdname">([\s\S]*?)<\/span>/i);
    const scoreMatch = li.match(/<span class="count">([\s\S]*?)<\/span>/i);
    if (!nameMatch || !scoreMatch) continue;

    const model = stripHtml(nameMatch[1]);
    const score = toNumber(stripHtml(scoreMatch[1]));
    if (!model || !score) continue;

    const key = normalizeModelName(model);
    const current = map.get(key) ?? 0;
    if (score > current) {
      map.set(key, score);
    }
  }

  return map;
}

function parsePassmarkGpuList(html) {
  const rows = parseHtmlTableRows(html);
  const gpus = [];

  for (const cols of rows) {
    if (cols.length < 2) continue;
    const model = cols[0];
    const g3dMark = toNumber(cols[1]);
    if (!model || !g3dMark) continue;
    if (/^Video Card Name$/i.test(model) || /^name$/i.test(model)) continue;

    const id = `gpu-${slugify(model)}`;
    gpus.push({
      id,
      vendor: detectVendor(model),
      model,
      aliases: buildAliases(model),
      g3dMark,
      category: ['unknown'],
      vramGB: 0,
      boostClockMHz: 0,
      memoryBusBit: 0,
      memoryBandwidthGBs: 0,
      tdpW: 0,
    });
  }

  return gpus;
}

function mergeById(items) {
  const map = new Map();
  for (const item of items) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
      continue;
    }
    map.set(item.id, {
      ...existing,
      ...item,
      aliases: [...new Set([...(existing.aliases || []), ...(item.aliases || [])])],
    });
  }
  return [...map.values()];
}

function normalizeText(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function pickBaseIdByHints(items, hints, fallbackId) {
  for (const hint of hints || []) {
    const normalizedHint = normalizeText(hint);
    const found = items.find((item) => normalizeText(item.model).includes(normalizedHint));
    if (found) return found.id;
  }
  if (fallbackId && items.some((item) => item.id === fallbackId)) {
    return fallbackId;
  }
  return '';
}

function pickClosestCpuByScore(cpus, scoreKey, targetScore) {
  return cpus.reduce((best, cpu) => {
    const bestGap = Math.abs(best[scoreKey] - targetScore);
    const currentGap = Math.abs(cpu[scoreKey] - targetScore);
    return currentGap < bestGap ? cpu : best;
  }, cpus[0]);
}

function pickClosestGpuByScore(gpus, targetScore) {
  return gpus.reduce((best, gpu) => {
    const bestGap = Math.abs(best.g3dMark - targetScore);
    const currentGap = Math.abs(gpu.g3dMark - targetScore);
    return currentGap < bestGap ? gpu : best;
  }, gpus[0]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceConfig = JSON.parse(await fs.readFile(SOURCE_CONFIG_PATH, 'utf8'));
  const enabledSources = (sourceConfig.sources || []).filter((s) => s.enabled);

  const cpuRecords = [];
  const gpuRecords = [];

  for (const source of enabledSources) {
    if (source.type === 'passmark_cpu_list') {
      const cpuListUrl =
        source.url && /cpu-list\/all/i.test(source.url) ? source.url : 'https://www.cpubenchmark.net/cpu-list/all';
      const singleThreadUrls = [
        'https://www.cpubenchmark.net/single-thread',
        'https://www.cpubenchmark.net/single-thread/page2',
        'https://www.cpubenchmark.net/single-thread/page3',
        'https://www.cpubenchmark.net/single-thread/page4',
      ];
      const singleThreadScoreMap = new Map();
      for (const url of singleThreadUrls) {
        const pageHtml = await fetchText(url);
        const map = parseSingleThreadScores(pageHtml);
        for (const [key, value] of map) {
          const oldValue = singleThreadScoreMap.get(key) ?? 0;
          if (value > oldValue) {
            singleThreadScoreMap.set(key, value);
          }
        }
      }

      const html = await fetchText(cpuListUrl);
      const parsed = parsePassmarkCpuList(html, singleThreadScoreMap);
      cpuRecords.push(...parsed);
      console.log(
        `[data] ${source.id}: CPU ${parsed.length} 条, 单核映射 ${singleThreadScoreMap.size} 条, 来源 ${cpuListUrl}`,
      );
      continue;
    }

    if (source.type === 'passmark_gpu_list') {
      const html = await fetchText(source.url);
      const parsed = parsePassmarkGpuList(html);
      gpuRecords.push(...parsed);
      console.log(`[data] ${source.id}: GPU ${parsed.length} 条`);
      continue;
    }

    console.warn(`[data] 未支持的数据源类型: ${source.type}`);
  }

  const cpus = mergeById(cpuRecords).sort((a, b) => b.cpuMark - a.cpuMark);
  const gpus = mergeById(gpuRecords).sort((a, b) => b.g3dMark - a.g3dMark);

  if (cpus.length === 0 || gpus.length === 0) {
    throw new Error(`抓取结果为空：CPU=${cpus.length}, GPU=${gpus.length}`);
  }

  const cpuSingleBaseId =
    pickBaseIdByHints(cpus, sourceConfig.defaults?.cpuSingleBaseModelHints, '') ||
    pickClosestCpuByScore(cpus, 'singleThreadMark', 2500).id;
  const cpuMultiBaseId =
    pickBaseIdByHints(cpus, sourceConfig.defaults?.cpuMultiBaseModelHints, '') ||
    pickClosestCpuByScore(cpus, 'cpuMark', 18000).id;
  const gpuBaseId =
    pickBaseIdByHints(gpus, sourceConfig.defaults?.gpuBaseModelHints, '') ||
    pickClosestGpuByScore(gpus, 10000).id;

  const output = {
    defaults: {
      cpuSingleBaseId,
      cpuMultiBaseId,
      gpuBaseId,
    },
    cpus,
    gpus,
  };

  if (args.dryRun) {
    console.log(`[data] dry-run 完成: CPU=${cpus.length}, GPU=${gpus.length}`);
    return;
  }

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`[data] 已写入 ${OUTPUT_PATH}`);
  console.log(`[data] CPU=${cpus.length}, GPU=${gpus.length}`);
}

main().catch((error) => {
  console.error('[data] 更新失败:', error.message);
  process.exitCode = 1;
});
