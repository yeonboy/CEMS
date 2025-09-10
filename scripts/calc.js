// 계산/집계 모듈: 가동률, 장기입고, 금액/부가세

export function businessDays(from, to) {
  const s = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const e = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  let c = 0; for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) { const wd = d.getDay(); if (wd !== 0 && wd !== 6) c++; }
  return Math.max(c, 0);
}

export function calculateLastYearUtilization(serial, movements) {
  const to = new Date();
  const from = new Date(to.getFullYear() - 1, to.getMonth(), to.getDate());
  const days = businessDays(from, to);
  if (!Array.isArray(movements) || movements.length === 0 || days === 0) return { percent: 0, className: '' };
  const siteDays = movements
    .filter(m => m && m.date && /현장/.test(String(m.inLocation || '')))
    .map(m => m.date)
    .filter(Boolean)
    .reduce((set, d) => { const key = String(d).slice(0, 10); set.add(key); return set; }, new Set()).size;
  const pct = Math.round((siteDays / days) * 100);
  const cls = pct >= 80 ? 'text-green-600' : (pct >= 50 ? 'text-amber-600' : 'text-red-600');
  return { percent: pct, className: cls };
}

export function vat(amount, rate = 0.1) {
  const v = Math.round((Number(amount) || 0) * rate);
  return v;
}
export function totalWithVat(amount, rate = 0.1) {
  const base = Number(amount) || 0; const v = vat(base, rate); return base + v;
}

try { if (typeof window !== 'undefined') window.Calc = { businessDays, calculateLastYearUtilization, vat, totalWithVat }; } catch {}


