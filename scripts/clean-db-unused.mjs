// db 폴더의 빈/미사용 JSON을 백업 후 삭제
import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();
const DB_DIR = path.join(PROJECT_ROOT, 'db');
const BACKUP_DIR = path.join('C:/Users/User/Desktop/cmes 데모/개발현황자료전달', 'deleted');

if (!fs.existsSync(DB_DIR)) {
  console.error('db 디렉토리를 찾을 수 없습니다:', DB_DIR);
  process.exit(1);
}
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const RESERVED_KEEP = new Set([
  'equipment_db.json',
  'movements_db.json',
  'repairs_db.json',
  'QC_logs.json',
]);

const CANDIDATES = [
  'order_history.json',
  'order_items.json',
  'product_catalog.json',
  'suppliers.json',
  'quotes.json',
  'purchase_requests.json',
  'repairs_db.json', // 비어있으면 삭제 대상이지만, 기본적으로는 보존. 아래 로직에서 보호됨
];

function isEmptyJsonText(text) {
  const t = (text || '').trim();
  if (t === '' || t === '[]' || t === '{}') return true;
  // 길이 2 미만이거나 파싱 실패 시 비어있는 것으로 간주하지 않음(안전)
  try { JSON.parse(t); } catch { return false; }
  // 파싱 후 빈 배열/빈 객체만 제거
  try {
    const v = JSON.parse(t);
    if (Array.isArray(v)) return v.length === 0;
    if (v && typeof v === 'object') return Object.keys(v).length === 0;
    return false;
  } catch {
    return false;
  }
}

function ts() {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${y}${mo}${da}-${hh}${mm}${ss}`;
}

const deleted = [];
for (const name of CANDIDATES) {
  const file = path.join(DB_DIR, name);
  if (!fs.existsSync(file)) continue;
  let raw = '';
  try { raw = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const empty = isEmptyJsonText(raw);
  if (!empty) continue;
  // 예약 보존 파일은 삭제하지 않음
  if (RESERVED_KEEP.has(name)) {
    console.log('[skip-reserved]', name);
    continue;
  }
  const backupPath = path.join(BACKUP_DIR, `${name}.${ts()}`);
  try {
    fs.copyFileSync(file, backupPath);
    fs.unlinkSync(file);
    deleted.push({ name, backup: backupPath });
    console.log('[deleted]', name, '→', backupPath);
  } catch (e) {
    console.warn('[delete-failed]', name, e.message);
  }
}

if (deleted.length === 0) {
  console.log('삭제 대상 없음 (모든 후보 파일이 비어있지 않거나 존재하지 않음).');
} else {
  console.log('삭제 완료:', deleted.map(d => d.name).join(', '));
}

