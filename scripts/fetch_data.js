// 최근 3개월간 출장 0건(청명 지하 제외) 알림
function renderLowUtilAlerts(){
    const container = document.getElementById('lowutil-alerts');
    const filtersBox = document.getElementById('lowutil-filters');
    if (!container) return;
    // 선택 상태(다중 선택) - 전역 유지
    const selectedCats = (window.__lowutilSelectedCats = window.__lowutilSelectedCats || new Set());
    // 기간 파라미터 수집
    const rangeSel = document.getElementById('lowutil-range');
    const now = new Date();
    let to = now, from = new Date(now.getFullYear(), now.getMonth()-3, now.getDate());
    if (rangeSel) {
        const v = rangeSel.value;
        if (v==='1m') from = new Date(now.getTime()-30*24*60*60*1000);
        else if (v==='3m') from = new Date(now.getFullYear(), now.getMonth()-3, now.getDate());
        else if (v==='6m') from = new Date(now.getFullYear(), now.getMonth()-6, now.getDate());
        else if (v==='1y') from = new Date(now.getFullYear()-1, now.getMonth(), now.getDate());
        else if (v==='all') from = new Date('2023-01-01T00:00:00');
        else if (v==='custom') {
            const f = document.getElementById('lowutil-from')?.value;
            const t = document.getElementById('lowutil-to')?.value;
            from = f ? new Date(f) : from;
            to = t ? new Date(t) : now;
        }
        if (from) from.setHours(0,0,0,0); if (to) to.setHours(23,59,59,999);
    }
    function mapType(name){ const s=(name||'').toString(); if (/현장|출장/.test(s)) return 'site'; if (/청명|본사|창고|CEMS|CMES|본사 창고/.test(s)) return 'cmes'; return 'vendor'; }
    function buildIntervals(moves){
        const asc = (moves||[]).filter(m=>m.date).sort((a,b)=> new Date(a.date)-new Date(b.date));
        const within = asc.filter(m => new Date(m.date) >= from && new Date(m.date) <= to);
        let cur='cmes';
        const prior = asc.filter(m=> new Date(m.date)<from).sort((a,b)=> new Date(b.date)-new Date(a.date))[0];
        if (prior && (prior.inLocation||prior.outLocation)) cur = mapType(prior.inLocation||prior.outLocation);
        let last=new Date(from); const res=[];
        within.forEach(m=>{ const next=mapType(m.inLocation||m.outLocation); res.push({start:new Date(last), end:new Date(m.date), type:cur}); cur=next; last=new Date(m.date); });
        res.push({start:new Date(last), end:new Date(to), type:cur});
        return res;
    }
    const excludeHQ = true;
    const excludeCJ = true;
    const baseRows = (equipmentData||[]).map(e=>{
        const moves = (movementsData||[]).filter(m=>m.serial===e.serial);
        const intervals = buildIntervals(moves);
        const trips = intervals.filter(iv=>iv.type==='site').length;
        return { serial:e.serial, category:e.category, currentLocation:e.currentLocation||'', status:e.status||'', trips };
    }).filter(r=> {
        if (r.trips!==0) return false;
        if (excludeCJ && /청명\s*지하/.test(r.currentLocation||'')) return false;
        if (excludeHQ && /본사\s*창고/.test(r.currentLocation||'')) return false;
        return true;
    });

    // 카테고리 필터 적용
    let rows = baseRows;
    if (selectedCats.size > 0){
        rows = baseRows.filter(r=> selectedCats.has(r.category||'기타'));
    }

    // 품목계열 토글 생성(카운트 포함)
    if (filtersBox){
        const byCat = baseRows.reduce((m,r)=>{ const k=r.category||'기타'; m.set(k,(m.get(k)||0)+1); return m; }, new Map());
        const cats = Array.from(byCat.entries()).sort((a,b)=> b[1]-a[1]);
        filtersBox.innerHTML = '';
        const allBtn = document.createElement('button');
        allBtn.className = selectedCats.size===0
            ? 'px-3 py-1.5 rounded border bg-violet-600 text-white hover:bg-violet-700'
            : 'px-3 py-1.5 rounded border bg-white text-slate-700 hover:bg-slate-50';
        allBtn.textContent = `전체 (${baseRows.length}대)`;
        allBtn.onclick = ()=> { selectedCats.clear(); renderLowUtilAlerts(); };
        filtersBox.appendChild(allBtn);
        cats.forEach(([cat,count])=>{
            const btn=document.createElement('button');
            const isActive = selectedCats.has(cat);
            btn.className = isActive
                ? 'px-3 py-1.5 rounded border bg-violet-600 text-white hover:bg-violet-700'
                : 'px-3 py-1.5 rounded border bg-white text-slate-700 hover:bg-slate-50';
            btn.textContent=`${cat} (${count}대)`;
            btn.onclick=()=> {
                if (selectedCats.has(cat)) selectedCats.delete(cat); else selectedCats.add(cat);
                renderLowUtilAlerts();
            };
            filtersBox.appendChild(btn);
        });
    }

    if (!rows.length){ container.innerHTML='<div class="p-4 text-slate-500 border border-slate-200 rounded">조건에 해당하는 장비가 없습니다.</div>'; return; }
    const frag = document.createDocumentFragment();
    rows.forEach(r=>{
        const div=document.createElement('div');
        div.className='flex items-center justify-between p-3 bg-violet-50 border border-violet-200 rounded';
        div.innerHTML=`
            <div class="flex items-center">
                <svg class="w-5 h-5 text-violet-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"/></svg>
                <span class="text-violet-800 font-medium">${r.serial}</span>
                <span class="ml-2 text-slate-700">${r.category||''}</span>
                <span class="ml-3 text-slate-500">${r.currentLocation||''} • ${r.status||''}</span>
            </div>
            <div class="flex items-center gap-2">
                <div class="text-sm text-violet-700">${(function(){
                    const sel=document.getElementById('lowutil-range');
                    const map={ '1m':'최근 1개월','3m':'최근 3개월','6m':'최근 6개월','1y':'최근 1년','all':'전체기간','custom':'지정기간' };
                    const label=sel? (map[sel.value]||'기간') : '기간';
                    return `(${label}) 동안 출장 0건`;
                })()}</div>
                <button class="px-3 py-1.5 rounded border border-violet-300 text-violet-700 hover:bg-violet-100" data-serial="${r.serial}">상세보기</button>
            </div>`;
        const btn = div.querySelector('button[data-serial]');
        if (btn) btn.onclick = ()=> { try { showEquipmentDetailModal(r.serial); } catch(e) { console.error(e); } };
        frag.appendChild(div);
    });
    container.innerHTML=''; container.appendChild(frag);
}

// 카테고리 단일 선택(하위 호환) → 상태 갱신 후 메인 렌더 호출
function renderLowUtilAlertsFilter(category){
    const selectedCats = (window.__lowutilSelectedCats = window.__lowutilSelectedCats || new Set());
    selectedCats.clear();
    if (category) selectedCats.add(category);
    renderLowUtilAlerts();
}
let equipmentData = [];
let movementsData = [];
let repairsData = [];
let logsData = [];
let qcLogsData = []; // New global variable for QC logs data
let staffLogsData = []; // 이동 담당자 로그 (CSV)
let __selectedSeries = new Set(); // 장비 목록: 품목계열 다중 선택 상태
let __utilSort = null; // null|"asc"|"desc" 최근 1년 가동률 정렬 상태
function getManufacturerByCategory(category){
    const map = (typeof window !== 'undefined' && window.__manufacturersMap) ? window.__manufacturersMap : {};
    const key = String(category || '').trim();
    if (map && map[key]) return map[key];
    // 느슨한 매칭(공백 차이/부분일치 보정)
    try {
        const keys = Object.keys(map || {});
        const found = keys.find(k => k.trim() === key || key.includes(k.trim()) || k.trim().includes(key));
        return found ? map[found] : null;
    } catch { return null; }
}

// 전역 안전 노출(초기 빈값): 인라인 스크립트가 먼저 실행될 때 ReferenceError 방지
try {
    if (typeof window !== 'undefined') {
        window.equipmentData = equipmentData;
        window.movementsData = movementsData;
        window.repairsData = repairsData;
        window.logsData = logsData;
        window.qcLogsData = qcLogsData;
        window.staffLogsData = staffLogsData;
    }
} catch {}

document.addEventListener('DOMContentLoaded', () => {
    // DataClient 사용(있으면) → 동일 인터페이스로 로딩, 없으면 기존 fetch 경로
    let dc = null;
    if (typeof window !== 'undefined') {
        const mode = (window.APP_CONFIG && window.APP_CONFIG.dataSource) || 'local';
        if (mode === 'api' && window.BackendApiClient) {
            dc = new window.BackendApiClient({ baseUrl: window.APP_CONFIG.apiBaseUrl, token: window.APP_CONFIG.apiToken, fetchImpl: fetch });
        } else if (window.DataClient) {
            // GH Pages 캐시 무효화를 위해 쿼리스트링 추가
            dc = new window.DataClient({ basePath: './db', fetch, cacheBust: `v=${Date.now()}` });
        }
    }

    const equipmentPromise = dc
        ? dc.getEquipment()
        : fetch('./db/equipment_db.json', { cache: 'no-store' })
            .then(r => r.ok ? r.json() : Promise.reject())
            .catch(() => fetch('./db/equipment_data.json', { cache: 'no-store' })
                .then(r => r.ok ? r.json() : [])
                .then(raw => Array.isArray(raw)
                    ? raw.map(row => ({
                        serial: row.시리얼번호 || row.serial || '',
                        category: row.품목계열 || row.category || '-',
                        currentLocation: row.입고처 || row.currentLocation || '-',
                        status: row.상태 || row.status || '',
                        lastMovement: row.날짜 || row.lastMovement || ''
                    })) : []
                )
            );

    const movementsPromise = dc
        ? dc.getMovements()
        : fetch(`./db/movements_db.json?v=${Date.now()}`, { cache: 'no-store' })
            .then(r => r.ok ? r.json() : [])
            .catch(() => []);

    const repairsPromise = dc
        ? dc.getRepairs()
        : fetch('./db/repairs_db_clean.json', { cache: 'no-store' })
            .then(r => r.ok ? r.json() : [])
            .catch(() => []);

    const logsFixedPromise = fetch('./청명장비 엑셀/logs_fixed.csv', { cache: 'no-store' })
        .then(r => r.ok ? r.text() : '')
        .then(text => parseCSV(text))
        .catch(() => []);

    const qcLogsPromise = dc
        ? dc.getQcLogs()
        : fetch('./db/QC_logs.json', { cache: 'no-store' })
            .then(r => r.ok ? r.json() : [])
            .catch(() => []);

    const staffLogsPromise = fetch('./청명장비 엑셀/logs_담당자명 추가.csv', { cache: 'no-store' })
        .then(r => r.ok ? r.arrayBuffer() : Promise.reject())
        .then(buf => {
            try { return new TextDecoder('euc-kr').decode(buf); } catch (e) {}
            try { return new TextDecoder('utf-8').decode(buf); } catch (e) {}
            return '';
        })
        .then(text => parseCSVAuto(text))
        .catch(() => []);

    // 추가: 최신 이동 CSV에도 '담당자명'이 포함되어 있어 병합 반영
    const staffLogsPromise2 = fetch('./청명장비 엑셀/8.29~9.23movements_logs.csv', { cache: 'no-store' })
        .then(r => r.ok
            ? r.arrayBuffer()
            : fetch('./청명장비 엑셀/8.29~9.15movements_logs.csv', { cache: 'no-store' }).then(r2 => r2.ok ? r2.arrayBuffer() : Promise.reject())
        )
        .then(buf => {
            try { return new TextDecoder('euc-kr').decode(buf); } catch (e) {}
            try { return new TextDecoder('utf-8').decode(buf); } catch (e) {}
            return '';
        })
        .then(text => parseCSVAuto(text))
        .catch(() => []);

    const manufacturersPromise = dc
        ? dc.getManufacturers()
        : fetch('./db/manufacturers.json', { cache: 'no-store' })
            .then(r => r.ok ? r.json() : {})
            .catch(() => ({}));

    Promise.all([
        equipmentPromise,
        movementsPromise,
        repairsPromise,
        logsFixedPromise,
        qcLogsPromise,
        staffLogsPromise,
        staffLogsPromise2,
        manufacturersPromise
    ])
    .then(([equipment, movements, repairs, logs, qcLogs, staffLogs, staffLogs2, manufacturers]) => {
        equipmentData = equipment;
        movementsData = movements;
        repairsData = repairs;
        logsData = logs;
        qcLogsData = qcLogs;
        // 담당자 로그 병합(구 CSV + 최신 이동 CSV)
        const a = Array.isArray(staffLogs) ? staffLogs : [];
        const b = Array.isArray(staffLogs2) ? staffLogs2 : [];
        staffLogsData = a.concat(b);
        window.__manufacturersMap = manufacturers || {};
        try {
            window.equipmentData = equipmentData;
            window.movementsData = movementsData;
            window.repairsData = repairsData;
            window.logsData = logsData;
            window.qcLogsData = qcLogsData;
            window.staffLogsData = staffLogsData;
        } catch {}
        
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
        try { window.equipmentData = equipmentData; } catch {}
        
        // LowUtil 컨트롤 바인딩
        try {
            const sel = document.getElementById('lowutil-range');
            const wrap = document.getElementById('lowutil-custom');
            const btn = document.getElementById('lowutil-query');
            const sync = () => {
                if (wrap && sel) wrap.classList.toggle('hidden', sel.value !== 'custom');
                // 기간 선택 변경 시 즉시 재렌더
                try { renderLowUtilAlerts(); } catch {}
            };
            if (sel && !sel.dataset.bound){ sel.dataset.bound='1'; sel.addEventListener('change', sync); }
            if (btn && !btn.dataset.bound){ btn.dataset.bound='1'; btn.addEventListener('click', renderLowUtilAlerts); }
            const fromEl = document.getElementById('lowutil-from');
            const toEl = document.getElementById('lowutil-to');
            if (fromEl && !fromEl.dataset.bound){ fromEl.dataset.bound='1'; fromEl.addEventListener('change', renderLowUtilAlerts); }
            if (toEl && !toEl.dataset.bound){ toEl.dataset.bound='1'; toEl.addEventListener('change', renderLowUtilAlerts); }
            const ex1 = document.getElementById('lowutil-exclude-hq');
            const ex2 = document.getElementById('lowutil-exclude-cjem');
            if (ex1 && !ex1.dataset.bound){ ex1.dataset.bound='1'; ex1.addEventListener('change', renderLowUtilAlerts); }
            if (ex2 && !ex2.dataset.bound){ ex2.dataset.bound='1'; ex2.addEventListener('change', renderLowUtilAlerts); }
            sync();
        } catch(e) { /* no-op */ }

        // QC 월 범위 선택 바인딩 (9~12월 등 변경 시 즉시 재렌더)
        try {
            const qcSel = document.getElementById('qc-range');
            if (qcSel && !qcSel.dataset.bound){
                qcSel.dataset.bound = '1';
                qcSel.addEventListener('change', () => { try { renderCalibrationAlerts(); } catch {} });
            }
        } catch {}

        // 초기화 함수들 호출
        initDashboardCharts();
        renderEquipmentTable();
        renderCategoryStats();
        updateKpis();
        renderCalibrationAlerts(); // 정도검사 알림 렌더링 추가
        renderVendorLongStayAlerts(); // 장기간 업체 입고 알림 렌더링 추가
        // 알림 탭 토글 바인딩
        try {
            const btnA = document.getElementById('alerts-toggle-longstay');
            const btnM = document.getElementById('alerts-toggle-lowutil');
            const btnB = document.getElementById('alerts-toggle-calibration');
            const btnC = document.getElementById('alerts-toggle-bottleneck');
            const paneA = document.getElementById('alerts-pane-longstay');
            const paneM = document.getElementById('alerts-pane-lowutil');
            const paneB = document.getElementById('alerts-pane-calibration');
            const paneC = document.getElementById('alerts-pane-bottleneck');
            function setActive(btn, on){ if(!btn) return; btn.classList.toggle('bg-indigo-600', on); btn.classList.toggle('text-white', on); btn.classList.toggle('bg-white', !on); btn.classList.toggle('text-slate-700', !on); btn.setAttribute('aria-pressed', String(on)); }
            function activate(which){
                const a = which==='A', m=which==='M', b=which==='B', c=which==='C';
                setActive(btnA,a); setActive(btnM,m); setActive(btnB,b); setActive(btnC,c);
                if (paneA) paneA.classList.toggle('hidden', !a);
                if (paneM) paneM.classList.toggle('hidden', !m);
                if (paneB) paneB.classList.toggle('hidden', !b);
                if (paneC) paneC.classList.toggle('hidden', !c);
                if (m) renderLowUtilAlerts();
                if (c) loadBottleneckAlerts();
            }
            if (btnA) btnA.addEventListener('click', ()=> activate('A'));
            if (btnM) btnM.addEventListener('click', ()=> activate('M'));
            if (btnB) btnB.addEventListener('click', ()=> activate('B'));
            if (btnC) btnC.addEventListener('click', ()=> activate('C'));
        } catch {}
        
        // 이동로그 CSV 업로드 핸들러 바인딩
        try {
            window.__handleMovementsCsvUpload = async function(e){
                e.preventDefault();
                const fileInput = document.getElementById('mv-upload-file');
                const rebuild = document.getElementById('mv-rebuild-stats');
                const bar = document.getElementById('mv-progress-bar');
                const text = document.getElementById('mv-progress-text');
                const log = document.getElementById('mv-upload-log');
                const btn = document.getElementById('mv-upload-btn');
                if (!fileInput || !fileInput.files || !fileInput.files[0]) return false;
                const file = fileInput.files[0];
                log.innerHTML = '';
                if (btn) { btn.disabled = true; btn.textContent = '업로드 중...'; }
                if (bar && text) { bar.style.width = '10%'; text.textContent = '10%'; }
                try {
                    const fd = new FormData(); fd.append('file', file);
                    const url = `/api/movements/upload-csv?rebuild=${rebuild && rebuild.checked ? '1' : '0'}`;
                    const resp = await fetch(url, { method:'POST', body: fd });
                    if (bar && text) { bar.style.width = '70%'; text.textContent = '70%'; }
                    if (!resp.ok) throw new Error('업로드 실패');
                    const data = await resp.json();
                    if (bar && text) { bar.style.width = '100%'; text.textContent = '100%'; }
                    const items = [
                        `파싱: ${data.parsed}건`,
                        `기존: ${data.existing}건`,
                        `추가: ${data.added}건`,
                        `총계: ${data.written}건`,
                        `통계: ${data.rebuild}`
                    ];
                    if (log) log.innerHTML = items.map(s=>`<div>${s}</div>`).join('');
                    // 최신 DB 반영 재로딩
                    try {
                        const mv = await fetch('./db/movements_db.json?v='+Date.now(), { cache:'no-store' }).then(r=>r.json());
                        window.movementsData = movementsData = Array.isArray(mv) ? mv : [];
                        // 최신화 날짜 갱신
                        const dates = (movementsData||[]).map(m=> String(m?.date||'').slice(0,10)).filter(Boolean).sort();
                        const last = dates[dates.length-1] || '';
                        const lastEl = document.getElementById('mv-last-updated');
                        if (lastEl) lastEl.textContent = `(최신화: ${last||'-'})`;
                        // 화면 갱신
                        renderEquipmentTable();
                        renderCategoryStats();
                        updateKpis();
                        try { renderLowUtilAlerts(); renderVendorLongStayAlerts(); renderCalibrationAlerts(); } catch {}
                    } catch {}
                } catch (err) {
                    if (log) log.innerHTML = `<div class="text-red-600">오류: ${err && err.message ? err.message : err}</div>`;
                } finally {
                    if (btn) { btn.disabled = false; btn.textContent = '업로드'; }
                    if (bar && text) setTimeout(()=>{ bar.style.width = '0%'; text.textContent = '0%'; }, 1000);
                }
                return false;
            };
            window.__moveBackupsToHistory = async function(){
                const log = document.getElementById('mv-upload-log');
                try{
                    const resp = await fetch('/api/movements/move-backups-to-history', { method:'POST' });
                    const data = await resp.json();
                    if (log) log.innerHTML = `<div>history 이동: ${data.moved||0}건</div>` + (log.innerHTML||'');
                }catch(e){
                    if (log) log.innerHTML = `<div class="text-red-600">이동 실패: ${e && e.message ? e.message : e}</div>` + (log.innerHTML||'');
                }
            };
        } catch (e) { /* no-op */ }
        
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
        // 네비게이션/서브메뉴 전역 안전 바인딩 보강
        try {
            window.switchView = window.switchView || switchView;
            window.switchEquipmentTab = window.switchEquipmentTab || switchEquipmentTab;
            window.toggleSubmenu = window.toggleSubmenu || toggleSubmenu;
        } catch {}

        // 제조사 매핑 커버리지 간단 점검 로그 (개발 편의용)
        try {
            const catSet = Array.from(new Set((equipmentData||[]).map(e=>e.category).filter(Boolean)));
            const miss = catSet.filter(c => !getManufacturerByCategory(c));
            if (miss.length) console.warn('제조사 미매핑 품목계열:', miss);
        } catch {}
        // 장비 현황 섹션: 최근 동기화 텍스트 비표시(요청 반영)
        try {
            const el = document.getElementById('status-last-sync');
            if (el) { el.textContent = ''; }
        } catch {}
        // 주기별 수리 차트 초기 렌더 트리거
        setTimeout(() => {
            try {
                const periodSel = document.getElementById('repair-period-select');
                const dimSel = document.getElementById('repair-dimension-select');
                if (dimSel) dimSel.dispatchEvent(new Event('change'));
                if (periodSel) periodSel.dispatchEvent(new Event('change'));
            } catch (e) { console.warn('초기 수리 차트 렌더 트리거 실패:', e); }
        }, 0);

        // 초기 로딩 시 최신화 날짜 표시
        try {
            const mvDates = (window.movementsData||[]).map(m=> String(m?.date||'').slice(0,10)).filter(Boolean).sort();
            const lastMv = mvDates[mvDates.length-1] || '';
            const lastEl = document.getElementById('mv-last-updated');
            if (lastEl) lastEl.textContent = `(최신화: ${lastMv||'-'})`;
        } catch {}
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
        try {
            if (viewName === 'uptime-predictions') {
                if (typeof loadUptimePredictions === 'function') loadUptimePredictions();
            } else if (viewName === 'business') {
                if (typeof loadBusinessContracts === 'function') loadBusinessContracts();
            }
        } catch (e) { console.warn('뷰 초기화 실패:', e); }
        
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
        try { initDashboardCharts(); } catch(e) { console.warn(e); }
        try { if (typeof updateNextWeekUptimeTable === 'function') updateNextWeekUptimeTable(); } catch(e) {}
    }
}

// 예측 근거(한국어) 설명 생성기
function getPredictionBasisTextKo(row) {
    try {
        const code = (row && row.predictionBasis) || '';
        
        // 새로운 통합 예측 방식
        if (code === 'q4_contracts_and_historical_uptime') {
            return '📊 4분기 계약 수요 + 과거 실제 가동률 종합 분석';
        }
        if (code === 'overridden_timeseries_and_historical_uptime') {
            return '✏️ 사업관리 수정 데이터 + 과거 가동률 반영';
        }
        if (code === 'timeseries_and_historical_uptime') {
            return '📈 월별 타임시리즈 + 과거 가동률 분석';
        }
        
        // 기존 방식들
        const hasContractFields = typeof row?.requiredSiteDays === 'number' && typeof row?.ownedDevices === 'number';
        if (code === 'item_sites_and_siteDays_vs_inventory' || hasContractFields) {
            return '📋 계약 지점-일 ÷ 보유장비 × 영업일수';
        }
        if (code === 'baseline_from_uptime_by_category') {
            return '📈 과거 이동로그 기반 카테고리별 평균';
        }
        
        return '📊 기본 계약 수요 대비 장비 가용성 계산';
    } catch (error) {
        return '📋 계약 기반 계산';
    }
}

// 장비 가동률 예측 화면 데이터 로더
async function loadUptimePredictions() {
    try {
        const btn = document.getElementById('btn-refresh-uptime-predictions');
        if (btn && !btn.__wired) {
            btn.addEventListener('click', () => loadUptimePredictions());
            btn.__wired = true;
        }
        const viewFilter = document.getElementById('uptime-view-mode');
        if (viewFilter && !viewFilter.__wired) {
            viewFilter.addEventListener('change', () => loadUptimePredictions());
            viewFilter.__wired = true;
        }
        const tbody = document.getElementById('uptime-predictions-table');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td class="p-2 text-slate-500" colspan="7">불러오는 중...</td></tr>';
        const client = new DataClient();
        let allRows = [];
        let dataSource = 'unknown';
        
        // 새로운 통합 예측 데이터 우선 사용
        try {
            const q4Prediction = await client._json(`${client.basePath}/stats_q4_equipment_uptime_predictions.json`);
            allRows = Array.isArray(q4Prediction?.data) ? q4Prediction.data : [];
            if (allRows.length) dataSource = 'q4_integrated';
        } catch {}
        
        // 폴백 순서 유지
        if (!allRows || !allRows.length) {
            try {
                const v2 = await client._json(`${client.basePath}/stats_equipment_uptime_predictions_v2.json`);
                allRows = Array.isArray(v2?.data) ? v2.data : [];
                if (allRows.length) dataSource = 'v2';
            } catch {}
        }
        if (!allRows || !allRows.length) {
            try {
                const v1 = await client._json(`${client.basePath}/stats_equipment_uptime_predictions.json`);
                allRows = Array.isArray(v1?.data) ? v1.data : [];
                if (allRows.length) dataSource = 'v1';
            } catch {}
        }
        if (!allRows || !allRows.length) {
            // 폴백: 기존 카테고리별 활동률
            try {
                const base = await client._json(`${client.basePath}/stats_uptime_by_category.json`);
                allRows = Array.isArray(base) ? base : (Array.isArray(base?.data) ? base.data : []);
                if (allRows.length) dataSource = 'historical_category';
            } catch {}
        }
        
        // 필터 적용 (새로운 데이터 구조 고려)
        const viewMode = document.getElementById('uptime-view-mode')?.value || 'all';
        let rows = allRows;
        if (viewMode === 'shortage') {
            if (dataSource === 'q4_integrated') {
                // 새로운 구조: 높은 활용률(90% 이상) 또는 병목 위험이 있는 항목
                rows = allRows.filter(r => (r.predictedUptimePct >= 90) || (r.bottleneckRisk === 'high') || (r.utilizationLevel === 'critical'));
            } else {
                // 기존 구조: 필요 장비 > 보유 장비
                rows = allRows.filter(r => (r.requiredDevices||0) > (r.ownedDevices||0));
            }
        } else if (viewMode === 'sufficient') {
            if (dataSource === 'q4_integrated') {
                // 새로운 구조: 낮은 활용률(70% 미만) 또는 낮은 병목 위험
                rows = allRows.filter(r => (r.predictedUptimePct < 70) && (r.bottleneckRisk !== 'high') && (r.utilizationLevel !== 'critical'));
            } else {
                // 기존 구조: 필요 장비 <= 보유 장비
                rows = allRows.filter(r => (r.requiredDevices||0) <= (r.ownedDevices||0));
            }
        }
        
        // 상단 통계 갱신 (데이터 구조별 처리)
        const total = allRows.length;
        let shortage, sufficient, shortageList;
        
        if (dataSource === 'q4_integrated') {
            // 새로운 구조: 높은 활용률 또는 병목 위험 기준
            shortage = allRows.filter(r => (r.predictedUptimePct >= 90) || (r.bottleneckRisk === 'high') || (r.utilizationLevel === 'critical')).length;
            sufficient = total - shortage;
            
            // 높은 활용률 TOP 5 렌더
            shortageList = allRows.filter(r => (r.predictedUptimePct >= 70))
                .sort((a,b) => (b.predictedUptimePct||0) - (a.predictedUptimePct||0))
                .slice(0,5);
        } else {
            // 기존 구조: 필요 vs 보유 장비 수 기준
            shortage = allRows.filter(r => (r.requiredDevices||0) > (r.ownedDevices||0)).length;
            sufficient = total - shortage;
            
            // 부족 장비 TOP 5 렌더
            shortageList = allRows.filter(r => (r.requiredDevices||0) > (r.ownedDevices||0))
                .sort((a,b) => ((b.requiredDevices||0) - (b.ownedDevices||0)) - ((a.requiredDevices||0) - (a.ownedDevices||0)))
                .slice(0,5);
        }
        
        document.getElementById('uptime-total-items').textContent = total;
        document.getElementById('uptime-shortage-items').textContent = shortage;
        document.getElementById('uptime-sufficient-items').textContent = sufficient;
        const shortageEl = document.getElementById('shortage-ranking');
        if (shortageEl) {
            shortageEl.innerHTML = shortageList.map((r,i) => {
                if (dataSource === 'q4_integrated') {
                    const uptimePct = r.predictedUptimePct || 0;
                    const riskLevel = r.bottleneckRisk || 'low';
                    const riskColor = riskLevel === 'high' ? 'red' : riskLevel === 'medium' ? 'yellow' : 'green';
                    return `<div class="flex items-center justify-between p-3 bg-${riskColor}-50 rounded">
                        <div class="flex items-center gap-3">
                            <span class="w-6 h-6 bg-${riskColor}-600 text-white rounded-full flex items-center justify-center text-xs">${i+1}</span>
                            <span class="font-medium">${r.category||r.item}</span>
                        </div>
                        <span class="text-${riskColor}-600 font-semibold">${uptimePct}% 예상</span>
                    </div>`;
                } else {
                    const shortage = (r.requiredDevices||0) - (r.ownedDevices||0);
                    return `<div class="flex items-center justify-between p-3 bg-red-50 rounded">
                        <div class="flex items-center gap-3">
                            <span class="w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center text-xs">${i+1}</span>
                            <span class="font-medium">${r.category||r.item}</span>
                        </div>
                        <span class="text-red-600 font-semibold">${shortage}대 부족</span>
                    </div>`;
                }
            }).join('') || '<div class="text-slate-500 text-center py-4">주의 항목 없음</div>';
        }
        const trHtml = (rows || []).map(r => {
            const item = r.category || 'UNKNOWN';
            
            // 새로운 데이터 구조와 기존 구조 모두 지원
            let req, reqDays, manDays, autoDays, own, pct, shortage, riskInfo;
            
            if (dataSource === 'q4_integrated') {
                // 새로운 통합 예측 구조
                req = r.q4Demand?.peakConcurrentSites ?? '';
                reqDays = r.q4Demand?.totalSiteDays ?? '';
                manDays = '';  // 새 구조에서는 분리하지 않음
                autoDays = '';
                own = r.ownedDevices ?? '';
                pct = r.predictedUptimePct ?? 0;
                shortage = Math.max(0, (req||0) - (own||0));
                riskInfo = `${r.utilizationLevel||'unknown'} (${r.bottleneckRisk||'unknown'} 위험)`;
            } else {
                // 기존 구조
                req = r.requiredDevices ?? '';
                reqDays = r.requiredSiteDays ?? '';
                manDays = r.requiredManualSiteDays ?? '';
                autoDays = r.requiredAutomaticSiteDays ?? '';
                own = r.ownedDevices ?? '';
                pct = typeof r.predictedUptimePct === 'number' ? r.predictedUptimePct : (typeof r.uptimeEstimatePct === 'number' ? r.uptimeEstimatePct : 0);
                shortage = Math.max(0, (req||0) - (own||0));
                riskInfo = shortage > 0 ? `${shortage}대 부족` : '충분';
            }
            
            const basisKo = getPredictionBasisTextKo(r);
            
            // 상태 정보 생성
            let status, statusColor;
            if (dataSource === 'q4_integrated') {
                const level = r.utilizationLevel || 'unknown';
                const risk = r.bottleneckRisk || 'low';
                if (risk === 'high' || level === 'critical') {
                    status = '⚠️ 주의';
                    statusColor = 'text-red-600';
                } else if (risk === 'medium' || level === 'high') {
                    status = '⚡ 높음';
                    statusColor = 'text-orange-600';
                } else {
                    status = '✅ 양호';
                    statusColor = 'text-green-600';
                }
            } else {
                status = shortage > 0 ? `부족 ${shortage}대` : '충분';
                statusColor = shortage > 0 ? 'text-red-600' : 'text-green-600';
            }
            
            return `<tr data-item="${item}" class="hover:bg-slate-50 cursor-pointer" onclick="openUptimePredictionDetail('${item}')">
                <td class="p-2">${item}</td>
                <td class="p-2">${req}</td>
                <td class="p-2">${reqDays}</td>
                <td class="p-2">${manDays}</td>
                <td class="p-2">${autoDays}</td>
                <td class="p-2">${own}</td>
                <td class="p-2">${pct}%</td>
                <td class="p-2 ${statusColor}">${status}</td>
                <td class="p-2 text-xs text-slate-600">${basisKo}</td>
            </tr>`;
        }).join('');
        tbody.innerHTML = trHtml || '<tr><td class="p-2 text-slate-500" colspan="7">데이터 없음</td></tr>';

        // 과거 1년 보조 통계 로드 및 렌더
        try {
            const histTbody = document.getElementById('uptime-historical-table');
            if (histTbody) {
                const client2 = new DataClient();
                const hist = await client2._json(`${client2.basePath}/stats_uptime_historical.json`);
                const histRows = Array.isArray(hist?.data) ? hist.data : [];

                // 현재 뷰 필터에 맞춰 필요한 항목만 표시(선택: 부족/충분/전체)
                let histFiltered = histRows;
                if (viewMode === 'shortage') {
                    const needMap = new Map();
                    for (const r of allRows) needMap.set(r.category, Math.max(0, (r.requiredDevices||0) - (r.ownedDevices||0)));
                    histFiltered = histRows.filter(r => (needMap.get(r.category)||0) > 0);
                } else if (viewMode === 'sufficient') {
                    const needMap = new Map();
                    for (const r of allRows) needMap.set(r.category, Math.max(0, (r.requiredDevices||0) - (r.ownedDevices||0)));
                    histFiltered = histRows.filter(r => (needMap.get(r.category)||0) === 0);
                }

                const histHtml = histFiltered.map(r => {
                    const item = r.category;
                    const p1y = r.avgUptimePct1Y ?? 0;
                    const site = r.siteDaysPct1Y ?? 0;
                    const vendor = r.vendorDaysPct1Y ?? 0;
                    const cmes = r.cmesDaysPct1Y ?? 0;
                    const trips = r.avgTrips1Y ?? 0;
                    const rtrips = r.avgRepairTrips1Y ?? 0;
                    const rlogs = r.avgRepairsLogged1Y ?? 0;
                    const cal = r.avgCalibrationsLogged1Y ?? 0;
                    return `<tr>
                        <td class="p-2">${item}</td>
                        <td class="p-2">${p1y}%</td>
                        <td class="p-2">${site}%</td>
                        <td class="p-2">${vendor}%</td>
                        <td class="p-2">${cmes}%</td>
                        <td class="p-2">${trips}</td>
                        <td class="p-2">${rtrips}</td>
                        <td class="p-2">${rlogs}</td>
                        <td class="p-2">${cal}</td>
                    </tr>`;
                }).join('');
                histTbody.innerHTML = histHtml || '<tr><td class="p-2 text-slate-500" colspan="9">데이터 없음</td></tr>';
            }
        } catch (e) {
            try {
                const histTbody = document.getElementById('uptime-historical-table');
                if (histTbody) histTbody.innerHTML = '<tr><td class="p-2 text-slate-500" colspan="9">히스토리 데이터 없음</td></tr>';
            } catch {}
        }
        // 경향(트렌드) 표 로드/필터 바인딩
        try {
            const trendBody = document.getElementById('uptime-trend-table');
            const itemSel = document.getElementById('trend-item-filter');
            const thrSel = document.getElementById('trend-overcap-threshold');
            const thrInput = document.getElementById('trend-overcap-input');
            const bufferMode = document.getElementById('trend-buffer-mode');
            if (trendBody && itemSel && thrSel) {
                const client3 = new DataClient();
                let rowsTs = [];
                // 피크(최대 동시 가동 수) 로드
                try {
                    const peaks = await client3._json(`${client3.basePath}/stats_uptime_historical_peaks.json`);
                    const map = new Map();
                    const arr = Array.isArray(peaks?.data) ? peaks.data : [];
                    for (const p of arr) map.set(p.category, { peak: Number(p.peakActiveDevices||0), date: p.peakDate||'' });
                    window.__histPeaks = map;
                } catch { window.__histPeaks = new Map(); }
                try {
                    const ts = await client3._json(`${client3.basePath}/stats_uptime_historical_timeseries.json`);
                    rowsTs = Array.isArray(ts?.data) ? ts.data : [];
                } catch {}
                // 폴백: 파일이 없으면 클라이언트에서 계산 (최근 12개월)
                if (!rowsTs.length && Array.isArray(equipmentData) && Array.isArray(movementsData)) {
                    try {
                        const normalizeItemName = (raw)=>{
                            const s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
                            if (!s) return '';
                            if (s.startsWith('PM10') || s === 'PM-10') return 'PM-10';
                            if (s.startsWith('PM2.5') || s === 'PM-2.5' || s === 'PM2_5') return 'PM-2.5';
                            if (s === 'NOX') return 'NO2';
                            if (s === 'NO2') return 'NO2';
                            if (s === 'SOX' || s === 'SO2') return 'SO2';
                            if (s === 'CO') return 'CO';
                            if (s === 'O3') return 'O3';
                            if (s === 'PB' || s === 'PB(LEAD)') return 'Pb';
                            if (raw && String(raw).includes('벤젠')) return '벤젠';
                            return raw;
                        };
                        const serialToItems = new Map();
                        const inventoryByItem = {};
                        for (const e of equipmentData) {
                            const serial = (e?.serial || '').toString().trim();
                            if (!serial) continue;
                            const cat = (e?.category || '').toString();
                            const m = cat.match(/^\(([^)]+)\)/);
                            let items = [];
                            if (m) items = m[1].split(',').map(t => normalizeItemName(t)).filter(Boolean);
                            if (!items.length) items = ['UNKNOWN'];
                            serialToItems.set(serial, items);
                            for (const it of items) inventoryByItem[it] = (inventoryByItem[it] || 0) + 1;
                        }
                        const serialToMoves = new Map();
                        for (const mv of movementsData) {
                            const serial = (mv?.serial || '').toString().trim();
                            if (!serial) continue;
                            if (!serialToMoves.has(serial)) serialToMoves.set(serial, []);
                            const date = (mv?.date || '').toString();
                            serialToMoves.get(serial).push({ date, outLocation: mv.outLocation, inLocation: mv.inLocation });
                        }
                        for (const [, list] of serialToMoves) list.sort((a,b)=> (a.date>b.date?1:a.date<b.date?-1:0));
                        const to = new Date();
                        const from = new Date(to.getFullYear(), to.getMonth()-11, 1);
                        const months = [];
                        for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d.setMonth(d.getMonth()+1)) months.push(new Date(d));
                        const bizDaysByMonth = {};
                        const monthKey = (d)=> `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                        for (const m of months) {
                            const s = new Date(m.getFullYear(), m.getMonth(), 1);
                            const e = new Date(m.getFullYear(), m.getMonth()+1, 0);
                            bizDaysByMonth[monthKey(m)] = countBusinessDays(s, e);
                        }
                        const agg = new Map(); // item -> month -> { siteDays, vendorDays, cmesDays }
                        const getEntry = (it, mk)=>{
                            if (!agg.has(it)) agg.set(it, new Map());
                            const mp = agg.get(it);
                            if (!mp.has(mk)) mp.set(mk, { siteDays: 0, vendorDays: 0, cmesDays: 0 });
                            return mp.get(mk);
                        };
                        for (const [serial, list] of serialToMoves) {
                            const itemsOf = serialToItems.get(serial) || ['UNKNOWN'];
                            // intervals from earliest month start to now
                            const start = new Date(from);
                            const end = new Date(to);
                            const intervals = buildLocationIntervals(serial, list, start, end);
                            for (const iv of intervals) {
                                for (const m of months) {
                                    const s = new Date(m.getFullYear(), m.getMonth(), 1);
                                    const e = new Date(m.getFullYear(), m.getMonth()+1, 0);
                                    const days = countBusinessDays(new Date(Math.max(+s, +iv.start)), new Date(Math.min(+e, +iv.end)));
                                    if (days <= 0) continue;
                                    const mk = monthKey(m);
                                    for (const it of itemsOf) {
                                        const entry = getEntry(it, mk);
                                        if (iv.type === 'site') entry.siteDays += days; else if (iv.type === 'vendor') entry.vendorDays += days; else entry.cmesDays += days;
                                    }
                                }
                            }
                        }
                        const out = [];
                        for (const [it, mp] of agg) {
                            for (const m of months) {
                                const mk = monthKey(m);
                                const entry = mp.get(mk) || { siteDays: 0, vendorDays: 0, cmesDays: 0 };
                                const biz = bizDaysByMonth[mk] || 0;
                                const siteAvg = biz > 0 ? Math.round((entry.siteDays / biz) * 10) / 10 : 0;
                                const owned = inventoryByItem[it] || 0;
                                const util = owned > 0 ? Math.min(100, Math.round((siteAvg / owned) * 100)) : 0;
                                out.push({ month: mk, category: it, businessDays: biz, siteDaysTotal: entry.siteDays, vendorDaysTotal: entry.vendorDays, cmesDaysTotal: entry.cmesDays, siteDeviceAvg: siteAvg, ownedDevices: owned, utilizationPct: util });
                            }
                        }
                        rowsTs = out.sort((a,b)=> a.category===b.category ? (a.month>b.month?1:-1) : (a.category>b.category?1:-1));
                    } catch (e) { console.warn('트렌드 폴백 계산 실패:', e); }
                }
                const items = Array.from(new Set(rowsTs.map(r => r.category))).sort();
                if (!itemSel.dataset.__loaded) {
                    itemSel.innerHTML = items.map(it=>`<option value="${it}">${it}</option>`).join('');
                    itemSel.dataset.__loaded = '1';
                }
                const threshold = Number((thrInput && thrInput.value) || thrSel.value || 80);
                const selected = Array.from(itemSel.selectedOptions).map(o=>o.value);
                const filterItems = selected.length ? new Set(selected) : null;
                const filtered = rowsTs.filter(r => (!filterItems || filterItems.has(r.category)));
                const view = filtered.map(r => {
                    const util = Number(r.utilizationPct||0);
                    const status = util >= threshold ? `<span class=\"text-red-600\">과부하</span>` : `<span class=\"text-green-600\">여유</span>`;
                    const displayMetric = (bufferMode && bufferMode.checked) ? `${Math.max(0, 100 - util)}%` : `${util}%`;
                    const peakInfo = (window.__histPeaks && window.__histPeaks.get(r.category)) || null;
                    const peakStr = peakInfo ? `${peakInfo.peak}(${peakInfo.date})` : '-';
                    return `<tr>
                        <td class=\"p-2\">${r.month}</td>
                        <td class=\"p-2\">${r.category}</td>
                        <td class=\"p-2\">${r.siteDaysTotal}</td>
                        <td class=\"p-2\">${r.ownedDevices}</td>
                        <td class=\"p-2\">${r.siteDeviceAvg}</td>
                        <td class=\"p-2\">${displayMetric}</td>
                        <td class=\"p-2\">${peakStr}</td>
                        <td class=\"p-2\">${status}</td>
                    </tr>`;
                }).join('');
                trendBody.innerHTML = view || '<tr><td class="p-2 text-slate-500" colspan="8">데이터 없음</td></tr>';
                if (thrSel && !thrSel.__bound) { thrSel.addEventListener('change', () => loadUptimePredictions()); thrSel.__bound = true; }
                if (thrInput && !thrInput.__bound) { thrInput.addEventListener('change', () => loadUptimePredictions()); thrInput.__bound = true; }
                if (!itemSel.__bound) {
                    itemSel.addEventListener('change', () => loadUptimePredictions());
                    itemSel.__bound = true;
                }
                if (bufferMode && !bufferMode.__bound) { bufferMode.addEventListener('change', () => loadUptimePredictions()); bufferMode.__bound = true; }

                // 차트: 스파크라인(막대 제거)
                try {
                    const sparkCtx = document.getElementById('trend-sparkline')?.getContext('2d');
                    if (sparkCtx && window.Chart) {
                        // 최대 가동 장비 수 계산 (predictions v2 우선, 폴백 equipment)
                        let maxOperating = 0;
                        try {
                            const clientMax = new DataClient();
                            const v2 = await clientMax._json(`${clientMax.basePath}/stats_equipment_uptime_predictions_v2.json`);
                            const arr = Array.isArray(v2?.data) ? v2.data : [];
                            if (arr.length) maxOperating = arr.reduce((acc, x)=> acc + Number(x.ownedDevices||0), 0);
                            if (!maxOperating) {
                                const eq = await clientMax.getEquipment();
                                maxOperating = Array.isArray(eq) ? eq.length : 0;
                            }
                        } catch {}
                        try { const el = document.getElementById('trend-max-operating'); if (el) el.textContent = maxOperating ? `최대 가동 장비 수: ${maxOperating}` : ''; } catch {}

                        const months = Array.from(new Set(filtered.map(r => r.month))).sort();
                        const seriesByItem = {};
                        (filterItems ? Array.from(filterItems) : items.slice(0, 6)).forEach(it => { seriesByItem[it] = months.map(m => {
                            const arr = filtered.filter(r => r.month===m && r.category === it);
                            const avg = arr.length ? Math.round(arr.reduce((a,b)=> a + Number(b.utilizationPct||0), 0) / arr.length) : 0;
                            return (bufferMode && bufferMode.checked) ? Math.max(0, 100 - avg) : avg;
                        }); });

                        window._trendCharts = window._trendCharts || {};
                        const borderColor = (bufferMode && bufferMode.checked) ? '#0ea5e9' : '#3b82f6';
                        const bgColor = (bufferMode && bufferMode.checked) ? 'rgba(14,165,233,0.25)' : 'rgba(59,130,246,0.25)';

                        // destroy prev
                        try { window._trendCharts.spark && window._trendCharts.spark.destroy(); } catch {}

                        const palette = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#06b6d4','#84cc16'];
                        const datasetsLine = Object.keys(seriesByItem).map((it, idx)=> ({
                            label: it,
                            data: seriesByItem[it],
                            borderColor: palette[idx % palette.length],
                            backgroundColor: (bufferMode && bufferMode.checked) ? 'rgba(14,165,233,0.15)' : 'rgba(59,130,246,0.15)',
                            fill: true,
                            tension: 0.35,
                            pointRadius: 0,
                            pointHoverRadius: 2
                        }));
                        window._trendCharts.spark = new Chart(sparkCtx, {
                            type: 'line',
                            data: { labels: months, datasets: datasetsLine },
                            options: {
                                responsive: false,
                                plugins: {
                                    legend: { display: true, position: 'bottom' },
                                    tooltip: { enabled: true, callbacks: { label: (ctx)=> `${ctx.dataset.label}: ${ctx.parsed.y}%` } }
                                },
                                elements: { line: { borderWidth: 1.5 } },
                                scales: { y: { display: false }, x: { display: false } }
                            }
                        });
                    }
                } catch {}
            }
        } catch (e) {
            // 무시
        }

        // Q4 계약 기반 월간 요구량 vs 용량 테이블 + 차트
        try {
            const bizBody = document.getElementById('biz-month-table');
            const itemSel2 = document.getElementById('biz-item-filter');
            const thrSel2 = document.getElementById('biz-overcap-threshold');
            const thrInput2 = document.getElementById('biz-overcap-input');
            const bufferMode2 = document.getElementById('biz-buffer-mode');
            if (bizBody && itemSel2 && thrSel2) {
                const client4 = new DataClient();
                let rowsBiz = [];
                try {
                    const tsBiz = await client4._json(`${client4.basePath}/stats_business_item_timeseries_q4_2025.json`);
                    rowsBiz = Array.isArray(tsBiz?.data) ? tsBiz.data : [];
                } catch {}
                const predV2 = await client4._json(`${client4.basePath}/stats_equipment_uptime_predictions_v2.json`);
                const predRows = Array.isArray(predV2?.data) ? predV2.data : [];
                // inventory by item from predictions v2 (ownedDevices)
                const inv = new Map();
                for (const p of predRows) inv.set(p.category, Number(p.ownedDevices||0));

                // 캘린더 동기화 오버레이로 완료된 사업 제외(남은 물량 추정)
                let completionByProject = new Map();
                try {
                    const ov = await client4._json(`${client4.basePath}/backend_business_calendar_sync.json`);
                    const items = Array.isArray(ov?.items) ? ov.items : [];
                    const norm = (s)=> String(s||'').toLowerCase().replace(/[\s\t\n\r]+/g,'').replace(/[\-_/.,()\[\]{}<>~!@#$%^&*`'"|\\:;]+/g,'').trim();
                    for (const it of items){
                        const key = it.businessId || norm(it.projectTitle);
                        if (!key) continue;
                        const prev = completionByProject.get(key);
                        if (!prev || String(it.completedAt||'') > String(prev.completedAt||'')) completionByProject.set(key, { completedAt: it.completedAt });
                    }
                } catch {}

                const items = rowsBiz.length ? Array.from(new Set(rowsBiz.map(r => r.category))).sort() : Array.from(inv.keys()).sort();
                if (!itemSel2.dataset.__loaded) {
                    itemSel2.innerHTML = items.map(it=>`<option value="${it}">${it}</option>`).join('');
                    itemSel2.dataset.__loaded = '1';
                }

                const selected2 = Array.from(itemSel2.selectedOptions).map(o=>o.value);
                const filterItems2 = selected2.length ? new Set(selected2) : null;
                const threshold2 = Number((thrInput2 && thrInput2.value) || thrSel2.value || 80);
                const filtered2 = rowsBiz.filter(r => (!filterItems2 || filterItems2.has(r.category)));

                // 월 영업일 계산(예측 v2 메타에 없으므로 간단 계산)
                function countBizMonth(ym) {
                    const [y,m] = ym.split('-').map(Number);
                    const s = new Date(y, m-1, 1), e = new Date(y, m, 0);
                    let cnt=0; for (let d=new Date(s); d<=e; d.setDate(d.getDate()+1)) { const wd=d.getDay(); if (wd!==0 && wd!==6) cnt++; }
                    return cnt;
                }

                const grouped = new Map(); // key: month|category -> { required, requiredManual, requiredAuto, capacity, utilizationPct, _projects, remaining }
                if (filtered2.length) {
                    for (const r of filtered2) {
                        const key = r.month + '|' + r.category;
                        const own = inv.get(r.category) || 0;
                        const bizDays = countBizMonth(r.month);
                        const capacity = own * bizDays;
                        const utilization = capacity>0 ? Math.min(100, Math.round((Number(r.requiredSiteDays||0)/capacity)*100)) : 0;
                        const entry = grouped.get(key) || { month: r.month, category: r.category, required: 0, requiredManual: 0, requiredAuto: 0, capacity, utilizationPct: utilization, _projects: [], remaining: 0 };
                        const thisReq = Number(r.requiredSiteDays||0);
                        const thisReqMan = Number(r.requiredManualSiteDays||0);
                        const thisReqAuto = Number(r.requiredAutomaticSiteDays||0);
                        entry.required += thisReq;
                        entry.requiredManual += thisReqMan;
                        entry.requiredAuto += thisReqAuto;
                        // 남은 물량 계산: 완료된 사업 제외
                        let remainThis = thisReq;
                        try {
                            const norm = (s)=> String(s||'').toLowerCase().replace(/[\s\t\n\r]+/g,'').replace(/[\-_/.,()\[\]{}<>~!@#$%^&*`'"|\\:;]+/g,'').trim();
                            const key1 = r.projectId || norm(r.projectName);
                            const comp = completionByProject.get(key1);
                            if (comp && comp.completedAt){
                                // 완료 월 포함 이후의 물량은 0으로 간주(보수적)
                                const [yy,mm] = r.month.split('-').map(Number);
                                const endMonth = new Date(yy, mm, 0);
                                const compDate = new Date(comp.completedAt + 'T23:59:59');
                                if (compDate <= endMonth) remainThis = 0;
                            }
                        } catch {}
                        entry.remaining += Math.max(0, remainThis);
                        entry._projects.push({ projectName: r.projectName, client: r.client, requiredSiteDays: thisReq });
                        grouped.set(key, entry);
                    }
                } else {
                    // 데이터 파일이 없을 때 기본 months(10~12)로 빈 구조라도 표시
                    const months = ['2025-10','2025-11','2025-12'];
                    const items2 = filterItems2 ? Array.from(filterItems2) : items.slice(0,6);
                    for (const m of months) {
                        for (const it of items2) {
                            const own = inv.get(it) || 0;
                            const bizDays = countBizMonth(m);
                            const capacity = own * bizDays;
                            const key = m + '|' + it;
                            grouped.set(key, { month: m, category: it, required: 0, capacity, utilizationPct: 0, _projects: [] });
                        }
                    }
                }
                const view = Array.from(grouped.values()).map(v => {
                    const util = v.capacity>0 ? Math.min(100, Math.round((Number(v.remaining||0)/v.capacity)*100)) : 0;
                    const status = util >= threshold2 ? `<span class=\"text-red-600\">과부하</span>` : `<span class=\"text-green-600\">여유</span>`;
                    const metric = (bufferMode2 && bufferMode2.checked) ? `${Math.max(0, 100 - util)}%` : `${util}%`;
                    const top3 = v._projects.sort((a,b)=> b.requiredSiteDays - a.requiredSiteDays).slice(0,3).map(x=> `${x.projectName||''}(${x.requiredSiteDays})`).join(', ');
                    return `<tr>
                        <td class=\"p-2\">${v.month}</td>
                        <td class=\"p-2\">${v.category}</td>
                        <td class=\"p-2\">${v.remaining||0}</td>
                        <td class=\"p-2\">${v.capacity}</td>
                        <td class=\"p-2\">${metric}</td>
                        <td class=\"p-2\">${status}</td>
                        <td class=\"p-2\">${top3 || '-'}</td>
                    </tr>`;
                }).join('');
                bizBody.innerHTML = view || '<tr><td class="p-2 text-slate-500" colspan="7">데이터 없음</td></tr>';
                if (!thrSel2.__bound) { thrSel2.addEventListener('change', () => loadUptimePredictions()); thrSel2.__bound = true; }
                if (thrInput2 && !thrInput2.__bound) { thrInput2.addEventListener('change', () => loadUptimePredictions()); thrInput2.__bound = true; }
                if (!itemSel2.__bound) { itemSel2.addEventListener('change', () => loadUptimePredictions()); itemSel2.__bound = true; }
                if (bufferMode2 && !bufferMode2.__bound) { bufferMode2.addEventListener('change', () => loadUptimePredictions()); bufferMode2.__bound = true; }

                // 차트(스파크라인만 표시, 막대 제거)
                try {
                    const sparkBiz = document.getElementById('biz-sparkline')?.getContext('2d');
                    if (sparkBiz && window.Chart) {
                        const months = Array.from(new Set(filtered2.map(r => r.month))).sort();
                        const items2 = filterItems2 ? Array.from(filterItems2) : items.slice(0,6);
                        const seriesByItem = Object.fromEntries(items2.map(it => [it, months.map(m => {
                            const rows = Array.from(grouped.values()).filter(v => v.month===m && v.category===it);
                            const avg = rows.length ? Math.round(rows.reduce((a,b)=> a + (b.capacity>0? Math.min(100, Math.round((Number(b.remaining||0)/b.capacity)*100)) : 0), 0) / rows.length) : 0;
                            return (bufferMode2 && bufferMode2.checked) ? Math.max(0, 100 - avg) : avg;
                        })]));
                        const palette = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#06b6d4','#84cc16'];
                        const datasetsLine = Object.keys(seriesByItem).map((it, idx)=> ({ label: it, data: seriesByItem[it], borderColor: palette[idx%palette.length], backgroundColor: 'rgba(59,130,246,0.15)', fill: true, tension: 0.35, pointRadius: 0, pointHoverRadius: 2 }));
                        window._trendCharts = window._trendCharts || {};
                        try { window._trendCharts.bizSpark && window._trendCharts.bizSpark.destroy(); } catch {}
                        window._trendCharts.bizSpark = new Chart(
                            sparkBiz,
                            {
                                type: 'line',
                                data: { labels: months, datasets: datasetsLine },
                                options: {
                                    responsive: false,
                                    plugins: { legend: { display: true, position: 'bottom' } },
                                    scales: { y: { display: false }, x: { display: false } }
                                }
                            }
                        );

                        // 헤더에 '예상 최대 동시 필요 장비 수' 표시 (월별 남은 site-days 합 기준)
                        try {
                            // 월별 총 남은 site-days → 월 영업일로 나눠 장비 수 근사, 최댓값
                            const peakByMonth = months.map(m => {
                                const rows = Array.from(grouped.values()).filter(v => v.month===m);
                                const remainDays = rows.reduce((a,b)=> a + Number(b.remaining||0), 0);
                                return Math.ceil(remainDays / (countBizMonth(m)||1));
                            });
                            const peakNeed = Math.max(0, ...peakByMonth);
                            const totalOwned = Array.from(inv.values()).reduce((a,b)=> a + Number(b||0), 0);
                            const lack = Math.max(0, peakNeed - totalOwned);
                            const el = document.getElementById('trend-max-operating');
                            if (el) el.textContent = `최대 동시 필요 수: ${peakNeed} / 보유: ${totalOwned}${lack?` (부족 ${lack})`:''}`;
                        } catch {}
                    }
                } catch {}
            }
        } catch (e) {
            // 무시
        }
    } catch (e) {
        console.warn('가동률 예측 로드 실패:', e);
    }
}

// 예측 상세 모달: 항목별 예측 근거 + 사업별 기여도 + 과거 통계
async function openUptimePredictionDetail(item) {
    try {
        const modal = document.getElementById('uptime-prediction-detail-modal');
        const content = document.getElementById('uptime-prediction-detail-content');
        if (!modal || !content) return;

        const client = new DataClient();
        // 예측 v2
        let pred = null;
        try {
            const v2 = await client._json(`${client.basePath}/stats_equipment_uptime_predictions_v2.json`);
            const arr = Array.isArray(v2?.data) ? v2.data : [];
            pred = arr.find(x => (x.category||x.item) === item) || null;
        } catch {}
        // 과거 통계
        let hist = null;
        try {
            const h = await client._json(`${client.basePath}/stats_uptime_historical.json`);
            const arr = Array.isArray(h?.data) ? h.data : [];
            hist = arr.find(x => x.category === item) || null;
        } catch {}
        // 계약 데이터(사업별 기여도 역산)
        let biz = null;
        try {
            const c = await client._json(`${client.basePath}/business_contracts_q4_2025.json`);
            const rows = Array.isArray(c?.data) ? c.data : [];
            // 각 사업(row)의 measurementPlans에서 해당 item이 포함된 siteDays 기여도 추정
            const normalize = (s)=> String(s||'').trim().toUpperCase().replace(/\s+/g,'');
            const normKey = normalize(item).replace('PM2.5','PM-2.5').replace('PM10','PM-10');
            const derive = (r)=>{
                const overlap = Number(r.overlapQ4Days||0);
                const totalSites = Number((r.siteCounts?.manual||0) + (r.siteCounts?.automatic||0));
                if (!(totalSites>0)) return 0;
                let sum = 0;
                (r.measurementPlans||[]).forEach(p=>{
                    const days = Number(p.days||0);
                    if (!(days>0)) return;
                    const active = overlap>0 ? Math.min(days, overlap) : days;
                    const items = (p.items||[]).map(x=>normalize(x).replace('PM2.5','PM-2.5').replace('PM10','PM-10'));
                    if (items.includes(normKey)) sum += totalSites * active;
                });
                return sum;
            };
            const contrib = rows.map(r=> ({ projectId: r.projectId, projectName: r.projectName, client: r.client, siteDays: derive(r) }))
                .filter(x=> x.siteDays>0)
                .sort((a,b)=> b.siteDays - a.siteDays)
                .slice(0, 15);
            const total = contrib.reduce((a,b)=> a+b.siteDays, 0) || 1;
            biz = { contrib, total };
        } catch {}

        // 렌더
        const basisKo = getPredictionBasisTextKo(pred || {});
        const req = pred?.requiredDevices ?? 0;
        const reqDays = pred?.requiredSiteDays ?? 0;
        const manDays = pred?.requiredManualSiteDays ?? 0;
        const autoDays = pred?.requiredAutomaticSiteDays ?? 0;
        const own = pred?.ownedDevices ?? 0;
        const pct = pred?.predictedUptimePct ?? (pred?.uptimeEstimatePct ?? 0);
        const hUptime = hist?.avgUptimePct1Y ?? '-';
        const sitePct = hist?.siteDaysPct1Y ?? '-';
        const vendorPct = hist?.vendorDaysPct1Y ?? '-';
        const cmesPct = hist?.cmesDaysPct1Y ?? '-';
        const trips = hist?.avgTrips1Y ?? '-';
        const rTrips = hist?.avgRepairTrips1Y ?? '-';
        const rLogs = hist?.avgRepairsLogged1Y ?? '-';
        const calib = hist?.avgCalibrationsLogged1Y ?? '-';

        const bizRows = (biz?.contrib||[]).map(x=>{
            const share = Math.round((x.siteDays / (biz.total||1)) * 100);
            return `<tr><td class="p-2">${x.projectName||''}</td><td class="p-2">${x.client||''}</td><td class="p-2">${x.siteDays}</td><td class="p-2">${share}%</td></tr>`;
        }).join('');

        content.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <h4 class="font-semibold text-slate-800 mb-2">예측 요약</h4>
                <div class="text-sm text-slate-700 space-y-1">
                    <div><span class="text-slate-500">항목:</span> <span class="font-medium">${item}</span></div>
                    <div><span class="text-slate-500">필요 대수:</span> ${req}</div>
                    <div><span class="text-slate-500">필요 일수(지점-일):</span> ${reqDays}</div>
                    <div class="text-xs text-slate-500">- 수동 지점-일: ${manDays} / 자동 지점-일: ${autoDays}</div>
                    <div><span class="text-slate-500">보유 대수:</span> ${own}</div>
                    <div><span class="text-slate-500">예상 가동률:</span> <span class="font-semibold">${pct}%</span></div>
                    <div class="text-xs text-slate-500">근거: ${basisKo}</div>
                </div>
            </div>
            <div>
                <h4 class="font-semibold text-slate-800 mb-2">과거 1년 통계(참고)</h4>
                <div class="text-sm text-slate-700 grid grid-cols-2 gap-x-6 gap-y-1">
                    <div>평균 가동률: <span class="font-semibold">${hUptime}%</span></div>
                    <div>현장일 비율: ${sitePct}%</div>
                    <div>업체일 비율: ${vendorPct}%</div>
                    <div>청명일 비율: ${cmesPct}%</div>
                    <div>평균 출장: ${trips}</div>
                    <div>평균 수리회수: ${rTrips}</div>
                    <div>평균 수리로그: ${rLogs}</div>
                    <div>평균 정도검사: ${calib}</div>
                </div>
            </div>
        </div>
        <div class="mt-6">
            <h4 class="font-semibold text-slate-800 mb-2">사업별 기여도(지점-일)</h4>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-slate-100"><tr><th class="text-left p-2">사업명</th><th class="text-left p-2">의뢰사</th><th class="text-left p-2">지점-일</th><th class="text-left p-2">기여%</th></tr></thead>
                    <tbody>${bizRows || '<tr><td class="p-2 text-slate-500" colspan="4">데이터 없음</td></tr>'}</tbody>
                </table>
            </div>
        </div>`;

        modal.classList.remove('hidden');
    } catch (e) {
        console.warn('예측 상세 모달 실패:', e);
    }
}
// 사업관리: 4분기 계약 표 렌더
async function loadBusinessContracts() {
    try {
        const btn = document.getElementById('btn-refresh-business');
        if (btn && !btn.__wired) {
            btn.addEventListener('click', () => loadBusinessContracts());
            btn.__wired = true;
        }
        const search = document.getElementById('business-search-input');
        if (search && !search.__wired) {
            search.addEventListener('input', () => loadBusinessContracts());
            search.__wired = true;
        }
        const typeFilter = document.getElementById('business-type-filter');
        if (typeFilter && !typeFilter.__wired) {
            typeFilter.addEventListener('change', () => loadBusinessContracts());
            typeFilter.__wired = true;
        }
        const exportBtn = document.getElementById('btn-export-business');
        if (exportBtn && !exportBtn.__wired) {
            exportBtn.addEventListener('click', () => exportBusinessToExcel());
            exportBtn.__wired = true;
        }
        const tCons = document.getElementById('biz-construction');
        const tOper = document.getElementById('biz-operation');
        const tPost = document.getElementById('biz-post');
        const tStr = document.getElementById('biz-strategy');
        if (!(tCons && tOper && tPost && tStr)) return;
        tCons.innerHTML = '<tr><td class=\"p-2 text-slate-500\" colspan=\"5\">불러오는 중...</td></tr>';
        tOper.innerHTML = '<tr><td class=\"p-2 text-slate-500\" colspan=\"5\">불러오는 중...</td></tr>';
        tPost.innerHTML = '<tr><td class=\"p-2 text-slate-500\" colspan=\"5\">불러오는 중...</td></tr>';
        tStr.innerHTML = '<tr><td class=\"p-2 text-slate-500\" colspan=\"5\">불러오는 중...</td></tr>';
        const client = new DataClient();
        let payload = null;
        try {
            payload = await client._json(`${client.basePath}/business_contracts_q4_2025.json`);
        } catch {}
        let rows = Array.isArray(payload?.data) ? payload.data : [];
        console.log('🔍 business rows:', rows.length);
        // 검색 필터
        const q = (document.getElementById('business-search-input')?.value || '').trim();
        if (q) {
            const qs = q.toLowerCase();
            rows = rows.filter(r => (r.projectName||'').toLowerCase().includes(qs) || (r.client||'').toLowerCase().includes(qs));
        }
        // v2 단계 배정(배타성) 로드
        let __v2ById = new Map();
        try {
            const v2 = await client._json(`${client.basePath}/backend_business_contracts_v2.json?v=${Date.now()}`);
            const arr = Array.isArray(v2?.data) ? v2.data : [];
            __v2ById = new Map(arr.map(x => [x.projectId, x]));
        } catch {}
        function __renderMiniTimeline(v2){
            try {
                const map = v2?.phaseByMonth || {};
                const months = ['2025-10','2025-11','2025-12'];
                const color = (ph)=> ph==='construction' ? '#3B82F6' : ph==='operation' ? '#10B981' : '#94A3B8';
                return `<span class="inline-flex items-center gap-1 ml-1">` +
                    months.map(m => `<span title="${m}: ${map[m]||'-'}" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${color(map[m])};"></span>`).join('') +
                `</span>`;
            } catch { return ''; }
        }
        function __renderPhaseChips(v2){
            try {
                const chips = (v2?.phases||[]).map(ph=>{
                    if (ph.type==='period') return `<span class=\"inline-block px-1 py-0.5 rounded bg-slate-100 mr-1\">${ph.name}: ${(ph.period?.from||'').slice(0,10)}~${(ph.period?.to||'').slice(0,10)}</span>`;
                    if (ph.type==='event') return `<span class=\"inline-block px-1 py-0.5 rounded bg-amber-100 mr-1\">${ph.name}: ${ph.date?(ph.date.slice(0,10)):(ph.count? (ph.count+'회') : '')}</span>`;
                    return '';
                }).join('');
                return chips;
            } catch { return ''; }
        }

        // 분류별 필터링
        const typeFilterValue = document.getElementById('business-type-filter')?.value || 'all';
        let filteredRows = rows;
        if (typeFilterValue !== 'all') {
            filteredRows = rows.filter(r => {
                const cls = r.classification || {};
                if (typeFilterValue === 'construction') return cls.construction?.raw;
                if (typeFilterValue === 'operation') return cls.operation?.raw || cls.operation?.totalSurveys || cls.operation?.requestedSurveys;
                if (typeFilterValue === 'post') return cls.post?.raw;
                if (typeFilterValue === 'strategy') return cls.strategy?.raw || cls.strategy?.remainingExecutions;
                return true;
            });
        }
        // ===== 캘린더 동기화 오버레이 병합 (백엔드 산출물: backend_business_calendar_sync.json) =====
        try {
            const ov = await fetch('./db/backend_business_calendar_sync.json?v=' + Date.now(), { cache:'no-store' }).then(r=> r.ok ? r.json() : { items: [] });
            const items = Array.isArray(ov?.items) ? ov.items : [];
            const dict = {};
            items.forEach(it => {
                if (!it) return;
                const key = it.businessId || (it.projectTitle || '').trim();
                if (!key) return;
                const cur = dict[key];
                if (!cur || String(it.completedAt||'') > String(cur.completedAt||'')) {
                    dict[key] = { completed: !!it.complete, completedAt: it.completedAt || null, updatedAt: new Date().toISOString() };
                }
            });
            const local = JSON.parse(localStorage.getItem('businessCompletion')||'{}');
            const byId = {};
            rows.forEach(r => {
                const idKey = r.projectId;
                const nameKey = (r.projectName||'').trim();
                if (dict[idKey]) {
                    byId[idKey] = dict[idKey];
                } else if (dict[nameKey]) {
                    byId[idKey] = dict[nameKey];
                }
            });
            const merged = { ...local, ...byId };
            window.__businessCompletion = merged;
            localStorage.setItem('businessCompletion', JSON.stringify(merged));
            console.log('✅ 캘린더 동기화 오버레이 반영:', Object.keys(byId).length);
        } catch (e) { console.warn('오버레이 로드 실패:', e); }
        // ===== 오버레이 병합 끝 =====
        const fmtPeriod = (p) => {
            const f = (p?.from || '').slice(0,10);
            const t = (p?.to || '').slice(0,10);
            if (f && t) return `${f} ~ ${t}`;
            if (f && !t) return `${f} ~ 과업 완료시`;
            if (!f && t) return `~ ${t}`;
            return '';
        };
        const mkRow = (r, cells, priority) => {
            const rowClass = priority === 'high' ? 'bg-red-50' : priority === 'medium' ? 'bg-yellow-50' : '';
            // 완료 상태 확인 (오버라이드에서 가져오기)
            const completionOverride = (window.__businessCompletion && window.__businessCompletion[r.projectId]) || {};
            const isCompleted = completionOverride.completed || false;
            const completedClass = isCompleted ? 'opacity-60' : '';
            
            // 완료 토글 체크박스
            const toggleCell = `<input type="checkbox" class="completion-toggle" data-project-id="${r.projectId}" ${isCompleted ? 'checked' : ''} onchange="toggleBusinessCompletion('${r.projectId}', this.checked)">`;
            
            // v2 배지/미니타임라인: 첫번째 셀(사업명)에 부착
            try {
                const v2 = __v2ById.get(r.projectId);
                if (v2) {
                    const chips = __renderPhaseChips(v2);
                    const mini = __renderMiniTimeline(v2);
                    const nameHtml = `${cells[0]}<div class=\"mt-1 text-xs text-slate-600\">${chips}${mini}</div>`;
                    const newCells = [nameHtml, ...cells.slice(1)];
                    return `<tr class=\"${rowClass} ${completedClass}\" data-project-id=\"${r.projectId}\" data-completed=\"${isCompleted}\">${[toggleCell, ...newCells].map(c=>`<td class=\"p-2\">${c}</td>`).join('')}</tr>`;
                }
            } catch {}
            return `<tr class=\"${rowClass} ${completedClass}\" data-project-id=\"${r.projectId}\" data-completed=\"${isCompleted}\">${[toggleCell, ...cells].map(c=>`<td class=\"p-2\">${c}</td>`).join('')}</tr>`;
        };
        const esc = s => (s||'').replace(/</g,'&lt;');
        const consRows = [];
        const operRows = [];
        const postRows = [];
        const stratRows = [];
        for (const r of filteredRows) {
            // 오버라이드 적용
            const override = (window.__bizOverrides && window.__bizOverrides[r.projectId]) || {};
            const cls = r.classification || {};
            const op = cls.operation || {}; 
            const cons = cls.construction || {};
            const post = cls.post || {};
            const strat = cls.strategy || {};
            
            // 계약기간 오버라이드 적용
            const period = {
                from: override.periodFrom || r.period?.from,
                to: override.periodTo || r.period?.to
            };
            
            // 집행 정보 오버라이드 적용 및 4분기 총 횟수 계산
            const calculateQ4Executions = (period, count) => {
                if (!count || count <= 0) return 0;
                const Q4_MONTHS = 3; // 10,11,12월
                switch(period) {
                    case 'month': return count * Q4_MONTHS; // 월별 × 3개월
                    case 'quarter': return count; // 분기별 그대로
                    case 'half': return Math.ceil(count * 0.5); // 반기별 × 0.5 (4분기는 반기의 절반)
                    case 'total': return count; // 총 횟수 그대로
                    default: return count;
                }
            };
            
            const execConstruction = override.execConstructionCount ? 
                calculateQ4Executions(override.execConstructionPeriod || 'total', override.execConstructionCount) :
                (r.executionsQ4?.construction || 0);
            const execOperation = override.execOperationCount ? 
                calculateQ4Executions(override.execOperationPeriod || 'quarter', override.execOperationCount) :
                (r.executionsQ4?.operation || 0);
            const execPost = override.execPostCount ? 
                calculateQ4Executions(override.execPostPeriod || 'month', override.execPostCount) :
                (r.executionsQ4?.post || 0);
            const execStrategy = override.execStrategyCount ? 
                calculateQ4Executions(override.execStrategyPeriod || 'total', override.execStrategyCount) :
                (r.executionsQ4?.strategy || 0);
            
            // 우선순위: 종료일 임박/지점수 많음 = high, 보통 = medium
            const now = new Date();
            const end = period?.to ? new Date(period.to) : null;
            const daysLeft = end ? Math.ceil((end - now) / (24*60*60*1000)) : 999;
            const sites = override.totalSites ?? ((override.manual ?? (r.siteCounts?.manual||0)) + (override.automatic ?? (r.siteCounts?.automatic||0)));
            const priority = (daysLeft < 30 && sites > 5) ? 'high' : (daysLeft < 90 || sites > 3) ? 'medium' : '';
            
            // 집행 정보 표시 함수
            const formatExecInfo = (period, count, originalCount) => {
                if (count > 0) {
                    const periodText = period === 'total' ? '총' : period === 'half' ? '반기' : period === 'quarter' ? '분기' : '월';
                    return `${periodText} ${originalCount}회 (4분기: ${count}회)`;
                }
                return '';
            };
            
            const consExecText = override.execConstructionCount ? 
                formatExecInfo(override.execConstructionPeriod || 'total', execConstruction, override.execConstructionCount) :
                (execConstruction > 0 ? `${execConstruction}회` : '');
            const operExecText = override.execOperationCount ? 
                formatExecInfo(override.execOperationPeriod || 'quarter', execOperation, override.execOperationCount) :
                (execOperation > 0 ? `${execOperation}회` : '');
            const postExecText = override.execPostCount ? 
                formatExecInfo(override.execPostPeriod || 'month', execPost, override.execPostCount) :
                (execPost > 0 ? `${execPost}회` : '');
            const stratExecText = override.execStrategyCount ? 
                formatExecInfo(override.execStrategyPeriod || 'total', execStrategy, override.execStrategyCount) :
                (execStrategy > 0 ? `${execStrategy}회` : '');
            
            if (cons.raw || consExecText) consRows.push(mkRow(r, [esc(r.projectName), esc(r.client), fmtPeriod(period), consExecText || esc(cons.raw), `<button class="px-2 py-1 text-xs border rounded" onclick="openBusinessDetail('${r.projectId}')">상세</button>`], priority));
            const opCell = operExecText || ((op.totalSurveys || op.requestedSurveys) ? `${op.totalSurveys||0}/${op.requestedSurveys||0}` : (op.raw ? esc(op.raw) : ''));
            if (opCell) operRows.push(mkRow(r, [esc(r.projectName), esc(r.client), fmtPeriod(period), opCell, `<button class="px-2 py-1 text-xs border rounded" onclick="openBusinessDetail('${r.projectId}')">상세</button>`], priority));
            if (post.raw || postExecText) postRows.push(mkRow(r, [esc(r.projectName), esc(r.client), fmtPeriod(period), postExecText || esc(post.raw), `<button class="px-2 py-1 text-xs border rounded" onclick="openBusinessDetail('${r.projectId}')">상세</button>`], priority));
            if (strat.raw || stratExecText || (typeof strat.remainingExecutions === 'number' && strat.remainingExecutions > 0)) {
                stratRows.push(mkRow(r, [esc(r.projectName), esc(r.client), fmtPeriod(period), stratExecText || '', `<button class="px-2 py-1 text-xs border rounded" onclick="openBusinessDetail('${r.projectId}')">상세</button>`], priority));
            }
        }
        // 완료/미완료로 분리
        const separateByCompletion = (rows) => {
            const active = [];
            const completed = [];
            rows.forEach(row => {
                if (row.includes('data-completed="true"')) {
                    completed.push(row);
                } else {
                    active.push(row);
                }
            });
            return { active, completed };
        };

        const consSeparated = separateByCompletion(consRows);
        const operSeparated = separateByCompletion(operRows);
        const postSeparated = separateByCompletion(postRows);
        const stratSeparated = separateByCompletion(stratRows);

        tCons.innerHTML = consSeparated.active.join('') || '<tr><td class=\"p-2 text-slate-500\" colspan=\"6\">데이터 없음</td></tr>';
        tOper.innerHTML = operSeparated.active.join('') || '<tr><td class=\"p-2 text-slate-500\" colspan=\"6\">데이터 없음</td></tr>';
        tPost.innerHTML = postSeparated.active.join('') || '<tr><td class=\"p-2 text-slate-500\" colspan=\"6\">데이터 없음</td></tr>';
        tStr.innerHTML = stratSeparated.active.join('') || '<tr><td class=\"p-2 text-slate-500\" colspan=\"6\">데이터 없음</td></tr>';

        // 완료된 사업 섹션 업데이트
        const tConsCompleted = document.getElementById('biz-construction-completed');
        const tOperCompleted = document.getElementById('biz-operation-completed');
        const tPostCompleted = document.getElementById('biz-post-completed');
        const tStrCompleted = document.getElementById('biz-strategy-completed');

        if (tConsCompleted) tConsCompleted.innerHTML = consSeparated.completed.join('') || '<tr><td class=\"p-2 text-slate-500\" colspan=\"6\">완료된 사업 없음</td></tr>';
        if (tOperCompleted) tOperCompleted.innerHTML = operSeparated.completed.join('') || '<tr><td class=\"p-2 text-slate-500\" colspan=\"6\">완료된 사업 없음</td></tr>';
        if (tPostCompleted) tPostCompleted.innerHTML = postSeparated.completed.join('') || '<tr><td class=\"p-2 text-slate-500\" colspan=\"6\">완료된 사업 없음</td></tr>';
        if (tStrCompleted) tStrCompleted.innerHTML = stratSeparated.completed.join('') || '<tr><td class=\"p-2 text-slate-500\" colspan=\"6\">완료된 사업 없음</td></tr>';

        // 상단 카드 개수 업데이트 (v2 단계 배정 기반)
        try {
            const totalCount = rows.length;
            const completedCount = Object.values(window.__businessCompletion || {}).filter(c => c.completed).length;

            function hasPhase(v2, phase){
                try {
                    if (!v2) return false;
                    if (phase === 'construction' || phase === 'operation') {
                        const by = v2.phaseByMonth || {};
                        return Object.values(by).some(ph => ph === phase);
                    }
                    if (phase === 'post') {
                        return Array.isArray(v2.phases) && v2.phases.some(ph => ph.name==='post');
                    }
                    if (phase === 'strategy') {
                        return Array.isArray(v2.phases) && v2.phases.some(ph => ph.name==='strategy' && (Number(ph.count||0) > 0 || ph.date));
                    }
                    return false;
                } catch { return false; }
            }
            function fallbackHas(row, phase){
                const cls = row.classification || {};
                const exq = row.executionsQ4 || {};
                if (phase==='construction') return Number(exq.construction||0) > 0 || !!cls.construction?.raw;
                if (phase==='operation') return Number(exq.operation||0) > 0 || !!cls.operation?.raw;
                if (phase==='post') return Number(exq.post||0) > 0 || !!cls.post?.raw;
                if (phase==='strategy') return Number(exq.strategy||0) > 0 || (Number(cls.strategy?.remainingExecutions||0) > 0) || !!cls.strategy?.raw;
                return false;
            }
            let consCount=0, operCount=0, postCount=0, stratCount=0;
            rows.forEach(r => {
                const v2 = __v2ById.get(r.projectId);
                if (hasPhase(v2,'construction') || (!v2 && fallbackHas(r,'construction'))) consCount++;
                if (hasPhase(v2,'operation') || (!v2 && fallbackHas(r,'operation'))) operCount++;
                if (hasPhase(v2,'post') || (!v2 && fallbackHas(r,'post'))) postCount++;
                if (hasPhase(v2,'strategy') || (!v2 && fallbackHas(r,'strategy'))) stratCount++;
            });

            document.getElementById('biz-total-count').textContent = totalCount;
            document.getElementById('biz-completed-count').textContent = completedCount;
            const elC = document.getElementById('biz-construction-count'); if (elC) elC.textContent = consCount;
            const elO = document.getElementById('biz-operation-count'); if (elO) elO.textContent = operCount;
            const elP = document.getElementById('biz-post-count'); if (elP) elP.textContent = postCount;
            const elS = document.getElementById('biz-strategy-count'); if (elS) elS.textContent = stratCount;
        } catch (e) {
            console.warn('카드 개수 업데이트 실패:', e);
        }

        // 품목계열 요약: 예측 산출 v2 사용
        try {
            const pred = await client._json(`${client.basePath}/stats_equipment_uptime_predictions_v2.json`);
            const items = Array.isArray(pred?.data) ? pred.data : [];
            const sumTbody = document.getElementById('biz-item-summary');
            if (sumTbody) {
                const rows2 = items.map(it => {
                    const item = it.category || it.item || '';
                    const need = it.requiredDevices ?? it.requiredSites ?? 0;
                    const own = it.ownedDevices ?? 0;
                    const pct = it.predictedUptimePct ?? it.coveragePct ?? 0;
                    return `<tr><td class="p-2">${item}</td><td class="p-2">${need}</td><td class="p-2">${own}</td><td class="p-2">${pct}%</td></tr>`;
                }).join('');
                sumTbody.innerHTML = rows2 || '<tr><td class="p-2 text-slate-500" colspan="4">데이터 없음</td></tr>';
            }
        } catch {}

        window.__businessContracts = rows;
        
        // 오버라이드 데이터 로드
        try {
            const overrideRes = await fetch('/api/business-overrides');
            const overrideData = await overrideRes.json();
            if (overrideData.ok && Array.isArray(overrideData.items)) {
                window.__bizOverrides = {};
                overrideData.items.forEach(item => {
                    if (item.projectId && item.overrides) {
                        window.__bizOverrides[item.projectId] = item.overrides;
                    }
                });
                console.log('✅ 사업 오버라이드 로드됨:', Object.keys(window.__bizOverrides).length);
            }
        } catch (e) {
            console.warn('오버라이드 로드 실패:', e);
            window.__bizOverrides = {};
        }
        
        // 완료 상태 데이터 로드 (로컬 스토리지 우선)
        try {
            // 로컬 스토리지에서 먼저 로드
            const localData = JSON.parse(localStorage.getItem('businessCompletion') || '{}');
            window.__businessCompletion = localData;
            console.log('✅ 로컬 스토리지에서 완료 상태 로드됨:', Object.keys(window.__businessCompletion).length);
            
            // 백엔드 서버에서 동기화 시도
            try {
                const completionRes = await fetch('/api/business-completion');
                
                // HTML 응답 체크 (서버가 꺼진 경우)
                const contentType = completionRes.headers.get('content-type');
                if (contentType && contentType.includes('text/html')) {
                    console.warn('백엔드 서버가 실행되지 않았습니다. 로컬 스토리지만 사용합니다.');
                } else {
                    const completionData = await completionRes.json();
                    if (completionData.ok && Array.isArray(completionData.items)) {
                        // 백엔드 데이터로 업데이트
                        const serverData = {};
                        completionData.items.forEach(item => {
                            if (item.projectId && typeof item.completed === 'boolean') {
                                serverData[item.projectId] = { completed: item.completed, updatedAt: item.updatedAt };
                            }
                        });
                        
                        // 로컬과 서버 데이터 병합 (최신 updatedAt 우선)
                        Object.keys(localData).forEach(pid => {
                            const local = localData[pid];
                            const server = serverData[pid];
                            if (!server || (local.updatedAt > server.updatedAt)) {
                                serverData[pid] = local;
                            }
                        });
                        
                        window.__businessCompletion = serverData;
                        localStorage.setItem('businessCompletion', JSON.stringify(serverData));
                        console.log('✅ 백엔드와 동기화 완료');
                    }
                }
            } catch (serverError) {
                console.warn('백엔드 동기화 실패, 로컬 스토리지만 사용:', serverError.message);
            }
        } catch (e) {
            console.warn('완료 상태 로드 실패:', e);
            window.__businessCompletion = {};
        }
    } catch (e) {
        console.warn('사업 계약 로드 실패:', e);
    }
}

function exportBusinessToExcel() {
    try {
        const rows = Array.isArray(window.__businessContracts) ? window.__businessContracts : [];
        if (!rows.length) return alert('내보낼 데이터가 없습니다.');
        let csv = '사업명,의뢰사,계약기간(시작),계약기간(종료),공사시,운영시,사후,전략,수동지점,자동지점\n';
        rows.forEach(r => {
            const cls = r.classification || {};
            csv += [
                `"${(r.projectName||'').replace(/"/g,'""')}"`,
                `"${(r.client||'').replace(/"/g,'""')}"`,
                r.period?.from || '',
                r.period?.to || '',
                `"${(cls.construction?.raw||'').replace(/"/g,'""')}"`,
                `"${(cls.operation?.raw||'').replace(/"/g,'""')}"`,
                `"${(cls.post?.raw||'').replace(/"/g,'""')}"`,
                `"${(cls.strategy?.raw||'').replace(/"/g,'""')}"`,
                r.siteCounts?.manual || 0,
                r.siteCounts?.automatic || 0
            ].join(',') + '\n';
        });
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `사업관리_4분기_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        alert('내보내기 실패: ' + (e.message || e));
    }
}
async function openBusinessDetail(projectId) {
    try {
        const rows = Array.isArray(window.__businessContracts) ? window.__businessContracts : [];
        const row = rows.find(r => r.projectId === projectId);
        if (!row) return;
        const el = document.getElementById('business-detail-content');
        const bd = document.getElementById('business-detail-backdrop');
        const modal = document.getElementById('business-detail-modal');
        if (!el || !bd || !modal) return;
        const fmt = s => (s||'').slice(0,10);
        // v2 phases 로드(있으면 근거 표시)
        let v2 = null;
        try {
            const clientV2 = new DataClient();
            const v2p = await clientV2._json(`${clientV2.basePath}/backend_business_contracts_v2.json`);
            const arr = Array.isArray(v2p?.data) ? v2p.data : [];
            v2 = arr.find(x => x.projectId === projectId) || null;
        } catch {}
        const ex = row.executionsQ4||{};
        const op = row.classification?.operation||{};
        
        // 장비 DB 로드
        const client = new DataClient();
        let equipment = [];
        try { equipment = await client.getEquipment(); } catch {}
        const itemToCats = {};
        const catToEquipment = {};
        equipment.forEach(e => {
            const cat = String(e?.category || '');
            const m = cat.match(/^\(([^)]+)\)/);
            if (!m) return;
            (catToEquipment[cat] = catToEquipment[cat] || []).push(e);
            const insideParens = m[1]; // 괄호 안 전체 텍스트
            const tok = insideParens.split(',').map(t=>t.trim()).filter(Boolean);
            tok.forEach(t => {
                const norm = t.replace(/\s+/g,'').toUpperCase();
                let item = '';
                if (norm.includes('PM-10') || norm.includes('PM10')) item = 'PM-10';
                else if (norm.includes('PM-2.5') || norm.includes('PM2.5')) item = 'PM-2.5';
                else if (norm.includes('NO2') || norm.includes('NOX')) item = 'NO2';
                else if (norm.includes('SO2') || norm.includes('SOX')) item = 'SO2';
                else if (norm.includes('CO')) item = 'CO';
                else if (norm.includes('O3')) item = 'O3';
                else if (norm.includes('PB')) item = 'Pb';
                else if (norm.includes('벤젠')) item = '벤젠';
                else item = t; // 괄호 안 원문을 그대로 항목으로 사용
                if (item) (itemToCats[item] = itemToCats[item] || []).push(cat);
            });
        });
        // 항목별 필요 장비/일수 계산
        const __normItem = (raw) => {
            const s = String(raw||'').trim().toUpperCase().replace(/\s+/g,'');
            if (!s) return '';
            if (s.startsWith('PM10') || s === 'PM-10') return 'PM-10';
            if (s.startsWith('PM2.5') || s === 'PM-2.5' || s === 'PM2_5') return 'PM-2.5';
            if (s === 'NOX' || s === 'NO2') return 'NO2';
            if (s === 'SOX' || s === 'SO2') return 'SO2';
            if (s === 'CO') return 'CO';
            if (s === 'O3') return 'O3';
            if (String(raw).includes('벤젠')) return '벤젠';
            if (s === 'PB' || s === 'PB(LEAD)') return 'Pb';
            return raw;
        };
        const __computeStats = (r, selectedItems, overrideData = {}) => {
            // 오버라이드된 지점 수 적용 (통합 지점수 우선 사용)
            const totalSites = overrideData.totalSites ?? 
                ((overrideData.manual ?? (r.siteCounts?.manual||0)) + (overrideData.automatic ?? (r.siteCounts?.automatic||0)));
            
            // 오버라이드된 측정 일수 적용 (기본값은 measurementPlans에서 추출)
            const defaultDays = (r.measurementPlans||[]).length > 0 ? Math.max(...(r.measurementPlans||[]).map(p => Number(p.days||0))) : 7;
            const measurementDays = Number(overrideData.measurementDays ?? defaultDays);
            
            // 오버라이드된 계약기간으로 4분기 중복 일수 재계산
            let overlap = Number(r.overlapQ4Days||0);
            if (overrideData.periodFrom || overrideData.periodTo) {
                const Q4_FROM = new Date('2025-10-01T00:00:00');
                const Q4_TO = new Date('2025-12-31T23:59:59');
                const periodFrom = overrideData.periodFrom ? new Date(overrideData.periodFrom + 'T00:00:00') : (r.period?.from ? new Date(r.period.from + 'T00:00:00') : null);
                const periodTo = overrideData.periodTo ? new Date(overrideData.periodTo + 'T23:59:59') : (r.period?.to ? new Date(r.period.to + 'T23:59:59') : null);
                if (periodFrom && periodTo) {
                    const start = periodFrom > Q4_FROM ? periodFrom : Q4_FROM;
                    const end = periodTo < Q4_TO ? periodTo : Q4_TO;
                    const ms = end - start;
                    overlap = ms > 0 ? Math.floor(ms / (24 * 60 * 60 * 1000)) + 1 : 0;
                }
            }
            // 집행 횟수 계산 (오버라이드 적용)
            const calculateQ4Executions = (period, count) => {
                if (!count || count <= 0) return 0;
                const Q4_MONTHS = 3; // 10,11,12월
                switch(period) {
                    case 'month': return count * Q4_MONTHS; // 월별 × 3개월
                    case 'quarter': return count; // 분기별 그대로
                    case 'half': return Math.ceil(count * 0.5); // 반기별 × 0.5
                    case 'total': return count; // 총 횟수 그대로
                    default: return count;
                }
            };
            
            // 각 측정 계획 타입별 총 집행 횟수 계산
            let totalExecutions = 0;
            
            // 공사 집행 (ALL_8 항목에 주로 해당)
            if (overrideData.execConstructionCount) {
                totalExecutions += calculateQ4Executions(overrideData.execConstructionPeriod || 'total', overrideData.execConstructionCount);
            } else {
                totalExecutions += (r.executionsQ4?.construction || 0);
            }
            
            // 운영 집행 (PM_NOX 항목에 주로 해당)  
            if (overrideData.execOperationCount) {
                totalExecutions += calculateQ4Executions(overrideData.execOperationPeriod || 'quarter', overrideData.execOperationCount);
            } else {
                totalExecutions += (r.executionsQ4?.operation || 0);
            }
            
            // 사후 집행 (CUSTOM 항목에 주로 해당)
            if (overrideData.execPostCount) {
                totalExecutions += calculateQ4Executions(overrideData.execPostPeriod || 'month', overrideData.execPostCount);
            } else {
                totalExecutions += (r.executionsQ4?.post || 0);
            }
            
            // 전략 집행
            if (overrideData.execStrategyCount) {
                totalExecutions += calculateQ4Executions(overrideData.execStrategyPeriod || 'total', overrideData.execStrategyCount);
            } else {
                totalExecutions += (r.executionsQ4?.strategy || 0);
            }
            
            // 최소 1회는 보장 (집행 정보가 없어도 기본 1회로 계산)
            totalExecutions = Math.max(totalExecutions, 1);
            
            const stats = {}; // item -> { sites, siteDays }
            
            // measurementPlans 기반으로 계산하되, 선택된 품목만 포함
            (Array.isArray(r.measurementPlans)? r.measurementPlans: []).forEach(p => {
                // 오버라이드된 측정 일수 사용 (원본 측정 계획의 일수 대신)
                const days = measurementDays;
                if (!(days > 0 && totalSites > 0)) return;
                const active = overlap > 0 ? Math.min(days, overlap) : days;
                
                let its = (Array.isArray(p.items)? p.items: []).map(__normItem);
                // 사용자가 선택한 품목만 필터링
                if (Array.isArray(selectedItems) && selectedItems.length) {
                    its = its.filter(it => selectedItems.includes(it));
                }
                
                its.forEach(it => {
                    if (!it) return;
                    const cur = stats[it] || { sites: 0, siteDays: 0 };
                    cur.sites += totalSites;
                    // 집행 횟수를 반영한 지점-일 계산: 지점 수 × 측정 일수 × 총 집행 횟수
                    cur.siteDays += totalSites * active * totalExecutions;
                    stats[it] = cur;
                });
            });
            
            // measurementPlans에 없지만 사용자가 추가로 선택한 품목들도 포함
            if (Array.isArray(selectedItems)) {
                const planItems = new Set((r.measurementPlans||[]).flatMap(p=> (p.items||[]).map(__normItem)));
                const additionalItems = selectedItems.filter(it => !planItems.has(it));
                
                if (additionalItems.length > 0 && measurementDays > 0 && totalSites > 0) {
                    const active = overlap > 0 ? Math.min(measurementDays, overlap) : measurementDays;
                    additionalItems.forEach(it => {
                        if (!it) return;
                        const cur = stats[it] || { sites: 0, siteDays: 0 };
                        cur.sites += totalSites;
                        cur.siteDays += totalSites * active * totalExecutions;
                        stats[it] = cur;
                    });
                }
            }
            return stats;
        };
        // 전체 품목계열 목록
        const allItems = ['PM-10','PM-2.5','NO2','SO2','CO','O3','Pb','벤젠'];
        
        // 사업별 기초 데이터에서 기본 품목 및 측정 일수 추출
        const defaultItems = Array.from(new Set((row.measurementPlans||[]).flatMap(p=> (p.items||[]).map(__normItem)).filter(Boolean)));
        const defaultMeasurementDays = (row.measurementPlans||[]).length > 0 ? Math.max(...(row.measurementPlans||[]).map(p => Number(p.days||0))) : 7;
        
        const overrides = (window.__bizOverrides && window.__bizOverrides[projectId]) || {};
        const selectedItems = Array.isArray(overrides.selectedItems) && overrides.selectedItems.length ? overrides.selectedItems : defaultItems;
        const buildStatsTable = (stats, overridesItems) => {
            const keys = Object.keys(stats).sort();
            if (!keys.length) return '<tr><td class="p-2 text-slate-500" colspan="6">선택된 품목계열이 없습니다. 위에서 품목계열을 선택해주세요.</td></tr>';
            return keys.map(it => {
                const key = it.replace(/[^\w]/g,'_');
                const defDevices = stats[it]?.sites || 0;
                const defDays = stats[it]?.siteDays || 0;
                const ovr = overridesItems && overridesItems[it] ? overridesItems[it] : {};
                const devices = ovr.requiredDevices ?? defDevices;
                const days = ovr.requiredSiteDays ?? defDays;
                const cats = [...new Set(itemToCats[it] || [])].sort(); // 중복 제거 및 정렬
                const selectedCats = Array.isArray(ovr.selectedCategories) ? ovr.selectedCategories : (ovr.selectedCategory ? [ovr.selectedCategory] : []);
                const catCheckboxes = cats.map((c, idx) => {
                    const count = (catToEquipment[c] || []).length;
                    const checked = selectedCats.includes(c) ? 'checked' : '';
                    const checkboxId = `ovr-cat-${key}-${idx}`;
                    return `<label class="flex items-center gap-1 mb-1 text-xs">
                        <input type="checkbox" id="${checkboxId}" value="${c}" ${checked} class="ovr-cat-checkbox" data-item="${it}">
                        <span class="truncate" title="${c}">${c} (${count}대)</span>
                    </label>`;
                }).join('');
                
                // 품목계열 장비별 가동률 예측 계산
                // 1. 선택된 품목계열들의 총 보유 장비 수 (중복 선택 가능)
                const ownedCount = selectedCats.reduce((total, cat) => {
                    return total + (catToEquipment[cat] || []).length;
                }, 0);
                
                // 2. 4분기 영업일수 계산 (2025-10-01 ~ 2025-12-31, 주말 제외)
                const Q4_FROM = new Date('2025-10-01');
                const Q4_TO = new Date('2025-12-31');
                const Q4_BUSINESS_DAYS = countBusinessDays(Q4_FROM, Q4_TO);
                
                // 3. 총 가용 장비-일 계산 = 보유 장비 수 × 4분기 영업일수
                const capacityDays = ownedCount * Q4_BUSINESS_DAYS;
                
                // 4. 가동률 계산 = (필요 지점-일 ÷ 총 가용 장비-일) × 100%
                const utilizationPct = capacityDays > 0 ? Math.min(100, Math.round((days / capacityDays) * 100)) : 0;
                const utilizationClass = utilizationPct >= 80 ? 'text-red-600 font-semibold' : utilizationPct >= 60 ? 'text-orange-600' : 'text-green-600';
                
                return `<tr>
                    <td class="p-2">${it}</td>
                    <td class="p-2"><input type="number" min="0" id="ovr-dev-${key}" class="px-2 py-1 border rounded w-24" value="${devices}"></td>
                    <td class="p-2"><input type="number" min="0" id="ovr-days-${key}" class="px-2 py-1 border rounded w-28" value="${days}"></td>
                    <td class="p-2">
                        <div class="max-h-20 overflow-y-auto text-xs">
                            ${catCheckboxes || '<span class="text-slate-400">사용 가능한 품목계열 없음</span>'}
                        </div>
                    </td>
                    <td class="p-2 text-xs ${utilizationClass}">${utilizationPct}% (${ownedCount}대)</td>
                    <td class="p-2 text-xs text-slate-600">${cats.length}종류</td>
                </tr>`;
            }).join('');
        };
        const ITEM_CHOICES = ['PM-10','PM-2.5','NO2','SO2','CO','O3','Pb','벤젠'];
        const itemsPicker = ITEM_CHOICES.map(it => {
            const checked = selectedItems.includes(it) ? 'checked' : '';
            const id = `ovr-item-${it.replace(/[^\w]/g,'_')}`;
            return `<label class=\"inline-flex items-center gap-2 mr-3 mb-2\"><input type=\"checkbox\" class=\"ovr-item\" id=\"${id}\" value=\"${it}\" ${checked}> <span>${it}</span></label>`;
        }).join('');
        // 렌더
        el.innerHTML = `
            <div><span class=\"text-slate-500\">사업명</span><div class=\"mt-1 font-medium\">${(row.projectName||'').replace(/</g,'&lt;')}</div></div>
            <div><span class=\"text-slate-500\">의뢰사</span><div class=\"mt-1\">${(row.client||'').replace(/</g,'&lt;')}</div></div>
            <div class=\"grid grid-cols-1 md:grid-cols-2 gap-3\">
                <div><span class=\"text-slate-500\">계약기간 시작</span><div class=\"mt-1\"><input id=\"ovr-period-from\" type=\"date\" class=\"px-2 py-1 border rounded\" value=\"${overrides.periodFrom ?? (row.period?.from||'')}\"></div></div>
                <div><span class=\"text-slate-500\">계약기간 종료</span><div class=\"mt-1\"><input id=\"ovr-period-to\" type=\"date\" class=\"px-2 py-1 border rounded\" value=\"${overrides.periodTo ?? (row.period?.to||'')}\"></div></div>
            </div>
            <div class=\"grid grid-cols-1 gap-3\">
                <div><span class=\"text-slate-500\">집행 정보</span></div>
                <div class=\"grid grid-cols-1 md:grid-cols-4 gap-4\">
                    <div>
                        <span class=\"text-xs text-slate-600\">공사 집행</span>
                        <div class=\"flex gap-1 mt-1\">
                            <select id=\"ovr-exec-construction-period\" class=\"px-2 py-1 border rounded text-xs flex-1\">
                                <option value=\"total\" ${(overrides.execConstructionPeriod ?? 'total') === 'total' ? 'selected' : ''}>총</option>
                                <option value=\"half\" ${(overrides.execConstructionPeriod ?? 'total') === 'half' ? 'selected' : ''}>반기</option>
                                <option value=\"quarter\" ${(overrides.execConstructionPeriod ?? 'total') === 'quarter' ? 'selected' : ''}>분기</option>
                                <option value=\"month\" ${(overrides.execConstructionPeriod ?? 'total') === 'month' ? 'selected' : ''}>월</option>
                            </select>
                            <input id=\"ovr-exec-construction-count\" type=\"number\" min=\"0\" class=\"px-2 py-1 border rounded w-12 text-xs\" value=\"${overrides.execConstructionCount ?? (ex.construction||0)}\">
                            <span class=\"text-xs self-center\">회</span>
                        </div>
                    </div>
                    <div>
                        <span class=\"text-xs text-slate-600\">운영 집행</span>
                        <div class=\"flex gap-1 mt-1\">
                            <select id=\"ovr-exec-operation-period\" class=\"px-2 py-1 border rounded text-xs flex-1\">
                                <option value=\"total\" ${(overrides.execOperationPeriod ?? 'quarter') === 'total' ? 'selected' : ''}>총</option>
                                <option value=\"half\" ${(overrides.execOperationPeriod ?? 'quarter') === 'half' ? 'selected' : ''}>반기</option>
                                <option value=\"quarter\" ${(overrides.execOperationPeriod ?? 'quarter') === 'quarter' ? 'selected' : ''}>분기</option>
                                <option value=\"month\" ${(overrides.execOperationPeriod ?? 'quarter') === 'month' ? 'selected' : ''}>월</option>
                            </select>
                            <input id=\"ovr-exec-operation-count\" type=\"number\" min=\"0\" class=\"px-2 py-1 border rounded w-12 text-xs\" value=\"${overrides.execOperationCount ?? (ex.operation||0)}\">
                            <span class=\"text-xs self-center\">회</span>
                        </div>
                    </div>
                    <div>
                        <span class=\"text-xs text-slate-600\">사후 집행</span>
                        <div class=\"flex gap-1 mt-1\">
                            <select id=\"ovr-exec-post-period\" class=\"px-2 py-1 border rounded text-xs flex-1\">
                                <option value=\"total\" ${(overrides.execPostPeriod ?? 'month') === 'total' ? 'selected' : ''}>총</option>
                                <option value=\"half\" ${(overrides.execPostPeriod ?? 'month') === 'half' ? 'selected' : ''}>반기</option>
                                <option value=\"quarter\" ${(overrides.execPostPeriod ?? 'month') === 'quarter' ? 'selected' : ''}>분기</option>
                                <option value=\"month\" ${(overrides.execPostPeriod ?? 'month') === 'month' ? 'selected' : ''}>월</option>
                            </select>
                            <input id=\"ovr-exec-post-count\" type=\"number\" min=\"0\" class=\"px-2 py-1 border rounded w-12 text-xs\" value=\"${overrides.execPostCount ?? (ex.post||0)}\">
                            <span class=\"text-xs self-center\">회</span>
                        </div>
                    </div>
                    <div>
                        <span class=\"text-xs text-slate-600\">전략 집행</span>
                        <div class=\"flex gap-1 mt-1\">
                            <select id=\"ovr-exec-strategy-period\" class=\"px-2 py-1 border rounded text-xs flex-1\">
                                <option value=\"total\" ${(overrides.execStrategyPeriod ?? 'total') === 'total' ? 'selected' : ''}>총</option>
                                <option value=\"half\" ${(overrides.execStrategyPeriod ?? 'total') === 'half' ? 'selected' : ''}>반기</option>
                                <option value=\"quarter\" ${(overrides.execStrategyPeriod ?? 'total') === 'quarter' ? 'selected' : ''}>분기</option>
                                <option value=\"month\" ${(overrides.execStrategyPeriod ?? 'total') === 'month' ? 'selected' : ''}>월</option>
                            </select>
                            <input id=\"ovr-exec-strategy-count\" type=\"number\" min=\"0\" class=\"px-2 py-1 border rounded w-12 text-xs\" value=\"${overrides.execStrategyCount ?? (ex.strategy||0)}\">
                            <span class=\"text-xs self-center\">회</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class=\"grid grid-cols-1 md:grid-cols-2 gap-3\">
                <div><span class=\"text-slate-500\">총 지점수</span><div class=\"mt-1\"><input id=\"ovr-total-sites\" type=\"number\" min=\"0\" class=\"px-2 py-1 border rounded w-24\" value=\"${overrides.totalSites ?? ((row.siteCounts?.manual||0) + (row.siteCounts?.automatic||0))}\"></div></div>
                <div><span class=\"text-slate-500\">연속 측정 일수</span><div class=\"mt-1\"><input id=\"ovr-measurement-days\" type=\"number\" min=\"0\" max=\"14\" class=\"px-2 py-1 border rounded w-24\" value=\"${overrides.measurementDays ?? defaultMeasurementDays}\" placeholder=\"일\"></div></div>
            </div>
            <div class=\"mt-3\">
                <span class=\"text-slate-500\">사용 품목계열(복수 선택)</span>
                <div class=\"mt-2\">${itemsPicker}</div>
            </div>
            <div class=\"mt-3\">
                <span class=\"text-slate-500\">필요 장비/일수(항목별)</span>
                <div class=\"overflow-x-auto mt-1\">
                    <table class=\"w-full text-sm\">
                        <thead class=\"bg-slate-100\"><tr><th class=\"text-left p-2\">항목</th><th class=\"text-left p-2\">필요 대수</th><th class=\"text-left p-2\">필요 일수</th><th class=\"text-left p-2\">품목계열 선택</th><th class=\"text-left p-2\">예상 가동률</th><th class=\"text-left p-2\">비고</th></tr></thead>
                        <tbody id=\"ovr-stats-body\"></tbody>
                    </table>
                </div>
            </div>
            <div class=\"mt-3\">
                <div class=\"flex items-center gap-2 justify-end\">
                    <button class=\"px-3 py-1.5 bg-indigo-600 text-white rounded\" onclick=\"saveBusinessOverrides('${row.projectId}')\">저장</button>
                </div>
            </div>
        `;
        // 초기 통계 렌더
        document.getElementById('ovr-stats-body').innerHTML = buildStatsTable(__computeStats(row, selectedItems, overrides), overrides.items);
        // 품목계열 체크박스 변경 시 동적으로 테이블 행 추가/제거
        const updateStatsTable = () => {
            const picked = Array.from(el.querySelectorAll('.ovr-item')).filter(x=>x.checked).map(x=>x.value);
            // 현재 오버라이드 데이터에 선택된 품목계열 정보 업데이트
            overrides.selectedItems = picked;
            // 선택된 항목만으로 통계 계산 및 테이블 업데이트
            const stats = __computeStats(row, picked, overrides);
            document.getElementById('ovr-stats-body').innerHTML = buildStatsTable(stats, overrides.items);
            // 새로 추가된 체크박스에도 이벤트 리스너 재연결
            attachCategoryListeners();
        };
        
        el.querySelectorAll('.ovr-item').forEach(cb => {
            cb.addEventListener('change', updateStatsTable);
        });
        
        // 지점수와 측정 일수 변경 시에도 실시간 업데이트
        const totalSitesInput = document.getElementById('ovr-total-sites');
        const measurementDaysInput = document.getElementById('ovr-measurement-days');
        
        if (totalSitesInput) {
            totalSitesInput.addEventListener('input', () => {
                overrides.totalSites = Number(totalSitesInput.value || 0);
                updateStatsTable();
            });
        }
        
        if (measurementDaysInput) {
            measurementDaysInput.addEventListener('input', () => {
                overrides.measurementDays = Number(measurementDaysInput.value || 7);
                updateStatsTable();
            });
        }
        
        // 품목계열 체크박스 변경 시 가동률 재계산
        const attachCategoryListeners = () => {
            el.querySelectorAll('.ovr-cat-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', () => {
                    // 품목계열 선택 정보를 오버라이드에 저장
                    updateCategoryOverrides();
                    // 테이블 업데이트 (가동률 재계산)
                    updateStatsTable();
                });
            });
        };
        
        // 품목계열 선택 정보를 오버라이드에 저장
        const updateCategoryOverrides = () => {
            const items = ['PM-10','PM-2.5','NO2','SO2','CO','O3','Pb','벤젠'];
            items.forEach(item => {
                const checkedBoxes = Array.from(el.querySelectorAll(`.ovr-cat-checkbox[data-item="${item}"]:checked`));
                const selectedCategories = checkedBoxes.map(cb => cb.value);
                if (!overrides.items) overrides.items = {};
                if (!overrides.items[item]) overrides.items[item] = {};
                overrides.items[item].selectedCategories = selectedCategories;
            });
        };
        
        attachCategoryListeners();
        bd.classList.remove('hidden');
        modal.classList.remove('hidden');
    } catch {}
}

async function saveBusinessOverrides(projectId){
    try {
        const itemIds = ['PM-10','PM-2.5','NO2','SO2','CO','O3','Pb','벤젠'].map(it => ({ it, id: `ovr-item-${it.replace(/[^\w]/g,'_')}` }));
        const selectedItems = itemIds.filter(x => document.getElementById(x.id)?.checked).map(x => x.it);
        const body = {
            projectId,
            overrides: {
                // 계약기간
                periodFrom: document.getElementById('ovr-period-from')?.value || '',
                periodTo: document.getElementById('ovr-period-to')?.value || '',
                // 집행 정보 (주기 + 횟수)
                execConstructionPeriod: document.getElementById('ovr-exec-construction-period')?.value || 'total',
                execConstructionCount: Number(document.getElementById('ovr-exec-construction-count')?.value||0),
                execOperationPeriod: document.getElementById('ovr-exec-operation-period')?.value || 'quarter',
                execOperationCount: Number(document.getElementById('ovr-exec-operation-count')?.value||0),
                execPostPeriod: document.getElementById('ovr-exec-post-period')?.value || 'month',
                execPostCount: Number(document.getElementById('ovr-exec-post-count')?.value||0),
                execStrategyPeriod: document.getElementById('ovr-exec-strategy-period')?.value || 'total',
                execStrategyCount: Number(document.getElementById('ovr-exec-strategy-count')?.value||0),
                // 지점 수 및 측정 일수
                totalSites: Number(document.getElementById('ovr-total-sites')?.value||0),
                measurementDays: Number(document.getElementById('ovr-measurement-days')?.value||7),
                // 하위 호환성을 위해 manual/automatic도 저장 (totalSites를 반반 분할)
                manual: Math.floor(Number(document.getElementById('ovr-total-sites')?.value||0) / 2),
                automatic: Math.ceil(Number(document.getElementById('ovr-total-sites')?.value||0) / 2),
                selectedItems,
                items: (()=>{
                    const out = {};
                    selectedItems.forEach(it => {
                        const key = it.replace(/[^\w]/g,'_');
                        // 선택된 품목계열들 수집
                        const selectedCategories = Array.from(document.querySelectorAll(`.ovr-cat-checkbox[data-item="${it}"]:checked`))
                            .map(cb => cb.value);
                        
                        out[it] = {
                            requiredDevices: Number(document.getElementById(`ovr-dev-${key}`)?.value||0),
                            requiredSiteDays: Number(document.getElementById(`ovr-days-${key}`)?.value||0),
                            selectedCategories: selectedCategories,
                            // 하위 호환성을 위해 첫 번째 선택된 항목을 selectedCategory로도 저장
                            selectedCategory: selectedCategories.length > 0 ? selectedCategories[0] : ''
                        };
                    });
                    return out;
                })()
            }
        };
        const res = await fetch('/api/business-overrides/save', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
        const j = await res.json();
        if (!j.ok) throw new Error(j.message||'save failed');
        
        // 오버라이드 데이터 업데이트
        if (!window.__bizOverrides) window.__bizOverrides = {};
        window.__bizOverrides[projectId] = body.overrides;
        
        // 모달 닫기
        hideBusinessDetail();
        
        // 테이블 새로고침
        loadBusinessContracts();
        
        alert('저장되었습니다.');
    } catch(e){ alert('저장 실패: '+ (e.message||e)); }
}

function hideBusinessDetail(){
    try {
        document.getElementById('business-detail-backdrop')?.classList.add('hidden');
        document.getElementById('business-detail-modal')?.classList.add('hidden');
    } catch {}
}

// 사업 섹션으로 스크롤
function scrollToBusinessSection(sectionType) {
    try {
        const element = document.getElementById(`business-section-${sectionType}`);
        if (element) {
            element.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start',
                inline: 'nearest'
            });
            // 섹션 하이라이트 효과
            element.classList.add('ring-2', 'ring-blue-200', 'ring-opacity-50');
            setTimeout(() => {
                element.classList.remove('ring-2', 'ring-blue-200', 'ring-opacity-50');
            }, 2000);
        }
    } catch (e) {
        console.warn('스크롤 실패:', e);
    }
}

// 사업 완료 상태 토글 (로컬 스토리지 백업)
async function toggleBusinessCompletion(projectId, completed) {
    try {
        const body = {
            projectId,
            completed: Boolean(completed),
            updatedAt: new Date().toISOString()
        };
        
        // 먼저 로컬 스토리지에 저장 (백업)
        const localData = JSON.parse(localStorage.getItem('businessCompletion') || '{}');
        localData[projectId] = { completed: Boolean(completed), updatedAt: body.updatedAt };
        localStorage.setItem('businessCompletion', JSON.stringify(localData));
        
        // 백엔드 서버 저장 시도
        try {
            const res = await fetch('/api/business-completion/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            
            // HTML 응답 체크 (서버가 꺼진 경우)
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('text/html')) {
                console.warn('백엔드 서버가 실행되지 않았습니다. 로컬 스토리지만 사용합니다.');
            } else {
                const result = await res.json();
                if (result.ok) {
                    console.log('✅ 백엔드 서버에도 저장됨');
                }
            }
        } catch (serverError) {
            console.warn('백엔드 저장 실패, 로컬 스토리지만 사용:', serverError.message);
        }
        
        // 로컬 상태 업데이트
        if (!window.__businessCompletion) window.__businessCompletion = {};
        window.__businessCompletion[projectId] = { completed: Boolean(completed), updatedAt: body.updatedAt };
        
        // 테이블 새로고침
        loadBusinessContracts();
        
        console.log(`✅ 사업 완료 상태 업데이트: ${projectId} = ${completed}`);
    } catch (e) {
        console.error('완료 상태 저장 실패:', e);
        alert('완료 상태 저장에 실패했습니다: ' + (e.message || e));
        // 체크박스 상태 되돌리기
        const checkbox = document.querySelector(`input[data-project-id="${projectId}"]`);
        if (checkbox) checkbox.checked = !completed;
    }
}

// 전역 바인딩 (인라인 onclick 사용 대비)
try {
    if (typeof window !== 'undefined') {
        window.openBusinessDetail = openBusinessDetail;
        window.saveBusinessOverrides = saveBusinessOverrides;
        window.toggleBusinessCompletion = toggleBusinessCompletion;
        window.scrollToBusinessSection = scrollToBusinessSection;
    }
} catch {}
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
        try {
            if (viewName === 'uptime-predictions') {
                if (typeof loadUptimePredictions === 'function') loadUptimePredictions();
            } else if (viewName === 'business') {
                if (typeof loadBusinessContracts === 'function') loadBusinessContracts();
            }
        } catch (e) { console.warn('뷰 초기화 실패:', e); }
        
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
        try { initDashboardCharts(); } catch(e) { console.warn(e); }
        try { if (typeof updateNextWeekUptimeTable === 'function') updateNextWeekUptimeTable(); } catch(e) {}
    }
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
// 전역 함수 즉시 바인딩(안전망)
try {
    if (typeof window !== 'undefined') {
        window.toggleSubmenu = toggleSubmenu;
    }
} catch {}
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
    
    // 기본 시드: 장비관리 진행상태 PDF(테스트용). 새로고침 유지(localStorage)
    let items = [];
    try { items = JSON.parse(localStorage.getItem('education_items')||'[]')||[]; } catch { items = []; }
    if (!items.length) {
        const seedPath = '청명장비 엑셀/2025.05 장비관리 진행상태.pdf';
        items = [{
            id: 'seed-progress-202505',
            title: '장비관리 진행상태 (2025.05)',
            date: new Date().toISOString().slice(0,10),
            fileUrl: seedPath,
            fileName: '2025.05 장비관리 진행상태.pdf',
            attendees: [],
            note: '테스트 자료(기본값)',
            status: '완료'
        }];
        try { localStorage.setItem('education_items', JSON.stringify(items)); } catch {}
    }
    // 서버 저장 자료 동기화(최초 1회): 업로더가 저장한 /assets/education 하위 PDF를 리스트로 병합
    if (!window.__eduListSynced) {
        window.__eduListSynced = true;
        (async ()=>{
            try {
                const resp = await fetch('http://localhost:5173/api/education/list', { cache: 'no-store' });
                const j = await resp.json().catch(()=>({ ok:false }));
                if (resp.ok && j && j.ok && Array.isArray(j.items)){
                    let current = [];
                    try { current = JSON.parse(localStorage.getItem('education_items')||'[]')||[]; } catch { current = []; }
                    const map = new Map((current||[]).map(x=>[x.id,x]));
                    for (const it of j.items){ map.set(it.id, Object.assign({}, map.get(it.id), it)); }
                    const merged = Array.from(map.values());
                    try { localStorage.setItem('education_items', JSON.stringify(merged)); } catch {}
                }
            } catch {}
            try { renderEducationTable(); } catch {}
        })();
    }
    if (!items.length) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-slate-500">교육 데이터가 없습니다.</td></tr>';
        return;
    }
    // 상단 토글 상태 및 렌더링
    window.__eduCat1 = window.__eduCat1 || '전체';
    window.__eduCat2 = window.__eduCat2 || '전체';
    const t1 = document.getElementById('edu-toggle-cat1');
    const t2 = document.getElementById('edu-toggle-cat2');
    function drawToggles(container, options, selected, onClick){
        if (!container) return;
        container.innerHTML = options.map(v=>`<button data-v="${v}" class="px-3 py-1.5 rounded border ${selected===v?'bg-indigo-600 text-white':'bg-white text-slate-700'}">${v}</button>`).join('');
        container.querySelectorAll('button').forEach(btn=> btn.addEventListener('click', ()=> onClick(btn.getAttribute('data-v'))));
    }
    if (t1){
        const level1 = ['전체','측정팀','실험분석팀','총무팀'];
        drawToggles(t1, level1, window.__eduCat1, (v)=>{ window.__eduCat1=v; window.__eduCat2='전체'; renderEducationTable(); });
    }
    let showLevel2 = false;
    if (t2){
        let level2 = [];
        if (window.__eduCat1==='측정팀') { level2 = ['전체','환경대기팀','대기자가팀','수질팀','해양팀','소음,진동팀','악취팀']; showLevel2=true; }
        else if (window.__eduCat1==='실험분석팀') { level2 = ['전체','대기분석팀','수질분석팀','해양분석팀','소음,진동 분석팀','악취분석팀']; showLevel2=true; }
        if (showLevel2) { t2.parentElement.classList.remove('hidden'); drawToggles(t2, level2, window.__eduCat2, (v)=>{ window.__eduCat2=v; renderEducationTable(); }); }
        else { t2.innerHTML=''; try { t2.parentElement.classList.add('hidden'); } catch {} }
    }
    // 필터링
    let list = items.slice();
    if (window.__eduCat1 && window.__eduCat1 !== '전체') list = list.filter(it => String(it.cat1||'') === window.__eduCat1);
    if (showLevel2 && window.__eduCat2 && window.__eduCat2 !== '전체') list = list.filter(it => String(it.cat2||'') === window.__eduCat2);
    const frag = document.createDocumentFragment();
    list.forEach(it => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-2 whitespace-nowrap">${it.date||''}</td>
            <td class="p-2">${it.title||''}</td>
            <td class="p-2">${it.cat1||'-'}</td>
            <td class="p-2">${it.cat2||'-'}</td>
            <td class="p-2">${(it.attendees||[]).join(', ')||'-'}</td>
            <td class="p-2">${it.note||''}</td>
            <td class="p-2">${it.status||'완료'}</td>
            <td class="p-2">${it.fileName?`<button class="text-indigo-600 underline" data-file="${it.fileUrl||''}">보기</button>`:'-'}</td>
            <td class="p-2"><button class="text-rose-600 underline" data-del="${it.id}">삭제</button></td>
        `;
        const viewBtn = tr.querySelector('button[data-file]');
        if (viewBtn) viewBtn.addEventListener('click', (e)=>{ e.stopPropagation(); openPdfInModal(viewBtn.getAttribute('data-file')); });
        const delBtn = tr.querySelector('button[data-del]');
        if (delBtn) delBtn.addEventListener('click', ()=>{ deleteEducationItem(it.id); });
        frag.appendChild(tr);
    });
    tableBody.innerHTML = '';
    tableBody.appendChild(frag);
}

// 수리 폼 표시
function showRepairForm() {
    alert('수리 등록 폼을 표시합니다.');
}

// 교육 폼 표시
function showEducationForm() {
    const modal = document.getElementById('education-create-modal');
    if (modal) modal.classList.remove('hidden');
}
function closeEducationForm(){ const modal=document.getElementById('education-create-modal'); if(modal) modal.classList.add('hidden'); }
async function saveEducationItem(){
    const title = document.getElementById('edu-title')?.value?.trim();
    const date = document.getElementById('edu-date')?.value;
    const cat1 = document.getElementById('edu-cat1')?.value || '전체';
    const cat2 = document.getElementById('edu-cat2')?.value || '-';
    const fileInput = document.getElementById('edu-file');
    if (!title){ alert('교육명을 입력하세요.'); return; }
    const items = JSON.parse(localStorage.getItem('education_items')||'[]');
    const id = 'edu_'+Date.now();
    let fileUrl = '' , fileName='';
    const f = fileInput?.files?.[0];
    if (f){
        if (!/pdf$/i.test(f.name)) { alert('HWP/HWPX는 PDF로 변환 후 업로드해주세요.'); return; }
        try {
            const form = new FormData();
            form.append('file', f);
            form.append('cat1', cat1);
            form.append('cat2', cat2);
            form.append('date', date || new Date().toISOString().slice(0,10));
            const base = 'http://localhost:5173';
            const resp = await fetch(`${base.replace(/\/$/, '')}/api/education/upload`, { method: 'POST', body: form });
            const txt = await resp.text();
            let j = {};
            try { j = JSON.parse(txt); } catch { j = { ok:false, message: txt || 'Invalid response' }; }
            if (!resp.ok || !j.ok) throw new Error(j.message || '업로드 실패');
            fileUrl = j.url; // /assets/education/.../filename.pdf
            fileName = f.name;
        } catch (e) {
            alert('업로드 실패: ' + (e.message||e));
            return;
        }
    }
    const rec = { id, title, date, cat1, cat2, fileUrl, fileName, attendees:[], note:'', status:'완료' };
    items.unshift(rec);
    localStorage.setItem('education_items', JSON.stringify(items));
    closeEducationForm();
    renderEducationTable();
}
function deleteEducationItem(id){
    const items = JSON.parse(localStorage.getItem('education_items')||'[]');
    const next = items.filter(x=>x.id!==id);
    localStorage.setItem('education_items', JSON.stringify(next));
    renderEducationTable();
}

// ===== PDF.js 임베드 뷰어 =====
// 간단 로더(동적 import 대체). pdfjs-dist를 CDN으로 로드했을 때를 가정하거나, 없으면 <embed> 폴백.
async function openPdfInModal(url){
    const modal = document.getElementById('pdf-viewer-modal');
    const container = document.getElementById('pdf-viewer-container');
    if (!modal || !container){ window.open(url, '_blank'); return; }
    container.innerHTML = '';
    modal.classList.remove('hidden');
    try {
        // 전역 PDFJS가 있으면 사용, 없으면 <embed> 폴백
        if (window['pdfjsLib']){
            const pdf = await window.pdfjsLib.getDocument(url).promise;
            let scale = 1.2;
            async function renderPage(num){
                const page = await pdf.getPage(num);
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = viewport.width; canvas.height = viewport.height;
                container.appendChild(canvas);
                await page.render({ canvasContext: ctx, viewport }).promise;
            }
            for (let i=1;i<=pdf.numPages;i++) await renderPage(i);
            const zin = document.getElementById('pdf-zoom-in');
            const zout = document.getElementById('pdf-zoom-out');
            if (zin && zout){
                zin.onclick = async ()=>{ scale = Math.min(scale+0.1, 3); container.innerHTML=''; for(let i=1;i<=pdf.numPages;i++) await renderPage(i); };
                zout.onclick = async ()=>{ scale = Math.max(scale-0.1, 0.5); container.innerHTML=''; for(let i=1;i<=pdf.numPages;i++) await renderPage(i); };
            }
        } else {
            const embed = document.createElement('embed');
            embed.type = 'application/pdf';
            embed.src = url; embed.style.width='100%'; embed.style.height='100%';
            container.appendChild(embed);
        }
    } catch (e){ console.warn('PDF 내장 뷰어 실패, 새 탭으로 엽니다.', e); window.open(url, '_blank'); }
}
function closePdfViewer(){ const modal=document.getElementById('pdf-viewer-modal'); if(modal) modal.classList.add('hidden'); const container=document.getElementById('pdf-viewer-container'); if(container) container.innerHTML=''; }

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
    // 확인 필요 알림(KPI): 장기간 업체 입고 + 장기간 가동률 저하 + 정도검사 예정 총합
    try {
        const longStayCount = (function(){
            const today = new Date();
            return (equipmentData||[]).reduce((acc,e)=>{
                const last = parseYmdSafe(e.lastMovement);
                const days = last ? Math.floor((today - last)/(1000*60*60*24)) : null;
                const isVendor = /업체/.test(String(e.currentLocation||'')) || /수리중/.test(String(e.status||''));
                return acc + ((isVendor && days!==null && days>=30) ? 1 : 0);
            },0);
        })();
        const lowUtilCount = (function(){
            const to = new Date();
            const from = new Date(to.getFullYear(), to.getMonth()-3, to.getDate());
            function mapType(name){ const s=(name||'').toString(); if (/현장|출장/.test(s)) return 'site'; if (/청명|본사|창고|CEMS|CMES|본사 창고/.test(s)) return 'cmes'; return 'vendor'; }
            function buildIntervals(moves){
                const asc = (moves||[]).filter(m=>m.date).sort((a,b)=> new Date(a.date)-new Date(b.date));
                const within = asc.filter(m => new Date(m.date) >= from && new Date(m.date) <= to);
                let cur='cmes';
                const prior = asc.filter(m=> new Date(m.date)<from).sort((a,b)=> new Date(b.date)-new Date(a.date))[0];
                if (prior && (prior.inLocation||prior.outLocation)) cur = mapType(prior.inLocation||prior.outLocation);
                let last=new Date(from); const res=[];
                within.forEach(m=>{ const next=mapType(m.inLocation||m.outLocation); res.push({start:new Date(last), end:new Date(m.date), type:cur}); cur=next; last=new Date(m.date); });
                res.push({start:new Date(last), end:new Date(to), type:cur});
                return res;
            }
            const rows = (equipmentData||[]).map(e=>{
                const moves = (movementsData||[]).filter(m=>m.serial===e.serial);
                const intervals = buildIntervals(moves);
                const trips = intervals.filter(iv=>iv.type==='site').length;
                return { currentLocation:e.currentLocation||'', trips };
            }).filter(r=> r.trips===0 && !/청명\s*지하/.test(r.currentLocation||'') && !/본사\s*창고/.test(r.currentLocation||''));
            return rows.length;
        })();
        const qcCount = (function(){
            const today = new Date();
            const ym = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0');
            const rows = Array.isArray(qcLogsData) ? qcLogsData : [];
            return rows.filter(log=>{ const d=log&&log.next_calibration_date; if(!d) return false; const dt=new Date(d); if(isNaN(dt)) return false; const key = dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0'); return key===ym; }).length;
        })();
        updateKpiElement('pending-alerts', (longStayCount + lowUtilCount + qcCount) + ' 건');
    } catch(e) { try { updateKpiElement('pending-alerts', '0 건'); } catch(_){} }
}

// 장기간 업체 입고(30일+) 알림 렌더링
function renderVendorLongStayAlerts() {
    const container = document.getElementById('vendor-longstay-alerts');
    if (!container) return;
    const today = new Date();
    const items = (equipmentData || []).map(e => {
        const last = parseYmdSafe(e.lastMovement);
        const days = last ? Math.floor((today - last) / (1000*60*60*24)) : null;
        const isVendor = /업체/.test(String(e.currentLocation||'')) || /수리중/.test(String(e.status||''));
        return { serial: e.serial, category: e.category, currentLocation: e.currentLocation, status: e.status, days, lastStr: formatYmd(last), isVendor };
    }).filter(r => r.isVendor && (r.days !== null && r.days >= 30))
      .sort((a,b)=> b.days - a.days);

    const count = items.length;
    const btnId = 'longstay-toggle';
    const panelId = 'longstay-details';

    const detailHtml = items.slice(0, 100).map(r => {
        const staff = getMovementStaffName(r.serial, r.lastStr) || '-';
        const ackId = `ack_longstay_${r.serial}`;
        const noteId = `note_longstay_${r.serial}`;
        const checked = localStorage.getItem(ackId) === '1';
        const noteVal = localStorage.getItem(noteId) || '';
        return `
        <div class="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded">
            <div class="flex items-center">
                <svg class="w-5 h-5 text-yellow-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <span class="text-yellow-800 font-medium">${r.serial}</span>
                <span class="ml-2 text-slate-700">${r.category || ''}</span>
                <span class="ml-3 text-slate-500">${r.currentLocation || ''} • ${r.status || ''} • 담당자: ${staff}</span>
            </div>
            <div class="flex items-center gap-3">
                <div class="text-sm text-yellow-700">${r.days}일 경과 (최근입고: ${r.lastStr || '-'})</div>
                <label class="text-sm text-slate-700 flex items-center gap-1"><input type="checkbox" data-ack-id="${ackId}" ${checked?'checked':''}/> 확인</label>
                <input type="text" data-note-id="${noteId}" value="${noteVal.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}" placeholder="비고" class="px-2 py-1 border rounded text-sm w-56"/>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = `
        <button id="${btnId}" class="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700" aria-expanded="${count? 'true':'false'}" aria-controls="${panelId}">
            장기간 업체 입고(30일+): <span class="font-semibold">${count}</span>건
        </button>
        <div id="${panelId}" class="mt-3 ${count ? '' : 'hidden'} space-y-3">
            ${count ? detailHtml : '<div class="p-4 text-slate-500 border border-slate-200 rounded">장기간 업체 입고 장비가 없습니다.</div>'}
        </div>
    `;

    const btn = document.getElementById(btnId);
    const panel = document.getElementById(panelId);
    if (btn && panel) {
        btn.addEventListener('click', () => {
            const hidden = panel.classList.contains('hidden');
            panel.classList.toggle('hidden', !hidden);
            btn.setAttribute('aria-expanded', String(hidden));
        });
    }
    // 확인 체크 바인딩
    panel?.querySelectorAll('input[type="checkbox"][data-ack-id]').forEach(cb => {
        cb.addEventListener('change', function(){
            try { localStorage.setItem(this.getAttribute('data-ack-id'), this.checked ? '1' : '0'); } catch {}
        });
    });
    panel?.querySelectorAll('input[type="text"][data-note-id]').forEach(inp => {
        inp.addEventListener('input', function(){
            try { localStorage.setItem(this.getAttribute('data-note-id'), this.value || ''); } catch {}
        });
    });
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
    
    // 기간 필터 반영(장비탭 현황 섹션)
    let mode = '1y';
    try {
        const sel = document.getElementById('status-period-filter');
        if (sel) mode = sel.value || '1y';
        const label = document.getElementById('status-period-label');
        if (label) {
            if (mode === 'now') {
                const mv = Array.isArray(window.movementsData) ? window.movementsData : [];
                const dates = mv.map(m=> String(m?.date||'').slice(0,10)).filter(Boolean).sort();
                const last = dates[dates.length-1] || '';
                label.textContent = `(현재: ${last||'-'})`;
            } else {
                label.textContent = '(' + (mode==='1m'?'최근 1달':mode==='3m'?'최근 3개월':mode==='6m'?'최근 6개월':'최근 1년') + ')';
            }
        }
        if (sel && !sel.dataset.bound) {
            sel.dataset.bound = '1';
            sel.addEventListener('change', ()=> { try { renderCategoryStats(); } catch(e){ console.error(e); } });
        }
    } catch {}
    
    // 기간별 통계 계산 (폴백: 기존 로직)
    let categoryStats;
    try {
        if (typeof getCategoryStatisticsRange === 'function') {
            const ranged = getCategoryStatisticsRange(mode);
            if (Array.isArray(ranged) && ranged.length) {
                categoryStats = ranged.map(x=>({
                    category: x.category,
                    total: x.total,
                    operating: x.operating,
                    repair: x.repair,
                    idle: x.idle,
                    uptimeOverride: (mode==='now' ? undefined : x.avgUptime)
                }));
            }
        }
    } catch {}
    if (!categoryStats) {
        categoryStats = getCategoryStatistics();
    }

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
    // 기간 평균 요구사항: now 외 기간은 카테고리별 가동률(avgUptime 또는 대체값)의 단순 평균을 표시
    if (mode !== 'now' && Array.isArray(categoryStats) && categoryStats.length) {
        try {
            const vals = categoryStats.map(stat => {
                if (typeof stat.uptimeOverride === 'number') return stat.uptimeOverride;
                return stat.total > 0 ? Math.round((stat.operating / stat.total) * 100) : 0;
            });
            const avg = Math.round(vals.reduce((a,b)=> a+b, 0) / vals.length);
            overallStat.uptimeOverride = avg;

            // 하단 카운트(가동중/수리중/대기중)도 기간별 각 품목계열 값의 단순 평균으로 표시
            const n = categoryStats.length;
            const sumOperating = categoryStats.reduce((acc, s) => acc + (s.operating || 0), 0);
            const sumRepair    = categoryStats.reduce((acc, s) => acc + (s.repair    || 0), 0);
            const sumIdle      = categoryStats.reduce((acc, s) => acc + (s.idle      || 0), 0);
            overallStat.operating = Math.round(sumOperating / n);
            overallStat.repair    = Math.round(sumRepair    / n);
            overallStat.idle      = Math.round(sumIdle      / n);
        } catch {}
    }

    const allStats = [overallStat, ...categoryStats];

    container.innerHTML = allStats.map(stat => `
        <div class="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 cursor-pointer" 
             onclick="showCategoryDetail('${stat.category}')">
            <div class="text-center mb-3">
                <h4 class="font-medium text-slate-800">${stat.category}</h4>
                <div class="text-2xl font-bold text-slate-900 mt-1 inline-block">
                    <span class="mr-2 align-middle">${mode==='now'?'현재 가동률':'평균 가동률'}</span>
                    ${typeof stat.uptimeOverride === 'number' ? stat.uptimeOverride : Math.round(stat.total ? (stat.operating / stat.total) * 100 : 0)}%
                    <div class="mt-1 h-1.5 rounded ${ (typeof stat.uptimeOverride === 'number' ? stat.uptimeOverride : Math.round(stat.total ? (stat.operating / stat.total) * 100 : 0)) < 20 ? 'bg-red-300' : 'bg-blue-300' }"></div>
                </div>
                <div class="text-sm text-slate-500 mt-1">총 ${stat.total}대</div>
            </div>
            ${ (mode !== 'now' && stat.category === '전체') ? '' : `
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
            </div>`}
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
// 품목계열별 상세 정보 표시 → 우측 탭 선택으로 동작 변경
function showCategoryDetail(category) {
    try {
        // 탭이 아직 생성되지 않았다면 생성
        if (!document.querySelector('.product-series-tab')) {
            renderEquipmentTable();
        }
    } catch (e) {}
    // 해당 품목계열 탭 선택
    selectProductSeriesTab(category || '전체');
    // 탭 위치로 스크롤 (가시성 향상)
    const tabs = document.getElementById('product-series-tabs');
    if (tabs && typeof tabs.scrollIntoView === 'function') {
        tabs.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}
// 장비 목록 렌더링 (품목계열별 구분)
function renderEquipmentTable() {
    console.log('🔍 renderEquipmentTable 호출됨');
    console.log('🔍 equipmentData 길이:', equipmentData.length);
    
    // 품목계열별 탭 생성
    renderProductSeriesTabs();
    // 현재 선택 상태에 맞춰 목록 표시 (없으면 전체)
    const selected = (__selectedSeries && __selectedSeries.size) ? Array.from(__selectedSeries) : '전체';
    renderEquipmentTableBySeries(selected);
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
    allTab.className = 'px-4 py-2 rounded-lg text-sm font-medium product-series-tab';
    allTab.textContent = '전체';
    allTab.setAttribute('data-series', '전체');
    allTab.onclick = () => {
        __selectedSeries.clear();
        updateSeriesTabsActiveState();
        renderEquipmentTableBySeries('전체');
    };
    tabsContainer.appendChild(allTab);
    
    // 품목계열별 탭 생성
    productSeries.forEach(series => {
        if (series && series !== '기타') {
            const tab = document.createElement('button');
            tab.className = 'px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium product-series-tab hover:bg-gray-300';
            tab.textContent = series;
            tab.setAttribute('data-series', series);
            tab.onclick = () => {
                if (__selectedSeries.has(series)) {
                    __selectedSeries.delete(series);
                } else {
                    __selectedSeries.add(series);
                }
                const current = __selectedSeries.size ? Array.from(__selectedSeries) : '전체';
                updateSeriesTabsActiveState();
                renderEquipmentTableBySeries(current);
            };
            tabsContainer.appendChild(tab);
        }
    });

    // 초기 활성 상태 반영
    updateSeriesTabsActiveState();

    // 선택 초기화 토글 바인딩
    const resetBtn = document.getElementById('series-reset-toggle');
    if (resetBtn && !resetBtn.dataset.bound) {
        resetBtn.dataset.bound = '1';
        resetBtn.addEventListener('click', () => {
            __selectedSeries.clear();
            updateSeriesTabsActiveState();
            renderEquipmentTableBySeries('전체');
        });
    }

    // 가동률 정렬 토글 바인딩
    const utilBtn = document.getElementById('util-sort-toggle');
    if (utilBtn && !utilBtn.dataset.bound) {
        utilBtn.dataset.bound = '1';
        utilBtn.addEventListener('click', () => {
            // 토글 순서: null -> asc -> desc -> null
            __utilSort = __utilSort === null ? 'asc' : (__utilSort === 'asc' ? 'desc' : null);
            // 버튼 레이블 업데이트
            if (__utilSort === 'asc') utilBtn.textContent = '가동률 ▲';
            else if (__utilSort === 'desc') utilBtn.textContent = '가동률 ▼';
            else utilBtn.textContent = '가동률 ▷';
            const current = (__selectedSeries && __selectedSeries.size) ? Array.from(__selectedSeries) : '전체';
            renderEquipmentTableBySeries(current);
        });
    }
}

// 품목계열 탭 선택
function selectProductSeriesTab(series) {
    if (series === '전체') {
        __selectedSeries.clear();
        updateSeriesTabsActiveState();
        renderEquipmentTableBySeries('전체');
        return;
    }
    __selectedSeries = new Set([series]);
    updateSeriesTabsActiveState();
    renderEquipmentTableBySeries([series]);
}
// 품목계열별 장비 테이블 렌더링
function renderEquipmentTableBySeries(series) {
    const tableBody = document.getElementById('equipment-list-body');
    if (!tableBody) return;
    
    // 검색어와 상태 필터 적용
    const searchTerm = document.getElementById('equipment-search')?.value?.toLowerCase() || '';
    const statusFilter = document.getElementById('status-filter')?.value || 'all';
    
    let filteredData = equipmentData;
    
    // 품목계열 필터링 (category 기준) - 다중 선택 지원
    if (Array.isArray(series) && series.length) {
        const set = new Set(series);
        filteredData = filteredData.filter(item => set.has(item.category));
    } else if (series !== '전체') {
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
    
    // 테이블 내용 생성 (가동률 계산과 함께 정렬 옵션을 위해 임시 배열 구성)
    const rows = filteredData.map(item => {
        const mv = (movementsData || [])
            .filter(m => m.serial === item.serial && m.date)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        const util = calculateLastYearUtilization(item.serial, mv);
        return { item, util };
    });

    // 가동률 정렬 적용
    if (__utilSort === 'asc') {
        rows.sort((a, b) => a.util.percent - b.util.percent);
    } else if (__utilSort === 'desc') {
        rows.sort((a, b) => b.util.percent - a.util.percent);
    }

    tableBody.innerHTML = rows.map(({item, util}) => `
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
        </tr>`).join('');
}

function updateSeriesTabsActiveState() {
    const tabs = document.querySelectorAll('.product-series-tab');
    tabs.forEach(tab => {
        const name = tab.getAttribute('data-series') || tab.textContent;
        const isAll = name === '전체';
        const active = __selectedSeries.size ? __selectedSeries.has(name) : isAll;
        tab.classList.remove('active', 'bg-blue-600', 'text-white');
        tab.classList.remove('bg-gray-200', 'text-gray-700');
        if (active) {
            tab.classList.add('active', 'bg-blue-600', 'text-white');
        } else {
            tab.classList.add('bg-gray-200', 'text-gray-700');
        }
    });
}

// 장비 상세 정보 모달 표시
function normalizeSerialValue(s) {
    try { return String(s || '').replace(/\u200B/g,'').trim(); } catch { return String(s||''); }
}
function showEquipmentDetailModal(serial) {
    const normTarget = normalizeSerialValue(serial);
    let equipment = equipmentData.find(item => normalizeSerialValue(item.serial) === normTarget);
    if (!equipment) {
        // 보정: 대소문자/공백 차이 외에도 원천 DB 미합류 케이스 → movements 기반 카테고리 추정 시도
        try {
            const mv = (movementsData || []).filter(m => normalizeSerialValue(m.serial) === normTarget);
            if (mv && mv.length) {
                const last = mv.slice().sort((a,b)=> new Date(a.date) - new Date(b.date))[mv.length-1];
                equipment = {
                    serial: serial,
                    category: (equipmentData.find(e=> normalizeSerialValue(e.serial) === normTarget)?.category) || '-',
                    currentLocation: last?.inLocation || '-',
                    status: normalizeStatus(last?.inLocation||'')
                };
            }
        } catch {}
    if (!equipment) {
        alert('장비 정보를 찾을 수 없습니다.');
        return;
        }
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
    const rangeSel = document.getElementById('qc-range');
    const mode = rangeSel ? (rangeSel.value || 'month') : 'month';
    const monthLabel = `${today.getFullYear()}년 ${String(today.getMonth() + 1)}월`;

    // 기간 계산
    let label = monthLabel;
    let from = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
    let to = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
    if (mode === 'next3') {
        label = '향후 3개월';
        from = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
        to = new Date(today.getFullYear(), today.getMonth() + 3, 0, 23, 59, 59, 999);
    } else if (/^m(9|10|11|12)$/.test(mode)) {
        const m = Number(mode.slice(1));
        label = `${today.getFullYear()}년 ${m}월`;
        from = new Date(today.getFullYear(), m - 1, 1, 0, 0, 0, 0);
        to = new Date(today.getFullYear(), m, 0, 23, 59, 59, 999);
    }

    const rows = Array.isArray(qcLogsData) ? qcLogsData : [];
    const monthItems = rows
        .filter(log => {
        const dStr = log && log.next_calibration_date;
        if (!dStr) return false;
        const d = new Date(dStr);
        if (isNaN(d.getTime())) return false;
            return d >= from && d <= to;
        })
        .sort((a,b)=> new Date(a.next_calibration_date) - new Date(b.next_calibration_date));
    const count = monthItems.length;
    const btnId = 'qc-month-toggle';
    const panelId = 'qc-month-details';
    // 상세 알림 카드 HTML (최근 1년 가동률 + 상세보기 연동)
    const detailHtml = monthItems.map(log => {
        const nextDate = new Date(log.next_calibration_date);
        const daysUntil = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        let alertClass = 'bg-blue-50 border-blue-200';
        let iconClass = 'text-blue-500';
        let textClass = 'text-blue-800';
        if (daysUntil < 0) { alertClass = 'bg-red-50 border-red-200'; iconClass = 'text-red-500'; textClass = 'text-red-800'; }
        else if (daysUntil <= 7) { alertClass = 'bg-orange-50 border-orange-200'; iconClass = 'text-orange-500'; textClass = 'text-orange-800'; }
        else if (daysUntil <= 30) { alertClass = 'bg-yellow-50 border-yellow-200'; iconClass = 'text-yellow-500'; textClass = 'text-yellow-800'; }
        else { alertClass = 'bg-green-50 border-green-200'; iconClass = 'text-green-500'; textClass = 'text-green-800'; }

        // 가동률 계산
        let utilPct = 0; let utilClass = '';
        try {
            const serial = log.serial_number || '';
            const mv = (movementsData || []).filter(m => m.serial === serial && m.date).sort((a,b)=> new Date(a.date) - new Date(b.date));
            const util = calculateLastYearUtilization(serial, mv);
            utilPct = util.percent || 0;
            utilClass = util.className || '';
        } catch {}

        const serial = log.serial_number || '-';
        const onClick = serial && serial !== '-' ? `onclick=\"showEquipmentDetailModal('${serial}')\"` : '';
        // 품목계열, 제조사, 수리업체 표시 준비
        const equip = (equipmentData || []).find(e => e.serial === serial) || {};
        const category = equip.category || '-';
        const manufacturer = getManufacturerByCategory ? (getManufacturerByCategory(category) || '-') : '-';
        // 수리업체: 최근 1년 내 '정도검사' 수리 로그의 업체명 우선, 없으면 전체 최근 수리 업체
        let repairCompany = '-';
        try {
            const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
            const reps = (repairsData || []).filter(r => r.serial === serial);
            const calib = reps.filter(r => /정도검사/.test(String(r.repair_type || r.description || '')));
            const calibRecent = calib.sort((a,b)=> new Date(b.repair_date||b.date) - new Date(a.repair_date||a.date))[0];
            if (calibRecent && calibRecent.company) repairCompany = calibRecent.company;
            else {
                const latest = reps.sort((a,b)=> new Date(b.repair_date||b.date) - new Date(a.repair_date||a.date))[0];
                if (latest && latest.company) repairCompany = latest.company;
            }
        } catch {}

        // 2023-01-01 ~ 오늘까지 총 수리 건수/금액 집계
        let totalRepairsCnt = 0; let totalRepairsCost = 0;
        try {
            const fromAll = new Date(2023, 0, 1);
            const repsAll = (repairsData || []).filter(r => {
                if (!r || String(r.serial||'').trim() !== String(serial).trim()) return false;
                const dt = new Date(r.repair_date || r.date);
                return !isNaN(dt) && dt >= fromAll && dt <= today;
            });
            totalRepairsCnt = repsAll.length;
            totalRepairsCost = repsAll.reduce((sum, r) => {
                const v = parseInt(String(r.cost || 0).toString().replace(/[^0-9-]/g, '')) || 0;
                return sum + v;
            }, 0);
        } catch {}

        return `
            <div class="flex items-center justify-between p-4 ${alertClass} border rounded">
                <div class="flex items-start gap-2 mr-3">
                    <svg class="w-5 h-5 ${iconClass} mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <div>
                        <div class="flex items-center gap-2">
                        <span class="${textClass} font-medium">정도검사 예정</span>
                            <span class="text-xs px-2 py-0.5 bg-slate-100 rounded">${category}</span>
                            <span class="text-xs px-2 py-0.5 bg-slate-100 rounded">${manufacturer}</span>
                            <span class="text-xs px-2 py-0.5 bg-slate-100 rounded">${repairCompany}</span>
                    </div>
                        <div class="text-sm text-slate-600 mt-1">시리얼번호: <button type=\"button\" class=\"underline text-indigo-700\" ${onClick}>${serial}</button></div>
                        <div class="text-xs ${utilClass} mt-0.5">최근 1년 가동률: ${utilPct}%</div>
                    </div>
                </div>
                <div class="flex-1 text-center">
                    <div class="text-xs text-slate-500">2023.01.01~현재</div>
                    <div class="text-2xl font-bold text-slate-900 mt-0.5">총 수리항목 ${totalRepairsCnt}건</div>
                    <div class="text-xl font-semibold text-slate-800">총 수리금액 ${totalRepairsCost.toLocaleString()}원</div>
                </div>
                <div class="text-right">
                    <div class="text-sm ${textClass}">${log.next_calibration_date || '-'}</div>
                    <div class="text-xs text-slate-500">${daysUntil < 0 ? '지난 날짜' : daysUntil === 0 ? '오늘' : `${daysUntil}일 남음`}</div>
                </div>
            </div>`;
    }).join('');

    alertsContainer.innerHTML = `
        <button id="${btnId}" class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700" aria-expanded="false" aria-controls="${panelId}">
            ${label} 정도검사 예정: <span class="font-semibold">${count}</span>건
        </button>
        <div id="${panelId}" class="mt-3 ${count ? '' : 'hidden'} space-y-3" role="region" aria-label="${label} 정도검사 목록">
            ${count ? detailHtml : `<div class=\"p-4 text-slate-500 border border-slate-200 rounded\">${label}에 예정된 정도검사가 없습니다.</div>`}
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

    function statusFromLocationName(loc){
        const t = String(loc||'');
        if (/업체|수리|협력|외주/.test(t)) return '수리 중';
        if (/현장|출장/.test(t)) return '가동 중';
        if (/청명|본사|창고|지하|CEMS|CMES/.test(t)) return '대기 중';
        return '대기 중';
    }

    // 장비 데이터에 현재위치 보정 적용
    return equipmentData.map(equipment => {
        const latestMovement = latestMovements.get(equipment.serial);
        if (latestMovement) {
            // 최신 이동을 기준으로 항상 현재 위치/최근 이동/상태를 갱신
            const nextLoc = (latestMovement.inLocation && latestMovement.inLocation !== '')
                ? latestMovement.inLocation
                : (latestMovement.outLocation || equipment.currentLocation);
            if (nextLoc) equipment.currentLocation = nextLoc;
            if (latestMovement.date) equipment.lastMovement = latestMovement.date;
            equipment.status = statusFromLocationName(nextLoc);
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
    const manufacturerName = getManufacturerByCategory(equipment.category) || '-';
    const manufacturerSegment = ` / 제조사: ${manufacturerName}`;

    const timelineHTML = renderMovementTimeline(serial, movements, repairs);
    const partsHTML = renderReplacedParts(serial, repairs);

    // 최근 1년 기준 수치(출장/수리 횟수) 산출: 타임라인과 동일한 기간/구간 로직 사용
    const __to = new Date();
    const __from = new Date(__to.getFullYear() - 1, __to.getMonth(), __to.getDate());
    let tripsLastYear = 0, generalRepairsLastYear = 0, calibRepairsLastYear = 0;
    try {
        const ivs = buildLocationIntervals(serial, movements, __from, __to) || [];
        tripsLastYear = ivs.filter(iv => iv && iv.type === 'site').length;
    } catch {}
    try {
        const lastYearRepairs = (repairs || []).filter(r => {
            const t = new Date(r.repair_date || r.date);
            return t >= __from && t <= __to;
        });
        calibRepairsLastYear = lastYearRepairs.filter(r => /정도검사/.test(String(r.repair_type || ''))).length;
        generalRepairsLastYear = lastYearRepairs.length - calibRepairsLastYear;
    } catch {}

    // 같은 품목계열 내 일련번호 목록(내비게이션용)
    const _siblings = (equipmentData || [])
      .filter(it => it && it.category === equipment.category)
      .map(it => it.serial)
      .filter(Boolean);
    try {
      _siblings.sort((a,b)=>{
        const an = parseInt(String(a).replace(/\D/g,''))||0;
        const bn = parseInt(String(b).replace(/\D/g,''))||0;
        return an === bn ? String(a).localeCompare(String(b)) : an - bn;
      });
    } catch {}
    const _curIdx = _siblings.indexOf(equipment.serial);
    const _prevSerial = _curIdx >= 0 && _siblings.length ? _siblings[(_curIdx - 1 + _siblings.length) % _siblings.length] : null;
    const _nextSerial = _curIdx >= 0 && _siblings.length ? _siblings[(_curIdx + 1) % _siblings.length] : null;
    const _hasNav = _siblings.length > 1;
    const _serialListHtml = _siblings.map(sn => sn === equipment.serial
      ? `<button type="button" class="w-full text-left px-3 py-1.5 bg-indigo-50 font-semibold" data-serial="${sn}">${sn} (현재)</button>`
      : `<button type="button" class="w-full text-left px-3 py-1.5 hover:bg-slate-50" data-serial="${sn}">${sn}</button>`
    ).join('');
    const content = `
      <div class="w-full max-w-none bg-white rounded-lg shadow-xl overflow-y-auto"
           style="width: calc(100vw - var(--sidebar-w, 5rem)); height: calc(100vh - 2rem);">
        <div class="flex items-center justify-between px-6 py-4 border-b">
          <div class="flex items-center gap-3 min-w-0">
            <div id="serial-switcher-container" class="relative inline-flex items-center gap-2">
              <button id="serial-prev" type="button" aria-label="이전 일련번호" class="px-2 py-1 text-xs border rounded ${_hasNav ? '' : 'opacity-40 cursor-not-allowed'}" ${_hasNav ? '' : 'disabled'}>&larr;</button>
              <button id="serial-switcher-btn" type="button" class="text-indigo-700 underline font-semibold truncate">${equipment.serial || '-'}</button>
              <button id="serial-next" type="button" aria-label="다음 일련번호" class="px-2 py-1 text-xs border rounded ${_hasNav ? '' : 'opacity-40 cursor-not-allowed'}" ${_hasNav ? '' : 'disabled'}>&rarr;</button>
              <div id="serial-switcher-menu" class="absolute left-0 top-full mt-1 w-56 bg-white border rounded shadow-lg z-10 hidden max-h-64 overflow-auto">
                ${_serialListHtml || '<div class="px-3 py-2 text-sm text-slate-500">동일 품목계열 장비가 없습니다.</div>'}
              </div>
            </div>
            <h2 class="text-xl font-semibold text-slate-900 whitespace-nowrap">
              / ${equipment.category || '-'} / ${normalizeStatus(equipment.status)}${manufacturerSegment}
          </h2>
          </div>
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
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold text-slate-800">이동 타임라인 (<span id=\"mtl-range-label\">최근 1년</span>)</h3>
            <div class="relative">
              <button id=\"mtl-range-btn\" class=\"px-2 py-1 text-xs border rounded\">기간 설정</button>
              <div id=\"mtl-range-menu\" class=\"absolute right-0 mt-1 w-44 bg-white border rounded shadow-lg hidden z-10\">
                <button data-range=\"1y\" class=\"w-full text-left px-3 py-2 hover:bg-slate-50\">최근 1년</button>
                <button data-range=\"6m\" class=\"w-full text-left px-3 py-2 hover:bg-slate-50\">최근 6개월</button>
                <button data-range=\"3m\" class=\"w-full text-left px-3 py-2 hover:bg-slate-50\">최근 3개월</button>
                <button data-range=\"1m\" class=\"w-full text-left px-3 py-2 hover:bg-slate-50\">최근 1달</button>
                <div class=\"border-t my-1\"></div>
                <div class=\"px-3 py-2 text-xs text-slate-600\">날짜지정</div>
                <div class=\"px-3 pb-2 flex items-center gap-1\">
                  <input type=\"date\" id=\"mtl-from\" class=\"border rounded px-1 py-0.5 text-xs\">~
                  <input type=\"date\" id=\"mtl-to\" class=\"border rounded px-1 py-0.5 text-xs\">
                  <button id=\"mtl-apply\" class=\"ml-1 px-2 py-0.5 text-xs border rounded\">적용</button>
                </div>
              </div>
            </div>
          </div>
          <div id=\"movement-timeline-container\">${timelineHTML}</div>
        </div>

        <!-- 교체 부품 + 최근 1년 가동 현황 -->
        <div class="p-6">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 class="text-lg font-semibold text-slate-800 mb-3">교체 부품/수리 항목</h3>
              ${partsHTML}
              <div class="mt-6 bg-white border rounded-lg">
                <div class="flex items-center justify-between p-3 border-b">
                  <h4 class="font-semibold text-slate-800">전체 수리 내역 상세 (2023.01.01~현재)</h4>
                  <div class="flex items-center gap-2 text-xs">
                    <select id="repDet-period" class="border rounded px-2 py-1">
                      <option value="month">월별</option>
                      <option value="quarter">분기별</option>
                      <option value="half">반기별</option>
                      <option value="year">연간</option>
                      <option value="custom">날짜지정</option>
                    </select>
                    <select id="repDet-dim" class="border rounded px-2 py-1">
                      <option value="overall">전체</option>
                      <option value="byVendor">업체별</option>
                      <option value="bySeries">품목계열별</option>
                      <option value="byMeasurement">측정항목별</option>
                    </select>
                    <span id="repDet-custom" class="hidden">
                      <input type="date" id="repDet-from" class="border rounded px-1 py-0.5 text-xs">~
                      <input type="date" id="repDet-to" class="border rounded px-1 py-0.5 text-xs">
                    </span>
                  </div>
                </div>
                <div class="p-3">
                  <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div class="h-64">
                      <canvas id="repairsDetailBar"></canvas>
                    </div>
                    <div>
                      <div class="text-sm text-slate-700 mb-2">상세 필터</div>
                      <div id="repair-filter-chips" class="flex flex-wrap gap-2"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="bg-white rounded-lg border p-4">
              <h3 class="text-lg font-semibold text-slate-800 mb-2"><span id=\"util-title-range\">최근 1년</span> 가동 현황</h3>
              <p class="text-sm text-slate-600 mb-3">영업일 기준(주말 제외) 현장 체류 비율로 산정합니다.</p>
              <div class="flex items-center justify-center">
                <canvas id="${donutCanvasId}" width="220" height="220"></canvas>
              </div>
              <div class="mt-3 text-sm text-slate-700">
                가동률 <span id=\"util-percent\" class=\"${utilization.className} font-semibold\">${utilization.percent}%</span>
                (<span id=\"util-site-days\">현장 ${utilizationBreakdown.siteBiz}일</span> / <span id=\"util-total-days\">총 ${utilizationBreakdown.totalBiz}영업일</span>)
              </div>
              <div class="mt-2 flex gap-4 text-xs text-slate-600">
                <span class="flex items-center gap-1"><span style="display:inline-block;width:12px;height:12px;background:#3b82f6;border-radius:3px"></span>청명</span>
                <span class="flex items-center gap-1"><span style="display:inline-block;width:12px;height:12px;background:#dc2626;border-radius:3px"></span>업체 <span class="ml-1 text-slate-700" id=\"legend-repair-text\">(일반수리 ${generalRepairsLastYear}회 / 정도검사 ${calibRepairsLastYear}회)</span></span>
                <span class="flex items-center gap-1"><span style="display:inline-block;width:12px;height:12px;background:#a78bfa;border-radius:3px"></span>현장 <span class="ml-1 text-slate-700" id=\"legend-trip-text\">(출장 ${tripsLastYear}회)</span></span>
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
        // 기간 토글 바인딩
        try {
            const btn = document.getElementById('mtl-range-btn');
            const menu = document.getElementById('mtl-range-menu');
            const label = document.getElementById('mtl-range-label');
            const utilTitle = document.getElementById('util-title-range');
            const apply = document.getElementById('mtl-apply');
            const inpFrom = document.getElementById('mtl-from');
            const inpTo = document.getElementById('mtl-to');

            function setRange(kind){
                const now = new Date();
                let f, t = now;
                if (kind==='1y'){ f = new Date(now.getFullYear()-1, now.getMonth(), now.getDate()); label.textContent='최근 1년'; utilTitle.textContent='최근 1년'; }
                else if (kind==='6m'){ f = new Date(now.getFullYear(), now.getMonth()-6, now.getDate()); label.textContent='최근 6개월'; utilTitle.textContent='최근 6개월'; }
                else if (kind==='3m'){ f = new Date(now.getFullYear(), now.getMonth()-3, now.getDate()); label.textContent='최근 3개월'; utilTitle.textContent='최근 3개월'; }
                else if (kind==='1m'){ f = new Date(now.getFullYear(), now.getMonth()-1, now.getDate()); label.textContent='최근 1달'; utilTitle.textContent='최근 1달'; }
                else { return; }
                currentFrom = f; currentTo = t; menu.classList.add('hidden');
                rerenderRange();
            }

            function rerenderRange(){
                // 이동 타임라인 교체 (기존 영역 그대로 교체)
                const newHtml = renderMovementTimelineRange(serial, movements, repairs, currentFrom, currentTo);
                const box = document.getElementById('movement-timeline-container');
                if (box) {
                    box.innerHTML = newHtml;
                }
                // 가동 현황/도넛 갱신
                const u = calculateUtilizationBetween(serial, movements, currentFrom, currentTo);
                const b = calculateBreakdownBetween(serial, movements, currentFrom, currentTo);
                const percentEl = document.getElementById('util-percent');
                if (percentEl){ percentEl.textContent = `${u.percent}%`; percentEl.className = `${u.className} font-semibold`; }
                const siteEl = document.getElementById('util-site-days'); if (siteEl) siteEl.textContent = `현장 ${b.siteBiz}일`;
                const totalEl = document.getElementById('util-total-days'); if (totalEl) totalEl.textContent = `총 ${b.totalBiz}영업일`;
                try { renderUtilizationDonutChart(donutCanvasId, b); } catch {}
                // 범례 괄호 안 데이터(일반수리/정도검사/출장)도 기간에 맞게 갱신
                try {
                    const withinRepairs = (repairs || []).filter(r => {
                        const t = new Date(r.repair_date || r.date);
                        return t >= currentFrom && t <= currentTo;
                    });
                    const calibCnt = withinRepairs.filter(r => /정도검사/.test(String(r.repair_type || r.description || ''))).length;
                    const generalCnt = withinRepairs.length - calibCnt;
                    const ivs = buildLocationIntervals(serial, movements, currentFrom, currentTo) || [];
                    const tripCnt = ivs.filter(iv => iv && iv.type === 'site').length;
                    const repText = document.getElementById('legend-repair-text');
                    if (repText) repText.textContent = `(일반수리 ${generalCnt}회 / 정도검사 ${calibCnt}회)`;
                    const tripText = document.getElementById('legend-trip-text');
                    if (tripText) tripText.textContent = `(출장 ${tripCnt}회)`;
                } catch (e) { console.warn('범례 수치 갱신 실패', e); }
            }

            if (btn && menu){
                btn.addEventListener('click', ()=> menu.classList.toggle('hidden'));
                menu.querySelectorAll('button[data-range]')?.forEach(b=> b.addEventListener('click', ()=> setRange(b.getAttribute('data-range'))));
                apply?.addEventListener('click', ()=>{
                    const f = new Date(inpFrom.value);
                    const t = new Date(inpTo.value);
                    if (String(f)!=='Invalid Date' && String(t)!=='Invalid Date' && f<=t){
                        currentFrom=f; currentTo=t;
                        const fmt = (d)=> `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
                        label.textContent = `${fmt(f)}~${fmt(t)}`;
                        utilTitle.textContent = label.textContent;
                        menu.classList.add('hidden');
                        rerenderRange();
                    }
                });
            }

            // 전체 수리 내역 상세: 수평 막대 그래프(교체 부품/수리 항목 기반)
            function renderRepairsDetailBar() {
                const cvs = document.getElementById('repairsDetailBar');
                if (!cvs || !window.Chart) return;
                // 기존 차트 제거
                try { if (window._repairsDetailBar && typeof window._repairsDetailBar.destroy==='function') window._repairsDetailBar.destroy(); } catch {}
                const baseFrom = new Date('2023-01-01T00:00:00');
                const rows = (repairs || [])
                  .filter(r => { const d = new Date(r.repair_date || r.date || 0); return d >= baseFrom; })
                  .sort((a,b)=> new Date(b.repair_date||b.date||0) - new Date(a.repair_date||a.date||0))
                  .slice(0, 20);
                const isGreen = (txt)=> /(정도검사|기본점검)/.test(String(txt||''));
                const labels = rows.map(r => `${formatDateYmd(r.repair_date||r.date) || ''} ${r.repair_company||r.vendor||''}`);
                const values = rows.map(r => { const n = parseInt(String(r.cost||'0').toString().replace(/,/g,''))||0; return n>0 ? n : 1; });
                const colors = rows.map(r => isGreen(r.repair_type||r.description) ? '#16a34a' : '#ef4444');
                const dataKeys = rows.map(r => buildRepairKeyFromFields(r.repair_date||r.date, r.repair_company||r.vendor, r.repair_type||r.description));
                window._repairsDetailBar = new Chart(cvs.getContext('2d'), {
                    type: 'bar',
                    data: { labels, datasets: [{ label: '수리 내역', data: values, backgroundColor: colors, borderWidth: 0 }] },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: { ticks: { callback: v=> `${Number(v).toLocaleString()}원` } },
                            y: { ticks: { autoSkip: false } }
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: { callbacks: { label: (ctx)=> {
                                const r = rows[ctx.dataIndex];
                                const cost = parseInt(String(r.cost||'0').toString().replace(/,/g,''))||0;
                                const type = r.repair_type || r.description || '-';
                                const vendor = r.repair_company || r.vendor || '-';
                                return `${type} / ${vendor} / ${cost.toLocaleString()}원`;
                            }}}
                        },
                        // 막대 클릭 시 상단 교체부품/수리 항목으로 스크롤 및 하이라이트
                        onClick: (evt, els)=>{
                            try {
                                if (!els || !els.length) return;
                                const idx = els[0].index;
                                const key = dataKeys[idx];
                                const list = document.getElementById('replaced-parts-list');
                                if (!list) return;
                                const target = list.querySelector(`[data-repair-key="${key}"]`);
                                if (target){
                                    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                                    target.classList.add('ring','ring-2','ring-indigo-400');
                                    setTimeout(()=> target.classList.remove('ring','ring-2','ring-indigo-400'), 1400);
                                }
                            } catch(e) { console.warn('막대 클릭 스크롤 실패', e); }
                        }
                    }
                });
            }
            // 최초 렌더
            renderRepairsDetailBar();
        } catch(e) { console.warn('기간 토글 바인딩 실패', e); }

        // 일련번호 내비게이션/목록 바인딩
        try {
            const prevBtn = document.getElementById('serial-prev');
            const nextBtn = document.getElementById('serial-next');
            const switchBtn = document.getElementById('serial-switcher-btn');
            const menu = document.getElementById('serial-switcher-menu');
            const container = document.getElementById('serial-switcher-container');
            function go(sn){ if (!sn) return; try { showEquipmentDetailModal(sn); } catch(e) { console.error(e); } }
            if (prevBtn && _hasNav) prevBtn.addEventListener('click', ()=> go(_prevSerial));
            if (nextBtn && _hasNav) nextBtn.addEventListener('click', ()=> go(_nextSerial));
            if (switchBtn) switchBtn.addEventListener('click', ()=> menu && menu.classList.toggle('hidden'));
            if (menu) {
                menu.querySelectorAll('button[data-serial]')?.forEach(b=> b.addEventListener('click', ()=> go(b.getAttribute('data-serial'))));
            }
            // 외부 클릭 시 드롭다운 닫기
            setTimeout(()=>{
                function onDocClick(e){
                    try {
                        if (container && !container.contains(e.target)) menu && menu.classList.add('hidden');
                    } catch {}
                    document.removeEventListener('click', onDocClick);
                }
                document.addEventListener('click', onDocClick);
            }, 0);
        } catch(e) { console.warn('일련번호 내비게이션 초기화 실패', e); }
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
// 수리 레코드 → 파트 키(slug) 생성 (날짜/업체/설명 기반)
function buildRepairKeyFromFields(dateLike, vendor, desc) {
    const d = formatDateYmd(dateLike) || '';
    const v = String(vendor || '').trim();
    const t = String(desc || '').trim();
    return encodeURIComponent(`${d}|${v}|${t}`.replace(/\s+/g,' '));
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

// 임의 기간 가동률 계산(from~to, 영업일 기준)
function calculateUtilizationBetween(serial, movements, from, to) {
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

// 임의 기간 가동 현황(청명/업체/현장) 비율 계산
function calculateBreakdownBetween(serial, movements, from, to) {
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
    try {
        window._donutCharts = window._donutCharts || {};
        const prev = window._donutCharts[canvasId];
        if (prev && typeof prev.destroy === 'function') prev.destroy();
    } catch {}
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
    try {
        window._donutCharts[canvasId] = new Chart(el.getContext('2d'), { type: 'doughnut', data, options });
    } catch (e) { console.error(e); }
}
class CategoryPeriodCalculator {
    constructor(equipment, movements) {
        this.equipment = Array.isArray(equipment) ? equipment : [];
        this.movements = Array.isArray(movements) ? movements : [];
        this.serialToMoves = new Map();
        this._buildIndex();
    }
    _buildIndex() {
        try {
            for (const m of this.movements) {
                if (!m || !m.serial || !m.date) continue;
                const s = m.serial;
                if (!this.serialToMoves.has(s)) this.serialToMoves.set(s, []);
                this.serialToMoves.get(s).push(m);
            }
            for (const [s, list] of this.serialToMoves) list.sort((a,b)=> new Date(a.date) - new Date(b.date));
        } catch {}
    }
    getRange(mode) {
        const now = new Date();
        if (mode === '1m') return { from: new Date(now.getFullYear(), now.getMonth()-1, now.getDate()), to: now };
        if (mode === '3m') return { from: new Date(now.getFullYear(), now.getMonth()-3, now.getDate()), to: now };
        if (mode === '6m') return { from: new Date(now.getFullYear(), now.getMonth()-6, now.getDate()), to: now };
        return { from: new Date(now.getFullYear()-1, now.getMonth(), now.getDate()), to: now };
    }
    compute(from, to) {
        const categoryMap = new Map();
        const getCatEntry = (cat)=>{
            if (!categoryMap.has(cat)) categoryMap.set(cat, { category: cat, total: 0, operating: 0, repair: 0, idle: 0, _uptimeSum: 0, _uptimeCnt: 0 });
            return categoryMap.get(cat);
        };
        for (const eq of this.equipment) {
            const cat = eq?.category || '기타';
            const entry = getCatEntry(cat);
            entry.total += 1;
            const serial = eq?.serial;
            const mv = (this.serialToMoves.get(serial) || []);
            let up = { percent: 0, className: '' };
            let br = { totalBiz: 0, siteBiz: 0, vendorBiz: 0, cmesBiz: 0 };
            try { up = calculateUtilizationBetween(serial, mv, from, to) || up; } catch {}
            try { br = calculateBreakdownBetween(serial, mv, from, to) || br; } catch {}
            entry._uptimeSum += up.percent || 0;
            entry._uptimeCnt += 1;
            const dom = Math.max(br.siteBiz||0, br.vendorBiz||0, br.cmesBiz||0);
            if (dom === (br.siteBiz||0)) entry.operating += 1;
            else if (dom === (br.vendorBiz||0)) entry.repair += 1;
            else entry.idle += 1;
        }
        const out = Array.from(categoryMap.values()).map(v => ({
            category: v.category,
            total: v.total,
            operating: v.operating,
            repair: v.repair,
            idle: v.idle,
            avgUptime: v._uptimeCnt ? Math.round(v._uptimeSum / v._uptimeCnt) : 0
        }));
        out.sort((a,b)=> b.total - a.total);
        return out;
    }
    computeForMode(mode) {
        const { from, to } = this.getRange(mode);
        return this.compute(from, to);
    }
}

function getCategoryStatisticsRange(mode) {
    try {
        if (mode === 'now') return getCategoryStatistics();
        const svc = new CategoryPeriodCalculator(equipmentData, movementsData);
        return svc.computeForMode(mode || '1y');
    } catch { return getCategoryStatistics(); }
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
    return renderMovementTimelineRange(serial, movementsAsc, repairsAsc, from, to);
}
// 임의 기간 타임라인 렌더링(from~to)
function renderMovementTimelineRange(serial, movementsAsc, repairsAsc, from, to) {
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
        const key = buildRepairKeyFromFields(r.repair_date || r.date, vendor, desc);
        return { when, vendor, desc, cost, key };
    });

    if (rows.length === 0) {
        return '<div class="text-slate-500">교체 부품/수리 내역 데이터가 없습니다.</div>';
    }

    const items = rows.map(x => `
      <div class="flex flex-col gap-1 bg-white border rounded-md p-3 min-w-[220px] cursor-pointer hover:bg-slate-50" data-repair-key="${x.key}">
        <div class="text-sm font-semibold text-slate-800 truncate" title="${x.desc}">${x.desc}</div>
        <div class="text-xs text-slate-600">${x.vendor}</div>
        <div class="text-sm text-slate-900">${x.cost}</div>
        <div class="text-[11px] text-slate-500">${x.when}</div>
      </div>
    `).join('');

    return `<div id="replaced-parts-list" class="flex gap-3 overflow-x-auto pb-1">${items}</div>`;
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

// 장비 병목 위험 알림 로드 및 렌더링
async function loadBottleneckAlerts() {
    try {
        const client = new DataClient();
        const alertsData = await client._json(`${client.basePath}/equipment_bottleneck_alerts.json`);
        
        if (!alertsData || !alertsData.alerts) {
            console.warn('병목 위험 알림 데이터 없음');
            return;
        }
        
        const alerts = alertsData.alerts;
        const summary = alertsData.meta?.summary || {};
        
        // 요약 카운트 업데이트
        document.getElementById('bottleneck-critical-count').textContent = summary.critical || 0;
        document.getElementById('bottleneck-high-count').textContent = summary.high || 0;
        document.getElementById('bottleneck-medium-count').textContent = summary.medium || 0;
        
        // 측정기 필터 옵션 업데이트
        const itemFilter = document.getElementById('bottleneck-item-filter');
        if (itemFilter) {
            const items = [...new Set(alerts.map(a => a.item))].sort();
            itemFilter.innerHTML = '<option value="all">전체 측정기</option>' +
                items.map(item => `<option value="${item}">${item}</option>`).join('');
        }
        
        // 필터 이벤트 바인딩
        const monthFilter = document.getElementById('bottleneck-month-filter');
        if (monthFilter && !monthFilter._bound) {
            monthFilter.addEventListener('change', () => renderBottleneckAlerts(alerts));
            monthFilter._bound = true;
        }
        if (itemFilter && !itemFilter._bound) {
            itemFilter.addEventListener('change', () => renderBottleneckAlerts(alerts));
            itemFilter._bound = true;
        }
        
        // 알림 렌더링
        renderBottleneckAlerts(alerts);
        
    } catch (error) {
        console.warn('병목 위험 알림 로드 실패:', error);
        document.getElementById('bottleneck-alerts').innerHTML = 
            '<div class="text-slate-500 text-center py-4">알림 데이터를 불러올 수 없습니다.</div>';
    }
}

// 병목 위험 알림 렌더링
function renderBottleneckAlerts(alerts) {
    const container = document.getElementById('bottleneck-alerts');
    if (!container) return;
    
    const monthFilter = document.getElementById('bottleneck-month-filter')?.value || 'all';
    const itemFilter = document.getElementById('bottleneck-item-filter')?.value || 'all';
    
    // 필터 적용
    let filteredAlerts = alerts;
    if (monthFilter !== 'all') {
        filteredAlerts = filteredAlerts.filter(a => a.month === monthFilter);
    }
    if (itemFilter !== 'all') {
        filteredAlerts = filteredAlerts.filter(a => a.item === itemFilter);
    }
    
    if (!filteredAlerts.length) {
        container.innerHTML = '<div class="text-slate-500 text-center py-4">조건에 맞는 알림이 없습니다.</div>';
        return;
    }
    
    // 알림 카드 렌더링
    container.innerHTML = filteredAlerts.map(alert => {
        const riskColor = alert.riskLevel === 'critical' ? 'red' : 
                         alert.riskLevel === 'high' ? 'yellow' : 'blue';
        const riskIcon = alert.riskLevel === 'critical' ? '🚨' : 
                        alert.riskLevel === 'high' ? '⚠️' : 'ℹ️';
        
        return `
            <div class="border-l-4 border-${riskColor}-500 bg-${riskColor}-50 p-4 rounded-r-lg">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-lg">${riskIcon}</span>
                            <span class="font-semibold text-${riskColor}-800">${alert.month} ${alert.item}</span>
                            <span class="text-xs px-2 py-1 bg-${riskColor}-200 text-${riskColor}-800 rounded-full">
                                ${alert.riskLevel === 'critical' ? '위험' : alert.riskLevel === 'high' ? '주의' : '모니터링'}
                            </span>
                        </div>
                        <p class="text-sm text-${riskColor}-700 mb-3">${alert.message}</p>
                        
                        <div class="grid grid-cols-2 gap-4 mb-3 text-xs">
                            <div>
                                <span class="text-slate-600">보유:</span> 
                                <span class="font-semibold">${alert.details.available}대</span>
                            </div>
                            <div>
                                <span class="text-slate-600">필요:</span> 
                                <span class="font-semibold">${alert.details.needed}대</span>
                            </div>
                            <div>
                                <span class="text-slate-600">부족:</span> 
                                <span class="font-semibold text-red-600">${alert.details.shortage}대</span>
                            </div>
                            <div>
                                <span class="text-slate-600">활용률:</span> 
                                <span class="font-semibold">${alert.details.utilizationPct}%</span>
                            </div>
                        </div>
                        
                        <div class="mb-3">
                            <div class="text-xs text-slate-600 mb-1">주요 영향 사업 (상위 3개):</div>
                            ${alert.details.topProjects.map(project => `
                                <div class="text-xs bg-white p-2 rounded border mb-1">
                                    <div class="font-medium text-slate-800">${project.projectName}</div>
                                    <div class="text-slate-600">
                                        필요 장비: ${project.devicesNeeded}대, 
                                        사이트데이: ${project.siteDays}일
                                        ${project.hasOverride ? ' <span class="text-blue-600">(수정됨)</span>' : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        
                        <div class="text-xs">
                            <div class="text-slate-600 mb-1">권장사항:</div>
                            <ul class="list-disc list-inside text-slate-700 space-y-1">
                                ${alert.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}