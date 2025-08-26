# CMES 이카운트(Open API) 연동 정리

문서 기준: https://sboapicd.ecount.com/ECERP/OAPI/OAPIView?lan_type=ko-KR#

## 1. 구성 개요
- 백엔드: `ecount-zone-api-backend.js`
  - Zone 조회 → Login(SESSION_ID 발급) → 임의 API 프록시(`/api/ecount/call`)
  - 테스트 환경 대응: sboapi/oapi, /OAPI/V2 vs /ECERP/OAPI/V2 경로 폴백
  - 비밀번호 키 다양성 대응: `PWD`/`PASSWORD`/`USER_PW` 자동 시도
  - 로그인 응답 포맷 다양성 대응: `{ERR_CODE, SESSION_ID}` 또는 `{Status:200, Data.Datas.SESSION_ID}` 모두 처리
- 프론트: `ecount-zone-api.html`
  - 로컬 테스트 페이지(절대 URL: `http://localhost:3000`)로 백엔드 호출
  - 기능: 로그인, 프리셋 호출(조회/저장), 자동 검증 시나리오(저장 20초/조회 2초 간격 반영)

## 2. 실행 방법
1) PowerShell
```powershell
cd "C:\Users\User\Desktop\ecount api"
npm install
node ecount-zone-api-backend.js
```
2) 서버 상태
```powershell
Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000/api/health" -Method GET | Select-Object -ExpandProperty Content
```
3) 프론트 테스트
- `ecount-zone-api.html` 브라우저로 열기
- 비밀번호 입력 후 버튼 실행(로그인/프리셋/자동 검증)

## 3. 백엔드 엔드포인트
- `POST /api/ecount/login`
  - body: `{ password?: string }`
  - resp: `{ zone, sessionId }`
- `POST /api/ecount/call`
  - body: `{ path: string, body?: object, password?: string }`
  - 예: `{ path: "/Inventory/GetListProduct", body: { PROD_CD: "PDEMO" } }`
- `POST /api/ecount/test/seed`
  - body: `{ password?: string }`
  - SaveProduct→GetListProduct→SaveCustomer→GetListCustomer (간격 준수)
- `GET /api/health`

## 4. 환경 변수(.env)
```env
COM_CODE=654604
USER_ID=황연걸
API_CERT_KEY=15ee97dcdecd742c1bdad909401791dec5
LAN_TYPE=ko-KR
# 선택: 테스트 시 강제 ZONE
# FORCE_ZONE=CD
# 선택: 비밀번호(프론트에서 직접 입력 가능)
# USER_PW=cmsec2007!
PORT=3000
```

## 5. 권장 호출 흐름(테스트 키 기준)
1) Zone 조회(중앙)
- `POST https://sboapi.ecount.com/OAPI/V2/Zone`
- body: `{ COM_CODE, API_CERT_KEY, LAN_TYPE }`
- resp: `{ Status:200, Data:{ ZONE, DOMAIN } }`
2) Login(테스트: sboapi{ZONE} / OAPILogin)
- `POST https://sboapi{ZONE}.ecount.com/OAPI/V2/OAPILogin`
- body: `{ COM_CODE, USER_ID, API_CERT_KEY, LAN_TYPE, ZONE, PWD|PASSWORD|USER_PW }`
- resp: `{ ERR_CODE:0, SESSION_ID }` 또는 `{ Status:200, Data.Datas.SESSION_ID }`
3) 조회/현황(2초 간격)
- `POST https://sboapi{ZONE}.ecount.com/OAPI/V2/<PATH>?SESSION_ID=...`
- 일부 환경: `/ECERP/OAPI/V2/<PATH>` 필요 시 폴백

## 6. PowerShell 스니펫(UTF-8, 안전 조합)
```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$COM_CODE="654604"; $USER_ID="황연걸"; $API_KEY="15ee97..."; $LAN="ko-KR"; $USER_PW="cmsec2007!"

function Invoke-JsonPost($url,$obj){ $j=$obj|ConvertTo-Json -Depth 10; $b=[Text.Encoding]::UTF8.GetBytes($j);
  Invoke-RestMethod -Method Post -Uri $url -Headers @{Accept='application/json'} -ContentType 'application/json; charset=utf-8' -Body $b }

# Zone
$zoneRes = Invoke-JsonPost 'https://sboapi.ecount.com/OAPI/V2/Zone' @{ COM_CODE=$COM_CODE; API_CERT_KEY=$API_KEY; LAN_TYPE=$LAN }
$ZONE = $zoneRes.Data.ZONE

# Login (sboapi{ZONE})
$LOGIN_URL = ("https://sboapi{0}.ecount.com/OAPI/V2/OAPILogin" -f $ZONE)
$bodies = @(
  @{ COM_CODE=$COM_CODE; USER_ID=$USER_ID; API_CERT_KEY=$API_KEY; LAN_TYPE=$LAN; ZONE=$ZONE; PWD=$USER_PW },
  @{ COM_CODE=$COM_CODE; USER_ID=$USER_ID; API_CERT_KEY=$API_KEY; LAN_TYPE=$LAN; ZONE=$ZONE; PASSWORD=$USER_PW },
  @{ COM_CODE=$COM_CODE; USER_ID=$USER_ID; API_CERT_KEY=$API_KEY; LAN_TYPE=$LAN; ZONE=$ZONE; USER_PW=$USER_PW }
)
$SID=$null; foreach($b in $bodies){ try{ $r=Invoke-JsonPost $LOGIN_URL $b; if($r.ERR_CODE -eq '0' -and $r.SESSION_ID){$SID=$r.SESSION_ID;break}; if([string]$r.Status -eq '200'){$SID=$r.Data.Datas.SESSION_ID; if($SID){break}} }catch{} }
if(-not $SID){ throw 'Login failed' }

# 조회 헬퍼(oapi 권장 시에는 BASE_HOST = https://oapi{ZONE}.ecount.com 사용)
$BASE_HOST = ("https://sboapi{0}.ecount.com" -f $ZONE)
function Post-OAPI($rel,$obj){ $j=$obj|ConvertTo-Json -Depth 8; $b=[Text.Encoding]::UTF8.GetBytes($j);
  try{ Invoke-RestMethod -Method Post -Uri "$BASE_HOST/OAPI/V2/$rel?SESSION_ID=$SID" -Headers @{Accept='application/json'} -ContentType 'application/json; charset=utf-8' -Body $b }
  catch{ Invoke-RestMethod -Method Post -Uri "$BASE_HOST/ECERP/OAPI/V2/$rel?SESSION_ID=$SID" -Headers @{Accept='application/json'} -ContentType 'application/json; charset=utf-8' -Body $b } }

Start-Sleep -Seconds 2
$r = Post-OAPI 'Inventory/GetListProduct' @{ PROD_CD=""; IS_PAGING="Y"; PAGE_NO=1; PER_PAGE=10; USE_YN="Y" }
$r.Status
```

## 7. 제약/유의 사항(테스트 키)
- 저장: 1회/20초, 조회: 1회/2초, 로그인: 1회/20분
- 테스트 키는 저장 API가 500을 반환할 수 있음(권한/제한). 조회 위주 검증 권장
- 경로 차이: `/OAPI/V2` vs `/ECERP/OAPI/V2`
- 호스트 차이: `sboapi{ZONE}`(테스트), 일부 조회는 `oapi{ZONE}` 문서 표기. 둘 다 시도 전략 적용 필요
- 한글 ID/데이터 전송은 `application/json; charset=utf-8` 권장

## 8. 트러블슈팅
- SESSION_ID 미발급: 비밀번호 키(`PWD`/`PASSWORD`/`USER_PW`) 조합 추가, `ZONE` 포함 여부 확인
- 500 응답: 필수 파라미터 누락(페이징, 기간, 사용여부 등) 여부 확인, 경로/호스트 폴백 시도
- PowerShell `$PWD` 충돌: 비밀번호 변수 `$USER_PW` 사용
- 프론트 `Failed to fetch`: 절대 URL(`http://localhost:3000`) 사용

## 9. 작업 내역(주요 변경점)
- 백엔드 작성: Zone→Login→세션 캐시, 임의 호출 프록시, 시드 엔드포인트 추가
- 로그인 대응: 호스트/경로/응답 포맷/비밀번호 키 조합 자동 시도 로직 구현
- 프론트 작성: 비밀번호 입력, 프리셋 호출, 자동 시나리오(간격 준수) 추가
- 문서/스크립트: PowerShell 표준 프롬프트(UTF-8) 제공, 조회 전용 예제 정리

## 10. 차후 액션(실제 키 발급 대비)
- 테스트에서 200 확인이 필요한 “조회/현황” API 목록을 실제 계정 데이터에 맞춰 필수 파라미터 보강
- 실제 키 발급 후 저장 API 재시험(20초 간격/권한 확인)
- 필요한 API별 요청/응답 스키마를 레퍼런스화하여 CMES 내 서비스 로직에 매핑
