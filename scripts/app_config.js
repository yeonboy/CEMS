// APP_CONFIG: 프론트에서 DataClient ↔ BackendApiClient 전환을 위한 환경값
// 기본은 로컬(db/*) 사용. 필요 시 localStorage/URL 쿼리로 전환 가능
//   로컬 모드:   ?mode=local
//   API  모드:   ?mode=api&base=http://localhost:5173&token=...
//   또는 localStorage: DATA_SOURCE, API_BASE_URL, API_TOKEN

(() => {
  function pickQuery() {
    try {
      const sp = new URLSearchParams(location.search || '');
      const getAny = (...keys) => {
        for (const k of keys) { const v = sp.get(k); if (v != null && v !== '') return v; }
        return null;
      };
      const qMode = getAny('mode','data_source','DATA_SOURCE');
      const qBase = getAny('base','api','API_BASE_URL');
      const qToken = getAny('token','API_TOKEN');
      const out = {};
      if (qMode) out.DATA_SOURCE = qMode;
      if (qBase) out.API_BASE_URL = qBase;
      if (qToken) out.API_TOKEN = qToken;
      Object.entries(out).forEach(([k,v])=> { try { localStorage.setItem(k, v); } catch {} });
      return out;
    } catch { return {}; }
  }

  const q = pickQuery();
  const dataSource = ((q.DATA_SOURCE || localStorage.getItem('DATA_SOURCE') || 'local') + '').toLowerCase();
  const apiBaseUrl = q.API_BASE_URL || localStorage.getItem('API_BASE_URL') || 'http://localhost:5173';
  const apiToken = q.API_TOKEN || localStorage.getItem('API_TOKEN') || '';
  const cfg = { dataSource, apiBaseUrl, apiToken };
  try { window.APP_CONFIG = Object.freeze(cfg); } catch { /* no-op */ }
})();


