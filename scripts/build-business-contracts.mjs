// Build business contracts DB from 청명장비 엑셀/계약정리.csv
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import iconv from 'iconv-lite';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SOURCE_FILE = path.resolve(PROJECT_ROOT, '청명장비 엑셀', '계약정리.csv');
const DB_DIR = path.resolve(PROJECT_ROOT, 'db');
const OUTPUT_FILE = path.join(DB_DIR, 'business_contracts_q4_2025.json');

const Q4_FROM = new Date('2025-10-01T00:00:00');
const Q4_TO = new Date('2025-12-31T23:59:59');

function decodeBest(buf) {
  const tryUtf8 = buf.toString('utf8');
  if (!/�/.test(tryUtf8)) return tryUtf8;
  try {
    const cp949 = iconv.decode(buf, 'cp949');
    if (cp949 && cp949.length) return cp949;
  } catch {}
  return tryUtf8;
}

function toInt(v) {
  if (v == null) return 0;
  const m = String(v).match(/-?\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

// 전략 남은 회수: 'N회' 패턴만 인식, 연도(2000~2099) 등은 무시
function parseRemainingExecutions(text) {
  const s = String(text || '').trim();
  // 우선 'N회' 패턴 우선 추출
  const m = s.match(/(\d+)\s*회/);
  if (m) {
    const n = parseInt(m[1], 10);
    return isFinite(n) ? n : 0;
  }
  // '회' 표기가 없고 순수 숫자만 있을 때: 연도(2000~2099)로 보이는 값은 0 처리
  const onlyNum = s.match(/^\d+$/) ? parseInt(s, 10) : NaN;
  if (isFinite(onlyNum)) {
    if (onlyNum >= 2000 && onlyNum <= 2099) return 0;
    return onlyNum;
  }
  return 0;
}

function normalizeDateLike(s) {
  const str = String(s || '').trim();
  if (!str) return '';
  // Accept YYYY.MM.DD, YYYY-MM-DD, YYYY/MM/DD, and partial YYYY.MM
  const mYmd = str.match(/(\d{4})[./-]?(\d{1,2})[./-]?(\d{1,2})/);
  if (mYmd) {
    const y = mYmd[1];
    const mo = String(mYmd[2]).padStart(2, '0');
    const d = String(mYmd[3]).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  const mYm = str.match(/(\d{4})[./-]?(\d{1,2})/);
  if (mYm) {
    const y = mYm[1];
    const mo = String(mYm[2]).padStart(2, '0');
    return `${y}-${mo}-01`;
  }
  return '';
}

function parsePeriod(rangeStr) {
  const s = String(rangeStr || '').trim();
  const [a, b] = s.split('~').map(x => normalizeDateLike(x));
  const from = a || '';
  const to = b || '';
  return { from, to };
}

function overlapDays(fromIso, toIso, rangeFrom, rangeTo) {
  try {
    const a = fromIso ? new Date(fromIso + 'T00:00:00') : null;
    const b = toIso ? new Date(toIso + 'T23:59:59') : null;
    if (!a || !b) return 0;
    const start = a > rangeFrom ? a : rangeFrom;
    const end = b < rangeTo ? b : rangeTo;
    const ms = end - start;
    return ms > 0 ? Math.floor(ms / (24 * 60 * 60 * 1000)) + 1 : 0;
  } catch { return 0; }
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function countOverlapMonths(fromIso, toIso, rangeFrom, rangeTo) {
  try {
    const a = fromIso ? new Date(fromIso + 'T00:00:00') : null;
    const b = toIso ? new Date(toIso + 'T23:59:59') : null;
    if (!a || !b) return 0;
    const start = a > rangeFrom ? a : rangeFrom;
    const end = b < rangeTo ? b : rangeTo;
    if (end < start) return 0;
    const months = new Set();
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMark = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cur <= endMark) {
      months.add(monthKey(cur));
      cur.setMonth(cur.getMonth()+1);
    }
    return months.size;
  } catch { return 0; }
}

function parseClassificationCell(text) {
  const s = String(text || '').trim();
  // Match patterns like: 총 12회 / 의뢰 3회
  const mTotal = s.match(/총\s*(\d+)\s*회/);
  const mReq = s.match(/의뢰\s*(\d+)\s*회/);
  return {
    totalSurveys: mTotal ? parseInt(mTotal[1], 10) : 0,
    requestedSurveys: mReq ? parseInt(mReq[1], 10) : 0,
    raw: s,
  };
}

function parseMeasurementDays(text) {
  const s = String(text || '').trim();
  const m = s.match(/(\d+)\s*일/);
  return m ? parseInt(m[1], 10) : 0;
}

function parseCustomItems(text) {
  const s = String(text || '').trim();
  const m = s.match(/\(([^)]*)\)/);
  if (!m) return [];
  return m[1].split(/[,，]/).map(x => x.trim()).filter(Boolean);
}

function build() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(SOURCE_FILE)) {
    console.warn('Source CSV not found:', SOURCE_FILE);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ meta: { _schemaVersion: '1.0.0', generatedAt: new Date().toISOString(), sourceFile: path.relative(PROJECT_ROOT, SOURCE_FILE) }, data: [] }, null, 2));
    return;
  }
  const buf = fs.readFileSync(SOURCE_FILE);
  const text = decodeBest(buf);
  const records = parse(text, { relaxColumnCount: true, skipEmptyLines: true });

  const data = [];
  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    // Expect columns: B(1)=사업명, C(2)=의뢰사, D(3)=기간, E(4)=공사시, F(5)=운영시, G(6)=사후, H(7)=전략(남은 회수), I(8)=수동 지점, J(9)=자동 지점, K(10)=8항목 X일연속, L(11)=PM+NOx X일연속, M(12)=X일 (괄호항목)
    const projectName = (row[1] || '').toString().trim();
    const client = (row[2] || '').toString().trim();
    const period = parsePeriod(row[3] || '');
    // 헤더/더미 데이터 제외: 사업명이 "사업명"이거나 의뢰사가 "의뢰사"인 경우 스킵
    if (!projectName || !client || projectName === '사업명' || client === '의뢰사') continue;

    const construction = parseClassificationCell(row[4] || '');
    const operation = parseClassificationCell(row[5] || '');
    const post = parseClassificationCell(row[6] || '');
    const strategyRaw = (row[7] || '').toString().trim();
    const strategyRemaining = parseRemainingExecutions(row[7]);
    const manualSites = toInt(row[8]);
    const autoSites = toInt(row[9]);

    const kDays = parseMeasurementDays(row[10] || '');
    const lDays = parseMeasurementDays(row[11] || '');
    const mDays = parseMeasurementDays(row[12] || '');
    const mItems = parseCustomItems(row[12] || '');

    const plans = [];
    if (kDays > 0) {
      plans.push({ type: 'ALL_8', days: kDays, items: ['PM-10','PM2.5','NOx','SOx','Pb','CO','O3','벤젠'] });
    }
    if (lDays > 0) {
      plans.push({ type: 'PM_NOX', days: lDays, items: ['PM-10','PM2.5','NOx'] });
    }
    if (mDays > 0) {
      const items = mItems && mItems.length ? mItems : [];
      plans.push({ type: 'CUSTOM', days: mDays, items });
    }

    const overlapQ4Days = overlapDays(period.from, period.to, Q4_FROM, Q4_TO);
    const overlapQ4Months = countOverlapMonths(period.from, period.to, Q4_FROM, Q4_TO);

    data.push({
      projectId: `row-${i + 1}`,
      projectName,
      client,
      period,
      overlapQ4Days,
      classification: {
        construction,
        operation,
        post,
        strategy: { remainingExecutions: strategyRemaining, raw: strategyRaw }
      },
      // 분류별 4분기 내 남은 집행 횟수(원본 데이터 기반 수정)
      executionsQ4: {
        construction: Math.ceil(overlapQ4Months / 3), // 공사시는 분기 단위 추산 (분기 1회 → 4분기 1회)
        operation: Math.ceil(overlapQ4Months / 3), // 운영시는 분기 단위 추산
        post: overlapQ4Months, // 사후는 월 단위 추산
        strategy: strategyRemaining // 전략은 단발성 회수 그대로 노출
      },
      siteCounts: { manual: manualSites, automatic: autoSites },
      measurementPlans: plans,
      source: { file: path.relative(PROJECT_ROOT, SOURCE_FILE), row: i + 1 }
    });
  }

  const payload = {
    meta: {
      _schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      sourceFile: path.relative(PROJECT_ROOT, SOURCE_FILE),
      quarter: { from: '2025-10-01', to: '2025-12-31' }
    },
    data
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2));
  console.log('written:', path.relative(PROJECT_ROOT, OUTPUT_FILE), 'rows:', data.length);
}

build();


