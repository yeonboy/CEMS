// 코어 빈 JSON(e.g., movements_db.json, repairs_db.json) 백업 후 삭제
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

const CORE_FILES = ['movements_db.json', 'repairs_db.json'];

function isEmptyJsonText(text) {
  const t = (text || '').trim();
  if (t === '' || t === '[]' || t === '{}') return true;
  try { const v = JSON.parse(t); return (Array.isArray(v) ? v.length === 0 : v && typeof v === 'object' && Object.keys(v).length === 0); }
  catch { return false; }
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
for (const name of CORE_FILES) {
  const file = path.join(DB_DIR, name);
  if (!fs.existsSync(file)) continue;
  let raw = '';
  try { raw = fs.readFileSync(file, 'utf8'); } catch { continue; }
  if (!isEmptyJsonText(raw)) { console.log('[keep-nonempty]', name); continue; }
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

if (deleted.length === 0) console.log('삭제 대상 없음(코어 파일 모두 존재하지 않거나 비어있지 않음).');
else console.log('삭제 완료:', deleted.map(d => d.name).join(', '));


