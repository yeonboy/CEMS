# 에이전트 역할 분리 및 협업 규칙 (MCC 운영 기준)

본 문서는 여러 에이전트(백엔드 / UI / UX / 통계 / 이상치 / DB / 총괄(MCC))가 동일 저장소에서 충돌 없이 독립적으로 작업하기 위한 최소 규칙을 정의합니다. 규칙 위반으로 인한 충돌 발생 시 MCC가 최종 조정합니다.

## 공통 원칙

- 변경 범위 최소화: 소유 파일만 수정하고, 새 기능은 가급적 새 파일로 추가합니다.
- 데이터 계약 준수: 프론트는 `db/*.json`을 우선 사용, 없으면 원천 파일 파싱으로 폴백합니다(프로젝트 규칙). 기존 스키마를 파괴적으로 변경하지 않습니다.
- 파일 네이밍: 본인이 생성하는 산출물·스크립트는 역할 접두사를 붙입니다. 예) `stats_*.json`, `anomaly_*.json`, `stats_*.mjs`.
- 호환성: 기존 JSON에 필드 추가는 가능하지만 제거/의미변경은 금지. 필요 시 새로운 파일로 확장합니다.
- 빌드 규칙 준수: 데이터 빌드는 `npm run build:db`를 표준으로 사용합니다. 입력/출력 경로와 인코딩 정책은 03-build-db 규칙을 따릅니다.

## 디렉터리/파일 소유권

- DB 역할(Owner)
  - `scripts/build-db.mjs`, `db/*.json`(아래 예약 파일 목록), 원천 데이터 경로 참조 로직
  - 예약 파일(덮어쓰기 금지, 확장 시 새 파일 추가 권장):
    - `db/equipment_db.json`, `db/movements_db.json`, `db/repairs_db.json`
    - `db/order_history.json`, `db/order_items.json`, `db/suppliers.json`, `db/product_catalog.json`
    - `db/QC_logs.json`, `db/quotes.json`, `db/purchase_requests.json`

- UI 역할(Owner)
  - `index.html`, `dashboard.html`
  - 데이터 접근은 `db/*.json` fetch 기준. 스키마 변경 요구 시 MCC를 통해 DB 역할과 협의

- UX 역할(Owner)
  - 시각/인터랙션 개선에 한해 `index.html`, `dashboard.html`의 마크업/스타일 변경 가능
  - 데이터 키/흐름 변경 금지. 필요 시 UI/DB와 이슈 협의

- 통계(Statistics) 역할(Owner)
  - 산출 스크립트: `scripts/stats_*.{mjs,py}`
  - 산출물: `db/stats_*.json` (기존 파일 미변경 원칙)

- 이상치(Anomaly) 역할(Owner)
  - 탐지 스크립트: `scripts/anomaly_*.{mjs,py}`
  - 산출물: `db/anomaly_*.json`

- 백엔드 역할(Owner)
  - `ecount api/*` 내 파일 및 별도 백엔드 보조 스크립트(새 파일 권장)
  - 프론트 계약: 백엔드 산출물은 `db/*.json` 신규 파일로 제공(기존 스키마 불변)

- 총괄(MCC) 역할(Owner)
  - 본 문서(`AGENT-ROLES.md`), `README.md` 등 문서/규칙 관리
  - 역할 간 충돌 조정, 공통 빌드/배포 기준 관리

## 데이터/스키마 변경 정책

- 파괴적 변경 금지: 필드 제거, 의미 변경, 타입 변경 지양
- 확장 방식: 새 필드 추가 또는 새 파일 생성(`*_v2.json`, 혹은 역할 접두사 파일)
- 버전 표기 권장: 산출 JSON에 `_schemaVersion`(예: `1`) 필드를 추가해 소비 측이 대응 가능하게 함

## 작업 선언 및 리뷰 규칙

- 변경 범주 태그: 커밋/PR 제목 접두사 `[DB]`, `[UI]`, `[UX]`, `[STATS]`, `[ANOMALY]`, `[BE]`, `[MCC]`
- 작업 단위: 역할 소유 파일만 포함. 여러 역할 파일을 동시에 수정해야 하면 MCC에 사전 공유
- 리뷰: 소유권 외 파일 변경 시 해당 역할의 리뷰 승인 필요. 급한 경우에도 MCC 승인 필수

## 빌드/배포 체크리스트

1) `npm run build:db` 성공 여부 확인
2) `db/*.json` 산출물 존재 및 파손 여부 확인(JSON 파싱 OK)
3) `index.html`을 브라우저로 열어 주요 뷰 정상 로드 확인
4) 산출물 백업 경로에 동기화 확인(03-build-db 규칙)

## 비상 복구

- DB 역할은 빌드 산출물을 `C:/Users/User/Desktop/cmes 데모/개발현황자료전달`에 백업합니다.
- 문제 발생 시 직전 백업본으로 `db/*.json`을 원복하고, 원인 분석 후 재빌드합니다.

---

문의/조정이 필요한 경우 MCC에게 이슈를 등록하거나, 본 문서에 제안 변경 사항을 PR로 제출해 주세요.


