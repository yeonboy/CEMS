// Build historical peaks: per item, maximum number of simultaneously operating devices (business days only) in last 12 months
// Output: db/stats_uptime_historical_peaks.json

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();
const DB_DIR = path.join(PROJECT_ROOT, 'db');
const EQUIPMENT_FILE = path.join(DB_DIR, 'equipment_db.json');
const MOVEMENTS_FILE = path.join(DB_DIR, 'movements_db.json');
const OUTPUT_FILE = path.join(DB_DIR, 'stats_uptime_historical_peaks.json');

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
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

function countBusinessDays(start, end) {
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  let days = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay(); if (wd !== 0 && wd !== 6) days++;
  }
  return Math.max(days, 0);
}

function classifyType(name) {
  const str = (name || '').toString();
  if (/청명|본사|창고|CEMS|CMES|본사 창고/.test(str)) return 'cmes';
  if (/현장|출장/.test(str)) return 'site';
  return 'vendor';
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

function buildSerialMoves(movements) {
  const idx = new Map();
  for (const m of movements) {
    const serial = (m?.serial || '').toString().trim();
    if (!serial) continue;
    const date = (m?.date || '').toString().trim();
    if (!date) continue;
    if (!idx.has(serial)) idx.set(serial, []);
    idx.get(serial).push({ date, outLocation: m.outLocation, inLocation: m.inLocation });
  }
  for (const [, list] of idx) list.sort((a,b)=> (a.date>b.date?1:a.date<b.date?-1:0));
  return idx;
}

function buildLocationIntervals(serial, movementsAsc, from, to) {
  const result = [];
  const asc = Array.isArray(movementsAsc) ? movementsAsc : [];
  const within = asc.filter(m => new Date(m.date) >= new Date(from) && new Date(m.date) <= new Date(to));
  let currentType = 'cmes';
  const prior = asc.filter(m => new Date(m.date) < new Date(from)).sort((a,b)=> new Date(b.date) - new Date(a.date))[0];
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

function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function main() {
  const equipment = ensureArray(readJson(EQUIPMENT_FILE));
  const movements = ensureArray(readJson(MOVEMENTS_FILE));
  const serialToItems = buildSerialToItems(equipment);
  const serialToMoves = buildSerialMoves(movements);

  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  from.setFullYear(from.getFullYear() - 1);

  // item -> dayKey -> count
  const dayCountsByItem = new Map();
  const ensureDayMap = (it)=>{ if (!dayCountsByItem.has(it)) dayCountsByItem.set(it, new Map()); return dayCountsByItem.get(it); };

  for (const [serial, list] of serialToMoves) {
    const items = serialToItems.get(serial) || ['UNKNOWN'];
    const intervals = buildLocationIntervals(serial, list, from, to);
    for (const iv of intervals) {
      if (iv.type !== 'site') continue;
      // walk business days only
      let d = new Date(iv.start.getFullYear(), iv.start.getMonth(), iv.start.getDate());
      const end = new Date(iv.end.getFullYear(), iv.end.getMonth(), iv.end.getDate());
      for (; d <= end; d.setDate(d.getDate() + 1)) {
        const wd = d.getDay();
        if (wd === 0 || wd === 6) continue;
        const key = ymd(d);
        for (const it of items) {
          const mp = ensureDayMap(it);
          mp.set(key, (mp.get(key) || 0) + 1);
        }
      }
    }
  }

  const data = [];
  for (const [it, mp] of dayCountsByItem) {
    let peak = 0, peakDate = '';
    for (const [day, cnt] of mp) {
      if (cnt > peak) { peak = cnt; peakDate = day; }
      else if (cnt === peak && peakDate && day < peakDate) { peakDate = day; }
    }
    data.push({ category: it, peakActiveDevices: peak, peakDate });
  }
  data.sort((a,b)=> a.category > b.category ? 1 : -1);

  const payload = {
    meta: {
      _schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      sources: [path.relative(PROJECT_ROOT, EQUIPMENT_FILE), path.relative(PROJECT_ROOT, MOVEMENTS_FILE)],
      window: { from: ymd(from), to: ymd(to) }
    },
    data
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2));
  console.log('written:', path.relative(PROJECT_ROOT, OUTPUT_FILE), 'rows:', data.length);
}

main();


