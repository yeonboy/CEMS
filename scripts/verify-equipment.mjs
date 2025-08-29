import fs from 'fs';
import path from 'path';

const DB_DIR = path.resolve(path.join(process.cwd(), 'db'));
const EQUIPMENT_FILE = path.join(DB_DIR, 'equipment_db.json');
const MOVEMENTS_FILE = path.join(DB_DIR, 'movements_db.json');

function parseYmd(dateLike) {
  if (!dateLike) return '';
  const s = String(dateLike).trim();
  const m = s.match(/^(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

function classifyByInLocation(inLocation) {
  const s = String(inLocation || '');
  if (/현장/.test(s)) return { status: '가동 중', loc: '현장' };
  if (/청명|본사/.test(s)) return { status: '대기 중', loc: '본사 창고' };
  if (/업체/.test(s)) return { status: '수리중', loc: '업체' };
  return { status: '대기 중', loc: s || '본사 창고' };
}

function loadJsonArray(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    const arr = JSON.parse(txt);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

const equipment = loadJsonArray(EQUIPMENT_FILE);
const movements = loadJsonArray(MOVEMENTS_FILE);

const bySerial = new Map();
for (const m of movements) {
  if (!m || !m.serial) continue;
  const d = parseYmd(m.date);
  if (!d) continue;
  const arr = bySerial.get(m.serial) || [];
  arr.push({ date: d, inLocation: m.inLocation || '', outLocation: m.outLocation || '' });
  bySerial.set(m.serial, arr);
}
for (const [sn, arr] of bySerial) arr.sort((a, b) => a.date.localeCompare(b.date));

let total = 0;
let withMove = 0;
let noMove = 0;
let mismatches = 0;
const samples = [];

for (const e of equipment) {
  total++;
  const arr = bySerial.get(e.serial) || [];
  if (arr.length === 0) { noMove++; continue; }
  withMove++;
  const last = arr[arr.length - 1];
  const judged = classifyByInLocation(last.inLocation || '');
  const okStatus = (e.status === judged.status);
  const okLoc = (e.currentLocation === judged.loc);
  const okDate = (String(e.lastMovement || '').slice(0, 10) === last.date);
  if (!(okStatus && okLoc && okDate)) {
    mismatches++;
    if (samples.length < 20) {
      samples.push({
        serial: e.serial,
        expected: { status: judged.status, loc: judged.loc, date: last.date },
        actual: { status: e.status, loc: e.currentLocation, date: String(e.lastMovement || '').slice(0, 10) },
        lastIn: last.inLocation,
        lastOut: last.outLocation,
      });
    }
  }
}

const summary = { total, withMove, noMove, mismatches, sampleMismatches: samples };
console.log(JSON.stringify(summary, null, 2));


