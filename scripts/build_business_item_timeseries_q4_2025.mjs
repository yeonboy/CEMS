// Build Q4 2025 item-month siteDays contributions per project
// Output: db/stats_business_item_timeseries_q4_2025.json

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();
const DB_DIR = path.join(PROJECT_ROOT, 'db');
const INPUT_CONTRACTS = path.join(DB_DIR, 'business_contracts_q4_2025.json');
const OUTPUT_FILE = path.join(DB_DIR, 'stats_business_item_timeseries_q4_2025.json');

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
function monthRangeKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth()+1, 0); }

const Q4_FROM = new Date('2025-10-01');
const Q4_TO = new Date('2025-12-31');

function monthsInQ4() {
  const list = [];
  for (let m = new Date(Q4_FROM); m <= Q4_TO; m.setMonth(m.getMonth()+1)) {
    list.push(new Date(m));
  }
  return list;
}

function deriveContractStats(contract) {
  const overlap = Number(contract.overlapQ4Days || 0);
  const totalSites = Number((contract?.siteCounts?.manual || 0) + (contract?.siteCounts?.automatic || 0));
  if (!(totalSites > 0)) return {};
  const out = {}; // item -> siteDays over Q4
  for (const p of ensureArray(contract.measurementPlans)) {
    const items = ensureArray(p.items).map(normalizeItemName);
    const days = Number(p.days || 0);
    if (!(days > 0)) continue;
    const active = overlap > 0 ? Math.min(days, overlap) : days;
    for (const it of items) {
      if (!it) continue;
      out[it] = (out[it] || 0) + totalSites * active;
    }
  }
  return out;
}

function splitQ4ByMonth(siteDaysTotal) {
  const months = monthsInQ4();
  const bizDaysByMonth = Object.fromEntries(months.map(m => [monthRangeKey(m), countBusinessDays(startOfMonth(m), endOfMonth(m))]));
  const totalBiz = Object.values(bizDaysByMonth).reduce((a,b)=> a+b, 0) || 1;
  const per = {};
  for (const m of months) {
    const mk = monthRangeKey(m);
    const share = (bizDaysByMonth[mk] || 0) / totalBiz;
    per[mk] = Math.round(siteDaysTotal * share);
  }
  return per;
}

function main() {
  const contracts = ensureArray(readJson(INPUT_CONTRACTS)?.data);
  const months = monthsInQ4().map(monthRangeKey);
  const rows = [];
  for (const r of contracts) {
    const items = deriveContractStats(r); // item -> total siteDays in Q4
    for (const [item, total] of Object.entries(items)) {
      const perMonth = splitQ4ByMonth(total);
      for (const mk of months) {
        rows.push({
          projectId: r.projectId,
          projectName: r.projectName,
          client: r.client,
          month: mk,
          category: item,
          requiredSiteDays: perMonth[mk] || 0,
          requiredManualSiteDays: Math.round(perMonth[mk] * ((r.siteCounts?.manual||0) / (Math.max(1,(r.siteCounts?.manual||0) + (r.siteCounts?.automatic||0))))) || 0,
          requiredAutomaticSiteDays: Math.round(perMonth[mk] * ((r.siteCounts?.automatic||0) / (Math.max(1,(r.siteCounts?.manual||0) + (r.siteCounts?.automatic||0))))) || 0
        });
      }
    }
  }
  rows.sort((a,b)=> a.category===b.category ? (a.month===b.month ? (a.projectName>b.projectName?1:-1) : (a.month>b.month?1:-1)) : (a.category>b.category?1:-1));

  const payload = {
    meta: {
      _schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      sources: [path.relative(PROJECT_ROOT, INPUT_CONTRACTS)],
      months
    },
    data: rows
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2));
  console.log('written:', path.relative(PROJECT_ROOT, OUTPUT_FILE), 'rows:', rows.length);
}

main();


