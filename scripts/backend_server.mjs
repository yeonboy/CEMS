import express from 'express';
import cors from 'cors';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import http from 'http';
import multer from 'multer';
import iconv from 'iconv-lite';
import { parse as csvParse } from 'csv-parse';
import { spawn } from 'child_process';

const app = express();
app.use(cors());
app.use(express.json());

// Multer uploader must be initialized before any routes use it
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const PROJECT_ROOT = process.cwd();
const DB_DIR = path.join(PROJECT_ROOT, 'db');
const HISTORY_DIR = path.join(DB_DIR, 'history');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(DB_DIR, name), 'utf8'));

// 헬스체크
app.get('/api/health', (req, res) => res.json({ ok: true }));

// 코어 엔드포인트
app.get('/api/equipment', (req, res) => res.json(readJson('equipment_db.json')));
app.get('/api/movements', (req, res) => res.json(readJson('movements_db.json')));
app.get('/api/repairs', (req, res) => res.json(readJson('repairs_db_clean.json')));

// 통계
app.get('/api/stats/repairs-monthly', (req, res) => res.json(readJson('stats_repairs_monthly.json')));
app.get('/api/stats/repairs-cost-monthly', (req, res) => res.json(readJson('stats_repair_cost_monthly.json')));
app.get('/api/stats/repairs-topk', (req, res) => res.json(readJson('stats_repairs_topk.json')));

// 구매/견적/발주 (파일 존재 시 반환, 없으면 빈 배열)
const safeJson = (name, fallback) => { try { return readJson(name); } catch { return fallback; } };
app.get('/api/purchase-requests', (req, res) => res.json(safeJson('purchase_requests.json', [])));
app.get('/api/quotes', (req, res) => res.json(safeJson('quotes.json', [])));
app.get('/api/orders/history', (req, res) => res.json(safeJson('order_history.json', [])));

// 정적 제공: 프론트 리소스/DB 파일
const noStore = (res) => res.set('Cache-Control', 'no-store');
app.use('/db', express.static(path.join(PROJECT_ROOT, 'db'), { etag: false, lastModified: false, setHeaders: noStore, fallthrough: true }));
app.use('/assets', express.static(path.join(PROJECT_ROOT, 'assets'), { etag: false, lastModified: false, setHeaders: noStore, fallthrough: true }));
app.use('/scripts', express.static(path.join(PROJECT_ROOT, 'scripts'), { etag: false, lastModified: false, setHeaders: noStore, fallthrough: true }));
app.use('/', express.static(PROJECT_ROOT, { etag: false, lastModified: false, extensions: ['html'], setHeaders: noStore }));

// ensure history dir exists
try { if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true }); } catch {}

// ===== Movements CSV merge helpers =====
function safeDecode(buf, enc){ try{ return buf.toString(enc); }catch{ return ''; } }
function safeIconv(buf, enc){ try{ return iconv.decode(buf, enc); }catch{ return ''; } }
function chooseBestKoreanDecoding(buf){
  const cands = [
    { enc:'utf8', text: safeDecode(buf,'utf8') },
    { enc:'utf16le', text: safeDecode(buf,'utf16le') },
    { enc:'euc-kr', text: safeIconv(buf,'euc-kr') },
    { enc:'cp949', text: safeIconv(buf,'cp949') },
  ];
  const score = (s)=>{ if(!s) return -1e9; const hangul=(s.match(/[가-힣]/g)||[]).length; const repl=(s.match(/�/g)||[]).length; return hangul*5 - repl*10; };
  let best = cands[0];
  for (const c of cands){ if (score(c.text) > score(best.text)) best = c; }
  return best.text || '';
}
function normalizeCsvText(text){
  let t = (text||'').replace(/\r\n?/g,'\n');
  const lines = t.split('\n');
  if (lines[0] && /회사명|장비투입현황/.test(lines[0])) lines.shift();
  t = lines.join('\n');
  t = t.replace(/\t\s*,/g, ',').replace(/,\s*\t/g, ',');
  return t;
}
function detectDelimiter(text){
  const first = (text.split(/\r?\n/)[0]||'');
  let inQuote=false, tab=0, comma=0;
  for (let i=0;i<first.length;i++){
    const ch = first[i];
    if (ch==='"') inQuote = !inQuote;
    else if (!inQuote){ if(ch==='\t') tab++; else if(ch===',') comma++; }
  }
  if (comma>=tab) return ','; return '\t';
}
function parseYmd(dateStr){
  const s=(dateStr||'').toString().trim(); if(!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m=s.match(/^(\d{4})(\d{2})(\d{2})$/); if(m) return `${m[1]}-${m[2]}-${m[3]}`;
  m=s.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})/); if(m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  m=s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/); if(m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  const d=new Date(s); if(!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return '';
}
function normalizeKey(key){
  return (key||'').toString().trim().toLowerCase().replace(/\s+/g,'').replace(/[._-]+/g,'');
}
function getByKeys(row, keys){
  const map = new Map(Object.keys(row||{}).map(k=>[normalizeKey(k), row[k]]));
  for (const k of keys){ const v = map.get(normalizeKey(k)); if (v!==undefined && v!==null && String(v).trim()!=='') return String(v).trim(); }
  return '';
}
function sanitizeCell(v){
  let s=(v??'').toString().trim();
  if (s.startsWith('"') && s.endsWith('"')) s=s.slice(1,-1);
  s=s.replace(/^\",\"/, '').replace(/^",\"/, '').replace(/^\",\"/,'').replace(/^",/,'').replace(/,\"$/,'').replace(/\",$/,'').replace(/\"\"/g,'"').trim();
  if (s.startsWith('"') && s.endsWith('"')) s=s.slice(1,-1);
  return s.trim();
}
function parseMovementRows(records){
  const out=[];
  for (const r of records){
    const date = parseYmd(sanitizeCell(getByKeys(r, ['일자-No.','일자','입고일자','출고일자','일시','날짜','date','등록일','기준일','재고일'])));
    const outLocation = sanitizeCell(getByKeys(r, ['출고창고명','출고창고','출고','from','출고지','출고(창고)','출고위치']));
    const inLocation = sanitizeCell(getByKeys(r, ['입고창고명','입고창고','입고','to','입고지','입고(창고)','입고위치','현재위치']));
    const equipmentName = sanitizeCell(getByKeys(r, ['장비명','품명','품목명','name','equipment']));
    const serial = sanitizeCell(getByKeys(r, ['규격','일련번호','s/n','sn','serial','serial no','serialno','serialno.','일련 no','일련 no.']));
    const qtyStr = sanitizeCell(getByKeys(r, ['수량','qty','수량(ea)','재고','재고수량','수'])) || '1';
    const note = sanitizeCell(getByKeys(r, ['비고','메모','note','장비상태']));
    const status = sanitizeCell(getByKeys(r, ['상태','status','장비상태']));
    const quantity = parseInt(qtyStr.replace(/[^0-9-]/g,'')) || 1;
    if (!serial) continue;
    out.push({ date, outLocation, inLocation, equipmentName, serial, quantity, note, status });
  }
  return out;
}
function readCsvWithHeader(text, delimiter){
  return new Promise((resolve,reject)=>{
    csvParse(text, { columns:true, skip_empty_lines:true, trim:true, relax_column_count:true, delimiter }, (err, records)=>{
      if (err) return reject(err); resolve(records);
    });
  });
}
function readJsonIfExists(file){ try{ const t=fs.readFileSync(file,'utf8'); const j=JSON.parse(t); return Array.isArray(j)?j:[]; }catch{return []} }
function uniqKey(m){ return [parseYmd(m.date||''),(m.serial||'').trim(),(m.outLocation||'').trim(),(m.inLocation||'').trim(),String(m.quantity||1)].join('|'); }
async function moveBackupsToHistory(){
  let moved = 0;
  const ents = await fsp.readdir(DB_DIR, { withFileTypes: true });
  await fsp.mkdir(HISTORY_DIR, { recursive: true });
  for (const ent of ents){
    if (!ent.isFile()) continue;
    const name = ent.name;
    if (/^movements_db_backup_.*\.json$/i.test(name)){
      const src = path.join(DB_DIR, name);
      const dst = path.join(HISTORY_DIR, name);
      try { await fsp.rename(src, dst); moved++; } catch {}
    }
  }
  return moved;
}

// CSV 업로드/병합 API
app.post('/api/movements/upload-csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok:false, message:'file is required' });
    const buf = req.file.buffer;
    const textRaw = chooseBestKoreanDecoding(buf);
    const text = normalizeCsvText(textRaw);
    const delimiter = detectDelimiter(text);
    const records = await readCsvWithHeader(text, delimiter);
    const newMoves = parseMovementRows(records).filter(m=>m.serial && m.date);

    const DB_MOVES = path.join(DB_DIR, 'movements_db.json');
    const existing = readJsonIfExists(DB_MOVES);
    const map = new Map();
    for (const x of existing) map.set(uniqKey(x), x);
    let added = 0;
    for (const x of newMoves){ const k=uniqKey(x); if (!map.has(k)) added++; map.set(k, x); }
    const merged = Array.from(map.values()).sort((a,b)=> (parseYmd(a.date)||'') < (parseYmd(b.date)||'') ? -1 : 1);

    // backup to history
    try{
      await fsp.mkdir(HISTORY_DIR, { recursive: true });
      const ts = new Date().toISOString().replace(/[:T]/g,'-').slice(0,19);
      const backup = path.join(HISTORY_DIR, `movements_db_backup_${ts}.json`);
      if (fs.existsSync(DB_MOVES)) await fsp.copyFile(DB_MOVES, backup);
    }catch{}

    await fsp.writeFile(DB_MOVES, JSON.stringify(merged, null, 2), 'utf8');

    let rebuildStatus = 'skipped';
    if (String(req.query.rebuild||'').toLowerCase() === '1' || String(req.query.rebuild||'').toLowerCase() === 'true'){
      rebuildStatus = await new Promise((resolve)=>{
        const child = spawn(process.execPath, [path.join(PROJECT_ROOT, 'scripts', 'build-stats.mjs')], { cwd: PROJECT_ROOT, stdio: 'inherit' });
        child.on('close', (code)=> resolve(code===0 ? 'done' : `failed:${code}`));
        child.on('error', ()=> resolve('failed'));
      });
    }

    return res.json({ ok:true, parsed: newMoves.length, existing: existing.length, added, written: merged.length, rebuild: rebuildStatus });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok:false, message: e.message||'upload failed' });
  }
});

// 백업 파일 history로 이동
app.post('/api/movements/move-backups-to-history', async (req, res) => {
  try {
    const moved = await moveBackupsToHistory();
    return res.json({ ok:true, moved });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok:false, message: e.message||'move failed' });
  }
});

// ===== Business Contracts Overrides (CRUD-lite) =====
const BIZ_OVR_FILE = path.join(DB_DIR, 'business_contracts_overrides.json');
function readOverridesSafe() { try { return JSON.parse(fs.readFileSync(BIZ_OVR_FILE, 'utf8')); } catch { return []; } }
function writeOverrides(arr) { fs.writeFileSync(BIZ_OVR_FILE, JSON.stringify(arr, null, 2)); }

// 리스트 (전체 오버라이드)
app.get('/api/business-overrides', (req, res) => {
  try { return res.json({ ok: true, items: readOverridesSafe() }); } catch (e) { return res.status(500).json({ ok:false, message: e.message }); }
});

// 단건 조회
app.get('/api/business-overrides/:projectId', (req, res) => {
  try {
    const pid = String(req.params.projectId || '').trim();
    const items = readOverridesSafe();
    const item = items.find(x => x && String(x.projectId||'') === pid) || null;
    return res.json({ ok: true, item });
  } catch (e) { return res.status(500).json({ ok:false, message: e.message }); }
});

// 업서트 저장
app.post('/api/business-overrides/save', (req, res) => {
  try {
    const body = req.body || {};
    const pid = String(body.projectId||'').trim();
    if (!pid) return res.status(400).json({ ok:false, message:'projectId required' });
    const overrides = body.overrides && typeof body.overrides === 'object' ? body.overrides : {};
    const now = new Date().toISOString();
    const items = readOverridesSafe();
    const idx = items.findIndex(x => x && String(x.projectId||'') === pid);
    const rec = { projectId: pid, overrides, updatedAt: now };
    if (idx >= 0) items[idx] = rec; else items.push(rec);
    writeOverrides(items);
    return res.json({ ok:true, item: rec });
  } catch (e) { return res.status(500).json({ ok:false, message: e.message }); }
});

// ===== Business Completion APIs =====
const BIZ_COMPLETION_FILE = path.join(DB_DIR, 'business_completion.json');
function readCompletionSafe() { try { return JSON.parse(fs.readFileSync(BIZ_COMPLETION_FILE, 'utf8')); } catch { return []; } }
function writeCompletion(arr) { fs.writeFileSync(BIZ_COMPLETION_FILE, JSON.stringify(arr, null, 2)); }

// 리스트 (전체 완료 상태)
app.get('/api/business-completion', (req, res) => {
  try { return res.json({ ok: true, items: readCompletionSafe() }); } catch (e) { return res.status(500).json({ ok:false, message: e.message }); }
});

// 단건 조회
app.get('/api/business-completion/:projectId', (req, res) => {
  try {
    const pid = String(req.params.projectId || '').trim();
    const items = readCompletionSafe();
    const item = items.find(x => x && String(x.projectId||'') === pid) || null;
    return res.json({ ok: true, item });
  } catch (e) { return res.status(500).json({ ok:false, message: e.message }); }
});

// 업서트 저장
app.post('/api/business-completion/save', (req, res) => {
  try {
    const body = req.body || {};
    const pid = String(body.projectId||'').trim();
    if (!pid) return res.status(400).json({ ok:false, message:'projectId required' });
    const completed = Boolean(body.completed);
    const now = new Date().toISOString();
    const items = readCompletionSafe();
    const idx = items.findIndex(x => x && String(x.projectId||'') === pid);
    const rec = { projectId: pid, completed, updatedAt: body.updatedAt || now };
    if (idx >= 0) items[idx] = rec; else items.push(rec);
    writeCompletion(items);
    return res.json({ ok:true, item: rec });
  } catch (e) { return res.status(500).json({ ok:false, message: e.message }); }
});

// ===== Calendar Save APIs =====
const CAL_FILE = path.join(DB_DIR, 'calendar_schedules.json');
function readCalendarSafe(){ try { return JSON.parse(fs.readFileSync(CAL_FILE,'utf8')); } catch { return []; } }
function writeCalendar(items){ fs.writeFileSync(CAL_FILE, JSON.stringify(items, null, 2)); }

// 리스트
app.get('/api/calendar', (req, res)=>{
  try { return res.json({ ok:true, items: readCalendarSafe() }); } catch(e){ return res.status(500).json({ ok:false, message:e.message }); }
});
// 단건 조회(weekKey)
app.get('/api/calendar/:weekKey', (req, res)=>{
  try {
    const items = readCalendarSafe();
    const item = items.find(x => x && String(x.weekKey||'') === String(req.params.weekKey||''));
    return res.json({ ok:true, item: item || null });
  } catch(e){ return res.status(500).json({ ok:false, message:e.message }); }
});
// 저장/업서트
app.post('/api/calendar/save', async (req, res)=>{
  try {
    const { weekKey, title, html, meta={} } = req.body || {};
    if (!weekKey || !html) return res.status(400).json({ ok:false, message:'weekKey, html required' });
    const now = new Date();
    const items = readCalendarSafe();
    const idx = items.findIndex(x => x && String(x.weekKey||'') === String(weekKey));
    const rec = { id: `wk_${Buffer.from(String(weekKey)).toString('base64')}`, weekKey, title: title||'', html, meta, updatedAt: now.toISOString() };
    if (idx >= 0) items[idx] = rec; else items.push(rec);
    writeCalendar(items);
    return res.json({ ok:true, item: rec });
  } catch(e){ return res.status(500).json({ ok:false, message:e.message }); }
});

// SPA 루트 폴백(index.html)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(PROJECT_ROOT, 'index.html'));
});

// 동적 포트 바인딩(충돌 시 +1 시도)
const server = http.createServer(app);
function bind(startPort, attempts = 10) {
  const port = Number(startPort) || 5173;
  const onError = (err) => {
    if (err && err.code === 'EADDRINUSE' && attempts > 0) {
      server.removeListener('error', onError);
      bind(port + 1, attempts - 1);
    } else {
      // eslint-disable-next-line no-console
      console.error('Server listen error:', err);
      process.exit(1);
    }
  };
  server.once('error', onError);
  server.listen(port, () => {
    server.removeListener('error', onError);
    // eslint-disable-next-line no-console
    console.log(`Backend API + Static listening on http://localhost:${port}`);
  });
}

bind(process.env.PORT || 8080);

// ===== Education Uploader routes (integrated) =====
const assetsRoot = path.join(PROJECT_ROOT, 'assets');
const educationRoot = path.join(assetsRoot, 'education');
try { if (!fs.existsSync(educationRoot)) fs.mkdirSync(educationRoot, { recursive: true }); } catch {}
function sanitizeName(name) {
  return String(name || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/[^\wㄱ-힣().\-\s]/g, '_');
}
app.post('/api/education/upload', upload.single('file'), async (req, res) => {
  try {
    const { cat1 = '전체', cat2 = '-', date = '' } = req.body || {};
    if (!req.file) return res.status(400).json({ ok: false, message: 'file is required' });
    if (!/pdf$/i.test(req.file.originalname)) return res.status(400).json({ ok: false, message: 'PDF only' });
    const d = date ? new Date(date) : new Date();
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dir = path.join(educationRoot, cat1, cat2 || '-', yyyy, mm);
    await fsp.mkdir(dir, { recursive: true });
    const filename = sanitizeName(req.file.originalname);
    const finalPath = path.join(dir, filename);
    await fsp.writeFile(finalPath, req.file.buffer);
    const relUrl = `/assets/education/${encodeURIComponent(cat1)}/${encodeURIComponent(cat2 || '-')}/${yyyy}/${mm}/${encodeURIComponent(filename)}`;
    return res.json({ ok: true, url: relUrl });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, message: e.message || 'upload failed' });
  }
});
app.get('/api/education/list', async (req, res) => {
  try {
    const results = [];
    async function walk(dir, relParts = []) {
      const ents = await fsp.readdir(dir, { withFileTypes: true });
      for (const ent of ents) {
        const full = path.join(dir, ent.name);
        const rel = [...relParts, ent.name];
        if (ent.isDirectory()) {
          await walk(full, rel);
        } else if (/\.pdf$/i.test(ent.name)) {
          const [cat1='전체', cat2='-', yyyy='', mm='', filename] = rel;
          const url = `/assets/education/${rel.map(encodeURIComponent).join('/')}`;
          results.push({ id: `fs_${Buffer.from(url).toString('base64')}`, title: filename.replace(/\.pdf$/i,''), date: `${yyyy||''}-${mm||''}-01`.replace(/-01-01$/,'') || '', cat1, cat2, fileUrl: url, fileName: filename, attendees: [], note:'', status:'완료' });
        }
      }
    }
    await walk(educationRoot, []);
    results.sort((a,b)=> (a.date||'') < (b.date||'') ? 1 : -1);
    res.json({ ok: true, items: results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, message: e.message||'list failed' });
  }
});


