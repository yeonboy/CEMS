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

// Serve static assets (for local dev). In production, your web server should serve /assets.
app.use('/assets', express.static(assetsRoot, { fallthrough: true }));

app.get('/', (req, res) => {
  res.type('text/plain').send('Education uploader running. POST /api/education/upload (multipart/form-data) with fields: file, cat1, cat2, date');
});

app.listen(PORT, () => {
  console.log(`Uploader listening on http://localhost:${PORT}`);
  console.log(`Serving /assets from ${assetsRoot}`);
});
