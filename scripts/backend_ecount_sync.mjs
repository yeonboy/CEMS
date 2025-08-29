// ECOUNT → 백엔드 산출물 생성기: db/backend_ecount_*.json
import fs from 'fs';
import path from 'path';
import { ecountCall, ensureHealth } from './backend_ecount_client.mjs';

const DB_DIR = path.resolve('db');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function nowIso() { return new Date().toISOString(); }

async function fetchPaged(pathName, reqBody = {}, { pageSize = 500, maxPages = 100 } = {}) {
  const results = [];
  for (let page = 1; page <= maxPages; page++) {
    const body = { ...reqBody, Page: page, PageSize: pageSize };
    const data = await ecountCall(pathName, body, { cacheTtlMs: 60 * 1000 });
    const list = data?.Data?.List || data?.Data?.Datas || data?.List || data?.Datas || [];
    if (!Array.isArray(list) || list.length === 0) break;
    results.push(...list);
    const total = data?.Data?.Total || data?.Total || undefined;
    if (total && results.length >= total) break;
  }
  return results;
}

function normalizeProduct(p) {
  return {
    productCode: String(p.PROD_CD || p.ProdCd || p.prod_cd || '').trim(),
    productName: String(p.PROD_DES || p.ProdDes || p.prod_des || '').trim(),
    specification: String(p.STND_DES || p.StndDes || p.stnd_des || '').trim(),
    unit: String(p.UNIT_DES || p.UnitDes || p.unit_des || 'EA').trim(),
    salePrice: Number(p.SALE_PRICE || p.SalePrice || 0),
    purchasePrice: Number(p.PUR_PRICE || p.PurPrice || 0),
    category: String(p.CATEGORY || p.Category || p.category || ''),
    status: String(p.STATUS || p.Status || p.status || '활성'),
  };
}

function normalizeCustomer(c) {
  return {
    customerCode: String(c.CUST_CD || c.CustCd || '').trim(),
    customerName: String(c.CUST_DES || c.CustDes || '').trim(),
    phone: String(c.TEL || c.Phone || '').trim(),
    ceo: String(c.CEO_DES || c.CeoDes || '').trim(),
    address: String(c.ADDR || c.Address || '').trim(),
    email: String(c.EMAIL || c.Email || '').trim(),
    type: String(c.CUST_TYPE || c.CustType || ''),
  };
}

function normalizeInventory(i) {
  return {
    productCode: String(i.PROD_CD || i.ProdCd || '').trim(),
    warehouse: String(i.WH_CD || i.WhCd || i.WH_DES || i.WhDes || '').trim(),
    qty: Number(i.QTY || i.Qty || i.STOCK_QTY || 0),
    lot: String(i.LOT || i.Lot || ''),
    lastDate: String(i.LAST_DT || i.LastDate || ''),
  };
}

async function main() {
  console.log('=== backend ecount sync: START ===');
  const DISABLED = String(process.env.ECOUNT_DISABLED || '').toLowerCase() === 'true'
    || String(process.env.ECOUNT_DISABLED || '') === '1';

  function writePlaceholders(reason) {
    const meta = { _schemaVersion: 1, generatedAt: nowIso(), source: 'ecount', disabled: true, reason };
    writeJson(path.join(DB_DIR, 'backend_ecount_products.json'), { ...meta, count: 0, items: [] });
    writeJson(path.join(DB_DIR, 'backend_ecount_customers.json'), { ...meta, count: 0, items: [] });
    writeJson(path.join(DB_DIR, 'backend_ecount_inventory.json'), { ...meta, count: 0, items: [] });
  }

  if (DISABLED) {
    console.log('ECOUNT sync disabled by ECOUNT_DISABLED env. Emitting placeholders.');
    writePlaceholders('disabled');
    console.log('=== backend ecount sync: DONE (placeholders) ===');
    return;
  }

  const healthy = await ensureHealth().catch(()=>false);
  if (!healthy) {
    console.warn('ECOUNT backend proxy not running. Emitting placeholders.');
    writePlaceholders('proxy_unavailable');
    console.log('=== backend ecount sync: DONE (placeholders) ===');
    return;
  }

  const meta = { _schemaVersion: 1, generatedAt: nowIso(), source: 'ecount' };

  // 1) 제품 목록
  const products = await fetchPaged('/Inventory/GetListProduct', { UseYn: 'Y' }, { pageSize: 500, maxPages: 200 });
  const productsNorm = products.map(normalizeProduct).filter(p => p.productCode || p.productName);
  writeJson(path.join(DB_DIR, 'backend_ecount_products.json'), { ...meta, count: productsNorm.length, items: productsNorm });

  // 2) 거래처 목록
  const customers = await fetchPaged('/Customer/GetListCustomer', { UseYn: 'Y' }, { pageSize: 500, maxPages: 200 });
  const customersNorm = customers.map(normalizeCustomer).filter(c => c.customerCode || c.customerName);
  writeJson(path.join(DB_DIR, 'backend_ecount_customers.json'), { ...meta, count: customersNorm.length, items: customersNorm });

  // 3) 재고 현황 (창고별)
  const inventory = await fetchPaged('/Inventory/GetListCurrentStock', { StdDt: new Date().toISOString().slice(0,10).replace(/-/g,'') }, { pageSize: 500, maxPages: 200 });
  const inventoryNorm = inventory.map(normalizeInventory).filter(i => i.productCode);
  writeJson(path.join(DB_DIR, 'backend_ecount_inventory.json'), { ...meta, count: inventoryNorm.length, items: inventoryNorm });

  console.log('=== backend ecount sync: DONE ===');
}

main().catch(err => {
  console.error('Sync failed:', err?.response?.data || err);
  process.exit(1);
});


