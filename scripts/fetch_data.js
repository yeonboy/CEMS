let equipmentData = [];
let movementsData = [];
let repairsData = [];
let logsData = [];
let qcLogsData = []; // New global variable for QC logs data
let staffLogsData = []; // 이동 담당자 로그 (CSV)

document.addEventListener('DOMContentLoaded', () => {
    // 사전 구축된 DB 우선 사용 → 폴백으로 equipment_data.json 지원
    Promise.all([
        fetch('./db/equipment_db.json', { cache: 'no-store' })
            .then(r => r.ok ? r.json() : Promise.reject())
            .catch(() => fetch('./db/equipment_data.json', { cache: 'no-store' })
                .then(r => r.ok ? r.json() : [])
                .then(raw => {
                    // Gemini가 만든 형식(한글 컬럼) → 공통 형식으로 매핑
                    if (Array.isArray(raw)) {
                        return raw.map(row => ({
                            serial: row.시리얼번호 || row.serial || '',
                            category: row.품목계열 || row.category || '-',
                            currentLocation: row.입고처 || row.currentLocation || '-',
                            status: row.상태 || row.status || '',
                            lastMovement: row.날짜 || row.lastMovement || ''
                        }));
                    } else {
                        return [];
                    }
                })
            ),
        fetch('./db/movements_db.json', { cache: 'no-store' })
            .then(r => r.ok ? r.json() : [])
            .catch(() => []),
        fetch('./db/repairs_db_clean.json', { cache: 'no-store' })
            .then(r => r.ok ? r.json() : [])
            .catch(() => []),
        fetch('./청명장비 엑셀/logs_fixed.csv', { cache: 'no-store' })
            .then(r => r.ok ? r.text() : '')
            .then(text => parseCSV(text))
            .catch(() => []),
        fetch('./db/QC_logs.json', { cache: 'no-store' })
            .then(r => r.ok ? r.json() : [])
            .catch(() => []),
        // 추가: 담당자명 포함 CSV (옵션, EUC-KR 우선 디코딩)
        fetch('./청명장비 엑셀/logs_담당자명 추가.csv', { cache: 'no-store' })
            .then(r => r.ok ? r.arrayBuffer() : Promise.reject())
            .then(buf => {
                try { return new TextDecoder('euc-kr').decode(buf); } catch (e) {}
                try { return new TextDecoder('utf-8').decode(buf); } catch (e) {}
                return '';
            })
            .then(text => parseCSVAuto(text))
            .catch(() => [])
    ])
    .then(([equipment, movements, repairs, logs, qcLogs, staffLogs]) => {
        equipmentData = equipment;
        movementsData = movements;
        repairsData = repairs;
        logsData = logs;
        qcLogsData = qcLogs;
        staffLogsData = Array.isArray(staffLogs) ? staffLogs : [];
        
        console.log('✅ 데이터 로드 완료:', {
            equipment: equipmentData.length,
            movements: movementsData.length,
            repairs: repairsData.length,
            logs: logsData.length,
            qcLogs: qcLogsData.length,
            staffLogs: staffLogsData.length
        });
        
        // 디버깅: 데이터 내용 확인
        console.log('🔍 장비 데이터 샘플:', equipmentData.slice(0, 3));
        console.log('🔍 QC 로그 데이터 샘플:', qcLogsData.slice(0, 3));
        console.log('🔍 담당자 로그 샘플:', staffLogsData.slice(0, 3));
        
        // 현재위치 자동 보정 적용
        if (movementsData && movementsData.length > 0) {
            equipmentData = enrichEquipmentData(equipmentData, movementsData);
            console.log('✅ 장비 데이터 현재위치 자동 보정 완료');
        }
        
        // 초기화 함수들 호출
        initDashboardCharts();
        renderEquipmentTable();
        renderCategoryStats();
        updateKpis();
        renderCalibrationAlerts(); // 정도검사 알림 렌더링 추가
        renderVendorLongStayAlerts(); // 장기간 업체 입고 알림 렌더링 추가
        
        if (document.getElementById('equipment-view')) {
            // switchView 대신 직접 탭 전환 (한 번만 실행)
            console.log('🔍 페이지 로드 시 장비 현황 탭 설정');
            // 약간의 지연을 두어 DOM이 완전히 준비된 후 실행
            setTimeout(() => {
                switchEquipmentTab('status');
            }, 100);
        }
        
        // 전역 함수 할당
        console.log('🔍 전역 함수 할당 시작');
        window.switchEquipmentTab = switchEquipmentTab;
        window.switchView = switchView;
        window.loadDashboardData = loadDashboardData;
        window.loadDefaultDashboardData = loadDefaultDashboardData;
        window.showDashboardError = showDashboardError;
        
        // 테스트 함수 추가
        window.testEquipmentTab = function() {
            console.log('🧪 testEquipmentTab 함수 호출됨');
            alert('장비 탭 테스트 함수가 호출되었습니다!');
        };
        
        console.log('✅ 전역 함수 할당 완료');
        // 주기별 수리 차트 초기 렌더 트리거
        setTimeout(() => {
            try {
                const periodSel = document.getElementById('repair-period-select');
                const dimSel = document.getElementById('repair-dimension-select');
                if (dimSel) dimSel.dispatchEvent(new Event('change'));
                if (periodSel) periodSel.dispatchEvent(new Event('change'));
            } catch (e) { console.warn('초기 수리 차트 렌더 트리거 실패:', e); }
        }, 0);
    })
    .catch(error => {
        console.error('❌ 데이터 로드 실패:', error);
        // 에러 발생 시에도 기존 데이터는 유지
        // equipmentData = [];
        // movementsData = [];
        // repairsData = [];
        // logsData = [];
        // qcLogsData = [];
        
        // 에러가 발생해도 기존 데이터로 렌더링 시도
        if (equipmentData.length > 0) {
            initDashboardCharts();
            renderEquipmentTable();
            renderCategoryStats();
            updateKpis();
            renderCalibrationAlerts();
        }
    });
});

// CSV 파싱 함수
function parseCSV(csvText) {
    const lines = csvText.split('\n');
    const data = [];
    
    // 헤더는 2번째 줄 (인덱스 1)
    if (lines.length < 2) return data;
    
    const headers = lines[1].split(',').map(h => h.replace(/\t/g, '').trim());
    
    for (let i = 2; i < lines.length; i++) {
        if (lines[i].trim()) {
            const values = lines[i].split(',').map(v => v.replace(/\t/g, '').trim());
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            data.push(row);
        }
    }
    
    return data;
}

function parseCSVAuto(csvText) {
    const t = (csvText || '').replace(/\r\n?/g,'\n');
    const rawLines = t.split('\n');
    // 제목 라인 제거 (회사명/기간 등)
    let idx = 0;
    if (rawLines[0] && /회사명|현황|기간|~|\d{4}[./-]\d{2}[./-]\d{2}/.test(rawLines[0])) idx = 1;
    // 공백 라인 스킵
    while (idx < rawLines.length && !rawLines[idx].trim()) idx++;
    if (idx >= rawLines.length) return [];
    const headerLine = rawLines[idx];
    // 구분자 감지: '","' 패턴이면 콤마 고정, 아니면 탭/콤마 카운트로 결정
    let delim = ',';
    if (!/","/.test(headerLine)) {
        const tabCount = (headerLine.match(/\t/g) || []).length;
        const commaCount = (headerLine.match(/,/g) || []).length;
        delim = tabCount > commaCount ? '\t' : ',';
    }
    const headers = splitCsvQuoted(headerLine, delim).map(cleanCsvCell);
    const out = [];
    for (let i = idx + 1; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (!line || !line.trim()) continue;
        const cols = splitCsvQuoted(line, delim).map(cleanCsvCell);
        const row = {};
        headers.forEach((h, k) => { if (h) row[h] = cols[k] || ''; });
        // 값이 모두 빈 경우 스킵
        if (Object.values(row).some(v => String(v).trim() !== '')) out.push(row);
    }
    return out;
}

function splitCsvQuoted(line, delim) {
    const d = delim === '\t' ? '\t' : ',';
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQ && line[i+1] === '"') { cur += '"'; i++; }
            else { inQ = !inQ; }
        } else if (!inQ && ((d === ',' && ch === ',') || (d === '\t' && ch === '\t'))) {
            out.push(cur); cur = '';
        } else {
            cur += ch;
        }
    }
    out.push(cur);
    return out;
}

function cleanCsvCell(s) {
    let v = (s || '').replace(/\u0000/g,'').trim();
    // 양끝 큰따옴표 제거
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    // 잔여 탭/공백 제거
    v = v.replace(/\t+/g,'').trim();
    return v;
}

function initDashboardCharts() {
    // 장비 상태별 분포 차트
    const statusCtx = document.getElementById('equipmentStatusChart');
    if (statusCtx) {
        if (window.equipmentStatusChart) window.equipmentStatusChart.destroy();
        
        const statusData = getEquipmentStatusDistribution();
        window.equipmentStatusChart = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: statusData.labels,
                datasets: [{
                    data: statusData.values,
                    backgroundColor: [
                        'rgba(34, 197, 94, 0.8)',   // 가동 중 - 초록
                        'rgba(239, 68, 68, 0.8)',   // 수리 중 - 빨강
                        'rgba(59, 130, 246, 0.8)',  // 대기 중 - 파랑
                        'rgba(156, 163, 175, 0.8)'  // 기타 - 회색
                    ],
                    borderColor: [
                        'rgba(34, 197, 94, 1)',
                        'rgba(239, 68, 68, 1)',
                        'rgba(59, 130, 246, 1)',
                        'rgba(156, 163, 175, 1)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: { size: 12 },
                            usePointStyle: true
                        }
                    }
                }
            }
        });
    }

    // 장비 카테고리별 분포 차트
    const categoryCtx = document.getElementById('equipmentCategoryChart');
    if (categoryCtx) {
        if (window.equipmentCategoryChart) window.equipmentCategoryChart.destroy();
        
        const categoryData = getEquipmentCategoryDistribution();
        window.equipmentCategoryChart = new Chart(categoryCtx, {
            type: 'bar',
            data: {
                labels: categoryData.labels,
                datasets: [{
                    label: '장비 수',
                    data: categoryData.values,
                    backgroundColor: 'rgba(79, 70, 229, 0.8)',
                    borderColor: 'rgba(79, 70, 229, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    y: { 
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    } 
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    // 수리 빈도 차트 (기존)
    const repairCtx = document.getElementById('repairFrequencyChart');
    if (repairCtx) {
        if (window.repairFrequencyChart) window.repairFrequencyChart.destroy();
        
        const repairData = getRepairFrequencyData();
        window.repairFrequencyChart = new Chart(repairCtx, {
            type: 'bar',
            data: {
                labels: repairData.labels,
                datasets: [{
                    label: '수리 건수',
                    data: repairData.values,
                    backgroundColor: 'rgba(79, 70, 229, 0.8)',
                    borderColor: 'rgba(79, 70, 229, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    // 비용 트렌드 차트 (기존)
    const costCtx = document.getElementById('costTrendChart');
    if (costCtx) {
        if (window.costTrendChart) window.costTrendChart.destroy();
        
        const costData = getCostTrendData();
        window.costTrendChart = new Chart(costCtx, {
            type: 'line',
            data: {
                labels: costData.labels,
                datasets: [{
                    label: '수리 비용 (만원)',
                    data: costData.values,
                    fill: false,
                    borderColor: 'rgb(13, 148, 136)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } }
            }
        });
    }
}

function normalizeStatus(s) {
    const t = String(s || '').trim();
    if (/업체/.test(t)) return '수리 중';
    if (/현장/.test(t)) return '가동 중';
    if (/청명|본사/.test(t)) return '대기 중';
    if (t === '수리중' || t === '수리 중') return '수리 중';
    if (t === '가동중' || t === '가동 중' || /RUN|Running/i.test(t)) return '가동 중';
    return '대기 중';
}

// KPI 요소 업데이트
function updateKpiElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}



// 상태 정규화 함수
function normalizeStatus(status) {
    if (!status) return '대기 중';
    
    const statusStr = String(status).toLowerCase().trim();
    
    // 가동 중 관련
    if (statusStr.includes('가동') || statusStr.includes('run') || statusStr.includes('running') || statusStr.includes('운행')) {
        return '가동 중';
    }
    
    // 수리 중 관련
    if (statusStr.includes('수리') || statusStr.includes('repair') || statusStr.includes('고장') || statusStr.includes('점검')) {
        return '수리 중';
    }
    
    // 대기 중 관련
    if (statusStr.includes('대기') || statusStr.includes('idle') || statusStr.includes('대기중') || statusStr.includes('보관')) {
        return '대기 중';
    }
    
    return '대기 중'; // 기본값
}

// 상태별 배지 클래스 반환
function getStatusBadgeClass(status) {
    const normalizedStatus = normalizeStatus(status);
    switch (normalizedStatus) {
        case '가동 중':
            return 'bg-green-100 text-green-800';
        case '수리 중':
            return 'bg-red-100 text-red-800';
        case '대기 중':
            return 'bg-blue-100 text-blue-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
}

// 배열 병합 유틸: id 기준으로 중복 제거, 최신(updatedAt/createdAt) 우선
function mergeById(primary, secondary) {
    const a = Array.isArray(primary) ? primary : [];
    const b = Array.isArray(secondary) ? secondary : [];
    const map = new Map();
    const stamp = (x) => new Date(x?.updatedAt || x?.createdAt || 0).getTime();
    const put = (item) => {
        const id = item && item.id ? String(item.id) : undefined;
        if (!id) return; // id 없는 항목은 병합 제외
        const prev = map.get(id);
        if (!prev || stamp(item) >= stamp(prev)) map.set(id, item);
    };
    a.forEach(put); b.forEach(put);
    return Array.from(map.values());
}

function switchView(viewId) {
    // 모든 섹션 숨김 (한 화면에 하나의 섹션만)
    document.querySelectorAll('.view-section').forEach(section => section.classList.add('hidden'));

    // 장비 뷰 이탈 시 수리/교육 탭 잔상 제거 (inline style/active 클래스 초기화)
    if (!viewId.startsWith('equipment')) {
        document.querySelectorAll('.equipment-tab-content').forEach(el => { el.style.display = 'none'; });
        document.querySelectorAll('.equipment-tab').forEach(btn => btn.classList.remove('active'));
    }

    if (viewId.startsWith('equipment-')) {
        const tabName = viewId.replace('equipment-', '');
        const equipmentSection = document.getElementById('equipment-view');
        if (equipmentSection) equipmentSection.classList.remove('hidden');
        switchEquipmentTab(tabName);
    } else {
        const section = document.getElementById(viewId + '-view');
        if (section) section.classList.remove('hidden');
    }

    // 네비게이션 활성 표시 업데이트
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active-nav'));
    const navItem = document.querySelector(`[onclick="switchView('${viewId}')"]`);
    if (navItem) navItem.classList.add('active-nav');
    
    if (viewId === 'dashboard') {
        initDashboardCharts();
    } else if (viewId === 'accounting-purchase-request') {
        renderPurchaseRequestTable();
    }

    // 전환 후 스크롤을 항상 상단으로 이동
    try {
        const mainEl = document.getElementById('main');
        if (mainEl) mainEl.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch {}
}

// 장비 탭 전환
function switchEquipmentTab(tabName) {
    console.log('🔍 switchEquipmentTab 호출됨:', tabName);
    
    // 모든 탭 컨텐츠 숨기기 (하단 잔존 방지)
    document.querySelectorAll('.equipment-tab-content').forEach(content => {
        content.style.display = 'none';
    });
    
    // 모든 탭 버튼 비활성화
    document.querySelectorAll('.equipment-tab').forEach(button => {
        button.classList.remove('active');
    });

    // 선택된 탭 컨텐츠 보이기
    const contentToShow = document.getElementById(`equipment-${tabName}`);
    if (contentToShow) {
        contentToShow.style.display = 'block';
        console.log('✅ 탭 컨텐츠 표시:', `equipment-${tabName}`);
    } else {
        console.error('❌ 탭 컨텐츠를 찾을 수 없음:', `equipment-${tabName}`);
    }
    
    // 선택된 탭 버튼 활성화 (더 안전한 방식)
    const allTabButtons = document.querySelectorAll('.equipment-tab');
    let buttonToActivate = null;
    
    // onclick 속성으로 찾기
    for (let button of allTabButtons) {
        if (button.getAttribute('onclick') && button.getAttribute('onclick').includes(`switchEquipmentTab('${tabName}')`)) {
            buttonToActivate = button;
            break;
        }
    }
    
    if (buttonToActivate) {
        buttonToActivate.classList.add('active');
        console.log('✅ 탭 버튼 활성화됨:', tabName);
    } else {
        console.warn('⚠️ 탭 버튼을 찾을 수 없음, 수동으로 활성화:', tabName);
        // 수동으로 해당 탭 버튼 활성화
        allTabButtons.forEach((button, index) => {
            if (index === 0 && tabName === 'status') {
                button.classList.add('active');
                console.log('✅ 첫 번째 탭 버튼 활성화됨 (현황)');
            } else if (index === 1 && tabName === 'repair') {
                button.classList.add('active');
                console.log('✅ 두 번째 탭 버튼 활성화됨 (수리)');
            } else if (index === 2 && tabName === 'education') {
                button.classList.add('active');
                console.log('✅ 세 번째 탭 버튼 활성화됨 (교육)');
            } else {
                button.classList.remove('active');
            }
        });
    }
    
    // 탭별 초기화 함수 호출 (중복 호출 방지)
    if (tabName === 'status') {
        console.log('🔍 현황 탭 렌더링 시작');
        // 이미 렌더링된 경우 중복 호출 방지
        if (!document.querySelector('#equipment-table-body tbody tr')) {
            renderEquipmentTable();
        }
        if (!document.querySelector('#category-stats-container .grid')) {
            renderCategoryStats();
        }
    } else if (tabName === 'repair') {
        console.log('🔍 수리 탭 렌더링 시작');
        renderRepairTable();
    } else if (tabName === 'education') {
        console.log('🔍 교육 탭 렌더링 시작');
        renderEducationTable();
    }
}

// 전역 함수 할당은 DOMContentLoaded 이벤트에서 처리

// 뷰 전환 함수 (전역으로 할당)
function switchView(viewName, event) {
    console.log('🔍 switchView 호출됨:', viewName);
    
    // 모든 모달 강제로 숨기기
    forceHidePurchaseRequestModal();
    
    // 장비 뷰가 아닐 경우 장비 탭 잔상 제거
    if (viewName !== 'equipment') {
        document.querySelectorAll('.equipment-tab-content').forEach(el => { el.style.display = 'none'; });
        document.querySelectorAll('.equipment-tab').forEach(btn => btn.classList.remove('active'));
    }

    // 기존 뷰 숨기기
    document.querySelectorAll('.view-section').forEach(section => {
        section.classList.add('hidden');
    });
    
    // 선택된 뷰 표시
    const selectedView = document.getElementById(viewName + '-view');
    if (selectedView) {
        selectedView.classList.remove('hidden');
        console.log('✅ 뷰 표시됨:', viewName + '-view');
        
        // 장비 뷰인 경우 기본 탭 설정
        if (viewName === 'equipment') {
            console.log('🔍 장비 뷰 활성화, 현황 탭 설정');
            // 약간의 지연을 두어 DOM이 준비된 후 실행
            setTimeout(() => {
                switchEquipmentTab('status');
            }, 100);
        }
    } else {
        console.error('❌ 뷰를 찾을 수 없음:', viewName + '-view');
    }
    
    // 네비게이션 활성화 상태 업데이트
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active-nav');
    });
    
    // 클릭된 아이템 활성화 (event가 있을 때만)
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active-nav');
        console.log('✅ 네비게이션 아이템 활성화됨');
    }
    
    // 대시보드로 돌아올 때 데이터 새로고침
    if (viewName === 'dashboard') {
        console.log('🔍 대시보드 데이터 새로고침');
        if (typeof loadDashboardData === 'function') {
            loadDashboardData();
        }
    }
    
    // 견적서 뷰 초기화
    if (viewName === 'accounting-quote') {
        console.log('🔍 견적서 뷰 초기화');
        if (typeof initQuote === 'function') {
            initQuote();
        }
    }
    
    // 구매요구서 뷰 초기화
    if (viewName === 'accounting-purchase-request') {
        console.log('🔍 구매요구서 뷰 초기화');
        if (typeof initPurchaseRequest === 'function') {
            initPurchaseRequest();
        }
    }
    
    // 거래명세서 뷰 초기화
    if (viewName === 'accounting-transaction') {
        console.log('🔍 거래명세서 뷰 초기화');
        if (typeof renderTransactionTable === 'function') {
            renderTransactionTable();
        }
    }
    
    // 물품 주문 내역서 뷰 초기화
    if (viewName === 'order-history') {
        console.log('🔍 물품 주문 내역서 뷰 초기화');
        if (typeof initOrderHistory === 'function') {
            initOrderHistory();
        }
    }

    // 전환 후 스크롤을 항상 상단으로 이동
    try {
        const mainEl = document.getElementById('main');
        if (mainEl) mainEl.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch {}
}

// 전역 함수로 할당
window.switchView = switchView;

// 대시보드 데이터 로드 함수
function loadDashboardData() {
    console.log('🔍 loadDashboardData 호출됨');
    
    // 대시보드 데이터 로드 시도
    fetch('./db/dashboard_data.json', { cache: 'no-store' })
        .then(response => {
            if (response.ok) {
                return response.json();
            }
            throw new Error('대시보드 데이터를 로드할 수 없습니다');
        })
        .then(data => {
            console.log('✅ 대시보드 데이터 로드 성공');
            updateDashboard(data);
        })
        .catch(error => {
            console.error('❌ 대시보드 데이터 로드 오류:', error);
            // 기본 데이터로 대시보드 업데이트
            loadDefaultDashboardData();
        });
}

// 기본 대시보드 데이터 로드
function loadDefaultDashboardData() {
    console.log('🔍 기본 대시보드 데이터 로드');
    
    try {
        // 기존 데이터로 대시보드 업데이트
        updateDashboard();
    } catch (error) {
        console.error('❌ 기본 데이터 로드 오류:', error);
        showDashboardError();
    }
}

// 대시보드 오류 표시
function showDashboardError() {
    const dashboardView = document.getElementById('dashboard-view');
    if (dashboardView) {
        dashboardView.innerHTML = `
            <div class="text-center py-20">
                <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 class="mt-2 text-sm font-medium text-gray-900">데이터를 로드할 수 없습니다</h3>
                <p class="mt-1 text-sm text-gray-500">DB 파일을 확인하거나 데이터를 다시 생성해주세요.</p>
                <div class="mt-6">
                    <button onclick="loadDashboardData()" class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">
                        다시 시도
                    </button>
                </div>
            </div>
        `;
    }
}

// 전역 함수로 할당
window.loadDashboardData = loadDashboardData;
window.loadDefaultDashboardData = loadDefaultDashboardData;
window.showDashboardError = showDashboardError;

// 서브메뉴 토글
function toggleSubmenu(menuId) {
    const submenu = document.getElementById(menuId);
    const toggleIcon = submenu.previousElementSibling.querySelector('.submenu-toggle');
    if (submenu) {
        submenu.classList.toggle('hidden');
        toggleIcon.classList.toggle('rotated');
    }
}

// 수리 테이블 렌더링
function renderRepairTable() {
    const tableBody = document.getElementById('repair-table');
    // 만약 새 테이블 구조(#repair-log-tbody)를 사용 중이면 그쪽 렌더로 위임
    const unifiedTbody = document.getElementById('repair-log-tbody');
    if (unifiedTbody) { try { renderRepairLogTable(); return; } catch {} }
    if (!tableBody) return;
    
    if (repairsData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center p-4 text-slate-500">수리 데이터가 없습니다.</td></tr>';
        return;
    }
    
    // 수리 통계 계산
    const totalRepairs = repairsData.length;
    const totalCost = repairsData.reduce((sum, repair) => sum + (repair.cost || 0), 0);
    const companies = [...new Set(repairsData.map(repair => repair.repair_company))];
    const uniqueEquipment = [...new Set(repairsData.map(repair => repair.serial))];
    
    // 통계 정보를 테이블 위에 표시
    const statsContainer = document.getElementById('repair-stats');
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div class="bg-white p-4 rounded-lg shadow">
                    <div class="text-2xl font-bold text-blue-600">${totalRepairs}</div>
                    <div class="text-sm text-gray-600">총 수리 건수</div>
                </div>
                <div class="bg-white p-4 rounded-lg shadow">
                    <div class="text-2xl font-bold text-green-600">${totalCost.toLocaleString()}</div>
                    <div class="text-sm text-gray-600">총 수리 비용 (원)</div>
                </div>
                <div class="bg-white p-4 rounded-lg shadow">
                    <div class="text-2xl font-bold text-purple-600">${companies.length}</div>
                    <div class="text-sm text-gray-600">수리업체 수</div>
                </div>
                <div class="bg-white p-4 rounded-lg shadow">
                    <div class="text-2xl font-bold text-orange-600">${uniqueEquipment.length}</div>
                    <div class="text-sm text-gray-600">수리 대상 장비</div>
                </div>
            </div>
        `;
    }
    
    // 테이블 헤더 수정 (컬럼 수에 맞춰)
    const tableHeader = tableBody.closest('table')?.querySelector('thead tr');
    if (tableHeader) {
        tableHeader.innerHTML = `
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">수리일자</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">일련번호</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">품목계열</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">수리업체</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">담당자</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">수리구분</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">비용</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">측정항목</th>
        `;
    }
    
    // 테이블 데이터 렌더링 (정리된 수리 DB 구조 사용) - 15행 기준 높이에서 스크롤
    const rowsHtml = repairsData.map(repair => `
        <tr class="border-b hover:bg-slate-50">
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${repair.repair_date || 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">${repair.serial || 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${repair.product_series || 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${repair.repair_company || 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${repair.manager || 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${repair.repair_type || 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">${(repair.cost || 0).toLocaleString()}원</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${repair.measurement_item || 'N/A'}</td>
        </tr>
    `).join('');
    tableBody.innerHTML = rowsHtml;
    
    console.log('✅ 수리 테이블 렌더링 완료:', repairsData.length, '건');

    // 스크롤 컨테이너 높이 고정(약 10행 노출) + 드래그 스크롤 활성화
    const scroll = document.getElementById('repair-log-scroll');
    if (scroll) {
        try {
            scroll.style.maxHeight = '420px';
            scroll.style.overflowY = 'auto';
            enableDragScroll(scroll);
        } catch {}
    }
}

// 요소에 마우스 드래그로 수직 스크롤 기능 부여
function enableDragScroll(container) {
    let isDown = false;
    let startY = 0;
    let startScroll = 0;
    container.addEventListener('mousedown', (e) => {
        isDown = true;
        startY = e.clientY;
        startScroll = container.scrollTop;
        container.classList.add('select-none');
    });
    window.addEventListener('mouseup', () => {
        isDown = false;
        container.classList.remove('select-none');
    });
    container.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        const dy = e.clientY - startY;
        container.scrollTop = startScroll - dy;
    });
}

// 교육 테이블 렌더링
function renderEducationTable() {
    const tableBody = document.getElementById('education-table');
    if (!tableBody) return;
    
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-slate-500">교육 데이터가 없습니다.</td></tr>';
}

// 수리 폼 표시
function showRepairForm() {
    alert('수리 등록 폼을 표시합니다.');
}

// 교육 폼 표시
function showEducationForm() {
    alert('교육 등록 폼을 표시합니다.');
}

// 수리 데이터 내보내기
function exportRepairData() {
    alert('수리 데이터를 내보냅니다.');
}

// 교육 데이터 내보내기
function exportEducationData() {
    alert('교육 데이터를 내보냅니다.');
}

// 구매요구서 폼 표시
function showPurchaseRequestModal() {
    // 현재 활성화된 뷰가 회계-물품구매요구서인지 한 번 더 확인
    const currentView = document.querySelector('.view-section:not(.hidden)');
    if (!currentView || currentView.id !== 'accounting-purchase-request-view') {
        console.log('물품구매요구서 모달은 회계 탭에서만 표시됩니다.');
        return;
    }
    
    const modal = document.getElementById('purchase-request-modal');
    if (modal) {
        // CSS 클래스 기반으로 모달 표시
        modal.classList.add('show');
        modal.classList.remove('hidden');
        
        // 오늘 날짜를 기본값으로 설정
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('preparation-date');
        if (dateInput) {
            dateInput.value = today;
        }
        
        // 자동완성용 DB 로드 및 datalist 채우기
        if (typeof loadOrderDBForAutocomplete === 'function') {
            loadOrderDBForAutocomplete();
        }
        // 폼 이벤트 리스너 추가
        setupPurchaseRequestForm();
    }
}

// 구매요구서 모달 닫기
function closePurchaseRequestModal() {
    const modal = document.getElementById('purchase-request-modal');
    if (modal) {
        // CSS 클래스 기반으로 모달 숨김
        modal.classList.remove('show');
        modal.classList.add('hidden');
        
        // 모달 상태 원래대로 복원
        resetModalToDefault();
    }
}

// 모달을 기본 상태로 복원
function resetModalToDefault() {
    // 폼 데이터 초기화
    const form = document.getElementById('purchase-request-form');
    if (form) {
        form.reset();
    }
    
    // 모달 제목 원래대로 복원
    const modalTitle = document.querySelector('#purchase-request-modal h2');
    if (modalTitle) {
        modalTitle.textContent = '물품구매요구서';
    }
    
    // 저장 버튼 원래대로 복원
    const saveButton = document.querySelector('#purchase-request-modal button[type="submit"]');
    if (saveButton) {
        saveButton.textContent = '저장';
        saveButton.onclick = function(e) {
            e.preventDefault();
            savePurchaseRequest();
        };
    }
    
    // 품목 테이블 초기화 (첫 번째 행만 남기고 나머지 제거)
    const itemsTableBody = document.getElementById('items-table-body');
    if (itemsTableBody) {
        const firstRow = itemsTableBody.querySelector('.item-row');
        if (firstRow) {
            itemsTableBody.innerHTML = '';
            itemsTableBody.appendChild(firstRow);
            
            // 첫 번째 행의 입력 필드 초기화
            const inputs = firstRow.querySelectorAll('input');
            inputs.forEach(input => {
                input.value = '';
            });
        }
    }
    
    // 진행상황 초기화
    updateApprovalProgress('담당자');
    
    // 합계 초기화
    document.getElementById('subtotal').value = '0원';
    document.getElementById('vat').value = '0원';
    document.getElementById('total-amount').value = '0원';
    document.getElementById('subtotal').setAttribute('data-value', '0');
    document.getElementById('vat').setAttribute('data-value', '0');
    document.getElementById('total-amount').setAttribute('data-value', '0');
}

// 구매요구서 폼 설정
function setupPurchaseRequestForm() {
    const form = document.getElementById('purchase-request-form');
    const itemsTableBody = document.getElementById('items-table-body');
    
    // 폼 제출 이벤트
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        savePurchaseRequest();
    });
    
    // 품목 테이블의 입력 필드에 이벤트 리스너 추가
    setupItemTableListeners();
    
    // 합계 계산 초기화
    calculateTotals();
    
    // 진행상황 초기화
    updateApprovalProgress('담당자');
}

// 품목 테이블 이벤트 리스너 설정
function setupItemTableListeners() {
    const itemsTableBody = document.getElementById('items-table-body');
    
    // 기존 행에 이벤트 리스너 추가
    const existingRows = itemsTableBody.querySelectorAll('.item-row');
    existingRows.forEach(row => {
        setupRowListeners(row);
    });
}

// 행 이벤트 리스너 설정
function setupRowListeners(row) {
    const inputs = row.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('input', calculateTotals);
    });
    // 자동완성 채우기: 품명 선택 시 규격/단가/공급업체 채움
    const nameInput = row.querySelector('td:nth-child(1) input');
    const specInput = row.querySelector('td:nth-child(2) input');
    const qtyInput = row.querySelector('td:nth-child(3) input');
    const priceInput = row.querySelector('td:nth-child(4) input');
    const supplierInput = row.querySelector('td:nth-child(5) input');
    if (nameInput) {
        nameInput.addEventListener('change', () => {
            if (typeof autofillItemFromCatalog === 'function') {
                autofillItemFromCatalog({ nameInput, specInput, priceInput, supplierInput });
            }
        });
    }
}

// 품목 행 추가
function addItemRow() {
    const itemsTableBody = document.getElementById('items-table-body');
    const newRow = document.createElement('tr');
    newRow.className = 'item-row';
    
    newRow.innerHTML = `
        <td class="border border-gray-300 px-3 py-2">
            <input type="text" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="품명">
        </td>
        <td class="border border-gray-300 px-3 py-2">
            <input type="text" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-1 focus:ring-indigo-500" placeholder="규격">
        </td>
        <td class="border border-gray-300 px-3 py-2">
            <input type="number" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="수량" min="1">
        </td>
        <td class="border border-gray-300 px-3 py-2">
            <input type="number" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="예상금액" min="0">
        </td>
        <td class="border border-gray-300 px-3 py-2">
            <input type="text" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="공급업체">
        </td>
        <td class="border border-gray-300 px-3 py-2">
            <input type="text" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="기타">
        </td>
        <td class="border border-gray-300 px-3 py-2 text-center">
            <button type="button" onclick="removeItemRow(this)" class="text-red-600 hover:text-red-800 px-2 py-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
            </button>
        </td>
    `;
    
    itemsTableBody.appendChild(newRow);
    setupRowListeners(newRow);
    
    // 새로 추가된 행의 입력 필드에 이벤트 리스너 추가
    const inputs = newRow.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('input', calculateTotals);
        input.addEventListener('change', calculateTotals);
    });
}

// 품목 행 제거
function removeItemRow(button) {
    const row = button.closest('.item-row');
    if (row && document.querySelectorAll('.item-row').length > 1) {
        row.remove();
        calculateTotals();
    }
}

// 합계 계산
function calculateTotals() {
    const rows = document.querySelectorAll('.item-row');
    let subtotal = 0;
    
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        if (inputs.length >= 4) {
            const quantity = parseFloat(inputs[2].value) || 0; // 수량 (3번째 input)
            const amount = parseFloat(inputs[3].value) || 0;   // 예상금액 (4번째 input)
            
            const itemTotal = quantity * amount;
            subtotal += itemTotal;
            
            console.log(`품목 계산: 수량 ${quantity} × 예상금액 ${amount} = ${itemTotal}`);
        }
    });
    
    const vat = subtotal * 0.1; // 10% 부가세
    const total = subtotal + vat;
    
    console.log(`총 계산: 합계 ${subtotal}, 부가세 ${vat}, 총금액 ${total}`);
    
    // 천 단위 콤마와 원 표시
    document.getElementById('subtotal').value = subtotal.toLocaleString() + '원';
    document.getElementById('vat').value = vat.toLocaleString() + '원';
    document.getElementById('total-amount').value = total.toLocaleString() + '원';
    
    // 데이터 속성에 숫자 값 저장 (계산용)
    document.getElementById('subtotal').setAttribute('data-value', subtotal);
    document.getElementById('vat').setAttribute('data-value', vat);
    document.getElementById('total-amount').setAttribute('data-value', total);
}

// 구매요구서 저장
function savePurchaseRequest() {
    const formData = collectFormDataFromForm();
    
    if (!formData) {
        return;
    }
    
    // 데이터 저장 (로컬 스토리지 사용)
    savePurchaseRequestToStorage(formData);
    
    alert('구매요구서가 저장되었습니다.');
    closePurchaseRequestModal();
    
    // 테이블 새로고침
    renderPurchaseRequestTable();
}

// 구매요구서 수정
async function updatePurchaseRequest(id) {
    const formData = collectFormDataFromForm();
    
    if (!formData) {
        return;
    }
    
    try {
        // DB 버전에서 업데이트
        let dbData = JSON.parse(localStorage.getItem('purchaseRequestsDB') || '[]');
        const dbIndex = dbData.findIndex(req => req.id === id);
        
        if (dbIndex !== -1) {
            dbData[dbIndex] = {
                ...dbData[dbIndex],
                ...formData,
                updatedAt: new Date().toISOString()
            };
            
            localStorage.setItem('purchaseRequestsDB', JSON.stringify(dbData));
            
            // 일반 로컬 스토리지에서도 업데이트
            const purchaseRequests = JSON.parse(localStorage.getItem('purchaseRequests') || '[]');
            const index = purchaseRequests.findIndex(req => req.id === id);
            
            if (index !== -1) {
                purchaseRequests[index] = dbData[dbIndex];
                localStorage.setItem('purchaseRequests', JSON.stringify(purchaseRequests));
            }
            
            console.log('구매요구서 업데이트 완료:', id);
            console.log('총 구매요구서 수:', dbData.length);
            
            alert('구매요구서가 수정되었습니다.');
            closePurchaseRequestModal();
            
            // 테이블 새로고침
            renderPurchaseRequestTable();
        } else {
            alert('수정할 구매요구서를 찾을 수 없습니다.');
        }
    } catch (error) {
        console.error('구매요구서 수정 오류:', error);
        alert('수정 중 오류가 발생했습니다.');
    }
}

// 폼에서 데이터 수집 (공통 함수)
function collectFormDataFromForm() {
    const formData = {
        preparationDate: document.getElementById('preparation-date').value,
        purchasingDepartment: document.getElementById('purchasing-department').value,
        purchaseReason: document.getElementById('purchase-reason').value,
        items: [],
        subtotal: parseFloat(document.getElementById('subtotal').getAttribute('data-value') || '0'),
        vat: parseFloat(document.getElementById('vat').getAttribute('data-value') || '0'),
        totalAmount: parseFloat(document.getElementById('total-amount').getAttribute('data-value') || '0'),
        createdAt: new Date().toISOString()
    };
    
    // 품목 데이터 수집
    const rows = document.querySelectorAll('.item-row');
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        const item = {
            name: inputs[0].value,
            specification: inputs[1].value,
            quantity: parseFloat(inputs[2].value) || 0,
            estimatedAmount: parseFloat(inputs[3].value) || 0,
            supplier: inputs[4].value,
            other: inputs[5].value
        };
        
        if (item.name && item.quantity > 0) {
            formData.items.push(item);
        }
    });
    
    // 유효성 검사
    if (!formData.preparationDate || !formData.purchasingDepartment || !formData.purchaseReason) {
        alert('필수 항목을 모두 입력해주세요.');
        return null;
    }
    
    if (formData.items.length === 0) {
        alert('최소 하나의 품목을 입력해주세요.');
        return null;
    }
    
    return formData;
}

// 구매요구서를 로컬 스토리지에 저장
function savePurchaseRequestToStorage(data) {
    const existingData = JSON.parse(localStorage.getItem('purchaseRequests') || '[]');
    const newRequest = {
        id: Date.now().toString(),
        ...data
    };
    
    existingData.push(newRequest);
    localStorage.setItem('purchaseRequests', JSON.stringify(existingData));
    
    // DB 폴더에도 저장 시도
    savePurchaseRequestToDB(newRequest);
}

// 구매요구서를 DB 폴더에 저장
async function savePurchaseRequestToDB(data) {
    try {
        // 로컬 스토리지에서 기존 데이터 읽기
        let dbData = JSON.parse(localStorage.getItem('purchaseRequestsDB') || '[]');
        
        // 새 데이터 추가
        dbData.push(data);
        
        // 로컬 스토리지에 DB 버전 저장
        localStorage.setItem('purchaseRequestsDB', JSON.stringify(dbData));
        
        // 실제 DB 파일 업데이트 시도 (브라우저 환경에서는 제한적)
        console.log('DB 저장 완료:', data);
        console.log('총 구매요구서 수:', dbData.length);
        
        // DB 파일 동기화를 위한 로컬 스토리지 키 설정
        localStorage.setItem('purchaseRequestsLastUpdate', new Date().toISOString());
        
    } catch (error) {
        console.error('DB 저장 오류:', error);
        // DB 저장 실패 시 로컬 스토리지만 사용
    }
}

// 구매요구서 폼 표시 (기존 함수명 유지)
function showPurchaseRequestForm() {
    // 현재 활성화된 뷰가 회계-물품구매요구서인지 확인
    const currentView = document.querySelector('.view-section:not(.hidden)');
    if (currentView && currentView.id === 'accounting-purchase-request-view') {
        showPurchaseRequestModal();
    } else {
        console.log('물품구매요구서 모달은 회계 탭에서만 표시됩니다.');
    }
}

// 구매요구서 수정 모드로 모달 표시
function showPurchaseRequestModalForEdit(request) {
    // 현재 활성화된 뷰가 회계-물품구매요구서인지 확인
    const currentView = document.querySelector('.view-section:not(.hidden)');
    if (!currentView || currentView.id !== 'accounting-purchase-request-view') {
        console.log('물품구매요구서 모달은 회계 탭에서만 표시됩니다.');
        return;
    }
    
    const modal = document.getElementById('purchase-request-modal');
    if (modal) {
        // CSS 클래스 기반으로 모달 표시
        modal.classList.add('show');
        modal.classList.remove('hidden');
        
        // 폼에 기존 데이터 채우기
        fillPurchaseRequestForm(request);
        
        // 폼 이벤트 리스너 추가
        setupPurchaseRequestForm();
        
        // 모달 제목을 수정 모드로 변경
        const modalTitle = modal.querySelector('h2');
        if (modalTitle) {
            modalTitle.textContent = '물품구매요구서 수정';
        }
        
        // 저장 버튼을 수정 모드로 변경
        const saveButton = modal.querySelector('button[type="submit"]');
        if (saveButton) {
            saveButton.textContent = '수정';
            saveButton.onclick = function(e) {
                e.preventDefault();
                updatePurchaseRequest(request.id);
            };
        }
    }
}

// 구매요구서 폼에 데이터 채우기
function fillPurchaseRequestForm(request) {
    // 기본 정보 채우기
    document.getElementById('preparation-date').value = request.preparationDate;
    document.getElementById('purchasing-department').value = request.purchasingDepartment;
    document.getElementById('purchase-reason').value = request.purchaseReason;
    
    // 기존 품목 행들 제거
    const itemsTableBody = document.getElementById('items-table-body');
    itemsTableBody.innerHTML = '';
    
    // 품목 데이터로 행 생성
    request.items.forEach((item, index) => {
        if (index === 0) {
            // 첫 번째 행은 기존 행 수정
            const firstRow = itemsTableBody.querySelector('.item-row');
            if (firstRow) {
                const inputs = firstRow.querySelectorAll('input');
                inputs[0].value = item.name;
                inputs[1].value = item.specification;
                inputs[2].value = item.quantity;
                inputs[3].value = item.estimatedAmount;
                inputs[4].value = item.supplier;
                inputs[5].value = item.other;
            }
        } else {
            // 추가 행 생성
            addItemRow();
            const newRow = itemsTableBody.querySelector('.item-row:last-child');
            if (newRow) {
                const inputs = newRow.querySelectorAll('input');
                inputs[0].value = item.name;
                inputs[1].value = item.specification;
                inputs[2].value = item.quantity;
                inputs[3].value = item.estimatedAmount;
                inputs[4].value = item.supplier;
                inputs[5].value = item.other;
            }
        }
    });
    
    // 합계 계산 및 표시
    calculateTotals();
}

// 인쇄용 구매요구서 생성
function printPurchaseRequest() {
    // 현재 폼 데이터 수집
    const formData = collectFormData();
    
    if (!formData) {
        alert('인쇄할 데이터가 없습니다. 폼을 먼저 작성해주세요.');
        return;
    }
    
    // 인쇄용 HTML 생성
    const printHTML = generatePrintHTML(formData);
    
    // 새 창에서 인쇄
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printHTML);
    printWindow.document.close();
    
    // 인쇄 대화상자 표시
    setTimeout(() => {
        printWindow.print();
    }, 500);
}

// 폼 데이터 수집
function collectFormData() {
    const preparationDate = document.getElementById('preparation-date').value;
    const purchasingDepartment = document.getElementById('purchasing-department').value;
    const purchaseReason = document.getElementById('purchase-reason').value;
    
    if (!preparationDate || !purchasingDepartment || !purchaseReason) {
        return null;
    }
    
    const items = [];
    const rows = document.querySelectorAll('.item-row');
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        const item = {
            name: inputs[0].value,
            specification: inputs[1].value,
            quantity: inputs[2].value,
            estimatedAmount: inputs[3].value,
            supplier: inputs[4].value,
            other: inputs[5].value
        };
        
        if (item.name && item.quantity) {
            items.push(item);
        }
    });
    
    if (items.length === 0) {
        return null;
    }
    
    return {
        preparationDate,
        purchasingDepartment,
        purchaseReason,
        items,
        subtotal: document.getElementById('subtotal').value,
        vat: document.getElementById('vat').value,
        totalAmount: document.getElementById('total-amount').value
    };
}

// 인쇄용 HTML 생성
function generatePrintHTML(data) {
    const itemsHTML = data.items.map(item => `
        <tr>
            <td style="border: 1px solid #000; padding: 8px; text-align: left;">${item.name || ''}</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: left;">${item.specification || ''}</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: center;">${item.quantity || ''}</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: right;">${item.estimatedAmount ? Number(item.estimatedAmount).toLocaleString() : ''}</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: left;">${item.supplier || ''}</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: left;">${item.other || ''}</td>
        </tr>
    `).join('');
    
    return `
        <!DOCTYPE html>
        <html lang="ko">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>물품구매요구서</title>
            <style>
                @media print {
                    body { margin: 0; padding: 20px; }
                    .no-print { display: none; }
                }
                body { 
                    font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; 
                    font-size: 12px; 
                    line-height: 1.4;
                    margin: 0;
                    padding: 20px;
                }
                .header { text-align: center; margin-bottom: 30px; }
                .title { font-size: 24px; font-weight: bold; margin-bottom: 20px; }
                .approval-table { 
                    float: right; 
                    border-collapse: collapse; 
                    margin-left: 20px; 
                    margin-bottom: 20px;
                }
                .approval-table th, .approval-table td { 
                    border: 1px solid #000; 
                    padding: 8px; 
                    text-align: center; 
                    width: 80px; 
                    height: 40px;
                }
                .info-section { margin-bottom: 30px; }
                .info-row { margin-bottom: 15px; }
                .info-label { 
                    display: inline-block; 
                    width: 100px; 
                    font-weight: bold; 
                    margin-right: 20px;
                }
                .info-value { 
                    display: inline-block; 
                    width: 200px; 
                    border-bottom: 1px solid #000; 
                    padding-bottom: 2px;
                }
                .items-table { 
                    width: 100%; 
                    border-collapse: collapse; 
                    margin-bottom: 20px;
                }
                .items-table th, .items-table td { 
                    border: 1px solid #000; 
                    padding: 8px; 
                    text-align: center;
                }
                .items-table th { 
                    background-color: #f0f0f0; 
                    font-weight: bold;
                }
                .summary-table { 
                    float: right; 
                    border-collapse: collapse; 
                    margin-bottom: 20px;
                }
                .summary-table th, .summary-table td { 
                    border: 1px solid #000; 
                    padding: 8px; 
                    text-align: center;
                }
                .footer { 
                    clear: both; 
                    margin-top: 30px; 
                    text-align: center; 
                    font-size: 10px;
                }
                .footer div { 
                    display: inline-block; 
                    margin: 0 20px;
                }
                .page-break { page-break-before: always; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">물품구매요구서</div>
            </div>
            
            <table class="approval-table">
                <thead>
                    <tr>
                        <th>담당자</th>
                        <th>기술 책임자</th>
                        <th>품질 책임자</th>
                        <th>부사장</th>
                        <th>사장</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                    </tr>
                </tbody>
            </table>
            
            <div class="info-section">
                <div class="info-row">
                    <span class="info-label">작성일자:</span>
                    <span class="info-value">${data.preparationDate}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">구입부서:</span>
                    <span class="info-value">${data.purchasingDepartment}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">구입사유:</span>
                    <span class="info-value">${data.purchaseReason}</span>
                </div>
            </div>
            
            <table class="items-table">
                <thead>
                    <tr>
                        <th style="width: 20%;">품명</th>
                        <th style="width: 20%;">규격</th>
                        <th style="width: 10%;">수량</th>
                        <th style="width: 15%;">예상금액</th>
                        <th style="width: 20%;">공급대상업체</th>
                        <th style="width: 15%;">기타</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHTML}
                </tbody>
            </table>
            
            <table class="summary-table">
                <tbody>
                    <tr>
                        <th style="width: 80px;">합계</th>
                        <td style="width: 120px;">${data.subtotal ? Number(data.subtotal.replace(/,/g, '')).toLocaleString() : '0'}원</td>
                    </tr>
                    <tr>
                        <th>부가세</th>
                        <td>${data.vat ? Number(data.vat.replace(/,/g, '')).toLocaleString() : '0'}원</td>
                    </tr>
                    <tr>
                        <th>총금액</th>
                        <td>${data.totalAmount ? Number(data.totalAmount.replace(/,/g, '')).toLocaleString() : '0'}원</td>
                    </tr>
                </tbody>
            </table>
            
            <div class="footer">
                <div>CM-QP-04-F07</div>
                <div>회사 청명기연환경</div>
                <div>A4(210×297mm)</div>
            </div>
            
            <div class="no-print" style="margin-top: 50px; text-align: center;">
                <button onclick="window.print()" style="padding: 10px 20px; font-size: 16px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    인쇄하기
                </button>
                <button onclick="window.close()" style="padding: 10px 20px; font-size: 16px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer; margin-left: 10px;">
                    닫기
                </button>
            </div>
        </body>
        </html>
    `;
}

// 견적서 테이블 렌더링
async function renderQuoteTable() {
    const tbody = document.getElementById('quote-table');
    if (!tbody) return;
    
    // DB 데이터 우선 로드 (로컬 스토리지의 DB 버전)
    let quotes = [];
    
    try {
        // 먼저 로컬 스토리지의 DB 버전에서 로드
        const dbData = localStorage.getItem('quotesDB');
        if (dbData) {
            quotes = JSON.parse(dbData);
            console.log('DB 버전에서 견적서 데이터 로드:', quotes.length, '건');
        } else {
            // DB 버전이 없으면 일반 로컬 스토리지에서 로드
            quotes = JSON.parse(localStorage.getItem('quotes') || '[]');
            console.log('로컬 스토리지에서 견적서 데이터 로드:', quotes.length, '건');
            
            // 기존 데이터를 DB 버전으로 마이그레이션
            if (quotes.length > 0) {
                localStorage.setItem('quotesDB', JSON.stringify(quotes));
                console.log('기존 견적서 데이터를 DB 버전으로 마이그레이션 완료');
            }
        }
    } catch (error) {
        console.error('견적서 데이터 로드 오류:', error);
        // 오류 시 빈 배열로 시작
        quotes = [];
    }
    
    tbody.innerHTML = '';
    
    if (quotes.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-8 text-gray-500">
                    <div class="py-8">
                        <div class="text-gray-500 mb-2">등록된 견적서가 없습니다.</div>
                        <div class="text-xs text-gray-400">"견적서 작성" 버튼을 클릭하여 첫 번째 견적서를 작성해보세요.</div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    // 최신 순으로 정렬
    quotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    quotes.forEach(quote => {
        const row = tbody.insertRow();
        const totalItems = quote.items.length;
        const totalQuantity = quote.items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
        
        row.innerHTML = `
            <td class="p-2">
                <div class="text-sm font-medium text-gray-900">${quote.quoteNumber}</div>
                <div class="text-xs text-gray-500">${new Date(quote.createdAt).toLocaleDateString()}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${quote.recipient}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${totalItems}개 품목</div>
                <div class="text-xs text-gray-500">총 ${totalQuantity}개</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${quote.totalAmount.toLocaleString()}원</div>
            </td>
            <td class="p-2">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                    견적완료
                </span>
            </td>
            <td class="p-2">
                <div class="flex space-x-2">
                    <button onclick="viewQuote('${quote.id}')" class="text-indigo-600 hover:text-indigo-900 text-sm">
                        보기
                    </button>
                    <button onclick="deleteQuote('${quote.id}')" class="text-red-600 hover:text-red-900 text-sm">
                        삭제
                    </button>
                    <button onclick="printQuoteById('${quote.id}')" class="text-green-600 hover:text-green-900 text-sm">
                        인쇄
                    </button>
                </div>
            </td>
        `;
    });
    
    console.log('견적서 테이블 렌더링 완료:', quotes.length, '건');
}

// 견적서 상세 보기
async function viewQuote(id) {
    let quote = null;
    
    try {
        // DB 버전에서 먼저 찾기
        const dbData = localStorage.getItem('quotesDB');
        if (dbData) {
            const dbQuotes = JSON.parse(dbData);
            quote = dbQuotes.find(q => q.id === id);
        }
        
        // DB 버전에서 찾지 못했으면 일반 로컬 스토리지에서 찾기
        if (!quote) {
            const quotes = JSON.parse(localStorage.getItem('quotes') || '[]');
            quote = quotes.find(q => q.id === id);
        }
        
        if (!quote) {
            alert('견적서를 찾을 수 없습니다.');
            return;
        }
        
        // 견적서 모달에 데이터 채우기
        fillQuoteForm(quote);
        showQuoteModal();
        
    } catch (error) {
        console.error('견적서 조회 오류:', error);
        alert('견적서 조회 중 오류가 발생했습니다.');
    }
}

// 견적서 폼에 데이터 채우기
function fillQuoteForm(quote) {
    // 기본 정보 채우기
    document.getElementById('quote-number').value = quote.quoteNumber;
    document.getElementById('quote-date').value = quote.quoteDate;
    document.getElementById('remarks').value = quote.remarks || '';
    
    // 품목 테이블 초기화
    const itemsTableBody = document.getElementById('quote-items-table-body');
    itemsTableBody.innerHTML = '';
    
    // 품목 데이터 채우기
    quote.items.forEach((item, index) => {
        if (index === 0) {
            // 첫 번째 행 생성
            const firstRow = document.createElement('tr');
            firstRow.className = 'quote-item-row';
            firstRow.innerHTML = `
                <td class="border border-gray-300 px-3 py-2 text-center">1</td>
                <td class="border border-gray-300 px-3 py-2">
                    <input type="text" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" value="${item.productNumber || ''}">
                </td>
                <td class="border border-gray-300 px-3 py-2">
                    <input type="text" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" value="${item.details || ''}">
                </td>
                <td class="border border-gray-300 px-3 py-2">
                    <input type="number" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" value="${item.quantity || ''}" min="1">
                </td>
                <td class="border border-gray-300 px-3 py-2">
                    <input type="number" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" value="${item.unitPrice || ''}" min="0">
                </td>
                <td class="border border-gray-300 px-3 py-2">
                    <input type="text" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" readonly>
                </td>
                <td class="border border-gray-300 px-3 py-2">
                    <input type="text" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" value="${item.deliveryDate || ''}">
                </td>
                <td class="border border-gray-300 px-3 py-2 text-center">
                    <button type="button" onclick="removeQuoteItemRow(this)" class="text-red-600 hover:text-red-800 px-2 py-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                </td>
            `;
            itemsTableBody.appendChild(firstRow);
        } else {
            // 추가 행 생성
            addQuoteItemRow();
            const newRow = itemsTableBody.querySelector('.quote-item-row:last-child');
            if (newRow) {
                const inputs = newRow.querySelectorAll('input');
                inputs[0].value = item.productNumber || '';
                inputs[1].value = item.details || '';
                inputs[2].value = item.quantity || '';
                inputs[3].value = item.unitPrice || '';
                inputs[5].value = item.deliveryDate || '';
            }
        }
    });
    
    // 이벤트 리스너 다시 설정
    setupQuoteItemTableListeners();
    
    // 합계 계산
    calculateQuoteTotals();
}

// 견적서 삭제
async function deleteQuote(id) {
    if (confirm('정말로 이 견적서를 삭제하시겠습니까?')) {
        try {
            // DB 버전에서 삭제
            let dbData = JSON.parse(localStorage.getItem('quotesDB') || '[]');
            dbData = dbData.filter(q => q.id !== id);
            localStorage.setItem('quotesDB', JSON.stringify(dbData));
            
            // 일반 로컬 스토리지에서도 삭제
            const quotes = JSON.parse(localStorage.getItem('quotes') || '[]');
            const filteredQuotes = quotes.filter(q => q.id !== id);
            localStorage.setItem('quotes', JSON.stringify(filteredQuotes));
            
            console.log('견적서 삭제 완료:', id);
            console.log('남은 견적서 수:', dbData.length);
            
            renderQuoteTable();
            alert('견적서가 삭제되었습니다.');
            
        } catch (error) {
            console.error('견적서 삭제 오류:', error);
            alert('삭제 중 오류가 발생했습니다.');
        }
    }
}

// ID로 견적서 인쇄
async function printQuoteById(id) {
    let quote = null;
    
    try {
        // DB 버전에서 먼저 찾기
        const dbData = localStorage.getItem('quotesDB');
        if (dbData) {
            const dbQuotes = JSON.parse(dbData);
            quote = dbQuotes.find(q => q.id === id);
        }
        
        // DB 버전에서 찾지 못했으면 일반 로컬 스토리지에서 찾기
        if (!quote) {
            const quotes = JSON.parse(localStorage.getItem('quotes') || '[]');
            quote = quotes.find(q => q.id === id);
        }
        
        if (!quote) {
            alert('인쇄할 견적서를 찾을 수 없습니다.');
            return;
        }
        
        // 인쇄용 HTML 생성
        const printHTML = generateQuotePrintHTML(quote);
        
        // 새 창에서 인쇄
        const printWindow = window.open('', '_blank');
        printWindow.document.write(printHTML);
        printWindow.document.close();
        
        // 인쇄 대화상자 표시
        setTimeout(() => {
            printWindow.print();
        }, 500);
        
    } catch (error) {
        console.error('견적서 인쇄 오류:', error);
        alert('인쇄 중 오류가 발생했습니다.');
    }
}

// 진행상황 업데이트
function updateApprovalProgress(step) {
    const steps = ['담당자', '기술 책임자', '품질 책임자', '부사장', '사장'];
    const currentIndex = steps.indexOf(step);
    
    steps.forEach((stepName, index) => {
        const stepElement = document.querySelector(`[data-step="${stepName}"]`);
        if (stepElement) {
            const iconDiv = stepElement.querySelector('div:first-child');
            const statusDiv = stepElement.querySelector('div:last-child');
            
            if (index < currentIndex) {
                // 완료된 단계
                iconDiv.className = 'w-12 h-12 mx-auto mb-2 bg-green-500 rounded-full flex items-center justify-center';
                iconDiv.innerHTML = '<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
                statusDiv.textContent = '승인완료';
                statusDiv.className = 'text-xs text-green-600 mt-1 font-medium';
            } else if (index === currentIndex) {
                // 현재 단계
                iconDiv.className = 'w-12 h-12 mx-auto mb-2 bg-blue-500 rounded-full flex items-center justify-center';
                iconDiv.innerHTML = '<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
                statusDiv.textContent = '검토중';
                statusDiv.className = 'text-xs text-blue-600 mt-1 font-medium';
            } else {
                // 대기 단계
                iconDiv.className = 'w-12 h-12 mx-auto mb-2 bg-gray-200 rounded-full flex items-center justify-center';
                iconDiv.innerHTML = '<svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
                statusDiv.textContent = '대기중';
                statusDiv.className = 'text-xs text-gray-500 mt-1';
            }
        }
    });
}

// 승인 단계 시뮬레이션 (테스트용)
function simulateApproval() {
    const steps = ['담당자', '기술 책임자', '품질 책임자', '부사장', '사장'];
    let currentStep = 0;
    
    const interval = setInterval(() => {
        if (currentStep < steps.length) {
            updateApprovalProgress(steps[currentStep]);
            currentStep++;
        } else {
            clearInterval(interval);
        }
    }, 2000);
}

// 견적 폼 표시
function showQuoteForm() {
    // 현재 활성화된 뷰가 회계-견적서인지 확인
    const currentView = document.querySelector('.view-section:not(.hidden)');
    if (currentView && currentView.id === 'accounting-quote-view') {
        showQuoteModal();
    } else {
        console.log('견적서 모달은 회계 탭에서만 표시됩니다.');
    }
}

// 견적서 모달 표시
function showQuoteModal() {
    // 현재 활성화된 뷰가 회계-견적서인지 한 번 더 확인
    const currentView = document.querySelector('.view-section:not(.hidden)');
    if (!currentView || currentView.id !== 'accounting-quote-view') {
        console.log('견적서 모달은 회계 탭에서만 표시됩니다.');
        return;
    }
    
    const modal = document.getElementById('quote-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        // 오늘 날짜를 기본값으로 설정
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('quote-date');
        if (dateInput) {
            dateInput.value = today;
        }
        
        // 견적번호 자동 생성
        const quoteNumberInput = document.getElementById('quote-number');
        if (quoteNumberInput) {
            const timestamp = Date.now();
            quoteNumberInput.value = `QT-${timestamp}`;
        }
        
        // 폼 이벤트 리스너 추가
        setupQuoteForm();
        
        // 토글 버튼 초기 상태로 복원 (자동 표시하지 않음)
        const toggleBtn = document.getElementById('purchase-request-import-toggle');
        if (toggleBtn) {
            toggleBtn.classList.remove('active', 'bg-blue-600', 'text-white');
            toggleBtn.classList.add('bg-blue-100', 'text-blue-700');
            toggleBtn.innerHTML = '📋';
            toggleBtn.title = '구매요구서 불러오기';
        }
    }
}

// 견적서 모달 닫기
function closeQuoteModal() {
    const modal = document.getElementById('quote-modal');
    if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
        
        // 모달 상태 원래대로 복원
        resetQuoteModalToDefault();
    }
}

// 견적서 모달을 기본 상태로 복원
function resetQuoteModalToDefault() {
    // 폼 데이터 초기화
    const form = document.getElementById('quote-form');
    if (form) {
        form.reset();
    }
    
    // 토글 버튼 초기 상태로 복원
    const toggleBtn = document.getElementById('purchase-request-import-toggle');
    if (toggleBtn) {
        toggleBtn.classList.remove('active', 'bg-blue-600', 'text-white');
        toggleBtn.classList.add('bg-blue-100', 'text-blue-700');
        toggleBtn.innerHTML = '📋';
        toggleBtn.title = '구매요구서 불러오기';
    }
    
    // 구매요구서 불러오기 옵션 제거
    const existingOption = document.querySelector('.purchase-request-import-option');
    if (existingOption) {
        existingOption.remove();
    }
    
    // 품목 테이블 초기화 (첫 번째 행만 남기고 나머지 제거)
    const itemsTableBody = document.getElementById('quote-items-table-body');
    if (itemsTableBody) {
        const firstRow = itemsTableBody.querySelector('.quote-item-row');
        if (firstRow) {
            itemsTableBody.innerHTML = '';
            itemsTableBody.appendChild(firstRow);
            
            // 첫 번째 행의 입력 필드 초기화
            const inputs = firstRow.querySelectorAll('input');
            inputs.forEach(input => {
                input.value = '';
            });
            
            // 첫 번째 행의 번호를 1로 설정
            const firstRowFirstCell = firstRow.querySelector('td:first-child');
            if (firstRowFirstCell) {
                firstRowFirstCell.textContent = '1';
            }
        }
    }
    
    // 합계 초기화
    document.getElementById('supply-amount').value = '0원';
    document.getElementById('quote-vat').value = '0원';
    document.getElementById('quote-total-amount').value = '0원';
    document.getElementById('supply-amount').setAttribute('data-value', '0');
    document.getElementById('quote-vat').setAttribute('data-value', '0');
    document.getElementById('quote-total-amount').setAttribute('data-value', '0');
    
    // 견적금액 요약 초기화
    document.getElementById('total-amount-korean').textContent = '영';
    document.getElementById('total-amount-numeric').textContent = '( 0 )';
    
    // 비고 초기화
    document.getElementById('remarks').value = '';
}

// 견적서 폼 설정
function setupQuoteForm() {
    const form = document.getElementById('quote-form');
    
    // 폼 제출 이벤트
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        saveQuote();
    });
    
    // 품목 테이블의 입력 필드에 이벤트 리스너 추가
    setupQuoteItemTableListeners();
    
    // 합계 계산 초기화
    calculateQuoteTotals();
}

// 견적서 품목 테이블 이벤트 리스너 설정
function setupQuoteItemTableListeners() {
    const itemsTableBody = document.getElementById('quote-items-table-body');
    
    // 기존 행에 이벤트 리스너 추가
    const existingRows = itemsTableBody.querySelectorAll('.quote-item-row');
    existingRows.forEach(row => {
        setupQuoteRowListeners(row);
    });
}

// 견적서 행 이벤트 리스너 설정
function setupQuoteRowListeners(row) {
    const inputs = row.querySelectorAll('input');
    inputs.forEach((input, index) => {
        if (index === 3 || index === 4) { // 수량(4번째) 또는 단가(5번째) 입력 필드
            input.addEventListener('input', calculateQuoteTotals);
            input.addEventListener('change', calculateQuoteTotals);
        }
    });
}

// 견적서 품목 행 추가
function addQuoteItemRow() {
    const itemsTableBody = document.getElementById('quote-items-table-body');
    const newRow = document.createElement('tr');
    newRow.className = 'quote-item-row';
    
    const rowNumber = itemsTableBody.querySelectorAll('.quote-item-row').length + 1;
    
    newRow.innerHTML = `
        <td class="border border-gray-300 px-3 py-2 text-center">${rowNumber}</td>
        <td class="border border-gray-300 px-3 py-2">
            <input type="text" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="제품번호">
        </td>
        <td class="border border-gray-300 px-3 py-2">
            <input type="text" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="세부내용">
        </td>
        <td class="border border-gray-300 px-3 py-2">
            <input type="number" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="수량" min="1">
        </td>
        <td class="border border-gray-300 px-3 py-2">
            <input type="number" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="단가" min="0">
        </td>
        <td class="border border-gray-300 px-3 py-2">
            <input type="text" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" readonly>
        </td>
        <td class="border border-gray-300 px-3 py-2">
            <input type="text" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="납기">
        </td>
        <td class="border border-gray-300 px-3 py-2 text-center">
            <button type="button" onclick="removeQuoteItemRow(this)" class="text-red-600 hover:text-red-800 px-2 py-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
            </button>
        </td>
    `;
    
    itemsTableBody.appendChild(newRow);
    setupQuoteRowListeners(newRow);
    
    // 새로 추가된 행의 입력 필드에 이벤트 리스너 추가
    const inputs = newRow.querySelectorAll('input');
    inputs.forEach((input, index) => {
        if (index === 3 || index === 4) { // 수량 또는 단가 입력 필드
            input.addEventListener('input', calculateQuoteTotals);
            input.addEventListener('change', calculateQuoteTotals);
        }
    });
}

// 견적서 품목 행 제거
function removeQuoteItemRow(button) {
    const row = button.closest('.quote-item-row');
    if (row && document.querySelectorAll('.quote-item-row').length > 1) {
        row.remove();
        calculateQuoteTotals();
        
        // 행 번호 재정렬
        const rows = document.querySelectorAll('.quote-item-row');
        rows.forEach((row, index) => {
            const firstCell = row.querySelector('td:first-child');
            if (firstCell) {
                firstCell.textContent = index + 1;
            }
        });
    }
}

// 견적서 합계 계산
function calculateQuoteTotals() {
    const rows = document.querySelectorAll('.quote-item-row');
    let supplyAmount = 0;
    
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        if (inputs.length >= 6) {
            const quantity = parseFloat(inputs[3].value) || 0; // 수량 (4번째 input)
            const unitPrice = parseFloat(inputs[4].value) || 0; // 단가 (5번째 input)
            
            const itemTotal = quantity * unitPrice;
            supplyAmount += itemTotal;
            
            // 금액 필드에 자동 계산 결과 표시
            const amountInput = inputs[5];
            if (amountInput) {
                amountInput.value = itemTotal.toLocaleString() + '원';
            }
            
            console.log(`견적 품목 계산: 수량 ${quantity} × 단가 ${unitPrice} = ${itemTotal}`);
        }
    });
    
    const vat = supplyAmount * 0.1; // 10% 부가세
    const totalAmount = supplyAmount + vat;
    
    console.log(`견적 총 계산: 공급가액 ${supplyAmount}, 부가세 ${vat}, 합계금액 ${totalAmount}`);
    
    // 천 단위 콤마와 원 표시
    document.getElementById('supply-amount').value = supplyAmount.toLocaleString() + '원';
    document.getElementById('quote-vat').value = vat.toLocaleString() + '원';
    document.getElementById('quote-total-amount').value = totalAmount.toLocaleString() + '원';
    
    // 데이터 속성에 숫자 값 저장 (계산용)
    document.getElementById('supply-amount').setAttribute('data-value', supplyAmount);
    document.getElementById('quote-vat').setAttribute('data-value', vat);
    document.getElementById('quote-total-amount').setAttribute('data-value', totalAmount);
    
    // 견적금액 요약 업데이트
    updateQuoteAmountSummary(totalAmount);
}

// 견적금액 요약 업데이트
function updateQuoteAmountSummary(totalAmount) {
    const koreanElement = document.getElementById('total-amount-korean');
    const numericElement = document.getElementById('total-amount-numeric');
    
    if (totalAmount === 0) {
        koreanElement.textContent = '영';
        numericElement.textContent = '( 0 )';
    } else {
        // 숫자를 한글로 변환 (간단한 버전)
        const koreanNumbers = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구', '십'];
        const units = ['', '십', '백', '천', '만', '십만', '백만', '천만', '억'];
        
        // 간단한 한글 변환 (실제로는 더 복잡한 로직 필요)
        if (totalAmount < 10000) {
            koreanElement.textContent = totalAmount.toLocaleString();
        } else if (totalAmount < 100000000) {
            koreanElement.textContent = Math.floor(totalAmount / 10000) + '만';
        } else {
            koreanElement.textContent = Math.floor(totalAmount / 100000000) + '억';
        }
        
        numericElement.textContent = `( ${totalAmount.toLocaleString()} )`;
    }
}

// 물품구매요구서 데이터 불러오기 옵션 표시
function showPurchaseRequestImportOption() {
    // 호환을 위해 남겨두지만 내부적으로 버튼만 렌더링
    renderPurchaseImportButton();
}

function renderPurchaseImportButton() {
    // 기존 옵션이 있다면 제거
    const existingOption = document.querySelector('.purchase-request-import-option');
    if (existingOption) {
        existingOption.remove();
    }
    
    // 물품구매요구서 데이터 불러오기 옵션 추가
    const form = document.getElementById('quote-form');
    if (form) {
        const importOption = document.createElement('div');
        importOption.className = 'purchase-request-import-option mb-4';
        importOption.innerHTML = `<button type="button" onclick="showPurchaseRequestSelector()" class="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">구매요구서 불러오기</button>`;
        
        // 폼의 첫 번째 요소 앞에 삽입
        form.insertBefore(importOption, form.firstChild);
    }
}

// 구매요구서 불러오기 토글 기능
function togglePurchaseRequestImport() {
    const toggleBtn = document.getElementById('purchase-request-import-toggle');
    const isActive = toggleBtn.classList.contains('active');
    
    if (isActive) {
        // 비활성화: 토글 버튼 스타일 변경
        toggleBtn.classList.remove('active', 'bg-blue-600', 'text-white');
        toggleBtn.classList.add('bg-blue-100', 'text-blue-700');
        toggleBtn.innerHTML = '📋';
        toggleBtn.title = '구매요구서 불러오기';
        
        // 기존 옵션 제거
        const existingOption = document.querySelector('.purchase-request-import-option');
        if (existingOption) {
            existingOption.remove();
        }
    } else {
        // 활성화: 토글 버튼 스타일 변경
        toggleBtn.classList.add('active', 'bg-blue-600', 'text-white');
        toggleBtn.classList.remove('bg-blue-100', 'text-blue-700');
        toggleBtn.innerHTML = '✓';
        toggleBtn.title = '구매요구서 불러오기 활성화됨';
        
        // 구매요구서 불러오기 옵션 표시
        renderPurchaseImportButton();
    }
}

// 물품구매요구서 선택 모달 표시
async function showPurchaseRequestSelector() {
    try {
        // 물품구매요구서 데이터 로드 (DB 버전 우선)
        let purchaseRequests = [];
        
        // DB 버전에서 먼저 로드
        const dbData = localStorage.getItem('purchaseRequestsDB');
        if (dbData) {
            purchaseRequests = JSON.parse(dbData);
            console.log('DB 버전에서 물품구매요구서 데이터 로드:', purchaseRequests.length, '건');
        } else {
            // DB 버전이 없으면 일반 로컬 스토리지에서 로드
            purchaseRequests = JSON.parse(localStorage.getItem('purchaseRequests') || '[]');
            console.log('로컬 스토리지에서 물품구매요구서 데이터 로드:', purchaseRequests.length, '건');
        }
        
        if (purchaseRequests.length === 0) {
            alert('불러올 물품구매요구서가 없습니다.');
            return;
        }
        
        // 최신 순으로 정렬
        purchaseRequests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        // 선택 모달 생성
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-screen overflow-y-auto">
                <div class="p-6 border-b border-gray-200">
                    <div class="flex justify-between items-center">
                        <h3 class="text-xl font-bold text-gray-900">물품구매요구서 선택</h3>
                        <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div class="p-6">
                    <div class="mb-4">
                        <p class="text-sm text-gray-700">견적서에 가져올 물품구매요구서를 선택하세요.</p>
                    </div>
                    
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="text-left p-2">선택</th>
                                    <th class="text-left p-2">작성일자</th>
                                    <th class="text-left p-2">구입부서</th>
                                    <th class="text-left p-2">구입사유</th>
                                    <th class="text-left p-2">품목 수</th>
                                    <th class="text-left p-2">총금액</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${purchaseRequests.map((request, index) => `
                                    <tr class="border-b border-gray-200">
                                        <td class="p-2">
                                            <input type="radio" name="selected-request" value="${index}" class="mr-2">
                                        </td>
                                        <td class="p-2">${request.preparationDate}</td>
                                        <td class="p-2">${request.purchasingDepartment}</td>
                                        <td class="p-2">${request.purchaseReason}</td>
                                        <td class="p-2">${request.items.length}개</td>
                                        <td class="p-2">${(request.totalAmount || 0).toLocaleString()}원</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="flex justify-end space-x-3 mt-6">
                        <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300">
                            취소
                        </button>
                        <button onclick="importPurchaseRequestData()" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">선택</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
    } catch (error) {
        console.error('물품구매요구서 선택 모달 표시 오류:', error);
        alert('물품구매요구서 목록을 불러올 수 없습니다.');
    }
}

// 선택된 물품구매요구서 데이터를 견적서에 가져오기
async function importPurchaseRequestData() {
    try {
        const selectedRadio = document.querySelector('input[name="selected-request"]:checked');
        if (!selectedRadio) {
            alert('가져올 물품구매요구서를 선택해주세요.');
            return;
        }
        
        const selectedIndex = parseInt(selectedRadio.value);
        
        // 물품구매요구서 데이터 로드 (DB 버전 우선)
        let purchaseRequests = [];
        
        // DB 버전에서 먼저 로드
        const dbData = localStorage.getItem('purchaseRequestsDB');
        if (dbData) {
            purchaseRequests = JSON.parse(dbData);
        } else {
            // DB 버전이 없으면 일반 로컬 스토리지에서 로드
            purchaseRequests = JSON.parse(localStorage.getItem('purchaseRequests') || '[]');
        }
        
        const selectedRequest = purchaseRequests[selectedIndex];
        if (!selectedRequest) {
            alert('선택된 물품구매요구서를 찾을 수 없습니다.');
            return;
        }
        // 선택 모달 닫고 즉시 적용
        const modal = document.querySelector('.fixed');
        if (modal) modal.remove();
        fillQuoteWithPurchaseRequest(selectedRequest);
        alert('구매요구서 데이터를 견적서에 가져왔습니다.');
        
    } catch (error) {
        console.error('물품구매요구서 데이터 가져오기 오류:', error);
        alert('데이터 가져오기 중 오류가 발생했습니다.');
    }
}

// 미리보기 관련 로직 제거 (규칙은 코드로만 반영하여 바로 적용)

// 물품구매요구서 데이터로 견적서 채우기
function fillQuoteWithPurchaseRequest(purchaseRequest) {
    // 기존 품목 테이블 초기화
    const itemsTableBody = document.getElementById('quote-items-table-body');
    itemsTableBody.innerHTML = '';
    
    // 물품구매요구서의 품목들을 견적서 품목으로 변환
    // 매핑: 품명→세부내용(details), 규격→제품번호(productNumber), 수량→수량, 예상금액→단가(unitPrice)
    purchaseRequest.items.forEach((item, index) => {
        if (index === 0) {
            // 첫 번째 행은 기존 행 수정
            const firstRow = document.createElement('tr');
            firstRow.className = 'quote-item-row';
            firstRow.innerHTML = `
                <td class="border border-gray-300 px-3 py-2 text-center">1</td>
                <td class="border border-gray-300 px-3 py-2">
                    <input type="text" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" value="${item.specification || ''}" placeholder="제품번호">
                </td>
                <td class="border border-gray-300 px-3 py-2">
                    <input type="text" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" value="${item.name || ''}" placeholder="세부내용">
                </td>
                <td class="border border-gray-300 px-3 py-2">
                    <input type="number" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" value="${item.quantity || ''}" min="1" placeholder="수량">
                </td>
                <td class="border border-gray-300 px-3 py-2">
                    <input type="number" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" value="${item.estimatedAmount || ''}" min="0" placeholder="단가">
                </td>
                <td class="border border-gray-300 px-3 py-2">
                    <input type="text" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" readonly>
                </td>
                <td class="border border-gray-300 px-3 py-2">
                    <input type="text" class="w-full px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500" value="30일">
                </td>
                <td class="border border-gray-300 px-3 py-2 text-center">
                    <button type="button" onclick="removeQuoteItemRow(this)" class="text-red-600 hover:text-red-800 px-2 py-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                </td>
            `;
            itemsTableBody.appendChild(firstRow);
        } else {
            // 추가 행 생성
            addQuoteItemRow();
            const newRow = itemsTableBody.querySelector('.quote-item-row:last-child');
            if (newRow) {
                const inputs = newRow.querySelectorAll('input');
                // inputs: [0]=index col skipped in NodeList; in our implementation inputs[1]=제품번호, [2]=세부내용, [3]=수량, [4]=단가, [5]=금액(자동), [6]=납기
                inputs[1].value = item.specification || '';
                inputs[2].value = item.name || '';
                inputs[3].value = item.quantity || '';
                inputs[4].value = item.estimatedAmount || '';
                inputs[6].value = '30일';
            }
        }
    });
    
    // 이벤트 리스너 다시 설정
    setupQuoteItemTableListeners();
    
    // 합계 계산
    calculateQuoteTotals();
    
    // 비고에 출처 정보 추가
    const remarks = document.getElementById('remarks');
    if (remarks) {
        remarks.value = `물품구매요구서에서 가져온 데이터\n- 작성일자: ${purchaseRequest.preparationDate}\n- 구입부서: ${purchaseRequest.purchasingDepartment}\n- 구입사유: ${purchaseRequest.purchaseReason}`;
    }
}

// 견적서 저장
function saveQuote() {
    const formData = collectQuoteFormData();
    
    if (!formData) {
        return;
    }
    
    // 데이터 저장 (로컬 스토리지 사용)
    saveQuoteToStorage(formData);
    
    alert('견적서가 저장되었습니다.');
    closeQuoteModal();
    
    // 테이블 새로고침
    renderQuoteTable();
}

// 견적서 폼에서 데이터 수집
function collectQuoteFormData() {
    const formData = {
        quoteNumber: document.getElementById('quote-number').value,
        quoteDate: document.getElementById('quote-date').value,
        recipient: document.getElementById('recipient').value,
        validityPeriod: document.getElementById('validity-period').value,
        deliveryPeriod: document.getElementById('delivery-period').value,
        items: [],
        supplyAmount: parseFloat(document.getElementById('supply-amount').getAttribute('data-value') || '0'),
        vat: parseFloat(document.getElementById('quote-vat').getAttribute('data-value') || '0'),
        totalAmount: parseFloat(document.getElementById('quote-total-amount').getAttribute('data-value') || '0'),
        remarks: document.getElementById('remarks').value,
        createdAt: new Date().toISOString()
    };
    
    // 품목 데이터 수집
    const rows = document.querySelectorAll('.quote-item-row');
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        if (inputs.length >= 7) {
            const item = {
                productNumber: inputs[1].value,
                details: inputs[2].value,
                quantity: parseFloat(inputs[3].value) || 0,
                unitPrice: parseFloat(inputs[4].value) || 0,
                amount: parseFloat(inputs[4].value.replace(/[^0-9]/g, '')) || 0,
                deliveryDate: inputs[6].value
            };
            
            if (item.productNumber && item.quantity > 0) {
                formData.items.push(item);
            }
        }
    });
    
    // 유효성 검사
    if (!formData.quoteNumber || !formData.quoteDate) {
        alert('필수 항목을 모두 입력해주세요.');
        return null;
    }
    
    if (formData.items.length === 0) {
        alert('최소 하나의 품목을 입력해주세요.');
        return null;
    }
    
    return formData;
}

// 견적서를 로컬 스토리지에 저장
function saveQuoteToStorage(data) {
    const existingData = JSON.parse(localStorage.getItem('quotes') || '[]');
    const newQuote = {
        id: Date.now().toString(),
        ...data
    };
    
    existingData.push(newQuote);
    localStorage.setItem('quotes', JSON.stringify(existingData));
    
    // DB 폴더에도 저장 시도
    saveQuoteToDB(newQuote);
}

// 견적서를 DB 폴더에 저장
async function saveQuoteToDB(data) {
    try {
        // 로컬 스토리지에서 기존 데이터 읽기
        let dbData = JSON.parse(localStorage.getItem('quotesDB') || '[]');
        
        // 새 데이터 추가
        dbData.push(data);
        
        // 로컬 스토리지에 DB 버전 저장
        localStorage.setItem('quotesDB', JSON.stringify(dbData));
        
        // 실제 DB 파일 업데이트 시도 (브라우저 환경에서는 제한적)
        console.log('견적서 DB 저장 완료:', data);
        console.log('총 견적서 수:', dbData.length);
        
        // DB 파일 동기화를 위한 로컬 스토리지 키 설정
        localStorage.setItem('quotesLastUpdate', new Date().toISOString());
        
    } catch (error) {
        console.error('견적서 DB 저장 오류:', error);
        // DB 저장 실패 시 로컬 스토리지만 사용
    }
}

// 견적서 인쇄
function printQuote() {
    // 현재 폼 데이터 수집
    const formData = collectQuoteFormData();
    
    if (!formData) {
        alert('인쇄할 데이터가 없습니다. 폼을 먼저 작성해주세요.');
        return;
    }
    
    // 인쇄용 HTML 생성
    const printHTML = generateQuotePrintHTML(formData);
    
    // 새 창에서 인쇄
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printHTML);
    printWindow.document.close();
    
    // 인쇄 대화상자 표시
    setTimeout(() => {
        printWindow.print();
    }, 500);
}

// 견적서 인쇄용 HTML 생성
function generateQuotePrintHTML(data) {
    const itemsHTML = data.items.map((item, index) => `
        <tr>
            <td style="border: 1px solid #000; padding: 8px; text-align: center;">${index + 1}</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: left;">${item.productNumber || ''}</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: left;">${item.details || ''}</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: center;">${item.quantity || ''}</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: right;">${item.unitPrice ? Number(item.unitPrice).toLocaleString() : ''}</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: right;">${item.amount ? Number(item.amount).toLocaleString() : ''}</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: center;">${item.deliveryDate || ''}</td>
        </tr>
    `).join('');
    
    return `
        <!DOCTYPE html>
        <html lang="ko">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>견적서</title>
            <style>
                @media print {
                    body { margin: 0; padding: 20px; }
                    .no-print { display: none; }
                }
                body { 
                    font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; 
                    font-size: 12px; 
                    line-height: 1.4;
                    margin: 0;
                    padding: 20px;
                }
                .header { margin-bottom: 30px; }
                .company-info { 
                    display: flex; 
                    align-items: center; 
                    margin-bottom: 20px;
                }
                .company-logo { 
                    width: 60px; 
                    height: 60px; 
                    background-color: #dc2626; 
                    color: white; 
                    border-radius: 50%; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    font-size: 20px; 
                    font-weight: bold; 
                    margin-right: 20px;
                }
                .company-details { flex: 1; }
                .company-name { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
                .company-subtitle { font-size: 12px; color: #666; }
                .company-address { font-size: 11px; line-height: 1.3; }
                
                .quote-info { 
                    float: right; 
                    border: 1px solid #000; 
                    border-radius: 8px; 
                    padding: 15px; 
                    width: 300px;
                }
                .quote-title { font-size: 18px; font-weight: bold; text-align: center; margin-bottom: 15px; }
                .quote-field { margin-bottom: 10px; }
                .quote-label { font-weight: bold; margin-bottom: 3px; }
                .quote-value { border-bottom: 1px solid #000; padding-bottom: 2px; }
                
                .amount-summary { 
                    float: right; 
                    border: 1px solid #000; 
                    border-radius: 8px; 
                    padding: 15px; 
                    width: 300px; 
                    margin-top: 20px;
                }
                .amount-title { font-weight: bold; margin-bottom: 10px; }
                .amount-note { font-size: 10px; color: #666; margin-bottom: 10px; }
                .amount-korean { font-size: 24px; font-weight: bold; text-align: center; margin-bottom: 5px; }
                .amount-unit { font-size: 18px; text-align: center; margin-bottom: 5px; }
                .amount-numeric { font-size: 12px; text-align: center; color: #666; }
                
                .items-table { 
                    width: 100%; 
                    border-collapse: collapse; 
                    margin: 20px 0; 
                    clear: both;
                }
                .items-table th, .items-table td { 
                    border: 1px solid #000; 
                    padding: 8px; 
                    text-align: center;
                }
                .items-table th { 
                    background-color: #f0f0f0; 
                    font-weight: bold;
                }
                
                .summary-table { 
                    float: right; 
                    border-collapse: collapse; 
                    margin: 20px 0;
                }
                .summary-table th, .summary-table td { 
                    border: 1px solid #000; 
                    padding: 8px; 
                    text-align: center;
                }
                
                .remarks-section { 
                    clear: both; 
                    margin-top: 30px; 
                    display: flex; 
                    gap: 20px;
                }
                .remarks { flex: 1; }
                .remarks-label { font-weight: bold; margin-bottom: 10px; }
                .remarks-content { 
                    border: 1px solid #000; 
                    padding: 15px; 
                    min-height: 100px;
                }
                
                .bank-info { 
                    width: 300px; 
                    background-color: #f9f9f9; 
                    padding: 15px; 
                    border-radius: 8px;
                }
                .bank-label { font-weight: bold; margin-bottom: 10px; }
                .bank-details { font-size: 11px; line-height: 1.3; }
                
                .footer { 
                    clear: both; 
                    margin-top: 30px; 
                    text-align: center; 
                    font-size: 10px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="company-info">
                    <div class="company-logo">CHV</div>
                    <div class="company-details">
                        <div class="company-name">주식회사 청우환경</div>
                        <div class="company-subtitle">Cheongwoo Environment Co., Ltd.</div>
                        <div class="company-address">
                            사업자등록번호: 323-81-01027<br>
                            주소: 서울시 송파구 백제고분로 36길 12, 1층<br>
                            대표자: 심애경 | 업태: 도소매 | 업종: 과학기기, 이화학기기, 소도<br>
                            전화: 02-6952-7880 | 팩스: 02-420-2175<br>
                            이메일: cwenv.sales@gmail.com
                        </div>
                    </div>
                </div>
                
                <div class="quote-info">
                    <div class="quote-title">견적서</div>
                    <div class="quote-field">
                        <div class="quote-label">수신</div>
                        <div class="quote-value">${data.recipient}</div>
                    </div>
                    <div class="quote-field">
                        <div class="quote-label">견적번호</div>
                        <div class="quote-value">${data.quoteNumber}</div>
                    </div>
                    <div class="quote-field">
                        <div class="quote-label">견적날짜</div>
                        <div class="quote-value">${data.quoteDate}</div>
                    </div>
                    <div class="quote-field">
                        <div class="quote-label">유효기간</div>
                        <div class="quote-value">${data.validityPeriod}</div>
                    </div>
                    <div class="quote-field">
                        <div class="quote-label">납품기간</div>
                        <div class="quote-value">${data.deliveryPeriod}</div>
                    </div>
                </div>
            </div>
            
            <div class="amount-summary">
                <div class="amount-title">견적금액</div>
                <div class="amount-note">※ 부가세포함</div>
                <div class="amount-korean">${data.totalAmount < 10000 ? data.totalAmount.toLocaleString() : Math.floor(data.totalAmount / 10000) + '만'}</div>
                <div class="amount-unit">원</div>
                <div class="amount-numeric">( ${data.totalAmount.toLocaleString()} )</div>
            </div>
            
            <table class="items-table">
                <thead>
                    <tr>
                        <th style="width: 8%;">No.</th>
                        <th style="width: 20%;">제품번호</th>
                        <th style="width: 30%;">세부내용</th>
                        <th style="width: 10%;">수량</th>
                        <th style="width: 15%;">단가</th>
                        <th style="width: 15%;">금액</th>
                        <th style="width: 12%;">납기</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHTML}
                </tbody>
            </table>
            
            <table class="summary-table">
                <tbody>
                    <tr>
                        <th style="width: 80px;">공급가액</th>
                        <td style="width: 120px;">${data.supplyAmount.toLocaleString()}원</td>
                    </tr>
                    <tr>
                        <th>부가세</th>
                        <td>${data.vat.toLocaleString()}원</td>
                    </tr>
                    <tr>
                        <th>합계금액</th>
                        <td>${data.totalAmount.toLocaleString()}원</td>
                    </tr>
                </tbody>
            </table>
            
            <div class="remarks-section">
                <div class="remarks">
                    <div class="remarks-label">비고</div>
                    <div class="remarks-content">${data.remarks || ''}</div>
                </div>
                
                <div class="bank-info">
                    <div class="bank-label">결제 정보</div>
                    <div class="bank-details">
                        <strong>기업은행:</strong> 132-106361-04-016<br>
                        <strong>예금주:</strong> (주)청우환경<br><br>
                        ※ 견적서 발행 후 30일 이내 결제 부탁드립니다.
                    </div>
                </div>
            </div>
            
            <div class="footer">
                <div>주식회사 청우환경 | 사업자등록번호: 323-81-01027</div>
                <div>서울시 송파구 백제고분로 36길 12, 1층 | 전화: 02-6952-7880</div>
            </div>
            
            <div class="no-print" style="margin-top: 50px; text-align: center;">
                <button onclick="window.print()" style="padding: 10px 20px; font-size: 16px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    인쇄하기
                </button>
                <button onclick="window.close()" style="padding: 10px 20px; font-size: 16px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer; margin-left: 10px;">
                    닫기
                </button>
            </div>
        </body>
        </html>
    `;
}

// 거래명세서 폼 표시
function showTransactionForm() {
    alert('거래명세서 발행 폼을 표시합니다.');
}

// 구매요구서 테이블 렌더링
async function renderPurchaseRequestTable() {
    const tbody = document.getElementById('purchase-request-table');
    if (!tbody) return;
    
    // DB 파일 → 로컬 DB 캐시 → 로컬 임시 순으로 병합 로드
    let purchaseRequests = [];
    try {
        // 1) db/purchase_requests.json 시도
        try {
            const res = await fetch('./db/purchase_requests.json', { cache: 'no-store' });
            if (res.ok) {
                const fileRows = await res.json();
                if (Array.isArray(fileRows)) purchaseRequests = fileRows;
                console.log('파일에서 구매요구서 로드:', purchaseRequests.length, '건');
            }
        } catch { /* 파일 없으면 무시 */ }

        // 2) 로컬 스토리지 DB 버전 병합
        const dbData = localStorage.getItem('purchaseRequestsDB');
        if (dbData) {
            const cached = JSON.parse(dbData);
            purchaseRequests = mergeById(purchaseRequests, cached);
        }

        // 3) 로컬 임시 버전 병합
        const local = JSON.parse(localStorage.getItem('purchaseRequests') || '[]');
        purchaseRequests = mergeById(purchaseRequests, local);

        // 최신 병합본을 DB 캐시에 반영
        localStorage.setItem('purchaseRequestsDB', JSON.stringify(purchaseRequests));
    } catch (error) {
        console.error('데이터 로드 오류:', error);
        purchaseRequests = [];
    }
    
    tbody.innerHTML = '';
    
    if (purchaseRequests.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-8 text-gray-500">
                    <div class="py-8">
                        <div class="text-gray-500 mb-2">등록된 구매요구서가 없습니다.</div>
                        <div class="text-xs text-gray-400">"구매요구서 작성" 버튼을 클릭하여 첫 번째 구매요구서를 작성해보세요.</div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    // 최신 순으로 정렬
    purchaseRequests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    purchaseRequests.forEach(request => {
        const row = tbody.insertRow();
        const totalItems = request.items.length;
        const totalQuantity = request.items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
        const totalAmount = request.totalAmount || 0;
        
        row.innerHTML = `
            <td class="p-2">
                <div class="text-sm font-medium text-gray-900">${request.id}</div>
                <div class="text-xs text-gray-500">${new Date(request.createdAt).toLocaleDateString()}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${totalItems}개 품목</div>
                <div class="text-xs text-gray-500">총 ${totalQuantity}개</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${request.purchasingDepartment}</div>
                <div class="text-xs text-gray-500">${request.purchaseReason}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${totalAmount.toLocaleString()}원</div>
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                    작성완료
                </span>
            </td>
            <td class="p-2">
                <div class="flex space-x-2">
                    <button onclick="viewPurchaseRequest('${request.id}')" class="text-indigo-600 hover:text-indigo-900 text-sm">
                        보기
                    </button>
                    <button onclick="deletePurchaseRequest('${request.id}')" class="text-red-600 hover:text-red-900 text-sm">
                        삭제
                    </button>
                </div>
            </td>
        `;
    });
    
    console.log('구매요구서 테이블 렌더링 완료:', purchaseRequests.length, '건');
}

// 구매요구서 상세 보기 및 수정
async function viewPurchaseRequest(id) {
    let request = null;
    
    try {
        // DB 버전에서 먼저 찾기
        const dbData = localStorage.getItem('purchaseRequestsDB');
        if (dbData) {
            const dbRequests = JSON.parse(dbData);
            request = dbRequests.find(req => req.id === id);
        }
        
        // DB 버전에서 찾지 못했으면 일반 로컬 스토리지에서 찾기
        if (!request) {
            const purchaseRequests = JSON.parse(localStorage.getItem('purchaseRequests') || '[]');
            request = purchaseRequests.find(req => req.id === id);
        }
        
        if (!request) {
            alert('구매요구서를 찾을 수 없습니다.');
            return;
        }
        
        // 수정 모드로 모달 표시
        showPurchaseRequestModalForEdit(request);
        
    } catch (error) {
        console.error('구매요구서 조회 오류:', error);
        alert('구매요구서 조회 중 오류가 발생했습니다.');
    }
}

// 구매요구서 삭제
async function deletePurchaseRequest(id) {
    if (confirm('정말로 이 구매요구서를 삭제하시겠습니까?')) {
        try {
            // DB 버전에서 삭제
            let dbData = JSON.parse(localStorage.getItem('purchaseRequestsDB') || '[]');
            dbData = dbData.filter(req => req.id !== id);
            localStorage.setItem('purchaseRequestsDB', JSON.stringify(dbData));
            
            // 일반 로컬 스토리지에서도 삭제
            const purchaseRequests = JSON.parse(localStorage.getItem('purchaseRequests') || '[]');
            const filteredRequests = purchaseRequests.filter(req => req.id !== id);
            localStorage.setItem('purchaseRequests', JSON.stringify(filteredRequests));
            
            console.log('구매요구서 삭제 완료:', id);
            console.log('남은 구매요구서 수:', dbData.length);
            
            renderPurchaseRequestTable();
            alert('구매요구서가 삭제되었습니다.');
            
        } catch (error) {
            console.error('구매요구서 삭제 오류:', error);
            alert('삭제 중 오류가 발생했습니다.');
        }
    }
}

// 견적 테이블 렌더링
function renderQuoteTable() {
    const tbody = document.getElementById('quote-table');
    if (!tbody) return;
    let quotes = [];
    (async () => {
        try {
            // 1) db/quotes.json
            try {
                const res = await fetch('./db/quotes.json', { cache: 'no-store' });
                if (res.ok) {
                    const fileRows = await res.json();
                    if (Array.isArray(fileRows)) quotes = fileRows;
                    console.log('파일에서 견적서 로드:', quotes.length, '건');
                }
            } catch {}
            // 2) 로컬 DB 캐시
            const dbData = JSON.parse(localStorage.getItem('quotesDB') || '[]');
            quotes = mergeById(quotes, dbData);
            // 3) 로컬 임시
            const local = JSON.parse(localStorage.getItem('quotes') || '[]');
            quotes = mergeById(quotes, local);
            localStorage.setItem('quotesDB', JSON.stringify(quotes));
        } catch (e) {
            console.warn('견적 로드 실패:', e);
        }

        tbody.innerHTML = '';
        if (!quotes.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">등록된 견적이 없습니다.</td></tr>';
            return;
        }
        quotes.sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
        quotes.forEach(q => {
            const tr = document.createElement('tr');
            const totalQty = (q.items||[]).reduce((s,i)=> s + (parseFloat(i.quantity)||0), 0);
            tr.innerHTML = `
                <td class="p-2">
                    <div class="text-sm font-medium text-gray-900">${q.quoteNumber||q.id}</div>
                    <div class="text-xs text-gray-500">${new Date(q.createdAt||q.quoteDate||Date.now()).toLocaleDateString()}</div>
                </td>
                <td class="p-2">
                    <div class="text-sm text-gray-900">${(q.items||[]).length}개 품목</div>
                    <div class="text-xs text-gray-500">총 ${totalQty}개</div>
                </td>
                <td class="p-2">
                    <div class="text-sm text-gray-900">${q.recipient||'-'}</div>
                    <div class="text-xs text-gray-500">${q.remarks||''}</div>
                </td>
                <td class="p-2">
                    <div class="text-sm text-gray-900">${(q.totalAmount||0).toLocaleString()}원</div>
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">작성완료</span>
                </td>
                <td class="p-2">
                    <div class="flex space-x-2">
                        <button onclick="viewQuote('${q.id}')" class="text-indigo-600 hover:text-indigo-900 text-sm">보기</button>
                        <button onclick="deleteQuote('${q.id}')" class="text-red-600 hover:text-red-900 text-sm">삭제</button>
                        <button onclick="printQuoteById('${q.id}')" class="text-green-600 hover:text-green-900 text-sm">인쇄</button>
                    </div>
                </td>`;
            tbody.appendChild(tr);
        });
        console.log('견적서 테이블 렌더링 완료:', quotes.length, '건');
    })();
}

// 거래명세서 테이블 렌더링
function renderTransactionTable() {
    const tbody = document.getElementById('transaction-table');
    if (!tbody) return;
    let rows = [];
    (async () => {
        try {
            try {
                const res = await fetch('./db/order_history.json', { cache: 'no-store' });
                if (res.ok) {
                    const fileRows = await res.json();
                    if (Array.isArray(fileRows)) rows = fileRows;
                    console.log('파일에서 거래 데이터 로드:', rows.length, '건');
                }
            } catch {}
            // 병합 캐시가 필요하면 이곳에 추가
        } catch (e) { console.warn('거래 로드 실패:', e); }
        tbody.innerHTML = '';
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">표시할 데이터가 없습니다.</td></tr>';
            return;
        }
        rows.sort((a,b)=> String(b.orderDate||'').localeCompare(String(a.orderDate||'')));
        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="p-2">${r.id||r.orderNumber||'-'}</td>
                <td class="p-2">${r.supplier||'-'}</td>
                <td class="p-2">${r.productName||r.department||'-'}</td>
                <td class="p-2 text-right">${(r.quantity||r.totalAmount||0).toLocaleString()}</td>
                <td class="p-2">${r.orderDate||'-'}</td>
                <td class="p-2">
                    <button class="text-indigo-600 hover:text-indigo-900 text-sm">보기</button>
                </td>`;
            tbody.appendChild(tr);
        });
    })();
}

// 알림 장비 초기화
function initAlarmEquipment() {
    // 알림 장비 초기화 로직
}

// 알림 회계 초기화
function initAlarmAccounting() {
    // 알림 회계 초기화 로직
}

// 구매요구서 초기화
function initPurchaseRequest() {
    // 모달 강제로 숨기기
    forceHidePurchaseRequestModal();
    renderPurchaseRequestTable();
}

// 모달 강제 숨김 함수
function forceHidePurchaseRequestModal() {
    const modal = document.getElementById('purchase-request-modal');
    if (modal) {
        modal.classList.remove('show');
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

// 견적서 초기화
function initQuote() {
    // 견적서 테이블 렌더링
    renderQuoteTable();
}

// 물품 주문 내역서 초기화
function initOrderHistory() {
    // 주문 내역 탭을 기본으로 활성화
    switchOrderTab('order-history');
    
    // 각 탭의 테이블 렌더링
    renderOrderHistoryTable();
    renderOrderItemsTable();
    renderSuppliersTable();
    renderProductCatalogTable();
}

// 물품 주문 내역서 탭 전환
function switchOrderTab(tabName) {
    console.log('주문 내역서 탭 전환:', tabName);
    
    // 모든 탭 버튼 비활성화
    document.querySelectorAll('.order-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 모든 탭 콘텐츠 숨기기
    document.querySelectorAll('.order-tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    
    // 선택된 탭 버튼 활성화
    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    // 선택된 탭 콘텐츠 표시
    const activeContent = document.getElementById(`${tabName}-tab`);
    if (activeContent) {
        activeContent.classList.remove('hidden');
    }
    
    // 탭별 데이터 로드
    switch(tabName) {
        case 'order-history':
            renderOrderHistoryTable();
            break;
        case 'order-items':
            renderOrderItemsTable();
            break;
        case 'suppliers':
            renderSuppliersTable();
            break;
        case 'product-catalog':
            renderProductCatalogTable();
            break;
    }
}

// createSampleData: 사용 안함 (요청에 따라 제거)

// 물품 주문 내역서 DB 관리 시스템
// ==========================================

// 1. 주문 기본 정보 관리
// ==========================================
function createOrderHistory() {
    console.log('주문 내역서 기본 정보 생성 시작...');
    
    const orderHistory = {
        id: 'OH-' + Date.now(),
        orderNumber: 'OH-2025-001',
        orderDate: new Date().toISOString().split('T')[0],
        supplier: '청우환경',
        department: '해양분석팀',
        orderType: '정기주문',
        totalAmount: 0,
        status: '주문완료',
        remarks: 'TOC-L 소모품 정기주문',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    // DB에 저장
    saveOrderHistoryToDB(orderHistory);
    
    console.log('주문 내역서 생성 완료:', orderHistory.id);
    return orderHistory;
}

function saveOrderHistoryToDB(data) {
    try {
        let dbData = JSON.parse(localStorage.getItem('orderHistoryDB') || '[]');
        dbData.push(data);
        localStorage.setItem('orderHistoryDB', JSON.stringify(dbData));
        
        console.log('주문 내역서 DB 저장 완료:', data.id);
        console.log('총 주문 내역서 수:', dbData.length);
        
    } catch (error) {
        console.error('주문 내역서 DB 저장 오류:', error);
    }
}

// 2. 주문 품목 상세 관리
// ==========================================
function createOrderItem(orderHistoryId, itemData) {
    console.log('주문 품목 생성 시작:', itemData);
    
    const orderItem = {
        id: 'OI-' + Date.now(),
        orderHistoryId: orderHistoryId,
        productCode: itemData.productCode || 'PC-' + Date.now(),
        productName: itemData.productName,
        specification: itemData.specification,
        unit: itemData.unit || '개',
        quantity: itemData.quantity,
        unitPrice: itemData.unitPrice,
        totalPrice: itemData.quantity * itemData.unitPrice,
        supplier: itemData.supplier,
        deliveryDate: itemData.deliveryDate,
        remarks: itemData.remarks || '',
        createdAt: new Date().toISOString()
    };
    
    // DB에 저장
    saveOrderItemToDB(orderItem);
    
    console.log('주문 품목 생성 완료:', orderItem.id);
    return orderItem;
}

function saveOrderItemToDB(data) {
    try {
        let dbData = JSON.parse(localStorage.getItem('orderItemsDB') || '[]');
        dbData.push(data);
        localStorage.setItem('orderItemsDB', JSON.stringify(dbData));
        
        console.log('주문 품목 DB 저장 완료:', data.id);
        console.log('총 주문 품목 수:', dbData.length);
        
    } catch (error) {
        console.error('주문 품목 DB 저장 오류:', error);
    }
}

// 3. 공급업체 정보 관리
// ==========================================
function createSupplier(supplierData) {
    console.log('공급업체 정보 생성 시작:', supplierData);
    
    const supplier = {
        id: 'SUP-' + Date.now(),
        companyName: supplierData.companyName,
        businessNumber: supplierData.businessNumber || '',
        representative: supplierData.representative || '',
        address: supplierData.address || '',
        phone: supplierData.phone || '',
        email: supplierData.email || '',
        bankInfo: supplierData.bankInfo || '',
        accountNumber: supplierData.accountNumber || '',
        accountHolder: supplierData.accountHolder || '',
        category: supplierData.category || '일반',
        rating: supplierData.rating || 5,
        remarks: supplierData.remarks || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    // DB에 저장
    saveSupplierToDB(supplier);
    
    console.log('공급업체 정보 생성 완료:', supplier.id);
    return supplier;
}

function saveSupplierToDB(data) {
    try {
        let dbData = JSON.parse(localStorage.getItem('suppliersDB') || '[]');
        dbData.push(data);
        localStorage.setItem('suppliersDB', JSON.stringify(dbData));
        
        console.log('공급업체 DB 저장 완료:', data.id);
        console.log('총 공급업체 수:', dbData.length);
        
    } catch (error) {
        console.error('공급업체 DB 저장 오류:', error);
    }
}

// 4. 제품 카탈로그 관리
// ==========================================
function createProductCatalog(productData) {
    console.log('제품 카탈로그 생성 시작:', productData);
    
    const product = {
        id: 'PROD-' + Date.now(),
        productCode: productData.productCode || 'PC-' + Date.now(),
        productName: productData.productName,
        category: productData.category || '일반',
        specification: productData.specification,
        unit: productData.unit || '개',
        standardPrice: productData.standardPrice || 0,
        minPrice: productData.minPrice || 0,
        maxPrice: productData.maxPrice || 0,
        preferredSupplier: productData.preferredSupplier || '',
        alternativeSuppliers: productData.alternativeSuppliers || [],
        stockLevel: productData.stockLevel || 0,
        reorderPoint: productData.reorderPoint || 0,
        description: productData.description || '',
        specifications: productData.specifications || {},
        attachments: productData.attachments || [],
        status: productData.status || '활성',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    // DB에 저장
    saveProductCatalogToDB(product);
    
    console.log('제품 카탈로그 생성 완료:', product.id);
    return product;
}

function saveProductCatalogToDB(data) {
    try {
        let dbData = JSON.parse(localStorage.getItem('productCatalogDB') || '[]');
        dbData.push(data);
        localStorage.setItem('productCatalogDB', JSON.stringify(dbData));
        
        console.log('제품 카탈로그 DB 저장 완료:', data.id);
        console.log('총 제품 수:', dbData.length);
        
    } catch (error) {
        console.error('제품 카탈로그 DB 저장 오류:', error);
    }
}

// createSampleOrderData: 사용 안함 (요청에 따라 제거)

// 테이블 렌더링 함수들
// ==========================================

// 자동완성 데이터 로더 (제품/공급업체)
let __productCatalogCache = [];
let __suppliersCache = [];

async function loadOrderDBForAutocomplete() {
    try {
        // 프론트 db/ JSON에서 로드
        const [prodRes, supRes] = await Promise.all([
            fetch('db/product_catalog.json', { cache: 'no-store' }).catch(()=>null),
            fetch('db/suppliers.json', { cache: 'no-store' }).catch(()=>null),
        ]);
        __productCatalogCache = (prodRes && prodRes.ok) ? await prodRes.json() : (JSON.parse(localStorage.getItem('productCatalogDB')||'[]'));
        __suppliersCache = (supRes && supRes.ok) ? await supRes.json() : (JSON.parse(localStorage.getItem('suppliersDB')||'[]'));

        // datalist 채우기
        const nameList = document.getElementById('product-name-list');
        const specList = document.getElementById('product-spec-list');
        const supplierList = document.getElementById('supplier-list');
        if (nameList) {
            const names = [...new Set(__productCatalogCache.map(p => p.productName).filter(Boolean))].sort();
            nameList.innerHTML = names.map(n => `<option value="${n}"></option>`).join('');
        }
        if (specList) {
            const specs = [...new Set(__productCatalogCache.map(p => p.specification).filter(Boolean))].sort();
            specList.innerHTML = specs.map(s => `<option value="${s}"></option>`).join('');
        }
        if (supplierList) {
            const names = [...new Set(__suppliersCache.map(s => s.companyName).filter(Boolean))].sort();
            supplierList.innerHTML = names.map(n => `<option value="${n}"></option>`).join('');
        }
    } catch (e) {
        console.error('자동완성 DB 로드 실패:', e);
    }
}

function findBestCatalogByName(name) {
    const n = (name||'').trim();
    if (!n) return null;
    // 정확도 우선: 정확히 일치 → 포함 순
    let exact = __productCatalogCache.find(p => (p.productName||'').trim() === n);
    if (exact) return exact;
    return __productCatalogCache.find(p => (p.productName||'').includes(n)) || null;
}

function autofillItemFromCatalog({ nameInput, specInput, priceInput, supplierInput }) {
    const target = findBestCatalogByName(nameInput.value);
    if (!target) return;
    if (specInput && !specInput.value) specInput.value = target.specification || '';
    if (priceInput && (!priceInput.value || Number(priceInput.value) === 0)) priceInput.value = target.standardPrice || 0;
    if (supplierInput && !supplierInput.value) supplierInput.value = target.preferredSupplier || '';
    // 합계 갱신
    if (typeof calculateTotals === 'function') calculateTotals();
}

// 1. 주문 내역 테이블 렌더링
function renderOrderHistoryTable() {
    const tbody = document.getElementById('order-history-table');
    if (!tbody) return;
    
    // DB에서 데이터 로드
    let orderHistory = [];
    try {
        const dbData = localStorage.getItem('orderHistoryDB');
        if (dbData) {
            orderHistory = JSON.parse(dbData);
            console.log('주문 내역 데이터 로드:', orderHistory.length, '건');
        }
    } catch (error) {
        console.error('주문 내역 데이터 로드 오류:', error);
    }
    
    tbody.innerHTML = '';
    
    if (orderHistory.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-gray-500">
                    <div class="py-8">
                        <div class="text-gray-500 mb-2">등록된 주문 내역이 없습니다.</div>
                        <div class="text-xs text-gray-400">엑셀 DB 빌드 후 데이터가 표시됩니다. (npm run build:db)</div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    // 최신 순으로 정렬
    orderHistory.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));
    
    orderHistory.forEach(order => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td class="p-2">
                <div class="text-sm font-medium text-gray-900">${order.orderNumber}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${order.orderDate}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${order.supplier}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${order.department}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${order.orderType}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${order.totalAmount.toLocaleString()}원</div>
            </td>
            <td class="p-2">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                    ${order.status}
                </span>
            </td>
            <td class="p-2">
                <div class="flex space-x-2">
                    <button onclick="viewOrderHistory('${order.id}')" class="text-indigo-600 hover:text-indigo-900 text-sm">
                        보기
                    </button>
                    <button onclick="deleteOrderHistory('${order.id}')" class="text-red-600 hover:text-red-900 text-sm">
                        삭제
                    </button>
                </div>
            </td>
        `;
    });
}

// 2. 주문 품목 테이블 렌더링
function renderOrderItemsTable() {
    const tbody = document.getElementById('order-items-table');
    if (!tbody) return;
    
    // DB에서 데이터 로드
    let orderItems = [];
    try {
        const dbData = localStorage.getItem('orderItemsDB');
        if (dbData) {
            orderItems = JSON.parse(dbData);
            console.log('주문 품목 데이터 로드:', orderItems.length, '건');
        }
    } catch (error) {
        console.error('주문 품목 데이터 로드 오류:', error);
    }
    
    tbody.innerHTML = '';
    
    if (orderItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-gray-500">
                    <div class="py-8">
                        <div class="text-gray-500 mb-2">등록된 주문 품목이 없습니다.</div>
                        <div class="text-xs text-gray-400">엑셀 DB 빌드 후 데이터가 표시됩니다. (npm run build:db)</div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    // 최신 순으로 정렬
    orderItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    orderItems.forEach(item => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td class="p-2">
                <div class="text-sm font-medium text-gray-900">${item.productCode}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${item.productName}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${item.specification}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${item.quantity} ${item.unit}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${item.unitPrice.toLocaleString()}원</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${item.totalPrice.toLocaleString()}원</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${item.supplier}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${item.deliveryDate}</div>
            </td>
        `;
    });
}

// 3. 공급업체 테이블 렌더링
function renderSuppliersTable() {
    const tbody = document.getElementById('suppliers-table');
    if (!tbody) return;
    
    // DB에서 데이터 로드
    let suppliers = [];
    try {
        const dbData = localStorage.getItem('suppliersDB');
        if (dbData) {
            suppliers = JSON.parse(dbData);
            console.log('공급업체 데이터 로드:', suppliers.length, '건');
        }
    } catch (error) {
        console.error('공급업체 데이터 로드 오류:', error);
    }
    
    tbody.innerHTML = '';
    
    if (suppliers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-gray-900">
                    <div class="py-8">
                        <div class="text-gray-500 mb-2">등록된 공급업체가 없습니다.</div>
                        <div class="text-xs text-gray-400">엑셀 DB 빌드 후 데이터가 표시됩니다. (npm run build:db)</div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    // 평점 순으로 정렬
    suppliers.sort((a, b) => b.rating - a.rating);
    
    suppliers.forEach(supplier => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td class="p-2">
                <div class="text-sm font-medium text-gray-900">${supplier.companyName}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${supplier.businessNumber}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${supplier.representative}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${supplier.phone}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${supplier.email}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${supplier.category}</div>
            </td>
            <td class="p-2">
                <div class="flex items-center">
                    <span class="text-sm text-gray-900 mr-2">${supplier.rating}</span>
                    <div class="flex">
                        ${Array.from({length: 5}, (_, i) => 
                            `<svg class="w-4 h-4 ${i < supplier.rating ? 'text-yellow-400' : 'text-gray-300'}" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
                            </svg>`
                        ).join('')}
                    </div>
                </div>
            </td>
            <td class="p-2">
                <div class="flex space-x-2">
                    <button onclick="viewSupplier('${supplier.id}')" class="text-indigo-600 hover:text-indigo-900 text-sm">
                        보기
                    </button>
                    <button onclick="deleteSupplier('${supplier.id}')" class="text-red-600 hover:text-red-900 text-sm">
                        삭제
                    </button>
                </div>
                </div>
            </td>
        `;
    });
}

// 4. 제품 카탈로그 테이블 렌더링
function renderProductCatalogTable() {
    const tbody = document.getElementById('product-catalog-table');
    if (!tbody) return;
    
    // DB에서 데이터 로드
    let products = [];
    try {
        const dbData = localStorage.getItem('productCatalogDB');
        if (dbData) {
            products = JSON.parse(dbData);
            console.log('제품 카탈로그 데이터 로드:', products.length, '건');
        }
    } catch (error) {
        console.error('제품 카탈로그 데이터 로드 오류:', error);
    }
    
    tbody.innerHTML = '';
    
    if (products.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-8 text-gray-500">
                    <div class="py-8">
                        <div class="text-gray-500 mb-2">등록된 제품이 없습니다.</div>
                        <div class="text-xs text-gray-400">엑셀 DB 빌드 후 데이터가 표시됩니다. (npm run build:db)</div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    // 카테고리별로 정렬
    products.sort((a, b) => a.category.localeCompare(b.category));
    
    products.forEach(product => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td class="p-2">
                <div class="text-sm font-medium text-gray-900">${product.productCode}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${product.productName}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${product.category}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${product.specification}</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${product.standardPrice.toLocaleString()}원</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${product.minPrice.toLocaleString()}원</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${product.maxPrice.toLocaleString()}원</div>
            </td>
            <td class="p-2">
                <div class="text-sm text-gray-900">${product.preferredSupplier}</div>
            </td>
            <td class="p-2">
                <div class="flex space-x-2">
                    <button onclick="viewProduct('${product.id}')" class="text-indigo-600 hover:text-indigo-900 text-sm">
                        보기
                    </button>
                    <button onclick="deleteProduct('${product.id}')" class="text-red-600 hover:text-red-900 text-sm">
                        삭제
                    </button>
                </div>
            </td>
        `;
    });
}

// 5. 주문 내역서 폼 표시 (임시)
function showOrderHistoryForm() {
    alert('주문 내역서 작성 폼은 추후 구현 예정입니다.');
}

// 6. 조회 및 삭제 함수들 (임시)
function viewOrderHistory(id) {
    alert('주문 내역서 상세 보기는 추후 구현 예정입니다. ID: ' + id);
}

function deleteOrderHistory(id) {
    if (confirm('정말로 이 주문 내역서를 삭제하시겠습니까?')) {
        alert('주문 내역서 삭제는 추후 구현 예정입니다. ID: ' + id);
    }
}

function viewSupplier(id) {
    alert('공급업체 상세 보기는 추후 구현 예정입니다. ID: ' + id);
}

function deleteSupplier(id) {
    alert('공급업체 삭제는 추후 구현 예정입니다. ID: ' + id);
}

function viewProduct(id) {
    alert('제품 상세 보기는 추후 구현 예정입니다. ID: ' + id);
}

function deleteProduct(id) {
    if (confirm('정말로 이 제품을 삭제하시겠습니까?')) {
        alert('제품 삭제는 추후 구현 예정입니다. ID: ' + id);
    }
}

// 거래명세서 초기화
function initTransaction() {
    // 거래명세서 초기화 로직
}

// KPI 데이터 로드
function loadKPIData() {
    updateKpis();
}

// 차트 데이터 로드
function loadChartData() {
    initDashboardCharts();
}

// 장비 데이터 로드
function loadEquipmentData() {
    renderEquipmentTable();
}

// 수리 데이터 로드
function loadRepairData() {
    renderRepairTable();
}

// 교육 데이터 로드
function loadEducationData() {
    renderEducationTable();
}

// 구매요구서 데이터 로드
function loadPurchaseRequestData() {
    renderPurchaseRequestTable();
}

// 견적 데이터 로드
function loadQuoteData() {
    renderQuoteTable();
}

// 거래명세서 데이터 로드
function loadTransactionData() {
    renderTransactionTable();
}

// 모달 닫기
function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
    document.getElementById(modalId).classList.remove('flex');
}

// 장비 상세 정보 표시
function showDetail(sn) {
    const item = equipmentData.find(e => e.serial === sn || e.시리얼번호 === sn);
    if (!item) return;

    alert(`장비 상세 정보: ${sn}\n카테고리: ${item.category || item.품목계열 || '-'}\n상태: ${normalizeStatus(item.status || item.상태)}`);
}

// 장비 상태별 분포 데이터 계산
function getEquipmentStatusDistribution() {
    const statusCount = {};
    
    equipmentData.forEach(item => {
        const status = normalizeStatus(item.status);
        statusCount[status] = (statusCount[status] || 0) + 1;
    });
    
    return {
        labels: Object.keys(statusCount),
        values: Object.values(statusCount)
    };
}

// 장비 카테고리별 분포 데이터 계산
function getEquipmentCategoryDistribution() {
    const categoryCount = {};
    
    equipmentData.forEach(item => {
        const category = item.category || '기타';
        categoryCount[category] = (categoryCount[category] || 0) + 1;
    });
    
    // 상위 10개 카테고리만 표시
    const sortedCategories = Object.entries(categoryCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);
    
    return {
        labels: sortedCategories.map(([category]) => category),
        values: sortedCategories.map(([,count]) => count)
    };
}

// 수리 빈도 데이터 계산
function getRepairFrequencyData() {
    if (repairsData.length === 0) {
        return {
            labels: ['가스 분석기', '유량 측정기', '압력 센서', '기타'],
            values: [12, 8, 5, 3]
        };
    }
    
    // 실제 수리 데이터가 있으면 분석
    const categoryCount = {};
    repairsData.forEach(repair => {
        const category = repair.category || repair.품목명 || '기타';
        categoryCount[category] = (categoryCount[category] || 0) + 1;
    });
    
    const sortedCategories = Object.entries(categoryCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 6);
    
    return {
        labels: sortedCategories.map(([category]) => category),
        values: sortedCategories.map(([,count]) => count)
    };
}

// 비용 트렌드 데이터 계산
function getCostTrendData() {
    if (repairsData.length === 0) {
        return {
            labels: ['3월', '4월', '5월', '6월', '7월', '8월'],
            values: [120, 150, 90, 180, 130, 210]
        };
    }
    
    // 실제 수리 데이터가 있으면 월별 비용 분석
    const monthlyCost = {};
    repairsData.forEach(repair => {
        if (repair.date && repair.cost) {
            const month = new Date(repair.date).toLocaleDateString('ko-KR', { month: 'short' });
            monthlyCost[month] = (monthlyCost[month] || 0) + (parseFloat(repair.cost) || 0);
        }
    });
    
    const months = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
    const values = months.map(month => monthlyCost[month] || 0);
    
    return { labels: months, values };
}

// 기존 KPI 업데이트 함수 수정 (중복 제거)
function updateKpis() {
    const totalEquipment = equipmentData.length;
    const operatingEquipment = equipmentData.filter(item => 
        normalizeStatus(item.status) === '가동 중'
    ).length;
    const repairEquipment = equipmentData.filter(item => 
        normalizeStatus(item.status) === '수리 중'
    ).length;
    const idleEquipment = equipmentData.filter(item => 
        normalizeStatus(item.status) === '대기 중'
    ).length;
    
    // KPI 요소들 업데이트
    updateKpiElement('total-equipment', totalEquipment);
    updateKpiElement('operating-equipment', operatingEquipment);
    updateKpiElement('repair-equipment', repairEquipment);
    updateKpiElement('idle-equipment', idleEquipment);
    
    // 가동률 계산
    const uptimeRate = totalEquipment > 0 ? Math.round((operatingEquipment / totalEquipment) * 100) : 0;
    updateKpiElement('uptime-rate', uptimeRate + '%');
}

// 장기간 업체 입고(30일+) 알림 렌더링
function renderVendorLongStayAlerts() {
    const container = document.getElementById('vendor-longstay-alerts');
    if (!container) return;
    const today = new Date();
    const rows = (equipmentData || []).map(e => {
        const last = parseYmdSafe(e.lastMovement);
        const days = last ? Math.floor((today - last) / (1000*60*60*24)) : null;
        const isVendor = /업체/.test(String(e.currentLocation||'')) || /수리중/.test(String(e.status||''));
        return { serial: e.serial, category: e.category, currentLocation: e.currentLocation, status: e.status, days, lastStr: formatYmd(last), isVendor };
    }).filter(r => r.isVendor && (r.days !== null && r.days >= 30));

    if (!rows.length) {
        container.innerHTML = '<div class="p-4 text-slate-500 border border-slate-200 rounded">장기간 업체 입고 장비가 없습니다.</div>';
        return;
    }

    const frag = document.createDocumentFragment();
    rows.sort((a,b)=> b.days - a.days).slice(0, 50).forEach(r => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded';
        div.innerHTML = `
            <div class="flex items-center">
                <svg class="w-5 h-5 text-yellow-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <span class="text-yellow-800 font-medium">${r.serial}</span>
                <span class="ml-2 text-slate-700">${r.category || ''}</span>
                <span class="ml-3 text-slate-500">${r.currentLocation || ''} • ${r.status || ''}</span>
            </div>
            <div class="text-sm text-yellow-700">${r.days}일 경과 (최근입고: ${r.lastStr || '-'})</div>
        `;
        frag.appendChild(div);
    });
    container.innerHTML = '';
    container.appendChild(frag);
}

function parseYmdSafe(s) {
    const t = String(s||'').trim();
    if (!t) return null;
    // 허용: YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD, YYYYMMDD
    const m1 = t.match(/^(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})$/);
    if (m1) return new Date(`${m1[1]}-${m1[2]}-${m1[3]}`);
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
}

function formatYmd(d) {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
}

// 품목계열별 통계 렌더링
function renderCategoryStats() {
    console.log('🔍 renderCategoryStats 호출됨');
    console.log('🔍 equipmentData 길이:', equipmentData.length);
    
    const container = document.getElementById('category-stats-container');
    if (!container) {
        console.error('❌ category-stats-container 요소를 찾을 수 없습니다');
        return;
    }
    
    const categoryStats = getCategoryStatistics();

    // 전체 집계 카드(최상단)
    const totalEquipmentCount = equipmentData.length;
    const operatingEquipmentCount = equipmentData.filter(item => normalizeStatus(item.status) === '가동 중').length;
    const repairEquipmentCount = equipmentData.filter(item => normalizeStatus(item.status) === '수리 중').length;
    const idleEquipmentCount = equipmentData.filter(item => normalizeStatus(item.status) === '대기 중').length;
    const overallStat = {
        category: '전체',
        total: totalEquipmentCount,
        operating: operatingEquipmentCount,
        repair: repairEquipmentCount,
        idle: idleEquipmentCount
    };

    const allStats = [overallStat, ...categoryStats];

    container.innerHTML = allStats.map(stat => `
        <div class="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 cursor-pointer" 
             onclick="showCategoryDetail('${stat.category}')">
            <div class="text-center mb-3">
                <h4 class="font-medium text-slate-800">${stat.category}</h4>
                <div class="text-2xl font-bold text-slate-900 mt-1 inline-block">
                    <span class="mr-2 align-middle">현재 가동률</span>
                    ${Math.round(stat.total ? (stat.operating / stat.total) * 100 : 0)}%
                    <div class="mt-1 h-1.5 rounded ${ (stat.total ? Math.round((stat.operating / stat.total) * 100) : 0) < 20 ? 'bg-red-300' : 'bg-blue-300' }"></div>
                </div>
                <div class="text-sm text-slate-500 mt-1">총 ${stat.total}대</div>
            </div>
            <div class="grid grid-cols-3 gap-2 text-sm">
                <div class="text-center">
                    <div class="text-green-600 font-semibold">${stat.operating}</div>
                    <div class="text-xs text-slate-500">가동중</div>
                </div>
                <div class="text-center">
                    <div class="text-red-600 font-semibold">${stat.repair}</div>
                    <div class="text-xs text-slate-500">수리중</div>
                </div>
                <div class="text-center">
                    <div class="text-blue-600 font-semibold">${stat.idle}</div>
                    <div class="text-xs text-slate-500">대기중</div>
                </div>
            </div>
        </div>
    `).join('');
}

// 품목계열별 통계 계산
function getCategoryStatistics() {
    const categoryMap = {};
    
    equipmentData.forEach(item => {
        const category = item.category || '기타';
        if (!categoryMap[category]) {
            categoryMap[category] = {
                category: category,
                total: 0,
                operating: 0,
                repair: 0,
                idle: 0
            };
        }
        
        categoryMap[category].total++;
        const status = normalizeStatus(item.status);
        
        switch (status) {
            case '가동 중':
                categoryMap[category].operating++;
                break;
            case '수리 중':
                categoryMap[category].repair++;
                break;
            case '대기 중':
                categoryMap[category].idle++;
                break;
        }
    });
    
    return Object.values(categoryMap).sort((a, b) => b.total - a.total);
}

// 품목계열별 상세 정보 표시
function showCategoryDetail(category) {
    const filteredEquipment = (category === '전체') 
        ? equipmentData 
        : equipmentData.filter(item => item.category === category);
    alert(`${category} 품목계열의 상세 정보:\n총 ${filteredEquipment.length}대\n가동중: ${filteredEquipment.filter(e => normalizeStatus(e.status) === '가동 중').length}대\n수리중: ${filteredEquipment.filter(e => normalizeStatus(e.status) === '수리 중').length}대\n대기중: ${filteredEquipment.filter(e => normalizeStatus(e.status) === '대기 중').length}대`);
}

// 장비 목록 렌더링 (품목계열별 구분)
function renderEquipmentTable() {
    console.log('🔍 renderEquipmentTable 호출됨');
    console.log('🔍 equipmentData 길이:', equipmentData.length);
    
    // 품목계열별 탭 생성
    renderProductSeriesTabs();
    // 기본 탭 (전체) 선택 및 초기 목록 표시
    selectProductSeriesTab('전체');
}

// 품목계열별 탭 렌더링
function renderProductSeriesTabs() {
    const tabsContainer = document.getElementById('product-series-tabs');
    if (!tabsContainer) return;
    
    // 기존 탭 제거
    tabsContainer.innerHTML = '';
    
    // 품목계열 추출 및 정렬 (공통 스키마: category)
    const productSeries = [...new Set(equipmentData.map(e => e.category || '기타'))].sort();
    
    // 전체 탭 추가
    const allTab = document.createElement('button');
    allTab.className = 'px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium product-series-tab active';
    allTab.textContent = '전체';
    allTab.onclick = () => selectProductSeriesTab('전체');
    tabsContainer.appendChild(allTab);
    
    // 품목계열별 탭 생성
    productSeries.forEach(series => {
        if (series && series !== '기타') {
            const tab = document.createElement('button');
            tab.className = 'px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium product-series-tab hover:bg-gray-300';
            tab.textContent = series;
            tab.onclick = () => selectProductSeriesTab(series);
            tabsContainer.appendChild(tab);
        }
    });
}

// 품목계열 탭 선택
function selectProductSeriesTab(series) {
    // 모든 탭 비활성화
    document.querySelectorAll('.product-series-tab').forEach(tab => {
        tab.classList.remove('active', 'bg-blue-600', 'text-white');
        tab.classList.add('bg-gray-200', 'text-gray-700');
    });
    
    // 선택된 탭 활성화
    const activeTab = Array.from(document.querySelectorAll('.product-series-tab')).find(tab => tab.textContent === series);
    if (activeTab) {
        activeTab.classList.remove('bg-gray-200', 'text-gray-700');
        activeTab.classList.add('active', 'bg-blue-600', 'text-white');
    }
    
    // 해당 품목계열의 장비 목록 렌더링
    renderEquipmentTableBySeries(series);
}

// 품목계열별 장비 테이블 렌더링
function renderEquipmentTableBySeries(series) {
    const tableBody = document.getElementById('equipment-list-body');
    if (!tableBody) return;
    
    // 검색어와 상태 필터 적용
    const searchTerm = document.getElementById('equipment-search')?.value?.toLowerCase() || '';
    const statusFilter = document.getElementById('status-filter')?.value || 'all';
    
    let filteredData = equipmentData;
    
    // 품목계열 필터링 (category 기준)
    if (series !== '전체') {
        filteredData = filteredData.filter(item => item.category === series);
    }
    
    // 검색어 필터링 (serial/category/currentLocation 기준)
    if (searchTerm) {
        filteredData = filteredData.filter(item => 
            (item.serial && item.serial.toLowerCase().includes(searchTerm)) ||
            (item.category && item.category.toLowerCase().includes(searchTerm)) ||
            (item.currentLocation && item.currentLocation.toLowerCase().includes(searchTerm))
        );
    }
    
    // 상태 필터링 (표준화 후 비교)
    if (statusFilter !== 'all') {
        filteredData = filteredData.filter(item => 
            normalizeStatus(item.status) === statusFilter
        );
    }
    
    console.log(`🔍 ${series} 품목계열 필터링된 데이터:`, filteredData.length, '개');
    
    // 테이블 내용 생성
    tableBody.innerHTML = filteredData.map(item => {
        const mv = (movementsData || [])
            .filter(m => m.serial === item.serial && m.date)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        const util = calculateLastYearUtilization(item.serial, mv);
        return `
        <tr class="border-b hover:bg-slate-50">
            <td class="p-2 font-medium text-blue-600 truncate" title="${item.serial || ''}">${item.serial || ''}</td>
            <td class="p-2 truncate" title="${item.category || ''}">${item.category || ''}</td>
            <td class="p-2">
                <span class="px-2 py-1 text-xs rounded-full ${getStatusBadgeClass(item.status)}">
                    ${normalizeStatus(item.status)}
                </span>
            </td>
            <td class="p-2 truncate" title="${item.currentLocation || ''}">${item.currentLocation || ''}</td>
            <td class="p-2 truncate ${util.className}" title="최근 1년 가동률">${util.percent}%</td>
            <td class="p-2">
                <button type="button" class="text-indigo-600 hover:text-indigo-800 text-sm underline" onclick="showEquipmentDetailModal('${item.serial}')">
                    상세보기
                </button>
            </td>
        </tr>`;
    }).join('');
}

// 장비 상세 정보 모달 표시
function showEquipmentDetailModal(serial) {
    const equipment = equipmentData.find(item => item.serial === serial);
    if (!equipment) {
        alert('장비 정보를 찾을 수 없습니다.');
        return;
    }
    
    // 수리 이력 조회
    const repairHistory = getRepairHistory(serial);
    
    // 출장 빈도 계산
    const tripFrequency = calculateTripFrequency(serial);
    
    // QC 정보 조회
    const qcInfo = getQCInfo(serial);
    
    // 모달 내용 생성
    const modalContent = document.getElementById('equipment-detail-modal-content');
    modalContent.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- 기본 정보 -->
            <div class="space-y-4">
                <h4 class="font-semibold text-slate-700 border-b pb-2">기본 정보</h4>
                <div class="space-y-3">
                    <div class="flex justify-between">
                        <span class="text-slate-600">일련번호:</span>
                        <span class="font-medium text-slate-900">${equipment.serial || '-'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-600">품목계열:</span>
                        <span class="font-medium text-slate-900">${equipment.category || '-'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-600">현재 위치:</span>
                        <span class="font-medium text-slate-900">${equipment.currentLocation || '-'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-600">상태:</span>
                        <span class="px-2 py-1 text-xs rounded-full ${getStatusBadgeClass(equipment.status)}">
                            ${normalizeStatus(equipment.status)}
                        </span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-600">마지막 이동:</span>
                        <span class="font-medium text-slate-900">${equipment.lastMovement || '-'}</span>
                    </div>
                </div>
            </div>
            
            <!-- QC 정보 -->
            <div class="space-y-4">
                <h4 class="font-semibold text-slate-700 border-b pb-2">정도검사 정보</h4>
                <div class="space-y-3">
                    <div class="flex justify-between">
                        <span class="text-slate-600">최근 교정일:</span>
                        <span class="font-medium text-slate-900">${qcInfo.latestCalibration || '-'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-600">다음 교정일:</span>
                        <span class="font-medium ${qcInfo.nextCalibrationClass || 'text-slate-900'}">${qcInfo.nextCalibration || '-'}</span>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- 수리 이력 -->
        <div class="mt-6">
            <h4 class="font-semibold text-slate-700 border-b pb-2 mb-4">수리 이력 (최근 5건)</h4>
            ${repairHistory.repairs && repairHistory.repairs.length > 0 ? `
                <div class="space-y-2">
                    ${repairHistory.repairs.slice(0, 5).map(repair => `
                        <div class="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                            <div>
                                <span class="font-medium text-slate-900">${repair.repair_date || '-'}</span>
                                <span class="text-slate-600 ml-2">${repair.repair_type || '-'}</span>
                            </div>
                            <div class="text-right">
                                <span class="text-sm text-slate-600">${repair.repair_company || '-'}</span>
                                <span class="text-sm text-slate-500 ml-2">${repair.cost ? repair.cost.toLocaleString() + '원' : '-'}</span>
                            </div>
                        </div>
                            `).join('')}
                </div>
                ` : '<p class="text-slate-500 text-center py-4">수리 이력이 없습니다.</p>'}
        </div>
    `;
    
    // 모달 표시
    const modal = document.getElementById('equipment-detail-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// 장비 상세 정보 모달 닫기
function closeEquipmentDetailModal() {
    const modal = document.getElementById('equipment-detail-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// 정도검사 알림 렌더링 (이번달 카운트 버튼 + 펼침 상세)
function renderCalibrationAlerts() {
    const alertsContainer = document.getElementById('calibration-alerts');
    if (!alertsContainer) return;
    const today = new Date();
    const ym = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    const monthLabel = `${today.getFullYear()}년 ${String(today.getMonth() + 1)}월`;

    const rows = Array.isArray(qcLogsData) ? qcLogsData : [];
    const monthItems = rows.filter(log => {
        const dStr = log && log.next_calibration_date;
        if (!dStr) return false;
        const d = new Date(dStr);
        if (isNaN(d.getTime())) return false;
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        return key === ym;
    });

    const count = monthItems.length;
    const btnId = 'qc-month-toggle';
    const panelId = 'qc-month-details';

    // 상세 알림 카드 HTML
    const detailHtml = monthItems.map(log => {
        const nextDate = new Date(log.next_calibration_date);
        const daysUntil = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        let alertClass = 'bg-blue-50 border-blue-200';
        let iconClass = 'text-blue-500';
        let textClass = 'text-blue-800';
        if (daysUntil < 0) { alertClass = 'bg-red-50 border-red-200'; iconClass = 'text-red-500'; textClass = 'text-red-800'; }
        else if (daysUntil <= 7) { alertClass = 'bg-orange-50 border-orange-200'; iconClass = 'text-orange-500'; textClass = 'text-orange-800'; }
        else if (daysUntil <= 30) { alertClass = 'bg-yellow-50 border-yellow-200'; iconClass = 'text-yellow-500'; textClass = 'text-yellow-800'; }
        return `
            <div class="flex items-center justify-between p-4 ${alertClass} border rounded">
                <div class="flex items-center">
                    <svg class="w-5 h-5 ${iconClass} mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <div>
                        <span class="${textClass} font-medium">정도검사 예정</span>
                        <div class="text-sm text-slate-600">시리얼번호: ${log.serial_number || '-'}</div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-sm ${textClass}">${log.next_calibration_date || '-'}</div>
                    <div class="text-xs text-slate-500">${daysUntil < 0 ? '지난 날짜' : daysUntil === 0 ? '오늘' : `${daysUntil}일 남음`}</div>
                </div>
            </div>`;
    }).join('');

    alertsContainer.innerHTML = `
        <button id="${btnId}" class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700" aria-expanded="false" aria-controls="${panelId}">
            ${monthLabel} 정도검사 예정: <span class="font-semibold">${count}</span>건
        </button>
        <div id="${panelId}" class="mt-3 ${count ? '' : 'hidden'} space-y-3" role="region" aria-label="${monthLabel} 정도검사 목록">
            ${count ? detailHtml : '<div class="p-4 text-slate-500 border border-slate-200 rounded">이번 달 예정인 정도검사가 없습니다.</div>'}
        </div>
    `;

    const btn = document.getElementById(btnId);
    const panel = document.getElementById(panelId);
    if (btn && panel) {
        btn.addEventListener('click', () => {
            const isHidden = panel.classList.contains('hidden');
            if (isHidden) panel.classList.remove('hidden');
            else panel.classList.add('hidden');
            btn.setAttribute('aria-expanded', String(isHidden));
        });
    }
}

// QC 정보 조회
function getQCInfo(serial) {
    if (!qcLogsData || qcLogsData.length === 0) {
        return { latestCalibration: null, nextCalibration: null, nextCalibrationClass: '' };
    }
    
    const qcLog = qcLogsData.find(log => log.serial_number === serial);
    if (!qcLog) {
        return { latestCalibration: null, nextCalibration: null, nextCalibrationClass: '' };
    }
    
    // 다음 정도검사 예정일이 가까운지 확인 (30일 이내)
    let nextCalibrationClass = '';
    if (qcLog.next_calibration_date) {
        const nextDate = new Date(qcLog.next_calibration_date);
        const today = new Date();
        const diffTime = nextDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) {
            nextCalibrationClass = 'text-red-600 font-bold'; // 지난 경우
        } else if (diffDays <= 30) {
            nextCalibrationClass = 'text-orange-600 font-bold'; // 30일 이내
        } else if (diffDays <= 90) {
            nextCalibrationClass = 'text-yellow-600 font-bold'; // 90일 이내
        } else {
            nextCalibrationClass = 'text-green-600'; // 90일 이상
        }
    }
    
    return {
        latestCalibration: qcLog.latest_calibration_date,
        nextCalibration: qcLog.next_calibration_date,
        nextCalibrationClass: nextCalibrationClass
    };
}

// 수리 이력 조회
function getRepairHistory(serial) {
    const repairs = repairsData.filter(repair => repair.serial === serial);
    const totalRepairs = repairs.length;
    
    // 정도검사 날짜 찾기
    const calibrationRepairs = repairs.filter(repair => 
        repair.repair_type && repair.repair_type.includes('정도검사')
    );
    
    const lastCalibration = calibrationRepairs.length > 0 
        ? calibrationRepairs.sort((a, b) => new Date(b.repair_date) - new Date(a.repair_date))[0].repair_date
        : null;
    
    return {
        totalRepairs,
        lastCalibration,
        repairs: repairs.sort((a, b) => new Date(b.repair_date) - new Date(a.repair_date))
    };
}

// 출장 빈도 계산
function calculateTripFrequency(serial) {
    if (!logsData || logsData.length === 0) return 0;
    
    const equipmentLogs = logsData.filter(log => log.규격 === serial);
    
    // 청명 ↔ 현장 왕복 이동을 하나의 출장으로 계산
    let tripCount = 0;
    let hasOutbound = false;  // 청명 → 현장 이동 여부
    let hasInbound = false;   // 현장 → 청명 이동 여부
    
    equipmentLogs.forEach(log => {
        const 출고처 = log.출고창고명;
        const 입고처 = log.입고처;
        
        if (출고처 && 입고처) {
            // 청명 → 현장 이동
            if (출고처 === '청명' && 입고처 === '현장') {
                hasOutbound = true;
            }
            // 현장 → 청명 이동
            else if (출고처 === '현장' && 입고처 === '청명') {
                hasInbound = true;
            }
        }
    });
    
    // 왕복 이동이 완성되면 출장 1회로 계산
    if (hasOutbound && hasInbound) {
        tripCount = 1;
    }
    
    return tripCount;
}

// 장비 데이터에 현재위치 자동 보정 적용
function enrichEquipmentData(equipmentData, movementsData) {
    if (!Array.isArray(equipmentData) || !Array.isArray(movementsData)) {
        console.warn('장비 데이터 또는 이동 데이터가 유효하지 않습니다');
        return equipmentData;
    }

    // 일련번호별 최신 이동 기록 맵 생성
    const latestMovements = new Map();
    movementsData.forEach(movement => {
        const serial = movement.serial;
        if (!serial) return;
        
        const existing = latestMovements.get(serial);
        if (!existing || new Date(movement.date) > new Date(existing.date)) {
            latestMovements.set(serial, movement);
        }
    });

    // 장비 데이터에 현재위치 보정 적용
    return equipmentData.map(equipment => {
        if (!equipment.currentLocation || equipment.currentLocation === '본사 창고') {
            const latestMovement = latestMovements.get(equipment.serial);
            if (latestMovement) {
                // 최신 이동 기록에서 현재위치 추정
                if (latestMovement.inLocation && latestMovement.inLocation !== '') {
                    equipment.currentLocation = latestMovement.inLocation;
                } else if (latestMovement.outLocation && latestMovement.outLocation !== '') {
                    equipment.currentLocation = latestMovement.outLocation;
                }
            }
        }
        return equipment;
    });
}

// ===== 상세보기: KPI + 이동 타임라인 + 교체부품 =====
function showEquipmentDetailModal(serial) {
    if (!serial) return;

    const equipment = equipmentData.find(item => item.serial === serial);
    if (!equipment) { alert('장비 정보를 찾을 수 없습니다.'); return; }

    const movements = (movementsData || [])
        .filter(m => m.serial === serial && m.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const repairs = (repairsData || [])
        .filter(r => r.serial === serial && (r.repair_date || r.date))
        .sort((a, b) => new Date((a.repair_date || a.date)) - new Date((b.repair_date || b.date)));

    const qc = getQCInfo(serial);
    const lastMovementDate = movements.length ? movements[movements.length - 1].date : (equipment.lastMovement || null);
    const utilization = calculateLastYearUtilization(serial, movements);
    const utilizationBreakdown = calculateLastYearBreakdown(serial, movements);
    const donutCanvasId = 'utilization-donut-' + (equipment.serial || 'X').replace(/[^a-zA-Z0-9_-]/g, '_');

    const staffName = getMovementStaffName(serial, lastMovementDate);

    const timelineHTML = renderMovementTimeline(serial, movements, repairs);
    const partsHTML = renderReplacedParts(serial, repairs);

    const content = `
      <div class="w-full max-w-none bg-white rounded-lg shadow-xl overflow-y-auto"
           style="width: calc(100vw - var(--sidebar-w, 5rem)); height: calc(100vh - 2rem);">
        <div class="flex items-center justify-between px-6 py-4 border-b">
          <h2 class="text-xl font-semibold text-slate-900">장비 상세보기 - ${equipment.serial || ''}</h2>
          <button type="button" onclick="closeEquipmentDetailModal()" class="text-slate-500 hover:text-slate-700">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- 상단 KPI -->
        <div class="p-6">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="bg-slate-50 rounded-lg p-4 border">
              <div class="text-xs text-slate-500">최근 이동일</div>
              <div class="mt-1 text-lg font-semibold text-slate-900">${formatDateYmd(lastMovementDate) || '-'}${staffName ? ` <span class="text-sm text-slate-500">(${staffName})</span>` : ''}</div>
            </div>
            <div class="bg-slate-50 rounded-lg p-4 border">
              <div class="text-xs text-slate-500">정도검사 예정일</div>
              <div class="mt-1 text-lg font-semibold ${qc.nextCalibrationClass || 'text-slate-900'}">${qc.nextCalibration || '-'}</div>
            </div>
            <div class="bg-slate-50 rounded-lg p-4 border">
              <div class="text-xs text-slate-500">현재 위치</div>
              <div class="mt-1 text-lg font-semibold text-slate-900">${equipment.currentLocation || '-'}${staffName ? ` <span class=\"text-sm text-slate-500\">(${staffName})</span>` : ''}</div>
            </div>
            <div class="bg-slate-50 rounded-lg p-4 border">
              <div class="text-xs text-slate-500">최근 1년 가동률</div>
              <div class="mt-1 text-lg font-semibold ${utilization.className}">${utilization.percent}%</div>
            </div>
          </div>
        </div>

        <!-- 이동 타임라인 -->
        <div class="px-6">
          <h3 class="text-lg font-semibold text-slate-800 mb-3">이동 타임라인 (최근 1년)</h3>
          ${timelineHTML}
        </div>

        <!-- 교체 부품 + 최근 1년 가동 현황 -->
        <div class="p-6">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 class="text-lg font-semibold text-slate-800 mb-3">교체 부품/수리 항목</h3>
              ${partsHTML}
            </div>
            <div class="bg-white rounded-lg border p-4">
              <h3 class="text-lg font-semibold text-slate-800 mb-2">최근 1년 가동 현황</h3>
              <p class="text-sm text-slate-600 mb-3">영업일 기준(주말 제외) 현장 체류 비율로 산정합니다.</p>
              <div class="flex items-center justify-center">
                <canvas id="${donutCanvasId}" width="220" height="220"></canvas>
              </div>
              <div class="mt-3 text-sm text-slate-700">
                가동률 <span class="${utilization.className} font-semibold">${utilization.percent}%</span>
                (현장 ${utilizationBreakdown.siteBiz}일 / 총 ${utilizationBreakdown.totalBiz}영업일)
              </div>
              <div class="mt-2 flex gap-4 text-xs text-slate-600">
                <span class="flex items-center gap-1"><span style="display:inline-block;width:12px;height:12px;background:#3b82f6;border-radius:3px"></span>청명</span>
                <span class="flex items-center gap-1"><span style="display:inline-block;width:12px;height:12px;background:#dc2626;border-radius:3px"></span>업체</span>
                <span class="flex items-center gap-1"><span style="display:inline-block;width:12px;height:12px;background:#a78bfa;border-radius:3px"></span>현장</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const modal = document.getElementById('equipment-detail-modal');
    if (modal) {
        modal.innerHTML = content;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        // 도넛 차트 렌더링
        try { renderUtilizationDonutChart(donutCanvasId, utilizationBreakdown); } catch (e) { console.error('도넛 차트 렌더 오류:', e); }
    }
}

// 날짜 포맷 YYYY.MM.DD
function formatDateYmd(dateLike) {
    if (!dateLike) return null;
    const d = new Date(dateLike);
    if (isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${dd}`;
}

// 최근 1년 가동률 (영업일 기준: 주말 제외, 현장 체류 일수 / 총 영업일)
function calculateLastYearUtilization(serial, movements) {
    const to = new Date();
    const from = new Date(to.getFullYear() - 1, to.getMonth(), to.getDate());
    const intervals = buildLocationIntervals(serial, movements, from, to);
    const totalBiz = countBusinessDays(from, to);
    let siteBiz = 0;
    intervals.forEach(iv => {
        if (iv.type === 'site') {
            siteBiz += countBusinessDays(new Date(iv.start), new Date(iv.end));
        }
    });
    const ratio = totalBiz > 0 ? Math.round((siteBiz / totalBiz) * 100) : 0;
    return { percent: ratio, className: ratio >= 60 ? 'text-green-600' : ratio >= 30 ? 'text-orange-600' : 'text-red-600' };
}

// 최근 1년 가동 현황(청명/업체/현장) 비율 계산
function calculateLastYearBreakdown(serial, movements) {
    const to = new Date();
    const from = new Date(to.getFullYear() - 1, to.getMonth(), to.getDate());
    const intervals = buildLocationIntervals(serial, movements, from, to);
    const totalBiz = countBusinessDays(from, to);
    let siteBiz = 0, vendorBiz = 0, cmesBiz = 0;
    intervals.forEach(iv => {
        const days = countBusinessDays(new Date(iv.start), new Date(iv.end));
        if (iv.type === 'site') siteBiz += days;
        else if (iv.type === 'vendor') vendorBiz += days;
        else cmesBiz += days; // 'cmes'
    });
    return { totalBiz, siteBiz, vendorBiz, cmesBiz };
}

function renderUtilizationDonutChart(canvasId, breakdown) {
    const el = document.getElementById(canvasId);
    if (!el || !window.Chart) return;
    const data = {
        labels: ['청명', '업체', '현장'],
        datasets: [{
            data: [breakdown.cmesBiz, breakdown.vendorBiz, breakdown.siteBiz],
            backgroundColor: ['#3b82f6', '#dc2626', '#a78bfa'],
            borderWidth: 0
        }]
    };
    const options = {
        responsive: false,
        plugins: { legend: { display: true, position: 'bottom' } }
    };
    new Chart(el.getContext('2d'), { type: 'doughnut', data, options });
}

function countBusinessDays(start, end) {
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    let days = 0;
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        const wd = d.getDay();
        if (wd !== 0 && wd !== 6) days++;
    }
    return Math.max(days, 0);
}

function mapLocationType(name) {
    const str = (name || '').toString();
    if (/청명|본사|창고|CEMS|CMES|본사 창고/.test(str)) return 'cmes';
    if (/현장|출장/.test(str)) return 'site';
    return 'vendor';
}

// [start,end) 구간 리스트 생성 (from~to 범위 제한)
function buildLocationIntervals(serial, movementsAsc, from, to) {
    const result = [];
    const asc = Array.isArray(movementsAsc) ? movementsAsc : [];
    const within = asc.filter(m => new Date(m.date) >= new Date(from) && new Date(m.date) <= new Date(to));

    // from 시점의 현재 위치 추정: from 이전 마지막 이동의 inLocation, 없으면 장비 현재위치 → defaults '청명'
    let currentType = 'cmes';
    const prior = asc.filter(m => new Date(m.date) < new Date(from)).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
    if (prior && (prior.inLocation || prior.outLocation)) currentType = mapLocationType(prior.inLocation || prior.outLocation);
    else if (equipmentData) {
        const eq = equipmentData.find(e => e.serial === serial);
        if (eq && eq.currentLocation) currentType = mapLocationType(eq.currentLocation);
    }

    let cursor = new Date(from);
    within.forEach(m => {
        const md = new Date(m.date);
        if (md > cursor) {
            result.push({ start: new Date(cursor), end: new Date(md), type: currentType });
        }
        currentType = mapLocationType(m.inLocation || m.outLocation);
        cursor = new Date(md);
    });
    if (cursor < to) result.push({ start: new Date(cursor), end: new Date(to), type: currentType });

    return result;
}

// 이동 타임라인 렌더링 (최근 1년)
function renderMovementTimeline(serial, movementsAsc, repairsAsc) {
    const to = new Date();
    const from = new Date(to.getFullYear() - 1, to.getMonth(), to.getDate());
    const rangeMs = to - from;
    // 기본 구간 생성 후 동일 타입 연속 구간 병합
    const rawIntervals = buildLocationIntervals(serial, movementsAsc, from, to);
    const intervals = (function mergeConsecutive(list){
        const merged = [];
        list.forEach(iv => {
            const last = merged[merged.length - 1];
            if (last && last.type === iv.type && +new Date(iv.start) <= +new Date(last.end)) {
                // 겹치거나 연속되는 동일 타입은 확장
                last.end = new Date(Math.max(+new Date(last.end), +new Date(iv.end)));
            } else {
                merged.push({ start: new Date(iv.start), end: new Date(iv.end), type: iv.type });
            }
        });
        return merged;
    })(rawIntervals);

    function pct(date) { return ((new Date(date) - from) / rangeMs) * 100; }
    const clampPct = v => Math.max(0, Math.min(100, v));

    const monthTicks = [];
    for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d.setMonth(d.getMonth() + 1)) {
        const left = clampPct(pct(new Date(d)));
        const ym = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2,'0')}`;
        monthTicks.push(`<div class="absolute bottom-0 text-[12px] text-slate-700" style="left:${left}%; transform:translateX(-50%);">${ym}</div>`);
    }

    function vendorLabel(start, end) {
        const s = +new Date(start), e = +new Date(end);
        const hit = (repairsAsc || []).find(r => {
            const t = +new Date(r.repair_date || r.date);
            return t >= s && t <= e && ((r.repair_type && r.repair_type.includes('정도검사')) || (r.description && r.description.includes('정도검사')));
        });
        return hit ? '정도검사' : '일반수리';
    }

    const segs = intervals.map((iv, idx) => {
        const l = clampPct(pct(iv.start));
        const r = clampPct(pct(iv.end));
        const w = Math.max(0.5, r - l);
        const isVendor = iv.type === 'vendor';
        const isSite = iv.type === 'site';
        const isCmes = iv.type === 'cmes';
        const baseColor = isVendor ? '#dc2626' : (isSite ? '#a78bfa' : '#3b82f6');
        const label = isVendor ? '업체' : (isSite ? '현장' : '청명');

        // 화살표는 별도 오버레이로 렌더하므로 여기서는 비우기
        const arrowSvg = '';
        const tripLabel = '';

        const vendorBadge = isVendor ? `<div style="position:absolute;top:8px;left:50%;transform:translateX(-50%);font-size:12px;color:#fff;opacity:.95;text-shadow:0 1px 2px rgba(0,0,0,.35)">${vendorLabel(iv.start, iv.end)}</div>` : '';

        const text = w >= 4 ? `<span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-weight:800;color:#fff;font-size:${w>=12?'20px':'16px'};text-shadow:0 1px 2px rgba(0,0,0,.45)">${label}</span>` : '';

        return `
          <div style="position:absolute;left:${l}%;width:${w}%;top:10px;bottom:34px;background:${baseColor};border-radius:10px;box-shadow:0 1px 2px rgba(0,0,0,.15)">
            ${text}
            ${vendorBadge}
            ${arrowSvg}
            ${tripLabel}
          </div>`;
    }).join('');

    // ===== 출장(사이트) 오버레이: 인접한 청명 복귀 기간이 7일 이하이면 하나로 병합
    function mergeSiteWindows(intervals) {
        const merged = [];
        for (let i = 0; i < intervals.length; i++) {
            if (intervals[i].type !== 'site') continue;
            let start = new Date(intervals[i].start);
            let end = new Date(intervals[i].end);
            let j = i + 1;
            while (j + 1 < intervals.length && intervals[j].type === 'cmes' && intervals[j + 1].type === 'site') {
                const gapDays = (new Date(intervals[j].end) - new Date(intervals[j].start)) / (1000 * 60 * 60 * 24);
                if (gapDays <= 7) {
                    end = new Date(intervals[j + 1].end);
                    i = j + 1;
                    j = i + 1;
                } else {
                    break;
                }
            }
            merged.push({ start, end });
        }
        return merged;
    }

    // 하단 별도 "출장" 오버레이는 제거하고 동일 행 바에서 표시하도록 변경
    const siteArrows = '';

    // 수리/부품 수직 마커 (최근 1년 범위 내)
    const repMarkers = (() => {
      const list = (repairsAsc || [])
        .filter(r => {
          const t = +new Date(r.repair_date || r.date);
          return t >= +from && t <= +to;
        })
        .sort((a,b)=> +new Date(a.repair_date||a.date) - +new Date(b.repair_date||b.date));
      let html = '';
      let lastLeft = -999;
      let tier = 0; // 0,1,2 ...
      const threshold = 1.5; // % 단위, 가까운 시기 판단 기준
      list.forEach(r => {
        const left = clampPct(pct(new Date(r.repair_date || r.date)));
        if (Math.abs(left - lastLeft) < threshold) {
          tier = (tier + 1) % 3; // 최대 3단계 높이
        } else {
          tier = 0;
        }
        lastLeft = left;

        const arrowTop = 16 + tier * 10; // 16, 26, 36...
        const labelTop = Math.max(2, arrowTop - 12);
        const lineTop = arrowTop + 10;

        const rawDesc = (r.description || r.repair_type || '').toString();
        const partLabel = rawDesc.replace(/[\n\r\t]/g,' ').replace(/[<>]/g,'').slice(0, 24);
        const title = `${formatDateYmd(r.repair_date || r.date) || ''} / ${(r.repair_company || r.vendor || '')} / ${rawDesc} / ${r.cost ? (Number(r.cost).toLocaleString()+'원') : ''}`.replace(/"/g,'\\"');
        html += `
          <div style="position:absolute;left:${left}%;top:${labelTop}px;transform:translateX(-50%);font-size:11px;color:#ffffff;font-weight:800;text-shadow:0 1px 2px rgba(0,0,0,.35);white-space:nowrap;">${partLabel}</div>
          <div title="${title}" style="position:absolute;left:${left}%;top:${arrowTop}px;transform:translateX(-50%);pointer-events:auto">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <defs>
                <marker id="arrowhead-white" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <polygon points="0 0, 6 3, 0 6" fill="#ffffff" />
                </marker>
              </defs>
              <line x1="0" y1="6" x2="12" y2="6" stroke="#ffffff" stroke-width="2" marker-end="url(#arrowhead-white)" />
            </svg>
          </div>
          <div style="position:absolute;left:${left}%;top:${lineTop}px;bottom:22px;width:2px;background:#ffffff;opacity:.9;transform:translateX(-50%);"></div>`;
      });
      return html;
    })();

    // 범례 추가
    const legend = `
      <div class="flex items-center gap-4 mb-2">
        <div class="flex items-center gap-2 text-slate-700 text-sm"><span style="display:inline-block;width:14px;height:14px;background:#3b82f6;border-radius:3px"></span>청명</div>
        <div class="flex items-center gap-2 text-slate-700 text-sm"><span style="display:inline-block;width:14px;height:14px;background:#dc2626;border-radius:3px"></span>업체</div>
        <div class="flex items-center gap-2 text-slate-700 text-sm"><span style="display:inline-block;width:14px;height:14px;background:#a78bfa;border-radius:3px"></span>출장</div>
        <div class="flex items-center gap-2 text-slate-700 text-sm"><span style="display:inline-block;width:12px;height:12px;background:#ffffff;border:2px solid #7c3aed;border-radius:2px"></span>→ 수리 거래명세</div>
      </div>`;

    return `
      ${legend}
      <div class="relative w-full rounded-xl overflow-hidden border border-slate-200" style="height:13rem;background:#f8fafc;">
        ${segs}
        ${repMarkers}
        ${siteArrows}
        ${monthTicks.join('')}
      </div>`;
}

// 교체 부품/수리 항목 요약 (가용 데이터 기반)
function renderReplacedParts(serial, repairsAsc) {
    const rows = (repairsAsc || []).map(r => {
        const when = formatDateYmd(r.repair_date || r.date) || '-';
        const vendor = r.repair_company || r.vendor || '-';
        const desc = r.description || r.repair_type || '-';
        const cost = r.cost ? `${Number(r.cost).toLocaleString()}원` : '-';
        return { when, vendor, desc, cost };
    });

    if (rows.length === 0) {
        return '<div class="text-slate-500">교체 부품/수리 내역 데이터가 없습니다.</div>';
    }

    const items = rows.map(x => `
      <div class="flex flex-col gap-1 bg-white border rounded-md p-3 min-w-[220px]">
        <div class="text-sm font-semibold text-slate-800 truncate" title="${x.desc}">${x.desc}</div>
        <div class="text-xs text-slate-600">${x.vendor}</div>
        <div class="text-sm text-slate-900">${x.cost}</div>
        <div class="text-[11px] text-slate-500">${x.when}</div>
      </div>
    `).join('');

    return `<div class="flex gap-3 overflow-x-auto pb-1">${items}</div>`;
}

// 장비 상세정보 모달 닫기
function closeEquipmentDetailModal() {
    const modal = document.getElementById('equipment-detail-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ===== 주기별 수리 건수/비용 차트 =====
document.addEventListener('DOMContentLoaded', () => {
    const periodSel = document.getElementById('repair-period-select');
    const dimSel = document.getElementById('repair-dimension-select');
    const customBox = document.getElementById('repair-period-custom');
    const fromInput = document.getElementById('repair-date-from');
    const toInput = document.getElementById('repair-date-to');
    const filterBtn = document.getElementById('repair-filter-toggle');
    const filterPanel = document.getElementById('repair-filter-panel');
    const chips = document.getElementById('repair-filter-chips');

    const render = () => renderRepairsPeriodChart(periodSel.value, dimSel.value, {
        from: fromInput?.value || '',
        to: toInput?.value || '',
        selected: getSelectedFilterItems()
    });

    function getSelectedFilterItems() {
        const selected = [];
        chips?.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            if (cb.checked) selected.push(cb.value);
        });
        return selected;
    }
    function rebuildFilterChips() {
        if (!chips) return;
        const dim = dimSel?.value || 'overall';
        let items = [];
        if (dim === 'byVendor') items = Array.from(new Set((repairsData||[]).map(r=>r.repair_company).filter(Boolean))).sort();
        else if (dim === 'bySeries') items = Array.from(new Set((repairsData||[]).map(r=>r.product_series).filter(Boolean))).sort();
        else if (dim === 'byMeasurement') items = Array.from(new Set((repairsData||[]).map(r=>r.measurement_item).filter(Boolean))).sort();
        else items = [];
        chips.innerHTML = items.map(v => `<label class=\"px-2 py-1 border rounded flex items-center gap-1\"><input type=\"checkbox\" value=\"${v}\" checked> ${v}</label>`).join('');
        chips.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.addEventListener('change', render));
    }

    if (periodSel && dimSel) {
        periodSel.addEventListener('change', () => {
            if (customBox) customBox.classList.toggle('hidden', periodSel.value !== 'custom');
            render();
        });
        dimSel.addEventListener('change', () => { rebuildFilterChips(); render(); });
        fromInput?.addEventListener('change', render);
        toInput?.addEventListener('change', render);
        filterBtn?.addEventListener('click', ()=> { if (filterPanel) filterPanel.classList.toggle('hidden'); });
        rebuildFilterChips();
        setTimeout(render, 0);
    }
});

function renderRepairsPeriodChart(period = 'month', dimension = 'overall', opts = {}) {
    const ctx = document.getElementById('repairsPeriodChart');
    if (!ctx || !window.Chart) return;

    // 그룹 키 생성기
    const getBucketKey = (dateStr) => {
        const d = new Date(dateStr);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        if (period === 'year') return `${y}`;
        if (period === 'half') return `${y}-H${m <= 6 ? 1 : 2}`;
        if (period === 'quarter') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
        return `${y}-${String(m).padStart(2, '0')}`; // month
    };

    // 차원 그룹핑 기준
    function normalizeSeriesName(name) {
        const s = String(name || '').trim();
        const m = s.match(/^\(([^)]+)\)\s*(.+)$/);
        return (m ? m[2] : s) || '기타';
    }
    const getDimKey = (r) => {
        if (dimension === 'byVendor') return r.repair_company || '기타';
        if (dimension === 'bySeries') return normalizeSeriesName(r.equipment_category || r.product_series || r.category);
        if (dimension === 'byMeasurement') return r.measurement_item || '기타';
        return '전체';
    };

    // 집계
    const map = new Map(); // dim -> bucket -> { count, cost }
    const rows = (repairsData || []).filter(r => {
        // 기간 필터
        if (period === 'custom' && opts && (opts.from || opts.to)) {
            const t = new Date(r.repair_date || r.date);
            if (opts.from && t < new Date(opts.from)) return false;
            if (opts.to && t > new Date(opts.to)) return false;
        }
        // 항목 필터
        if (Array.isArray(opts?.selected) && opts.selected.length) {
            const key = getDimKey(r);
            if (!opts.selected.includes(key)) return false;
        }
        return true;
    });
    rows.forEach(r => {
        const date = r.repair_date || r.date;
        if (!date) return;
        const bucket = getBucketKey(date);
        const dim = getDimKey(r);
        if (!map.has(dim)) map.set(dim, new Map());
        const b = map.get(dim);
        if (!b.has(bucket)) b.set(bucket, { count: 0, cost: 0 });
        const cell = b.get(bucket);
        cell.count += 1;
        cell.cost += Number(r.cost || 0);
    });

    // 정렬된 버킷 라벨
    const buckets = Array.from(new Set(Array.from(map.values()).flatMap(b => Array.from(b.keys())))).sort();

    // 데이터셋 구성 (이상치 완화 스케일링 포함)
    const palette = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#7c3aed', '#0ea5e9'];
    const dims = Array.from(map.keys());
    function percentile(arr, p) {
        const a = arr.filter(v => Number.isFinite(v)).slice().sort((x,y)=>x-y);
        if (!a.length) return 0;
        const idx = Math.min(a.length - 1, Math.max(0, Math.floor((a.length - 1) * p)));
        return a[idx];
    }

    let datasets = [];
    let scalesConfig = {};
    let pluginsConfig = {};

    if (dimension === 'overall') {
        // 전체: 같은 버킷에 대해 건수/총비용(백만원) 동시 표기 (이중 y축)
        const b = map.get('전체') || new Map();
        const counts = buckets.map(k => (b.get(k)?.count) || 0);
        const costsRaw = buckets.map(k => (b.get(k)?.cost) || 0);
        const costsM = costsRaw.map(c => Math.round(c / 1000000));

        const clampCount = Math.max(1, percentile(counts, 0.9)) * 1.15;
        const clampCost = Math.max(1, percentile(costsM, 0.9)) * 1.15;

        datasets = [
            { label: '건수', data: counts.map(v => Math.min(v, clampCount)), backgroundColor: '#2563eb', yAxisID: 'yCount', _raw: counts, _unit: 'count' },
            { label: '총비용(백만원)', data: costsM.map(v => Math.min(v, clampCost)), backgroundColor: '#f59e0b', yAxisID: 'yCost', _raw: costsRaw, _unit: 'cost' }
        ];

        scalesConfig = {
            x: { stacked: false },
            yCount: {
                beginAtZero: true,
                suggestedMax: clampCount,
                ticks: { maxTicksLimit: 6 },
                title: { display: true, text: '건수' }
            },
            yCost: {
                beginAtZero: true,
                suggestedMax: clampCost,
                position: 'right',
                grid: { drawOnChartArea: false },
                ticks: { maxTicksLimit: 6, callback: (v)=> `${v}백만원` },
                title: { display: true, text: '비용(백만원)' }
            }
        };
        pluginsConfig = {
            legend: { position: 'bottom' },
            tooltip: {
                callbacks: {
                    label: function(ctx){
                        const ds = ctx.dataset; const i = ctx.dataIndex; const raw = (ds._raw && Number(ds._raw[i])) || 0;
                        return ds._unit === 'cost' ? `${ds.label}: ${raw.toLocaleString()}원 (${ctx.parsed.y.toLocaleString()}백만원)` : `${ds.label}: ${raw.toLocaleString()}건`;
                    }
                }
            }
        };
    } else {
        // 업체/품목/측정항목: dim 별 한 축(비용 또는 건수)
        const allMetricValues = [];
        const tmpDatasets = dims.map((dim, i) => {
            const b = map.get(dim);
            const metricValues = buckets.map(k => {
                const cell = b.get(k);
                if (!cell) return 0;
                return dimension === 'overall' ? (cell.count || 0) : Math.round((cell.cost || 0) / 1000000);
            });
            allMetricValues.push(...metricValues);
            const rawValues = buckets.map(k => {
                const cell = b.get(k) || { count: 0, cost: 0 };
                return dimension === 'overall' ? (cell.count || 0) : (cell.cost || 0);
            });
            return { label: dim, metricValues, rawValues, backgroundColor: palette[i % palette.length] };
        });
        const robustMax = Math.max(1, percentile(allMetricValues, 0.9));
        const clampMax = robustMax * 1.15;
        datasets = tmpDatasets.map(d => ({
            label: d.label,
            data: d.metricValues.map(v => Math.min(v, clampMax)),
            backgroundColor: d.backgroundColor,
            _raw: d.rawValues,
            _unit: (dimension === 'overall' ? 'count' : 'cost')
        }));
        scalesConfig = {
            x: { stacked: false },
            y: {
                beginAtZero: true,
                suggestedMax: clampMax,
                ticks: {
                    maxTicksLimit: 6,
                    callback: function(value){ return (dimension === 'overall') ? `${value}` : `${value}백만원`; }
                },
                title: { display: true, text: dimension === 'overall' ? '건수' : '비용(백만원)' }
            }
        };
        pluginsConfig = {
            legend: { position: 'bottom' },
            tooltip: {
                callbacks: {
                    label: function(ctx){
                        const ds = ctx.dataset; const i = ctx.dataIndex;
                        if (ds._unit === 'cost') { const raw = (ds._raw && Number(ds._raw[i])) || 0; return `${ds.label}: ${raw.toLocaleString()}원 (${ctx.parsed.y.toLocaleString()}백만원)`; }
                        else { const raw = (ds._raw && Number(ds._raw[i])) || 0; return `${ds.label}: ${raw.toLocaleString()}건`; }
                    }
                }
            }
        };
    }

    // 기존 차트 제거 (destroy 함수 존재 시에만)
    try {
        if (window.repairsPeriodChart && typeof window.repairsPeriodChart.destroy === 'function') {
            window.repairsPeriodChart.destroy();
        }
    } catch {}

    // 고정 높이 컨테이너 대응: 캔버스 크기 조정
    try { if (ctx && ctx.parentElement) { ctx.height = ctx.parentElement.clientHeight; } } catch {}
    window.repairsPeriodChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: buckets, datasets },
        options: { responsive: true, maintainAspectRatio: false, scales: scalesConfig, plugins: pluginsConfig }
    });
}

function getMovementStaffName(serial, lastDateLike) {
    try {
        if (!Array.isArray(staffLogsData) || staffLogsData.length === 0) return null;
        const normDate = (s) => String(s||'').slice(0,10).replace(/[\.\/]/g,'-');
        const dateStr = lastDateLike ? normDate(lastDateLike) : null;
        const normKey = (h) => h.replace(/\s/g,'').toLowerCase();
        const findCol = (obj, preds) => Object.keys(obj).find(h => preds.some(p => normKey(h).includes(p)));
        // 샘플 헤더 추정: '규격' → 일련번호, '담당자명' → 담당자
        const first = staffLogsData[0] || {};
        const serialKeyPref = Object.keys(first).find(h => /규격|serial|일련/.test(normKey(h))) || findCol(first, ['규격','serial','일련']);
        const staffKeyPref  = Object.keys(first).find(h => /담당자/.test(normKey(h))) || findCol(first, ['담당자','담당']);
        const dateKeyPref   = Object.keys(first).find(h => /일자|날짜|date|출고-/.test(normKey(h))) || findCol(first, ['일자','날짜','date','출고-']);

        const rows = staffLogsData.filter(r => {
            const sKey = serialKeyPref || findCol(r, ['규격','serial','일련']);
            if (!sKey) return false;
            return String(r[sKey]||'').trim() === String(serial).trim();
        });
        if (rows.length === 0) return null;
        const dKey = dateKeyPref || findCol(rows[0], ['date','날짜','일자','출고-','출고일']);
        const nrows = rows.map(r=>({ r, d: dKey ? new Date(r[dKey]) : new Date(0)})).sort((a,b)=> a.d - b.d);
        let picked = nrows[nrows.length-1]?.r;
        if (dateStr && dKey) {
            const hit = nrows.slice().reverse().find(x => normDate(x.r[dKey]) === dateStr);
            if (hit) picked = hit.r;
        }
        let staffKey = staffKeyPref || findCol(picked, ['담당자','담당']);
        let staff = staffKey ? String(picked[staffKey]||'').trim() : '';
        if (!staff) {
            const withStaff = nrows.slice().reverse().find(x => {
                const k = staffKeyPref || findCol(x.r, ['담당자','담당']);
                return k && String(x.r[k]||'').trim();
            });
            if (withStaff) {
                const k2 = staffKeyPref || findCol(withStaff.r, ['담당자','담당']);
                staff = String(withStaff.r[k2]||'').trim();
            }
        }
        return staff || null;
    } catch { return null; }
}