// BackendApiClient: DataClient 인터페이스를 구현하는 API 버전 (초안)
// 실제 연결 시 baseUrl, 인증토큰, CORS 설정 필요

export class BackendApiClient {
  constructor({ baseUrl, fetchImpl = fetch, token } = {}) {
    this.baseUrl = (baseUrl || '').replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
    this.token = token || '';
  }
  _headers() {
    const h = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }
  async _get(path) {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, { headers: this._headers() });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
    return res.json();
  }
  async _post(path, body) {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, { method: 'POST', headers: this._headers(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
    return res.json();
  }
  // DataClient 호환 메서드
  getEquipment() { return this._get('/api/equipment'); }
  getMovements() { return this._get('/api/movements'); }
  getRepairs() { return this._get('/api/repairs'); }
  getQcLogs() { return this._get('/api/qc-logs'); }
  getManufacturers() { return this._get('/api/manufacturers'); }
  getStats() {
    return Promise.all([
      this._get('/api/stats/repairs-monthly'),
      this._get('/api/stats/repairs-cost-monthly'),
      this._get('/api/stats/repairs-topk'),
    ]).then(([monthly, costMonthly, topk]) => ({ monthly, costMonthly, topk }));
  }

  // 구매/견적/발주 도메인 (예시)
  listPurchaseRequests() { return this._get('/api/purchase-requests'); }
  createPurchaseRequest(payload) { return this._post('/api/purchase-requests', payload); }
  listQuotes() { return this._get('/api/quotes'); }
  createQuote(payload) { return this._post('/api/quotes', payload); }
  listOrderHistory() { return this._get('/api/orders/history'); }
}

try { if (typeof window !== 'undefined') window.BackendApiClient = BackendApiClient; } catch {}


