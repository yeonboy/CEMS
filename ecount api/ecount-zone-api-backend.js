const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 환경변수 설정
const COM_CODE = process.env.COM_CODE || '654604';
const USER_ID = process.env.USER_ID || '황연걸';
const API_CERT_KEY = process.env.API_CERT_KEY || '15ee97dcdecd742c1bdad909401791dec5';
const LAN_TYPE = process.env.LAN_TYPE || 'ko-KR';
const FORCE_ZONE = process.env.FORCE_ZONE || null; // 예: 'CD'
const ENV_USER_PW = process.env.USER_PW || process.env.PASSWORD || null;

app.use(cors());
app.use(express.json());

// 세션/존 캐시 (메모리)
const sessionCache = { zone: null, sessionId: null, expireAt: 0, apiHost: null };

function now() { return Date.now(); }

// 호스트 빌더: Zone은 sboapi 중앙호스트, 로그인/업무는 sboapi{ZONE}
const ZONE_API_HOST = 'https://sboapi.ecount.com';
const buildSboapiZoneHost = (zone) => `https://sboapi${zone}.ecount.com`;

// Zone 조회: POST https://sboapi.ecount.com/OAPI/V2/Zone
async function getZone(comCode = COM_CODE) {
	if (FORCE_ZONE) return FORCE_ZONE;
	const url = `${ZONE_API_HOST}/OAPI/V2/Zone`;
	const body = { COM_CODE: comCode, API_CERT_KEY: API_CERT_KEY, LAN_TYPE: LAN_TYPE };
	const { data } = await axios.post(url, body, { timeout: 20000 });
	if (!data || String(data.Status) !== '200' || !data.Data || !data.Data.ZONE) {
		throw new Error(`Zone 조회 실패: ${JSON.stringify(data)}`);
	}
	return data.Data.ZONE;
}

function buildLoginBodies(comCode, userId, apiKey, lanType, zone, userPw) {
	const base = { COM_CODE: comCode, USER_ID: userId, API_CERT_KEY: apiKey, LAN_TYPE: lanType, ZONE: zone };
	if (!userPw) return [base];
	return [
		{ ...base, PWD: userPw },
		{ ...base, PASSWORD: userPw },
		{ ...base, USER_PW: userPw },
		base
	];
}

// 로그인: POST https://sboapi{ZONE}.ecount.com/OAPI/V2/OAPILogin (필요 시 비밀번호 포함)
async function login(comCode = COM_CODE, userId = USER_ID, zone, userPw = ENV_USER_PW) {
	const z = zone || (await getZone(comCode));
	const apiHost = buildSboapiZoneHost(z);
	const bodies = buildLoginBodies(comCode, userId, API_CERT_KEY, LAN_TYPE, z, userPw);

	// 1차: OAPILogin (여러 본문 케이스 시도)
	for (const body of bodies) {
		try {
			const url = `${apiHost}/OAPI/V2/OAPILogin`;
			const { data } = await axios.post(url, body, { timeout: 20000 });
			if (data && data.ERR_CODE === '0' && data.SESSION_ID) {
				return { zone: z, sessionId: data.SESSION_ID, apiHost: apiHost };
			}
			if (data && String(data.Status) === '200') {
				const sessionId = data?.Data?.SESSION_ID || data?.Data?.Datas?.SESSION_ID;
				const hostUrl = data?.Data?.HOST_URL;
				if (sessionId) {
					const hostFromLogin = hostUrl ? `https://${hostUrl}` : apiHost;
					return { zone: z, sessionId, apiHost: hostFromLogin };
				}
			}
		} catch (e) { /* 다음 케이스 시도 */ }
	}
	// 2차: Login 경로 폴백
	for (const body of bodies) {
		try {
			const url2 = `${apiHost}/OAPI/V2/Login`;
			const { data } = await axios.post(url2, body, { timeout: 20000 });
			if (data && data.ERR_CODE === '0' && data.SESSION_ID) {
				return { zone: z, sessionId: data.SESSION_ID, apiHost: apiHost };
			}
			if (data && String(data.Status) === '200') {
				const sessionId = data?.Data?.SESSION_ID || data?.Data?.Datas?.SESSION_ID;
				const hostUrl = data?.Data?.HOST_URL;
				if (sessionId) {
					const hostFromLogin = hostUrl ? `https://${hostUrl}` : apiHost;
					return { zone: z, sessionId, apiHost: hostFromLogin };
				}
			}
		} catch (e) { /* 다음 케이스 시도 */ }
	}
	throw new Error('로그인 실패: 모든 조합 시도 실패');
}

async function ensureSession(userPw) {
	if (sessionCache.sessionId && sessionCache.zone && sessionCache.expireAt > now()) {
		return { zone: sessionCache.zone, sessionId: sessionCache.sessionId };
	}
	const { zone, sessionId, apiHost } = await login(COM_CODE, USER_ID, undefined, (userPw || ENV_USER_PW));
	sessionCache.zone = zone;
	sessionCache.sessionId = sessionId;
	sessionCache.apiHost = apiHost;
	sessionCache.expireAt = now() + 19 * 60 * 1000; // 19분 TTL
	return { zone, sessionId };
}

// 일반 API 호출: base(host) 결정 후 /OAPI/V2/<path>?SESSION_ID
async function ecountPost(zone, sessionId, apiPath, body) {
	const preferBase = sessionCache.apiHost || buildSboapiZoneHost(zone);
	const hostCandidates = Array.from(new Set([
		preferBase,
		buildSboapiZoneHost(zone),
		'https://sboapi.ecount.com'
	])).filter(Boolean);
	const pathBases = ['/OAPI/V2', '/ECERP/OAPI/V2'];
	const subPath = apiPath.replace(/^\/(?:OAPI\/V2|ECERP\/OAPI\/V2)/, '');
	let lastErr;
	for (const base of hostCandidates) {
		for (const pBase of pathBases) {
			const url = `${base}${pBase}${subPath.startsWith('/') ? subPath : '/'+subPath}?SESSION_ID=${encodeURIComponent(sessionId)}`;
			try {
				const { data } = await axios.post(url, body, { timeout: 30000, headers:{ 'Accept':'application/json','Content-Type':'application/json' } });
				return data;
			} catch (e) { lastErr = e; }
		}
	}
	throw lastErr || new Error('요청 실패');
}

// 헬스체크/설정
app.get('/api/health', (req, res) => {
	res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/ecount/config', async (req, res) => {
	try {
		const zone = await getZone();
		res.json({ COM_CODE, USER_ID, hasApiKey: !!API_CERT_KEY, LAN_TYPE, zone, forceZone: FORCE_ZONE, zoneApiHost: ZONE_API_HOST, loginHost: sessionCache.apiHost || buildSboapiZoneHost(zone) });
	} catch (e) {
		res.status(500).json({ error: String(e) });
	}
});

// 로그인/세션 테스트 (password 선택 입력)
app.post('/api/ecount/login', async (req, res) => {
	try {
		const userPw = req.body?.password || undefined;
		const z = await getZone();
		const { sessionId } = await login(COM_CODE, USER_ID, z, userPw);
		res.json({ zone: z, sessionId });
	} catch (e) {
		res.status(500).json({ error: String(e) });
	}
});

// 임의 API 호출 프록시 (password 선택 입력)
app.post('/api/ecount/call', async (req, res) => {
	try {
		const { path, body, password } = req.body || {};
		if (!path || !path.startsWith('/')) return res.status(400).json({ error: 'path가 필요합니다. 예: /Inventory/GetListProduct' });
		const { zone, sessionId } = await ensureSession(password);
		const data = await ecountPost(zone, sessionId, path, body || {});
		res.json({ zone, data });
	} catch (e) {
		res.status(500).json({ error: e?.response?.data || String(e) });
	}
});

// 시드 생성
app.post('/api/ecount/test/seed', async (req, res) => {
	try {
		const { password } = req.body || {};
		const { zone, sessionId } = await ensureSession(password);
		const nowStr = Date.now().toString().slice(-6);
		const prodCd = `P${nowStr}`;
		const custCd = `C${nowStr}`;

		const saveProd = await ecountPost(zone, sessionId, '/Inventory/SaveProduct', {
			ProductList: [{ PROD_CD: prodCd, PROD_DES: '데모상품', STND_DES: '규격', UNIT_DES: 'EA', VAT_TYPE: '1', SALE_PRICE: 1000, PUR_PRICE: 800 }]
		});
		await new Promise(r => setTimeout(r, 2000));
		const getProd = await ecountPost(zone, sessionId, '/Inventory/GetListProduct', { PROD_CD: prodCd });

		await new Promise(r => setTimeout(r, 20000));
		const saveCust = await ecountPost(zone, sessionId, '/Customer/SaveCustomer', {
			CustomerList: [{ CUST_CD: custCd, CUST_DES: '데모거래처', CEO_DES: '대표자', TEL: '010-0000-0000', ADDR: '서울' }]
		});
		await new Promise(r => setTimeout(r, 2000));
		const getCust = await ecountPost(zone, sessionId, '/Customer/GetListCustomer', { CUST_CD: custCd });

		res.json({ ok: true, zone, prodCd, custCd, results: { saveProd, getProd, saveCust, getCust } });
	} catch (e) {
		res.status(500).json({ ok: false, error: e?.response?.data || String(e) });
	}
});

app.listen(PORT, () => {
	console.log(`ECOUNT backend listening on http://localhost:${PORT}`);
});
