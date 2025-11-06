import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';
import { parse } from 'csv-parse';

const PROJECT_ROOT = process.cwd();
const INPUT_CSV_DEFAULT = path.join(PROJECT_ROOT, '청명장비 엑셀', '8.29~10.14movements_logs.csv');
const DB_MOVES = path.join(PROJECT_ROOT, 'db', 'movements_db.json');

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
function safeDecode(buf, enc){ try{ return buf.toString(enc); }catch{ return ''; } }
function safeIconv(buf, enc){ try{ return iconv.decode(buf, enc); }catch{ return ''; } }

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

async function readCsvWithHeader(text, delimiter){
  return new Promise((resolve,reject)=>{
    parse(text, { columns:true, skip_empty_lines:true, trim:true, relax_column_count:true, delimiter }, (err, records)=>{
      if (err) return reject(err); resolve(records);
    });
  });
}

function readJsonIfExists(file){ try{ const t=fs.readFileSync(file,'utf8'); const j=JSON.parse(t); return Array.isArray(j)?j:[]; }catch{return []} }

function uniqKey(m){ return [parseYmd(m.date||''),(m.serial||'').trim(),(m.outLocation||'').trim(),(m.inLocation||'').trim(),String(m.quantity||1)].join('|'); }

async function main(){
  const inputCsvPath = process.argv[2] ? path.resolve(process.argv[2]) : INPUT_CSV_DEFAULT;
  console.log('=== Merge movements from CSV: START ===');
  console.log('input:', path.relative(PROJECT_ROOT, inputCsvPath));
  if (!fs.existsSync(inputCsvPath)) throw new Error('INPUT CSV not found: '+inputCsvPath);
  const buf = fs.readFileSync(inputCsvPath);
  const textRaw = chooseBestKoreanDecoding(buf);
  const text = normalizeCsvText(textRaw);
  const delimiter = detectDelimiter(text);
  let records=[];
  try{ records = await readCsvWithHeader(text, delimiter); }catch(e){ throw e; }
  const newMoves = parseMovementRows(records).filter(m=>m.serial && m.date);
  console.log('parsed new rows:', newMoves.length);

  const existing = readJsonIfExists(DB_MOVES);
  console.log('existing rows:', existing.length);
  const map = new Map();
  for (const x of existing) map.set(uniqKey(x), x);
  for (const x of newMoves) map.set(uniqKey(x), x);
  const merged = Array.from(map.values()).sort((a,b)=> (parseYmd(a.date)||'') < (parseYmd(b.date)||'') ? -1 : 1);

  // backup
  try{
    const ts = new Date().toISOString().slice(0,10);
    const backup = path.join(PROJECT_ROOT, 'db', `movements_db_backup_${ts}.json`);
    if (!fs.existsSync(backup)) fs.copyFileSync(DB_MOVES, backup);
  }catch{}

  fs.writeFileSync(DB_MOVES, JSON.stringify(merged, null, 2));
  console.log('written:', path.relative(PROJECT_ROOT, DB_MOVES), merged.length);
  console.log('=== Merge movements from CSV: DONE ===');
}

main().catch(e=>{ console.error('Merge failed:', e.message||e); process.exit(1); });


