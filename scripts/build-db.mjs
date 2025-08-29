// 빌드 스크립트: 수리내역logs.xlsx, serials.csv, logs.csv → 정규화된 DB(JSON/CSV)
// 실행: npm run build:db

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';
import iconv from 'iconv-lite';
import { parse } from 'csv-parse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 입력 경로
const ROOT = path.resolve(__dirname, '..');
const WORKSPACE = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.resolve(PROJECT_ROOT, '청명장비 엑셀');

// 출력 경로 (사용자 지정)
const OUTPUT_ROOT = path.resolve('C:/Users/User/Desktop/cmes 데모/개발현황자료전달');
const PUBLIC_DB_DIR = path.resolve(PROJECT_ROOT, 'db');
if (!fs.existsSync(OUTPUT_ROOT)) fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
if (!fs.existsSync(PUBLIC_DB_DIR)) fs.mkdirSync(PUBLIC_DB_DIR, { recursive: true });

const INPUT_FILES = {
  serialsCsv: path.join(SOURCE_DIR, 'serials.csv'),
  movementCsv: path.join(SOURCE_DIR, 'logs.csv'),
  repairXlsx: path.join(SOURCE_DIR, '수리내역logs.xlsx'),
  orderXlsx: path.join(SOURCE_DIR, '물품 주문 내역서.xlsx'),
};

// 대체 입력(폴백)
const ALT_INPUT_FILES = {
  movementCsvFixed: path.join(SOURCE_DIR, 'logs_fixed.csv'),
  repairsCleanJson: path.join(PUBLIC_DB_DIR, 'repairs_db_clean.json'),
};

const OUTPUT_FILES = {
  equipmentJson: path.join(OUTPUT_ROOT, 'equipment_db.json'),
  movementsJson: path.join(OUTPUT_ROOT, 'movements_db.json'),
  repairsJson: path.join(OUTPUT_ROOT, 'repairs_db.json'),
  // 옵션: CSV도 제공
  equipmentCsv: path.join(OUTPUT_ROOT, 'equipment_db.csv'),
  movementsCsv: path.join(OUTPUT_ROOT, 'movements_db.csv'),
  repairsCsv: path.join(OUTPUT_ROOT, 'repairs_db.csv'),
};

const PUBLIC_FILES = {
  equipmentJson: path.join(PUBLIC_DB_DIR, 'equipment_db.json'),
  movementsJson: path.join(PUBLIC_DB_DIR, 'movements_db.json'),
  repairsJson: path.join(PUBLIC_DB_DIR, 'repairs_db.json'),
  orderHistoryJson: path.join(PUBLIC_DB_DIR, 'order_history.json'),
  orderItemsJson: path.join(PUBLIC_DB_DIR, 'order_items.json'),
  suppliersJson: path.join(PUBLIC_DB_DIR, 'suppliers.json'),
  productCatalogJson: path.join(PUBLIC_DB_DIR, 'product_catalog.json'),
};

// 예약 산출물(스키마 파괴 금지 대상)
const RESERVED_DB_FILES = new Set([
  PUBLIC_FILES.equipmentJson,
  PUBLIC_FILES.movementsJson,
  PUBLIC_FILES.repairsJson,
  PUBLIC_FILES.orderHistoryJson,
  PUBLIC_FILES.orderItemsJson,
  PUBLIC_FILES.suppliersJson,
  PUBLIC_FILES.productCatalogJson,
  path.join(PUBLIC_DB_DIR, 'QC_logs.json'),
  path.join(PUBLIC_DB_DIR, 'quotes.json'),
  path.join(PUBLIC_DB_DIR, 'purchase_requests.json'),
]);

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
    // 한글 비율이 높고 깨진 문자가 적을수록 우수
    return hangul * 5 - replacement * 10;
  };
  let best = candidates[0];
  for (const c of candidates) if (score(c.text) > score(best.text)) best = c;
  return best.text;
}

function detectDelimiter(text) {
  const firstLine = (text.split(/\r?\n/)[0] || '');
  const countTab = (firstLine.match(/\t/g) || []).length;
  const countComma = (firstLine.match(/,/g) || []).length;
  if (countTab > countComma) return '\t';
  if (countComma > countTab) return ',';
  // 동률이거나 혼용(\t,) (,\t) 패턴인 경우 탭 우선
  if (/\t,|,\t/.test(firstLine)) return '\t';
  return countTab > 0 ? '\t' : ',';
}

// CSV 원문 전처리: 메타행 제거, 혼용 구분자 정리
function normalizeCsvText(text) {
  let t = (text || '').replace(/\r\n?/g, '\n');
  const lines = t.split('\n');
  if (lines[0] && /회사명|장비투입현황/.test(lines[0])) lines.shift();
  t = lines.join('\n');
  // 혼용 구분자("\t,", ",\t")를 콤마 하나로 치환
  t = t.replace(/\t\s*,/g, ',').replace(/,\s*\t/g, ',');
  return t;
}

function readCsvAuto(filePath) {
  const buf = fs.readFileSync(filePath);
  const raw = chooseBestKoreanDecoding(buf);
  const text = normalizeCsvText(raw);
  const delimiter = detectDelimiter(text);
  return new Promise((resolve, reject) => {
    parse(
      text,
      {
        relax_column_count: true,
        trim: true,
        bom: true,
        delimiter,
      },
      (err, records) => {
        if (err) return reject(err);
        resolve(records);
      }
    );
  });
}

// 헤더가 있는 CSV를 객체 배열로 파싱
function readCsvWithHeader(filePath) {
  const buf = fs.readFileSync(filePath);
  const raw = chooseBestKoreanDecoding(buf);
  const text = normalizeCsvText(raw);
  const delimiter = detectDelimiter(text);
  return new Promise((resolve, reject) => {
    parse(
      text,
      {
        relax_column_count: true,
        trim: true,
        bom: true,
        columns: true, // 1행을 헤더로 사용
        skip_empty_lines: true,
        delimiter,
      },
      (err, records) => {
        if (err) return reject(err);
        resolve(records);
      }
    );
  });
}

function normalizeKey(key) {
  return (key || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[._-]+/g, '');
}

function getByKeys(row, keys) {
  // row는 객체(헤더 기반) 혹은 배열일 수 있음
  if (Array.isArray(row)) return undefined;
  const map = new Map(
    Object.keys(row || {}).map((k) => [normalizeKey(k), row[k]])
  );
  for (const key of keys) {
    const v = map.get(normalizeKey(key));
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function parseYmd(dateStr) {
  // 다양한 날짜 포맷을 YYYY-MM-DD로 표준화 시도
  const s = (dateStr || '').toString().trim();
  if (!s) return '';
  // 이미 YYYY-MM-DD 형태
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // YYYY/MM/DD 또는 YYYY.MM.DD
  const m1 = s.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})/);
  if (m1) {
    const y = m1[1];
    const mo = String(m1[2]).padStart(2, '0');
    const d = String(m1[3]).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  // DD/MM/YYYY 또는 DD.MM.YYYY
  const m2 = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m2) {
    const y = m2[3];
    const mo = String(m2[2]).padStart(2, '0');
    const d = String(m2[1]).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  // 숫자만(예: 20250131)
  const m3 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m3) return `${m3[1]}-${m3[2]}-${m3[3]}`;
  // 마지막 시도: Date 파서
  const t = new Date(s);
  if (!isNaN(t.getTime())) {
    const y = t.getFullYear();
    const mo = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  return '';
}

function toCsv(rows, headers) {
  const escape = (v) => {
    const s = (v ?? '').toString();
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.join(',')].concat(rows.map(r => headers.map(h => escape(r[h])).join(',')));
  return lines.join('\n');
}

// ===== 품질/백업/스키마 보호 유틸 =====
function getTimestamp() {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${y}${mo}${da}-${hh}${mm}${ss}`;
}

const BACKUP_HISTORY_DIR = path.join(OUTPUT_ROOT, 'history');
if (!fs.existsSync(BACKUP_HISTORY_DIR)) fs.mkdirSync(BACKUP_HISTORY_DIR, { recursive: true });

function backupIfExists(targetFile, logicalName) {
  try {
    if (fs.existsSync(targetFile)) {
      const ts = getTimestamp();
      const base = `${logicalName}.${ts}.json`;
      const dst = path.join(BACKUP_HISTORY_DIR, base);
      fs.copyFileSync(targetFile, dst);
      console.log('[backup]', path.basename(targetFile), '→', path.relative(PROJECT_ROOT, dst));
    }
  } catch (e) {
    console.warn('[backup] 실패:', targetFile, e.message);
  }
}

function readJsonIfExists(file) {
  try {
    if (!fs.existsSync(file)) return undefined;
    const text = fs.readFileSync(file, 'utf8');
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function getKeySetOfFirstObject(jsonArray) {
  if (!Array.isArray(jsonArray) || jsonArray.length === 0) return new Set();
  const obj = jsonArray.find(v => v && typeof v === 'object');
  if (!obj) return new Set();
  return new Set(Object.keys(obj));
}

// 예약 파일의 스키마(키 집합) 호환성 검사: 기존과 다른 키 세트면 차단
function assertReservedSchemaCompatible(targetPublicFile, nextArray) {
  if (!RESERVED_DB_FILES.has(targetPublicFile)) return;
  const prev = readJsonIfExists(targetPublicFile);
  if (!prev || !Array.isArray(prev) || prev.length === 0) return; // 최초 생성 또는 비어있으면 통과
  const prevKeys = getKeySetOfFirstObject(prev);
  const nextKeys = getKeySetOfFirstObject(nextArray);
  const keysEqual = prevKeys.size === nextKeys.size && [...prevKeys].every(k => nextKeys.has(k));
  if (!keysEqual) {
    throw new Error(`예약 파일 스키마 불일치: ${path.basename(targetPublicFile)}. 기존 키: ${[...prevKeys].join(', ')} / 신규 키: ${[...nextKeys].join(', ')}. 스키마 확장이 필요하면 *_v2.json 또는 역할 접두사 파일로 신규 생성하세요.`);
  }
}

// 간단 유효성 검사기들
function validateEquipmentArray(arr) {
  const errors = [];
  if (!Array.isArray(arr)) return ['equipment_db: 최상위가 배열이어야 합니다.'];
  const seen = new Set();
  for (const [idx, r] of arr.entries()) {
    if (!r || typeof r !== 'object') { errors.push(`#${idx}: 객체가 아님`); continue; }
    if (!r.serial || typeof r.serial !== 'string') errors.push(`#${idx}: serial 누락/유효하지 않음`);
    if (!r.category || typeof r.category !== 'string') errors.push(`#${idx}: category 누락/유효하지 않음`);
    if (seen.has(r.serial)) errors.push(`#${idx}: serial 중복(${r.serial})`); else seen.add(r.serial);
    if (r.lastMovement !== undefined && typeof r.lastMovement !== 'string') errors.push(`#${idx}: lastMovement 타입 오류`);
    if (r.uptimeEstimatePct !== undefined && typeof r.uptimeEstimatePct !== 'number') errors.push(`#${idx}: uptimeEstimatePct 타입 오류`);
    if (r.repairCount !== undefined && typeof r.repairCount !== 'number') errors.push(`#${idx}: repairCount 타입 오류`);
    if (r.totalRepairCost !== undefined && typeof r.totalRepairCost !== 'number') errors.push(`#${idx}: totalRepairCost 타입 오류`);
  }
  return errors;
}

function validateMovementsArray(arr) {
  const errors = [];
  if (!Array.isArray(arr)) return ['movements_db: 최상위가 배열이어야 합니다.'];
  for (const [idx, r] of arr.entries()) {
    if (!r || typeof r !== 'object') { errors.push(`#${idx}: 객체가 아님`); continue; }
    if (!r.serial || typeof r.serial !== 'string') errors.push(`#${idx}: serial 누락/유효하지 않음`);
    if (r.quantity !== undefined && typeof r.quantity !== 'number') errors.push(`#${idx}: quantity 타입 오류`);
  }
  return errors;
}

function validateRepairsArray(arr) {
  const errors = [];
  if (!Array.isArray(arr)) return ['repairs_db: 최상위가 배열이어야 합니다.'];
  for (const [idx, r] of arr.entries()) {
    if (!r || typeof r !== 'object') { errors.push(`#${idx}: 객체가 아님`); continue; }
    if (!r.serial || typeof r.serial !== 'string') errors.push(`#${idx}: serial 누락/유효하지 않음`);
    if (r.cost !== undefined && typeof r.cost !== 'number') errors.push(`#${idx}: cost 타입 오류`);
  }
  return errors;
}

function assertJsonValidAndLog(file, validator) {
  const raw = fs.readFileSync(file, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${path.basename(file)} JSON 파싱 실패: ${e.message}`);
  }
  const errors = validator(parsed);
  if (errors.length) {
    throw new Error(`${path.basename(file)} 유효성 오류(총 ${errors.length}건):\n- ${errors.slice(0, 20).join('\n- ')}${errors.length > 20 ? '\n... (생략)' : ''}`);
  }
  console.log('[validate]', path.basename(file), 'OK', Array.isArray(parsed) ? `(${parsed.length} rows)` : '');
}

async function build() {
  console.log('=== Build DB: START ===');

  // 1) serials.csv → equipment
  let equipment = [];
  if (fs.existsSync(INPUT_FILES.serialsCsv)) {
    try {
      // 헤더 기반 파싱 시도
      const serialRows = await readCsvWithHeader(INPUT_FILES.serialsCsv);
      for (const r of serialRows) {
        const serial = getByKeys(r, ['일련번호', 'S/N', 'SN', 'Serial']);
        const category = getByKeys(r, ['품목계열', '품목', '카테고리', 'Category']);
        if (!serial) continue;
        equipment.push({ serial, category });
      }
    } catch {
      // 실패 시 행 기반 파싱(기존 로직)
      const serials = await readCsvAuto(INPUT_FILES.serialsCsv);
      for (let i = 1; i < serials.length; i++) {
        const row = serials[i];
        if (!row) continue;
        const category = (row[1] || '').toString().trim();
        const serial = (row[2] || '').toString().trim();
        if (!serial) continue;
        equipment.push({ serial, category });
      }
    }
  }

  // 2) 이동 이력(여러 소스) 읽기 → 기존 DB와 병합(추가 방식)
  let movements = [];

  // 후보 소스 파일 나열: logs.csv, logs_fixed.csv, *movements*.csv 등
  function listMovementFiles() {
    const files = new Set();
    if (fs.existsSync(INPUT_FILES.movementCsv)) files.add(INPUT_FILES.movementCsv);
    if (fs.existsSync(ALT_INPUT_FILES.movementCsvFixed)) files.add(ALT_INPUT_FILES.movementCsvFixed);
    const recentExtra = path.join(SOURCE_DIR, '8.25~8.28movements_logs.csv');
    if (fs.existsSync(recentExtra)) files.add(recentExtra);
    try {
      const names = fs.readdirSync(SOURCE_DIR);
      for (const n of names) {
        const lower = (n || '').toLowerCase();
        if (lower.endsWith('.csv') && (lower.includes('movements') || lower.includes('이동'))) {
          files.add(path.join(SOURCE_DIR, n));
        }
      }
    } catch {}
    return Array.from(files);
  }

  function parseMovementRows(moveRows) {
    const out = [];
    const stockRows = [];
    for (const r of moveRows) {
      const date = parseYmd(getByKeys(r, ['일자-No.', '일자', '입고일자', '출고일자', '일시', '날짜', 'Date', '등록일', '기준일', '재고일']));
      const outLocation = getByKeys(r, ['출고창고명', '출고창고', '출고', 'From', 'from', '출고지', '출고(창고)', '출고위치']);
      const inLocation = getByKeys(r, ['입고창고명', '입고창고', '입고', 'To', 'to', '입고지', '입고(창고)', '입고위치', '현재위치']);
      const equipmentName = getByKeys(r, ['장비명', '품명', '품목명', 'Name', 'Equipment']);
      const serial = getByKeys(r, ['규격', '일련번호', 'S/N', 'SN', 'Serial', 'Serial No', 'SerialNo', 'SerialNo.', '일련 No', '일련 No.']);
      const qtyStr = getByKeys(r, ['수량', 'Qty', '수량(EA)', '재고', '재고수량', '수']);
      const note = getByKeys(r, ['비고', '메모', 'Note', '장비상태']);
      const status = getByKeys(r, ['상태', 'Status', '장비상태']);
      const quantity = parseInt((qtyStr || '1').replace(/[^0-9-]/g, '')) || 1;
      if (!serial) continue;
      // 재고 스냅샷 감지(청명/현장/업체 열)
      const stockCheong = getByKeys(r, ['청명', '본사', '본사창고', '청명창고']);
      const stockHyun = getByKeys(r, ['현장', '현장재고']);
      const stockUpche = getByKeys(r, ['업체', '수리업체', '외주', '협력사']);
      const hasStock = [stockCheong, stockHyun, stockUpche].some(v => String(v||'').trim() !== '');
      if (hasStock) {
        stockRows.push({ date, serial, cheong: parseInt(String(stockCheong||'0').replace(/[^0-9-]/g,'')) || 0, hyun: parseInt(String(stockHyun||'0').replace(/[^0-9-]/g,'')) || 0, upche: parseInt(String(stockUpche||'0').replace(/[^0-9-]/g,'')) || 0 });
      } else {
        out.push({ date, outLocation, inLocation, equipmentName, serial, quantity, note, status });
      }
    }
    // 스냅샷 → 이동 변환
    for (const s of stockRows) {
      let inLoc = '';
      if (s.upche > 0) inLoc = '업체';
      else if (s.hyun > 0) inLoc = '현장';
      else if (s.cheong > 0) inLoc = '청명';
      out.push({ date: s.date, outLocation: '', inLocation: inLoc, equipmentName: '', serial: s.serial, quantity: 1, note: '', status: '' });
    }
    return out;
  }

  const movementFiles = listMovementFiles();
  let parsedCount = 0;
  for (const f of movementFiles) {
    let ok = false;
    try {
      const rows = await readCsvWithHeader(f);
      const part = parseMovementRows(rows);
      if (part.length > 0) {
        movements.push(...part);
        parsedCount += part.length;
        ok = true;
      }
    } catch {}
    if (!ok) {
      try {
        const rowsRaw = await readCsvAuto(f);
        // 첫 행 헤더일 가능성 → 간단히 헤더 스킵 처리
        for (let i = 1; i < rowsRaw.length; i++) {
          const r = rowsRaw[i];
          if (!r) continue;
          const date = parseYmd((r[0] || '').toString().trim());
          const outLocation = (r[1] || '').toString().trim();
          const inLocation = (r[2] || '').toString().trim();
          const equipmentName = (r[3] || '').toString().trim();
          const serial = (r[4] || '').toString().trim();
          const quantity = parseInt((r[5] || '1').toString().trim()) || 1;
          const note = (r[6] || '').toString().trim();
          const status = (r[7] || '').toString().trim();
          if (!serial) continue;
          movements.push({ date, outLocation, inLocation, equipmentName, serial, quantity, note, status });
          parsedCount++;
        }
      } catch (e2) {
        console.warn('[movements] 파싱 실패:', f, e2.message);
      }
    }
  }
  console.log('[movements] 소스 파일 수:', movementFiles.length, '행 수:', parsedCount);

  // 기존 db/movements_db.json과 병합(추가 방식, 중복 제거)
  const existingMovements = readJsonIfExists(PUBLIC_FILES.movementsJson);
  if (Array.isArray(existingMovements) && existingMovements.length) {
    const key = (m) => [parseYmd(m.date||''), (m.serial||'').trim(), (m.outLocation||'').trim(), (m.inLocation||'').trim(), String(m.quantity||1)].join('|');
    const map = new Map();
    for (const x of existingMovements) map.set(key(x), x);
    for (const x of movements) map.set(key(x), x);
    movements = Array.from(map.values()).sort((a,b)=> (parseYmd(a.date)||'') < (parseYmd(b.date)||'') ? -1 : 1);
  }

  // 3) 수리내역logs.xlsx → repairs (옵션)
  let repairs = [];
  if (fs.existsSync(INPUT_FILES.repairXlsx)) {
    const wb = xlsx.read(fs.readFileSync(INPUT_FILES.repairXlsx));
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const repairsRows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    // 유연 매핑
    repairs = repairsRows.map(r => {
      const date = (r['일자'] || r['입고일자'] || r['수리일자'] || r['Date'] || '').toString().trim();
      const serial = (r['일련번호'] || r['S/N'] || r['SN'] || r['Serial'] || '').toString().trim();
      const company = (r['업체'] || r['수리업체'] || r['입고처'] || r['Company'] || '').toString().trim();
      const details = (r['내용'] || r['비고'] || r['내역'] || r['Details'] || '').toString().trim();
      const costRaw = (r['비용'] || r['수리비용'] || r['금액'] || r['Cost'] || '').toString().trim();
      const cost = parseInt(costRaw.replace(/[^0-9]/g, '')) || 0;
      return { date, serial, company, details, cost };
    }).filter(x => x.serial);
  } else {
    console.log('수리내역logs.xlsx not found, skipping repairs.');
  }
  // 폴백: db/repairs_db_clean.json 매핑 사용
  if ((!repairs || repairs.length === 0) && fs.existsSync(ALT_INPUT_FILES.repairsCleanJson)) {
    try {
      const raw = fs.readFileSync(ALT_INPUT_FILES.repairsCleanJson, 'utf8');
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        repairs = arr.map((r) => {
          // 유연 키 매핑
          const date = parseYmd(
            getByKeys(r, ['수리일자', '일자', '입고일자', 'date', 'repair_date'])
          );
          const serial = getByKeys(r, ['일련번호', 'S/N', 'SN', 'Serial', 'serial']);
          const company = getByKeys(r, ['업체', '수리업체', '입고처', 'Company', 'repair_company']);
          const details = getByKeys(r, ['내용', '비고', '내역', 'Details', 'repair_type', 'type']);
          const costRaw = getByKeys(r, ['비용', '수리비용', '금액', 'Cost', 'cost']);
          const cost = parseInt(String(costRaw || '').replace(/[^0-9]/g, '')) || 0;
          return { date, serial, company, details, cost };
        }).filter(x => x.serial);
        console.log('[fallback] repairs_db_clean.json 으로 repairs 구성:', repairs.length);
      }
    } catch (e) {
      console.warn('[fallback] repairs_db_clean.json 매핑 실패:', e.message);
    }
  }

  // 4) 조인: equipment 기준으로 이동/수리 연결
  const serialToEquipment = new Map(equipment.map(e => [e.serial, e]));

  // 현재 상태/위치 추정 (마지막 입고지), 수리 횟수 집계
  const serialToMovements = new Map();
  for (const m of movements) {
    if (!serialToMovements.has(m.serial)) serialToMovements.set(m.serial, []);
    serialToMovements.get(m.serial).push(m);
  }
  for (const [serial, list] of serialToMovements) list.sort((a,b)=> new Date(a.date) - new Date(b.date));

  const serialToRepairs = new Map();
  for (const r of repairs) {
    if (!serialToRepairs.has(r.serial)) serialToRepairs.set(r.serial, []);
    serialToRepairs.get(r.serial).push(r);
  }

  // 품목계열별 평균 활동률 계산 준비
  // 활동률 정의: 하루에 해당 시리얼의 이동 기록 유무(1/0)
  const categoryDayActivity = new Map(); // category -> Map(dateKey -> 0..n moved count)
  for (const m of movements) {
    const dateKey = (m.date || '').slice(0, 10);
    const cat = serialToEquipment.get(m.serial)?.category || 'UNKNOWN';
    if (!categoryDayActivity.has(cat)) categoryDayActivity.set(cat, new Map());
    const dayMap = categoryDayActivity.get(cat);
    dayMap.set(dateKey, (dayMap.get(dateKey) || 0) + 1);
  }
  // 카테고리별 활동률: 이동 발생일 수 / 관측일 수
  const categoryToUptime = new Map();
  for (const [cat, dayMap] of categoryDayActivity) {
    const observedDays = dayMap.size;
    const activeDays = [...dayMap.values()].filter(c => c > 0).length;
    const pct = observedDays ? Math.round((activeDays / observedDays) * 100) : 0;
    categoryToUptime.set(cat, pct);
  }

  // (제거됨) 전역 최신일 스냅샷 사용 안 함: 일련번호별 최신 이동만 사용

  function classifyByLocation(loc) {
    const s = (loc || '').toString();
    if (s.includes('업체')) return { status: '수리중', location: '업체' };
    if (s.includes('현장')) return { status: '가동 중', location: '현장' };
    if (s.includes('청명')) return { status: '대기 중', location: '본사 창고' };
    return { status: '대기 중', location: s || '본사 창고' };
  }

  // 기존 equipment_db.json과 병합(추가 방식) 대비: 직전 상태를 읽어 최신 이동으로 갱신
  const existingEquipment = readJsonIfExists(PUBLIC_FILES.equipmentJson);
  const serialToExisting = new Map(Array.isArray(existingEquipment) ? existingEquipment.map(x => [x.serial, x]) : []);

  const enrichedEquipment = equipment.map(e => {
    const moves = serialToMovements.get(e.serial) || [];
    const reps = serialToRepairs.get(e.serial) || [];
    const lastMove = moves[moves.length - 1];

    // 요구사항: 상태/현재위치는 "가장 최근 이동기록의 inLocation" 기준으로만 결정
    let currentLocation = '본사 창고';
    let status = '대기 중';
    if (lastMove) {
      const judged = classifyByLocation(lastMove.inLocation || '');
      currentLocation = judged.location;
      status = judged.status;
    }

    const lastMovement = (lastMove?.date || '');
    const uptimeEstimatePct = categoryToUptime.get(e.category) ?? 0;
    const totalRepairCost = reps.reduce((a,b)=> a + (b.cost||0), 0);
    const prev = serialToExisting.get(e.serial) || {};
    return {
      serial: e.serial,
      category: e.category || prev.category,
      currentLocation: currentLocation || prev.currentLocation || '본사 창고',
      status: status || prev.status || '대기 중',
      lastMovement: lastMovement || prev.lastMovement || '',
      uptimeEstimatePct: uptimeEstimatePct || prev.uptimeEstimatePct || 0,
      repairCount: reps.length,
      totalRepairCost
    };
  });

  // 5) 출력 전: 예약 파일 스키마 보호 검사 및 기존 파일 백업
  assertReservedSchemaCompatible(PUBLIC_FILES.equipmentJson, enrichedEquipment);
  assertReservedSchemaCompatible(PUBLIC_FILES.movementsJson, movements);
  assertReservedSchemaCompatible(PUBLIC_FILES.repairsJson, repairs);

  backupIfExists(PUBLIC_FILES.equipmentJson, 'equipment_db');
  backupIfExists(PUBLIC_FILES.movementsJson, 'movements_db');
  backupIfExists(PUBLIC_FILES.repairsJson, 'repairs_db');
  backupIfExists(OUTPUT_FILES.equipmentJson, 'equipment_db.out');
  backupIfExists(OUTPUT_FILES.movementsJson, 'movements_db.out');
  backupIfExists(OUTPUT_FILES.repairsJson, 'repairs_db.out');

  // 5) 출력(JSON/CSV) - 기존 파일에 '추가/병합' 방식으로 반영
  function writeMergedJson(targetFile, nextArray, uniqueKeyFn) {
    const prev = readJsonIfExists(targetFile);
    let merged = Array.isArray(prev) ? prev.slice() : [];
    if (!uniqueKeyFn) {
      merged = nextArray; // 장비는 serial 기준 완전 대체(동일 serial은 최신으로 덮어씀)
    } else {
      const map = new Map(merged.map(x => [uniqueKeyFn(x), x]));
      for (const x of nextArray) map.set(uniqueKeyFn(x), x);
      merged = Array.from(map.values());
    }
    fs.writeFileSync(targetFile, JSON.stringify(merged, null, 2));
    return merged;
  }

  // equipment: serial 기준 덮어쓰기(최신 상태로 갱신)
  writeMergedJson(OUTPUT_FILES.equipmentJson, enrichedEquipment);
  const mergedMovements = writeMergedJson(OUTPUT_FILES.movementsJson, movements, (m)=> [parseYmd(m.date||''),(m.serial||'').trim(),(m.outLocation||'').trim(),(m.inLocation||'').trim(),String(m.quantity||1)].join('|'));
  writeMergedJson(OUTPUT_FILES.repairsJson, repairs, (r)=> [parseYmd(r.date||''),(r.serial||'').trim(),(r.company||'').trim(),String(r.cost||0)].join('|'));

  // public(db/)에도 동일 병합 반영
  writeMergedJson(PUBLIC_FILES.equipmentJson, enrichedEquipment);
  writeMergedJson(PUBLIC_FILES.movementsJson, movements, (m)=> [parseYmd(m.date||''),(m.serial||'').trim(),(m.outLocation||'').trim(),(m.inLocation||'').trim(),String(m.quantity||1)].join('|'));
  writeMergedJson(PUBLIC_FILES.repairsJson, repairs, (r)=> [parseYmd(r.date||''),(r.serial||'').trim(),(r.company||'').trim(),String(r.cost||0)].join('|'));

  fs.writeFileSync(OUTPUT_FILES.equipmentCsv, toCsv(enrichedEquipment, ['serial','category','currentLocation','status','lastMovement','repairCount','totalRepairCost']));
  fs.writeFileSync(OUTPUT_FILES.movementsCsv, toCsv(movements, ['date','outLocation','inLocation','equipmentName','serial','quantity','note','status']));
  fs.writeFileSync(OUTPUT_FILES.repairsCsv, toCsv(repairs, ['date','serial','company','details','cost']));

  // 6) 물품 주문 내역서.xlsx → 시트별 DB (기본 스킵, ENABLE_ORDER_PARSING=1 일 때만 실행)
  const ENABLE_ORDER_PARSING = process.env.ENABLE_ORDER_PARSING === '1';
  if (ENABLE_ORDER_PARSING && fs.existsSync(INPUT_FILES.orderXlsx)) {
    console.log('Parsing 물품 주문 내역서.xlsx ...');
    const wb2 = xlsx.read(fs.readFileSync(INPUT_FILES.orderXlsx));
    const sheetNames = wb2.SheetNames;

    let orderHistory = [];
    let orderItems = [];
    let suppliers = [];
    let productCatalog = [];

    for (const sName of sheetNames) {
      const ws = wb2.Sheets[sName];
      const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });
      const n = (sName || '').toString();
      // 시트명 휴리스틱: 제목에 포함된 한글 키워드로 구분
      if (/주문.?내역|order.?history/i.test(n)) {
        orderHistory = rows.map(r => ({
          id: String(r['ID'] || r['번호'] || r['주문ID'] || r['OrderID'] || '').trim() || undefined,
          orderNumber: String(r['주문번호'] || r['Order No'] || r['OrderNumber'] || '').trim(),
          orderDate: parseYmd(String(r['주문일자'] || r['Date'] || r['일자'] || '')),
          supplier: String(r['공급업체'] || r['업체'] || r['거래처'] || r['Supplier'] || '').trim(),
          department: String(r['부서'] || r['Department'] || '').trim(),
          orderType: String(r['주문유형'] || r['Type'] || '').trim(),
          totalAmount: parseInt(String(r['총금액'] || r['금액'] || r['Total'] || '').replace(/[^0-9]/g,'')) || 0,
          status: String(r['상태'] || r['Status'] || '주문완료').trim(),
          remarks: String(r['비고'] || r['메모'] || r['Remarks'] || '').trim(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })).filter(r => r.orderNumber);
      } else if (/품목|items?/i.test(n)) {
        orderItems = rows.map(r => ({
          id: undefined,
          orderHistoryId: String(r['주문번호'] || r['Order No'] || r['OrderNumber'] || '').trim(),
          productCode: String(r['품목코드'] || r['제품코드'] || r['ProductCode'] || '').trim(),
          productName: String(r['품목명'] || r['제품명'] || r['ProductName'] || '').trim(),
          specification: String(r['규격'] || r['Spec'] || '').trim(),
          unit: String(r['단위'] || r['Unit'] || '개').trim(),
          quantity: parseInt(String(r['수량'] || r['Qty'] || '').replace(/[^0-9]/g,'')) || 0,
          unitPrice: parseInt(String(r['단가'] || r['UnitPrice'] || '').replace(/[^0-9]/g,'')) || 0,
          totalPrice: parseInt(String(r['금액'] || r['Total'] || '').replace(/[^0-9]/g,'')) || undefined,
          supplier: String(r['공급업체'] || r['업체'] || r['Supplier'] || '').trim(),
          deliveryDate: parseYmd(String(r['납기일'] || r['납기'] || r['Delivery'] || '')),
          remarks: String(r['비고'] || r['메모'] || r['Remarks'] || '').trim(),
          createdAt: new Date().toISOString(),
        })).filter(r => r.productName);
        orderItems.forEach(it => { if (!it.totalPrice) it.totalPrice = (it.quantity||0)*(it.unitPrice||0); });
      } else if (/공급|supplier/i.test(n)) {
        suppliers = rows.map(r => ({
          id: undefined,
          companyName: String(r['업체명'] || r['거래처명'] || r['Company'] || '').trim(),
          businessNumber: String(r['사업자번호'] || r['BusinessNo'] || '').trim(),
          representative: String(r['대표자'] || r['대표'] || r['Rep'] || '').trim(),
          address: String(r['주소'] || r['Address'] || '').trim(),
          phone: String(r['연락처'] || r['전화'] || r['Phone'] || '').trim(),
          email: String(r['이메일'] || r['Email'] || '').trim(),
          bankInfo: String(r['은행'] || r['Bank'] || '').trim(),
          accountNumber: String(r['계좌'] || r['Account'] || '').trim(),
          accountHolder: String(r['예금주'] || r['Holder'] || '').trim(),
          category: String(r['카테고리'] || r['분류'] || r['Category'] || '일반').trim(),
          rating: parseInt(String(r['평점'] || r['Rating'] || '5').replace(/[^0-9]/g,'')) || 5,
          remarks: String(r['비고'] || r['메모'] || r['Remarks'] || '').trim(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })).filter(r => r.companyName);
      } else if (/카탈로그|catalog|제품/i.test(n)) {
        productCatalog = rows.map(r => ({
          id: undefined,
          productCode: String(r['제품코드'] || r['품목코드'] || r['ProductCode'] || '').trim(),
          productName: String(r['제품명'] || r['품목명'] || r['ProductName'] || '').trim(),
          category: String(r['카테고리'] || r['분류'] || r['Category'] || '일반').trim(),
          specification: String(r['규격'] || r['Spec'] || '').trim(),
          unit: String(r['단위'] || r['Unit'] || '개').trim(),
          standardPrice: parseInt(String(r['표준단가'] || r['StandardPrice'] || r['단가'] || '').replace(/[^0-9]/g,'')) || 0,
          minPrice: parseInt(String(r['최저가'] || r['MinPrice'] || '').replace(/[^0-9]/g,'')) || 0,
          maxPrice: parseInt(String(r['최고가'] || r['MaxPrice'] || '').replace(/[^0-9]/g,'')) || 0,
          preferredSupplier: String(r['선호공급업체'] || r['주거래처'] || r['PreferredSupplier'] || '').trim(),
          alternativeSuppliers: [],
          stockLevel: parseInt(String(r['재고'] || r['Stock'] || '0').replace(/[^0-9]/g,'')) || 0,
          reorderPoint: parseInt(String(r['재주문점'] || r['ROP'] || '0').replace(/[^0-9]/g,'')) || 0,
          description: String(r['설명'] || r['Description'] || '').trim(),
          specifications: {},
          attachments: [],
          status: '활성',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })).filter(r => r.productName);
      }
    }

    // 주문산출물: 스키마 보호 검사 및 백업 후 쓰기
    assertReservedSchemaCompatible(PUBLIC_FILES.orderHistoryJson, orderHistory);
    assertReservedSchemaCompatible(PUBLIC_FILES.orderItemsJson, orderItems);
    assertReservedSchemaCompatible(PUBLIC_FILES.suppliersJson, suppliers);
    assertReservedSchemaCompatible(PUBLIC_FILES.productCatalogJson, productCatalog);

    backupIfExists(PUBLIC_FILES.orderHistoryJson, 'order_history');
    backupIfExists(PUBLIC_FILES.orderItemsJson, 'order_items');
    backupIfExists(PUBLIC_FILES.suppliersJson, 'suppliers');
    backupIfExists(PUBLIC_FILES.productCatalogJson, 'product_catalog');

    // 프론트 db/에 저장
    fs.writeFileSync(PUBLIC_FILES.orderHistoryJson, JSON.stringify(orderHistory, null, 2));
    fs.writeFileSync(PUBLIC_FILES.orderItemsJson, JSON.stringify(orderItems, null, 2));
    fs.writeFileSync(PUBLIC_FILES.suppliersJson, JSON.stringify(suppliers, null, 2));
    fs.writeFileSync(PUBLIC_FILES.productCatalogJson, JSON.stringify(productCatalog, null, 2));
    console.log('Order workbook parsed:', {
      orderHistory: orderHistory.length,
      orderItems: orderItems.length,
      suppliers: suppliers.length,
      productCatalog: productCatalog.length,
    });
  } else {
    console.log('Order workbook parsing skipped by default. Set ENABLE_ORDER_PARSING=1 to enable.');
  }

  // 7) JSON 유효성 검증 수행
  try {
    assertJsonValidAndLog(PUBLIC_FILES.equipmentJson, validateEquipmentArray);
    assertJsonValidAndLog(PUBLIC_FILES.movementsJson, validateMovementsArray);
    assertJsonValidAndLog(PUBLIC_FILES.repairsJson, validateRepairsArray);
  } catch (e) {
    console.error('유효성 검증 실패:', e.message);
    throw e;
  }

  console.log('=== Build DB: DONE ===');
  console.log('Output Directory:', OUTPUT_ROOT);
  console.log('Frontend DB Directory:', PUBLIC_DB_DIR);
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});


