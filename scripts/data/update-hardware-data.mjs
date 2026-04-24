import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CURRENT_FILE = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(CURRENT_FILE), '..', '..');
const SOURCE_CONFIG_PATH = path.join(ROOT_DIR, 'scripts', 'data', 'sources.json');
const OUTPUT_PATH = path.join(ROOT_DIR, 'public', 'data', 'hardware-data.json');
const CACHE_DIR = path.join(ROOT_DIR, 'scripts', 'data', 'cache');
const SPEC_CACHE_PATH = path.join(CACHE_DIR, 'spec-cache.json');

function parseArgs(argv) {
  const specLimitArg = argv.find((item) => item.startsWith('--spec-limit='));
  const specLimit = specLimitArg ? Number(specLimitArg.split('=')[1]) : undefined;
  const cacheTtlArg = argv.find((item) => item.startsWith('--cache-ttl-days='));
  const cacheTtlDays = cacheTtlArg ? Number(cacheTtlArg.split('=')[1]) : undefined;
  return {
    dryRun: argv.includes('--dry-run'),
    skipSpecs: argv.includes('--skip-specs'),
    specLimit: Number.isFinite(specLimit) && specLimit > 0 ? Math.floor(specLimit) : undefined,
    refreshSpecCache: argv.includes('--refresh-spec-cache'),
    cacheTtlDays: Number.isFinite(cacheTtlDays) && cacheTtlDays >= 0 ? cacheTtlDays : 30,
  };
}

async function loadSpecCache() {
  try {
    const raw = await fs.readFile(SPEC_CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { entries: {} };
    }
    return {
      entries: parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {},
    };
  } catch {
    return { entries: {} };
  }
}

async function saveSpecCache(cache) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(SPEC_CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
}

function isFreshCacheEntry(entry, cacheTtlDays) {
  if (!entry?.fetchedAt) {
    return false;
  }
  const fetchedAt = Date.parse(entry.fetchedAt);
  if (!Number.isFinite(fetchedAt)) {
    return false;
  }
  const ttlMs = Math.max(0, cacheTtlDays) * 24 * 60 * 60 * 1000;
  return Date.now() - fetchedAt <= ttlMs;
}

function applyParsedSpecs(item, parsed) {
  let hasAnyField = false;
  for (const key of Object.keys(parsed)) {
    const value = parsed[key];
    if (value && value > 0) {
      item[key] = value;
      hasAnyField = true;
    }
  }
  return hasAnyField;
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

async function fetchText(url, options = {}) {
  const retries = options.retries ?? 2;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'hardware-benchmark-offline-updater/1.0',
        },
      });
      if (!response.ok) {
        throw new Error(`抓取失败 ${url} (${response.status})`);
      }
      return response.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
      }
    }
  }
  throw new Error(`抓取失败 ${url}: ${lastError?.message || String(lastError)}`);
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

function parseHtmlTableRowsDetailed(html) {
  const rows = [];
  const trMatches = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const tr of trMatches) {
    const cellMatches = tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
    if (cellMatches.length === 0) continue;
    const cols = cellMatches.map((cell) => ({
      raw: cell,
      text: stripHtml(cell),
    }));
    rows.push(cols);
  }
  return rows;
}

function parseDetailUrlFromCell(cellHtml, site, kind) {
  const hrefMatches = [...cellHtml.matchAll(/href\s*=\s*"([^"]+)"/gi), ...cellHtml.matchAll(/href\s*=\s*'([^']+)'/gi)];
  const hrefs = hrefMatches
    .map((match) => decodeHtmlEntities((match[1] || match[2] || '').trim()))
    .filter(Boolean);
  if (hrefs.length === 0) return undefined;

  const preferredPattern = kind === 'cpu' ? /(?:^|\/)cpu\.php\?/i : /(?:^|\/)gpu\.php\?/i;
  const lookupPattern = kind === 'cpu' ? /(?:^|\/)cpu_lookup\.php\?/i : /(?:^|\/)video_lookup\.php\?/i;
  const preferredHref = hrefs.find((href) => preferredPattern.test(href));
  let chosenHref = preferredHref || hrefs.find((href) => lookupPattern.test(href)) || hrefs[0];

  if (kind === 'cpu') {
    chosenHref = chosenHref.replace(/(?:^|\/)cpu_lookup\.php\?/i, '/cpu.php?');
  } else {
    chosenHref = chosenHref.replace(/(?:^|\/)video_lookup\.php\?/i, '/gpu.php?');
  }

  try {
    return new URL(chosenHref, site).toString();
  } catch {
    return undefined;
  }
}

function parsePassmarkCpuList(html, singleThreadScoreMap) {
  const rows = parseHtmlTableRowsDetailed(html);
  const cpus = [];
  const detailUrlById = new Map();

  for (const cols of rows) {
    if (cols.length < 2) continue;
    const model = decodeHtmlEntities(cols[0].text);
    const cpuMark = toNumber(cols[1].text);
    if (!model || !cpuMark) continue;
    if (/^CPU Name$/i.test(model) || /^name$/i.test(model)) continue;

    const singleThreadMark =
      singleThreadScoreMap.get(normalizeModelName(model)) ?? estimateSingleThreadFromCpuMark(cpuMark);

    const id = `cpu-${slugify(model)}`;
    const detailUrl = parseDetailUrlFromCell(cols[0].raw, 'https://www.cpubenchmark.net/', 'cpu');
    if (detailUrl) {
      detailUrlById.set(id, detailUrl);
    }
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

  return { cpus, detailUrlById };
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
  const rows = parseHtmlTableRowsDetailed(html);
  const gpus = [];
  const detailUrlById = new Map();

  for (const cols of rows) {
    if (cols.length < 2) continue;
    const model = cols[0].text;
    const g3dMark = toNumber(cols[1].text);
    if (!model || !g3dMark) continue;
    if (/^Video Card Name$/i.test(model) || /^name$/i.test(model)) continue;

    const id = `gpu-${slugify(model)}`;
    const detailUrl = parseDetailUrlFromCell(cols[0].raw, 'https://www.videocardbenchmark.net/', 'gpu');
    if (detailUrl) {
      detailUrlById.set(id, detailUrl);
    }
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

  return { gpus, detailUrlById };
}

function normalizeSpecText(html) {
  return stripHtml(decodeHtmlEntities(html))
    .replace(/\s+/g, ' ')
    .replace(/[，]/g, ',')
    .trim();
}

function normalizeLabel(text) {
  return normalizeSpecText(text)
    .toLowerCase()
    .replace(/[:：]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectDetailKeyValues(html) {
  const values = new Map();

  const rows = parseHtmlTableRowsDetailed(html);
  for (const row of rows) {
    if (row.length < 2) continue;
    const key = normalizeLabel(row[0].text);
    if (!key) continue;
    const value = row
      .slice(1)
      .map((cell) => normalizeSpecText(cell.text))
      .filter(Boolean)
      .join(' | ');
    if (!value) continue;
    const arr = values.get(key) ?? [];
    arr.push(value);
    values.set(key, arr);
  }

  const dtDdMatches = html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi);
  for (const match of dtDdMatches) {
    const key = normalizeLabel(match[1]);
    const value = normalizeSpecText(match[2]);
    if (!key || !value) continue;
    const arr = values.get(key) ?? [];
    arr.push(value);
    values.set(key, arr);
  }

  return values;
}

function findValueByLabel(valuesMap, aliases) {
  for (const [label, values] of valuesMap.entries()) {
    if (aliases.some((alias) => label.includes(alias))) {
      const value = values.find(Boolean);
      if (value) return value;
    }
  }
  return '';
}

function collectDetailLines(html) {
  const text = decodeHtmlEntities(html)
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/td|\/th|\/dd|\/dt|\/h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function findValueByLine(lines, labelRegex) {
  for (const line of lines) {
    const match = line.match(labelRegex);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return '';
}

function parseNumericValue(text, unitMode) {
  if (!text) return 0;
  const normalized = normalizeSpecText(text);
  const numberMatch = normalized.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!numberMatch) return 0;
  const value = Number(numberMatch[1]);
  if (!Number.isFinite(value) || value <= 0) return 0;

  const lower = normalized.toLowerCase();
  if (unitMode === 'ghz') {
    if (/\bmhz\b/.test(lower)) return value / 1000;
    return value;
  }
  if (unitMode === 'mhz') {
    if (/\bghz\b/.test(lower)) return value * 1000;
    return value;
  }
  if (unitMode === 'mb') {
    if (/\bkb\b/.test(lower)) return value / 1024;
    if (/\bgb\b/.test(lower)) return value * 1024;
    return value;
  }
  if (unitMode === 'gb') {
    if (/\bmb\b/.test(lower)) return value / 1024;
    return value;
  }
  if (unitMode === 'gbps') {
    if (/\btb\/s\b/.test(lower)) return value * 1024;
    return value;
  }

  return value;
}

function toPositiveNumber(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function parseCpuSpecsFromDetail(html) {
  const kv = collectDetailKeyValues(html);
  const lines = collectDetailLines(html);
  const pageText = normalizeSpecText(html);

  const coresText =
    findValueByLabel(kv, ['cores']) ||
    findValueByLabel(kv, ['cpu cores']) ||
    findValueByLabel(kv, ['total cores']) ||
    findValueByLine(lines, /\bcores?\b\s*[:：]\s*([^|,;]+)/i);
  const threadsText =
    findValueByLabel(kv, ['threads']) ||
    findValueByLabel(kv, ['cpu threads']) ||
    findValueByLabel(kv, ['total threads']) ||
    findValueByLine(lines, /\bthreads?\b\s*[:：]\s*([^|,;]+)/i);
  const combinedCoreThreadText =
    findValueByLabel(kv, ['cores, threads']) ||
    findValueByLabel(kv, ['cores / threads']) ||
    findValueByLine(lines, /\bcores?\b[^.\n]{0,40}\bthreads?\b[^.\n]{0,40}/i) ||
    '';

  const cores =
    toPositiveNumber(Number(coresText.match(/\b(\d{1,3})\b/)?.[1])) ||
    toPositiveNumber(Number(combinedCoreThreadText.match(/(\d{1,3})\s*(?:cores?|c)\b/i)?.[1]));
  const threads =
    toPositiveNumber(Number(threadsText.match(/\b(\d{1,3})\b/)?.[1])) ||
    toPositiveNumber(Number(combinedCoreThreadText.match(/(\d{1,3})\s*(?:threads?|t)\b/i)?.[1]));

  const baseClockText = findValueByLabel(kv, [
    'base clock',
    'base frequency',
    'clockspeed',
    'clock speed',
    'frequency',
    'performance-core base clock',
    'p-core base clock',
  ]) ||
    findValueByLine(lines, /\b(?:base clock|base frequency|clockspeed|clock speed|frequency)\b\s*[:：]\s*([^|,;]+)/i) ||
    pageText.match(/\bclockspeed\b\s*:?\s*([0-9]+(?:\.[0-9]+)?\s*(?:mhz|ghz))/i)?.[1] ||
    pageText.match(/\bbase frequency\b\s*:?\s*([0-9]+(?:\.[0-9]+)?\s*(?:mhz|ghz))/i)?.[1] ||
    '';
  const boostClockText = findValueByLabel(kv, [
    'max turbo frequency',
    'turbo',
    'turbo speed',
    'boost clock',
    'boost speed',
    'max boost',
    'max turbo',
  ]) ||
    findValueByLine(lines, /\b(?:max turbo frequency|turbo speed|turbo|boost clock|boost speed|max boost|max turbo)\b\s*[:：]\s*([^|,;]+)/i) ||
    pageText.match(/\bturbo speed\b\s*:?\s*([0-9]+(?:\.[0-9]+)?\s*(?:mhz|ghz))/i)?.[1] ||
    pageText.match(/\bmax turbo frequency\b\s*:?\s*([0-9]+(?:\.[0-9]+)?\s*(?:mhz|ghz))/i)?.[1] ||
    '';
  const l3Text =
    findValueByLabel(kv, ['l3 cache', 'cache l3']) ||
    findValueByLine(lines, /\bl3 cache\b\s*[:：]\s*([^|,;]+)/i) ||
    pageText.match(/\bl3 cache\b\s*:?\s*([0-9]+(?:\.[0-9]+)?\s*(?:kb|mb|gb))/i)?.[1] ||
    '';
  const tdpText =
    findValueByLabel(kv, ['typical tdp', 'tdp', 'thermal design power', 'max tdp']) ||
    findValueByLine(lines, /\b(?:typical tdp|tdp|thermal design power|max tdp)\b\s*[:：]\s*([^|,;]+)/i) ||
    pageText.match(/\btypical tdp\b\s*:?\s*([0-9]+(?:\.[0-9]+)?\s*w)/i)?.[1] ||
    '';

  const normalizedBaseClockGHz = parseNumericValue(baseClockText, 'ghz');
  const boostClockGHz = parseNumericValue(boostClockText, 'ghz');
  const l3CacheMB = parseNumericValue(l3Text, 'mb');
  const tdpW = parseNumericValue(tdpText, 'number');

  return {
    cores,
    threads,
    baseClockGHz: toPositiveNumber(Number(normalizedBaseClockGHz.toFixed(3))),
    boostClockGHz: toPositiveNumber(Number(boostClockGHz.toFixed(3))),
    l3CacheMB: toPositiveNumber(Number(l3CacheMB.toFixed(2))),
    tdpW: toPositiveNumber(Number(tdpW.toFixed(2))),
  };
}

function parseGpuSpecsFromDetail(html) {
  const kv = collectDetailKeyValues(html);
  const lines = collectDetailLines(html);
  const pageText = normalizeSpecText(html);
  const vramText =
    findValueByLabel(kv, ['max memory size', 'memory size', 'video memory', 'vram', 'dedicated memory']) ||
    findValueByLine(lines, /\b(?:max memory size|memory size|video memory|vram|dedicated memory)\b\s*[:：]\s*([^|,;]+)/i) ||
    pageText.match(/\bmax memory size\b\s*:?\s*([0-9]+(?:\.[0-9]+)?\s*(?:mb|gb))/i)?.[1] ||
    html.match(/<strong>\s*Max Memory Size:\s*<\/strong>\s*([0-9]+(?:\.[0-9]+)?\s*(?:MB|GB))/i)?.[1] ||
    '';
  const boostClockText =
    findValueByLabel(kv, ['boost clock', 'gpu clock', 'gpu clock(s)', 'core clock', 'core clock(s)', 'engine clock']) ||
    findValueByLine(lines, /\b(?:boost clock|gpu clock|gpu clock\(s\)|core clock|core clock\(s\)|engine clock)\b\s*[:：]\s*([^|,;]+)/i) ||
    pageText.match(/\bcore clock\(s\)\b\s*:?\s*([0-9]+(?:\.[0-9]+)?\s*(?:mhz|ghz))/i)?.[1] ||
    pageText.match(/\bboost clock\b\s*:?\s*([0-9]+(?:\.[0-9]+)?\s*(?:mhz|ghz))/i)?.[1] ||
    html.match(/<strong>\s*Core Clock\(s\):\s*<\/strong>\s*([0-9]+(?:\.[0-9]+)?\s*(?:MHz|GHz))/i)?.[1] ||
    '';
  const busText =
    findValueByLabel(kv, ['memory bus', 'bus width', 'memory interface width']) ||
    findValueByLine(lines, /\b(?:memory bus|bus width|memory interface width|memory bus width)\b\s*[:：]\s*([^|,;]+)/i) ||
    pageText.match(/\b(?:memory bus width|memory bus|bus width)\b\s*:?\s*([0-9]+(?:\.[0-9]+)?\s*bit)/i)?.[1] ||
    '';
  const bandwidthText =
    findValueByLabel(kv, ['memory bandwidth']) ||
    findValueByLine(lines, /\bmemory bandwidth\b\s*[:：]\s*([^|,;]+)/i) ||
    pageText.match(/\b(?:memory bandwidth|bandwidth)\b\s*:?\s*([0-9]+(?:\.[0-9]+)?\s*(?:gb\/s|tb\/s))/i)?.[1] ||
    '';
  const tdpText =
    findValueByLabel(kv, ['max tdp', 'tdp', 'thermal design power']) ||
    findValueByLine(lines, /\b(?:max tdp|tdp|thermal design power)\b\s*[:：]\s*([^|,;]+)/i) ||
    pageText.match(/\bmax tdp\b\s*:?\s*([0-9]+(?:\.[0-9]+)?\s*w)/i)?.[1] ||
    html.match(/<strong>\s*Max TDP:\s*<\/strong>\s*([0-9]+(?:\.[0-9]+)?\s*W)/i)?.[1] ||
    '';

  const vramGB = parseNumericValue(vramText, 'gb');
  const boostClockMHz = parseNumericValue(boostClockText, 'mhz');
  const memoryBusBit = toPositiveNumber(Number(normalizeSpecText(busText).match(/\b(\d{2,4})\b/)?.[1]));
  const memoryBandwidthGBs = parseNumericValue(bandwidthText, 'gbps');
  const tdpW = parseNumericValue(tdpText, 'number');

  return {
    vramGB: toPositiveNumber(Number(vramGB.toFixed(3))),
    boostClockMHz: toPositiveNumber(Number(boostClockMHz.toFixed(2))),
    memoryBusBit,
    memoryBandwidthGBs: toPositiveNumber(Number(memoryBandwidthGBs.toFixed(2))),
    tdpW: toPositiveNumber(Number(tdpW.toFixed(2))),
  };
}

async function enrichSpecs(items, detailUrlById, parseDetail, options) {
  const concurrency = Number(process.env.SPEC_CONCURRENCY || 6);
  const limit = options.specLimit ?? Number.POSITIVE_INFINITY;
  const debug = process.env.SPEC_DEBUG === '1';
  const cacheTtlDays = options.cacheTtlDays ?? 30;
  const specCache = options.specCache ?? { entries: {} };
  const refreshSpecCache = options.refreshSpecCache === true;
  let attempted = 0;
  let completed = 0;
  let enriched = 0;
  let cacheHits = 0;

  const tasks = items.filter((item) => detailUrlById.get(item.id)).slice(0, limit);
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      const item = tasks[index];
      const url = detailUrlById.get(item.id);
      if (!url) continue;

      attempted += 1;
      try {
        const cached = specCache.entries[url];
        if (!refreshSpecCache && isFreshCacheEntry(cached, cacheTtlDays)) {
          if (applyParsedSpecs(item, cached.specs || {})) {
            enriched += 1;
          }
          cacheHits += 1;
          continue;
        }

        const html = await fetchText(url, { retries: 2 });
        const parsed = parseDetail(html);
        if (debug && attempted <= 3) {
          console.log(`[debug] spec url: ${url}`);
          console.log('[debug] parsed:', parsed);
        }
        specCache.entries[url] = {
          fetchedAt: new Date().toISOString(),
          specs: parsed,
        };
        const hasAnyField = applyParsedSpecs(item, parsed);
        if (hasAnyField) {
          enriched += 1;
        }
      } catch {
        // 忽略单条失败，保证整体数据更新可继续
      } finally {
        completed += 1;
        if (completed % 200 === 0 || completed === tasks.length) {
          console.log(`[data] 规格补全进度 ${completed}/${tasks.length}`);
        }
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.all(workers);
  return { attempted, enriched, totalTasks: tasks.length, cacheHits };
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
  const specCache = await loadSpecCache();
  const enabledSources = (sourceConfig.sources || []).filter((s) => s.enabled);

  const cpuRecords = [];
  const gpuRecords = [];
  const cpuDetailUrlById = new Map();
  const gpuDetailUrlById = new Map();

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
      cpuRecords.push(...parsed.cpus);
      for (const [id, url] of parsed.detailUrlById) {
        cpuDetailUrlById.set(id, url);
      }
      console.log(
        `[data] ${source.id}: CPU ${parsed.cpus.length} 条, 单核映射 ${singleThreadScoreMap.size} 条, 来源 ${cpuListUrl}`,
      );
      continue;
    }

    if (source.type === 'passmark_gpu_list') {
      const html = await fetchText(source.url);
      const parsed = parsePassmarkGpuList(html);
      gpuRecords.push(...parsed.gpus);
      for (const [id, url] of parsed.detailUrlById) {
        gpuDetailUrlById.set(id, url);
      }
      console.log(`[data] ${source.id}: GPU ${parsed.gpus.length} 条`);
      continue;
    }

    console.warn(`[data] 未支持的数据源类型: ${source.type}`);
  }

  const cpus = mergeById(cpuRecords).sort((a, b) => b.cpuMark - a.cpuMark);
  const gpus = mergeById(gpuRecords).sort((a, b) => b.g3dMark - a.g3dMark);

  if (cpus.length === 0 || gpus.length === 0) {
    throw new Error(`抓取结果为空：CPU=${cpus.length}, GPU=${gpus.length}`);
  }

  if (!args.skipSpecs) {
    console.log('[data] 开始补全 CPU 规格字段...');
    const cpuSpecStat = await enrichSpecs(cpus, cpuDetailUrlById, parseCpuSpecsFromDetail, {
      specLimit: args.specLimit,
      specCache,
      cacheTtlDays: args.cacheTtlDays,
      refreshSpecCache: args.refreshSpecCache,
    });
    console.log(
      `[data] CPU 规格补全: 成功 ${cpuSpecStat.enriched}/${cpuSpecStat.attempted}, 缓存命中 ${cpuSpecStat.cacheHits}`,
    );

    console.log('[data] 开始补全 GPU 规格字段...');
    const gpuSpecStat = await enrichSpecs(gpus, gpuDetailUrlById, parseGpuSpecsFromDetail, {
      specLimit: args.specLimit,
      specCache,
      cacheTtlDays: args.cacheTtlDays,
      refreshSpecCache: args.refreshSpecCache,
    });
    console.log(
      `[data] GPU 规格补全: 成功 ${gpuSpecStat.enriched}/${gpuSpecStat.attempted}, 缓存命中 ${gpuSpecStat.cacheHits}`,
    );
  } else {
    console.log('[data] 已跳过规格补全（--skip-specs）');
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
    meta: {
      updatedAt: new Date().toISOString(),
      sources: (sourceConfig.sources || [])
        .filter((source) => source.enabled !== false)
        .map((source) => ({
          id: source.id,
          type: source.type,
          url: source.url,
        })),
    },
    defaults: {
      cpuSingleBaseId,
      cpuMultiBaseId,
      gpuBaseId,
    },
    cpus,
    gpus,
  };

  if (args.dryRun) {
    await saveSpecCache(specCache);
    console.log(`[data] dry-run 完成: CPU=${cpus.length}, GPU=${gpus.length}`);
    return;
  }

  await saveSpecCache(specCache);
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`[data] 已写入 ${OUTPUT_PATH}`);
  console.log(`[data] CPU=${cpus.length}, GPU=${gpus.length}`);
}

main().catch((error) => {
  console.error('[data] 更新失败:', error.message);
  process.exitCode = 1;
});
