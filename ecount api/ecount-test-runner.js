require('dotenv').config();
const axios = require('axios');

const COM_CODE = process.env.COM_CODE;
const USER_ID = process.env.USER_ID;
const API_CERT_KEY = process.env.API_CERT_KEY;
const LAN_TYPE = process.env.LAN_TYPE || 'ko-KR';
const HOST_PREFIX = process.env.ECOUNT_HOST_PREFIX || 'sboapicd';

function delay(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function getZone(){
	const { data } = await axios.post(`https://${HOST_PREFIX}.ecount.com/OAPI/V2/Zone/GetZone`, {
		COM_CODE, API_CERT_KEY, LAN_TYPE
	}, { timeout: 20000 });
	if (data.ERR_CODE !== '0') throw new Error('GetZone 실패: ' + JSON.stringify(data));
	return data.ZONE;
}

function base(zone){ return `https://${HOST_PREFIX}${zone}.ecount.com`; }

async function login(zone){
	const { data } = await axios.post(`${base(zone)}/OAPI/V2/OAPILogin`, {
		COM_CODE, USER_ID, API_CERT_KEY, LAN_TYPE
	}, { timeout: 20000 });
	if (data.ERR_CODE !== '0') throw new Error('Login 실패: ' + JSON.stringify(data));
	return data.SESSION_ID;
}

async function post(zone, sessionId, path, body){
	const url = `${base(zone)}${path}?SESSION_ID=${encodeURIComponent(sessionId)}`;
	const { data } = await axios.post(url, body, { timeout: 30000 });
	return data;
}

(async () => {
	try {
		console.log('1) GetZone');
		const zone = await getZone();
		console.log('ZONE:', zone);

		console.log('2) Login');
		const sessionId = await login(zone);
		console.log('SESSION_ID:', sessionId);

		console.log('3) SaveProduct');
		const prodRes = await post(zone, sessionId, '/OAPI/V2/Inventory/SaveProduct', {
			ProductList: [{ PROD_CD: 'PDEMO', PROD_DES: '데모상품', STND_DES: '규격', UNIT_DES: 'EA', VAT_TYPE: '1', SALE_PRICE: 1000, PUR_PRICE: 800 }]
		});
		console.log('SaveProduct:', prodRes);

		console.log('대기(조회 2초)');
		await delay(2000);
		console.log('4) GetListProduct');
		const prodGet = await post(zone, sessionId, '/OAPI/V2/Inventory/GetListProduct', { PROD_CD: 'PDEMO' });
		console.log('GetListProduct:', prodGet);

		console.log('완료');
	} catch (e) {
		console.error('테스트 실패:', e?.response?.data || String(e));
		process.exit(1);
	}
})();
