// 4분기 장비 가동률 예측 (개선된 통합 로직)
// 문제점 해결: 순환 참조 제거, 실제 데이터 기반 예측, 일관성 있는 계산
// 입력: equipment_db.json, stats_business_item_timeseries_q4_2025.json, stats_uptime_historical.json
// 출력: db/stats_q4_equipment_uptime_predictions.json

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();
const DB_DIR = path.join(PROJECT_ROOT, 'db');

// 입력 파일들
const EQUIPMENT_FILE = path.join(DB_DIR, 'equipment_db.json');
const TIMESERIES_FILE = path.join(DB_DIR, 'stats_business_item_timeseries_q4_2025.json');
const BUSINESS_OVERRIDES_FILE = path.join(DB_DIR, 'business_contracts_overrides.json');
const HISTORICAL_UPTIME_FILE = path.join(DB_DIR, 'stats_uptime_historical.json');

// 출력 파일
const OUTPUT_FILE = path.join(DB_DIR, 'stats_q4_equipment_uptime_predictions.json');

// 4분기 기본 설정
const Q4_START = '2025-10-01';
const Q4_END = '2025-12-31';
const Q4_BUSINESS_DAYS = 66; // 4분기 영업일 수

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn(`파일 읽기 실패: ${filePath}`, error.message);
    return null;
  }
}

function ensureArray(data) {
  return Array.isArray(data) ? data : (data?.data && Array.isArray(data.data) ? data.data : []);
}

function normalizeItemName(raw) {
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
}

// 측정 항목별 특수 운영 방식 정의
function getItemOperationMode(item) {
  switch (item) {
    case '벤젠':
      return {
        mode: 'single_per_project',
        description: '사업당 1개만 사용 (지점 수 무관)',
        sitesPerDevice: 999, // 지점 수 제한 없음
        concurrentLimit: 1   // 사업당 최대 1개
      };
    case 'PM-10':
    case 'PM-2.5':
    case 'NO2':
    case 'CO':
    case 'O3':
    case 'SO2':
      return {
        mode: 'sites_per_device',
        description: '지점 수만큼 장비 필요',
        sitesPerDevice: 1,
        concurrentLimit: null
      };
    default:
      return {
        mode: 'sites_per_device',
        description: '지점 수만큼 장비 필요',
        sitesPerDevice: 1,
        concurrentLimit: null
      };
  }
}

// 장비에서 측정 항목 추출
function extractItemsFromEquipment(equipment) {
  const itemInventory = new Map();
  const itemToSerials = new Map();
  
  for (const eq of equipment) {
    const serial = (eq?.serial || '').toString().trim();
    if (!serial) continue;
    
    const category = (eq?.category || '').toString();
    const match = category.match(/^\(([^)]+)\)/);
    
    let items = [];
    if (match) {
      items = match[1].split(',').map(item => normalizeItemName(item)).filter(Boolean);
    }
    if (!items.length) items = ['UNKNOWN'];
    
    for (const item of items) {
      itemInventory.set(item, (itemInventory.get(item) || 0) + 1);
      if (!itemToSerials.has(item)) itemToSerials.set(item, []);
      itemToSerials.get(item).push(serial);
    }
  }
  
  return { itemInventory, itemToSerials };
}

// 사업 오버라이드 데이터 적용
function applyBusinessOverrides(tsRows, overrides) {
  if (!Array.isArray(overrides) || !overrides.length) {
    console.log('📝 오버라이드 데이터 없음, 원본 데이터 사용');
    return tsRows;
  }
  
  console.log(`📝 ${overrides.length}개 사업의 오버라이드 데이터 적용 중...`);
  
  // 오버라이드 데이터를 프로젝트ID별로 매핑
  const overrideMap = new Map();
  overrides.forEach(ovr => {
    if (ovr.projectId && ovr.overrides) {
      overrideMap.set(ovr.projectId, ovr.overrides);
    }
  });
  
  // 타임시리즈 데이터에 오버라이드 적용
  const modifiedRows = [];
  const processedProjects = new Set();
  
  // 기존 타임시리즈 데이터 처리
  for (const row of tsRows) {
    const projectId = row.projectId;
    const override = overrideMap.get(projectId);
    
    if (override && override.selectedItems && override.items) {
      processedProjects.add(projectId);
      
      // 오버라이드된 항목들로 새로운 행 생성
      for (const itemName of override.selectedItems) {
        const itemData = override.items[itemName];
        if (!itemData) continue;
        
        const operationMode = getItemOperationMode(normalizeItemName(itemName));
        let actualSiteDays = itemData.requiredSiteDays || 0;
        
        // 벤젠의 경우 특수 처리
        if (operationMode.mode === 'single_per_project') {
          console.log(`🔍 벤젠 오버라이드: ${projectId} - ${actualSiteDays} 사이트데이`);
        }
        
        modifiedRows.push({
          ...row,
          category: normalizeItemName(itemName),
          requiredSiteDays: actualSiteDays,
          source: 'override',
          originalItem: itemName
        });
      }
    } else {
      // 오버라이드 없는 경우 원본 사용
      modifiedRows.push({
        ...row,
        source: 'original'
      });
    }
  }
  
  console.log(`✅ 오버라이드 적용 완료: ${processedProjects.size}개 사업 수정됨`);
  return modifiedRows;
}

// 4분기 수요 계산 (timeseries 기반, 오버라이드 반영)
function calculateQ4DemandFromTimeseries(tsRows, overrides) {
  // 오버라이드 적용
  const modifiedRows = applyBusinessOverrides(tsRows, overrides);
  
  const byItem = new Map();
  const months = ['2025-10','2025-11','2025-12'];
  
  function monthBizDays(ym){
    const [y,m]=ym.split('-').map(Number);
    const s=new Date(y,m-1,1), e=new Date(y,m,0);
    let cnt=0; for (let d=new Date(s); d<=e; d.setDate(d.getDate()+1)){ const wd=d.getDay(); if(wd!==0 && wd!==6) cnt++; }
    return cnt || 1;
  }
  
  for (const r of modifiedRows){
    if (!months.includes(r.month)) continue;
    const item = normalizeItemName(r.category||'');
    const siteDays = Number(r.requiredSiteDays||0);
    if (!item || siteDays<=0) continue;
    
    const cur = byItem.get(item) || { 
      totalSiteDays: 0, 
      peakConcurrentSites: 0, 
      contractCount: 0,
      overrideCount: 0 
    };
    
    cur.totalSiteDays += siteDays;
    const concurrent = Math.ceil(siteDays / monthBizDays(r.month));
    cur.peakConcurrentSites = Math.max(cur.peakConcurrentSites, concurrent);
    
    if (r.source === 'override') {
      cur.overrideCount++;
    }
    cur.contractCount++;
    
    byItem.set(item, cur);
  }
  return byItem;
}

// 과거 가동률 데이터에서 예측 기준값 추출
function extractHistoricalBaseline(historicalData, item) {
  if (!historicalData || !Array.isArray(historicalData)) {
    return { avgUptimePct: 70, confidence: 'low' }; // 기본값
  }
  
  const itemData = historicalData.find(d => normalizeItemName(d.category) === item);
  if (itemData) {
    return {
      avgUptimePct: itemData.uptimeEstimatePct || 70,
      confidence: 'high'
    };
  }
  
  // 전체 평균으로 대체
  const avgAll = historicalData.reduce((sum, d) => sum + (d.uptimeEstimatePct || 0), 0) / historicalData.length;
  return {
    avgUptimePct: Math.round(avgAll) || 70,
    confidence: 'medium'
  };
}

// 영업일 수 계산
function countBusinessDays(start, end) {
  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 주말 제외
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

// 4분기 가동률 예측 계산 (특수 운영 방식 반영)
function calculateQ4UptimePrediction(item, inventory, demand, historicalBaseline) {
  const ownedDevices = inventory || 0;
  const demandData = demand || { totalSiteDays: 0, peakConcurrentSites: 0 };
  const operationMode = getItemOperationMode(item);
  
  if (ownedDevices === 0) {
    return {
      predictedUptimePct: 0,
      utilizationLevel: 'impossible',
      bottleneckRisk: 'critical',
      recommendation: '장비 확보 필요',
      operationMode: operationMode.description
    };
  }
  
  let demandUtilizationPct, peakUtilizationPct, recommendation;
  
  if (operationMode.mode === 'single_per_project') {
    // 벤젠: 사업당 1개만 사용하므로 동시 진행 사업 수가 중요
    const totalCapacitySiteDays = ownedDevices * Q4_BUSINESS_DAYS;
    demandUtilizationPct = totalCapacitySiteDays > 0 ? 
      Math.min(100, Math.round((demandData.totalSiteDays / totalCapacitySiteDays) * 100)) : 0;
    
    // 벤젠의 경우: 실제 필요한 것은 동시 진행 사업 수
    // 현재 계약에서 동시에 몇 개 사업이 진행되는지 추정
    const estimatedConcurrentProjects = Math.min(demandData.peakConcurrentSites, 3); // 보수적 추정
    peakUtilizationPct = ownedDevices > 0 ?
      Math.min(100, Math.round((estimatedConcurrentProjects / ownedDevices) * 100)) : 0;
    
    recommendation = peakUtilizationPct >= 80 ? 
      '동시 진행 사업 증가 시 추가 확보 검토' : 
      peakUtilizationPct >= 60 ? 
      '현재 수준 적정, 모니터링 필요' : 
      '여유분 충분';
      
  } else {
    // 일반 측정기: 지점 수만큼 필요
    const totalCapacitySiteDays = ownedDevices * Q4_BUSINESS_DAYS;
    demandUtilizationPct = totalCapacitySiteDays > 0 ? 
      Math.min(100, Math.round((demandData.totalSiteDays / totalCapacitySiteDays) * 100)) : 0;
    
    peakUtilizationPct = ownedDevices > 0 ?
      Math.min(100, Math.round((demandData.peakConcurrentSites / ownedDevices) * 100)) : 0;
    
    recommendation = peakUtilizationPct >= 90 ? 
      '장비 추가 확보 권장' : 
      peakUtilizationPct >= 70 ? 
      '여유분 확보 검토' : 
      '정상 운영 가능';
  }
  
  // 과거 실제 가동률 반영
  const historicalFactor = historicalBaseline.avgUptimePct / 100;
  
  // 종합 예측: 벤젠의 경우 동시 사업 수 중심으로 가중치 조정
  const weight1 = operationMode.mode === 'single_per_project' ? 0.3 : 0.6; // 벤젠은 총량보다 동시성이 중요
  const weight2 = operationMode.mode === 'single_per_project' ? 0.7 : 0.4;
  
  const rawPrediction = (demandUtilizationPct * weight1) + (peakUtilizationPct * weight2);
  const adjustedPrediction = Math.round(rawPrediction * historicalFactor);
  
  // 최종 예측값
  const finalPrediction = Math.min(100, Math.max(0, adjustedPrediction));
  
  // 활용도 레벨 분류
  let utilizationLevel = 'low';
  let bottleneckRisk = 'low';
  
  if (finalPrediction >= 90) {
    utilizationLevel = 'critical';
    bottleneckRisk = 'high';
  } else if (finalPrediction >= 70) {
    utilizationLevel = 'high';
    bottleneckRisk = 'medium';
  } else if (finalPrediction >= 40) {
    utilizationLevel = 'medium';
    bottleneckRisk = 'low';
  }
  
  return {
    predictedUptimePct: finalPrediction,
    utilizationLevel,
    bottleneckRisk,
    recommendation,
    operationMode: operationMode.description,
    calculations: {
      demandUtilizationPct,
      peakUtilizationPct,
      historicalFactor: Math.round(historicalFactor * 100),
      rawPrediction: Math.round(rawPrediction),
      weights: `총량${Math.round(weight1*100)}% + 동시성${Math.round(weight2*100)}%`
    }
  };
}

function main() {
  console.log('🔄 4분기 장비 가동률 예측 시작...');
  
  // 데이터 로드
  console.log('📂 데이터 파일 로드 중...');
  const equipment = ensureArray(readJson(EQUIPMENT_FILE));
  const ts = ensureArray(readJson(TIMESERIES_FILE));
  const overrides = ensureArray(readJson(BUSINESS_OVERRIDES_FILE));
  const historicalUptime = ensureArray(readJson(HISTORICAL_UPTIME_FILE));
  
  console.log('📂 파일 로드 상태:');
  console.log(`  - 장비: ${equipment.length}개`);
  console.log(`  - 타임시리즈: ${ts.length}행`);
  console.log(`  - 오버라이드: ${overrides.length}개 사업`);
  console.log(`  - 과거가동률: ${historicalUptime.length ? 'OK' : 'MISSING'}`);
  
  console.log(`📊 로드된 데이터: 장비 ${equipment.length}개, 타임시리즈 ${ts.length}행`);
  
  // 장비 인벤토리 구축
  const { itemInventory, itemToSerials } = extractItemsFromEquipment(equipment);
  console.log(`🏭 측정항목별 장비 현황: ${itemInventory.size}개 항목`);
  
  // 4분기 수요 계산 (timeseries 기반, 오버라이드 반영)
  const itemDemand = calculateQ4DemandFromTimeseries(ts, overrides);
  console.log(`📈 4분기 수요 분석: ${itemDemand.size}개 항목`);
  
  // 전체 측정 항목 목록 구성
  const allItems = new Set([...itemInventory.keys(), ...itemDemand.keys()]);
  
  // 예측 결과 생성
  const predictions = [];
  
  for (const item of allItems) {
    const inventory = itemInventory.get(item) || 0;
    const demand = itemDemand.get(item);
    const historicalBaseline = extractHistoricalBaseline(
      ensureArray(historicalUptime), 
      item
    );
    
    const prediction = calculateQ4UptimePrediction(item, inventory, demand, historicalBaseline);
    
    predictions.push({
      category: item,
      ownedDevices: inventory,
      serialNumbers: itemToSerials.get(item) || [],
      q4Demand: {
        totalSiteDays: demand?.totalSiteDays || 0,
        peakConcurrentSites: demand?.peakConcurrentSites || 0,
        contractCount: demand?.contractCount || 0,
        overrideCount: demand?.overrideCount || 0
      },
      historicalBaseline: {
        avgUptimePct: historicalBaseline.avgUptimePct,
        confidence: historicalBaseline.confidence
      },
      ...prediction,
      predictionBasis: demand?.overrideCount > 0 ? 'overridden_timeseries_and_historical_uptime' : 'timeseries_and_historical_uptime'
    });
  }
  
  // 결과 정렬 (예측 가동률 높은 순)
  predictions.sort((a, b) => b.predictedUptimePct - a.predictedUptimePct);
  
  // 요약 통계
  const summary = {
    totalItems: predictions.length,
    highUtilization: predictions.filter(p => p.utilizationLevel === 'high' || p.utilizationLevel === 'critical').length,
    bottleneckRisk: predictions.filter(p => p.bottleneckRisk === 'high').length,
    averageUptimePct: Math.round(predictions.reduce((sum, p) => sum + p.predictedUptimePct, 0) / predictions.length)
  };
  
  // 결과 저장
  const output = {
    meta: {
      _schemaVersion: '3.0.0',
      generatedAt: new Date().toISOString(),
      quarter: {
        from: Q4_START,
        to: Q4_END,
        businessDays: Q4_BUSINESS_DAYS
      },
      sources: [
        'db/equipment_db.json',
        'db/stats_business_item_timeseries_q4_2025.json',
        'db/stats_uptime_historical.json'
      ],
      methodology: 'integrated_demand_and_historical_analysis',
      summary
    },
    data: predictions
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
  
  console.log(`✅ 4분기 가동률 예측 완료: ${OUTPUT_FILE}`);
  console.log(`📊 총 ${predictions.length}개 항목, 평균 예상 가동률 ${summary.averageUptimePct}%`);
  console.log(`⚠️  고활용률 항목 ${summary.highUtilization}개, 병목 위험 ${summary.bottleneckRisk}개`);
}

// 스크립트 직접 실행 시에만 main 함수 호출
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1].includes('build_q4_equipment_uptime_prediction.mjs')) {
  main();
}
