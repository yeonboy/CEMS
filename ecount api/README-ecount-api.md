# 이카운트 Zone API 호출 가이드

이 프로젝트는 [이카운트 오픈 API](https://sboapicd.ecount.com/ECERP/OAPI/OAPIView?lan_type=ko-KR#)의 Zone API를 호출하기 위한 예제 코드입니다.

## 📋 프로젝트 구성

- `ecount-zone-api.html` - 프론트엔드 데모 페이지
- `ecount-zone-api-backend.js` - Node.js 백엔드 서버
- `package.json` - Node.js 의존성 정의

## 🚀 시작하기

### 1. 백엔드 서버 설정

```bash
# 의존성 설치
npm install

# 서버 시작
npm start

# 개발 모드 (자동 재시작)
npm run dev
```

### 2. 프론트엔드 사용

`ecount-zone-api.html` 파일을 브라우저에서 열어 사용할 수 있습니다.

## 🔧 API 사용법

### Zone API 호출

**엔드포인트:** `POST /api/ecount/zone`

**요청 본문:**
```json
{
  "company_id": "회사ID",
  "user_id": "사용자ID", 
  "password": "비밀번호"
}
```

**응답 예시:**
```json
{
  "success": true,
  "data": {
    "zone_id": "zone_1234567890",
    "company_id": "회사ID",
    "user_id": "사용자ID",
    "session_token": "session_abc123",
    "expires_at": "2024-01-01T12:00:00.000Z",
    "api_version": "1.0",
    "permissions": ["read", "write", "delete"]
  }
}
```

## ⚠️ 중요 사항

1. **CORS 정책**: 이카운트 API는 브라우저에서 직접 호출이 제한됩니다.
2. **백엔드 필요**: 실제 API 호출은 백엔드 서버를 통해 수행해야 합니다.
3. **인증 정보**: 실제 회사 ID, 사용자 ID, 비밀번호를 사용해야 합니다.

## 🌐 이카운트 오픈 API 정보

- **공식 문서**: [https://sboapicd.ecount.com/ECERP/OAPI/OAPIView?lan_type=ko-KR#](https://sboapicd.ecount.com/ECERP/OAPI/OAPIView?lan_type=ko-KR#)
- **Zone API**: 기본 인증 및 연결을 위한 API
- **지원 메뉴**: 기초등록, 영업관리, 구매관리, 생산관리, 재고관리 등

## 📝 구현 예시

### Node.js 백엔드

```javascript
const axios = require('axios');

async function callEcountZoneAPI(companyId, userId, password) {
  try {
    const response = await axios.post('https://api.ecount.com/zone', {
      company_id: companyId,
      user_id: userId,
      password: password
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Zone API 호출 실패:', error);
    throw error;
  }
}
```

### Python 백엔드

```python
import requests

def call_ecount_zone_api(company_id, user_id, password):
    try:
        response = requests.post('https://api.ecount.com/zone', json={
            'company_id': company_id,
            'user_id': user_id,
            'password': password
        }, headers={
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f'Zone API 호출 실패: {e}')
        raise
```

## 🔍 문제 해결

### 일반적인 오류

1. **CORS 오류**: 백엔드 서버를 통해 API를 호출하세요.
2. **인증 실패**: 회사 ID, 사용자 ID, 비밀번호를 확인하세요.
3. **네트워크 오류**: 인터넷 연결과 이카운트 서버 상태를 확인하세요.

### 로그 확인

백엔드 서버 콘솔에서 상세한 로그를 확인할 수 있습니다.

## 📞 지원

- **이카운트 공식 지원**: [https://www.ecount.com/](https://www.ecount.com/)
- **API 문서**: [https://sboapicd.ecount.com/ECERP/OAPI/OAPIView?lan_type=ko-KR#](https://sboapicd.ecount.com/ECERP/OAPI/OAPIView?lan_type=ko-KR#)

## �� 라이선스

MIT License
