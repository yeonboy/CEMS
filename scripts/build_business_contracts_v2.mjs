// Build business contracts v2 with exclusive phases per month
// - Input: 청명장비 엑셀/계약정리.csv (same as v1)
// - Output: db/backend_business_contracts_v2.json
// - Adds: phases (construction/operation/post/strategy) with non-overlapping monthly allocation and per-month phase map

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import iconv from 'iconv-lite';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SOURCE_FILE = path.resolve(PROJECT_ROOT, '청명장비 엑셀', '계약정리.csv');
const DB_DIR = path.resolve(PROJECT_ROOT, 'db');
const OUTPUT_FILE = path.join(DB_DIR, 'backend_business_contracts_v2.json');

const Q4_FROM = new Date('2025-10-01T00:00:00');
const Q4_TO = new Date('2025-12-31T23:59:59');

class CsvIO {
  static decodeBest(buf){
    const tryUtf8 = buf.toString('utf8');
    if (!/�/.test(tryUtf8)) return tryUtf8;
    try { const cp949 = iconv.decode(buf, 'cp949'); if (cp949 && cp949.length) return cp949; } catch {}
    return tryUtf8;
  }
  static readContractsCsv(){
    if (!fs.existsSync(SOURCE_FILE)) return [];
    const buf = fs.readFileSync(SOURCE_FILE);
    const text = CsvIO.decodeBest(buf);
    return parse(text, { relaxColumnCount: true, skipEmptyLines: true });
  }
}

function toInt(v){ if (v == null) return 0; const m = String(v).match(/-?\d+/); return m ? parseInt(m[0], 10) : 0; }

function normalizeDateLike(s){
  const str = String(s || '').trim(); if (!str) return '';
  const mYmd = str.match(/(\d{4})[./-]?(\d{1,2})[./-]?(\d{1,2})/);
  if (mYmd) { const y=mYmd[1]; const mo=String(mYmd[2]).padStart(2,'0'); const d=String(mYmd[3]).padStart(2,'0'); return `${y}-${mo}-${d}`; }
  const mYm = str.match(/(\d{4})[./-]?(\d{1,2})/);
  if (mYm) { const y=mYm[1]; const mo=String(mYm[2]).padStart(2,'0'); return `${y}-${mo}-01`; }
  return '';
}
function parsePeriod(rangeStr){ const s=String(rangeStr||'').trim(); const [a,b]=s.split('~').map(x=> normalizeDateLike(x)); return { from: a||'', to: b||'' }; }
function monthKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function monthsBetween(fromIso, toIso){
  try { const a = new Date(fromIso + 'T00:00:00'); const b = new Date(toIso + 'T23:59:59');
    const start = new Date(a.getFullYear(), a.getMonth(), 1); const end = new Date(b.getFullYear(), b.getMonth(), 1);
    const keys=[]; const cur = new Date(start);
    while (cur <= end){ keys.push(monthKey(cur)); cur.setMonth(cur.getMonth()+1); }
    return keys;
  } catch { return []; }
}
function overlapMonthsClamped(fromIso, toIso, clampFrom, clampTo){
  try { const a = fromIso ? new Date(fromIso + 'T00:00:00') : null; const b = toIso ? new Date(toIso + 'T23:59:59') : null; if (!a||!b) return [];
    const start = a > clampFrom ? a : clampFrom; const end = b < clampTo ? b : clampTo; if (end < start) return [];
    return monthsBetween(start.toISOString().slice(0,10), end.toISOString().slice(0,10));
  } catch { return []; }
}
function parseClassificationCell(text){
  const s=String(text||'').trim();
  const mTotal=s.match(/총\s*(\d+)\s*회/); const mReq=s.match(/의뢰\s*(\d+)\s*회/);
  return { totalSurveys: mTotal?parseInt(mTotal[1],10):0, requestedSurveys: mReq?parseInt(mReq[1],10):0, raw:s };
}
function parseRemainingExecutions(text){ const s=String(text||'').trim(); const m=s.match(/(\d+)\s*회/); if (m){ const n=parseInt(m[1],10); return isFinite(n)?n:0; } const onlyNum = s.match(/^\d+$/)?parseInt(s,10):NaN; if (isFinite(onlyNum)){ if (onlyNum>=2000 && onlyNum<=2099) return 0; return onlyNum; } return 0; }

class PhaseAllocator {
  // Allocate Q4 by explicit sub-periods: construction(E col), operation(F col)
  static allocateQ4BySubPeriods(constructionPeriod, operationPeriod){
    const resultMonths = new Map(); // month -> phase
    const consMs = (constructionPeriod && constructionPeriod.from && constructionPeriod.to)
      ? overlapMonthsClamped(constructionPeriod.from, constructionPeriod.to, Q4_FROM, Q4_TO) : [];
    const operMs = (operationPeriod && operationPeriod.from && operationPeriod.to)
      ? overlapMonthsClamped(operationPeriod.from, operationPeriod.to, Q4_FROM, Q4_TO) : [];
    // Mark construction first
    consMs.forEach(mk => resultMonths.set(mk, 'construction'));
    // Operation overrides if overlaps same month
    operMs.forEach(mk => resultMonths.set(mk, 'operation'));
    return resultMonths;
  }
}

function build(){
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  const records = CsvIO.readContractsCsv();
  const data = [];
  for (let i=0;i<records.length;i++){
    const row = records[i];
    const projectName = (row[1] || '').toString().trim();
    const client = (row[2] || '').toString().trim();
    const period = parsePeriod(row[3] || '');
    if (!projectName || !client || projectName === '사업명' || client === '의뢰사') continue;
    const construction = parseClassificationCell(row[4] || '');
    const operation = parseClassificationCell(row[5] || '');
    const post = parseClassificationCell(row[6] || '');
    const strategyRaw = (row[7] || '').toString().trim();
    const strategyRemaining = parseRemainingExecutions(row[7]);
    const manualSites = toInt(row[8]);
    const autoSites = toInt(row[9]);

    // Parse sub-periods from E(4)=construction, F(5)=operation
    const constructionPeriod = parsePeriod(row[4] || '');
    const operationPeriod = parsePeriod(row[5] || '');
    const postPeriod = parsePeriod(row[6] || '');
    // Allocate exclusive phases per Q4 month from sub-periods
    const alloc = PhaseAllocator.allocateQ4BySubPeriods(constructionPeriod, operationPeriod);
    // Derive consolidated continuous periods for construction/operation from month map
    function periodFromMonths(target){
      const months = Array.from(alloc.entries()).filter(([_,ph])=> ph===target).map(([mk])=> mk).sort();
      if (!months.length) return null;
      const [y1,m1] = months[0].split('-').map(Number); const [y2,m2] = months[months.length-1].split('-').map(Number);
      const from = new Date(y1, m1-1, 1).toISOString().slice(0,10);
      const to = new Date(y2, m2, 0).toISOString().slice(0,10);
      return { from, to };
    }

    const phases = [];
    const consPeriod = periodFromMonths('construction');
    if (consPeriod) phases.push({ name:'construction', type:'period', period: consPeriod, siteCounts:{ manual: manualSites, automatic: autoSites } });
    const operPeriod = periodFromMonths('operation');
    if (operPeriod) phases.push({ name:'operation', type:'period', period: operPeriod, siteCounts:{ manual: manualSites, automatic: autoSites } });
    // post: Q4 교집합이 있을 때만 이벤트(날짜는 교집합 종료일)
    try {
      const postMonths = (postPeriod?.from && postPeriod?.to) ? overlapMonthsClamped(postPeriod.from, postPeriod.to, Q4_FROM, Q4_TO) : [];
      if (post?.raw && postMonths.length > 0) {
        // clamp end date
        const endDate = (function(){
          try {
            const to = new Date(postPeriod.to + 'T23:59:59');
            const end = to < Q4_TO ? to : Q4_TO;
            return end.toISOString().slice(0,10);
          } catch { return null; }
        })();
        phases.push({ name:'post', type:'event', date: endDate, note: post.raw });
      }
    } catch {}
    if (strategyRemaining>0){
      phases.push({ name:'strategy', type:'event', count: strategyRemaining, note: strategyRaw||'' });
    }

    // Build per-month phase map for Q4
    const phaseByMonth = {};
    for (const [mk, ph] of alloc.entries()) if (ph) phaseByMonth[mk] = ph;

    // Q4 flags for counting in UI
    const hasPostQ4 = (postPeriod?.from && postPeriod?.to) ? (overlapMonthsClamped(postPeriod.from, postPeriod.to, Q4_FROM, Q4_TO).length > 0) : false;
    const hasStrategyQ4 = strategyRemaining > 0 ? (overlapMonthsClamped((period?.from||''),(period?.to||''), Q4_FROM, Q4_TO).length > 0) : false;

    data.push({
      projectId: `row-${i+1}`,
      projectName, client,
      basePeriod: period,
      phases,
      phaseByMonth,
      exclusivity: true,
      flags: { hasPostQ4, hasStrategyQ4 },
      source: { file: path.relative(PROJECT_ROOT, SOURCE_FILE), row: i+1 }
    });
  }

  const payload = { meta: { _schemaVersion: '2.0.0', generatedAt: new Date().toISOString(), quarter: { from: '2025-10-01', to: '2025-12-31' } }, data };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2));
  console.log('written:', path.relative(PROJECT_ROOT, OUTPUT_FILE), 'rows:', data.length);
}

build();


