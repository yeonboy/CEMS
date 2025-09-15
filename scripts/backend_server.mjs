import express from 'express';
import cors from 'cors';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import http from 'http';
import multer from 'multer';

const app = express();
app.use(cors());
app.use(express.json());

const PROJECT_ROOT = process.cwd();
const DB_DIR = path.join(PROJECT_ROOT, 'db');
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

bind(process.env.PORT || 5173);

// ===== Education Uploader routes (integrated) =====
const assetsRoot = path.join(PROJECT_ROOT, 'assets');
const educationRoot = path.join(assetsRoot, 'education');
try { if (!fs.existsSync(educationRoot)) fs.mkdirSync(educationRoot, { recursive: true }); } catch {}
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
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


