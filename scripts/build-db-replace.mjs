// 빌드 스크립트(대체): 이동/수리 DB를 "소스 기준으로 완전 재구성"합니다.
// - 기존 파일과 병합/유니온하지 않음 → CSV 변경(삭제 포함)이 그대로 반영됨
// - 출력은 기존 경로(db/, 개발현황자료전달/) 동일, 스키마는 유지
// 실행: node scripts/build-db-replace.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';
import iconv from 'iconv-lite';
import { parse } from 'csv-parse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.resolve(PROJECT_ROOT, '청명장비 엑셀');
const OUTPUT_ROOT = path.resolve('C:/Users/User/Desktop/cmes 데모/개발현황자료전달');
const PUBLIC_DB_DIR = path.resolve(PROJECT_ROOT, 'db');
if (!fs.existsSync(OUTPUT_ROOT)) fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
if (!fs.existsSync(PUBLIC_DB_DIR)) fs.mkdirSync(PUBLIC_DB_DIR, { recursive: true });

const INPUT_FILES = {
  serialsCsv: path.join(SOURCE_DIR, 'serials.csv'),
  movementCsv: path.join(SOURCE_DIR, 'logs.csv'),
  repairXlsx: path.join(SOURCE_DIR, '수리내역logs.xlsx'),
};

const OUTPUT_FILES = {
  equipmentJson: path.join(OUTPUT_ROOT, 'equipment_db.json'),
  movementsJson: path.join(OUTPUT_ROOT, 'movements_db.json'),
  repairsJson: path.join(OUTPUT_ROOT, 'repairs_db.json'),
  equipmentCsv: path.join(OUTPUT_ROOT, 'equipment_db.csv'),
  movementsCsv: path.join(OUTPUT_ROOT, 'movements_db.csv'),
  repairsCsv: path.join(OUTPUT_ROOT, 'repairs_db.csv'),
};

const PUBLIC_FILES = {
  equipmentJson: path.join(PUBLIC_DB_DIR, 'equipment_db.json'),
  movementsJson: path.join(PUBLIC_DB_DIR, 'movements_db.json'),
  repairsJson: path.join(PUBLIC_DB_DIR, 'repairs_db.json'),
};

function chooseBestKoreanDecoding(buf) {
  const candidates = [
    { enc: 'utf8', text: (()=>{ try { return buf.toString('utf8'); } catch { return ''; } })() },
    { enc: 'utf16le', text: (()=>{ try { return buf.toString('utf16le'); } catch { return ''; } })() },
    { enc: 'euc-kr', text: (()=>{ try { return iconv.decode(buf, 'euc-kr'); } catch { return ''; } })() },
    { enc: 'cp949', text: (()=>{ try { return iconv.decode(buf, 'cp949'); } catch { return ''; } })() },
  ];
  const score = (s) => {
    if (!s) return -1e9;
    const hangul = (s.match(/[가-힣]/g) || []).length;
    const replacement = (s.match(/�/g) || []).length;
    return hangul * 5 - replacement * 10;
  };
  let best = candidates[0];
  for (const c of candidates) if (score(c.text) > score(best.text)) best = c;
  return best.text;
}

function detectDelimiter(text) {
  const firstLine = (text.split(/\r?\n/)[0] || '');
  let inQuote = false; let tab = 0; let comma = 0;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote) {
      if (ch === '\t') tab++;
      else if (ch === ',') comma++;
    }
  }
  if (tab > comma) return '\t';
  if (comma > tab) return ',';
  if (/\t,|,\t/.test(firstLine)) return ',';
  return comma > 0 ? ',' : (tab > 0 ? '\t' : ',');
}

function normalizeCsvText(text) {
  let t = (text || '').replace(/\r\n?/g, '\n');
  const lines = t.split('\n');
  if (lines[0] && /회사명|장비투입현황/.test(lines[0])) lines.shift();
  t = lines.join('\n');
  t = t.replace(/\t\s*,/g, ',').replace(/,\s*\t/g, ',');
  return t;
}

function readCsvWithHeader(filePath) {
  const buf = fs.readFileSync(filePath);
  const raw = chooseBestKoreanDecoding(buf);
  const text = normalizeCsvText(raw);
  const delimiter = detectDelimiter(text);
  const tryParse = (delim, opts = {}) => new Promise((resolve, reject) => {
    parse(
      text,
      Object.assign(
        {
          relax_column_count: true,
          relax_quotes: true,
          skip_records_with_error: false,
          trim: true,
          bom: true,
          columns: true,
          skip_empty_lines: true,
          delimiter: delim,
        },
        opts
      ),
      (err, records) => {
        if (err) return reject(err);
        resolve(records);
      }
    );
  });
  return tryParse(delimiter)
    .catch(() => tryParse(delimiter, { quote: "'" }))
    .catch(() => tryParse(delimiter === '\t' ? ',' : '\t'))
    .catch((lastErr) => { throw lastErr; });
}

function readCsvAuto(filePath) {
  const buf = fs.readFileSync(filePath);
  const raw = chooseBestKoreanDecoding(buf);
  const text = normalizeCsvText(raw);
  const delimiter = detectDelimiter(text);
  const tryParse = (delim, opts = {}) => new Promise((resolve, reject) => {
    parse(
      text,
      Object.assign(
        {
          relax_column_count: true,
          relax_quotes: true,
          skip_records_with_error: false,
          trim: true,
          bom: true,
          delimiter: delim,
        },
        opts
      ),
      (err, records) => {
        if (err) return reject(err);
        resolve(records);
      }
    );
  });
  return tryParse(delimiter)
    .catch(() => tryParse(delimiter, { quote: "'" }))
    .catch(() => tryParse(delimiter === '\t' ? ',' : '\t'))
    .catch((lastErr) => { throw lastErr; });
}

function normalizeKey(key){
  return (key || '').toString().trim().replace(/["']/g,'').toLowerCase().replace(/\s+/g,'').replace(/[._-]+/g,'');
}
function sanitizeCell(value){
  let s = (value ?? '').toString();
  if (!s) return '';
  s = s.trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  s = s.replace(/^\","/, '').replace(/^",\"/, '').replace(/^\",\"/, '').replace(/^",/, '').replace(/,\"$/, '').replace(/\",$/, '').replace(/\"\"/g, '"').trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s.trim();
}
function getByKeys(row, keys){
  if (Array.isArray(row)) return undefined;
  const map = new Map(Object.keys(row||{}).map(k=>[normalizeKey(k), row[k]]));
  for (const key of keys){
    const v = map.get(normalizeKey(key));
    if (v!==undefined && v!==null && String(v).trim()!=='') return String(v).trim();
  }
  return '';
}
function parseYmd(dateStr){
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

function toCsv(rows, headers){
  const escape = (v)=>{
    const s=(v??'').toString();
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"'+s.replace(/"/g,'""')+'"';
    return s;
  };
  const lines=[headers.join(',')].concat(rows.map(r=> headers.map(h=> escape(r[h])).join(',')));
  return lines.join('\n');
}

function assertJsonValid(file, validator){
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw);
  const errors = validator(parsed);
  if (errors.length) throw new Error(`${path.basename(file)} 유효성 오류: \n- ${errors.join('\n- ')}`);
}

function validateEquipmentArray(arr){
  const errors=[]; if(!Array.isArray(arr)) return ['equipment_db: 배열 아님'];
  const seen=new Set();
  for (const [i,r] of arr.entries()){
    if(!r||typeof r!=='object'){errors.push(`#${i}: 객체 아님`);continue;}
    if(!r.serial||typeof r.serial!=='string') errors.push(`#${i}: serial 누락`);
    if(!r.category||typeof r.category!=='string') errors.push(`#${i}: category 누락`);
    if(seen.has(r.serial)) errors.push(`#${i}: serial 중복(${r.serial})`); else seen.add(r.serial);
  }
  return errors;
}
function validateMovementsArray(arr){
  const errors=[]; if(!Array.isArray(arr)) return ['movements_db: 배열 아님'];
  for (const [i,r] of arr.entries()){
    if(!r||typeof r!=='object'){errors.push(`#${i}: 객체 아님`);continue;}
    if(!r.serial||typeof r.serial!=='string') errors.push(`#${i}: serial 누락`);
  }
  return errors;
}
function validateRepairsArray(arr){
  const errors=[]; if(!Array.isArray(arr)) return ['repairs_db: 배열 아님'];
  for (const [i,r] of arr.entries()){
    if(!r||typeof r!=='object'){errors.push(`#${i}: 객체 아님`);continue;}
    if(!r.serial||typeof r.serial!=='string') errors.push(`#${i}: serial 누락`);
  }
  return errors;
}

async function build(){
  console.log('=== Build DB (replace): START ===');

  // 1) serials.csv → equipment
  let equipment=[];
  if (fs.existsSync(INPUT_FILES.serialsCsv)){
    try {
      const serialRows = await readCsvWithHeader(INPUT_FILES.serialsCsv);
      for (const r of serialRows){
        const serial = getByKeys(r, ['일련번호','S/N','SN','Serial']);
        const category = getByKeys(r, ['품목계열','품목','카테고리','Category']);
        if (!serial) continue;
        equipment.push({ serial, category });
      }
    } catch {
      const serials = await readCsvAuto(INPUT_FILES.serialsCsv);
      for (let i=1;i<serials.length;i++){
        const row = serials[i]; if(!row) continue;
        const category = (row[1]||'').toString().trim();
        const serial = (row[2]||'').toString().trim();
        if (!serial) continue;
        equipment.push({ serial, category });
      }
    }
  }

  // 2) 이동 이력
  function listMovementFiles(){
    const files=new Set();
    try {
      const names = fs.readdirSync(SOURCE_DIR);
      for (const n of names){
        const lower=(n||'').toLowerCase();
        if (lower.endsWith('.csv') && (lower.includes('movements') || lower.includes('이동'))){
          files.add(path.join(SOURCE_DIR, n));
        }
      }
    } catch {}
    if (fs.existsSync(INPUT_FILES.movementCsv)) files.add(INPUT_FILES.movementCsv);
    return Array.from(files);
  }

  function parseMovementRows(moveRows){
    const out=[]; const stockRows=[];
    for (const r of moveRows){
      const dateRaw = sanitizeCell(getByKeys(r, ['일자-No.','일자','입고일자','출고일자','일시','날짜','Date','등록일','기준일','재고일']));
      const outLocationRaw = sanitizeCell(getByKeys(r, ['출고창고명','출고창고','출고','From','from','출고지','출고(창고)','출고위치']));
      const inLocationRaw = sanitizeCell(getByKeys(r, ['입고창고명','입고창고','입고','To','to','입고지','입고(창고)','입고위치','현재위치']));
      const equipmentNameRaw = sanitizeCell(getByKeys(r, ['장비명','품명','품목명','Name','Equipment']));
      const serialRaw = sanitizeCell(getByKeys(r, ['규격','일련번호','S/N','SN','Serial','Serial No','SerialNo','SerialNo.','일련 No','일련 No.']));
      const qtyStr = sanitizeCell(getByKeys(r, ['수량','Qty','수량(EA)','재고','재고수량','수'])) || '1';
      const noteRaw = sanitizeCell(getByKeys(r, ['비고','메모','Note','장비상태']));
      const statusRaw = sanitizeCell(getByKeys(r, ['상태','Status','장비상태']));
      const date = parseYmd(dateRaw);
      const outLocation = sanitizeCell(outLocationRaw);
      const inLocation = sanitizeCell(inLocationRaw);
      const equipmentName = equipmentNameRaw;
      const serial = serialRaw;
      const note = noteRaw;
      const status = statusRaw;
      const quantity = parseInt((qtyStr || '1').replace(/[^0-9-]/g,'')) || 1;
      if (!serial) continue;
      const stockCheong = sanitizeCell(getByKeys(r, ['청명','본사','본사창고','청명창고']));
      const stockHyun = sanitizeCell(getByKeys(r, ['현장','현장재고']));
      const stockUpche = sanitizeCell(getByKeys(r, ['업체','수리업체','외주','협력사']));
      const hasStock = [stockCheong, stockHyun, stockUpche].some(v => String(v||'').trim() !== '');
      if (hasStock){
        stockRows.push({ date, serial, cheong: parseInt(String(stockCheong||'0').replace(/[^0-9-]/g,''))||0, hyun: parseInt(String(stockHyun||'0').replace(/[^0-9-]/g,''))||0, upche: parseInt(String(stockUpche||'0').replace(/[^0-9-]/g,''))||0 });
      } else {
        out.push({ date, outLocation, inLocation, equipmentName, serial, quantity, note, status });
      }
    }
    for (const s of stockRows){
      let inLoc='';
      if (s.upche>0) inLoc='업체'; else if (s.hyun>0) inLoc='현장'; else if (s.cheong>0) inLoc='청명';
      out.push({ date: s.date, outLocation: '', inLocation: inLoc, equipmentName: '', serial: s.serial, quantity: 1, note: '', status: '' });
    }
    return out;
  }

  const movementFiles = listMovementFiles();
  let movements=[]; let parsedCount=0;
  for (const f of movementFiles){
    let ok=false;
    try {
      const rows = await readCsvWithHeader(f);
      const part = parseMovementRows(rows);
      movements.push(...part); parsedCount += part.length; ok = true;
    } catch {}
    if (!ok){
      try {
        const rowsRaw = await readCsvAuto(f);
        for (let i=1;i<rowsRaw.length;i++){
          const r = rowsRaw[i]; if(!r) continue;
          const date = parseYmd(sanitizeCell(r[0]||''));
          const outLocation = sanitizeCell(r[1]||'');
          const inLocation = sanitizeCell(r[2]||'');
          const equipmentName = sanitizeCell(r[3]||'');
          const serial = sanitizeCell(r[4]||'');
          const quantity = parseInt((sanitizeCell(r[5]||'1')).replace(/[^0-9-]/g,''))||1;
          const note = sanitizeCell(r[6]||'');
          const status = sanitizeCell(r[7]||'');
          if (!serial) continue;
          movements.push({ date, outLocation, inLocation, equipmentName, serial, quantity, note, status });
          parsedCount++;
        }
      } catch {}
    }
  }
  // 정렬 및 정제
  movements = movements.filter(m=> m && m.serial).map(m=> ({
    date: parseYmd(m.date||''),
    outLocation: m.outLocation||'',
    inLocation: m.inLocation||'',
    equipmentName: m.equipmentName||'',
    serial: (m.serial||'').toString().trim(),
    quantity: typeof m.quantity==='number'? m.quantity : (parseInt(String(m.quantity||'1').replace(/[^0-9-]/g,''))||1),
    note: m.note||'',
    status: m.status||'',
  })).sort((a,b)=> (a.date||'') < (b.date||'') ? -1 : 1);
  console.log('[movements replace] 소스 파일 수:', movementFiles.length, '행 수:', parsedCount, '정제 후:', movements.length);

  // 3) 수리
  let repairs=[];
  if (fs.existsSync(INPUT_FILES.repairXlsx)){
    const wb = xlsx.read(fs.readFileSync(INPUT_FILES.repairXlsx));
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const repairsRows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    repairs = repairsRows.map(r=>{
      const date = (r['일자'] || r['입고일자'] || r['수리일자'] || r['Date'] || '').toString().trim();
      const serial = (r['일련번호'] || r['S/N'] || r['SN'] || r['Serial'] || '').toString().trim();
      const company = (r['업체'] || r['수리업체'] || r['입고처'] || r['Company'] || '').toString().trim();
      const details = (r['내용'] || r['비고'] || r['내역'] || r['Details'] || '').toString().trim();
      const costRaw = (r['비용'] || r['수리비용'] || r['금액'] || r['Cost'] || '').toString().trim();
      const cost = parseInt(costRaw.replace(/[^0-9]/g,'')) || 0;
      return { date: parseYmd(date), serial, company, details, cost };
    }).filter(x=>x.serial);
  }

  // 4) 장비 정보 보강(마지막 이동 기준 상태/위치)
  const serialToMovements = new Map();
  for (const m of movements){
    if (!serialToMovements.has(m.serial)) serialToMovements.set(m.serial, []);
    serialToMovements.get(m.serial).push(m);
  }
  for (const [serial, list] of serialToMovements) list.sort((a,b)=> new Date(a.date) - new Date(b.date));

  const equipmentMap = new Map(equipment.map(e=> [e.serial, e]));
  const enrichedEquipment = equipment.map(e=>{
    const moves = serialToMovements.get(e.serial) || [];
    const lastMove = moves[moves.length - 1];
    let currentLocation = '본사 창고';
    let status = '대기 중';
    if (lastMove){
      const s = (lastMove.inLocation||'');
      if (s.includes('업체')) { status='수리중'; currentLocation='업체'; }
      else if (s.includes('현장')) { status='가동 중'; currentLocation='현장'; }
      else if (s.includes('청명')) { status='대기 중'; currentLocation='본사 창고'; }
      else { currentLocation = s || '본사 창고'; }
    }
    return {
      serial: e.serial,
      category: e.category || '기타',
      currentLocation,
      status,
      lastMovement: lastMove?.date || '',
      uptimeEstimatePct: 0,
      repairCount: 0,
      totalRepairCost: 0,
    };
  });

  // 5) 쓰기(완전 대체)
  fs.writeFileSync(OUTPUT_FILES.equipmentJson, JSON.stringify(enrichedEquipment, null, 2));
  fs.writeFileSync(OUTPUT_FILES.movementsJson, JSON.stringify(movements, null, 2));
  fs.writeFileSync(OUTPUT_FILES.repairsJson, JSON.stringify(repairs, null, 2));
  fs.writeFileSync(PUBLIC_FILES.equipmentJson, JSON.stringify(enrichedEquipment, null, 2));
  fs.writeFileSync(PUBLIC_FILES.movementsJson, JSON.stringify(movements, null, 2));
  fs.writeFileSync(PUBLIC_FILES.repairsJson, JSON.stringify(repairs, null, 2));

  fs.writeFileSync(OUTPUT_FILES.equipmentCsv, toCsv(enrichedEquipment, ['serial','category','currentLocation','status','lastMovement','repairCount','totalRepairCost']));
  fs.writeFileSync(OUTPUT_FILES.movementsCsv, toCsv(movements, ['date','outLocation','inLocation','equipmentName','serial','quantity','note','status']));
  fs.writeFileSync(OUTPUT_FILES.repairsCsv, toCsv(repairs, ['date','serial','company','details','cost']));

  // 6) 검증
  assertJsonValid(PUBLIC_FILES.equipmentJson, validateEquipmentArray);
  assertJsonValid(PUBLIC_FILES.movementsJson, validateMovementsArray);
  assertJsonValid(PUBLIC_FILES.repairsJson, validateRepairsArray);

  console.log('=== Build DB (replace): DONE ===');
  console.log('Frontend DB Directory:', PUBLIC_DB_DIR);
}

build().catch(err=>{ console.error('Build failed:', err); process.exit(1); });


