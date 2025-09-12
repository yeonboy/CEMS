// ECOUNT → 이동로그 동기화: db/backend_ecount_movements.json 산출
import fs from 'fs';
import path from 'path';
import { ecountCall, ensureHealth } from './backend_ecount_client.mjs';

const DB_DIR = path.resolve('db');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

function nowIso(){ return new Date().toISOString(); }
function writeJson(file, data){ fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

function parseYmd(dateStr){
  const s = (dateStr||'').toString().trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m3 = s.match(/^(\d{4})(\d{2})(\d{2})$/); if (m3) return `${m3[1]}-${m3[2]}-${m3[3]}`;
  const m1 = s.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})/); if (m1) return `${m1[1]}-${String(m1[2]).padStart(2,'0')}-${String(m1[3]).padStart(2,'0')}`;
  const m2 = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/); if (m2) return `${m2[3]}-${String(m2[2]).padStart(2,'0')}-${String(m2[1]).padStart(2,'0')}`;
  const d = new Date(s); if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return '';
}

function pick(obj, keys){ for (const k of keys){ const v = obj?.[k]; if (v!=null && String(v).trim()!=='') return v; } return ''; }

function normalizeMove(row){
  const date = parseYmd(pick(row, ['IO_DT','DT','Date','IO_DATE','IODate','WORK_DT']));
  const outLocation = pick(row, ['OUT_WH_DES','OutWhDes','FROM_WH','FromWh','FROM_WH_DES']);
  const inLocation = pick(row, ['IN_WH_DES','InWhDes','TO_WH','ToWh','TO_WH_DES']);
  const equipmentName = pick(row, ['PROD_DES','ProdDes','ITEM_DES','ItemDes']);
  const serial = (pick(row, ['SERIAL','Serial','S_NO','SNO','LOT','Lot'])||'').toString().trim();
  const quantity = Number(pick(row, ['QTY','Qty','IO_QTY','IoQty'])||1) || 1;
  const note = pick(row, ['REMARKS','Remarks','RMK','Rmk','MEMO','Memo']);
  const status = '';
  return { date, outLocation, inLocation, equipmentName, serial, quantity, note, status };
}

async function main(){
  console.log('=== ECOUNT movements sync: START ===');
  const healthy = await ensureHealth().catch(()=>false);
  const OUT = path.join(DB_DIR, 'backend_ecount_movements.json');
  const meta = { _schemaVersion: 1, generatedAt: nowIso(), source: 'ecount' };
  if (!healthy){
    console.warn('ECOUNT proxy not available. Writing placeholder.');
    writeJson(OUT, { ...meta, disabled: true, reason: 'proxy_unavailable', count: 0, items: [] });
    console.log('=== ECOUNT movements sync: DONE (placeholder) ===');
    return;
  }
  const apiPath = process.env.ECOUNT_MOVES_PATH || '/Inventory/GetListInOut';
  const ymd = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const from = process.env.ECOUNT_MOVES_FROM || '20240101';
  const to = process.env.ECOUNT_MOVES_TO || ymd;
  const req = { FromDt: from, ToDt: to };
  const raw = await (async ()=>{
    try { return await ecountCall(apiPath, req, { cacheTtlMs: 60*1000 }); } catch(e){ console.error('ecountCall failed', e?.response?.data||e); return []; }
  })();
  const list = Array.isArray(raw) ? raw : (raw?.Data?.List || raw?.List || []);
  const items = list.map(normalizeMove).filter(m => m.serial && m.date);
  writeJson(OUT, { ...meta, from, to, apiPath, count: items.length, items });
  console.log('written:', path.relative(process.cwd(), OUT), items.length);
  console.log('=== ECOUNT movements sync: DONE ===');
}

main().catch(e=>{ console.error(e); process.exit(1); });


