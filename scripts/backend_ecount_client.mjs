// ECOUNT API 클라이언트 (재시도/타임아웃/메모리+파일 캐시)
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const CACHE_DIR = path.resolve('db/.cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function hashKey(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function buildCacheKey(apiPath, body) {
  return `${apiPath}::${JSON.stringify(body || {})}`;
}

function getCacheFile(cacheKey) {
  return path.join(CACHE_DIR, `${hashKey(cacheKey)}.json`);
}

export function readCache(cacheKey, ttlMs = 10 * 60 * 1000) {
  const f = getCacheFile(cacheKey);
  if (!fs.existsSync(f)) return null;
  try {
    const stat = fs.statSync(f);
    if (Date.now() - stat.mtimeMs > ttlMs) return null;
    return JSON.parse(fs.readFileSync(f, 'utf-8'));
  } catch {
    return null;
  }
}

export function writeCache(cacheKey, data) {
  const f = getCacheFile(cacheKey);
  fs.writeFileSync(f, JSON.stringify({ data, cachedAt: new Date().toISOString() }, null, 2));
}

async function withRetry(fn, { retries = 3, baseDelayMs = 1000 }) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const wait = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
      await sleep(wait);
    }
  }
  throw lastErr;
}

// 외부 백엔드(Express) 프록시를 통해서만 호출함 (비밀정보 노출 방지)
// SERVER_BASE는 로컬 실행 중인 ecount-zone-api-backend.js의 서버 URL
const SERVER_BASE = process.env.ECOUNT_PROXY_BASE || 'http://localhost:3000';

export async function ecountCall(apiPath, body = {}, { timeoutMs = 30000, retries = 3, cacheTtlMs = 5 * 60 * 1000, bypassCache = false } = {}) {
  const cacheKey = buildCacheKey(apiPath, body);
  if (!bypassCache) {
    const cached = readCache(cacheKey, cacheTtlMs);
    if (cached && cached.data) return cached.data;
  }
  const doCall = async () => {
    const url = `${SERVER_BASE}/api/ecount/call`;
    const { data } = await axios.post(url, { path: apiPath, body }, { timeout: timeoutMs, headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' } });
    if (data && data.data) return data.data;
    return data;
  };
  const result = await withRetry(doCall, { retries });
  writeCache(cacheKey, result);
  return result;
}

export async function ensureHealth() {
  const url = `${SERVER_BASE}/api/health`;
  const { data } = await axios.get(url, { timeout: 5000 });
  return data?.status === 'OK';
}


