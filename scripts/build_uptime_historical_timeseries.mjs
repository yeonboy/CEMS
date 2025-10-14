// Historical monthly time-series per item based on movements intervals
// Output: db/stats_uptime_historical_timeseries.json

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();
const DB_DIR = path.join(PROJECT_ROOT, 'db');
const EQUIPMENT_FILE = path.join(DB_DIR, 'equipment_db.json');
const MOVEMENTS_FILE = path.join(DB_DIR, 'movements_db.json');
const OUTPUT_FILE = path.join(DB_DIR, 'stats_uptime_historical_timeseries.json');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function ensureArray(x) { return Array.isArray(x) ? x : []; }

function normalizeItemName(raw) {
  const s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return '';
  if (s.startsWith('PM10') || s === 'PM-10') return 'PM-10';
  if (s.startsWith('PM2.5') || s === 'PM-2.5' || s === 'PM2_5') return 'PM-2.5';
  if (s === 'NOX') return 'NO2';
  if (s === 'NO2') return 'NO2';
  if (s === 'SOX' || s === 'SO2') return 'SO2';
  if (s === 'CO') return 'CO';
  if (s === 'O3') return 'O3';
  if (s === 'PB' || s === 'PB(LEAD)') return 'Pb';
  if (raw && String(raw).includes('벤젠')) return '벤젠';
  return raw;
}

function parseYmd(dateStr) {
  const s = (dateStr || '').toString().trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m1 = s.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})/);
  if (m1) return `${m1[1]}-${String(m1[2]).padStart(2,'0')}-${String(m1[3]).padStart(2,'0')}`;
  const m2 = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m2) return `${m2[3]}-${String(m2[2]).padStart(2,'0')}-${String(m2[1]).padStart(2,'0')}`;
  const m3 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m3) return `${m3[1]}-${m3[2]}-${m3[3]}`;
  const t = new Date(s);
  if (!isNaN(t.getTime())) return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  return '';
}

function countBusinessDays(start, end) {
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  let days = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) days++;
  }
  return Math.max(days, 0);
}

function classifyType(name) {
  const str = (name || '').toString();
  if (/청명|본사|창고|CEMS|CMES|본사 창고/.test(str)) return 'cmes';
  if (/현장|출장/.test(str)) return 'site';
  return 'vendor';
}

function getMonthKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth()+1, 0); }

function monthsInRange(from, to) {
  const list = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cur <= to) {
    list.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return list;
}

function overlapBusinessDays(rangeStart, rangeEnd, from, to) {
  const s = new Date(Math.max(+rangeStart, +from));
  const e = new Date(Math.min(+rangeEnd, +to));
  if (e < s) return 0;
  return countBusinessDays(s, e);
}

function buildSerialToItems(equipment) {
  const serialToItems = new Map();
  for (const e of equipment) {
    const serial = (e?.serial || '').toString().trim();
    if (!serial) continue;
    const cat = (e?.category || '').toString();
    const m = cat.match(/^\(([^)]+)\)/);
    let items = [];
    if (m) items = m[1].split(',').map(t => normalizeItemName(t)).filter(Boolean);
    if (!items.length) items = ['UNKNOWN'];
    serialToItems.set(serial, items);
  }
  return serialToItems;
}

function buildInventoryByItem(equipment) {
  const inv = {};
  for (const e of equipment) {
    const cat = (e?.category || '').toString();
    const m = cat.match(/^\(([^)]+)\)/);
    if (!m) continue;
    const items = m[1].split(',').map(t => normalizeItemName(t)).filter(Boolean);
    for (const it of items) inv[it] = (inv[it] || 0) + 1;
  }
  return inv;
}

function buildSerialMoves(movements) {
  const idx = new Map();
  for (const m of movements) {
    const serial = (m?.serial || '').toString().trim();
    if (!serial) continue;
    const date = parseYmd(m.date);
    if (!date) continue;
    if (!idx.has(serial)) idx.set(serial, []);
    idx.get(serial).push({ date, outLocation: m.outLocation, inLocation: m.inLocation });
  }
  for (const [, list] of idx) list.sort((a,b)=> (a.date>b.date?1:a.date<b.date?-1:0));
  return idx;
}

function computeIntervalsForRange(serial, sortedMoves, from, to) {
  const result = [];
  const within = sortedMoves.filter(m => new Date(m.date) >= new Date(from) && new Date(m.date) <= new Date(to));
  let currentType = 'cmes';
  const prior = sortedMoves.filter(m => new Date(m.date) < new Date(from)).sort((a,b)=> new Date(b.date) - new Date(a.date))[0];
  if (prior && (prior.inLocation || prior.outLocation)) currentType = classifyType(prior.inLocation || prior.outLocation);
  let cursor = new Date(from);
  for (const m of within) {
    const md = new Date(m.date);
    if (md > cursor) result.push({ start: new Date(cursor), end: new Date(md), type: currentType });
    currentType = classifyType(m.inLocation || m.outLocation);
    cursor = new Date(md);
  }
  if (cursor < to) result.push({ start: new Date(cursor), end: new Date(to), type: currentType });
  return result;
}

function main() {
  const equipment = ensureArray(readJson(EQUIPMENT_FILE));
  const movements = ensureArray(readJson(MOVEMENTS_FILE));
  const serialToItems = buildSerialToItems(equipment);
  const inventoryByItem = buildInventoryByItem(equipment);
  const serialToMoves = buildSerialMoves(movements);

  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth()-11, 1); // last 12 months from start of month
  const months = monthsInRange(from, to);
  const monthKeys = months.map(d => getMonthKey(d));

  // Precompute business days per month
  const bizDaysByMonth = {};
  for (const m of months) {
    const s = startOfMonth(m);
    const e = endOfMonth(m);
    bizDaysByMonth[getMonthKey(m)] = countBusinessDays(s, e);
  }

  // Aggregator: item -> month -> {siteDays, vendorDays, cmesDays}
  const agg = new Map();
  function getEntry(item, mk) {
    if (!agg.has(item)) agg.set(item, new Map());
    const map = agg.get(item);
    if (!map.has(mk)) map.set(mk, { siteDays: 0, vendorDays: 0, cmesDays: 0 });
    return map.get(mk);
  }

  for (const [serial, moves] of serialToMoves) {
    const items = serialToItems.get(serial) || ['UNKNOWN'];
    const intervals = computeIntervalsForRange(serial, moves, from, to);
    for (const iv of intervals) {
      for (const m of months) {
        const s = startOfMonth(m);
        const e = endOfMonth(m);
        const days = overlapBusinessDays(iv.start, iv.end, s, e);
        if (days <= 0) continue;
        const mk = getMonthKey(m);
        for (const it of items) {
          const entry = getEntry(it, mk);
          if (iv.type === 'site') entry.siteDays += days;
          else if (iv.type === 'vendor') entry.vendorDays += days;
          else entry.cmesDays += days;
        }
      }
    }
  }

  const data = [];
  for (const [item, monthMap] of agg) {
    for (const mk of monthKeys) {
      const entry = monthMap.get(mk) || { siteDays: 0, vendorDays: 0, cmesDays: 0 };
      const bizDays = bizDaysByMonth[mk] || 0;
      const siteDeviceAvg = bizDays > 0 ? Math.round((entry.siteDays / bizDays) * 10) / 10 : 0;
      const owned = inventoryByItem[item] || 0;
      const utilizationPct = owned > 0 ? Math.min(100, Math.round((siteDeviceAvg / owned) * 100)) : 0;
      const overCapacity = utilizationPct >= 80; // default warning threshold
      data.push({
        month: mk,
        category: item,
        businessDays: bizDays,
        siteDaysTotal: entry.siteDays,
        vendorDaysTotal: entry.vendorDays,
        cmesDaysTotal: entry.cmesDays,
        siteDeviceAvg,
        ownedDevices: owned,
        utilizationPct,
        overCapacity
      });
    }
  }

  data.sort((a,b)=> a.category===b.category ? (a.month>b.month?1:-1) : (a.category>b.category?1:-1));

  const payload = {
    meta: {
      _schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      sources: [path.relative(PROJECT_ROOT, EQUIPMENT_FILE), path.relative(PROJECT_ROOT, MOVEMENTS_FILE)],
      window: {
        from: `${from.getFullYear()}-${String(from.getMonth()+1).padStart(2,'0')}-01`,
        to: `${to.getFullYear()}-${String(to.getMonth()+1).padStart(2,'0')}-${String(to.getDate()).padStart(2,'0')}`
      },
      defaultOverCapacityThresholdPct: 80
    },
    data
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2));
  console.log('written:', path.relative(PROJECT_ROOT, OUTPUT_FILE), 'rows:', data.length);
}

main();


