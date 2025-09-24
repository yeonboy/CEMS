// DataClient: 데이터 접근 어댑터 (초기 구현: 로컬 db/* JSON)
// 추후 이카운트/백엔드 API로 동일 인터페이스 유지한 채 교체

export class DataClient {
  constructor(options = {}) {
    this.basePath = options.basePath || '/db';
    this.cacheBust = options.cacheBust || `v=${Date.now()}`;
  }

  _withBust(url){
    try {
      const hasQuery = url.includes('?');
      return `${url}${hasQuery ? '&' : '?'}${this.cacheBust}`;
    } catch { return url; }
  }

  async _json(url) {
    const res = await globalThis.fetch(this._withBust(url), { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }

  async getEquipment() {
    // 표준 장비 DB 우선, 폴백 없음(스키마 통일)
    return this._json(`${this.basePath}/equipment_db.json`);
  }

  async getMovements() {
    return this._json(`${this.basePath}/movements_db.json`);
  }

  async getRepairs() {
    // 현재 화면 로직은 clean본을 소비함
    return this._json(`${this.basePath}/repairs_db_clean.json`);
  }

  async getQcLogs() { return this._json(`${this.basePath}/QC_logs.json`); }
  async getManufacturers() { return this._json(`${this.basePath}/manufacturers.json`); }

  // 통계
  async getStats() {
    const [monthly, costMonthly, topk] = await Promise.all([
      this._json(`${this.basePath}/stats_repairs_monthly.json`),
      this._json(`${this.basePath}/stats_repair_cost_monthly.json`),
      this._json(`${this.basePath}/stats_repairs_topk.json`)
    ]);
    return { monthly, costMonthly, topk };
  }
}

// 전역 접근(스크립트 태그 환경) 지원
try { if (typeof window !== 'undefined') window.DataClient = DataClient; } catch {}


