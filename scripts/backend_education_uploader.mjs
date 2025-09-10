// Lightweight uploader server for education PDFs
// Usage:
// 1) npm install express multer cors
// 2) node scripts/backend_education_uploader.mjs
// This will listen on http://localhost:5173 by default

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 5173;

app.use(cors());
app.use(express.json());

// Ensure base directories exist
const projectRoot = process.cwd();
const assetsRoot = path.join(projectRoot, 'assets');
const educationRoot = path.join(assetsRoot, 'education');

for (const p of [assetsRoot, educationRoot]) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// Multer storage to temp memory; we'll move to final path after validating
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB

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
    const extOk = /pdf$/i.test(req.file.originalname);
    if (!extOk) return res.status(400).json({ ok: false, message: 'PDF only' });

    // date -> yyyy/mm
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

// 리스트 API: /assets/education 하위의 PDF 파일들을 트리 스캔하여 반환
app.get('/api/education/list', async (req, res) => {
  try {
    const results = [];
    async function walk(dir, relParts = []){
      const ents = await fsp.readdir(dir, { withFileTypes: true });
      for (const ent of ents){
        const full = path.join(dir, ent.name);
        const rel = [...relParts, ent.name];
        if (ent.isDirectory()){
          await walk(full, rel);
        } else if (/\.pdf$/i.test(ent.name)){
          // 기대 경로: education/<cat1>/<cat2>/<yyyy>/<mm>/<file>
          const [cat1='전체', cat2='-', yyyy='', mm='', filename] = rel;
          const url = `/assets/education/${rel.map(encodeURIComponent).join('/')}`;
          results.push({
            id: `fs_${Buffer.from(url).toString('base64')}`,
            title: filename.replace(/\.pdf$/i,''),
            date: `${yyyy||''}-${mm||''}-01`.replace(/-01-01$/,'') || '',
            cat1, cat2,
            fileUrl: url,
            fileName: filename,
            attendees: [], note: '', status: '완료'
          });
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

// Serve static assets (for local dev). In production, your web server should serve /assets.
app.use('/assets', express.static(assetsRoot, { fallthrough: true }));

app.get('/', (req, res) => {
  res.type('text/plain').send('Education uploader running. POST /api/education/upload (multipart/form-data) with fields: file, cat1, cat2, date');
});

app.listen(PORT, () => {
  console.log(`Uploader listening on http://localhost:${PORT}`);
  console.log(`Serving /assets from ${assetsRoot}`);
});
