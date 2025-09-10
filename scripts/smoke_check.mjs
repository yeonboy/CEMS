import fs from 'fs';
import path from 'path';

function readJson(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}

function slice10(s) { return (s || '').toString().slice(0, 10); }

function verifyLastMovementSync(equipment, movements) {
  const lastDates = new Map();
  for (const m of movements) {
    if (!m || !m.serial || !m.date) continue;
    const d = slice10(m.date);
    const prev = lastDates.get(m.serial);
    if (!prev || d > prev) lastDates.set(m.serial, d);
  }
  const mismatches = [];
  for (const e of equipment) {
    const ld = slice10(e.lastMovement);
    const expect = lastDates.get(e.serial) || '';
    if (expect !== ld) {
      mismatches.push({ serial: e.serial, expect, actual: ld });
      if (mismatches.length >= 20) break;
    }
  }
  return mismatches;
}

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }

const ROOT = process.cwd();
const DB = path.join(ROOT, 'db');

const files = {
  equipment: path.join(DB, 'equipment_db.json'),
  movements: path.join(DB, 'movements_db.json'),
  repairs: path.join(DB, 'repairs_db_clean.json'),
  statsMonthly: path.join(DB, 'stats_repairs_monthly.json'),
  statsTopk: path.join(DB, 'stats_repairs_topk.json'),
  statsOverview: path.join(DB, 'stats_repairs_overview.json'),
};

const equipment = readJson(files.equipment) || [];
const movements = readJson(files.movements) || [];
const repairs = readJson(files.repairs) || [];

const statsMonthly = readJson(files.statsMonthly);
const statsTopk = readJson(files.statsTopk);
const statsOverview = readJson(files.statsOverview);

const mismatchSamples = verifyLastMovementSync(equipment, movements);

const summary = {
  filesPresent: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, exists(v)])),
  counts: {
    equipment: Array.isArray(equipment) ? equipment.length : -1,
    movements: Array.isArray(movements) ? movements.length : -1,
    repairs: Array.isArray(repairs) ? repairs.length : -1,
  },
  statsOk: {
    monthly: !!statsMonthly,
    topk: !!statsTopk,
    overview: !!statsOverview,
  },
  mismatches: mismatchSamples.length,
  sample: mismatchSamples,
};

console.log(JSON.stringify(summary, null, 2));


