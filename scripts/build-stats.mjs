// 통계 산출: db/movements_db.json을 기반으로 출장/수리 회차 집계 생성
import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();
const DB_DIR = path.join(PROJECT_ROOT, 'db');
const INPUT_MOVES = path.join(DB_DIR, 'movements_db.json');
const OUTPUT_FILE = path.join(DB_DIR, 'stats_repairs_overview.json');

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

function classifyLocation(raw) {
  const s = (raw || '').toString();
  if (s.includes('업체')) return '업체';
  if (s.includes('현장')) return '현장';
  if (s.includes('청명')) return '청명';
  return s || '';
}

function loadMovements() {
  if (!fs.existsSync(INPUT_MOVES)) return [];
  try {
    const arr = JSON.parse(fs.readFileSync(INPUT_MOVES, 'utf8'));
    if (!Array.isArray(arr)) return [];
    return arr.map(m => ({
      date: parseYmd(m.date),
      outLocation: classifyLocation(m.outLocation),
      inLocation: classifyLocation(m.inLocation),
      serial: (m.serial || '').toString().trim(),
    })).filter(m => m.serial);
  } catch {
    return [];
  }
}

function buildOverview(movements) {
  const serialToMoves = new Map();
  for (const m of movements) {
    if (!serialToMoves.has(m.serial)) serialToMoves.set(m.serial, []);
    serialToMoves.get(m.serial).push(m);
  }
  for (const [serial, list] of serialToMoves) list.sort((a,b)=> (a.date>b.date?1:a.date<b.date?-1:0));

  let totalTravel = 0;
  let totalRepair = 0;
  const bySerial = [];

  for (const [serial, list] of serialToMoves) {
    let travelOpen = false; // 청명→현장 대기 상태
    let repairOpen = false; // 청명→업체 대기 상태
    let travelCount = 0;
    let repairCount = 0;
    let lastDate = '';

    for (const m of list) {
      lastDate = m.date || lastDate;
      const from = classifyLocation(m.outLocation);
      const to = classifyLocation(m.inLocation);

      // 출장 페어: 청명→현장 → 현장→청명
      if (from === '청명' && to === '현장') {
        travelOpen = true;
      } else if (travelOpen && from === '현장' && to === '청명') {
        travelCount += 1; travelOpen = false;
      }

      // 수리 페어: 청명→업체 → 업체→청명
      if (from === '청명' && to === '업체') {
        repairOpen = true;
      } else if (repairOpen && from === '업체' && to === '청명') {
        repairCount += 1; repairOpen = false;
      }
    }

    totalTravel += travelCount;
    totalRepair += repairCount;
    bySerial.push({ serial, travelCount, repairCount, lastDate });
  }

  bySerial.sort((a,b)=> (b.travelCount + b.repairCount) - (a.travelCount + a.repairCount) || (b.travelCount - a.travelCount) || (b.repairCount - a.repairCount) || (a.serial>b.serial?1:-1));

  return {
    _schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceFiles: ['db/movements_db.json'],
    totals: {
      travelCount: totalTravel,
      repairCount: totalRepair,
      serialsWithTravel: bySerial.filter(x=>x.travelCount>0).length,
      serialsWithRepair: bySerial.filter(x=>x.repairCount>0).length,
    },
    bySerial,
    rules: {
      travelPair: '청명→현장 후 현장→청명 = 출장 1회',
      repairPair: '청명→업체 후 업체→청명 = 수리 1회',
      notes: '페어가 완결될 때만 카운트. 중간 경로가 다른 경우 미완결로 간주'
    }
  };
}

function main() {
  const movements = loadMovements();
  const overview = buildOverview(movements);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(overview, null, 2));
  console.log('stats written:', path.relative(PROJECT_ROOT, OUTPUT_FILE));
}

main();


