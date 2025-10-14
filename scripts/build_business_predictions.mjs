// Compute equipment usage requirements from business contracts and write predictions v2
import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();
const DB_DIR = path.join(PROJECT_ROOT, 'db');
const INPUT_CONTRACTS = path.join(DB_DIR, 'business_contracts_q4_2025.json');
const INPUT_EQUIP = path.join(DB_DIR, 'equipment_db.json');
const OUTPUT = path.join(DB_DIR, 'stats_equipment_uptime_predictions_v2.json');

// 4분기 영업일수 계산 (2025-10-01 ~ 2025-12-31)
function countBusinessDays(start, end) {
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  let days = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) days++; // 월~금만 카운트
  }
  return days;
}

const Q4_FROM = new Date('2025-10-01');
const Q4_TO = new Date('2025-12-31');
const Q4_BUSINESS_DAYS = countBusinessDays(Q4_FROM, Q4_TO);

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

// 측정항목 확장: ALL_8 등 묶음 표기 시 개별 항목으로 전개
function expandItems(items) {
  const out = [];
  const ALL8 = ['PM-10','PM-2.5','NO2','SO2','CO','O3','Pb','벤젠'];
  for (const itRaw of (Array.isArray(items) ? items : [])) {
    const it = normalizeItemName(itRaw);
    if (!it) continue;
    if (it === 'ALL_8' || it === 'ALL' || it === 'ALL8') {
      out.push(...ALL8);
    } else {
      out.push(it);
    }
  }
  return out;
}

function buildInventoryByItem(equipmentArray) {
  const cover = {};
  for (const e of equipmentArray) {
    const cat = (e?.category || '').toString();
    const m = cat.match(/^\(([^)]+)\)/);
    if (!m) continue;
    const tokens = m[1].split(',').map(t => t.trim()).filter(Boolean);
    const items = tokens.map(normalizeItemName);
    for (const it of items) {
      if (!it) continue;
      cover[it] = (cover[it] || 0) + 1;
    }
  }
  return cover;
}

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

function ensureArray(x) { return Array.isArray(x) ? x : []; }

function deriveRequiredStats(contract) {
  // 항목별 필요 지점수와 지점-일(site-days) 누계(중복 측정항목은 묶어서 max 일수만 반영)
  const overlap = Number(contract.overlapQ4Days || 0);
  const manualSites = Number(contract.siteCounts?.manual || 0);
  const autoSites = Number(contract.siteCounts?.automatic || 0);
  const totalSites = manualSites + autoSites;
  if (!totalSites) return {};
  const plans = ensureArray(contract.measurementPlans);
  // 1) 항목별로 적용 일수의 최대값만 채택하여 중복 집계를 방지
  const maxDaysByItem = new Map();
  for (const p of plans) {
    const items = expandItems(p.items);
    const planDays = Number(p.days || 0);
    if (!(planDays > 0)) continue; // 0일은 미반영
    const activeDays = overlap > 0 ? Math.min(planDays, overlap) : planDays;
    for (const it of items) {
      if (!it) continue;
      const prev = maxDaysByItem.get(it) || 0;
      if (activeDays > prev) maxDaysByItem.set(it, activeDays);
    }
  }
  // 2) 사이트/지점-일 집계(자동/수동 분리 값 포함)
  const out = {};
  for (const [it, maxDays] of maxDaysByItem) {
    out[it] = {
      sites: totalSites,
      siteDays: totalSites * maxDays,
      manualSites,
      automaticSites: autoSites,
      manualSiteDays: manualSites * maxDays,
      automaticSiteDays: autoSites * maxDays,
    };
  }
  return out;
}

function main() {
  const contracts = readJson(INPUT_CONTRACTS);
  const equipment = readJson(INPUT_EQUIP);
  const rows = ensureArray(contracts?.data);
  const eqArr = ensureArray(equipment);

  const inventoryByItem = buildInventoryByItem(eqArr);

  const needs = {};
  for (const c of rows) {
    const req = deriveRequiredStats(c);
    for (const [item, v] of Object.entries(req)) {
      const cur = needs[item] || { sites: 0, siteDays: 0, manualSiteDays: 0, automaticSiteDays: 0 };
      cur.sites += (v.sites || 0);
      cur.siteDays += (v.siteDays || 0);
      cur.manualSiteDays += (v.manualSiteDays || 0);
      cur.automaticSiteDays += (v.automaticSiteDays || 0);
      needs[item] = cur;
    }
  }

  const data = Object.keys(needs).sort().map(item => {
    const requiredSites = needs[item].sites;
    const requiredSiteDays = needs[item].siteDays;
    const owned = inventoryByItem[item] || 0;
    const capacitySiteDays = owned * Q4_BUSINESS_DAYS;
    const coveragePct = capacitySiteDays > 0 ? Math.min(100, Math.round((requiredSiteDays / capacitySiteDays) * 100)) : 0;
    return {
      category: item,
      requiredDevices: requiredSites,
      requiredSiteDays,
      requiredManualSiteDays: needs[item].manualSiteDays || 0,
      requiredAutomaticSiteDays: needs[item].automaticSiteDays || 0,
      ownedDevices: owned,
      predictedUptimePct: coveragePct,
      predictionBasis: 'item_sites_and_siteDays_vs_inventory'
    };
  });

  const payload = {
    meta: {
      _schemaVersion: '2.0.0',
      generatedAt: new Date().toISOString(),
      sources: [path.relative(PROJECT_ROOT, INPUT_CONTRACTS), path.relative(PROJECT_ROOT, INPUT_EQUIP)],
      quarterBusinessDays: Q4_BUSINESS_DAYS
    },
    data
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2));
  console.log('written:', path.relative(PROJECT_ROOT, OUTPUT), 'rows:', data.length);
}

main();



