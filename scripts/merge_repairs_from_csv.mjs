import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';
import { parse } from 'csv-parse';

// Merge a new repairs CSV into db/repairs_db_clean.json without duplicates.
// Usage: node scripts/merge_repairs_from_csv.mjs "청명장비 엑셀/수리logs(25.01.01~25.11.07).csv"

const PROJECT_ROOT = process.cwd();
const DEFAULT_INPUT = path.join(PROJECT_ROOT, '청명장비 엑셀', '수리logs(25.01.01~25.11.07).csv');
const DB_REPAIRS_CLEAN = path.join(PROJECT_ROOT, 'db', 'repairs_db_clean.json');

function safeDecode(buf, enc){ try{ return buf.toString(enc); }catch{ return ''; } }
function safeIconv(buf, enc){ try{ return iconv.decode(buf, enc); }catch{ return ''; } }

function chooseBestKoreanDecoding(buf){
  const cands=[
    { enc:'utf8', text: safeDecode(buf,'utf8') },
    { enc:'utf16le', text: safeDecode(buf,'utf16le') },
    { enc:'euc-kr', text: safeIconv(buf,'euc-kr') },
    { enc:'cp949', text: safeIconv(buf,'cp949') },
  ];
  const score=(s)=>{ if(!s) return -1e9; const hangul=(s.match(/[가-힣]/g)||[]).length; const repl=(s.match(/�/g)||[]).length; return hangul*5 - repl*10; };
  let best=cands[0];
  for(const c of cands){ if (score(c.text) > score(best.text)) best = c; }
  return best.text || '';
}

function normalizeCsvText(text){
  let t=(text||'').replace(/\r\n?/g,'\n');
  const lines=t.split('\n');
  // 제거: 머리말/메타 라인
  if (lines[0] && /회사명|AS현황|장비투입현황/.test(lines[0])) lines.shift();
  t = lines.join('\n');
  // 혼용 구분자("\t,", ",\t") 정리
  t = t.replace(/\t\s*,/g, ',').replace(/,\s*\t/g, ',');
  return t;
}

function detectDelimiter(text){
  const first=(text.split(/\r?\n/)[0]||'');
  let inQuote=false, tab=0, comma=0;
  for(let i=0;i<first.length;i++){
    const ch=first[i];
    if (ch==='"') inQuote=!inQuote; else if(!inQuote){ if(ch==='\t') tab++; else if(ch===',') comma++; }
  }
  if (comma>=tab) return ','; return '\t';
}

async function readCsvWithHeader(text, delimiter){
  return new Promise((resolve,reject)=>{
    parse(text, { columns:true, skip_empty_lines:true, trim:true, relax_column_count:true, relax_quotes:true, delimiter }, (err, records)=>{
      if (err) return reject(err); resolve(records);
    });
  });
}

function parseYmd(dateLike){
  const s=(dateLike||'').toString().trim(); if(!s) return '';
  // 패턴: 25/01/17-27 → 앞 8자리만
  let m=s.match(/^(\d{2})[./-](\d{2})[./-](\d{2})/); if(m){ return `20${m[1]}-${m[2]}-${m[3]}`.replace(/-(\d)(?=-|$)/g,'-0$1'); }
  // 2025/01/17
  m=s.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/); if(m){ return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`; }
  // 20250117
  m=s.match(/^(\d{4})(\d{2})(\d{2})$/); if(m){ return `${m[1]}-${m[2]}-${m[3]}`; }
  const d=new Date(s); if(!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return '';
}

function normalizeKey(key){ return (key||'').toString().trim().toLowerCase().replace(/\s+/g,'').replace(/[._-]+/g,''); }
function getByKeys(row, keys){ const map=new Map(Object.keys(row||{}).map(k=>[normalizeKey(k), row[k]])); for(const k of keys){ const v=map.get(normalizeKey(k)); if(v!==undefined && v!==null && String(v).trim()!=='') return String(v).trim(); } return ''; }
function sanitizeCell(v){ let s=(v??'').toString().trim(); if(s.startsWith('"')&&s.endsWith('"')) s=s.slice(1,-1); s=s.replace(/\n/g,' ').replace(/\s+/g,' ').trim(); return s; }
function parseCost(str){ const s=String(str??'').replace(/[^0-9-]/g,''); if(!s) return 0; const n=parseInt(s,10); return Number.isFinite(n)?n:0; }
function normalizeText(s){ return String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,''); }

function splitMeasurementAndSeries(seriesRaw){
  const s=String(seriesRaw||'').trim();
  const m=s.match(/^\(([^)]+)\)\s*(.+)$/);
  if (m) return { measurement: m[1].trim(), category: `(${m[1].trim()}) ${m[2].trim()}` };
  return { measurement: '', category: s };
}

function parseRepairRows(records){
  const out=[];
  for(const r of records){
    const id = sanitizeCell(getByKeys(r, ['일자-no.','no','문서번호','문서no','접수번호'])) || '';
    const dateRaw = sanitizeCell(getByKeys(r, ['일자-no.','일자','등록일','date','수리일자','입고일자'])) || id;
    const repair_date = parseYmd(dateRaw);
    const company = sanitizeCell(getByKeys(r, ['업체','수리업체','입고처','company','repair_company']));
    const manager = sanitizeCell(getByKeys(r, ['담당자','담당','manager']));
    const product_series = sanitizeCell(getByKeys(r, ['품목계열','품명','장비명','제품','product','product_series']));
    const cost = parseCost(getByKeys(r, ['수리비용','비용','금액','cost','합계금액']));
    const repair_type = sanitizeCell(getByKeys(r, ['내용','비고','내역','details','repair_type','수리항목']));
    const serial = sanitizeCell(getByKeys(r, ['규격','일련번호','s/n','sn','serial','serialno','시리얼번호']));
    if (!serial || !repair_date) continue;
    const ms = splitMeasurementAndSeries(product_series);
    out.push({
      id,
      serial,
      repair_date,
      repair_company: company,
      manager,
      product_series: product_series,
      cost,
      repair_type,
      sequence: '',
      measurement_item: ms.measurement || '',
      equipment_category: ms.category || '',
      equipment_status: ''
    });
  }
  return out;
}

function readJsonIfExists(file){ try{ const t=fs.readFileSync(file,'utf8'); const j=JSON.parse(t); return Array.isArray(j)?j:[]; }catch{return []} }

function uniqKey(r){
  // primary key: date|serial|company|type(normalized)
  const d=(r.repair_date||r.date||'').slice(0,10);
  const s=String(r.serial||'').trim();
  const c=String(r.repair_company||r.company||'').trim();
  const t=normalizeText(r.repair_type||r.type||'');
  return [d,s,c,t].join('|');
}

function betterRecord(a,b){
  // prefer: non-zero cost, longer details, non-empty manager/company
  const ca=Number(a.cost||0), cb=Number(b.cost||0);
  if (cb!==ca) return cb>ca ? b : a;
  const la=(a.repair_type||'').length, lb=(b.repair_type||'').length;
  if (lb!==la) return lb>la ? b : a;
  const ma=!!(a.manager||''), mb=!!(b.manager||'');
  if (mb!==ma) return mb ? b : a;
  const coa=!!(a.repair_company||''), cob=!!(b.repair_company||'');
  if (cob!==coa) return cob ? b : a;
  return b; // default to newer
}

async function main(){
  const input = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_INPUT;
  console.log('=== Merge repairs from CSV: START ===');
  console.log('input:', path.relative(PROJECT_ROOT, input));
  if (!fs.existsSync(input)) throw new Error('INPUT CSV not found: '+input);

  // read and parse CSV
  const buf = fs.readFileSync(input);
  const textRaw = chooseBestKoreanDecoding(buf);
  const text = normalizeCsvText(textRaw);
  const delimiter = detectDelimiter(text);
  const records = await readCsvWithHeader(text, delimiter);
  const newRepairs = parseRepairRows(records);
  console.log('parsed new rows:', newRepairs.length);

  // load existing clean repairs
  const existing = readJsonIfExists(DB_REPAIRS_CLEAN);
  console.log('existing rows:', existing.length);

  const map = new Map();
  for(const r of existing){ map.set(uniqKey(r), r); }
  let updates=0, inserts=0;
  for(const r of newRepairs){
    const k = uniqKey(r);
    if (!map.has(k)) { map.set(k, r); inserts++; }
    else { const merged = betterRecord(map.get(k), r); if (merged!==map.get(k)) { map.set(k, merged); updates++; } }
  }
  const merged = Array.from(map.values()).sort((a,b)=> String(a.repair_date||a.date||'').localeCompare(String(b.repair_date||b.date||'')));

  // backup before write
  try{
    const ts = new Date().toISOString().slice(0,10);
    const backup = path.join(PROJECT_ROOT, 'db', `repairs_db_clean_backup_${ts}.json`);
    if (!fs.existsSync(backup)) fs.copyFileSync(DB_REPAIRS_CLEAN, backup);
  }catch{}

  fs.writeFileSync(DB_REPAIRS_CLEAN, JSON.stringify(merged, null, 2));
  console.log('written:', path.relative(PROJECT_ROOT, DB_REPAIRS_CLEAN), merged.length, `(inserts ${inserts}, updates ${updates})`);
  console.log('=== Merge repairs from CSV: DONE ===');
}

main().catch(e=>{ console.error('Merge failed:', e && e.message ? e.message : e); process.exit(1); });


