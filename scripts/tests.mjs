import assert from 'assert';
import fs from 'fs';
import { vat, totalWithVat } from './calc.js';

function readJson(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }

// 1) DB 스키마 최소 필드 검사
const eq = readJson('./db/equipment_db.json');
assert(Array.isArray(eq) && eq.length>0, 'equipment_db empty');
assert(eq.every(e=>typeof e.serial==='string'&&'category' in e), 'equipment_db schema');

const mv = readJson('./db/movements_db.json');
assert(Array.isArray(mv) && mv.length>0, 'movements_db empty');
assert(mv.every(m=>typeof m.serial==='string' && 'inLocation' in m), 'movements_db schema');

// 2) lastMovement 동기화 샘플 확인(무작위 10개)
function slice10(s){return (s||'').slice(0,10);} 
const last = new Map();
for(const m of mv){ if(!m.serial||!m.date) continue; const d=slice10(m.date); if(!last.has(m.serial)||d>last.get(m.serial)) last.set(m.serial,d);} 
const sample = eq.slice(0,10);
for(const e of sample){ assert(slice10(e.lastMovement) === (last.get(e.serial)||''), 'lastMovement mismatch'); }

// 3) 통계 파일 존재
for (const f of ['stats_repairs_monthly.json','stats_repairs_topk.json','stats_repairs_overview.json']){
  assert(fs.existsSync('./db/'+f), `${f} missing`);
}

console.log('All tests passed');

// 계산 모듈 간단 테스트
assert(vat(1000) === 100, 'vat 10%');
assert(totalWithVat(1000) === 1100, 'totalWithVat 10%');
console.log('Calc tests passed');


