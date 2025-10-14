// Build historical uptime and maintenance stats (last 1 year) per item category
// Inputs: db/equipment_db.json, db/movements_db.json, db/repairs_db_clean.json|db/repairs_db.json
// Output: db/stats_uptime_historical.json

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();
const DB_DIR = path.join(PROJECT_ROOT, 'db');
const EQUIPMENT_FILE = path.join(DB_DIR, 'equipment_db.json');
const MOVEMENTS_FILE = path.join(DB_DIR, 'movements_db.json');
const REPAIRS_CLEAN_FILE = path.join(DB_DIR, 'repairs_db_clean.json');
const REPAIRS_FILE = path.join(DB_DIR, 'repairs_db.json');
const OUTPUT_FILE = path.join(DB_DIR, 'stats_uptime_historical.json');

function readJson(p) {
  try {
    const txt = fs.readFileSync(p, 'utf8');
    return JSON.parse(txt);
  } catch {
    return null;
  }
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

function classifyLocation(raw) {
  const s = (raw || '').toString();
  if (/청명|본사|창고|CEMS|CMES|본사 창고/.test(s)) return '청명';
  if (/현장|출장/.test(s)) return '현장';
  if (/업체|수리|정도검사|센터/.test(s)) return '업체';
  return s || '';
}

function mapTypeFromLocationName(name) {
  const str = (name || '').toString();
  if (/청명|본사|창고|CEMS|CMES|본사 창고/.test(str)) return 'cmes';
  if (/현장|출장/.test(str)) return 'site';
  return 'vendor';
}

function buildSerialIndexes(movements) {
  const serialToMoves = new Map();
  for (const m of movements) {
    const serial = (m?.serial || '').toString().trim();
    if (!serial) continue;
    if (!serialToMoves.has(serial)) serialToMoves.set(serial, []);
    serialToMoves.get(serial).push({
      date: parseYmd(m.date),
      outLocation: m.outLocation,
      inLocation: m.inLocation,
    });
  }
  for (const [, list] of serialToMoves) list.sort((a,b)=> (a.date>b.date?1:a.date<b.date?-1:0));
  return serialToMoves;
}

function buildSerialToItems(equipmentArray) {
  const serialToItems = new Map();
  const serialToCurrentLocation = new Map();
  for (const e of equipmentArray) {
    const serial = (e?.serial || '').toString().trim();
    if (!serial) continue;
    const cat = (e?.category || '').toString();
    const m = cat.match(/^\(([^)]+)\)/);
    let items = [];
    if (m) {
      items = m[1].split(',').map(t => normalizeItemName(t)).filter(Boolean);
    }
    if (!items.length) items = ['UNKNOWN'];
    serialToItems.set(serial, items);
    if (e?.currentLocation) serialToCurrentLocation.set(serial, e.currentLocation);
  }
  return { serialToItems, serialToCurrentLocation };
}

function computeIntervalsForRange(serial, sortedMoves, from, to, currentLocationFallback) {
  const result = [];
  const within = sortedMoves.filter(m => new Date(m.date) >= new Date(from) && new Date(m.date) <= new Date(to));

  let currentType = 'cmes';
  const prior = sortedMoves.filter(m => new Date(m.date) < new Date(from)).sort((a,b)=> new Date(b.date) - new Date(a.date))[0];
  if (prior && (prior.inLocation || prior.outLocation)) currentType = mapTypeFromLocationName(prior.inLocation || prior.outLocation);
  else if (currentLocationFallback) currentType = mapTypeFromLocationName(currentLocationFallback);

  let cursor = new Date(from);
  for (const m of within) {
    const md = new Date(m.date);
    if (md > cursor) result.push({ start: new Date(cursor), end: new Date(md), type: currentType });
    currentType = mapTypeFromLocationName(m.inLocation || m.outLocation);
    cursor = new Date(md);
  }
  if (cursor < to) result.push({ start: new Date(cursor), end: new Date(to), type: currentType });
  return result;
}

function countPairsWithin(sortedMoves, from, to) {
  const within = sortedMoves.filter(m => new Date(m.date) >= new Date(from) && new Date(m.date) <= new Date(to));
  let travelOpen = false; // 청명→현장 대기
  let repairOpen = false; // 청명→업체 대기
  let travelCount = 0;
  let repairCount = 0;
  for (const m of within) {
    const fromLoc = classifyLocation(m.outLocation);
    const toLoc = classifyLocation(m.inLocation);
    if (fromLoc === '청명' && toLoc === '현장') travelOpen = true;
    else if (travelOpen && fromLoc === '현장' && toLoc === '청명') { travelCount += 1; travelOpen = false; }
    if (fromLoc === '청명' && toLoc === '업체') repairOpen = true;
    else if (repairOpen && fromLoc === '업체' && toLoc === '청명') { repairCount += 1; repairOpen = false; }
  }
  return { travelCount, repairCount };
}

function main() {
  const equipment = ensureArray(readJson(EQUIPMENT_FILE));
  const movements = ensureArray(readJson(MOVEMENTS_FILE));
  const repairsClean = ensureArray(readJson(REPAIRS_CLEAN_FILE));
  const repairsRaw = ensureArray(readJson(REPAIRS_FILE));
  const repairs = repairsClean.length ? repairsClean : repairsRaw;

  const { serialToItems, serialToCurrentLocation } = buildSerialToItems(equipment);
  const serialToMoves = buildSerialIndexes(movements);

  const to = new Date();
  const from = new Date(to.getFullYear() - 1, to.getMonth(), to.getDate());
  const totalBizDays = countBusinessDays(from, to);

  // Pre-index repairs by serial within range
  const repairsBySerial = new Map();
  for (const r of repairs) {
    const dateRaw = r?.repair_date || r?.date || '';
    const ymd = parseYmd(dateRaw);
    if (!ymd) continue;
    const t = new Date(ymd);
    if (t < from || t > to) continue;
    const serial = (r?.serial || '').toString().trim();
    if (!serial) continue;
    if (!repairsBySerial.has(serial)) repairsBySerial.set(serial, []);
    repairsBySerial.get(serial).push(r);
  }

  const aggByItem = new Map();

  for (const [serial, moves] of serialToMoves) {
    const items = serialToItems.get(serial) || ['UNKNOWN'];
    // Intervals and utilization
    const intervals = computeIntervalsForRange(
      serial,
      moves,
      from,
      to,
      serialToCurrentLocation.get(serial)
    );
    let siteBiz = 0, vendorBiz = 0, cmesBiz = 0;
    for (const iv of intervals) {
      const days = countBusinessDays(new Date(iv.start), new Date(iv.end));
      if (iv.type === 'site') siteBiz += days;
      else if (iv.type === 'vendor') vendorBiz += days;
      else cmesBiz += days;
    }
    const uptimePct = totalBizDays > 0 ? Math.round((siteBiz / totalBizDays) * 100) : 0;
    const sitePct = totalBizDays > 0 ? Math.round((siteBiz / totalBizDays) * 100) : 0;
    const vendorPct = totalBizDays > 0 ? Math.round((vendorBiz / totalBizDays) * 100) : 0;
    const cmesPct = totalBizDays > 0 ? Math.round((cmesBiz / totalBizDays) * 100) : 0;

    // Travel/repair trip counts from movements
    const { travelCount, repairCount } = countPairsWithin(moves, from, to);

    // Repair logs within range
    const reps = repairsBySerial.get(serial) || [];
    let repairLogsCount = reps.length;
    let calibCount = 0;
    for (const r of reps) {
      const s = `${r?.repair_type || ''} ${r?.type || ''} ${r?.description || ''}`;
      if (/정도검사|교정/.test(s)) calibCount += 1;
    }

    for (const item of items) {
      const cur = aggByItem.get(item) || {
        item,
        samples: 0,
        sumUptimePct: 0,
        sumSitePct: 0,
        sumVendorPct: 0,
        sumCmesPct: 0,
        sumTrips: 0,
        sumRepairTrips: 0,
        sumRepairLogs: 0,
        sumCalibLogs: 0,
      };
      cur.samples += 1;
      cur.sumUptimePct += uptimePct;
      cur.sumSitePct += sitePct;
      cur.sumVendorPct += vendorPct;
      cur.sumCmesPct += cmesPct;
      cur.sumTrips += travelCount;
      cur.sumRepairTrips += repairCount;
      cur.sumRepairLogs += repairLogsCount;
      cur.sumCalibLogs += calibCount;
      aggByItem.set(item, cur);
    }
  }

  const data = Array.from(aggByItem.values()).map(v => ({
    category: v.item,
    avgUptimePct1Y: v.samples ? Math.round(v.sumUptimePct / v.samples) : 0,
    siteDaysPct1Y: v.samples ? Math.round(v.sumSitePct / v.samples) : 0,
    vendorDaysPct1Y: v.samples ? Math.round(v.sumVendorPct / v.samples) : 0,
    cmesDaysPct1Y: v.samples ? Math.round(v.sumCmesPct / v.samples) : 0,
    avgTrips1Y: v.samples ? Math.round((v.sumTrips / v.samples) * 10) / 10 : 0,
    avgRepairTrips1Y: v.samples ? Math.round((v.sumRepairTrips / v.samples) * 10) / 10 : 0,
    avgRepairsLogged1Y: v.samples ? Math.round((v.sumRepairLogs / v.samples) * 10) / 10 : 0,
    avgCalibrationsLogged1Y: v.samples ? Math.round((v.sumCalibLogs / v.samples) * 10) / 10 : 0,
    samples: v.samples,
  })).sort((a,b)=> a.category > b.category ? 1 : -1);

  const payload = {
    meta: {
      _schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      sources: [
        path.relative(PROJECT_ROOT, EQUIPMENT_FILE),
        path.relative(PROJECT_ROOT, MOVEMENTS_FILE),
        path.relative(PROJECT_ROOT, (repairsClean.length ? REPAIRS_CLEAN_FILE : REPAIRS_FILE))
      ],
      window: {
        from: `${from.getFullYear()}-${String(from.getMonth()+1).padStart(2,'0')}-${String(from.getDate()).padStart(2,'0')}`,
        to: `${to.getFullYear()}-${String(to.getMonth()+1).padStart(2,'0')}-${String(to.getDate()).padStart(2,'0')}`,
        businessDays: totalBizDays
      }
    },
    data
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2));
  console.log('written:', path.relative(PROJECT_ROOT, OUTPUT_FILE), 'rows:', data.length);
}

main();


